// Shared Notion helpers for api/data.js and api/rollover.js.
//
// The Notion page "OPS Dashboard Data" has one row per weekly report in "Kỳ báo cáo [reports]"
// (from_date → report_date, Wednesday to Wednesday) and 22 data tables. Every data row carries a
// "report" relation to the report it belongs to, so each week's figures are kept apart.

const SOURCES = require('../tools/notion-sources.json');

const NOTION_VERSION = '2025-09-03';
const TABLES = Object.keys(SOURCES).filter((k) => k !== 'reports');

// Row order per table. Notion's created_time only has minute precision, so rows added together
// would come back in arbitrary order; every table sorts on its own columns instead.
// (A select column sorts by the order of its options, e.g. CPP before WHP.)
const SORTS = {
  manpower: [['month', 'ascending']],
  orr_curve: [['month', 'ascending']],
  startup_sequence: [['step', 'ascending']],
  procedures: [['id', 'ascending']],
  orr_elements: [['code', 'ascending']],
  orr_groups: [['group', 'ascending']],
  orr_teams: [['weight_pct', 'descending'], ['team', 'ascending']],
  pr_pipeline: [['stage', 'ascending'], ['status', 'ascending']],
  packages_no_pr: [['dimension', 'ascending'], ['count', 'descending']],
  vendor_training: [['period', 'ascending'], ['course', 'ascending']],
  precom_plan: [['plan_start', 'ascending'], ['activity', 'ascending']],
  cbta: [['platform', 'ascending'], ['team', 'ascending']],
  mandatory: [['team', 'ascending']],
  staffing: [['group', 'ascending']],
  cmms: [['package', 'descending']],
  workstreams: [['area', 'ascending'], ['item', 'ascending']],
  permits: [['permit', 'ascending']],
  readiness: [['order', 'ascending']],
  milestones: [['order', 'ascending']],
  hse_matrix: [['no', 'ascending']],
  cbta_modules: [['platform', 'ascending'], ['team', 'ascending'], ['no', 'ascending']],
  orr_team_plan: [['team', 'ascending'], ['month', 'ascending']],
  reports: [['report_date', 'ascending']],
};

// Columns that identify a row within one report; used to copy a report into the next one.
const KEYS = {
  manpower: ['month'], orr_curve: ['month'], startup_sequence: ['step'], procedures: ['id'],
  orr_elements: ['code'], orr_groups: ['group'], orr_teams: ['team'], pr_pipeline: ['stage', 'status'],
  packages_no_pr: ['dimension', 'category'], vendor_training: ['period', 'course'], precom_plan: ['activity'],
  cbta: ['platform', 'team'], mandatory: ['team'], staffing: ['group'], cmms: ['package'],
  workstreams: ['area', 'item'], permits: ['permit'], readiness: ['area'], milestones: ['milestone'],
  hse_matrix: ['course'], cbta_modules: ['platform', 'team', 'no'], orr_team_plan: ['team', 'month'],
};

async function notion(token, method, path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.notion.com/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    // rate limit or a passing Notion outage: wait and try again
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * Number(res.headers.get('retry-after') || attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Notion ${res.status} on ${method} ${path}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
}

async function queryAll(token, id, filter) {
  const rows = [];
  let cursor;
  do {
    const body = { page_size: 100, sorts: (SORTS[id] || []).map(([property, direction]) => ({ property, direction })).concat([{ timestamp: 'created_time', direction: 'ascending' }]) };
    if (filter) body.filter = filter;
    if (cursor) body.start_cursor = cursor;
    const json = await notion(token, 'POST', `data_sources/${SOURCES[id].data_source}/query`, body);
    rows.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return rows;
}

const inReport = (reportId) => ({ property: 'report', relation: { contains: reportId } });

function cell(p) {
  switch (p.type) {
    case 'title':
    case 'rich_text': {
      const s = p[p.type].map((t) => t.plain_text).join('').trim();
      return s === '' ? null : s;
    }
    case 'number': return p.number;
    case 'select': return p.select ? p.select.name : null;
    case 'status': return p.status ? p.status.name : null;
    case 'date': return p.date ? p.date.start.slice(0, 10) : null;
    case 'checkbox': return p.checkbox;
    case 'formula': return p.formula[p.formula.type] ?? null;
    default: return undefined; // relations and system columns are not data
  }
}

function toRow(page) {
  const row = {};
  for (const [name, prop] of Object.entries(page.properties)) {
    const v = cell(prop);
    if (v !== undefined) row[name] = v;
  }
  return row;
}

// The calendar day in Vietnam (UTC+7, no daylight saving).
const vnToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

async function loadReports(token) {
  const pages = await queryAll(token, 'reports');
  return pages.map((p) => ({ ...toRow(p), id: p.id, edited: p.last_edited_time })).filter((r) => r.report_date && r.from_date);
}

// The open report is the one whose week contains today: from_date < today <= report_date.
function currentIndex(reports, today = vnToday()) {
  const i = reports.findIndex((r) => r.report_date >= today);
  return i < 0 ? reports.length - 1 : i;
}

module.exports = { SOURCES, TABLES, KEYS, notion, queryAll, inReport, toRow, vnToday, loadReports, currentIndex };
