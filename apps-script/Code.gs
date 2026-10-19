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
  kosdaq: ['^KQ11', 'max', '1mo'],
  dow: ['^DJI', 'max', '1mo'],
  sox: ['^SOX', 'max', '1mo'],
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
    if (action === 'hold_save') return json_(holdSave_(p));
    if (action === 'hold_del') return json_(holdDel_(p));
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
  // range=max 는 지수에 따라 분기 단위로 내려오는 경우가 있어, 2000-01-01부터 지금까지를 월 단위로 명시해서 받는다
  const p1 = Math.floor(Date.UTC(2000, 0, 1) / 1000), p2 = Math.floor(Date.now() / 1000) + 86400;
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?period1=' + p1 + '&period2=' + p2 + '&interval=' + interval;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (res.getResponseCode() !== 200) throw new Error(sym + ' HTTP ' + res.getResponseCode());
  const r = JSON.parse(res.getContentText()).chart.result[0];
  const ts = r.timestamp || []; const c = (r.indicators.quote[0] || {}).close || [];
  return ts.map((t, i) => ({ Date: new Date(t * 1000).toISOString(), Close: c[i] == null ? null : Math.round(c[i] * 10000) / 10000 }))
    .filter((x) => x.Close != null && x.Close > 0);
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

// ---------- 보유종목 편집 ----------
// 입력 칸만 건드린다: A 소유자, B 계좌, C 종목명, D 코드, E 통화, F 수량, G 평균단가, I 수동 현재가, S 자산 분류.
// H(현재가)·J~R(계산)은 시트 수식이 그대로 계산한다.
const HOLD_FIRST = 6, HOLD_LAST = 65;
function holdSheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('보유종목'); }
function holdRead_(sh) {
  const n = HOLD_LAST - HOLD_FIRST + 1;
  const ag = sh.getRange(HOLD_FIRST, 1, n, 7).getValues();
  const i = sh.getRange(HOLD_FIRST, 9, n, 1).getValues();
  const s = sh.getRange(HOLD_FIRST, 19, n, 1).getValues();
  return ag.map((r, k) => r.concat([i[k][0], s[k][0]]));
}
function holdWrite_(sh, rows) {
  const n = HOLD_LAST - HOLD_FIRST + 1;
  const pad = rows.concat(Array.from({ length: n - rows.length }, () => ['', '', '', '', '', '', '', '', '']))
    .map((r) => { const c = String(r[3] == null ? '' : r[3]); const q = r.slice(); q[3] = c === '' || c[0] === "'" ? c : "'" + c; return q; }); // 코드 앞 0 보존
  sh.getRange(HOLD_FIRST, 1, n, 7).setValues(pad.map((r) => r.slice(0, 7)));
  sh.getRange(HOLD_FIRST, 9, n, 1).setValues(pad.map((r) => [r[7]]));
  sh.getRange(HOLD_FIRST, 19, n, 1).setValues(pad.map((r) => [r[8]]));
}
function numOrBlank_(v) {
  const t = String(v == null ? '' : v).replace(/[,\s]/g, '');
  if (t === '') return '';
  const x = Number(t); if (isNaN(x)) throw new Error('숫자가 아닙니다: ' + v);
  return x;
}
function holdSave_(p) {
  const name = String(p.name || '').trim(); const code = normCode_(p.code);
  if (!p.owner || !p.account || !name || !code) return { ok: false, error: 'invalid', message: '소유자·계좌·종목명·코드를 입력하세요.' };
  const qty = numOrBlank_(p.qty), avg = numOrBlank_(p.avg);
  if (qty === '' || avg === '') return { ok: false, error: 'invalid', message: '수량과 평균 매입단가를 입력하세요.' };
  const ccy = String(p.ccy || 'KRW').toUpperCase() === 'USD' ? 'USD' : 'KRW';
  const row = [p.owner, p.account, name, "'" + code, ccy, qty, avg, numOrBlank_(p.manual), String(p.cls || '').trim()];
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = holdSheet_(); const rows = holdRead_(sh);
    const used = rows.filter((r) => String(r[2]).trim() !== '');
    if (p.row) { // 기존 줄 수정: 그 줄이 여전히 같은 종목인지 확인
      const k = Number(p.row) - HOLD_FIRST; const cur = rows[k];
      if (!cur || normCode_(cur[3]) !== normCode_(p.orig_code || code) || String(cur[1]) !== String(p.orig_account || p.account)) {
        return { ok: false, error: 'conflict', message: '시트 내용이 바뀌었습니다. 새로고침 후 다시 시도하세요.' };
      }
      rows[k] = row;
      holdWrite_(sh, rows);
    } else {
      if (used.length >= rows.length) return { ok: false, error: 'full', message: '보유종목 칸(60줄)이 가득 찼습니다.' };
      const dup = rows.findIndex((r) => String(r[1]) === String(p.account) && normCode_(r[3]) === code);
      if (dup >= 0) return { ok: false, error: 'duplicate', message: '같은 계좌에 이미 있는 종목입니다. 목록에서 눌러 수정하세요.' };
      used.push(row);
      holdWrite_(sh, used);
    }
  } finally { lock.releaseLock(); }
  return { ok: true };
}
function holdDel_(p) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = holdSheet_(); const rows = holdRead_(sh);
    const k = Number(p.row) - HOLD_FIRST; const cur = rows[k];
    if (!cur || normCode_(cur[3]) !== normCode_(p.code) || String(cur[1]) !== String(p.account)) {
      return { ok: false, error: 'conflict', message: '시트 내용이 바뀌었습니다. 새로고침 후 다시 시도하세요.' };
    }
    rows.splice(k, 1); // 아래 줄을 한 칸씩 올려 빈 줄이 생기지 않게 함
    holdWrite_(sh, rows.filter((r) => String(r[2]).trim() !== ''));
  } finally { lock.releaseLock(); }
  return { ok: true };
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
