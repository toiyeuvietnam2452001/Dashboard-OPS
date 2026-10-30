// POST /api/rollover — one-off move from weekly reports to a single live report.
//
// Every table holds one copy of each row per weekly report. This keeps one row per row key (the
// copy linked to KEEP, the report of 28/10 – 04/11/2026, or else the most recently edited one),
// links it to KEEP, and moves the other copies to the Notion trash. When no table has extra
// copies left it moves the other weekly report pages to the trash too; after that a call does
// nothing. Each call works for at most ~40 s and answers { done: false } while work remains, so
// the hourly GitHub Action "Sync from Notion" simply calls again.

const { TABLES, KEYS, SOURCES, notion, queryAll, toRow, loadReports } = require('../lib/notion');

const BUDGET_MS = 40000;
const KEEP = '408522d7-e51f-81cd-9414-c5317b66a197';

const keyOf = (table, row) => JSON.stringify(KEYS[table].map((k) => row[k] ?? null));
const links = (page) => (page.properties.report && page.properties.report.relation || []).map((r) => r.id);

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    res.status(503).json({ error: 'NOTION_TOKEN is not set on Vercel' });
    return;
  }
  const started = Date.now();
  const timeLeft = () => Date.now() - started < BUDGET_MS;
  try {
    const others = (await loadReports(token)).filter((r) => r.id !== KEEP);
    if (!others.length) { res.status(200).json({ done: true, note: 'single report' }); return; }

    let trashed = 0, linked = 0, left = 0;
    for (const table of TABLES) {
      if (!timeLeft()) { left++; continue; }
      const groups = new Map();
      for (const p of await queryAll(token, table)) {
        const k = keyOf(table, toRow(p));
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(p);
      }
      for (const pages of groups.values()) {
        pages.sort((a, b) => (links(b).includes(KEEP) - links(a).includes(KEEP)) || (b.last_edited_time > a.last_edited_time ? 1 : -1));
        const [keep, ...extra] = pages;
        if (!timeLeft()) { left += extra.length + 1; continue; }
        const l = links(keep);
        if (l.length !== 1 || l[0] !== KEEP) {
          await notion(token, 'PATCH', `pages/${keep.id}`, { properties: { report: { relation: [{ id: KEEP }] } } });
          linked++;
        }
        for (const p of extra) {
          if (!timeLeft()) { left++; continue; }
          await notion(token, 'PATCH', `pages/${p.id}`, { in_trash: true });
          trashed++;
        }
      }
    }
    let reportsTrashed = 0;
    if (!left) {
      for (const r of others) {
        if (!timeLeft()) { left++; continue; }
        await notion(token, 'PATCH', `pages/${r.id}`, { in_trash: true });
        reportsTrashed++;
      }
    }
    res.status(200).json({ done: !left, trashed, linked, reports_trashed: reportsTrashed, left });
  } catch (e) {
    res.status(502).json({ done: false, error: String(e.message || e) });
  }
};
