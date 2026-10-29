"""Build the Vercel dashboard: index.html (reads data.json at load) + data.json.

usage: build.py <gen dir> <data dir> <out dir>
"""
import json, os, re, sys

G, D, OUT = sys.argv[1:4]
IDS = ['meta', 'manpower', 'staffing', 'cbta', 'mandatory', 'vendor_training', 'orr_teams', 'orr_curve', 'orr_elements',
       'orr_groups', 'procedures', 'packages_no_pr', 'pr_pipeline', 'cmms', 'workstreams', 'permits', 'precom_plan',
       'startup_sequence', 'readiness', 'milestones']
data = {i: json.load(open(os.path.join(D, i + '.json'))) for i in IDS}
data['_updated_at'] = '2026-10-21T00:00:00Z'
VI = json.load(open(os.path.join(G, 'i18n-vi.json'), encoding='utf-8'))

page = open(os.path.join(G, 'page.html')).read()
import base64
page = page.replace('{{LOGO}}', 'data:image/png;base64,' + base64.b64encode(open(os.path.join(G, 'logo.png'), 'rb').read()).decode())
style, body = page.split('</style>', 1)
style = style.replace('<style>', '')
body = re.sub(r'<script>(.*?)</script>', lambda m: '<script>(function(){' + m.group(1) + '\n})();</script>', body, flags=re.S)
# Translate the fixed text once the markup is parsed, before the drawing scripts run.
body = body.replace('<script>', "<script>dash._translateStatic(document.getElementById('dash-root'));</script>\n<script>", 1)
d3 = open(os.path.join(G, 'd3.min.js')).read().replace('</script', '<\\/script')

tokens = """
:root{--color-bg:#f7f8fa;--color-panel:#ffffff;--color-fg:#1b2430;--color-fg-muted:#5d6878;--color-border-line:#e1e5eb;
--color-ok:#1f7a4d;--color-warn:#a8650a;--color-bad:#c0392b;
--s1:#1f6fb2;--s2:#2a9d8f;--s3:#e0a526;--s4:#7b5ea7;--s5:#d1495b;--s6:#5c7a2e;--s7:#8d6e63;--s8:#455a64;
--cds-chart-grid:#e8ecf1;--cds-chart-axis:#b7c0cc;--cds-chart-reference:#7d8794;--cds-chart-muted:#9aa5b4;--cds-chart-status-critical:#d1495b;
--cds-surface-popover:#ffffff;--cds-border:#d6dbe2;--cds-shadow-popover:0 4px 16px rgba(20,30,45,.12);--cds-text-secondary:#5d6878;
--cds-gap-xs:4px;--cds-gap-sm:8px;--cds-gap-md:16px;--cds-gap-lg:24px;--cds-gap-xl:40px;
--cds-pad-xs:4px;--cds-pad-sm:8px;--cds-pad-md:12px;--cds-pad-lg:20px;--cds-radius:8px;
--cds-font-size-caption:12.5px;--cds-font-size-body:14.5px;--cds-font-size-heading:16px;--cds-font-size-title:30px;--cds-font-weight-medium:600;
--cds-dur-slow:.3s;--brand:#2B3990;--brand-2:#00A14B;--brand-ink:#2B3990;--brand-tint:#EEF0FA;--brand-line:#C9CEEC;--rag-g:#1F7A4D;--rag-a:#B7791F;--rag-r:#C0392B;--rag-a-tint:#FDF6E7;--rag-a-line:#F0D9A8;--rag-r-tint:#FCEEEC;--rag-r-line:#F2C4BE;--led:#00A14B;--led-head:#00D26A;--font-anthropic-sans:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;--font-anthropic-serif:'Source Serif 4',Georgia,serif;color-scheme:light}
@media (prefers-color-scheme: dark){:root{--color-bg:#12161c;--color-panel:#1a2029;--color-fg:#e6eaf0;--color-fg-muted:#9aa5b4;--color-border-line:#2b3440;
--color-ok:#5cc28d;--color-warn:#e5a83b;--color-bad:#ef6f62;--s1:#5aa3e0;--s2:#4cc0b0;--s3:#f0c04a;--s4:#a58bd0;--s5:#ef6f62;--s6:#93b85a;--s7:#b89a8e;--s8:#90a4ae;
--cds-chart-grid:#26303b;--cds-chart-axis:#46525f;--cds-chart-reference:#8b96a3;--cds-chart-muted:#6b7786;--cds-chart-status-critical:#ef6f62;
--cds-surface-popover:#222a35;--cds-border:#36414e;--cds-shadow-popover:0 4px 16px rgba(0,0,0,.4);--cds-text-secondary:#9aa5b4;--brand:#4C5BC4;--brand-ink:#9EA8F0;--brand-tint:#1E2440;--brand-line:#34407A;--rag-g:#5CC28D;--rag-a:#E5A83B;--rag-r:#EF6F62;--rag-a-tint:#2A2414;--rag-a-line:#5A4A20;--rag-r-tint:#2C1A1A;--rag-r-line:#5E2C28;--led:#1FC46B;--led-head:#B4FAD2;color-scheme:dark}}
@media print{:root{--color-bg:#ffffff;--color-panel:#ffffff;--color-fg:#1b2430;--color-fg-muted:#5d6878;--color-border-line:#d6dbe2;--brand-ink:#2B3990;--brand-tint:#EEF0FA;--rag-a-tint:#FDF6E7;--rag-r-tint:#FCEEEC;color-scheme:light}body{font-size:12px}}
html,body{margin:0;background:var(--color-bg);color:var(--color-fg);font-family:var(--font-anthropic-sans);font-size:14px}
#dash-root{max-width:1280px;margin-inline:auto;padding-block:24px 40px;padding-left:max(var(--dash-gutter,16px),env(safe-area-inset-left,0px));padding-right:max(var(--dash-gutter,16px),env(safe-area-inset-right,0px))}
.dash-skeleton{color:transparent!important;background:var(--cds-chart-grid);border-radius:4px}
[hidden]{display:none!important}
.ops-foot{margin-top:24px;color:var(--color-fg-muted);font-size:12px;line-height:1.5}
.ops-stale{color:var(--color-bad)}
"""

