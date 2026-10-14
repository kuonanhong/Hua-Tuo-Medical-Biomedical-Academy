/* Accounts and progress. Server mode: Python backend with username + password + email + mobile,
   email/SMS verification codes and server-side progress. Static/file mode: browser-local learning
   profiles (the same four fields, no verification possible) with local progress and export/import. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = (window.HT_CONFIG.apiBase || '');
  let state = { user: null, aiAvailable: false, aiRoutes: [], authMode: window.HT.staticMode ? 'local' : 'server', billing: null };
  const PKEY = 'ht-profiles-v1', AKEY = 'ht-active-profile-v1', PROG = 'ht-progress-v1:';
  const t = k => window.HT.i18n.t(k);

  async function request(path, body, method) {
    const r = await fetch(api + path, { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({ error: 'Invalid server response' }));
    if (!r.ok) throw new Error(d.error || ('Request failed ' + r.status));
    return d;
  }
  // ---- local profiles
  const profiles = () => { try { const v = JSON.parse(localStorage.getItem(PKEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const saveProfiles = list => { try { localStorage.setItem(PKEY, JSON.stringify(list.slice(0, 50))); } catch (e) { /* ignore */ } };
  function activeLocal() { const list = profiles(); const id = localStorage.getItem(AKEY); return list.find(p => p.id === id) || null; }

  async function init() {
    if (state.authMode === 'local') { state.user = activeLocal(); return state; }
    try {
      const r = await fetch(api + '/api/me', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 404 || r.status === 405 || !(r.headers.get('content-type') || '').includes('json')) throw new Error('no-api');
      const d = await r.json(); state.user = d.user; state.aiAvailable = !!d.aiAvailable; state.aiRoutes = d.aiRoutes || []; state.billing = d.billing || null;
    } catch (e) {
      // No backend at this origin (plain static host): fall back to browser-local profiles.
      state.authMode = 'local'; window.HT.staticMode = true; state.user = activeLocal();
    }
    return state;
  }
  const validate = {
    username: v => /^[A-Za-z0-9_.-]{4,32}$/.test(v),
    password: v => typeof v === 'string' && v.length >= 10 && /[A-Za-z]/.test(v) && /[0-9]/.test(v),
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
    phone: v => /^\+?[0-9]{8,15}$/.test(String(v).replace(/[\s-]/g, '')),
  };
  function fieldsMarkup(withPassword) {
    const zh = window.HT.i18n.isZh();
    return `<div class="form-grid">
      <label>${t('username')} *<input name="username" autocomplete="username" required placeholder="4–32 ${zh ? '字母數字' : 'letters/digits'}"></label>
      ${withPassword ? `<label>${t('password')} *<input name="password" type="password" autocomplete="new-password" required placeholder="≥10 ${zh ? '字元，含字母與數字' : 'chars, letters + digits'}"></label>` : ''}
      <label>${t('email')} *<input name="email" type="email" autocomplete="email" required placeholder="name@example.com"></label>
      <label>${t('phone')} *<input name="phone" type="tel" autocomplete="tel" required placeholder="+886912345678"></label>
    </div>`;
  }
  function open() {
    const app = window.HT.app, zh = window.HT.i18n.isZh();
    if (state.user) {
      const u = state.user;
      const ent = state.billing && state.billing.entitlement;
      app.dialog(t('profile'), `<div class="kv"><b>${t('username')}</b><span data-no-translate>${esc(u.username || u.name)}</span><b>${t('email')}</b><span data-no-translate>${esc(u.email || '')}${u.emailVerified ? ' ✓' : (state.authMode === 'server' ? ' (unverified)' : '')}</span><b>${t('phone')}</b><span data-no-translate>${esc(u.phone || '')}${u.phoneVerified ? ' ✓' : ''}</span><b>${t('plans')}</b><span>${ent ? `${t('active')} · ${t('expires')} ${new Date(ent.expiresAt * 1000).toLocaleDateString()}` : (zh ? '尚未啟用通行證（每門課第一節免費）' : 'No active pass (first section of every course is free)')}</span></div>
        <p class="form-note" style="margin-top:12px">${state.authMode === 'local' ? (zh ? '這是儲存在此瀏覽器的本機學習檔案，不會寄送驗證信；更換裝置前請在「我的進度」匯出 JSON。' : 'This is a browser-local learning profile without verification; export your progress JSON before changing devices.') : (zh ? '帳號與進度儲存於伺服器，可跨裝置登入。' : 'Account and progress are stored on the server and available on any device.')}</p>
        <div class="dialog-actions"><a class="button primary" href="#membership">${t('plans')}</a><button class="button light" id="signOutBtn">${t('signOut')}</button>${state.authMode === 'local' ? `<button class="button light" id="switchBtn">${zh ? '切換／新增檔案' : 'Switch / add profile'}</button>` : ''}</div>`);
      document.getElementById('signOutBtn').onclick = async () => { await signOut(); app.closeDialog(); };
      const sw = document.getElementById('switchBtn'); if (sw) sw.onclick = () => { state.user = null; open(); };
      return;
    }
    const localList = state.authMode === 'local' ? profiles() : [];
    app.dialog(t('signIn') + ' / ' + t('register'), `
      ${localList.length ? `<fieldset><legend>${zh ? '此裝置的學習檔案' : 'Profiles on this device'}</legend><div class="row">${localList.map(p => `<button class="chip" data-switch="${esc(p.id)}" data-no-translate>${esc(p.username)}</button>`).join('')}</div></fieldset>` : ''}
      <fieldset><legend>${t('signIn')}</legend><form id="loginForm"><div class="form-grid"><label>${t('username')} / ${t('email')}<input name="login" required autocomplete="username"></label><label>${t('password')}<input name="password" type="password" required autocomplete="current-password"></label></div><p class="form-error" id="loginError"></p><button class="button primary" type="submit">${t('signIn')}</button></form></fieldset>
      <fieldset><legend>${t('register')}</legend><form id="registerForm">${fieldsMarkup(true)}<p class="form-note">${zh ? '註冊需四項：帳號、密碼、信箱、手機。伺服器模式會寄送信箱與簡訊驗證碼；靜態／離線模式僅建立本機檔案。' : 'Four fields are required: username, password, email, mobile. Server mode sends email and SMS codes; static/offline mode only creates a local profile.'}</p><p class="form-error" id="registerError"></p><button class="button primary" type="submit">${t('register')}</button></form></fieldset>`);
    const body = document.getElementById('dialogBody');
    body.querySelectorAll('[data-switch]').forEach(b => b.onclick = () => { localStorage.setItem(AKEY, b.dataset.switch); state.user = activeLocal(); app.closeDialog(); app.onAuthChange(); });
    document.getElementById('loginForm').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target); const err = document.getElementById('loginError'); err.textContent = '';
      try {
        if (state.authMode === 'local') {
          const p = profiles().find(x => x.username === f.get('login') || x.email === f.get('login'));
          if (!p || p.pw !== hash(String(f.get('password')))) throw new Error(zh ? '帳號或密碼錯誤。' : 'Wrong username or password.');
          localStorage.setItem(AKEY, p.id); state.user = p;
        } else {
          const d = await request('/api/login', { login: f.get('login'), password: f.get('password') }); state.user = d.user; state.aiAvailable = !!d.aiAvailable; state.aiRoutes = d.aiRoutes || []; state.billing = d.billing || null;
        }
        app.closeDialog(); app.onAuthChange();
      } catch (ex) { err.textContent = ex.message; }
    };
    document.getElementById('registerForm').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target); const err = document.getElementById('registerError'); err.textContent = '';
      const v = { username: String(f.get('username') || '').trim(), password: String(f.get('password') || ''), email: String(f.get('email') || '').trim().toLowerCase(), phone: String(f.get('phone') || '').replace(/[\s-]/g, '') };
      for (const k of ['username', 'password', 'email', 'phone']) if (!validate[k](v[k])) { err.textContent = (zh ? '格式不正確：' : 'Invalid: ') + t(k); return; }
      try {
        if (state.authMode === 'local') {
          const list = profiles(); if (list.some(p => p.username === v.username)) throw new Error(zh ? '此帳號已存在。' : 'Username already exists.');
          const p = { id: 'local-' + Math.random().toString(36).slice(2, 12), username: v.username, email: v.email, phone: v.phone, pw: hash(v.password), createdAt: Date.now() };
          list.push(p); saveProfiles(list); localStorage.setItem(AKEY, p.id); state.user = p; app.closeDialog(); app.onAuthChange(); app.toast(zh ? '已建立本機學習檔案。' : 'Local profile created.');
        } else {
          const d = await request('/api/register', v);
          verifyDialog(d, v);
        }
      } catch (ex) { err.textContent = ex.message; }
    };
  }
  function verifyDialog(d, v) {
    const app = window.HT.app, zh = window.HT.i18n.isZh();
    app.dialog(t('verify'), `<p>${zh ? '我們已寄送驗證碼到您的信箱與手機。請輸入兩組驗證碼完成註冊。' : 'We sent verification codes to your email and mobile. Enter both codes to finish registration.'}</p>${d.devCodes ? `<p class="notice warn">DEV: email ${esc(d.devCodes.email)} · sms ${esc(d.devCodes.sms)}</p>` : ''}<form id="verifyForm"><div class="form-grid"><label>${t('email')} ${t('code')}<input name="emailCode" required inputmode="numeric" autocomplete="one-time-code"></label><label>${t('phone')} ${t('code')}<input name="smsCode" required inputmode="numeric"></label></div><p class="form-error" id="verifyError"></p><button class="button primary" type="submit">${t('verify')}</button></form>`);
    document.getElementById('verifyForm').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target); const err = document.getElementById('verifyError');
      try { const r = await request('/api/verify', { pendingId: d.pendingId, emailCode: f.get('emailCode'), smsCode: f.get('smsCode') }); state.user = r.user; state.aiAvailable = !!r.aiAvailable; state.aiRoutes = r.aiRoutes || []; state.billing = r.billing || null; app.closeDialog(); app.onAuthChange(); app.toast(zh ? '註冊完成，已登入。' : 'Registered and signed in.'); }
      catch (ex) { err.textContent = ex.message; }
    };
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return 'h' + (h >>> 0).toString(16) + s.length; }
  async function signOut() { if (state.authMode === 'server') { try { await request('/api/logout', {}); } catch (e) { /* ignore */ } } else { localStorage.removeItem(AKEY); } state.user = null; state.billing = null; window.HT.app.onAuthChange(); }

  // ---- progress
  const progressKey = () => PROG + (state.user ? state.user.id : 'guest');
  function readLocal() { try { return JSON.parse(localStorage.getItem(progressKey()) || '{}') || {}; } catch (e) { return {}; } }
  function writeLocal(p) { try { localStorage.setItem(progressKey(), JSON.stringify(p)); } catch (e) { /* ignore */ } }
  const progress = {
    all() { return readLocal(); },
    get(courseId) { return readLocal()[courseId] || { completed: [], updatedAt: 0, notes: '' }; },
    async markDone(courseId, stepId, done) {
      const p = readLocal(); const c = p[courseId] || { completed: [], updatedAt: 0, notes: '' };
      const set = new Set(c.completed); done === false ? set.delete(stepId) : set.add(stepId);
      c.completed = [...set]; c.updatedAt = Date.now(); p[courseId] = c; writeLocal(p);
      if (state.authMode === 'server' && state.user) { try { await request('/api/progress', { courseId, completed: c.completed, notes: c.notes || '' }, 'PUT'); } catch (e) { /* offline: keep local */ } }
      return c;
    },
    async sync() {
      if (state.authMode !== 'server' || !state.user) return;
      try { const d = await request('/api/progress'); const p = readLocal(); for (const [id, c] of Object.entries(d.courses || {})) { if (!p[id] || (c.updatedAt || 0) >= (p[id].updatedAt || 0)) p[id] = c; } writeLocal(p); } catch (e) { /* ignore */ }
    },
    exportJson() { return JSON.stringify({ format: 'huatuo-progress', version: 1, user: state.user ? state.user.username : 'guest', courses: readLocal() }, null, 2); },
    importJson(text) { const d = JSON.parse(text); if (d.format !== 'huatuo-progress') throw new Error('format'); const p = readLocal(); for (const [id, c] of Object.entries(d.courses || {})) if (!p[id] || (c.updatedAt || 0) > (p[id].updatedAt || 0)) p[id] = c; writeLocal(p); },
  };
  window.HT = window.HT || {};
  window.HT.account = { init, open, signOut, request, user: () => state.user, aiAvailable: () => state.aiAvailable, aiRoutes: () => state.aiRoutes, billing: () => state.billing, setBilling: b => { state.billing = b; }, mode: () => state.authMode, validate, progress };
})(window);
