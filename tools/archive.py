"""Save data.json into history/ and rebuild history/index.json.

Run by the GitHub Actions after every sync. The day is meta.report_date, which api/data sets to the
current day in Vietnam.

- history/<date>.json        the latest figures of that day (rewritten by every sync that day)
- history/<date>/<HHMM>.json  one file per change: written only when the figures differ from the last
                              saved version, named by the Vietnam time of the last Notion edit
- history/index.json         every saved day, newest first, with its versions (times, oldest first)
"""
import datetime as dt, json, os, re, sys

VN = dt.timezone(dt.timedelta(hours=7))
VOLATILE = ('report_date', 'as_of')  # change every day without anyone editing


def content(d):
    """The figures without the fields that move on their own, for comparing versions."""
    d = dict(d)
    d['meta'] = [{k: v for k, v in m.items() if k not in VOLATILE} for m in d.get('meta') or []]
    return json.dumps(d, sort_keys=True, ensure_ascii=False)


root = sys.argv[1] if len(sys.argv) > 1 else '.'
data = json.load(open(os.path.join(root, 'data.json'), encoding='utf-8'))
meta = (data.get('meta') or [{}])[0]
date = str(meta.get('report_date') or '')
if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
    sys.exit(f'report_date "{date}" is not YYYY-MM-DD; check api/data')

hist = os.path.join(root, 'history')
os.makedirs(hist, exist_ok=True)
dump = lambda obj, path: json.dump(obj, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
dump(data, os.path.join(hist, f'{date}.json'))

# The last version saved, on this day or any earlier one.
versions = sorted((d, f[:4]) for d in os.listdir(hist) if os.path.isdir(os.path.join(hist, d))
                  for f in os.listdir(os.path.join(hist, d)) if re.fullmatch(r'\d{4}\.json', f))
last = versions[-1] if versions else None
same = last and content(json.load(open(os.path.join(hist, last[0], last[1] + '.json'), encoding='utf-8'))) == content(data)
if not same:
    now = dt.datetime.now(VN)
    try:
        edited = dt.datetime.fromisoformat(str(data.get('_updated_at')).replace('Z', '+00:00')).astimezone(VN)
    except ValueError:
        edited = now
    stamp = (edited if edited.strftime('%Y-%m-%d') == date else now).strftime('%H%M')
    if last and last[0] == date and stamp <= last[1]:  # never go back in time or overwrite within a day
        after = (dt.datetime.strptime(date + last[1], '%Y-%m-%d%H%M') + dt.timedelta(minutes=1)).strftime('%H%M')
        stamp = max(now.strftime('%H%M'), after) if after > last[1] else '2359'
    os.makedirs(os.path.join(hist, date), exist_ok=True)
    dump(data, os.path.join(hist, date, stamp + '.json'))
    print(f'new version {date} {stamp}')

reports = []
for name in os.listdir(hist):
    m = re.fullmatch(r'(\d{4}-\d{2}-\d{2})\.json', name)
    if not m:
        continue
    snap = json.load(open(os.path.join(hist, name), encoding='utf-8'))
    folder = os.path.join(hist, m.group(1))
    times = sorted(f[:4] for f in os.listdir(folder) if re.fullmatch(r'\d{4}\.json', f)) if os.path.isdir(folder) else []
    reports.append({'date': m.group(1), 'updated_at': snap.get('_updated_at'),
                    'title': ((snap.get('meta') or [{}])[0]).get('report_title'), 'versions': times})
reports.sort(key=lambda r: r['date'], reverse=True)
dump({'latest': reports[0]['date'] if reports else None, 'reports': reports}, os.path.join(hist, 'index.json'))
print(f'archived {date}; {len(reports)} day(s) in history')
