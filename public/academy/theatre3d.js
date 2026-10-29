/* 3D digital-twin theatre (v3.9). A procedural, physically lit modern operating room / resus bay / ward
   rendered with three.js (vendor/three.js, MIT, classic build): an articulated operating table (head,
   back, seat and leg sections, headrest, arm boards with straps, side rails with clamps, column with
   bellows, base, pendant control) and a draped patient whose prepped field matches the department
   (cranial, eye, ear, mouth, neck, chest, abdomen, pelvis/lithotomy, limb, back); multi-pod LED lights
   on spring arms, an anaesthesia machine with flowmeters, vaporisers, bellows and breathing circuit,
   a ceiling-pendant patient monitor with live waveforms, IV pole and pumps, electrosurgical unit,
   suction, forced-air warmer, kick bucket, Mayo stand and back table with recognisable instruments laid
   out in order (plus each department's set), specimen pots, scrub sink, X-ray lightbox and wall PACS,
   C-arm, operating microscope, endoscopy tower and ultrasound cart. Every pick on the patient, the table
   or any equipment opens the "Imaging & digital twin" panel (table-imaging.js) with licensed REAL images;
   over http(s) the screens and lightbox also show those real images as textures (credited in the
   panel), under file:// they keep procedural canvases labelled as simulations. Static geometry is merged
   per material with vertex colours to keep phones fast. Teaching visualisation only — not a real patient,
   not a real device interface, no doses or device settings. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const zh = () => !window.HT.i18n || window.HT.i18n.isZh();
  const t = k => window.HT.i18n ? window.HT.i18n.t(k) : k;
  const say = (z, e) => zh() ? z : e;
  const T = (k, z, e) => { const v = window.HT.i18n && window.HT.i18n.t ? window.HT.i18n.t(k) : null; return v && v !== k ? v : say(z, e); };
  const pk = v => v && typeof v === 'object' ? (zh() ? v.zh : v.en) : String(v || '');
  const FILE = location.protocol === 'file:';
  let THREE = null, loading = null, webglAvailable;

  function photoPlaneSize(width, height) {
    const w = Number(width), h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return [4.2, 2.6];
    const ratio = w / h;
    return ratio > 4.2 / 2.6 ? [4.2, 4.2 / ratio] : [2.6 * ratio, 2.6];
  }
  // Probe once, then release the probe. Repeated probes can evict the live canvas on Safari/mobile.
  function available() {
    if (webglAvailable !== undefined) return webglAvailable;
    let gl = null;
    try {
      const c = document.createElement('canvas');
      gl = (window.WebGLRenderingContext || window.WebGL2RenderingContext) && (c.getContext('webgl2') || c.getContext('webgl'));
      webglAvailable = !!gl;
    } catch (e) { webglAvailable = false; }
    finally { try { const ext = gl && gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) {} }
    return webglAvailable;
  }
  function ensure() {
    if (window.THREE) { THREE = window.THREE; return Promise.resolve(THREE); }
    if (!loading) loading = window.HT.loadScript('vendor/three.js').then(() => {
      if (!window.THREE || !window.THREE.WebGLRenderer) throw new Error('3D library unavailable');
      THREE = window.THREE; return THREE;
    }).catch(error => { loading = null; throw error; });
    return loading;
  }

  // ---------------------------------------------------------------- layout (metres; table at the origin, head of table at -x)
  const POS = {
    field: [0, 0, 0], monitor: [-1.7, 0, -1.25], anesthesia: [-2.7, 0, -0.5], tray: [1.0, 0, 1.15], cart: [3.3, 0, 1.9], drains: [1.5, 0, -1.35],
    device: [-0.5, 0, 2.0], imaging: [3.9, 0, -2.8], lab: [4.3, 0, 0.6], chart: [-3.7, 0, 1.9], whiteboard: [-4.9, 0, -3.3], huddle: [3.0, 0, 3.3],
    recovery: [-3.9, 0, 3.1], door: [0, 0, 4.35]
  };
  // equipment that is not a workflow station but is clickable (info card + imaging panel)
  const EXTRA = {
    lights: [0, 0, 0], backtable: [2.5, 0, 0.15], specimen: [2.72, 0, 0.72], esu: [-0.3, 0, -1.62], warmer: [-1.12, 0, -1.02], kick: [1.18, 0, -0.66],
    ivpole: [-1.08, 0, 1.32], sink: [-1.8, 0, 4.22], lightbox: [-5.44, 0, -0.7], wallpacs: [-5.44, 0, 0.78], carm: [4.6, 0, -1.35], microscope: [-4.55, 0, -1.85],
    endo: [-3.05, 0, -3.35], us: [2.3, 0, -2.75]
  };
  const ROLE_POS = { player: [0.7, 0, 1.0], mentor: [0.2, 0, -1.0], anesthetist: [-2.1, 0, -0.35], scrub: [1.6, 0, 1.05], circulating: [2.7, 0, 2.5], extra: [-1.9, 0, 1.6], nurse: [-2.1, 0, -0.35], pharmacist: [1.6, 0, 1.05] };
  const ROOM = { w: 11, d: 9, h: 3.2 };
  const PAD = 0.95; // top of the table pads
  const REGION = {
    head: ['頭部／腦', 'Head / brain', 'tiRHead'], face: ['臉部／眼睛', 'Face / eyes', 'tiRFace'], neck: ['耳鼻喉／頸部／甲狀腺', 'ENT / neck / thyroid', 'tiRNeck'], mouth: ['口腔／牙齒', 'Mouth / teeth', 'tiRMouth'],
    chest: ['胸部／心臟／肺', 'Chest / heart / lungs', 'tiRChest'], breast: ['乳房', 'Breast', 'tiRBreast'], 'abdomen-upper': ['上腹部', 'Upper abdomen', 'tiRAbdUpper'], 'abdomen-lower': ['下腹部', 'Lower abdomen', 'tiRAbdLower'],
    pelvis: ['骨盆／泌尿生殖／子宮', 'Pelvis / urogenital / uterus', 'tiRPelvis'], spine: ['脊椎／背部', 'Spine / back', 'tiRSpine'], 'upper-limb': ['上肢／手', 'Upper limb / hand', 'tiRUpperLimb'], 'lower-limb': ['下肢／髖／膝', 'Lower limb / hip / knee', 'tiRLowerLimb'], skin: ['皮膚', 'Skin', 'tiRSkin']
  };
  const PART = {
    headrest: ['頭架／頭墊', 'Headrest', 'tiPHeadrest'], 'arm-board': ['手臂板與綁帶', 'Arm board & strap', 'tiPArmBoard'], 'table-top': ['分節台面', 'Articulated table top', 'tiPTableTop'], 'leg-section': ['腿板／腳架', 'Leg section / stirrups', 'tiPLegSection'],
    column: ['立柱、底座與手控器', 'Column, base & hand control', 'tiPColumn'], 'side-rail': ['側軌與夾具', 'Side rails & clamps', 'tiPSideRail'], 'radiolucent-top': ['可透 X 光碳纖維台面', 'X-ray-translucent carbon top', 'tiPRadiolucent'], pad: ['台墊與防壓墊', 'Pads & pressure care', 'tiPPad']
  };
  const nm = v => v ? T(v[2], v[0], v[1]) : '';

  // ---------------------------------------------------------------- canvas helpers
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  function labelSprite(text, opts) {
    opts = opts || {}; const pad = 14, fs = opts.size || 30; const c = canvas(2, 2); const x = c.getContext('2d'); x.font = `${opts.weight || 700} ${fs}px system-ui, "Noto Sans TC", sans-serif`;
    const lines = String(text).split('\n'); const w = Math.max(...lines.map(l => x.measureText(l).width)) + pad * 2, h = lines.length * fs * 1.25 + pad * 1.6;
    c.width = Math.ceil(w); c.height = Math.ceil(h); const g = c.getContext('2d'); g.font = `${opts.weight || 700} ${fs}px system-ui, "Noto Sans TC", sans-serif`;
    g.fillStyle = opts.bg || 'rgba(16,28,32,.82)'; g.beginPath(); if (g.roundRect) g.roundRect(0, 0, c.width, c.height, 14); else g.rect(0, 0, c.width, c.height); g.fill(); if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = 4; g.stroke(); }
    g.fillStyle = opts.color || '#fff'; g.textBaseline = 'top'; lines.forEach((l, i) => g.fillText(l, pad, pad * 0.8 + i * fs * 1.25));
    const m = new THREE.SpriteMaterial({ map: tex(c), transparent: true, depthTest: !opts.overlay }); const s = new THREE.Sprite(m); const k = (opts.scale || 0.0045); s.scale.set(c.width * k, c.height * k, 1); s.renderOrder = 10; return s;
  }
  function noise(g, w, h, n, a) { for (let i = 0; i < n; i++) { const v = Math.random() > 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }
  function floorTexture(type) {
    const c = canvas(512, 512), g = c.getContext('2d'); const base = type === 'ward' || type === 'clinic' ? '#cfc8b8' : type === 'er' ? '#c3cdd0' : '#b7c6c1'; g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, 5000, 0.07);
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.04})`; g.beginPath(); g.ellipse(Math.random() * 512, Math.random() * 512, 30 + Math.random() * 60, 12 + Math.random() * 30, Math.random() * 3, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = type === 'or' || type === 'imaging' ? 'rgba(70,90,85,.18)' : 'rgba(60,70,60,.25)'; g.lineWidth = 2; const step = type === 'or' || type === 'imaging' ? 256 : 128; for (let i = 0; i <= 512; i += step) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ROOM.w / 2.4, ROOM.d / 2.4); return t;
  }
  function wallTexture(type) {
    const c = canvas(512, 256), g = c.getContext('2d'); const base = type === 'ward' || type === 'clinic' ? '#ece6d9' : type === 'er' ? '#e1e9ec' : '#d3e3df';
    const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, base); grd.addColorStop(1, type === 'or' || type === 'imaging' ? '#c3d6d1' : '#d9d3c6'); g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
    noise(g, 512, 256, 1200, 0.035); g.fillStyle = 'rgba(80,100,95,.22)'; for (let i = 0; i < 512; i += 128) g.fillRect(i, 0, 2, 256); g.fillStyle = 'rgba(255,255,255,.3)'; for (let i = 2; i < 512; i += 128) g.fillRect(i, 0, 1, 256);
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 1); return t;
  }
  function carbonTexture() { const c = canvas(128, 128), g = c.getContext('2d'); g.fillStyle = '#1d2226'; g.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) { const on = ((x + y) / 8) % 2; g.fillStyle = on ? '#2b3237' : '#171b1e'; g.fillRect(x, y, 8, 4); g.fillStyle = on ? '#171b1e' : '#2b3237'; g.fillRect(x, y + 4, 8, 4); } const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 4); return t; }
  function ledTexture() { const c = canvas(128, 128), g = c.getContext('2d'); g.fillStyle = '#fffaf0'; g.fillRect(0, 0, 128, 128); const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(225,230,235,1)'); g.fillStyle = grd; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff8e6'; for (let r = 12; r < 60; r += 13) { const n = Math.round(r * 0.5); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 4, 0, Math.PI * 2); g.fill(); } } g.strokeStyle = 'rgba(160,170,178,.6)'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.stroke(); const t = tex(c); return t; }
  function diffuserTexture() { const c = canvas(256, 256), g = c.getContext('2d'); g.fillStyle = '#f3f6f6'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(150,165,165,.45)'; for (let y = 4; y < 256; y += 8) for (let x = 4 + (y % 16 ? 4 : 0); x < 256; x += 8) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); } g.strokeStyle = 'rgba(120,135,135,.6)'; g.lineWidth = 3; for (let i = 0; i <= 256; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); } const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); return t; }
  const SIM = () => say('教學示意 · SIMULATION', 'SIMULATION · teaching drawing');
  function simLabel(g, w, h) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, h - 26, w, 26); g.fillStyle = '#ffd166'; g.font = '700 15px system-ui, "Noto Sans TC", sans-serif'; g.fillText(SIM(), 10, h - 8); }
  function screenCanvas(kind, ctx) {
    const c = canvas(512, 320), g = c.getContext('2d'); g.fillStyle = '#071015'; g.fillRect(0, 0, 512, 320);
    g.fillStyle = '#9fe'; g.font = '700 20px system-ui, "Noto Sans TC", sans-serif';
    if (kind === 'imaging' || kind === 'pacs') { g.fillText(say('影像工作站 · PACS', 'Imaging workstation · PACS'), 16, 30); for (let i = 0; i < 2; i++) { g.fillStyle = '#111c22'; g.fillRect(16 + i * 248, 50, 232, 236); g.fillStyle = '#9ab'; g.font = '14px system-ui'; g.fillText(i ? say('冠狀 · T1', 'Coronal · T1') : say('軸狀 · T1', 'Axial · T1'), 24 + i * 248, 70); const cx = 132 + i * 248, cy = 172; const grd = g.createRadialGradient(cx, cy, 10, cx, cy, 90); grd.addColorStop(0, '#cfd3d6'); grd.addColorStop(0.7, '#7a8288'); grd.addColorStop(1, '#111c22'); g.fillStyle = grd; g.beginPath(); g.ellipse(cx, cy, 84, i ? 92 : 96, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#2b3a44'; g.lineWidth = 3; for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(cx + (k - 3) * 14, cy - 20 + Math.abs(k - 3) * 6, 10, 22, 0, 0, Math.PI * 2); g.stroke(); } } simLabel(g, 512, 320); }
    else if (kind === 'anesthesia') {
      g.fillText(say('麻醉工作站 · 監測', 'Anaesthesia workstation · monitoring'), 14, 28);
      const waves = [['Paw', '#ffd166', ph => ph < 0.35 ? Math.sin(ph / 0.35 * Math.PI) * 0.9 : 0.05], ['Flow', '#06d6a0', ph => ph < 0.35 ? Math.sin(ph / 0.35 * Math.PI) : ph < 0.75 ? -Math.sin((ph - 0.35) / 0.4 * Math.PI) * 0.8 : 0], ['CO₂', '#74c0fc', ph => ph < 0.3 ? 0.05 : ph < 0.38 ? (ph - 0.3) / 0.08 : ph < 0.9 ? 1 + (ph - 0.38) * 0.15 : Math.max(0, 1 - (ph - 0.9) / 0.05)]];
      waves.forEach(([lab, colr, fn], r) => { const y0 = 70 + r * 78; g.fillStyle = '#9ab'; g.font = '14px system-ui'; g.fillText(lab, 14, y0 - 18); g.strokeStyle = colr; g.lineWidth = 2.5; g.beginPath(); for (let x = 0; x <= 330; x += 3) { const ph = (x / 110) % 1; const y = y0 + 20 - fn(ph) * 34; if (x) g.lineTo(60 + x, y); else g.moveTo(60 + x, y); } g.stroke(); });
      g.fillStyle = '#74c0fc'; g.font = '700 16px system-ui'; g.fillText(say('EtCO₂ 量測', 'EtCO₂ measured'), 410, 220); g.font = '700 44px system-ui'; g.fillText(String((ctx && ctx.etco2) || 36), 412, 268);
      g.fillStyle = '#cfe'; g.font = '13px system-ui, "Noto Sans TC", sans-serif'; g.fillText(say('呼吸器與麻醉氣體設定', 'Ventilator & agent settings'), 404, 70); g.fillText(say('由麻醉科醫師負責', 'belong to the anaesthetist'), 404, 90); g.fillText(say('本站不顯示設定值', 'no settings shown here'), 404, 110);
    }
    else if (kind === 'whiteboard') { g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 512, 320); g.fillStyle = '#1b3a4b'; g.font = '700 22px system-ui, "Noto Sans TC", sans-serif'; g.fillText(say('WHO 手術安全核對', 'WHO surgical safety checklist'), 18, 36); g.font = '18px system-ui, "Noto Sans TC", sans-serif'; [say('☑ 病人身分・手術・側別', '☑ Identity · procedure · side'), say('☑ 過敏・困難氣道・失血風險', '☑ Allergy · airway · blood loss'), say('☑ 預防性抗生素', '☑ Antibiotic prophylaxis'), say('☐ 器械・紗布・針頭計數', '☐ Instrument / swab / needle count'), say('☐ 標本標示', '☐ Specimen labelling')].forEach((l, i) => g.fillText(l, 22, 80 + i * 40)); g.fillStyle = '#c0392b'; g.fillText(String((ctx && ctx.title) || '').slice(0, 30), 22, 290); }
    else if (kind === 'chart') { g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, 512, 320); g.fillStyle = '#1b3a4b'; g.font = '700 20px system-ui, "Noto Sans TC", sans-serif'; g.fillText(say('電子病歷', 'Electronic record'), 16, 30); g.font = '15px system-ui, "Noto Sans TC", sans-serif'; const txt = (ctx && ctx.patient) || ''; let y = 62; for (let i = 0; i < txt.length && y < 300; i += zh() ? 26 : 1) { let line = zh() ? txt.slice(i, i + 26) : ''; if (!zh()) { const rest = txt.slice(i).split(' '); line = ''; while (rest.length && (line + rest[0]).length < 52) line += rest.shift() + ' '; i += Math.max(0, line.length - 1); if (!line) break; } g.fillText(line, 16, y); y += 24; } }
    else if (kind === 'xray' || kind === 'fluoro') { g.fillStyle = '#020405'; g.fillRect(0, 0, 512, 320); const cx = 256, cy = 150; g.fillStyle = '#1d2326'; g.beginPath(); g.ellipse(cx, cy, 170, 130, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#0b0f11'; g.beginPath(); g.ellipse(cx - 75, cy, 62, 105, 0.05, 0, Math.PI * 2); g.ellipse(cx + 75, cy, 62, 105, -0.05, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(210,215,218,.55)'; g.lineWidth = 5; for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(cx, cy - 80 + i * 26, 150, 34, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); } g.fillStyle = 'rgba(225,228,230,.75)'; g.fillRect(cx - 9, 20, 18, 270); g.beginPath(); g.ellipse(cx + 22, cy + 46, 58, 48, 0.4, 0, Math.PI * 2); g.fill(); g.fillStyle = '#9fe'; g.font = '700 14px system-ui'; g.fillText(kind === 'fluoro' ? 'FLUORO' : 'R', 14, 24); simLabel(g, 512, 320); }
    else if (kind === 'bone') { g.fillStyle = '#020405'; g.fillRect(0, 0, 512, 320); g.fillStyle = '#20272a'; g.fillRect(150, 0, 212, 320); g.fillStyle = 'rgba(230,232,233,.85)'; g.beginPath(); g.ellipse(256, 70, 62, 50, 0, 0, Math.PI * 2); g.fill(); g.fillRect(226, 70, 60, 250); g.fillStyle = '#20272a'; g.fillRect(242, 90, 28, 230); g.strokeStyle = '#020405'; g.lineWidth = 3; g.beginPath(); g.moveTo(222, 170); g.lineTo(290, 182); g.stroke(); simLabel(g, 512, 320); }
    else if (kind === 'us') { g.fillStyle = '#000'; g.fillRect(0, 0, 512, 320); g.save(); g.beginPath(); g.moveTo(256, 18); g.arc(256, 18, 280, Math.PI * 0.3, Math.PI * 0.7); g.closePath(); g.clip(); g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, 512, 320); for (let i = 0; i < 2600; i++) { const v = 40 + Math.random() * 120; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * 512, 20 + Math.random() * 300, 2, 1.4); } g.fillStyle = '#050505'; g.beginPath(); g.ellipse(256, 170, 70, 46, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(230,230,230,.7)'; g.lineWidth = 3; g.beginPath(); g.ellipse(256, 170, 74, 50, 0, 0, Math.PI * 2); g.stroke(); g.restore(); g.fillStyle = '#9fe'; g.font = '700 14px system-ui'; g.fillText('US', 14, 24); simLabel(g, 512, 320); }
    else if (kind === 'endo' || kind === 'lap') { const grd = g.createRadialGradient(256, 150, 10, 256, 150, 270); grd.addColorStop(0, kind === 'lap' ? '#f6d8b8' : '#4a0f12'); grd.addColorStop(0.35, kind === 'lap' ? '#e7a383' : '#b94a4c'); grd.addColorStop(1, '#2a0607'); g.fillStyle = grd; g.fillRect(0, 0, 512, 320); g.strokeStyle = 'rgba(255,220,210,.35)'; g.lineWidth = 6; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(256, 150, 60 + i * 45, 40 + i * 30, 0, 0, Math.PI * 2); g.stroke(); } if (kind === 'lap') { g.fillStyle = '#9aa4aa'; g.save(); g.translate(60, 300); g.rotate(-0.6); g.fillRect(0, -8, 230, 16); g.restore(); g.save(); g.translate(452, 300); g.rotate(-2.55); g.fillRect(0, -8, 230, 16); g.restore(); } g.fillStyle = 'rgba(255,255,255,.65)'; g.beginPath(); g.ellipse(210, 110, 18, 7, -0.4, 0, Math.PI * 2); g.fill(); simLabel(g, 512, 320); }
    else if (kind === 'histo' || kind === 'smear' || kind === 'lab') { g.fillStyle = kind === 'histo' ? '#f2c8d8' : '#f3ece8'; g.fillRect(0, 0, 512, 320); for (let i = 0; i < 140; i++) { const x = Math.random() * 512, y = Math.random() * 300; if (kind === 'histo') { g.fillStyle = 'rgba(110,40,140,.75)'; g.beginPath(); g.ellipse(x, y, 5 + Math.random() * 4, 4 + Math.random() * 3, Math.random() * 3, 0, Math.PI * 2); g.fill(); } else { g.fillStyle = 'rgba(205,90,90,.75)'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(240,190,190,.8)'; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); } } g.fillStyle = 'rgba(90,40,150,.9)'; g.beginPath(); g.arc(300, 140, 22, 0, Math.PI * 2); g.fill(); simLabel(g, 512, 320); }
    else { g.fillText(say('資訊', 'Info'), 16, 30); g.fillStyle = '#4dff8f'; g.font = '700 18px system-ui'; g.fillText((ctx && ctx.title) || '', 16, 70); }
    return c;
  }
  function fieldCanvas(type, progress) {
    const c = canvas(512, 384), g = c.getContext('2d'); const p = Math.max(0, Math.min(1, progress || 0));
    if (/^bedside/.test(type)) {
      g.fillStyle = '#dcebf0'; g.fillRect(0, 0, 512, 384);
      g.fillStyle = '#f2c9a0'; g.beginPath(); g.ellipse(125, 170, 54, 65, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#a4c9d8'; g.fillRect(182, 105, 270, 155);
      g.fillStyle = '#163e48'; g.font = '700 22px system-ui'; g.fillText(say('床邊評估・非侵入性示意', 'Bedside assessment · schematic'), 16, 40);
      g.font = '18px system-ui'; g.fillText(say('觀察 → 核對證據 → 團隊判讀', 'Observe → verify evidence → review'), 20, 320);
      return c;
    }
    g.fillStyle = '#c9864f'; g.fillRect(0, 0, 512, 384);
    const grd = g.createRadialGradient(256, 192, 40, 256, 192, 300); grd.addColorStop(0, 'rgba(214,140,70,.5)'); grd.addColorStop(1, 'rgba(120,58,20,.75)'); g.fillStyle = grd; g.fillRect(0, 0, 512, 384); noise(g, 512, 384, 900, 0.08); // iodine prep
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 10; g.strokeRect(6, 6, 500, 372); // incise-drape edge
    if (type === 'uterus') { if (p > 0.05) { g.strokeStyle = '#8a2b24'; g.lineWidth = 5; g.beginPath(); g.moveTo(130, 250); g.quadraticCurveTo(256, 280, 382, 250); g.stroke(); } if (p > 0.25) { g.fillStyle = '#c9544a'; g.beginPath(); g.ellipse(256, 240, 130, 52, 0, 0, Math.PI * 2); g.fill(); } if (p > 0.45) { g.fillStyle = '#d98a8a'; g.beginPath(); g.ellipse(256, 200, 120, 90, 0, Math.PI, 0); g.fill(); g.strokeStyle = '#7a2222'; g.lineWidth = 4; g.beginPath(); g.moveTo(190, 220); g.lineTo(322, 220); g.stroke(); } if (p > 0.85) { g.strokeStyle = '#223'; g.lineWidth = 2; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(150 + i * 26, 252); g.lineTo(158 + i * 26, 268); g.stroke(); } } return c; }
    if (p > 0.05) { g.strokeStyle = '#8a2b24'; g.lineWidth = 4; g.beginPath(); g.moveTo(150, 192); g.lineTo(362, 192); g.stroke(); }
    if (p > 0.2) { g.fillStyle = '#c9544a'; g.beginPath(); g.ellipse(256, 192, 100 * Math.min(1, (p - 0.2) * 2.5 + 0.3), 44 * Math.min(1, (p - 0.2) * 2.5 + 0.3), 0, 0, Math.PI * 2); g.fill(); }
    if (p > 0.4) { if (type === 'cranial') { g.fillStyle = '#f1e8d6'; g.beginPath(); g.ellipse(256, 192, 70, 30, 0, 0, Math.PI * 2); g.fill(); if (p > 0.6) { g.fillStyle = '#e6b8c0'; g.beginPath(); g.ellipse(256, 192, 50, 20, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#b55'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(216 + i * 16, 178); g.quadraticCurveTo(220 + i * 16, 192, 216 + i * 16, 206); g.stroke(); } } }
      else if (type === 'thorax-heart') { g.fillStyle = '#f1e8d6'; g.fillRect(246, 150, 20, 84); if (p > 0.6) { g.fillStyle = '#b03a3a'; g.beginPath(); g.ellipse(256, 196, 48, 40, -0.3, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#f0c080'; g.lineWidth = 3; g.beginPath(); g.moveTo(230, 170); g.quadraticCurveTo(262, 200, 286, 226); g.stroke(); } }
      else if (type === 'thorax-lung') { g.fillStyle = '#e39ba0'; g.beginPath(); g.ellipse(256, 192, 80, 40, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#f1e8d6'; g.lineWidth = 6; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(170, 192 + i * 26); g.quadraticCurveTo(256, 170 + i * 26, 342, 192 + i * 26); g.stroke(); } }
      else if (type === 'vessel') { g.strokeStyle = '#b03a3a'; g.lineWidth = 14; g.beginPath(); g.moveTo(160, 192); g.lineTo(352, 192); g.stroke(); g.strokeStyle = '#4060c0'; g.lineWidth = 10; g.beginPath(); g.moveTo(160, 212); g.lineTo(352, 212); g.stroke(); if (p > 0.7) { g.fillStyle = '#ddd'; g.fillRect(236, 184, 40, 16); } }
      else if (type === 'bone') { g.fillStyle = '#f1e8d6'; g.fillRect(170, 178, 172, 28); g.beginPath(); g.ellipse(170, 192, 22, 30, 0, 0, Math.PI * 2); g.ellipse(342, 192, 22, 30, 0, 0, Math.PI * 2); g.fill(); if (p > 0.7) { g.fillStyle = '#9aa'; g.fillRect(200, 184, 110, 8); for (let i = 0; i < 4; i++) g.fillRect(208 + i * 30, 176, 6, 24); } }
      else if (type === 'spine') { g.fillStyle = '#b5484a'; g.fillRect(200, 110, 112, 170); g.fillStyle = '#f1e8d6'; for (let i = 0; i < 4; i++) { g.fillRect(238, 118 + i * 42, 36, 26); g.fillRect(212, 124 + i * 42, 18, 14); g.fillRect(282, 124 + i * 42, 18, 14); } if (p > 0.7) { g.fillStyle = '#8fa3ad'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(221, 131 + i * 42, 6, 0, Math.PI * 2); g.arc(291, 131 + i * 42, 6, 0, Math.PI * 2); g.fill(); } g.fillRect(218, 128, 6, 92); g.fillRect(288, 128, 6, 92); } }
      else if (type === 'groin' || type === 'cath') { g.fillStyle = '#7a1c1c'; g.beginPath(); g.arc(256, 192, 8, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#e8eef2'; g.lineWidth = 7; g.beginPath(); g.moveTo(256, 192); g.lineTo(420, 120); g.stroke(); g.fillStyle = '#2f6fb0'; g.fillRect(250, 186, 22, 12); }
      else if (type === 'hand') { g.fillStyle = '#c9544a'; g.beginPath(); g.ellipse(256, 192, 120, 26, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#f1e8d6'; g.fillRect(170, 186, 172, 14); if (p > 0.7) { g.fillStyle = '#9aa'; g.fillRect(190, 182, 120, 6); } }
      else if (type === 'perineum') { g.fillStyle = '#c98a7a'; g.beginPath(); g.ellipse(256, 192, 50, 70, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#cfd6da'; g.lineWidth = 8; g.beginPath(); g.moveTo(210, 150); g.lineTo(256, 192); g.lineTo(302, 150); g.stroke(); }
      else if (type === 'neck') { g.fillStyle = '#c45a5a'; g.beginPath(); g.ellipse(256, 200, 120, 40, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#d8a0a8'; g.beginPath(); g.ellipse(220, 200, 34, 24, 0, 0, Math.PI * 2); g.ellipse(292, 200, 34, 24, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#efe3d0'; g.fillRect(246, 168, 20, 64); }
      else if (type === 'abdomen') { g.fillStyle = '#d98888'; g.beginPath(); g.ellipse(256, 192, 90, 46, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#f5d6a0'; g.lineWidth = 8; g.beginPath(); for (let i = 0; i < 5; i++) g.arc(200 + i * 28, 192, 14, 0, Math.PI, i % 2 === 0); g.stroke(); }
      else { g.fillStyle = '#d98888'; g.beginPath(); g.ellipse(256, 192, 70, 36, 0, 0, Math.PI * 2); g.fill(); } }
    if (p > 0.85) { g.strokeStyle = '#223'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(170 + i * 26, 180); g.lineTo(178 + i * 26, 204); g.stroke(); } }
    return c;
  }
  // polar "cap" canvases: top row = centre of the exposed cap, bottom row = edge, x = angle around the cap
  function capCanvas(kind, progress) {
    const c = canvas(512, 256), g = c.getContext('2d'), p = Math.max(0, Math.min(1, progress || 0));
    const band = (y0, y1, colr) => { g.fillStyle = colr; g.fillRect(0, y0, 512, y1 - y0); };
    band(0, 256, '#b7773f'); noise(g, 512, 256, 600, 0.08); band(236, 256, '#d8dfe2');
    if (kind === 'eye') { band(0, 34, '#0b0b0d'); band(34, 70, '#3d6a7c'); band(70, 82, '#5e4a36'); band(82, 150, '#f4f1ec'); g.strokeStyle = 'rgba(190,60,60,.5)'; g.lineWidth = 1.5; for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(i * 28 + 6, 150); g.lineTo(i * 28 + 14, 96); g.stroke(); } band(150, 168, '#c08a70'); g.fillStyle = '#c9cfd3'; g.fillRect(40, 160, 70, 10); g.fillRect(296, 160, 70, 10); if (p > 0.3) { g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(0, 0, 512, 10); } if (p > 0.6) { g.strokeStyle = '#9aa'; g.lineWidth = 4; g.beginPath(); g.moveTo(100, 80); g.lineTo(140, 40); g.stroke(); } return c; }
    if (kind === 'mouth') { band(0, 70, '#5a0f16'); band(18, 40, '#c0505a'); band(70, 96, '#f3efe4'); for (let i = 0; i < 32; i++) { g.fillStyle = 'rgba(120,110,90,.6)'; g.fillRect(i * 16, 70, 1.5, 26); } band(96, 124, '#c98078'); band(124, 236, '#d8a67e'); g.fillStyle = '#cfd6da'; g.fillRect(200, 60, 112, 12); return c; }
    if (kind === 'ear') { band(0, 40, '#2a1210'); band(40, 120, '#e3a68c'); g.strokeStyle = 'rgba(150,80,60,.6)'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 90); g.lineTo(512, 90); g.stroke(); if (p > 0.05) { g.strokeStyle = '#8a2b24'; g.lineWidth = 5; g.beginPath(); g.moveTo(90, 170); g.lineTo(360, 170); g.stroke(); } if (p > 0.4) { g.fillStyle = '#efe3cf'; g.fillRect(150, 150, 140, 40); } return c; }
    if (kind === 'face') { band(0, 60, '#c98a72'); g.fillStyle = '#7a3a30'; g.fillRect(230, 0, 52, 30); if (p > 0.3) { g.fillStyle = '#8a2b24'; g.fillRect(0, 60, 512, 6); } return c; }
    // cranial: horseshoe incision ring, bone flap, dura, cortex
    if (p > 0.05) { g.strokeStyle = '#8a2b24'; g.lineWidth = 6; g.beginPath(); g.moveTo(40, 190); g.lineTo(470, 190); g.stroke(); }
    if (p > 0.25) band(150, 186, '#c9544a');
    if (p > 0.4) band(0, 150, '#efe6d2');
    if (p > 0.55) band(0, 120, '#d9b2b8');
    if (p > 0.7) { band(0, 100, '#e7b9b6'); g.strokeStyle = '#b05252'; g.lineWidth = 2; for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(i * 30, 0); g.quadraticCurveTo(i * 30 + 14, 50, i * 30 - 6, 100); g.stroke(); } }
    if (p > 0.85) { g.fillStyle = '#9aa4a8'; for (let i = 0; i < 6; i++) g.fillRect(30 + i * 80, 140, 18, 10); }
    return c;
  }

  // ---------------------------------------------------------------- geometry kit: static parts merged per material, coloured per vertex
  const COLORS = new Map();
  function col(c) { let v = COLORS.get(c); if (!v) { v = new THREE.Color(c); COLORS.set(c, v); } return v; }
  function mergeParts(list, withUv) {
    let nv = 0, ni = 0;
    for (const p of list) { const n = p.g.attributes.position.count; nv += n; ni += p.g.index ? p.g.index.count : n; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), clr = new Float32Array(nv * 3), uv = withUv ? new Float32Array(nv * 2) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const v = new THREE.Vector3(), nmx = new THREE.Matrix3(); let vo = 0, io = 0;
    for (const p of list) {
      const P = p.g.attributes.position, N = p.g.attributes.normal, U = p.g.attributes.uv; nmx.getNormalMatrix(p.m);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(p.m); const o = (vo + i) * 3; pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
        if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nmx).normalize(); nor[o] = v.x; nor[o + 1] = v.y; nor[o + 2] = v.z; }
        clr[o] = p.c.r; clr[o + 1] = p.c.g; clr[o + 2] = p.c.b;
        if (uv && U) { uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i); }
      }
      if (p.g.index) { const I = p.g.index.array; for (let k = 0; k < I.length; k++) idx[io + k] = I[k] + vo; io += I.length; }
      else { for (let k = 0; k < P.count; k++) idx[io + k] = vo + k; io += P.count; }
      vo += P.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(clr, 3)); if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  }
  // rounded box (same idea as three's RoundedBoxGeometry addon): a 3×3×3 box whose vertices are pushed onto
  // an inner box plus a sphere of radius r — fast, no triangulation, smooth edge normals
  function roundedBox(w, h, d, r) {
    r = Math.max(0.0005, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
    const seg = 3, g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg), P = g.attributes.position, N = g.attributes.normal, half = 0.5 / seg;
    const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r; const n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), sx = Math.sign(x), sy = Math.sign(y), sz = Math.sign(z);
      n.set(x - sx * half, y - sy * half, z - sz * half).normalize();
      P.setXYZ(i, bx * sx + n.x * r, by * sy + n.y * r, bz * sz + n.z * r); N.setXYZ(i, n.x, n.y, n.z);
    }
    return g;
  }
  function geoCache() {
    const c = new Map(), set = new Set();
    const get = (key, make) => { let g = c.get(key); if (!g) { g = make(); c.set(key, g); set.add(g); } return g; };
    return {
      set,
      box: () => get('box', () => new THREE.BoxGeometry(1, 1, 1)),
      cyl: (a, b, s) => get(`c${a.toFixed(3)}:${b.toFixed(3)}:${s}`, () => new THREE.CylinderGeometry(a, b, 1, s)),
      sph: s => get('s' + s, () => new THREE.SphereGeometry(1, s, Math.max(6, Math.round(s * 0.7)))),
      tor: (ratio, arc, s) => get(`t${ratio.toFixed(3)}:${arc.toFixed(3)}:${s}`, () => new THREE.TorusGeometry(1, ratio, Math.max(4, s >> 1), s * 2, arc)),
      circ: s => get('o' + s, () => new THREE.CircleGeometry(1, s)),
      rbox: (w, h, d, r) => get(`r${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${r.toFixed(3)}`, () => roundedBox(w, h, d, r)),
      dispose() { c.forEach(g => g.dispose()); c.clear(); set.clear(); }
    };
  }
  function materials() {
    const S = o => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, color: 0xffffff }, o));
    return {
      metal: S({ roughness: 0.26, metalness: 0.86 }), paint: S({ roughness: 0.46, metalness: 0.04 }), matte: S({ roughness: 0.88, metalness: 0 }),
      glass: S({ roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false }), fluid: S({ roughness: 0.2, metalness: 0, transparent: true, opacity: 0.85 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), led: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, map: ledTexture() })
    };
  }
  const UP = { x: 0, y: 1, z: 0 };
  // fewer materials = fewer draw calls on phones: similar finishes share one material (colour stays per vertex)
  const FINISH = { satin: 'metal', gold: 'metal', plastic: 'paint', skin: 'paint', cloth: 'matte', rubber: 'matte' };
  function makeKit(K) {
    const parts = {}; const d = new THREE.Object3D(); let parent = null; const stack = [];
    function M(x, y, z, rx, ry, rz, sx, sy, sz) { d.position.set(x || 0, y || 0, z || 0); d.rotation.set(rx || 0, ry || 0, rz || 0); d.scale.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz); d.updateMatrix(); const m = d.matrix.clone(); if (parent) m.premultiply(parent); return m; }
    function add(g, c, f, m) { f = FINISH[f] || f; (parts[f] || (parts[f] = [])).push({ g, m, c: col(c) }); }
    const k = {
      at(x, y, z, ry, fn, rx, rz) { stack.push(parent); const m = M(x, y, z, rx, ry, rz, 1, 1, 1); parent = m; try { fn(); } finally { parent = stack.pop(); } return k; },
      geo(g, x, y, z, c, f, rx, ry, rz, sx, sy, sz) { add(g, c, f, M(x, y, z, rx, ry, rz, sx, sy, sz)); return k; },
      box(w, h, dd, x, y, z, c, f, rx, ry, rz) { return k.geo(K.g.box(), x, y, z, c, f, rx, ry, rz, w, h, dd); },
      rbox(w, h, dd, r, x, y, z, c, f, rx, ry, rz) { return k.geo(K.g.rbox(w, h, dd, r), x, y, z, c, f, rx, ry, rz); },
      cyl(r1, r2, h, x, y, z, c, f, rx, ry, rz, seg) { const big = Math.max(r1, r2) || 1e-4; return k.geo(K.g.cyl(r1 / big, r2 / big, seg || 16), x, y, z, c, f, rx, ry, rz, big, h, big); },
      sph(a, b, cc, x, y, z, c, f, seg, rx, ry, rz) { return k.geo(K.g.sph(seg || 14), x, y, z, c, f, rx, ry, rz, a, b, cc); },
      tor(R, r, x, y, z, c, f, rx, ry, rz, arc, seg) { return k.geo(K.g.tor(r / R, arc || Math.PI * 2, seg || 8), x, y, z, c, f, rx, ry, rz, R, R, R); },
      disc(r, x, y, z, c, f, rx, ry, rz, seg) { return k.geo(K.g.circ(seg || 24), x, y, z, c, f, rx, ry, rz, r, r, 1); },
      lathe(pts, x, y, z, c, f, seg, rx, ry, rz, s) { return k.geo(new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg || 20), x, y, z, c, f, rx, ry, rz, s || 1, s || 1, s || 1); },
      tube(pts, r, c, f, seg, rseg) { const cv = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))); return k.geo(new THREE.TubeGeometry(cv, seg || Math.max(8, pts.length * 6), r, rseg || 6), 0, 0, 0, c, f); },
      ext(shape, depth, x, y, z, c, f, rx, ry, rz) { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -depth / 2); return k.geo(g, x, y, z, c, f, rx, ry, rz); },
      seg(A, B, rA, rB, c, f, s) { const a = new THREE.Vector3(A[0], A[1], A[2]), b = new THREE.Vector3(B[0], B[1], B[2]); const dir = b.clone().sub(a); const len = dir.length(); if (len < 1e-5) return k; dir.divideScalar(len); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(UP.x, UP.y, UP.z), dir); const big = Math.max(rA, rB) || 1e-4; const m = new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(big, len, big)); if (parent) m.premultiply(parent); add(K.g.cyl(rB / big, rA / big, s || 10), c, f, m); return k; },
      flat(A, B, w, h, c, f) { const a = new THREE.Vector3(A[0], A[1], A[2]), b = new THREE.Vector3(B[0], B[1], B[2]); const dir = b.clone().sub(a); const len = dir.length(); if (len < 1e-5) return k; dir.divideScalar(len); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir); const m = new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(len, h, w)); if (parent) m.premultiply(parent); add(K.g.box(), c, f, m); return k; },
      build(opts) {
        opts = opts || {}; const g = new THREE.Group();
        Object.keys(parts).forEach(f => { const geo = mergeParts(parts[f], f === 'led'); parts[f].forEach(p => { if (!K.g.set.has(p.g)) p.g.dispose(); }); const mesh = new THREE.Mesh(geo, K.mat[f]); mesh.castShadow = opts.shadow !== false && !/glass|glow|led|fluid/.test(f); mesh.receiveShadow = !/glow|led/.test(f); if (f === 'glass' || f === 'fluid') mesh.renderOrder = 2; g.add(mesh); });
        return g;
      }
    };
    return k;
  }

  // ---------------------------------------------------------------- instruments (lying flat along local +x, tip at +x)
  const STEEL = '#d7dde1', STEEL2 = '#aeb8bd', GOLD = '#d9b25c', DARK = '#2b3237';
  function bar(k, x0, z0, x1, z1, w, h, y, c, f) { const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz); k.box(len, h, w, (x0 + x1) / 2, y, (z0 + z1) / 2, c, f || 'metal', 0, Math.atan2(-dz, dx), 0); }
  function ringHandles(k, gold, spread) { const s = spread || 0.012; [s, -s].forEach(z => k.tor(0.0095, 0.0021, 0.011, 0.0022, z, gold ? GOLD : STEEL, gold ? 'gold' : 'metal', Math.PI / 2, 0, 0, Math.PI * 2, 6)); }
  function scissorLike(k, L, jaw, curve, gold, jawW) {
    ringHandles(k, gold); const pv = L * 0.45;
    bar(k, 0.018, 0.011, pv, 0.0015, 0.0042, 0.0028, 0.0022, STEEL); bar(k, 0.018, -0.011, pv, -0.0015, 0.0042, 0.0028, 0.0022, STEEL);
    k.cyl(0.0032, 0.0032, 0.004, pv, 0.003, 0, STEEL2, 'satin', 0, 0, 0, 8);
    if (jaw === 'blade') { bar(k, pv, 0.0012, L * 0.82, 0.0008 + curve * 0.4, 0.0055, 0.0018, 0.0024, STEEL); bar(k, L * 0.82, 0.0008 + curve * 0.4, L, curve, 0.003, 0.0016, 0.0024, STEEL); bar(k, pv, -0.0012, L * 0.82, -0.0004 + curve * 0.4, 0.005, 0.0018, 0.0018, STEEL2); bar(k, L * 0.82, -0.0004 + curve * 0.4, L * 0.99, curve - 0.0006, 0.0026, 0.0016, 0.0018, STEEL2); }
    else { const w = jawW || 0.004; bar(k, pv, 0, L * 0.8, curve * 0.3, w, 0.004, 0.0025, STEEL); bar(k, L * 0.8, curve * 0.3, L, curve, w * 0.75, 0.0035, 0.0025, STEEL); if (gold) k.box(L * 0.18, 0.0012, w * 0.9, L * 0.86, 0.0048, curve * 0.6, GOLD, 'gold'); }
    if (jaw !== 'blade') for (let i = 0; i < 3; i++) { k.box(0.0035, 0.002, 0.0024, 0.03 + i * 0.004, 0.0025, 0.0062, STEEL2, 'metal'); k.box(0.0035, 0.002, 0.0024, 0.03 + i * 0.004, 0.0025, -0.0062, STEEL2, 'metal'); }
  }
  const INSTR = {
    scalpel(k, v) { bar(k, 0, 0, 0.12, 0, 0.011, 0.0028, 0.0016, STEEL2, 'satin'); for (let i = 0; i < 5; i++) k.box(0.002, 0.0008, 0.009, 0.015 + i * 0.008, 0.0032, 0, '#8f999e', 'satin'); const s = new THREE.Shape(); if (v === 15) { s.moveTo(0, -0.0025); s.lineTo(0.02, -0.0025); s.quadraticCurveTo(0.027, 0.0, 0.02, 0.003); s.lineTo(0, 0.0035); } else { s.moveTo(0, -0.003); s.lineTo(0.03, -0.003); s.quadraticCurveTo(0.043, 0.003, 0.034, 0.008); s.lineTo(0, 0.0055); } s.closePath(); k.ext(s, 0.0006, 0.118, 0.0024, 0, '#eef2f4', 'metal', -Math.PI / 2, 0, 0); },
    metz(k) { scissorLike(k, 0.18, 'blade', 0.007); },
    mayo(k) { scissorLike(k, 0.16, 'blade', 0.0); },
    forceps(k, toothed) { const L = 0.15; bar(k, 0, 0.0015, L, 0.0045, 0.0075, 0.0026, 0.0022, STEEL); bar(k, 0, -0.0015, L, -0.0045, 0.0075, 0.0026, 0.0022, STEEL); k.box(0.012, 0.004, 0.011, 0.004, 0.0025, 0, STEEL2, 'metal'); for (let i = 0; i < 6; i++) { k.box(0.0018, 0.0006, 0.006, 0.05 + i * 0.006, 0.0038, 0.004, '#9aa4a9', 'satin'); k.box(0.0018, 0.0006, 0.006, 0.05 + i * 0.006, 0.0038, -0.004, '#9aa4a9', 'satin'); } if (toothed) { k.box(0.003, 0.003, 0.002, L - 0.001, 0.003, 0.0035, STEEL, 'metal'); k.box(0.003, 0.003, 0.002, L - 0.001, 0.003, -0.0035, STEEL, 'metal'); } },
    needle(k) { scissorLike(k, 0.16, 'jaw', 0, true, 0.006); },
    clamp(k, curve) { scissorLike(k, 0.14, 'jaw', curve == null ? 0.008 : curve, false, 0.0042); },
    kocher(k) { scissorLike(k, 0.16, 'jaw', 0, false, 0.005); k.box(0.004, 0.004, 0.006, 0.159, 0.004, 0, STEEL, 'metal'); },
    babcock(k) { scissorLike(k, 0.16, 'jaw', 0, false, 0.0035); k.tor(0.006, 0.0012, 0.158, 0.003, 0, STEEL, 'metal', 0, 0, 0, Math.PI * 2, 6); },
    ringfor(k) { ringHandles(k, false); bar(k, 0.018, 0.011, 0.11, 0.002, 0.0045, 0.003, 0.0022, STEEL); bar(k, 0.018, -0.011, 0.11, -0.002, 0.0045, 0.003, 0.0022, STEEL); bar(k, 0.11, 0, 0.21, 0, 0.0045, 0.003, 0.0022, STEEL); k.tor(0.011, 0.002, 0.222, 0.0025, 0, STEEL, 'metal', Math.PI / 2, 0, 0, Math.PI * 2, 6); },
    towel(k) { ringHandles(k, false, 0.01); bar(k, 0.016, 0.009, 0.07, 0, 0.004, 0.003, 0.0022, STEEL); bar(k, 0.016, -0.009, 0.07, 0, 0.004, 0.003, 0.0022, STEEL); k.tor(0.012, 0.0018, 0.08, 0.003, 0.004, STEEL, 'metal', Math.PI / 2, 0, -0.4, Math.PI * 1.1, 6); k.tor(0.012, 0.0018, 0.08, 0.003, -0.004, STEEL, 'metal', Math.PI / 2, 0, 2.7, Math.PI * 1.1, 6); },
    armynavy(k) { bar(k, 0.02, 0, 0.19, 0, 0.016, 0.003, 0.002, STEEL, 'satin'); k.box(0.003, 0.04, 0.02, 0.012, 0.02, 0, STEEL, 'metal', 0, 0, 0.15); k.box(0.003, 0.028, 0.017, 0.198, 0.014, 0, STEEL, 'metal', 0, 0, -0.15); },
    senn(k) { bar(k, 0.02, 0, 0.15, 0, 0.009, 0.003, 0.002, STEEL, 'satin'); for (let i = -1; i <= 1; i++) k.tor(0.008, 0.0012, 0.008, 0.008, i * 0.006, STEEL, 'metal', 0, Math.PI / 2, 0, Math.PI * 0.9, 5); k.box(0.003, 0.02, 0.012, 0.162, 0.01, 0, STEEL, 'metal', 0, 0, -0.2); },
    balfour(k) { bar(k, 0, 0.09, 0.24, 0.09, 0.012, 0.006, 0.004, STEEL, 'satin'); bar(k, 0, -0.09, 0.24, -0.09, 0.012, 0.006, 0.004, STEEL, 'satin'); bar(k, 0.02, -0.1, 0.02, 0.1, 0.01, 0.008, 0.006, STEEL2, 'satin'); [0.09, -0.09].forEach(z => k.tor(0.05, 0.003, 0.17, 0.004, z, STEEL, 'metal', Math.PI / 2, 0, 0, Math.PI, 6)); k.box(0.07, 0.003, 0.05, 0.12, 0.004, 0, STEEL, 'metal'); },
    sponges(k, n) { n = n || 5; k.rbox(0.1, 0.004 * n, 0.1, 0.003, 0.05, 0.002 * n, 0, '#f6f7f5', 'cloth'); k.box(0.1, 0.0015, 0.005, 0.05, 0.004 * n + 0.0002, 0.03, '#2f6fd0', 'matte'); },
    lap(k) { k.rbox(0.18, 0.012, 0.18, 0.004, 0.09, 0.006, 0, '#f4f5f2', 'cloth'); k.tor(0.02, 0.003, 0.0, 0.012, 0.06, '#2f6fd0', 'matte', Math.PI / 2, 0, 0, Math.PI * 2, 6); },
    yankauer(k) { k.tube([[0, 0.006, 0], [0.14, 0.006, 0], [0.21, 0.006, 0.008], [0.26, 0.005, 0.03]], 0.0048, '#e9f1f3', 'plastic', 24); k.sph(0.007, 0.006, 0.007, 0.262, 0.005, 0.032, '#e9f1f3', 'plastic', 8); k.cyl(0.0065, 0.006, 0.03, -0.012, 0.006, 0, '#e9f1f3', 'plastic', 0, 0, Math.PI / 2, 8); },
    frazier(k) { k.tube([[0, 0.005, 0], [0.09, 0.005, 0], [0.11, 0.004, 0.012], [0.18, 0.003, 0.016]], 0.0022, STEEL, 'metal', 16); k.box(0.03, 0.01, 0.012, 0.0, 0.006, 0, STEEL2, 'satin'); },
    bipolar(k) { [0.0022, -0.0022].forEach(z => { bar(k, 0, z, 0.08, z, 0.005, 0.003, 0.003, '#7f8a90'); bar(k, 0.08, z, 0.1, z + 0.014, 0.004, 0.003, 0.003, STEEL); bar(k, 0.1, z + 0.014, 0.2, z * 0.4 + 0.014, 0.003, 0.0025, 0.003, STEEL); }); k.cyl(0.004, 0.004, 0.02, -0.01, 0.003, 0, '#2f6fd0', 'plastic', 0, 0, Math.PI / 2, 8); },
    kerrison(k) { bar(k, 0, 0.02, 0.06, 0.004, 0.012, 0.01, 0.006, '#2f3a40', 'plastic'); bar(k, 0, -0.024, 0.05, -0.006, 0.01, 0.01, 0.006, STEEL2, 'satin'); bar(k, 0.05, 0, 0.19, 0, 0.006, 0.006, 0.006, STEEL); k.box(0.006, 0.008, 0.008, 0.195, 0.006, 0, STEEL, 'metal'); },
    penfield(k) { k.cyl(0.0028, 0.0028, 0.17, 0.085, 0.003, 0, STEEL, 'metal', 0, 0, Math.PI / 2, 8); k.cyl(0.004, 0.004, 0.06, 0.085, 0.003, 0, '#9aa4a9', 'satin', 0, 0, Math.PI / 2, 8); k.box(0.012, 0.001, 0.006, 0.175, 0.003, 0, STEEL, 'metal'); k.box(0.01, 0.001, 0.005, -0.004, 0.003, 0, STEEL, 'metal'); },
    drillpen(k) { k.cyl(0.009, 0.007, 0.13, 0.065, 0.009, 0, '#d9dee1', 'satin', 0, 0, Math.PI / 2, 12); k.cyl(0.0015, 0.0015, 0.03, 0.145, 0.009, 0, STEEL, 'metal', 0, 0, Math.PI / 2, 6); k.tube([[0, 0.009, 0], [-0.05, 0.009, 0.01], [-0.1, 0.006, 0.04]], 0.003, '#6f7d84', 'rubber'); },
    drill(k) { k.rbox(0.16, 0.055, 0.05, 0.012, 0.08, 0.14, 0, '#4b5a63', 'plastic'); k.rbox(0.05, 0.11, 0.045, 0.012, 0.045, 0.07, 0, '#2f3a40', 'plastic', 0, 0, 0.12); k.rbox(0.09, 0.03, 0.07, 0.008, 0.05, 0.016, 0, '#2f3a40', 'plastic'); k.cyl(0.013, 0.011, 0.04, 0.18, 0.14, 0, STEEL2, 'satin', 0, 0, Math.PI / 2, 12); k.cyl(0.002, 0.002, 0.06, 0.225, 0.14, 0, STEEL, 'metal', 0, 0, Math.PI / 2, 6); },
    mallet(k) { k.cyl(0.024, 0.024, 0.09, 0.2, 0.024, 0, STEEL2, 'satin', Math.PI / 2, 0, 0, 14); k.cyl(0.009, 0.01, 0.2, 0.1, 0.012, 0, '#3b4a52', 'rubber', 0, 0, Math.PI / 2, 10); },
    osteotome(k) { k.cyl(0.009, 0.009, 0.11, 0.055, 0.009, 0, '#9aa4a9', 'satin', 0, 0, Math.PI / 2, 10); bar(k, 0.11, 0, 0.19, 0, 0.012, 0.002, 0.004, STEEL); },
    screws(k) { k.rbox(0.12, 0.03, 0.08, 0.006, 0.06, 0.015, 0, '#5f7f9f', 'plastic'); for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) k.cyl(0.004, 0.004, 0.006, 0.015 + i * 0.018, 0.032, -0.022 + j * 0.022, j === 1 ? GOLD : '#b9c3c8', j === 1 ? 'gold' : 'metal', 0, 0, 0, 8); },
    vclamp(k) { scissorLike(k, 0.17, 'jaw', 0.0, false, 0.0035); bar(k, 0.17, 0, 0.2, 0.02, 0.004, 0.004, 0.0025, STEEL); },
    saw(k) { k.rbox(0.2, 0.06, 0.06, 0.015, 0.1, 0.045, 0, '#d9dee1', 'satin'); k.rbox(0.06, 0.1, 0.04, 0.012, 0.03, 0.05, 0, '#3b4a52', 'plastic', 0, 0, 0.25); k.box(0.003, 0.06, 0.03, 0.205, 0.04, 0, STEEL, 'metal'); k.box(0.03, 0.004, 0.02, 0.215, 0.012, 0, STEEL, 'metal'); },
    trocar(k) { k.cyl(0.006, 0.006, 0.11, 0.075, 0.012, 0, '#8c979d', 'satin', 0, 0, Math.PI / 2, 10); k.rbox(0.03, 0.032, 0.028, 0.006, 0.015, 0.016, 0, '#2c3e50', 'plastic'); k.cyl(0.004, 0.004, 0.012, 0.015, 0.034, 0, '#e74c3c', 'plastic', 0, 0, 0, 8); k.cyl(0.001, 0.006, 0.015, 0.137, 0.012, 0, '#c9d0d3', 'metal', 0, 0, -Math.PI / 2, 8); },
    grasper(k) { k.cyl(0.0026, 0.0026, 0.33, 0.2, 0.012, 0, '#2b3237', 'plastic', 0, 0, Math.PI / 2, 8); k.box(0.006, 0.003, 0.004, 0.37, 0.012, 0.002, STEEL, 'metal'); k.box(0.006, 0.003, 0.004, 0.37, 0.012, -0.002, STEEL, 'metal'); k.rbox(0.05, 0.03, 0.014, 0.006, 0.02, 0.016, 0, '#3b4a52', 'plastic'); k.tor(0.012, 0.0025, -0.006, 0.012, 0.012, '#3b4a52', 'plastic', Math.PI / 2, 0, 0, Math.PI * 2, 6); },
    scope(k) { k.cyl(0.005, 0.005, 0.32, 0.18, 0.008, 0, '#c9d0d3', 'metal', 0, 0, Math.PI / 2, 10); k.rbox(0.05, 0.035, 0.035, 0.008, 0.0, 0.018, 0, '#1f2a30', 'plastic'); k.cyl(0.004, 0.004, 0.02, 0.04, 0.02, 0, '#c9d0d3', 'metal', 0, 0, 0, 8); k.tube([[-0.02, 0.018, 0], [-0.08, 0.012, 0.02], [-0.15, 0.006, 0.06], [-0.2, 0.004, 0.12]], 0.0035, '#4c5a62', 'rubber'); },
    microforceps(k) { bar(k, 0, 0.001, 0.11, 0.0022, 0.004, 0.0015, 0.0015, '#c9d0d3'); bar(k, 0, -0.001, 0.11, -0.0022, 0.004, 0.0015, 0.0015, '#c9d0d3'); },
    lidspec(k) { k.tor(0.012, 0.001, 0.02, 0.003, 0.01, STEEL, 'metal', Math.PI / 2, 0, 0, Math.PI * 1.4, 6); k.tor(0.012, 0.001, 0.02, 0.003, -0.01, STEEL, 'metal', Math.PI / 2, 0, Math.PI, Math.PI * 1.4, 6); },
    phaco(k) { k.cyl(0.006, 0.005, 0.12, 0.06, 0.006, 0, '#d9dee1', 'satin', 0, 0, Math.PI / 2, 10); k.tube([[0, 0.006, 0], [-0.05, 0.005, 0.02], [-0.12, 0.003, 0.03]], 0.0022, '#e9f1f3', 'plastic'); },
    mirror(k) { k.cyl(0.004, 0.004, 0.12, 0.06, 0.004, 0, '#b9c3c8', 'satin', 0, 0, Math.PI / 2, 8); bar(k, 0.12, 0, 0.15, 0.004, 0.002, 0.002, 0.004, STEEL); k.cyl(0.011, 0.011, 0.002, 0.158, 0.005, 0.006, '#e9eef0', 'metal', 0.5, 0, 0, 14); },
    explorer(k) { k.cyl(0.004, 0.004, 0.12, 0.06, 0.004, 0, '#b9c3c8', 'satin', 0, 0, Math.PI / 2, 8); k.tube([[0.12, 0.004, 0], [0.14, 0.004, 0], [0.152, 0.004, 0.008], [0.148, 0.004, 0.014]], 0.0009, STEEL, 'metal', 10, 4); },
    extraction(k) { bar(k, 0, 0.012, 0.1, 0.003, 0.008, 0.005, 0.004, STEEL2, 'satin'); bar(k, 0, -0.012, 0.1, -0.003, 0.008, 0.005, 0.004, STEEL2, 'satin'); bar(k, 0.1, 0.003, 0.14, 0.006, 0.006, 0.005, 0.004, STEEL); bar(k, 0.1, -0.003, 0.14, -0.006, 0.006, 0.005, 0.004, STEEL); },
    elevator(k) { k.cyl(0.007, 0.007, 0.09, 0.045, 0.007, 0, '#c9d0d3', 'satin', 0, 0, Math.PI / 2, 10); bar(k, 0.09, 0, 0.13, 0, 0.005, 0.002, 0.006, STEEL); },
    syringe(k) { k.cyl(0.008, 0.008, 0.07, 0.05, 0.008, 0, '#eef4f6', 'glass', 0, 0, Math.PI / 2, 12); k.cyl(0.003, 0.003, 0.05, 0.0, 0.008, 0, '#ffffff', 'plastic', 0, 0, Math.PI / 2, 8); k.box(0.003, 0.002, 0.03, 0.015, 0.008, 0, '#ffffff', 'plastic'); k.cyl(0.001, 0.003, 0.012, 0.09, 0.008, 0, '#ffffff', 'plastic', 0, 0, -Math.PI / 2, 8); },
    nasalspec(k) { bar(k, 0, 0.012, 0.07, 0.002, 0.006, 0.003, 0.003, STEEL); bar(k, 0, -0.012, 0.07, -0.002, 0.006, 0.003, 0.003, STEEL); bar(k, 0.07, 0.002, 0.13, 0.006, 0.008, 0.003, 0.003, STEEL); bar(k, 0.07, -0.002, 0.13, -0.006, 0.008, 0.003, 0.003, STEEL); },
    entscope(k) { k.cyl(0.002, 0.002, 0.18, 0.11, 0.008, 0, '#c9d0d3', 'metal', 0, 0, Math.PI / 2, 8); k.cyl(0.012, 0.009, 0.03, 0.005, 0.01, 0, '#1f2a30', 'plastic', 0, 0, Math.PI / 2, 12); k.cyl(0.003, 0.003, 0.02, 0.03, 0.02, 0, '#c9d0d3', 'metal', 0, 0, 0, 8); },
    cusco(k) { k.rbox(0.11, 0.008, 0.032, 0.004, 0.09, 0.01, 0.0, '#c9d0d3', 'metal', 0, 0, 0.05); k.rbox(0.11, 0.008, 0.032, 0.004, 0.09, 0.022, 0.0, '#c9d0d3', 'metal', 0, 0, -0.08); k.box(0.012, 0.06, 0.008, 0.03, 0.03, 0.012, STEEL2, 'satin', 0, 0, 0.2); k.box(0.012, 0.05, 0.008, 0.03, 0.03, -0.012, STEEL2, 'satin', 0, 0, -0.1); },
    usprobe(k) { k.rbox(0.09, 0.05, 0.03, 0.012, 0.045, 0.016, 0, '#e9eef0', 'plastic'); k.cyl(0.016, 0.016, 0.035, 0.095, 0.016, 0, '#2b3237', 'rubber', Math.PI / 2, 0, 0, 14, 0); k.tube([[0, 0.016, 0], [-0.06, 0.012, 0.01], [-0.14, 0.006, 0.06]], 0.004, '#c9d0d3', 'rubber'); },
    tvprobe(k) { k.cyl(0.011, 0.011, 0.2, 0.15, 0.012, 0, '#e9eef0', 'plastic', 0, 0, Math.PI / 2, 12); k.rbox(0.07, 0.035, 0.03, 0.01, 0.02, 0.016, 0, '#d0d6d9', 'plastic'); k.sph(0.011, 0.011, 0.011, 0.25, 0.012, 0, '#e9eef0', 'plastic', 10); },
    doyen(k) { k.cyl(0.008, 0.008, 0.09, 0.045, 0.008, 0, '#b9c3c8', 'satin', 0, 0, Math.PI / 2, 10); k.box(0.08, 0.003, 0.06, 0.13, 0.01, 0, STEEL, 'metal', 0, 0, 0.12); },
    laryngoscope(k) { k.cyl(0.015, 0.015, 0.13, 0.0, 0.065, 0, '#2a3036', 'satin', 0, 0, 0, 16); for (let i = 0; i < 6; i++) k.tor(0.0152, 0.0012, 0, 0.02 + i * 0.018, 0, '#56626a', 'satin', Math.PI / 2, 0, 0, Math.PI * 2, 6); k.box(0.02, 0.012, 0.02, 0.0, 0.135, 0, STEEL2, 'metal'); k.flat([0.01, 0.135, 0], [0.07, 0.125, 0], 0.016, 0.004, STEEL, 'metal'); k.flat([0.07, 0.125, 0], [0.11, 0.1, 0], 0.016, 0.004, STEEL, 'metal'); k.sph(0.003, 0.003, 0.003, 0.08, 0.118, 0, '#fff7c8', 'glow', 6); },
    ett(k, s) { const r = (s || 1) * 0.0045; k.tube([[0, 0.006, 0], [0.1, 0.006, 0.004], [0.2, 0.006, 0.03], [0.26, 0.006, 0.07]], r, '#eaf3f5', 'plastic', 24); k.sph(0.012, 0.009, 0.012, 0.245, 0.007, 0.055, '#dfeff4', 'glass', 10); k.cyl(0.006, 0.006, 0.018, -0.006, 0.006, 0, '#ffffff', 'plastic', 0, 0, Math.PI / 2, 8); k.tube([[0.18, 0.009, 0.025], [0.12, 0.012, 0.06], [0.05, 0.008, 0.09]], 0.0012, '#eaf3f5', 'plastic', 10, 4); k.sph(0.006, 0.004, 0.008, 0.05, 0.008, 0.092, '#5fa8e0', 'plastic', 8); },
    lma(k) { k.tube([[0, 0.006, 0], [0.12, 0.006, 0.004], [0.17, 0.008, 0.012]], 0.006, '#eaf3f5', 'plastic', 16); k.sph(0.045, 0.012, 0.03, 0.2, 0.01, 0.014, '#f0d9c8', 'plastic', 14); },
    bowl(k, r) { r = r || 0.08; k.lathe([[0.001, 0], [r * 0.6, 0.0], [r * 0.85, r * 0.15], [r, r * 0.42], [r * 1.03, r * 0.46], [r * 0.97, r * 0.45], [r * 0.93, r * 0.41], [r * 0.79, r * 0.17], [r * 0.56, r * 0.035], [0.001, r * 0.035]], 0, 0, 0, STEEL, 'metal', 24); },
    kidney(k) { k.at(0, 0, 0, 0, () => k.lathe([[0.001, 0], [0.04, 0.0], [0.07, 0.015], [0.08, 0.035], [0.082, 0.037], [0.077, 0.036], [0.067, 0.017], [0.038, 0.004], [0.001, 0.004]], 0, 0, 0, STEEL, 'metal', 20, 0, 0, 0, 1)); },
    suture(k, c) { k.rbox(0.07, 0.004, 0.035, 0.002, 0.035, 0.002, 0, c || '#7b4fa8', 'plastic'); k.box(0.05, 0.0009, 0.02, 0.035, 0.0045, 0, '#f2f4f5', 'matte'); }
  };
  function place(k, type, x, y, z, ry, a, b) { const f = INSTR[type]; if (!f) return; k.at(x, y, z, ry || 0, () => f(k, a, b)); }
  const DEPT_SET = dept => /neurosurg/.test(dept) ? ['bipolar', 'kerrison', 'penfield', 'penfield', 'frazier', 'drillpen']
    : /ortho|spine|joint/.test(dept) ? ['drill', 'mallet', 'osteotome', 'osteotome', 'screws']
    : /cardiac-surg|vascular|cardiology/.test(dept) ? ['vclamp', 'vclamp', 'vclamp', 'saw']
    : /ophthalm/.test(dept) ? ['microforceps', 'microforceps', 'lidspec', 'phaco']
    : /dentist/.test(dept) ? ['mirror', 'explorer', 'extraction', 'elevator', 'elevator', 'syringe']
    : /^ent$/.test(dept) ? ['nasalspec', 'entscope', 'microforceps', 'frazier']
    : /obstet/.test(dept) ? ['usprobe', 'doyen', 'cusco']
    : /gynec/.test(dept) ? ['cusco', 'tvprobe', 'usprobe']
    : /anesth/.test(dept) ? ['laryngoscope', 'ett', 'lma', 'syringe']
    : /general|gastro|urolog|pediatric-surg|thoracic/.test(dept) ? ['trocar', 'trocar', 'trocar', 'grasper', 'grasper', 'scope']
    : ['metz', 'clamp', 'needle'];

  // ---------------------------------------------------------------- department → prepped site / posture
  function titleText(c) { const tt = c && c.title; return (tt && typeof tt === 'object' ? (tt.zh || '') + ' ' + (tt.en || '') : String(tt || '')) + ' ' + String((c && c.titleEn) || ''); }
  function siteFor(c, fieldType, room) {
    if (/^bedside/.test(fieldType || '') || room === 'ward' || room === 'clinic') return 'none';
    const d = (c && c.department) || '', tt = titleText(c);
    if (/ophthalm/.test(d)) return 'eye';
    if (/dentist/.test(d)) return 'mouth';
    if (d === 'ent') return /tonsil|扁桃|adenoid|腺樣|oral|口腔|口咽/i.test(tt) ? 'mouth' : /laryn|喉|thyroid|甲狀|neck|頸|trache|氣切|parotid|腮腺|salivary/i.test(tt) ? 'neck' : /sinus|鼻竇|nasal|鼻|septo|FESS/i.test(tt) ? 'face' : 'ear';
    if (/neurosurg/.test(d)) return /spine|脊|lumbar|腰|cervical|頸椎|disc|椎間|laminect|椎板|cord|脊髓/i.test(tt) ? 'back' : 'cranial';
    if (d === 'spine' || d === 'pain-medicine') return /anterior cervical|ACDF|前位頸/i.test(tt) ? 'neck' : 'back';
    if (/cardiac-surg/.test(d)) return 'chest';
    if (/cardiology|radiolog/.test(d)) return /radial|橈/i.test(tt) ? 'arm' : 'groin';
    if (/thoracic/.test(d)) return 'chest';
    if (/vascular/.test(d)) return /carotid|頸動脈/i.test(tt) ? 'neck' : /aort|AAA|EVAR|主動脈|腹/i.test(tt) ? 'abdomen' : /varic|靜脈曲張|bypass|繞道|amput|截肢|PAD|limb|下肢|femoral|股/i.test(tt) ? 'limb' : 'abdomen';
    if (/orthop|joint/.test(d)) return /wrist|radius|hand\b|腕|橈骨|手部|手掌|手指|carpal|finger|指骨|elbow|肘|shoulder|肩|humer|肱|clavic|鎖骨|cuff|旋轉肌/i.test(tt) ? 'arm' : /spine|脊|vertebr|椎/i.test(tt) ? 'back' : 'limb';
    if (/plastic/.test(d)) return /hand\b|手部|手掌|手指|tendon|肌腱|finger|指骨/i.test(tt) ? 'arm' : /face|臉|orbit|眼眶|zygoma|顴|cleft|唇|nose|鼻|ear|耳/i.test(tt) ? 'face' : /breast|乳/i.test(tt) ? 'chest' : 'limb';
    if (/obstet/.test(d)) return /caesar|cesar|剖腹|剖宮/i.test(tt) ? 'abdomen-low' : /deliver|vaginal|分娩|生產|產程|labou?r|perine|會陰|forceps|vacuum|產鉗|真空|dystocia|難產|episiot|breech|臀位|postpartum|產後出血|PPH/i.test(tt) ? 'lithotomy' : 'abdomen-low';
    if (/gynec/.test(d)) return /hysteroscop|子宮鏡|colposc|陰道鏡|cervi|子宮頸|LEEP|bartholin|巴氏腺|D&C|刮|vagin|陰道|IUD|LARC|insertion|置入|prolapse|脫垂/i.test(tt) ? 'lithotomy' : 'abdomen-low';
    if (/urolog/.test(d)) return /PCNL|percutaneous|經皮/i.test(tt) ? 'back' : /TUR|cysto|膀胱鏡|uretero|輸尿管鏡|urethr|尿道|prostat|攝護|前列|retention|滯留|catheter|導尿|URS/i.test(tt) ? 'lithotomy' : /kidney|腎|nephr/i.test(tt) ? 'abdomen' : 'pelvis';
    if (/pediatric-surg/.test(d) && /atresia|閉鎖|TOF|tracheo|氣管食道|oesophag|esophag|食道|diaphragm|橫膈|CDH|thorac|胸/i.test(tt)) return 'chest';
    if (/general-surg|gastro|pediatric-surg/.test(d)) return /thyroid|甲狀|parathyroid|副甲/i.test(tt) ? 'neck' : /breast|乳/i.test(tt) ? 'chest' : /hernia|疝|inguinal|腹股溝/i.test(tt) ? 'pelvis' : /append|闌尾|colon|結腸|rect|直腸|sigmoid|乙狀/i.test(tt) ? 'abdomen-low' : 'abdomen';
    if (/anesth/.test(d)) return /spinal|epidural|硬膜|脊髓麻醉|neuraxial|椎管/i.test(tt) ? 'back' : /block|阻斷|nerve|神經/i.test(tt) ? 'arm' : 'airway';
    if (fieldType === 'cranial') return 'cranial'; if (/thorax/.test(fieldType || '')) return 'chest'; if (fieldType === 'bone') return 'limb'; if (fieldType === 'cath') return 'groin';
    return 'abdomen';
  }
  const HEAD_SITES = { cranial: { dir: [-0.78, 0.62, 0], cap: 0.78, kind: 'cranial' }, eye: { dir: [-0.2, 0.92, 0.33], cap: 0.34, kind: 'eye' }, mouth: { dir: [0.45, 0.89, 0], cap: 0.4, kind: 'mouth' }, ear: { dir: [0.05, 0.25, 0.97], cap: 0.5, kind: 'ear' }, face: { dir: [-0.05, 1, 0], cap: 0.45, kind: 'face' } };
  const WINDOWS = { chest: [-0.6, -0.27, -0.09, 0.09], abdomen: [-0.28, 0.04, -0.11, 0.11], 'abdomen-low': [-0.12, 0.08, -0.15, 0.15], pelvis: [-0.02, 0.13, -0.12, 0.12], groin: [0.09, 0.22, -0.15, -0.04], limb: [0.3, 0.7, 0.03, 0.165], back: [-0.25, 0.06, -0.075, 0.075] };
  function fieldTex(site, fieldType, dept) {
    if (site === 'chest') return /thorax/.test(fieldType) ? fieldType : /cardiac/.test(dept) ? 'thorax-heart' : /thoracic/.test(dept) ? 'thorax-lung' : 'generic';
    if (site === 'abdomen-low') return /obstet/.test(dept) ? 'uterus' : 'abdomen';
    if (site === 'abdomen') return /vascular/.test(dept) ? 'vessel' : 'abdomen';
    if (site === 'limb') return /vascular/.test(dept) ? 'vessel' : 'bone';
    if (site === 'back') return 'spine'; if (site === 'groin') return 'groin'; if (site === 'arm') return 'hand'; if (site === 'lithotomy') return 'perineum'; if (site === 'neck') return 'neck';
    return 'generic';
  }
  // anatomical region from a point in the patient frame (x along the body, head at -x; y above the pad, anterior up when supine)
  function regionAt(x, y, z, posture) {
    if (posture === 'prone') { y = 0.22 - y; z = -z; }
    const az = Math.abs(z);
    if (x < -0.745) {
      if (az > 0.068 && x > -0.93 && x < -0.79 && y > 0.03 && y < 0.17) return 'neck';
      if (x > -0.845 && y > 0.13) return 'mouth';
      if (x > -0.92 && y > 0.155) return 'face';
      return 'head';
    }
    if (x < -0.665) return 'neck';
    if (x < -0.4 && az > 0.205) return 'upper-limb';
    if (x < 0.14) {
      if (az <= 0.22 && y < 0.045) return 'spine';
      if (x < -0.3) return az > 0.045 && az < 0.18 && y > 0.15 && y < 0.3 && x > -0.58 && x < -0.33 ? 'breast' : 'chest';
      if (x < -0.11) return 'abdomen-upper';
      if (x < 0.03) return 'abdomen-lower';
      return 'pelvis';
    }
    return 'lower-limb';
  }
  // torso cross-sections and leg radii (anterior surface height above the pad)
  const SECT = [[-0.68, 0.12, 0.06], [-0.62, 0.205, 0.1], [-0.5, 0.205, 0.115], [-0.38, 0.19, 0.118], [-0.25, 0.17, 0.11], [-0.12, 0.158, 0.105], [0, 0.17, 0.1], [0.1, 0.182, 0.095], [0.17, 0.165, 0.08]];
  function sect(x) { for (let i = 0; i < SECT.length - 1; i++) { const a = SECT[i], b = SECT[i + 1]; if (x >= a[0] && x <= b[0]) { const f = (x - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; } } return null; }
  function legR(x) { const L = [[0.12, 0.088], [0.3, 0.075], [0.5, 0.056], [0.58, 0.054], [0.7, 0.056], [0.82, 0.043], [0.9, 0.036]]; if (x < L[0][0] || x > L[L.length - 1][0]) return 0; for (let i = 0; i < L.length - 1; i++) if (x <= L[i + 1][0]) { const f = (x - L[i][0]) / (L[i + 1][0] - L[i][0]); return L[i][1] + (L[i + 1][1] - L[i][1]) * f; } return 0; }
  function bodyTop(x, z, legs) {
    let h = 0; const s = sect(x);
    if (s) { const u = Math.abs(z) / s[0]; h = u < 1 ? (0.105 + s[1] * Math.pow(1 - Math.pow(u, 2.4), 1 / 2.4)) : 0; }
    if (legs !== false) { const r = legR(x); if (r) for (const lz of [-0.092, 0.092]) { const dz = Math.abs(z - lz); if (dz < r) h = Math.max(h, r + Math.sqrt(r * r - dz * dz)); } if (x > 0.865 && x < 0.95) for (const lz of [-0.092, 0.092]) { const dz = Math.abs(z - lz); if (dz < 0.045) h = Math.max(h, 0.06 + 0.1 * Math.sqrt(Math.max(0, 1 - ((x - 0.905) / 0.045) ** 2)) * (1 - dz / 0.045 * 0.4)); } }
    return h;
  }
  // a draped (or blanketed) cloth heightfield over the body with a hanging skirt and an optional window
  function drapeGeometry(o) {
    const nx = o.nx || 70, nz = o.nz || 36, W = o.halfWidth || 0.29, skirt = o.skirt || 0.42, x0 = o.x0, x1 = o.x1, foot = o.footSkirt !== false;
    const pos = [], idx = [], uvs = []; const cols = nz + 1, rows = nx + 1; const span = W + skirt, footSpan = foot ? skirt * 0.9 : 0;
    for (let i = 0; i <= nx; i++) {
      const u = i / nx; let x = x0 + (x1 + footSpan - x0) * u; let fd = 0; if (x > x1) { fd = x - x1; x = x1 + Math.min(0.03, fd * 0.1); }
      for (let j = 0; j <= nz; j++) {
        const s = -span + 2 * span * (j / nz); const as = Math.abs(s), sg = s < 0 ? -1 : 1; let z, y;
        if (as <= W) { z = s; y = Math.max(0, o.top(x, z)) + 0.012; }
        else { const dd = as - W; z = sg * (W + 0.025 + dd * 0.07 + Math.sin(x * 23 + sg) * 0.012 * Math.min(1, dd * 3)); y = Math.max(0, o.top(x, sg * W)) + 0.012 - dd; }
        if (fd > 0) { y -= fd; }
        if (o.wrinkle) y += Math.sin(x * 31 + z * 17) * 0.003;
        pos.push(x, y, z); uvs.push(u, j / nz);
      }
    }
    const inside = (x, z) => o.hole && x > o.hole[0] && x < o.hole[1] && z > o.hole[2] && z < o.hole[3];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const a = i * cols + j, b = a + cols, c = a + 1, d = b + 1;
      if (o.hole) { const cx = (pos[a * 3] + pos[d * 3]) / 2, cz = (pos[a * 3 + 2] + pos[d * 3 + 2]) / 2; if (inside(cx, cz)) continue; }
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function patchGeometry(rect, top, lift) {
    const nx = 14, nz = 10, pos = [], uvs = [], idx = []; const [x0, x1, z0, z1] = rect;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) { const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz; pos.push(x, top(x, z) + (lift || 0.004), z); uvs.push(1 - j / nz, 1 - i / nx); }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const a = i * (nz + 1) + j, b = a + nz + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }

  // ---------------------------------------------------------------- operating table / stretcher / bed
  function buildTable(K, o) {
    const G = new THREE.Group(); const P = {}; const kit = id => P[id] || (P[id] = makeKit(K));
    const v = o.variant, site = o.site;
    const lith = site === 'lithotomy', head = !!HEAD_SITES[site] || site === 'neck';
    if (v === 'or') {
      const pad = kit('pad'), top = kit('table-top'), rail = kit('side-rail'), legk = kit('leg-section'), hr = kit('headrest'), colk = kit('column'), arm = kit('arm-board');
      // headrest
      hr.rbox(0.3, 0.04, 0.3, 0.02, -0.88, 0.862, 0, '#cfd6da', 'paint'); hr.cyl(0.012, 0.012, 0.12, -0.73, 0.85, 0.09, STEEL2, 'satin', 0, 0, Math.PI / 2, 8); hr.cyl(0.012, 0.012, 0.12, -0.73, 0.85, -0.09, STEEL2, 'satin', 0, 0, Math.PI / 2, 8);
      if (site === 'cranial') { // three-pin skull clamp on its swivel adaptor
        hr.cyl(0.02, 0.02, 0.22, -1.06, 0.97, 0, STEEL2, 'satin', 0, 0, 0, 10); hr.box(0.06, 0.05, 0.08, -1.06, 1.08, 0, '#9aa5aa', 'satin');
        hr.tor(0.135, 0.011, -0.86, PAD + 0.1, 0, '#c4ccd0', 'satin', Math.PI / 2, 0, Math.PI / 2, Math.PI * 1.05, 12);
        [[-0.86, 0.13], [-0.86, -0.13], [-0.995, 0]].forEach(([x, z]) => { hr.cyl(0.004, 0.009, 0.04, x + (z ? 0 : 0.02), PAD + 0.1, z ? z * 0.82 : 0, STEEL, 'metal', z ? Math.PI / 2 * Math.sign(z) : 0, 0, z ? 0 : -Math.PI / 2, 8); hr.cyl(0.012, 0.012, 0.03, x - (z ? 0 : 0.01), PAD + 0.1, z ? z * 1.04 : 0, '#5d6a70', 'satin', z ? Math.PI / 2 : 0, 0, z ? 0 : Math.PI / 2, 10); });
      } else if (o.posture === 'prone') hr.rbox(0.26, 0.1, 0.27, 0.03, -0.87, PAD + 0.02, 0, '#d8dde0', 'matte');
      else { hr.rbox(0.29, 0.05, 0.28, 0.02, -0.88, 0.905, 0, '#262b30', 'matte'); hr.tor(0.068, 0.024, -0.86, 0.935, 0, '#3f78a8', 'plastic', Math.PI / 2, 0, 0, Math.PI * 2, 10); }
      // carbon back section (separate textured mesh) + pads
      const cmat = new THREE.MeshStandardMaterial({ map: carbonTexture(), roughness: 0.32, metalness: 0.3 }); const carbon = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.045, 0.52), cmat); carbon.position.set(-0.39, 0.8675, 0); carbon.castShadow = carbon.receiveShadow = true; carbon.userData.part = 'radiolucent-top'; G.add(carbon);
      pad.rbox(0.63, 0.06, 0.5, 0.025, -0.39, 0.92, 0, '#23282c', 'matte'); top.rbox(0.38, 0.045, 0.52, 0.01, 0.14, 0.8675, 0, '#d3d9dc', 'paint'); pad.rbox(0.37, 0.06, 0.5, 0.025, 0.14, 0.92, 0, '#23282c', 'matte');
      if (lith) { [-1, 1].forEach(s => { legk.rbox(0.045, 0.6, 0.24, 0.01, 0.37, 0.56, s * 0.13, '#d3d9dc', 'paint'); pad.rbox(0.05, 0.58, 0.23, 0.02, 0.405, 0.56, s * 0.13, '#23282c', 'matte'); legk.seg([0.28, 0.86, s * 0.31], [0.4, 1.12, s * 0.38], 0.014, 0.014, STEEL2, 'satin'); legk.seg([0.4, 1.12, s * 0.38], [0.6, 1.2, s * 0.42], 0.014, 0.014, STEEL2, 'satin'); legk.rbox(0.05, 0.06, 0.07, 0.01, 0.28, 0.86, s * 0.31, '#9aa3a8', 'satin'); });
      } else [-1, 1].forEach(s => { legk.rbox(0.68, 0.045, 0.25, 0.01, 0.69, 0.8675, s * 0.13, '#d3d9dc', 'paint'); pad.rbox(0.67, 0.06, 0.245, 0.025, 0.69, 0.92, s * 0.13, '#23282c', 'matte'); });
      [-0.715, -0.06, 0.34].forEach(x => top.cyl(0.014, 0.014, 0.5, x, 0.85, 0, STEEL2, 'satin', Math.PI / 2, 0, 0, 10));
      top.box(1.4, 0.07, 0.24, -0.1, 0.8, 0, '#d5dadd', 'paint');
      // side rails, standoffs and clamps
      [[-0.7, -0.08], [-0.05, 0.33], lith ? null : [0.35, 1.02]].filter(Boolean).forEach(([a, b]) => [-1, 1].forEach(s => { rail.box(b - a, 0.03, 0.01, (a + b) / 2, 0.857, s * 0.284, '#cfd6da', 'metal'); for (let x = a + 0.04; x < b; x += 0.24) rail.box(0.012, 0.02, 0.02, x, 0.857, s * 0.272, STEEL2, 'satin'); }));
      [-0.2, 0.22, 0.78].forEach((x, i) => { if (lith && x > 0.4) return; const s = i % 2 ? 1 : -1; rail.rbox(0.05, 0.06, 0.035, 0.006, x, 0.855, s * 0.305, '#a9b2b7', 'satin'); rail.cyl(0.012, 0.012, 0.03, x, 0.855, s * 0.334, '#3a4247', 'rubber', Math.PI / 2, 0, 0, 10); });
      // column + bellows + base + castors + pendant hand control
      colk.rbox(0.36, 0.2, 0.26, 0.03, -0.12, 0.68, 0, '#e3e7ea', 'paint');
      for (let i = 0; i < 10; i++) colk.rbox(0.37 - (i % 2) * 0.025, 0.028, 0.27 - (i % 2) * 0.025, 0.008, -0.12, 0.3 + i * 0.026, 0, '#3a4146', 'rubber');
      colk.rbox(0.42, 0.14, 0.3, 0.03, -0.12, 0.2, 0, '#e3e7ea', 'paint'); colk.rbox(1.1, 0.1, 0.58, 0.04, -0.22, 0.07, 0, '#eceff1', 'paint'); colk.box(1.0, 0.012, 0.5, -0.22, 0.125, 0, '#b8c2c6', 'paint');
      [[-0.68, 0.22], [-0.68, -0.22], [0.26, 0.22], [0.26, -0.22]].forEach(([x, z]) => { colk.cyl(0.04, 0.04, 0.025, x, 0.04, z, '#2e3438', 'rubber', Math.PI / 2, 0, 0, 14); colk.cyl(0.035, 0.035, 0.012, x, 0.006, z * 0.8, '#5a6266', 'rubber', 0, 0, 0, 12); });
      colk.rbox(0.1, 0.025, 0.06, 0.008, 0.36, 0.12, 0.22, '#7d8a90', 'satin');
      const hx = 0.5, hz = 0.33; const coil = []; for (let i = 0; i <= 28; i++) { const a = i * 0.9; coil.push([hx + Math.cos(a) * 0.012, 0.84 - i * 0.0095, hz + Math.sin(a) * 0.012]); } colk.tube(coil, 0.0025, '#d9dee1', 'plastic', 120, 5);
      colk.rbox(0.07, 0.19, 0.035, 0.014, hx, 0.47, hz + 0.004, '#e8ebed', 'plastic'); for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 2; c2++) colk.rbox(0.022, 0.022, 0.008, 0.004, hx - 0.015 + c2 * 0.03, 0.53 - r * 0.035, hz + 0.022, r === 0 ? '#2f7f5f' : '#5d6a70', 'plastic');
      // arm boards with pads, straps, struts and rail clamps
      [-1, 1].forEach(s => { if (site === 'arm' && s > 0) { arm.rbox(0.42, 0.025, 0.66, 0.01, -0.52, 0.895, s * 0.66, '#3d454a', 'satin'); } else arm.rbox(0.16, 0.025, 0.62, 0.01, -0.52, 0.895, s * 0.62, '#b8c1c6', 'satin'); arm.rbox(0.16, 0.045, 0.6, 0.02, -0.52, 0.93, s * 0.63, '#23282c', 'matte'); arm.rbox(0.06, 0.07, 0.05, 0.008, -0.52, 0.86, s * 0.3, '#a9b2b7', 'satin'); arm.seg([-0.52, 0.85, s * 0.31], [-0.52, 0.88, s * 0.72], 0.01, 0.01, STEEL2, 'satin'); [-0.6, -0.44].forEach(x => arm.box(0.006, 0.095, 0.05, x, 0.995, s * 0.66, '#2d4f73', 'cloth')); arm.box(0.168, 0.008, 0.05, -0.52, 1.044, s * 0.66, '#2d4f73', 'cloth'); });
      if (o.screen) { [-1, 1].forEach(s => { rail.seg([-0.66, 0.86, s * 0.3], [-0.66, 1.47, s * 0.3], 0.012, 0.012, '#cfd6da', 'metal'); rail.rbox(0.05, 0.06, 0.035, 0.006, -0.66, 0.855, s * 0.305, '#a9b2b7', 'satin'); }); rail.cyl(0.012, 0.012, 0.6, -0.66, 1.47, 0, '#cfd6da', 'metal', Math.PI / 2, 0, 0, 10); }
    } else { // stretcher (ER) or ward / clinic bed
      const bed = v === 'bed', W = bed ? 0.45 : 0.31;
      const pad = kit('pad'), top = kit('table-top'), rail = kit('side-rail'), colk = kit('column'), hr = kit('headrest'), legk = kit('leg-section');
      top.box(1.98, 0.06, W * 2, 0, 0.8, 0, bed ? '#dfe4e7' : '#c4ccd0', 'satin'); pad.rbox(1.92, 0.15, W * 2 - 0.04, 0.05, 0, 0.875, 0, bed ? '#eef1f2' : '#2f5f86', bed ? 'matte' : 'plastic');
      [-1, 1].forEach(s => { [[-0.45, 0.62], [0.42, 0.55]].forEach(([x, l]) => { rail.rbox(l, 0.2, 0.025, 0.02, x, 1.06, s * (W + 0.02), bed ? '#d6dcdf' : '#cfd6da', bed ? 'plastic' : 'metal'); rail.box(l - 0.08, 0.015, 0.03, x, 1.06, s * (W + 0.02), '#9aa5aa', 'satin'); }); });
      colk.rbox(0.5, 0.45, 0.3, 0.04, 0, 0.45, 0, '#dfe4e7', 'paint'); colk.rbox(1.7, 0.08, W * 2 - 0.1, 0.03, 0, 0.12, 0, '#cfd6da', 'paint');
      [[-0.78, 1], [-0.78, -1], [0.78, 1], [0.78, -1]].forEach(([x, s]) => { colk.cyl(0.055, 0.055, 0.035, x, 0.055, s * (W - 0.06), '#2e3438', 'rubber', Math.PI / 2, 0, 0, 14); colk.box(0.04, 0.06, 0.05, x, 0.1, s * (W - 0.06), '#7d8a90', 'satin'); });
      if (bed) { hr.rbox(0.05, 0.6, W * 2 + 0.04, 0.02, -1.02, 1.0, 0, '#b49a7a', 'plastic'); legk.rbox(0.05, 0.45, W * 2 + 0.04, 0.02, 1.02, 0.95, 0, '#b49a7a', 'plastic'); pad.rbox(0.36, 0.1, 0.56, 0.04, -0.82, 1.0, 0, '#ffffff', 'cloth'); }
      else { hr.rbox(0.5, 0.05, W * 2 - 0.06, 0.02, -0.72, 0.99, 0, '#2f5f86', 'plastic', 0, 0, -0.35); legk.seg([0.98, 0.82, 0.25], [0.98, 1.85, 0.25], 0.012, 0.012, STEEL2, 'satin'); }
    }
    Object.keys(P).forEach(id => { const g = P[id].build(); g.traverse(m => { if (m.isMesh) m.userData.part = id; }); G.add(g); });
    return G;
  }

  // ---------------------------------------------------------------- patient (head, arms, drapes / blanket, prepped field)
  function buildPatient(K, o) {
    const G = new THREE.Group(); G.userData.patient = true; const site = o.site, posture = o.posture, bed = o.variant !== 'or';
    const SKIN = o.skin || '#dfae8a', DRAPE = '#346f9c', GOWN = '#8fb8cf';
    const sk = makeKit(K); const hs = HEAD_SITES[site];
    const lift = o.variant === 'bed' ? 0.07 : 0;
    const H = [-0.86, PAD + 0.1 + lift + (posture === 'prone' ? 0.03 : 0), 0];
    // head + face
    sk.sph(0.11, 0.095, 0.078, H[0], H[1], H[2], SKIN, 'skin', 20);
    if (posture !== 'prone') {
      sk.sph(0.016, 0.022, 0.013, H[0] + 0.005, H[1] + 0.093, 0, SKIN, 'skin', 10); sk.sph(0.022, 0.012, 0.062, H[0] - 0.035, H[1] + 0.084, 0, SKIN, 'skin', 10); sk.sph(0.026, 0.03, 0.042, H[0] + 0.08, H[1] + 0.066, 0, SKIN, 'skin', 12);
      sk.sph(0.012, 0.007, 0.024, H[0] + 0.046, H[1] + 0.088, 0, '#c4857a', 'skin', 8);
      [-1, 1].forEach(s => sk.box(0.026, 0.003, 0.02, H[0] - 0.018, H[1] + 0.093, s * 0.03, bed ? SKIN : '#f4f6f2', 'matte', 0, 0, 0.15));
    }
    [-1, 1].forEach(s => sk.sph(0.024, 0.03, 0.009, H[0], H[1] + (posture === 'prone' ? -0.005 : 0.005), s * 0.079, SKIN, 'skin', 10));
    if (!hs && site !== 'neck') sk.sph(0.106, 0.09, 0.084, H[0] - 0.026, H[1] + (posture === 'prone' ? 0.012 : -0.006), 0, '#6d9ec4', 'cloth', 16);
    sk.seg([-0.79, H[1] - 0.012, 0], [-0.66, H[1] - 0.012, 0], 0.052, 0.058, SKIN, 'skin', 14);
    // airway: tracheal tube taped at the mouth (not for awake bedside patients)
    if (o.variant === 'or' && site !== 'none') { if (posture !== 'prone' && site !== 'mouth' && site !== 'face') { sk.tube([[H[0] + 0.046, H[1] + 0.09, 0], [H[0] + 0.03, H[1] + 0.16, 0.01], [H[0] - 0.08, H[1] + 0.22, 0.05], [H[0] - 0.19, H[1] + 0.23, 0.09]], 0.0065, '#e6eff2', 'plastic', 24); sk.box(0.06, 0.004, 0.11, H[0] + 0.05, H[1] + 0.09, 0, '#f4f6f2', 'matte'); } }
    const out = { group: G, head: H, posture, site, fieldMesh: null, extras: [] };
    // arms
    const arms = makeKit(K);
    if (o.variant === 'or') {
      [-1, 1].forEach(s => {
        const yb = PAD + 0.0, S = [-0.56, PAD + 0.1, s * 0.2], E = [-0.53, yb + 0.05, s * 0.5], Wr = [-0.52, yb + 0.042, s * 0.8];
        if (site === 'arm' && s > 0) { arms.seg(S, E, 0.05, 0.045, DRAPE, 'cloth'); arms.cyl(0.058, 0.058, 0.09, -0.545, PAD + 0.075, s * 0.33, '#2b4f73', 'rubber', Math.PI / 2, 0, 0, 14); arms.seg(E, Wr, 0.042, 0.035, SKIN, 'skin'); arms.sph(0.05, 0.016, 0.036, -0.52, yb + 0.03, s * 0.88, SKIN, 'skin', 12); return; }
        arms.seg(S, E, 0.05, 0.045, GOWN, 'cloth', 12); arms.sph(0.046, 0.046, 0.046, E[0], E[1], E[2], SKIN, 'skin', 10); arms.seg(E, Wr, 0.042, 0.034, SKIN, 'skin', 12);
        arms.sph(0.05, 0.016, 0.037, -0.52, yb + 0.03, s * 0.885, SKIN, 'skin', 12); arms.sph(0.012, 0.012, 0.03, -0.555, yb + 0.03, s * 0.86, SKIN, 'skin', 8);
        if (s < 0) { arms.cyl(0.055, 0.055, 0.1, -0.545, PAD + 0.075, s * 0.34, '#1f3f66', 'rubber', Math.PI / 2, 0, 0, 14); }
        else { arms.box(0.025, 0.02, 0.03, -0.52, yb + 0.05, s * 0.935, '#2b3036', 'plastic'); arms.sph(0.004, 0.004, 0.004, -0.508, yb + 0.06, s * 0.94, '#ff4040', 'glow', 6); arms.box(0.03, 0.012, 0.04, -0.52, yb + 0.083, s * 0.7, '#e8f1f4', 'glass'); }
      });
    } else {
      [-1, 1].forEach(s => { const W = o.variant === 'bed' ? 0.25 : 0.22, y = PAD + 0.075 + (o.variant === 'bed' ? 0.02 : 0); arms.seg([-0.58, y + 0.02, s * W], [-0.3, y, s * (W + 0.02)], 0.047, 0.042, GOWN, 'cloth', 12); arms.seg([-0.3, y, s * (W + 0.02)], [-0.04, y - 0.005, s * (W + 0.01)], 0.04, 0.033, SKIN, 'skin', 12); arms.sph(0.05, 0.017, 0.036, 0.02, y - 0.01, s * W, SKIN, 'skin', 12); });
    }
    const armG = arms.build(); armG.traverse(m => { if (m.isMesh) m.userData.region = 'upper-limb'; }); G.add(armG);
    // drapes / blanket
    const legsOn = site !== 'lithotomy';
    const top = (x, z) => bodyTop(x, z, legsOn) * (posture === 'prone' ? 1 : 1);
    let hole = WINDOWS[site] || null; if (site === 'abdomen-low') hole = WINDOWS['abdomen-low'];
    const draped = o.variant === 'or' && site !== 'none' && site !== 'airway';
    if (draped) {
      const x0 = hs || site === 'neck' ? -0.67 : -0.655, x1 = site === 'lithotomy' ? 0.2 : 1.03;
      const dg = drapeGeometry({ x0, x1, top, hole, halfWidth: 0.29, skirt: 0.44, footSkirt: true, wrinkle: true });
      const dm = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: DRAPE, roughness: 0.95, metalness: 0, side: THREE.DoubleSide })); dm.position.y = PAD; dm.castShadow = dm.receiveShadow = true; G.add(dm);
      if (o.screen) { const sg = new THREE.PlaneGeometry(0.66, 0.52, 8, 6); const p = sg.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i); p.setX(i, p.getX(i)); p.setZ(i, Math.sin(p.getX(i) * 9) * 0.012 + (0.26 - yy) * 0.06); } sg.computeVertexNormals(); const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: DRAPE, roughness: 0.95, side: THREE.DoubleSide })); sm.rotation.y = Math.PI / 2; sm.position.set(-0.645, PAD + 0.26, 0); sm.castShadow = true; sm.userData.part = 'side-rail'; G.add(sm); }
      if (hs) { // head drape with an exposed cap over the operative site
        const dir = new THREE.Vector3(hs.dir[0], hs.dir[1], hs.dir[2]).normalize(); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const capG = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, hs.cap); capG.applyQuaternion(q); const capM = new THREE.Mesh(capG, new THREE.MeshStandardMaterial({ map: tex(capCanvas(hs.kind, o.progress)), roughness: 0.55 })); capM.scale.set(0.113, 0.098, 0.081); capM.position.set(H[0], H[1], H[2]); capM.userData.fieldKind = 'cap:' + hs.kind; G.add(capM); out.fieldMesh = capM;
        const drG = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, hs.cap + 0.04, Math.PI - hs.cap - 0.04); drG.applyQuaternion(q); const drM = new THREE.Mesh(drG, new THREE.MeshStandardMaterial({ color: DRAPE, roughness: 0.95 })); drM.scale.set(0.122, 0.106, 0.09); drM.position.set(H[0], H[1], H[2]); drM.castShadow = true; G.add(drM);
      } else if (site === 'neck') {
        const drG = new THREE.SphereGeometry(1, 24, 14); const drM = new THREE.Mesh(drG, new THREE.MeshStandardMaterial({ color: DRAPE, roughness: 0.95 })); drM.scale.set(0.122, 0.106, 0.09); drM.position.set(H[0], H[1], H[2]); G.add(drM);
        const ng = new THREE.CylinderGeometry(0.061, 0.061, 0.13, 20, 1, true, -Math.PI * 0.38, Math.PI * 0.76); ng.rotateZ(Math.PI / 2); const nmM = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({ map: tex(fieldCanvas('neck', o.progress)), roughness: 0.6 })); nmM.position.set(-0.72, H[1] - 0.012, 0); nmM.rotation.x = 0; G.add(nmM); out.fieldMesh = nmM; nmM.userData.fieldKind = 'neck';
      }
      if (hole) { const pg = patchGeometry([hole[0] - 0.012, hole[1] + 0.012, hole[2] - 0.012, hole[3] + 0.012], top, 0.006); const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: tex(fieldCanvas(o.fieldTex, o.progress)), roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 })); pm.position.y = PAD; pm.receiveShadow = true; G.add(pm); out.fieldMesh = pm; pm.userData.fieldKind = o.fieldTex; }
      if (site === 'arm') { const pg = new THREE.PlaneGeometry(0.11, 0.24); const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: tex(fieldCanvas('hand', o.progress)), roughness: 0.55 })); pm.rotation.set(-Math.PI / 2, 0, 0); pm.position.set(-0.52, PAD + 0.083, 0.66); G.add(pm); out.fieldMesh = pm; pm.userData.fieldKind = 'hand'; pm.userData.region = 'upper-limb'; }
      if (site === 'lithotomy') { // draped legs in boot stirrups, perineal field, fluid pouch
        const lk = makeKit(K);
        [-1, 1].forEach(s => { const Hp = [0.13, PAD + 0.08, s * 0.1], Kn = [0.38, PAD + 0.42, s * 0.31], A = [0.62, PAD + 0.26, s * 0.4]; lk.seg(Hp, Kn, 0.09, 0.065, DRAPE, 'cloth', 14); lk.sph(0.066, 0.066, 0.066, Kn[0], Kn[1], Kn[2], DRAPE, 'cloth', 12); lk.seg(Kn, A, 0.062, 0.05, DRAPE, 'cloth', 14); lk.rbox(0.3, 0.06, 0.1, 0.03, 0.55, PAD + 0.22, s * 0.38, '#2b3a44', 'plastic', 0, -s * 0.2, -0.45); lk.sph(0.06, 0.055, 0.075, 0.67, PAD + 0.27, s * 0.41, DRAPE, 'cloth', 12); });
        lk.rbox(0.05, 0.42, 0.42, 0.04, 0.24, PAD - 0.22, 0, DRAPE, 'cloth'); lk.lathe([[0.001, 0], [0.16, 0.0], [0.2, 0.12], [0.21, 0.2]], 0.3, PAD - 0.5, 0, '#dfeff4', 'glass', 18);
        const lg = lk.build(); lg.traverse(m => { if (m.isMesh) m.userData.region = 'lower-limb'; }); G.add(lg);
        const pg = new THREE.PlaneGeometry(0.16, 0.12); const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: tex(fieldCanvas('perineum', o.progress)), roughness: 0.55 })); pm.rotation.y = Math.PI / 2; pm.position.set(0.205, PAD + 0.06, 0); pm.userData.region = 'pelvis'; G.add(pm); out.fieldMesh = pm; pm.userData.fieldKind = 'perineum';
      }
    } else { // ward / clinic / ER: blanket to the chest, gown above
      const W = o.variant === 'bed' ? 0.44 : o.variant === 'or' ? 0.29 : 0.3;
      const blank = drapeGeometry({ x0: -0.5, x1: 0.97, top: (x, z) => bodyTop(x, z, true) + (o.variant === 'bed' ? 0.02 : 0), halfWidth: W, skirt: 0.2, footSkirt: true, wrinkle: true });
      const bm = new THREE.Mesh(blank, new THREE.MeshStandardMaterial({ color: o.variant === 'bed' ? '#d9e7ef' : '#e8eef0', roughness: 0.95, side: THREE.DoubleSide })); bm.position.y = PAD; bm.castShadow = bm.receiveShadow = true; G.add(bm);
      const gown = drapeGeometry({ x0: -0.67, x1: -0.49, top: (x, z) => bodyTop(x, z, true) - 0.004 + (o.variant === 'bed' ? 0.02 : 0), halfWidth: 0.21, skirt: 0.05, footSkirt: false });
      const gm = new THREE.Mesh(gown, new THREE.MeshStandardMaterial({ color: GOWN, roughness: 0.9, side: THREE.DoubleSide })); gm.position.y = PAD; G.add(gm);
    }
    const sg = sk.build(); G.add(sg);
    G.traverse(m => { if (m.isMesh) { m.userData.patient = true; } });
    return out;
  }

  // ---------------------------------------------------------------- equipment
  const PAINT = '#e9edf0', PAINT2 = '#d6dde1', GREY = '#9aa5aa';
  function screenMesh(w, h, c, opts) { opts = opts || {}; const tx = c && c.isTexture ? c : tex(c); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: opts.glow ?? 0.9, roughness: 0.3, metalness: 0 })); m.userData.tex = tx; return m; }
  function castors(k, pts, r) { pts.forEach(([x, z]) => { k.cyl(r || 0.035, r || 0.035, 0.025, x, r || 0.035, z, '#2e3438', 'rubber', Math.PI / 2, 0, 0, 12); k.box(0.03, 0.05, 0.035, x, (r || 0.035) * 2 + 0.01, z, GREY, 'satin'); }); }
  function cArm(k, cx, cz, yaw) { // C centred on (cx, 1.0, cz); its plane is perpendicular to local x; chassis at local +z
    k.at(cx, 0, cz, yaw || 0, () => {
      const bz = 0.65;
      k.rbox(0.95, 0.28, 0.55, 0.05, 0, 0.22, bz + 0.35, PAINT, 'paint', 0, Math.PI / 2, 0); castors(k, [[-0.22, bz + 0.75], [0.22, bz + 0.75], [0, bz - 0.05]], 0.06);
      k.rbox(0.26, 1.1, 0.26, 0.04, 0, 0.9, bz + 0.4, PAINT, 'paint'); k.seg([-0.2, 1.05, bz + 0.72], [0.2, 1.05, bz + 0.72], 0.016, 0.016, GREY, 'satin');
      k.rbox(0.18, 0.18, bz + 0.4 - 0.62, 0.03, 0, 1.0, (bz + 0.4 + 0.62) / 2, PAINT, 'paint');
      k.rbox(0.2, 0.26, 0.14, 0.03, 0, 1.0, 0.66, PAINT2, 'paint');
      k.tor(0.62, 0.05, 0, 1.0, 0, PAINT, 'paint', 0, -Math.PI / 2, -Math.PI * 100 / 180, Math.PI * 200 / 180, 16);
      const a1 = Math.PI * 100 / 180; const ty = 1.0 + 0.62 * Math.sin(a1), tz = 0.62 * Math.cos(a1);
      k.cyl(0.19, 0.19, 0.16, 0, ty - 0.06, tz + 0.02, PAINT2, 'paint', 0, 0, 0, 24); k.cyl(0.17, 0.17, 0.01, 0, ty - 0.145, tz + 0.02, '#2b3237', 'plastic', 0, 0, 0, 24);
      k.rbox(0.22, 0.2, 0.3, 0.04, 0, 2.0 - ty + 0.06, tz + 0.02, PAINT2, 'paint'); k.box(0.12, 0.05, 0.12, 0, 2.0 - ty + 0.17, tz + 0.02, '#2b3237', 'plastic');
    });
  }
  function equipment(id, api, K, ctx) {
    const g = new THREE.Group(); const d = api.c.department || ''; const room = api.roomType; const k = makeKit(K); let name = null, equip = id, screens = [];
    const S = (w, h, c, x, y, z, ry, kind, glow) => { const m = screenMesh(w, h, c, { glow }); m.position.set(x, y, z); if (ry) m.rotation.y = ry; g.add(m); if (kind) screens.push({ mesh: m, kind }); return m; };
    switch (id) {
      case 'field': break;
      case 'monitor': { // ceiling pendant with gas outlets and the patient monitor on a swivel arm
        k.rbox(0.26, ROOM.h - 0.95, 0.26, 0.04, 0, (ROOM.h + 0.95) / 2, 0, PAINT, 'paint'); k.rbox(0.42, 0.04, 0.34, 0.015, 0, 1.0, 0.04, PAINT2, 'paint'); k.rbox(0.42, 0.04, 0.34, 0.015, 0, 1.32, 0.04, PAINT2, 'paint');
        [['#f4f6f8', 0.07], ['#2b3237', 0.0], ['#f2c230', -0.07], ['#3f7fd0', -0.14]].forEach(([c2, x]) => { k.cyl(0.018, 0.018, 0.02, x + 0.035, 1.6, 0.135, c2, 'plastic', Math.PI / 2, 0, 0, 10); k.cyl(0.008, 0.008, 0.025, x + 0.035, 1.6, 0.15, '#c9d0d3', 'metal', Math.PI / 2, 0, 0, 8); });
        k.cyl(0.03, 0.03, 0.3, 0.18, 1.85, 0.05, GREY, 'satin', 0, 0, Math.PI / 2, 10); k.rbox(0.56, 0.4, 0.07, 0.03, 0.34, 1.86, 0.12, '#1d262c', 'plastic', 0, -0.35, 0);
        k.rbox(0.08, 0.24, 0.16, 0.01, -0.06, 1.15, 0.14, '#2b3237', 'plastic');
        const sc = S(0.5, 0.33, ctx.monitorTex, 0, 0, 0, 0, null, 1.1); sc.position.set(0.34 + Math.sin(-0.35) * 0.037, 1.86, 0.12 + Math.cos(-0.35) * 0.037); sc.rotation.y = -0.35; g.userData.screen = sc;
        name = say('吊塔與生理監視器', 'Pendant & patient monitor'); break; }
      case 'anesthesia': { // body faces +z; the group is rotated to face the anaesthetist
        k.rbox(0.78, 0.86, 0.64, 0.05, 0, 0.5, 0, PAINT, 'paint'); castors(k, [[-0.32, 0.25], [0.32, 0.25], [-0.32, -0.25], [0.32, -0.25]]);
        for (let i = 0; i < 3; i++) { k.box(0.5, 0.18, 0.012, -0.08, 0.26 + i * 0.2, 0.322, PAINT2, 'paint'); k.box(0.16, 0.018, 0.02, -0.08, 0.33 + i * 0.2, 0.335, GREY, 'satin'); }
        k.rbox(0.86, 0.035, 0.5, 0.012, 0, 0.94, 0.08, '#cfd6da', 'satin'); k.rbox(0.78, 0.6, 0.42, 0.04, 0, 1.26, -0.08, PAINT, 'paint'); k.rbox(0.76, 0.04, 0.38, 0.015, 0, 1.58, -0.07, PAINT2, 'paint');
        k.rbox(0.28, 0.32, 0.06, 0.02, -0.2, 1.24, 0.15, '#dfe5e8', 'paint'); [['#2fa36b', -0.29], ['#f4f6f8', -0.2], ['#3f7fd0', -0.11]].forEach(([c2, x]) => { k.cyl(0.016, 0.016, 0.26, x, 1.24, 0.19, '#eef6f8', 'glass', 0, 0, 0, 10); k.cyl(0.012, 0.012, 0.025, x, 1.14 + Math.random() * 0.12, 0.19, c2, 'plastic', 0, 0, 0, 8); k.cyl(0.014, 0.014, 0.03, x, 1.07, 0.2, c2, 'plastic', Math.PI / 2, 0, 0, 10); });
        [['#f2c230', -0.18], ['#3f7fd0', 0.0]].forEach(([c2, x]) => { k.rbox(0.13, 0.24, 0.17, 0.02, x, 1.72, -0.02, c2, 'paint'); k.cyl(0.04, 0.04, 0.03, x, 1.86, 0.02, '#e8ebed', 'plastic', 0, 0, 0, 16); k.box(0.1, 0.03, 0.05, x, 1.66, 0.075, '#f4f6f8', 'matte'); });
        k.rbox(0.22, 0.05, 0.22, 0.02, 0.25, 0.98, 0.12, '#cfd6da', 'paint'); k.cyl(0.075, 0.075, 0.24, 0.25, 1.13, 0.12, '#e8f3f6', 'glass', 0, 0, 0, 18); k.cyl(0.07, 0.07, 0.03, 0.25, 1.265, 0.12, '#cfd6da', 'satin', 0, 0, 0, 18);
        k.cyl(0.06, 0.06, 0.18, 0.43, 0.8, 0.12, '#e7e0f2', 'glass', 0, 0, 0, 14); for (let i = 0; i < 6; i++) k.cyl(0.055, 0.055, 0.02, 0.43, 0.74 + i * 0.025, 0.12, i % 2 ? '#c9b5e3' : '#f2eef8', 'matte', 0, 0, 0, 12);
        k.cyl(0.045, 0.045, 0.02, 0.4, 1.05, 0.2, '#f4f6f8', 'plastic', Math.PI / 2, 0, 0, 16); k.disc(0.038, 0.4, 1.05, 0.212, '#ffffff', 'matte', 0, 0, 0, 20); k.cyl(0.03, 0.03, 0.04, 0.43, 1.22, 0.24, '#f2c230', 'plastic', 0, 0, 0, 12);
        [0, 1].forEach(i => { k.cyl(0.055, 0.055, 0.68, -0.28 + i * 0.16, 0.92, -0.36, i ? '#3f7fd0' : '#f4f6f8', 'paint', 0, 0, 0, 14); k.cyl(0.04, 0.05, 0.06, -0.28 + i * 0.16, 1.29, -0.36, '#c9d0d3', 'metal', 0, 0, 0, 12); });
        k.tube([[0.1, 1.6, -0.25], [0.1, 2.3, -0.3], [0.2, 3.1, -0.4]], 0.012, '#f4f6f8', 'plastic'); k.tube([[0.16, 1.6, -0.25], [0.18, 2.3, -0.32], [0.3, 3.1, -0.42]], 0.012, '#f2c230', 'plastic');
        k.rbox(0.5, 0.36, 0.05, 0.02, 0.0, 1.85, 0.0, '#1d262c', 'plastic', -0.15, 0, 0); k.cyl(0.02, 0.02, 0.2, 0, 1.7, -0.02, GREY, 'satin', 0, 0, 0, 8);
        S(0.45, 0.31, screenCanvas('anesthesia', { etco2: (api.vitals && api.vitals.etco2) || 36 }), 0, 1.853, 0.028, 0, null, 1).rotation.x = -0.15;
        const bag = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshStandardMaterial({ color: '#2a6f9c', roughness: 0.55 })); bag.scale.set(0.7, 1, 0.7); bag.position.set(0.5, 1.02, 0.22); g.add(bag); g.userData.bag = bag;
        const bel = new THREE.Mesh(new THREE.LatheGeometry([0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => new THREE.Vector2(0.055 + (i % 2) * 0.012, i * 0.024)), 16), new THREE.MeshStandardMaterial({ color: '#3a86c8', roughness: 0.5 })); bel.position.set(0.25, 1.01, 0.12); g.add(bel); g.userData.bellows = bel;
        // laryngoscope, tracheal tubes and syringes ready on the work surface
        place(k, 'laryngoscope', -0.25, 0.96, 0.2, 0.3); place(k, 'ett', -0.12, 0.96, 0.15, 0.2); place(k, 'syringe', 0.02, 0.96, 0.2, 0.1); place(k, 'syringe', 0.02, 0.96, 0.25, 0.1);
        name = say('麻醉機', 'Anaesthesia machine'); break; }
      case 'tray': { // Mayo stand: U base, post and cantilever tray over the patient, draped
        if (room === 'ward' || room === 'clinic') { k.rbox(0.6, 0.03, 0.42, 0.01, 0, 0.92, 0, '#cfd6da', 'satin'); k.rbox(0.6, 0.03, 0.42, 0.01, 0, 0.45, 0, '#cfd6da', 'satin'); [[-0.28, -0.19], [0.28, -0.19], [-0.28, 0.19], [0.28, 0.19]].forEach(([x, z]) => k.cyl(0.012, 0.012, 0.9, x, 0.47, z, STEEL2, 'satin', 0, 0, 0, 8)); castors(k, [[-0.28, -0.19], [0.28, -0.19], [-0.28, 0.19], [0.28, 0.19]], 0.03); k.box(0.58, 0.01, 0.4, 0, 0.94, 0, '#6aa0c8', 'cloth'); place(k, 'forceps', -0.2, 0.945, -0.1, 0); place(k, 'mayo', -0.2, 0.945, 0.0, 0); place(k, 'sponges', 0.08, 0.945, -0.08, 0, 4); place(k, 'bowl', 0.18, 0.945, 0.1, 0, 0.06); name = say('換藥車', 'Dressing trolley'); break; }
        k.box(0.06, 0.04, 0.62, -0.22, 0.04, 0.02, STEEL2, 'satin'); k.box(0.06, 0.04, 0.62, 0.22, 0.04, 0.02, STEEL2, 'satin'); k.box(0.5, 0.04, 0.06, 0, 0.04, 0.3, STEEL2, 'satin'); castors(k, [[-0.22, -0.28], [0.22, -0.28], [-0.22, 0.3], [0.22, 0.3]], 0.03);
        k.cyl(0.022, 0.022, 1.06, 0, 0.6, 0.24, '#cfd6da', 'metal', 0, 0, 0, 12); k.cyl(0.03, 0.03, 0.08, 0, 0.98, 0.24, GREY, 'satin', 0, 0, 0, 12); k.box(0.04, 0.03, 0.5, 0, 1.105, -0.01, STEEL2, 'satin');
        k.rbox(0.6, 0.02, 0.4, 0.008, 0, 1.12, -0.32, '#c9d0d3', 'metal'); k.rbox(0.64, 0.012, 0.44, 0.006, 0, 1.135, -0.32, '#3d7fae', 'cloth'); k.box(0.64, 0.16, 0.01, 0, 1.06, -0.54, '#3d7fae', 'cloth'); k.box(0.01, 0.16, 0.44, -0.32, 1.06, -0.32, '#3d7fae', 'cloth'); k.box(0.01, 0.16, 0.44, 0.32, 1.06, -0.32, '#3d7fae', 'cloth');
        const Y = 1.141; const order = [['scalpel', 10], ['scalpel', 15], ['metz'], ['mayo'], ['forceps', true], ['forceps', false], ['needle'], ['needle'], ['clamp'], ['clamp']];
        order.forEach((it, i) => place(k, it[0], -0.27 + i * 0.04, Y, -0.16, Math.PI / 2, it[1]));
        place(k, 'yankauer', 0.15, Y, -0.13, Math.PI / 2); place(k, 'sponges', 0.24, Y, -0.24, 0.3, 5); place(k, DEPT_SET(d)[0], 0.2, Y, -0.42, 0);
        name = say('Mayo 器械托盤', 'Mayo instrument stand'); break; }
      case 'cart': { k.rbox(0.72, 0.92, 0.5, 0.03, 0, 0.53, 0, '#e3e8eb', 'paint'); castors(k, [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]], 0.035); ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad'].forEach((c2, i) => { k.box(0.64, 0.12, 0.015, 0, 0.2 + i * 0.13, 0.252, '#f4f6f8', 'plastic'); k.box(0.62, 0.02, 0.02, 0, 0.24 + i * 0.13, 0.262, c2, 'plastic'); k.box(0.14, 0.02, 0.02, 0, 0.19 + i * 0.13, 0.265, GREY, 'satin'); }); k.rbox(0.76, 0.04, 0.54, 0.015, 0, 1.01, 0, '#cfd6da', 'satin'); k.box(0.16, 0.2, 0.16, 0.22, 1.13, -0.12, '#f1c40f', 'plastic'); k.box(0.12, 0.05, 0.12, 0.22, 1.255, -0.12, '#e74c3c', 'plastic'); for (let i = 0; i < 6; i++) k.cyl(0.012, 0.012, 0.06, -0.25 + i * 0.03, 1.06, 0.12, ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6', '#ecf0f1'][i], 'plastic', 0, 0, 0, 8); place(k, 'syringe', -0.2, 1.03, 0.0, 0.2); place(k, 'syringe', -0.1, 1.03, 0.02, 0.2); name = say('麻醉藥物車', 'Anaesthesia drug cart'); break; }
      case 'drains': { // suction trolley with canisters and drains
        k.rbox(0.42, 0.03, 0.32, 0.01, 0, 0.12, 0, GREY, 'satin'); castors(k, [[-0.18, -0.13], [0.18, -0.13], [-0.18, 0.13], [0.18, 0.13]], 0.03); k.cyl(0.018, 0.018, 1.3, 0, 0.78, -0.12, '#cfd6da', 'metal', 0, 0, 0, 10);
        [-0.12, 0.0, 0.12].forEach((x, i) => { k.cyl(0.07, 0.07, 0.26, x, 0.6, 0.04, '#eef6f8', 'glass', 0, 0, 0, 18); k.cyl(0.066, 0.066, 0.06 + i * 0.05, x, 0.5 + (0.06 + i * 0.05) / 2, 0.04, '#9c2a2a', 'fluid', 0, 0, 0, 16); k.cyl(0.074, 0.074, 0.03, x, 0.745, 0.04, '#2e86c1', 'plastic', 0, 0, 0, 18); k.cyl(0.01, 0.01, 0.04, x + 0.03, 0.78, 0.04, '#e8ebed', 'plastic', 0, 0, 0, 8); });
        k.rbox(0.36, 0.04, 0.2, 0.01, 0, 0.47, 0.04, '#cfd6da', 'satin'); k.rbox(0.12, 0.16, 0.08, 0.02, 0, 1.25, -0.06, '#f4f6f8', 'plastic'); k.cyl(0.035, 0.035, 0.02, 0, 1.28, -0.015, '#ffffff', 'matte', Math.PI / 2, 0, 0, 16);
        k.tube([[0.03, 0.8, 0.04], [0.1, 1.05, 0.3], [0.2, 1.05, 0.9], [0.28, 0.98, 1.3]], 0.006, '#e6eff2', 'plastic', 40);
        k.rbox(0.12, 0.18, 0.04, 0.02, 0.18, 0.95, -0.12, '#f4e6d8', 'glass'); k.box(0.1, 0.06, 0.035, 0.18, 0.9, -0.12, '#b03a3a', 'fluid');
        name = say('抽吸與引流', 'Suction & drains'); equip = 'drains'; break; }
      case 'imaging': { k.rbox(1.5, 0.05, 0.7, 0.01, 0, 0.75, 0, '#d7dde0', 'paint'); [-0.7, 0.7].forEach(x => k.box(0.05, 0.73, 0.6, x, 0.365, 0, GREY, 'satin')); [-0.36, 0.36].forEach(x => { k.rbox(0.66, 0.44, 0.04, 0.012, x, 1.12, -0.22, '#1d262c', 'plastic'); k.cyl(0.02, 0.02, 0.2, x, 0.88, -0.24, GREY, 'satin', 0, 0, 0, 8); k.box(0.2, 0.012, 0.14, x, 0.78, -0.24, GREY, 'satin'); });
        const s1 = S(0.62, 0.4, screenCanvas('pacs'), -0.36, 1.12, -0.198); const s2 = S(0.62, 0.4, screenCanvas('xray'), 0.36, 1.12, -0.198, 0, 'pacs'); g.userData.brainScreen = s1; g.userData.screen2 = s2;
        k.box(0.45, 0.02, 0.15, 0, 0.785, 0.15, '#2d3436', 'plastic'); k.rbox(0.06, 0.025, 0.1, 0.012, 0.32, 0.785, 0.15, '#2d3436', 'plastic'); k.cyl(0.24, 0.24, 0.06, 0, 0.5, 0.6, '#2d3436', 'matte', 0, 0, 0, 20); k.cyl(0.025, 0.03, 0.45, 0, 0.25, 0.6, GREY, 'satin', 0, 0, 0, 10); k.rbox(0.46, 0.5, 0.06, 0.03, 0, 0.82, 0.82, '#2d3436', 'matte');
        name = say('影像工作站（PACS）', 'Imaging workstation (PACS)'); break; }
      case 'lab': { k.rbox(1.3, 0.88, 0.6, 0.02, 0, 0.44, 0, '#e9eef2', 'paint'); for (let i = 0; i < 3; i++) k.box(0.4, 0.8, 0.012, -0.43 + i * 0.43, 0.44, 0.302, '#dde4e8', 'paint'); k.rbox(1.34, 0.04, 0.64, 0.01, 0, 0.9, 0, '#2b3036', 'plastic');
        k.rbox(0.42, 0.36, 0.38, 0.03, -0.38, 1.1, -0.05, '#f4f6f8', 'paint'); k.box(0.16, 0.02, 0.1, -0.3, 1.1, 0.145, '#2b3036', 'plastic');
        k.cyl(0.12, 0.13, 0.18, 0.05, 1.01, -0.12, '#dfe5e8', 'paint', 0, 0, 0, 20); k.cyl(0.1, 0.1, 0.01, 0.05, 1.105, -0.12, '#9aa5aa', 'glass', 0, 0, 0, 20);
        k.rbox(0.18, 0.05, 0.1, 0.01, 0.25, 0.945, 0.15, '#f4f6f8', 'plastic'); ['#b03a3a', '#f1c40f', '#8e44ad', '#2a7a9c', '#2ecc71'].forEach((c2, i) => { k.cyl(0.008, 0.008, 0.09, 0.18 + i * 0.035, 0.995, 0.15, '#f2f6f8', 'glass', 0, 0, 0, 8); k.cyl(0.0095, 0.0095, 0.015, 0.18 + i * 0.035, 1.045, 0.15, c2, 'plastic', 0, 0, 0, 8); });
        k.rbox(0.2, 0.04, 0.2, 0.01, 0.45, 0.94, -0.05, '#2d3436', 'paint'); k.seg([0.45, 0.96, -0.12], [0.45, 1.22, -0.1], 0.02, 0.02, '#2d3436', 'paint'); k.rbox(0.1, 0.08, 0.16, 0.02, 0.45, 1.24, -0.03, '#2d3436', 'paint'); [-0.025, 0.025].forEach(dz => k.cyl(0.011, 0.011, 0.07, 0.45 + dz, 1.3, 0.02, '#1b1f22', 'plastic', -0.6, 0, 0, 10)); k.cyl(0.012, 0.006, 0.05, 0.45, 1.18, 0.02, '#b8c1c6', 'metal', 0, 0, 0, 10); k.box(0.12, 0.015, 0.1, 0.45, 1.06, 0.02, '#cfd6da', 'satin');
        for (let i = 0; i < 4; i++) k.box(0.075, 0.002, 0.025, 0.25 + i * 0.03, 0.925, -0.2, '#f5f8fa', 'glass', 0, 0.2, 0);
        S(0.34, 0.21, screenCanvas('smear'), -0.38, 1.18, 0.135, 0, 'lab', 0.9);
        name = say('檢驗、血氣與病理站', 'Labs, blood gas & pathology'); break; }
      case 'chart': { k.cyl(0.025, 0.03, 1.1, 0, 0.55, 0, GREY, 'satin', 0, 0, 0, 10); k.cyl(0.28, 0.28, 0.04, 0, 0.02, 0, '#55606a', 'satin', 0, 0, 0, 5); castors(k, [[0.26, 0], [-0.2, 0.17], [-0.2, -0.17]], 0.025); k.rbox(0.5, 0.03, 0.4, 0.01, 0, 1.08, 0, '#d7dde0', 'paint'); k.rbox(0.42, 0.26, 0.02, 0.01, 0, 1.24, -0.12, '#1d262c', 'plastic', -0.25, 0, 0); k.box(0.36, 0.012, 0.13, 0, 1.1, 0.1, '#2d3436', 'plastic'); const sc = S(0.38, 0.22, screenCanvas('chart', { patient: pk(api.c.patient) }), 0, 1.245, -0.106); sc.rotation.x = -0.25; name = say('病歷與同意書', 'Chart & consent'); break; }
      case 'whiteboard': { k.rbox(1.64, 1.04, 0.04, 0.01, 0, 1.6, 0, '#cfd6da', 'satin'); k.box(1.6, 1.0, 0.03, 0, 1.6, 0.005, '#ffffff', 'paint'); k.box(1.5, 0.03, 0.06, 0, 1.07, 0.03, GREY, 'satin'); S(1.52, 0.92, screenCanvas('whiteboard', { title: pk(api.c.title) }), 0, 1.6, 0.025, 0, null, 0.35); name = say('白板／WHO 核對', 'Board / WHO checklist'); break; }
      case 'huddle': { k.rbox(1.12, 0.67, 0.05, 0.015, 0, 1.7, 0, '#111', 'plastic'); S(1.02, 0.58, screenCanvas('whiteboard', { title: say('交班 SBAR', 'Handover SBAR') }), 0, 1.7, 0.03, 0, null, 0.8); k.cyl(0.45, 0.45, 0.04, 0, 0.95, 0.9, '#e9eef2', 'paint', 0, 0, 0, 24); k.cyl(0.04, 0.06, 0.95, 0, 0.47, 0.9, GREY, 'satin', 0, 0, 0, 10); name = say('團隊討論與交班', 'Huddle & handover'); break; }
      case 'recovery': { k.rbox(2.0, 0.22, 0.95, 0.06, 0, 0.62, 0, '#f4f6f8', 'matte'); k.box(2.05, 0.08, 1.0, 0, 0.45, 0, GREY, 'satin'); [-1, 1].forEach(s => k.rbox(0.9, 0.26, 0.03, 0.02, -0.4, 0.86, s * 0.5, '#cfd6da', 'plastic')); k.rbox(0.42, 0.11, 0.55, 0.04, -0.75, 0.78, 0, '#ffffff', 'cloth'); k.rbox(1.2, 0.05, 0.9, 0.02, 0.3, 0.75, 0, '#cfe3dd', 'cloth'); castors(k, [[-0.85, -0.4], [-0.85, 0.4], [0.85, -0.4], [0.85, 0.4]], 0.05); k.rbox(0.36, 0.26, 0.06, 0.02, -1.2, 1.5, -0.4, '#1d262c', 'plastic'); k.cyl(0.02, 0.02, 1.4, -1.2, 0.75, -0.42, GREY, 'satin', 0, 0, 0, 8); g.userData.screen = S(0.3, 0.2, ctx.monitorTex, -1.2, 1.5, -0.365, 0, null, 1); name = say('恢復室／加護床', 'Recovery / ICU bed'); break; }
      case 'door': { k.rbox(2.3, 2.45, 0.14, 0.02, 0, 1.225, -0.02, '#b8c4c8', 'satin'); [-0.52, 0.52].forEach(x => { k.rbox(1.0, 2.2, 0.06, 0.02, x, 1.12, 0.04, '#dfe6e9', 'paint'); k.box(0.42, 0.5, 0.065, x, 1.6, 0.042, '#9fd3e8', 'glass'); k.box(0.03, 0.4, 0.04, x + (x < 0 ? 0.42 : -0.42), 1.05, 0.09, GREY, 'satin'); }); k.box(0.14, 0.14, 0.02, 1.25, 1.2, 0.08, '#2b3036', 'plastic'); k.sph(0.025, 0.025, 0.01, 1.25, 1.2, 0.09, '#2fa36b', 'glow', 10); const sign = labelSprite(say('手術室 3 · 限制區', 'THEATRE 3 · RESTRICTED'), { size: 26, bg: 'rgba(192,57,43,.95)' }); sign.position.set(0, 2.62, 0.2); g.add(sign); name = say('門口與轉送', 'Door & transfer'); break; }
      case 'device': {
        const D = ctx.device;
        if (D === 'dentalchair') { k.rbox(0.6, 0.12, 0.9, 0.04, 0, 0.06, 0, PAINT2, 'paint'); k.cyl(0.11, 0.13, 0.36, 0, 0.3, 0.05, PAINT, 'paint', 0, 0, 0, 16); k.rbox(0.56, 0.13, 0.95, 0.05, 0, 0.55, 0.2, '#2a7a9c', 'plastic', -0.12, 0, 0); k.rbox(0.56, 0.12, 0.72, 0.05, 0, 0.88, -0.42, '#2a7a9c', 'plastic', 0.95, 0, 0); k.rbox(0.28, 0.1, 0.24, 0.04, 0, 1.18, -0.68, '#2a7a9c', 'plastic', 0.6, 0, 0); k.rbox(0.08, 0.05, 0.5, 0.02, -0.32, 0.72, 0.1, '#2a7a9c', 'plastic'); k.seg([0.45, 0.9, -0.2], [0.55, 1.95, -0.4], 0.03, 0.03, PAINT, 'paint'); k.rbox(0.36, 0.12, 0.16, 0.04, 0.4, 1.95, -0.2, PAINT, 'paint', 0, 0.3, 0.3); k.box(0.3, 0.02, 0.1, 0.4, 1.885, -0.2, '#fff4d6', 'glow', 0, 0.3, 0.3); k.lathe([[0.001, 0], [0.09, 0.0], [0.13, 0.08], [0.14, 0.1]], -0.5, 0.82, 0.05, '#f4f6f8', 'plastic', 18); k.seg([-0.4, 0.2, 0.3], [-0.55, 0.95, 0.35], 0.025, 0.025, PAINT, 'paint'); k.rbox(0.42, 0.06, 0.3, 0.02, -0.55, 0.98, 0.45, PAINT, 'paint'); for (let i = 0; i < 4; i++) k.tube([[-0.42 - i * 0.05, 1.0, 0.58], [-0.42 - i * 0.05, 0.85, 0.66], [-0.42 - i * 0.05, 0.98, 0.62]], 0.005, '#3b4a52', 'rubber', 12, 5); k.seg([0.7, 0.1, 0.4], [0.7, 1.4, 0.4], 0.025, 0.025, GREY, 'satin'); k.rbox(0.42, 0.3, 0.04, 0.02, 0.7, 1.55, 0.4, '#1d262c', 'plastic', 0, -0.6, 0); const sc = S(0.38, 0.26, screenCanvas('xray'), 0, 0, 0, 0, 'lightbox', 0.9); sc.position.set(0.7 - Math.sin(0.6) * 0.022, 1.55, 0.4 + Math.cos(0.6) * 0.022); sc.rotation.y = -0.6; name = say('牙科治療椅與診療台', 'Dental chair & delivery unit'); }
        else if (D === 'us') { usCart(k, S, 0, 0, 0); if (/obstet/.test(d)) { k.rbox(0.75, 0.08, 0.5, 0.02, 1.15, 0.92, 0, '#f4f6f8', 'paint'); [-1, 1].forEach(s => k.box(0.75, 0.12, 0.01, 1.15, 1.0, s * 0.25, '#e8f3f6', 'glass')); k.rbox(0.66, 0.05, 0.42, 0.02, 1.15, 0.97, 0, '#ffffff', 'cloth'); k.seg([1.5, 0.1, -0.2], [1.5, 2.05, -0.2], 0.03, 0.03, PAINT, 'paint'); k.rbox(0.55, 0.08, 0.32, 0.03, 1.2, 2.05, 0, PAINT, 'paint'); k.box(0.5, 0.01, 0.28, 1.2, 2.005, 0, '#ff9a3c', 'glow'); k.rbox(0.62, 0.7, 0.45, 0.03, 1.15, 0.45, 0, PAINT2, 'paint'); name = say('超音波與新生兒輻射保溫台', 'Ultrasound & neonatal radiant warmer'); } else name = /rheumat/.test(d) ? say('肌骨超音波與關節評估', 'Musculoskeletal ultrasound & joint assessment') : say('超音波機', 'Ultrasound machine'); }
        else if (D === 'airwaycart') { k.rbox(0.72, 0.95, 0.5, 0.03, 0, 0.53, 0, '#2a7a9c', 'paint'); castors(k, [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]); ['#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#3498db'].forEach((c2, i) => { k.box(0.64, 0.15, 0.015, 0, 0.18 + i * 0.17, 0.252, '#f4f6f8', 'plastic'); k.box(0.64, 0.025, 0.018, 0, 0.245 + i * 0.17, 0.258, c2, 'plastic'); }); k.rbox(0.76, 0.04, 0.54, 0.015, 0, 1.02, 0, '#cfd6da', 'satin'); k.rbox(0.13, 0.1, 0.03, 0.01, -0.2, 1.2, -0.1, '#1d262c', 'plastic'); k.seg([-0.2, 1.04, -0.1], [-0.2, 1.15, -0.1], 0.015, 0.015, '#2a3036', 'satin'); S(0.11, 0.08, screenCanvas('endo'), -0.2, 1.2, -0.084, 0, null, 1); place(k, 'laryngoscope', 0.0, 1.04, 0.1, 0.4); place(k, 'ett', 0.1, 1.04, -0.15, 0.3); place(k, 'ett', 0.12, 1.04, -0.08, 0.3, 0.8); place(k, 'lma', -0.3, 1.04, 0.12, 0.1); k.cyl(0.05, 0.05, 0.6, 0.42, 0.45, -0.15, '#f4f6f8', 'paint', 0, 0, 0, 12); name = say('困難氣道車與影像喉頭鏡', 'Difficult-airway cart & video laryngoscope'); }
        else if (D === 'resus') { k.rbox(0.75, 0.95, 0.55, 0.03, 0, 0.52, 0, '#b0313a', 'paint'); castors(k, [[-0.3, -0.22], [0.3, -0.22], [-0.3, 0.22], [0.3, 0.22]]); for (let i = 0; i < 4; i++) { k.box(0.66, 0.18, 0.015, 0, 0.2 + i * 0.21, 0.28, '#c8434c', 'paint'); k.box(0.16, 0.02, 0.02, 0, 0.24 + i * 0.21, 0.29, GREY, 'satin'); } k.rbox(0.8, 0.04, 0.58, 0.015, 0, 1.0, 0, '#cfd6da', 'satin'); k.rbox(0.42, 0.24, 0.3, 0.03, -0.1, 1.14, -0.05, '#f1c40f', 'paint'); k.box(0.12, 0.08, 0.05, 0.2, 1.06, 0.12, '#2b3036', 'plastic'); S(0.24, 0.15, ctx.monitorTex, -0.12, 1.17, 0.102, 0, null, 1); k.sph(0.07, 0.11, 0.07, 0.3, 1.1, -0.05, '#8dd8c6', 'plastic', 14, 0, 0, Math.PI / 2); k.cyl(0.05, 0.03, 0.06, 0.42, 1.1, -0.05, '#f0f6f8', 'glass', 0, 0, Math.PI / 2, 12); name = /critical/.test(d) ? say('重症監測與復甦車', 'Critical-care monitoring & resuscitation cart') : say('急診復甦車與除顫器', 'Resuscitation cart & defibrillator'); }
        else if (D === 'dialysis') { k.rbox(0.55, 1.35, 0.55, 0.04, 0, 0.7, 0, PAINT, 'paint'); castors(k, [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]); S(0.44, 0.3, ctx.monitorTex, 0, 1.18, 0.28, 0, null, 0.9); k.cyl(0.07, 0.07, 0.04, -0.12, 0.85, 0.29, '#cfd6da', 'paint', Math.PI / 2, 0, 0, 18); k.cyl(0.065, 0.065, 0.01, -0.12, 0.85, 0.31, '#eef6f8', 'glass', Math.PI / 2, 0, 0, 18); k.cyl(0.035, 0.035, 0.3, 0.33, 0.9, 0.12, '#eef6f8', 'glass', 0, 0, 0, 14); k.cyl(0.037, 0.037, 0.04, 0.33, 1.07, 0.12, '#b03a3a', 'plastic', 0, 0, 0, 14); k.cyl(0.037, 0.037, 0.04, 0.33, 0.73, 0.12, '#2e6fb0', 'plastic', 0, 0, 0, 14); k.tube([[0.33, 1.1, 0.12], [0.1, 1.3, 0.4], [-0.3, 1.1, 0.9], [-0.6, 1.0, 1.4]], 0.006, '#b03a3a', 'plastic', 30); k.tube([[0.33, 0.7, 0.12], [0.2, 0.9, 0.45], [-0.25, 1.0, 0.95], [-0.55, 1.0, 1.4]], 0.006, '#2e6fb0', 'plastic', 30); ['#f1c40f', '#3498db', '#ecf0f1'].forEach((c2, i) => k.rbox(0.12, 0.2, 0.12, 0.03, -0.17 + i * 0.14, 0.12, 0.33, c2, 'plastic')); name = say('透析機與管路辨識', 'Dialysis machine & circuit recognition'); }
        else if (D === 'spirometry') { k.rbox(0.8, 0.04, 0.6, 0.01, 0, 0.78, 0, '#cedfe6', 'paint'); [[-0.35, -0.25], [0.35, -0.25], [-0.35, 0.25], [0.35, 0.25]].forEach(([x, z]) => k.box(0.04, 0.76, 0.04, x, 0.38, z, GREY, 'satin')); k.rbox(0.46, 0.3, 0.04, 0.01, 0, 1.0, -0.2, '#1d262c', 'plastic'); S(0.42, 0.26, ctx.monitorTex, 0, 1.0, -0.178, 0, null, 0.8); k.cyl(0.03, 0.03, 0.2, 0.25, 0.83, 0.1, '#f7f7f2', 'plastic', 0, 0, Math.PI / 2, 12); k.cyl(0.02, 0.025, 0.04, 0.37, 0.83, 0.1, '#5fa8e0', 'plastic', 0, 0, Math.PI / 2, 12); k.rbox(0.05, 0.03, 0.08, 0.01, -0.25, 0.81, 0.15, '#2b3036', 'plastic'); name = say('肺功能檢查與血氧監測', 'Spirometry & pulse oximetry'); }
        else if (D === 'glucose') { k.rbox(0.8, 0.8, 0.6, 0.02, 0, 0.4, 0, '#d9e4dc', 'paint'); k.rbox(0.13, 0.04, 0.22, 0.01, -0.18, 0.82, 0.1, '#345f82', 'plastic'); k.rbox(0.07, 0.11, 0.02, 0.01, 0.05, 0.86, 0.1, '#2b3036', 'plastic'); k.rbox(0.46, 0.3, 0.04, 0.01, 0, 1.17, -0.18, '#1d262c', 'plastic'); S(0.42, 0.26, screenCanvas('info', { title: say('連續血糖曲線', 'CGM trend') }), 0, 1.17, -0.158, 0, null, 0.7); k.rbox(0.4, 0.06, 0.4, 0.01, 0.65, 0.04, 0, '#9faeb4', 'paint'); name = say('血糖紀錄與代謝評估台', 'Glucose records & metabolic assessment'); }
        else if (D === 'microscope') { if (ctx.parkedDevice) microscope(k, null, 0, 0); else microscope(k, ctx.microTarget, -0.75, -0.9); name = say('手術顯微鏡', 'Operating microscope'); }
        else if (D === 'cpb') { k.rbox(1.0, 0.62, 0.62, 0.04, 0, 0.42, 0, PAINT, 'paint'); castors(k, [[-0.42, -0.25], [0.42, -0.25], [-0.42, 0.25], [0.42, 0.25]]); for (let i = 0; i < 4; i++) { k.cyl(0.11, 0.11, 0.1, -0.33 + i * 0.22, 0.79, 0.1, '#2a7a9c', 'paint', 0, 0, 0, 20); k.cyl(0.1, 0.1, 0.03, -0.33 + i * 0.22, 0.86, 0.1, '#e8f3f6', 'glass', 0, 0, 0, 20); k.rbox(0.18, 0.05, 0.03, 0.01, -0.33 + i * 0.22, 0.79, 0.22, '#1d262c', 'plastic'); } k.seg([0.45, 0.73, -0.25], [0.45, 2.0, -0.25], 0.025, 0.025, GREY, 'satin'); k.cyl(0.07, 0.04, 0.32, 0.45, 1.3, -0.12, '#eef6f8', 'glass', 0, 0, 0, 16); k.cyl(0.065, 0.045, 0.14, 0.45, 1.2, -0.12, '#8a1c22', 'fluid', 0, 0, 0, 16); k.cyl(0.06, 0.06, 0.24, 0.3, 1.05, -0.15, '#f2f6f8', 'glass', 0, 0, 0, 16); k.cyl(0.055, 0.055, 0.2, 0.3, 1.05, -0.15, '#b03a3a', 'fluid', 0, 0, 0, 14); k.rbox(0.42, 0.3, 0.05, 0.015, -0.1, 1.5, -0.25, '#1d262c', 'plastic'); S(0.38, 0.26, ctx.monitorTex, -0.1, 1.5, -0.222, 0, null, 0.9); k.tube([[0.3, 1.0, -0.1], [0.2, 1.2, -0.6], [0.4, 1.3, -1.4], [0.5, 1.15, -1.9]], 0.009, '#a52a2a', 'plastic', 40); k.tube([[0.45, 1.15, -0.1], [0.6, 1.25, -0.7], [0.6, 1.3, -1.4], [0.45, 1.15, -1.9]], 0.01, '#6b1a1a', 'plastic', 40); name = say('體外循環機', 'Heart-lung machine'); }
        else if (D === 'carm') { if (ctx.parkedDevice) cArm(k, 0, 0, 0); else cArm(k, ctx.carmX - POS.device[0], ctx.carmZ - POS.device[2], ctx.carmYaw); cArmMonitors(k, S, 0.75, 0.35); name = /cardiology/.test(d) ? say('心導管 C 臂 X 光機', 'Cath-lab C-arm') : say('C 臂透視機', 'C-arm fluoroscopy'); }
        else if (D === 'endo') { endoTower(k, S, 0, 0, 0, d); name = say('內視鏡／腹腔鏡塔', 'Endoscopy / laparoscopy tower'); }
        else { k.rbox(0.6, 1.2, 0.5, 0.03, 0, 0.6, 0, PAINT, 'paint'); S(0.44, 0.3, screenCanvas('info'), 0, 1.1, 0.26, 0, null, 0.9); name = say('專科設備', 'Specialty device'); }
        equip = D === 'generic' ? 'imaging' : D;
        break; }
      // ---------------- extras
      case 'backtable': { const L = 1.5, W = 0.75;
        k.rbox(L, 0.035, W, 0.01, 0, 0.9, 0, '#c9d0d3', 'metal'); [[-L / 2 + 0.05, -W / 2 + 0.05], [L / 2 - 0.05, -W / 2 + 0.05], [-L / 2 + 0.05, W / 2 - 0.05], [L / 2 - 0.05, W / 2 - 0.05]].forEach(([x, z]) => k.cyl(0.018, 0.018, 0.86, x, 0.45, z, '#cfd6da', 'metal', 0, 0, 0, 10)); castors(k, [[-L / 2 + 0.05, -W / 2 + 0.05], [L / 2 - 0.05, -W / 2 + 0.05], [-L / 2 + 0.05, W / 2 - 0.05], [L / 2 - 0.05, W / 2 - 0.05]], 0.03); k.rbox(L - 0.1, 0.02, W - 0.1, 0.005, 0, 0.3, 0, '#c9d0d3', 'satin');
        k.rbox(L + 0.04, 0.012, W + 0.04, 0.005, 0, 0.922, 0, '#3d7fae', 'cloth'); k.box(L + 0.04, 0.4, 0.01, 0, 0.72, W / 2 + 0.02, '#3d7fae', 'cloth'); k.box(L + 0.04, 0.4, 0.01, 0, 0.72, -W / 2 - 0.02, '#3d7fae', 'cloth'); k.box(0.01, 0.4, W + 0.04, L / 2 + 0.02, 0.72, 0, '#3d7fae', 'cloth'); k.box(0.01, 0.4, W + 0.04, -L / 2 - 0.02, 0.72, 0, '#3d7fae', 'cloth');
        const Y = 0.929;
        place(k, 'bowl', -0.55, Y, -0.2, 0, 0.17); k.cyl(0.15, 0.15, 0.004, -0.55, Y + 0.05, -0.2, '#cfe8f0', 'fluid', 0, 0, 0, 24); place(k, 'bowl', -0.3, Y, -0.24, 0, 0.055); place(k, 'bowl', -0.18, Y, -0.24, 0, 0.055); k.at(-0.06, Y, -0.24, 0, () => INSTR.kidney(k));
        place(k, 'sponges', 0.08, Y, -0.29, 0, 6); place(k, 'sponges', 0.21, Y, -0.29, 0, 4); place(k, 'lap', 0.36, Y, -0.29, 0); ['#7b4fa8', '#2f6fd0', '#2fa36b', '#d35400', '#7f8c8d'].forEach((c2, i) => place(k, 'suture', 0.55, Y + i * 0.0045, -0.3 + i * 0.012, 0.1 * i, c2));
        for (let i = 0; i < 4; i++) place(k, 'towel', -0.66 + i * 0.045, Y, 0.0, Math.PI / 2); place(k, 'ringfor', -0.46, Y, 0.0, Math.PI / 2); place(k, 'ringfor', -0.41, Y, 0.0, Math.PI / 2);
        place(k, 'armynavy', -0.32, Y, -0.04, Math.PI / 2); place(k, 'armynavy', -0.28, Y, -0.04, Math.PI / 2); place(k, 'senn', -0.22, Y, -0.02, Math.PI / 2); place(k, 'senn', -0.18, Y, -0.02, Math.PI / 2); place(k, 'balfour', -0.12, Y, 0.0, Math.PI / 2);
        [['kocher'], ['kocher'], ['babcock'], ['babcock'], ['clamp'], ['clamp'], ['needle'], ['metz']].forEach((it, i) => place(k, it[0], 0.18 + i * 0.04, Y, -0.04, Math.PI / 2));
        DEPT_SET(d).forEach((tp, i) => place(k, tp, -0.66 + i * 0.2, Y, 0.22, 0));
        k.rbox(0.3, 0.06, 0.22, 0.02, 0.5, Y + 0.03, 0.22, '#3d7fae', 'cloth');
        name = say('器械後台', 'Back table'); break; }
      case 'specimen': { [0, 1, 2].forEach(i => { k.cyl(0.035, 0.035, 0.07, i * 0.085, 0.965, 0, '#f2f6f8', 'glass', 0, 0, 0, 16); k.cyl(0.032, 0.032, 0.04, i * 0.085, 0.95, 0, '#f6edc8', 'fluid', 0, 0, 0, 14); k.cyl(0.038, 0.038, 0.02, i * 0.085, 1.008, 0, '#f1c40f', 'plastic', 0, 0, 0, 16); k.box(0.04, 0.03, 0.002, i * 0.085, 0.965, 0.036, '#ffffff', 'matte'); }); k.rbox(0.12, 0.004, 0.16, 0.002, 0.08, 0.93, 0.1, '#ffffff', 'matte'); name = say('標本容器', 'Specimen containers'); break; }
      case 'esu': { k.rbox(0.46, 0.04, 0.46, 0.01, 0, 0.78, 0, '#cfd6da', 'satin'); k.rbox(0.46, 0.04, 0.46, 0.01, 0, 0.2, 0, '#cfd6da', 'satin'); [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([x, z]) => k.cyl(0.014, 0.014, 0.7, x, 0.45, z, GREY, 'satin', 0, 0, 0, 8)); castors(k, [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]], 0.03);
        k.rbox(0.38, 0.15, 0.4, 0.02, 0, 0.875, 0, '#f2f4f5', 'paint'); k.box(0.36, 0.13, 0.01, 0, 0.875, 0.2, '#e3e8eb', 'paint'); [[-0.1, '#f1c40f'], [0.06, '#3498db']].forEach(([x, c2]) => { k.box(0.1, 0.035, 0.005, x, 0.9, 0.206, '#101418', 'plastic'); k.box(0.07, 0.022, 0.006, x, 0.9, 0.208, c2, 'glow'); }); [-0.12, -0.04, 0.04, 0.12].forEach(x => k.cyl(0.012, 0.012, 0.01, x, 0.845, 0.207, '#2b3036', 'plastic', Math.PI / 2, 0, 0, 10));
        k.rbox(0.36, 0.16, 0.36, 0.02, 0, 0.3, 0, '#dfe5e8', 'paint'); k.rbox(0.34, 0.05, 0.22, 0.02, 0.15, 0.025, 0.45, '#2b3036', 'plastic'); k.box(0.12, 0.012, 0.15, 0.08, 0.055, 0.45, '#f1c40f', 'plastic'); k.box(0.12, 0.012, 0.15, 0.23, 0.055, 0.45, '#3498db', 'plastic');
        k.tube([[0, 0.85, 0.21], [0.05, 0.6, 0.35], [0.12, 0.1, 0.42]], 0.004, '#3b4a52', 'rubber'); k.tube([[-0.12, 0.845, 0.21], [-0.2, 1.0, 0.6], [-0.25, 1.05, 1.2], [-0.15, 0.99, 1.45]], 0.004, '#e8eef0', 'plastic', 36); k.tube([[0.04, 0.845, 0.21], [0.2, 0.7, 0.6], [0.3, 0.75, 1.2], [0.35, 0.92, 1.42]], 0.004, '#4c5a62', 'rubber', 36);
        name = say('電燒主機', 'Electrosurgical unit'); break; }
      case 'warmer': { k.cyl(0.2, 0.2, 0.03, 0, 0.03, 0, '#55606a', 'satin', 0, 0, 0, 5); k.cyl(0.016, 0.016, 0.9, 0, 0.47, 0, GREY, 'satin', 0, 0, 0, 8); k.rbox(0.3, 0.28, 0.22, 0.03, 0, 0.88, 0, '#f4f6f8', 'paint'); k.box(0.12, 0.05, 0.01, 0, 0.94, 0.112, '#101418', 'plastic'); k.box(0.08, 0.03, 0.006, 0, 0.94, 0.118, '#ff9a3c', 'glow'); const hose = []; for (let i = 0; i <= 8; i++) { const f = i / 8; hose.push([0.0 + f * 0.6, 0.86 + Math.sin(f * Math.PI) * 0.18 + f * 0.08, 0.11 + f * 0.75]); } k.tube(hose, 0.032, '#f2f4f5', 'plastic', 40, 10); for (let i = 1; i < 8; i++) { const p = hose[i]; k.tor(0.033, 0.004, p[0], p[1], p[2], '#d5dadd', 'plastic', 0, 0.7, 0, Math.PI * 2, 6); } name = say('保溫機（熱風毯）', 'Forced-air warmer'); break; }
      case 'kick': { k.lathe([[0.001, 0.0], [0.15, 0.0], [0.19, 0.3], [0.197, 0.312], [0.186, 0.31], [0.146, 0.012], [0.001, 0.012]], 0, 0.1, 0, '#d0d7db', 'metal', 24); k.tor(0.21, 0.01, 0, 0.12, 0, GREY, 'satin', Math.PI / 2, 0, 0, Math.PI * 2, 12); castors(k, [[0.19, 0], [-0.1, 0.16], [-0.1, -0.16]], 0.025); for (let i = 0; i < 4; i++) k.rbox(0.09, 0.03, 0.08, 0.01, (i % 2 - 0.5) * 0.08, 0.35 + i * 0.02, (i > 1 ? 1 : -1) * 0.04, i % 2 ? '#e9c9c9' : '#f6f0ee', 'cloth', 0, i, 0.3); name = say('踢桶（紗布桶）', 'Kick bucket'); break; }
      case 'ivpole': { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; k.flat([0, 0.06, 0], [Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3], 0.03, 0.02, GREY, 'satin'); k.cyl(0.025, 0.025, 0.02, Math.cos(a) * 0.3, 0.025, Math.sin(a) * 0.3, '#2e3438', 'rubber', Math.PI / 2, 0, 0, 10); } k.cyl(0.015, 0.015, 2.0, 0, 1.05, 0, '#d5dadd', 'metal', 0, 0, 0, 10); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; k.tor(0.02, 0.003, Math.cos(a) * 0.06, 2.02, Math.sin(a) * 0.06, '#d5dadd', 'metal', 0, -a, 0, Math.PI, 6); k.seg([0, 2.03, 0], [Math.cos(a) * 0.06, 2.03, Math.sin(a) * 0.06], 0.004, 0.004, '#d5dadd', 'metal'); }
        [[-0.08, 0.0], [0.08, 0.0]].forEach(([x, z], i) => { k.rbox(0.12, 0.2, 0.035, 0.015, x, 1.86, z, '#f2f8fa', 'glass'); k.box(0.1, 0.12 - i * 0.04, 0.03, x, 1.82 - i * 0.02, z, i ? '#fff4c8' : '#eef6fb', 'fluid'); k.cyl(0.012, 0.012, 0.06, x, 1.72, z, '#eef6f8', 'glass', 0, 0, 0, 8); k.tube([[x, 1.69, z], [x * 0.5, 1.45, 0.05], [0.0, 1.32, 0.09]], 0.0025, '#eef6f8', 'plastic', 16, 4); });
        k.rbox(0.16, 0.22, 0.12, 0.02, 0, 1.2, 0.07, '#f4f6f8', 'paint'); k.box(0.1, 0.06, 0.005, 0, 1.25, 0.132, '#0e2a33', 'plastic'); k.box(0.07, 0.02, 0.006, 0, 1.25, 0.135, '#4dff8f', 'glow'); k.rbox(0.26, 0.07, 0.11, 0.015, 0, 1.0, 0.07, '#f4f6f8', 'paint'); k.cyl(0.012, 0.012, 0.13, -0.01, 1.04, 0.07, '#f2f6f8', 'glass', 0, 0, Math.PI / 2, 10);
        k.tube([[0, 1.1, 0.13], [0.2, 1.0, -0.2], [0.45, 0.98, -0.45], [0.56, 0.99, -0.62]], 0.0025, '#eef6f8', 'plastic', 30, 4); name = say('點滴架與輸液幫浦', 'IV pole & infusion pumps'); break; }
      case 'sink': { k.rbox(1.3, 0.25, 0.5, 0.03, 0, 0.88, 0, '#d0d7db', 'metal'); k.rbox(1.24, 0.02, 0.44, 0.01, 0, 0.78, 0.0, '#b8c1c6', 'metal'); k.box(1.3, 0.8, 0.04, 0, 1.4, -0.24, '#cfd6da', 'metal'); k.rbox(1.1, 0.6, 0.06, 0.02, 0, 0.4, -0.18, '#d5dadd', 'satin');
        [-0.4, 0, 0.4].forEach(x => { k.tube([[x, 1.25, -0.22], [x, 1.32, -0.12], [x, 1.22, -0.02]], 0.012, '#dfe5e8', 'metal', 16, 8); k.box(0.04, 0.03, 0.02, x, 1.27, -0.215, '#1b1f22', 'plastic'); k.sph(0.006, 0.006, 0.004, x, 1.27, -0.204, '#3df07a', 'glow', 6); });
        [-0.25, 0.25].forEach(x => { k.rbox(0.12, 0.22, 0.1, 0.02, x, 1.62, -0.17, '#f4f6f8', 'plastic'); k.box(0.04, 0.03, 0.04, x, 1.5, -0.13, GREY, 'satin'); }); k.cyl(0.08, 0.08, 0.02, 0, 1.75, -0.21, '#1b1f22', 'plastic', Math.PI / 2, 0, 0, 20); k.disc(0.07, 0, 1.75, -0.199, '#f4f6f8', 'matte', 0, 0, 0, 20); k.box(0.004, 0.05, 0.002, 0, 1.765, -0.197, '#c0392b', 'plastic');
        name = say('刷手槽', 'Scrub sink'); break; }
      case 'lightbox': { k.rbox(1.24, 0.6, 0.06, 0.015, 0, 1.55, 0, '#f2f4f5', 'paint'); for (let i = 0; i < 3; i++) { const m = S(0.37, 0.48, screenCanvas(i === 1 ? 'bone' : 'xray'), -0.4 + i * 0.4, 1.56, 0.032, 0, 'lightbox', 1.05); m.userData.slot = i; k.box(0.05, 0.02, 0.012, -0.4 + i * 0.4, 1.81, 0.036, GREY, 'satin'); } k.box(1.2, 0.02, 0.02, 0, 1.25, 0.03, '#d5dadd', 'satin'); name = say('X 光看片燈', 'X-ray lightbox'); break; }
      case 'wallpacs': { k.rbox(1.0, 0.62, 0.05, 0.015, 0, 1.62, 0, '#111518', 'plastic'); S(0.94, 0.56, screenCanvas('pacs'), 0, 1.62, 0.028, 0, 'display', 0.95); k.box(0.2, 0.06, 0.04, 0, 1.28, 0.0, '#2b3036', 'plastic'); name = say('牆面 PACS 大螢幕', 'Wall PACS display'); equip = 'imaging'; break; }
      case 'carm': { cArm(k, 0, 0); cArmMonitors(k, S, -0.9, -0.2); name = say('C 臂透視機（待命）', 'C-arm fluoroscopy (parked)'); break; }
      case 'microscope': { microscope(k, null, 0, 0); name = say('手術顯微鏡（待命）', 'Operating microscope (parked)'); break; }
      case 'endo': { endoTower(k, S, 0, 0, 0, d); name = say('內視鏡塔（待命）', 'Endoscopy tower (parked)'); break; }
      case 'us': { usCart(k, S, 0, 0, 0); name = say('超音波推車', 'Ultrasound cart'); break; }
      case 'lights': { surgicalLights(k, K, g, ctx); name = say('多燈頭 LED 無影燈', 'Multi-pod LED surgical lights'); break; }
      default: { k.box(0.5, 0.8, 0.5, 0, 0.4, 0, PAINT, 'paint'); }
    }
    const built = k.build(); g.add(built);
    g.userData.hot = id; g.userData.name = name; g.userData.equip = equip; g.userData.screens = screens;
    g.traverse(o => { if (o.isMesh || o.isSprite) { o.userData.hot = id; if (!o.userData.equip) o.userData.equip = equip; } });
    return g;
  }
  function microscope(k, target, bx, bz) {
    k.rbox(0.62, 0.14, 0.62, 0.04, bx, 0.09, bz, PAINT, 'paint'); castors(k, [[bx - 0.26, bz - 0.26], [bx + 0.26, bz - 0.26], [bx - 0.26, bz + 0.26], [bx + 0.26, bz + 0.26]], 0.035);
    k.cyl(0.075, 0.09, 1.6, bx, 0.95, bz, PAINT, 'paint', 0, 0, 0, 16);
    const tx = target ? target[0] : bx + 0.9, tz = target ? target[1] : bz; const dx = tx - bx, dz = tz - bz, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L; const reach = Math.min(L, 1.25);
    const E1 = [bx + ux * reach * 0.62, 1.82, bz + uz * reach * 0.62], H = [bx + ux * reach, target ? 1.48 : 1.3, bz + uz * reach];
    k.seg([bx, 1.78, bz], [bx, 1.86, bz], 0.1, 0.1, PAINT2, 'paint'); k.flat([bx, 1.82, bz], E1, 0.12, 0.12, PAINT, 'paint'); k.flat(E1, [H[0], H[1] + 0.26, H[2]], 0.09, 0.09, PAINT, 'paint');
    k.rbox(0.2, 0.2, 0.16, 0.04, H[0], H[1] + 0.12, H[2], '#e6eaec', 'paint'); k.rbox(0.18, 0.12, 0.2, 0.04, H[0], H[1], H[2], '#2d3436', 'paint'); k.cyl(0.055, 0.055, 0.05, H[0], H[1] - 0.08, H[2], '#1b1f22', 'plastic', 0, 0, 0, 16); k.disc(0.045, H[0], H[1] - 0.106, H[2], '#37506a', 'glass', Math.PI / 2, 0, 0, 16);
    [-0.03, 0.03].forEach(o => k.cyl(0.014, 0.012, 0.11, H[0] - ux * 0.12 + uz * o, H[1] + 0.1, H[2] - uz * 0.12 - ux * o, '#1b1f22', 'plastic', Math.atan2(uz, 1) * 0 - 0.7 * uz, 0, 0.7 * ux, 10));
    k.cyl(0.012, 0.012, 0.12, H[0] + uz * 0.12, H[1] + 0.05, H[2] - ux * 0.12, '#1b1f22', 'plastic', 0, 0, Math.PI / 2, 10);
    k.box(0.06, 0.04, 0.04, H[0], H[1] - 0.06, H[2] + 0.1, '#bfc7cb', 'satin');
  }
  function usCart(k, S, x, y, z) {
    k.rbox(0.55, 0.12, 0.6, 0.04, x, 0.1, z, PAINT2, 'paint'); castors(k, [[x - 0.22, z - 0.24], [x + 0.22, z - 0.24], [x - 0.22, z + 0.24], [x + 0.22, z + 0.24]], 0.04); k.rbox(0.18, 0.7, 0.18, 0.03, x, 0.5, z - 0.08, PAINT, 'paint'); k.rbox(0.36, 0.3, 0.36, 0.03, x, 0.38, z, PAINT, 'paint');
    k.rbox(0.56, 0.07, 0.46, 0.03, x, 0.9, z + 0.06, PAINT, 'paint', -0.18, 0, 0); k.box(0.36, 0.012, 0.13, x, 0.94, z + 0.13, '#2b3237', 'plastic', -0.18, 0, 0); k.sph(0.025, 0.025, 0.025, x + 0.16, 0.945, z + 0.18, '#5f7f9f', 'plastic', 12); for (let i = 0; i < 4; i++) k.cyl(0.012, 0.012, 0.02, x - 0.18 + i * 0.05, 0.95, z + 0.24, '#d0d6d9', 'plastic', 0, 0, 0, 10);
    k.rbox(0.24, 0.16, 0.02, 0.01, x, 1.02, z - 0.06, '#1d262c', 'plastic', -0.5, 0, 0); k.seg([x, 0.95, z - 0.12], [x, 1.42, z - 0.14], 0.02, 0.02, GREY, 'satin'); k.rbox(0.52, 0.36, 0.045, 0.02, x, 1.55, z - 0.14, '#1d262c', 'plastic', -0.12, 0, 0);
    const sc = S(0.47, 0.32, screenCanvas('us'), x, 1.552, z - 0.115, 0, 'us', 1); sc.rotation.x = -0.12;
    [[-0.27, 'usprobe'], [-0.3, 'probe2'], [0.27, 'probe3']].forEach(([px], i) => { k.rbox(0.05, 0.1, 0.05, 0.01, x + px, 0.86, z + 0.18 - i * 0.12, '#cfd6da', 'plastic'); k.rbox(0.04, 0.09, 0.03, 0.012, x + px, 0.93, z + 0.18 - i * 0.12, '#e9eef0', 'plastic'); k.tube([[x + px, 0.98, z + 0.18 - i * 0.12], [x + px * 1.3, 0.75, z + 0.25 - i * 0.12], [x + px * 0.8, 0.4, z + 0.1]], 0.005, '#c9d0d3', 'rubber', 20, 5); });
    k.cyl(0.03, 0.03, 0.12, x + 0.22, 0.98, z + 0.3, '#5fa8e0', 'plastic', 0, 0, 0, 10);
  }
  function endoTower(k, S, x, y, z, dept) {
    k.rbox(0.62, 0.06, 0.58, 0.02, x, 0.12, z, '#cfd6da', 'paint'); castors(k, [[x - 0.25, z - 0.24], [x + 0.25, z - 0.24], [x - 0.25, z + 0.24], [x + 0.25, z + 0.24]], 0.035); [[-0.28, -0.26], [0.28, -0.26], [-0.28, 0.26], [0.28, 0.26]].forEach(([a, b]) => k.box(0.03, 1.3, 0.03, x + a, 0.78, z + b, '#cfd6da', 'paint'));
    [['#f4f6f8', '#4dff8f'], ['#f4f6f8', '#ffd166'], ['#2b3237', '#74c0fc'], ['#f4f6f8', '#4dff8f']].forEach(([c2, led], i) => { const yy = 0.32 + i * 0.25; k.rbox(0.52, 0.16, 0.48, 0.02, x, yy, z, c2, 'paint'); k.box(0.16, 0.06, 0.005, x - 0.12, yy + 0.02, z + 0.242, '#101418', 'plastic'); k.box(0.12, 0.03, 0.006, x - 0.12, yy + 0.02, z + 0.244, led, 'glow'); k.cyl(0.018, 0.018, 0.01, x + 0.14, yy, z + 0.244, '#2b3036', 'plastic', Math.PI / 2, 0, 0, 10); k.rbox(0.56, 0.02, 0.5, 0.005, x, yy + 0.095, z, '#cfd6da', 'paint'); });
    k.cyl(0.06, 0.06, 0.55, x - 0.22, 0.43, z - 0.34, '#7f8c8d', 'paint', 0, 0, 0, 14); k.seg([x, 1.45, z - 0.1], [x, 1.62, z - 0.1], 0.03, 0.03, GREY, 'satin'); k.rbox(0.66, 0.42, 0.05, 0.02, x, 1.8, z - 0.08, '#1d262c', 'plastic');
    S(0.6, 0.36, screenCanvas(/gastro/.test(dept || '') ? 'endo' : 'lap'), x, 1.8, z - 0.054, 0, 'endo', 1);
    k.tube([[x + 0.2, 0.58, z + 0.25], [x + 0.35, 0.9, z + 0.8], [x + 0.2, 1.0, z + 1.4]], 0.006, '#7f8c8d', 'rubber', 24);
  }
  function cArmMonitors(k, S, x, z) {
    k.rbox(0.6, 0.12, 0.5, 0.03, x, 0.12, z, PAINT2, 'paint'); castors(k, [[x - 0.24, z - 0.2], [x + 0.24, z - 0.2], [x - 0.24, z + 0.2], [x + 0.24, z + 0.2]], 0.035); k.rbox(0.3, 1.1, 0.3, 0.03, x, 0.7, z, PAINT, 'paint');
    [-0.23, 0.23].forEach((o, i) => { k.rbox(0.44, 0.34, 0.05, 0.015, x + o, 1.48, z, '#1d262c', 'plastic'); S(0.4, 0.3, screenCanvas(i ? 'bone' : 'fluoro'), x + o, 1.48, z + 0.027, 0, 'carm', 1); });
  }
  function surgicalLights(k, K, g, ctx) {
    const hub = [0.12, ROOM.h, -0.05]; k.cyl(0.17, 0.17, 0.06, hub[0], ROOM.h - 0.03, hub[2], PAINT, 'paint', 0, 0, 0, 24); k.cyl(0.06, 0.06, 0.4, hub[0], ROOM.h - 0.26, hub[2], PAINT, 'paint', 0, 0, 0, 14);
    const led = makeKit(K); const tgt = new THREE.Vector3(0, PAD + 0.15, 0);
    const heads = ctx.lightHeads || [[-0.42, -0.5, 4], [0.6, 0.48, 5]];
    heads.forEach(([hx, hz, n], i) => {
      const yArm = ROOM.h - 0.42 - i * 0.07; const E = [hub[0] + (hx - hub[0]) * 0.55, yArm, hub[2] + (hz - hub[2]) * 0.55 + (i ? 0.25 : -0.25)];
      k.flat([hub[0], yArm, hub[2]], E, 0.07, 0.06, PAINT, 'paint'); k.cyl(0.045, 0.045, 0.1, E[0], yArm, E[2], PAINT2, 'paint', 0, 0, 0, 12);
      const C = new THREE.Vector3(hx, 2.08 - i * 0.04, hz); const dir = tgt.clone().sub(C).normalize(); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir); const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      const yokeTop = new THREE.Vector3(0, 0.3, 0).applyQuaternion(q).add(C);
      k.flat(E, [yokeTop.x, yokeTop.y + 0.05, yokeTop.z], 0.06, 0.06, PAINT, 'paint');
      k.at(C.x, C.y, C.z, e.y, () => {
        k.tor(0.3, 0.014, 0, 0.0, 0, PAINT2, 'paint', 0, 0, 0, Math.PI, 12); k.cyl(0.02, 0.02, 0.08, 0, 0.3, 0, PAINT2, 'paint', 0, 0, 0, 10);
        const pods = [[0, 0]]; for (let j = 0; j < n - 1; j++) { const a = j / (n - 1) * Math.PI * 2 + 0.3; pods.push([Math.cos(a) * 0.21, Math.sin(a) * 0.21]); }
        k.tor(0.21, 0.02, 0, 0.02, 0, '#f2f4f5', 'paint', Math.PI / 2, 0, 0, Math.PI * 2, 16);
        pods.forEach(([px, pz]) => { k.lathe([[0.001, 0.07], [0.06, 0.066], [0.1, 0.045], [0.112, 0.012], [0.108, 0.0]], px, 0, pz, '#f4f6f7', 'paint', 20); k.cyl(0.11, 0.11, 0.012, px, 0.0, pz, '#c9d0d3', 'paint', 0, 0, 0, 20); });
        k.cyl(0.022, 0.028, 0.14, 0, -0.08, 0, '#9fb7c9', 'plastic', 0, 0, 0, 12);
        led.at(C.x, C.y, C.z, e.y, () => pods.forEach(([px, pz]) => led.disc(0.096, px, -0.007, pz, '#ffffff', 'led', Math.PI / 2, 0, 0, 24)), e.x, e.z);
      }, e.x, e.z);
    });
    const lg = led.build({ shadow: false }); g.add(lg);
  }

  // Short "what is this / what to check" notes shown beside equipment when it is clicked (education only).
  const INFO = {
    field: ['手術台與病人', 'Operating table & patient', '點病人身體或手術台任一處，立即開啟該部位的真實影像與數位孿生；擺位、受壓點與手術部位標記也在這裡核對。', 'Tap any part of the patient or the table to open real images and the digital twin for that spot; positioning, pressure points and site marking are checked here.'],
    monitor: ['生理監視器', 'Patient monitor', '心電圖、血壓、血氧、呼氣末二氧化碳與體溫；先看趨勢與警報，再看單一數值。', 'ECG, blood pressure, SpO₂, EtCO₂ and temperature; read trends and alarms before single numbers.'],
    anesthesia: ['麻醉機', 'Anaesthesia machine', '氣體供應、流量計、揮發罐、呼吸迴路與風箱；每台刀前完成機器檢查，二氧化碳波形確認插管位置。', 'Gas supply, flowmeters, vaporisers, circuit and bellows; check before every case and confirm tube position with capnography.'],
    tray: ['Mayo 器械托盤', 'Mayo instrument stand', '刀柄、剪刀、鑷子、持針器、止血鉗依使用順序排列；關閉前器械、紗布、針頭計數必須相符。', 'Scalpels, scissors, forceps, needle holders and clamps in order of use; counts must match before closure.'],
    cart: ['藥物車', 'Medication cart', '依標籤與雙人核對給藥；高警訊藥物分區存放；本站不提供劑量。', 'Give drugs by label with a two-person check; high-alert drugs are segregated; no doses are given here.'],
    drains: ['抽吸與引流', 'Suction & drains', '記錄失血與引流量；突然大量鮮紅引流是出血警訊。', 'Record blood loss and drain output; a sudden large bright-red output signals bleeding.'],
    imaging: ['影像工作站', 'Imaging workstation', '核對病人與左右側，比較術前影像與正常對照；點開看真實影像與本科孿生。', 'Check patient and side, compare pre-operative images with normal; open real images and the specialty twin.'],
    lab: ['檢驗、血氣與病理站', 'Labs, blood gas & pathology', '血紅素、電解質、乳酸與凝血；抹片與切片在顯微鏡下判讀。', 'Haemoglobin, electrolytes, lactate and coagulation; smears and sections are read under the microscope.'],
    chart: ['病歷與同意書', 'Chart & consent', '病史、過敏、用藥、同意書與術前檢查；任何不一致先停下來澄清。', 'History, allergies, medicines, consent and pre-op tests; stop and clarify any mismatch.'],
    whiteboard: ['白板／WHO 核對', 'Board / WHO checklist', '劃刀前團隊暫停：身分、手術、側別、過敏、失血與抗生素。', 'Time-out before incision: identity, procedure, side, allergy, blood loss and antibiotics.'],
    huddle: ['團隊討論／交班', 'Huddle & handover', '以 SBAR 交班：情境、背景、評估、建議；確認接手者複述。', 'Hand over with SBAR; ask the receiver to read back.'],
    recovery: ['恢復室／加護床', 'Recovery / ICU bed', '甦醒評估、疼痛、噁心、出血與呼吸；符合標準才轉出。', 'Assess emergence, pain, nausea, bleeding and breathing; discharge only when criteria are met.'],
    door: ['門口／轉送', 'Door & transfer', '限制區管制、轉送前再次核對與監測、交接文件。', 'Restricted-zone control, re-check and monitoring before transfer, handover documents.'],
    device: ['專科設備', 'Specialty device', '依科別：顯微鏡、體外循環機、C 臂、內視鏡塔、超音波、牙科治療椅或困難氣道車；使用前檢查與輻射／電燒安全。', 'By specialty: microscope, heart-lung machine, C-arm, endoscopy tower, ultrasound, dental chair or airway cart; pre-use checks and radiation / diathermy safety.'],
    lights: ['多燈頭 LED 無影燈', 'Multi-pod LED surgical lights', '刷手人員只碰無菌把手；燈頭位置避免陰影與碰撞。', 'Scrubbed staff touch only the sterile handle; position heads to avoid shadows and collisions.'],
    backtable: ['器械後台', 'Back table', '整套器械依序排列：盆、紗布、毛巾鉗、拉鉤、止血鉗與專科器械組。', 'The full set in order: basins, swabs, towel clips, retractors, clamps and the specialty set.'],
    specimen: ['標本容器', 'Specimen containers', '離體立即標示病人、部位、側別與時間，雙人核對後送病理。', 'Label patient, site, side and time immediately, double-check, then send to pathology.'],
    esu: ['電燒主機', 'Electrosurgical unit', '迴路電極板貼妥、電燒筆不用時入套、酒精消毒液乾燥後才使用。', 'Return pad well applied, pencil holstered when idle, alcohol prep dry before activation.'],
    warmer: ['保溫機', 'Forced-air warmer', '軟管只接保溫毯，絕不直吹皮膚；監測體溫。', 'Hose only into the blanket, never onto skin; monitor temperature.'],
    kick: ['踢桶', 'Kick bucket', '用過的紗布展開計數，不丟器械或標本。', 'Unfold and count used swabs; never discard instruments or specimens.'],
    ivpole: ['點滴架與輸液幫浦', 'IV pole & pumps', '核對病人、藥名與管路走向；警報開啟；本站不提供速率。', 'Check patient, drug and line route; alarms on; no rates are given here.'],
    sink: ['刷手槽', 'Scrub sink', '外科手部消毒依院內流程；手高於肘、不碰水槽。', 'Surgical hand antisepsis to local protocol; hands above elbows, never touching the sink.'],
    lightbox: ['X 光看片燈', 'X-ray lightbox', '先核對姓名、日期與左右標記再掛片判讀。', 'Check name, date and the side marker before reading.'],
    wallpacs: ['牆面 PACS', 'Wall PACS display', '本科代表性真實教學影像；點選看出處與授權。', 'A representative real teaching image for this department; tap for source and licence.'],
    carm: ['C 臂透視機', 'C-arm fluoroscopy', '鉛衣、距離、縮短透視；射源在下、接收器靠近病人。', 'Lead, distance, short screening; tube below, detector close to the patient.'],
    microscope: ['手術顯微鏡', 'Operating microscope', '套無菌套、平衡懸臂、鎖煞車；近距離時調低光源。', 'Drape, balance the arm, lock brakes; lower the light at short distances.'],
    endo: ['內視鏡塔', 'Endoscopy tower', '白平衡與對焦後進入；光纖頭勿放在鋪單上。', 'White-balance and focus first; never rest the light cable on drapes.'],
    us: ['超音波推車', 'Ultrasound cart', '核對探頭方向標記；無菌套與無菌凝膠；探頭依規範消毒。', 'Check the probe marker; sterile sleeve and gel; reprocess probes to protocol.']
  };

  // ---------------------------------------------------------------- people
  function person(K, role) {
    const g = new THREE.Group(); const skin = role.skin || '#f0cfae'; const scrubbed = !!role.player || /mentor|scrub|surgeon/.test(role.id || '');
    const gown = scrubbed ? (role.player ? '#2f7f6a' : '#3f6f96') : (role.scrub || (/anesth/.test(role.id || '') ? '#2f5f7a' : '#3b7f6a')); const glove = scrubbed ? '#e8e3cf' : '#6f8fd8'; const trouser = scrubbed ? '#2f5f7a' : gown;
    const b = makeKit(K);
    [-0.09, 0.09].forEach(x => { b.cyl(0.07, 0.062, 0.78, x, 0.45, 0, trouser, 'cloth', 0, 0, 0, 12); b.rbox(0.1, 0.07, 0.26, 0.03, x, 0.035, 0.04, scrubbed ? '#e8ebed' : '#2b3036', 'rubber'); });
    b.lathe(scrubbed ? [[0.001, 0.62], [0.22, 0.62], [0.215, 0.85], [0.2, 1.1], [0.2, 1.3], [0.17, 1.4], [0.09, 1.46], [0.001, 1.47]] : [[0.001, 0.82], [0.2, 0.82], [0.2, 1.1], [0.2, 1.3], [0.17, 1.4], [0.09, 1.46], [0.001, 1.47]], 0, 0, 0, gown, 'cloth', 18);
    if (scrubbed) b.box(0.3, 0.025, 0.02, 0, 1.05, 0.2, gown, 'cloth');
    [-1, 1].forEach(s => { const S = [s * 0.2, 1.36, 0], E = [s * 0.25, 1.12, 0.1], H = [s * 0.13, 1.08, 0.36]; b.seg(S, E, 0.06, 0.052, gown, 'cloth', 10); b.sph(0.052, 0.052, 0.052, E[0], E[1], E[2], gown, 'cloth', 10); b.seg(E, H, 0.048, 0.04, scrubbed ? gown : skin, scrubbed ? 'cloth' : 'skin', 10); b.sph(0.045, 0.03, 0.06, H[0], H[1], H[2] + 0.03, glove, 'plastic', 10); if (scrubbed) b.cyl(0.045, 0.045, 0.05, H[0] * 0.95, H[1] + 0.005, H[2] - 0.02, glove, 'plastic', 1.2, 0, 0, 10); });
    const body = b.build(); g.add(body);
    const h = makeKit(K); h.cyl(0.05, 0.055, 0.1, 0, 1.49, 0, skin, 'skin', 0, 0, 0, 10); h.sph(0.11, 0.13, 0.115, 0, 1.6, 0, skin, 'skin', 18); h.sph(0.125, 0.085, 0.13, 0, 1.69, -0.01, role.cap || '#2f6f8f', 'cloth', 16); h.rbox(0.17, 0.1, 0.06, 0.02, 0, 1.55, 0.09, scrubbed ? '#cfe3ea' : '#a8c8de', 'cloth'); [-0.04, 0.04].forEach(x => h.sph(0.012, 0.009, 0.006, x, 1.63, 0.107, '#2a2420', 'matte', 8)); h.sph(0.02, 0.012, 0.015, 0, 1.665, 0.105, skin, 'skin', 8);
    if (scrubbed) h.box(0.2, 0.06, 0.012, 0, 1.635, 0.125, '#dff3ff', 'glass');
    const head = h.build(); g.add(head);
    const tag = labelSprite(pk(role), { size: 26, bg: role.player ? 'rgba(31,111,95,.92)' : 'rgba(16,28,32,.85)', border: role.player ? '#ffd166' : null, scale: 0.0032 }); tag.position.y = 1.98; g.add(tag); g.userData.tag = tag;
    g.userData.role = role.id; g.userData.head = head; g.traverse(o => { if (o.isMesh) o.userData.role = role.id; });
    return g;
  }
  function deviceKind(d) {
    if (/dentist/.test(d)) return 'dentalchair'; if (/obstet|gynec|rheumat/.test(d)) return 'us'; if (/anesth/.test(d)) return 'airwaycart'; if (/emergency|critical-care/.test(d)) return 'resus';
    if (/nephrology/.test(d)) return 'dialysis'; if (/pulmonology/.test(d)) return 'spirometry'; if (/endocrinology/.test(d)) return 'glucose';
    if (/neurosurg|ophthalm|^ent$|plastic/.test(d)) return 'microscope'; if (/cardiac-surg/.test(d)) return 'cpb';
    if (/ortho|spine|joint|vascular|cardiology|urolog|pain|radiolog/.test(d)) return 'carm'; if (/general|gastro|thoracic|pediatric-surg/.test(d)) return 'endo';
    return 'generic';
  }

  // ---------------------------------------------------------------- the scene
  function mount(host, api) {
    THREE = window.THREE || THREE;
    if (!THREE || !THREE.WebGLRenderer) throw new Error('3D library not ready');
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const el = document.createElement('div'); el.className = 'th3d'; host.appendChild(el);
    const cv = document.createElement('canvas'); el.appendChild(cv);
    const tip = document.createElement('div'); tip.className = 'th3d-tip'; tip.hidden = true; el.appendChild(tip);
    const hint = document.createElement('div'); hint.className = 'th3d-hint'; el.appendChild(hint);
    const card = document.createElement('div'); card.className = 'th3d-card'; card.hidden = true; el.appendChild(card); let cardFor = null, cardTarget = null;
    function targetName(tg, id) { if (!tg) return null; if (tg.kind === 'region') return nm(REGION[tg.id]); if (tg.kind === 'part') return nm(PART[tg.id]); const o = objs[id]; return (o && o.userData.name) || null; }
    function showCard(id, ev, target) {
      const o = objs[id]; const inf = INFO[id] || [id, id, '', '']; const tn = targetName(target, id); const name = tn || (o && o.userData.name) || (zh() ? inf[0] : inf[1]);
      cardFor = id; cardTarget = target || null;
      const sub = target && target.kind !== 'equip' ? `<small>${esc(zh() ? inf[0] : inf[1])}</small>` : '';
      card.innerHTML = `<button type="button" class="th3d-x" aria-label="close">×</button><b>${esc(name)}</b>${sub}<p>${esc(zh() ? inf[2] : inf[3])}</p><div class="th3d-card-row"><button type="button" class="chip small th-img-chip" data-c-img>🩻 ${esc(T('tiTitle', '影像與數位孿生', 'Imaging & digital twin'))}</button><button type="button" class="chip small" data-c-open>${esc(t('equipDetails'))}</button><button type="button" class="chip small" data-c-fly>${esc(t('goThere'))}</button></div>`;
      card.hidden = false; placeCard();
      card.querySelector('.th3d-x').onclick = () => { card.hidden = true; cardFor = null; };
      card.querySelector('[data-c-open]').onclick = () => { card.hidden = true; api.onHot(id); };
      card.querySelector('[data-c-fly]').onclick = () => handle.flyTo(id);
      card.querySelector('[data-c-img]').onclick = () => { if (api.openImaging) api.openImaging(cardTarget || { kind: 'equip', id: (o && o.userData.equip) || id }, cv); };
    }
    const cardV = new THREE.Vector3();
    function placeCard() { if (card.hidden || !cardFor || !objs[cardFor]) return; if (cardFor === 'field' || cardFor === 'lights') { const cw = Math.min(290, el.clientWidth - 16); card.style.width = cw + 'px'; card.style.left = '8px'; card.style.top = '8px'; card.style.opacity = 1; return; } cardV.copy(objs[cardFor].position); cardV.y = 1.6; cardV.project(camera); const w = el.clientWidth, h = el.clientHeight; const x = (cardV.x * 0.5 + 0.5) * w, y = (-cardV.y * 0.5 + 0.5) * h; const cw = Math.min(290, w - 16); card.style.width = cw + 'px'; const left = x + 18 + cw > w ? Math.max(8, x - 18 - cw) : x + 18; card.style.left = left + 'px'; card.style.top = Math.max(8, Math.min(h - card.offsetHeight - 8, y - 40)) + 'px'; card.style.opacity = cardV.z > 1 ? 0 : 1; }
    const handle = { el, api, dispose, disposed: false };
    let renderer, scene, camera, raycaster, clock, resize, raf = null, ro = null, disposed = false, failed = false;
    const objs = {}, people = {}, pins = [], rings = {}; let arrow = null, beam = null, bubbles = [], handMarkers = {}, mentorHome = null;
    const cam = { view: api.st.view || 'third', yaw: 0.2, pitch: -0.35, dist: 4.2, fov: 70, pan: new THREE.Vector3(0, 1.0, 0), pos: new THREE.Vector3(), look: new THREE.Vector3(), tPos: new THREE.Vector3(), tLook: new THREE.Vector3(), first: { yaw: -2.55, pitch: -0.62 } };
    let brainTex = null, photo = null; const photoState = { tex: null, on: api.photoEnabled !== false, panorama: false, print: null, floorMat: null, shadowMat: null, bg: null };
    let K = null;
    const mon = { c: null, x: 0, t: 0, acc: 0, prev: null, tex: null };
    const realTex = [];
    let patient = null, tableG = null;

    function fail(reason) {
      if (disposed || failed) return;
      failed = true;
      if (raf) cancelAnimationFrame(raf);
      if (typeof api.onFatal === 'function') api.onFatal(reason);
    }
    function contextLost(event) { event.preventDefault(); fail('context-lost'); }
    function dispose() {
      if (disposed) return;
      disposed = true; handle.disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (resize) window.removeEventListener('resize', resize);
      cv.removeEventListener('webglcontextlost', contextLost, false);
      const materials = new Set(), textures = new Set(), geometries = new Set();
      if (scene) {
        scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); });
        if (scene.environment && scene.environment.dispose) textures.add(scene.environment);
      }
      [brainTex, photo, photoState.env, mon.tex].concat(realTex).forEach(t => { if (t) textures.add(t); });
      [photoState.floorMat, photoState.shadowMat].concat(K ? Object.values(K.mat) : []).forEach(m => { if (m) materials.add(m); });
      materials.forEach(m => { Object.values(m).forEach(v => { if (v && v.isTexture) textures.add(v); }); m.dispose(); });
      textures.forEach(t => t.dispose()); geometries.forEach(g => g.dispose()); if (K) K.g.dispose();
      if (renderer) { renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss(); }
      if (el.parentNode) el.parentNode.removeChild(el);
      if (window.__ht3d === handle) window.__ht3d = null;
    }

    try {
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.5 : 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.98; renderer.outputColorSpace = THREE.SRGBColorSpace;
    cv.addEventListener('webglcontextlost', contextLost, false);
    K = { g: geoCache(), mat: materials() }; mon.c = canvas(512, 320);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x0f1a1e); scene.fog = new THREE.Fog(0x0f1a1e, 16, 34);
    camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 80); raycaster = new THREE.Raycaster(); clock = new THREE.Clock(); scene.add(camera);
    const fpHands = new THREE.Group(); [[-0.22, -0.26, -0.55, 0.3], [0.22, -0.26, -0.55, -0.3]].forEach(([x, y, z, rz]) => { const h = new THREE.Group(); const palm = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 12), new THREE.MeshStandardMaterial({ color: '#e8e3cf', roughness: 0.5 })); palm.scale.set(1, 0.6, 1.2); h.add(palm); const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.22, 16), new THREE.MeshStandardMaterial({ color: '#2f7f6a', roughness: 0.9 })); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.17; h.add(cuff); h.position.set(x, y, z); h.rotation.z = rz; h.rotation.x = 0.35; fpHands.add(h); }); fpHands.visible = false; camera.add(fpHands);
    window.__ht3dMounts = (window.__ht3dMounts || 0) + 1;

    // ---- room
    const type = api.roomType; const orLike = type === 'or' || type === 'imaging';
    const roomGroup = new THREE.Group(); scene.add(roomGroup);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ map: floorTexture(type), roughness: 0.32, metalness: 0.06 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(type), roughness: 0.82 });
    [[0, ROOM.h / 2, -ROOM.d / 2, 0], [0, ROOM.h / 2, ROOM.d / 2, Math.PI], [-ROOM.w / 2, ROOM.h / 2, 0, Math.PI / 2], [ROOM.w / 2, ROOM.h / 2, 0, -Math.PI / 2]].forEach(([x, y, z, ry], i) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(i < 2 ? ROOM.w : ROOM.d, ROOM.h), wallMat); w.position.set(x, y, z); w.rotation.y = ry; w.receiveShadow = true; roomGroup.add(w); });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ color: 0xf2f4f3, roughness: 0.9 })); ceiling.rotation.x = Math.PI / 2; ceiling.position.y = ROOM.h; roomGroup.add(ceiling);
    const rk = makeKit(K), ck = makeKit(K); const ceilingGroup = new THREE.Group(); scene.add(ceilingGroup);
    for (let x = -3.6; x <= 3.6; x += 2.4) for (let z = -3; z <= 3; z += 2) { if (orLike && Math.abs(x) < 2 && Math.abs(z) < 1.6) continue; ck.box(1.2, 0.012, 0.6, x, ROOM.h - 0.016, z, '#ffffff', 'glow'); ck.box(1.28, 0.012, 0.68, x, ROOM.h - 0.008, z, '#c9d0d3', 'satin'); }
    [[-ROOM.w / 2 + 0.03, 0, Math.PI / 2, ROOM.d], [ROOM.w / 2 - 0.03, 0, Math.PI / 2, ROOM.d], [0, -ROOM.d / 2 + 0.03, 0, ROOM.w], [0, ROOM.d / 2 - 0.03, 0, ROOM.w]].forEach(([x, z, ry, len]) => { rk.box(len, 0.12, 0.03, x, 0.06, z, '#7d9590', 'rubber', 0, ry, 0); if (type !== 'ward' && type !== 'clinic') { rk.box(len, 0.08, 0.035, x, 0.92, z, '#c9d0d3', 'satin', 0, ry, 0); } });
    rk.box(3.2, 1.2, 0.03, 3.2, 1.7, -ROOM.d / 2 + 0.03, '#9fd3e8', 'glass'); rk.box(3.3, 0.05, 0.06, 3.2, 1.08, -ROOM.d / 2 + 0.04, '#cfd6da', 'satin'); rk.box(3.3, 0.05, 0.06, 3.2, 2.32, -ROOM.d / 2 + 0.04, '#cfd6da', 'satin');
    rk.rbox(0.62, 0.36, 0.05, 0.02, 2.0, 2.3, ROOM.d / 2 - 0.03, '#1b2226', 'plastic'); rk.box(0.5, 0.08, 0.01, 2.0, 2.38, ROOM.d / 2 - 0.058, '#ff5a3c', 'glow'); rk.box(0.5, 0.06, 0.01, 2.0, 2.24, ROOM.d / 2 - 0.058, '#4dff8f', 'glow');
    if (orLike) { rk.rbox(1.4, 1.9, 0.42, 0.02, 4.4, 1.05, -ROOM.d / 2 + 0.22, '#dfe6e9', 'paint'); for (let i = 0; i < 4; i++) rk.box(1.3, 0.012, 0.36, 4.4, 0.3 + i * 0.45, -ROOM.d / 2 + 0.24, '#f4f6f8', 'glass'); rk.box(1.36, 1.8, 0.01, 4.4, 1.05, -ROOM.d / 2 + 0.43, '#dff3ff', 'glass'); }
    const roomBuilt = rk.build({ shadow: false }); roomGroup.add(roomBuilt);
    if (orLike) { const dm = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.4), new THREE.MeshStandardMaterial({ map: diffuserTexture(), emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 })); dm.rotation.x = Math.PI / 2; dm.position.set(0.1, ROOM.h - 0.03, 0); ceilingGroup.add(dm); [[0, -1.22, 3.1, 0.06], [0, 1.22, 3.1, 0.06], [-1.52, 0, 0.06, 2.5], [1.52, 0, 0.06, 2.5]].forEach(([x, z, w, d2]) => ck.box(w, 0.05, d2, 0.1 + x, ROOM.h - 0.03, z, '#cfd6da', 'satin')); }
    ceilingGroup.add(ck.build({ shadow: false }));
    // image-based lighting: a small procedural room prefiltered with PMREM (no external HDR file)
    try {
      const envScene = new THREE.Scene(); const envBox = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 10), new THREE.MeshBasicMaterial({ color: 0x9aa8a4, side: THREE.BackSide })); envScene.add(envBox);
      [[-3, 1.9, -2], [3, 1.9, -2], [-3, 1.9, 2], [3, 1.9, 2], [0, 1.9, 0]].forEach(([x, y, z]) => { const pnl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff })); pnl.position.set(x, y, z); pnl.rotation.x = Math.PI / 2; envScene.add(pnl); });
      const win2 = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), new THREE.MeshBasicMaterial({ color: 0xbfe3f2 })); win2.position.set(3, 0.4, -4.9); envScene.add(win2);
      const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(envScene, 0.04).texture; if ('environmentIntensity' in scene) scene.environmentIntensity = 0.45; pmrem.dispose(); envScene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    } catch (e) { /* older GPUs: fall back to the lights below */ }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a95, 0.5));
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    const lamps = [];
    if (type === 'or' || type === 'er' || type === 'imaging') {
      [[-0.42, -0.5], [0.6, 0.48]].forEach(([ox, oz], i) => { const sp = new THREE.SpotLight(0xfff3e2, 15, 7, 0.5, 0.6, 1.6); sp.position.set(ox, 1.98, oz); sp.target.position.set(0, PAD + 0.15, 0); sp.castShadow = i === 0; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -0.0006; scene.add(sp); scene.add(sp.target); lamps.push(sp); });
    } else { const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 5, 2); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7; scene.add(key); }
    const fill = new THREE.PointLight(0xdfefff, 8, 12, 2); fill.position.set(3, 2.6, -3); scene.add(fill);

    // ---- table + patient
    const dept = api.c.department || '';
    const variant = type === 'ward' || type === 'clinic' ? 'bed' : type === 'er' ? 'stretcher' : 'or';
    const site = variant === 'or' ? siteFor(api.c, api.fieldType, type) : 'none';
    const posture = site === 'back' ? 'prone' : site === 'lithotomy' ? 'lithotomy' : 'supine';
    const screenOn = variant === 'or' && !HEAD_SITES[site] && site !== 'neck' && site !== 'airway' && site !== 'none';
    const devKind = deviceKind(dept);
    const fieldTexKind = fieldTex(site, api.fieldType || '', dept);
    const field = new THREE.Group(); field.userData.hot = 'field';
    tableG = buildTable(K, { variant, site, posture, screen: screenOn }); field.add(tableG);
    patient = buildPatient(K, { variant, site, posture, screen: screenOn, progress: api.progress, fieldTex: fieldTexKind, room: type, skin: ['#dfae8a', '#c98d62', '#f0cfae', '#a8714a'][(api.c.id || '').length % 4] }); field.add(patient.group);
    if (variant === 'or' && site !== 'none' && site !== 'airway') { const ck = makeKit(K); const fx = (WINDOWS[site] || [-0.3, 0])[1] || 0; ck.rbox(0.05, 0.02, 0.2, 0.01, 0.25, PAD + 0.2, -0.26, '#eaf2f5', 'glass'); ck.cyl(0.006, 0.006, 0.17, 0.25, PAD + 0.21, -0.25, '#f4f6f8', 'plastic', Math.PI / 2, 0, 0, 8); ck.tube([[fx, PAD + 0.2, -0.05], [0.25, PAD + 0.22, -0.2], [0.35, PAD + 0.14, -0.33], [0.4, PAD - 0.1, -0.36], [0.2, 0.4, -0.5], [-0.15, 0.85, -1.4]], 0.004, '#e8eef0', 'plastic', 48); ck.tube([[fx + 0.05, PAD + 0.2, 0.04], [0.3, PAD + 0.21, 0.2], [0.45, PAD + 0.13, 0.33], [0.6, 0.6, 0.45], [1.1, 0.95, 0.8], [1.6, 0.9, -0.9]], 0.0055, '#e6eff2', 'plastic', 48); const cg = ck.build({ shadow: false }); cg.traverse(m => { if (m.isMesh) m.userData.region = null; }); field.add(cg); }
    field.traverse(o => { if (o.isMesh) o.userData.hot = 'field'; });
    scene.add(field); objs.field = field; field.userData.name = say('手術台與病人', 'Operating table & patient');
    field.userData.field = patient.fieldMesh;
    // ---- shared live monitor canvas (patient monitor, recovery bed, resus, perfusion)
    mon.tex = tex(mon.c); const mctx = { monitorCanvas: mon.c, monitorTex: mon.tex, device: devKind, carmX: site === 'arm' ? -0.52 : Math.max(-0.6, Math.min(0.88, (WINDOWS[site] ? (WINDOWS[site][0] + WINDOWS[site][1]) / 2 : site === 'lithotomy' ? 0.05 : -0.3) + 0.48)), carmZ: site === 'arm' ? 0.9 : 0, carmYaw: site === 'limb' ? -0.7 : site === 'arm' ? -Math.PI / 2 : 0, parkedDevice: variant !== 'or' || site === 'none', microTarget: site === 'arm' ? [-0.52 - POS.device[0], 0.66 - POS.device[2]] : site === 'limb' ? [0.5 - POS.device[0], 0.1 - POS.device[2]] : [patient.head[0] - POS.device[0], 0 - POS.device[2]], lightHeads: [[-0.42, -0.5, 4], [0.6, 0.48, 5]] };
    const screens = [];
    function addEquip(id, p, ry) { const e = equipment(id, api, K, mctx); at(e, p, ry); scene.add(e); objs[id] = e; (e.userData.screens || []).forEach(s => screens.push(s)); return e; }
    const ROT = { whiteboard: Math.PI / 2, imaging: 0, door: Math.PI, huddle: Math.PI, chart: -0.6, lab: -Math.PI / 2, cart: -0.8, anesthesia: Math.PI / 2, monitor: Math.atan2(1.7, 1.25), tray: 0, drains: 0.4, device: devKind === 'carm' || devKind === 'microscope' ? 0 : Math.PI };
    Object.keys(POS).forEach(id => { if (id === 'field') return; addEquip(id, POS[id], ROT[id] || 0); });
    Object.keys(POS).forEach(id => { const p = POS[id]; const r = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 48), new THREE.MeshBasicMaterial({ color: 0xc0392b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.set(p[0], 0.012, p[2]); scene.add(r); rings[id] = r; });
    const XR = { backtable: Math.PI / 2, specimen: 0, esu: 0.3, warmer: 0.5, kick: 0, ivpole: 0, sink: Math.PI, lightbox: Math.PI / 2, wallpacs: Math.PI / 2, carm: -Math.PI / 2, microscope: 0.6, endo: 0.5, us: -0.4, lights: 0 };
    const parked = { carm: devKind !== 'carm', microscope: devKind !== 'microscope', endo: devKind !== 'endo', us: devKind !== 'us' };
    Object.keys(EXTRA).forEach(id => {
      if (!orLike && /backtable|specimen|esu|warmer|kick|lights|carm|microscope|endo/.test(id) && !(type === 'er' && id === 'lights')) return;
      if (parked[id] === false) return;
      if (id === 'us' && (type === 'ward' || type === 'clinic')) return;
      addEquip(id, EXTRA[id], XR[id] || 0);
    });
    // breathing circuit from the anaesthesia machine to the patient's tube (corrugated limbs)
    if (variant === 'or' && posture !== 'prone' && site !== 'mouth') { const ck = makeKit(K); const Y = [patient.head[0] - 0.19, patient.head[1] + 0.23, 0.09]; const M = [-2.45, 1.1, -0.72]; [[0.05, '#5fa8e0'], [-0.05, '#d8e6ee']].forEach(([o, c2]) => { const pts = [M, [-2.0, 1.45, -0.2 + o], [-1.45, 1.42, -0.05 + o], [Y[0] - 0.12, Y[1] + 0.06, Y[2] + o * 0.4], Y]; ck.tube(pts, 0.012, c2, 'plastic', 48, 8); const cvv = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))); for (let i = 1; i < 36; i++) { const pp = cvv.getPoint(i / 36), tt = cvv.getTangent(i / 36); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tt); const e = new THREE.Euler().setFromQuaternion(q); ck.tor(0.0125, 0.0028, pp.x, pp.y, pp.z, c2, 'plastic', e.x, e.y, e.z, Math.PI * 2, 5); } }); ck.cyl(0.012, 0.016, 0.05, Y[0], Y[1], Y[2], '#e8eef0', 'plastic', 0, 0, Math.PI / 2, 10); const cg = ck.build({ shadow: false }); cg.traverse(m => { if (m.isMesh) { m.userData.hot = 'anesthesia'; m.userData.equip = 'anesthesia'; } }); scene.add(cg); }
    api.roles.forEach(r => { const key = r.player ? 'player' : (ROLE_POS[r.id] ? r.id : 'extra'); const p = ROLE_POS[key] || ROLE_POS.extra; const m = person(K, r); at(m, p); m.lookAt(0, 1.1, 0); scene.add(m); people[r.id] = m; if (r.id === 'mentor') mentorHome = new THREE.Vector3(p[0], 0, p[2]); });
    arrow = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 16), new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0xc0392b, emissiveIntensity: 0.6 })); arrow.rotation.x = Math.PI; scene.add(arrow);
    beam = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.3, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xc0392b, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); beam.position.y = 1.15; beam.visible = false; scene.add(beam);
    ['left', 'right'].forEach(h => { const s = labelSprite(h === 'left' ? 'L' : 'R', { size: 34, bg: h === 'left' ? 'rgba(20,80,141,.95)' : 'rgba(113,80,33,.95)', border: '#fff', scale: 0.0032 }); s.visible = false; scene.add(s); handMarkers[h] = s; });
    // optional real photograph (licensed; http only — file:// images taint WebGL textures)
    const photoGroup = new THREE.Group(); scene.add(photoGroup);
    function applyPhoto(on) {
      photoState.on = on; const t2 = photoState.tex; if (!t2) return;
      if (photoState.panorama) {
        if (on) { if (!photoState.bg) { photoState.bg = scene.background; photoState.floorMat = floor.material; photoState.env = scene.environment; } scene.background = t2; scene.environment = t2; scene.fog = null; roomGroup.visible = false; floor.material = photoState.shadowMat || (photoState.shadowMat = new THREE.ShadowMaterial({ opacity: 0.35 })); }
        else { scene.background = photoState.bg || new THREE.Color(0x0f1a1e); scene.environment = photoState.env || null; scene.fog = new THREE.Fog(0x0f1a1e, 16, 34); roomGroup.visible = true; if (photoState.floorMat) floor.material = photoState.floorMat; }
      }
      photoGroup.visible = on;
    }
    if (!FILE && api.photo) { const loader = new THREE.TextureLoader(); loader.load(api.photo.src, t2 => { if (disposed) { t2.dispose(); return; } t2.colorSpace = THREE.SRGBColorSpace; photoState.tex = t2; photoState.panorama = !!api.photo.panorama; if (api.photo.panorama) { t2.mapping = THREE.EquirectangularReflectionMapping; const cap = labelSprite(say('實景 360°・', '360° photo · ') + (api.photo.credit || ''), { size: 22, bg: 'rgba(16,28,32,.75)', scale: 0.003 }); cap.position.set(0, 0.25, 2.6); photoGroup.add(cap); } else { const image = t2.image || {}, size = photoPlaneSize(image.naturalWidth || image.width || api.photo.width, image.naturalHeight || image.height || api.photo.height); const print = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshStandardMaterial({ map: t2, roughness: 0.6 })); print.position.set(-1.2, 1.75, -ROOM.d / 2 + 0.03); photoGroup.add(print); const cap = labelSprite(say('實景參考 · ', 'Reference photo · ') + (api.photo.credit || ''), { size: 22, bg: 'rgba(16,28,32,.75)' }); cap.position.set(-1.2, 0.3, -ROOM.d / 2 + 0.1); photoGroup.add(cap); } photo = t2; applyPhoto(photoState.on); }, undefined, () => {}); }
    handle.setPhoto = applyPhoto; handle.showCard = showCard;
    if (!FILE && api.brainSlice && objs.imaging && objs.imaging.userData.brainScreen) { new THREE.TextureLoader().load(api.brainSlice, t2 => { if (disposed) { t2.dispose(); return; } t2.colorSpace = THREE.SRGBColorSpace; const sc = objs.imaging.userData.brainScreen; const old = sc.material.map; sc.material.map = t2; sc.material.emissiveMap = t2; sc.material.needsUpdate = true; if (old && old !== t2) old.dispose(); brainTex = t2; }, undefined, () => {}); }

    // ---- REAL images on screens and the lightbox (http/https only; file:// keeps the procedural canvases)
    function applyReal(s, item, img) {
      const m = s.mesh; const geo = m.geometry.parameters || { width: 1, height: 0.7 }; const ar = (geo.width || 1) / (geo.height || 0.7);
      const H = 512, W = Math.round(H * ar); const c = canvas(W, H), g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const avail = H - 40, sc = Math.min(W / img.naturalWidth, avail / img.naturalHeight); const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc; g.drawImage(img, (W - dw) / 2, (avail - dh) / 2, dw, dh);
      g.fillStyle = 'rgba(0,0,0,.78)'; g.fillRect(0, H - 40, W, 40); g.fillStyle = '#9ff0d7'; g.font = '700 17px system-ui, "Noto Sans TC", sans-serif'; g.fillText(say('真實教學影像', 'REAL teaching image'), 10, H - 22); g.fillStyle = '#dfe'; g.font = '14px system-ui, sans-serif'; g.fillText(String(item.author + ' · ' + item.license).slice(0, Math.max(20, Math.round(W / 8))), 10, H - 6);
      const tx = tex(c); const old = m.material.map; m.material.map = tx; m.material.emissiveMap = tx; m.material.needsUpdate = true; if (old && old !== tx && old !== mon.tex) old.dispose(); realTex.push(tx);
      m.userData.imageId = item.id; m.userData.real = true;
    }
    function loadReal() {
      if (FILE || disposed || typeof api.imaging !== 'function' || typeof window.Image !== 'function') return;
      Promise.resolve().then(() => api.imaging()).then(ti => {
        if (disposed || !ti || !ti.textureList) return; const jobs = []; const used = {};
        screens.forEach(s => { const list = ti.textureList(s.kind, dept, null, 4); if (!list.length) return; const n = used[s.kind] || 0; used[s.kind] = n + 1; jobs.push([s, list[n % list.length]]); });
        let i = 0; const next = () => { if (disposed || i >= jobs.length) return; const [s, item] = jobs[i++]; const img = new window.Image(); img.decoding = 'async'; img.onload = () => { if (disposed) return; try { applyReal(s, item, img); } catch (e) { /* keep the simulation */ } setTimeout(next, 90); }; img.onerror = () => setTimeout(next, 30); img.src = item.path; }; next();
      }).catch(() => {});
    }
    // ---- camera
    const firstPos = new THREE.Vector3(), firstPreset = { pos: firstPos, fov: 70 };
    function presetFor(view) {
      if (view === 'first') { const p = people[api.playerId] || people.player; if (p) firstPos.set(p.position.x, 1.62, p.position.z); else firstPos.set(0.7, 1.62, 1.0); firstPreset.fov = cam.fov; return firstPreset; }
      return null;
    }
    function setView(v) { cam.view = v; if (v === 'first') { cam.fov = Math.max(45, Math.min(95, cam.fov)); } if (v === 'second') { cam.dist = Math.max(1.6, Math.min(6, 4.6 / (api.st.zoom || 1))); cam.yaw = 0.35; cam.pitch = -0.55; cam.pan.set(0, 1.05, 0); } if (v === 'third') { cam.yaw = 0.75; cam.pitch = -0.78; cam.dist = 10.5; cam.pan.set(0, 0.6, 0); } hintText(); }
    function zoomBy(f) { if (cam.view === 'first') cam.fov = Math.max(35, Math.min(100, cam.fov * f)); else cam.dist = Math.max(cam.view === 'second' ? 0.9 : 4, Math.min(cam.view === 'second' ? 7 : 16, cam.dist * f)); }
    function flyTo(id) { const o = objs[id]; if (!o) return; if (cam.view === 'third') setView('second'); cam.pan.set(o.position.x, 1.1, o.position.z); cam.dist = Math.min(cam.dist, 3.2); }
    const tpV = new THREE.Vector3(), dirV = new THREE.Vector3();
    function updateCamera(dt) {
      if (cam.view === 'first') { const f = presetFor('first'); tpV.copy(f.pos); dirV.set(Math.sin(cam.first.yaw) * Math.cos(cam.first.pitch), Math.sin(cam.first.pitch), Math.cos(cam.first.yaw) * Math.cos(cam.first.pitch)); cam.tLook.copy(tpV).add(dirV); camera.fov += (cam.fov - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); }
      else { const d = cam.dist; tpV.set(cam.pan.x + d * Math.sin(cam.yaw) * Math.cos(cam.pitch), cam.pan.y + d * -Math.sin(cam.pitch), cam.pan.z + d * Math.cos(cam.yaw) * Math.cos(cam.pitch)); tpV.y = cam.view === 'third' ? Math.max(1.5, tpV.y) : Math.max(0.4, Math.min(ROOM.h - 0.42, tpV.y)); cam.tLook.copy(cam.pan); if (Math.abs(camera.fov - 62) > 0.5) { camera.fov += (62 - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); } }
      const k = 1 - Math.exp(-dt * 6); cam.pos.lerp(tpV, k); cam.look.lerp(cam.tLook, k); camera.position.copy(cam.pos); camera.lookAt(cam.look);
      const pl = people[api.playerId]; if (pl) pl.visible = cam.view !== 'first'; fpHands.visible = cam.view === 'first'; if (fpHands.visible) { const now = clock.elapsedTime; fpHands.position.y = 0.01 * Math.sin(now * 1.6); }
    }

    // ---- interaction
    let ptr = null, pinchD = 0, hoverId = null, hoverEv = null;
    const pointers = new Map(); const ndc = new THREE.Vector2(); const tmpP = new THREE.Vector3();
    function pickHit(ev) {
      const r = cv.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const h of hits) { if (h.object === beam) continue; let o = h.object; while (o) { if (o.userData && (o.userData.hot || o.userData.zone !== undefined || o.userData.role)) return { u: o.userData, obj: h.object, point: h.point }; o = o.parent; } }
      return null;
    }
    function regionOfPoint(p) { tmpP.copy(p); field.worldToLocal(tmpP); return regionAt(tmpP.x, tmpP.y - PAD, tmpP.z, posture); }
    function targetOf(hit) {
      if (!hit || !hit.u || !hit.u.hot) return null;
      const ob = hit.obj.userData || {};
      if (hit.u.hot === 'field') { if (ob.part) return { kind: 'part', id: ob.part }; if (ob.region) return { kind: 'region', id: ob.region }; if (ob.patient) return { kind: 'region', id: regionOfPoint(hit.point) }; return { kind: 'region', id: regionOfPoint(hit.point) }; }
      const g = objs[hit.u.hot]; const equip = ob.equip || (g && g.userData.equip) || hit.u.hot;
      return { kind: 'equip', id: equip, imageId: ob.imageId || null, hot: hit.u.hot, name: g && g.userData.name };
    }
    let cardParked = null;
    function act(hot, target, ev) {
      showCard(hot, ev, target);
      if (api.onPick) api.onPick(hot);
      // the imaging panel repeats the card's facts and actions, so the card steps aside while it is open
      if (api.onImaging && target && api.onImaging(target, cv, () => { if (!disposed && cardFor === null && cardParked) { cardFor = cardParked; card.hidden = false; placeCard(); } cardParked = null; }) === true) { const was = cardFor; card.hidden = true; cardFor = null; cardParked = was === 'field' || was === 'lights' ? null : was; }
    }
    function tipFor(hit) {
      const u = hit.u; if (u.zone !== undefined) return `${u.zone + 1}. ${pk(api.c.tiles[u.zone])}`;
      if (u.hot) { const tg = targetOf(hit); const nmTxt = targetName(tg, u.hot) || (objs[u.hot] && objs[u.hot].userData.name) || pk(api.hotspots[u.hot] || ''); return nmTxt + ' · ' + say('點擊看真實影像與孿生', 'tap for real images & twin'); }
      return pk((api.roles.find(r => r.id === u.role) || {}));
    }
    cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } pointers.set(e.pointerId, e); ptr = { x: e.clientX, y: e.clientY, moved: 0, yaw: cam.view === 'first' ? cam.first.yaw : cam.yaw, pitch: cam.view === 'first' ? cam.first.pitch : cam.pitch, pan: cam.pan.clone(), btn: e.button, shift: e.shiftKey }; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } });
    cv.addEventListener('pointermove', e => { if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e); if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinchD) zoomBy(pinchD / d); pinchD = d; return; } if (!ptr) { hoverEv = e; return; } const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y; ptr.moved = Math.max(ptr.moved, Math.abs(dx) + Math.abs(dy)); if (cam.view === 'first') { cam.first.yaw = ptr.yaw - dx * 0.005; cam.first.pitch = Math.max(-1.2, Math.min(0.8, ptr.pitch + dy * 0.005)); } else if (ptr.btn === 2 || ptr.shift) { const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)); cam.pan.copy(ptr.pan).addScaledVector(right, -dx * 0.004 * cam.dist); cam.pan.y = Math.max(0.3, Math.min(2.2, ptr.pan.y + dy * 0.004 * cam.dist)); } else { cam.yaw = ptr.yaw - dx * 0.006; cam.pitch = Math.max(-1.45, Math.min(-0.05, ptr.pitch - dy * 0.006)); } });
    function hover(e) { const hit = pickHit(e); const id = hit ? (hit.u.hot ? hit.u.hot + ':' + (targetOf(hit) || {}).id : hit.u.zone !== undefined ? 'zone' + hit.u.zone : hit.u.role) : null; if (id !== hoverId) { hoverId = id; cv.style.cursor = id ? 'pointer' : 'grab'; if (hit) { tip.textContent = tipFor(hit); tip.hidden = false; } else tip.hidden = true; } if (!tip.hidden) { const r = el.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 120) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; } }
    const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchD = 0; if (!ptr) return; const moved = ptr.moved; ptr = null; if (moved < 6) { const hit = pickHit(e); if (hit) { const u = hit.u; if (u.zone !== undefined) api.onZone(u.zone); else if (u.hot) act(u.hot, targetOf(hit), e); else if (u.role) api.onRole && api.onRole(u.role); } } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', () => { if (!pointers.size) { ptr = null; tip.hidden = true; hoverEv = null; } });
    cv.addEventListener('wheel', e => { e.preventDefault(); zoomBy(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('dblclick', e => { const hit = pickHit(e); if (hit && hit.u.hot) flyTo(hit.u.hot); });
    cv.style.cursor = 'grab'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', say('3D 數位孿生手術室：拖曳環視、滾輪或雙指縮放；點病人、手術台或儀器看真實影像與數位孿生', '3D digital-twin theatre: drag to look, wheel or pinch to zoom; tap the patient, table or equipment for real images and the digital twin'));

    // ---- test / automation helpers
    const ANCHOR = { head: [-0.95, 0.16, 0], face: [-0.885, 0.19, 0.025], neck: [-0.71, 0.13, 0], mouth: [-0.815, 0.185, -0.012], chest: [-0.45, 0.2, -0.02], breast: [-0.46, 0.2, 0.11], 'abdomen-upper': [-0.2, 0.2, 0.0], 'abdomen-lower': [-0.04, 0.2, 0.0], pelvis: [0.08, 0.18, 0.0], spine: [-0.2, 0.2, 0.0], 'upper-limb': [-0.52, 0.06, 0.62], 'lower-limb': [0.5, 0.11, -0.09], skin: [-0.52, 0.06, -0.62] };
    function anchorWorld(region) { const a = ANCHOR[region]; if (!a) return null; let y = a[1]; if (posture === 'prone' && region === 'spine') y = 0.22; const v = new THREE.Vector3(a[0], y + PAD, a[2]); if (posture === 'lithotomy' && region === 'lower-limb') v.set(0.38, PAD + 0.45, 0.31); return field.localToWorld(v); }
    function project(v) { const p = v.clone().project(camera); const r = el.getBoundingClientRect(); return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height, visible: p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 }; }
    handle.screenPos = (id, y) => { const o = objs[id]; if (!o) return null; const v = o.position.clone(); v.y = y == null ? 1.0 : y; return project(v); };
    handle.regionPos = region => { const w = anchorWorld(region); if (!w) return null; const s = project(w); const hit = pickHit({ clientX: s.x, clientY: s.y }); const tg = hit ? targetOf(hit) : null; s.hit = tg ? tg.kind + ':' + tg.id : null; if (s.hit === 'region:' + region) return s; const ms = []; patient.group.traverse(m => { if (m.isMesh) ms.push(m); }); return samplePos(ms, t2 => t2.kind === 'region' && t2.id === region) || s; };
    function samplePos(meshes, ok) { // first projected vertex whose pick really lands on the wanted target
      const v = new THREE.Vector3();
      for (const m of meshes) { const P = m.geometry.attributes.position; const step = Math.max(1, Math.floor(P.count / 300)); for (let i = 0; i < P.count; i += step) { v.fromBufferAttribute(P, i); m.localToWorld(v); const s2 = project(v); if (!s2.visible) continue; const r = el.getBoundingClientRect(); if (s2.x < r.left + 6 || s2.y < r.top + 6 || s2.x > r.right - 6 || s2.y > r.bottom - 6) continue; if (document.elementFromPoint && document.elementFromPoint(s2.x, s2.y) !== cv) continue; const hit = pickHit({ clientX: s2.x, clientY: s2.y }); const tg = hit ? targetOf(hit) : null; if (tg && ok(tg, hit)) { s2.hit = tg.kind + ':' + tg.id; return s2; } } }
      return null;
    }
    handle.partPos = part => { const ms = []; tableG.traverse(m => { if (m.isMesh && m.userData.part === part) ms.push(m); }); patient.group.traverse(m => { if (m.isMesh && m.userData.part === part) ms.push(m); }); return samplePos(ms, tg => tg.kind === 'part' && tg.id === part); };
    handle.equipPos = id => { const o = objs[id]; if (!o) return null; const ms = []; o.traverse(m => { if (m.isMesh) ms.push(m); }); return samplePos(ms, (tg, hit) => hit.u.hot === id); };
    handle.settle = () => { updateCamera(5); camera.updateMatrixWorld(); };
    handle.pickRegion = region => act('field', { kind: 'region', id: region }, null);
    handle.focusField = () => { cam.view = 'second'; cam.yaw = 0.0; cam.pitch = -1.25; cam.dist = 2.6; cam.pan.set(-0.05, PAD, 0); cam.pos.set(0, 4, 0.8); hintText(); };
    handle.info = () => ({ gpu: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }, frames: frame, cam: { view: cam.view, dist: +cam.dist.toFixed(2), yaw: +cam.yaw.toFixed(2), pitch: +cam.pitch.toFixed(2) }, site, posture, variant, device: devKind, fieldTex: fieldTexKind, screens: screens.map(s => ({ kind: s.kind, imageId: s.mesh.userData.imageId || null })), objects: Object.keys(objs) });
    window.__ht3d = handle;

    // ---- per-render update from theatre.js
    handle.setMentor = k => { cur.mentorK = Math.max(0, Math.min(1, Number(k) || 0)); };
    let cur = { target: null, second: null, mentorK: 0, lines: [], vitals: null, stations: [], hands: null, progress: 0 };
    let lastProgress = -1;
    function update(a) {
      api = a; handle.api = a; cur.target = a.target; cur.second = a.second; cur.mentorK = a.mentorK || 0; cur.lines = a.lines || []; cur.vitals = a.vitals; cur.progress = a.progress || 0;
      if (a.st.view !== cam.view) setView(a.st.view);
      if (a.st.view === 'second') cam.dist = Math.max(1.2, Math.min(7, 4.6 / (a.st.zoom || 1)));
      pins.forEach(drop); pins.length = 0;
      a.map.forEach(m => { const hs0 = POS[m.hotspot]; if (!hs0) return; const hs = m.hotspot === 'field' ? [1.35, 0, -0.45] : hs0; const isT = m.station === a.s.zone || m.station === a.s.secondZone, done = !!(a.doneStations && a.doneStations.has(m.station)); const sp = labelSprite(String(m.station + 1), { size: 30, bg: isT ? 'rgba(192,57,43,.96)' : done ? 'rgba(40,122,85,.92)' : 'rgba(31,111,95,.92)', border: '#fff', scale: 0.0028 }); sp.position.set(hs[0] + (m.slot % 3) * 0.28 - 0.28, 2.2 + Math.floor(m.slot / 3) * 0.26, hs[2]); sp.userData.zone = m.station; scene.add(sp); pins.push(sp); if (isT) { const name = labelSprite(pk(a.c.tiles[m.station]), { size: 24, bg: 'rgba(122,28,36,.92)', scale: 0.003 }); name.position.set(hs[0], 1.92, hs[2]); name.userData.zone = m.station; scene.add(name); pins.push(name); } });
      const f = objs.field && objs.field.userData.field; const prog = Math.round((a.progress || 0) * 20) / 20;
      if (f && f.material && f.material.map && prog !== lastProgress) { lastProgress = prog; const kind = f.userData.fieldKind || 'generic'; const c2 = /^cap:/.test(kind) ? capCanvas(kind.slice(4), a.progress) : fieldCanvas(kind, a.progress); f.material.map.image = c2; f.material.map.needsUpdate = true; }
      bubbles.forEach(drop); bubbles = [];
      (a.lines || []).slice(0, 2).forEach((l, i) => { const p = people[l.role]; if (!p) return; const b = labelSprite(wrapText(l.text, zh() ? 16 : 34), { size: 24, bg: 'rgba(255,255,255,.96)', color: '#15202b', border: i === 0 ? '#1f6f5f' : '#81296d', scale: 0.0028 }); b.position.set(p.position.x, 2.42, p.position.z); b.userData.role = l.role; scene.add(b); bubbles.push(b); });
      ['left', 'right'].forEach(h => { const hp = a.engine.hands[h]; const mk = handMarkers[h]; if (!hp || !hp.moved) { mk.visible = false; return; } const z = a.engine.anchors.findIndex(an => Math.hypot(an[0] - hp.x, an[1] - hp.y) <= a.engine.tolerance); const m = z >= 0 ? a.map[z] : null; if (!m) { mk.visible = false; return; } const hs = POS[m.hotspot]; mk.position.set(hs[0] + (h === 'left' ? -0.35 : 0.35), 1.45, hs[2] + 0.25); mk.visible = true; });
      hintText();
    }
    function drop(o) { if (!o) return; if (o.parent) o.parent.remove(o); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
    function wrapText(text, n) { const out = []; let s = String(text || ''); if (zh()) { while (s.length > n) { out.push(s.slice(0, n)); s = s.slice(n); } out.push(s); } else { const words = s.split(' '); let line = ''; words.forEach(w => { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line += ' ' + w; }); if (line.trim()) out.push(line.trim()); } return out.slice(0, 4).join('\n'); }
    function hintText() { hint.textContent = cam.view === 'first' ? say('第一視角：拖曳環視 · 滾輪／雙指調整視野 · 點病人或儀器看真實影像', 'First person: drag to look · wheel/pinch changes field of view · tap the patient or equipment for real images') : cam.view === 'second' ? say('第二視角：拖曳環繞 · 滾輪／雙指拉近 · 右鍵或 Shift 拖曳平移 · 點病人任一部位看影像與孿生', 'Second person: drag to orbit · wheel/pinch zooms · right/Shift-drag pans · tap any body region for images & twin') : say('第三視角：整間手術室 · 拖曳旋轉 · 點站牌、病人或儀器', 'Third person: the whole room · drag to rotate · tap a pin, the patient or equipment'); }

    // ---- animation
    const gs = (tt, m, w, a) => a * Math.exp(-((tt - m) ** 2) / (2 * w * w));
    const WAVES = [['#4dff8f', 'ECG II'], ['#ff6b6b', 'ART'], ['#74c0fc', 'SpO₂'], ['#ffd166', 'CO₂']];
    function wave(ch, tt, hr, rr) { const beat = 60 / Math.max(30, hr || 72); const ph = tt % beat; if (ch === 0) return gs(ph, 0.08, 0.02, 0.12) + gs(ph, 0.2, 0.01, -0.1) + gs(ph, 0.22, 0.012, 1.1) + gs(ph, 0.25, 0.012, -0.25) + gs(ph, 0.45, 0.05, 0.25); if (ch === 1) { const q = (ph - 0.22) / beat; return q < 0 ? 0.05 : q < 0.12 ? q / 0.12 : q < 0.3 ? 1 - (q - 0.12) * 1.8 + gs(q, 0.32, 0.02, 0.18) : Math.max(0.05, 0.68 - (q - 0.3) * 0.9); } if (ch === 2) { const q = ((ph - 0.3 + beat) % beat) / beat; return Math.sin(Math.min(1, q * 2.2) * Math.PI) * 0.8 * (q < 0.45 ? 1 : 0.3) + 0.1; } const br = 60 / Math.max(6, rr || 14), b2 = (tt % br) / br; return b2 < 0.45 ? 0.04 : b2 < 0.5 ? (b2 - 0.45) / 0.05 : b2 < 0.92 ? 1 + (b2 - 0.5) * 0.12 : Math.max(0.04, 1.05 - (b2 - 0.92) / 0.03); }
    function drawMonitor(dt, force) {
      const v = cur.vitals || { hr: 72 }; const g = mon.c.getContext('2d'); mon.t += dt;
      if (force || !mon.prev) { g.fillStyle = '#04090b'; g.fillRect(0, 0, 512, 320); mon.prev = [0, 0, 0, 0]; mon.x = 0; }
      const speed = 95; const steps = Math.max(1, Math.round(dt * speed)); const rows = [10, 86, 162, 238];
      for (let s = 0; s < steps; s++) {
        const tt = mon.t - (steps - s) / speed; const nx = mon.x + 1; if (nx >= 360) { mon.x = 0; continue; }
        g.fillStyle = '#04090b'; g.fillRect(nx + 1, 0, 10, 320);
        for (let ch = 0; ch < 4; ch++) { const y = rows[ch] + 62 - wave(ch, tt, v.hr, v.rr) * (ch === 0 ? 40 : 46); g.strokeStyle = WAVES[ch][0]; g.lineWidth = 2.2; g.beginPath(); g.moveTo(mon.x, mon.prev[ch] || y); g.lineTo(nx, y); g.stroke(); mon.prev[ch] = y; }
        mon.x = nx;
      }
      mon.acc += dt; if (force || mon.acc > 0.6) { mon.acc = 0; g.fillStyle = '#0a1216'; g.fillRect(362, 0, 150, 320); g.strokeStyle = '#1c2a30'; g.beginPath(); g.moveTo(362, 0); g.lineTo(362, 320); g.stroke(); const n = [[`${v.hr || 72}`, 'HR', '#4dff8f'], [`${v.bp || '118/72'}`, 'ART', '#ff6b6b'], [`${v.spo2 || 98}`, 'SpO₂ %', '#74c0fc'], [`${v.etco2 || 36}`, 'EtCO₂', '#ffd166']]; n.forEach(([val, lab, c2], i) => { g.fillStyle = c2; g.font = '600 13px system-ui'; g.fillText(lab, 370, 22 + i * 76); g.font = `700 ${val.length > 4 ? 28 : 40}px system-ui`; g.fillText(val, 372, 62 + i * 76); }); g.fillStyle = '#9ab'; g.font = '12px system-ui'; for (let ch = 0; ch < 4; ch++) g.fillText(WAVES[ch][1], 4, rows[ch] + 12); g.fillStyle = '#cfe'; g.font = '11px system-ui'; g.fillText(`T ${v.temp || 36.6}°  RR ${v.rr || 14}`, 372, 312); }
      mon.tex.needsUpdate = true;
    }
    const ringIds = Object.keys(rings), peopleList = Object.values(people);
    let frame = 0; const goal = new THREE.Vector3(), tgtV = new THREE.Vector3(), lookV = new THREE.Vector3(), tagV = new THREE.Vector3();
    function loop() { if (disposed || failed) return; raf = requestAnimationFrame(loop); const rawDt = clock.getDelta(); const dt = Math.min(0.05, rawDt); const now = clock.elapsedTime;
      if (!el.isConnected) return; if (document.hidden) return;
      try {
      frame++;
      handle.frames = frame; updateCamera(Math.min(0.25, rawDt)); placeCard(); ceilingGroup.visible = camera.position.y < ROOM.h - 0.05;
      if (hoverEv && !ptr && frame % 2 === 0) { hover(hoverEv); hoverEv = null; }
      if (frame % 2 === 0 || frame < 3) drawMonitor(frame < 3 ? 0.03 : dt * 2, frame < 3);
      ringIds.forEach(id => { const r = rings[id]; const on = cur.target && cur.target.hotspot === id; r.material.opacity += ((on ? 0.6 + 0.3 * Math.sin(now * 5) : 0) - r.material.opacity) * Math.min(1, dt * 8); r.visible = r.material.opacity > 0.01; const s = on ? 1 + 0.08 * Math.sin(now * 5) : 1; r.scale.set(s, s, 1); });
      if (cur.target && POS[cur.target.hotspot]) { const p = POS[cur.target.hotspot]; arrow.visible = true; arrow.position.set(p[0], 2.62 + 0.12 * Math.sin(now * 4), p[2]); beam.visible = true; beam.position.set(p[0], 1.15, p[2]); beam.material.opacity = 0.05 + 0.03 * Math.sin(now * 3); } else { arrow.visible = false; beam.visible = false; }
      const mentor = people.mentor; if (mentor && mentorHome) { const hasT = cur.target && POS[cur.target.hotspot]; if (hasT) tgtV.set(POS[cur.target.hotspot][0], 0, POS[cur.target.hotspot][2] - 0.75); else tgtV.copy(mentorHome); goal.copy(mentorHome).lerp(tgtV, Math.max(0, Math.min(1, cur.mentorK))); mentor.position.lerp(goal, Math.min(1, dt * 4)); if (hasT) lookV.set(POS[cur.target.hotspot][0], 1.1, POS[cur.target.hotspot][2]); else lookV.set(0, 1.1, 0); mentor.lookAt(lookV); const stepping = mentor.position.distanceTo(goal) > 0.02; mentor.position.y = stepping ? Math.abs(Math.sin(now * 9)) * 0.03 : 0; }
      const an = objs.anesthesia; if (an) { const b = an.userData.bag; if (b) { const s = 1 + 0.16 * Math.sin(now * 1.3); b.scale.set(0.7 * s, s, 0.7 * s); } const be = an.userData.bellows; if (be) be.scale.y = 0.75 + 0.25 * Math.sin(now * 1.3); }
      bubbles.forEach((b, i) => { b.position.y = 2.42 + 0.03 * Math.sin(now * 3 + i); const p = people[b.userData.role]; if (p && p.userData.head) p.userData.head.position.y = 0.012 * Math.sin(now * 6); });
      peopleList.forEach(p => { const tg = p.userData.tag; if (tg) { tg.getWorldPosition(tagV); tg.visible = camera.position.distanceTo(tagV) > 1.3 && p.visible; } });
      renderer.render(scene, camera); } catch (error) { fail('render'); } }
    resize = function () { const w = Math.max(240, el.clientWidth), h = Math.max(200, el.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    ro = window.ResizeObserver ? new window.ResizeObserver(resize) : null; if (ro) ro.observe(el); window.addEventListener('resize', resize);

    handle.sceneMs = Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0);
    setView(cam.view); cam.pos.set(8, 6, 9); cam.look.set(0, 1, 0); update(api); resize(); loop();
    Object.assign(handle, { update, setView, zoomBy, resize, flyTo, buildMs: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0) });
    if (!FILE) { const later = typeof window.requestIdleCallback === 'function' ? fn => window.requestIdleCallback(fn, { timeout: 2500 }) : fn => setTimeout(fn, 900); later(loadReal); }
    return handle;
    } catch (error) { dispose(); throw error; }
  }
  function at(obj, p, ry) { obj.position.set(p[0], p[1] || 0, p[2]); if (ry !== undefined) obj.rotation.y = ry; return obj; }

  window.HT = window.HT || {};
  window.HT.theatre3d = { available, ensure, mount, POS, EXTRA, ROLE_POS, INFO, siteFor, regionAt, deviceKind, REGION, PART };
})(window);
