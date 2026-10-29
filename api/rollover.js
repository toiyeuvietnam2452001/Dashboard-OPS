// POST /api/rollover — when a new weekly report opens, copy every row of the previous report into
// it, so team leads only change what moved this week. Then tick the report's "initialized" box.
//
// Safe to call any number of times: a report that is already initialized is left alone, and rows
// already copied are not copied twice. Each call works for at most ~40 s and answers
// { done: false, remaining } when there is more to copy, so the caller simply calls again.
// The hourly GitHub Action "Sync from Notion" does that. Needs the integration's
// "Insert content" and "Update content" capabilities.

const { TABLES, KEYS, SOURCES, notion, queryAll, inReport, toRow, vnToday, loadReports, currentIndex } = require('../lib/notion');

const BUDGET_MS = 40000;

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

const keyOf = (table, row) => JSON.stringify(KEYS[table].map((k) => row[k] ?? null));

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    res.status(503).json({ error: 'NOTION_TOKEN is not set on Vercel' });
    return;
  }
  const started = Date.now();
  try {
    const reports = await loadReports(token);
    const i = currentIndex(reports, vnToday());
    const cur = reports[i], prev = reports[i - 1];
    if (!cur) { res.status(200).json({ done: true, note: 'no reports' }); return; }
    if (cur.initialized) { res.status(200).json({ done: true, report: cur.report_date, note: 'already initialized' }); return; }
    if (!prev) { res.status(200).json({ done: true, report: cur.report_date, note: 'no previous report to copy' }); return; }

    let copied = 0, remaining = 0;
    for (const table of TABLES) {
      const [from, have] = await Promise.all([queryAll(token, table, inReport(prev.id)), queryAll(token, table, inReport(cur.id))]);
      // multiset difference by row key: copy only the rows the new report does not have yet
      const left = {};
      for (const p of have) { const k = keyOf(table, toRow(p)); left[k] = (left[k] || 0) + 1; }
      const todo = from.filter((p) => { const k = keyOf(table, toRow(p)); if (left[k]) { left[k]--; return false; } return true; });
      for (const p of todo) {
        if (Date.now() - started > BUDGET_MS) { remaining++; continue; }
        await notion(token, 'POST', 'pages', { parent: { type: 'data_source_id', data_source_id: SOURCES[table].data_source }, properties: copyProps(p, cur.id) });
        copied++;
      }
    }
    if (!remaining) await notion(token, 'PATCH', `pages/${cur.id}`, { properties: { initialized: { checkbox: true } } });
    res.status(200).json({ done: !remaining, report: cur.report_date, from: prev.report_date, copied, remaining });
  } catch (e) {
    res.status(502).json({ done: false, error: String(e.message || e) });
  }
};
