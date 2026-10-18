/* 앱 잠금: 처음 실행 때 숫자 비밀번호(PIN)를 정하고, 앱을 열 때와 잠시 다른 앱에 다녀왔을 때 잠금 화면을 띄운다.
 * PIN은 이 폰에만 소금(salt)을 친 SHA-256 해시로 저장한다(원래 숫자는 저장하지 않음). */
(function () {
  'use strict';
  const K = { hash: 'pf_pin_hash', salt: 'pf_pin_salt', fails: 'pf_pin_fails', until: 'pf_pin_until', relock: 'pf_pin_relock' };
  const st = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
  };
  const MIN = 4, MAX = 8;
  const RELOCK_OPTS = [[0, '바로'], [60, '1분 뒤'], [300, '5분 뒤'], [1800, '30분 뒤']];
  const relockSec = () => { const v = Number(st.get(K.relock)); return RELOCK_OPTS.some(([s]) => s === v) ? v : 60; };

  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  async function hashPin(pin, salt) {
    const data = new TextEncoder().encode(salt + ':' + pin);
    if (window.crypto && crypto.subtle) return hex(await crypto.subtle.digest('SHA-256', data));
    let h = 2166136261; for (const b of data) { h ^= b; h = Math.imul(h, 16777619) >>> 0; } return 'f' + h.toString(16); // 예비(보안 컨텍스트 아님)
  }
  function newSalt() {
    const a = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return hex(a);
  }
  const hasPin = () => !!st.get(K.hash);
  async function setPin(pin) { const s = newSalt(); st.set(K.salt, s); st.set(K.hash, await hashPin(pin, s)); st.del(K.fails); st.del(K.until); }
  async function checkPin(pin) { return (await hashPin(pin, st.get(K.salt) || '')) === st.get(K.hash); }

  // ---------- 화면 ----------
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  let screen = null;

  /** 숫자 키패드 화면. mode: 'unlock' | 'create' | 'change' */
  function pad(mode, onDone, onCancel) {
    if (screen) screen.remove();
    const root = h('div', 'lk'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    const box = h('div', 'lk-box');
    const icon = h('div', 'lk-icon', '🔒');
    const title = h('h2', 'lk-title'); const sub = h('p', 'lk-sub');
    const dots = h('div', 'lk-dots'); const msg = h('p', 'lk-msg');
    const keys = h('div', 'lk-keys');
    let pin = ''; let step = mode === 'change' ? 'old' : mode === 'create' ? 'new' : 'unlock'; let first = ''; let busy = false;

    const texts = {
      unlock: ['자산 포트폴리오', '비밀번호를 입력하세요'],
      old: ['비밀번호 변경', '지금 비밀번호를 입력하세요'],
      new: [mode === 'create' ? '비밀번호 만들기' : '새 비밀번호', `앱을 열 때 쓸 숫자 ${MIN}~${MAX}자리를 입력하고 확인을 누르세요`],
      again: ['한 번 더', '같은 비밀번호를 다시 입력하세요'],
    };
    function draw() {
      title.textContent = texts[step][0]; sub.textContent = texts[step][1];
      dots.replaceChildren(...Array.from({ length: Math.max(MIN, pin.length) }, (_, i) => h('i', i < pin.length ? 'on' : '')));
      const wait = lockWait(); ok.disabled = busy || pin.length < MIN || (step === 'unlock' && wait > 0);
      if (step === 'unlock' && wait > 0) msg.textContent = `잠시 후 다시 시도하세요 (${wait}초)`;
    }
    function lockWait() { const u = Number(st.get(K.until) || 0); return Math.max(0, Math.ceil((u - Date.now()) / 1000)); }
    const shake = () => { box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); };

    async function submit() {
      if (pin.length < MIN || busy) return;
      busy = true; draw();
      try {
        if (step === 'unlock' || step === 'old') {
          if (step === 'unlock' && lockWait() > 0) return;
          if (await checkPin(pin)) {
            st.del(K.fails); st.del(K.until);
            if (step === 'old') { step = 'new'; pin = ''; msg.textContent = ''; return; }
            close(); onDone && onDone(); return;
          }
          const f = Number(st.get(K.fails) || 0) + 1; st.set(K.fails, String(f));
          if (f >= 5) st.set(K.until, String(Date.now() + 30000 * Math.pow(2, Math.min(f - 5, 5)))); // 5회부터 30초, 이후 두 배씩
          msg.textContent = f >= 5 ? '비밀번호가 여러 번 틀렸습니다.' : `비밀번호가 맞지 않습니다 (${f}/5)`; pin = ''; shake();
        } else if (step === 'new') {
          first = pin; pin = ''; step = 'again'; msg.textContent = '';
        } else if (step === 'again') {
          if (pin !== first) { msg.textContent = '두 번 입력한 비밀번호가 다릅니다. 처음부터 다시 입력하세요.'; step = 'new'; pin = ''; first = ''; shake(); return; }
          await setPin(pin); close(); onDone && onDone();
        }
      } finally { busy = false; if (screen === root) draw(); }
    }
    const press = (d) => { if (busy) return; if (pin.length < MAX) pin += d; if (step === 'unlock' && pin.length === MAX) submit(); draw(); };
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) { const b = h('button', 'lk-k', d); b.type = 'button'; b.onclick = () => press(d); keys.append(b); }
    const del = h('button', 'lk-k lk-fn', '지움'); del.type = 'button'; del.setAttribute('aria-label', '한 자리 지우기'); del.onclick = () => { pin = pin.slice(0, -1); draw(); };
    const zero = h('button', 'lk-k', '0'); zero.type = 'button'; zero.onclick = () => press('0');
    const ok = h('button', 'lk-k lk-ok', '확인'); ok.type = 'button'; ok.onclick = submit;
    keys.append(del, zero, ok);
    box.append(icon, title, sub, dots, msg, keys);
    if (mode === 'unlock') {
      const forgot = h('button', 'lk-link', '비밀번호를 잊었어요'); forgot.type = 'button';
      forgot.onclick = () => {
        if (!forgot.dataset.ok) { forgot.dataset.ok = '1'; forgot.textContent = '초기화하면 이 폰의 API 주소·키·저장 데이터가 지워집니다. 한 번 더 누르면 초기화'; return; }
        ['pf_api_url', 'pf_api_key', 'pf_cache', K.hash, K.salt, K.fails, K.until].forEach(st.del);
        location.reload();
      };
      box.append(forgot);
    } else if (onCancel) {
      const c = h('button', 'lk-link', '취소'); c.type = 'button'; c.onclick = () => { close(); onCancel(); }; box.append(c);
    }
    root.append(box); document.body.append(root); screen = root;
    const close = () => { root.remove(); if (screen === root) screen = null; document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') { pin = pin.slice(0, -1); draw(); } else if (e.key === 'Enter') submit(); }
    document.addEventListener('keydown', onKey);
    const tick = setInterval(() => { if (screen !== root) clearInterval(tick); else if (lockWait() >= 0) draw(); }, 1000);
    draw();
  }

  // ---------- 흐름 ----------
  let unlocked = false; let hiddenAt = 0;
  function lockNow() { unlocked = false; return new Promise((res) => pad('unlock', () => { unlocked = true; res(); })); }
  /** 앱 시작: PIN이 없으면 만들고, 있으면 잠금 해제를 기다린다 */
  function start() {
    if (!hasPin()) return new Promise((res) => pad('create', () => { unlocked = true; res(); }));
    return lockNow();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (unlocked && hasPin() && hiddenAt && (Date.now() - hiddenAt) / 1000 >= relockSec()) lockNow();
  });

  /** 설정 화면에 넣을 항목 */
  function settingsItems() {
    const out = [];
    const chg = h('button', 'app-ghost', '비밀번호 변경'); chg.onclick = () => pad('change', () => alertLine(chg, '비밀번호를 바꿨습니다.'), () => {});
    const row = h('label', 'app-field'); row.append(h('span', null, '다른 앱에 다녀오면 잠그기'));
    const sel = h('select'); for (const [s, l] of RELOCK_OPTS) { const o = h('option', null, l); o.value = String(s); sel.append(o); }
    sel.value = String(relockSec()); sel.onchange = () => st.set(K.relock, sel.value);
    row.append(sel); out.push(chg, row);
    return out;
  }
  function alertLine(after, text) { const p = h('p', 'app-msg', text); after.after(p); setTimeout(() => p.remove(), 3000); }

  window.pfLock = { start, lockNow, hasPin, settingsItems, isUnlocked: () => unlocked };
})();
