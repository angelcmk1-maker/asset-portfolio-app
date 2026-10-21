#!/usr/bin/env python3
"""지수·환율 월봉을 Yahoo에서 받아 web/data/market.json 으로 저장(GitHub Actions에서 매일 실행).
공개 시세라 저장소에 있어도 괜찮다. 앱은 이 파일을 우선 쓰고, 없으면 Apps Script 시세를 쓴다."""
import datetime as dt, json, time, urllib.request, pathlib

SYMS = {'kospi': '^KS11', 'kosdaq': '^KQ11', 'sp500': '^GSPC', 'nasdaq': '^IXIC', 'dow': '^DJI', 'sox': '^SOX',
        'usdkrw': 'KRW=X', 'usdvnd': 'VND=X'}
P1 = int(dt.datetime(2000, 1, 1, tzinfo=dt.timezone.utc).timestamp())

def fetch(sym):
    p2 = int(time.time()) + 86400
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?period1={P1}&period2={p2}&interval=1mo&events=history'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    for i in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                j = json.load(r)
            res = j['chart']['result'][0]
            ts = res.get('timestamp') or []; cl = (res['indicators']['quote'][0] or {}).get('close') or []
            rows = [{'Date': dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z'), 'Close': round(c, 4)}
                    for t, c in zip(ts, cl) if c is not None and c > 0]
            return rows, res['meta'].get('dataGranularity')
        except Exception as e:  # noqa
            err = e; time.sleep(3 * (i + 1))
    raise err

import urllib.parse
out, meta = {}, {}
for k, s in SYMS.items():
    try:
        rows, g = fetch(s); out[k] = rows; meta[k] = {'rows': len(rows), 'granularity': g, 'first': rows[0]['Date'][:7] if rows else None, 'last': rows[-1]['Date'][:10] if rows else None}
    except Exception as e:
        meta[k] = {'error': str(e)}
    time.sleep(1)
p = pathlib.Path(__file__).resolve().parent.parent / 'web' / 'data'
p.mkdir(parents=True, exist_ok=True)
old = {}
try: old = json.loads((p / 'market.json').read_text())
except Exception: pass
for k in SYMS:  # 실패한 항목은 지난 값 유지
    if k not in out and k in (old.get('market') or {}): out[k] = old['market'][k]
(p / 'market.json').write_text(json.dumps({'updated': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), 'meta': meta, 'market': out}, separators=(',', ':')))
print(json.dumps(meta, indent=1))
