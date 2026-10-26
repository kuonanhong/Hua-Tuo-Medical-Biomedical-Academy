/* Department procedure library (v3.3). Loads data/procedures/<department>.json lazily and runs each
   procedure on the mentor workbench as a multi-station workflow: demonstrate → operate → observe →
   decide → verify, with the consequence of every wrong decision shown ("若做錯會怎樣"). */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = k => window.HT.i18n.t(k);
  const zh = () => window.HT.i18n.isZh();
  const say = (z, e) => zh() ? z : e;
  const pk = (o, f) => window.HT.locale.pick(o, f);
  const bl = v => v && typeof v === 'object' ? (zh() ? (v.zh || v.en || '') : (v.en || v.zh || '')) : String(v || '');
  const FREE_PER_DEPARTMENT = 4;
  const libraries = {}, pending = {};
  let index = null, currentContext = null;

  async function loadIndex() {
    if (index) return index;
    if (window.HT_PROCEDURE_INDEX) { index = window.HT_PROCEDURE_INDEX; return index; }
    if (location.protocol === 'file:') { await window.HT.loadScript('data/procedures/index.js'); index = window.HT_PROCEDURE_INDEX || { departments: [] }; return index; }
    try { index = await window.HT.loadJson('data/procedures/index.json'); } catch (e) { await window.HT.loadScript('data/procedures/index.js'); index = window.HT_PROCEDURE_INDEX || { departments: [] }; }
    return index;
  }
  async function loadLibrary(dept) {
    if (!/^[a-z0-9-]{2,60}$/.test(dept)) throw new Error('Invalid department');
    if (libraries[dept]) return libraries[dept];
    if (!pending[dept]) {
      pending[dept] = (async () => {
        let raw = null;
        if (location.protocol !== 'file:') {
          try { raw = await fetch('data/procedures/' + dept + '.json', { credentials: 'same-origin', cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); } catch (e) { raw = null; }
        }
        if (!raw) { await window.HT.loadScript('data/procedures/' + dept + '.js'); raw = window.HT_PROCEDURES && window.HT_PROCEDURES[dept]; }
        if (!raw || !Array.isArray(raw.procedures)) throw new Error(say('此科別尚無程序庫。', 'No procedure library for this department yet.'));
        const entitled = window.HT.membership.hasAccess(null, 1);
        const cases = raw.procedures.map((p, i) => { const c = window.HT.workbench.fromProcedure(p, dept); if (!entitled && i >= FREE_PER_DEPARTMENT) c.locked = true; if (!c.stages.length) c.locked = true; c.order = i; return c; });
        libraries[dept] = { meta: raw, cases };
        return libraries[dept];
      })().catch(e => { delete pending[dept]; throw e; });
    }
    return pending[dept];
  }
  function owner() { const u = window.HT.account && window.HT.account.user && window.HT.account.user(); return (u && (u.id || u.username)) || 'guest'; }
  function progressOf(procId) { try { const s = JSON.parse(localStorage.getItem(`ht-workbench-v2:${owner()}:proc:${procId}`) || 'null'); if (!s) return null; return { done: s.phase === 'complete', index: s.index || 0 }; } catch (e) { return null; } }
  function deptMeta(id) { return (window.HT_DEPARTMENTS.departments || []).find(d => d.id === id) || { id, title: id, titleEn: id, glyph: 'stethoscope', accent: '#2f6f8f', faculty: 'western' }; }

  // ---------------------------------------------------------------- department grid
  function hub(root, idx, params) {
    const faculty = params.get('faculty') || '';
    const F = window.HT_DEPARTMENTS.faculties;
    const list = (idx.departments || []).filter(d => !faculty || deptMeta(d.id).faculty === faculty);
    const totals = list.reduce((a, d) => ({ p: a.p + (d.procedures || 0), s: a.s + (d.stages || 0) }), { p: 0, s: 0 });
    root.innerHTML = `<div class="section-head"><div><span class="eyebrow">DEPARTMENT PROCEDURE LIBRARY</span><h1>${t('departmentLibrary')}</h1><p class="subtext">${say(`${list.length} 科 · ${totals.p.toLocaleString()} 道程序 · ${totals.s.toLocaleString()} 道工序。每道程序是真實工作流程的多站程序板：先看師傅示範，再親手到每一站取得證據、做判斷；答錯會看到「若做錯會怎樣」。`, `${list.length} departments · ${totals.p.toLocaleString()} procedures · ${totals.s.toLocaleString()} stages. Each procedure is a multi-station board of the real workflow: watch the mentor, then visit every station, collect evidence and decide; a wrong decision shows its consequence.`)}</p></div></div>
      <div class="filters"><select id="procFaculty"><option value="">${t('allFaculties')}</option>${Object.entries(F).map(([id, f]) => `<option value="${id}" ${faculty === id ? 'selected' : ''}>${esc(zh() ? f.zh : f.en)}</option>`).join('')}</select><span class="small muted">${say('★ 編者逐站撰寫　· 其餘科別為主題資料＋工序模板', '★ authored station by station · other departments: topic data + workflow templates')}</span></div>
      ${floorMap(list)}
      <div class="grid cols-3 proc-grid">${list.map(d => { const m = deptMeta(d.id); return `<a class="card dept-card proc-card" href="#procedures?department=${esc(d.id)}"><span class="ic">${window.HT.icons.glyphOnly(m.glyph, m.accent, 44)}</span><span><b>${esc(pk(m, 'title'))}${d.authored ? ' <span class="tag flagship">★</span>' : ''}</b><small>${d.procedures} ${t('proceduresUnit')} · ${d.stages} ${t('stagesUnit')} · ${(d.categories || []).length} ${t('category')}</small><small class="proc-cats">${(d.categories || []).slice(0, 4).map(c => esc(zh() ? c.zh : c.en)).join(' · ')}</small></span></a>`; }).join('')}</div>
      <p class="form-note">${say('程序庫為教學拆解與安全判斷訓練，不是手術 SOP、臨床指引或執照訓練；真實操作須在合格醫師監督與機構規範下進行。每科前四道程序免費。', 'The library is an educational decomposition and safety-judgement trainer, not an operative SOP, clinical guideline or licensure training; real practice requires qualified supervision and institutional protocols. The first four procedures of each department are free.')}</p>`;
    root.querySelector('#procFaculty').onchange = e => { location.hash = '#procedures' + (e.target.value ? '?faculty=' + e.target.value : ''); };
  }

  // ---------------------------------------------------------------- hospital floor map (walk into a department)
  function floorMap(list) {
    const xp = window.HT.xp ? window.HT.xp.state() : { cases: {} };
    const cols = list.length <= 12 ? Math.min(4, list.length) : Math.min(8, Math.ceil(Math.sqrt(list.length * 1.8))); const rows = Math.ceil(list.length / cols);
    const W = 160, H = 118, GX = 18, GY = 54, PAD = 30; const width = PAD * 2 + cols * W + (cols - 1) * GX, height = PAD * 2 + rows * H + (rows - 1) * GY + 40;
    const rooms = list.map((d, i) => { const m = deptMeta(d.id); const col = i % cols, row = Math.floor(i / cols); const x = PAD + col * (W + GX), y = PAD + 40 + row * (H + GY); const done = (xp.cases[d.id] || []).length; const title = pk(m, 'title');
      return `<a class="fm-room ${d.authored ? 'authored' : ''}" href="#procedures?department=${esc(d.id)}" transform="translate(${x} ${y})" role="link" aria-label="${esc(title)}"><rect width="${W}" height="${H}" rx="10" class="fm-wall"/><rect x="${W / 2 - 16}" y="${H - 6}" width="32" height="8" rx="2" class="fm-door"/><svg x="12" y="12" width="40" height="40" viewBox="0 0 64 64">${window.HT.icons.glyphOnly(m.glyph, m.accent, 40).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg><text x="60" y="30" class="fm-title">${esc(title.length > (zh() ? 7 : 16) ? title.slice(0, zh() ? 7 : 16) + '…' : title)}</text><text x="60" y="48" class="fm-sub">${d.procedures} ${t('proceduresUnit')}</text>${d.authored ? `<text x="${W - 14}" y="24" text-anchor="end" class="fm-star">★</text>` : ''}<rect x="12" y="${H - 30}" width="${W - 24}" height="8" rx="4" class="fm-bar"/><rect x="12" y="${H - 30}" width="${Math.max(0, Math.min(1, done / Math.max(1, Math.min(10, d.procedures)))) * (W - 24)}" height="8" rx="4" class="fm-fill"/><text x="12" y="${H - 38}" class="fm-sub">${done ? say(`已完成 ${done} 道`, `${done} done`) : say('尚未進入', 'not visited')}</text>${done ? `<circle cx="${W - 20}" cy="${H - 26}" r="6" class="fm-dot"/>` : ''}</a>`; }).join('');
    const corridor = Array.from({ length: rows }, (_, r) => `<rect x="${PAD - 10}" y="${PAD + 40 + r * (H + GY) + H + 6}" width="${width - PAD * 2 + 20}" height="${GY - 12}" rx="6" class="fm-corridor"/>`).join('');
    return `<section class="card fm-card"><div class="fm-head"><b>🏥 ${t('floorMap')}</b><span class="small muted">${say('★ 編者逐站撰寫 · 進度條為您在該科完成的程序', '★ authored station by station · bars show your completed procedures')}</span></div><div class="fm-wrap"><svg class="fm-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMin meet"><rect width="${width}" height="${height}" class="fm-floor"/><text x="${PAD}" y="${PAD + 18}" class="fm-floorname">${esc(say('華佗醫院 · 手術與診療樓層', 'Hua Tuo Hospital · surgical & clinical floor'))}</text>${corridor}${rooms}<g transform="translate(${PAD + 4} ${height - 22})"><circle r="7" class="fm-you"/><text x="12" y="4" class="fm-sub">${esc(say('你（實習醫師）', 'you (intern)'))}</text></g></svg></div></section>`;
  }

  // ---------------------------------------------------------------- department view
  async function department(root, dept, procId, params) {
    const m = deptMeta(dept);
    root.innerHTML = `<div class="loading">${t('loadingModule')}</div>`;
    let lib;
    try { lib = await loadLibrary(dept); } catch (e) { root.innerHTML = `<div class="section-head"><div><span class="eyebrow">${esc(pk(m, 'title'))}</span><h1>${t('departmentLibrary')}</h1></div></div><div class="notice danger">${esc(e.message)}</div><p><a class="button" href="#procedures">← ${t('departmentLibrary')}</a></p>`; return; }
    const cases = lib.cases;
    const cats = []; cases.forEach(c => { const k = c.category.zh + '|' + c.category.en; if (!cats.some(x => x.k === k)) cats.push({ k, zh: c.category.zh, en: c.category.en, n: 0 }); cats.find(x => x.k === k).n++; });
    const state = { cat: params.get('cat') || '', q: '' };
    let selected = cases.find(c => c.id === procId) || cases.find(c => !c.locked) || cases[0];
    let cleanupBench = null;
    root.innerHTML = `<div class="section-head"><div><span class="eyebrow"><a href="#procedures">${t('departmentLibrary')}</a> · ${esc(lib.meta.authored === false ? say('模板生成', 'template-generated') : say('編者撰寫', 'authored'))}</span><h1>${esc(pk(m, 'title'))} <small class="muted" data-no-translate>${esc(zh() ? m.titleEn : m.title)}</small></h1><p class="subtext">${esc(pk(lib.meta, 'intro') || pk(m, 'intro'))}</p></div><div class="row"><a class="button small" href="#catalog?department=${esc(dept)}">${t('navCatalog')} →</a></div></div>
      <div class="proc-layout"><aside class="proc-list card" aria-label="${say('程序清單', 'Procedure list')}"><div class="proc-tools"><input type="search" id="procSearch" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}"><select id="procCat" aria-label="${esc(t('filterCategory'))}"><option value="">${t('filterCategory')} · ${cases.length}</option>${cats.map(c => `<option value="${esc(c.k)}" ${state.cat === c.k ? 'selected' : ''}>${esc(zh() ? c.zh : c.en)} · ${c.n}</option>`).join('')}</select></div><ol id="procItems" class="proc-items"></ol><p class="small muted">${cases.length} ${t('proceduresUnit')} · ${cases.reduce((n, c) => n + (c.stageCount || c.stages.length), 0)} ${t('stagesUnit')}</p></aside><section class="proc-bench" id="procBench"></section></div>
      <details class="card panel" style="margin-top:16px"><summary><b>${t('sources')}</b></summary><ul class="source-list">${(lib.meta.sources || []).map(u => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\//, '').split('/')[0])} ↗</a></li>`).join('')}</ul><p class="form-note">${say('程序庫為教學拆解與安全判斷訓練，不是手術 SOP 或臨床指引。', 'Educational decomposition and safety-judgement training, not an operative SOP or clinical guideline.')}</p></details>`;
    const items = root.querySelector('#procItems');
    function drawList() {
      const q = state.q.trim().toLowerCase();
      const vis = cases.filter(c => (!state.cat || (c.category.zh + '|' + c.category.en) === state.cat) && (!q || (c.title.zh + ' ' + c.title.en + ' ' + c.category.zh + ' ' + c.category.en + ' ' + c.kind).toLowerCase().includes(q)));
      items.innerHTML = vis.map(c => { const pr = progressOf(c.id); const n = c.stageCount || c.stages.length; return `<li><button type="button" class="proc-item ${selected && selected.id === c.id ? 'active' : ''} ${c.locked ? 'locked' : ''}" data-proc="${esc(c.id)}"><span class="proc-no">${c.order + 1}</span><span class="proc-body"><b>${esc(bl(c.title))}</b><small>${esc(bl(c.category))} · ${esc(c.kind)} · ${c.tiles.length} ${t('stations')} · ${n} ${t('stagesUnit')}${c.minutes ? ' · ≈' + c.minutes + ' min' : ''}</small></span><span class="proc-state">${c.locked ? '🔒' : pr && pr.done ? '✓' : pr ? Math.round(100 * pr.index / Math.max(1, n)) + '%' : ''}</span></button></li>`; }).join('') || `<li class="muted small">${t('noResults')}</li>`;
      items.querySelectorAll('[data-proc]').forEach(b => b.onclick = () => { selected = cases.find(c => c.id === b.dataset.proc); location.hash = `#procedures/${encodeURIComponent(selected.id)}?department=${dept}${state.cat ? '&cat=' + encodeURIComponent(state.cat) : ''}`; });
    }
    function mountBench() {
      if (cleanupBench) { cleanupBench(); cleanupBench = null; }
      const box = root.querySelector('#procBench'); if (!box || !selected) return;
      currentContext = { id: 'procedure-' + selected.id, title: pk(m, 'title') + ' · ' + selected.title.zh, titleEn: m.titleEn + ' · ' + selected.title.en, summary: selected.patient.zh + '\n工序站：' + selected.tiles.map(x => x.zh).join('、'), summaryEn: selected.patient.en + '\nStations: ' + selected.tiles.map(x => x.en).join(', ') };
      cleanupBench = window.HT.workbench.mount(box, { spec: selected, library: cases, storageId: 'proc', hideSelector: false, onLocked: c => { window.HT.app.toast(say('此程序需學習通行證。', 'This procedure needs a learning pass.')); }, onProgress: () => drawList(), onSelectCase: c => { selected = c; history.replaceState(null, '', `#procedures/${encodeURIComponent(c.id)}?department=${dept}`); drawList(); }, onComplete: () => { drawList(); window.HT.app.recordSim('procedure-' + selected.id, 100); } });
      box.querySelector('[data-case]')?.addEventListener('change', e => { const c = cases.find(x => x.id === e.target.value); if (c && !c.locked) { selected = c; history.replaceState(null, '', `#procedures/${encodeURIComponent(c.id)}?department=${dept}`); drawList(); } });
    }
    root.querySelector('#procSearch').oninput = e => { state.q = e.target.value; drawList(); };
    root.querySelector('#procCat').onchange = e => { state.cat = e.target.value; drawList(); };
    drawList(); mountBench();
    return () => { if (cleanupBench) cleanupBench(); currentContext = null; };
  }

  async function render(root, params, procId) {
    const idx = await loadIndex();
    const dept = params.get('department') || (procId ? (idx.departments || []).find(d => procId.startsWith(d.id + '-'))?.id : '');
    if (!dept) { hub(root, idx, params); return null; }
    return department(root, dept, procId, params);
  }
  /* Used by the course player: a course's department library, if any, replaces the generic case. */
  async function caseForCourse(cat) {
    try { const idx = await loadIndex(); if (!(idx.departments || []).some(d => d.id === cat.department)) return null; const lib = await loadLibrary(cat.department); const key = (cat.title + ' ' + cat.titleEn).toLowerCase(); const scored = lib.cases.filter(c => !c.locked).map(c => { let s = 0; (c.title.en + ' ' + c.title.zh).toLowerCase().split(/[\s（）()、,，/]+/).forEach(w => { if (w.length > 2 && key.includes(w)) s += w.length; }); return [s, c]; }).sort((a, b) => b[0] - a[0]); return scored.length && scored[0][0] > 0 ? scored[0][1] : lib.cases.find(c => !c.locked) || null; } catch (e) { return null; }
  }
  function reset() { Object.keys(libraries).forEach(k => delete libraries[k]); Object.keys(pending).forEach(k => delete pending[k]); }
  window.HT = window.HT || {};
  window.HT.procedures = { render, loadIndex, loadLibrary, caseForCourse, reset, FREE_PER_DEPARTMENT, get currentContext() { return currentContext; } };
})(window);
