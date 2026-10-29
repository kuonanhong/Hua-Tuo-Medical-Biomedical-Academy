/* v3.9 "Imaging & digital twin" panel for the operating table. Clicking any body region of the patient,
   any part of the operating table or any piece of theatre equipment opens licensed REAL teaching images
   (data/real-imaging.js — credits always shown) next to the matching procedural digital twin
   (HT.specialtyTwins / HT.twins.brain / HT.twins.heart). The same panel opens from an SVG body map, so
   devices without WebGL get it too. Real images are teaching references, never the virtual patient's
   own study; nothing here gives doses or device settings. Works from file:// (plain <img>, CSS/SVG
   filters — no pixel read-back). */
(function (window) {
  'use strict';
  const HT = window.HT = window.HT || {};
  const doc = window.document;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const zh = () => !HT.i18n || HT.i18n.isZh();
  const say = (z, e) => zh() ? z : e;
  const T = (key, z, e) => { const v = HT.i18n && HT.i18n.t ? HT.i18n.t(key) : null; return v && v !== key ? v : say(z, e); };
  const bi = o => o == null ? '' : typeof o === 'string' ? o : (zh() ? (o.zh || o.en || '') : (o.en || o.zh || ''));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const FILE = window.location && window.location.protocol === 'file:';
  const safeUrl = u => /^https?:\/\/[^\s<>"']+$/i.test(String(u || '')) ? u : '';

  // ------------------------------------------------------------------ data
  let loading = null;
  function ensure() {
    const jobs = [];
    if (HT.loadCss) jobs.push(HT.loadCss('table-imaging.css'));
    if (!HT.bodyRegionsData) jobs.push(HT.loadScript('data/body-regions.js'));
    if (!HT.realImagingData) jobs.push(HT.loadScript('data/real-imaging.js'));
    if (!jobs.length) return Promise.resolve(data());
    if (!loading) loading = Promise.all(jobs).then(() => { index(); return data(); }).catch(err => { loading = null; throw err; });
    return loading;
  }
  let IDX = null;
  function data() { return HT.bodyRegionsData || null; }
  function index() {
    const d = data(), r = HT.realImagingData;
    if (!d || !r) return null;
    if (IDX && IDX.d === d && IDX.r === r) return IDX;
    const by = (list) => Object.fromEntries((list || []).map(x => [x.id, x]));
    IDX = { d, r, regions: by(d.regions), parts: by(d.tableParts), equip: by(d.equipment), images: by(r.items), groups: d.groups || {} };
    return IDX;
  }
  const ready = () => !!index();
  function images() { return (HT.realImagingData && HT.realImagingData.items) || []; }
  function deptInfo(id) {
    const list = (window.HT_DEPARTMENTS && window.HT_DEPARTMENTS.departments) || [];
    const d = list.find(x => x.id === id);
    return d ? { zh: d.title, en: d.titleEn } : null;
  }
  function deptName(id) { const d = deptInfo(id); return d ? bi(d) : (id || ''); }
  function regionName(id) { const x = index(); const r = x && x.regions[id]; return r ? T(r.key, r.name.zh, r.name.en) : id; }
  function targetMeta(target, department) {
    const x = index(); if (!x || !target) return null;
    const dep = x.d.departments[department] || {};
    const home = dep.home || 'chest';
    if (target.kind === 'region') { const r = x.regions[target.id] || x.regions[home]; return { kind: 'region', id: r.id, icon: r.icon, name: T(r.key, r.name.zh, r.name.en), region: r.id, group: null, info: null, twin: null }; }
    if (target.kind === 'part') { const p = x.parts[target.id]; if (!p) return null; return { kind: 'part', id: p.id, icon: p.icon, name: T(p.key, p.name.zh, p.name.en), region: p.region || home, group: p.group || null, info: p.info, twin: null }; }
    const e = x.equip[target.id]; if (!e) return null;
    return { kind: 'equip', id: e.id, icon: e.icon, name: target.name || T(e.key, e.name.zh, e.name.en), region: e.region || home, group: e.group || null, info: e.info, twin: e.twin || null };
  }

  // ------------------------------------------------------------------ ranking: same region + department, same region, same department, rest
  function rank(region, department, group) {
    const x = index(); if (!x) return [];
    const r = x.regions[region];
    const dep = x.d.departments[department] || {};
    const pref = ((dep.images || {})[region] || []).slice();
    const regionList = pref.concat(r ? r.images : []).filter((v, i, a) => a.indexOf(v) === i);
    const groupSet = group && x.groups[group] ? new Set(x.groups[group]) : null;
    const out = images().map((item, i) => {
      const inR = regionList.indexOf(item.id), hasD = (item.departments || []).indexOf(department) >= 0;
      const tier = inR >= 0 && hasD ? 0 : inR >= 0 ? 1 : hasD ? 2 : 3;
      const g = groupSet ? (groupSet.has(item.id) ? 0 : 1) : 0;
      return { item, tier, g, pos: inR >= 0 ? inR : 99, i };
    });
    out.sort((a, b) => a.g - b.g || a.tier - b.tier || a.pos - b.pos || a.i - b.i);
    return out;
  }
  // a REAL image for a 3D screen texture (http only; theatre3d draws it into a canvas texture)
  function textureFor(kind, department, region) {
    const x = index(); if (!x) return null;
    const dep = x.d.departments[department] || {};
    const group = { lightbox: 'radiograph', carm: 'radiograph', pacs: 'cross', us: 'ultrasound', endo: 'endoscopy', lab: 'smear', histology: 'histology', display: null }[kind];
    const list = rank(region || dep.home || 'chest', department, group).filter(r => !group || r.g === 0);
    const small = list.filter(r => (r.item.bytes || 0) < 1600000);
    const pick = (small[0] || list[0]);
    return pick ? pick.item : null;
  }
  // relevant images first (same region or department); fall back to a related modality group before unrelated images
  const TEXTURE_GROUPS = { lightbox: ['radiograph', 'cross'], carm: ['radiograph', 'cross'], pacs: ['cross', 'radiograph', 'ultrasound'], us: ['ultrasound'], endo: ['endoscopy', 'histology'], lab: ['histology', 'smear', 'microscopy'], histology: ['histology', 'smear'], display: [null] };
  function textureList(kind, department, region, n) {
    const x = index(); if (!x) return [];
    const dep = x.d.departments[department] || {}; const reg = region || dep.home || 'chest';
    const groups = TEXTURE_GROUPS[kind] || [null]; const seen = new Set(), good = [], rest = [];
    groups.forEach(gp => rank(reg, department, gp).forEach(r => { if ((gp && r.g !== 0) || seen.has(r.item.id) || (r.item.bytes || 0) >= 1600000) return; seen.add(r.item.id); (r.tier < 3 ? good : rest).push(r.item); }));
    return good.concat(rest).slice(0, n || 3);
  }
  // ------------------------------------------------------------------ twins
  const titleOf = t => typeof t === 'string' ? { zh: t, en: t } : (t || { zh: '', en: '' });
  function brainCond(title) { const t = (title.zh || '') + ' ' + (title.en || ''); return /中風|stroke|取栓|thrombect/i.test(t) ? 'stroke-mca' : /出血|h(a)?emorrh/i.test(t) ? 'hemorrhage' : /膠質|glioma|腫瘤|tumou?r|metasta/i.test(t) ? 'glioma' : /水腦|hydroceph|分流|shunt|ETV/i.test(t) ? 'hydrocephalus' : /巴金森|帕金森|parkinson|DBS/i.test(t) ? 'parkinson' : /失智|dementia|阿茲|alzheimer/i.test(t) ? 'alzheimer' : /硬化|sclerosis|\bMS\b/i.test(t) ? 'ms' : /癲癇|epilep|顳葉/i.test(t) ? 'tle-hs' : 'normal'; }
  function heartMode(title) { const t = (title.zh || '') + ' ' + (title.en || ''); return /STEMI|心肌梗塞|infarct/i.test(t) ? 'stemi-ant' : /顫動|fibrillation/i.test(t) ? 'af' : /衰竭|failure/i.test(t) ? 'hfref' : /瓣|valve|TAVI|stenosis/i.test(t) ? 'as' : /填塞|tamponade/i.test(t) ? 'tamponade' : /傳導|block|pac(e|ing)/i.test(t) ? 'chb' : 'sinus'; }
  const STOP = new Set(['acute', 'chronic', 'syndrome', 'disease', 'with', 'from', 'after', 'type', 'and', 'the', 'for', 'interpretation', 'assessment', 'management', 'pattern', 'patterns']);
  const ZSTOP = new Set(['急性', '慢性', '症候', '疾病', '病變', '治療', '手術', '評估', '判讀', '處置', '管理']);
  function specialtyCondition(dept, region, title, fallback) {
    const sp = HT.specialtyTwins; if (!sp || !sp.departments) return fallback || null;
    const dep = sp.departments().find(d => d.id === dept); if (!dep) return null;
    const en = (title.en || '').toLowerCase(), zt = title.zh || '';
    let best = null, score = 0;
    dep.conditions.forEach(c => {
      let s = 0;
      String(c.en || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)).forEach(w => { if (en.includes(w.slice(0, 6))) s += 2; });
      const z = String(c.zh || ''); for (let i = 0; i < z.length - 1; i++) { const g = z.slice(i, i + 2); if (/^[一-鿿]{2}$/.test(g) && !ZSTOP.has(g) && zt.includes(g)) s += 1.5; }
      if (c.id === fallback) s += 0.5;
      if (s > score) { score = s; best = c.id; }
    });
    if (score >= 2) return best;
    if (fallback && dep.conditions.some(c => c.id === fallback)) return fallback;
    return dep.conditions[0] && dep.conditions[0].id;
  }
  function twinCandidates(meta, department, title) {
    const x = index(); if (!x || !meta) return [];
    const dep = x.d.departments[department] || {};
    const r = x.regions[meta.region] || {};
    const list = [];
    if (meta.twin) list.push(meta.twin);
    const dt = (dep.twins || {})[meta.region]; if (dt) list.push(dt);
    // the department's own specialty twin leads where the region belongs to that department (its home region or a
    // region it maps); elsewhere the region's own twin leads and the department twin follows as an alternative
    const own = { kind: 'specialty', department, condition: 'auto', own: true };
    if (dep.home === meta.region) list.push(own);
    if (r.twin) list.push(r.twin);
    list.push(own);
    (r.alt || []).forEach(a => list.push(a));
    const seen = new Set(), out = [];
    list.forEach(h => { const k = h.kind + ':' + (h.department || '') + ':' + (h.condition || h.mode || ''); if (seen.has(k)) return; seen.add(k); out.push(h); });
    return out;
  }
  function resolveTwin(h, meta, department, title) {
    const x = index(); const dep = (x && x.d.departments[department]) || {};
    if (h.kind === 'brain') return { kind: 'brain', condition: h.condition === 'auto' ? brainCond(title) : h.condition };
    if (h.kind === 'heart') return { kind: 'heart', mode: h.mode === 'auto' ? heartMode(title) : h.mode };
    const sp = HT.specialtyTwins; if (!sp || !sp.has || !sp.has(h.department)) return null;
    const regionHint = ((dep.twins || {})[meta.region] || {});
    const fallback = h.condition !== 'auto' ? h.condition : (regionHint.kind === 'specialty' && regionHint.department === h.department && regionHint.condition !== 'auto' ? regionHint.condition : null);
    const cond = h.condition === 'auto' || h.own ? specialtyCondition(h.department, meta.region, title, fallback) : h.condition;
    return { kind: 'specialty', department: h.department, condition: cond };
  }
  const BRAIN_NAMES = { normal: ['正常', 'normal'], 'stroke-mca': ['缺血性中風（MCA）', 'ischaemic stroke (MCA)'], hemorrhage: ['腦出血', 'haemorrhage'], glioma: ['膠質瘤', 'glioma'], hydrocephalus: ['水腦', 'hydrocephalus'], parkinson: ['巴金森病', 'Parkinson’s disease'], alzheimer: ['阿茲海默症', 'Alzheimer’s disease'], ms: ['多發性硬化', 'multiple sclerosis'], 'tle-hs': ['顳葉癲癇', 'temporal-lobe epilepsy'], ftd: ['額顳葉失智', 'frontotemporal dementia'] };
  const HEART_NAMES = { sinus: ['竇性心律', 'sinus rhythm'], 'stemi-ant': ['前壁 STEMI', 'anterior STEMI'], af: ['心房顫動', 'atrial fibrillation'], hfref: ['心衰竭（HFrEF）', 'heart failure (HFrEF)'], as: ['主動脈瓣狹窄', 'aortic stenosis'], tamponade: ['心包填塞', 'tamponade'], chb: ['完全房室阻滯', 'complete heart block'] };
  const nm2 = (m, k) => m[k] ? say(m[k][0], m[k][1]) : k;
  function twinLabel(t) {
    if (!t) return '';
    if (t.kind === 'brain') return say('腦部孿生（MNI 真實腦模板）', 'Brain twin (real MNI template)') + ' · ' + nm2(BRAIN_NAMES, t.condition);
    if (t.kind === 'heart') return say('心臟孿生', 'Heart twin') + ' · ' + nm2(HEART_NAMES, t.mode);
    const sp = HT.specialtyTwins; const d = sp && sp.departments ? sp.departments().find(v => v.id === t.department) : null;
    const c = d && d.conditions.find(v => v.id === t.condition);
    return (d ? bi(d) : t.department) + ' · ' + (c ? bi(c) : t.condition);
  }

  // ------------------------------------------------------------------ preference: open on click
  function autoOpen(v) {
    try { if (v !== undefined) localStorage.setItem('ht-table-imaging-auto', v ? '1' : '0'); return localStorage.getItem('ht-table-imaging-auto') !== '0'; } catch (e) { return v === undefined ? true : !!v; }
  }

  // ------------------------------------------------------------------ body map (SVG silhouette, front + back) and table side view
  const FRONT = [
    ['head', 'M63.2,36 A22,27 0 0 1 106.8,36 Z'],
    ['face', 'M63.2,36 L106.8,36 A22,27 0 0 1 104.7,52 L65.3,52 A22,27 0 0 1 63.2,36 Z'],
    ['mouth', 'M65.3,52 L104.7,52 A22,27 0 0 1 65.3,52 Z'],
    ['neck', 'M75,64 L95,64 L97,84 L73,84 Z M57,42 C57,33 63,33 63,42 C63,51 57,51 57,42 Z M107,42 C107,33 113,33 113,42 C113,51 107,51 107,42 Z'],
    ['chest', 'M73,84 L97,84 Q114,86 122,96 L117,140 L53,140 L48,96 Q56,86 73,84 Z'],
    ['abdomen-upper', 'M53,140 L117,140 L113,172 L57,172 Z'],
    ['abdomen-lower', 'M57,172 L113,172 L115,200 L55,200 Z'],
    ['pelvis', 'M55,200 L115,200 Q120,214 113,228 L85,238 L57,228 Q50,214 55,200 Z'],
    ['upper-limb', 'M48,96 Q38,100 36,118 L28,180 L22,232 Q20,246 30,248 Q38,246 36,232 L44,184 L54,132 Z M122,96 Q132,100 134,118 L142,180 L148,232 Q150,246 140,248 Q132,246 134,232 L126,184 L116,132 Z'],
    ['lower-limb', 'M57,228 L84,238 L82,300 L80,372 Q80,386 66,386 Q58,384 62,372 L60,300 Z M113,228 L86,238 L88,300 L90,372 Q90,386 104,386 Q112,384 108,372 L110,300 Z']
  ];
  const BACK = [
    ['head', 'M253,40 A22,27 0 1 1 297,40 A22,27 0 1 1 253,40 Z'],
    ['neck', 'M265,64 L285,64 L287,84 L263,84 Z'],
    ['spine', 'M263,84 L287,84 Q304,86 312,96 L307,140 L303,172 L305,200 L245,200 L247,172 L243,140 L238,96 Q246,86 263,84 Z'],
    ['pelvis', 'M245,200 L305,200 Q310,214 303,228 L275,238 L247,228 Q240,214 245,200 Z'],
    ['upper-limb', 'M238,96 Q228,100 226,118 L218,180 L212,232 Q210,246 220,248 Q228,246 226,232 L234,184 L244,132 Z M312,96 Q322,100 324,118 L332,180 L338,232 Q340,246 330,248 Q322,246 324,232 L316,184 L306,132 Z'],
    ['lower-limb', 'M247,228 L274,238 L272,300 L270,372 Q270,386 256,386 Q248,384 252,372 L250,300 Z M303,228 L276,238 L278,300 L280,372 Q280,386 294,386 Q302,384 298,372 L300,300 Z']
  ];
  const TABLE = [
    ['column', 'M150,64 L210,64 L214,104 L146,104 Z M112,104 L248,104 L252,114 L108,114 Z M232,40 l18,0 l0,22 l-18,0 Z'],
    ['headrest', 'M14,34 L58,34 Q62,34 62,38 L62,46 L14,46 Q10,46 10,42 L10,38 Q10,34 14,34 Z'],
    ['radiolucent-top', 'M66,40 L170,40 L170,52 L66,52 Z'],
    ['table-top', 'M174,40 L236,40 L236,52 L174,52 Z'],
    ['leg-section', 'M240,40 L340,40 Q346,40 346,46 L346,52 L240,52 Z'],
    ['pad', 'M66,30 L340,30 Q346,30 346,36 L346,40 L66,40 Z M14,26 L58,26 L58,34 L14,34 Z'],
    ['side-rail', 'M66,55 L346,55 L346,60 L66,60 Z'],
    ['arm-board', 'M86,6 L120,6 L124,26 L82,26 Z']
  ];
  function bodyMapHtml(selected, part) {
    const x = index();
    const p = (id, d) => `<path class="ti-map-r ${selected === id ? 'on' : ''}" d="${d}" data-ti-region="${id}" role="button" tabindex="0" aria-label="${esc(regionName(id))}"><title>${esc(regionName(id))}</title></path>`;
    const tp = (id, d) => { const pt = x && x.parts[id]; const nm = pt ? T(pt.key, pt.name.zh, pt.name.en) : id; return `<path class="ti-map-p ${part === id ? 'on' : ''}" d="${d}" data-ti-part="${id}" role="button" tabindex="0" aria-label="${esc(nm)}"><title>${esc(nm)}</title></path>`; };
    return `<figure class="ti-map-fig"><svg viewBox="0 0 360 396" class="ti-body-svg" role="group" aria-label="${esc(T('tiPickRegion', '點選身體部位看影像', 'Pick a body region'))}">
      <text x="85" y="10" text-anchor="middle" class="ti-map-cap">${esc(T('frontView', '正面', 'Front'))}</text><text x="275" y="10" text-anchor="middle" class="ti-map-cap">${esc(T('backView', '背面', 'Back'))}</text>
      ${FRONT.map(([id, d]) => p(id, d)).join('')}${BACK.map(([id, d]) => p(id, d)).join('')}
      <g class="ti-map-deco" aria-hidden="true"><circle cx="76" cy="43" r="2.2"/><circle cx="94" cy="43" r="2.2"/><path d="M78,58 Q85,62 92,58" fill="none"/><path d="M275,90 L275,196" stroke-dasharray="3 3" fill="none"/></g>
      <g class="ti-map-skin ${selected === 'skin' ? 'on' : ''}" data-ti-region="skin" role="button" tabindex="0" aria-label="${esc(regionName('skin'))}"><title>${esc(regionName('skin'))}</title><circle cx="160" cy="300" r="17"/><text x="160" y="306" text-anchor="middle">🖐</text></g>
      ${(() => { const nm = x && x.regions.breast ? regionName('breast') : 'breast'; return `<g class="ti-map-breast ${selected === 'breast' ? 'on' : ''}" data-ti-region="breast" role="button" tabindex="0" aria-label="${esc(nm)}"><title>${esc(nm)}</title><circle cx="70" cy="118" r="9"/><circle cx="100" cy="118" r="9"/></g>`; })()}
    </svg>
    <svg viewBox="0 0 360 122" class="ti-table-svg" role="group" aria-label="${esc(T('tiTableParts', '手術台部件', 'Operating-table parts'))}">${TABLE.map(([id, d]) => tp(id, d)).join('')}<path d="M241,46 L232,46" class="ti-map-cable" aria-hidden="true"/></svg>
    <figcaption>${esc(say('點選正面／背面的部位或手術台部件。', 'Tap a region (front or back) or a table part.'))}</figcaption></figure>`;
  }

  // ------------------------------------------------------------------ dialog
  const S = { overlay: null, open: false, target: null, meta: null, ctx: null, imageId: null, ranked: [], twinCleanup: null, twinPick: 0, twinToken: 0, mapOpen: false, opener: null, view: null, slice: 0, showAnswer: false, prevFocus: null, more: false };
  function close() {
    if (!S.open) return;
    S.open = false; S.twinToken++;
    if (S.twinCleanup) { try { S.twinCleanup(); } catch (e) { /* ignore */ } S.twinCleanup = null; }
    if (S.view && S.view.dispose) S.view.dispose(); S.view = null;
    if (S.overlay && S.overlay.parentNode) S.overlay.parentNode.removeChild(S.overlay);
    S.overlay = null;
    doc.documentElement.classList.remove('ti-lock');
    window.removeEventListener('keydown', onKey, true);
    const back = S.prevFocus; S.prevFocus = null;
    if (back && back.isConnected && back.focus) { try { back.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    if (S.ctx && typeof S.ctx.onClose === 'function') { try { S.ctx.onClose(); } catch (e) { /* ignore */ } }
  }
  function onKey(e) {
    if (!S.open || !S.overlay) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      const f = [...S.overlay.querySelectorAll('button,[href],input,select,[tabindex="0"]')].filter(el => !el.disabled && el.offsetParent !== null);
      if (!f.length) return; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  window.addEventListener('hashchange', () => close());

  function open(target, ctx) {
    return ensure().then(() => {
      if (!S.open) { S.prevFocus = (ctx && ctx.opener) || doc.activeElement; }
      S.ctx = Object.assign({}, ctx || {});
      S.mapOpen = !!(ctx && ctx.map) || (S.open && S.mapOpen);
      setTarget(target || { kind: 'region', id: (data().departments[S.ctx.department] || {}).home || 'chest' }, ctx && ctx.imageId);
      return api;
    });
  }
  function setTarget(target, imageId) {
    const meta = targetMeta(target, S.ctx.department);
    if (!meta) return;
    S.target = { kind: meta.kind, id: meta.id }; S.meta = meta;
    S.ranked = rank(meta.region, S.ctx.department, meta.group);
    S.imageId = imageId && S.ranked.some(r => r.item.id === imageId) ? imageId : (S.ranked[0] && S.ranked[0].item.id);
    S.slice = 0; S.showAnswer = false; S.twinPick = 0; S.more = false;
    build();
  }
  function build() {
    const first = !S.open;
    if (first) {
      S.overlay = doc.createElement('div'); S.overlay.className = 'ti-overlay'; S.overlay.setAttribute('data-ti-overlay', '');
      doc.body.appendChild(S.overlay); S.open = true;
      doc.documentElement.classList.add('ti-lock');
      window.addEventListener('keydown', onKey, true);
      S.overlay.addEventListener('pointerdown', e => { if (e.target === S.overlay) S.overlay.dataset.downOut = '1'; });
      S.overlay.addEventListener('click', e => { if (e.target === S.overlay && S.overlay.dataset.downOut === '1') close(); delete S.overlay.dataset.downOut; });
    }
    const x = index(), m = S.meta, ctx = S.ctx;
    const regionChips = x.d.regions.map(r => `<button type="button" class="ti-chip ${m.kind === 'region' && m.id === r.id ? 'on' : m.region === r.id ? 'near' : ''}" data-ti-region="${r.id}" aria-pressed="${m.kind === 'region' && m.id === r.id}"><span aria-hidden="true">${r.icon}</span> ${esc(T(r.key, r.name.zh, r.name.en))}</button>`).join('');
    const partChips = x.d.tableParts.map(p => `<button type="button" class="ti-chip ti-chip-part ${m.kind === 'part' && m.id === p.id ? 'on' : ''}" data-ti-part="${p.id}" aria-pressed="${m.kind === 'part' && m.id === p.id}"><span aria-hidden="true">${p.icon}</span> ${esc(T(p.key, p.name.zh, p.name.en))}</button>`).join('');
    const dName = deptName(ctx.department);
    S.overlay.innerHTML = `<section class="ti-dialog ${S.mapOpen ? 'with-map' : ''}" role="dialog" aria-modal="true" aria-labelledby="tiTitle" data-ti-kind="${m.kind}" data-ti-id="${esc(m.id)}">
      <header class="ti-head"><div class="ti-head-main"><span class="ti-eyebrow">${esc(T('tiTitle', '影像與數位孿生', 'Imaging & digital twin'))}${dName ? ' · ' + esc(dName) : ''}</span><h2 id="tiTitle"><span aria-hidden="true">${m.icon || ''}</span> ${esc(m.name)}${m.kind !== 'region' ? ` <small>→ ${esc(regionName(m.region))}</small>` : ''}</h2></div>
        <label class="ti-auto" title="${esc(say('在 3D 手術室點選病人、手術台或儀器時自動開啟本面板', 'Open this panel automatically when you tap the patient, table or equipment in 3D'))}"><input type="checkbox" data-ti-auto ${autoOpen() ? 'checked' : ''}> ${esc(T('tiAutoOpen', '點選即開', 'Open on tap'))}</label>
        <button type="button" class="ti-x" data-ti-close aria-label="${esc(say('關閉', 'Close'))}">×</button></header>
      <nav class="ti-nav" aria-label="${esc(T('tiRegions', '身體部位', 'Body regions'))}"><div class="ti-chips">${regionChips}<button type="button" class="ti-chip ti-chip-map ${S.mapOpen ? 'on' : ''}" data-ti-map-toggle aria-expanded="${S.mapOpen}">🧍 ${esc(T('tiBodyMap', '身體圖', 'Body map'))}</button></div>
        <details class="ti-parts" ${m.kind === 'part' ? 'open' : ''}><summary>🛏 ${esc(T('tiTableParts', '手術台部件', 'Operating-table parts'))}</summary><div class="ti-chips">${partChips}</div></details></nav>
      ${m.info ? infoHtml(m) : ''}
      <div class="ti-body">
        ${S.mapOpen ? `<aside class="ti-map" data-ti-map>${bodyMapHtml(m.kind === 'region' ? m.id : m.region, m.kind === 'part' ? m.id : null)}</aside>` : ''}
        <section class="ti-real" data-ti-real aria-label="${esc(T('tiRealImage', '真實教學影像', 'Real teaching image'))}"></section>
        <section class="ti-twin" data-ti-twin aria-label="${esc(T('tiTwin', '數位孿生', 'Digital twin'))}"></section>
      </div>
      <p class="ti-foot">${esc(say('真實影像來自公開授權來源（作者・授權・來源見每張圖下方），是教學參考，不是本虛擬病人的檢查；數位孿生為程序化模擬。本站不提供劑量或儀器設定。', 'Real images come from openly licensed sources (author · licence · source under each image); they are teaching references, not this virtual patient’s study. Digital twins are procedural simulations. No doses or device settings are given.'))}</p>
    </section>`;
    wire();
    renderReal();
    renderTwin();
    if (first) { const c = S.overlay.querySelector('[data-ti-close]'); if (c) c.focus({ preventScroll: true }); }
  }
  function infoHtml(m) {
    const i = m.info; const acts = S.ctx.actions || {};
    const btns = [];
    if (acts.details && m.kind === 'equip' && acts.canDetails && acts.canDetails(m.id)) btns.push(`<button type="button" class="ti-btn" data-ti-act="details">📋 ${esc(HT.i18n ? HT.i18n.t('equipDetails') : say('詳細面板', 'Details'))}</button>`);
    if (acts.fly && (m.kind === 'equip' || m.kind === 'part') && acts.canFly && acts.canFly(m.kind === 'part' ? 'field' : m.id)) btns.push(`<button type="button" class="ti-btn" data-ti-act="fly">🚶 ${esc(HT.i18n ? HT.i18n.t('goThere') : say('走過去', 'Go there'))}</button>`);
    return `<section class="ti-info" data-ti-info><div class="ti-info-grid"><div><h3>${esc(T('tiWhat', '這是什麼', 'What it is'))}</h3><p>${esc(bi(i.what))}</p></div><div><h3>${esc(T('tiSafeUse', '安全使用', 'Safe use'))}</h3><p>${esc(bi(i.use))}</p></div><div><h3>${esc(T('tiRisk', '常見錯誤與風險', 'What goes wrong'))}</h3><p>${esc(bi(i.risk))}</p></div></div>${btns.length ? `<div class="ti-info-acts">${btns.join('')}</div>` : ''}</section>`;
  }
  function wire() {
    const o = S.overlay;
    o.querySelector('[data-ti-close]').onclick = close;
    const auto = o.querySelector('[data-ti-auto]'); if (auto) auto.onchange = () => autoOpen(auto.checked);
    const fromMap = b => !!b.closest('[data-ti-map]');
    const showResult = b => { if (fromMap(b) && window.innerWidth < 820) { const r = S.overlay && S.overlay.querySelector('[data-ti-real]'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'start' }); } };
    o.querySelectorAll('[data-ti-region]').forEach(b => { const act = e => { if (e) e.preventDefault(); const m = fromMap(b); setTarget({ kind: 'region', id: b.getAttribute('data-ti-region') }); focusSame((m ? '[data-ti-map] ' : '.ti-nav ') + '[data-ti-region="' + b.getAttribute('data-ti-region') + '"]'); if (m) showResult(b); }; b.onclick = act; if (b.tagName !== 'BUTTON') b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') act(e); }; });
    o.querySelectorAll('[data-ti-part]').forEach(b => { const act = e => { if (e) e.preventDefault(); const m = fromMap(b); setTarget({ kind: 'part', id: b.getAttribute('data-ti-part') }); focusSame((m ? '[data-ti-map] ' : '.ti-nav ') + '[data-ti-part="' + b.getAttribute('data-ti-part') + '"]'); if (m) showResult(b); }; b.onclick = act; if (b.tagName !== 'BUTTON') b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') act(e); }; });
    const mt = o.querySelector('[data-ti-map-toggle]'); if (mt) mt.onclick = () => { S.mapOpen = !S.mapOpen; build(); focusSame('[data-ti-map-toggle]'); };
    o.querySelectorAll('[data-ti-act]').forEach(b => b.onclick = () => { const a = b.getAttribute('data-ti-act'), acts = S.ctx.actions || {}; const id = S.meta.id; if (a === 'details' && acts.details) { close(); acts.details(id); } else if (a === 'fly' && acts.fly) { close(); acts.fly(S.meta.kind === 'part' ? 'field' : id); } });
  }
  function focusSame(sel) { const el = S.overlay && S.overlay.querySelector(sel); if (el && el.focus) { try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }

  // ---- real image column
  function current() { const r = S.ranked.find(v => v.item.id === S.imageId); return r ? r.item : null; }
  function groupOf(id) { const g = index().groups; return Object.keys(g).filter(k => g[k].indexOf(id) >= 0); }
  function renderReal() {
    const host = S.overlay.querySelector('[data-ti-real]'); if (!host) return;
    if (S.view && S.view.dispose) S.view.dispose(); S.view = null;
    const a = current();
    if (!a) { host.innerHTML = `<p class="ti-empty">${esc(say('目前沒有可用的授權真實影像。', 'No licensed real image is available.'))}</p>`; return; }
    const gs = groupOf(a.id); const gray = gs.some(g => g === 'radiograph' || g === 'cross' || g === 'ultrasound');
    const d = S.ctx.department; const tierTxt = r => r.tier === 0 ? say('本部位・本科', 'region · department') : r.tier === 1 ? say('本部位', 'region') : r.tier === 2 ? say('本科', 'department') : say('其他', 'other');
    const cur = S.ranked.find(r => r.item.id === a.id);
    const note = (index().d.imageNotes || {})[a.id];
    const list = S.ranked.filter(r => r.tier < 3 || (S.meta.group && r.g === 0));
    const shown = S.more ? list : list.slice(0, 8);
    const frames = a.frames && a.frames.length ? a.frames : null;
    host.innerHTML = `<div class="ti-viewer ${gray ? 'gray' : 'color'}">
        <div class="ti-stage" data-ti-stage tabindex="0" role="img" aria-label="${esc(bi(a.title))} — ${esc(say('滾輪或雙指縮放、拖曳平移、右鍵或 Shift 拖曳調窗寬窗位、方向鍵平移、+/- 縮放、0 重設', 'wheel or pinch to zoom, drag to pan, right- or Shift-drag for window/level, arrows pan, +/- zoom, 0 resets'))}">
          <img data-ti-img alt="${esc(bi(a.title))}" draggable="false" decoding="async">
          <span class="ti-badge">${esc(say('真實影像', 'REAL IMAGE'))} · ${esc(a.modality)}</span>
          <span class="ti-zoomv" data-ti-zoomv>1.0×</span>
          <p class="ti-loading" data-ti-loading>${esc(say('載入影像…', 'Loading image…'))}</p>
        </div>
        <div class="ti-tools">
          <button type="button" class="ti-tool" data-ti-zoom="-1" aria-label="${esc(say('縮小', 'Zoom out'))}">－</button><button type="button" class="ti-tool" data-ti-zoom="1" aria-label="${esc(say('放大', 'Zoom in'))}">＋</button>
          <label class="ti-range">${esc(gray ? T('tiLevel', '窗位', 'Level') : say('亮度', 'Brightness'))}<input type="range" data-ti-level min="20" max="235" value="128" aria-label="${esc(gray ? T('tiLevel', '窗位', 'Level') : say('亮度', 'Brightness'))}"></label>
          <label class="ti-range">${esc(gray ? T('tiWindow', '窗寬', 'Window') : say('對比', 'Contrast'))}<input type="range" data-ti-width min="24" max="400" value="256" aria-label="${esc(gray ? T('tiWindow', '窗寬', 'Window') : say('對比', 'Contrast'))}"></label>
          ${frames ? `<label class="ti-range">Z <output data-ti-slicev>1/${frames.length}</output><input type="range" data-ti-slice min="0" max="${frames.length - 1}" value="${S.slice}" aria-label="${esc(say('顯微鏡 Z 切片', 'Microscopy Z plane'))}"></label>` : ''}
          ${gray ? `<button type="button" class="ti-tool" data-ti-invert aria-pressed="false">${esc(say('反相', 'Invert'))}</button>` : ''}
          <button type="button" class="ti-tool" data-ti-reset>${esc(T('tiReset', '重設影像', 'Reset view'))}</button>
        </div>
        <svg class="ti-defs" width="0" height="0" aria-hidden="true" focusable="false"><filter id="tiWL" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="linear" slope="1" intercept="0"/><feFuncG type="linear" slope="1" intercept="0"/><feFuncB type="linear" slope="1" intercept="0"/></feComponentTransfer></filter></svg>
      </div>
      <p class="ti-credit" data-ti-credit>© ${esc(a.author)} · <a href="${esc(safeUrl(a.licenseUrl))}" target="_blank" rel="noopener noreferrer">${esc(a.license)}</a> · <a href="${esc(safeUrl(a.sourcePage))}" target="_blank" rel="noopener noreferrer">${esc(T('tiSource', '原始來源', 'Source'))}</a></p>
      <div class="ti-meta"><h3>${esc(bi(a.title))} <small>${esc(a.modality)}</small> <span class="ti-tier t${cur ? cur.tier : 3}">${esc(cur ? tierTxt(cur) : '')}</span></h3>
        <p class="ti-ref">${esc(T('tiTeachingRef', '教學參考影像，不是本虛擬病人的檢查。', 'Teaching reference — not this virtual patient’s scan.'))}</p>
        ${note ? `<p class="ti-why">📍 ${esc(bi(note))}</p>` : ''}
        <p>${esc(bi(a.description))}</p>
        <h4>${esc(say('觀察重點', 'Observe'))}</h4><ol class="ti-observe">${(a.observe || []).map(p => `<li>${esc(bi(p))}</li>`).join('')}</ol>
        <div class="ti-q"><strong>${esc(say('先想一想', 'Think first'))}：${esc(bi(a.question))}</strong><button type="button" class="ti-btn" data-ti-answer aria-expanded="${S.showAnswer}">${esc(S.showAnswer ? T('tiHideAnswer', '收起解說', 'Hide explanation') : T('tiShowAnswer', '查看師傅解說', 'Show explanation'))}</button>${S.showAnswer ? `<p data-ti-answer-text>${esc(bi(a.answer))}</p>` : ''}</div>
        <p class="ti-limit">⚠ ${esc(bi(a.limit))}</p>
      </div>
      <div class="ti-more"><h4>${esc(T('tiMoreImages', '其他相符影像', 'More matching images'))} <small>(${list.length})</small></h4><div class="ti-chips wrap">${shown.map(r => `<button type="button" class="ti-chip ti-img-chip ${r.item.id === a.id ? 'on' : ''} t${r.tier}" data-ti-image="${esc(r.item.id)}" title="${esc(tierTxt(r))} · ${esc(r.item.modality)}">${esc(bi(r.item.title))}</button>`).join('')}${list.length > shown.length ? `<button type="button" class="ti-chip" data-ti-more>${esc(say('全部顯示', 'Show all'))}</button>` : ''}</div></div>`;
    host.querySelectorAll('[data-ti-image]').forEach(b => b.onclick = () => { S.imageId = b.getAttribute('data-ti-image'); S.slice = 0; S.showAnswer = false; renderReal(); focusSame('[data-ti-image="' + S.imageId + '"]'); });
    const more = host.querySelector('[data-ti-more]'); if (more) more.onclick = () => { S.more = true; renderReal(); };
    host.querySelector('[data-ti-answer]').onclick = () => { S.showAnswer = !S.showAnswer; renderReal(); focusSame('[data-ti-answer]'); };
    S.view = viewer(host, a, frames);
  }
  function viewer(host, a, frames) {
    const stage = host.querySelector('[data-ti-stage]'), img = host.querySelector('[data-ti-img]'), zoomv = host.querySelector('[data-ti-zoomv]'), loadingEl = host.querySelector('[data-ti-loading]');
    const lv = host.querySelector('[data-ti-level]'), wv = host.querySelector('[data-ti-width]'), inv = host.querySelector('[data-ti-invert]');
    const fr = host.querySelectorAll('#tiWL feFuncR, #tiWL feFuncG, #tiWL feFuncB');
    const st = { z: 1, x: 0, y: 0, level: 128, width: 256, invert: false };
    let disposed = false; const pointers = new Map(); let drag = null, pinch = null;
    function size() { const r = stage.getBoundingClientRect(); return { w: r.width || 1, h: r.height || 1, r }; }
    function clampPan() { const { w, h } = size(); const mx = Math.max(0, (st.z - 1) * w / 2 + w * 0.15), my = Math.max(0, (st.z - 1) * h / 2 + h * 0.15); st.x = clamp(st.x, -mx, mx); st.y = clamp(st.y, -my, my); if (st.z <= 1.001) { st.x = 0; st.y = 0; } }
    function apply() { clampPan(); img.style.transform = `translate(${st.x}px, ${st.y}px) scale(${st.z})`; zoomv.textContent = st.z.toFixed(1) + '×'; }
    function applyWL() {
      const def = st.level === 128 && st.width === 256 && !st.invert;
      const c = st.level / 255, w = st.width / 255; let slope = 1 / w, icpt = 0.5 - c / w;
      if (st.invert) { slope = -slope; icpt = 1 - icpt; }
      fr.forEach(f => { f.setAttribute('slope', slope.toFixed(4)); f.setAttribute('intercept', icpt.toFixed(4)); });
      img.style.filter = def ? '' : 'url(#tiWL)';
      if (lv) lv.value = st.level; if (wv) wv.value = st.width; if (inv) inv.setAttribute('aria-pressed', String(st.invert));
    }
    function zoomAt(nz, cx, cy) { nz = clamp(nz, 1, 8); const k = nz / st.z; st.x = cx - (cx - st.x) * k; st.y = cy - (cy - st.y) * k; st.z = nz; apply(); }
    function center(e) { const { w, h, r } = size(); return [e.clientX - r.left - w / 2, e.clientY - r.top - h / 2]; }
    function reset() { st.z = 1; st.x = 0; st.y = 0; st.level = 128; st.width = 256; st.invert = false; apply(); applyWL(); }
    stage.addEventListener('wheel', e => { e.preventDefault(); const [cx, cy] = center(e); zoomAt(st.z * (e.deltaY < 0 ? 1.18 : 1 / 1.18), cx, cy); }, { passive: false });
    stage.addEventListener('pointerdown', e => {
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, z: st.z }; drag = null; }
      else drag = { x: e.clientX, y: e.clientY, sx: st.x, sy: st.y, wl: e.button === 2 || e.shiftKey, l: st.level, w: st.width };
    });
    stage.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) { const [p, q] = [...pointers.values()]; const d = Math.hypot(p.x - q.x, p.y - q.y) || 1; const { w, h, r } = size(); zoomAt(pinch.z * d / pinch.d, (p.x + q.x) / 2 - r.left - w / 2, (p.y + q.y) / 2 - r.top - h / 2); return; }
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.wl) { st.width = clamp(Math.round(drag.w + dx), 24, 400); st.level = clamp(Math.round(drag.l - dy * 0.6), 20, 235); applyWL(); }
      else { st.x = drag.sx + dx; st.y = drag.sy + dy; apply(); }
    });
    const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) drag = null; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('contextmenu', e => e.preventDefault());
    stage.addEventListener('dblclick', e => { const [cx, cy] = center(e); if (st.z > 1.05) { st.z = 1; st.x = 0; st.y = 0; apply(); } else zoomAt(2.5, cx, cy); });
    stage.addEventListener('keydown', e => {
      const k = e.key; const step = 40;
      if (k === 'ArrowLeft') st.x += step; else if (k === 'ArrowRight') st.x -= step; else if (k === 'ArrowUp') st.y += step; else if (k === 'ArrowDown') st.y -= step;
      else if (k === '+' || k === '=') { zoomAt(st.z * 1.25, 0, 0); e.preventDefault(); return; } else if (k === '-' || k === '_') { zoomAt(st.z / 1.25, 0, 0); e.preventDefault(); return; } else if (k === '0') { reset(); e.preventDefault(); return; } else return;
      e.preventDefault(); apply();
    });
    host.querySelectorAll('[data-ti-zoom]').forEach(b => b.onclick = () => zoomAt(st.z * (Number(b.getAttribute('data-ti-zoom')) > 0 ? 1.4 : 1 / 1.4), 0, 0));
    if (lv) lv.oninput = () => { st.level = Number(lv.value); applyWL(); };
    if (wv) wv.oninput = () => { st.width = Number(wv.value); applyWL(); };
    if (inv) inv.onclick = () => { st.invert = !st.invert; applyWL(); };
    host.querySelector('[data-ti-reset]').onclick = reset;
    const sl = host.querySelector('[data-ti-slice]'), slv = host.querySelector('[data-ti-slicev]');
    function load() {
      const src = frames ? frames[clamp(S.slice, 0, frames.length - 1)].path : a.path;
      loadingEl.hidden = false; loadingEl.textContent = say('載入影像…', 'Loading image…');
      img.onload = () => { if (disposed) return; loadingEl.hidden = true; stage.classList.add('loaded'); };
      img.onerror = () => { if (disposed) return; loadingEl.hidden = false; loadingEl.textContent = say('影像檔無法載入；請確認程式包完整，或開啟下方原始來源。', 'The image file could not load. Check the package is complete, or open the source link below.'); };
      img.src = src;
    }
    if (sl) sl.oninput = () => { S.slice = Number(sl.value); if (slv) slv.textContent = (S.slice + 1) + '/' + frames.length; load(); };
    apply(); applyWL(); load();
    return { dispose() { disposed = true; img.onload = img.onerror = null; }, state: st, reset };
  }

  // ---- twin column
  function renderTwin() {
    const host = S.overlay.querySelector('[data-ti-twin]'); if (!host) return;
    if (S.twinCleanup) { try { S.twinCleanup(); } catch (e) { /* ignore */ } S.twinCleanup = null; }
    const token = ++S.twinToken;
    const title = titleOf(S.ctx.title);
    host.innerHTML = `<header class="ti-twin-head"><h3>${esc(T('tiTwin', '數位孿生', 'Digital twin'))}</h3><div class="ti-chips wrap" data-ti-twin-pick></div></header><div class="ti-twin-host" data-ti-twin-host><p class="ti-empty">${esc(say('載入數位孿生…', 'Loading digital twin…'))}</p></div><p class="ti-sim">${esc(say('程序化模擬（演算法繪製），不是真實病人影像；請與左側真實影像對照學習。', 'Procedural simulation drawn by algorithm, not a real patient image; compare it with the real image.'))}</p>`;
    const twinHost = host.querySelector('[data-ti-twin-host]');
    const run = async () => {
      if (HT.loadCss) await HT.loadCss('twins.css');
      if (!HT.twins) await HT.loadScript('twins.js');
      if (token !== S.twinToken) return;
      await HT.twins.ensureSpecialty();
      if (token !== S.twinToken) return;
      const cands = twinCandidates(S.meta, S.ctx.department, title).map(h => resolveTwin(h, S.meta, S.ctx.department, title)).filter(Boolean);
      const uniq = []; const seen = new Set(); cands.forEach(c => { const k = c.kind + (c.department || '') + (c.condition || c.mode || ''); if (!seen.has(k)) { seen.add(k); uniq.push(c); } });
      const list = uniq.slice(0, 4);
      if (!list.length) { twinHost.innerHTML = `<p class="ti-empty">${esc(say('此部位尚無數位孿生。', 'No digital twin for this region yet.'))}</p>`; return; }
      const pickHost = host.querySelector('[data-ti-twin-pick]');
      const pick = clamp(S.twinPick, 0, list.length - 1);
      pickHost.innerHTML = list.map((c, i) => `<button type="button" class="ti-chip ${i === pick ? 'on' : ''}" data-ti-twin-i="${i}" aria-pressed="${i === pick}">${esc(twinLabel(c))}</button>`).join('');
      pickHost.querySelectorAll('[data-ti-twin-i]').forEach(b => b.onclick = () => { S.twinPick = Number(b.getAttribute('data-ti-twin-i')); renderTwin(); focusSame('[data-ti-twin-i="' + S.twinPick + '"]'); });
      const t = list[pick]; host.setAttribute('data-ti-twin-kind', t.kind); host.setAttribute('data-ti-twin-dept', t.department || ''); host.setAttribute('data-ti-twin-cond', t.condition || t.mode || '');
      twinHost.innerHTML = '';
      if (t.kind === 'specialty') S.twinCleanup = HT.specialtyTwins.embed(twinHost, { department: t.department, condition: t.condition, compact: true });
      else if (t.kind === 'heart') S.twinCleanup = HT.twins.heart(twinHost, { mode: t.mode });
      else { await HT.twins.ensureBrain(); if (token !== S.twinToken) return; S.twinCleanup = HT.twins.brain(twinHost, { condition: t.condition }); }
      if (token !== S.twinToken && S.twinCleanup) { S.twinCleanup(); S.twinCleanup = null; }
    };
    run().catch(() => { if (token === S.twinToken && twinHost.isConnected) twinHost.innerHTML = `<p class="ti-empty" role="status">${esc(say('數位孿生模組目前無法載入；真實影像仍可使用。', 'The digital-twin module could not load; the real image remains available.'))}</p>`; });
  }

  function state() { return { open: S.open, target: S.target, imageId: S.imageId, image: current(), region: S.meta && S.meta.region, mapOpen: S.mapOpen, view: S.view && Object.assign({}, S.view.state) }; }
  const api = { ensure, ready, data, rank, textureFor, textureList, open, close, isOpen: () => S.open, state, autoOpen, regionName, deptName, targetMeta: (t, d) => (index() ? targetMeta(t, d) : null), bodyMapHtml, twinCandidates, resolveTwin, brainCond, heartMode, FILE };
  HT.tableImaging = api;
})(window);
