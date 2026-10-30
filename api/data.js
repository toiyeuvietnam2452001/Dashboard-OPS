// GET /api/data — the live report: every row of every table on the Notion page "OPS Dashboard Data".
//
// There is one report, updated in place; the dashboard shows the figures as they are now. Earlier
// days are kept as copies in history/<date>.json by the hourly GitHub Action, so ?date= is not
// served here (the page falls back to those copies). Returns the same shape as data.json: one
// array per table plus "meta" (the report's details from the "reports" table). Needs the Vercel
// environment variable NOTION_TOKEN and the page shared with that integration. Responses are
// cached at the edge for 60 s.

const { TABLES, queryAll, toRow, vnToday } = require('../lib/notion');

async function load(token) {
  const out = {};
  let lastEdited = '';
  // three tables at a time keeps us inside Notion's ~3 requests/second limit
  for (let i = 0; i < TABLES.length; i += 3) {
    await Promise.all(TABLES.slice(i, i + 3).map(async (id) => {
      const pages = await queryAll(token, id);
      out[id] = pages.map(toRow).filter((r) => Object.values(r).some((v) => v !== null && v !== ''));
      for (const p of pages) if (p.last_edited_time > lastEdited) lastEdited = p.last_edited_time;
    }));
  }
  const reports = await queryAll(token, 'reports');
  const rep = reports.length ? toRow(reports[0]) : {};
  if (reports.length && reports[0].last_edited_time > lastEdited) lastEdited = reports[0].last_edited_time;
  const today = vnToday();
  out.meta = [{
    report_date: today, as_of: today, state: 'open', name: rep.name || null,
    report_title: rep.report_title || null, prepared_by: rep.prepared_by || null, doc_no: rep.doc_no || null, revision: rep.revision || null,
    reviewed_by: rep.reviewed_by || null, approved_by: rep.approved_by || null, classification: rep.classification || null,
  }];
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
  if (req.query.date) {
    res.status(404).json({ error: 'Earlier days are served from history/<date>.json' });
    return;
  }
  try {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json(await load(token));
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
