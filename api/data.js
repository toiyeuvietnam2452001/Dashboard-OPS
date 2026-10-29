// GET /api/data            the report open this week, live from Notion
// GET /api/data?date=DATE  the report with that report_date (YYYY-MM-DD)
//
// Returns the same shape as data.json: one array per table plus "meta" (the report's details),
// "_reports" (every report that has opened, for the report picker) and "_current" (this week's
// report date). Needs the Vercel environment variable NOTION_TOKEN and the "OPS Dashboard Data"
// page shared with that integration. Responses are cached at the edge for 60 s.

const { TABLES, queryAll, inReport, toRow, vnToday, loadReports, currentIndex } = require('../lib/notion');

async function loadTables(token, reportId) {
  const out = {};
  let lastEdited = '';
  // three tables at a time keeps us inside Notion's ~3 requests/second limit
  for (let i = 0; i < TABLES.length; i += 3) {
    await Promise.all(TABLES.slice(i, i + 3).map(async (id) => {
      const pages = await queryAll(token, id, inReport(reportId));
      out[id] = pages.map(toRow).filter((r) => Object.values(r).some((v) => v !== null && v !== ''));
      for (const p of pages) if (p.last_edited_time > lastEdited) lastEdited = p.last_edited_time;
    }));
  }
  return { out, lastEdited, rows: TABLES.reduce((n, id) => n + out[id].length, 0) };
}

async function load(token, date) {
  const today = vnToday();
  const reports = await loadReports(token);
  if (!reports.length) throw new Error('No reports in "Kỳ báo cáo [reports]"');
  const cur = currentIndex(reports, today);
  const idx = date ? reports.findIndex((r) => r.report_date === date) : cur;
  if (idx < 0) return null;
  const rep = reports[idx];

  let { out, lastEdited, rows } = await loadTables(token, rep.id);
  // A week that has just opened has no rows until api/rollover copies the previous report in.
  let carried = null;
  if (!rows && idx > 0) {
    ({ out, lastEdited } = await loadTables(token, reports[idx - 1].id));
    carried = reports[idx - 1].report_date;
  }
  if (rep.edited > lastEdited) lastEdited = rep.edited;

  const state = idx === cur ? 'open' : idx < cur ? 'closed' : 'upcoming';
  out.meta = [{
    report_date: rep.report_date, from_date: rep.from_date, name: rep.name, state,
    as_of: state === 'open' && today < rep.report_date ? today : rep.report_date,
    report_title: rep.report_title, prepared_by: rep.prepared_by, doc_no: rep.doc_no, revision: rep.revision,
    reviewed_by: rep.reviewed_by, approved_by: rep.approved_by, classification: rep.classification,
  }];
  out._reports = reports.slice(0, cur + 1).map((r, i) => ({ date: r.report_date, from: r.from_date, name: r.name, state: i === cur ? 'open' : 'closed' }));
  out._current = reports[cur].report_date;
  if (carried) out._carried_from = carried;
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
  const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
  try {
    const data = await load(token, date);
    if (!data) {
      res.status(404).json({ error: `No report dated ${date}` });
      return;
    }
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
