/**
 * 자산 포트폴리오 앱 — 데이터 API (Google Apps Script 웹앱)
 *
 * 설치
 *  1) 구글 시트 '자산 포트폴리오' → 확장 프로그램 → Apps Script 에 이 파일 전체를 붙여 넣고 저장
 *  2) 위쪽 함수 선택에서 setup 을 고르고 ▶ 실행 → 권한 허용 → 실행 로그에 나온 "API 키"를 복사해 둠
 *  3) 배포 → 새 배포 → 유형: 웹 앱 / 실행 사용자: 나 / 액세스 권한: 모든 사용자 → 배포 → 웹 앱 URL 복사
 *  4) 폰 앱을 처음 열 때 웹 앱 URL 과 API 키를 입력
 *
 * 이 스크립트를 고친 뒤에는 배포 → 배포 관리 → 연필(수정) → 버전: 새 버전 → 배포 를 눌러야 반영됩니다(URL은 그대로).
 */

const TZ = 'Asia/Ho_Chi_Minh';
const RANGES = {
  holdings: '보유종목!A6:S65',
  balances: '계좌잔고!A6:L500',
  reports: '리포트!A2:H2000',
  watchlist: '관심종목!A2:F200',
  acct_meta: '계좌목록!A5:G44',
  other_assets: '기타자산!A2:G100',
  flows_raw: '월별흐름!A2:D5000',
  dividends_raw: '배당내역!A2:E5000',
};
const MARKET = {
  kospi: ['^KS11', 'max', '1mo'],
  sp500: ['^GSPC', 'max', '1mo'],
  nasdaq: ['^IXIC', 'max', '1mo'],
  usdkrw: ['KRW=X', 'max', '1mo'],
  usdvnd: ['VND=X', 'max', '1mo'],
};
const CACHE_SHEET = '_시세캐시';

/** 처음 한 번 실행: API 키를 만들고 로그에 보여 줍니다. 이미 있으면 기존 키를 보여 줍니다. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('API_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty('API_KEY', key);
  }
  Logger.log('API 키: ' + key);
  refreshMarket();
  return key;
}

/** API 키를 새로 바꿉니다(유출이 의심될 때). 바꾼 뒤 폰 앱 설정에서 새 키를 입력하세요. */
function rotateKey() {
  PropertiesService.getScriptProperties().deleteProperty('API_KEY');
  return setup();
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    const key = PropertiesService.getScriptProperties().getProperty('API_KEY');
    if (!key || p.key !== key) return json_({ ok: false, error: 'unauthorized', message: 'API 키가 맞지 않습니다.' });
    const action = p.action || 'all';
    if (action === 'all') return json_(all_());
    if (action === 'ping') return json_({ ok: true, now: new Date().toISOString() });
    if (action === 'watch_add') return json_(watchAdd_(p));
    if (action === 'watch_del') return json_(watchDel_(p));
    if (action === 'watch_toggle') return json_(watchToggle_(p));
    if (action === 'market_refresh') { refreshMarket(); return json_({ ok: true }); }
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err && err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v;
}

function trimRows_(rows) {
  let n = rows.length;
  while (n > 0 && rows[n - 1].every((c) => c === '' || c === null)) n--;
  return rows.slice(0, n).map((r) => r.map(cell_));
}

function all_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = {};
  for (const [id, a1] of Object.entries(RANGES)) {
    const [name, rng] = a1.split('!');
    const sh = ss.getSheetByName(name);
    sheets[id] = sh ? trimRows_(sh.getRange(rng).getValues()) : [];
  }
  return { ok: true, updated: new Date().toISOString(), sheets, market: market_() };
}

// ---------- 시세 (Yahoo 월봉) ----------
function yahoo_(sym, range, interval) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=' + range + '&interval=' + interval;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (res.getResponseCode() !== 200) throw new Error(sym + ' HTTP ' + res.getResponseCode());
  const r = JSON.parse(res.getContentText()).chart.result[0];
  const ts = r.timestamp || []; const c = (r.indicators.quote[0] || {}).close || [];
  return ts.map((t, i) => ({ Date: new Date(t * 1000).toISOString(), Close: c[i] })).filter((x) => x.Close != null);
}

function cacheSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CACHE_SHEET);
  if (!sh) { sh = ss.insertSheet(CACHE_SHEET); sh.hideSheet(); }
  return sh;
}

/** 시세를 새로 받아 캐시에 저장합니다. 시간 기반 트리거(매일)로 걸어 두면 좋습니다. */
function refreshMarket() {
  const sh = cacheSheet_(); const cache = CacheService.getScriptCache();
  const ids = Object.keys(MARKET);
  ids.forEach((id, i) => {
    try {
      const rows = yahoo_.apply(null, MARKET[id]);
      const s = JSON.stringify(rows);
      sh.getRange(i + 1, 1, 1, 3).setValues([[id, new Date(), s]]);
      try { cache.put('mk_' + id, s, 21600); } catch (e) { /* 100KB 초과 시 캐시 생략 */ }
    } catch (err) {
      Logger.log('시세 실패 ' + id + ': ' + err);
    }
  });
}

function market_() {
  const cache = CacheService.getScriptCache(); const out = {}; const missing = [];
  for (const id of Object.keys(MARKET)) {
    const c = cache.get('mk_' + id);
    if (c) out[id] = JSON.parse(c); else missing.push(id);
  }
  if (missing.length) {
    const sh = cacheSheet_(); const vals = sh.getRange(1, 1, Object.keys(MARKET).length, 3).getValues();
    const saved = {}; vals.forEach((r) => { if (r[0]) saved[r[0]] = r; });
    const stale = missing.filter((id) => !saved[id] || (Date.now() - new Date(saved[id][1]).getTime()) > 6 * 3600e3);
    if (stale.length) refreshMarket();
    const vals2 = sh.getRange(1, 1, Object.keys(MARKET).length, 3).getValues();
    vals2.forEach((r) => { if (r[0] && missing.includes(r[0]) && r[2]) { out[r[0]] = JSON.parse(r[2]); try { cache.put('mk_' + r[0], r[2], 21600); } catch (e) {} } });
  }
  return out;
}

// ---------- 관심종목 편집 ----------
function watchSheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('관심종목'); }
function normCode_(c) { return String(c || '').replace(/^'/, '').trim().toUpperCase(); }

function watchAdd_(p) {
  const name = String(p.name || '').trim(); const code = normCode_(p.code);
  if (!name || !code) return { ok: false, error: 'invalid', message: '종목명과 코드를 입력하세요.' };
  const sh = watchSheet_(); const last = Math.max(1, sh.getLastRow());
  const codes = last > 1 ? sh.getRange(2, 2, last - 1, 1).getValues().map((r) => normCode_(r[0])) : [];
  const i = codes.indexOf(code);
  const row = [name, "'" + code, (p.market || 'KRX').toUpperCase() === 'US' ? 'US' : 'KRX', 'Y', p.kind === '보유' ? '보유' : '관심', String(p.memo || '')];
  if (i >= 0) sh.getRange(i + 2, 1, 1, 6).setValues([row]);
  else sh.appendRow(row);
  return { ok: true };
}

function watchDel_(p) {
  const code = normCode_(p.code); const sh = watchSheet_(); const last = sh.getLastRow();
  if (last < 2) return { ok: false, error: 'not_found' };
  const codes = sh.getRange(2, 2, last - 1, 1).getValues().map((r) => normCode_(r[0]));
  const i = codes.indexOf(code);
  if (i < 0) return { ok: false, error: 'not_found', message: '목록에 없는 코드입니다.' };
  sh.deleteRow(i + 2);
  return { ok: true };
}

function watchToggle_(p) {
  const code = normCode_(p.code); const sh = watchSheet_(); const last = sh.getLastRow();
  if (last < 2) return { ok: false, error: 'not_found' };
  const codes = sh.getRange(2, 2, last - 1, 1).getValues().map((r) => normCode_(r[0]));
  const i = codes.indexOf(code);
  if (i < 0) return { ok: false, error: 'not_found' };
  const c = sh.getRange(i + 2, 4); const cur = String(c.getValue() || 'Y').toUpperCase();
  c.setValue(cur === 'N' ? 'Y' : 'N');
  return { ok: true, include: cur === 'N' ? 'Y' : 'N' };
}
