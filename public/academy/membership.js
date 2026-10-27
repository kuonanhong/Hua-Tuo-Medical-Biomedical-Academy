/* Membership and payment UI. Prices are defined in TWD (NT$299 / 30 days, NT$2,490 / 365 days) and
   converted to the learner's currency with live or bundled exchange rates. Card payments go through
   the operator's configured gateway (Stripe Checkout or ECPay) on the server; the browser never
   handles card numbers. Post-office / ATM transfers are claimed here and confirmed by the operator. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = k => window.HT.i18n.t(k);
  const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'HUF', 'TWD', 'ISK', 'UGX', 'KHR', 'LAK', 'MMK', 'MNT', 'COP', 'PKR', 'KZT', 'LKR', 'NPR', 'BDT', 'TZS', 'KES', 'NGN', 'RSD', 'UZS', 'ARS', 'PHP', 'THB', 'INR', 'RUB', 'UAH', 'EGP', 'AMD', 'CZK']);
  const REGION_CURRENCY = { TW: 'TWD', CN: 'CNY', HK: 'HKD', MO: 'MOP', JP: 'JPY', KR: 'KRW', SG: 'SGD', MY: 'MYR', TH: 'THB', VN: 'VND', ID: 'IDR', PH: 'PHP', IN: 'INR', AU: 'AUD', NZ: 'NZD', US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', GB: 'GBP', IE: 'EUR', FR: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', TR: 'TRY', RU: 'RUB', UA: 'UAH', AE: 'AED', SA: 'SAR', QA: 'QAR', IL: 'ILS', EG: 'EGP', ZA: 'ZAR', NG: 'NGN', KE: 'KES', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', KZ: 'KZT', MN: 'MNT', KH: 'KHR', LA: 'LAK', MM: 'MMK', BG: 'BGN', RS: 'RSD', IS: 'ISK', GE: 'GEL', AM: 'AMD', AZ: 'AZN', UZ: 'UZS', MA: 'MAD', TN: 'TND', GH: 'GHS', ET: 'ETB', TZ: 'TZS', UG: 'UGX', IR: 'USD' };
  let rates = Object.assign({}, (window.HT_CONFIG.pricing || {}).rates || { TWD: 1 }), ratesDate = (window.HT_CONFIG.pricing || {}).ratesUpdated || '';
  let config = { mode: 'disabled', checkoutAvailable: false, methods: [], plans: [{ id: 'pass-30', days: 30, amountTwd: (window.HT_CONFIG.pricing || {}).monthlyTwd || 299 }, { id: 'pass-365', days: 365, amountTwd: (window.HT_CONFIG.pricing || {}).yearlyTwd || 2490 }], transfer: window.HT_CONFIG.transfer || {} };

  function autoCurrency() {
    const region = window.HT.i18n.regionOf(window.HT.i18n.current);
    const c = REGION_CURRENCY[region] || 'USD';
    return rates[c] ? c : 'USD';
  }
  function currency() { const p = window.HT.prefs.current.currency; return p && p !== 'auto' && rates[p] ? p : autoCurrency(); }
  function convert(twd, cur) {
    const r = rates[cur] || 1; let v = twd * r;
    if (ZERO_DECIMAL.has(cur)) { const mag = v >= 100000 ? 1000 : v >= 10000 ? 100 : v >= 1000 ? 10 : 1; v = Math.ceil(v / mag) * mag; return Math.round(v); }
    if (v >= 100) return Math.ceil(v);
    if (v >= 10) return Math.ceil(v * 2) / 2 - 0.01 > 0 ? Math.round((Math.ceil(v * 2) / 2 - 0.01) * 100) / 100 : v;
    return Math.round((Math.ceil(v * 2) / 2 - 0.01) * 100) / 100;
  }
  function format(amount, cur) {
    try { return new Intl.NumberFormat(window.HT.i18n.current, { style: 'currency', currency: cur, maximumFractionDigits: ZERO_DECIMAL.has(cur) ? 0 : 2 }).format(amount); }
    catch (e) { return cur + ' ' + amount; }
  }
  async function load() {
    if (window.HT.staticMode) return config;
    try {
      const d = await window.HT.account.request('/api/billing/config');
      config = Object.assign(config, d);
      if (d.rates && d.rates.TWD) { rates = d.rates; ratesDate = d.ratesUpdated || ratesDate; }
    } catch (e) { /* static or offline */ }
    return config;
  }
  function entitlement() { const b = window.HT.account.billing(); if (b?.entitlement?.scope === 'imported-owner-content') return window.HT.ownerVault?.hasAccess() ? b.entitlement : null; return b && b.entitlement && (b.entitlement.permanent || b.entitlement.expiresAt * 1000 > Date.now()) ? b.entitlement : null; }
  function hasAccess(course, stageIndex) { if (stageIndex === 0 || (course && course.stages && course.stages[stageIndex] && course.stages[stageIndex].free === true)) return true; if (window.HT.staticMode) return !!window.HT.ownerVault?.hasAccess() && (!course || window.HT.ownerVault.hasCourse(course.id)); return !!entitlement(); }

  function directoryMarkup(members) {
    const zh = window.HT.i18n.isZh();
    return `<p class="form-note">${zh ? '僅站長登入後可讀取。清單只列帳號、信箱、手機號碼，不含密碼。第一筆為站長。' : 'Visible only to the signed-in site owner. The directory contains username, email and mobile only. The owner is listed first.'}</p><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>${t('username')}</th><th>${t('email')}</th><th>${t('phone')}</th></tr></thead><tbody>${members.map(m => `<tr><td data-no-translate>${esc(m.username)}</td><td data-no-translate>${esc(m.email)}</td><td data-no-translate>${esc(m.phone)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  async function showDirectory() {
    const app = window.HT.app, zh = window.HT.i18n.isZh(), user = window.HT.account.user();
    if (!user || user.role !== 'root' || window.HT.staticMode) return;
    try { const data = await window.HT.account.request('/api/admin/members'); app.dialog(zh ? '私人會員清單' : 'Private member directory', directoryMarkup(data.members || [])); }
    catch (error) { app.toast(error.message); }
  }

  function pageMarkup() {
    const zh = window.HT.i18n.isZh(), cur = currency(), ent = entitlement(), user = window.HT.account.user();
    if (ent?.permanent) return `<div class="section-head"><div><span class="eyebrow">${t('plans')}</span><h1>${zh ? '站長永久免付費權限' : 'Permanent no-payment owner access'}</h1></div></div><div class="notice"><strong>${zh ? '已開放全部課程與完整程序' : 'All courses and full procedures are available'}</strong><p>${user?.role === 'owner-local' ? (zh ? '目前閱讀您匯入此裝置的私人教材。加密教材包保留在此瀏覽器，解密內容僅留在記憶體；重新開頁後再次登入即可。' : 'You are reading the private curriculum imported into this device. Only the encrypted pack is saved; decrypted content stays in memory. Sign in again after reopening.') : (zh ? '伺服器已確認您的站長身分，權限沒有到期日，不需要購買通行證。' : 'The server has verified the owner account. Access does not expire and no pass purchase is needed.')}</p></div><div class="row"><a class="button primary" href="#catalog">${t('navCatalog')}</a><a class="button" href="#procedures">${t('departmentLibrary')}</a><button class="button" id="ownerProfileBtn">${t('profile')}</button></div>${user?.role === 'root' ? `<div class="card"><h2>${zh ? '會員管理' : 'Member administration'}</h2><button class="button" id="privateMembersBtn">${zh ? '讀取私人會員清單' : 'Open private member directory'}</button></div>` : ''}`;
    const plans = config.plans.map((p, i) => { const amt = convert(p.amountTwd, cur); const per = p.days >= 365 ? t('yearly') : t('monthly'); return `<div class="card plan ${i === 1 ? 'best' : ''}">${i === 1 ? `<span class="best-tag">${zh ? '最划算' : 'Best value'}</span>` : ''}<span class="eyebrow">${per} · ${p.days} ${zh ? '天' : 'days'}</span><div class="price">${format(amt, cur)}<small> / ${p.days >= 365 ? (zh ? '年' : 'yr') : (zh ? '月' : 'mo')}</small></div><p class="subtext">≈ NT$${p.amountTwd.toLocaleString()} · ${zh ? '一次付款，不自動續扣' : 'one-time payment, no auto-renewal'}</p><ul class="small" style="padding-left:18px;color:var(--muted)"><li>${zh ? '全部 2,400+ 門課程所有章節' : 'All sections of all 2,400+ courses'}</li><li>${zh ? '實習級虛擬病人與模擬器' : 'Internship-tier virtual patients and simulators'}</li><li>${zh ? 'AI 師傅問答（伺服器已設定時）' : 'AI mentor Q&A (when configured on the server)'}</li><li>${zh ? '完成證書申請' : 'Completion certificates'}</li></ul><button class="button primary" data-plan="${p.id}" ${!user ? 'data-need-login="1"' : ''}>${t('pay')}</button></div>`; }).join('');
    const tr = config.transfer || {};
    return `<div class="section-head"><div><span class="eyebrow">${t('plans')}</span><h1>${zh ? '每門課第一節免費，其餘章節由學習通行證解鎖' : 'The first section of every course is free; a learning pass unlocks the rest'}</h1><p class="subtext">${zh ? `價格以新台幣定價（NT$${config.plans[0].amountTwd}／30 天、NT$${config.plans[1].amountTwd}／365 天），依您的語系自動換算為 ${cur}（匯率更新：${ratesDate}）。可在右上角切換幣別。` : `Prices are set in TWD (NT$${config.plans[0].amountTwd} / 30 days, NT$${config.plans[1].amountTwd} / 365 days) and converted to ${cur} for your locale (rates updated ${ratesDate}). Change the currency at the top right.`}</p></div></div>
      ${ent ? `<div class="notice">${ent.permanent ? (zh ? '站長永久權限 · 全部會員課程永久開放，無須付款' : 'Site owner · permanent access to every member course, with no payment required') : `${t('active')} · ${t('expires')} ${new Date(ent.expiresAt * 1000).toLocaleDateString()}`}</div>` : ''}
      ${user && user.role === 'root' ? `<div class="card"><h2>${zh ? '會員管理' : 'Member administration'}</h2><p>${zh ? '私人會員清單僅在您登入後，透過伺服器驗證站長身分才能讀取。' : 'The server verifies your site-owner session before returning the private member directory.'}</p><button class="button primary" id="privateMembersBtn">${zh ? '讀取私人會員清單' : 'Open private member directory'}</button></div>` : ''}
      ${!user ? `<div class="notice warn">${zh ? '請先登入或註冊（帳號、密碼、信箱、手機四項）再付款。' : 'Sign in or register (username, password, email, mobile) before paying.'}</div>` : ''}
      ${window.HT.staticMode ? `<div class="notice warn">${zh ? '目前為靜態／離線版：顯示價格與轉帳資訊，但無法線上刷卡。正式收費需部署 portable/server.py 並設定金流（見 docs/COMMERCE_ZH.md）。' : 'Static/offline edition: prices and transfer details are shown, but card checkout needs the deployed Python server with a configured gateway (see docs/COMMERCE_ZH.md).'}</div>` : (!config.checkoutAvailable ? `<div class="notice warn">${esc(config.reason || (zh ? '站長尚未啟用線上刷卡；可使用轉帳。' : 'Card checkout is not enabled by the operator; transfer is available.'))}</div>` : '')}
      <div class="grid cols-2">${plans}</div>
      <h2 style="margin-top:28px">${zh ? '付款方式' : 'Payment methods'}</h2>
      <div class="pay-methods">
        <div class="pay-method ${config.methods.includes('stripe') ? '' : 'muted'}"><b>💳 ${t('payCard')} · Stripe</b><p class="small">${zh ? 'Visa／Mastercard／JCB／AMEX，含 3-D Secure 驗證；卡號只在 Stripe 付款頁輸入。' : 'Visa/Mastercard/JCB/AMEX with 3-D Secure; card numbers are entered only on Stripe’s hosted page.'}</p></div>
        <div class="pay-method ${config.methods.includes('ecpay') ? '' : 'muted'}"><b>💳 ${t('payCard')} · 綠界 ECPay</b><p class="small">${zh ? '台灣信用卡與行動支付；卡號只在綠界收銀台輸入。' : 'Taiwan cards and mobile payments via ECPay’s hosted cashier.'}</p></div>
        ${config.transferAvailable ? `<div class="pay-method"><b>🏧 ${t('payTransfer')}</b><p class="small">${zh ? '轉帳至站長確認的帳戶後填寫轉帳資料，站長核對後開通。' : 'Transfer to the operator’s confirmed account, then submit the transfer details for confirmation.'}</p><div class="kv small" data-no-translate><b>${zh ? '銀行' : 'Bank'}</b><span>${esc(tr.bankName || '')}（${esc(tr.bankCode || '')}）</span><b>${zh ? '局號' : 'Branch no.'}</b><span>${esc(tr.branchNo || '')}</span><b>${zh ? '帳號' : 'Account no.'}</b><span>${esc(tr.accountNo || '')}</span><b>${zh ? '戶名' : 'Account holder'}</b><span>${esc(tr.accountName || '')}</span></div></div>` : `<div class="pay-method muted"><b>🏧 ${t('payTransfer')}</b><p>${zh ? '站長尚未設定已確認的收款帳戶，轉帳付款暫停。' : 'Transfer payments are paused until the operator configures a confirmed payout account.'}</p></div>`}
      </div>
      <p class="form-note" style="margin-top:14px">${zh ? '本站不儲存卡號。付款成功後由伺服器核對金流通知（Webhook 簽章 + 主動查單）才開通權限；收款結算至站長在金流商登記的郵局帳戶。退款與條款見' : 'Card numbers are never stored here. Access is granted only after the server verifies the gateway notification (signed webhook + order query); funds settle to the operator’s registered post-office account. Refunds and terms:'} <a href="terms.html" target="_blank" rel="noopener">terms.html</a>.</p>`;
  }
  function bind(root) {
    const ownerProfile = root.querySelector('#ownerProfileBtn'); if (ownerProfile) ownerProfile.onclick = () => window.HT.account.open();
    root.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { if (b.dataset.needLogin) { window.HT.account.open(); return; } checkout(b.dataset.plan); });
    const directory = root.querySelector('#privateMembersBtn'); if (directory) directory.onclick = showDirectory;
  }
  function checkout(planId) {
    const app = window.HT.app, zh = window.HT.i18n.isZh(), cur = currency(), plan = config.plans.find(p => p.id === planId);
    if (!plan) return;
    if (window.HT.staticMode) { app.toast(zh ? '付費會員需要學院會員伺服器；靜態預覽不接受付款。請先啟動本機伺服器或開啟正式會員網址。' : 'Paid membership needs the academy server. This static preview does not accept payments. Start the local server or open the official member site.'); return; }
    const amt = convert(plan.amountTwd, cur);
    const methods = [...(config.methods || []), ...(config.transferAvailable ? ['transfer'] : [])];
    if (!methods.length) { app.toast(config.reason || (zh ? '收款設定尚未完成，目前無法付款。' : 'Payments are unavailable until setup is complete.')); return; }
    app.dialog(t('pay'), `<p><b>${plan.days} ${zh ? '天通行證' : 'day pass'}</b> · ${format(amt, cur)} (≈ NT$${plan.amountTwd})</p>
      <div class="pay-methods">${methods.map(m => `<button class="pay-method" data-method="${m}"><b>${m === 'stripe' ? '💳 Stripe' : m === 'ecpay' ? '💳 ECPay 綠界' : '🏧 ' + t('payTransfer')}</b></button>`).join('')}</div>
      <p class="form-note" style="margin-top:10px">${zh ? '選擇付款方式後將前往金流商頁面完成驗證；轉帳則顯示帳戶資料與回報表單。' : 'Card methods open the gateway’s verified checkout; transfer shows account details and a claim form.'}</p>
      <label style="margin-top:10px"><input type="checkbox" id="termsAccept" style="width:auto;margin-right:6px">${zh ? '我已閱讀並同意服務條款與退款政策' : 'I accept the terms of service and refund policy'}</label>`);
    document.querySelectorAll('[data-method]').forEach(b => b.onclick = async () => {
      if (!document.getElementById('termsAccept').checked) { app.toast(zh ? '請先同意條款。' : 'Please accept the terms first.'); return; }
      const method = b.dataset.method;
      if (window.HT.staticMode) { if (method === 'transfer') transferDialog({ orderId: 'OFFLINE', amount: plan.amountTwd, currency: 'TWD', amountLocal: amt, currencyLocal: cur }); else app.toast(zh ? '靜態版無法刷卡，請部署伺服器。' : 'Card checkout needs the deployed server.'); return; }
      try {
        const requestId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 40);
        const d = await window.HT.account.request('/api/billing/checkout', { planId, currency: cur, method, requestId, termsAccepted: true, termsVersion: config.termsVersion || 'v1' });
        if (d.url) { location.href = d.url; return; }
        if (d.action && d.fields) { const f = document.createElement('form'); f.method = 'POST'; f.action = d.action; for (const [k, v] of Object.entries(d.fields)) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i); } document.body.appendChild(f); f.submit(); return; }
        if (d.transfer) { transferDialog(d.transfer); return; }
        app.toast('Unexpected response');
      } catch (e) { app.toast(e.message); }
    });
  }
  function transferDialog(info) {
    const app = window.HT.app, zh = window.HT.i18n.isZh(), tr = config.transfer || {};
    app.dialog(t('payTransfer'), `<div class="kv" data-no-translate><b>${zh ? '銀行' : 'Bank'}</b><span>${esc(tr.bankName)}（${esc(tr.bankCode)}）</span><b>${zh ? '局號' : 'Branch'}</b><span>${esc(tr.branchNo)}</span><b>${zh ? '帳號' : 'Account'}</b><span>${esc(tr.accountNo)}</span><b>${zh ? '金額' : 'Amount'}</b><span>NT$${esc(info.amount)}${info.currencyLocal && info.currencyLocal !== 'TWD' ? ` (≈ ${format(info.amountLocal, info.currencyLocal)})` : ''}</span><b>${zh ? '訂單' : 'Order'}</b><span>${esc(info.orderId)}</span></div>
      <p class="form-note" style="margin-top:10px">${esc(tr.note || '')}</p>
      ${info.orderId === 'OFFLINE' ? '' : `<form id="claimForm"><div class="form-grid"><label>${zh ? '轉出帳號末五碼' : 'Last 5 digits of your account'}<input name="last5" required pattern="[0-9]{5}" inputmode="numeric"></label><label>${zh ? '轉帳時間' : 'Transfer time'}<input name="at" type="datetime-local" required></label></div><button class="button primary" type="submit">${t('submit')}</button><p class="form-error" id="claimError"></p></form>`}`);
    const f = document.getElementById('claimForm');
    if (f) f.onsubmit = async e => { e.preventDefault(); const fd = new FormData(f); try { await window.HT.account.request('/api/billing/transfer/claim', { orderId: info.orderId, last5: fd.get('last5'), transferredAt: fd.get('at') }); app.closeDialog(); app.toast(zh ? '已送出，站長核對後開通。' : 'Submitted; access opens after the operator confirms.'); } catch (ex) { document.getElementById('claimError').textContent = ex.message; } };
  }
  window.HT = window.HT || {};
  window.HT.membership = { load, config: () => config, currency, autoCurrency, convert, format, hasAccess, entitlement, pageMarkup, bind, checkout, showDirectory, rates: () => rates, currencies: () => Object.keys(rates) };
})(window);
