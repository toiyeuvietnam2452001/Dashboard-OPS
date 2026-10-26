// GET /api/data — reads the dashboard tables from Notion and returns them in the same shape as data.json.
//
// Needs the Vercel environment variable NOTION_TOKEN (an internal integration secret) and the
// "OPS Dashboard Data" page shared with that integration (page ⋯ → Connections).
// Responses are cached at the edge for 60 s so Notion is queried at most about once a minute.

const SOURCES = require('../tools/notion-sources.json');

const NOTION_VERSION = '2025-09-03';
// Tables whose row order is a property rather than the order rows were created.
const SORT_BY = { manpower: 'month', orr_curve: 'month', startup_sequence: 'step' };

async function queryAll(token, dataSourceId, sortProp) {
  const rows = [];
  let cursor;
  do {
    const body = { page_size: 100, sorts: [sortProp ? { property: sortProp, direction: 'ascending' } : { timestamp: 'created_time', direction: 'ascending' }] };
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
      const pages = await queryAll(token, SOURCES[id].data_source, SORT_BY[id]);
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
