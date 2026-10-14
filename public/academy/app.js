/* Application shell: router, home, catalogue, internship hub, progress, membership, sources,
   language/currency selectors, workspace, account, mentor and the rotating icon mosaic. */
(function (window) {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = k => window.HT.i18n.t(k);
  const zh = () => window.HT.i18n.isZh();
  const pk = (o, f) => window.HT.locale.pick(o, f);
  const CATALOG = window.HT_CATALOG, DEPTS = window.HT_DEPARTMENTS;
  const release = { topics: CATALOG.length, steps: CATALOG.reduce((a, c) => a + c.stepCount, 0), departments: DEPTS.departments.length, acupoints: CATALOG.filter(c => c.kind === 'acupoint').length };
  let toastTimer, mosaicTimer, pageCleanup = null;

  // ---------------------------------------------------------------- helpers
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200); }
  function dialog(title, html) { const d = $('#dialog'); $('#dialogTitle').textContent = title; $('#dialogBody').innerHTML = html; if (!d.open) d.showModal(); }
  function closeDialog() { const d = $('#dialog'); if (d.open) d.close(); }
  function courseCard(c, small) { return `<a class="course-card card ${small ? 'flat' : ''}" href="#course/${c.id}"><span class="ic">${window.HT.icons.render(c.icon, { size: 56, title: c.title })}</span><div style="min-width:0"><h3>${esc(pk(c, 'title'))}</h3><p class="en" data-no-translate>${esc(zh() ? c.titleEn : c.title)}</p><div class="meta"><span class="tag free">${t('free')}</span>${c.tiers.includes('intern') ? `<span class="tag intern">${t('tierIntern').split(' ·')[0]}</span>` : ''}${c.flagship ? `<span class="tag flagship">${t('flagship')}</span>` : ''}<span>${c.stepCount} ${t('step')}</span></div><p class="desc">${esc(pk(c, 'summary'))}</p></div></a>`; }
  function recordSim(kind, score) { try { const k = 'ht-sim-v1:' + (window.HT.account.user() ? window.HT.account.user().id : 'guest'); const d = JSON.parse(localStorage.getItem(k) || '{}'); (d[kind] = d[kind] || []).push({ score, at: Date.now() }); d[kind] = d[kind].slice(-50); localStorage.setItem(k, JSON.stringify(d)); } catch (e) { /* ignore */ } }
  function simStats() { try { return JSON.parse(localStorage.getItem('ht-sim-v1:' + (window.HT.account.user() ? window.HT.account.user().id : 'guest')) || '{}'); } catch (e) { return {}; } }

  // ---------------------------------------------------------------- icon mosaic
  function startMosaic() {
    const host = $('#iconMosaic'); if (!host) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cols = Math.ceil(window.innerWidth / 106), rows = Math.ceil(window.innerHeight / 106);
    const n = Math.min(cols * rows, 140);
    host.innerHTML = '';
    const cells = [];
    let cursor = Math.floor(Math.random() * CATALOG.length);
    for (let i = 0; i < n; i++) { const cell = document.createElement('div'); cell.className = 'cell'; host.appendChild(cell); cells.push(cell); }
    const fill = (cell, delay) => { const c = CATALOG[cursor++ % CATALOG.length]; setTimeout(() => { cell.innerHTML = window.HT.icons.render(c.icon, { size: 72, title: c.title }); cell.classList.add('show'); }, delay); };
    cells.forEach((cell, i) => fill(cell, i * 12));
    clearInterval(mosaicTimer);
    if (!reduced) mosaicTimer = setInterval(() => { const cell = cells[Math.floor(Math.random() * cells.length)]; cell.classList.remove('show'); setTimeout(() => fill(cell, 0), 900); }, 380);
  }

  // ---------------------------------------------------------------- pages
  function home(root) {
    const flagship = CATALOG.filter(c => c.flagship && c.kind !== 'prize' && c.kind !== 'acupoint').slice(0, 9);
    const F = DEPTS.faculties;
    root.innerHTML = `<section class="hero"><span class="eyebrow">HUA TUO · MEDICAL & BIOMEDICAL ACADEMY</span><h1 data-t="heroTitle">${t('heroTitle')}</h1><p class="lead" data-t="heroLead">${t('heroLead')}</p><div class="actions"><a class="button primary" href="#catalog?free=1">${t('startFree')}</a><a class="button" href="#catalog">${t('exploreAll')}</a><a class="button light" href="#intern">${t('navIntern')}</a></div></section>
      <div class="grid cols-4"><div class="card stat"><b>${release.topics.toLocaleString()}</b><span>${t('statTopics')}</span></div><div class="card stat"><b>${release.steps.toLocaleString()}</b><span>${t('statSteps')}</span></div><div class="card stat"><b>${release.departments}</b><span>${t('statDepartments')}</span></div><div class="card stat"><b>${release.acupoints}</b><span>${t('statAcupoints')}</span></div></div>
      <div class="section-head"><div><span class="eyebrow">${t('faculties')}</span><h2>${zh() ? '五大學部，一個方法：先看示範，再動手，最後驗收。' : 'Five faculties, one method: watch, do, verify.'}</h2></div></div>
      <div class="faculty-strip">${Object.entries(F).map(([id, f]) => { const n = CATALOG.filter(c => c.faculty === id).length; return `<a class="faculty" href="#catalog?faculty=${id}"><span class="ic">${window.HT.icons.glyphOnly(f.icon, f.accent, 42)}</span><span><b>${esc(zh() ? f.zh : f.en)}</b><small>${n} ${t('statTopics')}</small></span></a>`; }).join('')}</div>
      <div class="section-head"><div><span class="eyebrow">${t('flagship')}</span><h2>${t('featured')}</h2></div><a class="button light small" href="#catalog?flagship=1">${t('viewAll')} →</a></div>
      <div class="grid cols-3">${flagship.map(c => courseCard(c)).join('')}</div>
      <div class="section-head"><div><span class="eyebrow">${t('navIntern')}</span><h2>${zh() ? '實習級：真實情境、虛擬病人' : 'Internship tier: real scenarios, virtual patients'}</h2></div></div>
      <div class="grid cols-2"><a class="card dept-card" href="#intern?tab=tcm"><span class="ic">${window.HT.icons.glyphOnly('tongue', '#b5432f', 44)}</span><span><b>${t('tcmClinic')}</b><small>${zh() ? '望、聞、問、切 → 把脈 → 看舌苔 → 主訴 → 辨證 → 開方與針灸' : 'Inspect, listen, ask, palpate → pulse → tongue → chief complaint → pattern → prescription'}</small></span></a><a class="card dept-card" href="#intern?tab=western"><span class="ic">${window.HT.icons.glyphOnly('monitor', '#2f6f8f', 44)}</span><span><b>${t('westernClinic')}</b><small>${zh() ? '量血壓（Korotkoff 音）、測血糖、生命徵象、心電圖、檢驗判讀、SOAP' : 'Blood pressure with Korotkoff sounds, glucose, vital signs, ECG, labs, SOAP'}</small></span></a></div>
      <div class="notice" style="margin-top:20px">${t('disclaimer')} ${zh() ? '每門課第一節免費；其餘章節需學習通行證（台灣 NT$299／月起，其他地區依匯率換算）。' : 'The first section of every course is free; the remaining sections need a learning pass (from NT$299/month in Taiwan, converted elsewhere).'}</div>`;
  }
  function catalog(root, params) {
    const q = (params.get('q') || '').trim().toLowerCase();
    const faculty = params.get('faculty') || '', department = params.get('department') || '', kind = params.get('kind') || '', tier = params.get('tier') || '', flagship = params.get('flagship') === '1', free = params.get('free') === '1';
    const page = Math.max(1, Number(params.get('page') || 1)), per = 24;
    let list = CATALOG.filter(c => (!faculty || c.faculty === faculty) && (!department || c.department === department) && (!kind || c.kind === kind) && (!tier || c.tiers.includes(tier)) && (!flagship || c.flagship));
    if (free) list = list.filter(c => c.flagship || c.kind === 'skill' || c.kind === 'case').concat(list.filter(c => !(c.flagship || c.kind === 'skill' || c.kind === 'case')));
    if (q) list = list.map(c => { const hay = (c.title + ' ' + c.titleEn + ' ' + c.summary + ' ' + c.summaryEn + ' ' + c.id + ' ' + c.tags.join(' ')).toLowerCase(); let s = 0; q.split(/\s+/).forEach(w => { if (!w) return; if (c.title.toLowerCase().includes(w) || c.titleEn.toLowerCase().includes(w)) s += 10; if (hay.includes(w)) s += 1; }); return [s, c]; }).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    const total = list.length, pages = Math.max(1, Math.ceil(total / per)), slice = list.slice((page - 1) * per, page * per);
    const deps = DEPTS.departments.filter(d => !faculty || d.faculty === faculty);
    const kinds = [...new Set(CATALOG.map(c => c.kind))];
    const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k !== 'page') p.delete('page'); location.hash = '#catalog?' + p.toString(); };
    root.innerHTML = `<div class="section-head"><div><span class="eyebrow">${t('navCatalog')}</span><h1>${zh() ? '把醫學拆成可以學會的工序' : 'Medicine, broken into learnable steps'}</h1><p class="subtext">${t('free')} · ${t('section')} 1 ${zh() ? '每門課' : 'of every course'} · ${release.topics.toLocaleString()} ${t('statTopics')}</p></div></div>
      <div class="filters"><input id="catSearch" type="search" value="${esc(params.get('q') || '')}" placeholder="${esc(t('searchPlaceholder'))}" style="flex:1;min-width:220px"><select id="fFaculty"><option value="">${t('allFaculties')}</option>${Object.entries(DEPTS.faculties).map(([id, f]) => `<option value="${id}" ${faculty === id ? 'selected' : ''}>${esc(zh() ? f.zh : f.en)}</option>`).join('')}</select><select id="fDept"><option value="">${t('allDepartments')}</option>${deps.map(d => `<option value="${d.id}" ${department === d.id ? 'selected' : ''}>${esc(pk(d, 'title'))}</option>`).join('')}</select><select id="fKind"><option value="">${t('allKinds')}</option>${kinds.map(k => `<option value="${k}" ${kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select><select id="fTier"><option value="">${t('allTiers')}</option><option value="basic" ${tier === 'basic' ? 'selected' : ''}>${t('tierBasic')}</option><option value="intern" ${tier === 'intern' ? 'selected' : ''}>${t('tierIntern')}</option></select><button class="chip ${flagship ? 'active' : ''}" id="fFlag">★ ${t('flagship')}</button></div>
      ${department ? `<div class="notice">${esc(pk(DEPTS.departments.find(d => d.id === department) || {}, 'intro'))}</div>` : ''}
      <p class="muted small">${total.toLocaleString()} ${t('results')}</p>
      ${slice.length ? `<div class="grid cols-3">${slice.map(c => courseCard(c)).join('')}</div>` : `<div class="notice">${t('noResults')}</div>`}
      <div class="pager"><button class="button light small" id="pPrev" ${page <= 1 ? 'disabled' : ''}>← ${t('prev')}</button><span class="small muted">${page} / ${pages}</span><button class="button light small" id="pNext" ${page >= pages ? 'disabled' : ''}>${t('next')} →</button></div>`;
    $('#catSearch').onchange = e => set('q', e.target.value.trim());
    $('#fFaculty').onchange = e => { const p = new URLSearchParams(params); p.delete('department'); p.delete('page'); if (e.target.value) p.set('faculty', e.target.value); else p.delete('faculty'); location.hash = '#catalog?' + p.toString(); };
    $('#fDept').onchange = e => set('department', e.target.value); $('#fKind').onchange = e => set('kind', e.target.value); $('#fTier').onchange = e => set('tier', e.target.value);
    $('#fFlag').onclick = () => set('flagship', flagship ? '' : '1');
    $('#pPrev').onclick = () => set('page', String(page - 1)); $('#pNext').onclick = () => set('page', String(page + 1));
  }
  function intern(root, params) {
    const tab = params.get('tab') || 'tcm';
    const sims = tab === 'tcm' ? [['clinic', t('tcmClinic'), window.HT.internTcm.clinic], ['pulse', t('pulseTrainer'), window.HT.internTcm.pulseTrainer], ['tongue', t('tongueTrainer'), window.HT.internTcm.tongueTrainer], ['locator', zh() ? '穴位定位訓練' : 'Acupoint locator', window.HT.internTcm.locator]] : [['bp', zh() ? '血壓測量（聽診）' : 'Blood pressure (auscultation)', window.HT.internWestern.bpStation], ['vitals', t('vitals'), window.HT.internWestern.vitalsStation], ['glucose', zh() ? '血糖站' : 'Glucose station', window.HT.internWestern.glucoseStation], ['ecg', zh() ? '心電圖判讀' : 'ECG rhythms', window.HT.internWestern.ecgStation], ['labs', zh() ? '檢驗判讀' : 'Lab panels', window.HT.internWestern.labStation], ['soap', zh() ? '臨床病例 SOAP' : 'SOAP case', window.HT.internWestern.soapStation]];
    const sim = params.get('sim') || sims[0][0];
    root.innerHTML = `<div class="section-head"><div><span class="eyebrow">INTERNSHIP</span><h1>${t('navIntern')}</h1><p class="subtext">${zh() ? '基本級是跟師傅學；實習級則面對真實情境的虛擬病人：取得病人資訊（主訴、望聞問切、把脈、舌苔；量血壓、測血糖、身體各項指數），做出判斷並接受評分。' : 'The basic tier learns from the master; the internship tier faces virtual patients: gather the information (chief complaint, four examinations, pulse, tongue; blood pressure, glucose, vital indices), decide, and get scored.'}</p></div></div>
      <div class="tier-tabs"><button class="${tab === 'tcm' ? 'active' : ''}" data-itab="tcm">${t('tcmClinic')}</button><button class="${tab === 'western' ? 'active' : ''}" data-itab="western">${t('westernClinic')}</button></div>
      <div class="row" style="margin-bottom:14px">${sims.map(([id, label], i) => `<button class="chip ${id === sim ? 'active' : ''}" data-sim="${id}">${i > 0 && !window.HT.membership.hasAccess(null, 1) ? '🔒 ' : ''}${label}</button>`).join('')}</div>
      <div id="simRoot"></div>`;
    root.querySelectorAll('[data-itab]').forEach(b => b.onclick = () => { location.hash = '#intern?tab=' + b.dataset.itab; });
    root.querySelectorAll('[data-sim]').forEach(b => b.onclick = () => { location.hash = `#intern?tab=${tab}&sim=${b.dataset.sim}`; });
    const entry = sims.find(s => s[0] === sim) || sims[0]; const idx = sims.indexOf(entry);
    const box = $('#simRoot');
    if (idx > 0 && !window.HT.membership.hasAccess(null, 1)) { box.innerHTML = `<div class="lock-overlay"><div style="font-size:2rem">🔒</div><h3>${t('locked')}</h3><p class="muted">${zh() ? '每個實習門診的第一個模擬器免費；其餘模擬器需學習通行證。' : 'The first simulator of each clinic is free; the others need a learning pass.'}</p><a class="button primary" href="#membership">${t('unlock')}</a></div>`; return; }
    const run = () => { const r = entry[2](box); if (typeof r === 'function') pageCleanup = r; };
    if (entry[0] === 'locator') window.HT.tcmLibrary.ensure().then(run); else run();
  }
  function progressPage(root) {
    const all = window.HT.account.progress.all(); const ids = Object.keys(all).filter(id => (all[id].completed || []).length);
    const sims = simStats();
    root.innerHTML = `<div class="section-head"><div><span class="eyebrow">${t('navProgress')}</span><h1>${zh() ? '我的學習紀錄' : 'My learning record'}</h1><p class="subtext">${window.HT.account.user() ? esc(window.HT.account.user().username || window.HT.account.user().name) : t('guest')} · ${window.HT.account.mode() === 'server' ? (zh() ? '伺服器同步' : 'server-synced') : (zh() ? '此瀏覽器本機儲存' : 'stored in this browser')}</p></div><div class="row"><button class="button light small" id="expProg">⤓ Export JSON</button><label class="button light small" style="cursor:pointer">⤒ Import<input type="file" accept=".json" id="impProg" hidden></label></div></div>
      ${ids.length ? `<div class="grid cols-3">${ids.map(id => { const c = CATALOG.find(x => x.id === id); if (!c) return ''; const n = all[id].completed.length; return `<a class="course-card card" href="#course/${c.id}"><span class="ic">${window.HT.icons.render(c.icon, { size: 56 })}</span><div><h3>${esc(pk(c, 'title'))}</h3><div class="progress-bar"><i style="width:${Math.round(100 * n / c.stepCount)}%"></i></div><p class="small muted">${n}/${c.stepCount} ${t('done')}</p></div></a>`; }).join('')}</div>` : `<div class="notice">${zh() ? '尚無紀錄。從免費課程開始，完成的步驟會出現在這裡。' : 'No records yet. Start a free lesson; completed steps appear here.'}</div>`}
      <h2 style="margin-top:24px">${t('navIntern')}</h2>${Object.keys(sims).length ? `<table><tr><th>${zh() ? '模擬器' : 'Simulator'}</th><th>${zh() ? '次數' : 'Attempts'}</th><th>${zh() ? '平均分' : 'Average'}</th><th>${zh() ? '最佳' : 'Best'}</th></tr>${Object.entries(sims).map(([k, v]) => `<tr><td>${k}</td><td>${v.length}</td><td>${Math.round(v.reduce((a, x) => a + x.score, 0) / v.length)}</td><td>${Math.max(...v.map(x => x.score))}</td></tr>`).join('')}</table>` : `<p class="muted">${zh() ? '尚未進行模擬。' : 'No simulations yet.'}</p>`}`;
    $('#expProg').onclick = () => { const blob = new Blob([window.HT.account.progress.exportJson()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'HuaTuo_Progress.json'; a.click(); };
    $('#impProg').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { window.HT.account.progress.importJson(await f.text()); progressPage(root); toast('Imported'); } catch (err) { toast('Import failed'); } };
  }
  function sources(root) {
    const byDept = {}; CATALOG.forEach(c => { byDept[c.department] = (byDept[c.department] || 0) + 1; });
    root.innerHTML = `<div class="section-head"><div><span class="eyebrow">${t('navSources')}</span><h1>${zh() ? '來源、授權與內容界線' : 'Sources, licences and scope'}</h1></div></div>
      <div class="card"><h3>${zh() ? '內容說明' : 'About the content'}</h3><ul><li>${zh() ? `全站 ${release.topics.toLocaleString()} 門課程由作者資料（主題、焦點、穴位定位、藥性、方劑組成、諾貝爾得獎研究）與依類型的教學模板生成；${CATALOG.filter(c => c.authored).length} 門旗艦手術另有逐步手寫核心步驟。` : `All ${release.topics.toLocaleString()} courses are generated from authored data (topics, focus, point locations, herb properties, formula composition, Nobel discoveries) and kind-specific teaching templates; ${CATALOG.filter(c => c.authored).length} flagship operations have hand-written core steps.`}</li><li>${zh() ? '每門課附 PubMed、維基百科與各科官方學會／WHO／衛福部連結；課程不是臨床指引、手術 SOP 或執照訓練。' : 'Every course links to PubMed, Wikipedia and the relevant society/WHO/MOHW pages; courses are not clinical guidelines, operative SOPs or licensure training.'}</li><li>${zh() ? '穴位定位依 WHO 西太平洋區標準（2008）教學摘要；中藥劑量為常用範圍，含毒藥材已標示。' : 'Point locations follow the WHO WPRO standard (2008) in abridged teaching form; herb doses are usual ranges with toxic materials flagged.'}</li><li>${zh() ? '圖示為本站原創 SVG 單線圖示系統，每門課一個唯一組合（基礎圖形＋科別色＋環段＋點位＋徽章），建置時驗證不重複；未使用第三方圖示庫。' : 'Icons are an original monoline SVG system; each course has a unique combination (glyph + accent + ring + dots + badge) verified at build time; no third-party icon sets are used.'}</li><li>${zh() ? '影片與社群資源（如子子中醫、聰動成長協會）只連結原發布者頁面，點擊後才連線。' : 'Video and community resources (e.g. Zizi TCM, Smart Action Association) link only to the original publishers and connect only when clicked.'}</li></ul></div>
      <h2 style="margin-top:20px">${zh() ? '各科課程數' : 'Courses per department'}</h2><div class="grid cols-4">${DEPTS.departments.map(d => `<a class="dept-card card flat" href="#catalog?department=${d.id}"><span class="ic">${window.HT.icons.glyphOnly(d.glyph, d.accent, 40)}</span><span><b>${esc(pk(d, 'title'))}</b><small>${byDept[d.id] || 0}</small></span></a>`).join('')}</div>
      <h2 style="margin-top:20px">${zh() ? '軟體授權' : 'Software licence'}</h2><p class="small muted">${zh() ? '本專案程式碼以 MIT 授權釋出（見 LICENSES.md）；課程文字為本站編輯內容，可供個人學習；第三方連結內容各依其授權。' : 'Project code is released under the MIT licence (see LICENSES.md); course text is editorial content for personal learning; linked third-party content keeps its own licences.'}</p>`;
  }

  // ---------------------------------------------------------------- router
  async function route() {
    if (pageCleanup) { pageCleanup(); pageCleanup = null; }
    window.HT.voice.stop();
    const hash = location.hash.slice(1) || 'home';
    const [pathRaw, query] = hash.split('?'); const params = new URLSearchParams(query || '');
    const parts = pathRaw.split('/'); const page = parts[0] || 'home';
    const main = $('#main'); main.scrollTop = 0; window.scrollTo(0, 0);
    document.body.className = 'page-' + page;
    document.querySelectorAll('.nav a, .bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
    $('#sidebar').classList.remove('open');
    const titles = { home: 'navHome', catalog: 'navCatalog', intern: 'navIntern', tcm: 'navTcm', nobel: 'navNobel', ai: 'navAi', progress: 'navProgress', membership: 'navMembership', sources: 'navSources', course: 'navCatalog' };
    $('#pageTitle').textContent = t(titles[page] || 'navHome');
    try {
      if (page === 'home') home(main);
      else if (page === 'catalog') catalog(main, params);
      else if (page === 'course') await window.HT.coursePlayer.render(main, decodeURIComponent(parts[1] || ''), { tier: params.get('tier') || 'basic' });
      else if (page === 'intern') intern(main, params);
      else if (page === 'tcm') { await window.HT.tcmLibrary.ensure(); window.HT.tcmLibrary.render(main, params.get('tab'), params.get('filter')); }
      else if (page === 'nobel') window.HT.explorer.nobel(main, params.get('which'));
      else if (page === 'ai') window.HT.explorer.aiPage(main);
      else if (page === 'progress') progressPage(main);
      else if (page === 'membership') { await window.HT.membership.load(); main.innerHTML = window.HT.membership.pageMarkup(); window.HT.membership.bind(main); }
      else if (page === 'sources') sources(main);
      else home(main);
    } catch (e) { main.innerHTML = `<div class="notice danger">${esc(e.message)}</div>`; console.error(e); }
  }

  // ---------------------------------------------------------------- language & currency
  function applyLanguage() {
    const prefs = window.HT.prefs.current;
    const lang = window.HT.i18n.resolve(prefs.language);
    window.HT.i18n.current = lang;
    window.HT.i18n.apply(document);
    const sel = $('#language'); sel.innerHTML = `<option value="auto">◎ ${t('followBrowser')}</option>` + Object.entries(window.HT.i18n.names).map(([c, n]) => `<option value="${c}">${esc(n)}${window.HT.i18n.complete.includes(c) ? '' : ' ·'}</option>`).join(''); sel.value = prefs.language || 'auto';
    const cur = $('#currency'); const cc = window.HT.membership.currencies(); cur.innerHTML = `<option value="auto">◎ ${window.HT.membership.autoCurrency()}</option>` + cc.map(c => `<option value="${c}">${c}</option>`).join(''); cur.value = prefs.currency && prefs.currency !== 'auto' && cc.includes(prefs.currency) ? prefs.currency : 'auto';
    document.title = (lang.startsWith('zh') ? window.HT_CONFIG.siteNameZh + ' · ' : '') + window.HT_CONFIG.siteName;
    route();
  }
  function onAuthChange() {
    const u = window.HT.account.user();
    $('#accountName').textContent = u ? (u.username || u.name) : t('guest');
    $('#avatar').textContent = u ? String(u.username || u.name || '佗').slice(0, 1).toUpperCase() : '佗';
    window.HT.prefs.load(u ? u.id : 'guest');
    window.HT.account.progress.sync().then(() => route());
  }

  // ---------------------------------------------------------------- boot
  async function boot() {
    window.HT.prefs.load('guest');
    await window.HT.account.init();
    const u = window.HT.account.user();
    if (u) { window.HT.prefs.load(u.id); $('#accountName').textContent = u.username || u.name; $('#avatar').textContent = String(u.username || u.name || '佗').slice(0, 1).toUpperCase(); }
    await window.HT.membership.load();
    applyLanguage();
    startMosaic();
    window.addEventListener('hashchange', route);
    window.addEventListener('resize', () => { clearTimeout(window.__mosaicResize); window.__mosaicResize = setTimeout(startMosaic, 400); });
    $('#language').onchange = e => { window.HT.prefs.update({ language: e.target.value }); applyLanguage(); };
    $('#currency').onchange = e => { window.HT.prefs.update({ currency: e.target.value }); applyLanguage(); };
    $('#preferencesButton').onclick = () => window.HT.prefs.open();
    $('#accountButton').onclick = () => window.HT.account.open();
    $('#mentorButton').onclick = () => window.HT.tutor.toggle(window.HT.coursePlayer.current.catalog);
    $('#menuButton').onclick = () => $('#sidebar').classList.toggle('open');
    $('#closeDialog').onclick = closeDialog;
    $('#dialog').addEventListener('click', e => { if (e.target === $('#dialog')) closeDialog(); });
    $('#globalSearch').onkeydown = e => { if (e.key === 'Enter') { location.hash = '#catalog?q=' + encodeURIComponent(e.target.value.trim()); } };
    window.HT.prefs.onChange(() => { /* theme applied in prefs */ });
    window.HT.voice.onStateChange = on => { document.querySelectorAll('#narrate').forEach(b => b.classList.toggle('primary', on)); };
    window.HT.account.progress.sync().then(() => { if (location.hash.startsWith('#progress')) route(); });
    if ('serviceWorker' in navigator && location.protocol === 'https:') { navigator.serviceWorker.register('sw.js').catch(() => { /* optional */ }); }
    if (window.HT.staticMode && window.HT.fileMode) console.info('Hua Tuo Academy: offline file mode (browser-local profiles).');
  }
  window.HT = window.HT || {};
  window.HT.app = { toast, dialog, closeDialog, route, applyLanguage, onAuthChange, recordSim, courseCard, release };
  boot();
})(window);
