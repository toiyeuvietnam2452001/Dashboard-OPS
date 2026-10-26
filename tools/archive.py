"""Save data.json as history/<report_date>.json and rebuild history/index.json.

Run by .github/workflows/archive.yml after every push that changes data.json.
The report date comes from the "meta" table (sheet "Thong tin", column report_date).
"""
import json, os, re, sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'
data = json.load(open(os.path.join(root, 'data.json'), encoding='utf-8'))
meta = (data.get('meta') or [{}])[0]
date = str(meta.get('report_date') or '')
if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
    sys.exit(f'report_date "{date}" is not YYYY-MM-DD; fix sheet "Thong tin" and push again')

hist = os.path.join(root, 'history')
os.makedirs(hist, exist_ok=True)
json.dump(data, open(os.path.join(hist, f'{date}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

reports = []
for name in os.listdir(hist):
    m = re.fullmatch(r'(\d{4}-\d{2}-\d{2})\.json', name)
    if not m:
        continue
    snap = json.load(open(os.path.join(hist, name), encoding='utf-8'))
    reports.append({'date': m.group(1), 'updated_at': snap.get('_updated_at'),
                    'title': ((snap.get('meta') or [{}])[0]).get('report_title')})
reports.sort(key=lambda r: r['date'], reverse=True)
json.dump({'latest': reports[0]['date'] if reports else None, 'reports': reports},
          open(os.path.join(hist, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'archived {date}; {len(reports)} report(s) in history')
