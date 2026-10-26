"""Build the Vercel dashboard: index.html (reads data.json at load) + data.json.

usage: build.py <gen dir> <data dir> <out dir>
"""
import json, os, re, sys

G, D, OUT = sys.argv[1:4]
IDS = ['meta', 'manpower', 'staffing', 'cbta', 'mandatory', 'vendor_training', 'orr_teams', 'orr_curve', 'orr_elements',
       'orr_groups', 'procedures', 'packages_no_pr', 'pr_pipeline', 'cmms', 'workstreams', 'permits', 'precom_plan',
       'startup_sequence']
data = {i: json.load(open(os.path.join(D, i + '.json'))) for i in IDS}
data['_updated_at'] = '2026-10-21T00:00:00Z'

page = open(os.path.join(G, 'page.html')).read()
style, body = page.split('</style>', 1)
style = style.replace('<style>', '')
body = re.sub(r'<script>(.*?)</script>', lambda m: '<script>(function(){' + m.group(1) + '\n})();</script>', body, flags=re.S)
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
--cds-dur-slow:.3s;--font-anthropic-sans:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;--font-anthropic-serif:'Source Serif 4',Georgia,serif;color-scheme:light}
@media (prefers-color-scheme: dark){:root{--color-bg:#12161c;--color-panel:#1a2029;--color-fg:#e6eaf0;--color-fg-muted:#9aa5b4;--color-border-line:#2b3440;
--color-ok:#5cc28d;--color-warn:#e5a83b;--color-bad:#ef6f62;--s1:#5aa3e0;--s2:#4cc0b0;--s3:#f0c04a;--s4:#a58bd0;--s5:#ef6f62;--s6:#93b85a;--s7:#b89a8e;--s8:#90a4ae;
--cds-chart-grid:#26303b;--cds-chart-axis:#46525f;--cds-chart-reference:#8b96a3;--cds-chart-muted:#6b7786;--cds-chart-status-critical:#ef6f62;
--cds-surface-popover:#222a35;--cds-border:#36414e;--cds-shadow-popover:0 4px 16px rgba(0,0,0,.4);--cds-text-secondary:#9aa5b4;color-scheme:dark}}
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
  var DATA = FALLBACK, live = false;
  try {
    var x = new XMLHttpRequest();
    x.open('GET', 'data.json?t=' + Date.now(), false);
    x.send();
    if (x.status === 200) { var j = JSON.parse(x.responseText); if (j && j.manpower) { DATA = j; live = true; } }
  } catch (e) {}
  var res = {}, fns = [];
  function input(i) { return i in DATA ? DATA[i] : res[i]; }
  return {
    live: live, updatedAt: DATA._updated_at,
    data: function (id) { var d = input(id); return d === undefined ? { status: 'missing', data: [], meta: [] } : { status: 'ok', data: d, refreshing: false, meta: [] }; },
    calc: function (id, o) { try { res[id] = o.fn.apply(null, o.inputs.map(function (i) { return input(i) || []; })); } catch (e) { console.error('calc ' + id, e); } },
    loader: function () {},
    onData: function (fn) { fns.push(fn); fn(); },
    colors: ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'],
    setLink: function (n) { try { history.replaceState(null, '', '#' + n); } catch (e) {} },
    params: function () { return {}; }, setParams: function () {}, resetParams: function () {}, refresh: function () {},
    _redraw: function () { fns.forEach(function (f) { f(); }); }
  };
})();
var __rt; window.addEventListener('resize', function () { clearTimeout(__rt); __rt = setTimeout(dash._redraw, 150); });
</script>""" % json.dumps(data, ensure_ascii=False)

foot = """<p class="ops-foot" id="ops-foot"></p>
<script>(function(){
  var f = document.getElementById('ops-foot'), m = (dash.data('meta').data || [])[0] || {};
  var t = dash.updatedAt ? new Date(dash.updatedAt) : null;
  var when = t && !isNaN(t) ? t.toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  f.textContent = 'Source: ' + (m.report_title || 'OPS Dashboard Data') + (m.prepared_by ? ', ' + m.prepared_by : '') + ' · Data updated ' + when + ' (Vietnam time).';
  if (!dash.live) { var s = document.createElement('span'); s.className = 'ops-stale'; s.textContent = ' Could not read data.json; showing fallback data.'; f.append(s); }
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
json.dump(data, open(os.path.join(OUT, 'data.json'), 'w'), ensure_ascii=False, indent=1)
print('index.html', len(html), 'data.json', os.path.getsize(os.path.join(OUT, 'data.json')))
