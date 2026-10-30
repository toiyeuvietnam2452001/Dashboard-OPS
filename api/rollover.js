// POST /api/rollover — when a new weekly report opens, copy every row of the previous report into
// it, so team leads only change what moved this week. Then tick the report's "initialized" box.
//
// Safe to call any number of times: a report that is already initialized is left alone, and rows
// already copied are not copied twice. Each call works for at most ~40 s and answers
// { done: false, remaining } when there is more to copy, so the caller simply calls again.
// The hourly GitHub Action "Sync from Notion" does that. Needs the integration's
// "Insert content" and "Update content" capabilities.
//
// It also fills tables added after reports had already opened (see SEED): until SEED_UNTIL, every
// report up to that date gets the rows of the 21 Oct 2026 report (tools/data) that it lacks.
// Later reports get them through the normal copy.

const { TABLES, KEYS, SOURCES, notion, queryAll, inReport, toRow, vnToday, loadReports, currentIndex } = require('../lib/notion');

const BUDGET_MS = 40000;

// Tables added on 30 Oct 2026, the property types of their columns, and their starting rows.
const SEED_UNTIL = '2026-11-04';
const SEED = {
  hse_matrix: { title: 'course', number: ['no'], rows: require('../tools/data/hse_matrix.json') },
  cbta_modules: { title: 'module', number: ['no'], select: ['platform', 'team', 'status'], rows: require('../tools/data/cbta_modules.json') },
  orr_team_plan: { title: 'team', number: ['plan_pct', 'actual_pct'], rows: require('../tools/data/orr_team_plan.json') },
};

// Turn a page's properties into the properties of a new page in the same data source.
function copyProps(page, reportId) {
  const out = {};
  for (const [name, p] of Object.entries(page.properties)) {
    switch (p.type) {
      case 'title':
      case 'rich_text':
        out[name] = { [p.type]: p[p.type].map((t) => ({ type: 'text', text: { content: t.plain_text, link: t.href ? { url: t.href } : null }, annotations: t.annotations })) };
        break;
      case 'number': out[name] = { number: p.number }; break;
      case 'select': out[name] = { select: p.select ? { name: p.select.name } : null }; break;
      case 'multi_select': out[name] = { multi_select: p.multi_select.map((o) => ({ name: o.name })) }; break;
      case 'status': if (p.status) out[name] = { status: { name: p.status.name } }; break;
      case 'date': out[name] = { date: p.date ? { start: p.date.start, end: p.date.end } : null }; break;
      case 'checkbox': out[name] = { checkbox: p.checkbox }; break;
      case 'url': case 'email': case 'phone_number': out[name] = { [p.type]: p[p.type] }; break;
      default: break; // relations, formulas and system columns
    }
  }
  out.report = { relation: [{ id: reportId }] };
  return out;
}

// Turn a seed row into page properties.
function seedProps(spec, row, reportId) {
  const out = {};
  for (const [name, v] of Object.entries(row)) {
    if (v === null || v === undefined) continue;
    if (name === spec.title) out[name] = { title: [{ type: 'text', text: { content: String(v) } }] };
    else if ((spec.number || []).includes(name)) out[name] = { number: v };
    else if ((spec.select || []).includes(name)) out[name] = { select: { name: v } };
    else out[name] = { rich_text: [{ type: 'text', text: { content: String(v) } }] };
  }
  out.report = { relation: [{ id: reportId }] };
  return out;
}

const keyOf = (table, row) => JSON.stringify(KEYS[table].map((k) => row[k] ?? null));

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    res.status(503).json({ error: 'NOTION_TOKEN is not set on Vercel' });
    return;
  }
  const started = Date.now();
  const timeLeft = () => Date.now() - started < BUDGET_MS;
  try {
    const reports = await loadReports(token);
    const i = currentIndex(reports, vnToday());
    const cur = reports[i], prev = reports[i - 1];
    if (!cur) { res.status(200).json({ done: true, note: 'no reports' }); return; }

    let copied = 0, remaining = 0, note;
    if (cur.initialized) note = 'already initialized';
    else if (!prev) note = 'no previous report to copy';
    else {
      for (const table of TABLES) {
        const [from, have] = await Promise.all([queryAll(token, table, inReport(prev.id)), queryAll(token, table, inReport(cur.id))]);
        // multiset difference by row key: copy only the rows the new report does not have yet
        const left = {};
        for (const p of have) { const k = keyOf(table, toRow(p)); left[k] = (left[k] || 0) + 1; }
        const todo = from.filter((p) => { const k = keyOf(table, toRow(p)); if (left[k]) { left[k]--; return false; } return true; });
        for (const p of todo) {
          if (!timeLeft()) { remaining++; continue; }
          await notion(token, 'POST', 'pages', { parent: { type: 'data_source_id', data_source_id: SOURCES[table].data_source }, properties: copyProps(p, cur.id) });
          copied++;
        }
      }
      if (!remaining) await notion(token, 'PATCH', `pages/${cur.id}`, { properties: { initialized: { checkbox: true } } });
    }

    // Until SEED_UNTIL, give every opened report the rows of the tables in SEED that it lacks
    // (by row key, so an interrupted fill resumes where it stopped). After that day it stops.
    let seeded = 0, seedLeft = 0;
    for (const r of vnToday() <= SEED_UNTIL ? reports.slice(0, i + 1) : []) {
      if (r.report_date > SEED_UNTIL) continue;
      for (const [table, spec] of Object.entries(SEED)) {
        const have = new Set((await queryAll(token, table, inReport(r.id))).map((p) => keyOf(table, toRow(p))));
        for (const row of spec.rows) {
          if (have.has(keyOf(table, row))) continue;
          if (!timeLeft()) { seedLeft++; continue; }
          await notion(token, 'POST', 'pages', { parent: { type: 'data_source_id', data_source_id: SOURCES[table].data_source }, properties: seedProps(spec, row, r.id) });
          seeded++;
        }
        if (seedLeft) break;
      }
      if (seedLeft) break;
    }

    res.status(200).json({ done: !remaining && !seedLeft, report: cur.report_date, from: prev && prev.report_date, copied, remaining, seeded, seed_left: seedLeft, note });
  } catch (e) {
    res.status(502).json({ done: false, error: String(e.message || e) });
  }
};
