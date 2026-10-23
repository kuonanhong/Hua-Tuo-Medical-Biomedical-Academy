/* Digital twins (v3.4): a brain viewer on real MNI ICBM152 slices with algorithmic pathology and
   drug/therapy pathway overlays, and a procedural beating-heart twin with ECG, conduction, coronary
   perfusion, pathologies and interventions. Both are used stand-alone (#twins) and as instruments
   inside the digital-twin theatre. Education only. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = k => window.HT.i18n.t(k);
  const zh = () => window.HT.i18n.isZh();
  const say = (z, e) => zh() ? z : e;
  const bi = (o, k) => o ? (zh() ? (o[k] ?? o[k + 'En'] ?? '') : (o[k + 'En'] ?? o[k] ?? '')) : '';
  let META = null, ATLAS = null, currentContext = null;

  async function ensureBrain() {
    if (!window.HT_BRAIN_ATLAS) await window.HT.loadScript('data/twins/brain-atlas.js');
    ATLAS = window.HT_BRAIN_ATLAS;
    if (!META) {
      try { META = location.protocol === 'file:' ? null : await window.HT.loadJson('data/twins/brain/meta.json'); } catch (e) { META = null; }
      if (!META) { await window.HT.loadScript('data/twins/brain/meta.js'); META = window.HT_BRAIN_TWIN_META; }
    }
    return !!META;
  }

  // ================================================================ BRAIN TWIN
  const KIND_STYLE = { lesion: { stroke: '#ff4d4d', fill: 'rgba(255,77,77,.22)', dash: [] }, atrophy: { stroke: '#ffb020', fill: 'rgba(255,176,32,.16)', dash: [6, 4] }, label: { stroke: 'rgba(120,200,255,.9)', fill: 'rgba(120,200,255,.08)', dash: [2, 3] }, target: { stroke: '#3dff9a', fill: 'rgba(61,255,154,.22)', dash: [] } };
  function roiOnSlice(roi, slice, side) {
    // Ellipsoid ∩ plane → ellipse in image pixels. side: +1 / -1 for bilateral copies.
    const c = roi.c.slice(); if (side < 0) c[0] = -c[0];
    const r = roi.r; const axis = { x: 0, y: 1, z: 2 };
    const planeAxis = slice.plane === 'axial' ? 'z' : slice.plane === 'coronal' ? 'y' : 'x';
    const pa = axis[planeAxis], ha = axis[slice.hAxis], va = axis[slice.vAxis];
    const d = (slice.mm - c[pa]) / r[pa]; if (Math.abs(d) >= 1) return null;
    const s = Math.sqrt(1 - d * d);
    const px = (c[ha] - slice.h[0]) / (slice.h[1] - slice.h[0]) * slice.width;
    const py = (slice.v[1] - c[va]) / (slice.v[1] - slice.v[0]) * slice.height;
    return { x: px, y: py, rx: r[ha] * s / (slice.h[1] - slice.h[0]) * slice.width, ry: r[va] * s / (slice.v[1] - slice.v[0]) * slice.height, depth: Math.abs(d) };
  }
  function brain(root, opts) {
    opts = opts || {};
    const st = { cond: opts.condition || 'normal', plane: opts.plane || 'axial', index: null, overlays: true, drugs: true, labels: true, compare: false, therapy: null, zoom: 1 };
    const images = {}; let raf = null, t0 = performance.now(), disposed = false;
    const conds = ATLAS.conditions;
    const cond = () => conds.find(c => c.id === st.cond) || conds[0];
    const slicesOf = (c, plane) => (META.conditions[c.images] || META.conditions.normal).slices.filter(s => s.plane === plane);
    function img(file) { if (!images[file]) { const im = new Image(); im.src = 'data/twins/brain/' + file; im.onload = () => draw(); images[file] = im; } return images[file]; }
    root.innerHTML = `<div class="tw-brain"><div class="tw-panel tw-view"><div class="tw-toolbar"><label>${t('twCondition')}<select data-tw-cond>${conds.map(c => `<option value="${c.id}" ${c.id === st.cond ? 'selected' : ''}>${esc(bi(c, 'zh'))}</option>`).join('')}</select></label><div class="row">${['axial', 'coronal', 'sagittal'].map(p => `<button class="chip ${st.plane === p ? 'active' : ''}" data-tw-plane="${p}">${t({ axial: 'twAxial', coronal: 'twCoronal', sagittal: 'twSagittal' }[p])}</button>`).join('')}</div><div class="row"><button class="chip ${st.overlays ? 'active' : ''}" data-tw-ov>${t('twOverlays')}</button><button class="chip ${st.labels ? 'active' : ''}" data-tw-lb>${t('twLabels')}</button><button class="chip ${st.compare ? 'active' : ''}" data-tw-cmp>${t('twCompare')}</button></div></div>
        <div class="tw-canvas-row"><div class="tw-canvas-wrap"><canvas data-tw-canvas width="448" height="448"></canvas><div class="tw-side-l">L</div><div class="tw-side-r">R</div></div><div class="tw-canvas-wrap tw-cmp" data-tw-cmp-wrap hidden><canvas data-tw-canvas2 width="448" height="448"></canvas><span class="tw-cap">${t('twNormal')}</span></div></div>
        <div class="tw-slider"><input type="range" data-tw-slice min="0" max="1" value="0"><span data-tw-coord></span></div>
        <p class="small muted">${say('影像：真實 MNI ICBM152 平均腦（152 位成人 MRI），病變以演算法在此真實模板上模擬並標示；疊加區域為教學示意，非個人病灶座標。', 'Images: the real MNI ICBM152 average brain (152 adult MRIs); pathology is simulated algorithmically on this real template and labelled; overlays are teaching schematics, not individual lesion coordinates.')}</p></div>
        <div class="tw-panel tw-info"><span class="eyebrow" data-tw-modality></span><h2 data-tw-title></h2><p data-tw-summary></p><ul class="tw-findings" data-tw-findings></ul><h3>${t('twTherapies')}</h3><div class="row tw-therapies" data-tw-therapies></div><div class="tw-therapy" data-tw-therapy hidden></div><p class="small"><a data-tw-courses href="#catalog">${say('相關課程 →', 'Related courses →')}</a> · <a href="#procedures?department=neurology">${say('神經內科程序庫 →', 'Neurology library →')}</a> · <a href="#pharmacy?tab=drug">${say('配伍實驗室 →', 'Pharmacy lab →')}</a></p></div></div>`;
    const canvas = root.querySelector('[data-tw-canvas]'), canvas2 = root.querySelector('[data-tw-canvas2]'), ctx = canvas.getContext('2d'), ctx2 = canvas2.getContext('2d');
    const slider = root.querySelector('[data-tw-slice]');
    function current() { const list = slicesOf(cond(), st.plane); if (st.index === null || st.index >= list.length) st.index = Math.floor(list.length / 2); return { list, slice: list[st.index] }; }
    function drawSlice(c2, slice, drawOverlays, cnd) {
      const im = img(slice.file); const W = c2.canvas.width, H = c2.canvas.height;
      c2.fillStyle = '#05080c'; c2.fillRect(0, 0, W, H);
      const sc = Math.min(W / slice.width, H / slice.height) * st.zoom; const ox = (W - slice.width * sc) / 2, oy = (H - slice.height * sc) / 2;
      if (im.complete && im.naturalWidth) c2.drawImage(im, ox, oy, slice.width * sc, slice.height * sc);
      else { c2.fillStyle = '#9aa'; c2.font = '14px system-ui'; c2.fillText('…', W / 2 - 4, H / 2); }
      if (!drawOverlays) return;
      const now = (performance.now() - t0) / 1000;
      const draws = [];
      if (st.overlays) (cnd.highlight || []).forEach(h => { if (h.kind === 'label' && !st.labels) return; draws.push({ roi: h.roi, kind: h.kind }); });
      const th = st.therapy && (cnd.therapies || []).find(x => x.id === st.therapy);
      if (th) (th.targets || []).forEach(roi => draws.push({ roi, kind: 'target', pulse: true }));
      draws.forEach(d => {
        const roi = ATLAS.regions[d.roi]; if (!roi) return;
        const sides = roi.bilateral ? [1, -1] : [1];
        sides.forEach(side => {
          const e = roiOnSlice(roi, slice, side); if (!e) return;
          const sty = KIND_STYLE[d.kind] || KIND_STYLE.label; const pulse = d.pulse ? 1 + 0.08 * Math.sin(now * 4) : 1;
          c2.beginPath(); c2.ellipse(ox + e.x * sc, oy + e.y * sc, Math.max(3, e.rx * sc * pulse), Math.max(3, e.ry * sc * pulse), 0, 0, Math.PI * 2);
          c2.fillStyle = sty.fill; c2.fill(); c2.setLineDash(sty.dash); c2.lineWidth = d.kind === 'target' ? 2.5 : 1.6; c2.strokeStyle = sty.stroke; c2.stroke(); c2.setLineDash([]);
          if (st.labels && (d.kind !== 'label' || e.depth < 0.6) && side === 1) { c2.font = '600 11px system-ui, "Noto Sans TC", sans-serif'; c2.fillStyle = '#fff'; c2.shadowColor = '#000'; c2.shadowBlur = 4; c2.fillText(bi(roi, 'zh'), ox + e.x * sc + e.rx * sc * 0.4, oy + e.y * sc - e.ry * sc * 0.6 - 2); c2.shadowBlur = 0; }
        });
      });
      // pathway: animated dots travelling through the ROI centres that lie near this slice
      if (th && th.pathway && ATLAS.pathways[th.pathway]) {
        const pts = ATLAS.pathways[th.pathway].via.map(id => ATLAS.regions[id]).filter(Boolean).map(r => roiOnSlice({ c: r.c, r: r.r.map(x => x * 1.6) }, slice, 1) || roiOnSlice({ c: r.c, r: r.r.map(x => x * 1.6) }, slice, -1)).filter(Boolean);
        if (pts.length >= 2) {
          c2.beginPath(); pts.forEach((p, i) => { if (i) c2.lineTo(ox + p.x * sc, oy + p.y * sc); else c2.moveTo(ox + p.x * sc, oy + p.y * sc); }); c2.strokeStyle = 'rgba(61,255,154,.55)'; c2.lineWidth = 2; c2.setLineDash([4, 6]); c2.stroke(); c2.setLineDash([]);
          for (let k = 0; k < 4; k++) { const f = ((now * 0.35) + k / 4) % 1; const seg = Math.min(pts.length - 2, Math.floor(f * (pts.length - 1))); const g = f * (pts.length - 1) - seg; const a = pts[seg], b = pts[seg + 1]; c2.beginPath(); c2.arc(ox + (a.x + (b.x - a.x) * g) * sc, oy + (a.y + (b.y - a.y) * g) * sc, 4.5, 0, Math.PI * 2); c2.fillStyle = '#3dff9a'; c2.shadowColor = '#3dff9a'; c2.shadowBlur = 10; c2.fill(); c2.shadowBlur = 0; }
        }
      }
    }
    function draw() {
      if (disposed) return;
      const { list, slice } = current(); const cnd = cond();
      drawSlice(ctx, slice, true, cnd);
      if (st.compare) { const normal = slicesOf({ images: 'normal' }, st.plane)[st.index]; if (normal) drawSlice(ctx2, normal, false, cnd); }
      root.querySelector('[data-tw-coord]').textContent = `${slice.plane} · ${slice.hAxis === 'x' ? '' : ''}${{ axial: 'z', coronal: 'y', sagittal: 'x' }[slice.plane]} = ${slice.mm} mm (MNI) · ${st.index + 1}/${list.length}`;
    }
    function loop() { if (disposed) return; const cnd = cond(); if (st.therapy) draw(); raf = requestAnimationFrame(loop); }
    function info() {
      const c = cond();
      root.querySelector('[data-tw-modality]').textContent = `${c.modality} · ${say('真實模板＋演算法', 'real template + algorithm')}`;
      root.querySelector('[data-tw-title]').textContent = bi(c, 'zh');
      root.querySelector('[data-tw-summary]').textContent = bi(c, 'summary');
      root.querySelector('[data-tw-findings]').innerHTML = (zh() ? c.findings : c.findingsEn || c.findings || []).map(f => `<li>${esc(f)}</li>`).join('');
      root.querySelector('[data-tw-therapies]').innerHTML = (c.therapies || []).map(x => `<button class="chip tw-th ${x.kind} ${st.therapy === x.id ? 'active' : ''}" data-tw-th="${x.id}">${x.kind === 'drug' ? '💊' : x.kind === 'procedure' ? '🩺' : x.kind === 'caution' ? '⚠' : '🧭'} ${esc(bi(x, 'zh'))}</button>`).join('');
      root.querySelectorAll('[data-tw-th]').forEach(b => b.onclick = () => { st.therapy = st.therapy === b.dataset.twTh ? null : b.dataset.twTh; info(); draw(); });
      const th = (c.therapies || []).find(x => x.id === st.therapy); const box = root.querySelector('[data-tw-therapy]');
      box.hidden = !th;
      if (th) box.innerHTML = `<b>${esc(bi(th, 'zh'))}</b><p>${esc(bi(th, 'text'))}</p><p class="small"><b>${say('作用部位', 'Acts on')}：</b>${(th.targets || []).map(id => esc(bi(ATLAS.regions[id] || {}, 'zh'))).join('、')}${th.pathway && ATLAS.pathways[th.pathway] ? ` · <b>${t('twPathway')}：</b>${esc(bi(ATLAS.pathways[th.pathway], 'zh'))}` : ''}</p>${th.caution ? `<p class="notice warn">⚠ ${esc(bi(th, 'caution'))}</p>` : ''}`;
      root.querySelector('[data-tw-courses]').href = '#catalog?department=' + (c.dept || 'neurology');
      currentContext = { id: 'brain-twin-' + c.id, title: '腦數位孿生 · ' + c.zh, titleEn: 'Brain twin · ' + c.en, summary: c.summary + (th ? '\n治療：' + th.zh + '：' + th.text : ''), summaryEn: c.summaryEn + (th ? '\nTherapy: ' + th.en + ': ' + th.textEn : '') };
    }
    function syncSlider() { const { list } = current(); slider.max = String(list.length - 1); slider.value = String(st.index); }
    root.querySelector('[data-tw-cond]').onchange = e => { st.cond = e.target.value; st.therapy = null; st.index = null; syncSlider(); info(); draw(); };
    root.querySelectorAll('[data-tw-plane]').forEach(b => b.onclick = () => { st.plane = b.dataset.twPlane; st.index = null; root.querySelectorAll('[data-tw-plane]').forEach(x => x.classList.toggle('active', x === b)); syncSlider(); draw(); });
    root.querySelector('[data-tw-ov]').onclick = e => { st.overlays = !st.overlays; e.currentTarget.classList.toggle('active', st.overlays); draw(); };
    root.querySelector('[data-tw-lb]').onclick = e => { st.labels = !st.labels; e.currentTarget.classList.toggle('active', st.labels); draw(); };
    root.querySelector('[data-tw-cmp]').onclick = e => { st.compare = !st.compare; e.currentTarget.classList.toggle('active', st.compare); root.querySelector('[data-tw-cmp-wrap]').hidden = !st.compare; draw(); };
    slider.oninput = e => { st.index = Number(e.target.value); draw(); };
    canvas.addEventListener('wheel', e => { e.preventDefault(); const { list } = current(); st.index = Math.max(0, Math.min(list.length - 1, st.index + (e.deltaY > 0 ? 1 : -1))); syncSlider(); draw(); }, { passive: false });
    syncSlider(); info(); draw(); loop();
    return () => { disposed = true; if (raf) cancelAnimationFrame(raf); };
  }

  // ================================================================ HEART TWIN
  const HEART_MODES = [
    { id: 'sinus', zh: '正常竇性心律', en: 'Normal sinus rhythm', hr: 72, bp: [120, 78], spo2: 98, ef: 62, p: true, qrsW: 1, st: 0, rrVar: 0.02, block: 0, dept: 'cardiology', text: '竇房結每分鐘約 60–100 次發放，電訊號經心房、房室結延遲、希氏束與左右束支到浦金氏纖維，先心房後心室收縮。', textEn: 'The SA node fires 60–100 times a minute; the impulse crosses the atria, pauses at the AV node, then runs down the His bundle and bundle branches to the Purkinje network — atria first, then ventricles.' },
    { id: 'stemi-ant', zh: '前壁 STEMI（LAD 阻塞）', en: 'Anterior STEMI (LAD occlusion)', hr: 96, bp: [104, 66], spo2: 95, ef: 38, p: true, qrsW: 1, st: 1, rrVar: 0.03, block: 0, occl: 'lad', hypo: 'anterior', dept: 'cardiology', text: '左前降支阻塞使前壁與心尖缺血壞死：V1–V4 ST 上升、前壁運動減弱、射出分率下降。門到球時間 90 分鐘內的緊急 PCI 是標準治療。', textEn: 'LAD occlusion infarcts the anterior wall and apex: ST elevation in V1–V4, anterior hypokinesia, falling ejection fraction. Primary PCI within a 90-minute door-to-balloon time is the standard.' },
    { id: 'stemi-inf', zh: '下壁 STEMI（RCA 阻塞）', en: 'Inferior STEMI (RCA occlusion)', hr: 48, bp: [96, 60], spo2: 96, ef: 50, p: true, qrsW: 1, st: 1, rrVar: 0.03, block: 0, occl: 'rca', hypo: 'inferior', dept: 'cardiology', text: '右冠狀動脈阻塞影響下壁與常見的竇房結／房室結血供：II、III、aVF ST 上升，常伴心搏過緩與低血壓（右心室梗塞時避免硝酸鹽）。', textEn: 'RCA occlusion hits the inferior wall and often the SA/AV nodal supply: ST elevation in II, III, aVF with bradycardia and hypotension (avoid nitrates when the right ventricle is involved).' },
    { id: 'af', zh: '心房顫動', en: 'Atrial fibrillation', hr: 128, bp: [110, 72], spo2: 97, ef: 55, p: false, qrsW: 1, st: 0, rrVar: 0.35, block: 0, dept: 'cardiology', text: '心房多處微折返使心房不再協調收縮，房室結隨機傳導造成不規則心室節律；左心耳血栓→中風風險以 CHA₂DS₂-VASc 評估抗凝。', textEn: 'Multiple atrial micro-reentry circuits abolish coordinated atrial contraction; random AV conduction gives an irregularly irregular ventricular rhythm. Left-atrial-appendage thrombus → stroke risk is scored with CHA₂DS₂-VASc.' },
    { id: 'chb', zh: '完全房室傳導阻滯', en: 'Complete heart block', hr: 36, bp: [92, 50], spo2: 95, ef: 58, p: true, qrsW: 1.8, st: 0, rrVar: 0.02, block: 3, dept: 'cardiology', text: '房室結／希氏束完全阻斷，心房與心室各自跳動（房室分離）；心室逸搏慢而寬，需經靜脈暫時節律器再植入永久節律器。', textEn: 'The AV node / His bundle no longer conducts: atria and ventricles beat independently (AV dissociation) with a slow wide escape rhythm; temporary transvenous pacing, then a permanent pacemaker.' },
    { id: 'vt', zh: '心室頻脈', en: 'Ventricular tachycardia', hr: 168, bp: [78, 48], spo2: 92, ef: 30, p: false, qrsW: 2.2, st: 0, rrVar: 0.01, block: 0, dept: 'cardiology', text: '心室內瘢痕折返產生快速寬 QRS 節律，心輸出量驟降；不穩定者同步電擊，穩定者 amiodarone／procainamide，之後考慮 ICD。', textEn: 'Scar-related ventricular reentry drives a fast wide-QRS rhythm with collapsing output; unstable → synchronised cardioversion, stable → amiodarone / procainamide, then consider an ICD.' },
    { id: 'hfref', zh: '心臟衰竭（HFrEF，EF 28%）', en: 'Heart failure (HFrEF, EF 28%)', hr: 92, bp: [100, 64], spo2: 94, ef: 28, p: true, qrsW: 1.3, st: 0, rrVar: 0.04, block: 0, dilated: 1.18, dept: 'cardiology', text: '左心室擴大、收縮力下降，每搏輸出量不足、肺靜脈壓上升；四大支柱（ARNI/ACEi、β 阻斷劑、MRA、SGLT2i）降低死亡率。', textEn: 'A dilated, weakly contracting left ventricle delivers too little stroke volume and backs up pulmonary pressure; the four pillars (ARNI/ACEi, beta-blocker, MRA, SGLT2i) cut mortality.' },
    { id: 'as', zh: '主動脈瓣狹窄', en: 'Aortic stenosis', hr: 76, bp: [112, 80], spo2: 97, ef: 60, p: true, qrsW: 1.1, st: 0, rrVar: 0.02, block: 0, lvh: true, dept: 'cardiac-surgery', text: '鈣化瓣膜使左心室出口受阻，心肌代償性肥厚；出現暈厥、心絞痛或心衰即需換瓣（外科 SAVR 或經導管 TAVI）。', textEn: 'A calcified valve obstructs LV outflow and the myocardium hypertrophies; syncope, angina or heart failure mandate valve replacement (surgical SAVR or transcatheter TAVI).' },
    { id: 'tamponade', zh: '心包填塞', en: 'Cardiac tamponade', hr: 124, bp: [84, 62], spo2: 93, ef: 55, p: true, qrsW: 1, st: 0, rrVar: 0.02, block: 0, effusion: true, alternans: true, dept: 'cardiac-surgery', text: '心包積液壓迫心室舒張：頸靜脈怒張、低血壓、心音遙遠（Beck 三徵）、奇脈；需緊急心包穿刺或開窗引流。', textEn: 'Pericardial fluid prevents diastolic filling: raised JVP, hypotension, muffled heart sounds (Beck triad), pulsus paradoxus; urgent pericardiocentesis or a surgical window.' }
  ];
  const HEART_RX = [
    { id: 'beta', zh: 'β 阻斷劑', en: 'Beta-blocker', for: ['sinus', 'af', 'stemi-ant', 'hfref', 'as'], apply: s => { s.hr = Math.round(s.hr * 0.78); s.bp[0] -= 8; }, text: '降低竇房結放電與房室結傳導、減少心肌耗氧；AF 速率控制、心衰長期獲益。禁忌：急性失代償、嚴重心搏過緩、氣喘（非選擇性）。', textEn: 'Slows SA firing and AV conduction and lowers myocardial oxygen demand; rate control in AF, long-term benefit in HF. Avoid in acute decompensation, severe bradycardia, asthma (non-selective).' },
    { id: 'nitrate', zh: '硝酸鹽', en: 'Nitrate', for: ['stemi-ant', 'sinus', 'as'], apply: s => { s.bp[0] -= 14; s.bp[1] -= 8; s.dilate = true; }, text: '擴張靜脈與冠狀動脈，減少前負荷與心絞痛；右心室梗塞、低血壓、24 小時內用過 PDE5 抑制劑者禁用。', textEn: 'Dilates veins and coronaries, reducing preload and angina; contraindicated in RV infarction, hypotension, or PDE5 inhibitor within 24 h.' },
    { id: 'pci', zh: '緊急 PCI（支架）', en: 'Primary PCI (stent)', for: ['stemi-ant', 'stemi-inf'], apply: s => { s.occl = null; s.st = 0.25; s.hypo = s.hypo + '-recovering'; s.ef += 10; s.stent = true; }, text: '導管經橈動脈到冠狀動脈，球囊擴張後置入支架恢復血流（TIMI 3）；越快再灌注，存活心肌越多。', textEn: 'Catheter via the radial artery to the coronary; balloon then stent restores flow (TIMI 3). The faster the reperfusion, the more myocardium survives.' },
    { id: 'lytic', zh: '靜脈溶栓', en: 'Thrombolysis', for: ['stemi-ant', 'stemi-inf'], apply: s => { s.occl = null; s.st = 0.5; s.ef += 6; }, text: '無法 120 分鐘內 PCI 時於發病 12 小時內使用；出血風險評估後給藥，之後仍轉送導管中心。', textEn: 'When PCI cannot be delivered within 120 min, give within 12 h of onset after bleeding-risk assessment, then transfer to a cath centre.' },
    { id: 'amio', zh: 'Amiodarone', en: 'Amiodarone', for: ['vt', 'af'], apply: s => { if (s.mode === 'vt') { s.p = true; s.qrsW = 1; s.hr = 88; s.bp = [108, 70]; s.ef = 45; s.rrVar = 0.02; } else { s.hr = Math.round(s.hr * 0.7); } }, text: '多通道抗心律不整藥：穩定的 VT 化學整流、AF 節律控制；長期注意甲狀腺、肺、肝毒性與 QT 延長。', textEn: 'Multi-channel antiarrhythmic: chemical cardioversion of stable VT, rhythm control in AF; long-term thyroid, lung and liver toxicity and QT prolongation.' },
    { id: 'shock', zh: '同步電擊／去顫', en: 'Cardioversion / defibrillation', for: ['vt', 'af'], apply: s => { s.p = true; s.qrsW = 1; s.hr = 80; s.bp = [116, 74]; s.rrVar = 0.02; s.ef = Math.max(s.ef, 50); s.shock = true; }, text: '不穩定心律（低血壓、意識改變、胸痛）立即同步電擊；AF 需抗凝 3 週或經食道超音波排除血栓再整流。', textEn: 'Unstable rhythm (hypotension, altered consciousness, chest pain) → immediate synchronised shock; AF needs 3 weeks of anticoagulation or TOE to exclude thrombus first.' },
    { id: 'pace', zh: '暫時節律器', en: 'Temporary pacing', for: ['chb'], apply: s => { s.hr = 70; s.block = 0; s.paced = true; s.bp = [112, 70]; s.qrsW = 1.6; }, text: '經靜脈電極放入右心室，以 70 次／分起搏；心電圖見起搏棘波後寬 QRS。之後植入永久節律器。', textEn: 'A transvenous lead in the right ventricle paces at 70/min; the ECG shows a pacing spike before each wide QRS. A permanent pacemaker follows.' },
    { id: 'anticoag', zh: '抗凝（DOAC）', en: 'Anticoagulation (DOAC)', for: ['af'], apply: s => { s.anticoag = true; }, text: 'CHA₂DS₂-VASc ≥2（男）／≥3（女）者抗凝，預防左心耳血栓栓塞中風；HAS-BLED 評估出血。', textEn: 'Anticoagulate at CHA₂DS₂-VASc ≥2 (men) / ≥3 (women) to prevent appendage thrombus and stroke; assess bleeding with HAS-BLED.' },
    { id: 'diuretic', zh: '利尿劑（furosemide）', en: 'Loop diuretic (furosemide)', for: ['hfref'], apply: s => { s.spo2 += 3; s.bp[0] -= 4; s.congestion = false; }, text: '排除鈉水、降低肺靜脈壓與水腫；症狀緩解但不降低死亡率，注意血鉀與腎功能。', textEn: 'Clears sodium and water, lowering pulmonary venous pressure and oedema; relieves symptoms without reducing mortality; watch potassium and renal function.' },
    { id: 'gdmt', zh: '四大支柱（ARNI＋β＋MRA＋SGLT2i）', en: 'Four pillars (ARNI + β + MRA + SGLT2i)', for: ['hfref'], apply: s => { s.ef += 8; s.hr = Math.round(s.hr * 0.85); s.remodel = true; }, text: '逆轉神經荷爾蒙活化與心室重塑，數月後射出分率回升；每項都獨立降低死亡率，應盡早四藥並用再滴定。', textEn: 'Reverses neurohormonal activation and remodelling; ejection fraction recovers over months. Each pillar independently lowers mortality — start all four early, then titrate.' },
    { id: 'tavi', zh: '經導管主動脈瓣置換（TAVI）', en: 'TAVI', for: ['as'], apply: s => { s.lvh = false; s.valveOpen = true; s.bp = [122, 72]; }, text: '經股動脈送入可擴張瓣膜撐開狹窄瓣；高齡或高手術風險者首選，需心臟團隊評估。', textEn: 'An expandable valve delivered via the femoral artery props open the stenotic valve; first choice for older or high-surgical-risk patients, decided by a heart team.' },
    { id: 'pericardiocentesis', zh: '心包穿刺', en: 'Pericardiocentesis', for: ['tamponade'], apply: s => { s.effusion = false; s.alternans = false; s.hr = 92; s.bp = [112, 70]; s.spo2 = 97; }, text: '超音波導引劍突下穿刺引流積液，血壓立即回升；之後找出病因（惡性、結核、尿毒、創傷）。', textEn: 'Ultrasound-guided subxiphoid drainage restores blood pressure immediately; then find the cause (malignancy, TB, uraemia, trauma).' }
  ];
  function heart(root, opts) {
    opts = opts || {};
    const st = { mode: opts.mode || 'sinus', applied: [], state: null, playing: true, lead: 'II' };
    let raf = null, disposed = false, lastT = performance.now(), phase = 0, beatT = 0, rrNext = 0.83, ecgBuf = [], ecgX = 0, pIndep = 0;
    function reset() { const m = HEART_MODES.find(x => x.id === st.mode) || HEART_MODES[0]; st.state = JSON.parse(JSON.stringify({ mode: m.id, hr: m.hr, bp: m.bp, spo2: m.spo2, ef: m.ef, p: m.p, qrsW: m.qrsW, st: m.st, rrVar: m.rrVar, block: m.block, occl: m.occl || null, hypo: m.hypo || null, dilated: m.dilated || 1, lvh: !!m.lvh, effusion: !!m.effusion, alternans: !!m.alternans, congestion: m.id === 'hfref' })); st.applied = []; ecgBuf = []; ecgX = 0; }
    reset();
    root.innerHTML = `<div class="tw-heart"><div class="tw-panel tw-view"><div class="tw-toolbar"><label>${t('twCondition')}<select data-hm>${HEART_MODES.map(m => `<option value="${m.id}" ${m.id === st.mode ? 'selected' : ''}>${esc(bi(m, 'zh'))}</option>`).join('')}</select></label><div class="row"><button class="chip" data-hplay>⏸</button><button class="chip" data-hreset>${t('reset')}</button></div></div>
        <div class="tw-heart-stage"><svg viewBox="0 0 600 520" data-hsvg class="tw-heart-svg" role="img" aria-label="${esc(say('心臟數位孿生', 'Heart digital twin'))}"></svg><div class="tw-monitor"><canvas data-ecg width="600" height="110"></canvas><div class="tw-vitals" data-vitals></div></div></div>
        <p class="small muted">${say('程序化數位孿生：腔室、瓣膜、冠狀動脈與傳導系統依心律引擎同步動畫，心電圖由演算法生成；非真實病人影像。', 'Procedural digital twin: chambers, valves, coronaries and conduction animate from a rhythm engine; the ECG is algorithmically generated; not real patient imaging.')}</p></div>
        <div class="tw-panel tw-info"><span class="eyebrow">HEART TWIN · ${say('心律引擎', 'rhythm engine')}</span><h2 data-htitle></h2><p data-htext></p><h3>${t('twInterventions')}</h3><div class="row" data-hrx></div><div class="tw-therapy" data-hrxinfo hidden></div><p class="small"><a data-hcourses href="#catalog?department=cardiology">${say('相關課程 →', 'Related courses →')}</a> · <a href="#procedures?department=cardiology">${say('心臟內科程序庫 →', 'Cardiology library →')}</a> · <a href="#procedures?department=cardiac-surgery">${say('心臟外科程序庫 →', 'Cardiac surgery library →')}</a></p></div></div>`;
    const svg = root.querySelector('[data-hsvg]'), ecg = root.querySelector('[data-ecg]').getContext('2d');
    function mode() { return HEART_MODES.find(x => x.id === st.mode) || HEART_MODES[0]; }
    function drawHeart(contractA, contractV) {
      const s = st.state; const dil = s.dilated; const occl = s.occl;
      const lvScale = 1 - contractV * (0.06 + 0.1 * (s.ef / 65)) ; const raScale = 1 - contractA * 0.07;
      const hypoA = s.hypo && s.hypo.startsWith('anterior') ? (s.hypo.endsWith('recovering') ? 0.5 : 1) : 0; const hypoI = s.hypo && s.hypo.startsWith('inferior') ? (s.hypo.endsWith('recovering') ? 0.5 : 1) : 0;
      const cor = (on, col) => on ? col : 'rgba(200,40,40,.95)';
      svg.innerHTML = `<defs><radialGradient id="hmus" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#e46b6b"/><stop offset=".6" stop-color="#b8333c"/><stop offset="1" stop-color="#7a1c24"/></radialGradient><linearGradient id="hblue" x1="0" x2="1"><stop offset="0" stop-color="#5a7fd6"/><stop offset="1" stop-color="#2d4c9a"/></linearGradient><filter id="hglow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        <g transform="translate(300 270) scale(${dil}) translate(-300 -270)">
        ${s.effusion ? `<ellipse cx="300" cy="280" rx="182" ry="188" fill="rgba(90,150,210,.35)" stroke="#5a96d2" stroke-dasharray="6 4"/>` : ''}
        <path d="M300 92 C300 60 262 48 232 60 C198 74 168 118 170 160 L170 200 C170 240 176 262 184 282 L236 300 L300 292 Z" fill="url(#hblue)" opacity=".95"/>
        <path d="M300 92 C300 60 338 48 368 60 C402 74 432 118 430 160 L430 200 C430 240 424 262 416 282 L364 300 L300 292 Z" fill="#c9566a" opacity=".95"/>
        <path d="M236 70 C250 40 262 34 282 40 L286 92 L236 100 Z" fill="#4e6fc0"/><path d="M364 70 C350 40 338 34 318 40 L314 92 L364 100 Z" fill="#d04a5a"/>
        <path d="M286 40 C300 10 330 6 346 24 L352 60 L320 66 L314 40 Z" fill="#d94b5b"/><path d="M196 110 C170 100 150 110 146 130 L176 140 Z" fill="#4e6fc0"/>
        <path d="M404 110 C430 100 450 110 454 130 L424 140 Z" fill="#d04a5a"/>
        <g transform="translate(300 400) scale(${lvScale.toFixed(3)}) translate(-300 -400)">
          <path d="M184 282 C176 320 190 400 236 448 C262 476 288 496 300 500 C312 496 338 476 364 448 C410 400 424 320 416 282 L364 300 L300 292 L236 300 Z" fill="url(#hmus)"/>
          <path d="M300 292 C308 350 310 420 300 500" stroke="#7a1c24" stroke-width="${s.lvh ? 14 : 9}" fill="none" opacity=".8"/>
          ${hypoA ? `<path d="M236 448 C262 476 288 496 300 500 C312 496 338 476 364 448 C390 420 400 380 404 340 L340 330 C340 380 320 420 300 440 C280 420 260 380 260 340 Z" fill="rgba(60,20,30,${0.55 * hypoA})" stroke="#ffb020" stroke-dasharray="5 4"/>` : ''}
          ${hypoI ? `<path d="M236 448 C262 476 288 496 300 500 C312 496 338 476 364 448 L340 420 C330 440 315 452 300 456 C285 452 270 440 260 420 Z" fill="rgba(60,20,30,${0.55 * hypoI})" stroke="#ffb020" stroke-dasharray="5 4"/>` : ''}
          ${s.lvh ? `<path d="M364 300 C410 360 410 420 364 448" stroke="#8a1c24" stroke-width="18" fill="none" opacity=".55"/>` : ''}
        </g>
        <g transform="translate(228 290) scale(${raScale.toFixed(3)}) translate(-228 -290)"></g>
        <path d="M232 296 l20 -10 l20 10" stroke="#fff" stroke-width="3" fill="none" opacity=".85"/><path d="M348 296 l20 -10 l20 10" stroke="#fff" stroke-width="3" fill="none" opacity=".85"/>
        <path d="M268 112 a16 10 0 0 0 32 0" stroke="#fff" stroke-width="3" fill="${s.valveOpen ? '#9df' : 'none'}" opacity=".85"/><path d="M300 100 a14 9 0 0 0 28 0" stroke="${s.lvh && !s.valveOpen ? '#ffd27a' : '#fff'}" stroke-width="${s.lvh && !s.valveOpen ? 5 : 3}" fill="none" opacity=".9"/>
        <path d="M318 80 C330 110 344 170 350 230 C356 290 348 380 318 450" stroke="${cor(!occl || occl !== 'lad', '#f3c9c9')}" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M322 86 C360 110 392 150 404 200 C412 240 404 300 390 340" stroke="#f3c9c9" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <path d="M282 84 C250 110 212 150 200 200 C190 250 210 330 262 420" stroke="${cor(!occl || occl !== 'rca', '#f3c9c9')}" stroke-width="5" fill="none" stroke-linecap="round"/>
        ${occl === 'lad' ? `<circle cx="346" cy="196" r="11" fill="#2b0b0b" stroke="#ff3b3b" stroke-width="3"/><text x="362" y="190" font-size="13" fill="#fff" font-weight="700">LAD ✕</text>` : ''}${occl === 'rca' ? `<circle cx="204" cy="212" r="11" fill="#2b0b0b" stroke="#ff3b3b" stroke-width="3"/><text x="150" y="208" font-size="13" fill="#fff" font-weight="700">RCA ✕</text>` : ''}
        ${s.stent ? `<rect x="336" y="184" width="22" height="26" rx="4" fill="none" stroke="#9df" stroke-width="2.5" stroke-dasharray="3 2"/>` : ''}
        <g filter="url(#hglow)" data-cond></g>
        <g font-size="12" fill="#fff" font-weight="600" opacity=".9"><text x="196" y="190">RA</text><text x="384" y="190">LA</text><text x="236" y="380">RV</text><text x="356" y="380">LV</text><text x="326" y="30">${say('主動脈', 'Aorta')}</text><text x="230" y="30">${say('肺動脈', 'PA')}</text></g>
        </g>`;
      // conduction system dots
      const cond = svg.querySelector('[data-cond]');
      const nodes = [[222, 150], [296, 262], [300, 300], [262, 360], [338, 360], [252, 440], [348, 440]];
      const blocked = s.block === 3;
      const wave = phase; // 0..1 within RR
      let html = `<circle cx="222" cy="150" r="6" fill="${wave < 0.12 && s.p ? '#ffe36b' : '#6b5a1c'}"/><circle cx="296" cy="262" r="6" fill="${!blocked && wave > 0.12 && wave < 0.22 ? '#ffe36b' : '#6b5a1c'}"/>`;
      if (s.p && wave < 0.14) { const f = wave / 0.14; html += `<circle cx="${222 + (296 - 222) * f}" cy="${150 + (262 - 150) * f}" r="5" fill="#fff36b"/><circle cx="${222 + (380 - 222) * f}" cy="${150 + (170 - 150) * f}" r="4" fill="#fff36b" opacity=".8"/>`; }
      if (!blocked && wave > 0.2 && wave < 0.34) { const f = (wave - 0.2) / 0.14; [[262, 360], [338, 360]].forEach(([x, y], i) => { html += `<circle cx="${300 + (x - 300) * f}" cy="${300 + (y - 300) * f}" r="5" fill="#fff36b"/>`; }); if (f > 0.5) { const g = (f - 0.5) * 2; [[252, 440], [348, 440]].forEach(([x, y], i) => { const [sx, sy] = nodes[3 + i]; html += `<circle cx="${sx + (x - sx) * g}" cy="${sy + (y - sy) * g}" r="4" fill="#fff36b"/>`; }); } }
      if (blocked && !s.paced) { if (wave > 0.2 && wave < 0.3) html += `<circle cx="340" cy="400" r="9" fill="#ff8a3b" opacity=".8"/>`; }
      if (s.paced && wave > 0.2 && wave < 0.26) html += `<circle cx="250" cy="430" r="9" fill="#7bd4ff"/><text x="262" y="425" font-size="11" fill="#7bd4ff">PACE</text>`;
      cond.innerHTML = html;
    }
    function ecgSample(tt) {
      // tt: time within RR interval (s); returns mV-like value
      const s = st.state; const g = (x, m, w, a) => a * Math.exp(-((x - m) ** 2) / (2 * w * w));
      let v = 0;
      if (s.p && !(s.block === 3)) v += g(tt, 0.08, 0.025, 0.15);
      if (s.block === 3 && s.p) { v += g(((tt + pIndep) % 0.75), 0.08, 0.025, 0.15); }
      if (s.paced) v += g(tt, 0.195, 0.004, 1.4);
      const w = 0.012 * s.qrsW; const q0 = 0.2;
      v += g(tt, q0, w, -0.12) + g(tt, q0 + 0.02 * s.qrsW, w * 1.1, s.lvh ? 1.9 : 1.25) + g(tt, q0 + 0.045 * s.qrsW, w * 1.2, -0.3);
      if (s.st) v += s.st * 0.3 * (tt > q0 + 0.05 && tt < q0 + 0.26 ? Math.min(1, (tt - q0 - 0.05) / 0.03) : 0);
      v += g(tt, q0 + 0.26 + 0.05 * (s.qrsW - 1), 0.05, s.qrsW > 1.5 ? -0.28 : 0.3);
      if (s.mode === 'af') v += 0.025 * Math.sin(tt * 90) * Math.sin(tt * 37 + 1);
      if (s.alternans) v *= (ecgBuf.length % 2) ? 1 : 0.6;
      return v;
    }
    function drawEcg(dt) {
      const W = ecg.canvas.width, H = ecg.canvas.height; const pxPerSec = 150;
      const samples = Math.max(1, Math.round(dt * 300));
      for (let i = 0; i < samples; i++) { const v = ecgSample(beatT + (i / samples) * dt); ecgBuf.push(v); }
      if (ecgBuf.length > W * 2) ecgBuf = ecgBuf.slice(-W * 2);
      ecg.fillStyle = '#061a10'; ecg.fillRect(0, 0, W, H);
      ecg.strokeStyle = 'rgba(80,160,110,.25)'; ecg.lineWidth = 1; for (let x = 0; x < W; x += 30) { ecg.beginPath(); ecg.moveTo(x, 0); ecg.lineTo(x, H); ecg.stroke(); } for (let y = 0; y < H; y += 30) { ecg.beginPath(); ecg.moveTo(0, y); ecg.lineTo(W, y); ecg.stroke(); }
      ecg.strokeStyle = '#4dff8f'; ecg.lineWidth = 2; ecg.beginPath();
      const n = Math.min(ecgBuf.length, Math.floor(W / (pxPerSec / 300)));
      for (let i = 0; i < n; i++) { const x = W - (n - i) * (pxPerSec / 300); const y = H * 0.62 - ecgBuf[ecgBuf.length - n + i] * 48; if (i) ecg.lineTo(x, y); else ecg.moveTo(x, y); }
      ecg.stroke();
      ecg.fillStyle = '#9fe'; ecg.font = '12px system-ui'; ecg.fillText(say('導程 II · 25 mm/s', 'Lead II · 25 mm/s'), 8, 14);
    }
    function vitals() {
      const s = st.state; const m = mode();
      root.querySelector('[data-vitals]').innerHTML = `<span><b>HR</b> ${s.hr}${s.mode === 'af' ? ' ' + say('不規則', 'irregular') : ''}</span><span><b>BP</b> ${s.bp[0]}/${s.bp[1]}</span><span><b>SpO₂</b> ${s.spo2}%</span><span><b>EF</b> ${s.ef}%</span><span><b>CO</b> ${(s.hr * (s.ef / 100) * (s.dilated > 1 ? 150 : 110) / 1000).toFixed(1)} L/min</span>${s.congestion ? `<span class="warn">${say('肺鬱血', 'congestion')}</span>` : ''}${s.anticoag ? `<span class="ok">${say('已抗凝', 'anticoagulated')}</span>` : ''}`;
      root.querySelector('[data-htitle]').textContent = bi(m, 'zh');
      root.querySelector('[data-htext]').textContent = bi(m, 'text');
      root.querySelector('[data-hrx]').innerHTML = HEART_RX.filter(r => r.for.includes(m.id)).map(r => `<button class="chip ${st.applied.includes(r.id) ? 'active' : ''}" data-hrx-btn="${r.id}" ${st.applied.includes(r.id) ? 'disabled' : ''}>${esc(bi(r, 'zh'))}</button>`).join('');
      root.querySelectorAll('[data-hrx-btn]').forEach(b => b.onclick = () => { const r = HEART_RX.find(x => x.id === b.dataset.hrxBtn); r.apply(st.state); st.applied.push(r.id); root.querySelector('[data-hrxinfo]').hidden = false; root.querySelector('[data-hrxinfo]').innerHTML = `<b>${esc(bi(r, 'zh'))}</b><p>${esc(bi(r, 'text'))}</p>`; vitals(); window.HT.app.recordSim('heart-twin-' + m.id, 100); });
      root.querySelector('[data-hcourses]').href = '#catalog?department=' + (m.dept || 'cardiology');
      currentContext = { id: 'heart-twin-' + m.id, title: '心臟數位孿生 · ' + m.zh, titleEn: 'Heart twin · ' + m.en, summary: m.text + ' 目前：HR ' + s.hr + ' BP ' + s.bp.join('/') + ' EF ' + s.ef + '%' + (st.applied.length ? ' 已處置：' + st.applied.join(', ') : ''), summaryEn: m.textEn + ' Now: HR ' + s.hr + ' BP ' + s.bp.join('/') + ' EF ' + s.ef + '%' };
    }
    function loop(now) {
      if (disposed) return;
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      if (st.playing) {
        beatT += dt; pIndep += dt * 0;
        if (beatT >= rrNext) { beatT -= rrNext; const s = st.state; const base = 60 / s.hr; rrNext = base * (1 + (Math.random() * 2 - 1) * s.rrVar); if (s.block === 3 && !s.paced) rrNext = 60 / 36; }
        phase = beatT / rrNext;
        const contractA = st.state.p && !(st.state.block === 3) && phase > 0.05 && phase < 0.2 ? Math.sin((phase - 0.05) / 0.15 * Math.PI) : 0;
        const contractV = phase > 0.22 && phase < 0.55 ? Math.sin((phase - 0.22) / 0.33 * Math.PI) : 0;
        drawHeart(contractA, contractV); drawEcg(dt);
      }
      raf = requestAnimationFrame(loop);
    }
    root.querySelector('[data-hm]').onchange = e => { st.mode = e.target.value; reset(); root.querySelector('[data-hrxinfo]').hidden = true; vitals(); };
    root.querySelector('[data-hplay]').onclick = e => { st.playing = !st.playing; e.currentTarget.textContent = st.playing ? '⏸' : '▶'; };
    root.querySelector('[data-hreset]').onclick = () => { reset(); root.querySelector('[data-hrxinfo]').hidden = true; vitals(); };
    vitals(); raf = requestAnimationFrame(loop);
    return () => { disposed = true; if (raf) cancelAnimationFrame(raf); };
  }

  // ================================================================ page
  async function render(root, params) {
    await ensureBrain();
    const tab = params.get('tab') === 'heart' ? 'heart' : 'brain';
    root.innerHTML = `<div class="section-head"><div><span class="eyebrow">DIGITAL TWINS · REAL TEMPLATE + ALGORITHMS</span><h1>${t('twTitle')}</h1><p class="subtext">${say('內科不用唸的：在真實 MRI 模板上看萎縮、梗塞、病灶在哪裡；按下藥物或治療，看哪個腦區／路徑被作用；心臟孿生依心律引擎跳動，試試電擊、PCI、β 阻斷劑會怎樣。', 'Internal medicine you can see: on a real MRI template, find atrophy, infarcts and lesions; press a drug or therapy to see which region or pathway it acts on; the heart twin beats from a rhythm engine — try a shock, PCI or a beta-blocker.')}</p></div></div>
      <div class="tier-tabs"><button data-twtab="brain" class="${tab === 'brain' ? 'active' : ''}">🧠 ${t('twBrain')}</button><button data-twtab="heart" class="${tab === 'heart' ? 'active' : ''}">❤ ${t('twHeart')}</button></div><div id="twBody"></div>
      <p class="form-note">${say('腦影像來源：MNI ICBM152 2009a 非線性對稱模板（McConnell Brain Imaging Centre，可再散布）；病變為演算法模擬，不是任何病人的影像。心臟為程序化模型。所有內容為教學，不作個人診斷或用藥依據。', 'Brain images: MNI ICBM152 2009a nonlinear symmetric template (McConnell Brain Imaging Centre, redistributable); pathology is simulated and is not any patient’s image. The heart is a procedural model. Education only.')}</p>`;
    let cleanup = null;
    const mount = which => { if (cleanup) cleanup(); cleanup = which === 'heart' ? heart(root.querySelector('#twBody'), { mode: params.get('mode') }) : brain(root.querySelector('#twBody'), { condition: params.get('condition') }); root.querySelectorAll('[data-twtab]').forEach(b => b.classList.toggle('active', b.dataset.twtab === which)); };
    root.querySelectorAll('[data-twtab]').forEach(b => b.onclick = () => mount(b.dataset.twtab));
    mount(tab);
    return () => { if (cleanup) cleanup(); currentContext = null; };
  }
  window.HT = window.HT || {};
  window.HT.twins = { ensureBrain, brain, heart, render, HEART_MODES, get currentContext() { return currentContext; } };
})(window);