# data.json is read synchronously so every page script below sees the same numbers;
# the embedded copy is only a fallback when data.json can't be read.
shim = """<script>
window.dash = (function () {
  var FALLBACK = %s;
  // Language: ?lang=en|vi in the address wins, else the viewer's last choice, else English.
  var VI = %s, lang = 'en';
  try { if (localStorage.getItem('ops-lang') === 'vi') lang = 'vi'; } catch (e) {}
  var qLang = (location.search.match(/[?&]lang=(en|vi)(?:&|$)/) || [])[1]; if (qLang) lang = qLang;
  if (lang === 'vi') {
    document.documentElement.lang = 'vi';
    document.title = VI.ui[document.title] || document.title;
    d3.formatDefaultLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['', ' ₫'], minus: '\u2212' });
  }
  var own = function (o, k) { return k != null && Object.prototype.hasOwnProperty.call(o, k); };
  function translateStatic(root) {
    if (lang !== 'vi' || !root) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function (n) {
      var p = n.parentNode, t = n.nodeValue, k = t.trim();
      if (!k || !p || p.closest('script,style')) return;
      var v = p.hasAttribute('data-vi') ? p.getAttribute('data-vi') : own(VI.ui, k) ? VI.ui[k] : null;
      if (v == null) return;
      var i = t.indexOf(k); n.nodeValue = t.slice(0, i) + v + t.slice(i + k.length);
    });
    root.querySelectorAll('[title],[placeholder],[aria-label]').forEach(function (e) {
      ['title', 'placeholder', 'aria-label'].forEach(function (a) { var v = (e.getAttribute(a) || '').trim(); if (own(VI.ui, v)) e.setAttribute(a, VI.ui[v]); });
    });
  }
  function setLang(l) {
    try { localStorage.setItem('ops-lang', l); } catch (e) {}
    var q = new URLSearchParams(location.search); q.set('lang', l);
    location.assign(location.pathname + '?' + q.toString() + location.hash);
  }
  var DATA = FALLBACK, live = false;
  function getJSON(url, cached) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', cached ? url : url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), false);
      x.send();
      return x.status === 200 ? JSON.parse(x.responseText) : null;
    } catch (e) { return null; }
  }
  // ?date=YYYY-MM-DD opens the archived report of that date; otherwise the latest data.json.
  var index = getJSON('history/index.json') || { latest: null, reports: [] };
  var asked = (location.search.match(/[?&]date=(\\d{4}-\\d{2}-\\d{2})/) || [])[1] || null;
  var viewDate = null, missingDate = null;
  if (asked) {
    var snap = getJSON('history/' + asked + '.json');
    if (snap && snap.manpower) { DATA = snap; live = true; viewDate = asked; } else { missingDate = asked; }
  }
  // Latest report: live from Notion through api/data (edge-cached ~60 s), else the last data.json.
  var source = viewDate ? 'archive' : null;
  if (!live) { var api = getJSON('api/data', true); if (api && api.manpower) { DATA = api; live = true; source = 'notion'; } }
  if (!live) { var cur = getJSON('data.json'); if (cur && cur.manpower) { DATA = cur; live = true; source = 'file'; } }
  // The report just before this one, for "change since last report" figures.
  var prev = null, prevDate = null;
  try {
    var cur = ((DATA.meta || [])[0] || {}).report_date;
    (index.reports || []).forEach(function (r) { if (cur && r.date < cur && (!prevDate || r.date > prevDate)) prevDate = r.date; });
    if (prevDate) { prev = getJSON('history/' + prevDate + '.json'); if (!prev || !prev.manpower) { prev = null; prevDate = null; } }
  } catch (e) {}
  // Re-check Notion every minute; reload when someone has edited the data.
  if (source === 'notion') {
    setInterval(function () {
      fetch('api/data').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (j && j._updated_at && j._updated_at !== DATA._updated_at) location.reload();
      }).catch(function () {});
    }, 60000);
  }
  var res = {}, fns = [];
  function input(i) { return i in DATA ? DATA[i] : res[i]; }
  return {
    live: live, updatedAt: DATA._updated_at, source: source, prev: prev, prevDate: prevDate,
    reports: index.reports || [], latestDate: index.latest, viewDate: viewDate, missingDate: missingDate,
    archived: !!viewDate && viewDate !== index.latest,
    data: function (id) { var d = input(id); return d === undefined ? { status: 'missing', data: [], meta: [] } : { status: 'ok', data: d, refreshing: false, meta: [] }; },
    calc: function (id, o) { try { res[id] = o.fn.apply(null, o.inputs.map(function (i) { return input(i) || []; })); } catch (e) { console.error('calc ' + id, e); } },
    loader: function () {},
    onData: function (fn) { fns.push(fn); fn(); },
    colors: ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'],
    setLink: function (n) { try { history.replaceState(null, '', '#' + n); } catch (e) {} },
    params: function () { return {}; }, setParams: function () {}, resetParams: function () {}, refresh: function () {},
    _redraw: function () { fns.forEach(function (f) { f(); }); },
    lang: lang, setLang: setLang, _translateStatic: translateStatic,
    // L('English', 'Tiếng Việt') picks the text for the current language; D(value) translates a known data label.
    L: function (en, vi) { return lang === 'vi' ? vi : en; },
    D: function (s) { return lang === 'vi' && own(VI.data, s) ? VI.data[s] : s; }
  };
})();
var __rt; window.addEventListener('resize', function () { clearTimeout(__rt); __rt = setTimeout(dash._redraw, 150); });
</script>""" % (json.dumps(data, ensure_ascii=False), json.dumps({'ui': VI['ui'], 'data': VI['data']}, ensure_ascii=False))

