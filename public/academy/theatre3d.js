/* 3D digital-twin theatre (v3.9; v4.0 adds walk mode and the ICU / lab / reading-room / dental rooms for the shift game:
   `api.walk` spawns a third-person avatar on a 0.25 m nav grid (A* + line-of-sight smoothing), with WASD / arrows / IJKL,
   an on-screen D-pad, tap-to-walk, `follow` and `fp` cameras, a cast of people (`setCast`, `walkCast`), "!" / "?" markers,
   talk / look prompts, speech bubbles, emotes and day / evening / night / alarm lighting moods). A procedural, physically lit modern operating room / resus bay / ward
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
  // v4.1: optional room packs register builders in window.HT.theatre3dRooms (theatre3d-labs.js: decoction-lab / cssd /
  // biomed-lab). ensure() loads the pack once after three.js so the builders exist before mount(); failure is ignored.
  let labsLoading = null;
  function ensureLabs() {
    if (!labsLoading) labsLoading = (window.HT && window.HT.loadScript ? window.HT.loadScript('theatre3d-labs.js') : Promise.resolve()).catch(() => {});
    return labsLoading;
  }
  function ensure() {
    if (window.THREE) { THREE = window.THREE; return ensureLabs().then(() => THREE); }
    if (!loading) loading = window.HT.loadScript('vendor/three.js').then(() => {
      if (!window.THREE || !window.THREE.WebGLRenderer) throw new Error('3D library unavailable');
      THREE = window.THREE; return ensureLabs();
    }).then(() => THREE).catch(error => { loading = null; throw error; });
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
  // v4.0 walk mode (shift game): hotspot ids used by data/shifts/*.json → scene object ids. Rooms may override
  // (e.g. in the ICU `bed` is the player's patient, in the lab `field` is the main bench).
  const HOT_ALIAS = { anaesthesia: 'anesthesia', instruments: 'tray', drugs: 'cart', drain: 'drains', handover: 'huddle', ultrasound: 'us', endoscopy: 'endo', 'crash-cart': 'crash', bed: 'recovery', lights: 'lights',
    // v4.1 (huatuo-shift-v2) ids used in an old room fall back to the nearest equivalent; the new rooms override them with A()
    couch: 'recovery', needles: 'tray', moxa: 'cart', cups: 'tray', electro: 'device', lamp: 'lights', 'meridian-chart': 'whiteboard', bronze: 'whiteboard', 'pulse-desk': 'chart', cabinet: 'cart', scale: 'lab', grinder: 'lab', decoction: 'device', granules: 'cart', traction: 'recovery', mat: 'huddle',
    hplc: 'analyser', oven: 'lab', autoclave: 'device', washer: 'sink', packing: 'bench', 'sterile-store': 'cart', printer3d: 'device', incubator: 'lab' };
  const SHIFT_HOTS = ['field', 'monitor', 'imaging', 'anaesthesia', 'instruments', 'drugs', 'drain', 'lab', 'chart', 'whiteboard', 'handover', 'recovery', 'door', 'device', 'sink', 'lightbox', 'ultrasound', 'endoscopy', 'microscope', 'carm', 'crash-cart', 'bed', 'desk', 'bench', 'centrifuge', 'analyser', 'hood', 'workstation',
    // v4.1 TCM rooms + lab / engineering scenes
    'couch', 'needles', 'moxa', 'cups', 'electro', 'lamp', 'meridian-chart', 'bronze', 'pulse-desk', 'cabinet', 'scale', 'grinder', 'decoction', 'granules', 'traction', 'mat', 'hplc', 'oven', 'autoclave', 'washer', 'packing', 'sterile-store', 'printer3d', 'incubator', 'tray'];
  // rooms without an operating table: the room builder places its own couches / benches (v4.0: icu lab reading dental; v4.1: TCM + labs)
  const NEW_ROOM = { icu: 1, lab: 1, reading: 1, dental: 1, 'tcm-clinic': 1, acupuncture: 1, 'herbal-pharmacy': 1, tuina: 1, 'decoction-lab': 1, cssd: 1, 'biomed-lab': 1 };
  const TCM_ROOM = { 'tcm-clinic': 1, acupuncture: 1, 'herbal-pharmacy': 1, tuina: 1 };
  const ROOMS = ['or', 'er', 'ward', 'clinic', 'imaging', 'icu', 'lab', 'reading', 'dental', 'tcm-clinic', 'acupuncture', 'herbal-pharmacy', 'tuina', 'decoction-lab', 'cssd', 'biomed-lab'];
  const FOV_MIN = 55, FOV_MAX = 120, FOLLOW_FOV_MAX = 100;
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const coarsePointer = () => !!(window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 900px)').matches));
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
  // per-room palettes (floor, wall top, wall bottom, floor grid, tile step)
  const PALETTE = {
    or: ['#b7c6c1', '#d3e3df', '#c3d6d1', 'rgba(70,90,85,.18)', 256], imaging: ['#b7c6c1', '#d3e3df', '#c3d6d1', 'rgba(70,90,85,.18)', 256], er: ['#c3cdd0', '#e1e9ec', '#d9d3c6', 'rgba(60,70,60,.25)', 128],
    ward: ['#cfc8b8', '#ece6d9', '#d9d3c6', 'rgba(60,70,60,.25)', 128], clinic: ['#cfc8b8', '#ece6d9', '#d9d3c6', 'rgba(60,70,60,.25)', 128],
    icu: ['#c9d3d4', '#eaeeea', '#d6ddd8', 'rgba(60,80,80,.22)', 128], lab: ['#d6d9d3', '#f0f2ee', '#dfe4df', 'rgba(70,80,70,.16)', 256],
    reading: ['#3a4150', '#4b5362', '#3c4350', 'rgba(255,255,255,.05)', 128], dental: ['#d9ccb2', '#eef2f0', '#dbe9e3', 'rgba(90,80,60,.22)', 128],
    // v4.1 TCM rooms: pale wood / warm plaster; labs: light grey
    'tcm-clinic': ['#d9c9ab', '#f3ede1', '#e4d9c6', 'rgba(110,85,50,.16)', 128], acupuncture: ['#d3cab8', '#f1ece3', '#e2dccf', 'rgba(90,80,60,.18)', 128],
    'herbal-pharmacy': ['#b98f64', '#efe3cf', '#d9c3a3', 'rgba(80,50,20,.22)', 128], tuina: ['#cfc3ad', '#efe9dc', '#dfd6c6', 'rgba(90,80,60,.18)', 128],
    'decoction-lab': ['#d6d9d3', '#f0f2ee', '#dfe4df', 'rgba(70,80,70,.16)', 256], cssd: ['#cfd6d8', '#eef2f3', '#dde4e6', 'rgba(60,80,80,.2)', 256], 'biomed-lab': ['#d3d8dc', '#f1f3f5', '#e0e5e9', 'rgba(60,70,80,.16)', 256]
  };
  const WOOD_FLOOR = { 'tcm-clinic': 1, 'herbal-pharmacy': 1, tuina: 1 };
  function floorTexture(type) {
    const P = PALETTE[type] || PALETTE.or; const c = canvas(512, 512), g = c.getContext('2d'); g.fillStyle = P[0]; g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, type === 'reading' ? 9000 : 5000, type === 'reading' ? 0.12 : 0.07);
    const wood = type === 'dental' || WOOD_FLOOR[type];
    if (wood) { g.strokeStyle = 'rgba(120,95,60,.18)'; g.lineWidth = 3; for (let i = 0; i <= 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); } for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(110,85,50,.08)'; g.lineWidth = 1; const x = Math.floor(Math.random() * 8) * 64; const y = Math.random() * 512; g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x + 60, y + Math.random() * 8 - 4); g.stroke(); } if (type === 'herbal-pharmacy') { g.strokeStyle = 'rgba(60,35,10,.16)'; g.lineWidth = 2; for (let i = 0; i < 24; i++) { const y = i * 22 + Math.random() * 10; g.beginPath(); g.moveTo(0, y); g.lineTo(512, y + Math.random() * 6 - 3); g.stroke(); } } }
    else if (type !== 'reading') { for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.04})`; g.beginPath(); g.ellipse(Math.random() * 512, Math.random() * 512, 30 + Math.random() * 60, 12 + Math.random() * 30, Math.random() * 3, 0, Math.PI * 2); g.fill(); } }
    if (!wood) { g.strokeStyle = P[3]; g.lineWidth = 2; const step = P[4]; for (let i = 0; i <= 512; i += step) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); } }
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ROOM.w / 2.4, ROOM.d / 2.4); return t;
  }
  function wallTexture(type) {
    const P = PALETTE[type] || PALETTE.or; const c = canvas(512, 256), g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, P[1]); grd.addColorStop(1, P[2]); g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
    noise(g, 512, 256, 1200, 0.035); if (type !== 'reading') { g.fillStyle = 'rgba(80,100,95,.22)'; for (let i = 0; i < 512; i += 128) g.fillRect(i, 0, 2, 256); g.fillStyle = 'rgba(255,255,255,.3)'; for (let i = 2; i < 512; i += 128) g.fillRect(i, 0, 1, 256); }
    if (type === 'dental') { g.fillStyle = '#9fcfc0'; g.fillRect(0, 150, 512, 14); } if (type === 'icu') { g.fillStyle = '#b9cbd8'; g.fillRect(0, 160, 512, 10); }
    if (TCM_ROOM[type]) { g.fillStyle = type === 'herbal-pharmacy' ? '#8a5a34' : '#b89a72'; g.fillRect(0, 164, 512, 12); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, 176, 512, 2); } // wooden dado rail
    if (type === 'cssd') { g.fillStyle = '#7fb3c8'; g.fillRect(0, 160, 512, 10); }
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
    else if (kind === 'anesthesia' || kind === 'vent') {
      g.fillText(kind === 'vent' ? say('呼吸器 · 監測', 'Ventilator · monitoring') : say('麻醉工作站 · 監測', 'Anaesthesia workstation · monitoring'), 14, 28);
      const waves = [['Paw', '#ffd166', ph => ph < 0.35 ? Math.sin(ph / 0.35 * Math.PI) * 0.9 : 0.05], ['Flow', '#06d6a0', ph => ph < 0.35 ? Math.sin(ph / 0.35 * Math.PI) : ph < 0.75 ? -Math.sin((ph - 0.35) / 0.4 * Math.PI) * 0.8 : 0], ['CO₂', '#74c0fc', ph => ph < 0.3 ? 0.05 : ph < 0.38 ? (ph - 0.3) / 0.08 : ph < 0.9 ? 1 + (ph - 0.38) * 0.15 : Math.max(0, 1 - (ph - 0.9) / 0.05)]];
      waves.forEach(([lab, colr, fn], r) => { const y0 = 70 + r * 78; g.fillStyle = '#9ab'; g.font = '14px system-ui'; g.fillText(lab, 14, y0 - 18); g.strokeStyle = colr; g.lineWidth = 2.5; g.beginPath(); for (let x = 0; x <= 330; x += 3) { const ph = (x / 110) % 1; const y = y0 + 20 - fn(ph) * 34; if (x) g.lineTo(60 + x, y); else g.moveTo(60 + x, y); } g.stroke(); });
      g.fillStyle = '#74c0fc'; g.font = '700 16px system-ui'; g.fillText(say('EtCO₂ 量測', 'EtCO₂ measured'), 410, 220); g.font = '700 44px system-ui'; g.fillText(String((ctx && ctx.etco2) || 36), 412, 268);
      g.fillStyle = '#cfe'; g.font = '13px system-ui, "Noto Sans TC", sans-serif'; g.fillText(kind === 'vent' ? say('呼吸器模式與設定', 'Ventilator modes & settings') : say('呼吸器與麻醉氣體設定', 'Ventilator & agent settings'), 404, 70); g.fillText(kind === 'vent' ? say('由加護團隊負責', 'belong to the ICU team') : say('由麻醉科醫師負責', 'belong to the anaesthetist'), 404, 90); g.fillText(say('本站不顯示設定值', 'no settings shown here'), 404, 110);
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
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), led: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, map: ledTexture() }),
      panel: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) // ceiling panels: dimmed by setMood
    };
  }
  const UP = { x: 0, y: 1, z: 0 };
  // fewer materials = fewer draw calls on phones: similar finishes share one material (colour stays per vertex)
  const FINISH = { satin: 'metal', gold: 'metal', plastic: 'paint', skin: 'paint', cloth: 'matte', rubber: 'matte' };
  function makeKit(K) {
    const parts = {}; const d = new THREE.Object3D(); let parent = null; const stack = [];
    function M(x, y, z, rx, ry, rz, sx, sy, sz) { d.position.set(x || 0, y || 0, z || 0); d.rotation.set(rx || 0, ry || 0, rz || 0); d.scale.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz); d.updateMatrix(); const m = d.matrix.clone(); if (parent) m.premultiply(parent); return m; }
    function add(g, c, f, m, cable) { f = FINISH[f] || f; (parts[f] || (parts[f] = [])).push({ g, m, c: col(c), cable: !!cable }); }
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
      tube(pts, r, c, f, seg, rseg) { const cv = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))); add(new THREE.TubeGeometry(cv, seg || Math.max(8, pts.length * 6), r, rseg || 6), c, f, M(0, 0, 0), r < 0.016); return k; },
      ext(shape, depth, x, y, z, c, f, rx, ry, rz) { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -depth / 2); return k.geo(g, x, y, z, c, f, rx, ry, rz); },
      seg(A, B, rA, rB, c, f, s) { const a = new THREE.Vector3(A[0], A[1], A[2]), b = new THREE.Vector3(B[0], B[1], B[2]); const dir = b.clone().sub(a); const len = dir.length(); if (len < 1e-5) return k; dir.divideScalar(len); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(UP.x, UP.y, UP.z), dir); const big = Math.max(rA, rB) || 1e-4; const m = new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(big, len, big)); if (parent) m.premultiply(parent); add(K.g.cyl(rB / big, rA / big, s || 10), c, f, m); return k; },
      flat(A, B, w, h, c, f) { const a = new THREE.Vector3(A[0], A[1], A[2]), b = new THREE.Vector3(B[0], B[1], B[2]); const dir = b.clone().sub(a); const len = dir.length(); if (len < 1e-5) return k; dir.divideScalar(len); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir); const m = new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(len, h, w)); if (parent) m.premultiply(parent); add(K.g.box(), c, f, m); return k; },
      build(opts) {
        opts = opts || {}; const g = new THREE.Group(); const foot = []; const bb = new THREE.Box3();
        Object.keys(parts).forEach(f => {
          // walking-height footprint of every solid part (group-local AABB) feeds the nav grid in walk mode
          parts[f].forEach(p => { if (p.cable) return; if (!p.g.boundingBox) p.g.computeBoundingBox(); bb.copy(p.g.boundingBox).applyMatrix4(p.m); if (bb.max.y < 0.03 || bb.min.y > 1.55) return; foot.push([bb.min.x, bb.max.x, bb.min.z, bb.max.z, bb.max.y]); });
          const geo = mergeParts(parts[f], f === 'led'); parts[f].forEach(p => { if (!K.g.set.has(p.g)) p.g.dispose(); }); const mesh = new THREE.Mesh(geo, K.mat[f]); mesh.castShadow = opts.shadow !== false && !/glass|glow|led|fluid|panel/.test(f); mesh.receiveShadow = !/glow|led|panel/.test(f); if (f === 'glass' || f === 'fluid') mesh.renderOrder = 2; g.add(mesh);
        });
        g.userData.foot = foot;
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
  const DOOR_SIGN = { or: ['手術室 3 · 限制區', 'THEATRE 3 · RESTRICTED'], imaging: ['影像檢查室 · 管制區', 'IMAGING SUITE · CONTROLLED'], er: ['急救區 · 急診', 'RESUS · EMERGENCY'], ward: ['病房 · 請先洗手', 'WARD · CLEAN HANDS FIRST'], clinic: ['門診 · 第 2 診', 'CLINIC · ROOM 2'], icu: ['加護病房 · 管制區', 'ICU · RESTRICTED'], lab: ['檢驗醫學部 · 實驗室', 'CLINICAL LABORATORY'], reading: ['放射科 · 判讀室', 'RADIOLOGY · READING ROOM'], dental: ['牙科 · 第 2 診間', 'DENTAL · OPERATORY 2'],
    'tcm-clinic': ['中醫部 · 第 1 診間', 'TCM · CONSULTING ROOM 1'], acupuncture: ['針灸治療室', 'ACUPUNCTURE ROOM'], 'herbal-pharmacy': ['中藥局 · 調劑室', 'HERBAL PHARMACY · DISPENSARY'], tuina: ['推拿傷科治療室', 'TUINA · MANUAL THERAPY'],
    'decoction-lab': ['中藥品管實驗室', 'HERBAL QC LABORATORY'], cssd: ['消毒供應中心 · 管制區', 'CSSD · RESTRICTED'], 'biomed-lab': ['生醫工程實驗室', 'BIOMEDICAL ENGINEERING LAB'] };
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
  function equipment(id, api, K, ctx, opt) {
    opt = opt || {}; const g = new THREE.Group(); const d = api.c.department || ''; const room = api.roomType; const k = makeKit(K); let name = null, equip = id, info = null, screens = [];
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
        if (room === 'ward' || room === 'clinic' || room === 'icu') { k.rbox(0.6, 0.03, 0.42, 0.01, 0, 0.92, 0, '#cfd6da', 'satin'); k.rbox(0.6, 0.03, 0.42, 0.01, 0, 0.45, 0, '#cfd6da', 'satin'); [[-0.28, -0.19], [0.28, -0.19], [-0.28, 0.19], [0.28, 0.19]].forEach(([x, z]) => k.cyl(0.012, 0.012, 0.9, x, 0.47, z, STEEL2, 'satin', 0, 0, 0, 8)); castors(k, [[-0.28, -0.19], [0.28, -0.19], [-0.28, 0.19], [0.28, 0.19]], 0.03); k.box(0.58, 0.01, 0.4, 0, 0.94, 0, '#6aa0c8', 'cloth'); place(k, 'forceps', -0.2, 0.945, -0.1, 0); place(k, 'mayo', -0.2, 0.945, 0.0, 0); place(k, 'sponges', 0.08, 0.945, -0.08, 0, 4); place(k, 'bowl', 0.18, 0.945, 0.1, 0, 0.06); name = say('換藥車', 'Dressing trolley'); break; }
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
      case 'door': { k.rbox(2.3, 2.45, 0.14, 0.02, 0, 1.225, -0.02, '#b8c4c8', 'satin'); [-0.52, 0.52].forEach(x => { k.rbox(1.0, 2.2, 0.06, 0.02, x, 1.12, 0.04, '#dfe6e9', 'paint'); k.box(0.42, 0.5, 0.065, x, 1.6, 0.042, '#9fd3e8', 'glass'); k.box(0.03, 0.4, 0.04, x + (x < 0 ? 0.42 : -0.42), 1.05, 0.09, GREY, 'satin'); }); k.box(0.14, 0.14, 0.02, 1.25, 1.2, 0.08, '#2b3036', 'plastic'); k.sph(0.025, 0.025, 0.01, 1.25, 1.2, 0.09, '#2fa36b', 'glow', 10); const SG = DOOR_SIGN[room] || DOOR_SIGN.or; const sign = labelSprite(say(SG[0], SG[1]), { size: 26, bg: room === 'lab' || room === 'reading' ? 'rgba(31,88,120,.95)' : room === 'dental' || room === 'clinic' || room === 'ward' ? 'rgba(31,111,95,.95)' : 'rgba(192,57,43,.95)' }); sign.position.set(0, 2.62, 0.2); g.add(sign); name = say('門口與轉送', 'Door & transfer'); break; }
      case 'device': {
        const D = ctx.device;
        if (D === 'dentalchair') { k.rbox(0.6, 0.12, 0.9, 0.04, 0, 0.06, 0, PAINT2, 'paint'); k.cyl(0.11, 0.13, 0.36, 0, 0.3, 0.05, PAINT, 'paint', 0, 0, 0, 16); k.rbox(0.56, 0.13, 0.95, 0.05, 0, 0.55, 0.2, '#2a7a9c', 'plastic', -0.12, 0, 0); k.rbox(0.56, 0.12, 0.72, 0.05, 0, 0.88, -0.42, '#2a7a9c', 'plastic', 0.95, 0, 0); k.rbox(0.28, 0.1, 0.24, 0.04, 0, 1.18, -0.68, '#2a7a9c', 'plastic', 0.6, 0, 0); k.rbox(0.08, 0.05, 0.5, 0.02, -0.32, 0.72, 0.1, '#2a7a9c', 'plastic'); k.seg([0.45, 0.9, -0.2], [0.55, 1.95, -0.4], 0.03, 0.03, PAINT, 'paint'); k.rbox(0.36, 0.12, 0.16, 0.04, 0.4, 1.95, -0.2, PAINT, 'paint', 0, 0.3, 0.3); k.box(0.3, 0.02, 0.1, 0.4, 1.885, -0.2, '#fff4d6', 'glow', 0, 0.3, 0.3); k.lathe([[0.001, 0], [0.09, 0.0], [0.13, 0.08], [0.14, 0.1]], -0.5, 0.82, 0.05, '#f4f6f8', 'plastic', 18); k.seg([-0.4, 0.2, 0.3], [-0.55, 0.95, 0.35], 0.025, 0.025, PAINT, 'paint'); k.rbox(0.42, 0.06, 0.3, 0.02, -0.55, 0.98, 0.45, PAINT, 'paint'); for (let i = 0; i < 4; i++) k.tube([[-0.42 - i * 0.05, 1.0, 0.58], [-0.42 - i * 0.05, 0.85, 0.66], [-0.42 - i * 0.05, 0.98, 0.62]], 0.005, '#3b4a52', 'rubber', 12, 5); k.seg([0.7, 0.1, 0.4], [0.7, 1.4, 0.4], 0.025, 0.025, GREY, 'satin'); k.rbox(0.42, 0.3, 0.04, 0.02, 0.7, 1.55, 0.4, '#1d262c', 'plastic', 0, -0.6, 0); const sc = S(0.38, 0.26, screenCanvas('xray'), 0, 0, 0, 0, 'lightbox', 0.9); sc.position.set(0.7 - Math.sin(0.6) * 0.022, 1.55, 0.4 + Math.cos(0.6) * 0.022); sc.rotation.y = -0.6; name = say('牙科治療椅與診療台', 'Dental chair & delivery unit'); }
        else if (D === 'us') { usCart(k, S, 0, 0, 0); if (/obstet/.test(d)) { k.rbox(0.75, 0.08, 0.5, 0.02, 1.15, 0.92, 0, '#f4f6f8', 'paint'); [-1, 1].forEach(s => k.box(0.75, 0.12, 0.01, 1.15, 1.0, s * 0.25, '#e8f3f6', 'glass')); k.rbox(0.66, 0.05, 0.42, 0.02, 1.15, 0.97, 0, '#ffffff', 'cloth'); k.seg([1.5, 0.1, -0.2], [1.5, 2.05, -0.2], 0.03, 0.03, PAINT, 'paint'); k.rbox(0.55, 0.08, 0.32, 0.03, 1.2, 2.05, 0, PAINT, 'paint'); k.box(0.5, 0.01, 0.28, 1.2, 2.005, 0, '#ff9a3c', 'glow'); k.rbox(0.62, 0.7, 0.45, 0.03, 1.15, 0.45, 0, PAINT2, 'paint'); name = say('超音波與新生兒輻射保溫台', 'Ultrasound & neonatal radiant warmer'); } else name = /rheumat/.test(d) ? say('肌骨超音波與關節評估', 'Musculoskeletal ultrasound & joint assessment') : say('超音波機', 'Ultrasound machine'); }
        else if (D === 'airwaycart') { k.rbox(0.72, 0.95, 0.5, 0.03, 0, 0.53, 0, '#2a7a9c', 'paint'); castors(k, [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]); ['#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#3498db'].forEach((c2, i) => { k.box(0.64, 0.15, 0.015, 0, 0.18 + i * 0.17, 0.252, '#f4f6f8', 'plastic'); k.box(0.64, 0.025, 0.018, 0, 0.245 + i * 0.17, 0.258, c2, 'plastic'); }); k.rbox(0.76, 0.04, 0.54, 0.015, 0, 1.02, 0, '#cfd6da', 'satin'); k.rbox(0.13, 0.1, 0.03, 0.01, -0.2, 1.2, -0.1, '#1d262c', 'plastic'); k.seg([-0.2, 1.04, -0.1], [-0.2, 1.15, -0.1], 0.015, 0.015, '#2a3036', 'satin'); S(0.11, 0.08, screenCanvas('endo'), -0.2, 1.2, -0.084, 0, null, 1); place(k, 'laryngoscope', 0.0, 1.04, 0.1, 0.4); place(k, 'ett', 0.1, 1.04, -0.15, 0.3); place(k, 'ett', 0.12, 1.04, -0.08, 0.3, 0.8); place(k, 'lma', -0.3, 1.04, 0.12, 0.1); k.cyl(0.05, 0.05, 0.6, 0.42, 0.45, -0.15, '#f4f6f8', 'paint', 0, 0, 0, 12); name = say('困難氣道車與影像喉頭鏡', 'Difficult-airway cart & video laryngoscope'); }
        else if (D === 'resus') { resusCart(k, S, ctx); name = /critical/.test(d) ? say('重症監測與復甦車', 'Critical-care monitoring & resuscitation cart') : say('急診復甦車與除顫器', 'Resuscitation cart & defibrillator'); }
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
      // ---------------- v4.0 rooms: ICU
      case 'ventilator': { k.rbox(0.56, 0.1, 0.56, 0.03, 0, 0.08, 0, PAINT2, 'paint'); castors(k, [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]], 0.04); k.rbox(0.5, 0.62, 0.44, 0.03, 0, 0.45, 0, PAINT, 'paint');
        k.box(0.44, 0.1, 0.02, 0, 0.3, 0.225, '#dfe5e8', 'paint'); k.cyl(0.02, 0.02, 0.01, -0.15, 0.3, 0.236, '#2fa36b', 'glow', Math.PI / 2, 0, 0, 10); k.rbox(0.1, 0.5, 0.1, 0.02, 0, 1.0, -0.1, PAINT, 'paint');
        k.rbox(0.48, 0.34, 0.05, 0.02, 0, 1.3, 0.02, '#1d262c', 'plastic', -0.25, 0, 0); S(0.44, 0.3, screenCanvas('vent', { etco2: (api.vitals && api.vitals.etco2) || 36 }), 0, 1.302, 0.048, 0, null, 1).rotation.x = -0.25;
        k.rbox(0.14, 0.12, 0.12, 0.01, 0.3, 0.82, 0.1, '#e8ebed', 'paint'); k.cyl(0.05, 0.05, 0.14, 0.3, 0.95, 0.1, '#eef6f8', 'glass', 0, 0, 0, 14); k.cyl(0.046, 0.046, 0.05, 0.3, 0.9, 0.1, '#cfe8f0', 'fluid', 0, 0, 0, 12);
        k.cyl(0.03, 0.03, 0.05, -0.18, 0.78, 0.22, '#dfe5e8', 'plastic', Math.PI / 2, 0, 0, 12); k.cyl(0.03, 0.03, 0.05, -0.08, 0.78, 0.22, '#5fa8e0', 'plastic', Math.PI / 2, 0, 0, 12);
        k.seg([0.22, 1.1, -0.15], [0.22, 1.75, -0.1], 0.015, 0.015, GREY, 'satin'); k.flat([0.22, 1.75, -0.1], [0.1, 1.7, 0.9], 0.03, 0.03, GREY, 'satin');
        [[-0.05, '#5fa8e0'], [0.05, '#d8e6ee']].forEach(([o, c2]) => k.tube([[-0.13 + o * 2, 0.8, 0.22], [o, 1.3, 0.5], [0.1 + o, 1.68, 0.95], [0.15 + o, 1.5, 1.3]], 0.011, c2, 'plastic', 40, 7));
        name = say('加護呼吸器', 'ICU ventilator'); equip = 'anesthesia'; info = 'ventilator'; break; }
      case 'wallmonitor': { k.rbox(0.2, 0.3, 0.04, 0.01, 0, 1.5, 0.02, PAINT2, 'paint'); k.flat([0, 1.6, 0.04], [0.25, 1.62, 0.35], 0.05, 0.05, GREY, 'satin'); k.flat([0.25, 1.62, 0.35], [0.1, 1.6, 0.6], 0.045, 0.045, GREY, 'satin'); k.rbox(0.56, 0.4, 0.06, 0.03, 0.1, 1.75, 0.62, '#1d262c', 'plastic', 0, 0.15, 0);
        const sc = S(0.5, 0.33, ctx.monitorTex, 0, 0, 0, 0, null, 1.1); sc.position.set(0.1 + Math.sin(0.15) * 0.032, 1.75, 0.62 + Math.cos(0.15) * 0.032); sc.rotation.y = 0.15; g.userData.screen = sc; name = say('床邊生理監視器', 'Bedside monitor'); equip = 'monitor'; info = 'monitor'; break; }
      case 'curtain': { const L = opt.len || 3.2; k.box(L, 0.03, 0.04, 0, ROOM.h - 0.1, 0, '#cfd6da', 'satin'); const drawn = L * 0.55;
        for (let x = -L / 2; x < -L / 2 + drawn; x += 0.16) k.box(0.17, 2.0, 0.03, x + 0.08, 1.25, Math.sin(x * 9) * 0.03, '#bfe0e6', 'cloth'); k.box(drawn, 0.85, 0.02, -L / 2 + drawn / 2, 2.67, 0, '#dff3f6', 'glass');
        for (let i = 0; i < Math.round(L / 0.16); i++) k.tor(0.02, 0.004, -L / 2 + 0.08 + i * 0.16, ROOM.h - 0.12, 0, '#d5dadd', 'metal', 0, 0, 0, Math.PI * 2, 6);
        name = say('隔離簾', 'Isolation curtain'); equip = 'recovery'; info = 'curtain'; break; }
      case 'station': { const W = 3.0; k.rbox(W, 0.75, 0.7, 0.03, 0, 0.375, 0.1, '#dfe6e2', 'paint'); k.rbox(W + 0.1, 0.04, 0.8, 0.01, 0, 0.77, 0.1, '#6b8a7e', 'paint'); k.rbox(W, 0.35, 0.06, 0.02, 0, 0.95, -0.22, '#c9d6cf', 'paint'); k.rbox(W + 0.1, 0.04, 0.3, 0.01, 0, 1.14, -0.2, '#6b8a7e', 'paint');
        [-0.9, 0.9].forEach((x, i) => { k.rbox(0.52, 0.34, 0.04, 0.015, x, 1.05, 0.05, '#1d262c', 'plastic', -0.1, 0, 0); k.cyl(0.02, 0.02, 0.2, x, 0.85, 0.0, GREY, 'satin', 0, 0, 0, 8); k.box(0.18, 0.012, 0.12, x, 0.8, 0.05, GREY, 'satin'); S(0.48, 0.3, i ? screenCanvas('pacs') : ctx.monitorTex, x, 1.05, 0.072, 0, i ? 'pacs' : null, 1).rotation.x = -0.1; });
        k.box(0.42, 0.015, 0.14, 0, 0.79, 0.3, '#2d3436', 'plastic'); k.rbox(0.05, 0.02, 0.09, 0.01, 0.3, 0.79, 0.3, '#2d3436', 'plastic'); k.rbox(0.25, 0.03, 0.33, 0.01, -0.3, 0.795, 0.36, '#f4f6f8', 'matte'); k.rbox(0.22, 0.004, 0.3, 0.002, -0.3, 0.815, 0.36, '#2f6fd0', 'matte'); k.box(0.12, 0.18, 0.08, 1.2, 0.86, 0.3, '#2b3036', 'plastic'); k.box(0.08, 0.14, 0.02, 1.2, 0.86, 0.345, '#1d262c', 'plastic');
        chair(k, 0, 0.95, 0); name = say('護理站／中央監視', 'Nurse station & central monitoring'); equip = 'huddle'; info = 'station'; break; }
      case 'crash': { resusCart(k, S, ctx); name = say('急救車與除顫器', 'Crash cart & defibrillator'); equip = 'resus'; info = 'crash'; break; }
      // ---------------- v4.0 rooms: clinical / pathology lab
      case 'bench': { const L = opt.len || 3.6, D2 = 0.8; k.rbox(L, 0.86, D2 - 0.06, 0.02, 0, 0.43, 0, '#e7ebe6', 'paint');
        for (let x = -L / 2 + 0.3; x < L / 2 - 0.2; x += 0.6) { [1, -1].forEach(s => { k.box(0.54, 0.78, 0.012, x, 0.43, s * (D2 / 2 - 0.03), '#dde3de', 'paint'); k.box(0.16, 0.018, 0.02, x, 0.6, s * (D2 / 2 - 0.02), GREY, 'satin'); }); }
        k.rbox(L + 0.06, 0.04, D2 + 0.04, 0.01, 0, 0.88, 0, '#2b3036', 'plastic'); k.rbox(0.12, 0.35, 0.12, 0.01, -L / 2 + 0.25, 1.07, 0, '#dfe5e8', 'paint'); [0.07, -0.07].forEach(z => k.cyl(0.02, 0.02, 0.02, -L / 2 + 0.25, 1.2, z, '#2b3036', 'plastic', Math.PI / 2, 0, 0, 8));
        k.box(L * 0.6, 0.025, 0.25, 0.3, 1.4, 0, '#dfe5e8', 'paint'); [-0.6, 0.6].forEach(x => k.box(0.03, 0.5, 0.25, 0.3 + x * L * 0.5, 1.15, 0, '#dfe5e8', 'paint'));
        ['#8e44ad', '#2a7a9c', '#b03a3a', '#f1c40f', '#2ecc71', '#e67e22'].forEach((c2, i) => { const x = -0.6 + i * 0.24; k.cyl(0.04, 0.04, 0.14, x, 1.485, 0.02, '#f2f6f8', 'glass', 0, 0, 0, 10); k.cyl(0.035, 0.035, 0.08, x, 1.46, 0.02, c2, 'fluid', 0, 0, 0, 10); k.cyl(0.02, 0.02, 0.03, x, 1.57, 0.02, '#2b3036', 'plastic', 0, 0, 0, 8); });
        if (opt.kind === 'work') {
          k.rbox(0.26, 0.06, 0.12, 0.01, -0.9, 0.93, 0.15, '#5fa8e0', 'plastic'); for (let i = 0; i < 6; i++) { k.cyl(0.008, 0.008, 0.1, -1.0 + i * 0.04, 1.0, 0.15, '#f2f6f8', 'glass', 0, 0, 0, 8); k.cyl(0.0095, 0.0095, 0.015, -1.0 + i * 0.04, 1.055, 0.15, ['#b03a3a', '#8e44ad', '#2a7a9c', '#2ecc71', '#f1c40f', '#7f8c8d'][i], 'plastic', 0, 0, 0, 8); }
          k.rbox(0.14, 0.08, 0.14, 0.02, -0.4, 0.94, 0.2, '#2d3436', 'plastic'); k.cyl(0.05, 0.05, 0.02, -0.4, 0.99, 0.2, '#7f8c8d', 'rubber', 0, 0, 0, 14); k.rbox(0.34, 0.22, 0.26, 0.02, 0.2, 1.01, -0.1, '#dfe5e8', 'paint'); k.box(0.3, 0.02, 0.22, 0.2, 1.12, -0.1, '#9fd3e8', 'glass');
          k.rbox(0.1, 0.03, 0.2, 0.005, 0.75, 0.915, 0.2, '#f4f6f8', 'plastic'); [0, 1, 2].forEach(i => k.cyl(0.012, 0.014, 0.26, 0.73 + i * 0.03, 1.06, 0.2, ['#2f6fd0', '#f1c40f', '#e74c3c'][i], 'plastic', 0, 0, 0, 8));
        } else {
          [-1.0, 0.0].forEach(x => { k.flat([x + 0.2, 0.9, -0.25], [x + 0.2, 1.2, -0.3], 0.03, 0.03, GREY, 'satin'); k.flat([x + 0.2, 1.2, -0.3], [x + 0.1, 1.45, 0.0], 0.025, 0.025, GREY, 'satin'); k.lathe([[0.001, 0], [0.07, 0], [0.08, 0.05], [0.04, 0.09]], x + 0.1, 1.42, 0.02, '#2b3036', 'plastic', 14); k.disc(0.045, x + 0.1, 1.415, 0.02, '#fff4d6', 'glow', Math.PI / 2, 0, 0, 16); });
          [-1.0, 0.0].forEach(x => { k.cyl(0.2, 0.2, 0.02, x, 0.02, 0.75, '#2b3036', 'plastic', 0, 0, 0, 5); k.cyl(0.02, 0.02, 0.6, x, 0.32, 0.75, GREY, 'satin', 0, 0, 0, 8); k.cyl(0.17, 0.17, 0.06, x, 0.65, 0.75, '#3b5063', 'cloth', 0, 0, 0, 18); });
        }
        name = opt.kind === 'work' ? say('檢驗工作台', 'Working bench') : say('顯微鏡工作台', 'Microscopy bench'); equip = 'lab'; info = 'bench'; break; }
      case 'labscope': { const y0 = opt.y == null ? 0.9 : opt.y; k.rbox(0.18, 0.03, 0.26, 0.01, 0, y0 + 0.015, 0, '#2d3436', 'paint'); k.seg([0, y0 + 0.03, -0.1], [0, y0 + 0.3, -0.08], 0.03, 0.025, '#2d3436', 'paint'); k.flat([0, y0 + 0.3, -0.08], [0, y0 + 0.36, 0.04], 0.04, 0.04, '#2d3436', 'paint');
        k.box(0.14, 0.01, 0.12, 0, y0 + 0.18, 0, '#cfd6da', 'satin'); k.box(0.075, 0.002, 0.025, 0, y0 + 0.187, 0, '#f5f8fa', 'glass'); k.cyl(0.035, 0.035, 0.04, 0, y0 + 0.26, 0, '#2d3436', 'paint', 0, 0, 0, 12); [0, 1, 2, 3].forEach(i => { const a = i / 4 * Math.PI * 2; k.cyl(0.008, 0.006, 0.05, Math.sin(a) * 0.025, y0 + 0.225, Math.cos(a) * 0.025, '#b8c1c6', 'metal', 0, 0, 0, 8); });
        [-0.03, 0.03].forEach(x => k.cyl(0.011, 0.011, 0.09, x, y0 + 0.44, 0.1, '#1b1f22', 'plastic', -0.6, 0, 0, 10)); k.disc(0.03, 0, y0 + 0.17, 0, '#fffbe6', 'glow', -Math.PI / 2, 0, 0, 16); [0.09, -0.09].forEach(x => k.cyl(0.02, 0.02, 0.02, x, y0 + 0.2, -0.05, '#2d3436', 'plastic', 0, 0, Math.PI / 2, 10));
        name = say('光學顯微鏡', 'Light microscope'); equip = 'microscope'; info = 'labscope'; break; }
      case 'centrifuge': { const y0 = opt.y == null ? 0.9 : opt.y; k.rbox(0.46, 0.3, 0.46, 0.04, 0, y0 + 0.15, 0, '#dfe5e8', 'paint'); k.cyl(0.19, 0.19, 0.03, 0, y0 + 0.315, 0, '#9fd3e8', 'glass', 0, 0, 0, 24); k.tor(0.19, 0.012, 0, y0 + 0.3, 0, '#cfd6da', 'satin', Math.PI / 2, 0, 0, Math.PI * 2, 16); k.box(0.3, 0.06, 0.04, 0, y0 + 0.12, 0.23, '#1d262c', 'plastic'); k.box(0.1, 0.02, 0.01, -0.08, y0 + 0.12, 0.252, '#4dff8f', 'glow'); k.cyl(0.015, 0.015, 0.01, 0.08, y0 + 0.12, 0.25, '#2b3036', 'plastic', Math.PI / 2, 0, 0, 8); name = say('離心機', 'Centrifuge'); equip = 'lab'; info = 'centrifuge'; break; }
      case 'analyser': { k.rbox(1.6, 0.9, 0.8, 0.03, 0, 0.45, 0, '#eef1f2', 'paint'); k.rbox(1.62, 0.5, 0.82, 0.03, 0, 1.15, 0, '#f4f6f8', 'paint'); k.box(1.4, 0.36, 0.02, 0, 1.15, 0.41, '#9fd3e8', 'glass');
        k.rbox(0.5, 0.1, 0.3, 0.02, -0.4, 0.95, 0.2, '#2b3036', 'plastic'); for (let i = 0; i < 10; i++) k.cyl(0.011, 0.011, 0.09, -0.6 + i * 0.045, 1.02, 0.2, '#f2f6f8', 'glass', 0, 0, 0, 8); k.rbox(0.24, 0.18, 0.24, 0.02, 0.45, 1.0, 0.1, '#dfe5e8', 'paint'); k.cyl(0.06, 0.06, 0.1, 0.45, 1.14, 0.1, '#cfd6da', 'satin', 0, 0, 0, 16);
        k.seg([0.6, 1.4, -0.2], [0.6, 1.7, -0.2], 0.02, 0.02, GREY, 'satin'); k.rbox(0.5, 0.34, 0.05, 0.02, 0.6, 1.85, -0.2, '#1d262c', 'plastic'); S(0.46, 0.3, screenCanvas('info', { title: say('生化／血液分析 · 品管通過', 'Chemistry / haematology · QC passed') }), 0.6, 1.85, -0.172, 0, null, 0.9);
        k.rbox(0.28, 0.14, 0.2, 0.02, -0.5, 1.47, -0.1, '#f4f6f8', 'paint'); k.box(0.1, 0.04, 0.01, -0.5, 1.5, 0.005, '#2fa36b', 'glow'); for (let i = 0; i < 3; i++) k.box(0.44, 0.26, 0.012, -0.55 + i * 0.5, 0.4, 0.405, '#dde3de', 'paint');
        name = say('自動分析儀', 'Automated analyser'); equip = 'lab'; info = 'analyser'; break; }
      case 'hood': { k.rbox(1.3, 0.72, 0.7, 0.02, 0, 0.36, 0, '#dfe5e8', 'paint'); [-0.5, 0.5].forEach(x => k.box(0.06, 0.7, 0.6, x, 0.35, 0, '#cfd6da', 'satin')); k.rbox(1.3, 0.03, 0.72, 0.01, 0, 0.735, 0, '#c9d0d3', 'metal');
        k.box(1.3, 1.5, 0.04, 0, 1.5, -0.34, '#eef1f2', 'paint'); [-0.625, 0.625].forEach(x => k.box(0.05, 1.5, 0.72, x, 1.5, 0, '#eef1f2', 'paint')); k.box(1.3, 0.3, 0.72, 0, 2.1, 0, '#eef1f2', 'paint'); k.box(1.3, 0.6, 0.05, 0, 1.65, 0.34, '#eef1f2', 'paint');
        k.box(1.18, 0.62, 0.02, 0, 1.05, 0.36, '#bfe0f0', 'glass'); k.box(1.18, 0.03, 0.04, 0, 1.37, 0.37, '#9aa5aa', 'satin'); k.box(1.1, 0.03, 0.4, 0, 1.94, -0.05, '#ffffff', 'glow'); k.box(0.3, 0.05, 0.01, 0, 1.6, 0.37, '#4dff8f', 'glow');
        k.cyl(0.015, 0.015, 0.1, -0.45, 0.8, 0.1, '#f2f6f8', 'glass', 0, 0, 0, 8); k.rbox(0.15, 0.06, 0.15, 0.01, 0.3, 0.78, 0, '#5fa8e0', 'plastic'); k.rbox(0.06, 0.14, 0.06, 0.01, 0.1, 0.82, -0.1, '#f4f6f8', 'plastic'); k.rbox(0.5, 0.3, 0.5, 0.03, 0, 2.4, -0.1, '#dfe5e8', 'paint'); k.cyl(0.08, 0.08, 0.3, 0, 2.8, -0.1, GREY, 'satin', 0, 0, 0, 14);
        name = say('生物安全櫃', 'Biosafety cabinet'); equip = 'lab'; info = 'hood'; break; }
      case 'wallbench': { const L = opt.len || 6.2; k.rbox(L, 0.86, 0.64, 0.02, 0, 0.43, 0, '#e7ebe6', 'paint'); for (let x = -L / 2 + 0.3; x < L / 2 - 0.2; x += 0.6) { k.box(0.54, 0.78, 0.012, x, 0.43, 0.33, '#dde3de', 'paint'); k.box(0.16, 0.018, 0.02, x, 0.6, 0.345, GREY, 'satin'); } k.rbox(L + 0.04, 0.04, 0.68, 0.01, 0, 0.88, 0, '#2b3036', 'plastic'); k.box(L, 0.3, 0.03, 0, 1.03, -0.3, '#dfe5e8', 'paint');
        const sx = opt.stainX == null ? 1.2 : opt.stainX; ['#5b2c83', '#c0392b', '#2a7a9c', '#f1c40f', '#2ecc71', '#2b3036', '#8e44ad', '#95a5a6'].forEach((c2, i) => { const x = sx - 0.42 + i * 0.12; k.box(0.1, 0.1, 0.07, x, 0.95, -0.1, '#eef6f8', 'glass'); k.box(0.09, 0.07, 0.06, x, 0.935, -0.1, c2, 'fluid'); k.box(0.1, 0.01, 0.07, x, 1.005, -0.1, '#2b3036', 'plastic'); });
        k.rbox(0.3, 0.04, 0.12, 0.01, sx + 0.2, 0.92, 0.12, '#cfd6da', 'metal'); for (let i = 0; i < 8; i++) k.box(0.002, 0.05, 0.025, sx + 0.08 + i * 0.03, 0.95, 0.12, '#f5f8fa', 'glass');
        k.rbox(0.36, 0.22, 0.3, 0.02, sx - 1.2, 1.01, 0, '#f4f6f8', 'paint'); k.box(0.3, 0.015, 0.24, sx - 1.2, 1.125, 0, '#dfe5e8', 'paint'); k.box(0.06, 0.02, 0.01, sx - 1.2, 1.04, 0.152, '#e67e22', 'glow');
        k.rbox(0.5, 0.3, 0.4, 0.02, sx + 1.3, 1.05, -0.05, '#dfe5e8', 'paint'); k.box(0.3, 0.1, 0.01, sx + 1.3, 1.08, 0.152, '#1d262c', 'plastic'); k.box(0.2, 0.03, 0.005, sx + 1.3, 1.08, 0.156, '#4dff8f', 'glow');
        name = say('染色與處理工作台', 'Staining & processing bench'); equip = 'lab'; info = 'wallbench'; break; }
      case 'fridge': { k.box(0.7, 1.9, 0.04, 0, 0.95, -0.33, '#eef1f2', 'paint'); [-0.33, 0.33].forEach(x => k.box(0.04, 1.9, 0.7, x, 0.95, 0, '#eef1f2', 'paint')); k.box(0.7, 0.3, 0.7, 0, 0.15, 0, '#eef1f2', 'paint'); k.box(0.7, 0.2, 0.7, 0, 1.8, 0, '#eef1f2', 'paint');
        k.box(0.62, 1.4, 0.02, 0, 1.0, 0.35, '#bfe0f0', 'glass'); for (let i = 0; i < 4; i++) { k.box(0.6, 0.015, 0.5, 0, 0.45 + i * 0.38, 0.05, '#cfd6da', 'satin'); for (let j = 0; j < 5; j++) k.rbox(0.07, 0.1, 0.06, 0.01, -0.2 + j * 0.1, 0.51 + i * 0.38, 0.1, ['#e74c3c', '#f4f6f8', '#f1c40f', '#5fa8e0', '#e74c3c'][j], 'plastic'); }
        k.box(0.04, 0.5, 0.04, 0.3, 1.1, 0.37, '#9aa5aa', 'satin'); k.box(0.2, 0.08, 0.02, -0.15, 1.78, 0.35, '#1d262c', 'plastic'); k.box(0.1, 0.03, 0.005, -0.15, 1.78, 0.362, '#4dff8f', 'glow'); name = say('試劑／血品冰箱', 'Reagent & blood fridge'); equip = 'cart'; info = 'fridge'; break; }
      case 'recdesk': { k.rbox(1.6, 0.9, 0.7, 0.02, 0, 0.45, 0, '#dfe6e2', 'paint'); k.rbox(1.66, 0.04, 0.76, 0.01, 0, 0.92, 0, '#6b8a7e', 'paint'); k.rbox(1.6, 0.2, 0.06, 0.02, 0, 1.04, 0.33, '#c9d6cf', 'paint'); k.rbox(1.66, 0.04, 0.3, 0.01, 0, 1.15, 0.32, '#6b8a7e', 'paint');
        k.rbox(0.46, 0.3, 0.04, 0.015, -0.4, 1.1, -0.1, '#1d262c', 'plastic', 0, Math.PI, 0); k.cyl(0.02, 0.02, 0.16, -0.4, 1.0, -0.1, GREY, 'satin', 0, 0, 0, 8); S(0.42, 0.27, screenCanvas('chart', { patient: say('檢體簽收：條碼・姓名・採檢時間・容器', 'Specimen reception: barcode · name · time taken · container') }), -0.4, 1.1, -0.122, Math.PI, null, 0.9); k.box(0.36, 0.012, 0.12, -0.4, 0.945, -0.4, '#2d3436', 'plastic');
        k.rbox(0.26, 0.16, 0.22, 0.02, 0.2, 1.02, -0.15, '#f4f6f8', 'paint'); k.box(0.2, 0.01, 0.02, 0.2, 1.1, -0.03, '#2b3036', 'plastic'); k.rbox(0.4, 0.3, 0.3, 0.01, 0.6, 1.08, -0.1, '#cfd6da', 'metal'); for (let i = 0; i < 3; i++) k.box(0.1, 0.16, 0.02, 0.5 + i * 0.1, 1.1, 0, '#f4f6f8', 'glass');
        k.cyl(0.03, 0.03, 0.015, 0.3, 0.95, 0.2, '#d9b25c', 'gold', 0, 0, 0, 12); k.sph(0.025, 0.015, 0.025, 0.3, 0.97, 0.2, '#d9b25c', 'gold', 10); name = say('檢體收件櫃台', 'Specimen reception'); equip = 'specimen'; info = 'recdesk'; break; }
      case 'workstation': { const y = opt.desk ? 0.76 : (opt.y == null ? 0 : opt.y); if (opt.desk) { k.rbox(1.6, 0.04, 0.8, 0.01, 0, 0.74, 0, '#dfe6e2', 'paint'); [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]].forEach(([x, z]) => k.box(0.05, 0.72, 0.05, x, 0.36, z, GREY, 'satin')); }
        [-0.3, 0.3].forEach(x => { k.rbox(0.56, 0.36, 0.04, 0.015, x, y + 0.4, -0.15, '#1d262c', 'plastic', -0.08, 0, 0); k.cyl(0.02, 0.02, 0.18, x, y + 0.12, -0.17, GREY, 'satin', 0, 0, 0, 8); k.box(0.2, 0.012, 0.14, x, y + 0.02, -0.17, GREY, 'satin'); });
        S(0.52, 0.32, screenCanvas(opt.left || 'pacs'), -0.3, y + 0.4, -0.126, 0, opt.leftKind === undefined ? 'pacs' : opt.leftKind, 0.95).rotation.x = -0.08; S(0.52, 0.32, screenCanvas(opt.right || 'chart', { patient: opt.text || say('工作清單・結果查詢・報告', 'Worklist · results · reports') }), 0.3, y + 0.4, -0.126, 0, opt.rightKind || null, 0.9).rotation.x = -0.08;
        k.box(0.44, 0.015, 0.14, 0, y + 0.012, 0.12, '#2d3436', 'plastic'); k.rbox(0.05, 0.02, 0.09, 0.01, 0.35, y + 0.012, 0.14, '#2d3436', 'plastic'); k.rbox(0.18, 0.4, 0.42, 0.01, 0.7, y + 0.2, -0.05, '#2d3436', 'plastic');
        if (opt.chair !== false) chair(k, 0, 0.75, 0); name = opt.name || say('電腦工作站', 'Computer workstation'); equip = opt.equip || 'imaging'; info = 'workstation'; break; }
      // ---------------- v4.0 rooms: radiology reading room
      case 'readdesk': { k.rbox(2.0, 0.05, 0.9, 0.01, 0, 0.74, 0, '#3a3f47', 'paint'); [-0.7, 0.7].forEach(x => k.rbox(0.5, 0.7, 0.8, 0.02, x, 0.36, 0, '#2e333a', 'paint')); k.box(0.04, 0.3, 0.8, 0, 0.59, 0, '#2e333a', 'paint');
        [-0.55, 0.0].forEach(x => { k.rbox(0.42, 0.56, 0.04, 0.012, x, 1.2, -0.3, '#111518', 'plastic'); k.cyl(0.02, 0.02, 0.18, x, 0.84, -0.32, GREY, 'satin', 0, 0, 0, 8); k.box(0.22, 0.012, 0.14, x, 0.76, -0.32, GREY, 'satin'); S(0.38, 0.52, screenCanvas('pacs'), x, 1.2, -0.277, 0, 'pacs', 1.0); });
        k.rbox(0.62, 0.38, 0.04, 0.012, 0.72, 1.1, -0.3, '#111518', 'plastic', 0, -0.25, 0); const w = S(0.58, 0.34, screenCanvas('chart', { patient: say('放射報告系統（RIS）・待報告清單・優先：急診', 'RIS worklist · reports pending · priority: ED') }), 0, 0, 0, 0, 'display', 0.85); w.position.set(0.72 + Math.sin(-0.25) * 0.022, 1.1, -0.3 + Math.cos(-0.25) * 0.022); w.rotation.y = -0.25; k.cyl(0.02, 0.02, 0.14, 0.72, 0.84, -0.32, GREY, 'satin', 0, 0, 0, 8);
        k.box(0.46, 0.015, 0.15, -0.25, 0.775, 0.15, '#1d2126', 'plastic'); k.rbox(0.06, 0.02, 0.1, 0.01, 0.1, 0.775, 0.18, '#1d2126', 'plastic'); k.cyl(0.03, 0.03, 0.015, 0.35, 0.77, 0.2, '#2b3036', 'plastic', 0, 0, 0, 12); k.seg([0.35, 0.78, 0.2], [0.33, 0.95, 0.14], 0.008, 0.008, '#9aa5aa', 'satin'); k.sph(0.02, 0.03, 0.02, 0.33, 0.97, 0.13, '#2b3036', 'plastic', 10);
        k.cyl(0.08, 0.08, 0.015, 0.85, 0.77, 0.25, '#2b3036', 'plastic', 0, 0, 0, 12); k.seg([0.85, 0.78, 0.25], [0.75, 1.2, 0.1], 0.01, 0.01, '#555b63', 'satin'); k.lathe([[0.001, 0], [0.06, 0], [0.07, 0.04], [0.035, 0.08]], 0.72, 1.2, 0.08, '#2b3036', 'plastic', 14); k.disc(0.04, 0.72, 1.195, 0.08, '#ffd9a8', 'glow', Math.PI / 2, 0, 0, 14);
        chair(k, 0, 0.75, 0, '#2f3b48'); name = say('放射判讀工作站', 'Radiology reading workstation'); equip = 'imaging'; info = 'readdesk'; break; }
      // ---------------- v4.0 rooms: dental operatory
      case 'cabinets': { const L = opt.len || 4.0, ax = opt.autoclaveX == null ? 0.8 : opt.autoclaveX; k.rbox(L, 0.88, 0.6, 0.02, 0, 0.44, 0, '#f1f3f1', 'paint'); for (let x = -L / 2 + 0.3; x < L / 2 - 0.2; x += 0.6) { k.box(0.54, 0.78, 0.012, x, 0.44, 0.302, '#e4eae7', 'paint'); k.box(0.2, 0.015, 0.02, x, 0.6, 0.315, '#9aa5aa', 'satin'); } k.rbox(L + 0.04, 0.04, 0.64, 0.01, 0, 0.9, 0, '#bfd3cc', 'paint');
        k.rbox(L, 0.7, 0.36, 0.02, 0, 1.85, -0.12, '#f1f3f1', 'paint'); for (let x = -L / 2 + 0.3; x < L / 2 - 0.2; x += 0.6) { k.box(0.54, 0.62, 0.012, x, 1.85, 0.062, '#e4eae7', 'paint'); k.box(0.2, 0.015, 0.02, x, 1.58, 0.075, '#9aa5aa', 'satin'); } k.box(L, 0.03, 0.3, 0, 2.21, -0.1, '#dde3de', 'paint'); k.box(L * 0.8, 0.02, 0.14, 0, 1.49, 0.02, '#ffffff', 'glow');
        k.rbox(0.5, 0.4, 0.5, 0.03, ax, 1.12, -0.02, '#eef1f2', 'paint'); k.cyl(0.13, 0.13, 0.03, ax, 1.12, 0.24, '#cfd6da', 'satin', Math.PI / 2, 0, 0, 20); k.box(0.16, 0.06, 0.01, ax, 1.28, 0.245, '#1d262c', 'plastic'); k.box(0.1, 0.02, 0.005, ax, 1.28, 0.249, '#4dff8f', 'glow');
        [-1.4, -1.2, -1.0].forEach((x, i) => k.rbox(0.13, 0.1, 0.25, 0.01, x, 0.97, 0, ['#5fa8e0', '#9b59b6', '#2ecc71'][i], 'plastic')); [-0.6, -0.45, -0.3].forEach(x => { k.cyl(0.05, 0.05, 0.14, x, 0.99, 0.05, '#eef6f8', 'glass', 0, 0, 0, 12); k.cyl(0.045, 0.045, 0.08, x, 0.97, 0.05, '#f4f6f8', 'cloth', 0, 0, 0, 10); }); k.rbox(0.4, 0.03, 0.28, 0.01, 0.1, 0.935, 0.05, '#cfd6da', 'metal'); for (let i = 0; i < 4; i++) k.box(0.36, 0.004, 0.05, 0.1, 0.955, -0.05 + i * 0.06, '#eef6f8', 'glass');
        name = say('診間櫥櫃與消毒鍋', 'Cabinetry & autoclave'); equip = 'cart'; info = 'cabinets'; break; }
      case 'xrayarm': { k.rbox(0.3, 0.5, 0.08, 0.02, 0, 1.5, 0.04, PAINT2, 'paint'); k.box(0.16, 0.1, 0.02, 0, 1.3, 0.09, '#1d262c', 'plastic'); k.box(0.1, 0.03, 0.005, 0, 1.3, 0.102, '#f1c40f', 'glow');
        const A = [0, 1.62, 0.08], B = [0.2, 1.78, 0.7], C = [0.9, 1.9, 1.3], D = [1.3, 1.66, 1.5]; k.seg(A, B, 0.03, 0.03, PAINT, 'paint'); k.seg(B, C, 0.03, 0.03, PAINT, 'paint'); k.seg(C, D, 0.025, 0.025, PAINT, 'paint'); k.sph(0.045, 0.045, 0.045, B[0], B[1], B[2], PAINT2, 'paint', 10); k.sph(0.045, 0.045, 0.045, C[0], C[1], C[2], PAINT2, 'paint', 10);
        k.rbox(0.22, 0.16, 0.3, 0.03, D[0], D[1], D[2], '#eef1f2', 'paint'); k.cyl(0.055, 0.055, 0.22, D[0], D[1] - 0.02, D[2] + 0.26, '#cfd6da', 'satin', Math.PI / 2, 0, 0, 16); k.cyl(0.05, 0.05, 0.01, D[0], D[1] - 0.02, D[2] + 0.375, '#2b3036', 'plastic', Math.PI / 2, 0, 0, 16);
        name = say('口內 X 光機', 'Intraoral X-ray unit'); equip = 'carm'; info = 'xrayarm'; break; }
      case 'dentaltray': { k.rbox(0.5, 0.05, 0.4, 0.01, 0, 0.1, 0, '#dfe5e8', 'paint'); castors(k, [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]], 0.03); k.cyl(0.02, 0.02, 0.75, -0.18, 0.5, -0.1, '#cfd6da', 'metal', 0, 0, 0, 10); k.rbox(0.56, 0.025, 0.42, 0.008, 0, 0.88, 0, '#c9d0d3', 'metal'); k.rbox(0.5, 0.012, 0.36, 0.005, 0, 0.9, 0, '#eaf2f5', 'cloth');
        const Y = 0.906; ['mirror', 'explorer', 'extraction', 'elevator', 'elevator', 'syringe'].forEach((it, i) => place(k, it, -0.2 + i * 0.07, Y, -0.12, Math.PI / 2)); place(k, 'sponges', 0.17, Y, 0.1, 0, 3); k.rbox(0.12, 0.04, 0.08, 0.01, -0.15, Y + 0.02, 0.1, '#f4f6f8', 'plastic'); k.cyl(0.01, 0.01, 0.04, -0.15, Y + 0.06, 0.1, '#5fa8e0', 'plastic', 0, 0, 0, 8);
        name = say('牙科器械托盤車', 'Dental instrument cart'); equip = 'tray'; info = 'dentaltray'; break; }
      case 'standmonitor': { k.cyl(0.26, 0.26, 0.03, 0, 0.03, 0, '#55606a', 'satin', 0, 0, 0, 5); castors(k, [[0.24, 0], [-0.18, 0.16], [-0.18, -0.16]], 0.025); k.cyl(0.02, 0.02, 1.2, 0, 0.63, 0, GREY, 'satin', 0, 0, 0, 10); k.rbox(0.44, 0.32, 0.06, 0.02, 0, 1.4, 0.02, '#1d262c', 'plastic'); g.userData.screen = S(0.4, 0.27, ctx.monitorTex, 0, 1.4, 0.052, 0, null, 1.1); k.box(0.08, 0.14, 0.08, 0.26, 1.25, 0, '#2b3036', 'plastic'); k.tube([[0.26, 1.2, 0], [0.3, 0.9, 0.2], [0.2, 0.6, 0.5]], 0.004, '#7f8c8d', 'rubber', 16); name = say('移動式生理監視器', 'Mobile vital-signs monitor'); equip = 'monitor'; info = 'monitor'; break; }
      case 'dentallab': { k.rbox(1.6, 0.88, 0.6, 0.02, 0, 0.44, 0, '#f1f3f1', 'paint'); k.rbox(1.64, 0.04, 0.64, 0.01, 0, 0.9, 0, '#bfd3cc', 'paint'); for (let x = -0.5; x <= 0.5; x += 0.5) { k.box(0.44, 0.78, 0.012, x, 0.44, 0.302, '#e4eae7', 'paint'); k.box(0.16, 0.015, 0.02, x, 0.6, 0.315, '#9aa5aa', 'satin'); }
        [-0.55, -0.35].forEach((x, i) => { k.lathe([[0.001, 0], [0.07, 0], [0.075, 0.02], [0.05, 0.05], [0.001, 0.05]], x, 0.92, i ? 0.1 : -0.1, '#f6f1e6', 'matte', 16); k.tor(0.045, 0.012, x, 0.97, i ? 0.1 : -0.1, '#f6f1e6', 'matte', Math.PI / 2, 0, 0, Math.PI * 2, 10); });
        k.box(0.14, 0.02, 0.1, 0, 0.93, 0, '#9aa5aa', 'satin'); k.box(0.02, 0.1, 0.02, -0.06, 0.99, -0.04, '#9aa5aa', 'satin'); k.box(0.14, 0.02, 0.1, 0, 1.05, 0, '#9aa5aa', 'satin', 0.3, 0, 0); k.lathe([[0.001, 0], [0.05, 0], [0.045, 0.03], [0.001, 0.03]], 0, 0.95, 0, '#f6f1e6', 'matte', 12);
        k.rbox(0.36, 0.3, 0.3, 0.03, 0.55, 1.07, -0.05, '#dfe5e8', 'paint'); k.cyl(0.12, 0.12, 0.02, 0.55, 1.1, 0.11, '#9aa5aa', 'satin', Math.PI / 2, 0, 0, 20); k.box(0.1, 0.03, 0.005, 0.45, 1.2, 0.102, '#e74c3c', 'glow'); k.rbox(0.3, 0.25, 0.25, 0.02, 0, 1.6, -0.15, '#f1f3f1', 'paint'); k.box(0.26, 0.2, 0.012, 0, 1.6, -0.02, '#9fd3e8', 'glass');
        name = say('牙技工作台（模型與咬合器）', 'Dental lab bench (casts & articulator)'); equip = 'lab'; info = 'dentallab'; break; }
      case 'tallcab': { k.rbox(0.9, 2.1, 0.5, 0.02, 0, 1.05, 0, '#f1f3f1', 'paint'); [-0.22, 0.22].forEach(x => { k.box(0.42, 2.0, 0.012, x, 1.05, 0.252, '#e4eae7', 'paint'); k.box(0.02, 0.2, 0.02, x + (x < 0 ? 0.17 : -0.17), 1.05, 0.265, '#9aa5aa', 'satin'); }); k.box(0.3, 0.4, 0.02, 0, 1.6, 0.262, '#9fd3e8', 'glass'); k.box(0.86, 0.03, 0.46, 0, 2.12, 0, '#dde3de', 'paint'); name = say('耗材與防護裝備櫃', 'Supplies & PPE cabinet'); equip = 'cart'; info = 'tallcab'; break; }
      case 'armchair': { k.rbox(0.7, 0.12, 0.7, 0.04, 0, 0.42, 0, '#6b8a7e', 'cloth'); k.rbox(0.7, 0.45, 0.14, 0.05, 0, 0.7, -0.3, '#6b8a7e', 'cloth', -0.15, 0, 0); [-0.32, 0.32].forEach(x => k.rbox(0.1, 0.3, 0.6, 0.04, x, 0.58, -0.02, '#5a7a6e', 'cloth')); k.rbox(0.68, 0.3, 0.66, 0.02, 0, 0.2, 0, '#c9b89a', 'paint'); k.rbox(0.3, 0.03, 0.3, 0.01, 0.6, 0.5, 0.1, '#c9b89a', 'paint'); k.cyl(0.02, 0.02, 0.5, 0.6, 0.25, 0.1, GREY, 'satin', 0, 0, 0, 8); k.box(0.16, 0.22, 0.01, 0.6, 0.63, 0.1, '#eef1f2', 'matte'); name = say('候診／休息椅', 'Waiting & recovery chair'); equip = 'recovery'; info = 'armchair'; break; }
      case 'stools': { [[0, 0], [0.9, 0.3]].forEach(([x, z]) => { k.cyl(0.26, 0.26, 0.03, x, 0.03, z, '#2b3036', 'plastic', 0, 0, 0, 5); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; k.flat([x, 0.05, z], [x + Math.cos(a) * 0.26, 0.04, z + Math.sin(a) * 0.26], 0.04, 0.03, '#2b3036', 'plastic'); } k.cyl(0.02, 0.02, 0.4, x, 0.25, z, GREY, 'satin', 0, 0, 0, 10); k.tor(0.17, 0.01, x, 0.2, z, GREY, 'satin', Math.PI / 2, 0, 0, Math.PI * 2, 14); k.cyl(0.19, 0.19, 0.07, x, 0.5, z, '#2a7a9c', 'cloth', 0, 0, 0, 18); k.rbox(0.3, 0.22, 0.05, 0.02, x, 0.72, z - 0.18, '#2a7a9c', 'cloth', -0.1, 0, 0); }); name = say('醫師與助理座椅', 'Operator & assistant stools'); equip = 'dentalchair'; info = 'stools'; break; }
      default: { const tb = TCM_EQUIP[id]; const r = tb ? tb(k, g, S, opt, api, ctx) : null; if (r) { name = r[0]; equip = r[1] || id; info = r[2] || null; } else k.box(0.5, 0.8, 0.5, 0, 0.4, 0, PAINT, 'paint'); }
    }
    const built = k.build(); g.add(built);
    g.userData.hot = id; g.userData.name = name; g.userData.equip = equip; g.userData.screens = screens; g.userData.info = info || id;
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
  function chair(k, x, z, ry, c2) { // office chair on castors, seat facing local -z
    c2 = c2 || '#3b5063';
    k.at(x, 0, z, ry || 0, () => { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; k.flat([0, 0.05, 0], [Math.cos(a) * 0.28, 0.04, Math.sin(a) * 0.28], 0.04, 0.03, '#2b3036', 'plastic'); k.cyl(0.025, 0.025, 0.02, Math.cos(a) * 0.28, 0.025, Math.sin(a) * 0.28, '#2b3036', 'rubber', Math.PI / 2, 0, 0, 8); } k.cyl(0.025, 0.025, 0.4, 0, 0.25, 0, GREY, 'satin', 0, 0, 0, 10); k.rbox(0.46, 0.07, 0.46, 0.03, 0, 0.47, 0, c2, 'cloth'); k.rbox(0.44, 0.5, 0.07, 0.03, 0, 0.78, 0.22, c2, 'cloth', -0.1, 0, 0); [-0.24, 0.24].forEach(ax => { k.box(0.03, 0.2, 0.03, ax, 0.58, 0.05, '#2b3036', 'plastic'); k.rbox(0.05, 0.03, 0.26, 0.01, ax, 0.69, 0.02, '#2b3036', 'plastic'); }); });
  }
  function resusCart(k, S, ctx) {
    k.rbox(0.75, 0.95, 0.55, 0.03, 0, 0.52, 0, '#b0313a', 'paint'); castors(k, [[-0.3, -0.22], [0.3, -0.22], [-0.3, 0.22], [0.3, 0.22]]); for (let i = 0; i < 4; i++) { k.box(0.66, 0.18, 0.015, 0, 0.2 + i * 0.21, 0.28, '#c8434c', 'paint'); k.box(0.16, 0.02, 0.02, 0, 0.24 + i * 0.21, 0.29, GREY, 'satin'); } k.rbox(0.8, 0.04, 0.58, 0.015, 0, 1.0, 0, '#cfd6da', 'satin'); k.rbox(0.42, 0.24, 0.3, 0.03, -0.1, 1.14, -0.05, '#f1c40f', 'paint'); k.box(0.12, 0.08, 0.05, 0.2, 1.06, 0.12, '#2b3036', 'plastic'); S(0.24, 0.15, ctx.monitorTex, -0.12, 1.17, 0.102, 0, null, 1); k.sph(0.07, 0.11, 0.07, 0.3, 1.1, -0.05, '#8dd8c6', 'plastic', 14, 0, 0, Math.PI / 2); k.cyl(0.05, 0.03, 0.06, 0.42, 1.1, -0.05, '#f0f6f8', 'glass', 0, 0, Math.PI / 2, 12);
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
    us: ['超音波推車', 'Ultrasound cart', '核對探頭方向標記；無菌套與無菌凝膠；探頭依規範消毒。', 'Check the probe marker; sterile sleeve and gel; reprocess probes to protocol.'],
    // v4.0 rooms
    icubed: ['加護病床與病人', 'ICU bed & patient', '床頭抬高、管路標示、定時翻身防壓瘡；點病人身體開啟該部位的真實影像。', 'Head of bed up, lines labelled, regular turning for pressure care; tap the patient for real images of that region.'],
    ventilator: ['加護呼吸器', 'ICU ventilator', '呼吸器模式與設定由加護團隊決定；學徒先看波形、警報與管路是否順暢。', 'Modes and settings belong to the ICU team; apprentices read waveforms and alarms and check the circuit is patent.'],
    curtain: ['隔離簾', 'Isolation curtain', '接觸隔離：進出前後手部衛生、個人防護裝備穿脫順序。', 'Contact isolation: hand hygiene on the way in and out, PPE on and off in the right order.'],
    station: ['護理站／中央監視', 'Nurse station & central monitoring', '所有床位的警報匯集於此；交班用 SBAR，病歷與檢驗結果在工作站查詢。', 'Every bed’s alarms arrive here; hand over with SBAR, look up charts and results at the workstation.'],
    crash: ['急救車', 'Crash cart', '封條完整、除顫器每日檢查；急救時由一人負責取物並唱名。', 'Seal intact, defibrillator checked daily; in an arrest one person fetches and calls out items.'],
    bed2: ['隔離病床', 'Isolation bay', '加護病床附呼吸器與輸液架；探視與隔離規定依病房公告。', 'An ICU bed with ventilator and infusion stack; visiting and isolation rules per the unit notice.'],
    bench: ['檢驗工作台', 'Laboratory bench', '工作前後清潔檯面；檢體與試劑分區；手套與護目鏡。', 'Clean the bench before and after work; keep specimens and reagents apart; gloves and eye protection.'],
    labscope: ['光學顯微鏡', 'Light microscope', '低倍找視野、高倍看細節；油鏡後擦拭；抹片與切片在此判讀。', 'Find the field on low power, read detail on high; wipe after oil immersion; smears and sections are read here.'],
    centrifuge: ['離心機', 'Centrifuge', '對稱配重、蓋好再啟動；停穩才開蓋；破管時依生物安全程序處理。', 'Balance tubes symmetrically, lid closed before starting; open only when stopped; broken tubes follow the biosafety procedure.'],
    analyser: ['自動分析儀', 'Automated analyser', '條碼對應病人；每日品管通過才發報告；危急值立即通報。', 'Barcode links the patient; results go out only after daily QC passes; critical values are phoned immediately.'],
    hood: ['生物安全櫃', 'Biosafety cabinet', '開機預吹、雙手慢進慢出、物品不擋前格柵；培養與開蓋檢體在櫃內操作。', 'Purge before use, slow hand movements, nothing on the front grille; cultures and open specimens stay inside.'],
    wallbench: ['染色與處理工作台', 'Staining & processing bench', 'Gram 染色與 H&E 依順序進行；玻片標示清楚；染劑屬化學危害物。', 'Gram and H&E stains follow a fixed order; slides are labelled; stains are chemical hazards.'],
    fridge: ['試劑／血品冰箱', 'Reagent & blood fridge', '溫度每日記錄；血品與試劑分開；先進先出。', 'Temperature logged daily; blood products apart from reagents; first in, first out.'],
    recdesk: ['檢體收件櫃台', 'Specimen reception', '核對姓名、條碼、容器與採檢時間；不合格檢體退回並記錄。', 'Check name, barcode, container and time taken; reject and log unsuitable specimens.'],
    workstation: ['電腦工作站', 'Computer workstation', '登入個人帳號、離開即鎖定；報告與結果只在授權下查詢。', 'Log in with your own account and lock when you leave; look up reports only when authorised.'],
    readdesk: ['放射判讀工作站', 'Radiology reading workstation', '診斷用螢幕、校正過的亮度、暗室；系統化判讀再口述報告。', 'Diagnostic monitors, calibrated brightness, a dark room; read systematically, then dictate.'],
    dentalfield: ['牙科治療椅與病人', 'Dental chair & patient', '點病人頭頸或口腔開啟口腔影像；椅背角度、頭枕與圍兜在此核對。', 'Tap the head, neck or mouth for oral images; check backrest angle, headrest and bib here.'],
    cabinets: ['診間櫥櫃與消毒鍋', 'Cabinetry & autoclave', '器械包裝、滅菌指示帶與日期；開封後視為污染。', 'Instrument pouches carry indicator tape and a date; once opened they count as contaminated.'],
    xrayarm: ['口內 X 光機', 'Intraoral X-ray unit', '鉛圍裙與甲狀腺護罩、操作者退至安全距離；影像先核對病人與牙位。', 'Lead apron and thyroid collar, operator steps back to a safe distance; check patient and tooth number first.'],
    dentaltray: ['牙科器械托盤', 'Dental instrument tray', '口鏡、探針、拔牙鉗與挺子；每位病人更換整組並滅菌。', 'Mirror, explorer, forceps and elevators; a fresh sterilised set for every patient.'],
    dentallab: ['牙技工作台', 'Dental lab bench', '石膏模型、咬合器與修模機；印模需消毒後送技工所。', 'Plaster casts, articulator and model trimmer; impressions are disinfected before they go to the lab.'],
    armchair: ['候診／休息椅', 'Waiting & recovery chair', '治療後休息、觀察出血與暈眩；離院前交代注意事項。', 'Rest after treatment, watch for bleeding or faintness; give instructions before discharge.'],
    tallcab: ['耗材與防護裝備櫃', 'Supplies & PPE cabinet', '手套、口罩、護目鏡與一次性耗材；先進先出、過期品下架。', 'Gloves, masks, eye protection and single-use supplies; first in first out, expired stock removed.'],
    stools: ['醫師與助理座椅', 'Operator & assistant stools', '四手操作：醫師與助理各有工作區；座椅高度護脊椎。', 'Four-handed dentistry: operator and assistant each have a zone; seat height protects the spine.']
  };
  // INFO entries are [zh, en, body_zh, body_en] arrays; room packs may also register { zh, en, body_zh, body_en, kind } objects
  function infoOf(id) { const v = INFO[id]; if (!v) return null; if (Array.isArray(v)) return v; return [v.zh || v.name_zh || id, v.en || v.name_en || id, v.body_zh || v.zh_body || '', v.body_en || v.en_body || '']; }

  // ---------------------------------------------------------------- people
  // body looks by team id (shift cast `body`); `cap`/`mask` 'room' = only in theatre-like rooms. Legacy ids keep their v3 colours.
  const LOOKS = {
    player: { gown: '#2f7f6a', scrubbed: true }, mentor: { gown: '#3f6f96', scrubbed: true }, scrub: { gown: '#3f6f96', scrubbed: true }, surgeon: { gown: '#3f6f96', scrubbed: true },
    anesthetist: { top: '#2f5f7a' }, anaesthetist: { top: '#2f5f7a' }, circulating: { top: '#3b7f6a' }, nurse: { top: '#3b8f6a', cap: 'room', mask: 'room' }, specialist: { top: '#5e5a8a' },
    tech: { top: '#4a6d8c', cap: 'room', mask: 'room' }, perfusionist: { top: '#4a6d8c' }, radiographer: { top: '#3f5f8a' }, neurophys: { top: '#5e5a8a' }, physio: { top: '#2f8f8a', cap: false, mask: false },
    patient: { top: '#9dbdd0', trouser: '#b9d0dc', shoes: '#7a8a90', cap: false, mask: false, patient: true }, family: { top: '#b8643f', trouser: '#3a3f4a', shoes: '#4a3b2e', cap: false, mask: false },
    student: { top: '#2f5f7a', coat: 0.95, cap: false, mask: false }, pharmacist: { top: '#2f6f8f', coat: 0.7, cap: false, mask: false }, resident: { top: '#2f5f7a', coat: 0.7, cap: false, mask: false }, porter: { top: '#2b3f5e', trouser: '#2b3f5e', shoes: '#2b3036', cap: false, mask: false },
    // v4.1: 中藥師／調劑人員 (white coat, dark apron, hair net) and 推拿／物理治療師 (polo shirt, trousers)
    herbalist: { top: '#2f4f5e', coat: 0.7, apron: '#3b4652', hairnet: '#eef2f4', cap: false, mask: false, trouser: '#2b3640' },
    therapist: { top: '#1f7f8a', trouser: '#2b3036', shoes: '#f4f6f8', polo: true, cap: false, mask: false },
    // the TCM mentor (中醫師師傅) wears a white coat over a dark shirt instead of scrubs
    'tcm-mentor': { top: '#2f4f6a', coat: 0.68, cap: false, mask: false, trouser: '#2b3640' }
  };
  function lookFor(role, opts) {
    const body = (opts && opts.body) || role.body || role.id || '';
    let L = LOOKS[body] || (role.player ? LOOKS.player : /mentor|scrub|surgeon/.test(body) ? LOOKS.mentor : /anesth/.test(body) ? LOOKS.anesthetist : { top: role.scrub || '#3b7f6a' });
    if (opts && opts.whiteCoat && (L === LOOKS.mentor || L === LOOKS.scrub || L === LOOKS.surgeon)) L = LOOKS['tcm-mentor'];
    if (opts && opts.whiteCoat && L === LOOKS.player) L = LOOKS.resident;
    const roomCaps = !opts || opts.roomCaps !== false;
    return { scrubbed: !!L.scrubbed, gown: L.gown, top: L.top, trouser: L.trouser, shoes: L.shoes, coat: L.coat, apron: L.apron, hairnet: L.hairnet, polo: !!L.polo, patient: !!L.patient, cap: L.cap === undefined ? true : L.cap === 'room' ? roomCaps : !!L.cap, mask: L.mask === undefined ? true : L.mask === 'room' ? roomCaps : !!L.mask };
  }
  // opts.articulated builds legs / arms / torso as separate pivots so the walk loop can animate them
  function person(K, role, opts) {
    opts = opts || {}; const g = new THREE.Group(); const skin = role.skin || '#f0cfae'; const L = lookFor(role, opts); const scrubbed = L.scrubbed;
    const gown = scrubbed ? gownColour(role, L) : L.top; const glove = scrubbed ? '#e8e3cf' : '#6f8fd8'; const trouser = L.trouser || (scrubbed ? '#2f5f7a' : gown); const shoes = L.shoes || (scrubbed ? '#e8ebed' : '#2b3036');
    const art = !!opts.articulated; const parts = {};
    const legKit = art ? null : makeKit(K);
    [-1, 1].forEach(s => { const x = s * 0.09; const kk = art ? makeKit(K) : legKit; const y0 = art ? 0.84 : 0; kk.cyl(0.07, 0.062, 0.78, art ? 0 : x, 0.45 - y0, 0, trouser, 'cloth', 0, 0, 0, 12); kk.rbox(0.1, 0.07, 0.26, 0.03, art ? 0 : x, 0.035 - y0, 0.04, shoes, 'rubber'); if (L.patient) kk.box(0.1, 0.03, 0.03, art ? 0 : x, 0.06 - y0, 0.17, '#f4f6f8', 'cloth'); if (art) { const lg = kk.build(); lg.position.set(x, 0.84, 0); g.add(lg); parts[s < 0 ? 'legL' : 'legR'] = lg; } });
    const b = art ? makeKit(K) : legKit;
    b.lathe(scrubbed ? [[0.001, 0.62], [0.22, 0.62], [0.215, 0.85], [0.2, 1.1], [0.2, 1.3], [0.17, 1.4], [0.09, 1.46], [0.001, 1.47]] : L.patient ? [[0.001, 0.5], [0.24, 0.5], [0.21, 0.85], [0.2, 1.1], [0.2, 1.3], [0.17, 1.4], [0.09, 1.46], [0.001, 1.47]] : [[0.001, 0.82], [0.2, 0.82], [0.2, 1.1], [0.2, 1.3], [0.17, 1.4], [0.09, 1.46], [0.001, 1.47]], 0, 0, 0, gown, 'cloth', 18);
    if (scrubbed) b.box(0.3, 0.025, 0.02, 0, 1.05, 0.2, gown, 'cloth');
    if (L.coat) { const cb = L.coat; b.lathe([[0.001, cb], [0.235, cb], [0.23, 1.1], [0.215, 1.3], [0.19, 1.38], [0.001, 1.38]], 0, 0, 0, '#f4f6f4', 'cloth', 18); b.box(0.012, 1.38 - cb - 0.04, 0.03, 0, (1.38 + cb) / 2, 0.225, '#d9dddb', 'cloth'); b.rbox(0.1, 0.04, 0.01, 0.004, 0.12, 1.3, 0.228, role.color || role.cap || '#1f6f5f', 'plastic'); }
    if (L.apron) { b.box(0.3, 0.6, 0.012, 0, 0.98, 0.236, L.apron, 'cloth'); b.box(0.2, 0.3, 0.012, 0, 1.33, 0.228, L.apron, 'cloth'); b.box(0.26, 0.1, 0.014, 0, 1.0, 0.242, '#4b5866', 'cloth'); [-0.1, 0.1].forEach(x => b.seg([x, 1.48, 0.2], [x, 1.5, -0.2], 0.008, 0.008, L.apron, 'cloth', 6)); }
    if (L.polo) { b.cyl(0.11, 0.09, 0.05, 0, 1.4, 0, L.top, 'cloth', 0, 0, 0, 12); b.box(0.012, 0.1, 0.014, 0, 1.33, 0.2, '#f4f6f8', 'cloth'); b.box(0.09, 0.025, 0.01, 0, 1.28, 0.2, role.color || role.cap || '#1f6f5f', 'plastic'); }
    if (L.patient) b.tor(0.045, 0.006, -0.24, 0.86, 0.05, '#f4f6f8', 'plastic', Math.PI / 2, 0, 0, Math.PI * 2, 8);
    const torsoColour = role.color || role.cap; if (!scrubbed && !L.coat && torsoColour && !L.patient) b.box(0.22, 0.02, 0.012, 0, 1.4, 0.17, torsoColour, 'cloth');
    const relaxed = art && !scrubbed;
    [-1, 1].forEach(s => {
      const kk = art ? makeKit(K) : b; const S = art ? [0, 0, 0] : [s * 0.2, 1.36, 0];
      const E = relaxed ? [S[0] + s * 0.04, S[1] - 0.28, S[2] + 0.02] : [S[0] + s * 0.05, S[1] - 0.24, S[2] + 0.1], H = relaxed ? [S[0] + s * 0.05, S[1] - 0.55, S[2] + 0.07] : [S[0] - s * 0.07, S[1] - 0.28, S[2] + 0.36];
      const sleeve = scrubbed ? gown : L.coat ? '#f4f6f4' : gown; const fore = scrubbed ? gown : L.coat ? '#f4f6f4' : skin, foreF = scrubbed || L.coat ? 'cloth' : 'skin';
      kk.seg(S, E, 0.06, 0.052, sleeve, 'cloth', 10); kk.sph(0.052, 0.052, 0.052, E[0], E[1], E[2], sleeve, 'cloth', 10); kk.seg(E, H, 0.048, 0.04, fore, foreF, 10);
      kk.sph(0.045, 0.03, 0.06, H[0], H[1], H[2] + (relaxed ? 0 : 0.03), scrubbed ? glove : skin, scrubbed ? 'plastic' : 'skin', 10); if (scrubbed) kk.cyl(0.045, 0.045, 0.05, H[0] * 0.95, H[1] + 0.005, H[2] - 0.02, glove, 'plastic', 1.2, 0, 0, 10);
      if (art) { const ag = kk.build(); ag.position.set(s * 0.2, 1.36, 0); g.add(ag); parts[s < 0 ? 'armL' : 'armR'] = ag; }
    });
    const h = art ? b : makeKit(K); h.cyl(0.05, 0.055, 0.1, 0, 1.49, 0, skin, 'skin', 0, 0, 0, 10); h.sph(0.11, 0.13, 0.115, 0, 1.6, 0, skin, 'skin', 18);
    if (L.cap) h.sph(0.125, 0.085, 0.13, 0, 1.69, -0.01, role.cap || role.color || '#2f6f8f', 'cloth', 16);
    else if (L.hairnet) { h.sph(0.118, 0.1, 0.122, 0, 1.66, -0.015, role.hair || '#2a2420', 'matte', 16); h.sph(0.126, 0.095, 0.13, 0, 1.675, -0.02, L.hairnet, 'cloth', 16); h.tor(0.12, 0.008, 0, 1.63, -0.02, L.hairnet, 'cloth', Math.PI / 2, 0, 0, Math.PI * 2, 10); }
    else { h.sph(0.118, 0.1, 0.122, 0, 1.66, -0.015, role.hair || '#2a2420', 'matte', 16); if (L.patient) h.box(0.26, 0.03, 0.26, 0, 1.6, 0, '#f4f6f8', 'cloth'); }
    if (L.mask) h.rbox(0.17, 0.1, 0.06, 0.02, 0, 1.55, 0.09, scrubbed ? '#cfe3ea' : '#a8c8de', 'cloth'); else h.box(0.05, 0.008, 0.01, 0, 1.545, 0.112, '#9a5a50', 'matte');
    [-0.04, 0.04].forEach(x => h.sph(0.012, 0.009, 0.006, x, 1.63, 0.107, '#2a2420', 'matte', 8)); h.sph(0.02, 0.012, 0.015, 0, 1.665, 0.105, skin, 'skin', 8);
    if (scrubbed) h.box(0.2, 0.06, 0.012, 0, 1.635, 0.125, '#dff3ff', 'glass');
    if (art) { const torso = b.build(); g.add(torso); parts.torso = torso; g.userData.head = torso; }
    else { const body = b.build(); g.add(body); const head = h.build(); g.add(head); g.userData.head = head; }
    const tag = labelSprite(pk(role), { size: 26, bg: role.player ? 'rgba(31,111,95,.92)' : 'rgba(16,28,32,.85)', border: role.player ? '#ffd166' : (role.color || null), scale: 0.0032 }); tag.position.y = 1.98; g.add(tag); g.userData.tag = tag;
    g.userData.role = role.id; g.userData.parts = art ? parts : null; g.userData.scrubbed = scrubbed; g.traverse(o => { if (o.isMesh) o.userData.role = role.id; });
    return g;
  }
  function gownColour(role, L) { return role.player ? '#2f7f6a' : (L.gown || '#3f6f96'); }
  // walk cycle / idle for an articulated person: phase in radians, amount 0..1 (blend), idle breathing when still
  function animatePerson(g, phase, amount, now, bob, idle) {
    const P = g.userData.parts; if (!P) return;
    const sw = Math.sin(phase) * 0.62 * amount, arm = (g.userData.scrubbed ? 0.25 : 0.5) * amount;
    P.legL.rotation.x = sw; P.legR.rotation.x = -sw; P.armL.rotation.x = -Math.sin(phase) * arm; P.armR.rotation.x = Math.sin(phase) * arm;
    P.torso.position.y = bob ? 0.022 * Math.abs(Math.sin(phase)) * amount : 0; P.torso.rotation.z = bob ? 0.03 * Math.sin(phase) * amount : 0;
    if (idle && amount < 0.05) { const k = g.userData.idleK || 0; P.torso.scale.y = 1 + 0.006 * Math.sin(now * 1.4 + k); P.torso.rotation.z = 0.012 * Math.sin(now * 0.45 + k); P.torso.position.x = 0.01 * Math.sin(now * 0.45 + k); } else { P.torso.scale.y = 1; P.torso.position.x = 0; }
  }
  function deviceKind(d) {
    if (/dentist/.test(d)) return 'dentalchair'; if (/obstet|gynec|rheumat/.test(d)) return 'us'; if (/anesth/.test(d)) return 'airwaycart'; if (/emergency|critical-care/.test(d)) return 'resus';
    if (/nephrology/.test(d)) return 'dialysis'; if (/pulmonology/.test(d)) return 'spirometry'; if (/endocrinology/.test(d)) return 'glucose';
    if (/neurosurg|ophthalm|^ent$|plastic/.test(d)) return 'microscope'; if (/cardiac-surg/.test(d)) return 'cpb';
    if (/ortho|spine|joint|vascular|cardiology|urolog|pain|radiolog/.test(d)) return 'carm'; if (/general|gastro|thoracic|pediatric-surg/.test(d)) return 'endo';
    return 'generic';
  }

  // ---------------------------------------------------------------- v4.1 TCM canvases (meridian charts, 百子櫃 labels, boards, posters)
  // Herb names for drawer / jar / bottle labels: every name is a herb of data/tcm-library.json (names only — never weights).
  const HERB_DEFAULT = ['黃耆', '當歸', '甘草', '白朮', '茯苓', '陳皮', '半夏', '桂枝', '白芍', '柴胡', '黃芩', '川芎', '熟地黃', '枸杞子', '大棗', '生薑', '麻黃', '杏仁', '石膏', '知母', '黃連', '黃柏', '梔子', '金銀花', '連翹', '板藍根', '蒲公英', '牡丹皮', '赤芍', '生地黃', '玄參', '玉竹', '百合', '山藥', '蓮子', '芡實', '薏苡仁', '澤瀉', '豬苓', '車前子', '滑石', '木通', '茵陳', '厚朴', '蒼朮', '藿香', '砂仁', '白豆蔻', '木香', '香附', '枳實', '枳殼', '青皮', '烏藥', '延胡索', '鬱金', '丹參', '桃仁', '紅花', '益母草', '牛膝', '三七', '白及', '仙鶴草', '艾葉', '側柏葉', '地榆', '槐花', '附子', '乾薑', '肉桂', '吳茱萸', '小茴香', '丁香', '高良薑', '黨參', '人參', '西洋參', '太子參', '白扁豆', '阿膠', '何首烏', '龍眼肉', '酸棗仁', '柏子仁', '遠志', '龍骨', '牡蠣', '天麻', '鉤藤', '菊花', '桑葉', '薄荷', '荊芥', '防風', '羌活', '獨活', '秦艽', '桑寄生', '杜仲', '續斷', '五味子', '山茱萸', '烏梅', '桑螵蛸', '神麴', '麥芽', '山楂', '雞內金', '萊菔子', '桔梗', '前胡', '紫菀', '款冬花', '枇杷葉', '桑白皮', '葶藶子', '浙貝母', '川貝母', '瓜蔞', '竹茹', '石菖蒲', '鬱李仁', '火麻仁', '大黃'];
  // classical formula names (data/tcm-library.json `formulas`) for the concentrated-granule bottles
  const FORMULA_NAMES = ['桂枝湯', '小柴胡湯', '補中益氣湯', '六味地黃丸', '逍遙散', '四君子湯', '四物湯', '歸脾湯', '銀翹散', '桑菊飲', '麻杏石甘湯', '半夏瀉心湯', '玉屏風散', '生脈散', '八珍湯', '參苓白朮散', '理中丸', '小建中湯', '四逆散', '左歸丸', '炙甘草湯', '當歸補血湯', '吳茱萸湯', '芍藥湯'];
  const HERB_TONES = ['#b8925a', '#8a5a2e', '#d8c27a', '#6b4a2e', '#c9a46a', '#9a3a2a', '#e8dcc0', '#5a4a3a', '#a07a4a', '#c46a3a', '#7a6a3a', '#d4b48a'];
  function herbNames() { // the curated common herbs first; the library (when loaded) only filters, so labels never change between loads
    const lib = window.HT_TCM; if (!lib || !Array.isArray(lib.herbs) || !lib.herbs.length) return HERB_DEFAULT;
    const all = new Set(lib.herbs.map(h => h && h.zh).filter(Boolean)); const pref = HERB_DEFAULT.filter(n => all.has(n)); return pref.length >= 96 ? pref : HERB_DEFAULT;
  }
  const FONT = (wt, px, serif) => `${wt} ${px}px ${serif ? '"Noto Serif TC", "Noto Sans TC", serif' : 'system-ui, "Noto Sans TC", sans-serif'}`;
  function cv2(w, h, bg) { const c = canvas(w, h), g = c.getContext('2d'); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } return [c, g]; }
  // body outline + channel lines from data/acu-figure.js (view box 400×900) or a stylised figure when it is not loaded
  const meridianTextures = []; let figLoading = null;
  function ensureFigure() {
    if (window.HT_ACU_FIGURE) return true;
    if (!figLoading && window.HT && window.HT.loadScript) figLoading = window.HT.loadScript('data/acu-figure.js').then(() => { meridianTextures.splice(0).forEach(m => { try { drawMeridian(m.canvas, m.view); m.tex.needsUpdate = true; } catch (e) { /* ignore */ } }); }).catch(() => {});
    return false;
  }
  function drawMeridian(c, view) {
    const g = c.getContext('2d'), W = c.width, H = c.height; const FIG = window.HT_ACU_FIGURE;
    g.fillStyle = '#f6efe0'; g.fillRect(0, 0, W, H); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(120,90,40,${Math.random() * 0.06})`; g.fillRect(Math.random() * W, Math.random() * H, 3, 3); }
    g.strokeStyle = '#7a4a24'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = '#7a1c24'; g.font = FONT(700, Math.round(W / 13), true); g.fillText(view === 'back' ? say('十四經絡圖 · 背面', 'Fourteen channels · back') : say('十四經絡圖 · 正面', 'Fourteen channels · front'), W * 0.07, W * 0.13);
    const s = (H - W * 0.3) / 900, ox = (W - 400 * s) / 2, oy = W * 0.2; g.save(); g.translate(ox, oy); g.scale(s, s);
    if (FIG && FIG.body && FIG.body[view]) {
      const B = FIG.body[view]; g.fillStyle = '#e8c9a6'; g.strokeStyle = '#e8c9a6'; g.lineCap = 'round'; g.lineJoin = 'round';
      (B.limbs || []).forEach(l => { try { g.lineWidth = l.w || 30; g.stroke(new Path2D(l.d)); } catch (e) { /* ignore */ } });
      (B.fills || []).forEach(f => { try { if (f.d) g.fill(new Path2D(f.d)); else if (f.cx != null) { g.beginPath(); g.ellipse(f.cx, f.cy, f.rx, f.ry, 0, 0, Math.PI * 2); g.fill(); } } catch (e) { /* ignore */ } });
      g.strokeStyle = 'rgba(90,60,30,.35)'; g.lineWidth = 2; (B.details || []).forEach(d => { try { g.stroke(new Path2D(typeof d === 'string' ? d : d.d)); } catch (e) { /* ignore */ } });
      const mirror = FIG.mirrorAxis || 200;
      Object.keys(FIG.channels || {}).forEach(code => { const ch = FIG.channels[code]; const pts = ch && ch[view]; if (!pts || pts.length < 2) return; const colr = (FIG.colors && FIG.colors[code]) || '#8a4a2f'; g.strokeStyle = colr; g.lineWidth = 5; g.lineCap = 'round';
        (ch.bilateral ? [false, true] : [false]).forEach(mir => { g.beginPath(); let pen = false; pts.forEach(p => { if (!p) { pen = false; return; } const x = mir ? 2 * mirror - p[1] : p[1], y = p[2]; if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; }); g.stroke(); g.fillStyle = colr; pts.forEach(p => { if (!p) return; const x = mir ? 2 * mirror - p[1] : p[1]; g.beginPath(); g.arc(x, p[2], 4.5, 0, Math.PI * 2); g.fill(); }); }); // null = a jump in the drawn path
        const p0 = pts[Math.floor(pts.length / 2)] || pts.find(Boolean); if (!p0) return; g.fillStyle = '#2b2420'; g.font = FONT(700, 22); g.fillText(code, p0[1] + 10, p0[2] - 8); });
    } else { // stylised fallback figure
      g.fillStyle = '#e8c9a6'; g.beginPath(); g.ellipse(200, 76, 44, 50, 0, 0, Math.PI * 2); g.fill(); g.fillRect(178, 112, 44, 64); g.beginPath(); g.moveTo(126, 186); g.bezierCurveTo(140, 170, 260, 170, 274, 186); g.lineTo(284, 460); g.lineTo(116, 460); g.closePath(); g.fill();
      g.strokeStyle = '#e8c9a6'; g.lineCap = 'round'; g.lineWidth = 40; [[128, 196, 92, 330, 60, 480], [272, 196, 308, 330, 340, 480], [150, 460, 150, 650, 160, 830], [250, 460, 250, 650, 240, 830]].forEach(a => { g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(a[2], a[3], a[4], a[5]); g.stroke(); });
      const C = [['#7fa6c9', [[152, 206], [96, 326], [60, 496]]], ['#e0b14c', [[185, 190], [180, 440], [170, 650], [165, 820]]], ['#c0722f', [[200, 180], [200, 455]]], ['#3b6bb0', [[160, 200], [150, 450], [150, 700], [155, 840]]]];
      C.forEach(([colr, pts]) => { g.strokeStyle = colr; g.lineWidth = 5; g.beginPath(); pts.forEach((p, i) => { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke(); g.beginPath(); pts.forEach((p, i) => { if (i) g.lineTo(400 - p[0], p[1]); else g.moveTo(400 - p[0], p[1]); }); g.stroke(); });
    }
    g.restore(); simLabel(g, W, H);
  }
  function meridianTexture(view) { const c = canvas(512, 864); drawMeridian(c, view); const t2 = tex(c); if (!ensureFigure()) { meridianTextures.push({ canvas: c, tex: t2, view }); if (meridianTextures.length > 16) meridianTextures.shift(); } return t2; }
  // 百子櫃 drawer labels: one transparent canvas over the whole drawer front (cols × rows), one herb name per drawer
  function drawerLabelTexture(cols, rows, names) {
    const cw = 160, ch = 76; const c = canvas(cols * cw, rows * ch), g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.textAlign = 'center';
    for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) { const x = i * cw, y = r * ch; g.fillStyle = '#f3e7c8'; g.fillRect(x + 30, y + 10, cw - 60, 34); g.strokeStyle = '#8a5a2a'; g.lineWidth = 2; g.strokeRect(x + 30, y + 10, cw - 60, 34); const n = names[(r * cols + i) % names.length] || ''; g.fillStyle = '#2b1d12'; g.font = FONT(700, n.length > 3 ? 21 : 26, true); g.fillText(n, x + cw / 2, y + 36); }
    g.textAlign = 'left'; return tex(c);
  }
  // shelf labels for a glass specimen cabinet (rows top → bottom)
  function shelfLabelTexture(rows, perRow, names, w, h) {
    const c = canvas(w || 512, h || 640), g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); const rh = c.height / rows, cw = c.width / perRow; g.textAlign = 'center';
    for (let r = 0; r < rows; r++) for (let i = 0; i < perRow; i++) { const n = names[(r * perRow + i) % names.length]; const x = i * cw + cw / 2, y = (r + 1) * rh - 22; g.fillStyle = '#fbf6e8'; g.fillRect(x - 36, y - 22, 72, 30); g.strokeStyle = '#9a7a4a'; g.lineWidth = 1.5; g.strokeRect(x - 36, y - 22, 72, 30); g.fillStyle = '#2b1d12'; g.font = FONT(700, n.length > 3 ? 16 : 20, true); g.fillText(n, x, y); }
    g.textAlign = 'left'; return tex(c);
  }
  // 八段錦 poster: eight stylised figures in the brocade postures (schematic)
  function baduanjinCanvas() {
    const c = canvas(1024, 640), g = c.getContext('2d'); g.fillStyle = '#f7f1e3'; g.fillRect(0, 0, 1024, 640); g.fillStyle = '#7a1c24'; g.font = FONT(700, 44, true); g.fillText(say('八段錦 · 導引示意', 'Baduanjin · eight brocades (schematic)'), 30, 60);
    const names = ['兩手托天理三焦', '左右開弓似射鵰', '調理脾胃須單舉', '五勞七傷往後瞧', '搖頭擺尾去心火', '兩手攀足固腎腰', '攢拳怒目增氣力', '背後七顛百病消'];
    const poses = [
      { hip: [0, 95], arms: [[-18, -62], [18, -62]], legs: [[-14, 72], [14, 72]] }, { hip: [0, 95], arms: [[-64, -4], [40, -4]], legs: [[-40, 66], [40, 66]], bow: true },
      { hip: [0, 95], arms: [[-14, -62], [20, 50]], legs: [[-14, 72], [14, 72]] }, { hip: [0, 95], arms: [[-22, 56], [22, 56]], legs: [[-14, 72], [14, 72]], head: [-14, 0] },
      { hip: [0, 90], arms: [[-50, 40], [50, 40]], legs: [[-48, 62], [48, 62]], tilt: 0.3 }, { hip: [38, 70], arms: [[36, 60], [44, 60]], legs: [[-10, 74], [12, 74]], fold: true },
      { hip: [0, 95], arms: [[-66, 2], [30, 10]], legs: [[-44, 64], [44, 64]], fist: true }, { hip: [0, 95], arms: [[-10, 60], [10, 60]], legs: [[-10, 66], [10, 66]], toes: true }];
    poses.forEach((p, i) => { const cx = 128 + (i % 4) * 256, cy = 150 + Math.floor(i / 4) * 250; g.fillStyle = 'rgba(122,28,36,.06)'; g.fillRect(cx - 118, cy - 60, 236, 220); g.save(); g.translate(cx, cy); if (p.tilt) g.rotate(p.tilt); g.strokeStyle = '#2b3a4a'; g.lineWidth = 9; g.lineCap = 'round'; g.fillStyle = '#2b3a4a';
      const hd = p.head || [0, 0]; g.beginPath(); g.arc(hd[0], hd[1], 20, 0, Math.PI * 2); g.fill(); const sh = p.fold ? [12, 28] : [0, 30]; g.beginPath(); g.moveTo(hd[0], hd[1] + 18); g.lineTo(sh[0], sh[1]); g.lineTo(p.hip[0], p.hip[1]); g.stroke();
      p.legs.forEach(v => { g.beginPath(); g.moveTo(p.hip[0], p.hip[1]); g.lineTo(p.hip[0] + v[0], p.hip[1] + v[1] - (p.toes ? 8 : 0)); g.stroke(); });
      p.arms.forEach(v => { g.beginPath(); g.moveTo(sh[0], sh[1]); g.lineTo(sh[0] + v[0], sh[1] + v[1]); g.stroke(); if (p.fist) { g.beginPath(); g.arc(sh[0] + v[0], sh[1] + v[1], 9, 0, Math.PI * 2); g.fill(); } });
      if (p.bow) { g.strokeStyle = '#8a5a2a'; g.lineWidth = 4; g.beginPath(); g.arc(sh[0] - 64, sh[1] - 4, 40, -1.2, 1.2); g.stroke(); }
      g.restore(); g.fillStyle = '#2b2420'; g.font = FONT(700, 25, true); g.textAlign = 'center'; g.fillText(`${i + 1}. ${names[i]}`, cx, cy + 140); g.textAlign = 'left'; });
    g.fillStyle = '#6b5a44'; g.font = FONT(500, 20); g.fillText(say('動作宜緩、呼吸自然，不適即停；有脊椎或心血管疾病者先諮詢醫師。', 'Slow movements, natural breathing, stop if unwell; ask a doctor first with spinal or heart disease.'), 30, 620);
    return c;
  }
  function smokeTexture() { const c = canvas(64, 64), g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30); grd.addColorStop(0, 'rgba(232,232,226,.7)'); grd.addColorStop(0.5, 'rgba(220,220,214,.28)'); grd.addColorStop(1, 'rgba(210,210,205,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return tex(c); }
  // whiteboards: today's list / treatment schedule (fictional patients, codes only, no doses or durations)
  function tcmBoardCanvas(kind) {
    const [c, g] = cv2(640, 400, '#fbfbf7'); const ok = '#2f7f6a', warn = '#c0392b';
    const B = {
      clinic: [say('今日門診 · 中醫內科（虛構）', 'Today · TCM clinic (fictional)'), [['A01', say('初診 · 失眠、心悸', 'new · insomnia, palpitations'), ok], ['A02', say('複診 · 胃脘脹悶', 'review · epigastric fullness'), ok], ['A03', say('初診 · 胸悶 → 先排除心因性', 'new · chest tightness → rule out cardiac'), warn], ['A04', say('複診 · 咳嗽', 'review · cough'), ok], ['A05', say('初診 · 腰痠', 'new · low-back ache'), ok]], say('紅旗症狀 → 立即轉介西醫／急診', 'Red flags → refer to emergency / Western care')],
      acu: [say('針灸治療排程（虛構）', 'Acupuncture schedule (fictional)'), [['1', say('針刺 · 留針觀察中', 'needling · resting, observed'), ok], ['2', say('拔罐後休息 · 衛教罐印', 'rest after cupping · explain marks'), ok], ['3', say('溫灸 · 注意燙傷、排煙開啟', 'moxa · watch for burns, extractor on'), warn], ['4', say('電針 · 參數依醫囑', 'electro · settings per order'), ok], ['5', say('起針 · 清點針數', 'removal · count the needles'), ok]], say('暈針 → 起針、平躺、通報醫師', 'Fainting → remove needles, lie flat, call')],
      tuina: [say('推拿／傷科 今日排程（虛構）', 'Tuina / trauma today (fictional)'), [['1', say('頸項僵痛 · 推拿 + 熱敷', 'stiff neck · tuina + hot pack'), ok], ['2', say('腰痛 · 牽引（依醫囑）', 'low-back pain · traction (per order)'), ok], ['3', say('踝扭傷 · 先評估排除骨折', 'ankle sprain · rule out fracture'), warn], ['4', say('導引衛教 · 八段錦', 'exercise teaching · Baduanjin'), ok]], say('麻木無力、夜間痛、外傷 → 先轉介檢查', 'Numbness, night pain, trauma → refer first')]
    }[kind] || null; const D = B || [say('今日看板', "Today's board"), [], ''];
    g.fillStyle = '#1b3a4b'; g.font = FONT(700, 30); g.fillText(D[0], 22, 46); g.fillStyle = '#c9a063'; g.fillRect(22, 60, 596, 3);
    D[1].forEach(([n, s, colr], i) => { const y = 108 + i * 50; g.fillStyle = colr; g.beginPath(); g.arc(40, y - 8, 17, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = FONT(700, 15); g.textAlign = 'center'; g.fillText(n, 40, y - 3); g.textAlign = 'left'; g.font = FONT(500, 25); g.fillStyle = '#1f3a8a'; g.fillText(s, 70, y); });
    g.fillStyle = '#c0392b'; g.font = FONT(700, 21); g.fillText(D[2], 22, 380); return c;
  }
  function fourDxCanvas() { // HIS screen at the pulse desk: the four examinations form (no prescription content)
    const [c, g] = cv2(512, 320, '#0d1b22'); g.fillStyle = '#9fe'; g.font = FONT(700, 20); g.fillText(say('中醫門診系統 · 四診紀錄', 'TCM clinic system · four examinations'), 14, 30);
    [[say('望', 'Look'), say('神色・形態・舌質・舌苔', 'spirit, colour, body, tongue')], [say('聞', 'Listen'), say('聲音・氣味', 'voice, odour')], [say('問', 'Ask'), say('寒熱・汗・飲食・二便・睡眠', 'heat/cold, sweat, diet, stool, sleep')], [say('切', 'Feel'), say('脈象・按診', 'pulse, palpation')]].forEach(([a, b], i) => { const y = 72 + i * 46; g.fillStyle = '#1d3440'; g.fillRect(14, y - 26, 484, 38); g.fillStyle = '#ffd166'; g.font = FONT(700, 22); g.fillText(a, 24, y); g.fillStyle = '#d8e6ee'; g.font = FONT(500, 18); g.fillText(b, 80, y); g.strokeStyle = '#7fd4b0'; g.lineWidth = 2; g.strokeRect(462, y - 18, 20, 20); if (i < 3) { g.beginPath(); g.moveTo(466, y - 8); g.lineTo(471, y - 2); g.lineTo(479, y - 15); g.stroke(); } });
    g.fillStyle = '#9fe'; g.font = FONT(600, 17); g.fillText(say('辨證 → 治則 → 處方（由醫師開立）', 'Pattern → principle → prescription (by the doctor)'), 14, 278); simLabel(g, 512, 320); return c;
  }
  function rxPadCanvas() {
    const [c, g] = cv2(256, 340, '#fbf6e6'); g.strokeStyle = '#b0242c'; g.lineWidth = 4; g.strokeRect(8, 8, 240, 324); g.fillStyle = '#b0242c'; g.font = FONT(700, 24, true); g.fillText(say('中醫處方箋', 'TCM prescription'), 54, 44);
    g.fillStyle = '#4a3a2a'; g.font = FONT(500, 15); [say('姓名：○○○（虛構）', 'Name: ○○○ (fictional)'), say('辨證：', 'Pattern:'), say('治法：', 'Principle:'), say('處方：由醫師開立', 'Rx: written by the doctor')].forEach((l, i) => g.fillText(l, 20, 80 + i * 30));
    g.strokeStyle = 'rgba(176,36,44,.35)'; g.lineWidth = 1; for (let y = 196; y < 300; y += 22) { g.beginPath(); g.moveTo(20, y); g.lineTo(236, y); g.stroke(); }
    g.strokeStyle = '#c0392b'; g.lineWidth = 3; g.beginPath(); g.arc(200, 290, 26, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#c0392b'; g.font = FONT(700, 15, true); g.fillText(say('教學', 'SIM'), 186, 296); return c;
  }
  function rxCheckCanvas() {
    const [c, g] = cv2(512, 320, '#0d1b22'); g.fillStyle = '#9fe'; g.font = FONT(700, 20); g.fillText(say('處方審核 · 調劑前核對（示意）', 'Prescription check before dispensing (sim)'), 14, 30);
    [[say('病人身分（兩種辨識）', 'Patient identity (two identifiers)'), 1], [say('過敏史・懷孕與否', 'Allergies · pregnancy'), 1], [say('十八反・十九畏', 'Classical incompatibilities (十八反・十九畏)'), 1], [say('妊娠禁忌藥', 'Herbs contraindicated in pregnancy'), 0], [say('重複用藥・中西藥交互作用', 'Duplicates · herb–drug interactions'), 0], [say('特殊煎法標示（先煎・後下・包煎）', 'Special decoction marks (first / late / bagged)'), 0]].forEach(([l, on], i) => { const y = 70 + i * 36; g.strokeStyle = on ? '#7fd4b0' : '#ffd166'; g.lineWidth = 2; g.strokeRect(16, y - 16, 18, 18); if (on) { g.beginPath(); g.moveTo(19, y - 7); g.lineTo(24, y - 1); g.lineTo(32, y - 13); g.stroke(); } g.fillStyle = '#d8e6ee'; g.font = FONT(500, 17); g.fillText(l, 44, y); });
    g.fillStyle = '#ffd166'; g.font = FONT(700, 16); g.fillText(say('有疑義 → 聯絡開方醫師，不自行更改', 'Any doubt → call the prescriber, never change it yourself'), 14, 290); simLabel(g, 512, 320); return c;
  }
  function lcdCanvas(lines, colr, w, h, bars) {
    const [c, g] = cv2(w || 256, h || 128, '#0b1410'); g.fillStyle = colr || '#7dffb0'; lines.forEach((l, i) => { g.font = FONT(i ? 500 : 700, i ? 17 : 21); g.fillText(l, 12, 28 + i * 26); });
    if (bars) bars.forEach((v, i) => { const x = 12 + i * 38, y = (h || 128) - 14; g.fillStyle = 'rgba(125,255,176,.18)'; g.fillRect(x, y - 40, 26, 40); g.fillStyle = colr || '#7dffb0'; g.fillRect(x, y - 40 * v, 26, 40 * v); g.font = FONT(600, 11); g.fillText('CH' + (i + 1), x, y + 12); });
    return c;
  }
  function tongueCardCanvas() {
    const [c, g] = cv2(256, 128, '#f8f6f0'); g.fillStyle = '#333'; g.font = FONT(700, 15); g.fillText(say('舌色比色卡（示意）', 'Tongue colour card (sim)'), 8, 18);
    [['#f0c4c0', say('淡白', 'pale')], ['#e89a98', say('淡紅', 'pink')], ['#d8605a', say('紅', 'red')], ['#a8343a', say('絳', 'crimson')], ['#7a4a6a', say('紫暗', 'purple')]].forEach(([colr, n], i) => { g.fillStyle = colr; g.fillRect(8 + i * 49, 28, 42, 52); g.fillStyle = '#333'; g.font = FONT(500, 13); g.fillText(n, 10 + i * 49, 98); });
    g.fillStyle = '#666'; g.font = FONT(500, 11); g.fillText(say('自然光下觀察 · 避免染色食物', 'Daylight · avoid staining foods'), 8, 120); return c;
  }
  function handHygieneCanvas() {
    const [c, g] = cv2(256, 360, '#eef6f4'); g.fillStyle = '#1f6f5f'; g.fillRect(0, 0, 256, 48); g.fillStyle = '#fff'; g.font = FONT(700, 22); g.fillText(say('洗手五時機', '5 moments of hand hygiene'), 12, 32);
    g.fillStyle = '#23323a'; g.font = FONT(500, 15); [say('1 接觸病人前', '1 Before touching a patient'), say('2 清潔／無菌操作前', '2 Before a clean / aseptic task'), say('3 暴露體液風險後', '3 After body-fluid exposure'), say('4 接觸病人後', '4 After touching a patient'), say('5 接觸病人周遭環境後', '5 After touching surroundings')].forEach((l, i) => g.fillText(l, 12, 82 + i * 30));
    g.fillStyle = '#1f6f5f'; g.font = FONT(700, 17); g.fillText(say('濕・搓・沖・捧・擦', 'Wet · rub · rinse · cup · dry'), 12, 250); g.fillText(say('內・外・夾・弓・大・立・完', 'palms · backs · fingers · thumbs · tips · wrists'), 12, 280); simLabel(g, 256, 360); return c;
  }
  function bambooCanvas(seed) {
    const [c, g] = cv2(256, 640, '#f3ead6'); for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(140,110,60,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 640, 3, 3); }
    g.strokeStyle = 'rgba(40,52,40,.82)'; g.lineCap = 'round'; const xs = [70 + (seed || 0) * 13, 150 - (seed || 0) * 9];
    xs.forEach((x0, j) => { g.lineWidth = 9 - j * 2; let y = 640; while (y > 60) { const seg = 70 + ((x0 * 7 + y) % 40); g.beginPath(); g.moveTo(x0 + (640 - y) * 0.03, y); g.lineTo(x0 + (640 - y + seg) * 0.03, y - seg + 6); g.stroke(); y -= seg; } });
    g.fillStyle = 'rgba(40,58,40,.8)'; for (let i = 0; i < 16; i++) { const x = 60 + ((i * 53 + (seed || 0) * 31) % 140), y = 80 + ((i * 97) % 420); g.save(); g.translate(x, y); g.rotate(-0.6 + ((i * 37) % 10) / 8); g.beginPath(); g.ellipse(18, 0, 22, 5, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    g.fillStyle = '#b0242c'; g.fillRect(196, 560, 30, 30); g.fillStyle = '#f3ead6'; g.font = FONT(700, 14, true); g.fillText('竹', 204, 581); return c;
  }
  function scrollCanvas(text) {
    const [c, g] = cv2(160, 600, '#f6efdc'); g.fillStyle = '#8a6a3a'; g.fillRect(0, 0, 160, 26); g.fillRect(0, 574, 160, 26); g.fillStyle = '#1a1410'; g.font = FONT(700, 72, true); g.textAlign = 'center'; [...text].forEach((ch, i) => g.fillText(ch, 80, 120 + i * 104)); g.fillStyle = '#b0242c'; g.fillRect(104, 500, 28, 28); g.textAlign = 'left'; return c;
  }
  function plaqueCanvas(text, bg, fg, px) { const [c, g] = cv2(512, 128, bg || '#3a2414'); g.strokeStyle = '#c9a24a'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116); g.fillStyle = fg || '#e8c86a'; g.font = FONT(700, px || 56, true); g.textAlign = 'center'; g.fillText(text, 256, 84); g.textAlign = 'left'; return c; }
  function spineCanvas() {
    const T = ['黃帝內經', '傷寒論', '金匱要略', '神農本草經', '本草綱目', '溫病條辨', '針灸甲乙經', '中藥典', '方劑學', '中醫診斷學', '經絡腧穴學', '推拿學'];
    const [c, g] = cv2(1024, 200, '#3a2a1a'); const w = 1024 / T.length; const C = ['#7a1c24', '#2f4f6a', '#3b5a3a', '#5a3a6a', '#8a5a2a', '#1f3f5a'];
    T.forEach((t2, i) => { g.fillStyle = C[i % C.length]; g.fillRect(i * w + 3, 6, w - 6, 194); g.fillStyle = '#e8c86a'; g.font = FONT(700, 24, true); g.textAlign = 'center'; [...t2].forEach((ch, j) => g.fillText(ch, i * w + w / 2, 40 + j * 28)); });
    g.textAlign = 'left'; return c;
  }
  function clockCanvas() { const [c, g] = cv2(128, 128); g.fillStyle = '#fbfbf7'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#2b3036'; g.lineWidth = 5; g.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.lineWidth = i % 3 ? 2 : 4; g.beginPath(); g.moveTo(64 + Math.sin(a) * 46, 64 - Math.cos(a) * 46); g.lineTo(64 + Math.sin(a) * 54, 64 - Math.cos(a) * 54); g.stroke(); } g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 26, 64 - 14); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 - 8, 64 - 44); g.stroke(); return c; }
  function corridorCanvas() { const [c, g] = cv2(256, 160); const grd = g.createLinearGradient(0, 0, 0, 160); grd.addColorStop(0, '#d9d3c4'); grd.addColorStop(1, '#a89e8a'); g.fillStyle = grd; g.fillRect(0, 0, 256, 160); g.fillStyle = '#6f8a8a'; for (let i = 0; i < 4; i++) { g.fillRect(20 + i * 58, 104, 44, 10); g.fillRect(22 + i * 58, 82, 6, 24); } g.fillStyle = '#1f6f5f'; g.fillRect(70, 20, 116, 30); g.fillStyle = '#fff'; g.font = FONT(700, 18); g.fillText(say('候藥區', 'Waiting area'), 88, 42); return c; }
  function granuleLabelCanvas(rows, perRow, names) {
    const [c, g] = cv2(1024, rows * 80); g.clearRect(0, 0, c.width, c.height); const cw = 1024 / perRow; g.textAlign = 'center';
    for (let r = 0; r < rows; r++) for (let i = 0; i < perRow; i++) { const n = names[(r * perRow + i) % names.length]; const x = i * cw + cw / 2, y = r * 80 + 48; g.fillStyle = ['#2f7f6a', '#b0242c', '#2f4f8a', '#c98a1a'][(r + i) % 4]; g.fillRect(x - cw / 2 + 6, y - 22, cw - 12, 30); g.fillStyle = '#fff'; g.font = FONT(700, n.length > 4 ? 12 : n.length > 3 ? 14 : 16); g.fillText(n, x, y); }
    g.textAlign = 'left'; return c;
  }

  // ---------------------------------------------------------------- v4.1 TCM equipment builders (procedural props for the four TCM rooms)
  // Each returns [display name, equip id, INFO key]; `equipment()` calls them for ids it does not build itself. Teaching drawings only:
  // no doses, herb weights, needle depths, moxa / electro / traction settings anywhere.
  const WOOD = '#8a5a36', WOOD_D = '#5e3a22', WOOD_L = '#b8875a', BRASS = '#c9a24a', BRONZE = '#6e5132', TSTEEL = '#c9d0d3', LEATHER = '#7a3f2c';
  function tcmPlane(g, w, h, src, x, y, z, ry, o) {
    o = o || {}; const map = src && src.isTexture ? src : tex(src);
    const mat = new THREE.MeshStandardMaterial({ map, roughness: o.rough == null ? 0.82 : o.rough, metalness: 0, transparent: !!o.transparent, alphaTest: o.transparent ? 0.04 : 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide, depthWrite: !o.transparent });
    if (o.glow) { mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = map; mat.emissiveIntensity = o.glow; }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.set(o.rx || 0, ry || 0, 0, 'YXZ'); m.position.set(x, y, z); m.receiveShadow = !o.transparent; g.add(m); return m;
  }
  function bowl(k, r, h, x, y, z, c, f, seg) { const t = Math.max(0.004, r * 0.08); k.lathe([[0.001, 0], [r * 0.6, 0.003], [r * 0.9, h * 0.45], [r, h], [r - t, h], [r * 0.9 - t, h * 0.47], [r * 0.6 - t, h * 0.14], [0.001, h * 0.12]], x, y, z, c, f, seg || 20); }
  function trolleyFrame(k, W2, D, shelves, top) { // stainless two/three-shelf trolley, handle at -x
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => k.cyl(0.012, 0.012, top - 0.06, sx * (W2 / 2 - 0.02), (top - 0.06) / 2 + 0.06, sz * (D / 2 - 0.02), TSTEEL, 'satin', 0, 0, 0, 8));
    castors(k, [[-W2 / 2 + 0.03, -D / 2 + 0.03], [W2 / 2 - 0.03, -D / 2 + 0.03], [-W2 / 2 + 0.03, D / 2 - 0.03], [W2 / 2 - 0.03, D / 2 - 0.03]], 0.03);
    shelves.forEach(y => { k.rbox(W2, 0.018, D, 0.008, 0, y, 0, '#e4e9eb', 'paint'); k.box(W2, 0.03, 0.012, 0, y + 0.02, D / 2 - 0.006, '#d3dadd', 'paint'); k.box(W2, 0.03, 0.012, 0, y + 0.02, -D / 2 + 0.006, '#d3dadd', 'paint'); });
    k.seg([-W2 / 2 - 0.03, top + 0.08, -D / 2 + 0.04], [-W2 / 2 - 0.03, top + 0.08, D / 2 - 0.04], 0.011, 0.011, TSTEEL, 'satin', 8); [-1, 1].forEach(s => k.seg([-W2 / 2 + 0.01, top, s * (D / 2 - 0.04)], [-W2 / 2 - 0.03, top + 0.08, s * (D / 2 - 0.04)], 0.009, 0.009, TSTEEL, 'satin', 6));
  }
  function woodStool(k, x, z) { k.cyl(0.19, 0.19, 0.045, x, 0.46, z, WOOD, 'paint', 0, 0, 0, 20); [[0.13, 0.13], [-0.13, 0.13], [0.13, -0.13], [-0.13, -0.13]].forEach(([dx, dz]) => k.seg([x + dx * 0.8, 0.44, z + dz * 0.8], [x + dx * 1.1, 0, z + dz * 1.1], 0.016, 0.018, WOOD_D, 'paint', 8)); k.tor(0.15, 0.008, x, 0.18, z, WOOD_D, 'paint', Math.PI / 2, 0, 0, Math.PI * 2, 16); }
  function tcmStool(k, x, z, c) { k.cyl(0.24, 0.24, 0.025, x, 0.045, z, '#2b3036', 'plastic', 0, 0, 0, 5); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; k.cyl(0.022, 0.022, 0.02, x + Math.cos(a) * 0.21, 0.022, z + Math.sin(a) * 0.21, '#2b3036', 'rubber', Math.PI / 2, 0, 0, 8); } k.cyl(0.022, 0.022, 0.36, x, 0.24, z, GREY, 'satin', 0, 0, 0, 10); k.cyl(0.19, 0.18, 0.08, x, 0.46, z, c || '#2f4f5e', 'cloth', 0, 0, 0, 18); }
  // a patient lying on a couch (couch frame: length along x, head at -x; Y = top of the pad)
  function lyingPatient(k, hx, Y, o) {
    const sk = o.skin || '#e0b48e', gown = o.gown || '#9dbdd0', tr = o.trouser || '#5f7786', prone = o.patient === 'prone', hair = '#2a2420', towel = o.towelOver || '#e3ece6';
    const hX = hx + (prone ? 0.17 : 0.24), hY = Y + (prone ? 0.075 : 0.16), sY = Y + 0.11;
    if (!prone) k.rbox(0.32, 0.07, 0.46, 0.03, hx + 0.22, Y + 0.04, 0, '#f4f6f4', 'cloth');
    k.sph(0.1, 0.095, 0.112, hX, hY, 0, sk, 'skin', 16);
    if (prone) k.sph(0.104, 0.075, 0.118, hX - 0.01, hY + 0.03, 0, hair, 'matte', 14);
    else { k.sph(0.104, 0.085, 0.118, hX - 0.035, hY - 0.015, 0, hair, 'matte', 14); k.sph(0.016, 0.018, 0.015, hX + 0.03, hY + 0.095, 0, sk, 'skin', 8); [-0.035, 0.035].forEach(z => k.sph(0.012, 0.004, 0.01, hX - 0.005, hY + 0.088, z, '#2a2420', 'matte', 6)); }
    k.seg([hX + 0.08, hY - 0.02, 0], [hx + 0.37, sY + 0.03, 0], 0.048, 0.055, sk, 'skin', 10);
    k.rbox(0.56, 0.2, 0.38, 0.08, hx + 0.62, sY, 0, prone && o.bareBack ? sk : gown, prone && o.bareBack ? 'skin' : 'cloth');
    k.rbox(0.26, 0.19, 0.36, 0.08, hx + 1.0, Y + 0.1, 0, tr, 'cloth');
    [-1, 1].forEach(s => {
      k.seg([hx + 1.08, Y + 0.09, s * 0.09], [hx + 1.45, Y + 0.085, s * 0.1], 0.075, 0.06, tr, 'cloth', 10); k.seg([hx + 1.45, Y + 0.085, s * 0.1], [hx + 1.8, Y + 0.065, s * 0.11], 0.058, 0.045, o.shins ? sk : tr, o.shins ? 'skin' : 'cloth', 10);
      if (prone) k.rbox(0.16, 0.07, 0.09, 0.03, hx + 1.87, Y + 0.05, s * 0.11, sk, 'skin'); else k.rbox(0.07, 0.15, 0.09, 0.03, hx + 1.84, Y + 0.11, s * 0.11, sk, 'skin');
      const sh = [hx + 0.4, sY + 0.03, s * 0.21], el = [hx + 0.66, Y + 0.08, s * 0.25], wr = [hx + 0.9, Y + 0.06, s * 0.24];
      k.seg(sh, el, 0.05, 0.045, prone && o.bareBack ? sk : gown, 'cloth', 10); k.seg(el, wr, 0.042, 0.034, sk, 'skin', 10); k.sph(0.045, 0.024, 0.06, wr[0] + 0.06, wr[1], wr[2], sk, 'skin', 10);
    });
    const tX = hx + (prone ? 0.98 : 1.05), tL = prone ? 0.5 : 0.56; k.rbox(tL, 0.02, 0.4, 0.008, tX, Y + 0.2, 0, towel, 'cloth'); [-1, 1].forEach(s => k.box(tL, 0.15, 0.012, tX, Y + 0.13, s * 0.205, towel, 'cloth', s * 0.12, 0, 0)); // towel draped over the hips / thighs
    if (o.needles && !prone) { // fine filiform needles standing in the skin (visual only)
      [[hx + 0.84, Y + 0.095, 0.24], [hx + 0.84, Y + 0.095, -0.24], [hx + 1.55, Y + 0.13, 0.13], [hx + 1.55, Y + 0.13, -0.13], [hx + 1.62, Y + 0.12, 0.09], [hx + 0.66, sY + 0.1, 0.0], [hx + 0.74, sY + 0.1, 0.05]].forEach(([x, y, z]) => { k.cyl(0.0014, 0.0014, 0.04, x, y + 0.02, z, '#d8dde0', 'satin', 0, 0, 0, 4); k.cyl(0.003, 0.003, 0.022, x, y + 0.051, z, '#c9a24a', 'gold', 0, 0, 0, 6); });
    }
    if (o.cupsOnBack && prone) [[0.5, 0.1], [0.5, -0.1], [0.7, 0.1], [0.7, -0.1]].forEach(([dx, dz]) => { k.disc(0.045, hx + dx, sY + 0.101, dz, '#b04a4a', 'matte', -Math.PI / 2, 0, 0, 16); k.lathe([[0.04, 0], [0.046, 0.02], [0.044, 0.05], [0.03, 0.075], [0.001, 0.08]], hx + dx, sY + 0.1, dz, '#dff3ff', 'glass', 16); });
    if (o.moxaBox && prone) { k.rbox(0.2, 0.09, 0.14, 0.01, hx + 0.86, sY + 0.14, 0, '#a0704a', 'paint'); k.box(0.17, 0.004, 0.11, hx + 0.86, sY + 0.186, 0, '#4a4a4a', 'metal'); }
  }
  function tcmCouch(k, g, o) {
    const L = o.len || 1.9, W = o.wid || 0.7, H = o.h || 0.7, top = o.top || LEATHER, wood = o.wood || WOOD, hx = -L / 2;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => k.box(0.06, H - 0.1, 0.06, sx * (L / 2 - 0.07), (H - 0.1) / 2, sz * (W / 2 - 0.06), wood, 'paint'));
    [-1, 1].forEach(s => { k.box(L - 0.1, 0.09, 0.025, 0, H - 0.145, s * (W / 2 - 0.045), wood, 'paint'); k.box(0.025, 0.09, W - 0.1, s * (L / 2 - 0.045), H - 0.145, 0, wood, 'paint'); k.box(L - 0.14, 0.03, 0.03, 0, 0.16, s * (W / 2 - 0.06), wood, 'paint'); });
    k.box(L - 0.16, 0.018, W - 0.14, 0, 0.18, 0, wood, 'paint');
    [-0.5, 0.05, 0.55].forEach((x, i) => { for (let j = 0; j < 2 + (i % 2); j++) k.rbox(0.34, 0.045, 0.26, 0.015, x, 0.215 + j * 0.047, 0, j % 2 ? '#e3ece6' : (o.towel || '#f4f6f4'), 'cloth'); });
    k.rbox(L, 0.1, W, 0.04, 0, H - 0.05, 0, top, 'paint');
    if (o.face) { const fx = hx + 0.17; k.sph(0.06, 0.012, 0.085, fx, H + 0.001, 0, '#1a1410', 'matte', 16); k.tor(0.085, 0.012, fx, H + 0.006, 0, '#f4f6f4', 'cloth', Math.PI / 2, 0, 0, Math.PI * 2, 18); }
    const p0 = o.face ? hx + 0.3 : hx + 0.06, p1 = L / 2 - 0.04; k.box(p1 - p0, 0.004, W - 0.08, (p0 + p1) / 2, H + 0.003, 0, '#f6f3ea', 'matte');
    k.cyl(0.045, 0.045, W - 0.1, L / 2 + 0.05, H - 0.1, 0, '#f6f3ea', 'matte', Math.PI / 2, 0, 0, 14); [-1, 1].forEach(s => k.box(0.06, 0.08, 0.015, L / 2 + 0.03, H - 0.09, s * (W / 2 - 0.04), TSTEEL, 'satin'));
    if (!o.face && !o.patient) { k.rbox(0.34, 0.09, 0.5, 0.04, hx + 0.22, H + 0.05, 0, '#f4f6f4', 'cloth'); k.rbox(0.5, 0.05, 0.4, 0.02, 0.45, H + 0.03, 0, '#e3ece6', 'cloth'); }
    if (o.face && !o.patient) k.cyl(0.07, 0.07, W - 0.16, L / 2 - 0.25, H + 0.07, 0, '#e3ece6', 'cloth', Math.PI / 2, 0, 0, 14); // bolster
    if (o.patient) lyingPatient(k, hx, H + 0.005, o);
    if (o.stool) tcmStool(k, o.stool[0], o.stool[1]);
  }
  const TCM_EQUIP = {
    couch(k, g, S, o) { tcmCouch(k, g, o); return [o.face ? say('推拿床（臉洞）', 'Tuina couch (face hole)') : say('治療床', 'Treatment couch'), 'couch', o.face ? 'tuinacouch' : 'tcmcouch']; },
    tcmdesk(k, g, S, o) { // 脈診桌: doctor sits at -z, the patient on the stool at the +x end rests the wrist on the pulse pillow
      const T = 0.76; k.rbox(1.7, 0.05, 0.85, 0.015, 0, T - 0.025, 0, WOOD, 'paint');
      [-1, 1].forEach(s => { k.rbox(0.46, T - 0.05, 0.78, 0.01, s * 0.6, (T - 0.05) / 2, 0, WOOD_D, 'paint'); for (let i = 0; i < 3; i++) { k.box(0.42, 0.2, 0.012, s * 0.6, 0.14 + i * 0.23, -0.395, WOOD, 'paint'); k.box(0.12, 0.018, 0.02, s * 0.6, 0.2 + i * 0.23, -0.405, BRASS, 'gold'); } });
      k.box(0.74, 0.5, 0.02, 0, 0.45, 0.38, WOOD_D, 'paint');
      k.box(0.3, 0.006, 0.22, 0.56, T + 0.003, 0.17, '#f0ebe0', 'cloth'); k.rbox(0.2, 0.065, 0.11, 0.03, 0.56, T + 0.038, 0.17, '#b0242c', 'cloth'); [-1, 1].forEach(s => k.box(0.004, 0.066, 0.112, 0.56 + s * 0.085, T + 0.038, 0.17, '#d8b04a', 'cloth'));
      tcmPlane(g, 0.21, 0.28, rxPadCanvas(), 0.08, T + 0.004, 0.08, -0.12, { rx: -Math.PI / 2 });
      k.rbox(0.13, 0.025, 0.2, 0.01, -0.22, T + 0.0125, 0.14, '#1d1b1a', 'paint'); k.box(0.08, 0.004, 0.08, -0.22, T + 0.027, 0.11, '#0b0b0b', 'glass'); k.seg([-0.12, T + 0.012, 0.0], [-0.04, T + 0.012, 0.22], 0.006, 0.005, '#3b2a1c', 'paint', 8); k.seg([-0.04, T + 0.012, 0.22], [-0.03, T + 0.012, 0.26], 0.006, 0.001, '#1a1a1a', 'matte', 8);
      k.cyl(0.045, 0.045, 0.12, -0.72, T + 0.06, -0.25, '#2f4f6a', 'paint', 0, 0, 0, 14); [[-0.01, 0.01], [0.015, -0.01], [-0.015, -0.012], [0.01, 0.015]].forEach(([dx, dz], i) => k.seg([-0.72 + dx, T + 0.1, -0.25 + dz], [-0.72 + dx * 3, T + 0.26 + i * 0.01, -0.25 + dz * 3], 0.005, 0.004, '#6b4a2e', 'paint', 6));
      const ry = 2.54, mx = -0.5, mz = 0.12, nx = Math.sin(ry), nz = Math.cos(ry); k.at(mx, T, mz, ry, () => { k.rbox(0.5, 0.32, 0.035, 0.012, 0, 0.3, 0, '#1d262c', 'plastic'); k.cyl(0.018, 0.018, 0.14, 0, 0.08, -0.03, GREY, 'satin', 0, 0, 0, 8); k.rbox(0.2, 0.012, 0.14, 0.004, 0, 0.006, -0.03, GREY, 'satin'); });
      S(0.46, 0.28, fourDxCanvas(), mx + nx * 0.019, T + 0.3, mz + nz * 0.019, ry, null, 0.9);
      k.box(0.42, 0.015, 0.14, -0.05, T + 0.008, -0.22, '#2d3436', 'plastic', 0, 0.15, 0); k.rbox(0.05, 0.02, 0.09, 0.01, 0.24, T + 0.01, -0.22, '#2d3436', 'plastic');
      k.cyl(0.035, 0.035, 0.1, 0.32, T + 0.05, -0.3, '#e8f3f6', 'glass', 0, 0, 0, 12); for (let i = 0; i < 5; i++) k.box(0.012, 0.14, 0.002, 0.32 + (i - 2) * 0.008, T + 0.08, -0.3, '#d8c48a', 'matte', 0, 0, (i - 2) * 0.08);
      k.rbox(0.22, 0.09, 0.12, 0.02, 0.75, T + 0.045, -0.28, '#f4f6f8', 'paint'); k.box(0.08, 0.02, 0.04, 0.75, T + 0.095, -0.28, '#ffffff', 'cloth');
      k.box(0.26, 0.07, 0.025, 0.25, T + 0.035, 0.36, WOOD_D, 'paint'); tcmPlane(g, 0.24, 0.06, plaqueCanvas(say('中醫師', 'TCM doctor'), '#3a2414', '#e8c86a', 60), 0.25, T + 0.035, 0.374, 0, { rough: 0.5 });
      chair(k, 0, -0.75, Math.PI, '#5a3a2a');
      if (o.stool !== false) woodStool(k, 1.08, 0.18);
      return [say('脈診桌（脈枕・處方箋）', 'Pulse-diagnosis desk (pulse pillow · Rx pad)'), 'pulse-desk', 'pulsedesk'];
    },
    tonguelamp(k, g, S, o) {
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; k.flat([0, 0.06, 0], [Math.cos(a) * 0.26, 0.05, Math.sin(a) * 0.26], 0.04, 0.03, '#e9edf0', 'paint'); } castors(k, [0, 1, 2, 3, 4].map(i => [Math.cos(i / 5 * Math.PI * 2) * 0.26, Math.sin(i / 5 * Math.PI * 2) * 0.26]), 0.025);
      k.cyl(0.018, 0.018, 1.3, 0, 0.72, 0, TSTEEL, 'satin', 0, 0, 0, 10); k.cyl(0.026, 0.026, 0.06, 0, 1.36, 0, '#e9edf0', 'paint', 0, 0, 0, 12);
      const ar = o.arm || 0.3; k.seg([0, 1.38, 0], [0, 1.5, ar * 0.5], 0.013, 0.013, TSTEEL, 'satin', 8); k.seg([0, 1.5, ar * 0.5], [0, 1.46, ar], 0.013, 0.013, TSTEEL, 'satin', 8);
      k.tor(0.1, 0.024, 0, 1.46, ar + 0.02, '#f4f6f8', 'paint', 0, 0, 0, Math.PI * 2, 24); k.tor(0.1, 0.012, 0, 1.46, ar + 0.043, '#fffaf0', 'glow', 0, 0, 0, Math.PI * 2, 24); k.disc(0.075, 0, 1.46, ar + 0.03, '#dff3ff', 'glass', 0, 0, 0, 24);
      g.userData.footRect = [-0.29, 0.29, -0.29, 0.29];
      k.rbox(0.18, 0.1, 0.02, 0.008, 0, 1.0, 0.03, '#2b3036', 'plastic'); tcmPlane(g, 0.17, 0.085, tongueCardCanvas(), 0, 1.0, 0.042, 0, { rough: 0.5 });
      return [say('舌診燈（日光色溫）', 'Tongue-exam lamp (daylight)'), 'lamp', 'tonguelamp'];
    },
    foldscreen(k, g, S, o) {
      const n = o.panels || 4, pw = 0.52, ph = 1.74; let px = -n * pw * 0.95 / 2, pz = 0;
      for (let i = 0; i < n; i++) { const a = i % 2 ? -0.32 : 0.32, dx = Math.cos(a) * pw, dz = Math.sin(a) * pw, cx = px + dx / 2, cz = pz + dz / 2;
        k.at(cx, 0, cz, -a, () => { k.box(pw, 0.04, 0.035, 0, ph, 0, WOOD_D, 'paint'); k.box(pw, 0.04, 0.035, 0, 0.4, 0, WOOD_D, 'paint'); [-1, 1].forEach(s => k.box(0.035, ph + 0.04, 0.035, s * (pw / 2 - 0.017), (ph + 0.04) / 2, 0, WOOD_D, 'paint')); k.box(pw - 0.07, 0.24, 0.014, 0, 0.27, 0, WOOD, 'paint'); });
        tcmPlane(g, pw - 0.07, ph - 0.44, bambooCanvas(i), cx, (0.42 + ph - 0.02) / 2, cz, -a, { double: true, rough: 0.9 }); px += dx; pz += dz; }
      return [say('屏風', 'Folding screen'), 'couch', 'foldscreen'];
    },
    bronze(k, g, S, o) {
      k.cyl(0.32, 0.36, 0.08, 0, 0.04, 0, WOOD_D, 'paint', 0, 0, 0, 28); k.lathe([[0.001, 0.08], [0.27, 0.08], [0.24, 0.14], [0.2, 0.4], [0.25, 0.45], [0.26, 0.47], [0.001, 0.47]], 0, 0, 0, WOOD, 'paint', 28);
      const B = '#7e5c34', G2 = '#d4b25a';
      k.at(0, 0.47, 0, 0, () => {
        [-1, 1].forEach(s => { k.rbox(0.075, 0.035, 0.13, 0.015, s * 0.065, 0.018, 0.025, B, 'metal'); k.seg([s * 0.065, 0.03, 0], [s * 0.068, 0.3, 0.008], 0.034, 0.042, B, 'metal', 12); k.sph(0.043, 0.045, 0.045, s * 0.068, 0.3, 0.008, B, 'metal', 10); k.seg([s * 0.068, 0.3, 0.008], [s * 0.075, 0.56, 0], 0.044, 0.058, B, 'metal', 12);
          k.seg([s * 0.13, 0.865, 0], [s * 0.165, 0.64, 0.012], 0.034, 0.03, B, 'metal', 10); k.sph(0.03, 0.03, 0.03, s * 0.165, 0.64, 0.012, B, 'metal', 8); k.seg([s * 0.165, 0.64, 0.012], [s * 0.175, 0.45, 0.03], 0.028, 0.022, B, 'metal', 10); k.sph(0.024, 0.05, 0.02, s * 0.177, 0.41, 0.035, B, 'metal', 10); k.sph(0.015, 0.02, 0.018, s * 0.072, 1.03, 0.0, B, 'metal', 8); });
        k.geo(new THREE.LatheGeometry([[0.001, 0.54], [0.125, 0.55], [0.112, 0.66], [0.118, 0.74], [0.135, 0.83], [0.13, 0.88], [0.07, 0.92], [0.001, 0.925]].map(p => new THREE.Vector2(p[0], p[1])), 22), 0, 0, 0, B, 'metal', 0, 0, 0, 1, 1, 0.72);
        k.cyl(0.035, 0.04, 0.07, 0, 0.955, 0, B, 'metal', 0, 0, 0, 12); k.sph(0.068, 0.085, 0.075, 0, 1.03, 0.005, B, 'metal', 18); k.sph(0.03, 0.03, 0.03, 0, 1.12, -0.02, B, 'metal', 10);
        const lines = [[[0, 0.915, 0.062], [0, 0.82, 0.099], [0, 0.7, 0.086], [0, 0.6, 0.086]], [[0, 1.1, -0.06], [0, 0.96, -0.045], [0, 0.82, -0.099], [0, 0.66, -0.086], [0, 0.56, -0.08]]];
        [-1, 1].forEach(s => { lines.push([[s * 0.055, 0.9, 0.072], [s * 0.06, 0.8, 0.09], [s * 0.06, 0.68, 0.083], [s * 0.07, 0.56, 0.072], [s * 0.07, 0.42, 0.046], [s * 0.068, 0.3, 0.05], [s * 0.068, 0.1, 0.042]]); lines.push([[s * 0.045, 0.88, -0.09], [s * 0.045, 0.7, -0.085], [s * 0.06, 0.56, -0.072], [s * 0.068, 0.3, -0.046], [s * 0.065, 0.06, -0.04]]); lines.push([[s * 0.14, 0.84, 0.035], [s * 0.168, 0.64, 0.042], [s * 0.178, 0.46, 0.05]]); });
        lines.forEach(L => { k.tube(L, 0.0028, G2, 'gold', 24, 4); L.forEach(p => k.sph(0.006, 0.006, 0.006, p[0], p[1], p[2], G2, 'gold', 6)); });
      });
      k.box(0.32, 0.11, 0.02, 0, 0.3, 0.215, WOOD_D, 'paint'); tcmPlane(g, 0.3, 0.075, plaqueCanvas(say('針灸銅人 · 教學複製', 'Bronze figure · replica'), '#3a2414', '#e8c86a', 44), 0, 0.3, 0.226, 0, { rough: 0.5 });
      return [say('針灸銅人（教學複製）', 'Bronze acupuncture figure (teaching replica)'), 'bronze', 'bronze'];
    },
    meridian(k, g, S, o) {
      const W2 = 0.76, H2 = 1.28; [-1, 1].forEach((s, i) => { const x = s * 0.43; k.rbox(W2 + 0.06, H2 + 0.06, 0.03, 0.01, x, 1.66, 0, WOOD_D, 'paint'); tcmPlane(g, W2, H2, meridianTexture(i ? 'back' : 'front'), x, 1.66, 0.017, 0, { rough: 0.7 }); });
      k.box(1.76, 0.02, 0.05, 0, 0.94, 0.025, WOOD_D, 'paint'); k.seg([0.6, 0.96, 0.04], [0.16, 0.96, 0.05], 0.006, 0.004, BRASS, 'gold', 8);
      g.userData.footRect = [-0.9, 0.9, -0.05, 0.1]; return [say('十四經絡掛圖（正面・背面）', 'Fourteen-channel wall charts (front · back)'), 'meridian-chart', 'meridian'];
    },
    herbspec(k, g, S, o) {
      const W2 = 1.2, D = 0.42, names = herbNames().slice(28, 48);
      k.rbox(W2, 0.8, D, 0.01, 0, 0.4, 0, WOOD_D, 'paint'); [-0.3, 0.3].forEach(x => { k.box(0.56, 0.7, 0.012, x, 0.42, D / 2 + 0.005, WOOD, 'paint'); k.box(0.014, 0.12, 0.02, x + (x < 0 ? 0.24 : -0.24), 0.45, D / 2 + 0.015, BRASS, 'gold'); });
      k.box(W2, 1.05, 0.02, 0, 1.33, -D / 2 + 0.01, WOOD_D, 'paint'); [-1, 1].forEach(s => k.box(0.03, 1.05, D, s * (W2 / 2 - 0.015), 1.33, 0, WOOD_D, 'paint')); k.rbox(W2 + 0.06, 0.06, D + 0.04, 0.01, 0, 1.88, 0, WOOD_D, 'paint');
      for (let r = 0; r < 4; r++) { const y = 0.82 + r * 0.26; k.box(W2 - 0.06, 0.015, D - 0.04, 0, y, 0, WOOD, 'paint'); for (let i = 0; i < 5; i++) { const x = -0.448 + i * 0.224; k.cyl(0.07, 0.07, 0.17, x, y + 0.095, -0.02, '#eef6f8', 'glass', 0, 0, 0, 16); k.cyl(0.062, 0.062, 0.1, x, y + 0.058, -0.02, HERB_TONES[(r * 5 + i) % HERB_TONES.length], 'matte', 0, 0, 0, 12); k.cyl(0.074, 0.074, 0.025, x, y + 0.19, -0.02, WOOD_D, 'paint', 0, 0, 0, 16); } }
      tcmPlane(g, W2 - 0.06, 1.04, shelfLabelTexture(4, 5, names, 512, 640), 0, 1.34, 0.06, 0, { transparent: true });
      [-0.3, 0.3].forEach(x => { k.box(0.57, 1.0, 0.008, x, 1.33, D / 2 + 0.004, '#dff3ff', 'glass'); k.box(0.57, 0.03, 0.02, x, 0.84, D / 2 + 0.01, WOOD_D, 'paint'); k.box(0.57, 0.03, 0.02, x, 1.82, D / 2 + 0.01, WOOD_D, 'paint'); k.box(0.012, 0.1, 0.02, x + (x < 0 ? 0.25 : -0.25), 1.3, D / 2 + 0.02, BRASS, 'gold'); });
      return [say('藥材標本櫃', 'Herb specimen cabinet'), 'cabinet', 'herbspec'];
    },
    bookshelf(k, g, S, o) {
      const W2 = 1.3, D = 0.34; k.box(W2, 1.9, 0.02, 0, 0.95, -D / 2 + 0.01, WOOD_D, 'paint'); [-1, 1].forEach(s => k.box(0.03, 1.9, D, s * (W2 / 2 - 0.015), 0.95, 0, WOOD_D, 'paint')); for (let r = 0; r < 5; r++) k.box(W2 - 0.04, 0.025, D, 0, 0.06 + r * 0.42, 0, WOOD, 'paint'); k.box(W2 + 0.02, 0.03, D + 0.02, 0, 1.9, 0, WOOD_D, 'paint');
      const C = ['#2f4f6a', '#7a1c24', '#3b5a3a', '#d8c9a0', '#5a3a6a', '#1f3f5a', '#8a5a2a', '#c9b48a'];
      for (let r = 0; r < 3; r++) { let x = -W2 / 2 + 0.05, i = r * 7; while (x < W2 / 2 - 0.09) { if (r === 1 && x > 0.08 && x < 0.4) { for (let j = 0; j < 6; j++) k.box(0.2, 0.022, 0.26, x + 0.11, 0.087 + r * 0.42 + j * 0.024, 0, j % 2 ? '#2a3f6a' : '#33497a', 'cloth'); x += 0.25; i++; continue; } const w = 0.03 + ((i * 37) % 5) * 0.008, h = 0.24 + ((i * 53) % 6) * 0.018; k.box(w, h, 0.22 + ((i * 13) % 3) * 0.02, x + w / 2, 0.075 + r * 0.42 + h / 2, 0.02, C[i % C.length], 'paint'); x += w + 0.004; i++; } }
      k.box(W2 - 0.08, 0.27, 0.22, 0, 0.075 + 3 * 0.42 + 0.135, 0.0, '#3a2a1a', 'paint'); tcmPlane(g, W2 - 0.08, 0.27, spineCanvas(), 0, 0.075 + 3 * 0.42 + 0.135, 0.111, 0, { rough: 0.6 });
      k.lathe([[0.001, 0], [0.06, 0.005], [0.08, 0.1], [0.05, 0.2], [0.03, 0.24], [0.001, 0.245]], -0.4, 1.765, 0.0, '#2f4f8a', 'paint', 16); k.sph(0.11, 0.06, 0.08, 0.35, 1.795, 0, '#5a7a4a', 'matte', 10);
      return [say('醫籍書架', 'Medical classics bookcase'), 'desk', 'bookshelf'];
    },
    waitchairs(k, g, S, o) {
      const n = o.n || 3, c2 = o.c || '#3f6f6a'; k.box(n * 0.56, 0.05, 0.05, 0, 0.36, 0.05, GREY, 'satin'); [-1, 1].forEach(s => { k.box(0.05, 0.36, 0.05, s * (n * 0.28 - 0.1), 0.18, 0.05, GREY, 'satin'); k.box(0.05, 0.03, 0.5, s * (n * 0.28 - 0.1), 0.015, 0.05, GREY, 'satin'); });
      for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.56; k.rbox(0.5, 0.07, 0.46, 0.03, x, 0.44, 0.02, c2, 'cloth'); k.rbox(0.5, 0.42, 0.06, 0.03, x, 0.7, 0.24, c2, 'cloth', 0.12, 0, 0); if (i < n - 1) k.rbox(0.05, 0.03, 0.36, 0.01, x + 0.28, 0.62, 0.04, GREY, 'satin'); }
      return [say('候診椅', 'Waiting chairs'), 'door', 'waitchairs'];
    },
    tcmboard(k, g, S, o) {
      k.rbox(1.64, 1.04, 0.04, 0.01, 0, 1.6, 0, '#cfd6da', 'satin'); k.box(1.6, 1.0, 0.03, 0, 1.6, 0.005, '#ffffff', 'paint'); k.box(1.5, 0.03, 0.06, 0, 1.07, 0.03, GREY, 'satin'); [['#1f6fb0', -0.4], ['#c0392b', -0.3], ['#222222', -0.2]].forEach(([c2, x]) => k.cyl(0.008, 0.008, 0.12, x, 1.095, 0.04, c2, 'plastic', 0, 0, Math.PI / 2, 8));
      tcmPlane(g, 1.52, 0.92, tcmBoardCanvas(o.kind || 'clinic'), 0, 1.6, 0.022, 0, { rough: 0.4 }); return [o.kind === 'acu' ? say('治療排程白板', 'Treatment schedule board') : say('今日看板', "Today's board"), 'whiteboard', 'tcmboard'];
    },
    handsink(k, g, S, o) {
      k.rbox(0.62, 0.78, 0.46, 0.02, 0, 0.39, 0, '#e9e4d8', 'paint'); k.box(0.56, 0.6, 0.012, 0, 0.38, 0.232, '#ddd6c6', 'paint'); k.rbox(0.64, 0.12, 0.48, 0.04, 0, 0.84, 0, '#f6f6f2', 'paint'); k.sph(0.21, 0.04, 0.16, 0, 0.885, 0.03, '#d9e2e6', 'satin', 18);
      k.tube([[0, 0.9, -0.18], [0, 1.08, -0.16], [0, 1.1, -0.06], [0, 1.02, -0.02]], 0.012, TSTEEL, 'satin', 16, 8); k.box(0.12, 0.012, 0.02, 0.0, 0.95, -0.19, TSTEEL, 'satin');
      k.box(0.9, 0.5, 0.012, 0, 1.15, -0.226, '#e8efee', 'paint'); k.rbox(0.1, 0.18, 0.08, 0.02, 0.3, 1.25, -0.19, '#f4f6f8', 'plastic'); k.cyl(0.03, 0.03, 0.14, 0.24, 0.97, -0.1, '#cfe8f0', 'glass', 0, 0, 0, 10); k.cyl(0.008, 0.008, 0.05, 0.24, 1.06, -0.1, '#f4f6f8', 'plastic', 0, 0, 0, 8);
      k.rbox(0.3, 0.36, 0.1, 0.02, -0.5, 1.3, -0.18, '#f4f6f8', 'plastic'); k.box(0.2, 0.04, 0.02, -0.5, 1.12, -0.13, '#ffffff', 'cloth'); tcmPlane(g, 0.3, 0.42, handHygieneCanvas(), 0.02, 1.66, -0.218, 0, { rough: 0.6 });
      k.cyl(0.13, 0.14, 0.42, 0.52, 0.21, 0.05, '#cfd6da', 'satin', 0, 0, 0, 18); k.cyl(0.135, 0.135, 0.03, 0.52, 0.435, 0.05, '#9aa5aa', 'satin', 0, 0, 0, 18);
      return [say('洗手台', 'Hand-wash basin'), 'sink', 'handsink'];
    },
    needletrolley(k, g, S, o) {
      const W2 = 0.62, D = 0.44, T = 0.88; trolleyFrame(k, W2, D, [0.3, T], T);
      k.rbox(0.34, 0.02, 0.24, 0.01, -0.06, T + 0.02, -0.04, '#eef2f4', 'paint');
      for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) { const x = -0.2 + i * 0.05, z = -0.1 + r * 0.12; k.box(0.04, 0.006, 0.1, x, T + 0.034, z, '#f4f1e8', 'matte'); k.box(0.04, 0.007, 0.025, x, T + 0.035, z - 0.035, ['#3f7fd0', '#2fa36b', '#c98a1a'][i % 3], 'paint'); }
      k.cyl(0.04, 0.04, 0.09, 0.2, T + 0.055, -0.12, '#e8f3f6', 'glass', 0, 0, 0, 14); for (let i = 0; i < 5; i++) k.sph(0.014, 0.014, 0.014, 0.2 + ((i * 7) % 5 - 2) * 0.008, T + 0.03 + (i % 3) * 0.015, -0.12 + ((i * 3) % 5 - 2) * 0.008, '#ffffff', 'cloth', 8); k.cyl(0.042, 0.042, 0.012, 0.2, T + 0.104, -0.12, '#cfd6da', 'satin', 0, 0, 0, 14);
      k.rbox(0.14, 0.05, 0.08, 0.01, 0.06, T + 0.035, 0.13, '#f4f6f8', 'paint'); k.box(0.14, 0.012, 0.081, 0.06, T + 0.04, 0.13, '#3f7fd0', 'paint');
      place(k, 'forceps', -0.16, T + 0.02, 0.13, 0.1);
      k.rbox(0.13, 0.16, 0.11, 0.01, 0.22, T + 0.09, 0.11, '#f2c230', 'plastic'); k.rbox(0.135, 0.03, 0.115, 0.01, 0.22, T + 0.18, 0.11, '#c0392b', 'plastic'); k.box(0.06, 0.06, 0.002, 0.22, T + 0.1, 0.166, '#1a1a1a', 'matte');
      k.cyl(0.028, 0.03, 0.15, -0.26, T + 0.085, 0.15, '#dff0f6', 'glass', 0, 0, 0, 10); k.cyl(0.01, 0.01, 0.05, -0.26, T + 0.18, 0.15, '#f4f6f8', 'plastic', 0, 0, 0, 8);
      [-0.15, 0.05, 0.2].forEach((x, i) => k.rbox(0.16, 0.08, 0.12, 0.005, x, 0.35 + i * 0.002, (i - 1) * 0.08, i === 1 ? '#f4f6f8' : '#e8dcc0', 'paint')); k.box(0.12, 0.02, 0.1, 0.05, 0.4, 0.0, '#6f8fd8', 'plastic');
      return [say('針具治療車（無菌針盤）', 'Needle trolley (sterile needle tray)'), 'needles', 'needletrolley'];
    },
    electro(k, g, S, o) {
      const T = 0.78; trolleyFrame(k, 0.46, 0.4, [0.26, T], T);
      k.rbox(0.34, 0.11, 0.25, 0.02, 0, T + 0.065, -0.03, '#eef1f2', 'paint'); k.rbox(0.33, 0.07, 0.02, 0.008, 0, T + 0.075, 0.095, '#2b3237', 'plastic', -0.3, 0, 0);
      const sc = S(0.13, 0.05, lcdCanvas([say('電針儀 · 示意', 'Electro unit · sim'), say('參數依醫囑', 'settings per order')], '#7dffb0', 256, 128, [0.6, 0.4, 0.2, 0, 0, 0]), -0.07, T + 0.078, 0.107, 0, null, 0.9); sc.rotation.x = -0.3;
      for (let i = 0; i < 6; i++) { const x = 0.03 + (i % 3) * 0.045, y = T + 0.06 + Math.floor(i / 3) * 0.03; k.cyl(0.011, 0.011, 0.014, x, y, 0.108, '#d0d6d9', 'plastic', Math.PI / 2 - 0.3, 0, 0, 10); }
      const LC = [['#c0392b', '#1a1a1a'], ['#2f7fd0', '#1a1a1a'], ['#f2c230', '#1a1a1a']];
      LC.forEach((pair, i) => pair.forEach((colr, j) => { const x0 = -0.12 + i * 0.04 + j * 0.016; k.cyl(0.005, 0.005, 0.01, x0, T + 0.04, 0.1, colr, 'plastic', Math.PI / 2, 0, 0, 6); k.tube([[x0, T + 0.04, 0.105], [x0 + 0.02, T + 0.02, 0.2], [x0 + 0.05 + j * 0.02, T - 0.05, 0.24], [x0 + 0.04, T - 0.32 - i * 0.05, 0.22], [x0 + 0.02, T - 0.42 - i * 0.04, 0.21]], 0.003, colr, 'rubber', 18, 4); k.box(0.012, 0.03, 0.008, x0 + 0.02, T - 0.44 - i * 0.04, 0.21, colr, 'plastic'); }));
      k.tube([[0.15, T + 0.04, -0.15], [0.2, T - 0.2, -0.18], [0.18, 0.3, -0.2], [0.12, 0.02, -0.3]], 0.004, '#2b3036', 'rubber', 14, 4); k.rbox(0.2, 0.05, 0.16, 0.005, 0, 0.29, 0, '#3b4652', 'plastic');
      return [say('電針儀（教學示意）', 'Electro-acupuncture unit (teaching drawing)'), 'electro', 'electro'];
    },
    tdp(k, g, S, o) {
      const R = o.reach || [0.8, 0], hx = R[0], hz = R[1], hy = 1.2;
      k.cyl(0.24, 0.26, 0.06, 0, 0.06, 0, '#3b4652', 'paint', 0, 0, 0, 24); castors(k, [[0.2, 0], [-0.1, 0.17], [-0.1, -0.17]], 0.03);
      k.cyl(0.022, 0.022, 1.25, 0, 0.7, 0, TSTEEL, 'satin', 0, 0, 0, 10); k.cyl(0.032, 0.032, 0.1, 0, 1.3, 0, '#2b3036', 'plastic', 0, 0, 0, 12); k.rbox(0.11, 0.16, 0.07, 0.01, 0, 0.98, 0.045, '#e8ebed', 'paint'); k.cyl(0.018, 0.018, 0.02, 0, 1.0, 0.085, '#2b3036', 'plastic', Math.PI / 2, 0, 0, 12);
      k.seg([0, 1.32, 0], [hx * 0.55, 1.48, hz * 0.55], 0.016, 0.016, TSTEEL, 'satin', 10); k.seg([hx * 0.55, 1.48, hz * 0.55], [hx, hy + 0.15, hz], 0.016, 0.016, TSTEEL, 'satin', 10); k.sph(0.025, 0.025, 0.025, hx * 0.55, 1.48, hz * 0.55, '#2b3036', 'plastic', 10);
      k.lathe([[0.17, 0], [0.168, 0.04], [0.135, 0.09], [0.06, 0.125], [0.001, 0.13]], hx, hy, hz, '#2f3a44', 'paint', 24); k.tor(0.158, 0.006, hx, hy + 0.003, hz, '#9aa5aa', 'satin', Math.PI / 2, 0, 0, Math.PI * 2, 24); k.box(0.31, 0.005, 0.008, hx, hy + 0.002, hz, '#9aa5aa', 'satin'); k.box(0.008, 0.005, 0.31, hx, hy + 0.002, hz, '#9aa5aa', 'satin');
      const plate = new THREE.Mesh(new THREE.CircleGeometry(0.15, 28), new THREE.MeshBasicMaterial({ color: 0xff7a3a, toneMapped: false })); plate.rotation.x = Math.PI / 2; plate.position.set(hx, hy + 0.012, hz); g.add(plate);
      const halo = new THREE.Mesh(new THREE.CircleGeometry(0.34, 28), new THREE.MeshBasicMaterial({ color: 0xff8a40, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide })); halo.rotation.x = Math.PI / 2; halo.position.set(hx, hy - 0.004, hz); g.add(halo);
      g.userData.tick = (now, dt, rm) => { const f = rm ? 0.92 : 0.86 + 0.08 * Math.sin(now * 1.7) + 0.04 * Math.sin(now * 5.3); plate.material.color.setRGB(f, 0.46 * f, 0.2 * f); halo.material.opacity = 0.1 + 0.08 * f; };
      g.userData.footRect = [-0.27, 0.27, -0.27, 0.27]; return [say('紅外線／TDP 治療燈', 'Infrared / TDP lamp'), 'lamp', 'tdp'];
    },
    moxa(k, g, S, o) {
      k.rbox(0.7, 0.72, 0.5, 0.02, 0, 0.44, 0, '#e2e7e9', 'paint'); castors(k, [[-0.3, -0.21], [0.3, -0.21], [-0.3, 0.21], [0.3, 0.21]], 0.03); for (let i = 0; i < 3; i++) { k.box(0.64, 0.2, 0.012, 0, 0.2 + i * 0.22, 0.252, '#eef2f3', 'paint'); k.box(0.16, 0.018, 0.02, 0, 0.27 + i * 0.22, 0.262, GREY, 'satin'); }
      k.rbox(0.74, 0.03, 0.54, 0.01, 0, 0.815, 0, '#cfd6d9', 'paint'); const T = 0.83;
      k.rbox(0.22, 0.03, 0.13, 0.01, -0.2, T + 0.015, -0.13, '#b8875a', 'paint'); for (let i = 0; i < 8; i++) k.cyl(0.011, 0.011, 0.2, -0.2, T + 0.042 + (i % 2) * 0.019, -0.172 + Math.floor(i / 2) * 0.026, i % 3 ? '#d8c9a0' : '#c9b48a', 'matte', 0, 0, Math.PI / 2, 10);
      k.rbox(0.2, 0.1, 0.14, 0.01, 0.1, T + 0.05, -0.13, '#a0704a', 'paint'); k.box(0.17, 0.004, 0.11, 0.1, T + 0.101, -0.13, '#4a4a4a', 'metal');
      k.cyl(0.06, 0.06, 0.01, -0.24, T + 0.005, 0.1, '#e8e2d4', 'paint', 0, 0, 0, 18); for (let i = 0; i < 3; i++) k.cyl(0.001, 0.014, 0.026, -0.27 + i * 0.026, T + 0.023, 0.1, '#c9b48a', 'matte', 0, 0, 0, 10);
      k.cyl(0.05, 0.06, 0.04, 0.0, T + 0.02, 0.1, '#e8e2d4', 'paint', 0, 0, 0, 16); k.cyl(0.046, 0.046, 0.004, 0, T + 0.041, 0.1, '#bfb6a4', 'matte', 0, 0, 0, 16); k.seg([-0.02, T + 0.045, 0.1], [0.11, T + 0.12, 0.1], 0.011, 0.011, '#d8c9a0', 'matte', 10); k.cyl(0.0115, 0.0115, 0.012, 0.115, T + 0.123, 0.1, '#5a5048', 'matte', 0, 0, -1.05, 10);
      k.rbox(0.08, 0.015, 0.025, 0.005, 0.2, T + 0.008, -0.03, '#c0392b', 'plastic');
      k.cyl(0.042, 0.042, 0.15, 0.27, T + 0.075, 0.15, '#c9d0d3', 'paint', 0, 0, 0, 16); k.cyl(0.046, 0.046, 0.016, 0.27, T + 0.155, 0.15, '#aab3b8', 'paint', 0, 0, 0, 16);
      k.cyl(0.05, 0.05, 0.36, -0.385, 0.42, 0.12, '#c0392b', 'paint', 0, 0, 0, 14); k.cyl(0.02, 0.025, 0.06, -0.385, 0.63, 0.12, '#2b3036', 'plastic', 0, 0, 0, 10);
      k.rbox(0.32, 0.62, 0.32, 0.03, 0.58, 0.33, -0.02, '#eef1f2', 'paint'); for (let i = 0; i < 6; i++) k.box(0.24, 0.012, 0.006, 0.58, 0.18 + i * 0.05, 0.142, '#9aa5aa', 'satin'); k.box(0.04, 0.02, 0.006, 0.66, 0.56, 0.142, '#4dff8f', 'glow');
      const arm = [[0.58, 0.64, -0.02], [0.6, 1.05, -0.04], [0.48, 1.46, -0.0], [0.2, 1.52, 0.08], [0.12, 1.44, 0.1]]; k.tube(arm, 0.03, '#d6dde1', 'plastic', 28, 10);
      const cvA = new THREE.CatmullRomCurve3(arm.map(p => new THREE.Vector3(p[0], p[1], p[2]))); for (let i = 1; i < 14; i++) { const pp = cvA.getPoint(i / 14), tt = cvA.getTangent(i / 14); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tt); const e = new THREE.Euler().setFromQuaternion(q); k.tor(0.032, 0.005, pp.x, pp.y, pp.z, '#b8c1c6', 'satin', e.x, e.y, e.z, Math.PI * 2, 12); }
      k.lathe([[0.13, 0], [0.11, 0.05], [0.05, 0.11], [0.032, 0.14]], 0.12, 1.3, 0.1, '#e9eef0', 'paint', 22); k.tor(0.13, 0.008, 0.12, 1.3, 0.1, '#b8c1c6', 'satin', Math.PI / 2, 0, 0, Math.PI * 2, 22);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff6a20, toneMapped: false })); tip.position.set(0.118, T + 0.124, 0.1); g.add(tip);
      const sm = smokeTexture(); const puffs = []; for (let i = 0; i < 7; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sm, color: 0x8f8f88, transparent: true, depthWrite: false, opacity: 0 })); s.userData.k = i / 7; s.renderOrder = 3; g.add(s); puffs.push(s); }
      g.userData.tick = (now, dt, rm) => { tip.material.color.setRGB(1, 0.36 + (rm ? 0 : 0.14 * Math.sin(now * 7)), 0.1); puffs.forEach(s => { const p = rm ? 0.12 + s.userData.k * 0.8 : (now * 0.2 + s.userData.k) % 1; const wob = rm ? 0 : Math.sin(now * 1.3 + s.userData.k * 9); s.position.set(0.118 + 0.02 * wob * p, T + 0.15 + p * 0.33, 0.1 + 0.015 * Math.cos(now * 1.1 + s.userData.k * 7) * p); const sc = 0.04 + p * 0.14; s.scale.set(sc, sc * 1.5, 1); s.material.opacity = (rm ? 0.3 : 0.62) * Math.sin(Math.PI * Math.min(1, p * 1.15)); }); };
      g.userData.footRect = [-0.42, 0.76, -0.27, 0.27]; return [say('艾灸站（排煙・滅艾筒）', 'Moxibustion station (smoke extractor · snuffer)'), 'moxa', 'moxa'];
    },
    cuptrolley(k, g, S, o) {
      const W2 = 0.66, D = 0.46, T = 0.86; trolleyFrame(k, W2, D, [0.3, T], T);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) { const s = 0.75 + r * 0.18, x = -0.24 + i * 0.1 + r * 0.01, z = -0.14 + r * 0.1; k.lathe([[0.04 * s, 0], [0.047 * s, 0.025 * s], [0.045 * s, 0.06 * s], [0.032 * s, 0.085 * s], [0.001, 0.09 * s]], x, T + 0.012, z, '#dff3ff', 'glass', 16); }
      for (let i = 0; i < 4; i++) { const x = 0.1 + (i % 2) * 0.08, z = -0.13 + Math.floor(i / 2) * 0.09; k.cyl(0.032, 0.036, 0.07, x, T + 0.045, z, '#eaf4f8', 'glass', 0, 0, 0, 14); k.cyl(0.014, 0.014, 0.025, x, T + 0.09, z, '#2f7fd0', 'plastic', 0, 0, 0, 10); }
      k.rbox(0.05, 0.05, 0.16, 0.015, 0.25, T + 0.035, 0.08, '#8a96a0', 'plastic'); k.rbox(0.035, 0.11, 0.04, 0.012, 0.25, T + 0.02, 0.14, '#5a6670', 'plastic', 0.4, 0, 0); k.tube([[0.25, T + 0.04, 0.0], [0.27, T + 0.03, -0.08], [0.22, T + 0.02, -0.18]], 0.004, '#eef6f8', 'rubber', 10, 4);
      [['#5fa88a', -0.02], ['#2b2420', 0.06]].forEach(([c2, x]) => k.rbox(0.1, 0.008, 0.065, 0.02, x, T + 0.014, 0.16, c2, 'paint'));
      [-0.26, -0.21].forEach((x, i) => { k.cyl(0.022, 0.024, 0.12, x, T + 0.07, 0.17, i ? '#b06a1a' : '#e8f0f2', 'glass', 0, 0, 0, 10); k.cyl(0.012, 0.012, 0.03, x, T + 0.145, 0.17, '#2b3036', 'plastic', 0, 0, 0, 8); });
      for (let j = 0; j < 3; j++) k.rbox(0.36, 0.05, 0.26, 0.015, -0.05, 0.33 + j * 0.05, 0, j % 2 ? '#e3ece6' : '#f4f6f4', 'cloth'); k.rbox(0.18, 0.1, 0.14, 0.01, 0.2, 0.36, 0.08, '#b8c1c6', 'metal');
      return [say('拔罐與刮痧車', 'Cupping & gua sha trolley'), 'cups', 'cuptrolley'];
    },
    baycurtain(k, g, S, o) {
      const w = o.w || 2.5, d = o.d || 2.7, y = ROOM.h - 0.12, cc = o.c || '#9fc9c0';
      k.box(0.03, 0.03, d, -w / 2, y, 0, '#cfd6da', 'satin'); k.box(0.03, 0.03, d, w / 2, y, 0, '#cfd6da', 'satin'); k.box(w + 0.03, 0.03, 0.03, 0, y, d / 2, '#cfd6da', 'satin');
      (o.sides || [-1]).forEach(s => { const x = s * w / 2, hc = y - 0.62, yc = 0.36 + hc / 2; for (let i = 0; i < 9; i++) { const z = -d / 2 + 0.1 + i * 0.075, a = i % 2 ? 0.75 : -0.75; k.box(0.012, hc, 0.11, x, yc, z, i % 2 ? cc : '#b4d6ce', 'cloth', 0, a, 0); k.box(0.012, 0.24, 0.11, x, y - 0.15, z, '#eef3f1', 'cloth', 0, a, 0); k.cyl(0.012, 0.012, 0.03, x, y - 0.02, z, '#cfd6da', 'satin', 0, 0, 0, 6); } });
      return [say('床邊隔簾', 'Bay curtain'), 'curtain', 'baycurtain'];
    },
    baizigui(k, g, S, o) {
      const C = o.cols || 12, R = o.rows || 8, dw = 0.27, dh = 0.19, W2 = C * dw + 0.12, D = 0.55, y0 = 0.8, wood = '#6b3a22', face = '#7d4a2c', names = herbNames();
      k.rbox(W2, y0 - 0.06, D, 0.01, 0, (y0 - 0.06) / 2, 0, wood, 'paint'); const nd = 6, dwB = (W2 - 0.12) / nd; for (let i = 0; i < nd; i++) { const x = -W2 / 2 + 0.06 + (i + 0.5) * dwB; k.box(dwB - 0.02, y0 - 0.22, 0.015, x, (y0 - 0.06) / 2, D / 2 + 0.006, face, 'paint'); k.cyl(0.012, 0.012, 0.02, x + (i % 2 ? -1 : 1) * (dwB / 2 - 0.06), y0 * 0.5, D / 2 + 0.02, BRASS, 'gold', Math.PI / 2, 0, 0, 10); }
      k.box(W2 + 0.04, 0.04, D + 0.06, 0, y0 - 0.04, 0.02, WOOD_D, 'paint'); k.box(W2, 0.08, 0.02, 0, 0.04, D / 2 + 0.01, '#3a2414', 'paint');
      const top = y0 + R * dh; k.box(W2, R * dh + 0.02, 0.03, 0, y0 + R * dh / 2, -D / 2 + 0.015, wood, 'paint'); [-1, 1].forEach(s => k.box(0.06, R * dh + 0.02, D, s * (W2 / 2 - 0.03), y0 + R * dh / 2, 0, wood, 'paint')); k.box(C * dw, R * dh, 0.01, 0, y0 + R * dh / 2, D / 2 - 0.03, '#2a160c', 'matte');
      for (let r = 0; r < R; r++) for (let i = 0; i < C; i++) { const x = -C * dw / 2 + (i + 0.5) * dw, y = y0 + (r + 0.5) * dh; k.box(dw - 0.012, dh - 0.012, 0.02, x, y, D / 2 - 0.005, face, 'paint'); k.disc(0.02, x, y - 0.048, D / 2 + 0.0055, BRASS, 'gold', 0, 0, 0, 12); k.tor(0.015, 0.0032, x, y - 0.064, D / 2 + 0.01, BRASS, 'gold', 0, 0, 0, Math.PI * 2, 10); }
      tcmPlane(g, C * dw, R * dh, drawerLabelTexture(C, R, names), 0, y0 + R * dh / 2, D / 2 + 0.0062, 0, { transparent: true, rough: 0.7 });
      k.box(W2 + 0.1, 0.06, D + 0.08, 0, top + 0.04, 0.02, WOOD_D, 'paint'); k.box(W2, 0.025, D * 0.7, 0, top + 0.08, -0.06, wood, 'paint');
      for (let i = 0; i < 10; i++) { const x = -W2 / 2 + 0.2 + i * (W2 - 0.4) / 9; k.lathe([[0.001, 0], [0.065, 0.005], [0.095, 0.075], [0.095, 0.15], [0.06, 0.21], [0.048, 0.23], [0.001, 0.235]], x, top + 0.093, -0.06, '#f2f4f6', 'paint', 18); k.cyl(0.097, 0.097, 0.045, x, top + 0.093 + 0.11, -0.06, '#2f4f8a', 'paint', 0, 0, 0, 18); k.sph(0.05, 0.03, 0.05, x, top + 0.093 + 0.24, -0.06, '#2f4f8a', 'paint', 12); k.box(0.045, 0.06, 0.004, x, top + 0.093 + 0.11, 0.04, '#b0242c', 'paint'); }
      const gz = -0.06 + D * 0.35 + 0.004; k.box(W2 - 0.08, 0.4, 0.008, 0, top + 0.3, gz, '#dff3ff', 'glass'); for (let i = 0; i <= 6; i++) k.box(0.025, 0.42, 0.02, -W2 / 2 + 0.04 + i * (W2 - 0.08) / 6, top + 0.3, gz + 0.004, WOOD_D, 'paint'); k.box(W2 - 0.04, 0.03, 0.03, 0, top + 0.515, gz, WOOD_D, 'paint'); [-1, 1].forEach(s => k.box(0.03, 0.44, D * 0.7, s * (W2 / 2 - 0.02), top + 0.3, -0.06, WOOD_D, 'paint')); k.box(W2, 0.03, D * 0.7, 0, top + 0.53, -0.06, WOOD_D, 'paint');
      k.box(1.5, 0.4, 0.04, 0, top + 0.76, -0.2, '#3a2414', 'paint'); tcmPlane(g, 1.44, 0.34, plaqueCanvas(say('懸壺濟世', 'HERBAL DISPENSARY'), '#3a2414', '#e8c86a', 70), 0, top + 0.76, -0.178, 0, { rough: 0.5 });
      g.userData.footRect = [-W2 / 2, W2 / 2, -D / 2, D / 2 + 0.03]; return [say('百子櫃（中藥飲片斗櫃）', 'Herb drawer cabinet (百子櫃)'), 'cabinet', 'baizigui'];
    },
    dispense(k, g, S, o) {
      const L = o.len || 3.0, D = 0.7, H = 0.92;
      k.rbox(L, H - 0.12, D - 0.06, 0.01, 0, (H - 0.12) / 2 + 0.08, 0, '#7d4a2c', 'paint'); k.box(L - 0.04, 0.08, D - 0.12, 0, 0.04, 0, '#3a2414', 'matte'); k.rbox(L + 0.06, 0.04, D, 0.01, 0, H - 0.02, 0, '#c8a878', 'paint');
      for (let i = 0; i < 6; i++) { const x = -L / 2 + (i + 0.5) * L / 6; k.box(L / 6 - 0.05, H - 0.3, 0.012, x, H / 2 + 0.02, D / 2 - 0.024, '#8a5a36', 'paint'); k.box(L / 6 - 0.11, H - 0.42, 0.014, x, H / 2 + 0.02, D / 2 - 0.02, '#7d4a2c', 'paint'); for (let j = 0; j < 2; j++) { k.box(L / 6 - 0.06, 0.16, 0.012, x, 0.62 - j * 0.2, -D / 2 + 0.024, '#8a5a36', 'paint'); k.box(0.08, 0.014, 0.018, x, 0.64 - j * 0.2, -D / 2 + 0.014, BRASS, 'gold'); } }
      for (let i = 0; i < 5; i++) { const x = -0.65 + i * 0.36, z = -0.08; k.box(0.3, 0.002, 0.3, x, H + 0.001, z, i % 2 ? '#f4efe2' : '#efe6cf', 'matte', 0, 0.05 * (i % 3 - 1), 0); for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2 + i; k.sph(0.034 + (j % 3) * 0.006, 0.013 + (j % 2) * 0.006, 0.03 + (j % 2) * 0.008, x + Math.cos(a) * 0.075, H + 0.008, z + Math.sin(a) * 0.075, HERB_TONES[(i * 3 + j) % HERB_TONES.length], 'matte', 8); } }
      const sx = -L / 2 + 0.3, sz = -0.12; k.rbox(0.16, 0.03, 0.12, 0.01, sx, H + 0.015, sz, WOOD_D, 'paint'); k.cyl(0.01, 0.01, 0.6, sx, H + 0.3, sz, WOOD_D, 'paint', 0, 0, 0, 8); k.seg([sx, H + 0.59, sz], [sx + 0.13, H + 0.61, sz], 0.008, 0.008, WOOD_D, 'paint', 6);
      const bx = sx + 0.13, by = H + 0.45; k.seg([bx, H + 0.61, sz], [bx, by + 0.004, sz], 0.0018, 0.0018, '#e8e0c8', 'matte', 4); k.seg([bx - 0.08, by, sz], [bx + 0.3, by, sz], 0.004, 0.003, '#d8c48a', 'paint', 8); for (let i = 0; i < 10; i++) k.sph(0.0024, 0.0024, 0.0024, bx + 0.02 + i * 0.027, by + 0.004, sz, '#3a2414', 'matte', 4);
      [[0.03, 0], [-0.015, 0.026], [-0.015, -0.026]].forEach(([dx, dz]) => k.seg([bx - 0.075, by, sz], [bx - 0.075 + dx * 2, by - 0.16, sz + dz * 2], 0.0012, 0.0012, '#e8e0c8', 'matte', 4)); bowl(k, 0.068, 0.022, bx - 0.075, by - 0.18, sz, BRASS, 'gold', 20);
      k.seg([bx + 0.19, by, sz], [bx + 0.19, by - 0.1, sz], 0.0012, 0.0012, '#e8e0c8', 'matte', 4); k.cyl(0.012, 0.016, 0.032, bx + 0.19, by - 0.116, sz, BRASS, 'gold', 0, 0, 0, 10);
      const ex = sx + 0.62; k.rbox(0.24, 0.07, 0.3, 0.015, ex, H + 0.035, -0.12, '#eef1f2', 'paint'); k.cyl(0.09, 0.09, 0.008, ex, H + 0.075, -0.15, TSTEEL, 'satin', 0, 0, 0, 24); k.box(0.16, 0.035, 0.03, ex, H + 0.04, 0.02, '#2b3237', 'plastic', -0.4, 0, 0);
      const disp = S(0.12, 0.028, lcdCanvas([say('歸零', 'ZERO')], '#7dffb0', 192, 48), ex, H + 0.047, 0.037, 0, null, 0.9); disp.rotation.x = -0.4;
      [0.06, 0.24].forEach((dx, i) => bowl(k, 0.075 - i * 0.01, 0.055, ex + 0.12 + dx, H, 0.1, BRASS, 'gold', 20)); k.seg([ex + 0.32, H + 0.012, 0.2], [ex + 0.48, H + 0.012, 0.22], 0.006, 0.006, '#b07a3a', 'gold', 8); k.box(0.05, 0.004, 0.06, ex + 0.52, H + 0.012, 0.225, '#b07a3a', 'gold');
      tcmPlane(g, 0.21, 0.28, rxPadCanvas(), L / 2 - 0.55, H + 0.004, -0.05, 0.2, { rx: -Math.PI / 2 }); k.box(0.3, 0.035, 0.3, L / 2 - 0.22, H + 0.018, -0.1, '#efe6cf', 'matte'); k.rbox(0.06, 0.07, 0.06, 0.01, L / 2 - 0.25, H + 0.07, 0.18, '#b0242c', 'plastic');
      [-0.9, 0, 0.9].forEach(x => { k.cyl(0.004, 0.004, ROOM.h - 2.35, x, (ROOM.h + 2.35) / 2, 0, '#2b3036', 'matte', 0, 0, 0, 4); k.lathe([[0.17, 0], [0.15, 0.06], [0.07, 0.15], [0.03, 0.18], [0.001, 0.185]], x, 2.17, 0, '#2f4f3a', 'paint', 22); k.disc(0.15, x, 2.172, 0, '#ffdcae', 'glow', Math.PI / 2, 0, 0, 22); });
      return [say('調劑台（戥秤・電子秤・藥紙）', 'Dispensing counter (steelyard · balance · wrapping papers)'), 'scale', 'dispense'];
    },
    grinder(k, g, S, o) {
      const L = 1.6, D = 0.62, H = 0.86; k.rbox(L, 0.05, D, 0.01, 0, H - 0.025, 0, WOOD_L, 'paint'); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => k.box(0.06, H - 0.05, 0.06, sx * (L / 2 - 0.05), (H - 0.05) / 2, sz * (D / 2 - 0.05), WOOD_D, 'paint')); k.box(L - 0.1, 0.025, D - 0.1, 0, 0.25, 0, WOOD, 'paint');
      bowl(k, 0.11, 0.12, -0.55, H, 0.0, '#8a7a5a', 'metal', 22); k.seg([-0.55, H + 0.05, 0.0], [-0.5, H + 0.3, -0.06], 0.022, 0.016, '#6b5a3a', 'metal', 10); k.sph(0.026, 0.026, 0.026, -0.55, H + 0.05, 0, '#6b5a3a', 'metal', 10);
      const nx = -0.12; k.rbox(0.5, 0.08, 0.13, 0.03, nx, H + 0.04, 0.0, '#3a3a3a', 'metal'); k.box(0.44, 0.006, 0.045, nx, H + 0.081, 0.0, '#151515', 'matte'); k.cyl(0.08, 0.08, 0.025, nx + 0.05, H + 0.1, 0.0, '#4a4a4a', 'metal', Math.PI / 2, 0, 0, 22); k.seg([nx + 0.05, H + 0.1, -0.16], [nx + 0.05, H + 0.1, 0.16], 0.011, 0.011, WOOD_D, 'paint', 8);
      const cx = 0.35; k.rbox(0.42, 0.05, 0.24, 0.01, cx, H + 0.025, 0.0, WOOD_L, 'paint'); k.box(0.38, 0.065, 0.006, cx, H + 0.12, -0.08, '#9aa5aa', 'metal', 0, 0, 0.32); k.seg([cx + 0.18, H + 0.18, -0.08], [cx + 0.3, H + 0.22, -0.08], 0.016, 0.016, WOOD_D, 'paint', 8); k.box(0.03, 0.06, 0.03, cx - 0.19, H + 0.06, -0.08, '#5a5a5a', 'metal');
      for (let i = 0; i < 8; i++) k.cyl(0.018, 0.018, 0.004, cx - 0.08 + (i % 4) * 0.03, H + 0.053 + Math.floor(i / 4) * 0.004, 0.06 + (i % 3) * 0.012, '#d8c27a', 'matte', 0, 0, 0, 8);
      k.tor(0.13, 0.013, 0.66, H + 0.03, 0.12, WOOD_L, 'paint', Math.PI / 2, 0, 0, Math.PI * 2, 22); k.disc(0.125, 0.66, H + 0.022, 0.12, '#8a8070', 'matte', -Math.PI / 2, 0, 0, 22);
      k.cyl(0.075, 0.085, 0.22, 0.64, H + 0.11, -0.16, '#d5dbde', 'paint', 0, 0, 0, 18); k.sph(0.075, 0.04, 0.075, 0.64, H + 0.22, -0.16, '#c9d0d3', 'paint', 14);
      for (let i = 0; i < 5; i++) { k.cyl(0.05, 0.05, 0.14, -0.6 + i * 0.28, 0.335, 0.05, '#eef6f8', 'glass', 0, 0, 0, 12); k.cyl(0.045, 0.045, 0.08, -0.6 + i * 0.28, 0.305, 0.05, HERB_TONES[i + 2], 'matte', 0, 0, 0, 10); }
      return [say('搗藥與切藥台', 'Grinding & cutting bench'), 'grinder', 'grinder'];
    },
    decoction(k, g, S, o) {
      [-0.32, 0.32].forEach((x, i) => {
        k.rbox(0.55, 0.98, 0.6, 0.03, x, 0.55, 0, '#dfe4e6', 'paint'); k.box(0.56, 0.02, 0.61, x, 0.7, 0, '#c9d0d3', 'satin'); [[-0.22, -0.24], [0.22, -0.24], [-0.22, 0.24], [0.22, 0.24]].forEach(([dx, dz]) => k.cyl(0.02, 0.025, 0.06, x + dx, 0.03, dz, '#2b3036', 'rubber', 0, 0, 0, 8));
        k.cyl(0.24, 0.24, 0.22, x, 1.15, -0.02, '#d5dbde', 'paint', 0, 0, 0, 24); k.sph(0.24, 0.07, 0.24, x, 1.26, -0.02, '#c9d0d3', 'paint', 20); k.cyl(0.03, 0.03, 0.05, x, 1.33, -0.02, '#2b3036', 'plastic', 0, 0, 0, 10);
        k.cyl(0.042, 0.042, 0.02, x + 0.16, 1.15, 0.225, '#9aa5aa', 'metal', Math.PI / 2, 0, 0, 16); k.disc(0.034, x + 0.16, 1.15, 0.236, '#f4f6f8', 'paint', 0, 0, 0, 16); k.box(0.003, 0.028, 0.002, x + 0.16, 1.158, 0.238, '#c0392b', 'paint', 0, 0, -0.6);
        k.rbox(0.26, 0.18, 0.02, 0.01, x, 0.86, 0.3, '#2b3237', 'plastic'); S(0.22, 0.13, lcdCanvas(i ? [say('待機', 'Standby'), say('教學示意', 'teaching sim')] : [say('煎煮中', 'Decocting'), say('依處方煎法（示意）', 'per prescription (sim)')], i ? '#ffd166' : '#7dffb0', 256, 150), x, 0.865, 0.312, 0, null, 0.9);
        [-0.06, 0.0, 0.06].forEach((dx, j) => k.cyl(0.013, 0.013, 0.012, x + dx, 0.74, 0.31, ['#2fa36b', '#f2c230', '#c0392b'][j], 'plastic', Math.PI / 2, 0, 0, 10));
        k.seg([x, 0.3, 0.28], [x, 0.3, 0.38], 0.016, 0.016, TSTEEL, 'metal', 10); k.seg([x, 0.3, 0.38], [x, 0.24, 0.38], 0.014, 0.012, TSTEEL, 'metal', 10); k.rbox(0.3, 0.03, 0.16, 0.01, x, 0.12, 0.36, '#b8c1c6', 'metal');
      });
      k.tube([[0.32, 0.4, -0.31], [0.0, 0.3, -0.33], [-0.32, 0.4, -0.31]], 0.018, TSTEEL, 'metal', 16, 8); k.tube([[0.5, 0.4, -0.3], [0.62, 0.35, -0.3], [0.9, 0.35, -0.3], [1.1, 0.6, -0.28]], 0.018, TSTEEL, 'metal', 16, 8);
      return [say('煎藥機', 'Decoction machines'), 'decoction', 'decoction'];
    },
    packer(k, g, S, o) {
      k.rbox(0.7, 1.45, 0.6, 0.03, 0, 0.75, 0, '#dfe4e6', 'paint'); k.lathe([[0.22, 0.2], [0.2, 0.12], [0.08, 0.02], [0.05, 0]], 0, 1.48, -0.05, '#d0d6d9', 'paint', 22); k.cyl(0.05, 0.05, 0.08, 0, 1.46, -0.05, '#b8c1c6', 'metal', 0, 0, 0, 12);
      k.box(0.5, 0.38, 0.01, 0, 1.05, 0.302, '#dff3ff', 'glass'); k.rbox(0.36, 0.08, 0.2, 0.01, 0, 1.06, 0.16, '#9aa5aa', 'metal');
      for (let i = 0; i < 4; i++) k.rbox(0.13, 0.008, 0.2, 0.004, 0, 0.7 - i * 0.012, 0.36 + i * 0.03, '#d9c08a', 'matte', -0.2, 0, 0); k.rbox(0.45, 0.04, 0.32, 0.01, 0, 0.6, 0.42, '#b8c1c6', 'metal'); for (let i = 0; i < 6; i++) k.rbox(0.13, 0.012, 0.2, 0.004, -0.12 + (i % 3) * 0.12, 0.628 + Math.floor(i / 3) * 0.013, 0.42, i % 2 ? '#d9c08a' : '#cdb27a', 'matte');
      k.rbox(0.3, 0.2, 0.02, 0.01, 0.0, 1.35, 0.3, '#2b3237', 'plastic'); S(0.26, 0.16, lcdCanvas([say('分裝中', 'Packing'), say('封口檢查（示意）', 'seal check (sim)')], '#7dffb0', 256, 160), 0, 1.35, 0.312, 0, null, 0.9); k.cyl(0.03, 0.03, 0.03, 0.27, 1.35, 0.31, '#c0392b', 'plastic', Math.PI / 2, 0, 0, 14);
      return [say('藥液自動包裝機', 'Decoction packing machine'), 'packer', 'packer'];
    },
    granules(k, g, S, o) {
      const L = o.len || 2.0, D = 0.38, R = 5, n = 14; [-1, 1].forEach(s => k.box(0.03, 2.0, D, s * (L / 2 - 0.015), 1.0, 0, '#cfd6da', 'satin')); k.box(L, 2.0, 0.015, 0, 1.0, -D / 2 + 0.008, '#e8ecea', 'paint');
      const names = FORMULA_NAMES.concat(herbNames().slice(0, 60));
      for (let r = 0; r < R; r++) { const y = 0.12 + r * 0.38; k.box(L - 0.04, 0.02, D, 0, y, 0, '#dfe5e8', 'satin'); k.box(L - 0.04, 0.04, 0.012, 0, y + 0.02, D / 2 - 0.006, '#cfd6da', 'satin'); for (let i = 0; i < n; i++) { const x = -L / 2 + 0.09 + i * (L - 0.18) / (n - 1); k.cyl(0.045, 0.045, 0.16, x, y + 0.09, 0.03, '#f4f6f4', 'paint', 0, 0, 0, 12); k.cyl(0.03, 0.03, 0.03, x, y + 0.185, 0.03, ['#2f7f6a', '#b0242c', '#2f4f8a', '#c98a1a'][(r + i) % 4], 'plastic', 0, 0, 0, 10); } }
      const lab = granuleLabelCanvas(R, n, names); const lt = tex(lab), pw = (L - 0.18) * n / (n - 1); for (let r = 0; r < R; r++) { const m = tcmPlane(g, pw, 0.064, lt, 0, 0.12 + r * 0.38 + 0.09, 0.077, 0, { transparent: true, rough: 0.6 }); const rr = R - 1 - r; m.geometry.attributes.uv.array.set([0, 1 - rr / R, 1, 1 - rr / R, 0, 1 - (rr + 0.8) / R, 1, 1 - (rr + 0.8) / R]); m.geometry.attributes.uv.needsUpdate = true; }
      k.box(L, 0.04, D, 0, 2.0, 0, '#cfd6da', 'satin'); return [say('科學中藥（濃縮顆粒）架', 'Concentrated granule shelves (科學中藥)'), 'granules', 'granules'];
    },
    rxstation(k, g, S, o) {
      const T = 0.76; k.rbox(1.4, 0.04, 0.7, 0.01, 0, T - 0.02, 0, '#dfe6e2', 'paint'); [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]].forEach(([x, z]) => k.box(0.05, T - 0.04, 0.05, x, (T - 0.04) / 2, z, GREY, 'satin')); k.rbox(0.42, 0.6, 0.6, 0.01, 0.45, 0.32, 0, '#cfd6da', 'paint');
      k.rbox(0.62, 0.38, 0.04, 0.015, -0.15, T + 0.32, -0.2, '#1d262c', 'plastic', -0.06, 0, 0); k.cyl(0.02, 0.02, 0.16, -0.15, T + 0.08, -0.22, GREY, 'satin', 0, 0, 0, 8); k.box(0.22, 0.012, 0.16, -0.15, T + 0.006, -0.22, GREY, 'satin');
      const sc = S(0.58, 0.34, rxCheckCanvas(), -0.15, T + 0.32, -0.177, 0, null, 0.9); sc.rotation.x = -0.06;
      k.box(0.44, 0.015, 0.14, -0.15, T + 0.008, 0.12, '#2d3436', 'plastic'); k.rbox(0.05, 0.02, 0.09, 0.01, 0.15, T + 0.01, 0.14, '#2d3436', 'plastic');
      k.rbox(0.07, 0.13, 0.06, 0.02, 0.38, T + 0.065, -0.12, '#2b3036', 'plastic', 0.2, 0, 0); k.box(0.04, 0.02, 0.006, 0.38, T + 0.12, -0.085, '#ff3b3b', 'glow');
      k.rbox(0.2, 0.14, 0.24, 0.02, 0.5, T + 0.07, -0.15, '#f4f6f8', 'paint'); k.cyl(0.04, 0.04, 0.1, 0.5, T + 0.15, -0.15, '#ffffff', 'cloth', 0, 0, Math.PI / 2, 12);
      k.rbox(0.3, 0.06, 0.24, 0.005, 0.45, T + 0.03, 0.18, '#3f6f96', 'plastic'); for (let i = 0; i < 4; i++) k.box(0.21, 0.003, 0.28, 0.45, T + 0.045 + i * 0.004, 0.18, '#fbf6e6', 'matte', 0, (i - 2) * 0.05, 0);
      chair(k, -0.15, 0.62, 0, '#3b5063');
      return [say('處方審核工作站', 'Prescription-check workstation'), 'workstation', 'rxstation'];
    },
    passwindow(k, g, S, o) {
      const W2 = 1.5; k.rbox(W2, 0.95, 0.45, 0.01, 0, 0.475, 0.18, WOOD, 'paint'); k.rbox(W2 + 0.06, 0.04, 0.5, 0.01, 0, 0.97, 0.18, '#c8a878', 'paint'); for (let i = 0; i < 3; i++) k.box(W2 / 3 - 0.04, 0.8, 0.012, -W2 / 3 + i * W2 / 3, 0.47, 0.41, WOOD_D, 'paint');
      [-1, 1].forEach(s => k.box(0.08, 1.1, 0.12, s * 0.7, 1.55, 0.02, WOOD_D, 'paint')); k.box(1.48, 0.08, 0.12, 0, 2.06, 0.02, WOOD_D, 'paint'); k.box(1.48, 0.06, 0.12, 0, 1.02, 0.02, WOOD_D, 'paint');
      tcmPlane(g, 1.32, 0.98, corridorCanvas(), 0, 1.54, -0.015, 0, { rough: 0.9 }); [-0.33, 0.33].forEach((x, i) => { k.box(0.66, 0.96, 0.008, x, 1.54, 0.02 + i * 0.02, '#dff3ff', 'glass'); k.box(0.02, 0.96, 0.02, x + (i ? -0.32 : 0.32), 1.54, 0.03 + i * 0.02, WOOD_D, 'paint'); }); k.box(0.3, 0.02, 0.008, 0, 1.18, 0.05, '#f4f6f8', 'paint');
      k.rbox(0.62, 0.17, 0.05, 0.01, 0, 2.28, 0.04, '#1b2226', 'plastic'); S(0.56, 0.12, lcdCanvas([say('取藥號 0128', 'Pick-up No. 0128')], '#ff5a3c', 512, 110), 0, 2.28, 0.067, 0, null, 1);
      k.cyl(0.04, 0.045, 0.02, 0.55, 0.995, 0.25, BRASS, 'gold', 0, 0, 0, 16); k.sph(0.035, 0.03, 0.035, 0.55, 1.01, 0.25, BRASS, 'gold', 12);
      [[-0.45, 0.0], [-0.25, 0.02], [0.05, -0.02]].forEach(([x, rz], i) => { k.rbox(0.16, 0.24, 0.09, 0.01, x, 1.11, 0.2, i % 2 ? '#c8a878' : '#e6d7b8', 'matte', 0, 0, rz); k.box(0.1, 0.06, 0.002, x, 1.13, 0.246, '#ffffff', 'paint', 0, 0, rz); });
      k.rbox(0.36, 0.1, 0.24, 0.02, 0.28, 1.04, 0.24, '#b8875a', 'paint');
      return [say('發藥窗口', 'Dispensing window'), 'desk', 'passwindow'];
    },
    traction(k, g, S, o) {
      const H = 0.66, pad = '#2f4f7a'; k.rbox(1.6, 0.1, 0.5, 0.02, 0, 0.12, 0, '#cfd6da', 'paint'); [-0.6, 0.6].forEach(x => k.rbox(0.16, H - 0.2, 0.3, 0.02, x, (H - 0.2) / 2 + 0.15, 0, '#dfe5e8', 'paint'));
      k.rbox(0.98, 0.1, 0.7, 0.04, -0.52, H, 0, pad, 'paint'); k.rbox(0.92, 0.1, 0.7, 0.04, 0.5, H, 0, pad, 'paint'); [-1, 1].forEach(s => k.box(1.0, 0.025, 0.03, 0.5, H - 0.07, s * 0.3, TSTEEL, 'satin')); k.rbox(0.3, 0.08, 0.44, 0.03, -0.86, H + 0.09, 0, '#3f5f8a', 'cloth');
      [-1, 1].forEach(s => { k.box(0.05, 1.95, 0.05, -1.15, 0.975, s * 0.36, '#e9edf0', 'paint'); k.rbox(0.3, 0.04, 0.12, 0.01, -1.15, 0.02, s * 0.36, '#cfd6da', 'paint'); }); k.box(0.05, 0.05, 0.77, -1.15, 1.95, 0, '#e9edf0', 'paint'); k.box(0.42, 0.05, 0.05, -0.94, 1.95, 0, '#e9edf0', 'paint');
      k.cyl(0.04, 0.04, 0.03, -0.75, 1.9, 0, '#9aa5aa', 'metal', Math.PI / 2, 0, 0, 16); k.seg([-0.75, 1.86, 0], [-0.8, 1.2, 0], 0.004, 0.004, '#f4f6f8', 'matte', 6); k.seg([-0.92, 1.2, 0], [-0.68, 1.2, 0], 0.008, 0.008, '#9aa5aa', 'metal', 8); [-1, 1].forEach(s => k.tube([[-0.92 + (s > 0 ? 0.24 : 0), 1.2, 0], [-0.86, 1.0, s * 0.09], [-0.82, 0.85, s * 0.1]], 0.012, '#2b3f5e', 'cloth', 10, 5));
      [[-0.35, '#22344a'], [0.35, '#22344a']].forEach(([x, c2]) => { k.box(0.16, 0.012, 0.9, x, H + 0.06, 0, c2, 'cloth'); k.box(0.05, 0.02, 0.06, x, H + 0.07, 0.44, '#9aa5aa', 'metal'); });
      k.rbox(0.36, 0.5, 0.42, 0.03, 1.2, 0.5, 0, '#e9edf0', 'paint'); k.seg([1.02, 0.7, 0], [0.85, 0.72, 0], 0.004, 0.004, '#f4f6f8', 'matte', 6);
      k.seg([1.3, 0.75, 0.25], [1.3, 1.25, 0.32], 0.02, 0.02, TSTEEL, 'satin', 8); k.rbox(0.3, 0.22, 0.04, 0.015, 1.3, 1.35, 0.34, '#2b3237', 'plastic', -0.3, 0, -0.6); const sc = S(0.26, 0.17, lcdCanvas([say('牽引（示意）', 'Traction (sim)'), say('數值依醫囑設定', 'values per order'), say('病人持緊急停止鈕', 'patient holds the stop')], '#7dffb0', 256, 168), 1.31, 1.352, 0.362, 0, null, 0.9); sc.rotation.set(-0.3, -0.6, 0, 'YXZ');
      k.tube([[1.05, 0.62, 0.22], [0.8, 0.5, 0.42], [0.2, 0.6, 0.4], [0.0, H + 0.08, 0.3]], 0.004, '#2b3036', 'rubber', 18, 4); k.rbox(0.05, 0.1, 0.05, 0.02, 0.0, H + 0.08, 0.28, '#f4f6f8', 'plastic'); k.cyl(0.018, 0.018, 0.012, 0.0, H + 0.13, 0.28, '#c0392b', 'plastic', 0, 0, 0, 12);
      return [say('頸腰椎牽引床', 'Cervical / lumbar traction table'), 'traction', 'traction'];
    },
    hotpack(k, g, S, o) {
      k.rbox(0.62, 0.66, 0.46, 0.02, 0, 0.55, 0, '#dfe4e6', 'paint'); [[-0.27, -0.19], [0.27, -0.19], [-0.27, 0.19], [0.27, 0.19]].forEach(([x, z]) => k.cyl(0.015, 0.015, 0.2, x, 0.12, z, TSTEEL, 'satin', 0, 0, 0, 8)); castors(k, [[-0.27, -0.19], [0.27, -0.19], [-0.27, 0.19], [0.27, 0.19]], 0.025);
      k.box(0.56, 0.005, 0.4, 0, 0.86, 0, '#7fb3c8', 'glass'); for (let i = 0; i < 4; i++) { k.rbox(0.12, 0.3, 0.035, 0.01, -0.2 + i * 0.13, 0.75, -0.05 + (i % 2) * 0.06, '#b89a6a', 'cloth'); k.seg([-0.2 + i * 0.13, 0.9, -0.05 + (i % 2) * 0.06], [-0.2 + i * 0.13, 0.95, -0.12], 0.003, 0.003, '#9aa5aa', 'metal', 4); }
      k.at(0, 0.89, -0.23, 0, () => k.rbox(0.62, 0.025, 0.46, 0.01, 0, 0, 0.23, '#d5dbde', 'paint'), -1.1, 0); k.seg([-0.3, 0.9, 0.23], [0.3, 0.9, 0.23], 0.008, 0.008, '#c9d0d3', 'metal', 6);
      k.cyl(0.05, 0.05, 0.02, 0.15, 0.62, 0.235, '#9aa5aa', 'metal', Math.PI / 2, 0, 0, 16); k.disc(0.042, 0.15, 0.62, 0.246, '#f4f6f8', 'paint', 0, 0, 0, 16); k.box(0.003, 0.034, 0.002, 0.15, 0.628, 0.248, '#c0392b', 'paint', 0, 0, 0.5); k.sph(0.012, 0.012, 0.006, -0.15, 0.62, 0.234, '#4dff8f', 'glow', 8);
      for (let j = 0; j < 4; j++) k.rbox(0.34, 0.05, 0.24, 0.015, 0.0, 0.2 + j * 0.05, 0.4, j % 2 ? '#e3ece6' : '#f4f6f4', 'cloth'); k.seg([-0.2, 0.92, 0.25], [-0.05, 0.95, 0.3], 0.006, 0.006, TSTEEL, 'metal', 6);
      return [say('熱敷包加熱箱', 'Hot-pack heater (hydrocollator)'), 'hotpack', 'hotpack'];
    },
    mats(k, g, S, o) {
      const C = ['#4f8f7f', '#6f9f8a', '#5a7f9a'];
      for (let r = 0; r < 3; r++) for (let c2 = 0; c2 < 2; c2++) { const x = (c2 - 0.5) * 2.0, z = (r - 1) * 0.86; k.rbox(1.8, 0.018, 0.62, 0.008, x, 0.009, z, C[(r + c2) % 3], 'rubber'); k.box(1.76, 0.002, 0.012, x, 0.019, z + 0.26, '#e9efe9', 'matte'); }
      k.cyl(0.2, 0.22, 0.12, 0, 0.06, 0, '#b0242c', 'cloth', 0, 0, 0, 20); k.rbox(0.23, 0.08, 0.15, 0.02, 0.36, 0.04, 0.1, '#c8a878', 'matte'); k.rbox(0.23, 0.08, 0.15, 0.02, 0.36, 0.04, -0.12, '#c8a878', 'matte');
      k.cyl(0.07, 0.07, 0.62, -1.95, 0.07, 1.2, '#6f9f8a', 'rubber', Math.PI / 2, 0, 0, 16);
      g.userData.footRect = [-0.24, 0.5, -0.24, 0.24]; return [say('導引運動墊區', 'Exercise mat area (daoyin)'), 'mat', 'mats'];
    },
    poster8(k, g, S, o) { k.rbox(1.66, 1.06, 0.03, 0.01, 0, 1.68, 0, WOOD_D, 'paint'); tcmPlane(g, 1.6, 1.0, baduanjinCanvas(), 0, 1.68, 0.017, 0, { rough: 0.7 }); g.userData.footRect = [-0.83, 0.83, -0.04, 0.06]; return [say('八段錦海報', 'Baduanjin poster'), 'mat', 'baduanjin']; },
    mirror(k, g, S, o) {
      k.rbox(0.98, 1.88, 0.05, 0.02, 0, 1.06, 0, '#e9edf0', 'paint'); [-1, 1].forEach(s => k.rbox(0.08, 0.04, 0.4, 0.01, s * 0.42, 0.02, 0.12, '#cfd6da', 'paint'));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 1.78), new THREE.MeshStandardMaterial({ color: 0xb9c7d0, metalness: 0.35, roughness: 0.12, emissive: 0x2a3640 })); m.position.set(0, 1.06, 0.027); g.add(m);
      const [gc, gg] = cv2(256, 512); gg.clearRect(0, 0, 256, 512); gg.strokeStyle = 'rgba(30,40,50,.55)'; gg.lineWidth = 1.5; for (let x = 0; x <= 256; x += 16) { gg.beginPath(); gg.moveTo(x, 0); gg.lineTo(x, 512); gg.stroke(); } for (let y = 0; y <= 512; y += 16) { gg.beginPath(); gg.moveTo(0, y); gg.lineTo(256, y); gg.stroke(); } gg.strokeStyle = 'rgba(192,57,43,.8)'; gg.lineWidth = 3; gg.beginPath(); gg.moveTo(128, 0); gg.lineTo(128, 512); gg.stroke();
      tcmPlane(g, 0.88, 1.78, gc, 0, 1.06, 0.029, 0, { transparent: true, rough: 0.3 });
      return [say('姿勢鏡（格線）', 'Posture grid mirror'), 'mirror', 'mirror'];
    }
  };
  // INFO cards for the TCM props (education only; no doses, depths, minutes, frequencies or loads)
  Object.assign(INFO, {
    pulsedesk: ['脈診桌與脈枕', 'Pulse-diagnosis desk & pulse pillow', '病人手腕平放在脈枕上、掌心向上，醫師以食指、中指、無名指按寸、關、尺三部，體會脈的位置、快慢、力量與形態。中醫認為脈象要與望、聞、問合參；本站病人皆為虛構。', 'The wrist rests palm-up on the pillow while the doctor feels the cun, guan and chi positions with three fingers — depth, rate, strength and shape. TCM reads the pulse together with looking, listening and asking; all patients here are fictional.'],
    tonguelamp: ['舌診燈（日光色溫）', 'Tongue-examination lamp', '接近日光的燈光讓舌色與舌苔不被暖黃光扭曲；觀察舌質、舌苔與舌下絡脈，並先問是否剛吃過會染色的食物。比色卡僅為教學示意。', 'Daylight-like light keeps tongue colour and coating true; look at the body, coating and sublingual veins, and ask about staining foods first. The colour card is a teaching sketch.'],
    tcmcouch: ['治療床', 'Treatment couch', '高約 0.7 公尺、長 1.9 公尺；每位病人更換一次性床單與枕巾。上下床時協助病人並注意跌倒。', 'About 0.7 m high and 1.9 m long; a fresh paper sheet and pillow cover for every patient. Help patients on and off and watch for falls.'],
    tuinacouch: ['推拿床（有臉洞）', 'Tuina couch with face hole', '俯臥時臉放進臉洞，頸部保持中立。骨折、腫瘤、急性感染或不明原因疼痛等紅旗情況，先轉介檢查再考慮推拿。', 'Lying face-down, the face goes into the hole so the neck stays neutral. Red flags — fracture, tumour, acute infection, unexplained pain — are referred for tests before any tuina.'],
    couchrest: ['留觀休息床', 'Rest & observation couch', '治療後讓病人休息，觀察有無頭暈、出血或不適；確認所有針具都已取出並清點，才讓病人離開。', 'Patients rest here after treatment while you watch for dizziness, bleeding or discomfort; count that every needle is out before they leave.'],
    foldscreen: ['屏風', 'Folding screen', '檢查或治療時遮蔽視線、保護隱私；需要暴露身體時先說明並取得同意，必要時請陪同者在場。', 'Gives privacy during examination or treatment; explain and ask consent before exposing the body, with a chaperone when needed.'],
    bronze: ['針灸銅人（教學複製）', 'Bronze acupuncture figure', '仿宋代天聖針灸銅人的教學複製品，身上標示經絡循行與穴位，用來認識經絡走向與穴位的相對位置。古代曾以銅人考核取穴；這裡的線條只是示意，不是針刺指引。', 'A teaching replica of the Song-dynasty bronze figure marked with channels and points, for learning their courses and relative positions. Ancient examiners used such figures; the lines here are schematic, never a needling guide.'],
    meridian: ['十四經絡掛圖', 'Fourteen-channel wall charts', '十二正經與任脈、督脈的循行（正面與背面），以顏色區分經脈、圓點標示穴位。示意圖不能取代解剖定位與臨床帶教。', 'The twelve regular channels plus the Conception and Governor vessels, front and back, colour-coded with points as dots. A schematic — never a substitute for anatomical location and supervised teaching.'],
    herbspec: ['藥材標本櫃', 'Herb specimen cabinet', '玻璃罐內是乾燥藥材標本，用來辨識形狀、顏色、氣味與斷面，也比較炮製品與易混淆品。標本只供教學，不用於調劑。', 'Glass jars of dried specimens for learning shape, colour, smell and cross-section, and for comparing processed forms and look-alikes. Teaching only, never dispensed.'],
    bookshelf: ['醫籍書架', 'Medical classics bookcase', '《黃帝內經》《傷寒論》《金匱要略》《神農本草經》等經典與現代教科書、藥典。遇到疑問先查證，再請教老師。', 'Classics such as the Huangdi Neijing, Shanghan Lun and Shennong Bencao Jing beside modern textbooks and the pharmacopoeia. Check the sources, then ask your teacher.'],
    waitchairs: ['候診椅', 'Waiting chairs', '觀察從候診就開始：步態、面色、呼吸與情緒。胸痛、呼吸困難、意識改變等紅旗症狀立即轉急診。', 'Assessment starts in the waiting area: gait, colour, breathing and mood. Chest pain, breathlessness or confusion go straight to emergency.'],
    tcmboard: ['今日看板', "Today's board", '當日門診或治療排程，以代號表示虛構病人、不寫全名以保護隱私；紅字是安全提醒與轉介原則。', "Today's clinic or treatment list with codes for fictional patients — no full names, for privacy; red lines are safety and referral reminders."],
    tcmchart: ['病歷（四診紀錄）', 'Record (four examinations)', '主訴、現病史、望聞問切、辨證、治則與處方都要記錄；紅旗症狀、轉介與衛教內容也要寫清楚。', 'Record the complaint, history, the four examinations, pattern, principle and prescription — plus red flags, referrals and advice given.'],
    handsink: ['洗手台', 'Hand-wash basin', '洗手五時機：接觸病人前、清潔或無菌操作前、暴露體液風險後、接觸病人後、接觸病人周遭環境後。看得見髒污時用肥皂洗手，其他時候可用酒精乾洗手。', 'Five moments: before touching a patient, before a clean or aseptic task, after body-fluid exposure, after touching a patient and after touching their surroundings. Soap and water when visibly soiled, otherwise alcohol rub.'],
    needletrolley: ['針具治療車（無菌針盤）', 'Needle trolley (sterile tray)', '單次使用的無菌針灸針（檢查效期與包裝完整）、消毒棉、酒精棉片、鑷子與尖銳物收集盒；用過的針立即丟入收集盒、不回套。取穴、深度與手法由合格醫師依病人判斷，本站不提供。', 'Single-use sterile needles (check expiry and packaging), cotton, alcohol swabs, tweezers and a sharps box; used needles go straight into the box, never re-capped. Point choice, depth and technique are decided by a qualified doctor and are not given here.'],
    electro: ['電針儀', 'Electro-acupuncture unit', '以導線夾在已置入的針柄上輸出微弱脈衝電流；波形、頻率與強度由醫師依病情設定，本站不提供參數。裝有心律調節器、孕婦腰腹部與皮膚破損處要避免或特別謹慎。', 'Leads clip onto needles already in place and deliver a weak pulsed current; waveform, frequency and intensity are set by the doctor and are not given here. Avoid or take special care with pacemakers, the abdomen in pregnancy and broken skin.'],
    tdp: ['紅外線／TDP 治療燈', 'Infrared / TDP lamp', '以溫熱照射治療部位；保持安全距離並隨時詢問病人感覺。感覺遲鈍、糖尿病或剛拔罐的部位要特別小心燙傷；照射時間與距離依醫囑，本站不提供。', 'Warms the treated area; keep a safe distance and keep asking how it feels. Take extra care with numb skin, diabetes or freshly cupped areas; time and distance follow the order and are not given here.'],
    moxa: ['艾灸站', 'Moxibustion station', '艾條、溫灸盒與艾炷；艾灸有煙與高溫，必須開啟排煙設備，用畢放進滅艾筒並備滅火器。施灸部位、方式與時間由醫師決定，本站不提供；注意燙傷與起泡。', 'Moxa sticks, a moxa box and cones; moxibustion makes smoke and heat, so the extractor runs, used sticks go into the snuffer and an extinguisher is at hand. Site, method and duration are decided by the doctor and are not given here; watch for burns and blisters.'],
    cuptrolley: ['拔罐與刮痧車', 'Cupping & gua sha trolley', '玻璃罐、抽氣罐與真空槍、刮痧板與介質油。起罐時按壓罐緣讓空氣進入，不可硬拉；皮膚破損或有出血傾向者避免。罐印與痧痕會在數日內消退，事先向病人說明。', 'Glass cups, suction cups with a pump, gua sha boards and oil. Release a cup by pressing the skin at its rim — never pull it off; avoid broken skin and bleeding tendencies. Explain beforehand that the marks fade over a few days.'],
    baycurtain: ['床邊隔簾', 'Bay curtain', '治療時拉上保護隱私；隔簾依院內規定定期更換清洗，被體液污染時立即更換。', 'Drawn during treatment for privacy; changed on schedule and at once when soiled.'],
    acucrash: ['急救車（暈針處置）', 'Crash cart (needle fainting)', '暈針時病人突然頭暈、臉色蒼白、冒冷汗或噁心：立即停止治療、起針，讓病人平躺、抬高下肢、保暖並監測生命徵象；意識改變或無法恢復時啟動急救並轉送。急救車封條完整、每日檢查。', 'Needle fainting — sudden dizziness, pallor, cold sweat or nausea: stop, remove the needles, lay the patient flat with legs raised, keep warm and check vital signs; if consciousness changes or recovery fails, call the emergency team. Seal intact, checked daily.'],
    baizigui: ['百子櫃（中藥斗櫃）', 'Herb drawer cabinet (百子櫃)', '傳統藥櫃，每一斗依藥名分格存放飲片；常用藥放在順手位置，外觀相似或毒性藥材分開並特別標示。調劑時逐味取藥並核對藥名與炮製別名；本站不提供劑量。', 'The traditional cabinet: each drawer holds named herb slices; common herbs sit within reach, look-alikes and toxic herbs are kept apart and clearly marked. Pick herb by herb and check names and processed forms; no amounts are given here.'],
    dispense: ['調劑台（戥秤・電子秤）', 'Dispensing counter', '戥秤是傳統小秤，電子秤更精確並可記錄；處方依帖數分在藥紙上，逐味稱取、再由另一人覆核。本站只示意流程，不提供任何藥材重量；核對病人、十八反十九畏與妊娠禁忌。', 'The steelyard is the traditional small balance; the electronic balance is more precise and can log. Each dose packet is laid on its own paper, herb by herb, then double-checked by a second person. Only the workflow is shown — no herb weights; check the patient, classical incompatibilities and pregnancy cautions.'],
    grinder: ['搗藥與切藥台', 'Grinding & cutting bench', '搗藥缽、藥碾與切藥刀用於需要搗碎或切製的藥材（例如部分種子類要搗碎）；每次用完清潔，避免交叉污染與粉塵。', 'Mortar, boat-shaped grinder and herb knife for herbs that must be crushed or cut (some seeds, for example); clean after each use to avoid cross-contamination and dust.'],
    decoction: ['煎藥機', 'Decoction machines', '密閉煎煮並控制溫度；先煎、後下、包煎等特殊煎法由藥師依處方處理。完成後經管路送到包裝機分裝；設備每日清潔與記錄。', 'Closed, temperature-controlled decocting; special methods such as first-decocted, added-late or bagged herbs are handled by the pharmacist per prescription. The liquid is piped to the packer; machines are cleaned and logged daily.'],
    packer: ['藥液包裝機', 'Decoction packing machine', '把煎好的藥液分裝進耐熱袋並封口，標示病人姓名、日期與服用方式；抽查封口是否滲漏。', 'Fills the finished decoction into heat-proof pouches and seals them, labelled with name, date and how to take it; seals are spot-checked for leaks.'],
    granules: ['科學中藥（濃縮顆粒）架', 'Concentrated granule shelves', '藥廠萃取濃縮製成的顆粒或粉末，依品項排列；調劑時混合分包並核對品項與效期。本站不提供劑量。', 'Factory-made concentrated granules or powders, shelved by item; mixed and packed per prescription with item and expiry checks. No doses are given here.'],
    rxstation: ['處方審核工作站', 'Prescription-check workstation', '調劑前審核：病人身分、過敏史、懷孕與否、配伍禁忌（十八反、十九畏）、重複用藥與中西藥交互作用；有疑義先聯絡開方醫師，不自行更改。', 'Before dispensing: identity, allergies, pregnancy, classical incompatibilities, duplicates and herb–drug interactions; any doubt goes back to the prescriber — never change it yourself.'],
    passwindow: ['發藥窗口', 'Dispensing window', '叫號後核對病人身分再發藥，說明服用方式、保存方法與注意事項；出現不良反應時停藥並回診。', 'Call the number, confirm identity, then hand over the medicine and explain how to take and store it; stop and return if side effects appear.'],
    traction: ['頸腰椎牽引床', 'Cervical / lumbar traction table', '以頭頸帶或胸、骨盆固定帶做頸椎或腰椎牽引，依醫囑逐步施加；拉力與時間由醫師或治療師決定，本站不提供。病人全程手握緊急停止鈕，不適立即停止。', 'Cervical or lumbar traction with a head halter or chest and pelvic belts, applied gradually per order; force and time are set by the doctor or therapist and are not given here. The patient holds the stop button throughout and it stops at any discomfort.'],
    hotpack: ['熱敷包加熱箱', 'Hot-pack heater', '讓熱敷包保持在固定水溫；使用時包上多層毛巾並定時檢查皮膚，感覺遲鈍或循環不良者要特別小心燙傷。', 'Keeps hot packs in water at a steady temperature; wrap in several towel layers and check the skin often — extra care with numbness or poor circulation.'],
    mats: ['導引運動墊區', 'Exercise mat area', '八段錦、太極等導引練習的空間；動作宜緩、配合呼吸、量力而為，跌倒風險高的病人旁邊要有人陪同。', 'Space for daoyin exercise such as Baduanjin or tai chi: slow movements with the breath, within comfort; stay beside patients at risk of falling.'],
    baduanjin: ['八段錦海報', 'Baduanjin poster', '八段錦是傳統導引功法的八個動作，從「兩手托天理三焦」到「背後七顛百病消」；常用於衛教讓病人在家練習，不適即停。', 'The eight movements of the Baduanjin routine, from "two hands hold up the heavens" to "bouncing on the toes"; taught for home practice — stop if unwell.'],
    mirror: ['姿勢鏡（格線）', 'Posture grid mirror', '用格線看站姿、肩膀高低與骨盆是否歪斜，也讓病人看到自己的動作，做衛教回饋。', 'The grid shows standing posture, shoulder level and pelvic tilt, and lets patients see their own movement for feedback.']
  });

  // ---------------------------------------------------------------- v4.1 TCM rooms (中醫診間 / 針灸治療室 / 中藥局 / 推拿傷科)
  // Each builder fills H (hotspot id → standing anchor) through ctx.put, aliases every v1 generic id with ctx.A and marks
  // the main object with setField. Wall art that is not interactive goes into ctx.roomGroup.
  function tcmDecor(c, kind, p, ry, o) { // non-interactive wall art: scroll, plaque, clock
    o = o || {}; const g = new THREE.Group(); const k = c.makeKit(c.K);
    if (kind === 'scroll') { k.cyl(0.012, 0.012, 0.56, 0, 0.67, 0.012, WOOD_D, 'paint', 0, 0, Math.PI / 2, 8); k.cyl(0.014, 0.014, 0.56, 0, -0.67, 0.014, WOOD_D, 'paint', 0, 0, Math.PI / 2, 8); tcmPlane(g, 0.42, 1.32, scrollCanvas(o.text || '大醫精誠'), 0, 0, 0.008, 0, { rough: 0.9 }); }
    if (kind === 'clock') tcmPlane(g, 0.34, 0.34, clockCanvas(), 0, 0, 0.012, 0, { transparent: true, rough: 0.4 });
    g.add(k.build({ shadow: false })); at(g, p, ry); g.position.y = p[1]; c.roomGroup.add(g); return g;
  }
  function tcmPlant(c, p) { const k = c.makeKit(c.K); k.cyl(0.18, 0.14, 0.36, 0, 0.18, 0, '#7a5a3a', 'paint', 0, 0, 0, 18); k.cyl(0.17, 0.17, 0.02, 0, 0.35, 0, '#3a2a1a', 'matte', 0, 0, 0, 18); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; k.seg([0, 0.36, 0], [Math.cos(a) * 0.3, 0.9 + (i % 3) * 0.18, Math.sin(a) * 0.3], 0.012, 0.006, '#4a6a3a', 'matte', 6); k.sph(0.13, 0.03, 0.06, Math.cos(a) * 0.32, 0.92 + (i % 3) * 0.18, Math.sin(a) * 0.32, i % 2 ? '#3f7a4a' : '#4f8a5a', 'matte', 8, 0, -a, 0.5); } const g = k.build(); at(g, p, 0); c.scene.add(g); c.solid(g, [-0.2, 0.2, -0.2, 0.2]); return g; }
  function tcmClinicRoom(c) {
    const { put, A, H, say: sy } = c;
    put('tcmdesk', [0.3, 0, -2.0], 0, { as: 'pulse-desk', stool: false });
    const stk = c.makeKit(c.K); woodStool(stk, 0, 0); const stoolG = stk.build(); at(stoolG, [1.38, 0, -1.82], 0); c.scene.add(stoolG); c.solid(stoolG, [-0.22, 0.22, -0.22, 0.22]);
    put('tonguelamp', [2.9, 0, -2.65], -1.07, { as: 'lamp', arm: 0.55 });
    put('couch', [-3.75, 0, -3.75], 0, { as: 'couch', top: '#6b3a2a' });
    put('foldscreen', [-3.6, 0, -2.6], 0, { as: 'screen' });
    put('bookshelf', [0.3, 0, -4.28], 0, { as: 'bookshelf' });
    put('bronze', [-4.75, 0, -0.2], Math.PI / 2, { as: 'bronze' });
    put('tcmboard', [-5.47, 0, -1.55], Math.PI / 2, { as: 'whiteboard', kind: 'clinic' });
    put('meridian', [5.47, 0, -2.2], -Math.PI / 2, { as: 'meridian-chart' });
    put('herbspec', [5.24, 0, 0.1], -Math.PI / 2, { as: 'cabinet' });
    put('huddle', [5.44, 0, 2.7], -Math.PI / 2, { as: 'handover', name: sy('跟診討論與交班', 'Teaching huddle & handover') });
    put('workstation', [-4.95, 0, 1.95], Math.PI / 2, { desk: true, as: 'desk', right: 'chart', text: sy('中醫門診系統・掛號・檢驗報告', 'TCM clinic system · booking · lab reports'), name: sy('門診護理站（電腦）', 'Clinic nurse desk (computer)') });
    put('chart', [-2.2, 0, -1.0], 0.4, { as: 'chart', info: 'tcmchart', name: sy('病歷（四診紀錄）', 'Record (four examinations)') });
    put('handsink', [-3.3, 0, 4.25], Math.PI, { as: 'sink' });
    put('waitchairs', [2.9, 0, 4.12], 0, { as: 'chairs' });
    put('door', [0, 0, 4.35], Math.PI);
    const [rc, rg] = cv2(512, 352, '#8a2f2a'); rg.strokeStyle = '#d8b06a'; rg.lineWidth = 10; rg.strokeRect(18, 18, 476, 316); rg.lineWidth = 3; rg.strokeRect(40, 40, 432, 272); rg.strokeStyle = 'rgba(216,176,106,.55)'; for (let i = 0; i < 4; i++) { rg.beginPath(); rg.arc(256, 176, 30 + i * 22, 0, Math.PI * 2); rg.stroke(); } const rug = tcmPlane(c.roomGroup, 3.0, 2.06, rc, 0.6, 0.007, -1.85, 0, { rx: -Math.PI / 2, rough: 0.95 }); rug.receiveShadow = true;
    tcmDecor(c, 'scroll', [5.47, 1.75, 1.4], -Math.PI / 2, { text: '大醫精誠' }); tcmDecor(c, 'clock', [-5.47, 2.55, -1.55], Math.PI / 2); tcmPlant(c, [4.95, 0, 4.0]);
    c.photoAt([-1.45, 1.8, -4.47], 0, [1.5, 1.0]);
    c.setField('pulse-desk'); c.region('pulse-desk', 'upper-limb');
    A('field', 'pulse-desk'); A('bed', 'couch'); A('recovery', 'couch'); A('monitor', 'pulse-desk'); A('imaging', 'desk'); A('anaesthesia', 'pulse-desk'); A('instruments', 'pulse-desk'); A('tray', 'pulse-desk'); A('drugs', 'cabinet');
    A('drain', 'sink'); A('lab', 'desk'); A('huddle', 'handover'); A('device', 'lamp'); A('lightbox', 'desk'); A('ultrasound', 'couch'); A('endoscopy', 'lamp'); A('microscope', 'cabinet'); A('carm', 'desk');
    A('crash-cart', 'door'); A('bench', 'cabinet'); A('centrifuge', 'desk'); A('analyser', 'desk'); A('hood', 'desk'); A('workstation', 'desk'); A('lights', 'lamp');
    return H;
  }
  function acupunctureRoom(c) {
    const { put, A, H, say: sy } = c; const bays = [-3.4, -0.4, 2.6], cz = -3.2;
    put('couch', [bays[1], 0, cz], -Math.PI / 2, { as: 'couch', patient: 'supine', needles: true, shins: true, top: '#2f6f6a', name: sy('針灸治療床（1 床・留針中）', 'Acupuncture couch (bed 1 · needles in)') });
    put('couch', [bays[0], 0, cz], -Math.PI / 2, { as: 'recovery', patient: 'prone', cupsOnBack: true, bareBack: true, skin: '#c98d62', top: '#2f6f6a', info: 'couchrest', name: sy('留觀休息床（2 床）', 'Rest & observation couch (bed 2)') });
    put('couch', [bays[2], 0, cz], -Math.PI / 2, { as: 'couch3', top: '#2f6f6a', name: sy('治療床（3 床・已整理）', 'Couch (bed 3 · made up)') });
    put('baycurtain', [bays[0], 0, -3.15], 0, { as: 'curtain1', sides: [-1] }); put('baycurtain', [bays[1], 0, -3.15], 0, { as: 'curtain2', sides: [-1] }); put('baycurtain', [bays[2], 0, -3.15], 0, { as: 'curtain3', sides: [1] });
    put('needletrolley', [0.6, 0, -2.6], 0, { as: 'needles' });
    put('electro', [0.6, 0, -3.75], -Math.PI / 2, { as: 'electro' });
    put('tdp', [-1.35, 0, -2.5], 0, { as: 'lamp', reach: [0.92, 0] });
    put('cuptrolley', [-3.4, 0, -1.65], 0, { as: 'cups' });
    put('moxa', [4.75, 0, -1.6], -Math.PI / 2, { as: 'moxa' });
    put('meridian', [-5.47, 0, -1.0], Math.PI / 2, { as: 'meridian-chart' });
    put('tcmboard', [-5.47, 0, 1.4], Math.PI / 2, { as: 'whiteboard', kind: 'acu' });
    put('huddle', [5.44, 0, 2.6], -Math.PI / 2, { as: 'handover', name: sy('交班討論（SBAR）', 'Handover huddle (SBAR)') });
    put('chart', [1.9, 0, 0.4], -0.5, { as: 'chart', info: 'tcmchart', name: sy('病歷與治療紀錄', 'Record & treatment notes') });
    put('handsink', [-3.3, 0, 4.25], Math.PI, { as: 'sink' });
    put('crash', [3.0, 0, 3.95], Math.PI, { as: 'crash-cart', info: 'acucrash', name: sy('急救車（暈針處置）', 'Crash cart (needle fainting)') });
    put('door', [0, 0, 4.35], Math.PI);
    tcmDecor(c, 'clock', [-5.47, 2.55, 1.4], Math.PI / 2); tcmPlant(c, [-4.95, 0, 4.0]);
    c.photoAt([5.47, 1.85, 0.4], -Math.PI / 2, [1.5, 1.0]);
    c.setField('couch'); c.region('couch', 'lower-limb');
    A('field', 'couch'); A('bed', 'couch'); A('monitor', 'couch'); A('imaging', 'meridian-chart'); A('anaesthesia', 'couch'); A('instruments', 'needles'); A('tray', 'needles'); A('drugs', 'crash-cart'); A('crash', 'crash-cart');
    A('drain', 'sink'); A('lab', 'chart'); A('desk', 'handover'); A('huddle', 'handover'); A('device', 'electro'); A('lightbox', 'meridian-chart'); A('ultrasound', 'electro'); A('endoscopy', 'lamp'); A('microscope', 'needles');
    A('carm', 'lamp'); A('bench', 'cups'); A('centrifuge', 'moxa'); A('analyser', 'electro'); A('hood', 'moxa'); A('workstation', 'chart'); A('lights', 'lamp'); A('curtain', 'curtain2');
    return H;
  }
  function herbalPharmacyRoom(c) {
    const { put, A, H, say: sy } = c;
    put('baizigui', [-1.7, 0, -4.2], 0, { as: 'cabinet' });
    put('dispense', [-1.7, 0, -2.55], 0, { as: 'scale' });
    put('grinder', [-5.15, 0, -1.3], Math.PI / 2, { as: 'grinder' });
    put('granules', [-5.3, 0, 1.6], Math.PI / 2, { as: 'granules' });
    put('decoction', [5.1, 0, -2.0], -Math.PI / 2, { as: 'decoction' });
    put('packer', [5.15, 0, -0.4], -Math.PI / 2, { as: 'packer' });
    put('rxstation', [3.0, 0, -4.05], 0, { as: 'workstation' });
    put('passwindow', [-3.3, 0, 4.25], Math.PI, { as: 'desk' });
    put('chart', [1.3, 0, -1.2], -0.4, { as: 'chart', info: 'tcmchart', name: sy('處方與調劑紀錄', 'Prescriptions & dispensing log') });
    put('handsink', [3.3, 0, 4.25], Math.PI, { as: 'sink' });
    put('huddle', [5.44, 0, 2.5], -Math.PI / 2, { as: 'handover', name: sy('交班與藥品異動', 'Handover & stock changes') });
    put('door', [0, 0, 4.35], Math.PI);
    const sk = c.makeKit(c.K); for (let i = 0; i < 3; i++) { sk.rbox(0.5, 0.42, 0.36, 0.12, 0, 0.21, i * 0.42, i % 2 ? '#c8b48a' : '#b8a27a', 'cloth'); sk.box(0.3, 0.04, 0.2, 0, 0.44, i * 0.42, '#a0884a', 'cloth'); } sk.rbox(0.5, 0.4, 0.36, 0.12, 0.02, 0.62, 0.2, '#c8b48a', 'cloth'); const sacks = sk.build(); at(sacks, [-4.3, 0, -4.0], 0.15); c.scene.add(sacks); c.solid(sacks);
    tcmDecor(c, 'clock', [5.47, 2.5, 0.9], -Math.PI / 2); tcmPlant(c, [4.95, 0, 4.0]);
    c.photoAt([-5.47, 2.0, -1.3], Math.PI / 2, [1.4, 0.85]);
    if (!c.LOWQ) { const l = new THREE.PointLight(0xffc68a, 1.2, 4.5, 2); l.position.set(-1.7, 2.0, -2.6); l.userData.base = 1.2; c.scene.add(l); c.taskLights.push(l); }
    c.setField('cabinet');
    A('field', 'cabinet'); A('instruments', 'scale'); A('tray', 'scale'); A('drugs', 'cabinet'); A('lab', 'scale'); A('bench', 'scale'); A('device', 'decoction'); A('monitor', 'workstation'); A('imaging', 'workstation');
    A('hood', 'decoction'); A('centrifuge', 'grinder'); A('analyser', 'granules'); A('microscope', 'cabinet'); A('recovery', 'desk'); A('bed', 'desk'); A('anaesthesia', 'desk'); A('whiteboard', 'handover'); A('huddle', 'handover');
    A('drain', 'sink'); A('crash-cart', 'door'); A('lightbox', 'workstation'); A('ultrasound', 'workstation'); A('endoscopy', 'workstation'); A('carm', 'workstation'); A('lights', 'scale');
    return H;
  }
  function tuinaRoom(c) {
    const { put, A, H, say: sy } = c;
    put('couch', [-2.4, 0, -3.3], 0, { as: 'couch', face: true, wid: 0.8, patient: 'prone', top: '#2f4f6a', stool: [0.3, 0.78], name: sy('推拿床（1 床・俯臥）', 'Tuina couch (bed 1 · prone)') });
    put('couch', [-2.4, 0, -0.55], 0, { as: 'couch2', face: true, wid: 0.8, top: '#2f4f6a', name: sy('推拿床（2 床）', 'Tuina couch (bed 2)') });
    put('hotpack', [-4.78, 0, -3.9], Math.PI / 2, { as: 'hotpack' });
    put('tdp', [-0.8, 0, -2.3], 0, { as: 'lamp', reach: [-0.85, -0.75], name: sy('紅外線治療燈', 'Infrared lamp') });
    put('cuptrolley', [-0.5, 0, -3.95], 0, { as: 'cups' });
    put('traction', [3.1, 0, -3.35], 0, { as: 'traction' });
    put('huddle', [5.44, 0, -1.0], -Math.PI / 2, { as: 'handover', name: sy('交班討論（SBAR）', 'Handover huddle (SBAR)') });
    put('mats', [3.25, 0, 1.45], 0, { as: 'mat' });
    put('poster8', [5.47, 0, 1.45], -Math.PI / 2, { as: 'poster' });
    put('mirror', [-5.42, 0, 1.0], Math.PI / 2, { as: 'mirror' });
    put('tcmboard', [-5.47, 0, -1.1], Math.PI / 2, { as: 'whiteboard', kind: 'tuina' });
    put('chart', [-0.6, 0, 0.9], 0.4, { as: 'chart', info: 'tcmchart', name: sy('病歷與評估紀錄', 'Record & assessment') });
    put('workstation', [-3.8, 0, 3.75], Math.PI, { desk: true, as: 'desk', right: 'chart', text: sy('傷科評估・影像報告・排程', 'Assessment · imaging reports · schedule'), name: sy('治療師工作站', 'Therapist workstation') });
    put('handsink', [3.3, 0, 4.25], Math.PI, { as: 'sink' });
    put('door', [0, 0, 4.35], Math.PI);
    tcmDecor(c, 'clock', [-5.47, 2.55, -1.1], Math.PI / 2); tcmPlant(c, [4.95, 0, 4.0]);
    c.photoAt([-2.4, 1.9, -4.47], 0, [1.5, 0.95]);
    c.setField('couch'); c.region('couch', 'spine');
    A('field', 'couch'); A('bed', 'couch'); A('recovery', 'couch2'); A('instruments', 'cups'); A('tray', 'cups'); A('device', 'traction'); A('monitor', 'couch'); A('imaging', 'desk'); A('lab', 'desk');
    A('drugs', 'cups'); A('huddle', 'handover'); A('workstation', 'desk'); A('lights', 'lamp'); A('drain', 'sink'); A('anaesthesia', 'couch'); A('lightbox', 'mirror'); A('ultrasound', 'lamp'); A('bench', 'mat');
    A('hood', 'hotpack'); A('crash-cart', 'door'); A('microscope', 'desk'); A('carm', 'desk'); A('endoscopy', 'desk'); A('centrifuge', 'desk'); A('analyser', 'desk');
    return H;
  }

  // ---------------------------------------------------------------- nav grid (walk mode): 0.25 m cells, A*, line-of-sight smoothing
  const NAV_CELL = 0.25, NAV_PAD = 0.24, NAV_WALL = 0.3;
  function makeNav() {
    const nx = Math.round(ROOM.w / NAV_CELL), nz = Math.round(ROOM.d / NAV_CELL), n = nx * nz, ox = -ROOM.w / 2, oz = -ROOM.d / 2;
    const blocked = new Uint8Array(n), raw = new Uint8Array(n), comp = new Int16Array(n), tall = new Float32Array(n); const v = new THREE.Vector3();
    const nav = { nx, nz, n, cell: NAV_CELL, blocked, raw, comp, tall, ox, oz, rects: {}, g: new Float32Array(n), f: new Float32Array(n), parent: new Int32Array(n), state: new Uint8Array(n), heap: [] };
    nav.cellOf = (x, z) => { const ix = Math.floor((x - ox) / NAV_CELL), iz = Math.floor((z - oz) / NAV_CELL); return ix < 0 || iz < 0 || ix >= nx || iz >= nz ? -1 : iz * nx + ix; };
    nav.cx = i => ox + (i % nx + 0.5) * NAV_CELL; nav.cz = i => oz + (Math.floor(i / nx) + 0.5) * NAV_CELL;
    nav.walkable = (x, z) => { const i = nav.cellOf(x, z); return i >= 0 && !blocked[i]; };
    nav.blockRect = (x0, x1, z0, z1, pad, top) => { const a = Math.max(0, Math.floor((x0 - pad - ox) / NAV_CELL)), b = Math.min(nx - 1, Math.floor((x1 + pad - ox) / NAV_CELL)), c = Math.max(0, Math.floor((z0 - pad - oz) / NAV_CELL)), d = Math.min(nz - 1, Math.floor((z1 + pad - oz) / NAV_CELL)); for (let iz = c; iz <= d; iz++) for (let ix = a; ix <= b; ix++) { const i = iz * nx + ix; if (top) { if (top > tall[i]) tall[i] = top; } else { blocked[i] = 1; if (!pad) raw[i] = 1; } } };
    // world-space footprint (union rect) of an object's solid parts at walking height; marks the grid
    nav.blockObject = (id, obj, rect) => {
      obj.updateMatrixWorld(true); let X0 = Infinity, X1 = -Infinity, Z0 = Infinity, Z1 = -Infinity;
      const mark = (x0, x1, z0, z1, top) => { X0 = Math.min(X0, x0); X1 = Math.max(X1, x1); Z0 = Math.min(Z0, z0); Z1 = Math.max(Z1, z1); nav.blockRect(x0, x1, z0, z1, NAV_PAD); nav.blockRect(x0, x1, z0, z1, 0); if (top >= 1.6) nav.blockRect(x0, x1, z0, z1, 0.12, top); /* tall parts also steer the camera */ };
      if (rect) { const m = obj.matrixWorld; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; [[rect[0], rect[2]], [rect[1], rect[2]], [rect[0], rect[3]], [rect[1], rect[3]]].forEach(([x, z]) => { v.set(x, 0, z).applyMatrix4(m); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }); mark(x0, x1, z0, z1); }
      else obj.traverse(o => { const f = o.userData && o.userData.foot; if (!f || !f.length) return; const m = o.matrixWorld; f.forEach(r => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; [[r[0], r[2]], [r[1], r[2]], [r[0], r[3]], [r[1], r[3]]].forEach(([x, z]) => { v.set(x, 0, z).applyMatrix4(m); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }); mark(x0, x1, z0, z1, r[4] || 0); }); });
      if (X0 === Infinity) { X0 = X1 = obj.position.x; Z0 = Z1 = obj.position.z; }
      const R = { x0: X0, x1: X1, z0: Z0, z1: Z1, cx: (X0 + X1) / 2, cz: (Z0 + Z1) / 2 }; if (id) nav.rects[id] = R; return R;
    };
    nav.distRect = (R, x, z) => Math.hypot(Math.max(R.x0 - x, 0, x - R.x1), Math.max(R.z0 - z, 0, z - R.z1));
    // connected components (so standing points are chosen in the player's region)
    nav.label = () => { comp.fill(0); let c = 0; const stack = []; for (let s = 0; s < n; s++) { if (blocked[s] || comp[s]) continue; c++; comp[s] = c; stack.push(s); while (stack.length) { const i = stack.pop(); const x = i % nx, z = (i / nx) | 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dz) continue; const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= nx || Z >= nz) continue; const j = Z * nx + X; if (blocked[j] || comp[j]) continue; if (dx && dz && (blocked[z * nx + X] || blocked[Z * nx + x])) continue; comp[j] = c; stack.push(j); } } } nav.components = c; let free = 0, rawFree = 0; for (let i = 0; i < n; i++) { if (!blocked[i]) free++; if (!raw[i]) rawFree++; } nav.freeRatio = free / n; nav.rawFreeRatio = rawFree / n; const sizes = new Int32Array(c + 1); for (let i = 0; i < n; i++) if (comp[i]) sizes[comp[i]]++; let best = 1; for (let k = 2; k <= c; k++) if (sizes[k] > sizes[best]) best = k; nav.mainComp = best; nav.mainRatio = c ? sizes[best] / n : 0; };
    nav.nearestFree = (x, z, maxR, compWanted) => { let best = -1, bd = Infinity; const cx = Math.floor((x - ox) / NAV_CELL), cz = Math.floor((z - oz) / NAV_CELL); const r = Math.ceil((maxR || 2) / NAV_CELL); for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const X = cx + dx, Z = cz + dz; if (X < 0 || Z < 0 || X >= nx || Z >= nz) continue; const i = Z * nx + X; if (blocked[i] || (compWanted && comp[i] !== compWanted)) continue; const d = Math.hypot(nav.cx(i) - x, nav.cz(i) - z); if (d < bd) { bd = d; best = i; } } return best; };
    nav.los = (ax, az, bx, bz) => { const d = Math.hypot(bx - ax, bz - az); const steps = Math.ceil(d / 0.08); for (let i = 1; i < steps; i++) { const t = i / steps; if (!nav.walkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false; } return true; };
    // A* over 8-neighbours without corner cutting; returns cell indices start..goal or null
    nav.astar = (s, t) => {
      const { g, f, parent, state, heap } = nav; g.fill(Infinity); state.fill(0); parent.fill(-1); heap.length = 0; if (s < 0 || t < 0) return null; if (s === t) return [s];
      const push = i => { heap.push(i); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; const tmp = heap[p]; heap[p] = heap[k]; heap[k] = tmp; k = p; } };
      const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && f[heap[a]] < f[heap[m]]) m = a; if (b < heap.length && f[heap[b]] < f[heap[m]]) m = b; if (m === k) break; const tmp = heap[m]; heap[m] = heap[k]; heap[k] = tmp; k = m; } } return top; };
      const tx = t % nx, tz = (t / nx) | 0; const h = i => { const dx = Math.abs(i % nx - tx), dz = Math.abs(((i / nx) | 0) - tz); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
      g[s] = 0; f[s] = h(s); push(s); state[s] = 1; let found = false;
      while (heap.length) { const c = pop(); if (state[c] === 2) continue; if (c === t) { found = true; break; } state[c] = 2; const cx = c % nx, cz = (c / nx) | 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dz) continue; const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= nx || z >= nz) continue; const i = z * nx + x; if (blocked[i] || state[i] === 2) continue; if (dx && dz && (blocked[cz * nx + x] || blocked[z * nx + cx])) continue; const ng = g[c] + (dx && dz ? 1.4142 : 1); if (ng < g[i]) { g[i] = ng; f[i] = ng + h(i); parent[i] = c; state[i] = 1; push(i); } } }
      if (!found) return null; const out = []; for (let c = t; c >= 0; c = parent[c]) { out.push(c); if (c === s) break; } return out.reverse();
    };
    // world path [[x,z]…] from a to b (exact end points), smoothed by greedy line of sight
    nav.path = (ax, az, bx, bz) => {
      let s = nav.cellOf(ax, az), t = nav.cellOf(bx, bz); if (s < 0 || blocked[s]) s = nav.nearestFree(ax, az, 1.2); if (t < 0 || blocked[t]) t = nav.nearestFree(bx, bz, 1.2, s >= 0 ? comp[s] : 0); if (s < 0 || t < 0) return null;
      const cells = nav.astar(s, t); if (!cells) return null; const pts = [[ax, az]]; for (let i = 1; i < cells.length - 1; i++) pts.push([nav.cx(cells[i]), nav.cz(cells[i])]); const end = blocked[nav.cellOf(bx, bz)] || nav.cellOf(bx, bz) < 0 ? [nav.cx(t), nav.cz(t)] : [bx, bz]; pts.push(end);
      if (pts.length < 3) return pts; const out = [pts[0]]; let i = 0; while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !nav.los(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--; out.push(pts[j]); i = j; } return out;
    };
    // a free standing point beside a footprint rect: candidates on a ring just outside it, nearest to `from`
    nav.standBy = (R, fx, fz, compWanted) => {
      const hw = (R.x1 - R.x0) / 2 + 0.001, hd = (R.z1 - R.z0) / 2 + 0.001; let best = null, bd = Infinity;
      for (const gap of [0.5, 0.8, 1.15]) { for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a); const tt = Math.min(hw / Math.max(1e-6, Math.abs(cs)), hd / Math.max(1e-6, Math.abs(sn))); const x = R.cx + cs * (tt + gap), z = R.cz + sn * (tt + gap); const i = nav.cellOf(x, z); if (i < 0 || blocked[i] || (compWanted && comp[i] !== compWanted)) continue; const d = Math.hypot(x - fx, z - fz); if (d < bd) { bd = d; best = [x, z]; } } if (best) return best; }
      const i = nav.nearestFree(R.cx, R.cz, 3.5, compWanted); return i >= 0 ? [nav.cx(i), nav.cz(i)] : null;
    };
    for (let i = 0; i < n; i++) { const x = nav.cx(i), z = nav.cz(i); if (Math.abs(x) > ROOM.w / 2 - NAV_WALL || Math.abs(z) > ROOM.d / 2 - NAV_WALL) blocked[i] = 1; }
    return nav;
  }

  // ---------------------------------------------------------------- the scene
  // the shift runtime mounts with a much smaller api than the workbench: fill the fields the scene reads
  function normApi(a) {
    a = a || {}; a.c = a.c || {}; a.c.tiles = a.c.tiles || []; a.roles = a.roles || []; a.map = a.map || []; a.s = a.s || {}; a.lines = a.lines || []; a.hotspots = a.hotspots || {};
    a.st = a.st || { view: a.view || (a.walk ? 'follow' : 'third'), zoom: 1 }; a.engine = a.engine || { hands: { left: {}, right: {} }, anchors: [], tolerance: 0 }; a.doneStations = a.doneStations || new Set();
    if (!a.roomType) a.roomType = 'or';
    return a;
  }
  function mount(host, api) {
    THREE = window.THREE || THREE;
    if (!THREE || !THREE.WebGLRenderer) throw new Error('3D library not ready');
    api = normApi(api); const WALK = !!api.walk;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const el = document.createElement('div'); el.className = 'th3d' + (WALK ? ' walk' : ''); host.appendChild(el);
    const cv = document.createElement('canvas'); el.appendChild(cv);
    const tip = document.createElement('div'); tip.className = 'th3d-tip'; tip.hidden = true; el.appendChild(tip);
    const hint = document.createElement('div'); hint.className = 'th3d-hint'; el.appendChild(hint);
    const card = document.createElement('div'); card.className = 'th3d-card'; card.hidden = true; el.appendChild(card); let cardFor = null, cardTarget = null;
    function targetName(tg, id) { if (!tg) return null; if (tg.kind === 'region') return nm(REGION[tg.id]); if (tg.kind === 'part') return nm(PART[tg.id]); const o = objs[id]; return (o && o.userData.name) || null; }
    function showCard(id, ev, target) {
      const o = objs[id]; const inf = infoOf((o && o.userData.info) || id) || infoOf(id) || [id, id, '', '']; const tn = targetName(target, id); const name = tn || (o && o.userData.name) || (zh() ? inf[0] : inf[1]);
      cardFor = id; cardTarget = target || null;
      const sub = target && target.kind !== 'equip' ? `<small>${esc(zh() ? inf[0] : inf[1])}</small>` : '';
      card.innerHTML = `<button type="button" class="th3d-x" aria-label="close">×</button><b>${esc(name)}</b>${sub}<p>${esc(zh() ? inf[2] : inf[3])}</p><div class="th3d-card-row"><button type="button" class="chip small th-img-chip" data-c-img>🩻 ${esc(T('tiTitle', '影像與數位孿生', 'Imaging & digital twin'))}</button><button type="button" class="chip small" data-c-open>${esc(t('equipDetails'))}</button><button type="button" class="chip small" data-c-fly>${esc(t('goThere'))}</button></div>`;
      card.hidden = false; placeCard();
      card.querySelector('.th3d-x').onclick = () => { card.hidden = true; cardFor = null; };
      card.querySelector('[data-c-open]').onclick = () => { card.hidden = true; if (api.onHot) api.onHot(id); else if (api.onInteract) api.onInteract(id); };
      card.querySelector('[data-c-fly]').onclick = () => { if (WALK) card.hidden = true; handle.flyTo(id); };
      card.querySelector('[data-c-img]').onclick = () => { if (api.openImaging) api.openImaging(cardTarget || { kind: 'equip', id: (o && o.userData.equip) || id }, cv); };
    }
    const cardV = new THREE.Vector3();
    function placeCard() { if (card.hidden || !cardFor || !objs[cardFor]) return; if (cardFor === 'field' || cardFor === 'lights') { const cw = Math.min(290, el.clientWidth - 16); card.style.width = cw + 'px'; card.style.left = '8px'; card.style.top = '8px'; card.style.opacity = 1; return; } cardV.copy(objs[cardFor].position); cardV.y = 1.6; cardV.project(camera); const w = el.clientWidth, h = el.clientHeight; const x = (cardV.x * 0.5 + 0.5) * w, y = (-cardV.y * 0.5 + 0.5) * h; const cw = Math.min(290, w - 16); card.style.width = cw + 'px'; const left = x + 18 + cw > w ? Math.max(8, x - 18 - cw) : x + 18; card.style.left = left + 'px'; card.style.top = Math.max(8, Math.min(h - card.offsetHeight - 8, y - 40)) + 'px'; card.style.opacity = cardV.z > 1 ? 0 : 1; }
    const handle = { el, api, dispose, disposed: false };
    let renderer, scene, camera, raycaster, clock, resize, raf = null, ro = null, disposed = false, failed = false, walk = null;
    const objs = {}, people = {}, pins = [], rings = {}; let arrow = null, beam = null, bubbles = [], handMarkers = {}, mentorHome = null;
    const cam = { view: WALK ? (api.view || api.st.view || 'follow') : (api.st.view || 'third'), yaw: 0.2, pitch: -0.35, dist: 4.2, fov: 70, pan: new THREE.Vector3(0, 1.0, 0), pos: new THREE.Vector3(), look: new THREE.Vector3(), tPos: new THREE.Vector3(), tLook: new THREE.Vector3(), first: { yaw: -2.55, pitch: -0.62 }, fYaw: Math.PI, fPitch: -0.38, fDist: 3.4, lastDrag: -10, wfov: Math.max(FOV_MIN, Math.min(FOV_MAX, Number(api.fov) || 70)) };
    window.HT.theatre3dRooms = window.HT.theatre3dRooms || {}; // v4.1 room hook: room type → builder(ctx) → hotspot map H
    const extraSolids = []; // floor furniture added by room builders outside `objs` that must still block the nav grid
    const tickers = []; let photoSpot = null; // v4.1: per-frame prop animations (TDP glow, moxa smoke) and a room-specific wall spot for the licensed photo
    const RM = reducedMotion();
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
      if (walk) { try { walk.dispose(); } catch (e) { /* ignore */ } }
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
    // software GL (SwiftShader / llvmpipe, e.g. headless CI or a VM without a GPU) gets a lower quality tier:
    // no shadows, no prefiltered environment, a smaller render target. `api.quality` ('low' | 'high') overrides.
    let softGL = false; try { const gl0 = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'); const dbgInfo = gl0 && gl0.getExtension('WEBGL_debug_renderer_info'); const rs = dbgInfo ? gl0.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : ''; softGL = /swiftshader|llvmpipe|softpipe|software/i.test(String(rs)); const lose = gl0 && gl0.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) { /* ignore */ }
    const quality = api.quality === 'low' || api.quality === 'high' ? api.quality : (softGL ? 'low' : 'high'); handle.quality = quality; const LOWQ = quality === 'low';
    const dprCap = w => LOWQ ? 0.6 : (w < 700 ? 1.5 : 2);
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !LOWQ, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap(window.innerWidth)));
    renderer.shadowMap.enabled = !LOWQ; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.98; renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    const rk = makeKit(K), ck = makeKit(K); const ceilingGroup = new THREE.Group(); scene.add(ceilingGroup); const dimRoom = type === 'reading';
    for (let x = -3.6; x <= 3.6; x += 2.4) for (let z = -3; z <= 3; z += 2) { if (orLike && Math.abs(x) < 2 && Math.abs(z) < 1.6) continue; if (dimRoom && (Math.abs(z) > 2.5 || Math.abs(x) > 3)) continue; ck.box(1.2, 0.012, 0.6, x, ROOM.h - 0.016, z, '#ffffff', 'panel'); ck.box(1.28, 0.012, 0.68, x, ROOM.h - 0.008, z, '#c9d0d3', 'satin'); }
    [[-ROOM.w / 2 + 0.03, 0, Math.PI / 2, ROOM.d], [ROOM.w / 2 - 0.03, 0, Math.PI / 2, ROOM.d], [0, -ROOM.d / 2 + 0.03, 0, ROOM.w], [0, ROOM.d / 2 - 0.03, 0, ROOM.w]].forEach(([x, z, ry, len]) => { rk.box(len, 0.12, 0.03, x, 0.06, z, dimRoom ? '#2a2f38' : '#7d9590', 'rubber', 0, ry, 0); if (type !== 'ward' && type !== 'clinic' && type !== 'reading' && type !== 'dental') { rk.box(len, 0.08, 0.035, x, 0.92, z, '#c9d0d3', 'satin', 0, ry, 0); } });
    // window on the -z wall with a pane whose colour follows the time of day (setMood)
    const winW = dimRoom ? 1.6 : 3.2; rk.box(winW, 1.2, 0.03, 3.2, 1.7, -ROOM.d / 2 + 0.03, '#9fd3e8', 'glass'); rk.box(winW + 0.1, 0.05, 0.06, 3.2, 1.08, -ROOM.d / 2 + 0.04, '#cfd6da', 'satin'); rk.box(winW + 0.1, 0.05, 0.06, 3.2, 2.32, -ROOM.d / 2 + 0.04, '#cfd6da', 'satin');
    const paneMat = new THREE.MeshBasicMaterial({ color: dimRoom ? 0x46525e : 0xbfe3f2, toneMapped: false }); const pane = new THREE.Mesh(new THREE.PlaneGeometry(winW, 1.2), paneMat); pane.position.set(3.2, 1.7, -ROOM.d / 2 + 0.012); roomGroup.add(pane);
    if (dimRoom) for (let i = 0; i < 12; i++) rk.box(winW, 0.012, 0.01, 3.2, 1.12 + i * 0.1, -ROOM.d / 2 + 0.02, '#8a94a0', 'matte'); // blinds
    rk.rbox(0.62, 0.36, 0.05, 0.02, 2.0, 2.3, ROOM.d / 2 - 0.03, '#1b2226', 'plastic'); rk.box(0.5, 0.08, 0.01, 2.0, 2.38, ROOM.d / 2 - 0.058, '#ff5a3c', 'glow'); rk.box(0.5, 0.06, 0.01, 2.0, 2.24, ROOM.d / 2 - 0.058, '#4dff8f', 'glow');
    if (orLike) { rk.rbox(1.4, 1.9, 0.42, 0.02, 4.4, 1.05, -ROOM.d / 2 + 0.22, '#dfe6e9', 'paint'); for (let i = 0; i < 4; i++) rk.box(1.3, 0.012, 0.36, 4.4, 0.3 + i * 0.45, -ROOM.d / 2 + 0.24, '#f4f6f8', 'glass'); rk.box(1.36, 1.8, 0.01, 4.4, 1.05, -ROOM.d / 2 + 0.43, '#dff3ff', 'glass'); }
    const roomBuilt = rk.build({ shadow: false }); roomGroup.add(roomBuilt);
    if (orLike) { const dm = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.4), new THREE.MeshStandardMaterial({ map: diffuserTexture(), emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 })); dm.rotation.x = Math.PI / 2; dm.position.set(0.1, ROOM.h - 0.03, 0); ceilingGroup.add(dm); [[0, -1.22, 3.1, 0.06], [0, 1.22, 3.1, 0.06], [-1.52, 0, 0.06, 2.5], [1.52, 0, 0.06, 2.5]].forEach(([x, z, w, d2]) => ck.box(w, 0.05, d2, 0.1 + x, ROOM.h - 0.03, z, '#cfd6da', 'satin')); }
    ceilingGroup.add(ck.build({ shadow: false }));
    // image-based lighting: a small procedural room prefiltered with PMREM (no external HDR file)
    if (!LOWQ) try {
      const envScene = new THREE.Scene(); const envBox = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 10), new THREE.MeshBasicMaterial({ color: 0x9aa8a4, side: THREE.BackSide })); envScene.add(envBox);
      [[-3, 1.9, -2], [3, 1.9, -2], [-3, 1.9, 2], [3, 1.9, 2], [0, 1.9, 0]].forEach(([x, y, z]) => { const pnl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff })); pnl.position.set(x, y, z); pnl.rotation.x = Math.PI / 2; envScene.add(pnl); });
      const win2 = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), new THREE.MeshBasicMaterial({ color: 0xbfe3f2 })); win2.position.set(3, 0.4, -4.9); envScene.add(win2);
      const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(envScene, 0.04).texture; if ('environmentIntensity' in scene) scene.environmentIntensity = 0.45; pmrem.dispose(); envScene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    } catch (e) { /* older GPUs: fall back to the lights below */ }
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a9a95, 0.5); scene.add(hemi);
    const amb = new THREE.AmbientLight(0xffffff, 0.18); scene.add(amb);
    const lamps = []; let key = null;
    if (type === 'or' || type === 'er' || type === 'imaging') {
      [[-0.42, -0.5], [0.6, 0.48]].forEach(([ox, oz], i) => { const sp = new THREE.SpotLight(0xfff3e2, 15, 7, 0.5, 0.6, 1.6); sp.position.set(ox, 1.98, oz); sp.target.position.set(0, PAD + 0.15, 0); sp.castShadow = i === 0; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -0.0006; scene.add(sp); scene.add(sp.target); lamps.push(sp); });
    } else { key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 5, 2); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7; scene.add(key); }
    if (type === 'dental') { const sp = new THREE.SpotLight(0xfff6e0, 12, 5, 0.45, 0.6, 1.6); sp.position.set(0.7, 1.95, -0.7); sp.target.position.set(0.3, 1.2, -1.1); scene.add(sp); scene.add(sp.target); lamps.push(sp); }
    const fill = new THREE.PointLight(0xdfefff, 8, 12, 2); fill.position.set(3, 2.6, -3); fill.visible = !LOWQ; scene.add(fill); // software GL: one light fewer in every shader
    const taskLights = []; // reading-room desk lamps (added by the layout)
    const beacon = new THREE.PointLight(0xff3b1f, 0, 6, 2); beacon.position.set(0, 2.5, 3.6); beacon.visible = false; scene.add(beacon);
    // light rig references + mood targets (day / eve / night / alarm); the reading room runs darker
    // v4.1 room tone: [tint colour, intensity] multiplied into the mood (warm herbal pharmacy, bright daylight TCM clinic)
    const TONE = { 'herbal-pharmacy': [0xffd9b0, 0.9], 'tcm-clinic': [0xfffdf7, 1.12], tuina: [0xfff3e6, 1.0], acupuncture: [0xfff8f0, 1.02], cssd: [0xf4fbff, 1.08], 'decoction-lab': [0xffffff, 1.05], 'biomed-lab': [0xf6f9ff, 1.05] }[type] || [0xffffff, 1];
    const toneCol = new THREE.Color(TONE[0]);
    const roomLight = (dimRoom ? 0.42 : 1) * TONE[1];
    const MOODS = {
      day: { hemi: [0xffffff, 0.5], amb: [0xffffff, 0.18], fill: [0xdfefff, 8], key: 1, panel: 0xffffff, pane: dimRoom ? 0x46525e : 0xbfe3f2, exposure: 0.98, beacon: 0 },
      eve: { hemi: [0xffe3c4, 0.4], amb: [0xffe8d0, 0.15], fill: [0xffd3a8, 6], key: 0.8, panel: 0xfff0dc, pane: dimRoom ? 0x4a4650 : 0xf0a860, exposure: 0.92, beacon: 0 },
      // night: a clinical room on a night shift is still fully lit (the window goes dark and the light turns cooler);
      // only the hallway/ambient falls off, so the floor, people and equipment stay readable
      night: { hemi: [0xc8d4ff, 0.28], amb: [0xbfc8ff, 0.15], fill: [0xdbe4ff, 5.6], key: 0.8, panel: 0xdfe6f5, pane: 0x0b1630, exposure: 0.9, beacon: 0 },
      alarm: { hemi: [0xffb080, 0.38], amb: [0xff7a50, 0.22], fill: [0xff9a60, 6], key: 0.7, panel: 0xffc8a0, pane: dimRoom ? 0x46525e : 0xbfe3f2, exposure: 0.95, beacon: 5 }
    };
    const mood = { name: 'day', from: null, to: MOODS.day, t: 1, dur: 1, cA: new THREE.Color(), cB: new THREE.Color() };
    const moodApply = (m, k) => { // k = blend 0..1 between from and to (allocation free)
      const A = mood.from || m, B = m; const mix = (a, b) => a + (b - a) * k; const colr = (obj, ca, cb) => { mood.cA.set(ca); mood.cB.set(cb); obj.lerpColors(mood.cA, mood.cB, k); };
      colr(hemi.color, A.hemi[0], B.hemi[0]); hemi.color.multiply(toneCol); hemi.intensity = mix(A.hemi[1], B.hemi[1]) * roomLight * (LOWQ ? 1.35 : 1); colr(amb.color, A.amb[0], B.amb[0]); amb.color.multiply(toneCol); amb.intensity = mix(A.amb[1], B.amb[1]) * roomLight * (LOWQ ? 1.3 : 1);
      colr(fill.color, A.fill[0], B.fill[0]); fill.intensity = mix(A.fill[1], B.fill[1]) * roomLight; if (key) { key.intensity = 1.4 * mix(A.key, B.key) * roomLight; key.color.copy(toneCol); } lamps.forEach(sp => { sp.intensity = (sp.userData.base || (type === 'dental' ? 12 : 15)) * mix(0.6 + A.key * 0.4, 0.6 + B.key * 0.4); });
      colr(K.mat.panel.color, A.panel, B.panel); K.mat.panel.color.multiply(toneCol); if (dimRoom) K.mat.panel.color.multiplyScalar(0.55); colr(paneMat.color, A.pane, B.pane); renderer.toneMappingExposure = mix(A.exposure, B.exposure); beacon.intensity = mix(A.beacon, B.beacon); beacon.visible = beacon.intensity > 0.01;
      taskLights.forEach(l => { l.intensity = (l.userData.base || 1) * (2.6 - 1.2 * mix(A.key, B.key)); });
    };
    function setMood(name, instant) { const m = MOODS[name] || MOODS.day; if (m === mood.to && !instant) return; mood.from = mood.to; mood.to = m; mood.name = MOODS[name] ? name : 'day'; mood.t = instant || RM ? 1 : 0; moodApply(m, mood.t); }

    // ---- table + patient
    const dept = api.c.department || '';
    const NEWR = !!NEW_ROOM[type];
    const variant = NEWR ? (type === 'icu' ? 'bed' : 'none') : type === 'ward' || type === 'clinic' ? 'bed' : type === 'er' ? 'stretcher' : 'or';
    const site = variant === 'or' ? siteFor(api.c, api.fieldType, type) : 'none';
    const posture = site === 'back' ? 'prone' : site === 'lithotomy' ? 'lithotomy' : 'supine';
    const screenOn = variant === 'or' && !HEAD_SITES[site] && site !== 'neck' && site !== 'airway' && site !== 'none';
    const devKind = type === 'dental' ? 'dentalchair' : deviceKind(dept);
    const fieldTexKind = fieldTex(site, api.fieldType || '', dept);
    const skinTone = ['#dfae8a', '#c98d62', '#f0cfae', '#a8714a'][(api.c.id || '').length % 4];
    let field = new THREE.Group(); field.userData.hot = 'field';
    const FOOT_FIELD = { or: [-1.15, 1.45, -0.78, 0.78], stretcher: [-1.05, 1.05, -0.42, 0.42], bed: [-1.1, 1.1, -0.56, 0.56], dental: [-0.85, 0.95, -1.05, 0.75] };
    if (variant !== 'none') {
      tableG = buildTable(K, { variant, site, posture, screen: screenOn }); field.add(tableG);
      patient = buildPatient(K, { variant, site, posture, screen: screenOn, progress: api.progress, fieldTex: fieldTexKind, room: type, skin: skinTone }); field.add(patient.group);
      if (variant === 'or' && site !== 'none' && site !== 'airway') { const ck = makeKit(K); const fx = (WINDOWS[site] || [-0.3, 0])[1] || 0; ck.rbox(0.05, 0.02, 0.2, 0.01, 0.25, PAD + 0.2, -0.26, '#eaf2f5', 'glass'); ck.cyl(0.006, 0.006, 0.17, 0.25, PAD + 0.21, -0.25, '#f4f6f8', 'plastic', Math.PI / 2, 0, 0, 8); ck.tube([[fx, PAD + 0.2, -0.05], [0.25, PAD + 0.22, -0.2], [0.35, PAD + 0.14, -0.33], [0.4, PAD - 0.1, -0.36], [0.2, 0.4, -0.5], [-0.15, 0.85, -1.4]], 0.004, '#e8eef0', 'plastic', 48); ck.tube([[fx + 0.05, PAD + 0.2, 0.04], [0.3, PAD + 0.21, 0.2], [0.45, PAD + 0.13, 0.33], [0.6, 0.6, 0.45], [1.1, 0.95, 0.8], [1.6, 0.9, -0.9]], 0.0055, '#e6eff2', 'plastic', 48); const cg = ck.build({ shadow: false }); cg.traverse(m => { if (m.isMesh) m.userData.region = null; }); field.add(cg); }
      field.traverse(o => { if (o.isMesh) o.userData.hot = 'field'; });
      scene.add(field); objs.field = field; field.userData.name = type === 'icu' ? say('加護病床與病人', 'ICU bed & patient') : say('手術台與病人', 'Operating table & patient'); field.userData.info = type === 'icu' ? 'icubed' : 'field';
      field.userData.field = patient.fieldMesh;
    }
    // ---- shared live monitor canvas (patient monitor, recovery bed, resus, perfusion)
    const headX = patient ? patient.head[0] : -0.86;
    mon.tex = tex(mon.c); const mctx = { monitorCanvas: mon.c, monitorTex: mon.tex, device: devKind, carmX: site === 'arm' ? -0.52 : Math.max(-0.6, Math.min(0.88, (WINDOWS[site] ? (WINDOWS[site][0] + WINDOWS[site][1]) / 2 : site === 'lithotomy' ? 0.05 : -0.3) + 0.48)), carmZ: site === 'arm' ? 0.9 : 0, carmYaw: site === 'limb' ? -0.7 : site === 'arm' ? -Math.PI / 2 : 0, parkedDevice: variant !== 'or' || site === 'none', microTarget: site === 'arm' ? [-0.52 - POS.device[0], 0.66 - POS.device[2]] : site === 'limb' ? [0.5 - POS.device[0], 0.1 - POS.device[2]] : [headX - POS.device[0], 0 - POS.device[2]], lightHeads: [[-0.42, -0.5, 4], [0.6, 0.48, 5]] };
    const screens = [];
    function addEquip(id, p, ry, opt) { opt = opt || {}; const e = equipment(id, api, K, mctx, opt); at(e, p, ry); scene.add(e); const as = opt.as || id; objs[as] = e; if (as !== id) { e.userData.hot = as; e.traverse(o => { if (o.isMesh || o.isSprite) o.userData.hot = as; }); } if (opt.name) e.userData.name = opt.name; if (opt.info) e.userData.info = opt.info; (e.userData.screens || []).forEach(s => screens.push(s)); if (typeof e.userData.tick === 'function') tickers.push(e.userData.tick); return e; }
    let hotPos = POS; const alias = Object.assign({}, HOT_ALIAS);
    if (!NEWR) {
      const ROT = { whiteboard: Math.PI / 2, imaging: 0, door: Math.PI, huddle: Math.PI, chart: -0.6, lab: -Math.PI / 2, cart: -0.8, anesthesia: Math.PI / 2, monitor: Math.atan2(1.7, 1.25), tray: 0, drains: 0.4, device: devKind === 'carm' || devKind === 'microscope' ? 0 : Math.PI };
      Object.keys(POS).forEach(id => { if (id === 'field') return; addEquip(id, POS[id], ROT[id] || 0); });
      const XR = { backtable: Math.PI / 2, specimen: 0, esu: 0.3, warmer: 0.5, kick: 0, ivpole: 0, sink: Math.PI, lightbox: Math.PI / 2, wallpacs: Math.PI / 2, carm: -Math.PI / 2, microscope: 0.6, endo: 0.5, us: -0.4, lights: 0 };
      const parked = { carm: devKind !== 'carm', microscope: devKind !== 'microscope', endo: devKind !== 'endo', us: devKind !== 'us' };
      Object.keys(EXTRA).forEach(id => {
        if (!orLike && /backtable|specimen|esu|warmer|kick|lights|carm|microscope|endo/.test(id) && !(type === 'er' && id === 'lights')) return;
        if (parked[id] === false) return;
        if (id === 'us' && (type === 'ward' || type === 'clinic')) return;
        addEquip(id, EXTRA[id], XR[id] || 0);
      });
      if (type === 'ward' || type === 'clinic') { alias.bed = 'field'; alias.desk = 'chart'; }
      // breathing circuit from the anaesthesia machine to the patient's tube (corrugated limbs)
      if (variant === 'or' && posture !== 'prone' && site !== 'mouth') { const ck = makeKit(K); const Y = [patient.head[0] - 0.19, patient.head[1] + 0.23, 0.09]; const M = [-2.45, 1.1, -0.72]; [[0.05, '#5fa8e0'], [-0.05, '#d8e6ee']].forEach(([o, c2]) => { const pts = [M, [-2.0, 1.45, -0.2 + o], [-1.45, 1.42, -0.05 + o], [Y[0] - 0.12, Y[1] + 0.06, Y[2] + o * 0.4], Y]; ck.tube(pts, 0.012, c2, 'plastic', 48, 8); const cvv = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))); for (let i = 1; i < 36; i++) { const pp = cvv.getPoint(i / 36), tt = cvv.getTangent(i / 36); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tt); const e = new THREE.Euler().setFromQuaternion(q); ck.tor(0.0125, 0.0028, pp.x, pp.y, pp.z, c2, 'plastic', e.x, e.y, e.z, Math.PI * 2, 5); } }); ck.cyl(0.012, 0.016, 0.05, Y[0], Y[1], Y[2], '#e8eef0', 'plastic', 0, 0, Math.PI / 2, 10); const cg = ck.build({ shadow: false }); cg.traverse(m => { if (m.isMesh) { m.userData.hot = 'anesthesia'; m.userData.equip = 'anesthesia'; } }); scene.add(cg); }
    } else hotPos = buildRoom(type);
    if (NEWR) { // every generic shift hotspot id resolves to something in the room (main spot as the last resort), never the bare room centre
      const main = (objs.field && objs.field.userData.hot) || (objs.door ? 'door' : null); const has = k => !!(k && objs[k]);
      if (main) SHIFT_HOTS.forEach(id => { if (has(id)) return; const a = alias[id]; if (has(a) || has(HOT_ALIAS[a]) || has(HOT_ALIAS[id])) return; alias[id] = main; });
    }
    Object.keys(hotPos).forEach(id => { const p = hotPos[id]; const r = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 48), new THREE.MeshBasicMaterial({ color: 0xc0392b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.set(p[0], 0.012, p[2]); scene.add(r); rings[id] = r; });
    // ---- v4.0 room layouts (ICU / lab / reading room / dental operatory)
    function bedBay(id, p, ry, name, info, skin) { const g = new THREE.Group(); const tb = buildTable(K, { variant: 'bed', site: 'none', posture: 'supine', screen: false }); g.add(tb); const pt = buildPatient(K, { variant: 'bed', site: 'none', posture: 'supine', screen: false, progress: 0, fieldTex: 'generic', room: 'icu', skin }); g.add(pt.group); g.traverse(o => { if (o.isMesh) o.userData.hot = id; }); g.userData.hot = id; g.userData.name = name; g.userData.info = info; g.userData.equip = 'recovery'; g.userData.footRect = FOOT_FIELD.bed; at(g, p, ry); scene.add(g); objs[id] = g; return g; }
    function dentalPatient(G) { // reclined in the chair (chair local frame: head at -z, light arm at +x)
      const pk2 = makeKit(K), SK = skinTone, shirt = '#7a9cc0', tr = '#4a5560';
      [-1, 1].forEach(s => { pk2.seg([s * 0.1, 0.66, -0.05], [s * 0.1, 0.62, 0.42], 0.085, 0.07, tr, 'cloth', 12); pk2.seg([s * 0.1, 0.62, 0.42], [s * 0.1, 0.56, 0.82], 0.065, 0.05, tr, 'cloth', 12); pk2.rbox(0.1, 0.07, 0.26, 0.03, s * 0.1, 0.54, 0.9, '#2b3036', 'rubber'); });
      pk2.seg([0, 0.66, -0.08], [0, 1.1, -0.42], 0.2, 0.17, shirt, 'cloth', 16); pk2.sph(0.2, 0.12, 0.16, 0, 0.7, -0.06, shirt, 'cloth', 14); pk2.box(0.3, 0.01, 0.34, 0, 1.0, -0.12, '#bfe3e8', 'cloth', 0.95, 0, 0);
      [-1, 1].forEach(s => { pk2.seg([s * 0.2, 1.08, -0.4], [s * 0.3, 0.8, -0.1], 0.055, 0.05, shirt, 'cloth', 10); pk2.seg([s * 0.3, 0.8, -0.1], [s * 0.28, 0.72, 0.25], 0.045, 0.04, SK, 'skin', 10); pk2.sph(0.05, 0.03, 0.06, s * 0.28, 0.72, 0.3, SK, 'skin', 10); });
      pk2.sph(0.11, 0.1, 0.12, 0, 1.3, -0.6, SK, 'skin', 18); pk2.sph(0.115, 0.1, 0.11, 0, 1.27, -0.66, '#2a2420', 'matte', 16); pk2.sph(0.03, 0.02, 0.028, 0, 1.364, -0.51, '#5a1a1e', 'matte', 10); pk2.sph(0.018, 0.012, 0.02, 0, 1.4, -0.56, SK, 'skin', 8); pk2.box(0.2, 0.012, 0.05, 0, 1.4, -0.6, '#f0a040', 'glass', 0.95, 0, 0);
      const pg = pk2.build(); pg.children.forEach(m => { m.userData.patient = true; m.userData.region = m.material === K.mat.paint ? 'mouth' : 'chest'; }); G.add(pg);
    }
    // v4.1: the room context handed to external builders (window.HT.theatre3dRooms[type] = ctx => H) and used by the
    // built-in TCM rooms. Field names are the public contract documented in /home/claude/work/v41/HOOK_READY.
    function setField(obj, hotId) { const o = typeof obj === 'string' ? objs[obj] : obj; if (!o) return null; field = o; objs.field = o; const id = hotId || o.userData.hot; if (id && hotPos && hotPos[id]) hotPos.field = hotPos[id]; return o; }
    function wallText(lines, w, h, opts) { // a framed canvas poster / chart / sign; lines = string | string[] ; opts {bg,color,size,title,sim,frame}
      opts = opts || {}; const W = opts.px || 512, Hh = Math.round(W * (h / w)); const c = canvas(W, Hh), g = c.getContext('2d'); g.fillStyle = opts.bg || '#fbf7ee'; g.fillRect(0, 0, W, Hh);
      const arr = Array.isArray(lines) ? lines : String(lines || '').split('\n'); const fs = opts.size || Math.max(16, Math.round(W / 22)); let y = fs * 1.6;
      if (opts.title) { g.fillStyle = opts.titleColor || '#7a1c24'; g.font = `700 ${Math.round(fs * 1.25)}px system-ui, "Noto Sans TC", sans-serif`; g.fillText(opts.title, fs, y); y += fs * 1.7; g.fillStyle = '#c9a063'; g.fillRect(fs, y - fs * 1.1, W - fs * 2, 3); }
      g.fillStyle = opts.color || '#2b2420'; g.font = `${opts.weight || 500} ${fs}px system-ui, "Noto Sans TC", sans-serif`; arr.forEach(l => { if (y > Hh - 8) return; g.fillText(String(l), fs, y); y += fs * 1.45; });
      if (opts.draw) opts.draw(g, W, Hh); if (opts.sim) simLabel(g, W, Hh);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.85, metalness: 0 })); m.userData.tex = m.material.map; return m;
    }
    function roomCtx(H, put, A) {
      return { THREE, scene, roomGroup, floor, K, api, say, T, t, pk, zh, put, A, H, at, bedBay, addEquip, equipment: (id, opt) => equipment(id, api, K, mctx, opt || {}), canvas, tex, mctx, objs, setField, ROOM, INFO, wallText, type, dimRoom, LOWQ, RM, makeKit, labelSprite, screenCanvas, screenMesh, simLabel, chair, castors, place, INSTR, person, lamps, taskLights, screens, alias,
        solid: (obj, rect) => { extraSolids.push({ obj, rect: rect || null }); return obj; }, skinTone, PAD, WINDOWS, buildTable, buildPatient, noise, col, FINISH,
        tick: fn => { if (typeof fn === 'function') tickers.push(fn); }, // fn(now, dt, reducedMotion) every frame
        photoAt: (p, ry, max) => { photoSpot = { p, ry: ry || 0, max: max || null }; }, // where the licensed scene photo hangs (default: back wall)
        region: (id, region) => { const o = objs[id]; if (o) o.traverse(m => { if (m.isMesh) m.userData.region = region; }); } }; // picks on the main object open this body region
    }
    // ---- v4.1 TCM rooms (中醫診間 / 針灸治療室 / 中藥局 / 推拿傷科) — detailed builders below
    function buildTcmRoom(rt, H, put, A) {
      const ctx = roomCtx(H, put, A);
      if (rt === 'tcm-clinic') return tcmClinicRoom(ctx);
      if (rt === 'acupuncture') return acupunctureRoom(ctx);
      if (rt === 'herbal-pharmacy') return herbalPharmacyRoom(ctx);
      return tuinaRoom(ctx);
    }
    function buildRoom(rt) {
      const H = {}; const put = (builder, p, ry, opt) => { const e = addEquip(builder, p, ry, opt); const id = (opt && opt.as) || builder; H[id] = [p[0], 0, p[2]]; return e; }; const A = (from, to) => { alias[from] = to; };
      hotPos = H;
      const ext = window.HT.theatre3dRooms && window.HT.theatre3dRooms[rt];
      if (typeof ext === 'function') { const R = ext(roomCtx(H, put, A)); const out = R && typeof R === 'object' ? R : H; if (!out.door) { put('door', [0, 0, 4.35], Math.PI); if (out !== H) out.door = H.door; } if (!objs.field) setField(objs[out.field ? 'field' : Object.keys(out)[0]] || objs.door); return out; }
      if (TCM_ROOM[rt]) return buildTcmRoom(rt, H, put, A);
      if (rt === 'icu') {
        at(field, [0, 0, -2.85], -Math.PI / 2); H.field = [0, 0, -2.85];
        put('ventilator', [-1.15, 0, -3.55], Math.PI / 2, { as: 'device' }); put('wallmonitor', [0.95, 0, -4.47], 0, { as: 'monitor' }); put('ivpole', [1.05, 0, -3.4], 0); put('drains', [-1.0, 0, -2.0], 0.4); put('tray', [1.3, 0, -2.1], 0);
        put('curtain', [-1.9, 0, -2.9], -Math.PI / 2); put('curtain', [1.9, 0, -2.9], -Math.PI / 2, { as: 'curtain2', info: 'curtain' });
        bedBay('bed2', [-3.6, 0, -2.85], -Math.PI / 2, say('隔離病床（2 床）', 'Isolation bay (bed 2)'), 'bed2', '#c98d62'); H.bed2 = [-3.6, 0, -2.85]; put('ventilator', [-4.75, 0, -3.55], Math.PI / 2, { as: 'ventilator2', info: 'ventilator' }); put('ivpole', [-2.55, 0, -3.4], 0, { as: 'ivpole2', info: 'ivpole' }); put('wallmonitor', [-2.65, 0, -4.47], 0, { as: 'monitor2', info: 'monitor' });
        bedBay('recovery', [3.6, 0, -2.85], -Math.PI / 2, say('加護病床（3 床）', 'ICU bed 3'), 'recovery', '#f0cfae'); H.recovery = [3.6, 0, -2.85]; put('ventilator', [4.75, 0, -3.55], -Math.PI / 2, { as: 'ventilator3', info: 'ventilator' }); put('ivpole', [2.55, 0, -3.4], 0, { as: 'ivpole3', info: 'ivpole' }); put('wallmonitor', [2.65, 0, -4.47], 0, { as: 'monitor3', info: 'monitor' });
        put('station', [0.3, 0, 1.5], 0, { as: 'desk' }); put('chart', [2.3, 0, 1.9], -0.6); put('whiteboard', [5.44, 0, 0.6], -Math.PI / 2); put('imaging', [4.7, 0, 2.6], -Math.PI / 2); put('lab', [-4.75, 0, 0.8], Math.PI / 2); put('cart', [-3.2, 0, 1.6], 0.5); put('crash', [3.4, 0, 3.4], Math.PI); put('sink', [-2.4, 0, 4.22], Math.PI); put('us', [-1.9, 0, -0.6], 0.3); put('door', [0, 0, 4.35], Math.PI);
        A('bed', 'field'); A('anaesthesia', 'device'); A('handover', 'desk'); A('huddle', 'desk');
      } else if (rt === 'lab') {
        put('bench', [-0.8, 0, -1.3], 0, { len: 3.6 }); put('labscope', [-1.8, 0, -1.3], 0, { as: 'microscope' }); put('labscope', [-0.8, 0, -1.3], 0, { as: 'microscope2', info: 'labscope' }); put('centrifuge', [0.4, 0, -1.3], 0);
        put('bench', [-0.8, 0, 1.3], Math.PI, { len: 3.6, kind: 'work', as: 'bench2', info: 'bench' }); put('workstation', [0.3, 0, 1.3], Math.PI, { y: 0.9, left: 'smear', leftKind: 'lab', text: say('檢驗資訊系統 LIS・待驗清單・危急值通報', 'LIS worklist · pending · critical-value calls') });
        put('analyser', [4.45, 0, -1.6], -Math.PI / 2); put('lab', [4.6, 0, 1.0], -Math.PI / 2); put('wallbench', [-5.08, 0, 0.2], Math.PI / 2, { len: 4.4 }); put('hood', [-4.95, 0, -3.1], Math.PI / 2); put('fridge', [-4.95, 0, 3.4], Math.PI / 2); put('sink', [-2.4, 0, 4.22], Math.PI);
        put('recdesk', [2.8, 0, 3.4], Math.PI, { as: 'desk' }); put('whiteboard', [-1.2, 0, -4.47], 0); put('door', [0, 0, 4.35], Math.PI);
        field = objs.bench; objs.field = field; H.field = H.bench; A('instruments', 'bench'); A('device', 'analyser'); A('drugs', 'fridge'); A('drain', 'hood'); A('imaging', 'workstation'); A('monitor', 'workstation'); A('chart', 'desk'); A('handover', 'desk'); A('huddle', 'desk'); A('recovery', 'desk'); A('anaesthesia', 'analyser');
      } else if (rt === 'reading') {
        put('readdesk', [-3.0, 0, -3.5], 0, { as: 'workstation' }); put('readdesk', [0.2, 0, -3.5], 0, { as: 'imaging', info: 'readdesk' }); put('readdesk', [-4.5, 0, 0.8], Math.PI / 2, { as: 'workstation2', info: 'readdesk' });
        put('lightbox', [5.44, 0, -2.2], -Math.PI / 2); put('wallpacs', [5.44, 0, -0.4], -Math.PI / 2); put('huddle', [2.6, 0, 1.6], Math.PI); put('workstation', [2.6, 0, 3.6], Math.PI, { desk: true, as: 'desk', left: 'chart', leftKind: null, right: 'pacs', rightKind: 'pacs', name: say('放射科櫃台（RIS／排程）', 'Radiology desk (RIS / scheduling)'), equip: 'chart' }); put('whiteboard', [-2.6, 0, 4.47], Math.PI); put('door', [0, 0, 4.35], Math.PI);
        [[-3.0, -3.5], [0.2, -3.5], [-4.5, 0.8]].forEach(([x, z]) => { const l = new THREE.PointLight(0xffd1a0, 2.2, 3.5, 2); l.position.set(x, 1.3, z); scene.add(l); taskLights.push(l); });
        field = objs.workstation; objs.field = field; H.field = H.workstation; A('monitor', 'workstation2'); A('chart', 'desk'); A('handover', 'huddle'); A('recovery', 'huddle'); A('device', 'workstation'); A('instruments', 'desk');
      } else if (rt === 'dental') {
        const chairE = equipment('device', api, K, Object.assign({}, mctx, { device: 'dentalchair', parkedDevice: true })); field.add(chairE); dentalPatient(field); field.traverse(o => { if (o.isMesh || o.isSprite) { o.userData.hot = 'field'; o.userData.equip = 'dentalchair'; } }); field.userData.hot = 'field'; field.userData.equip = 'dentalchair'; field.userData.name = say('牙科治療椅與病人', 'Dental chair & patient'); field.userData.info = 'dentalfield'; (chairE.userData.screens || []).forEach(s => screens.push(s)); at(field, [0.3, 0, -0.5], 0); scene.add(field); objs.field = field; H.field = [0.3, 0, -0.5]; objs.device = field;
        put('cabinets', [0.1, 0, -4.2], 0, { len: 3.0, autoclaveX: -0.9 }); put('workstation', [1.0, 0, -4.05], 0, { y: 0.9, chair: false, as: 'desk', left: 'xray', leftKind: 'lightbox', text: say('牙科病歷・治療計畫・牙位圖', 'Dental record · treatment plan · odontogram'), equip: 'chart' }); put('xrayarm', [-2.4, 0, -4.47], 0, { as: 'imaging' }); put('sink', [-4.0, 0, -4.2], 0);
        put('wallpacs', [-5.44, 0, 0.6], Math.PI / 2, { as: 'lightbox', info: 'lightbox' }); put('dentaltray', [1.5, 0, 0.5], 0, { as: 'tray' }); put('standmonitor', [1.7, 0, -1.7], -0.5, { as: 'monitor' }); put('stools', [-1.25, 0, -1.3], 0); put('dentallab', [4.9, 0, 1.2], -Math.PI / 2, { as: 'lab' }); put('armchair', [3.6, 0, 3.4], Math.PI, { as: 'recovery' }); put('whiteboard', [5.44, 0, -1.4], -Math.PI / 2); put('tallcab', [-5.2, 0, 2.4], Math.PI / 2, { as: 'cart' }); put('door', [0, 0, 4.35], Math.PI);
        H.device = H.field; A('drugs', 'cabinets'); A('anaesthesia', 'cabinets'); A('chart', 'desk'); A('handover', 'desk'); A('workstation', 'desk'); A('huddle', 'desk'); A('drain', 'field'); A('carm', 'imaging');
      } else { // a NEW_ROOM type whose builder pack did not load (e.g. theatre3d-labs.js missing): never an empty room
        put('bench', [-0.8, 0, -1.3], 0, { len: 3.6, kind: 'work' }); put('workstation', [2.6, 0, 1.3], Math.PI, { desk: true, as: 'desk' }); put('whiteboard', [-1.2, 0, -4.47], 0); put('sink', [-2.4, 0, 4.22], Math.PI); put('door', [0, 0, 4.35], Math.PI);
        setField('bench'); A('chart', 'desk'); A('handover', 'desk'); A('workstation', 'desk');
      }
      return H;
    }
    const WHITE_COAT = !!TCM_ROOM[type];
    api.roles.forEach(r => { if (WALK && r.player) return; const key = r.player ? 'player' : (ROLE_POS[r.id] ? r.id : 'extra'); const p = ROLE_POS[key] || ROLE_POS.extra; const m = person(K, r, { whiteCoat: WHITE_COAT }); at(m, p); m.lookAt(0, 1.1, 0); scene.add(m); people[r.id] = m; if (r.id === 'mentor') mentorHome = new THREE.Vector3(p[0], 0, p[2]); });
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
    if (!FILE && api.photo) { const loader = new THREE.TextureLoader(); loader.load(api.photo.src, t2 => { if (disposed) { t2.dispose(); return; } t2.colorSpace = THREE.SRGBColorSpace; photoState.tex = t2; photoState.panorama = !!api.photo.panorama; if (api.photo.panorama) { t2.mapping = THREE.EquirectangularReflectionMapping; const cap = labelSprite(say('實景 360°・', '360° photo · ') + (api.photo.credit || ''), { size: 22, bg: 'rgba(16,28,32,.75)', scale: 0.003 }); cap.position.set(0, 0.25, 2.6); photoGroup.add(cap); } else { const image = t2.image || {}; let size = photoPlaneSize(image.naturalWidth || image.width || api.photo.width, image.naturalHeight || image.height || api.photo.height); if (photoSpot && photoSpot.max) { const sc = Math.min(1, photoSpot.max[0] / size[0], photoSpot.max[1] / size[1]); size = [size[0] * sc, size[1] * sc]; } const print = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshStandardMaterial({ map: t2, roughness: 0.6 })); const PS = photoSpot; if (PS) { print.position.set(PS.p[0] + Math.sin(PS.ry) * 0.012, PS.p[1], PS.p[2] + Math.cos(PS.ry) * 0.012); print.rotation.y = PS.ry; } else print.position.set(-1.2, 1.75, -ROOM.d / 2 + 0.03); photoGroup.add(print); const cap = labelSprite(say('實景參考 · ', 'Reference photo · ') + (api.photo.credit || ''), { size: 22, bg: 'rgba(16,28,32,.75)' }); if (PS) cap.position.set(PS.p[0] + Math.sin(PS.ry) * 0.1, PS.p[1] - size[1] / 2 - 0.12, PS.p[2] + Math.cos(PS.ry) * 0.1); else cap.position.set(-1.2, 0.3, -ROOM.d / 2 + 0.1); photoGroup.add(cap); } photo = t2; applyPhoto(photoState.on); }, undefined, () => {}); }
    handle.setPhoto = applyPhoto; handle.showCard = showCard; handle.infoFor = id => { const o = objs[id]; return o ? infoOf(o.userData.info || id) : null; };
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
    const WALK_VIEWS = { follow: 1, fp: 1 };
    function setView(v) { if (!WALK && WALK_VIEWS[v]) v = v === 'fp' ? 'first' : 'third'; cam.view = v; if (v === 'first') { cam.fov = Math.max(45, Math.min(95, cam.fov)); } if (v === 'second') { cam.dist = Math.max(1.6, Math.min(6, 4.6 / (api.st.zoom || 1))); cam.yaw = 0.35; cam.pitch = -0.55; cam.pan.set(0, 1.05, 0); } if (v === 'third') { cam.yaw = 0.75; cam.pitch = -0.78; cam.dist = 10.5; cam.pan.set(0, 0.6, 0); } if (v === 'follow' && walk) { cam.fPitch = -0.38; cam.fYaw = clearYaw(walk.player.x, walk.player.z, walk.player.yaw + Math.PI, cam.fPitch, cam.fDist); } if (v === 'fp' && walk) { cam.first.yaw = walk.player.yaw; cam.first.pitch = -0.1; } hintText(); }
    function zoomBy(f) { if (cam.view === 'first') cam.fov = Math.max(35, Math.min(100, cam.fov * f)); else if (cam.view === 'fp') cam.wfov = Math.max(FOV_MIN, Math.min(FOV_MAX, cam.wfov * f)); else if (cam.view === 'follow') cam.fDist = Math.max(1.5, Math.min(6, cam.fDist * f)); else cam.dist = Math.max(cam.view === 'second' ? 0.9 : 4, Math.min(cam.view === 'second' ? 7 : 16, cam.dist * f)); }
    function flyTo(id) { if (WALK && walk) { walk.walkTo(id).catch(() => {}); return; } const o = objs[id]; if (!o) return; if (cam.view === 'third') setView('second'); cam.pan.set(o.position.x, 1.1, o.position.z); cam.dist = Math.min(cam.dist, 3.2); }
    const tpV = new THREE.Vector3(), dirV = new THREE.Vector3();
    // longest camera boom from the pivot along (yaw, pitch) that stays inside the room (slab test, no allocation)
    function fitDist(px, pz, yaw, pitch, want) {
      const dx = Math.sin(yaw) * Math.cos(pitch), dy = -Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch); let t = want;
      if (dx > 1e-6) t = Math.min(t, (ROOM.w / 2 - 0.3 - px) / dx); else if (dx < -1e-6) t = Math.min(t, (-ROOM.w / 2 + 0.3 - px) / dx);
      if (dz > 1e-6) t = Math.min(t, (ROOM.d / 2 - 0.3 - pz) / dz); else if (dz < -1e-6) t = Math.min(t, (-ROOM.d / 2 + 0.3 - pz) / dz);
      if (dy > 1e-6) t = Math.min(t, (ROOM.h - 0.2 - 1.35) / dy); else if (dy < -1e-6) t = Math.min(t, (0.45 - 1.35) / dy);
      const nv = walk && walk.nav; if (nv) { for (let s = 0.55; s < t; s += 0.12) { const i = nv.cellOf(px + dx * s, pz + dz * s); if (i >= 0 && nv.tall[i] > 0 && 1.35 + dy * s < nv.tall[i] + 0.1) { t = s - 0.15; break; } } } // stop short of tall furniture (pendants, cabinets, curtains)
      return Math.max(0.6, t);
    }
    function clearYaw(px, pz, behind, pitch, want) { // yaw near `behind` with the most room for the boom
      let best = behind, bd = fitDist(px, pz, behind, pitch, want); if (bd >= Math.min(want, 2.4)) return behind;
      for (const o of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, Math.PI]) { const y = behind + o, d = fitDist(px, pz, y, pitch, want); if (d > bd + 0.05) { bd = d; best = y; } if (bd >= Math.min(want, 2.4)) break; }
      return best;
    }
    function updateCamera(dt) {
      let snap = false;
      if (cam.view === 'first') { const f = presetFor('first'); tpV.copy(f.pos); dirV.set(Math.sin(cam.first.yaw) * Math.cos(cam.first.pitch), Math.sin(cam.first.pitch), Math.cos(cam.first.yaw) * Math.cos(cam.first.pitch)); cam.tLook.copy(tpV).add(dirV); camera.fov += (cam.fov - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); }
      else if (cam.view === 'fp' && walk) { const P = walk.player; tpV.set(P.x, 1.62 + P.bob, P.z); dirV.set(Math.sin(cam.first.yaw) * Math.cos(cam.first.pitch), Math.sin(cam.first.pitch), Math.cos(cam.first.yaw) * Math.cos(cam.first.pitch)); cam.tLook.copy(tpV).add(dirV); if (Math.abs(camera.fov - cam.wfov) > 0.3) { camera.fov += (cam.wfov - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); } snap = true; }
      else if (cam.view === 'follow' && walk) { const P = walk.player; const d = fitDist(P.x, P.z, cam.fYaw, cam.fPitch, cam.fDist); tpV.set(P.x + d * Math.sin(cam.fYaw) * Math.cos(cam.fPitch), 1.35 + d * -Math.sin(cam.fPitch), P.z + d * Math.cos(cam.fYaw) * Math.cos(cam.fPitch)); cam.tLook.set(P.x, 1.3, P.z); const ff = Math.min(FOLLOW_FOV_MAX, cam.wfov); if (Math.abs(camera.fov - ff) > 0.3) { camera.fov += (ff - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); } }
      else { const d = cam.dist; tpV.set(cam.pan.x + d * Math.sin(cam.yaw) * Math.cos(cam.pitch), cam.pan.y + d * -Math.sin(cam.pitch), cam.pan.z + d * Math.cos(cam.yaw) * Math.cos(cam.pitch)); tpV.y = cam.view === 'third' ? Math.max(1.5, tpV.y) : Math.max(0.4, Math.min(ROOM.h - 0.42, tpV.y)); cam.tLook.copy(cam.pan); if (Math.abs(camera.fov - 62) > 0.5) { camera.fov += (62 - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); } }
      const k = snap ? 1 : 1 - Math.exp(-dt * (cam.view === 'follow' ? 9 : 6)); cam.pos.lerp(tpV, k); cam.look.lerp(cam.tLook, k); camera.position.copy(cam.pos); camera.lookAt(cam.look);
      const pl = people[api.playerId]; if (pl) pl.visible = cam.view !== 'first' && cam.view !== 'fp'; fpHands.visible = cam.view === 'first' || cam.view === 'fp'; if (fpHands.visible) { const now = clock.elapsedTime; fpHands.position.y = 0.01 * Math.sin(now * 1.6) + (walk ? walk.player.bob * 0.5 : 0); }
    }

    // ---- interaction
    let ptr = null, pinchD = 0, hoverId = null, hoverEv = null;
    const pointers = new Map(); const ndc = new THREE.Vector2(); const tmpP = new THREE.Vector3();
    function pickHit(ev) {
      const r = cv.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const h of hits) { if (h.object === beam) continue; let o = h.object; let skip = false; while (o) { if (o.userData && (o.userData.hot || o.userData.zone !== undefined || o.userData.role)) { if (WALK && o.userData.role === 'player' && !o.userData.cast) { skip = true; break; } return { u: o.userData, obj: h.object, point: h.point }; } o = o.parent; } if (skip) continue; }
      return null;
    }
    function regionOfPoint(p) { tmpP.copy(p); field.worldToLocal(tmpP); return regionAt(tmpP.x, tmpP.y - PAD, tmpP.z, posture); }
    function targetOf(hit) {
      if (!hit || !hit.u || !hit.u.hot) return null;
      const ob = hit.obj.userData || {};
      if (hit.u.hot === 'field') { if (ob.part) return { kind: 'part', id: ob.part }; if (ob.region) return { kind: 'region', id: ob.region }; if (ob.patient) return { kind: 'region', id: regionOfPoint(hit.point) }; return { kind: 'region', id: regionOfPoint(hit.point) }; }
      const g = objs[hit.u.hot]; if (ob.region && g && g === field) return { kind: 'region', id: ob.region }; // v4.1 TCM rooms: the main couch / desk opens its body region
      const equip = ob.equip || (g && g.userData.equip) || hit.u.hot;
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
      if (u.cast) return u.label || u.cast;
      return pk((api.roles.find(r => r.id === u.role) || {}));
    }
    const firstLike = () => cam.view === 'first' || cam.view === 'fp';
    cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } pointers.set(e.pointerId, e); ptr = { x: e.clientX, y: e.clientY, moved: 0, yaw: firstLike() ? cam.first.yaw : cam.view === 'follow' ? cam.fYaw : cam.yaw, pitch: firstLike() ? cam.first.pitch : cam.view === 'follow' ? cam.fPitch : cam.pitch, pan: cam.pan.clone(), btn: e.button, shift: e.shiftKey }; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } });
    cv.addEventListener('pointermove', e => { if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e); if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinchD) zoomBy(pinchD / d); pinchD = d; return; } if (!ptr) { hoverEv = e; return; } const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y; ptr.moved = Math.max(ptr.moved, Math.abs(dx) + Math.abs(dy)); if (firstLike()) { cam.first.yaw = ptr.yaw - dx * 0.005; cam.first.pitch = Math.max(-1.2, Math.min(0.8, ptr.pitch + dy * 0.005)); if (walk) cam.lastDrag = clock.elapsedTime; } else if (cam.view === 'follow') { cam.fYaw = ptr.yaw - dx * 0.006; cam.fPitch = Math.max(-1.2, Math.min(-0.05, ptr.pitch - dy * 0.006)); cam.lastDrag = clock.elapsedTime; } else if (ptr.btn === 2 || ptr.shift) { const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)); cam.pan.copy(ptr.pan).addScaledVector(right, -dx * 0.004 * cam.dist); cam.pan.y = Math.max(0.3, Math.min(2.2, ptr.pan.y + dy * 0.004 * cam.dist)); } else { cam.yaw = ptr.yaw - dx * 0.006; cam.pitch = Math.max(-1.45, Math.min(-0.05, ptr.pitch - dy * 0.006)); } });
    function hover(e) { const hit = pickHit(e); const id = hit ? (hit.u.hot ? hit.u.hot + ':' + (targetOf(hit) || {}).id : hit.u.zone !== undefined ? 'zone' + hit.u.zone : hit.u.cast || hit.u.role) : null; if (id !== hoverId) { hoverId = id; cv.style.cursor = id ? 'pointer' : WALK ? 'default' : 'grab'; if (hit) { tip.textContent = tipFor(hit); tip.hidden = false; } else tip.hidden = true; } if (!tip.hidden) { const r = el.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 120) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; } }
    const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchD = 0; if (!ptr) return; const moved = ptr.moved; ptr = null; if (moved < 6) { const hit = pickHit(e); if (hit) { const u = hit.u; if (u.cast && walk) walk.tapCast(u.cast); else if (u.zone !== undefined) { if (api.onZone) api.onZone(u.zone); } else if (u.hot) act(u.hot, targetOf(hit), e); else if (u.role) api.onRole && api.onRole(u.role); } else if (walk) walk.tapFloor(e); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', () => { if (!pointers.size) { ptr = null; tip.hidden = true; hoverEv = null; } });
    cv.addEventListener('wheel', e => { e.preventDefault(); zoomBy(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('dblclick', e => { const hit = pickHit(e); if (hit && hit.u.hot) flyTo(hit.u.hot); });
    cv.style.cursor = WALK ? 'default' : 'grab'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', WALK ? T('walkAria', '3D 值班場景：方向鍵或 WASD 走動、拖曳環視、點地板走過去、E 對話或查看', '3D shift scene: arrow keys or WASD to walk, drag to look, tap the floor to walk there, E to talk or look') : say('3D 數位孿生手術室：拖曳環視、滾輪或雙指縮放；點病人、手術台或儀器看真實影像與數位孿生', '3D digital-twin theatre: drag to look, wheel or pinch to zoom; tap the patient, table or equipment for real images and the digital twin'));

    // ---- test / automation helpers
    const ANCHOR = { head: [-0.95, 0.16, 0], face: [-0.885, 0.19, 0.025], neck: [-0.71, 0.13, 0], mouth: [-0.815, 0.185, -0.012], chest: [-0.45, 0.2, -0.02], breast: [-0.46, 0.2, 0.11], 'abdomen-upper': [-0.2, 0.2, 0.0], 'abdomen-lower': [-0.04, 0.2, 0.0], pelvis: [0.08, 0.18, 0.0], spine: [-0.2, 0.2, 0.0], 'upper-limb': [-0.52, 0.06, 0.62], 'lower-limb': [0.5, 0.11, -0.09], skin: [-0.52, 0.06, -0.62] };
    function anchorWorld(region) { const a = ANCHOR[region]; if (!a) return null; let y = a[1]; if (posture === 'prone' && region === 'spine') y = 0.22; const v = new THREE.Vector3(a[0], y + PAD, a[2]); if (posture === 'lithotomy' && region === 'lower-limb') v.set(0.38, PAD + 0.45, 0.31); return field.localToWorld(v); }
    function project(v) { const p = v.clone().project(camera); const r = el.getBoundingClientRect(); return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height, visible: p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 }; }
    handle.screenPos = (id, y) => { const o = objs[id]; if (!o) return null; const v = o.position.clone(); v.y = y == null ? 1.0 : y; return project(v); };
    handle.hitAt = (x, y) => { const hit = pickHit({ clientX: x, clientY: y }); if (!hit) return null; const u = hit.u; return u.cast ? { kind: 'cast', id: u.cast } : u.hot ? { kind: 'hot', id: u.hot } : u.zone !== undefined ? { kind: 'zone', id: u.zone } : { kind: 'role', id: u.role }; };
    handle.project = p => { const s = project(new THREE.Vector3(p[0], p[1] || 0, p[2])); const r = el.getBoundingClientRect(); s.onCanvas = s.visible && document.elementFromPoint && document.elementFromPoint(s.x, s.y) === cv; s.left = s.x - r.left; s.top = s.y - r.top; return s; };
    handle.regionPos = region => { if (!patient) return null; const w = anchorWorld(region); if (!w) return null; const s = project(w); const hit = pickHit({ clientX: s.x, clientY: s.y }); const tg = hit ? targetOf(hit) : null; s.hit = tg ? tg.kind + ':' + tg.id : null; if (s.hit === 'region:' + region) return s; const ms = []; patient.group.traverse(m => { if (m.isMesh) ms.push(m); }); return samplePos(ms, t2 => t2.kind === 'region' && t2.id === region) || s; };
    function samplePos(meshes, ok) { // first projected vertex whose pick really lands on the wanted target
      const v = new THREE.Vector3();
      for (const m of meshes) { const P = m.geometry.attributes.position; const step = Math.max(1, Math.floor(P.count / 300)); for (let i = 0; i < P.count; i += step) { v.fromBufferAttribute(P, i); m.localToWorld(v); const s2 = project(v); if (!s2.visible) continue; const r = el.getBoundingClientRect(); if (s2.x < r.left + 6 || s2.y < r.top + 6 || s2.x > r.right - 6 || s2.y > r.bottom - 6) continue; if (document.elementFromPoint && document.elementFromPoint(s2.x, s2.y) !== cv) continue; const hit = pickHit({ clientX: s2.x, clientY: s2.y }); const tg = hit ? targetOf(hit) : null; if (tg && ok(tg, hit)) { s2.hit = tg.kind + ':' + tg.id; return s2; } } }
      return null;
    }
    handle.partPos = part => { if (!patient || !tableG) return null; const ms = []; tableG.traverse(m => { if (m.isMesh && m.userData.part === part) ms.push(m); }); patient.group.traverse(m => { if (m.isMesh && m.userData.part === part) ms.push(m); }); return samplePos(ms, tg => tg.kind === 'part' && tg.id === part); };
    handle.equipPos = id => { const o = objs[id]; if (!o) return null; const ms = []; o.traverse(m => { if (m.isMesh) ms.push(m); }); return samplePos(ms, (tg, hit) => hit.u.hot === id); };
    handle.settle = () => { updateCamera(5); camera.updateMatrixWorld(); };
    handle.pickRegion = region => act('field', { kind: 'region', id: region }, null);
    handle.focusField = () => { cam.view = 'second'; cam.yaw = 0.0; cam.pitch = -1.25; cam.dist = 2.6; cam.pan.set(-0.05, PAD, 0); cam.pos.set(0, 4, 0.8); hintText(); };
    handle.info = () => ({ gpu: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }, frames: frame, cam: { view: cam.view, dist: +cam.dist.toFixed(2), yaw: +cam.yaw.toFixed(2), pitch: +cam.pitch.toFixed(2), fov: +camera.fov.toFixed(1), fDist: +cam.fDist.toFixed(2) }, site, posture, variant, room: type, device: devKind, fieldTex: fieldTexKind, screens: screens.map(s => ({ kind: s.kind, imageId: s.mesh.userData.imageId || null })), objects: Object.keys(objs), mood: mood.name, light: { hemi: +hemi.intensity.toFixed(3), amb: +amb.intensity.toFixed(3), fill: +fill.intensity.toFixed(3), exposure: +renderer.toneMappingExposure.toFixed(3) }, nav: walk ? walk.navInfo() : null, frameMs: walk ? walk.frameMs() : null });
    window.__ht3d = handle;

    // ---- per-render update from theatre.js
    handle.setMentor = k => { cur.mentorK = Math.max(0, Math.min(1, Number(k) || 0)); };
    let cur = { target: null, second: null, mentorK: 0, lines: [], vitals: null, stations: [], hands: null, progress: 0 };
    let lastProgress = -1;
    function update(a) {
      a = normApi(a); api = a; handle.api = a; cur.target = a.target; cur.second = a.second; cur.mentorK = a.mentorK || 0; cur.lines = a.lines || []; cur.vitals = a.vitals; cur.progress = a.progress || 0;
      if (a.st.view !== cam.view && !(WALK && !WALK_VIEWS[a.st.view] && WALK_VIEWS[cam.view])) setView(a.st.view);
      if (a.st.view === 'second') cam.dist = Math.max(1.2, Math.min(7, 4.6 / (a.st.zoom || 1)));
      pins.forEach(drop); pins.length = 0;
      a.map.forEach(m => { const hs0 = hotPos[m.hotspot] || POS[m.hotspot]; if (!hs0) return; const hs = m.hotspot === 'field' ? [1.35, 0, -0.45] : hs0; const isT = m.station === a.s.zone || m.station === a.s.secondZone, done = !!(a.doneStations && a.doneStations.has(m.station)); const sp = labelSprite(String(m.station + 1), { size: 30, bg: isT ? 'rgba(192,57,43,.96)' : done ? 'rgba(40,122,85,.92)' : 'rgba(31,111,95,.92)', border: '#fff', scale: 0.0028 }); sp.position.set(hs[0] + (m.slot % 3) * 0.28 - 0.28, 2.2 + Math.floor(m.slot / 3) * 0.26, hs[2]); sp.userData.zone = m.station; scene.add(sp); pins.push(sp); if (isT) { const name = labelSprite(pk(a.c.tiles[m.station]), { size: 24, bg: 'rgba(122,28,36,.92)', scale: 0.003 }); name.position.set(hs[0], 1.92, hs[2]); name.userData.zone = m.station; scene.add(name); pins.push(name); } });
      const f = objs.field && objs.field.userData.field; const prog = Math.round((a.progress || 0) * 20) / 20;
      if (f && f.material && f.material.map && prog !== lastProgress) { lastProgress = prog; const kind = f.userData.fieldKind || 'generic'; const c2 = /^cap:/.test(kind) ? capCanvas(kind.slice(4), a.progress) : fieldCanvas(kind, a.progress); f.material.map.image = c2; f.material.map.needsUpdate = true; }
      bubbles.forEach(drop); bubbles = [];
      (a.lines || []).slice(0, 2).forEach((l, i) => { const p = people[l.role]; if (!p) return; const b = labelSprite(wrapText(l.text, zh() ? 16 : 34), { size: 24, bg: 'rgba(255,255,255,.96)', color: '#15202b', border: i === 0 ? '#1f6f5f' : '#81296d', scale: 0.0028 }); b.position.set(p.position.x, 2.42, p.position.z); b.userData.role = l.role; scene.add(b); bubbles.push(b); });
      ['left', 'right'].forEach(h => { const hp = a.engine.hands[h]; const mk = handMarkers[h]; if (!hp || !hp.moved) { mk.visible = false; return; } const z = a.engine.anchors.findIndex(an => Math.hypot(an[0] - hp.x, an[1] - hp.y) <= a.engine.tolerance); const m = z >= 0 ? a.map[z] : null; if (!m) { mk.visible = false; return; } const hs = hotPos[m.hotspot] || POS[m.hotspot]; if (!hs) { mk.visible = false; return; } mk.position.set(hs[0] + (h === 'left' ? -0.35 : 0.35), 1.45, hs[2] + 0.25); mk.visible = true; });
      hintText();
    }
    function drop(o) { if (!o) return; if (o.parent) o.parent.remove(o); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
    function wrapText(text, n) { const out = []; let s = String(text || ''); if (zh()) { while (s.length > n) { out.push(s.slice(0, n)); s = s.slice(n); } out.push(s); } else { const words = s.split(' '); let line = ''; words.forEach(w => { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line += ' ' + w; }); if (line.trim()) out.push(line.trim()); } return out.slice(0, 4).join('\n'); }
    function hintText() { if (WALK) { hint.textContent = cam.view === 'fp' ? T('walkHintFp', '第一人稱：拖曳環視 · WASD／方向鍵走動 · 滾輪調整視野 · E 對話或查看', 'First person: drag to look · WASD / arrows to walk · wheel changes the field of view · E talks or looks') : T('walkHintFollow', '跟隨視角：WASD／方向鍵走動，Shift 跑步 · 拖曳環視 · 滾輪縮放 · 點地板走過去 · E 對話或查看', 'Follow view: WASD / arrows to walk, Shift runs · drag to orbit · wheel zooms · tap the floor to walk there · E talks or looks'); return; } hint.textContent = cam.view === 'first' ? say('第一視角：拖曳環視 · 滾輪／雙指調整視野 · 點病人或儀器看真實影像', 'First person: drag to look · wheel/pinch changes field of view · tap the patient or equipment for real images') : cam.view === 'second' ? say('第二視角：拖曳環繞 · 滾輪／雙指拉近 · 右鍵或 Shift 拖曳平移 · 點病人任一部位看影像與孿生', 'Second person: drag to orbit · wheel/pinch zooms · right/Shift-drag pans · tap any body region for images & twin') : say('第三視角：整間手術室 · 拖曳旋轉 · 點站牌、病人或儀器', 'Third person: the whole room · drag to rotate · tap a pin, the patient or equipment'); }

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
      if (walk) walk.tick(Math.min(0.2, rawDt), now); // real elapsed time (capped) so walking speed holds on slow devices
      if (mood.t < 1) { mood.t = Math.min(1, mood.t + Math.min(0.25, rawDt) / mood.dur); moodApply(mood.to, mood.t < 1 ? mood.t * mood.t * (3 - 2 * mood.t) : 1); }
      if (beacon.visible && !RM) beacon.intensity = (mood.to.beacon || 0) * (0.55 + 0.45 * Math.sin(now * 9)) * (mood.t < 1 ? mood.t : 1);
      handle.frames = frame; updateCamera(Math.min(0.25, rawDt)); placeCard(); ceilingGroup.visible = camera.position.y < ROOM.h - 0.05;
      if (hoverEv && !ptr && frame % 2 === 0) { hover(hoverEv); hoverEv = null; }
      if (frame % 2 === 0 || frame < 3) drawMonitor(frame < 3 ? 0.03 : dt * 2, frame < 3);
      ringIds.forEach(id => { const r = rings[id]; const on = cur.target && cur.target.hotspot === id; r.material.opacity += ((on ? 0.6 + 0.3 * Math.sin(now * 5) : 0) - r.material.opacity) * Math.min(1, dt * 8); r.visible = r.material.opacity > 0.01; const s = on ? 1 + 0.08 * Math.sin(now * 5) : 1; r.scale.set(s, s, 1); });
      if (cur.target && hotPos[cur.target.hotspot]) { const p = hotPos[cur.target.hotspot]; arrow.visible = true; arrow.position.set(p[0], 2.62 + 0.12 * Math.sin(now * 4), p[2]); beam.visible = true; beam.position.set(p[0], 1.15, p[2]); beam.material.opacity = 0.05 + 0.03 * Math.sin(now * 3); } else { arrow.visible = false; beam.visible = false; }
      const mentor = WALK ? null : people.mentor; if (mentor && mentorHome) { const hasT = cur.target && POS[cur.target.hotspot]; if (hasT) tgtV.set(POS[cur.target.hotspot][0], 0, POS[cur.target.hotspot][2] - 0.75); else tgtV.copy(mentorHome); goal.copy(mentorHome).lerp(tgtV, Math.max(0, Math.min(1, cur.mentorK))); mentor.position.lerp(goal, Math.min(1, dt * 4)); if (hasT) lookV.set(POS[cur.target.hotspot][0], 1.1, POS[cur.target.hotspot][2]); else lookV.set(0, 1.1, 0); mentor.lookAt(lookV); const stepping = mentor.position.distanceTo(goal) > 0.02; mentor.position.y = stepping ? Math.abs(Math.sin(now * 9)) * 0.03 : 0; }
      for (let i = 0; i < tickers.length; i++) tickers[i](now, dt, RM);
      const an = objs.anesthesia; if (an) { const b = an.userData.bag; if (b) { const s = 1 + 0.16 * Math.sin(now * 1.3); b.scale.set(0.7 * s, s, 0.7 * s); } const be = an.userData.bellows; if (be) be.scale.y = 0.75 + 0.25 * Math.sin(now * 1.3); }
      bubbles.forEach((b, i) => { b.position.y = 2.42 + 0.03 * Math.sin(now * 3 + i); const p = people[b.userData.role]; if (p && p.userData.head) p.userData.head.position.y = 0.012 * Math.sin(now * 6); });
      peopleList.forEach(p => { const tg = p.userData.tag; if (tg) { tg.getWorldPosition(tagV); tg.visible = camera.position.distanceTo(tagV) > 1.3 && p.visible; } });
      if (walk) walk.afterCamera(dt, now);
      renderer.render(scene, camera); } catch (error) { fail('render'); } }
    resize = function () { const w = Math.max(240, el.clientWidth), h = Math.max(200, el.clientHeight); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap(w))); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (walk) walk.resize(); };
    ro = window.ResizeObserver ? new window.ResizeObserver(resize) : null; if (ro) ro.observe(el); window.addEventListener('resize', resize);

    // ================================================================ walk mode (v4.0 shift game): avatar, nav grid, cast, markers, HUD
    const SKINS = ['#dfae8a', '#c98d62', '#f0cfae', '#a8714a']; const hash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
    const ROOM_CAPS = /^(or|er|imaging|icu|dental)$/.test(type);
    function turnToward(a, b, step) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d) <= step ? b : a + Math.sign(d) * step; }
    function installWalk() {
      const tNav = typeof performance !== 'undefined' ? performance.now() : 0;
      const nav = makeNav();
      Object.keys(objs).forEach(id => { const o = objs[id]; if (!o) return; const rect = o === field && variant !== 'none' ? FOOT_FIELD[variant] : o === field && type === 'dental' ? FOOT_FIELD.dental : (o.userData.footRect || null); nav.blockObject(id, o, rect); });
      extraSolids.forEach(s => { try { nav.blockObject(null, s.obj, s.rect); } catch (e) { /* ignore */ } });
      nav.label(); const navMs = Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - tNav); const mainComp = nav.mainComp;
      const cast = {}, bubblesW = {}, qMarks = {}; let target = null, arrived = false, inputOn = true, nearNow = null, nearKey = null, frameAcc = 0, frameN = 0, frameAvg = 0;
      const headBob = !!api.headBob && !RM;
      // ---- player avatar
      const pr = api.roles.find(r => r.player) || {}; const pcol = api.playerColor || pr.cap || '#1f6f5f';
      const prole = Object.assign({ id: 'player', zh: say('你', 'You'), en: 'You' }, pr, { id: 'player', player: true, cap: pcol, color: pcol, body: api.playerBody || pr.body || (type === 'or' || type === 'dental' || type === 'imaging' ? 'player' : 'resident'), skin: pr.skin || SKINS[1] });
      const pg = person(K, prole, { articulated: true, roomCaps: ROOM_CAPS, body: prole.body, whiteCoat: WHITE_COAT }); scene.add(pg); people.player = pg; api.playerId = api.playerId || 'player';
      const P = { id: 'player', g: pg, x: 0, z: 0, yaw: 0, tYaw: 0, speed: 0, amount: 0, phase: 0, bob: 0, path: null, pathI: 0, target: null, resolve: null, reject: null, walkSpeed: 1.4, emote: null, stuck: 0 };
      const keys = { up: 0, down: 0, left: 0, right: 0, run: 0 }; const dirV2 = [0, 0];
      // ---- target resolution → { kind, id, anchor, stand, rect, top }
      const tops = {}; const bbox = new THREE.Box3();
      function topOf(id, obj) { if (tops[id] == null) { bbox.setFromObject(obj); tops[id] = Math.max(1.2, Math.min(2.2, bbox.max.y)); } return tops[id]; }
      function resolveHot(id) { if (id == null) return null; let k = String(id); if (!objs[k] && alias[k]) k = alias[k]; if (!objs[k] && HOT_ALIAS[k]) k = HOT_ALIAS[k]; return objs[k] ? { id: k, obj: objs[k] } : null; }
      function hotTarget(id, obj, from) { const R = nav.rects[id] || nav.blockObject(id, obj); const f = from || [P.x, P.z]; const stand = nav.standBy(R, f[0], f[1], mainComp) || [R.cx, R.cz]; return { kind: 'hot', id, anchor: [R.cx, R.cz], stand, rect: R, top: topOf(id, obj) }; }
      function castTarget(id, from) { const c = cast[id]; const f = from || [P.x, P.z]; const R = { x0: c.x - 0.25, x1: c.x + 0.25, z0: c.z - 0.25, z1: c.z + 0.25, cx: c.x, cz: c.z }; const stand = nav.standBy(R, f[0], f[1], mainComp) || [c.x, c.z]; return { kind: 'cast', id, anchor: [c.x, c.z], stand, rect: null, top: 2.05, cast: c }; }
      function pointTarget(x, z, id) { let i = nav.cellOf(x, z); const ok = i >= 0 && !nav.blocked[i] && nav.comp[i] === mainComp; if (!ok) { i = nav.nearestFree(x, z, 3, mainComp); if (i < 0) return null; x = nav.cx(i); z = nav.cz(i); } return { kind: 'point', id: id == null ? null : id, anchor: [x, z], stand: [x, z], rect: null, top: 0.2 }; }
      function resolveTarget(t, from) {
        if (t == null) return null; let kind = null, id = null, at = null;
        if (Array.isArray(t)) { kind = 'point'; at = t; } else if (typeof t === 'object') { kind = t.kind || (t.at ? 'point' : null); id = t.id; at = t.at; } else id = String(t);
        if ((!kind || kind === 'cast') && id != null && cast[id]) return castTarget(String(id), from); if (kind === 'cast') return null;
        if (!kind || kind === 'hot') { const o = resolveHot(id); if (o) return hotTarget(o.id, o.obj, from); }
        if (kind === 'point' && Array.isArray(at) && at.length >= 2) return pointTarget(Number(at[0]) || 0, Number(at[at.length - 1]) || 0, id);
        return pointTarget(0, 0, id == null ? null : String(id)); // unknown hotspot → room centre
      }
      // ---- movement along a path (player and cast share it); resolves within 0.9 m of the standing point on the last leg
      function cancel(A, why) { const r = A.reject; A.resolve = A.reject = null; A.path = null; A.target = null; if (r) r(new Error(why || 'cancelled')); }
      function go(A, T, speed) { cancel(A, 'replaced'); const path = nav.path(A.x, A.z, T.stand[0], T.stand[1]); if (!path) return Promise.reject(new Error('unreachable')); return new Promise((resolve, reject) => { A.path = path; A.pathI = 1; A.target = T; A.walkSpeed = speed; A.resolve = resolve; A.reject = reject; A.stuck = 0; }); }
      function follow(A, dt, speed) {
        const path = A.path; if (!path) return false; let wp = path[A.pathI], dx = wp[0] - A.x, dz = wp[1] - A.z, d = Math.hypot(dx, dz);
        while (d < 0.08 && A.pathI < path.length - 1) { A.pathI++; wp = path[A.pathI]; dx = wp[0] - A.x; dz = wp[1] - A.z; d = Math.hypot(dx, dz); }
        const last = A.pathI >= path.length - 1;
        if (last && d <= 0.9 && A.resolve) { const r = A.resolve, T = A.target; A.resolve = A.reject = null; r({ kind: T.kind, id: T.id, at: T.stand }); }
        if (d < 0.06) { A.x = wp[0]; A.z = wp[1]; A.path = null; A.target = null; return false; }
        const step = Math.min(d, speed * dt), nx = A.x + dx / d * step, nz = A.z + dz / d * step; A.tYaw = Math.atan2(dx, dz);
        if (nav.los(A.x, A.z, nx, nz) && nav.walkable(nx, nz)) { A.x = nx; A.z = nz; A.stuck = 0; } else { A.stuck += dt; if (A.stuck > 0.4) { const end = path[path.length - 1]; const np = nav.path(A.x, A.z, end[0], end[1]); A.stuck = 0; if (np) { A.path = np; A.pathI = 1; } else { cancel(A, 'blocked'); return false; } } }
        return true;
      }
      function moveBy(A, dx, dz) { // sub-stepped so a long frame cannot tunnel through a thin barrier; slides along blocked cells
        const L = Math.hypot(dx, dz); const n = Math.max(1, Math.ceil(L / 0.1)); const sx = dx / n, sz = dz / n; let any = false;
        for (let i = 0; i < n; i++) { const nx = A.x + sx, nz = A.z + sz; if (nav.walkable(nx, nz)) { A.x = nx; A.z = nz; any = true; } else if (nav.walkable(nx, A.z)) { A.x = nx; any = true; } else if (nav.walkable(A.x, nz)) { A.z = nz; any = true; } else break; }
        return any; }
      function manualDir(out) { const fx = keys.up - keys.down, sx = keys.right - keys.left; if (!fx && !sx) return false; const yaw = cam.view === 'fp' || cam.view === 'first' ? cam.first.yaw : cam.view === 'follow' ? cam.fYaw + Math.PI : cam.yaw + Math.PI; const fX = Math.sin(yaw), fZ = Math.cos(yaw), rX = -Math.cos(yaw), rZ = Math.sin(yaw); const dx = fX * fx + rX * sx, dz = fZ * fx + rZ * sx; const L = Math.hypot(dx, dz) || 1; out[0] = dx / L; out[1] = dz / L; return true; }
      // ---- emotes & bubbles
      function emote(id, kind) { const st = id === 'player' ? P : cast[id]; if (!st) return false; st.emote = { kind, t0: clock.elapsedTime, dur: kind === 'wave' ? 1.6 : kind === 'nod' ? 1.0 : kind === 'point' ? 1.8 : 2.6 }; if (st !== P) st.faceUntil = clock.elapsedTime + 4; return true; }
      function applyEmote(st, now) { const e = st.emote, Pp = st.g.userData.parts; if (!Pp) { st.emote = null; return; } const t = now - e.t0; if (t > e.dur) { st.emote = null; Pp.armR.rotation.z = 0; Pp.torso.rotation.x = 0; return; } const k = Math.min(1, t / 0.25) * Math.min(1, (e.dur - t) / 0.25);
        if (e.kind === 'wave') { Pp.armR.rotation.x = -2.7 * k; Pp.armR.rotation.z = RM ? -0.4 * k : (-0.4 + 0.35 * Math.sin(now * 11)) * k; }
        else if (e.kind === 'nod') { Pp.torso.rotation.x = RM ? 0.08 * k : 0.1 * Math.sin(now * 7) * k; }
        else if (e.kind === 'point') { Pp.armR.rotation.x = -1.5 * k; }
        else { Pp.armL.rotation.x = (-1.1 + (RM ? 0 : 0.15 * Math.sin(now * 5))) * k; Pp.armR.rotation.x = (-1.1 - (RM ? 0 : 0.15 * Math.sin(now * 5))) * k; } }
      function bubble(id, text, ms) { const st = id === 'player' ? P : cast[id]; if (!st) return false; const old = bubblesW[id]; if (old) drop(old.s); const s = labelSprite(wrapText(String(text || ''), zh() ? 14 : 30), { size: 24, bg: 'rgba(255,255,255,.96)', color: '#15202b', border: (st.color) || '#1f6f5f', scale: 0.0028 }); s.renderOrder = 12; scene.add(s); bubblesW[id] = { s, until: clock.elapsedTime + Math.max(0.3, (Number(ms) || 2600) / 1000), st }; return true; }
      // ---- cast
      function placeCast(c, item) {
        let p = null, faceYaw = null; const atKey = item.at == null ? null : JSON.stringify(item.at); const same = c.placed && atKey != null && atKey === c.atKey;
        if (item.at != null && !same) { const T = resolveTarget(item.at, [0, 0]); if (T) { p = T.stand.slice(); if (T.kind === 'hot') faceYaw = Math.atan2(T.anchor[0] - p[0], T.anchor[1] - p[1]); } }
        if (!p && !c.placed) { const i = nav.nearestFree(((hash(c.id) % 7) - 3) * 0.6, ((hash(c.id + 'z') % 5) - 2) * 0.6, 4, mainComp); p = i >= 0 ? [nav.cx(i), nav.cz(i)] : [0, 0]; }
        c.atKey = atKey;
        if (p) { // keep people apart
          for (let k = 0; k < 9; k++) { const a = k / 8 * Math.PI * 2, x = k ? p[0] + Math.cos(a) * 0.55 : p[0], z = k ? p[1] + Math.sin(a) * 0.55 : p[1]; if (!nav.walkable(x, z)) continue; let clash = false; for (const id in cast) { const o = cast[id]; if (o !== c && !o.hidden && Math.hypot(o.x - x, o.z - z) < 0.45) { clash = true; break; } } if (!clash) { p = [x, z]; break; } }
          cancel(c, 'moved'); c.x = p[0]; c.z = p[1]; c.placed = true;
        }
        if (Array.isArray(item.face) && item.face.length >= 2) faceYaw = Math.atan2(Number(item.face[0]) - c.x, Number(item.face[item.face.length - 1]) - c.z);
        if (faceYaw == null && c.faceYaw == null) faceYaw = Math.atan2(-c.x, -c.z);
        if (faceYaw != null) { c.faceYaw = faceYaw; if (!c.placedOnce) { c.yaw = faceYaw; c.tYaw = faceYaw; } } c.placedOnce = true;
        c.hidden = !!item.hidden; c.g.visible = !c.hidden; c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.yaw;
      }
      function removeCast(id) { const c = cast[id]; if (!c) return; cancel(c, 'removed'); if (bubblesW[id]) { drop(bubblesW[id].s); delete bubblesW[id]; } scene.remove(c.g); const gone = []; c.g.traverse(o => gone.push(o)); gone.forEach(o => { if (o.isSprite) drop(o); else if (o.geometry) o.geometry.dispose(); }); delete cast[id]; if (target && target.kind === 'cast' && target.id === id) setTarget(null); }
      function setCast(list) {
        const keep = new Set();
        (list || []).forEach(item => {
          if (!item || item.id == null) return; const id = String(item.id); keep.add(id); const body = item.body || 'nurse', label = item.label || id; let c = cast[id];
          if (c && (c.body !== body || c.color !== (item.color || null) || c.label !== label)) { const keepPos = [c.x, c.z]; removeCast(id); c = null; if (item.at == null) item = Object.assign({}, item, { at: keepPos }); }
          if (!c) { const role = { id, zh: label, en: label, color: item.color || null, cap: item.color || '#2f6f8f', body, skin: item.skin || SKINS[hash(id) % 4], hair: item.hair }; const g = person(K, role, { articulated: true, roomCaps: ROOM_CAPS, body, whiteCoat: WHITE_COAT }); g.userData.cast = id; g.userData.label = label; g.userData.idleK = hash(id) % 7; g.traverse(o => { if (o.isMesh) { o.userData.cast = id; o.userData.role = id; o.userData.label = label; } }); scene.add(g);
            c = cast[id] = { id, g, x: 0, z: 0, yaw: 0, tYaw: 0, speed: 0, amount: 0, phase: 0, path: null, pathI: 0, target: null, resolve: null, reject: null, hidden: false, label, body, color: item.color || null, faceYaw: null, faceUntil: 0, emote: null, stuck: 0, placed: false, placedOnce: false }; }
          placeCast(c, item);
        });
        Object.keys(cast).forEach(id => { if (!keep.has(id)) removeCast(id); });
        return Object.keys(cast);
      }
      function walkCast(id, t) { const c = cast[String(id)]; if (!c) return Promise.reject(new Error('unknown cast ' + id)); const T = resolveTarget(t, [c.x, c.z]); if (!T) return Promise.reject(new Error('unknown target')); c.faceUntil = 0; return go(c, T, 1.25); }
      // ---- markers
      const bang = labelSprite('!', { size: 46, bg: 'rgba(255,176,32,.97)', color: '#1a1200', border: '#fff', scale: 0.004, overlay: true }); bang.visible = false; bang.renderOrder = 14; scene.add(bang);
      const mring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.56, 40), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })); mring.rotation.x = -Math.PI / 2; mring.position.y = 0.016; mring.visible = false; scene.add(mring);
      const tapRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 24), new THREE.MeshBasicMaterial({ color: 0x9ff0d7, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); tapRing.rotation.x = -Math.PI / 2; tapRing.position.y = 0.014; tapRing.visible = false; scene.add(tapRing);
      function setTarget(t) { target = t == null ? null : resolveTarget(t, [P.x, P.z]); arrived = false; bang.visible = mring.visible = !!target; return target ? { kind: target.kind, id: target.id, at: target.stand } : null; }
      function setMarkers(list) { const keep = new Set(); (list || []).forEach(m => { if (!m) return; const key = String(m.id != null ? m.id : m.target); keep.add(key); const kind = m.kind === '!' ? '!' : '?'; if (qMarks[key] && qMarks[key].kind !== kind) { drop(qMarks[key].s); delete qMarks[key]; } if (!qMarks[key]) { const s = labelSprite(kind, { size: 40, bg: kind === '!' ? 'rgba(255,176,32,.97)' : 'rgba(79,134,173,.97)', color: '#fff', border: '#fff', scale: 0.0036, overlay: true }); s.renderOrder = 13; scene.add(s); qMarks[key] = { s, kind, t: m.target == null ? m.id : m.target, pos: null }; } else qMarks[key].t = m.target == null ? m.id : m.target; }); Object.keys(qMarks).forEach(k => { if (!keep.has(k)) { drop(qMarks[k].s); delete qMarks[k]; } }); }
      // ---- near / talk / interact
      function near() { let best = null, bd = Infinity;
        for (const id in cast) { const c = cast[id]; if (c.hidden) continue; const d = Math.hypot(P.x - c.x, P.z - c.z); if (d <= 1.6 && d < bd) { bd = d; best = { kind: 'cast', id, dist: d, at: [c.x, c.z] }; } }
        if (best) return best;
        for (const id in nav.rects) { const o = objs[id]; if (!o || o.userData.hot !== id) continue; const R = nav.rects[id]; const d = nav.distRect(R, P.x, P.z); if (d <= 1.15 && d < bd) { bd = d; best = { kind: 'hot', id, dist: d, at: [R.cx, R.cz] }; } }
        if (best && target && target.kind === 'hot' && target.id !== best.id && nav.rects[target.id]) { const R = nav.rects[target.id]; const d = nav.distRect(R, P.x, P.z); if (d <= 1.0) return { kind: 'hot', id: target.id, dist: d, at: [R.cx, R.cz] }; } // the current objective wins within reach
        return best; }
      function talk(id) { const c = cast[id]; if (!c) return false; c.faceUntil = clock.elapsedTime + 8; if (api.onTalk) api.onTalk(id); return true; }
      function interact() { const n = near(); if (!n) return false; if (n.kind === 'cast') return talk(n.id); if (api.onInteract) api.onInteract(n.id); else showCard(n.id, null, null); if (api.onPick && !api.onInteract) api.onPick(n.id); return true; }
      function tapCast(id) { const c = cast[id]; if (!c) return; if (Math.hypot(P.x - c.x, P.z - c.z) <= 1.6) talk(id); else go(P, castTarget(id), 1.4).then(() => talk(id)).catch(() => {}); }
      const rayO = new THREE.Vector3(), rayD = new THREE.Vector3();
      function tapFloor(e) { const r = cv.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); rayO.copy(raycaster.ray.origin); rayD.copy(raycaster.ray.direction); if (Math.abs(rayD.y) < 1e-4) return false; const t = -rayO.y / rayD.y; if (t <= 0) return false; const x = rayO.x + rayD.x * t, z = rayO.z + rayD.z * t; if (Math.abs(x) > ROOM.w / 2 || Math.abs(z) > ROOM.d / 2) return false; const T = pointTarget(x, z, null); if (!T) return false; tapRing.position.set(T.stand[0], 0.014, T.stand[1]); tapRing.material.opacity = 0.9; tapRing.visible = true; go(P, T, 1.4).catch(() => {}); return true; }
      // ---- keyboard, D-pad and prompt chip
      const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyI: 'up', KeyS: 'down', ArrowDown: 'down', KeyK: 'down', KeyA: 'left', ArrowLeft: 'left', KeyJ: 'left', KeyD: 'right', ArrowRight: 'right', KeyL: 'right' };
      const editable = t => !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
      function inputOK() { if (disposed || !inputOn || !el.isConnected || editable(document.activeElement)) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < (window.innerHeight || 1e9); }
      const clearKeys = () => { keys.up = keys.down = keys.left = keys.right = 0; };
      const onKey = (e, down) => { if (!inputOK()) return; const k = KEYMAP[e.code]; if (k) { keys[k] = down ? 1 : 0; if (e.code.indexOf('Arrow') === 0) e.preventDefault(); return; } if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { keys.run = down ? 1 : 0; if (runBtn) { runBtn.setAttribute('aria-pressed', String(!!keys.run)); runBtn.classList.toggle('on', !!keys.run); } return; } if (down && e.code === 'KeyE' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { if (interact()) e.preventDefault(); } };
      const kd = e => onKey(e, true), ku = e => onKey(e, false);
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', clearKeys);
      const pad = document.createElement('div'); pad.className = 'th3d-dpad'; pad.setAttribute('role', 'group'); pad.setAttribute('aria-label', T('walkDpad', '方向鍵', 'Direction pad'));
      const DIRS = { up: ['▲', 'walkUp', '上', 'Up'], left: ['◀', 'walkLeft', '左', 'Left'], right: ['▶', 'walkRight', '右', 'Right'], down: ['▼', 'walkDown', '下', 'Down'] };
      pad.innerHTML = Object.keys(DIRS).map(d => `<button type="button" data-dir="${d}" aria-label="${esc(T(DIRS[d][1], DIRS[d][2], DIRS[d][3]))}">${DIRS[d][0]}</button>`).join('') + `<button type="button" class="th3d-run" data-run aria-pressed="false" aria-label="${esc(T('walkRun', '跑步', 'Run'))}" title="${esc(T('walkRun', '跑步', 'Run'))}">🏃</button>`;
      el.appendChild(pad);
      pad.querySelectorAll('[data-dir]').forEach(b => { const d = b.dataset.dir; const on = e => { e.preventDefault(); keys[d] = 1; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }; const off = () => { keys[d] = 0; b.classList.remove('on'); }; b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off); b.addEventListener('contextmenu', e => e.preventDefault()); });
      const runBtn = pad.querySelector('[data-run]'); runBtn.onclick = () => { keys.run = keys.run ? 0 : 1; runBtn.setAttribute('aria-pressed', String(!!keys.run)); runBtn.classList.toggle('on', !!keys.run); };
      const padWanted = () => (api.dpad != null ? !!api.dpad : coarsePointer()); pad.hidden = !padWanted();
      const prompt = document.createElement('button'); prompt.type = 'button'; prompt.className = 'th3d-prompt'; prompt.hidden = true; el.appendChild(prompt); prompt.addEventListener('pointerdown', e => e.stopPropagation()); prompt.onclick = () => interact();
      const promptV = new THREE.Vector3();
      function placePrompt() {
        const n = nearNow; if (!n || !inputOn) { if (!prompt.hidden) prompt.hidden = true; return; }
        if (n.kind === 'cast') { const c = cast[n.id]; promptV.set(c.x, 2.15, c.z); } else { const R = nav.rects[n.id]; promptV.set(Math.max(R.x0, Math.min(R.x1, P.x)), Math.min(1.9, Math.max(1.1, (tops[n.id] || 1.2))), Math.max(R.z0, Math.min(R.z1, P.z))); }
        promptV.project(camera); const w = el.clientWidth, h = el.clientHeight; if (promptV.z > 1 || Math.abs(promptV.x) > 1.2 || Math.abs(promptV.y) > 1.2) { prompt.hidden = true; return; }
        const x = (promptV.x * 0.5 + 0.5) * w, y = (-promptV.y * 0.5 + 0.5) * h; prompt.style.left = Math.max(8, Math.min(w - 8 - prompt.offsetWidth, x - prompt.offsetWidth / 2)) + 'px'; prompt.style.top = Math.max(8, Math.min(h - 56, y - prompt.offsetHeight - 10)) + 'px'; if (prompt.hidden) prompt.hidden = false;
      }
      // ---- spawn
      const sp0 = resolveTarget(api.spawn || 'door', [0, 0]); const sp = sp0 ? sp0.stand : [0, 3.5]; P.x = sp[0]; P.z = sp[1]; P.yaw = P.tYaw = Math.atan2(-P.x, -P.z); pg.position.set(P.x, 0, P.z); pg.rotation.y = P.yaw;
      cam.fYaw = clearYaw(P.x, P.z, P.yaw + Math.PI, cam.fPitch, cam.fDist); cam.first.yaw = P.yaw; cam.first.pitch = -0.1;
      // ---- per-frame
      const W = {
        player: P, cast, nav, navMs,
        tick(dt, now) {
          frameAcc += dt; frameN++; if (frameN >= 60) { frameAvg = frameAcc / frameN * 1000; frameAcc = 0; frameN = 0; }
          // player: manual input beats paths
          let moving = false, speed = 0;
          if (inputOn && manualDir(dirV2)) { if (P.path) cancel(P, 'input'); speed = keys.run ? 2.6 : 1.4; moveBy(P, dirV2[0] * speed * dt, dirV2[1] * speed * dt); P.tYaw = Math.atan2(dirV2[0], dirV2[1]); moving = true; }
          else if (P.path) { speed = P.walkSpeed || 1.4; moving = follow(P, dt, speed); }
          if (cam.view === 'fp') P.tYaw = cam.first.yaw;
          P.yaw = turnToward(P.yaw, P.tYaw, dt * 10);
          for (const id in cast) { const c = cast[id]; if (c.hidden) continue; const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz); if (d < 0.6 && d > 1e-4) { const nx = P.x + dx / d * (0.6 - d), nz = P.z + dz / d * (0.6 - d); if (nav.walkable(nx, nz)) { P.x = nx; P.z = nz; } } }
          const sp2 = moving ? speed : 0; P.speed += (sp2 - P.speed) * Math.min(1, dt * 8); P.amount = Math.min(1, P.speed / 1.2); if (moving) P.phase += dt * (speed > 2 ? 11 : 8);
          pg.position.set(P.x, 0, P.z); pg.rotation.y = P.yaw; animatePerson(pg, P.phase, RM ? (moving ? 1 : 0) : P.amount, now, !RM, !RM); if (P.emote) applyEmote(P, now);
          P.bob = headBob && moving ? Math.sin(P.phase) * 0.02 : 0;
          if (cam.view === 'follow' && moving && now - cam.lastDrag > 0.8 && fitDist(P.x, P.z, P.yaw + Math.PI, cam.fPitch, cam.fDist) > 1.6) cam.fYaw = turnToward(cam.fYaw, P.yaw + Math.PI, dt * 2.2);
          // cast
          for (const id in cast) { const c = cast[id]; let mv = false; if (c.path) mv = follow(c, dt, c.walkSpeed || 1.25); if (!mv) { const dP = Math.hypot(P.x - c.x, P.z - c.z); if (c.faceUntil > now || (dP < 1.7 && !c.hidden)) c.tYaw = Math.atan2(P.x - c.x, P.z - c.z); else if (c.faceYaw != null) c.tYaw = c.faceYaw; } c.yaw = turnToward(c.yaw, c.tYaw, dt * 6); const s2 = mv ? (c.walkSpeed || 1.25) : 0; c.speed += (s2 - c.speed) * Math.min(1, dt * 8); c.amount = Math.min(1, c.speed / 1.1); if (mv) c.phase += dt * 7.5; c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.yaw; if (c.g.visible) { animatePerson(c.g, c.phase, RM ? (mv ? 1 : 0) : c.amount, now, !RM, !RM); if (c.emote) applyEmote(c, now); } }
          // arrival at the current target (manual walking or walkTo)
          if (target && !arrived) { let d, nearT = false; if (target.kind === 'cast') { const c = target.cast; d = Math.hypot(P.x - c.x, P.z - c.z); nearT = d <= 1.5; } else { d = Math.hypot(P.x - target.stand[0], P.z - target.stand[1]); nearT = d <= 0.9 || (target.rect && nav.distRect(target.rect, P.x, P.z) <= 1.1); } if (nearT) { arrived = true; if (api.onArrive) api.onArrive({ kind: target.kind, id: target.id, at: target.stand }); } }
          // markers
          if (target) { const bobY = RM ? 0 : 0.1 * Math.sin(now * 3.2); if (target.kind === 'cast') { const c = target.cast; bang.position.set(c.x, 2.45 + bobY, c.z); mring.position.set(c.x, 0.016, c.z); } else { bang.position.set(target.anchor[0], target.top + 0.45 + bobY, target.anchor[1]); mring.position.set(target.stand[0], 0.016, target.stand[1]); } const ps = RM ? 1 : 1 + 0.12 * Math.sin(now * 3.2); mring.scale.set(ps, ps, 1); mring.material.opacity = arrived ? 0.25 : 0.45 + (RM ? 0 : 0.2 * Math.sin(now * 3.2)); }
          for (const k in qMarks) { const m = qMarks[k]; const c = cast[m.t]; if (c) { m.s.visible = !c.hidden; m.s.position.set(c.x, 2.35 + (RM ? 0 : 0.06 * Math.sin(now * 2.5 + hash(k) % 5)), c.z); } else { if (!m.pos) { const o = resolveHot(m.t); if (o) { const R = nav.rects[o.id]; m.pos = [R.cx, topOf(o.id, o.obj) + 0.4, R.cz]; } else m.pos = [0, 1.5, 0]; } m.s.visible = true; m.s.position.set(m.pos[0], m.pos[1] + (RM ? 0 : 0.06 * Math.sin(now * 2.5)), m.pos[2]); } }
          if (tapRing.visible) { tapRing.material.opacity -= dt * 1.4; if (tapRing.material.opacity <= 0) tapRing.visible = false; }
          for (const id in bubblesW) { const b = bubblesW[id]; if (now > b.until) { drop(b.s); delete bubblesW[id]; continue; } const g = b.st.g; b.s.position.set(g.position.x, 2.34 + (RM ? 0 : 0.03 * Math.sin(now * 3)), g.position.z); b.s.visible = g.visible || b.st === P; }
          if (frame % 3 === 0) { nearNow = near(); const key = nearNow ? nearNow.kind + ':' + nearNow.id : null; if (key !== nearKey) { nearKey = key; if (nearNow) prompt.textContent = nearNow.kind === 'cast' ? '🗨 ' + T('walkTalk', '對話', 'Talk') + ' (E)' : '🔍 ' + T('walkLook', '查看', 'Look') + ' (E)'; } }
        },
        afterCamera() {
          placePrompt(); for (const id in cast) { const c = cast[id]; const tg = c.g.userData.tag; if (tg) { tg.getWorldPosition(tagV); tg.visible = c.g.visible && camera.position.distanceTo(tagV) > 1.3; } }
          const ptag = pg.userData.tag; if (ptag) { ptag.getWorldPosition(tagV); ptag.visible = pg.visible && cam.view !== 'fp' && cam.view !== 'follow' && camera.position.distanceTo(tagV) > 2.4; } // own name tag only in the overview views
          // overlay markers are drawn on top of everything: hide them when the camera is right on top of them
          if (target) bang.visible = camera.position.distanceTo(bang.position) > 1.7; for (const k in qMarks) { const m = qMarks[k]; if (m.s.visible) m.s.visible = camera.position.distanceTo(m.s.position) > 1.7; }
        },
        resize() { pad.hidden = !padWanted(); },
        dispose() { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', clearKeys); cancel(P, 'disposed'); Object.keys(cast).forEach(id => cancel(cast[id], 'disposed')); },
        walkTo(t) { const T = resolveTarget(t, [P.x, P.z]); if (!T) return Promise.reject(new Error('unknown target')); if (Math.hypot(P.x - T.stand[0], P.z - T.stand[1]) <= 0.3) { cancel(P, 'replaced'); P.tYaw = T.kind === 'point' ? P.tYaw : Math.atan2(T.anchor[0] - P.x, T.anchor[1] - P.z); return Promise.resolve({ kind: T.kind, id: T.id, at: T.stand }); } return go(P, T, 1.4); },
        stop() { cancel(P, 'stopped'); },
        setCast, walkCast, setTarget, setMarkers, near: () => near(), bubble, emote, tapCast, tapFloor, interact, talk,
        playerPos: () => [P.x, P.z], teleport(p) { if (!Array.isArray(p)) return false; cancel(P, 'teleport'); const T = pointTarget(Number(p[0]) || 0, Number(p[p.length - 1]) || 0, null); if (!T) return false; P.x = T.stand[0]; P.z = T.stand[1]; pg.position.set(P.x, 0, P.z); if (cam.view === 'follow') cam.fYaw = clearYaw(P.x, P.z, P.yaw + Math.PI, cam.fPitch, cam.fDist); updateCamera(5); return true; },
        setInput(on) { inputOn = on !== false; if (!inputOn) clearKeys(); prompt.hidden = !inputOn || !nearNow; },
        navInfo: () => ({ cells: nav.n, free: +nav.freeRatio.toFixed(3), rawFree: +nav.rawFreeRatio.toFixed(3), main: +nav.mainRatio.toFixed(3), components: nav.components, buildMs: navMs, cell: nav.cell }),
        frameMs: () => +frameAvg.toFixed(1),
        standFor(id) { const T = resolveTarget(id, [0, 0]); return T ? { kind: T.kind, id: T.id, at: T.stand } : null; },
        pathTo(t) { const T = resolveTarget(t, [P.x, P.z]); if (!T) return null; const path = nav.path(P.x, P.z, T.stand[0], T.stand[1]); if (!path) return { path: null, length: Infinity, straight: Math.hypot(T.stand[0] - P.x, T.stand[1] - P.z), stand: T.stand }; let L = 0; for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); return { path, length: +L.toFixed(3), straight: +Math.hypot(T.stand[0] - P.x, T.stand[1] - P.z).toFixed(3), stand: T.stand }; }
      };
      return W;
    }
    if (WALK) {
      if (typeof api.imaging !== 'function' && window.HT.theatre && typeof window.HT.theatre.ensureImaging === 'function') api.imaging = () => window.HT.theatre.ensureImaging();
      walk = installWalk();
      Object.assign(handle, { walkTo: t => walk.walkTo(t), stop: () => walk.stop(), setCast: l => walk.setCast(l), walkCast: (id, t) => walk.walkCast(id, t), setTarget: t => walk.setTarget(t), setMarkers: l => walk.setMarkers(l), near: () => walk.near(), bubble: (id, text, ms) => walk.bubble(id, text, ms), emote: (id, k) => walk.emote(id, k), playerPos: () => walk.playerPos(), teleport: p => walk.teleport(p), setInput: on => walk.setInput(on), standFor: id => walk.standFor(id), interact: () => walk.interact(), pathTo: t => walk.pathTo(t) });
    }
    handle.setMood = (m) => setMood(m); handle.setFov = deg => { cam.wfov = Math.max(FOV_MIN, Math.min(FOV_MAX, Number(deg) || 70)); if (cam.view === 'first') cam.fov = Math.min(100, cam.wfov); return cam.wfov; }; handle.getFov = () => cam.wfov; handle.mood = () => mood.name;
    // v4.1: raw three.js access for the wide-angle / panorama module (theatre3d-wide.js) and room packs
    handle.raw = () => ({ THREE, renderer, scene, camera, cam, objs, roomGroup, floor, people, walk, K, hotPos, alias, type });
    setMood(api.mood || 'day', true);
    handle.sceneMs = Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0);
    setView(cam.view); cam.pos.set(8, 6, 9); cam.look.set(0, 1, 0); update(api); resize(); if (walk) { updateCamera(5); } loop();
    Object.assign(handle, { update, setView, zoomBy, resize, flyTo, buildMs: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0) });
    if (!FILE && api.realImages !== false) { const later = typeof window.requestIdleCallback === 'function' ? fn => window.requestIdleCallback(fn, { timeout: 2500 }) : fn => setTimeout(fn, 900); later(loadReal); }
    return handle;
    } catch (error) { dispose(); throw error; }
  }
  function at(obj, p, ry) { obj.position.set(p[0], p[1] || 0, p[2]); if (ry !== undefined) obj.rotation.y = ry; return obj; }

  window.HT = window.HT || {};
  window.HT.theatre3dRooms = window.HT.theatre3dRooms || {};
  window.HT.theatre3d = { available, ensure, mount, POS, EXTRA, ROLE_POS, INFO, siteFor, regionAt, deviceKind, REGION, PART, HOT_ALIAS, SHIFT_HOTS, ROOMS, NEW_ROOM: Object.keys(NEW_ROOM), TCM_ROOMS: Object.keys(TCM_ROOM), BODIES: Object.keys(LOOKS).filter(k => k !== 'tcm-mentor'), MOODS: ['day', 'eve', 'night', 'alarm'], FOV: [FOV_MIN, FOV_MAX], TCM_EQUIP: Object.keys(TCM_EQUIP), infoOf };
})(window);
