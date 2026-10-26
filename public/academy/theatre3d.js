/* 3D digital-twin theatre (v3.5). A procedural but physically lit operating room / ward / cath lab
   rendered with three.js (vendor/three.js, MIT): table and patient, surgical lights, anaesthesia
   machine, monitors with a live ECG, imaging workstation (real MNI brain slices when served over
   http), instrument tray, medication cart, drains, department-specific device (microscope, heart-lung
   machine, C-arm, endoscopy tower, phaco unit…), team avatars with name tags and speech bubbles,
   numbered station pins, the intern's hands, and three cameras: first person (look around, wheel
   changes the field of view), second person (orbit the field, wheel/pinch zooms, drag pans) and third
   person (overview). Optional real photographs (assets/scenes/, licensed, fetched by
   tools/fetch_scene_photos.py) are shown as a 360° backdrop or a wall-size reference print.
   Everything here is a teaching visualisation — not a real patient, not a real device UI. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const zh = () => !window.HT.i18n || window.HT.i18n.isZh();
  const t = k => window.HT.i18n ? window.HT.i18n.t(k) : k;
  const say = (z, e) => zh() ? z : e;
  const pk = v => v && typeof v === 'object' ? (zh() ? v.zh : v.en) : String(v || '');
  const FILE = location.protocol === 'file:';
  let THREE = null, loading = null;

  function available() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function ensure() {
    if (window.THREE) { THREE = window.THREE; return Promise.resolve(THREE); }
    if (!loading) loading = window.HT.loadScript('vendor/three.js').then(() => { THREE = window.THREE; return THREE; });
    return loading;
  }

  // ---------------------------------------------------------------- layout (metres; table at the origin, head of table at -x)
  const POS = {
    field: [0, 0, 0], monitor: [-1.7, 0, -1.25], anesthesia: [-2.7, 0, -0.5], tray: [1.0, 0, 1.15], cart: [3.3, 0, 1.9], drains: [1.5, 0, -1.35],
    device: [-0.5, 0, 2.0], imaging: [3.9, 0, -2.8], lab: [4.3, 0, 0.6], chart: [-3.7, 0, 1.9], whiteboard: [-4.9, 0, -3.3], huddle: [3.0, 0, 3.3],
    recovery: [-3.9, 0, 3.1], door: [0, 0, 4.35]
  };
  const ROLE_POS = { player: [0.7, 0, 1.0], mentor: [0.2, 0, -1.0], anesthetist: [-2.1, 0, -0.35], scrub: [1.6, 0, 1.05], circulating: [2.7, 0, 2.5], extra: [-1.9, 0, 1.6], nurse: [-2.1, 0, -0.35], pharmacist: [1.6, 0, 1.05] };
  const ROOM = { w: 11, d: 9, h: 3.2 };

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
  function floorTexture(type) {
    const c = canvas(512, 512), g = c.getContext('2d'); const base = type === 'ward' || type === 'clinic' ? '#d9d2c3' : type === 'er' ? '#cfd6d8' : '#c9d6d0'; g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() * 0.06})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
    g.strokeStyle = 'rgba(60,80,75,.22)'; g.lineWidth = 2; for (let i = 0; i <= 512; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ROOM.w / 1.2, ROOM.d / 1.2); return t;
  }
  function wallTexture(type) { const c = canvas(256, 256), g = c.getContext('2d'); g.fillStyle = type === 'ward' || type === 'clinic' ? '#efe9dc' : type === 'er' ? '#e4ebee' : '#dfe9e4'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 256; i += 64) g.fillRect(0, i, 256, 2); const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 1); return t; }
  function screenCanvas(kind, ctx) {
    const c = canvas(512, 320), g = c.getContext('2d'); g.fillStyle = '#071015'; g.fillRect(0, 0, 512, 320);
    g.fillStyle = '#9fe'; g.font = '700 20px system-ui, "Noto Sans TC", sans-serif';
    if (kind === 'imaging') { g.fillText(say('影像工作站 · PACS', 'Imaging workstation · PACS'), 16, 30); for (let i = 0; i < 2; i++) { g.fillStyle = '#111c22'; g.fillRect(16 + i * 248, 50, 232, 250); g.fillStyle = '#9ab'; g.font = '14px system-ui'; g.fillText(i ? say('冠狀 · T1', 'Coronal · T1') : say('軸狀 · T1', 'Axial · T1'), 24 + i * 248, 70); const cx = 132 + i * 248, cy = 180; const grd = g.createRadialGradient(cx, cy, 10, cx, cy, 90); grd.addColorStop(0, '#cfd3d6'); grd.addColorStop(0.7, '#7a8288'); grd.addColorStop(1, '#111c22'); g.fillStyle = grd; g.beginPath(); g.ellipse(cx, cy, 86, i ? 96 : 100, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#2b3a44'; g.lineWidth = 3; for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(cx + (k - 3) * 14, cy - 20 + Math.abs(k - 3) * 6, 10, 22, 0, 0, Math.PI * 2); g.stroke(); } } }
    else if (kind === 'anesthesia') { g.fillText(say('麻醉機', 'Anaesthesia'), 16, 30); [['FiO2', '0.45'], ['EtCO2', '36'], ['MAC', '1.0'], ['Vt', '450'], ['RR', '12'], ['PEEP', '5']].forEach(([k, v], i) => { g.fillStyle = '#bcd'; g.font = '16px system-ui'; g.fillText(k, 20 + (i % 3) * 165, 80 + Math.floor(i / 3) * 110); g.fillStyle = ['#ffd166', '#06d6a0', '#ef476f', '#118ab2', '#06d6a0', '#ffd166'][i]; g.font = '700 44px system-ui'; g.fillText(v, 20 + (i % 3) * 165, 130 + Math.floor(i / 3) * 110); }); }
    else if (kind === 'whiteboard') { g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 512, 320); g.fillStyle = '#1b3a4b'; g.font = '700 22px system-ui, "Noto Sans TC", sans-serif'; g.fillText(say('WHO 手術安全核對', 'WHO surgical safety checklist'), 18, 36); g.font = '18px system-ui, "Noto Sans TC", sans-serif'; [say('☑ 病人身分・手術・側別', '☑ Identity · procedure · side'), say('☑ 過敏・困難氣道・失血風險', '☑ Allergy · airway · blood loss'), say('☑ 預防性抗生素', '☑ Antibiotic prophylaxis'), say('☐ 器械・紗布・針頭計數', '☐ Instrument / swab / needle count'), say('☐ 標本標示', '☐ Specimen labelling')].forEach((l, i) => g.fillText(l, 22, 80 + i * 40)); g.fillStyle = '#c0392b'; g.fillText((ctx && ctx.title) || '', 22, 290); }
    else if (kind === 'chart') { g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, 512, 320); g.fillStyle = '#1b3a4b'; g.font = '700 20px system-ui, "Noto Sans TC", sans-serif'; g.fillText(say('電子病歷', 'Electronic record'), 16, 30); g.font = '15px system-ui, "Noto Sans TC", sans-serif'; const txt = (ctx && ctx.patient) || ''; let y = 62; for (let i = 0; i < txt.length && y < 300; i += zh() ? 26 : 1) { let line = zh() ? txt.slice(i, i + 26) : ''; if (!zh()) { const rest = txt.slice(i).split(' '); line = ''; while (rest.length && (line + rest[0]).length < 52) line += rest.shift() + ' '; i += line.length - 1; } g.fillText(line, 16, y); y += 24; } }
    else { g.fillText(say('資訊', 'Info'), 16, 30); }
    return c;
  }
  function fieldCanvas(type, progress) {
    const c = canvas(512, 384), g = c.getContext('2d'); const p = Math.max(0, Math.min(1, progress || 0));
    g.fillStyle = '#e8c4a0'; g.fillRect(0, 0, 512, 384); // skin
    const grd = g.createRadialGradient(256, 192, 40, 256, 192, 260); grd.addColorStop(0, 'rgba(255,230,210,.25)'); grd.addColorStop(1, 'rgba(120,70,40,.35)'); g.fillStyle = grd; g.fillRect(0, 0, 512, 384);
    g.fillStyle = 'rgba(40,110,150,.55)'; g.fillRect(0, 0, 512, 56); g.fillRect(0, 328, 512, 56); g.fillRect(0, 0, 60, 384); g.fillRect(452, 0, 60, 384); // drapes
    g.fillStyle = 'rgba(200,140,60,.5)'; g.fillRect(60, 56, 392, 272); // prep
    if (p > 0.05) { g.strokeStyle = '#8a2b24'; g.lineWidth = 4; g.beginPath(); g.moveTo(150, 192); g.lineTo(362, 192); g.stroke(); }
    if (p > 0.2) { g.fillStyle = '#c9544a'; g.beginPath(); g.ellipse(256, 192, 100 * Math.min(1, (p - 0.2) * 2.5 + 0.3), 44 * Math.min(1, (p - 0.2) * 2.5 + 0.3), 0, 0, Math.PI * 2); g.fill(); }
    if (p > 0.4) { if (type === 'cranial') { g.fillStyle = '#f1e8d6'; g.beginPath(); g.ellipse(256, 192, 70, 30, 0, 0, Math.PI * 2); g.fill(); if (p > 0.6) { g.fillStyle = '#e6b8c0'; g.beginPath(); g.ellipse(256, 192, 50, 20, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#b55'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(216 + i * 16, 178); g.quadraticCurveTo(220 + i * 16, 192, 216 + i * 16, 206); g.stroke(); } } }
      else if (type === 'thorax-heart') { g.fillStyle = '#f1e8d6'; g.fillRect(246, 150, 20, 84); if (p > 0.6) { g.fillStyle = '#b03a3a'; g.beginPath(); g.ellipse(256, 196, 48, 40, -0.3, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#f0c080'; g.lineWidth = 3; g.beginPath(); g.moveTo(230, 170); g.quadraticCurveTo(262, 200, 286, 226); g.stroke(); } }
      else if (type === 'thorax-lung') { g.fillStyle = '#e39ba0'; g.beginPath(); g.ellipse(256, 192, 80, 40, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#f1e8d6'; g.lineWidth = 6; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(170, 192 + i * 26); g.quadraticCurveTo(256, 170 + i * 26, 342, 192 + i * 26); g.stroke(); } }
      else if (type === 'vessel') { g.strokeStyle = '#b03a3a'; g.lineWidth = 14; g.beginPath(); g.moveTo(160, 192); g.lineTo(352, 192); g.stroke(); g.strokeStyle = '#4060c0'; g.lineWidth = 10; g.beginPath(); g.moveTo(160, 212); g.lineTo(352, 212); g.stroke(); if (p > 0.7) { g.fillStyle = '#ddd'; g.fillRect(236, 184, 40, 16); } }
      else if (type === 'bone') { g.fillStyle = '#f1e8d6'; g.fillRect(170, 178, 172, 28); g.beginPath(); g.ellipse(170, 192, 22, 30, 0, 0, Math.PI * 2); g.ellipse(342, 192, 22, 30, 0, 0, Math.PI * 2); g.fill(); if (p > 0.7) { g.fillStyle = '#9aa'; g.fillRect(200, 184, 110, 8); for (let i = 0; i < 4; i++) g.fillRect(208 + i * 30, 176, 6, 24); } }
      else if (type === 'cath') { g.fillStyle = '#111'; g.fillRect(60, 56, 392, 272); g.strokeStyle = '#ccc'; g.lineWidth = 3; g.beginPath(); g.moveTo(200, 300); g.quadraticCurveTo(240, 180, 300, 120); g.quadraticCurveTo(330, 100, 360, 110); g.stroke(); if (p > 0.6) { g.strokeStyle = '#eee'; g.lineWidth = 5; g.beginPath(); g.moveTo(300, 120); g.quadraticCurveTo(320, 150, 350, 180); g.stroke(); } }
      else if (type === 'abdomen') { g.fillStyle = '#d98888'; g.beginPath(); g.ellipse(256, 192, 90, 46, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#f5d6a0'; g.lineWidth = 8; g.beginPath(); for (let i = 0; i < 5; i++) g.arc(200 + i * 28, 192, 14, 0, Math.PI, i % 2 === 0); g.stroke(); }
      else { g.fillStyle = '#d98888'; g.beginPath(); g.ellipse(256, 192, 70, 36, 0, 0, Math.PI * 2); g.fill(); } }
    if (p > 0.85) { g.strokeStyle = '#223'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(170 + i * 26, 180); g.lineTo(178 + i * 26, 204); g.stroke(); } }
    return c;
  }

  // ---------------------------------------------------------------- geometry helpers
  function box(w, h, d, color, opts) { opts = opts || {}; const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.6, metalness: opts.metal ?? 0.1, emissive: opts.emissive || 0x000000, emissiveIntensity: opts.ei || 1, map: opts.map || null, transparent: !!opts.opacity, opacity: opts.opacity || 1 })); m.castShadow = opts.shadow !== false; m.receiveShadow = true; return m; }
  function cyl(rt, rb, h, color, opts) { opts = opts || {}; const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, opts.seg || 24), new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.5, metalness: opts.metal ?? 0.3, emissive: opts.emissive || 0x000000, emissiveIntensity: opts.ei || 1 })); m.castShadow = true; m.receiveShadow = true; return m; }
  function screen(w, h, c, opts) { opts = opts || {}; const t = tex(c); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: opts.glow ?? 0.9, roughness: 0.3, metalness: 0 })); m.userData.tex = t; return m; }
  function drop(o) { if (!o) return; if (o.parent) o.parent.remove(o); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
  function at(obj, p, ry) { obj.position.set(p[0], p[1] || 0, p[2]); if (ry !== undefined) obj.rotation.y = ry; return obj; }

  function person(role, opts) {
    const g = new THREE.Group(); const skin = new THREE.Color(role.skin || '#f0cfae'), scrub = new THREE.Color(role.player ? '#1f6f5f' : (role.scrub || '#2f6f8f')), cap = new THREE.Color(role.cap || '#2f6f8f');
    const legs = cyl(0.12, 0.1, 0.85, scrub.clone().multiplyScalar(0.8)); legs.position.y = 0.43; g.add(legs);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 6, 14), new THREE.MeshStandardMaterial({ color: scrub, roughness: 0.8 })); torso.position.y = 1.12; torso.castShadow = true; g.add(torso);
    ['l', 'r'].forEach((s, i) => { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.5, 4, 10), new THREE.MeshStandardMaterial({ color: scrub, roughness: 0.8 })); arm.position.set(i ? 0.26 : -0.26, 1.1, 0.05); arm.rotation.z = i ? -0.25 : 0.25; arm.rotation.x = -0.6; arm.castShadow = true; g.add(arm); const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: role.gloves === false ? skin : '#dfe8e6', roughness: 0.5 })); hand.position.set(i ? 0.3 : -0.3, 0.98, 0.3); g.add(hand); g.userData['hand_' + s] = hand; });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 })); head.position.y = 1.56; head.castShadow = true; g.add(head);
    const hat = cyl(0.135, 0.14, 0.09, cap, { rough: 0.9, metal: 0 }); hat.position.y = 1.64; g.add(hat);
    const mask = box(0.16, 0.08, 0.06, '#dfe8e6', { rough: 0.9 }); mask.position.set(0, 1.52, 0.11); g.add(mask);
    const tag = labelSprite(pk(role), { size: 26, bg: role.player ? 'rgba(31,111,95,.92)' : 'rgba(16,28,32,.85)', border: role.player ? '#ffd166' : null, scale: 0.0032 }); tag.position.y = 1.95; g.add(tag); g.userData.tag = tag;
    g.userData.role = role.id; g.userData.head = head;
    return g;
  }

  function equipment(id, api) {
    const g = new THREE.Group(); const d = api.c.department || ''; const room = api.roomType;
    switch (id) {
      case 'field': { // operating table / bed + patient
        const bed = room === 'ward' || room === 'clinic'; const base = cyl(0.25, 0.35, 0.6, '#7d8a90', { metal: 0.6, rough: 0.35 }); base.position.y = 0.3; g.add(base);
        const top = box(2.05, 0.12, bed ? 0.95 : 0.62, bed ? '#f4f6f8' : '#2f3b40', { rough: 0.5, metal: 0.4 }); top.position.y = 0.86; g.add(top);
        const pad = box(2.0, 0.06, bed ? 0.9 : 0.58, bed ? '#e9eef2' : '#1f6f5f', { rough: 0.9 }); pad.position.y = 0.95; g.add(pad);
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.25, 6, 14), new THREE.MeshStandardMaterial({ color: bed ? '#cfe3dd' : '#2a7a9c', roughness: 0.9 })); body.rotation.z = Math.PI / 2; body.position.set(0.1, 1.1, 0); body.scale.set(1, 1, 0.8); body.castShadow = true; g.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), new THREE.MeshStandardMaterial({ color: '#e8c4a0', roughness: 0.7 })); head.position.set(-0.86, 1.1, 0); g.add(head);
        if (!bed) { const fc = fieldCanvas(api.fieldType, api.progress); const f = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.5), new THREE.MeshStandardMaterial({ map: tex(fc), roughness: 0.75, metalness: 0 })); f.receiveShadow = true; f.rotation.x = -Math.PI / 2; f.position.set(0.05, 1.285, 0); g.add(f); g.userData.field = f; }
        else { const sheet = box(1.9, 0.02, 0.86, '#ffffff', { rough: 1 }); sheet.position.set(0.15, 1.2, 0); g.add(sheet); }
        g.userData.highlight = top; break; }
      case 'monitor': { const pole = cyl(0.03, 0.04, 1.5, '#9aa5aa', { metal: 0.7 }); pole.position.y = 0.75; g.add(pole); const foot = cyl(0.3, 0.3, 0.05, '#55606a', { metal: 0.5 }); foot.position.y = 0.025; g.add(foot); const body = box(0.62, 0.42, 0.08, '#1d262c', { rough: 0.4 }); body.position.set(0, 1.5, 0); g.add(body); const sc = screen(0.56, 0.36, canvas(512, 320), { glow: 1.1 }); sc.position.set(0, 1.5, 0.045); g.add(sc); g.userData.screen = sc; g.userData.highlight = body; break; }
      case 'anesthesia': { const cab = box(0.75, 1.1, 0.62, '#dfe4e7', { rough: 0.5 }); cab.position.y = 0.55; g.add(cab); const top = box(0.78, 0.5, 0.62, '#c9d3d8', { rough: 0.5 }); top.position.y = 1.35; g.add(top); const sc = screen(0.5, 0.34, screenCanvas('anesthesia'), { glow: 1 }); sc.position.set(0, 1.42, 0.32); g.add(sc); const bag = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), new THREE.MeshStandardMaterial({ color: '#2a7a9c', roughness: 0.6 })); bag.position.set(0.45, 1.1, 0.2); g.add(bag); g.userData.bag = bag; [0, 1].forEach(i => { const cylr = cyl(0.07, 0.07, 0.7, i ? '#2d6a4f' : '#9db4c0', { metal: 0.6 }); cylr.position.set(-0.47, 0.9, -0.15 + i * 0.3); g.add(cylr); }); const hose = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.012, 8, 40, Math.PI), new THREE.MeshStandardMaterial({ color: '#cfd8dc' })); hose.position.set(0.6, 1.1, 0.2); hose.rotation.z = Math.PI; g.add(hose); g.userData.highlight = cab; break; }
      case 'tray': { const stand = cyl(0.025, 0.03, 1.0, '#aab4b8', { metal: 0.8 }); stand.position.set(0, 0.5, 0); g.add(stand); const top = box(0.7, 0.03, 0.45, '#c8d0d4', { metal: 0.8, rough: 0.25 }); top.position.y = 1.0; g.add(top); const cloth = box(0.66, 0.01, 0.41, '#2a7a9c', { rough: 1 }); cloth.position.y = 1.02; g.add(cloth); for (let i = 0; i < 7; i++) { const inst = box(0.02, 0.012, 0.16 + (i % 3) * 0.05, '#e8ecef', { metal: 0.95, rough: 0.15 }); inst.position.set(-0.26 + i * 0.085, 1.035, 0); inst.rotation.y = (i % 2) * 0.15; g.add(inst); } const bowl = cyl(0.07, 0.05, 0.04, '#dfe6ea', { metal: 0.9, rough: 0.2 }); bowl.position.set(0.24, 1.04, 0.12); g.add(bowl); g.userData.highlight = top; break; }
      case 'cart': { const body = box(0.7, 0.95, 0.5, '#e74c3c', { rough: 0.45 }); body.position.y = 0.55; g.add(body); for (let i = 0; i < 4; i++) { const dr = box(0.62, 0.17, 0.02, '#f5f6f7', { rough: 0.5 }); dr.position.set(0, 0.22 + i * 0.21, 0.26); g.add(dr); } const top = box(0.74, 0.04, 0.54, '#c9d3d8', { rough: 0.4 }); top.position.y = 1.04; g.add(top); const sharps = box(0.16, 0.2, 0.16, '#f1c40f', { rough: 0.6 }); sharps.position.set(0.22, 1.16, -0.1); g.add(sharps); g.userData.highlight = body; break; }
      case 'drains': { const pole = cyl(0.015, 0.02, 2.0, '#aab4b8', { metal: 0.8 }); pole.position.y = 1.0; g.add(pole); const base = cyl(0.25, 0.25, 0.03, '#55606a'); base.position.y = 0.015; g.add(base); [0, 1].forEach(i => { const bag = box(0.12, 0.24, 0.05, i ? '#e8f4ff' : '#fff2d9', { opacity: 0.85, rough: 0.3 }); bag.position.set(i ? 0.14 : -0.14, 1.7, 0); g.add(bag); }); const can = cyl(0.09, 0.09, 0.3, '#f4f6f8', { opacity: 0.9, rough: 0.3 }); can.position.set(0.25, 0.5, 0.1); g.add(can); const fluid = cyl(0.085, 0.085, 0.1, '#b03a3a'); fluid.position.set(0.25, 0.4, 0.1); g.add(fluid); g.userData.highlight = pole; break; }
      case 'imaging': { const desk = box(1.5, 0.05, 0.7, '#d7dde0', { rough: 0.5 }); desk.position.y = 0.75; g.add(desk); [-0.7, 0.7].forEach(x => { const leg = box(0.05, 0.75, 0.6, '#9aa5aa'); leg.position.set(x, 0.375, 0); g.add(leg); }); const sc1 = screen(0.62, 0.4, screenCanvas('imaging'), { glow: 1 }); sc1.position.set(-0.36, 1.1, -0.2); g.add(sc1); const sc2 = screen(0.62, 0.4, canvas(512, 320), { glow: 1 }); sc2.position.set(0.36, 1.1, -0.2); g.add(sc2); g.userData.screen = sc2; g.userData.brainScreen = sc1; const kb = box(0.45, 0.02, 0.15, '#2d3436'); kb.position.set(0, 0.79, 0.15); g.add(kb); const chair = cyl(0.22, 0.22, 0.06, '#2d3436'); chair.position.set(0, 0.5, 0.55); g.add(chair); g.userData.highlight = desk; break; }
      case 'lab': { const bench = box(1.3, 0.9, 0.6, '#e9eef2', { rough: 0.5 }); bench.position.y = 0.45; g.add(bench); const top = box(1.34, 0.04, 0.64, '#222', { rough: 0.3 }); top.position.y = 0.92; g.add(top); const an = box(0.5, 0.4, 0.4, '#f5f6f7', { rough: 0.4 }); an.position.set(-0.3, 1.14, 0); g.add(an); const sc = screen(0.3, 0.18, screenCanvas('info'), { glow: 0.8 }); sc.position.set(-0.3, 1.2, 0.205); g.add(sc); for (let i = 0; i < 4; i++) { const tube = cyl(0.012, 0.012, 0.1, ['#b03a3a', '#f1c40f', '#8e44ad', '#2a7a9c'][i], { opacity: 0.9 }); tube.position.set(0.1 + i * 0.07, 1.0, 0.1); g.add(tube); } const micro = box(0.12, 0.3, 0.12, '#2d3436'); micro.position.set(0.45, 1.09, -0.1); g.add(micro); g.userData.highlight = bench; break; }
      case 'chart': { const pole = cyl(0.025, 0.03, 1.1, '#9aa5aa', { metal: 0.7 }); pole.position.y = 0.55; g.add(pole); const base = cyl(0.28, 0.28, 0.04, '#55606a'); base.position.y = 0.02; g.add(base); const tray = box(0.5, 0.03, 0.4, '#d7dde0'); tray.position.y = 1.08; g.add(tray); const lap = box(0.42, 0.26, 0.02, '#1d262c'); lap.position.set(0, 1.24, -0.12); lap.rotation.x = -0.25; g.add(lap); const sc = screen(0.38, 0.22, screenCanvas('chart', { patient: pk(api.c.patient) }), { glow: 0.9 }); sc.position.set(0, 1.245, -0.106); sc.rotation.x = -0.25; g.add(sc); g.userData.highlight = lap; break; }
      case 'whiteboard': { const bd = box(1.6, 1.0, 0.04, '#ffffff', { rough: 0.3 }); bd.position.y = 1.6; g.add(bd); const sc = screen(1.52, 0.92, screenCanvas('whiteboard', { title: pk(api.c.title) }), { glow: 0.35 }); sc.position.set(0, 1.6, 0.025); g.add(sc); g.userData.highlight = bd; break; }
      case 'huddle': { const tv = box(1.1, 0.65, 0.05, '#111', { rough: 0.3 }); tv.position.y = 1.7; g.add(tv); const sc = screen(1.02, 0.58, screenCanvas('whiteboard', { title: say('交班 SBAR', 'Handover SBAR') }), { glow: 0.8 }); sc.position.set(0, 1.7, 0.03); g.add(sc); const table = cyl(0.45, 0.45, 0.04, '#e9eef2'); table.position.set(0, 0.95, 0.9); g.add(table); const tl = cyl(0.04, 0.06, 0.95, '#9aa5aa'); tl.position.set(0, 0.47, 0.9); g.add(tl); g.userData.highlight = tv; break; }
      case 'recovery': { const bed = box(2.0, 0.25, 0.95, '#f4f6f8', { rough: 0.6 }); bed.position.y = 0.6; g.add(bed); const frame = box(2.05, 0.08, 1.0, '#9aa5aa', { metal: 0.6 }); frame.position.y = 0.45; g.add(frame); const rail = box(2.0, 0.3, 0.03, '#aab4b8', { metal: 0.7 }); rail.position.set(0, 0.85, 0.5); g.add(rail); const pillow = box(0.4, 0.1, 0.5, '#ffffff'); pillow.position.set(-0.75, 0.77, 0); g.add(pillow); const mon = box(0.35, 0.25, 0.06, '#1d262c'); mon.position.set(-1.2, 1.5, -0.4); g.add(mon); const sc = screen(0.3, 0.2, canvas(512, 320), { glow: 1 }); sc.position.set(-1.2, 1.5, -0.365); g.add(sc); g.userData.screen = sc; g.userData.highlight = bed; break; }
      case 'door': { const frame = box(2.2, 2.4, 0.12, '#9aa5aa', { metal: 0.5 }); frame.position.y = 1.2; g.add(frame); [-0.5, 0.5].forEach(x => { const leaf = box(0.96, 2.2, 0.06, '#cfd8dc', { rough: 0.5 }); leaf.position.set(x, 1.15, 0.04); g.add(leaf); const win = box(0.4, 0.5, 0.07, '#9fd3e8', { opacity: 0.7, rough: 0.1, metal: 0.2 }); win.position.set(x, 1.6, 0.05); g.add(win); }); const sign = labelSprite(say('手術室 3 · 限制區', 'THEATRE 3 · RESTRICTED'), { size: 26, bg: 'rgba(192,57,43,.95)' }); sign.position.set(0, 2.6, 0.2); g.add(sign); g.userData.highlight = frame; break; }
      case 'device': {
        if (/dentist/.test(d)) { // dental chair + light + delivery unit
          const base = box(0.6, 0.25, 0.9, '#9aa5aa', { metal: 0.5 }); base.position.y = 0.125; g.add(base); const seat = box(0.55, 0.14, 1.5, '#2a7a9c', { rough: 0.8 }); seat.position.set(0, 0.6, 0.15); seat.rotation.x = -0.15; g.add(seat); const back = box(0.55, 0.14, 0.7, '#2a7a9c', { rough: 0.8 }); back.position.set(0, 0.95, -0.45); back.rotation.x = 0.9; g.add(back); const arm = cyl(0.03, 0.03, 1.2, '#dfe4e7'); arm.position.set(0.5, 1.4, 0); arm.rotation.z = -0.4; g.add(arm); const lamp = cyl(0.16, 0.14, 0.08, '#e9eef2', { emissive: 0xfff4d6, ei: 1.8 }); lamp.position.set(0.85, 1.9, -0.2); g.add(lamp); const unit = box(0.4, 0.5, 0.3, '#f5f6f7'); unit.position.set(-0.7, 1.0, 0.3); g.add(unit); const sc = screen(0.3, 0.2, screenCanvas('imaging'), { glow: 0.9 }); sc.position.set(-0.7, 1.4, 0.3); g.add(sc); g.userData.highlight = seat; g.userData.name = say('牙科治療椅與診療台', 'Dental chair & delivery unit'); }
        else if (/obstet|gynec/.test(d)) { // ultrasound machine + neonatal warmer
          const cart = box(0.6, 1.0, 0.6, '#f5f6f7'); cart.position.y = 0.5; g.add(cart); const sc = screen(0.5, 0.34, screenCanvas('imaging'), { glow: 1 }); sc.position.set(0, 1.25, 0.1); sc.rotation.x = -0.25; g.add(sc); const probe = cyl(0.025, 0.035, 0.18, '#dfe4e7'); probe.position.set(0.38, 1.05, 0.2); probe.rotation.z = 0.6; g.add(probe); if (/obstet/.test(d)) { const warmer = box(0.7, 0.1, 0.5, '#ffffff'); warmer.position.set(1.1, 0.95, 0); g.add(warmer); const heat = box(0.5, 0.06, 0.3, '#e9eef2', { emissive: 0xffb347, ei: 0.9 }); heat.position.set(1.1, 1.9, 0); g.add(heat); const pole = cyl(0.03, 0.03, 1.0, '#dfe4e7'); pole.position.set(1.4, 1.4, -0.2); g.add(pole); } g.userData.highlight = cart; g.userData.name = /obstet/.test(d) ? say('超音波與新生兒保溫台', 'Ultrasound & neonatal warmer') : say('超音波機', 'Ultrasound machine'); }
        else if (/anesth/.test(d)) { // difficult-airway cart + video laryngoscope
          const cart = box(0.7, 1.0, 0.5, '#2a7a9c', { rough: 0.5 }); cart.position.y = 0.5; g.add(cart); for (let i = 0; i < 4; i++) { const dr = box(0.62, 0.17, 0.02, '#f5f6f7'); dr.position.set(0, 0.2 + i * 0.21, 0.26); g.add(dr); } const top = box(0.74, 0.04, 0.54, '#c9d3d8'); top.position.y = 1.04; g.add(top); const vl = box(0.22, 0.16, 0.03, '#1d262c'); vl.position.set(-0.15, 1.3, 0); g.add(vl); const vls = screen(0.2, 0.14, screenCanvas('info'), { glow: 1 }); vls.position.set(-0.15, 1.3, 0.02); g.add(vls); const mask = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), new THREE.MeshStandardMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.8 })); mask.position.set(0.2, 1.12, 0.1); g.add(mask); g.userData.highlight = cart; g.userData.name = say('困難氣道車與影像喉頭鏡', 'Difficult-airway cart & video laryngoscope'); }
        else if (/neurosurg|ophthalm|ent\b|plastic/.test(d)) { // operating microscope
          const base = box(0.7, 0.2, 0.7, '#e9eef2'); base.position.y = 0.1; g.add(base); const col = cyl(0.08, 0.1, 1.9, '#dfe4e7'); col.position.y = 1.05; g.add(col); const arm = box(1.3, 0.1, 0.1, '#dfe4e7'); arm.position.set(0.55, 2.0, 0); g.add(arm); const arm2 = box(0.1, 0.8, 0.1, '#dfe4e7'); arm2.position.set(1.15, 1.6, 0); g.add(arm2); const head = box(0.3, 0.35, 0.3, '#2d3436', { rough: 0.4 }); head.position.set(1.15, 1.1, 0); g.add(head); const lens = cyl(0.06, 0.06, 0.1, '#111'); lens.position.set(1.15, 0.9, 0); g.add(lens); g.userData.highlight = head; g.userData.name = say('手術顯微鏡', 'Operating microscope'); }
        else if (/cardiac-surg/.test(d)) { const body = box(0.9, 1.0, 0.6, '#f5f6f7'); body.position.y = 0.5; g.add(body); for (let i = 0; i < 4; i++) { const pump = cyl(0.12, 0.12, 0.08, '#2a7a9c', { metal: 0.3 }); pump.rotation.x = Math.PI / 2; pump.position.set(-0.3 + i * 0.2, 1.1, 0.25); g.add(pump); } const res = cyl(0.12, 0.12, 0.4, '#e8f4ff', { opacity: 0.8 }); res.position.set(0.35, 1.3, -0.1); g.add(res); const sc = screen(0.4, 0.26, screenCanvas('anesthesia'), { glow: 0.9 }); sc.position.set(-0.15, 1.35, 0.31); g.add(sc); g.userData.highlight = body; g.userData.name = say('體外循環機', 'Heart-lung machine'); }
        else if (/ortho|spine|joint|vascular|cardiology|urolog|pain|radiolog/.test(d)) { const base = box(0.9, 0.3, 0.6, '#e9eef2'); base.position.y = 0.15; g.add(base); const col = box(0.3, 1.4, 0.3, '#dfe4e7'); col.position.set(-0.3, 1.0, 0); g.add(col); const arc = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.07, 10, 40, Math.PI), new THREE.MeshStandardMaterial({ color: '#f5f6f7', roughness: 0.4 })); arc.position.set(0.5, 1.2, 0); arc.rotation.z = Math.PI; arc.rotation.y = Math.PI / 2; g.add(arc); const src = box(0.3, 0.2, 0.3, '#2d3436'); src.position.set(0.5, 0.35, 0); g.add(src); const det = box(0.4, 0.1, 0.4, '#2d3436'); det.position.set(0.5, 2.05, 0); g.add(det); g.userData.highlight = arc; g.userData.name = /cardiology/.test(d) ? say('心導管 X 光機', 'Cath-lab C-arm') : say('C 臂 X 光機', 'C-arm fluoroscopy'); }
        else if (/general|gastro|thoracic|gynec|obstet|pediatric-surg|urolog/.test(d)) { const tower = box(0.6, 1.5, 0.55, '#dfe4e7'); tower.position.y = 0.75; g.add(tower); const sc = screen(0.5, 0.34, screenCanvas('imaging'), { glow: 1 }); sc.position.set(0, 1.55, 0.28); g.add(sc); for (let i = 0; i < 3; i++) { const unit = box(0.5, 0.12, 0.02, '#1d262c'); unit.position.set(0, 0.5 + i * 0.22, 0.28); g.add(unit); } const scope = cyl(0.012, 0.012, 0.9, '#222'); scope.rotation.z = 0.5; scope.position.set(0.45, 1.3, 0); g.add(scope); g.userData.highlight = tower; g.userData.name = say('內視鏡塔', 'Endoscopy tower'); }
        else { const unit = box(0.6, 1.2, 0.5, '#dfe4e7'); unit.position.y = 0.6; g.add(unit); const sc = screen(0.44, 0.3, screenCanvas('info'), { glow: 0.9 }); sc.position.set(0, 1.1, 0.26); g.add(sc); g.userData.highlight = unit; g.userData.name = say('專科設備', 'Specialty device'); }
        break; }
      default: { const b = box(0.5, 0.8, 0.5, '#dfe4e7'); b.position.y = 0.4; g.add(b); g.userData.highlight = b; }
    }
    g.userData.hot = id; g.traverse(o => { if (o.isMesh) o.userData.hot = id; });
    return g;
  }

  // Short "what is this / what to check" notes shown beside equipment when it is clicked (education only).
  const INFO = {
    field: ['手術台與病人', 'Operating table & patient', '確認病人身分、手術部位標記、擺位與受壓點保護；手術野依工序逐層顯示。', 'Confirm identity, site marking, positioning and pressure-point padding; the field reveals layers as the stages progress.'],
    monitor: ['生理監視器', 'Patient monitor', '心電圖、血壓、血氧、呼氣末二氧化碳與體溫；先看趨勢與警報，再看單一數值。', 'ECG, blood pressure, SpO₂, EtCO₂ and temperature; read trends and alarms before single numbers.'],
    anesthesia: ['麻醉機', 'Anaesthesia machine', '氣體供應、呼吸迴路、揮發器與呼吸器；每台刀前完成機器檢查，二氧化碳波形確認插管位置。', 'Gas supply, breathing circuit, vaporiser and ventilator; check before every case and confirm tube position with capnography.'],
    tray: ['器械台', 'Instrument tray', '刷手護理師管理器械與紗布；關閉前器械、紗布、針頭計數必須相符。', 'The scrub nurse manages instruments and swabs; counts must match before closure.'],
    cart: ['藥物車', 'Medication cart', '依標籤與雙人核對給藥；高警訊藥物分區存放；本站不提供劑量。', 'Give drugs by label with a two-person check; high-alert drugs are segregated; no doses are given here.'],
    drains: ['引流／抽吸／點滴架', 'Drains, suction & IV pole', '記錄引流量與性狀；突然大量鮮紅引流是出血警訊。', 'Record drain volume and character; a sudden large bright-red output signals bleeding.'],
    imaging: ['影像工作站', 'Imaging workstation', '核對病人與左右側，比較術前影像與正常對照；點開看本科影像孿生。', 'Check patient and side, compare pre-operative images with normal; open the specialty imaging twin.'],
    lab: ['檢驗／血氣', 'Labs & blood gas', '血紅素、電解質、乳酸與凝血；異常值要回報並複驗。', 'Haemoglobin, electrolytes, lactate and coagulation; report and repeat abnormal values.'],
    chart: ['病歷與同意書', 'Chart & consent', '病史、過敏、用藥、同意書與術前檢查；任何不一致先停下來澄清。', 'History, allergies, medicines, consent and pre-op tests; stop and clarify any mismatch.'],
    whiteboard: ['白板／WHO 核對', 'Board / WHO checklist', '劃刀前團隊暫停：身分、手術、側別、過敏、失血與抗生素。', 'Time-out before incision: identity, procedure, side, allergy, blood loss and antibiotics.'],
    huddle: ['團隊討論／交班', 'Huddle & handover', '以 SBAR 交班：情境、背景、評估、建議；確認接手者複述。', 'Hand over with SBAR; ask the receiver to read back.'],
    recovery: ['恢復室／加護床', 'Recovery / ICU bed', '甦醒評估、疼痛、噁心、出血與呼吸；符合標準才轉出。', 'Assess emergence, pain, nausea, bleeding and breathing; discharge only when criteria are met.'],
    door: ['門口／轉送', 'Door & transfer', '限制區管制、轉送前再次核對與監測、交接文件。', 'Restricted-zone control, re-check and monitoring before transfer, handover documents.'],
    device: ['專科設備', 'Specialty device', '依科別：顯微鏡、體外循環機、C 臂、內視鏡塔、超音波、牙科治療椅或困難氣道車；使用前檢查與輻射／電燒安全。', 'By specialty: microscope, heart-lung machine, C-arm, endoscopy tower, ultrasound, dental chair or airway cart; pre-use checks and radiation / diathermy safety.']
  };

  // ---------------------------------------------------------------- the scene
  function mount(host, api) {
    const el = document.createElement('div'); el.className = 'th3d'; host.appendChild(el);
    const cv = document.createElement('canvas'); el.appendChild(cv);
    const tip = document.createElement('div'); tip.className = 'th3d-tip'; tip.hidden = true; el.appendChild(tip);
    const hint = document.createElement('div'); hint.className = 'th3d-hint'; el.appendChild(hint);
    const card = document.createElement('div'); card.className = 'th3d-card'; card.hidden = true; el.appendChild(card); let cardFor = null;
    function showCard(id, ev) {
      const o = objs[id]; const inf = INFO[id] || [id, id, '', '']; const name = (o && o.userData.name) || (zh() ? inf[0] : inf[1]);
      cardFor = id; card.innerHTML = `<button type="button" class="th3d-x" aria-label="close">×</button><b>${esc(name)}</b><p>${esc(zh() ? inf[2] : inf[3])}</p><div class="th3d-card-row"><button type="button" class="chip small" data-c-open>${esc(t('equipDetails'))}</button><button type="button" class="chip small" data-c-fly>${esc(t('goThere'))}</button></div>`;
      card.hidden = false; placeCard();
      card.querySelector('.th3d-x').onclick = () => { card.hidden = true; cardFor = null; };
      card.querySelector('[data-c-open]').onclick = () => { card.hidden = true; api.onHot(id); };
      card.querySelector('[data-c-fly]').onclick = () => flyTo(id);
    }
    function placeCard() { if (card.hidden || !cardFor || !objs[cardFor]) return; const v = objs[cardFor].position.clone(); v.y = 1.6; v.project(camera); const w = el.clientWidth, h = el.clientHeight; const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h; const cw = Math.min(280, w - 16); card.style.width = cw + 'px'; const left = x + 18 + cw > w ? Math.max(8, x - 18 - cw) : x + 18; card.style.left = left + 'px'; card.style.top = Math.max(8, Math.min(h - card.offsetHeight - 8, y - 40)) + 'px'; card.style.opacity = v.z > 1 ? 0 : 1; }
    const handle = { el, api, dispose, update, setView, zoomBy, resize, flyTo };
    let renderer, scene, camera, raycaster, clock, raf = null, disposed = false;
    const objs = {}, people = {}, pins = [], rings = {}; let targetRing = null, arrow = null, bubbles = [], handMarkers = {}, mentorHome = null;
    const cam = { view: api.st.view || 'third', yaw: 0.2, pitch: -0.35, dist: 4.2, fov: 70, pan: new THREE.Vector3(0, 1.0, 0), pos: new THREE.Vector3(), look: new THREE.Vector3(), tPos: new THREE.Vector3(), tLook: new THREE.Vector3(), first: { yaw: -2.55, pitch: -0.62 } };
    const ecg = { c: canvas(512, 160), buf: [], t: 0 };
    let brainTex = null, photo = null; const photoState = { tex: null, on: api.photoEnabled !== false, panorama: false, print: null, floorMat: null, bg: null };

    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.5 : 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95; renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x0f1a1e); scene.fog = new THREE.Fog(0x0f1a1e, 16, 34);
    camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 80); raycaster = new THREE.Raycaster(); clock = new THREE.Clock(); scene.add(camera);
    const fpHands = new THREE.Group(); [[-0.22, -0.26, -0.55, 0.3], [0.22, -0.26, -0.55, -0.3]].forEach(([x, y, z, rz]) => { const h = new THREE.Group(); const palm = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 12), new THREE.MeshStandardMaterial({ color: '#dfe8e6', roughness: 0.55 })); palm.scale.set(1, 0.6, 1.2); h.add(palm); const cuff = cyl(0.075, 0.09, 0.22, '#1f6f5f', { rough: 0.9 }); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.17; h.add(cuff); h.position.set(x, y, z); h.rotation.z = rz; h.rotation.x = 0.35; fpHands.add(h); }); fpHands.visible = false; camera.add(fpHands);
    window.__ht3dMounts = (window.__ht3dMounts || 0) + 1;

    // room
    const type = api.roomType;
    const roomGroup = new THREE.Group(); scene.add(roomGroup);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ map: floorTexture(type), roughness: 0.35, metalness: 0.08 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(type), roughness: 0.85 });
    [[0, ROOM.h / 2, -ROOM.d / 2, 0], [0, ROOM.h / 2, ROOM.d / 2, Math.PI], [-ROOM.w / 2, ROOM.h / 2, 0, Math.PI / 2], [ROOM.w / 2, ROOM.h / 2, 0, -Math.PI / 2]].forEach(([x, y, z, ry], i) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(i < 2 ? ROOM.w : ROOM.d, ROOM.h), wallMat); w.position.set(x, y, z); w.rotation.y = ry; w.receiveShadow = true; roomGroup.add(w); });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ color: 0xf2f4f3, roughness: 0.9 })); ceiling.rotation.x = Math.PI / 2; ceiling.position.y = ROOM.h; roomGroup.add(ceiling);
    for (let x = -3; x <= 3; x += 3) for (let z = -2.5; z <= 2.5; z += 2.5) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9 })); p.rotation.x = Math.PI / 2; p.position.set(x, ROOM.h - 0.01, z); roomGroup.add(p); }
    // viewing window to the corridor on the far wall
    const win = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x9fd3e8, emissive: 0x6fb3d8, emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.3 })); win.position.set(3.2, 1.7, -ROOM.d / 2 + 0.02); roomGroup.add(win);
    // image-based lighting: a small procedural "room" (bright ceiling panels, pale walls) prefiltered with PMREM gives
    // metal and glossy surfaces believable reflections without any external HDR file.
    try {
      const envScene = new THREE.Scene(); const envBox = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 10), new THREE.MeshBasicMaterial({ color: 0x9aa8a4, side: THREE.BackSide })); envScene.add(envBox);
      [[-3, 1.9, -2], [3, 1.9, -2], [-3, 1.9, 2], [3, 1.9, 2], [0, 1.9, 0]].forEach(([x, y, z]) => { const pnl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff })); pnl.position.set(x, y, z); pnl.rotation.x = Math.PI / 2; envScene.add(pnl); });
      const win2 = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), new THREE.MeshBasicMaterial({ color: 0xbfe3f2 })); win2.position.set(3, 0.4, -4.9); envScene.add(win2);
      const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(envScene, 0.04).texture; if ('environmentIntensity' in scene) scene.environmentIntensity = 0.35; pmrem.dispose(); envScene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    } catch (e) { /* older GPUs: fall back to the lights below */ }
    // lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a95, 0.5));
    const amb = new THREE.AmbientLight(0xffffff, 0.25); scene.add(amb);
    const lamps = [];
    if (type === 'or' || type === 'er' || type === 'imaging') {
      [[-0.5, -0.6], [0.6, 0.6]].forEach(([ox, oz], i) => { const arm = cyl(0.04, 0.04, 1.2, '#dfe4e7'); arm.position.set(ox * 1.6, ROOM.h - 0.6, oz * 1.6); arm.rotation.z = ox * 0.6; arm.rotation.x = -oz * 0.6; scene.add(arm); const head = cyl(0.42, 0.36, 0.14, '#e9eef2', { rough: 0.4, metal: 0.2 }); head.position.set(ox, 2.15, oz); head.rotation.x = -oz * 0.35; head.rotation.z = ox * 0.35; scene.add(head); const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 2.2 })); disc.position.set(ox, 2.07, oz); disc.rotation.x = -Math.PI / 2 - oz * 0.35; disc.rotation.z = ox * 0.35; scene.add(disc); const sp = new THREE.SpotLight(0xfff1dc, 28, 7, 0.55, 0.5, 1.6); sp.position.set(ox, 2.1, oz); sp.target.position.set(0, 1.2, 0); sp.castShadow = i === 0; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -0.0005; scene.add(sp); scene.add(sp.target); lamps.push(sp); });
    } else { const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 5, 2); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7; scene.add(key); }
    const fill = new THREE.PointLight(0xdfefff, 8, 12, 2); fill.position.set(3, 2.6, -3); scene.add(fill);

    // equipment & people
    Object.keys(POS).forEach(id => { const e = equipment(id, api); const p = POS[id]; at(e, p, id === 'whiteboard' ? Math.PI / 2 : id === 'imaging' ? 0 : id === 'door' ? Math.PI : id === 'huddle' ? Math.PI : id === 'chart' ? -0.6 : id === 'lab' ? -Math.PI / 2 : id === 'cart' ? -0.8 : 0); scene.add(e); objs[id] = e; const r = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 48), new THREE.MeshBasicMaterial({ color: 0xc0392b, transparent: true, opacity: 0, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.set(p[0], 0.012, p[2]); scene.add(r); rings[id] = r; });
    api.roles.forEach(r => { const key = r.player ? 'player' : (ROLE_POS[r.id] ? r.id : 'extra'); const p = ROLE_POS[key] || ROLE_POS.extra; const m = person(r, {}); at(m, p); m.lookAt(0, 1.1, 0); scene.add(m); people[r.id] = m; if (r.id === 'mentor') mentorHome = new THREE.Vector3(p[0], 0, p[2]); });
    // arrow above the current target
    arrow = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 16), new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0xc0392b, emissiveIntensity: 0.6 })); arrow.rotation.x = Math.PI; scene.add(arrow);
    // hand markers
    ['left', 'right'].forEach(h => { const s = labelSprite(h === 'left' ? 'L' : 'R', { size: 34, bg: h === 'left' ? 'rgba(20,80,141,.95)' : 'rgba(113,80,33,.95)', border: '#fff', scale: 0.0032 }); s.visible = false; scene.add(s); handMarkers[h] = s; });
    // optional real photograph (licensed; http only — file:// images taint WebGL textures)
    const photoGroup = new THREE.Group(); scene.add(photoGroup);
    function applyPhoto(on) {
      photoState.on = on; const t = photoState.tex; if (!t) return;
      if (photoState.panorama) {
        if (on) { if (!photoState.bg) { photoState.bg = scene.background; photoState.floorMat = floor.material; photoState.env = scene.environment; } scene.background = t; scene.environment = t; scene.fog = null; roomGroup.visible = false; floor.material = new THREE.ShadowMaterial({ opacity: 0.35 }); }
        else { scene.background = photoState.bg || new THREE.Color(0x0f1a1e); scene.environment = photoState.env || null; scene.fog = new THREE.Fog(0x0f1a1e, 16, 34); roomGroup.visible = true; if (photoState.floorMat) floor.material = photoState.floorMat; }
      }
      photoGroup.visible = on;
    }
    if (!FILE && api.photo) { const loader = new THREE.TextureLoader(); loader.load(api.photo.src, t => { if (disposed) return; t.colorSpace = THREE.SRGBColorSpace; photoState.tex = t; photoState.panorama = !!api.photo.panorama; if (api.photo.panorama) { t.mapping = THREE.EquirectangularReflectionMapping; const cap = labelSprite(say('實景 360°・', '360° photo · ') + (api.photo.credit || ''), { size: 22, bg: 'rgba(16,28,32,.75)', scale: 0.003 }); cap.position.set(0, 0.25, 2.6); photoGroup.add(cap); } else { const print = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); print.position.set(-1.2, 1.75, -ROOM.d / 2 + 0.03); photoGroup.add(print); const cap = labelSprite(say('實景參考 · ', 'Reference photo · ') + (api.photo.credit || ''), { size: 22, bg: 'rgba(16,28,32,.75)' }); cap.position.set(-1.2, 0.3, -ROOM.d / 2 + 0.1); photoGroup.add(cap); } photo = t; applyPhoto(photoState.on); }, undefined, () => {}); }
    handle.setPhoto = applyPhoto; handle.showCard = showCard;
    // test/automation helper: screen position (CSS px inside the 3D element) of an equipment item
    handle.screenPos = (id, y) => { const o = objs[id]; if (!o) return null; const v = o.position.clone(); v.y = y == null ? 1.0 : y; v.project(camera); const r = el.getBoundingClientRect(); return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 }; };
    window.__ht3d = handle;
    if (!FILE && api.brainSlice && objs.imaging && objs.imaging.userData.brainScreen) { new THREE.TextureLoader().load(api.brainSlice, t => { if (disposed) return; t.colorSpace = THREE.SRGBColorSpace; const sc = objs.imaging.userData.brainScreen; sc.material.map = t; sc.material.emissiveMap = t; sc.material.needsUpdate = true; brainTex = t; }, undefined, () => {}); }

    // ---- camera
    function presetFor(view) {
      if (view === 'first') { const p = people[api.playerId] || people.player; const base = p ? p.position : new THREE.Vector3(0.7, 0, 1.0); return { pos: new THREE.Vector3(base.x, 1.62, base.z), fov: cam.fov }; }
      return null;
    }
    function setView(v) { cam.view = v; if (v === 'first') { cam.fov = Math.max(45, Math.min(95, cam.fov)); } if (v === 'second') { cam.dist = Math.max(1.6, Math.min(6, 4.6 / (api.st.zoom || 1))); cam.yaw = 0.35; cam.pitch = -0.55; cam.pan.set(0, 1.05, 0); } if (v === 'third') { cam.yaw = 0.75; cam.pitch = -0.78; cam.dist = 10.5; cam.pan.set(0, 0.6, 0); } hintText(); }
    function zoomBy(f) { if (cam.view === 'first') cam.fov = Math.max(35, Math.min(100, cam.fov * f)); else cam.dist = Math.max(cam.view === 'second' ? 1.2 : 4, Math.min(cam.view === 'second' ? 7 : 16, cam.dist * f)); }
    function flyTo(id) { const o = objs[id]; if (!o) return; if (cam.view === 'third') setView('second'); cam.pan.set(o.position.x, 1.1, o.position.z); cam.dist = Math.min(cam.dist, 3.2); }
    function updateCamera(dt) {
      let tp, tl;
      if (cam.view === 'first') { const f = presetFor('first'); tp = f.pos; const dir = new THREE.Vector3(Math.sin(cam.first.yaw) * Math.cos(cam.first.pitch), Math.sin(cam.first.pitch), Math.cos(cam.first.yaw) * Math.cos(cam.first.pitch)); tl = tp.clone().add(dir); camera.fov += (cam.fov - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); }
      else { const d = cam.dist; tp = new THREE.Vector3(cam.pan.x + d * Math.sin(cam.yaw) * Math.cos(cam.pitch), cam.pan.y + d * -Math.sin(cam.pitch), cam.pan.z + d * Math.cos(cam.yaw) * Math.cos(cam.pitch)); tp.y = cam.view === 'third' ? Math.max(1.5, tp.y) : Math.max(0.4, Math.min(ROOM.h - 0.1, tp.y)); tl = cam.pan.clone(); if (Math.abs(camera.fov - 62) > 0.5) { camera.fov += (62 - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); } }
      const k = 1 - Math.exp(-dt * 6); cam.pos.lerp(tp, k); cam.look.lerp(tl, k); camera.position.copy(cam.pos); camera.lookAt(cam.look);
      // the player avatar hides in first person
      const pl = people[api.playerId]; if (pl) pl.visible = cam.view !== 'first'; fpHands.visible = cam.view === 'first'; if (fpHands.visible) { const now = clock.elapsedTime; fpHands.position.y = 0.01 * Math.sin(now * 1.6); }
    }

    // ---- interaction
    let ptr = null, pinchD = 0, hoverId = null;
    const pointers = new Map();
    function pick(ev) { const r = cv.getBoundingClientRect(); const v = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(v, camera); const hits = raycaster.intersectObjects(scene.children, true); for (const h of hits) { let o = h.object; while (o) { if (o.userData && (o.userData.hot || o.userData.zone !== undefined || o.userData.role)) return o.userData; o = o.parent; } } return null; }
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, e); ptr = { x: e.clientX, y: e.clientY, moved: 0, yaw: cam.view === 'first' ? cam.first.yaw : cam.yaw, pitch: cam.view === 'first' ? cam.first.pitch : cam.pitch, pan: cam.pan.clone(), btn: e.button, shift: e.shiftKey }; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } });
    cv.addEventListener('pointermove', e => { if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e); if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinchD) zoomBy(pinchD / d); pinchD = d; return; } if (!ptr) { const u = pick(e); const id = u ? (u.hot || (u.zone !== undefined ? 'zone' + u.zone : u.role)) : null; if (id !== hoverId) { hoverId = id; cv.style.cursor = id ? 'pointer' : 'grab'; if (u) { tip.textContent = u.zone !== undefined ? `${u.zone + 1}. ${pk(api.c.tiles[u.zone])}` : u.hot ? (objs[u.hot].userData.name || pk(api.hotspots[u.hot])) + ' · ' + say('點擊查看', 'click for details') : pk((api.roles.find(r => r.id === u.role) || {})); tip.hidden = false; } else tip.hidden = true; } if (!tip.hidden) { const r = el.getBoundingClientRect(); tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; } return; } const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y; ptr.moved = Math.max(ptr.moved, Math.abs(dx) + Math.abs(dy)); if (cam.view === 'first') { cam.first.yaw = ptr.yaw - dx * 0.005; cam.first.pitch = Math.max(-1.2, Math.min(0.8, ptr.pitch + dy * 0.005)); } else if (ptr.btn === 2 || ptr.shift) { const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)); cam.pan.copy(ptr.pan).addScaledVector(right, -dx * 0.004 * cam.dist); cam.pan.y = Math.max(0.3, Math.min(2.2, ptr.pan.y + dy * 0.004 * cam.dist)); } else { cam.yaw = ptr.yaw - dx * 0.006; cam.pitch = Math.max(-1.35, Math.min(-0.05, ptr.pitch - dy * 0.006)); } });
    const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchD = 0; if (!ptr) return; const moved = ptr.moved; ptr = null; if (moved < 6) { const u = pick(e); if (u) { if (u.zone !== undefined) api.onZone(u.zone); else if (u.hot) { showCard(u.hot, e); if (api.onPick) api.onPick(u.hot); } else if (u.role) api.onRole && api.onRole(u.role); } } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', e => { if (!pointers.size) { ptr = null; tip.hidden = true; } });
    cv.addEventListener('wheel', e => { e.preventDefault(); zoomBy(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('dblclick', e => { const u = pick(e); if (u && u.hot) flyTo(u.hot); });
    cv.style.cursor = 'grab'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', say('3D 數位孿生手術室：拖曳環視、滾輪或雙指縮放、點選儀器', '3D digital-twin theatre: drag to look, wheel or pinch to zoom, tap equipment'));

    // ---- per-render update from theatre.js
    let cur = { target: null, second: null, mentorK: 0, lines: [], vitals: null, stations: [], hands: null, progress: 0 };
    function update(a) {
      api = a; handle.api = a; cur.target = a.target; cur.second = a.second; cur.mentorK = a.mentorK || 0; cur.lines = a.lines || []; cur.vitals = a.vitals; cur.progress = a.progress || 0;
      if (a.st.view !== cam.view) setView(a.st.view);
      if (a.st.view === 'second') cam.dist = Math.max(1.2, Math.min(7, 4.6 / (a.st.zoom || 1)));
      // pins per station
      pins.forEach(drop); pins.length = 0;
      a.map.forEach(m => { const hs = POS[m.hotspot]; if (!hs) return; const isT = m.station === a.s.zone || m.station === a.s.secondZone, done = m.station < a.engine.index && !a.singleStage; const sp = labelSprite(String(m.station + 1), { size: 30, bg: isT ? 'rgba(192,57,43,.96)' : done ? 'rgba(40,122,85,.92)' : 'rgba(31,111,95,.92)', border: '#fff', scale: 0.0028 }); sp.position.set(hs[0] + (m.slot % 3) * 0.28 - 0.28, 2.0 + Math.floor(m.slot / 3) * 0.26, hs[2]); sp.userData.zone = m.station; scene.add(sp); pins.push(sp); if (isT) { const name = labelSprite(pk(a.c.tiles[m.station]), { size: 24, bg: 'rgba(122,28,36,.92)', scale: 0.003 }); name.position.set(hs[0], 1.72, hs[2]); name.userData.zone = m.station; scene.add(name); pins.push(name); } });
      // highlight target equipment
      Object.keys(objs).forEach(id => { const h = objs[id].userData.highlight; if (h && h.material) { const on = a.target && a.target.hotspot === id; h.material.emissive = new THREE.Color(on ? 0xc0392b : 0x000000); h.material.emissiveIntensity = on ? 0.35 : 1; } });
      // field progress texture
      const f = objs.field && objs.field.userData.field; if (f) { const c2 = fieldCanvas(a.fieldType, a.progress); f.material.map.image = c2; f.material.map.needsUpdate = true; }
      // speech bubbles
      bubbles.forEach(drop); bubbles = [];
      (a.lines || []).slice(0, 2).forEach((l, i) => { const p = people[l.role]; if (!p) return; const b = labelSprite(wrapText(l.text, zh() ? 16 : 34), { size: 24, bg: 'rgba(255,255,255,.96)', color: '#15202b', border: i === 0 ? '#1f6f5f' : '#81296d', scale: 0.0028 }); b.position.set(p.position.x, 2.35, p.position.z); b.userData.role = l.role; scene.add(b); bubbles.push(b); });
      // hands
      ['left', 'right'].forEach(h => { const hp = a.engine.hands[h]; const mk = handMarkers[h]; if (!hp || !hp.moved) { mk.visible = false; return; } const z = a.engine.anchors.findIndex(an => Math.hypot(an[0] - hp.x, an[1] - hp.y) <= a.engine.tolerance); const m = z >= 0 ? a.map[z] : null; if (!m) { mk.visible = false; return; } const hs = POS[m.hotspot]; mk.position.set(hs[0] + (h === 'left' ? -0.35 : 0.35), 1.45, hs[2] + 0.25); mk.visible = true; });
      // monitor text
      hintText();
    }
    function wrapText(text, n) { const out = []; let s = String(text || ''); if (zh()) { while (s.length > n) { out.push(s.slice(0, n)); s = s.slice(n); } out.push(s); } else { const words = s.split(' '); let line = ''; words.forEach(w => { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line += ' ' + w; }); if (line.trim()) out.push(line.trim()); } return out.slice(0, 4).join('\n'); }
    function hintText() { hint.textContent = cam.view === 'first' ? say('第一視角：拖曳環視 · 滾輪／雙指調整視野 · 點選儀器查看', 'First person: drag to look · wheel/pinch changes field of view · tap equipment') : cam.view === 'second' ? say('第二視角：拖曳環繞 · 滾輪／雙指拉近拉遠 · 右鍵或 Shift 拖曳平移 · 雙擊儀器飛到旁邊', 'Second person: drag to orbit · wheel/pinch zooms · right-drag or Shift-drag pans · double-click equipment to fly there') : say('第三視角：整間手術室 · 拖曳旋轉 · 點選站牌或儀器', 'Third person: the whole room · drag to rotate · tap a station pin or equipment'); }

    // ---- animation
    const g = (t, m, w, a) => a * Math.exp(-((t - m) ** 2) / (2 * w * w));
    function drawEcg(dt) { const v = cur.vitals || { hr: 72 }; const rr = 60 / Math.max(30, v.hr || 72); ecg.t += dt; const ph = ecg.t % rr; const y = g(ph, 0.08, 0.02, 0.12) + g(ph, 0.2, 0.01, -0.1) + g(ph, 0.22, 0.012, 1.1) + g(ph, 0.25, 0.012, -0.25) + g(ph, 0.45, 0.05, 0.25); ecg.buf.push(y); if (ecg.buf.length > 500) ecg.buf.shift(); const x = ecg.c.getContext('2d'); x.fillStyle = '#061a10'; x.fillRect(0, 0, 512, 160); x.strokeStyle = '#4dff8f'; x.lineWidth = 3; x.beginPath(); ecg.buf.forEach((val, i) => { const px = i + 6, py = 92 - val * 50; if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.stroke(); x.fillStyle = '#4dff8f'; x.font = '700 28px system-ui'; x.fillText('HR ' + (v.hr || 72), 12, 36); x.fillStyle = '#ff6b6b'; x.fillText('BP ' + (v.bp || '118/72'), 150, 36); x.fillStyle = '#74c0fc'; x.fillText('SpO₂ ' + (v.spo2 || 98) + '%', 330, 36); x.fillStyle = '#ffd166'; x.font = '700 22px system-ui'; x.fillText('RR ' + (v.rr || 14) + '  T ' + (v.temp || 36.6) + '°', 12, 148); }
    function loop() { if (disposed) return; raf = requestAnimationFrame(loop); const dt = Math.min(0.05, clock.getDelta()); const now = clock.elapsedTime;
      if (!el.isConnected) return; if (document.hidden) return;
      updateCamera(dt); placeCard();
      drawEcg(dt); ['monitor', 'recovery', 'imaging'].forEach(id => { const sc = objs[id] && objs[id].userData.screen; if (sc) { if (sc.material.map.image !== ecg.c) { sc.material.map.image = ecg.c; sc.material.emissiveMap = sc.material.map; } sc.material.map.needsUpdate = true; } });
      // target ring + arrow
      Object.keys(rings).forEach(id => { const r = rings[id]; const on = cur.target && cur.target.hotspot === id; r.material.opacity += ((on ? 0.6 + 0.3 * Math.sin(now * 5) : 0) - r.material.opacity) * Math.min(1, dt * 8); const s = on ? 1 + 0.08 * Math.sin(now * 5) : 1; r.scale.set(s, s, 1); });
      if (cur.target && POS[cur.target.hotspot]) { const p = POS[cur.target.hotspot]; arrow.visible = true; arrow.position.set(p[0], 2.45 + 0.12 * Math.sin(now * 4), p[2]); } else arrow.visible = false;
      // mentor walks toward the target during the demo
      const mentor = people.mentor; if (mentor && mentorHome) { const tgt = cur.target && POS[cur.target.hotspot] ? new THREE.Vector3(POS[cur.target.hotspot][0], 0, POS[cur.target.hotspot][2] - 0.75) : mentorHome; const goal = mentorHome.clone().lerp(tgt, Math.max(0, Math.min(1, cur.mentorK))); mentor.position.lerp(goal, Math.min(1, dt * 4)); mentor.lookAt(cur.target && POS[cur.target.hotspot] ? new THREE.Vector3(POS[cur.target.hotspot][0], 1.1, POS[cur.target.hotspot][2]) : new THREE.Vector3(0, 1.1, 0)); const stepping = mentor.position.distanceTo(goal) > 0.02; mentor.position.y = stepping ? Math.abs(Math.sin(now * 9)) * 0.03 : 0; }
      // breathing patient & bag
      const body = objs.field; if (body) { body.children.forEach(ch => { if (ch.geometry && ch.geometry.type === 'CapsuleGeometry') ch.scale.y = 1 + 0.03 * Math.sin(now * 1.3); }); }
      const bag = objs.anesthesia && objs.anesthesia.userData.bag; if (bag) { const s = 1 + 0.18 * Math.sin(now * 1.3); bag.scale.set(s, s, s); }
      // speaking avatars nod; bubbles bob
      bubbles.forEach((b, i) => { b.position.y = 2.35 + 0.03 * Math.sin(now * 3 + i); const p = people[b.userData.role]; if (p && p.userData.head) p.userData.head.position.y = 1.56 + 0.012 * Math.sin(now * 6); });
      lamps.forEach(l => { l.intensity = 28 + 0.8 * Math.sin(now * 30); });
      // name tags fade out when the camera is right next to someone (second person close-ups)
      Object.values(people).forEach(p => { const tg = p.userData.tag; if (tg) { const d = camera.position.distanceTo(tg.getWorldPosition(new THREE.Vector3())); tg.visible = d > 1.3 && p.visible; } });
      renderer.render(scene, camera); }
    function resize() { const w = Math.max(240, el.clientWidth), h = Math.max(200, el.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const ro = window.ResizeObserver ? new ResizeObserver(resize) : null; if (ro) ro.observe(el); window.addEventListener('resize', resize);
    function dispose() { disposed = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); window.removeEventListener('resize', resize); scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } }); renderer.dispose(); if (el.parentNode) el.parentNode.removeChild(el); }

    setView(cam.view); cam.pos.set(8, 6, 9); cam.look.set(0, 1, 0); update(api); resize(); loop();
    return handle;
  }

  window.HT = window.HT || {};
  window.HT.theatre3d = { available, ensure, mount, POS, ROLE_POS, INFO };
})(window);