foot = """<div class="ops-docctl" id="docctl" hidden></div>
<p class="ops-foot" id="ops-foot"></p>
<script>(function(){
  var f = document.getElementById('ops-foot'), m = (dash.data('meta').data || [])[0] || {}, L = dash.L;
  var t = dash.updatedAt ? new Date(dash.updatedAt) : null;
  var when = t && !isNaN(t) ? t.toLocaleString(L('en-GB', 'vi-VN'), { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: 'numeric', month: L('short', '2-digit'), year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  f.textContent = L('Source: ', 'Nguồn: ') + (m.report_title || 'OPS Dashboard Data') + (m.prepared_by ? ', ' + m.prepared_by : '')
    + (dash.source === 'notion' ? L(' · Live from Notion, last edited ', ' · Trực tiếp từ Notion, sửa lần cuối ') : L(' · Data updated ', ' · Số liệu cập nhật ')) + when + L(' (Vietnam time).', ' (giờ Việt Nam).');
  var dc = document.getElementById('docctl'), items = [[L('Document no.', 'Số tài liệu'), m.doc_no], [L('Revision', 'Phiên bản'), m.revision], [L('Classification', 'Mức độ mật'), dash.D(m.classification)], [L('Prepared by', 'Người lập'), m.prepared_by], [L('Reviewed by', 'Người soát xét'), m.reviewed_by], [L('Approved by', 'Người phê duyệt'), m.approved_by]].filter(function (x) { return x[1]; });
  if (items.length) { dc.hidden = false; items.forEach(function (x) { var d = document.createElement('div'), s = document.createElement('span'); s.textContent = x[0]; d.append(s, x[1]); dc.append(d); }); }
  var cls = document.getElementById('doc-class'); if (cls && m.classification) { cls.hidden = false; cls.textContent = dash.D(m.classification); }
  if (!dash.live) { var s = document.createElement('span'); s.className = 'ops-stale'; s.textContent = L(' Could not read data.json; showing fallback data.', ' Không đọc được data.json; đang hiển thị số liệu dự phòng.'); f.append(s); }
})();</script>"""

html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>OPS Readiness Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400&display=swap" rel="stylesheet">
<style>{tokens}{style}</style>
<script>{d3}</script>
{shim}
</head>
<body>
<div id="dash-root">
{body}
{foot}
</div>
</body>
</html>"""
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, 'index.html'), 'w').write(html)
# data.json holds live numbers pushed from Excel: only create it, never overwrite it here.
if not os.path.exists(os.path.join(OUT, 'data.json')):
    json.dump(data, open(os.path.join(OUT, 'data.json'), 'w'), ensure_ascii=False, indent=1)
print('index.html', len(html), 'data.json', os.path.getsize(os.path.join(OUT, 'data.json')))
