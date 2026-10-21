/* 자산 포트폴리오 앱 — claude.ai 대시보드용 페이지 코드를 그대로 돌리기 위한 `dash` 호환 계층.
 * 데이터는 구글 시트에 붙인 Apps Script 웹앱(API)에서 받아 온다. */
(function () {
  'use strict';
  const LOADERS = {}; const CALCS = {}; const DATA = {}; const ERR = {}; const CBS = [];
  const DEFAULT_PARAMS = { owners: ['본인', '이솔', '이서'], gran: '월', fx: 'krw', sim_basis: 'mix', sim_level: 'avg', rep_type: '전체', risk_other: 'Y' };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 공간 없음 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
  };
  let params = Object.assign({}, DEFAULT_PARAMS, safeJSON(store.get('pf_params')) || {});
  const state = { loading: false, updated: null, error: null, source: null };

  function safeJSON(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function fire() { for (const f of CBS) { try { f(); } catch (e) { console.error(e); } } }

  window.dash = {
    loader(id, o) { LOADERS[id] = o.fn; },
    calc(id, o) { CALCS[id] = o; },
    colors: ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#64748b'],
    data(id) {
      if (ERR[id]) return { status: 'error', data: [], message: ERR[id], refreshing: false, meta: [], columns: [] };
      if (id in DATA) return { status: 'ok', data: DATA[id], refreshing: state.loading, meta: [], columns: [] };
      return { status: 'loading', data: [], refreshing: false, meta: [], columns: [] };
    },
    onData(fn) { CBS.push(fn); try { fn(); } catch (e) { console.error(e); } },
    params() { return params; },
    setParams(p) { params = Object.assign({}, params, p); store.set('pf_params', JSON.stringify(params)); fire(); },
    resetParams() { params = Object.assign({}, DEFAULT_PARAMS); store.set('pf_params', JSON.stringify(params)); fire(); },
    setLink(id) { try { history.replaceState(null, '', '#' + id); } catch (e) { /* noop */ } },
    refresh() { return window.pfApi.load(true); },
  };

  // ---------- API 응답 → 대시보드 데이터셋 ----------
  const SHEET_IDS = ['holdings', 'balances', 'reports', 'watchlist', 'acct_meta', 'other_assets'];
  const MARKET_IDS = ['kospi', 'kosdaq', 'sp500', 'nasdaq', 'dow', 'sox', 'usdkrw', 'usdvnd'];
  const num = (x) => { const t = String(x == null ? '' : x).replace(/[,\s₩$%]/g, ''); return t === '' || isNaN(Number(t)) ? null : Number(t); };

  let RAW = {}; let RAW_SRC = {};
  function ingest(api) {
    RAW = api.sheets || {}; RAW_SRC = api.market_src || {};
    for (const k of Object.keys(DATA)) delete DATA[k];
    for (const k of Object.keys(ERR)) delete ERR[k];
    const S = api.sheets || {}; const M = api.market || {};
    const run = (id, answer) => {
      try { DATA[id] = LOADERS[id] ? LOADERS[id]({ answer, args: {}, read: {} }) : answer; } catch (e) { ERR[id] = String(e.message || e); }
    };
    for (const id of SHEET_IDS) run(id, { values: S[id] || [] });
    for (const id of MARKET_IDS) {
      if (M[id] && M[id].length) run(id, { result: JSON.stringify(M[id]) });
      else ERR[id] = '시세를 받지 못했습니다';
    }
    // 종목별 최근 시세는 시트 현재가로 대신(빈 배열)
    for (const c of Object.values(CALCS)) for (const i of c.inputs) if (/^px_/.test(i) && !(i in DATA)) DATA[i] = [];
    // 계좌 정보·월별 흐름·배당
    const meta = (DATA.acct_meta || []);
    const mm = new Map(meta.map((m) => [m.account, m]));
    const bal = new Map((S.acct_meta || []).map((r) => [r[1], num(r[6])]));
    const flows = []; const agg = new Map();
    for (const r of (S.flows_raw || [])) {
      const m = mm.get(r[1]); if (!m || !r[0]) continue;
      const krw = num(r[3]) || 0; const date = String(r[0]).slice(0, 10);
      const key = [date.slice(0, 7), r[1], r[2]].join('|');
      const cur = agg.get(key);
      if (cur) { cur.krw += krw; cur.native += krw; continue; }
      const row = { month: date.slice(0, 7), owner: m.owner, account: r[1], group: m.group, ccy: m.ccy, kind: r[2], krw, native: krw };
      agg.set(key, row); flows.push(row);
    }
    flows.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
    DATA.flows = flows;
    DATA.dividends = (S.dividends_raw || []).filter((r) => r[0] && num(r[4]) != null).map((r) => ({
      date: String(r[0]).slice(0, 10), month: String(r[0]).slice(0, 7), owner: r[1], account: r[2], item: r[3], krw: num(r[4]),
    }));
    DATA.accounts = meta.map((m) => {
      const fl = flows.filter((f) => f.account === m.account);
      const sum = (k) => fl.filter((f) => !k || f.kind === k).reduce((s, f) => s + f.krw, 0);
      return { account: m.account, owner: m.owner, group: m.group, ccy: m.ccy, start: fl.length ? fl[0].month + '-01' : null,
        principal_krw: Math.round(sum('납입')), dividend_krw: Math.round(sum('배당')), interest_krw: Math.round(sum('이자')),
        balance_native: bal.get(m.account) != null ? bal.get(m.account) : Math.round(sum()) };
    });
    // 계산 순서대로 실행
    const done = new Set(Object.keys(DATA)); let progress = true;
    while (progress) {
      progress = false;
      for (const [id, c] of Object.entries(CALCS)) {
        if (done.has(id) || ERR[id]) continue;
        const bad = c.inputs.find((i) => ERR[i]);
        if (bad) { ERR[id] = bad + ' 데이터를 받지 못해 계산하지 못했습니다'; progress = true; continue; }
        if (c.inputs.every((i) => done.has(i))) {
          try { DATA[id] = c.fn(...c.inputs.map((i) => DATA[i])); } catch (e) { console.error(id, e); ERR[id] = String(e.message || e); }
          done.add(id); progress = true;
        }
      }
    }
  }

  // ---------- API ----------
  const cfg = () => ({ url: store.get('pf_api_url') || '', key: store.get('pf_api_key') || '' });
  async function call(params) {
    const { url, key } = cfg();
    if (!url || !key) throw Object.assign(new Error('API 주소와 키를 먼저 입력하세요.'), { code: 'no_config' });
    const q = new URLSearchParams(Object.assign({ key }, params)).toString();
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + q, { method: 'GET', redirect: 'follow', cache: 'no-store' });
    if (!res.ok) throw new Error('서버 응답 ' + res.status);
    const j = await res.json();
    if (!j.ok) throw Object.assign(new Error(j.message || j.error || '요청 실패'), { code: j.error });
    return j;
  }

  async function load(force) {
    if (state.loading) return;
    state.loading = true; state.error = null; window.pfApp && window.pfApp.status(state); fire();
    try {
      // 지수·환율은 GitHub에서 매일 받아 두는 공개 시세(data/market.json)를 우선 쓰고, 없거나 짧으면 Apps Script 시세를 씀
      const [j, pm] = await Promise.all([call({ action: 'all' }), fetch('data/market.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
      const src = {};
      if (pm && pm.market) {
        j.market = j.market || {};
        for (const [id, rows] of Object.entries(pm.market)) {
          if (Array.isArray(rows) && rows.length >= 24) { j.market[id] = rows; src[id] = 'github'; }
        }
        j.market_updated = pm.updated;
      }
      for (const id of MARKET_IDS) if (!src[id]) src[id] = j.market && j.market[id] ? 'apps-script' : 'none';
      j.market_src = src;
      ingest(j); state.updated = j.updated; state.source = 'live';
      try { store.set('pf_cache', JSON.stringify(j)); } catch (e) { /* noop */ }
    } catch (e) {
      state.error = e;
      const c = safeJSON(store.get('pf_cache'));
      if (c && !Object.keys(DATA).length) { ingest(c); state.updated = c.updated; state.source = 'cache'; }
    } finally {
      state.loading = false; window.pfApp && window.pfApp.status(state); fire();
    }
  }

  function boot() {
    const c = safeJSON(store.get('pf_cache'));
    if (c) { ingest(c); state.updated = c.updated; state.source = 'cache'; }
    fire(); window.pfApp && window.pfApp.status(state);
    if (cfg().url && cfg().key) load(false);
  }

  // 보유종목 편집용: 시트 줄 번호(6행부터)를 붙인 원본 행
  function holdRows() {
    return (RAW.holdings || []).map((r, i) => ({ row: 6 + i, owner: r[0] || '', account: r[1] || '', name: r[2] || '', code: String(r[3] || '').replace(/^'/, ''),
      ccy: r[4] || 'KRW', qty: num(r[5]), avg: num(r[6]), price: num(r[9]) != null ? num(r[9]) : num(r[7]), manual: num(r[8]), cls: String(r[18] || '').trim() }))
      .filter((x) => String(x.name).trim() !== '');
  }
  // 데이터 상태(설정 화면 진단용): 데이터셋별 줄 수·기간·오류
  function diag() {
    const out = [];
    const ids = [...new Set([...MARKET_IDS, 'holdings', 'balances', 'acct_meta', 'flows', 'dividends', 'accounts', 'idx', 'sim_base', 'sim_path'])];
    for (const id of ids) {
      if (ERR[id]) { out.push({ id, ok: false, text: ERR[id] }); continue; }
      const d = DATA[id]; if (!Array.isArray(d)) { out.push({ id, ok: false, text: '없음' }); continue; }
      const ms = d.map((r) => r.month || r.date).filter(Boolean).sort();
      let text = `${d.length}줄` + (ms.length ? ` · ${ms[0]}~${ms[ms.length - 1]}` : '') + (RAW_SRC[id] ? ` · ${RAW_SRC[id]}` : '');
      if (id === 'sim_base' && d[0]) text += ` · 수익률 ${d[0].ret && d[0].ret.months ? d[0].ret.months.length : '?'}개월 · 현재 ${Math.round(d[0].value / 1e4).toLocaleString()}만`;
      if (id === 'sim_path') { const bad = d.filter((r) => !isFinite(r.p50)).length; if (bad) text += ` · 계산 불가 ${bad}줄`; }
      out.push({ id, ok: true, text });
    }
    return out;
  }
  window.pfApi = { diag, holdRows, load, call, boot, cfg, store, state, ingest, setConfig(url, key) { store.set('pf_api_url', url.trim()); store.set('pf_api_key', key.trim()); }, clear() { store.del('pf_cache'); } };
})();
