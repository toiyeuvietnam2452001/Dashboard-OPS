// GET /api/data — reads the dashboard tables from Notion and returns them in the same shape as data.json.
//
// Needs the Vercel environment variable NOTION_TOKEN (an internal integration secret) and the
// "OPS Dashboard Data" page shared with that integration (page ⋯ → Connections).
// Responses are cached at the edge for 60 s so Notion is queried at most about once a minute.

const SOURCES = require('../tools/notion-sources.json');

const NOTION_VERSION = '2025-09-03';
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
};

async function queryAll(token, dataSourceId, sorts) {
  const rows = [];
  let cursor;
  do {
    const body = { page_size: 100, sorts: (sorts || []).map(([property, direction]) => ({ property, direction })).concat([{ timestamp: 'created_time', direction: 'ascending' }]) };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * Number(res.headers.get('retry-after') || 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Notion ${res.status} on ${dataSourceId}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    rows.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return rows;
}

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
    default: return null;
  }
}

function toRow(page) {
  const row = {};
  for (const [name, prop] of Object.entries(page.properties)) row[name] = cell(prop);
  return row;
}

async function loadAll(token) {
  const out = {};
  let lastEdited = '';
  const ids = Object.keys(SOURCES);
  // three tables at a time keeps us inside Notion's ~3 requests/second limit
  for (let i = 0; i < ids.length; i += 3) {
    await Promise.all(ids.slice(i, i + 3).map(async (id) => {
      const pages = await queryAll(token, SOURCES[id].data_source, SORTS[id]);
      out[id] = pages.map(toRow).filter((r) => Object.values(r).some((v) => v !== null && v !== ''));
      for (const p of pages) if (p.last_edited_time > lastEdited) lastEdited = p.last_edited_time;
    }));
  }
  out._updated_at = lastEdited || new Date().toISOString();
  out._source = 'notion';
  return out;
}

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    res.status(503).json({ error: 'NOTION_TOKEN is not set on Vercel' });
    return;
  }
  try {
    const data = await loadAll(token);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};

module.exports.toRow = toRow;
