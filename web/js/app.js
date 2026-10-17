/* 앱 껍데기: 설정(API 주소·키), 새로고침, 마지막 갱신 시각, 관심종목 편집 */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const api = window.pfApi;

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ---------- 상단 상태 줄 ----------
  const bar = h('div', 'app-bar');
  const st = h('span', 'app-status', '');
  const btnR = h('button', 'app-ic', '⟳'); btnR.title = '새로고침'; btnR.setAttribute('aria-label', '새로고침');
  const btnS = h('button', 'app-ic', '⚙'); btnS.title = '설정'; btnS.setAttribute('aria-label', '설정');
  bar.append(st, btnR, btnS);
  btnR.onclick = () => api.load(true);
  btnS.onclick = () => openSettings();

  function status(s) {
    btnR.classList.toggle('spin', !!s.loading);
    let t = '';
    if (s.loading) t = '불러오는 중…';
    else if (s.error && s.error.code === 'no_config') t = '설정에서 API 주소와 키를 입력하세요';
    else if (s.error) t = (s.source === 'cache' || s.updated ? '오프라인 · ' + fmtTime(s.updated) + ' 기준' : '불러오기 실패: ' + s.error.message);
    else if (s.updated) t = fmtTime(s.updated) + ' 갱신';
    st.textContent = t;
    st.classList.toggle('bad', !!s.error && !s.loading);
  }

  // ---------- 모달 ----------
  function modal(title) {
    const back = h('div', 'app-modal'); const box = h('div', 'app-sheet');
    const head = h('div', 'app-sheet-head'); const x = h('button', 'app-ic', '✕'); x.setAttribute('aria-label', '닫기');
    head.append(h('h2', null, title), x); box.append(head); back.append(box); document.body.append(back);
    const close = () => back.remove(); x.onclick = close; back.onclick = (e) => { if (e.target === back) close(); };
    return { box, close };
  }
  const field = (label, input) => { const l = h('label', 'app-field'); l.append(h('span', null, label), input); return l; };

  function openSettings(first) {
    const { box, close } = modal(first ? '처음 설정' : '설정');
    const c = api.cfg();
    const url = h('input'); url.type = 'url'; url.placeholder = 'https://script.google.com/macros/s/…/exec'; url.value = c.url;
    const key = h('input'); key.type = 'password'; key.placeholder = 'Apps Script setup 실행 로그의 API 키'; key.value = c.key; key.autocomplete = 'off';
    const msg = h('p', 'app-msg', first ? '구글 시트 Apps Script를 웹 앱으로 배포한 주소와 API 키를 넣으세요. 이 폰에만 저장됩니다.' : '');
    const save = h('button', 'app-primary', '연결 확인 후 저장');
    save.onclick = async () => {
      if (!url.value.trim() || !key.value.trim()) { msg.textContent = '두 칸을 모두 입력하세요.'; return; }
      const old = api.cfg(); api.setConfig(url.value, key.value);
      save.disabled = true; msg.textContent = '연결 확인 중…';
      try { await api.call({ action: 'ping' }); msg.textContent = '연결되었습니다.'; close(); api.load(true); }
      catch (e) { api.setConfig(old.url, old.key); msg.textContent = '연결 실패: ' + e.message; }
      finally { save.disabled = false; }
    };
    box.append(field('웹 앱 URL', url), field('API 키', key), msg, save);
    if (!first) {
      const mk = h('button', 'app-ghost', '시세 다시 받기(지수·환율)');
      mk.onclick = async () => { mk.disabled = true; try { await api.call({ action: 'market_refresh' }); await api.load(true); msg.textContent = '시세를 새로 받았습니다.'; } catch (e) { msg.textContent = e.message; } mk.disabled = false; };
      const clr = h('button', 'app-ghost', '저장된 데이터 지우기');
      clr.onclick = () => { api.clear(); msg.textContent = '이 폰에 저장된 캐시를 지웠습니다.'; };
      box.append(mk, clr, h('p', 'app-msg', '앱 버전 ' + (window.PF_BUILD || '')));
    }
  }

  // ---------- 관심종목 편집 ----------
  function openWatch() {
    const { box } = modal('리포트 대상 종목 관리');
    const list = h('div', 'app-wl'); const msg = h('p', 'app-msg');
    const render = () => {
      const d = window.dash.data('watchlist');
      list.replaceChildren();
      if (d.status !== 'ok') { list.append(h('p', 'app-msg', '목록을 불러오지 못했습니다.')); return; }
      if (!d.data.length) list.append(h('p', 'app-msg', '아직 종목이 없습니다.'));
      for (const x of d.data) {
        const row = h('div', 'app-wl-row' + (x.include === 'N' ? ' off' : ''));
        const name = h('div', 'nm'); name.append(h('b', null, x.name), h('small', null, `${x.code} · ${x.market} · ${x.kind}`));
        const tg = h('button', 'app-ghost sm', x.include === 'N' ? '포함' : '제외');
        const del = h('button', 'app-ghost sm danger', '삭제');
        tg.onclick = () => act({ action: 'watch_toggle', code: x.code }, tg);
        del.onclick = () => { if (del.dataset.ok) act({ action: 'watch_del', code: x.code }, del); else { del.dataset.ok = '1'; del.textContent = '정말 삭제'; } };
        row.append(name, tg, del); list.append(row);
      }
    };
    async function act(p, btn) {
      if (btn) btn.disabled = true; msg.textContent = '저장 중…';
      try { await api.call(p); await api.load(true); msg.textContent = '반영되었습니다.'; render(); }
      catch (e) { msg.textContent = '실패: ' + e.message; if (btn) btn.disabled = false; }
    }
    const nm = h('input'); nm.placeholder = '종목명 (예: 삼성전자)';
    const cd = h('input'); cd.placeholder = '코드 (예: 005930, AAPL)'; cd.autocapitalize = 'characters';
    const mk = h('select'); for (const v of ['KRX', 'US']) { const o = h('option', null, v === 'KRX' ? '한국' : '미국'); o.value = v; mk.append(o); }
    const kd = h('select'); for (const v of ['관심', '보유']) { const o = h('option', null, v); o.value = v; kd.append(o); }
    const memo = h('input'); memo.placeholder = '메모 (선택)';
    cd.oninput = () => { if (/^[A-Za-z]/.test(cd.value)) mk.value = 'US'; else if (/^\d/.test(cd.value)) mk.value = 'KRX'; };
    const add = h('button', 'app-primary', '추가');
    add.onclick = () => {
      if (!nm.value.trim() || !cd.value.trim()) { msg.textContent = '종목명과 코드를 입력하세요.'; return; }
      act({ action: 'watch_add', name: nm.value.trim(), code: cd.value.trim(), market: mk.value, kind: kd.value, memo: memo.value.trim() }, null)
        .then(() => { nm.value = ''; cd.value = ''; memo.value = ''; });
    };
    const form = h('div', 'app-form'); const r2 = h('div', 'app-row');
    r2.append(field('시장', mk), field('구분', kd));
    form.append(field('종목명', nm), field('코드', cd), r2, field('메모', memo), add);
    box.append(h('p', 'app-msg', '여기서 바꾸면 구글 시트 관심종목 탭에 바로 저장되고, 다음 데일리 리포트부터 반영됩니다.'), list, h('h3', null, '종목 추가'), form, msg);
    render();
  }

  function wireWatchLink() {
    const a = document.querySelector('#card-watch .pf-editlink');
    if (!a) return;
    const b = h('button', 'app-primary', '종목 추가·삭제');
    b.onclick = openWatch; a.replaceWith(b);
  }

  window.pfApp = { status, openSettings, openWatch };
  document.addEventListener('DOMContentLoaded', () => {
    document.body.prepend(bar);
    wireWatchLink();
    api.boot();
    if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('sw.js'); } catch (e) { /* noop */ } }
    if (!api.cfg().url || !api.cfg().key) openSettings(true);
  });
})();
