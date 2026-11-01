/* theatre3d-labs.js — v4.1 room pack for the 3D shift game (theatre3d.js room hook).
   Registers three lab / engineering rooms on window.HT.theatre3dRooms:
     decoction-lab  中藥品管／煎製實驗室   bench(main) hood hplc oven grinder scale microscope workstation desk sink door chart
     cssd           消毒供應中心          packing(main) washer autoclave sterile-store incubator workstation whiteboard sink door chart desk
     biomed-lab     生醫工程實驗室        bench(main) hood incubator printer3d microscope workstation desk sink door chart
   Each builder(ctx) places its props with ctx.makeKit (merged geometry, one mesh per finish), registers every prop in
   ctx.objs (clickable, nav-blocking, walkTo target) with an INFO card ('dl-*', 'cs-*', 'bm-*' ids so v4.0 cards are never
   overwritten), fills ctx.H with standing anchors, aliases every v1 generic hotspot id with ctx.A and calls ctx.setField.
   Screens are procedural canvases labelled 示意; nothing is fetched. Idle animations (rotary evaporator, autoclave cycle
   light, oscilloscope trace, 3D-printer head) run from mesh.onBeforeRender and are skipped under reduced motion.
   Teaching simulation only: no doses, weights or device settings are given as instructions. Classic script, no imports. */
(function () {
  'use strict';
  const W = window; W.HT = W.HT || {}; const ROOMS = W.HT.theatre3dRooms = W.HT.theatre3dRooms || {};
  const TOP = 0.9; // worktop height (m)
  const C = { ss: '#d3d9dc', lam: '#e9edee', lam2: '#f6f8f8', door: '#f3f5f5', epoxy: '#34414b', steel: '#cfd6da', steel2: '#aeb8bd', grey: '#9aa5aa', dark: '#1d262c', ink: '#2b3036', glass: '#d6edf5', plinth: '#56626a', led: '#4dff8f', red: '#e74c3c', amber: '#ffb347', blue: '#2f6fd0', kraft: '#c9a46c', white: '#f4f6f8' };
  const FONT = 'system-ui, "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, H2 = PI / 2;

  // ------------------------------------------------------------------ shared builders (kit k, local frame: front = +z)
  function baseRun(k, L, D, o) { // base cabinets (doors + drawer stacks) with a worktop at TOP; o.two = doors on both faces
    o = o || {}; const fin = 'paint', body = o.steel ? C.ss : C.lam, door = o.steel ? '#e3e8ea' : C.door;
    k.box(L - 0.04, 0.1, D - 0.14, 0, 0.05, 0, C.plinth, 'paint'); k.box(L, 0.76, D - 0.04, 0, 0.48, 0, body, fin);
    const n = Math.max(1, Math.round(L / 0.6)), w = L / n;
    (o.two ? [1, -1] : [1]).forEach(s => { for (let i = 0; i < n; i++) { const x = -L / 2 + w * (i + 0.5), z = s * (D / 2 - 0.014);
      if (i % 3 === 1) for (let j = 0; j < 3; j++) { k.box(w - 0.03, 0.22, 0.012, x, 0.235 + j * 0.245, z, door, fin); k.box(0.13, 0.016, 0.02, x, 0.31 + j * 0.245, s * (D / 2), C.grey, 'satin'); }
      else { k.box(w - 0.03, 0.72, 0.012, x, 0.47, z, door, fin); k.box(0.016, 0.15, 0.02, x + (i % 2 ? -1 : 1) * (w / 2 - 0.07), 0.7, s * (D / 2), C.grey, 'satin'); } } });
    k.rbox(L + 0.03, 0.036, D + 0.03, 0.008, 0, TOP - 0.018, 0, o.top === C.steel ? '#dce2e5' : (o.top || C.epoxy), o.top === C.steel ? 'paint' : 'plastic');
  }
  function legTable(k, L, D, h, top, fin) { // open-frame table (legs + rails + top)
    k.rbox(L, 0.04, D, 0.008, 0, h - 0.02, 0, top || C.lam2, fin || 'paint');
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => k.box(0.045, h - 0.04, 0.045, a * (L / 2 - 0.05), (h - 0.04) / 2, b * (D / 2 - 0.05), C.steel2, 'satin'));
    k.box(L - 0.1, 0.03, 0.03, 0, 0.16, -(D / 2 - 0.05), C.steel2, 'satin');
  }
  function wireShelf(k, L, D, levels, post) { // chrome wire shelving: posts + slatted shelves
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => k.cyl(0.013, 0.013, post, a * (L / 2 - 0.015), post / 2, b * (D / 2 - 0.015), '#e3e8ea', 'paint', 0, 0, 0, 8));
    levels.forEach(y => { k.box(L, 0.012, D, 0, y, 0, '#d4dadd', 'paint'); k.box(L, 0.03, 0.012, 0, y + 0.008, D / 2 - 0.006, '#e8ecee', 'paint'); k.box(L, 0.03, 0.012, 0, y + 0.008, -D / 2 + 0.006, '#e8ecee', 'paint'); });
  }
  function bottle(k, x, y, z, r, h, glassCol, liq, cap) { k.cyl(r, r, h, x, y + h / 2, z, glassCol || C.glass, liq === 'solid' ? 'paint' : 'glass', 0, 0, 0, 8); if (liq && liq !== 'solid') k.cyl(r * 0.9, r * 0.9, h * 0.6, x, y + h * 0.3, z, liq, 'fluid', 0, 0, 0, 8); k.cyl(r * 0.45, r * 0.5, h * 0.16, x, y + h * 1.08, z, cap || C.ink, 'plastic', 0, 0, 0, 6); }
  function amber(k, x, y, z, s) { s = s || 1; k.cyl(0.036 * s, 0.036 * s, 0.13 * s, x, y + 0.065 * s, z, '#7a4a1c', 'fluid', 0, 0, 0, 8); k.cyl(0.018 * s, 0.02 * s, 0.03 * s, x, y + 0.145 * s, z, C.ink, 'plastic', 0, 0, 0, 6); }
  function beaker(k, x, y, z, r, h, liq) { k.cyl(r, r * 0.96, h, x, y + h / 2, z, C.glass, 'glass', 0, 0, 0, 10); if (liq) k.cyl(r * 0.9, r * 0.88, h * 0.55, x, y + h * 0.28, z, liq, 'fluid', 0, 0, 0, 10); }
  function flask(k, x, y, z, r, liq) { k.lathe([[0.001, 0], [r, 0], [r * 0.92, r * 0.5], [r * 0.3, r * 1.55], [r * 0.28, r * 2.1]], x, y, z, C.glass, 'glass', 14); if (liq) k.lathe([[0.001, 0.004], [r * 0.9, 0.004], [r * 0.7, r * 0.55], [0.001, r * 0.55]], x, y, z, liq, 'fluid', 12); }
  function stool(k, x, z, h, seat) { h = h || 0.62; for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; k.flat([x, 0.05, z], [x + Math.cos(a) * 0.26, 0.035, z + Math.sin(a) * 0.26], 0.035, 0.03, C.ink, 'plastic'); }
    k.cyl(0.024, 0.024, h - 0.1, x, h / 2, z, C.grey, 'satin', 0, 0, 0, 6); k.tor(0.17, 0.01, x, 0.3, z, C.grey, 'satin', H2, 0, 0, PI * 2, 8); k.cyl(0.17, 0.17, 0.06, x, h, z, seat || '#3b5063', 'cloth', 0, 0, 0, 12); }
  function monitor(k, S, x, y, z, w, h, cv, yaw, glow) { // desk monitor on a stand; the screen faces local +z (then yaw)
    k.at(x, 0, z, yaw || 0, () => { k.box(0.22, 0.012, 0.16, 0, y + 0.006, 0, C.ink, 'plastic'); k.box(0.04, h * 0.5 + 0.06, 0.03, 0, y + h * 0.25 + 0.03, -0.03, C.ink, 'plastic'); k.rbox(w + 0.03, h + 0.03, 0.03, 0.008, 0, y + h * 0.5 + 0.1, -0.01, '#15191c', 'plastic'); });
    const cs = Math.cos(yaw || 0), sn = Math.sin(yaw || 0); return S(w, h, cv, x + 0.006 * sn, y + h * 0.5 + 0.1, z + 0.006 * cs, yaw || 0, glow);
  }
  function keyboard(k, x, y, z, yaw) { k.at(x, y, z, yaw || 0, () => { k.box(0.42, 0.016, 0.13, 0, 0.008, 0, C.ink, 'plastic'); k.box(0.39, 0.004, 0.1, 0, 0.018, 0, '#3d464d', 'plastic'); k.rbox(0.05, 0.02, 0.09, 0.01, 0.3, 0.01, 0.01, C.ink, 'plastic'); }); }
  function board(m) { const mt = m && m.material; if (!mt) return m; mt.emissive.set(0xffffff); mt.emissiveMap = mt.map; mt.emissiveIntensity = 0.3; mt.needsUpdate = true; return m; } // whiteboards stay legible in dim corners
  function wallCabinets(k, L, y0) { // upper wall cabinets with glazed doors (local, back at z = 0)
    k.box(L, 0.62, 0.34, 0, y0 + 0.31, 0.17, C.lam, 'paint'); const n = Math.round(L / 0.6); for (let i = 0; i < n; i++) { const x = -L / 2 + (i + 0.5) * L / n; k.box(L / n - 0.03, 0.58, 0.012, x, y0 + 0.31, 0.345, C.door, 'paint'); k.box(L / n - 0.16, 0.42, 0.014, x, y0 + 0.33, 0.346, '#a9c9d6', 'glass'); k.box(0.12, 0.014, 0.02, x, y0 + 0.06, 0.355, C.grey, 'satin'); }
  }

  // ------------------------------------------------------------------ room toolkit (per mount)
  function toolkit(c) {
    const T = c.THREE, say = c.say; const anims = [];
    // one label atlas per room: 8 × 16 cells of 128 × 64 px; label quads of all props share its material
    const AW = 1024, AH = 1024, CW = 128, CH = 64; const atlasCv = c.canvas(AW, AH), ag = atlasCv.getContext('2d'); let cell = 0, atlasTex = null, atlasMat = null;
    function atlasMaterial() { if (!atlasMat) { atlasTex = c.tex(atlasCv); atlasMat = new T.MeshStandardMaterial({ map: atlasTex, roughness: 0.72, metalness: 0 }); } return atlasMat; }
    function label(draw) { const col = cell % 8, row = Math.floor(cell / 8) % 16; cell++; const x = col * CW, y = row * CH; ag.save(); ag.translate(x, y); ag.beginPath(); ag.rect(0, 0, CW, CH); ag.clip(); draw(ag, CW, CH); ag.restore(); if (atlasTex) atlasTex.needsUpdate = true; return [(x + 1) / AW, 1 - (y + CH - 1) / AH, (x + CW - 1) / AW, 1 - (y + 1) / AH]; }
    function fit(g, text, max, size, weight) { let s = size; g.font = `${weight || 700} ${s}px ${FONT}`; while (s > 8 && g.measureText(text).width > max) { s--; g.font = `${weight || 700} ${s}px ${FONT}`; } }
    function tag(zh, en, o) { o = o || {}; return label((g, w, h) => { g.fillStyle = o.bg || '#fbfbf6'; g.fillRect(0, 0, w, h); g.fillStyle = o.band || '#2f6f8f'; g.fillRect(0, 0, w, 11); g.fillStyle = o.fg || '#1d262c'; g.textAlign = 'center'; fit(g, zh, w - 8, o.size || 24); g.fillText(zh, w / 2, en ? 36 : 44); if (en) { g.fillStyle = o.sub || '#56626a'; fit(g, en, w - 8, 11, 500); g.fillText(en, w / 2, 55); } }); }
    function quads(list) { // one mesh of many textured quads (labels); q = {p, w, h, ry, up, uv}
      const n = list.length, pos = new Float32Array(n * 12), nor = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = new Uint16Array(n * 6);
      list.forEach((q, i) => { const cs = Math.cos(q.ry || 0), sn = Math.sin(q.ry || 0), hw = q.w / 2, hh = q.h / 2;
        [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(([lx, ly], j) => { const o = i * 12 + j * 3; if (q.up) { const lz = -ly; pos.set([q.p[0] + lx * cs + lz * sn, q.p[1], q.p[2] - lx * sn + lz * cs], o); nor.set([0, 1, 0], o); } else { pos.set([q.p[0] + lx * cs, q.p[1] + ly, q.p[2] - lx * sn], o); nor.set([sn, 0, cs], o); } });
        const u = q.uv; uv.set([u[0], u[1], u[2], u[1], u[2], u[3], u[0], u[3]], i * 8); const b = i * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6); });
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.setIndex(new T.BufferAttribute(idx, 1)); geo.computeBoundingSphere(); geo.computeBoundingBox();
      const m = new T.Mesh(geo, atlasMaterial()); m.receiveShadow = true; return m;
    }
    function screenOf(w, h, cv, x, y, z, yaw, glow, tilt) { const m = c.screenMesh(w, h, cv, { glow: glow == null ? 0.9 : glow }); m.position.set(x, y, z); m.rotation.set(tilt || 0, yaw || 0, 0, 'YXZ'); return m; }
    // a clickable, nav-blocking prop: build(k, S, Q, g) → group registered as objs[id] (+ H[id] unless meta.hot === false)
    function prop(id, p, ry, meta, build) {
      const g = new T.Group(); const k = c.makeKit(c.K); const Q = [];
      const S = (w, h, cv, x, y, z, yaw, glow, tilt) => { const m = screenOf(w, h, cv, x, y, z, yaw, glow, tilt); g.add(m); return m; };
      build(k, S, Q, g); g.add(k.build()); if (Q.length) g.add(quads(Q));
      g.userData.hot = id; g.userData.name = meta.name ? say(meta.name[0], meta.name[1]) : id; g.userData.info = meta.info || id; g.userData.equip = meta.equip || 'lab'; g.userData.labRoom = c.type;
      g.traverse(o => { if (o.isMesh || o.isSprite) { o.userData.hot = id; if (!o.userData.equip) o.userData.equip = g.userData.equip; } });
      c.at(g, p, ry); c.scene.add(g); c.objs[id] = g; if (meta.hot !== false) c.H[id] = [p[0], 0, p[2]];
      return g;
    }
    // decorative, non-clickable furniture that still blocks the nav grid (partitions, wall cabinets, signs)
    function decor(build, solid) { const g = new T.Group(); const k = c.makeKit(c.K); const Q = []; build(k, Q, g); g.add(k.build({ shadow: false })); if (Q.length) g.add(quads(Q)); c.scene.add(g); if (solid !== false) c.solid(g); return g; }
    function info(id, zh, en, bzh, ben) { c.INFO[id] = { zh, en, body_zh: bzh, body_en: ben, kind: 'lab-room' }; }
    function anim(mesh, fn) { if (c.RM || !mesh) return; const t0 = performance.now(); mesh.onBeforeRender = function () { fn((performance.now() - t0) / 1000); }; anims.push(mesh); }
    function firstMesh(g) { let m = null; g.traverse(o => { if (!m && o.isMesh) m = o; }); return m; }
    function sign(zh, en, p, bg) { const s = c.labelSprite(say(zh, en), { size: 32, bg: bg || 'rgba(31,88,120,.92)', scale: 0.0042 }); s.position.set(p[0], p[1], p[2]); c.scene.add(s); return s; }
    function alias(map) { Object.keys(map).forEach(id => { if (!c.objs[id]) c.A(id, map[id]); }); }
    function tint(hex) { try { if (c.floor && c.floor.material) c.floor.material.color.set(hex); } catch (e) { /* ignore */ } }
    return { T, say, prop, decor, info, anim, firstMesh, sign, alias, tint, tag, label, quads, screenOf, anims };
  }

  // ------------------------------------------------------------------ procedural screens (all labelled 示意 via simLabel)
  function frame(c, w, h, title, bar) { const cv = c.canvas(w, h), g = cv.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = bar || '#1f3b57'; g.fillRect(0, 0, w, 30); g.fillStyle = '#fff'; g.font = `700 15px ${FONT}`; g.fillText(title, 10, 20); return { cv, g }; }
  function chromCanvas(c) {
    const { cv, g } = frame(c, 512, 320, c.say('HPLC 指紋圖譜・指標成分比對', 'HPLC fingerprint · marker compound'));
    const x0 = 46, y0 = 252, x1 = 500, y1 = 48; g.strokeStyle = '#8a959c'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0, y0); g.lineTo(x1, y0); g.stroke();
    g.fillStyle = '#56626a'; g.font = `11px ${FONT}`; for (let i = 0; i <= 6; i++) { const x = x0 + (x1 - x0) * i / 6; g.fillText(String(i * 5), x - 4, y0 + 14); } g.fillText('min', x1 - 20, y0 + 26); g.fillText('mAU', 8, y1 + 4);
    const peaks = [[3.1, 0.16, 0.12], [5.6, 0.34, 0.15], [8.2, 0.21, 0.14], [12.4, 0.92, 0.2], [14.0, 0.27, 0.16], [18.6, 0.45, 0.2], [22.3, 0.2, 0.22], [26.8, 0.32, 0.25]];
    const f = t => peaks.reduce((v, [m, hh, w]) => v + hh * Math.exp(-((t - m) * (t - m)) / (2 * w * w)), 0.02 + 0.005 * Math.sin(t * 9));
    [['#b8c2c8', 0.62, [4, 3]], ['#2f6fd0', 1, []]].forEach(([col, s, dash]) => { g.strokeStyle = col; g.lineWidth = 1.6; g.setLineDash(dash); g.beginPath(); for (let i = 0; i <= x1 - x0; i++) { const y = y0 - f(i / (x1 - x0) * 30) * s * (y0 - y1); if (i) g.lineTo(x0 + i, y); else g.moveTo(x0 + i, y); } g.stroke(); }); g.setLineDash([]);
    const mx = x0 + 12.4 / 30 * (x1 - x0); g.fillStyle = '#c0392b'; g.font = `700 12px ${FONT}`; g.fillText(c.say('▼ 指標成分（與對照品比對）', '▼ marker compound (vs reference standard)'), mx - 24, y1 - 4);
    g.fillStyle = '#56626a'; g.font = `11px ${FONT}`; g.fillText(c.say('— 樣品　- - 對照藥材', '— sample   - - reference herb'), x1 - 150, y1 + 18);
    g.fillStyle = '#2f7f4f'; g.font = `600 12px ${FONT}`; g.fillText(c.say('系統適用性：分離度 ✓ 理論板數 ✓ 拖尾因子 ✓', 'System suitability: resolution ✓ plates ✓ tailing ✓'), 50, 284);
    c.simLabel(g, 512, 320); return cv;
  }
  function tlcCanvas(c) { const cv = c.canvas(256, 256), g = cv.getContext('2d'); g.fillStyle = '#251d52'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#3c2f86'; g.fillRect(20, 14, 216, 228);
    g.strokeStyle = 'rgba(200,190,255,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(26, 214); g.lineTo(230, 214); g.moveTo(26, 34); g.lineTo(230, 34); g.stroke();
    const lanes = [['S', [[0.25, '#7fd4ff'], [0.52, '#ffe066'], [0.78, '#9dff9d']]], ['1', [[0.25, '#7fd4ff'], [0.52, '#ffe066'], [0.66, '#ff9ecf'], [0.78, '#9dff9d']]], ['2', [[0.25, '#7fd4ff'], [0.52, '#ffe066'], [0.78, '#9dff9d']]], ['3', [[0.36, '#7fd4ff'], [0.6, '#ffe066']]]];
    lanes.forEach(([n, spots], i) => { const x = 54 + i * 50; g.fillStyle = '#e6e0ff'; g.font = `700 14px ${FONT}`; g.fillText(n, x - 4, 234); spots.forEach(([rf, col]) => { const y = 214 - rf * 180; const gr = g.createRadialGradient(x, y, 1, x, y, 11); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 12, 7, 0, 0, PI * 2); g.fill(); }); });
    g.fillStyle = '#ffd166'; g.font = `700 11px ${FONT}`; g.fillText(c.say('示意 · UV 365 nm', 'SIM · UV 365 nm'), 26, 28); return cv; }
  function powderCanvas(c) { const cv = c.canvas(512, 320), g = cv.getContext('2d'); const gr = g.createRadialGradient(256, 150, 30, 256, 160, 300); gr.addColorStop(0, '#f8f3e8'); gr.addColorStop(1, '#b9ad94'); g.fillStyle = gr; g.fillRect(0, 0, 512, 320);
    g.strokeStyle = 'rgba(120,100,60,.55)'; g.lineWidth = 1.2; for (let i = 0; i < 40; i++) { const x = 30 + (i * 97) % 450, y = 40 + (i * 61) % 230, r = 5 + (i % 4) * 2; g.beginPath(); g.ellipse(x, y, r, r * 0.8, i, 0, PI * 2); g.stroke(); g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x + 2, y); g.moveTo(x, y - 2); g.lineTo(x, y + 2); g.stroke(); }
    const star = (x, y, r) => { g.fillStyle = 'rgba(240,240,250,.9)'; g.strokeStyle = 'rgba(90,90,110,.8)'; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke(); }; star(140, 110, 16); star(370, 220, 13); star(420, 90, 11);
    g.strokeStyle = 'rgba(110,80,40,.75)'; g.lineWidth = 1; g.beginPath(); g.moveTo(220, 40); g.lineTo(300, 290); g.moveTo(236, 40); g.lineTo(316, 290); g.stroke(); for (let t = 0; t < 1; t += 0.035) { const x = 228 + 80 * t, y = 40 + 250 * t; g.beginPath(); g.ellipse(x, y, 9, 3, 0.3, 0, PI * 2); g.stroke(); }
    g.strokeStyle = 'rgba(150,120,70,.7)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(40 + i * 4, 230); g.lineTo(150 + i * 4, 190); g.stroke(); }
    g.fillStyle = 'rgba(20,30,40,.7)'; g.fillRect(8, 8, 300, 24); g.fillStyle = '#fff'; g.font = `600 13px ${FONT}`; g.fillText(c.say('粉末顯微：澱粉粒・簇晶・螺紋導管・纖維', 'Powder: starch · druses · spiral vessel · fibres'), 14, 25);
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(430, 280); g.lineTo(490, 280); g.stroke(); c.simLabel(g, 512, 320); return cv; }
  function listCanvas(c, title, rows, bar) { const { cv, g } = frame(c, 512, 320, title, bar); g.font = `12px ${FONT}`;
    rows.forEach((r, i) => { const y = 52 + i * 30; g.fillStyle = i % 2 ? '#f3f6f8' : '#ffffff'; g.fillRect(6, y - 18, 500, 28); g.fillStyle = '#1d262c'; g.font = `600 12px ${FONT}`; g.fillText(r[0], 12, y); g.font = `12px ${FONT}`; g.fillStyle = '#3d4a52'; g.fillText(r[1], 150, y); const st = r[2]; g.fillStyle = st[1]; g.fillRect(412, y - 13, 90, 18); g.fillStyle = '#fff'; g.font = `700 11px ${FONT}`; g.fillText(st[0], 418, y); });
    c.simLabel(g, 512, 320); return cv; }
  function panelCanvas(c, lines, bg) { const cv = c.canvas(256, 160), g = cv.getContext('2d'); g.fillStyle = bg || '#10202a'; g.fillRect(0, 0, 256, 160); g.fillStyle = '#7fe0ff'; g.font = `700 18px ${FONT}`; g.fillText(lines[0], 12, 30); g.font = `600 14px ${FONT}`; g.fillStyle = '#dff6ff'; lines.slice(1).forEach((l, i) => g.fillText(l, 12, 58 + i * 22));
    g.strokeStyle = '#4dff8f'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= 100; i++) { const x = 140 + i, y = 120 - (i < 20 ? i * 2.2 : i < 70 ? 44 + Math.sin(i) * 1.2 : 44 - (i - 70) * 1.4); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.fillStyle = '#ffd166'; g.font = `700 10px ${FONT}`; g.fillText(c.say('示意', 'SIM'), 220, 152); return cv; }
  function scopeCanvas(c) { // seamless (wraps horizontally) so the texture can scroll as a live trace
    const cv = c.canvas(256, 128), g = cv.getContext('2d'); g.fillStyle = '#04110c'; g.fillRect(0, 0, 256, 128); g.strokeStyle = 'rgba(80,160,120,.35)'; g.lineWidth = 1; for (let x = 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, 128); g.stroke(); } for (let y = 0; y <= 128; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(256, y + 0.5); g.stroke(); }
    const ecg = t => { const p = t % 1; return p < 0.1 ? Math.sin(p / 0.1 * PI) * 0.08 : p < 0.18 ? 0 : p < 0.2 ? -0.12 : p < 0.23 ? 0.9 : p < 0.26 ? -0.25 : p < 0.4 ? 0 : p < 0.55 ? Math.sin((p - 0.4) / 0.15 * PI) * 0.18 : 0; };
    [['#ffe14d', 46, 1], ['#4df0ff', 100, 0]].forEach(([col, base, kind]) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= 256; x++) { const t = x / 128; const v = kind ? ecg(t) * 34 : Math.sin(t * PI * 2) * 12 + Math.sin(t * PI * 8) * 3; if (x) g.lineTo(x, base - v); else g.moveTo(x, base - v); } g.stroke(); });
    const t = c.tex(cv); t.wrapS = c.THREE.RepeatWrapping; t.needsUpdate = true; return t; }
  function cadCanvas(c) { const { cv, g } = frame(c, 512, 320, c.say('CAD：病人專屬導板設計（股骨）', 'CAD: patient-specific guide (femur)'), '#2b3440');
    g.fillStyle = '#1c232b'; g.fillRect(0, 30, 512, 290); g.strokeStyle = 'rgba(120,150,180,.18)'; for (let i = 0; i < 512; i += 24) { g.beginPath(); g.moveTo(i, 30); g.lineTo(i, 320); g.stroke(); } for (let j = 30; j < 320; j += 24) { g.beginPath(); g.moveTo(0, j); g.lineTo(512, j); g.stroke(); }
    const bone = g.createLinearGradient(150, 0, 360, 0); bone.addColorStop(0, '#b8ad92'); bone.addColorStop(0.5, '#f1e8d2'); bone.addColorStop(1, '#a89c80'); g.fillStyle = bone;
    g.beginPath(); g.moveTo(232, 300); g.bezierCurveTo(228, 230, 236, 150, 226, 112); g.bezierCurveTo(200, 96, 186, 70, 204, 52); g.bezierCurveTo(232, 34, 262, 52, 268, 72); g.bezierCurveTo(300, 66, 318, 80, 306, 104); g.bezierCurveTo(290, 122, 276, 128, 280, 160); g.bezierCurveTo(284, 220, 282, 260, 292, 300); g.closePath(); g.fill();
    g.fillStyle = 'rgba(64,170,255,.75)'; g.beginPath(); g.moveTo(222, 150); g.lineTo(292, 150); g.lineTo(296, 196); g.lineTo(218, 196); g.closePath(); g.fill(); g.fillStyle = '#e8f6ff'; [[240, 172], [272, 172]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 7, 0, PI * 2); g.fill(); });
    g.strokeStyle = '#ff6b4a'; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(170, 172); g.lineTo(350, 172); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#cfd8e2'; g.font = `12px ${FONT}`; [c.say('導板：生物相容樹脂', 'Guide: biocompatible resin'), c.say('鑽孔套筒 × 2', 'Drill sleeves × 2'), c.say('截骨面（規劃）', 'Planned osteotomy'), 'STL · ' + c.say('已驗證', 'verified')].forEach((s, i) => g.fillText(s, 360, 80 + i * 22));
    c.simLabel(g, 512, 320); return cv; }
  function segCanvas(c) { const { cv, g } = frame(c, 512, 320, c.say('CT 分割（骨窗）→ 3D 模型', 'CT segmentation (bone window) → 3D model'), '#2b3440'); g.fillStyle = '#000'; g.fillRect(0, 30, 512, 290);
    g.fillStyle = '#4a4a4a'; g.beginPath(); g.ellipse(256, 178, 150, 118, 0, 0, PI * 2); g.fill(); g.fillStyle = '#6d6d6d'; g.beginPath(); g.ellipse(256, 178, 128, 100, 0, 0, PI * 2); g.fill();
    [[196, 186], [316, 186]].forEach(([x, y]) => { g.fillStyle = '#e8e8e8'; g.beginPath(); g.ellipse(x, y, 34, 30, 0, 0, PI * 2); g.fill(); g.fillStyle = '#5a5a5a'; g.beginPath(); g.ellipse(x, y, 14, 12, 0, 0, PI * 2); g.fill(); g.strokeStyle = 'rgba(255,140,40,.95)'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y, 36, 32, 0, 0, PI * 2); g.stroke(); });
    g.fillStyle = 'rgba(255,140,40,.25)'; g.fillRect(380, 60, 120, 60); g.fillStyle = '#ffd7b0'; g.font = `12px ${FONT}`; g.fillText(c.say('遮罩：骨', 'Mask: bone'), 392, 86); g.fillText(c.say('閾值＋手動修正', 'threshold + manual edit'), 392, 106);
    c.simLabel(g, 512, 320); return cv; }
  function cellsCanvas(c) { const cv = c.canvas(512, 320), g = cv.getContext('2d'); g.fillStyle = '#cfd6c9'; g.fillRect(0, 0, 512, 320);
    for (let i = 0; i < 46; i++) { const x = (i * 131) % 512, y = (i * 71) % 320, a = (i * 0.7) % PI, L = 26 + (i % 5) * 7; g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = 'rgba(120,130,110,.55)'; g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(0, -9, L, 0); g.quadraticCurveTo(0, 9, -L, 0); g.fill(); g.fillStyle = 'rgba(70,80,64,.8)'; g.beginPath(); g.ellipse(0, 0, 6, 4, 0, 0, PI * 2); g.fill(); g.restore(); }
    g.fillStyle = 'rgba(20,30,40,.7)'; g.fillRect(8, 8, 300, 24); g.fillStyle = '#fff'; g.font = `600 13px ${FONT}`; g.fillText(c.say('倒立顯微：細胞貼附於支架（相位差）', 'Inverted scope: cells on scaffold (phase)'), 14, 25);
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(430, 282); g.lineTo(490, 282); g.stroke(); c.simLabel(g, 512, 320); return cv; }
  function curveCanvas(c) { const { cv, g } = frame(c, 256, 160, c.say('應力－應變', 'Stress–strain'), '#2b3440'); g.strokeStyle = '#9aa5aa'; g.beginPath(); g.moveTo(24, 40); g.lineTo(24, 140); g.lineTo(246, 140); g.stroke();
    g.strokeStyle = '#2f6fd0'; g.lineWidth = 2.2; g.beginPath(); for (let i = 0; i <= 200; i++) { const x = 24 + i, e = i / 200; const y = 140 - (e < 0.35 ? e / 0.35 * 70 : 70 + (1 - Math.exp(-(e - 0.35) * 6)) * 18 - (e > 0.92 ? (e - 0.92) * 400 : 0)); if (i) g.lineTo(x, Math.min(140, y)); else g.moveTo(x, y); } g.stroke(); g.fillStyle = '#ffd166'; g.font = `700 10px ${FONT}`; g.fillText(c.say('示意', 'SIM'), 220, 154); return cv; }
  function bedCanvas(c) { const cv = c.canvas(256, 256), g = cv.getContext('2d'); g.fillStyle = '#20262c'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 256; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    g.save(); g.translate(128, 132); g.strokeStyle = '#f0ebe0'; g.lineWidth = 5; g.beginPath(); g.ellipse(0, 0, 70, 86, 0, 0, PI * 2); g.stroke(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(240,235,224,.55)'; for (let i = -64; i < 64; i += 7) { g.beginPath(); g.moveTo(i, -Math.sqrt(Math.max(0, 1 - (i / 70) ** 2)) * 84); g.lineTo(i + 20, Math.sqrt(Math.max(0, 1 - (i / 70) ** 2)) * 84); g.stroke(); }
    g.fillStyle = '#20262c'; [[-28, -10], [28, -10]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 18, 14, 0, 0, PI * 2); g.fill(); }); g.restore(); g.fillStyle = '#ffd166'; g.font = `700 11px ${FONT}`; g.fillText(c.say('示意 · 第 212 層', 'SIM · layer 212'), 8, 248); return cv; }

  // ================================================================== decoction-lab 中藥品管／煎製實驗室
  ROOMS['decoction-lab'] = function (c) {
    const L = toolkit(c), P = L.prop, I = L.info, say = L.say; L.tint('#c5d0d7');
    const HERBS = [['黃耆', 'Astragali Radix'], ['當歸', 'Angelicae Sinensis Radix'], ['甘草', 'Glycyrrhizae Radix'], ['白芍', 'Paeoniae Radix Alba'], ['川芎', 'Chuanxiong Rhizoma'], ['茯苓', 'Poria'], ['白朮', 'Atractylodis Macr. Rhizoma'], ['黨參', 'Codonopsis Radix'], ['熟地黃', 'Rehmanniae Radix Praep.'], ['陳皮', 'Citri Reticulatae Peric.'], ['丹參', 'Salviae Miltiorrhizae Radix'], ['枸杞子', 'Lycii Fructus']];
    I('dl-bench', '樣品前處理島台', 'Sample-preparation island', '藥材取樣後在此萃取（回流、超音波）、過濾與定容；陶瓷煎藥壺用來比對傳統煎煮液。兩端杯型水槽、氣體與真空開關；檯面為耐酸鹼環氧樹脂。教學模擬：條件依藥典與實驗室 SOP，不在此給數值。', 'After sampling, herbs are extracted (reflux, ultrasonic), filtered and made up to volume here; a ceramic decoction pot reproduces the traditional decoction for comparison. Cup sinks, gas and vacuum taps at both ends; chemical-resistant epoxy top. Teaching simulation: conditions follow the pharmacopoeia and the lab SOP, no numbers here.');
    I('dl-hood', '化學排氣櫃', 'Chemical fume hood', '有機溶劑、酸液與衍生化試劑只在櫃內開蓋；拉門拉到標示高度以下、氣流指示綠燈才操作。下櫃為易燃品儲存櫃，與酸鹼分開。', 'Organic solvents, acids and derivatising reagents are opened only inside; keep the sash below the marked height and work only on a green airflow light. The base cabinet stores flammables, separate from acids and bases.');
    I('dl-hplc', '高效液相層析儀（HPLC）', 'HPLC system', '由輸液泵、自動進樣器、管柱烘箱與偵測器組成，做指標成分含量測定與指紋圖譜；每批先跑系統適用性，再與對照品比對滯留時間與圖譜。', 'Pump, autosampler, column oven and detector: used for marker-compound assays and fingerprints. Each sequence starts with system suitability, then sample peaks are compared with the reference standard by retention time and pattern.');
    I('dl-tlc', '薄層層析與 UV 觀察箱', 'TLC & UV viewing cabinet', '藥材鑑別：樣品、對照藥材與對照品並排點樣、展開、顯色，在 254／365 nm 下比對斑點顏色與位置。紫外光勿直視，觀察箱關門再開燈。', 'Identification: sample, reference herb and reference standard are spotted side by side, developed and visualised; spots are compared under 254 / 365 nm. Never look into UV light; close the cabinet before switching it on.');
    I('dl-rotavap', '旋轉濃縮儀與恆溫水浴', 'Rotary evaporator & water bath', '在減壓下濃縮萃取液；燒瓶旋轉、水浴加熱、冷凝液收集在接收瓶。先開冷卻水與真空、再升溫；結束時反序關閉並先破真空。', 'Concentrates extracts under reduced pressure: the flask turns in a heated bath and the condensate collects in the receiver. Start cooling water and vacuum before heating; at the end reverse the order and vent the vacuum first.');
    I('dl-samples', '待驗藥材樣品架', 'Herb sample rack', '每袋藥材標示品名、學名、批號與收樣日期；依「先收先驗」排列，留樣另存。樣品需具代表性：依藥典取樣規則自不同包件取樣混合。', 'Each bag carries the herb name, Latin name, batch number and date received; tested first-in first-out, retained samples stored separately. Samples must be representative: drawn from several packages per the pharmacopoeia sampling rules.');
    I('dl-oven', '乾燥箱、高溫爐與乾燥器', 'Drying oven, muffle furnace & desiccator', '水分（乾燥失重）與總灰分、酸不溶性灰分測定：坩堝恆重、在乾燥器內放冷再稱。高溫爐開門前先降溫，使用耐熱手套與坩堝鉗。', 'Loss on drying, total ash and acid-insoluble ash: crucibles are brought to constant weight and cooled in the desiccator before weighing. Let the furnace cool before opening; heat-resistant gloves and crucible tongs.');
    I('dl-grinder', '藥材粉碎機與標準篩', 'Herb mill & test sieves', '把藥材粉碎成規定粒度再過篩，供萃取與顯微鑑別。粉塵多：戴口罩、用後清潔，避免批次間交叉污染；粉碎區與天平室分隔。', 'Herbs are milled to the specified particle size and sieved for extraction and microscopy. Dusty: wear a mask, clean between batches to prevent cross-contamination; the milling area is separated from the balance room.');
    I('dl-scale', '天平室：分析天平', 'Balance room: analytical balance', '分析天平放在防震大理石桌、有防風罩；每日以標準砝碼校正並記錄。稱量時關好防風門、等讀值穩定；稱量紙與藥匙每次更換。', 'The analytical balance sits on an anti-vibration marble table with a draft shield; it is checked daily with standard weights and logged. Close the doors and wait for a stable reading; fresh weighing paper and spatula each time.');
    I('dl-microscope', '生藥顯微鑑別台', 'Pharmacognosy microscopy bench', '解剖顯微鏡看藥材外觀與斷面，光學顯微鏡加攝影機看粉末特徵（澱粉粒、草酸鈣結晶、導管、纖維、石細胞），與藥典描述比對。', 'A stereo microscope for surface and cut features, a compound microscope with camera for powder features (starch, calcium oxalate crystals, vessels, fibres, stone cells), compared with the pharmacopoeia description.');
    I('dl-shelves', '試劑與對照品架', 'Reagents & reference standards', '試劑依相容性分區（酸、鹼、氧化劑、溶劑）；對照品與對照藥材有效期與開封日期要登錄，需冷藏者另放冰箱。', 'Reagents are segregated by compatibility (acids, bases, oxidisers, solvents); reference standards and reference herbs have expiry and opening dates logged; those needing cold storage go to the fridge.');
    I('dl-eyewash', '緊急沖淋與洗眼器', 'Safety shower & eyewash', '化學品噴濺入眼：立即撐開眼瞼持續沖洗，同時呼叫同事與通報；沖身器拉桿一拉即出水。每週測試出水並記錄，通道不可堆物。', 'Chemical splash to the eye: hold the lids open and keep rinsing while a colleague raises the alarm; the shower runs with one pull. Tested and logged weekly; keep the path clear.');
    I('dl-sink', '洗滌槽與玻璃器皿晾架', 'Glassware sink & drying rack', '用過的玻璃器皿先除去殘液、依廢液分類，再刷洗、純水潤洗，倒掛晾乾。破損玻璃放專用收集箱。', 'Used glassware is emptied into the correct waste stream, brushed, rinsed with purified water and hung to dry. Broken glass goes in the dedicated box.');
    I('dl-desk', '收樣與紀錄桌', 'Sample receipt & records desk', '收樣核對品名、批號、數量與包裝完整，貼條碼登錄；原始紀錄用不可擦拭的筆，更正需劃線簽名不可塗改。', 'On receipt check name, batch, quantity and intact packaging, label with a barcode and log it; raw records in indelible ink, corrections struck through and signed, never erased.');
    I('dl-workstation', '實驗室資訊系統（LIMS）', 'Laboratory information system (LIMS)', '每個樣品的檢驗項目、儀器數據、計算與覆核都在 LIMS 追蹤；結果經覆核後才產生檢驗成績書（CoA），不合格依偏差程序處理。', 'Every sample’s tests, instrument data, calculations and review are tracked in LIMS; a certificate of analysis is issued only after second-person review; failures follow the deviation procedure.');
    I('dl-chart', '批次紀錄與 SOP', 'Batch record & SOPs', '依現行版 SOP 操作，每一步即時記錄（儀器編號、試劑批號、時間、操作者），由第二人覆核。', 'Work to the current SOP version and record each step as it happens (instrument ID, reagent lots, time, analyst); a second person reviews.');
    I('dl-whiteboard', '批次進度白板', 'Batch progress board', '每批藥材的檢驗進度：性狀、顯微、TLC、HPLC、水分、灰分；委外項目（重金屬、農藥殘留、黃麴毒素）另列。', 'Progress for each herb batch: macroscopy, microscopy, TLC, HPLC, moisture, ash; outsourced tests (heavy metals, pesticide residues, aflatoxins) listed separately.');

    // ---- island bench (main): extraction, decoction comparison, filtration
    P('bench', [-0.6, 0, -0.9], 0, { name: ['樣品前處理島台', 'Sample-preparation island'], info: 'dl-bench', equip: 'lab' }, (k, S, Q) => {
      const Lb = 3.4, D = 1.5; baseRun(k, Lb, D, { two: true });
      k.box(Lb - 0.3, 0.34, 0.14, 0, TOP + 0.17, 0, C.lam2, 'paint'); // service spine
      [-1.1, -0.35, 0.35, 1.1].forEach((x, i) => [1, -1].forEach(s => { k.cyl(0.011, 0.011, 0.07, x, TOP + 0.24, s * 0.1, C.steel, 'metal', H2, 0, 0, 8); k.box(0.06, 0.014, 0.02, x, TOP + 0.24, s * 0.14, ['#f1c40f', '#2f6fd0', '#2fa36b', '#e74c3c'][i], 'plastic'); k.box(0.09, 0.06, 0.008, x + 0.14, TOP + 0.12, s * 0.072, C.white, 'plastic'); }));
      [-1.55, 0, 1.55].forEach(x => k.box(0.03, 0.5, 0.3, x, TOP + 0.6, 0, C.steel2, 'metal')); [1.34, 1.66].forEach(y => k.box(Lb - 0.18, 0.024, 0.3, 0, y, 0, '#dfe4e6', 'paint'));
      for (let i = 0; i < 12; i++) { const x = -1.45 + i * 0.26, z = (i % 2 ? 0.07 : -0.07); if (i % 3 === 2) bottle(k, x, 1.352, z, 0.04, 0.16, '#f2f6f8', 'solid', '#2f6fd0'); else amber(k, x, 1.352, z); if (i % 3 === 0) amber(k, x + 0.08, 1.672, -z, 0.9); else if (i % 3 === 1) k.box(0.14, 0.09, 0.1, x + 0.08, 1.717, 0, '#f4f6f8', 'paint'); }
      [-1.42, 1.42].forEach(x => { k.box(0.32, 0.006, 0.34, x, TOP + 0.002, 0.42, '#151b1f', 'plastic'); k.tube([[x, TOP + 0.34, 0.08], [x, TOP + 0.52, 0.16], [x, TOP + 0.4, 0.34]], 0.012, C.steel, 'metal', 14, 6); });
      // reflux extraction: heating mantle, round-bottom flask, Allihn condenser on a retort stand
      k.box(0.2, 0.012, 0.28, -0.72, TOP + 0.006, 0.42, C.ink, 'paint'); k.cyl(0.008, 0.008, 0.82, -0.72, TOP + 0.41, 0.3, C.steel, 'metal', 0, 0, 0, 8);
      k.cyl(0.11, 0.1, 0.12, -0.92, TOP + 0.06, 0.42, '#4a5359', 'paint', 0, 0, 0, 16); k.sph(0.075, 0.075, 0.075, -0.92, TOP + 0.17, 0.42, C.glass, 'glass', 12); k.sph(0.062, 0.05, 0.062, -0.92, TOP + 0.155, 0.42, '#8a5a2b', 'fluid', 10);
      k.cyl(0.032, 0.032, 0.42, -0.92, TOP + 0.48, 0.42, C.glass, 'glass', 0, 0, 0, 10); k.cyl(0.012, 0.012, 0.46, -0.92, TOP + 0.48, 0.42, '#bfe3f0', 'glass', 0, 0, 0, 8); k.box(0.2, 0.025, 0.03, -0.82, TOP + 0.5, 0.42, C.grey, 'satin');
      k.tube([[-0.92, TOP + 0.3, 0.45], [-0.8, TOP + 0.26, 0.6], [-0.6, TOP + 0.04, 0.62]], 0.008, '#3d8fd1', 'rubber', 16, 5); k.tube([[-0.92, TOP + 0.66, 0.45], [-0.7, TOP + 0.6, 0.55], [-0.5, TOP + 0.28, 0.12]], 0.008, '#3d8fd1', 'rubber', 16, 5);
      // traditional decoction pot (砂鍋) on a hot plate, beakers of decoction, filtration
      k.rbox(0.26, 0.08, 0.26, 0.02, -0.15, TOP + 0.04, 0.42, C.white, 'paint'); k.cyl(0.02, 0.02, 0.012, -0.05, TOP + 0.05, 0.555, C.ink, 'plastic', H2, 0, 0, 10);
      k.lathe([[0.001, 0], [0.085, 0], [0.115, 0.05], [0.12, 0.11], [0.1, 0.15], [0.105, 0.16]], -0.15, TOP + 0.08, 0.42, '#6e3b22', 'paint', 18); k.lathe([[0.001, 0.035], [0.1, 0.0], [0.105, 0.01]], -0.15, TOP + 0.23, 0.42, '#5c311c', 'paint', 16); k.sph(0.018, 0.014, 0.018, -0.15, TOP + 0.27, 0.42, '#5c311c', 'paint', 8); k.seg([-0.04, TOP + 0.18, 0.42], [0.08, TOP + 0.2, 0.42], 0.016, 0.012, '#5c311c', 'paint', 8);
      beaker(k, 0.22, TOP, 0.48, 0.05, 0.12, '#6b3d1e'); beaker(k, 0.36, TOP, 0.36, 0.04, 0.1, '#8a5a2b'); flask(k, 0.62, TOP, 0.42, 0.06, '#b07a40'); k.lathe([[0.008, 0], [0.012, 0.04], [0.06, 0.1], [0.065, 0.11]], 0.62, TOP + 0.13, 0.42, C.glass, 'glass', 12); k.cyl(0.055, 0.004, 0.06, 0.62, TOP + 0.21, 0.42, '#f4efe2', 'matte', 0, 0, 0, 10);
      k.cyl(0.022, 0.026, 0.26, 0.86, TOP + 0.13, 0.5, C.glass, 'glass', 0, 0, 0, 10); k.cyl(0.02, 0.02, 0.12, 0.86, TOP + 0.07, 0.5, '#c79a5e', 'fluid', 0, 0, 0, 10); bottle(k, 1.02, TOP, 0.38, 0.035, 0.16, '#f2f6f8', 'solid', '#e74c3c');
      // back side: ultrasonic bath, stirrer, pH meter, tube racks
      k.rbox(0.34, 0.15, 0.26, 0.015, -0.6, TOP + 0.075, -0.42, C.steel, 'metal'); k.box(0.28, 0.01, 0.2, -0.6, TOP + 0.152, -0.42, '#9fc6d6', 'fluid'); k.box(0.08, 0.03, 0.01, -0.6, TOP + 0.08, -0.555, C.led, 'glow');
      k.rbox(0.18, 0.06, 0.2, 0.015, 0.25, TOP + 0.03, -0.42, C.white, 'paint'); beaker(k, 0.25, TOP + 0.06, -0.42, 0.045, 0.1, '#e8d8b0');
      k.rbox(0.16, 0.06, 0.2, 0.015, 0.75, TOP + 0.03, -0.44, C.white, 'paint'); k.box(0.1, 0.035, 0.005, 0.75, TOP + 0.05, -0.542, '#4dd2ff', 'glow'); k.cyl(0.006, 0.006, 0.36, 0.86, TOP + 0.18, -0.42, C.grey, 'satin', 0, 0, 0, 6); k.cyl(0.008, 0.008, 0.16, 0.92, TOP + 0.22, -0.42, '#e8f3f6', 'glass', 0, 0, 0, 6);
      k.rbox(0.24, 0.05, 0.1, 0.01, 1.1, TOP + 0.025, -0.4, '#5fa8e0', 'plastic'); for (let i = 0; i < 6; i++) k.cyl(0.008, 0.008, 0.1, 1.0 + i * 0.04, TOP + 0.07, -0.4, '#f2f6f8', 'glass', 0, 0, 0, 6);
      stool(k, 0.2, 1.0); stool(k, -0.9, -1.0);
      Q.push({ p: [0, TOP + 0.26, 0.071], w: 0.34, h: 0.17, uv: L.tag('前處理・萃取', 'Sample prep & extraction') }); Q.push({ p: [-0.15, TOP + 0.2, 0.63], w: 0.2, h: 0.1, ry: 0, uv: L.tag('煎煮對照', 'Decoction ref.', { band: '#8a5a2b' }) }); Q.push({ p: [0, TOP + 0.26, -0.071], w: 0.34, h: 0.17, ry: PI, uv: L.tag('超音波・定容', 'Sonication & volume') });
    });
    // ---- fume hood (back-left corner)
    P('hood', [-4.62, 0, -4.05], 0, { name: ['化學排氣櫃', 'Chemical fume hood'], info: 'dl-hood', equip: 'lab' }, (k, S, Q) => {
      const w = 1.5, d = 0.86; k.rbox(w, 0.86, d - 0.04, 0.01, 0, 0.43, 0, '#f2c230', 'paint'); [-0.36, 0.36].forEach(x => { k.box(0.7, 0.72, 0.012, x, 0.44, d / 2 - 0.02, '#f5cf45', 'paint'); k.box(0.02, 0.14, 0.02, x + (x < 0 ? 0.3 : -0.3), 0.62, d / 2, C.ink, 'plastic'); });
      k.box(w, 0.04, d, 0, 0.9, 0, '#3a454d', 'plastic'); k.box(w, 1.55, 0.04, 0, 1.68, -d / 2 + 0.02, C.lam, 'paint'); [-1, 1].forEach(s => k.box(0.08, 1.55, d, s * (w / 2 - 0.04), 1.68, 0, C.lam, 'paint')); k.box(w, 0.42, d, 0, 2.67, 0, C.lam, 'paint');
      k.box(w - 0.18, 0.62, 0.02, 0, 1.38, d / 2 - 0.02, '#cfe6f0', 'glass'); k.box(w - 0.18, 0.05, 0.05, 0, 1.06, d / 2 - 0.01, C.steel2, 'satin'); k.box(w - 0.16, 0.035, 0.08, 0, 0.94, d / 2, C.steel, 'metal');
      k.box(w - 0.22, 0.025, 0.25, 0, 2.43, -0.15, '#ffffff', 'glow'); k.box(w - 0.18, 1.1, 0.012, 0, 1.55, -d / 2 + 0.06, '#e3e7e8', 'paint'); k.cyl(0.13, 0.13, 0.36, 0, 3.02, -0.1, C.steel2, 'metal', 0, 0, 0, 14);
      k.rbox(0.07, 0.16, 0.03, 0.01, w / 2 - 0.04, 1.6, d / 2 + 0.01, C.ink, 'plastic'); k.box(0.04, 0.02, 0.005, w / 2 - 0.04, 1.64, d / 2 + 0.027, C.led, 'glow'); k.box(0.04, 0.02, 0.005, w / 2 - 0.04, 1.58, d / 2 + 0.027, '#3a4a40', 'plastic');
      [-0.45, -0.32, -0.2].forEach((x, i) => bottle(k, x, 0.92, -0.15, 0.045, 0.24, ['#f2f6f8', '#7a4a1c', '#f2f6f8'][i], i === 1 ? '#5a3010' : 'solid', ['#e74c3c', C.ink, '#2f6fd0'][i]));
      k.cyl(0.008, 0.008, 0.7, 0.3, 1.27, -0.2, C.steel, 'metal', 0, 0, 0, 6); k.box(0.16, 0.012, 0.22, 0.3, 0.93, -0.2, C.ink, 'paint'); k.lathe([[0.004, 0], [0.01, 0.06], [0.06, 0.16], [0.05, 0.22], [0.012, 0.25]], 0.36, 1.12, -0.18, C.glass, 'glass', 12); beaker(k, 0.36, 0.92, -0.18, 0.05, 0.1, '#c9b27a');
      Q.push({ p: [0, 0.74, d / 2 - 0.006], w: 0.26, h: 0.13, uv: L.tag('易燃品', 'FLAMMABLE', { band: '#c0392b', bg: '#fff3c4' }) }); Q.push({ p: [0, 2.67, d / 2 + 0.002], w: 0.5, h: 0.25, uv: L.tag('化學排氣櫃', 'Fume hood · sash ≤ mark') });
    });
    // ---- back wall bench: HPLC | TLC | rotary evaporator (three clickable sections of one run)
    P('hplc', [-2.82, 0, -4.12], 0, { name: ['高效液相層析儀（HPLC）', 'HPLC system'], info: 'dl-hplc', equip: 'analyser' }, (k, S, Q) => {
      baseRun(k, 1.6, 0.75); k.box(1.6, 0.24, 0.025, 0, TOP + 0.12, -0.36, C.lam2, 'paint');
      const sx = -0.36, sz = -0.08, mw = 0.37, md = 0.46; let y = TOP;
      [['pump', 0.17], ['as', 0.3], ['tcc', 0.17], ['det', 0.15]].forEach(([n, h]) => { k.rbox(mw, h - 0.006, md, 0.012, sx, y + h / 2, sz, '#e8ebec', 'paint'); k.box(mw - 0.02, 0.014, 0.004, sx, y + h - 0.03, sz + md / 2 + 0.001, '#3b4a55', 'plastic'); k.box(0.012, 0.012, 0.004, sx + mw / 2 - 0.035, y + 0.03, sz + md / 2 + 0.002, C.led, 'glow');
        if (n === 'as') { k.box(0.25, 0.17, 0.006, sx - 0.03, y + 0.14, sz + md / 2 + 0.002, '#9fc6d6', 'glass'); for (let i = 0; i < 8; i++) k.cyl(0.008, 0.008, 0.035, sx - 0.13 + i * 0.028, y + 0.08, sz + 0.12, i % 3 ? '#f4efe2' : '#c79a5e', 'paint', 0, 0, 0, 6); }
        if (n === 'pump') k.cyl(0.018, 0.018, 0.02, sx - 0.1, y + 0.08, sz + md / 2 + 0.01, C.ink, 'plastic', H2, 0, 0, 10);
        y += h; });
      k.rbox(mw, 0.05, md, 0.01, sx, y + 0.025, sz, '#dfe3e4', 'paint'); y += 0.05;
      [-0.12, -0.04, 0.04, 0.12].forEach((dx, i) => { k.cyl(0.034, 0.034, 0.18, sx + dx, y + 0.09, sz - 0.06, '#e6f2f6', 'glass', 0, 0, 0, 10); k.cyl(0.031, 0.031, 0.12, sx + dx, y + 0.06, sz - 0.06, ['#d7ecf5', '#f2e8d0', '#d7ecf5', '#ececec'][i], 'fluid', 0, 0, 0, 10); k.cyl(0.017, 0.019, 0.03, sx + dx, y + 0.195, sz - 0.06, ['#2f6fd0', '#f1c40f', '#e74c3c', C.ink][i], 'plastic', 0, 0, 0, 8); });
      k.tube([[sx - 0.12, y + 0.21, sz - 0.06], [sx - 0.17, y + 0.26, sz + 0.06], [sx - mw / 2 - 0.02, y - 0.3, sz + 0.12], [sx - mw / 2 - 0.02, TOP + 0.12, sz + 0.12]], 0.004, '#f2f4f5', 'plastic', 24, 4);
      monitor(k, S, 0.32, TOP, -0.12, 0.54, 0.32, chromCanvas(c), 0, 0.95); keyboard(k, 0.3, TOP, 0.18); k.rbox(0.13, 0.22, 0.13, 0.02, 0.68, TOP + 0.11, -0.18, '#f2f2f2', 'paint'); k.cyl(0.03, 0.03, 0.03, 0.68, TOP + 0.235, -0.18, '#f1c40f', 'plastic', 0, 0, 0, 10);
      Q.push({ p: [sx, TOP + 0.085, sz + md / 2 + 0.006], w: 0.15, h: 0.075, uv: L.tag('HPLC', 'LC-01 · QC') }); Q.push({ p: [0.68, TOP + 0.12, -0.114], w: 0.11, h: 0.055, uv: L.tag('廢液', 'Waste', { band: '#c0392b' }) });
    });
    P('tlc', [-1.22, 0, -4.12], 0, { name: ['薄層層析與 UV 觀察箱', 'TLC & UV viewing cabinet'], info: 'dl-tlc', equip: 'lightbox' }, (k, S, Q) => {
      baseRun(k, 1.6, 0.75); k.box(1.6, 0.24, 0.025, 0, TOP + 0.12, -0.36, C.lam2, 'paint');
      k.rbox(0.54, 0.44, 0.42, 0.015, -0.35, TOP + 0.22, -0.08, '#2a3036', 'paint'); k.box(0.42, 0.12, 0.01, -0.35, TOP + 0.36, 0.14, '#3a2f6a', 'glass', -0.5, 0, 0); k.box(0.46, 0.14, 0.02, -0.35, TOP + 0.07, 0.125, '#0e0b1c', 'plastic');
      k.box(0.34, 0.016, 0.02, -0.35, TOP + 0.4, 0.0, '#9b7bff', 'glow'); [-0.48, -0.42].forEach((x, i) => k.box(0.04, 0.025, 0.006, x, TOP + 0.27, 0.215, i ? '#9b7bff' : '#6fd0ff', 'glow'));
      S(0.14, 0.14, tlcCanvas(c), -0.33, TOP + 0.012, -0.02, 0, 1.2, -H2);
      k.box(0.24, 0.2, 0.11, 0.12, TOP + 0.1, -0.1, '#e4f2f7', 'glass'); k.box(0.22, 0.02, 0.1, 0.12, TOP + 0.012, -0.1, '#e8dcb0', 'fluid'); k.box(0.26, 0.012, 0.13, 0.12, TOP + 0.206, -0.1, '#cfe8f0', 'glass'); k.box(0.1, 0.17, 0.003, 0.1, TOP + 0.1, -0.1, '#f7f7f2', 'paint', 0, 0, 0.12);
      k.rbox(0.32, 0.03, 0.22, 0.008, 0.48, TOP + 0.015, 0.0, C.steel, 'metal'); k.box(0.1, 0.002, 0.1, 0.44, TOP + 0.031, 0.0, '#f7f7f2', 'paint'); bottle(k, 0.62, TOP, 0.18, 0.03, 0.14, '#f2f6f8', 'solid', '#2fa36b');
      for (let i = 0; i < 6; i++) k.cyl(0.0025, 0.0025, 0.09, 0.2 + i * 0.012, TOP + 0.045, 0.2, '#f0f6f8', 'glass', 0, 0, 0, 4);
      Q.push({ p: [-0.35, TOP + 0.47, 0.135], w: 0.2, h: 0.1, uv: L.tag('UV 勿直視', '254 / 365 nm', { band: '#6b4bd8' }) });
    });
    let rotSpin = null;
    P('rotavap', [0.38, 0, -4.12], 0, { name: ['旋轉濃縮儀與恆溫水浴', 'Rotary evaporator & water bath'], info: 'dl-rotavap', equip: 'device' }, (k, S, Q, g) => {
      baseRun(k, 1.6, 0.75); k.box(1.6, 0.24, 0.025, 0, TOP + 0.12, -0.36, C.lam2, 'paint');
      const bx = -0.2; k.rbox(0.3, 0.1, 0.3, 0.02, bx - 0.12, TOP + 0.05, -0.08, C.white, 'paint'); k.cyl(0.022, 0.022, 0.62, bx - 0.24, TOP + 0.41, -0.14, C.steel2, 'metal', 0, 0, 0, 10);
      k.rbox(0.14, 0.12, 0.14, 0.02, bx - 0.18, TOP + 0.52, -0.06, C.white, 'paint', 0, 0, -0.35); k.cyl(0.15, 0.15, 0.12, bx + 0.12, TOP + 0.06, 0.02, C.steel, 'metal', 0, 0, 0, 18); k.cyl(0.14, 0.14, 0.004, bx + 0.12, TOP + 0.112, 0.02, '#8fc4d8', 'fluid', 0, 0, 0, 18);
      k.sph(0.085, 0.085, 0.085, bx + 0.1, TOP + 0.19, 0.02, C.glass, 'glass', 12); k.sph(0.07, 0.04, 0.07, bx + 0.1, TOP + 0.15, 0.02, '#a8743a', 'fluid', 10); k.seg([bx + 0.04, TOP + 0.25, 0.02], [bx - 0.14, TOP + 0.47, -0.04], 0.018, 0.018, C.glass, 'glass', 8);
      k.cyl(0.045, 0.045, 0.42, bx - 0.16, TOP + 0.8, -0.06, C.glass, 'glass', 0, 0, 0, 12); const hel = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * PI * 12; hel.push([bx - 0.16 + Math.cos(a) * 0.028, TOP + 0.62 + i / 40 * 0.36, -0.06 + Math.sin(a) * 0.028]); } k.tube(hel, 0.004, '#bfe3f0', 'glass', 64, 3);
      k.sph(0.06, 0.06, 0.06, bx - 0.3, TOP + 0.3, 0.08, C.glass, 'glass', 10); k.sph(0.05, 0.03, 0.05, bx - 0.3, TOP + 0.27, 0.08, '#e9f2f4', 'fluid', 8); k.seg([bx - 0.2, TOP + 0.47, -0.04], [bx - 0.3, TOP + 0.36, 0.08], 0.012, 0.012, C.glass, 'glass', 6);
      k.tube([[bx - 0.16, TOP + 0.98, -0.06], [bx - 0.3, TOP + 1.02, -0.2], [0.24, TOP + 0.1, -0.22]], 0.008, '#3d8fd1', 'rubber', 18, 5); k.rbox(0.2, 0.16, 0.2, 0.015, 0.25, TOP + 0.08, -0.18, '#d9dfe2', 'paint'); k.box(0.06, 0.02, 0.005, 0.25, TOP + 0.13, -0.078, C.led, 'glow');
      k.rbox(0.44, 0.2, 0.3, 0.015, 0.52, TOP + 0.1, 0.02, C.steel, 'metal'); k.box(0.4, 0.008, 0.26, 0.52, TOP + 0.204, 0.02, C.steel2, 'metal'); for (let i = 0; i < 5; i++) k.cyl(0.013, 0.013, 0.12, 0.38 + i * 0.07, TOP + 0.24, 0.02, '#f0f6f8', 'glass', 0, 0, 0, 6); k.box(0.12, 0.03, 0.005, 0.52, TOP + 0.12, 0.172, '#ff5a3c', 'glow');
      // the Keck clip and a label band turn with the flask (idle animation)
      const sk = c.makeKit(c.K); sk.box(0.05, 0.03, 0.03, 0, 0.022, 0, '#f2c230', 'plastic'); sk.box(0.03, 0.008, 0.04, -0.1, 0.08, 0, '#ffffff', 'paint'); const spin = sk.build({ shadow: false });
      const pivot = new c.THREE.Group(); const dx = (bx - 0.14) - (bx + 0.1), dy = 0.28; pivot.position.set(bx + 0.1 + dx * 0.36, TOP + 0.19 + dy * 0.36, 0.0); pivot.rotation.z = Math.atan2(dy, dx); pivot.add(spin); g.add(pivot); rotSpin = spin;
      Q.push({ p: [0.52, TOP + 0.06, 0.174], w: 0.16, h: 0.08, uv: L.tag('水浴', 'Water bath', { band: '#2f8fbf' }) });
    });
    if (rotSpin) L.anim(L.firstMesh(rotSpin), t => { rotSpin.rotation.x = t * 1.6; }), (c.objs.rotavap.userData.spin = rotSpin);
    // ---- herb sample rack under the window
    P('samples', [3.2, 0, -4.22], 0, { name: ['待驗藥材樣品架', 'Herb sample rack'], info: 'dl-samples', equip: 'cart' }, (k, S, Q) => {
      wireShelf(k, 2.6, 0.42, [0.14, 0.56, 1.0], 1.04);
      HERBS.forEach(([zh, la], i) => { const row = i < 6 ? 1.012 : 0.572, x = -1.05 + (i % 6) * 0.42, col = ['#c9a46c', '#d3b07a', '#bf9860', '#cdaa72'][i % 4]; k.rbox(0.2, 0.25, 0.08, 0.02, x, row + 0.125, 0.02, col, 'matte'); k.box(0.2, 0.04, 0.05, x, row + 0.255, 0.02, '#a9844e', 'matte'); Q.push({ p: [x, row + 0.12, 0.062], w: 0.16, h: 0.08, uv: L.tag(zh, la, { band: '#7a5a2a' }) }); });
      for (let i = 0; i < 5; i++) { const x = -1.0 + i * 0.5; k.box(0.42, 0.18, 0.36, x, 0.24, 0, '#e3e9ec', 'paint'); Q.push({ p: [x, 0.25, 0.181], w: 0.16, h: 0.08, uv: L.tag(say('留樣 ', 'Retain ') + (i + 1), 'HQ-26' + (11 + i)) }); }
    });
    // ---- right wall: drying oven + muffle furnace, mill + sieves, balance room
    P('oven', [5.12, 0, -2.6], -H2, { name: ['乾燥箱、高溫爐與乾燥器', 'Drying oven, furnace & desiccator'], info: 'dl-oven', equip: 'lab' }, (k, S, Q) => {
      legTable(k, 1.6, 0.66, 0.76, C.ss, 'paint'); k.box(1.5, 0.02, 0.56, 0, 0.17, 0, C.ss, 'paint');
      k.rbox(0.62, 0.64, 0.56, 0.02, -0.45, 1.08, -0.02, '#eef0f0', 'paint'); k.box(0.52, 0.5, 0.02, -0.47, 1.05, 0.27, '#f6f7f7', 'paint'); k.box(0.03, 0.22, 0.03, -0.24, 1.05, 0.3, C.grey, 'satin'); k.box(0.56, 0.08, 0.01, -0.45, 1.34, 0.265, C.ink, 'plastic'); k.box(0.12, 0.035, 0.005, -0.55, 1.34, 0.272, '#ff5a3c', 'glow'); k.cyl(0.02, 0.02, 0.07, -0.3, 1.43, -0.1, C.steel2, 'metal', 0, 0, 0, 8);
      k.rbox(0.46, 0.5, 0.46, 0.02, 0.2, 1.01, -0.04, '#d8dcdc', 'paint'); k.box(0.3, 0.3, 0.02, 0.18, 0.98, 0.2, '#3a3f44', 'paint'); k.box(0.3, 0.012, 0.005, 0.18, 1.14, 0.212, '#ff7a2a', 'glow'); k.rbox(0.12, 0.2, 0.08, 0.01, 0.38, 1.15, 0.2, C.ink, 'plastic'); k.box(0.07, 0.03, 0.004, 0.38, 1.2, 0.242, '#ff5a3c', 'glow');
      k.lathe([[0.001, 0], [0.11, 0], [0.13, 0.08], [0.12, 0.2], [0.13, 0.21]], 0.6, 0.76, 0, C.glass, 'glass', 16); k.lathe([[0.001, 0.07], [0.13, 0.0], [0.135, 0.01]], 0.6, 0.97, 0, '#cfe8f0', 'glass', 16); k.sph(0.022, 0.018, 0.022, 0.6, 1.05, 0, '#cfe8f0', 'glass', 8); k.disc(0.1, 0.6, 0.84, 0, '#f2f4f2', 'paint', -H2, 0, 0, 16);
      [[0.56, 0.86], [0.64, 0.86]].forEach(([x, y]) => k.lathe([[0.001, 0], [0.018, 0], [0.026, 0.035]], x, y, 0.02, '#f4f4f0', 'paint', 10)); [[0.0, 0.25], [0.08, 0.27]].forEach(([x, z]) => k.lathe([[0.001, 0], [0.02, 0], [0.03, 0.04]], x, 0.76, z, '#f4f4f0', 'paint', 10));
      Q.push({ p: [-0.45, 1.25, 0.282], w: 0.2, h: 0.1, uv: L.tag('水分', 'Loss on drying') }); Q.push({ p: [0.18, 1.2, 0.214], w: 0.18, h: 0.09, uv: L.tag('灰分', 'Total ash', { band: '#c0392b' }) });
    });
    P('grinder', [5.12, 0, -0.85], -H2, { name: ['藥材粉碎機與標準篩', 'Herb mill & test sieves'], info: 'dl-grinder', equip: 'lab' }, (k, S, Q) => {
      k.rbox(1.3, 0.74, 0.62, 0.015, 0, 0.37, 0, C.ss, 'paint'); k.rbox(1.32, 0.03, 0.64, 0.008, 0, 0.755, 0, '#dfe5e8', 'paint'); [-0.33, 0.33].forEach(x => { k.box(0.6, 0.6, 0.01, x, 0.37, 0.31, '#e3e8ea', 'paint'); k.box(0.12, 0.016, 0.02, x, 0.62, 0.32, C.grey, 'satin'); });
      k.rbox(0.3, 0.2, 0.3, 0.02, -0.34, 0.87, 0, '#dfe5e8', 'paint'); k.cyl(0.13, 0.13, 0.26, -0.34, 1.1, 0, '#d0d7da', 'paint', 0, 0, 0, 18); k.lathe([[0.001, 0.08], [0.1, 0.07], [0.14, 0.0]], -0.34, 1.23, 0, '#e2e8eb', 'paint', 18); [-1, 1].forEach(s => k.box(0.03, 0.12, 0.05, -0.34 + s * 0.15, 1.2, 0, C.steel2, 'paint')); k.box(0.26, 0.012, 0.012, -0.34, 1.14, 0.131, '#b8c1c6', 'paint'); k.box(0.06, 0.04, 0.02, -0.34, 0.86, 0.155, '#c0392b', 'plastic');
      k.rbox(0.38, 0.13, 0.38, 0.02, 0.36, 0.83, 0, '#4a5359', 'paint'); k.box(0.12, 0.04, 0.005, 0.36, 0.85, 0.192, C.led, 'glow'); for (let i = 0; i < 5; i++) { k.cyl(0.12, 0.12, 0.052, 0.36, 0.925 + i * 0.054, 0, i % 2 ? '#d6dcdf' : '#e6ebed', 'paint', 0, 0, 0, 20); k.cyl(0.122, 0.122, 0.008, 0.36, 0.952 + i * 0.054, 0, '#c9a55a', 'paint', 0, 0, 0, 20); } k.cyl(0.125, 0.125, 0.02, 0.36, 1.2, 0, '#c3ccd1', 'paint', 0, 0, 0, 20); [-1, 1].forEach(s => k.cyl(0.008, 0.008, 0.42, 0.36 + s * 0.15, 1.0, 0, C.steel2, 'paint', 0, 0, 0, 6)); k.box(0.34, 0.02, 0.02, 0.36, 1.22, 0, C.steel2, 'paint');
      k.box(0.24, 0.03, 0.18, 0.0, 0.785, 0.12, '#c3ccd1', 'paint'); k.box(0.21, 0.012, 0.15, 0.0, 0.8, 0.12, '#a87b4a', 'matte');
      Q.push({ p: [0, 0.6, 0.316], w: 0.24, h: 0.12, uv: L.tag('粉碎・過篩', 'Milling & sieving') });
    });
    L.decor((k, Q) => { // balance-room glass partitions (dust from the mill stays out)
      k.box(1.5, 0.3, 0.05, 4.75, 0.15, -0.15, C.lam, 'paint'); k.box(1.5, 1.8, 0.014, 4.75, 1.2, -0.15, '#cfe6f0', 'glass'); k.box(1.5, 0.05, 0.06, 4.75, 2.12, -0.15, '#c3ccd1', 'paint'); k.box(0.05, 2.15, 0.06, 4.0, 1.07, -0.15, '#c3ccd1', 'paint');
      k.box(0.05, 0.3, 0.62, 4.0, 0.15, 0.17, C.lam, 'paint'); k.box(0.014, 1.8, 0.62, 4.0, 1.2, 0.17, '#cfe6f0', 'glass'); k.box(0.06, 0.05, 0.62, 4.0, 2.12, 0.17, '#c3ccd1', 'paint'); k.box(0.05, 2.15, 0.06, 4.0, 1.07, 0.48, '#c3ccd1', 'paint');
      Q.push({ p: [4.75, 1.85, -0.12], w: 0.42, h: 0.21, uv: L.tag('天平室', 'Balance room') }); Q.push({ p: [4.75, 1.85, -0.18], w: 0.42, h: 0.21, ry: PI, uv: L.tag('天平室', 'Balance room') });
    });
    P('scale', [5.12, 0, 0.78], -H2, { name: ['天平室：分析天平', 'Balance room: analytical balance'], info: 'dl-scale', equip: 'lab' }, (k, S, Q) => {
      [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]].forEach(([x, z]) => k.box(0.06, 0.74, 0.06, x, 0.37, z, '#5a646b', 'paint')); k.box(0.9, 0.05, 0.5, 0, 0.7, 0, '#5a646b', 'paint'); k.rbox(1.0, 0.07, 0.6, 0.01, 0, 0.775, 0, '#e8e5de', 'paint');
      k.rbox(0.24, 0.09, 0.36, 0.015, -0.15, 0.855, 0, '#f4f4f2', 'paint'); k.box(0.21, 0.22, 0.22, -0.15, 1.0, -0.03, '#d8eef6', 'glass'); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => k.box(0.012, 0.22, 0.012, -0.15 + a * 0.105, 1.0, -0.03 + b * 0.11, '#c3ccd1', 'paint')); k.box(0.22, 0.014, 0.23, -0.15, 1.115, -0.03, '#c3ccd1', 'paint');
      k.disc(0.045, -0.15, 0.905, -0.03, C.steel, 'metal', -H2, 0, 0, 16); k.box(0.12, 0.03, 0.005, -0.15, 0.86, 0.183, '#7dffb0', 'glow'); k.rbox(0.2, 0.08, 0.26, 0.015, 0.28, 0.85, 0.02, '#f4f4f2', 'paint'); k.disc(0.08, 0.28, 0.892, 0.0, C.steel, 'metal', -H2, 0, 0, 18); k.box(0.08, 0.025, 0.004, 0.28, 0.855, 0.152, '#7dffb0', 'glow');
      k.box(0.1, 0.002, 0.1, 0.05, 0.811, 0.18, '#ffffff', 'paint'); k.box(0.14, 0.004, 0.012, 0.08, 0.814, 0.22, C.steel, 'metal', 0, 0.4, 0); k.cyl(0.018, 0.018, 0.04, -0.0, 0.83, 0.2, C.glass, 'glass', 0, 0, 0, 8); k.rbox(0.14, 0.05, 0.09, 0.01, 0.38, 0.835, -0.2, '#7a4a28', 'paint');
      Q.push({ p: [0.0, 0.775, 0.302], w: 0.22, h: 0.06, uv: L.tag(say('每日校正 ✓', 'Daily check ✓'), '', { band: '#2fa36b', size: 22 }) });
    });
    // ---- left wall: reagent shelves, microscopy bench, safety shower
    P('shelves', [-5.25, 0, -2.0], H2, { name: ['試劑與對照品架', 'Reagents & reference standards'], info: 'dl-shelves', equip: 'cart' }, (k, S, Q) => {
      wireShelf(k, 1.6, 0.44, [0.12, 0.52, 0.92, 1.32, 1.72], 1.9);
      for (let i = 0; i < 9; i++) { amber(k, -0.7 + i * 0.17, 1.33, 0.04, 1.1); bottle(k, -0.7 + i * 0.17, 0.93, 0.0, 0.045, 0.2, i % 2 ? '#f2f6f8' : '#e9eef0', 'solid', ['#2f6fd0', '#e74c3c', '#2fa36b'][i % 3]); }
      for (let i = 0; i < 7; i++) { k.box(0.18, 0.1, 0.12, -0.62 + i * 0.21, 1.785, 0.02, ['#f4f6f8', '#e8eef2', '#fff7e0'][i % 3], 'paint'); } for (let i = 0; i < 4; i++) k.box(0.34, 0.26, 0.34, -0.56 + i * 0.37, 0.26, 0, '#dfe5e8', 'paint'); for (let i = 0; i < 5; i++) bottle(k, -0.6 + i * 0.3, 0.53, 0.0, 0.07, 0.26, '#f2f6f8', 'solid', '#2b3036');
      [['酸', 'Acids', '#c0392b', 0.98], ['鹼', 'Bases', '#2f6fd0', 0.58], ['對照品', 'Ref. standards', '#7a5a2a', 1.78], ['溶劑→排氣櫃', 'Solvents → hood', '#d68a00', 1.38]].forEach(([zh, en, band, y], i) => Q.push({ p: [-0.55 + (i % 2) * 1.1, y - 0.03, 0.235], w: 0.2, h: 0.1, uv: L.tag(zh, en, { band }) }));
    });
    P('microscope', [-5.12, 0, 0.15], H2, { name: ['生藥顯微鑑別台', 'Pharmacognosy microscopy bench'], info: 'dl-microscope', equip: 'microscope' }, (k, S, Q) => {
      legTable(k, 1.8, 0.75, TOP, C.lam2); k.rbox(0.45, 0.6, 0.66, 0.01, 0.62, 0.32, 0, C.lam, 'paint'); for (let j = 0; j < 3; j++) { k.box(0.42, 0.17, 0.01, 0.62, 0.15 + j * 0.2, 0.336, C.door, 'paint'); k.box(0.12, 0.016, 0.02, 0.62, 0.2 + j * 0.2, 0.345, C.grey, 'satin'); }
      k.rbox(0.22, 0.03, 0.26, 0.01, -0.52, TOP + 0.015, -0.05, C.ink, 'paint'); k.cyl(0.02, 0.02, 0.32, -0.52, TOP + 0.18, -0.15, C.ink, 'paint', 0, 0, 0, 8); k.rbox(0.12, 0.1, 0.14, 0.02, -0.52, TOP + 0.3, -0.06, C.white, 'paint'); [-0.025, 0.025].forEach(x => k.cyl(0.013, 0.013, 0.1, -0.52 + x, TOP + 0.38, 0.0, C.ink, 'plastic', -0.7, 0, 0, 8)); k.tor(0.045, 0.008, -0.52, TOP + 0.23, -0.04, '#fffbe6', 'glow', H2, 0, 0, PI * 2, 10); k.disc(0.04, -0.52, TOP + 0.032, -0.04, '#c9a46c', 'matte', -H2, 0, 0, 12);
      const mx = -0.05; k.rbox(0.18, 0.03, 0.26, 0.01, mx, TOP + 0.015, -0.02, '#e9ecec', 'paint'); k.seg([mx, TOP + 0.03, -0.12], [mx, TOP + 0.3, -0.1], 0.03, 0.025, '#e9ecec', 'paint'); k.flat([mx, TOP + 0.3, -0.1], [mx, TOP + 0.36, 0.03], 0.045, 0.045, '#e9ecec', 'paint'); k.box(0.14, 0.01, 0.12, mx, TOP + 0.18, 0, C.ink, 'satin'); k.disc(0.028, mx, TOP + 0.17, 0, '#fffbe6', 'glow', -H2, 0, 0, 12);
      [-0.028, 0.028].forEach(x => k.cyl(0.011, 0.011, 0.09, mx + x, TOP + 0.44, 0.09, C.ink, 'plastic', -0.6, 0, 0, 8)); k.rbox(0.06, 0.08, 0.06, 0.01, mx, TOP + 0.45, -0.03, C.ink, 'plastic'); k.tube([[mx, TOP + 0.5, -0.03], [mx + 0.2, TOP + 0.55, -0.2], [0.42, TOP + 0.1, -0.25]], 0.005, C.ink, 'rubber', 16, 4);
      monitor(k, S, 0.5, TOP, -0.15, 0.46, 0.29, powderCanvas(c), -0.25, 0.95);
      ['#2f6fd0', '#c0392b', '#2fa36b'].forEach((col, i) => { k.box(0.2, 0.035, 0.08, -0.8, TOP + 0.018 + i * 0.036, 0.15, col, 'plastic'); }); Q.push({ p: [-0.8, TOP + 0.06, 0.192], w: 0.14, h: 0.07, uv: L.tag('切片盒', 'Slide boxes') });
      [-0.22, -0.17, -0.12].forEach((x, i) => { amber(k, x, TOP, 0.22, 0.55); }); Q.push({ p: [-0.17, TOP + 0.15, 0.3], w: 0.16, h: 0.08, uv: L.tag('顯微試液', 'Mounting reagents', { band: '#7a5a2a' }) });
      stool(k, -0.25, 0.68);
    });
    P('eyewash', [-5.32, 0, 2.05], H2, { name: ['緊急沖淋與洗眼器', 'Safety shower & eyewash'], info: 'dl-eyewash', equip: 'sink' }, (k, S, Q) => {
      k.box(0.9, 0.004, 0.9, 0.0, 0.003, 0.35, '#f1c40f', 'paint'); k.cyl(0.032, 0.032, 2.3, 0, 1.15, 0, '#3fae4a', 'paint', 0, 0, 0, 10); k.cyl(0.12, 0.12, 0.02, 0, 0.01, 0, '#3fae4a', 'paint', 0, 0, 0, 12);
      k.cyl(0.022, 0.022, 0.36, 0, 2.25, 0.18, '#3fae4a', 'paint', H2, 0, 0, 8); k.lathe([[0.001, 0.0], [0.04, 0.0], [0.15, -0.08], [0.15, -0.1]], 0, 2.25, 0.36, '#3fae4a', 'paint', 16); k.disc(0.14, 0, 2.15, 0.36, '#d6dcdf', 'metal', H2, 0, 0, 16);
      k.cyl(0.006, 0.006, 0.5, 0.0, 1.92, 0.36, C.steel, 'metal', 0, 0, 0, 6); k.tube([[0, 1.67, 0.36], [0.08, 1.58, 0.36], [-0.08, 1.58, 0.36], [0, 1.67, 0.36]], 0.008, '#3fae4a', 'plastic', 12, 4);
      k.cyl(0.02, 0.02, 0.3, 0, 1.0, 0.16, '#3fae4a', 'paint', H2, 0, 0, 8); k.lathe([[0.001, -0.04], [0.06, -0.035], [0.14, 0.0], [0.15, 0.02]], 0, 1.0, 0.32, '#3fae4a', 'paint', 16); [-0.05, 0.05].forEach(x => k.cyl(0.015, 0.02, 0.03, x, 1.03, 0.32, '#e8f3f6', 'plastic', 0, 0, 0, 8)); k.box(0.16, 0.12, 0.012, 0.0, 0.9, 0.46, '#3fae4a', 'paint', 0.4, 0, 0);
      Q.push({ p: [0, 1.62, 0.02], w: 0.42, h: 0.21, uv: L.tag('緊急沖淋・洗眼', 'Safety shower · eyewash', { band: '#2f9e44', bg: '#effbe9' }) });
    });
    // ---- front wall: glassware sink, sample-receipt desk, LIMS workstation; batch-record lectern; whiteboard
    P('sink', [-2.4, 0, 4.15], PI, { name: ['洗滌槽與玻璃器皿晾架', 'Glassware sink & drying rack'], info: 'dl-sink', equip: 'sink' }, (k, S, Q) => {
      baseRun(k, 1.5, 0.62, { top: C.steel }); k.box(0.62, 0.012, 0.42, -0.25, TOP + 0.0, 0.0, '#9aa5aa', 'metal'); k.tube([[-0.25, TOP, -0.25], [-0.25, TOP + 0.36, -0.22], [-0.25, TOP + 0.3, -0.04]], 0.013, C.steel, 'metal', 14, 6);
      k.rbox(0.9, 0.7, 0.03, 0.01, 0.15, 1.55, -0.29, '#f2f4f5', 'paint'); for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) { const x = -0.16 + i * 0.15, y = 1.34 + r * 0.2; k.cyl(0.005, 0.005, 0.1, x, y, -0.24, '#dfe5e8', 'plastic', H2 - 0.3, 0, 0, 6); if ((r + i) % 3 !== 2) { if (r % 2) k.lathe([[0.004, 0], [0.012, 0.04], [0.04, 0.09], [0.045, 0.1]], x, y + 0.06, -0.19, C.glass, 'glass', 10, PI, 0, 0); else k.cyl(0.03, 0.03, 0.08, x, y + 0.02, -0.19, C.glass, 'glass', 0, 0, 0, 10); } }
      k.rbox(0.12, 0.22, 0.1, 0.02, 0.6, 1.25, -0.25, C.white, 'plastic'); k.rbox(0.28, 0.3, 0.1, 0.02, -0.6, 1.4, -0.26, C.white, 'plastic'); bottle(k, 0.2, TOP, 0.12, 0.04, 0.18, '#f2f6f8', 'solid', '#2f6fd0');
      Q.push({ p: [-0.6, 1.18, -0.205], w: 0.18, h: 0.09, uv: L.tag('洗手', 'Hand wash', { band: '#2f9e44' }) });
    });
    L.decor((k, Q) => { k.rbox(0.3, 0.6, 0.3, 0.02, -1.48, 0.3, 4.29, '#f4f6f8', 'paint'); k.box(0.31, 0.12, 0.31, -1.48, 0.5, 4.29, '#c0392b', 'paint'); Q.push({ p: [-1.48, 0.32, 4.138], w: 0.2, h: 0.1, ry: PI, uv: L.tag('破損玻璃', 'Broken glass', { band: '#c0392b' }) }); }); // keeps the sink's stand in front of it, not at the door
    P('desk', [-4.25, 0, 3.78], PI, { name: ['收樣與紀錄桌', 'Sample receipt & records desk'], info: 'dl-desk', equip: 'chart' }, (k, S, Q) => {
      legTable(k, 1.4, 0.7, 0.76, '#dfe6e2'); c.chair(k, 0, 0.62, 0, '#3b5063');
      k.box(0.3, 0.012, 0.22, -0.1, 0.766, 0.05, '#f7f5ee', 'paint'); k.box(0.3, 0.012, 0.22, 0.2, 0.768, 0.05, '#f7f5ee', 'paint', 0, 0, -0.02); k.box(0.004, 0.014, 0.22, 0.05, 0.77, 0.05, '#7a5a2a', 'paint'); k.cyl(0.005, 0.005, 0.14, 0.3, 0.775, 0.12, C.ink, 'plastic', 0, 0.8, H2, 6);
      [0, 1].forEach(j => { k.box(0.34, 0.06, 0.26, -0.48, 0.79 + j * 0.07, -0.15, '#cfd6da', 'plastic'); }); [0, 1, 2].forEach(i => k.rbox(0.1, 0.13, 0.04, 0.01, -0.58 + i * 0.1, 0.92, -0.15, C.kraft, 'matte'));
      k.rbox(0.05, 0.14, 0.05, 0.015, 0.55, 0.83, -0.15, C.ink, 'plastic', 0.4, 0, 0); k.rbox(0.18, 0.12, 0.2, 0.015, 0.45, 0.82, -0.2, '#e9ecec', 'paint');
      Q.push({ p: [-0.48, 0.79, -0.018], w: 0.14, h: 0.07, uv: L.tag('收樣', 'Received') }); Q.push({ p: [-0.1, 0.773, 0.05], w: 0.26, h: 0.18, up: true, uv: L.tag(say('收樣登記簿', 'Sample log'), 'HQ-2611-03 · 04 · 05', { band: '#7a5a2a' }) });
    });
    P('workstation', [2.9, 0, 3.75], PI, { name: ['實驗室資訊系統（LIMS）', 'LIMS workstation'], info: 'dl-workstation', equip: 'imaging' }, (k, S, Q) => {
      legTable(k, 1.6, 0.75, 0.76, '#dfe6e2'); c.chair(k, 0, 0.66, 0, '#3b5063');
      const lims = listCanvas(c, say('LIMS · 待驗樣品', 'LIMS · sample queue'), [['HQ-2611-03', say('黃耆　性狀✓ 顯微✓ TLC✓ HPLC', 'Astragali  macro✓ micro✓ TLC✓ HPLC'), [say('檢驗中', 'testing'), '#2f6fd0']], ['HQ-2611-04', say('當歸　水分・灰分', 'Angelica  moisture · ash'), [say('排程', 'queued'), '#7f8c8d']], ['HQ-2611-05', say('甘草　指紋圖譜', 'Glycyrrhiza  fingerprint'), [say('待覆核', 'review'), '#d68a00']], ['HQ-2611-01', say('白芍　全項', 'Paeonia  full panel'), [say('放行', 'released'), '#2fa36b']], ['HQ-2610-22', say('川芎　重金屬（委外）', 'Chuanxiong  metals (ext.)'), [say('委外', 'outsourced'), '#8e44ad']], ['HQ-2610-19', say('陳皮　黃麴毒素（委外）', 'Citrus peel  aflatoxin (ext.)'), [say('偏差', 'deviation'), '#c0392b']]]);
      monitor(k, S, -0.3, 0.76, -0.18, 0.52, 0.32, lims, 0.12); const coa = listCanvas(c, say('檢驗成績書（CoA）草稿', 'Certificate of analysis — draft'), [[say('品名', 'Herb'), say('白芍 Paeoniae Radix Alba', 'Paeoniae Radix Alba'), ['—', '#7f8c8d']], [say('性狀', 'Description'), say('符合', 'complies'), ['✓', '#2fa36b']], [say('鑑別 TLC', 'ID by TLC'), say('與對照藥材一致', 'matches reference herb'), ['✓', '#2fa36b']], [say('含量 HPLC', 'Assay HPLC'), say('符合規格', 'within specification'), ['✓', '#2fa36b']], [say('覆核', 'Reviewed'), say('第二人簽核', 'second-person sign-off'), [say('待簽', 'pending'), '#d68a00']]], '#2b4a3a');
      monitor(k, S, 0.3, 0.76, -0.18, 0.52, 0.32, coa, -0.12); keyboard(k, 0, 0.76, 0.12); k.rbox(0.18, 0.12, 0.22, 0.015, 0.6, 0.82, 0.05, '#e9ecec', 'paint'); k.box(0.1, 0.004, 0.06, 0.6, 0.88, 0.17, '#ffffff', 'paint', 0.3, 0, 0); k.rbox(0.05, 0.14, 0.05, 0.015, -0.66, 0.83, 0.0, C.ink, 'plastic', 0.4, 0, 0);
    });
    P('chart', [1.15, 0, 2.0], -0.35, { name: ['批次紀錄與 SOP', 'Batch record & SOPs'], info: 'dl-chart', equip: 'chart' }, (k, S, Q) => {
      k.cyl(0.24, 0.26, 0.03, 0, 0.015, 0, '#55606a', 'satin', 0, 0, 0, 16); k.cyl(0.03, 0.03, 1.0, 0, 0.53, 0, C.grey, 'satin', 0, 0, 0, 8); k.box(0.52, 0.025, 0.38, 0, 1.06, 0.02, '#cfd6da', 'paint', -0.32, 0, 0); k.box(0.5, 0.06, 0.08, 0, 1.02, 0.2, '#cfd6da', 'paint', -0.32, 0, 0);
      k.box(0.22, 0.008, 0.3, -0.11, 1.08, 0.02, '#f7f5ee', 'paint', -0.32, 0, 0.03); k.box(0.22, 0.008, 0.3, 0.11, 1.08, 0.02, '#f7f5ee', 'paint', -0.32, 0, -0.03); k.box(0.012, 0.02, 0.31, 0, 1.08, 0.02, '#2f6fd0', 'plastic', -0.32, 0, 0);
      [0, 1, 2].forEach(i => k.box(0.05, 0.3, 0.24, -0.12 + i * 0.06, 0.25, 0.0, ['#2f6fd0', '#c0392b', '#2fa36b'][i], 'plastic')); k.box(0.3, 0.02, 0.28, 0, 0.09, 0, C.grey, 'satin');
      Q.push({ p: [0, 1.0, 0.24], w: 0.34, h: 0.12, ry: 0, uv: L.tag(say('批次紀錄・SOP', 'Batch record · SOP'), 'QC-SOP-014 rev.6') });
    });
    P('whiteboard', [5.47, 0, 2.95], -H2, { name: ['批次進度白板', 'Batch progress board'], info: 'dl-whiteboard', equip: 'chart' }, (k, S, Q, g) => {
      k.rbox(1.66, 1.06, 0.04, 0.01, 0, 1.6, 0, '#c9d1d6', 'paint'); k.box(1.5, 0.03, 0.07, 0, 1.06, 0.035, '#b9c3c8', 'paint'); [['#c0392b', -0.3], ['#2f6fd0', -0.2], ['#1d262c', -0.1]].forEach(([col, x]) => k.cyl(0.008, 0.008, 0.12, x, 1.085, 0.04, col, 'plastic', 0, 0, H2, 6));
      const wt = c.wallText([say('HQ-2611-03 黃耆　性狀✓ 顯微✓ TLC✓ HPLC▶', 'HQ-2611-03 Astragali  macro✓ micro✓ TLC✓ HPLC▶'), say('HQ-2611-04 當歸　水分・灰分（排程）', 'HQ-2611-04 Angelica  moisture · ash (queued)'), say('HQ-2611-05 甘草　指紋圖譜（待覆核）', 'HQ-2611-05 Glycyrrhiza  fingerprint (review)'), say('委外：重金屬・農藥殘留・黃麴毒素', 'Outsourced: metals · pesticides · aflatoxins'), say('天平每日校正 ✓　HPLC 系統適用性 ✓', 'Balance daily check ✓  HPLC suitability ✓')], 1.58, 0.98, { title: say('批次進度　Batch log', 'Batch progress'), px: 768, size: 30, bg: '#fdfdfb', sim: true });
      board(wt); wt.position.set(0, 1.6, 0.024); g.add(wt);
    });
    c.put('door', [0, 0, 4.35], PI);
    L.decor(k => { // upper wall cabinets over the back benches, extinguisher, PPE sign
      k.at(-2.0, 0, -4.5, 0, () => wallCabinets(k, 3.0, 2.1)); k.at(-5.5, 0, -2.0, H2, () => wallCabinets(k, 1.6, 2.15));
      k.cyl(0.075, 0.075, 0.46, -1.42, 0.5, 4.38, '#c0392b', 'paint', 0, 0, 0, 12); k.cyl(0.03, 0.03, 0.06, -1.42, 0.76, 4.38, C.ink, 'plastic', 0, 0, 0, 8); k.box(0.16, 0.04, 0.03, -1.42, 0.86, 4.46, C.grey, 'satin');
    }, false);
    L.decor((k, Q) => { Q.push({ p: [1.75, 1.75, 4.47], w: 0.5, h: 0.25, ry: PI, uv: L.tag(say('護目鏡・實驗衣・手套', 'Goggles · lab coat · gloves'), say('進入前穿戴', 'before entering'), { band: '#2f6fd0', bg: '#eef5ff', size: 16 }) }); }, false);
    c.setField('bench');
    L.alias({ field: 'bench', bed: 'bench', instruments: 'bench', tray: 'bench', centrifuge: 'bench', ultrasound: 'bench', decoction: 'bench', monitor: 'hplc', device: 'hplc', analyser: 'hplc', carm: 'hplc', lab: 'hplc', imaging: 'microscope', endoscopy: 'microscope', lightbox: 'tlc', anaesthesia: 'hood', drugs: 'shelves', cabinet: 'shelves', granules: 'samples', drain: 'sink', 'crash-cart': 'eyewash', handover: 'desk', recovery: 'desk', huddle: 'whiteboard', lights: 'bench' });
    return c.H;
  };

  // ================================================================== cssd 消毒供應中心
  ROOMS.cssd = function (c) {
    const L = toolkit(c), P = L.prop, I = L.info, say = L.say; L.tint('#c2ced5');
    I('cs-packing', '檢查包裝台', 'Inspection & packing table', '清洗後器械在此逐件檢查：放大燈下看清潔度與功能，依器械清單點數組盤，內放化學指示劑、外包雙層包布並貼指示膠帶與標籤（品名、鍋次、日期、包裝者）。', 'Clean instruments are inspected one by one under the lighted magnifier for cleanliness and function, counted against the set list, given an internal chemical indicator, double-wrapped, taped and labelled (set, load, date, packer).');
    I('cs-washer', '清洗消毒機（穿牆式）', 'Washer-disinfector (pass-through)', '污染區由圓窗門裝載，清洗、熱消毒、乾燥後從乾淨區的門取出；兩門互鎖，避免污染與乾淨動線交叉。每批列印或記錄循環參數。', 'Loaded through the round door on the dirty side; after washing, thermal disinfection and drying it is unloaded from the clean side. Interlocked doors keep dirty and clean flows apart; every cycle’s record is kept.');
    I('cs-autoclave', '預真空蒸汽滅菌鍋（雙門）', 'Pre-vacuum steam steriliser (double door)', '包裝區裝載、無菌區卸載。每日首鍋做 Bowie-Dick 測試；每鍋檢查物理參數紀錄與化學指示劑，含植入物的鍋次需生物指示劑結果才放行。', 'Loaded from packing, unloaded into sterile storage. A Bowie-Dick test opens each day; every load’s physical record and chemical indicators are checked, and loads with implants wait for the biological indicator before release.');
    I('cs-lowtemp', '低溫滅菌器（過氧化氫電漿）', 'Low-temperature steriliser (H₂O₂ plasma)', '不耐熱、不耐濕的器械（如部分內視鏡配件、電子器械）用低溫滅菌；需完全乾燥、使用相容包材，不可放紙類或棉布。', 'For heat- and moisture-sensitive devices (some scope accessories, powered instruments); items must be fully dry and wrapped in compatible materials — no paper or linen.');
    I('cs-store', '無菌物品儲存架', 'Sterile storage shelving', '包裝完整、乾燥、標籤清楚才上架；離地、離牆、離天花板，先進先出。包布破損、潮濕或落地即視為污染，退回重新處理。', 'Only intact, dry, clearly labelled packs go on the shelves — clear of floor, walls and ceiling, first in first out. A torn, damp or dropped pack is contaminated and goes back for reprocessing.');
    I('cs-incubator', '生物指示劑培養判讀器', 'Biological-indicator incubator & reader', '生物指示劑隨鍋滅菌後與未滅菌對照管一起培養判讀；陰性才放行植入物，陽性立即通報並追回同鍋物品。', 'After the cycle the biological indicator is incubated with an unprocessed control; implants are released only on a negative result, and a positive triggers an immediate report and recall of the load.');
    I('cs-workstation', '放行與追溯工作站', 'Release & traceability workstation', '掃描每個包的條碼：清洗機、滅菌鍋、鍋次、包裝者、有效期都可追溯；監測結果全數合格才按放行。', 'Each pack’s barcode links washer, steriliser, load, packer and expiry; release happens only when every monitoring result has passed.');
    I('cs-sink', '去污清洗槽', 'Decontamination sinks', '去污區穿防水隔離衣、面罩、厚手套；器械拆開、浸泡在酵素清潔劑中刷洗，管腔用水槍與氣槍沖洗，刷洗在水面下以免噴濺。', 'In decontamination wear a fluid-resistant gown, face shield and heavy gloves; instruments are opened, soaked in enzymatic detergent and brushed, lumens flushed with water and air guns — brushing below the waterline to avoid splashes.');
    I('cs-ultrasonic', '超音波清洗機', 'Ultrasonic cleaner', '利用超音波空化去除關節與縫隙的污物；器械完全浸沒、關節打開、蓋上蓋子再啟動，清洗液依規定更換。', 'Ultrasonic cavitation lifts soil from joints and crevices; instruments fully immersed with joints open, lid closed before starting, solution changed as specified.');
    I('cs-ppe', '個人防護裝備站', 'PPE station', '進入去污區前：手部衛生、防水隔離衣、面罩或護目鏡、髮帽、厚手套；離開時依順序脫除並洗手。', 'Before entering decontamination: hand hygiene, fluid-resistant gown, face shield or goggles, cap, heavy gloves; remove in order on leaving and wash hands.');
    I('cs-casecart', '污染器械回收車', 'Contaminated case cart', '手術室用過的器械以密閉推車送回去污區；器械保持濕潤（保濕噴劑或濕巾）避免污物乾涸。', 'Used instruments return from theatre in a closed cart; they are kept moist (enzymatic spray or damp towel) so soil does not dry on.');
    I('cs-cleancart', '無菌物品配送車', 'Sterile supply cart', '密閉、清潔的配送車把無菌包送到手術室與病房；與污染回收車分開，定期清潔。', 'A closed, clean cart delivers sterile packs to theatres and wards; kept separate from contaminated carts and cleaned regularly.');
    I('cs-desk', '紀錄與耗材桌', 'Records & supplies desk', '器械清單、包裝耗材批號、教育訓練紀錄與異常通報單；耗材依有效期使用。', 'Set lists, packaging-material lot numbers, training records and incident forms; consumables used by expiry date.');
    I('cs-chart', '滅菌鍋次紀錄', 'Steriliser load records', '每鍋記錄鍋號、鍋次、內容物、操作者，附物理參數列印與 Bowie-Dick 結果，由第二人覆核。', 'Each load records steriliser, load number, contents and operator, with the cycle printout and Bowie-Dick result, reviewed by a second person.');
    I('cs-whiteboard', '鍋次與動線白板', 'Load log & flow board', '今日鍋次、待處理器械、急件與召回；單向動線：去污 → 包裝 → 滅菌 → 無菌儲存，不可逆行。', 'Today’s loads, pending sets, urgent requests and recalls; one-way flow: decontamination → packing → sterilisation → sterile storage, never backwards.');
    I('cs-passbox', '傳遞窗', 'Pass-through hatch', '小件物品在污染區與包裝區之間只能經傳遞窗單向傳送，兩側門不可同時開啟。', 'Small items move one way between decontamination and packing only through the hatch; its two doors never open together.');
    const X1 = -2.0, X2 = 2.4; // zone partitions: decontamination | packing | sterile storage
    // ---- partitions with glazing, staff openings (z 0.2–1.5) and a pass-through hatch
    L.decor(k => {
      const glazed = (x, z0, z1) => { const len = z1 - z0, zc = (z0 + z1) / 2; k.box(0.08, 0.9, len, x, 0.45, zc, C.lam, 'paint'); k.box(0.016, 1.4, len, x, 1.6, zc, '#cfe6f0', 'glass'); k.box(0.08, 0.06, len, x, 2.33, zc, '#c3ccd1', 'paint'); k.box(0.08, 0.6, len, x, 2.66, zc, C.lam, 'paint'); const n = Math.max(1, Math.round(len / 1.2)); for (let i = 0; i <= n; i++) k.box(0.06, 2.96, 0.05, x, 1.48, Math.min(z1 - 0.025, Math.max(z0 + 0.025, z0 + i * len / n)), '#c3ccd1', 'paint'); };
      glazed(X1, -2.42, 0.2); glazed(X2, -4.5, 0.2); glazed(X1, 1.5, 4.5); glazed(X2, 1.5, 4.5);
      k.box(0.08, 1.92, 0.5, X1, 0.96, -4.25, C.lam, 'paint'); k.box(0.08, 1.04, 2.08, X1, 2.44, -3.46, C.lam, 'paint'); // around the washer-disinfectors
      [X1, X2].forEach(x => { k.box(0.12, 0.6, 1.3, x, 2.66, 0.85, C.lam, 'paint'); k.box(0.12, 0.06, 1.3, x, 2.33, 0.85, '#c3ccd1', 'paint'); });
      [[X1, '#c0392b'], [X2, '#2fa36b']].forEach(([x, col]) => { k.box(0.1, 0.004, 1.3, x, 0.003, 0.85, col, 'paint'); }); k.box(3.4, 0.004, 0.06, -3.75, 0.003, 1.5, '#c0392b', 'paint'); k.box(3.0, 0.004, 0.06, 3.95, 0.003, 1.5, '#2fa36b', 'paint');
    });
    L.sign('去污區　DECONTAMINATION', 'DECONTAMINATION · DIRTY', [-3.75, 2.75, -1.0], 'rgba(192,57,43,.92)'); L.sign('檢查包裝區　PACKING', 'INSPECTION & PACKING · CLEAN', [0.2, 2.75, 0.4], 'rgba(31,88,120,.92)'); L.sign('無菌儲存區　STERILE', 'STERILE STORAGE', [3.95, 2.75, -1.0], 'rgba(47,140,90,.92)');
    // ---- pass-through hatch as a clickable prop (no footprint of its own beyond the partition)
    P('passbox', [X1, 0, -1.2], H2, { name: ['傳遞窗', 'Pass-through hatch'], info: 'cs-passbox', equip: 'device', hot: false }, (k, S, Q) => {
      k.rbox(0.56, 0.44, 0.5, 0.02, 0, 1.2, 0, C.ss, 'paint'); [-1, 1].forEach(s => { k.box(0.42, 0.34, 0.012, 0, 1.2, s * 0.255, '#b9dbe8', 'glass'); k.box(0.1, 0.02, 0.02, 0, 1.05, s * 0.265, C.grey, 'satin'); k.box(0.03, 0.03, 0.02, 0.22, 1.4, s * 0.262, s > 0 ? C.led : '#ffb347', 'glow'); });
      Q.push({ p: [0, 1.48, 0.256], w: 0.2, h: 0.1, uv: L.tag('傳遞窗', 'Pass-through') });
    });
    // ---- decontamination zone
    P('sink', [-4.6, 0, -4.12], 0, { name: ['去污清洗槽', 'Decontamination sinks'], info: 'cs-sink', equip: 'sink' }, (k, S, Q) => {
      k.rbox(1.7, 0.86, 0.7, 0.015, 0, 0.43, 0, C.ss, 'paint'); k.rbox(1.74, 0.04, 0.74, 0.01, 0, 0.88, 0, '#dfe5e8', 'paint'); k.box(1.7, 0.3, 0.03, 0, 1.05, -0.34, C.ss, 'paint');
      [-0.4, 0.36].forEach(x => { k.box(0.6, 0.02, 0.48, x, 0.9, 0.02, '#8e999e', 'metal'); k.box(0.58, 0.01, 0.44, x, 0.88, 0.02, '#9fc6d6', 'fluid'); k.tube([[x, 1.05, -0.32], [x, 1.32, -0.22], [x, 1.22, -0.06]], 0.013, C.steel, 'metal', 14, 6); });
      [[-0.78, '#2f6fd0'], [-0.7, '#f2c230']].forEach(([x, col]) => { k.rbox(0.05, 0.16, 0.05, 0.015, x, 1.2, -0.28, col, 'plastic'); k.tube([[x, 1.12, -0.28], [x + 0.05, 1.0, -0.15], [x + 0.2, 0.95, 0.05]], 0.007, col, 'rubber', 14, 4); });
      for (let i = 0; i < 6; i++) k.cyl(0.006, 0.006, 0.28, 0.58 + i * 0.035, 1.42, -0.3, ['#2f6fd0', '#f2c230', '#2fa36b'][i % 3], 'plastic', 0, 0, 0, 6); k.box(0.3, 0.02, 0.06, 0.66, 1.3, -0.3, C.steel2, 'metal');
      k.rbox(0.18, 0.26, 0.14, 0.02, -0.02, 1.32, -0.26, '#f4f6f8', 'plastic'); k.box(0.1, 0.06, 0.005, -0.02, 1.38, -0.188, '#2fa36b', 'paint');
      Q.push({ p: [-0.02, 1.26, -0.188], w: 0.12, h: 0.06, uv: L.tag('酵素清潔劑', 'Enzymatic', { band: '#2fa36b' }) }); Q.push({ p: [-0.02, 1.09, -0.32], w: 0.36, h: 0.1, uv: L.tag(say('刷洗在水面下', 'Brush below water'), say('防噴濺', 'no splashing'), { band: '#c0392b' }) });
    });
    P('ultrasonic', [-5.1, 0, -2.45], H2, { name: ['超音波清洗機', 'Ultrasonic cleaner'], info: 'cs-ultrasonic', equip: 'device' }, (k, S, Q) => {
      k.rbox(1.3, 0.86, 0.66, 0.015, 0, 0.43, 0, C.ss, 'paint'); k.rbox(1.32, 0.04, 0.68, 0.01, 0, 0.88, 0, '#dfe5e8', 'paint');
      k.rbox(0.62, 0.3, 0.46, 0.02, -0.25, 1.05, 0, '#e3e8ea', 'paint'); k.box(0.52, 0.02, 0.36, -0.25, 1.2, 0, '#9fc6d6', 'fluid'); k.rbox(0.62, 0.04, 0.46, 0.01, -0.25, 1.4, -0.24, C.steel2, 'metal', -1.2, 0, 0); k.box(0.2, 0.06, 0.01, -0.25, 1.0, 0.232, C.ink, 'plastic'); k.box(0.08, 0.03, 0.005, -0.25, 1.0, 0.24, C.led, 'glow');
      for (let i = 0; i < 4; i++) k.box(0.48, 0.006, 0.006, -0.25, 1.18, -0.15 + i * 0.1, C.steel2, 'metal'); k.rbox(0.36, 0.06, 0.26, 0.01, 0.36, 0.93, 0.0, C.steel2, 'metal'); for (let i = 0; i < 2; i++) c.place(k, ['clamp', 'mayo'][i], 0.22, 0.965, -0.05 + i * 0.07, 0);
      Q.push({ p: [-0.25, 1.06, 0.232], w: 0.14, h: 0.07, uv: L.tag('超音波', 'Ultrasonic') });
    });
    P('ppe', [-5.42, 0, -0.55], H2, { name: ['個人防護裝備站', 'PPE station'], info: 'cs-ppe', equip: 'cart' }, (k, S, Q) => {
      k.rbox(0.9, 1.2, 0.06, 0.01, 0, 1.4, 0, '#e9eef0', 'paint'); [-0.3, -0.1, 0.1].forEach((x, i) => { k.cyl(0.01, 0.01, 0.08, x, 1.85, 0.05, C.grey, 'satin', H2, 0, 0, 6); k.rbox(0.16, 0.7, 0.04, 0.03, x, 1.45, 0.08, ['#7fb3e0', '#7fb3e0', '#f2c230'][i], 'cloth'); });
      [0.3, 0.3].forEach((x, i) => k.rbox(0.22, 0.1, 0.12, 0.01, x, 1.1 + i * 0.14, 0.08, '#f4f6f8', 'paint')); k.rbox(0.22, 0.26, 0.04, 0.02, 0.3, 1.7, 0.06, '#cfe8f0', 'glass'); k.rbox(0.08, 0.18, 0.08, 0.02, -0.38, 1.0, 0.06, '#f4f6f8', 'plastic');
      Q.push({ p: [0, 1.95, 0.035], w: 0.4, h: 0.2, uv: L.tag(say('穿戴防護', 'Don PPE'), say('隔離衣・面罩・厚手套', 'gown · shield · heavy gloves'), { band: '#c0392b', size: 18 }) });
    });
    P('casecart', [-4.3, 0, 3.0], 0.2, { name: ['污染器械回收車', 'Contaminated case cart'], info: 'cs-casecart', equip: 'cart' }, (k, S, Q) => {
      k.rbox(0.9, 1.25, 0.6, 0.02, 0, 0.72, 0, C.ss, 'paint'); k.box(0.86, 1.15, 0.012, 0, 0.72, 0.302, '#e3e8ea', 'paint'); k.box(0.02, 0.3, 0.03, 0.38, 0.8, 0.32, C.grey, 'satin'); c.castors(k, [[-0.38, -0.24], [0.38, -0.24], [-0.38, 0.24], [0.38, 0.24]], 0.05); k.cyl(0.015, 0.015, 0.8, 0, 1.0, -0.33, C.steel2, 'metal', 0, 0, H2, 8);
      Q.push({ p: [0, 1.0, 0.31], w: 0.36, h: 0.18, uv: L.tag('污染', 'CONTAMINATED', { band: '#c0392b', bg: '#ffe9e6' }) });
    });
    // ---- washer-disinfectors in the dirty/clean partition (round doors face the dirty side)
    P('washer', [X1, 0, -3.22], -H2, { name: ['清洗消毒機（穿牆式 × 2）', 'Washer-disinfectors (pass-through × 2)'], info: 'cs-washer', equip: 'device' }, (k, S, Q) => [-0.4, 0.4].forEach((ux, i) => k.at(ux, 0, 0, 0, () => {
      k.rbox(0.76, 1.92, 0.8, 0.02, 0, 0.96, 0, '#e7ebec', 'paint'); k.box(0.7, 0.14, 0.02, 0, 0.07, 0.4, C.plinth, 'paint'); k.cyl(0.26, 0.26, 0.05, 0, 0.92, 0.41, '#cfd6da', 'paint', H2, 0, 0, 24); k.cyl(0.21, 0.21, 0.04, 0, 0.92, 0.43, '#a9d3e2', 'glass', H2, 0, 0, 24); k.tor(0.235, 0.02, 0, 0.92, 0.44, C.grey, 'paint', 0, 0, 0, PI * 2, 12);
      k.box(0.05, 0.12, 0.04, 0.2, 0.92, 0.46, C.grey, 'satin'); k.box(0.6, 0.26, 0.01, 0, 1.6, 0.405, C.ink, 'plastic'); S(0.24, 0.15, panelCanvas(c, [say('清洗消毒 ' + (i + 1), 'Washer ' + (i + 1)), i ? say('乾燥中', 'Drying') : say('熱消毒中', 'Thermal disinfection'), say('剩餘 ' + (i ? 6 : 18) + ' 分', (i ? 6 : 18) + ' min left')]), ux - 0.12, 1.6, 0.412, 0, 1.0); k.box(0.04, 0.04, 0.005, 0.2, 1.62, 0.412, C.led, 'glow');
      k.box(0.64, 1.6, 0.012, 0, 0.98, -0.405, '#e3e8ea', 'paint'); k.box(0.5, 0.5, 0.01, 0, 1.0, -0.41, '#a9d3e2', 'glass'); k.box(0.04, 0.04, 0.005, 0.24, 1.62, -0.412, '#ffb347', 'glow');
      Q.push({ p: [ux, 1.82, 0.406], w: 0.28, h: 0.14, uv: L.tag(say('清洗消毒機', 'Washer') + ' ' + (i + 1), say('裝載側', 'load side'), { band: '#c0392b' }) });
    })));
    // ---- packing zone: autoclaves (back wall), low-temperature steriliser, packing table (main), records
    const doorLights = [];
    P('autoclave', [0.3, 0, -3.98], 0, { name: ['預真空蒸汽滅菌鍋（雙門 × 2）', 'Pre-vacuum steam sterilisers (double door × 2)'], info: 'cs-autoclave', equip: 'device' }, (k, S, Q, g) => [-0.65, 0.65].forEach((ux, i) => k.at(ux, 0, 0, 0, () => {
      k.rbox(1.18, 2.1, 1.0, 0.02, 0, 1.05, -0.02, '#e2e7ea', 'paint'); k.box(1.2, 0.5, 1.0, 0, 2.85, -0.02, C.lam, 'paint'); k.box(0.92, 1.25, 0.02, -0.06, 1.0, 0.49, '#cdd4d8', 'paint'); k.box(0.86, 0.04, 0.03, -0.06, 1.66, 0.5, C.steel2, 'paint');
      k.rbox(0.18, 0.5, 0.04, 0.01, 0.48, 1.45, 0.49, C.ink, 'plastic'); S(0.15, 0.24, panelCanvas(c, [say('第 ' + (3 + i) + ' 鍋', 'Load ' + (3 + i)), say('預真空', 'Pre-vac'), say('滅菌中', 'Sterilising')]), ux + 0.48, 1.52, 0.512, 0, 1.0); [0, 1, 2].forEach(j => k.box(0.03, 0.03, 0.005, 0.44 + j * 0.04, 1.25, 0.512, ['#2fa36b', '#ffb347', '#c0392b'][j], j ? 'plastic' : 'glow'));
      k.cyl(0.05, 0.05, 0.03, 0.48, 0.9, 0.5, C.steel2, 'metal', H2, 0, 0, 14); k.box(1.1, 0.04, 0.6, 0, 0.4, 0.82, C.steel2, 'paint'); c.castors(k, [[-0.5, 0.56], [0.5, 0.56], [-0.5, 1.08], [0.5, 1.08]], 0.05); [-0.5, 0.5].forEach(xx => k.box(0.03, 0.4, 0.03, xx, 0.6, 1.1, C.steel2, 'metal'));
      for (let lv = 0; lv < 3; lv++) { k.box(0.84, 0.012, 0.52, -0.06, 0.6 + lv * 0.3, 0.82, '#d4dadd', 'paint'); [-0.25, 0.15].forEach(xx => { k.rbox(0.34, 0.12, 0.42, 0.02, -0.06 + xx, 0.67 + lv * 0.3, 0.82, '#5d93c4', 'cloth'); k.box(0.35, 0.02, 0.02, -0.06 + xx, 0.735 + lv * 0.3, 0.82, '#f4f6f8', 'paint'); }); }
      const lk = c.makeKit(c.K); lk.box(0.92, 0.04, 0.012, 0, 0, 0, '#ffffff', 'glow'); const bar = lk.build({ shadow: false }); bar.position.set(ux - 0.06, 1.7, 0.505); g.add(bar); doorLights.push(bar);
      Q.push({ p: [ux - 0.06, 2.0, 0.495], w: 0.5, h: 0.25, uv: L.tag(say('滅菌鍋 ', 'Steriliser ') + (i + 1), say('預真空・雙門', 'Pre-vac · double door')) });
    })));
    doorLights.forEach((bar, i) => { const m = L.firstMesh(bar); if (!m) return; const mat = m.material = m.material.clone(); m.userData.base = mat.color.clone(); L.anim(m, t => { const p = (Math.sin(t * 2.2 + i * 1.7) + 1) / 2; mat.color.setRGB(1, 0.55 + 0.25 * p, 0.12 + 0.1 * p); bar.scale.x = 0.15 + 0.85 * ((t * 0.04 + i * 0.37) % 1); }); });
    P('lowtemp', [1.96, 0, -4.08], 0, { name: ['低溫滅菌器（過氧化氫電漿）', 'Low-temperature steriliser (H₂O₂ plasma)'], info: 'cs-lowtemp', equip: 'device' }, (k, S, Q) => {
      k.rbox(0.72, 1.7, 0.8, 0.02, 0, 0.85, 0, '#eef0f0', 'paint'); k.box(0.56, 0.5, 0.02, 0, 1.15, 0.405, '#cfd6da', 'metal'); k.box(0.3, 0.02, 0.03, 0, 1.38, 0.42, C.grey, 'satin'); S(0.22, 0.14, panelCanvas(c, [say('低溫滅菌', 'Low-temp'), say('待機', 'Ready'), say('乾燥器械', 'dry items only')], '#14202a'), 0, 1.58, 0.412, 0, 1.0); k.box(0.6, 0.6, 0.012, 0, 0.42, 0.405, '#e2e7e9', 'paint');
      Q.push({ p: [0, 0.78, 0.413], w: 0.24, h: 0.12, uv: L.tag('低溫滅菌', 'H₂O₂ plasma', { band: '#8e44ad' }) });
    });
    P('packing', [0.2, 0, -0.75], 0, { name: ['檢查包裝台', 'Inspection & packing table'], info: 'cs-packing', equip: 'lab' }, (k, S, Q) => {
      const Lt = 2.5, D = 0.9; legTable(k, Lt, D, TOP, '#dce2e5', 'paint'); k.box(Lt - 0.2, 0.02, D - 0.2, 0, 0.3, 0, C.ss, 'paint'); [-1.05, 1.05].forEach(x => k.box(0.04, 0.9, 0.04, x, TOP + 0.45, -0.38, C.steel2, 'satin')); k.box(Lt - 0.4, 0.03, 0.3, 0, TOP + 0.62, -0.32, '#dfe5e8', 'paint'); k.box(Lt - 0.4, 0.02, 0.06, 0, TOP + 0.9, -0.36, '#ffffff', 'glow');
      [['#4a90c8', -0.85], ['#5fae7a', -0.52], ['#4a90c8', -0.19]].forEach(([col, x]) => { k.cyl(0.07, 0.07, 0.3, x, TOP + 0.72, -0.32, col, 'cloth', 0, 0, H2, 14); k.cyl(0.02, 0.02, 0.36, x, TOP + 0.72, -0.32, C.steel2, 'metal', 0, 0, H2, 6); });
      for (let i = 0; i < 5; i++) k.box(0.17, 0.12, 0.22, 0.2 + i * 0.2, TOP + 0.7, -0.32, ['#f4f6f8', '#eaf2f6'][i % 2], 'paint');
      k.rbox(0.48, 0.06, 0.3, 0.01, -0.8, TOP + 0.03, 0.12, C.steel2, 'metal'); ['forceps', 'mayo', 'needle', 'clamp', 'kocher'].forEach((id, i) => c.place(k, id, -0.98, TOP + 0.062, 0.03 + i * 0.04, 0, id === 'forceps' ? true : undefined));
      k.box(0.6, 0.01, 0.6, -0.15, TOP + 0.005, 0.1, '#4a90c8', 'cloth', 0, 0.785, 0); k.rbox(0.36, 0.1, 0.26, 0.02, -0.15, TOP + 0.06, 0.1, '#4a90c8', 'cloth'); k.box(0.37, 0.02, 0.03, -0.15, TOP + 0.11, 0.1, '#f4f6f8', 'paint'); k.box(0.02, 0.105, 0.27, -0.15, TOP + 0.06, 0.1, '#f4f6f8', 'paint');
      k.tor(0.14, 0.022, 0.42, TOP + 0.42, 0.18, C.white, 'paint', H2, 0, 0, PI * 2, 12); k.tor(0.12, 0.012, 0.42, TOP + 0.415, 0.18, '#fffbe6', 'glow', H2, 0, 0, PI * 2, 10); k.disc(0.12, 0.42, TOP + 0.43, 0.18, '#cfe8f0', 'glass', H2, 0, 0, 16); k.seg([0.42, TOP + 0.44, 0.04], [0.55, TOP + 0.62, -0.25], 0.012, 0.012, C.white, 'paint', 6); k.seg([0.55, TOP + 0.62, -0.25], [0.6, TOP + 0.02, -0.3], 0.014, 0.014, C.white, 'paint', 6);
      k.rbox(0.42, 0.14, 0.24, 0.02, 0.92, TOP + 0.07, 0.15, '#e9ecec', 'paint'); k.cyl(0.07, 0.07, 0.24, 0.92, TOP + 0.22, -0.02, '#f2f4f2', 'paint', 0, 0, H2, 14); k.box(0.24, 0.002, 0.2, 0.92, TOP + 0.145, 0.25, '#e9f2f6', 'glass'); k.box(0.08, 0.025, 0.005, 1.05, TOP + 0.09, 0.272, '#ff5a3c', 'glow');
      k.rbox(0.18, 0.12, 0.2, 0.015, 0.6, TOP + 0.06, 0.25, '#2b3036', 'plastic'); k.box(0.08, 0.005, 0.06, 0.6, TOP + 0.122, 0.33, '#ffffff', 'paint', 0.4, 0, 0); k.cyl(0.04, 0.04, 0.03, 0.18, TOP + 0.015, 0.3, '#f4f6f8', 'plastic', 0, 0, 0, 14); k.cyl(0.03, 0.03, 0.032, 0.18, TOP + 0.016, 0.3, '#e8e2c8', 'paint', 0, 0, 0, 12);
      stool(k, -0.55, 0.78, 0.66); stool(k, 0.45, 0.78, 0.66);
      Q.push({ p: [-0.15, TOP + 0.061, 0.232], w: 0.2, h: 0.08, uv: L.tag('腹腔鏡器械包', 'Lap set · L3') }); Q.push({ p: [-0.8, TOP + 0.012, -0.16], w: 0.26, h: 0.18, up: true, uv: L.tag(say('器械清單 32 件', 'Set list · 32 items'), say('點數 ✓ 功能 ✓', 'count ✓ function ✓')) });
      Q.push({ p: [0.0, TOP + 0.62, -0.165], w: 0.44, h: 0.13, uv: L.tag(say('指示劑・膠帶・標籤', 'Indicator · tape · label'), '', { size: 18 }) });
    });
    P('chart', [-0.7, 0, 1.95], 0.35, { name: ['滅菌鍋次紀錄', 'Steriliser load records'], info: 'cs-chart', equip: 'chart' }, (k, S, Q) => {
      k.cyl(0.24, 0.26, 0.03, 0, 0.015, 0, '#55606a', 'satin', 0, 0, 0, 16); k.cyl(0.03, 0.03, 1.0, 0, 0.53, 0, C.grey, 'satin', 0, 0, 0, 8); k.box(0.48, 0.025, 0.36, 0, 1.06, 0.02, '#cfd6da', 'paint', -0.32, 0, 0); k.box(0.34, 0.01, 0.3, 0, 1.08, 0.02, '#f7f5ee', 'paint', -0.32, 0, 0); k.box(0.3, 0.012, 0.03, 0, 1.12, -0.11, C.grey, 'satin', -0.32, 0, 0);
      Q.push({ p: [0, 1.0, 0.22], w: 0.34, h: 0.12, uv: L.tag(say('鍋次紀錄', 'Load records'), 'Bowie-Dick ✓', { band: '#2fa36b' }) });
    });
    P('desk', [X2 - 0.38, 0, 2.3], -H2, { name: ['紀錄與耗材桌', 'Records & supplies desk'], info: 'cs-desk', equip: 'chart' }, (k, S, Q) => {
      legTable(k, 1.4, 0.7, 0.76, '#dfe6e2'); c.chair(k, 0.1, 0.6, 0, '#3b5063'); k.box(0.3, 0.012, 0.22, -0.2, 0.766, 0.05, '#f7f5ee', 'paint'); k.box(0.3, 0.012, 0.22, 0.12, 0.768, 0.05, '#f7f5ee', 'paint'); for (let i = 0; i < 4; i++) k.box(0.05, 0.28, 0.22, 0.38 + i * 0.06, 0.9, -0.2, ['#2f6fd0', '#c0392b', '#2fa36b', '#f1c40f'][i], 'plastic');
      [0, 1].forEach(j => k.rbox(0.3, 0.2, 0.3, 0.02, -0.5, 0.86 + j * 0.0, -0.15 + j * 0.0, '#e9eef0', 'paint')); k.cyl(0.1, 0.1, 0.32, -0.5, 1.06, -0.15, '#4a90c8', 'cloth', 0, 0, H2, 12);
      Q.push({ p: [-0.2, 0.773, 0.05], w: 0.26, h: 0.18, up: true, uv: L.tag(say('異常通報', 'Incident log'), say('召回・急件', 'recall · urgent'), { band: '#c0392b' }) });
    });
    P('whiteboard', [X1 + 0.06, 0, 2.9], H2, { name: ['鍋次與動線白板', 'Load log & flow board'], info: 'cs-whiteboard', equip: 'chart' }, (k, S, Q, g) => {
      k.rbox(1.66, 1.06, 0.04, 0.01, 0, 1.6, 0, '#c9d1d6', 'paint'); k.box(1.5, 0.03, 0.07, 0, 1.06, 0.035, '#b9c3c8', 'paint');
      const wt = c.wallText([say('1 號鍋　第 3 鍋　BD ✓　骨科、腹腔鏡', 'Steriliser 1  load 3  BD ✓  ortho, lap'), say('2 號鍋　第 4 鍋　含植入物 → 等 BI', 'Steriliser 2  load 4  implants → await BI'), say('低溫　第 2 鍋　內視鏡配件', 'Low-temp  load 2  scope accessories'), say('急件：OR3 剖腹包 10:30', 'Urgent: OR3 laparotomy set 10:30'), say('動線：去污 → 包裝 → 滅菌 → 儲存', 'Flow: dirty → pack → sterilise → store')], 1.58, 0.98, { title: say('今日鍋次　Load log', 'Today’s loads'), px: 768, size: 30, bg: '#fdfdfb', sim: true });
      board(wt); wt.position.set(0, 1.6, 0.024); g.add(wt);
    });
    // ---- sterile storage
    P('sterile-store', [5.15, 0, -2.0], -H2, { name: ['無菌物品儲存架', 'Sterile storage shelving'], info: 'cs-store', equip: 'cart' }, (k, S, Q) => {
      wireShelf(k, 3.2, 0.56, [0.28, 0.7, 1.12, 1.54, 1.9], 1.96); const SETS = [['剖腹包', 'Laparotomy'], ['骨科基本包', 'Ortho basic'], ['腹腔鏡包', 'Laparoscopy'], ['縫合包', 'Suture'], ['眼科包', 'Ophthalmic'], ['剖腹產包', 'Caesarean']];
      [0.28, 0.7, 1.12, 1.54].forEach((y, r) => { for (let i = 0; i < 6; i++) { const x = -1.3 + i * 0.52; if ((r + i) % 5 === 4) { k.rbox(0.42, 0.16, 0.4, 0.02, x, y + 0.09, 0, '#f2f4f5', 'plastic'); for (let j = 0; j < 4; j++) k.box(0.34, 0.12, 0.004, x, y + 0.1, -0.12 + j * 0.07, '#eef6fa', 'glass'); } else { k.rbox(0.42, 0.14 + (i % 2) * 0.04, 0.4, 0.025, x, y + 0.085 + (i % 2) * 0.02, 0, (r + i) % 3 ? '#4a90c8' : '#5fae7a', 'cloth'); k.box(0.43, 0.02, 0.03, x, y + 0.13 + (i % 2) * 0.04, 0, '#f4f6f8', 'paint'); } } const s = SETS[r % SETS.length]; Q.push({ p: [-1.3 + (r % 3) * 1.04, y + 0.03, 0.284], w: 0.2, h: 0.08, uv: L.tag(s[0], s[1], { band: '#2fa36b' }) }); });
      Q.push({ p: [0, 1.93, 0.285], w: 0.5, h: 0.11, uv: L.tag(say('先進先出', 'First in · first out'), '', { band: '#2fa36b', size: 20 }) });
    });
    P('incubator', [3.75, 0, -4.15], 0, { name: ['生物指示劑培養判讀器', 'Biological-indicator incubator & reader'], info: 'cs-incubator', equip: 'lab' }, (k, S, Q) => {
      baseRun(k, 1.8, 0.62, { top: C.steel }); k.rbox(0.36, 0.16, 0.3, 0.02, -0.35, TOP + 0.08, -0.05, '#f4f6f8', 'paint'); for (let i = 0; i < 6; i++) { k.cyl(0.012, 0.012, 0.02, -0.47 + i * 0.045, TOP + 0.165, -0.08, C.ink, 'plastic', 0, 0, 0, 8); k.box(0.012, 0.012, 0.004, -0.47 + i * 0.045, TOP + 0.1, 0.101, i === 3 ? '#ffb347' : C.led, 'glow'); if (i < 4) k.cyl(0.008, 0.008, 0.05, -0.47 + i * 0.045, TOP + 0.19, -0.08, i % 2 ? '#8e44ad' : '#f4efe2', 'plastic', 0, 0, 0, 6); }
      k.rbox(0.16, 0.12, 0.2, 0.015, 0.1, TOP + 0.06, -0.08, '#e9ecec', 'paint'); k.rbox(0.12, 0.1, 0.12, 0.02, 0.45, TOP + 0.05, 0.0, '#ffffff', 'cloth'); k.box(0.122, 0.02, 0.02, 0.45, TOP + 0.08, 0.0, '#f1c40f', 'paint'); k.box(0.3, 0.012, 0.22, 0.6, TOP + 0.006, 0.12, '#f7f5ee', 'paint');
      Q.push({ p: [-0.35, TOP + 0.13, 0.101], w: 0.16, h: 0.05, uv: L.tag(say('BI 判讀', 'BI reader'), '', { size: 18 }) }); Q.push({ p: [0.45, TOP + 0.05, 0.061], w: 0.1, h: 0.05, uv: L.tag('PCD', say('測試包', 'test pack')) });
    });
    P('workstation', [4.55, 0, 3.72], PI, { name: ['放行與追溯工作站', 'Release & traceability workstation'], info: 'cs-workstation', equip: 'imaging' }, (k, S, Q) => {
      legTable(k, 1.6, 0.75, 0.76, '#dfe6e2'); c.chair(k, 0, 0.66, 0, '#3b5063');
      const rel = listCanvas(c, say('放行檢核　第 3 鍋（1 號鍋）', 'Release check — load 3 (steriliser 1)'), [['Bowie-Dick', say('每日首鍋', 'first load of the day'), [say('合格', 'pass'), '#2fa36b']], [say('物理參數', 'Physical record'), say('溫度・壓力・時間曲線', 'temperature · pressure · time'), [say('合格', 'pass'), '#2fa36b']], [say('化學指示劑', 'Chemical indicators'), say('包內・包外變色', 'internal · external'), [say('合格', 'pass'), '#2fa36b']], [say('生物指示劑', 'Biological indicator'), say('含植入物鍋次', 'implant loads'), [say('培養中', 'incubating'), '#d68a00']], [say('追溯', 'Traceability'), say('條碼：包裝者・鍋次・效期', 'barcode: packer · load · expiry'), ['✓', '#2fa36b']], [say('放行', 'Release'), say('全部合格才放行', 'only when all pass'), [say('待定', 'hold'), '#c0392b']]], '#24533f');
      monitor(k, S, 0, 0.76, -0.18, 0.56, 0.34, rel, 0); keyboard(k, 0, 0.76, 0.12); k.rbox(0.05, 0.14, 0.05, 0.015, 0.5, 0.83, 0.0, C.ink, 'plastic', 0.4, 0, 0); k.rbox(0.2, 0.12, 0.22, 0.015, -0.55, 0.82, -0.05, '#e9ecec', 'paint');
    });
    P('cleancart', [4.85, 0, 1.75], -H2, { name: ['無菌物品配送車', 'Sterile supply cart'], info: 'cs-cleancart', equip: 'cart' }, (k, S, Q) => {
      k.rbox(0.9, 1.25, 0.6, 0.02, 0, 0.72, 0, '#d9e8f2', 'paint'); k.box(0.86, 1.15, 0.012, 0, 0.72, 0.302, '#e6f0f6', 'paint'); k.box(0.02, 0.3, 0.03, 0.38, 0.8, 0.32, C.grey, 'satin'); c.castors(k, [[-0.38, -0.24], [0.38, -0.24], [-0.38, 0.24], [0.38, 0.24]], 0.05);
      Q.push({ p: [0, 1.0, 0.31], w: 0.36, h: 0.18, uv: L.tag('無菌物品', 'STERILE SUPPLY', { band: '#2fa36b', bg: '#eafaf0' }) });
    });
    c.put('door', [0, 0, 4.35], PI);
    c.setField('packing');
    L.alias({ field: 'packing', bed: 'packing', bench: 'packing', instruments: 'packing', tray: 'packing', monitor: 'autoclave', device: 'autoclave', analyser: 'autoclave', carm: 'autoclave', imaging: 'workstation', lightbox: 'workstation', lab: 'incubator', microscope: 'packing', centrifuge: 'washer', ultrasound: 'ultrasonic', endoscopy: 'lowtemp', drugs: 'sterile-store', cart: 'sterile-store', drain: 'sink', anaesthesia: 'washer', hood: 'washer', handover: 'desk', huddle: 'whiteboard', recovery: 'desk', 'crash-cart': 'ppe', lights: 'packing' });
    return c.H;
  };

  // ================================================================== biomed-lab 生醫工程實驗室
  ROOMS['biomed-lab'] = function (c) {
    const L = toolkit(c), P = L.prop, I = L.info, say = L.say; L.tint('#c6cfd7');
    I('bm-bench', '生醫工程實驗島台', 'Biomedical engineering island', '細胞與材料實驗的共用檯面：微量吸管、離心管架、渦旋混合器、加熱攪拌器、原型穿戴裝置與 3D 列印骨模型。生物與電子工作分區，避免液體靠近電路。', 'Shared bench for cell and materials work: pipettes, tube racks, vortex, hot-plate stirrer, a wearable prototype and a printed bone model. Wet biology and electronics are kept in separate zones — no liquids near circuits.');
    I('bm-bsc', '第二級生物安全櫃', 'Class II biosafety cabinet', '細胞培養與開蓋檢體在櫃內操作：開機預吹、氣流指示正常、物品不擋前格柵、手臂慢進慢出；用畢消毒檯面，紫外燈只在無人時開。', 'Cell culture and open samples are handled inside: purge first, check the airflow display, keep the front grille clear, move arms slowly; disinfect the work surface afterwards and run UV only when nobody is there.');
    I('bm-incubator', '二氧化碳培養箱', 'CO₂ incubator', '維持細胞培養所需的溫度、濕度與二氧化碳濃度；開門次數越少越好，水盤定期更換、內部定期消毒，鋼瓶壓力每日檢查。', 'Keeps the temperature, humidity and CO₂ that cultures need; open the door as little as possible, change the water pan and disinfect inside on schedule, check cylinder pressure daily.');
    I('bm-freezer', '超低溫冷凍櫃', 'Ultra-low freezer', '細胞株與生物檢體長期保存；位置圖與庫存登錄，溫度警報接到值班手機；取物戴防凍手套、快速關門。', 'Long-term storage of cell lines and samples; a rack map and inventory log, temperature alarms ring the on-call phone; cryo gloves and a quick door.');
    I('bm-fridge', '4 °C 試劑冰箱', '4 °C reagent fridge', '培養基、酵素與試劑冷藏；開封日期標示、溫度每日記錄，食物飲料絕對不放。', 'Media, enzymes and reagents; opening dates marked, temperature logged daily, never food or drink.');
    I('bm-printer', '3D 列印機（FDM＋光固化）', '3D printers (FDM + resin)', 'FDM 列印解剖教學模型（頭骨），光固化樹脂列印病人專屬手術導板。臨床用導板需生物相容材料、尺寸驗證與確效過的清洗滅菌流程；樹脂與異丙醇在通風下操作並戴手套。', 'FDM prints teaching anatomy models (a skull); the resin printer makes a patient-specific surgical guide. Clinical guides need biocompatible material, dimensional checks and a validated cleaning and sterilisation process; handle resin and IPA with gloves and ventilation.');
    I('bm-electronics', '電子量測工作台', 'Electronics bench', '示波器、函數產生器、電源供應器與焊台，用來開發與量測生理感測原型（如心電、光體積描記）。防靜電腕帶與桌墊；原型不可接到真人身上，除非經過電氣安全測試與倫理審查。', 'Oscilloscope, function generator, bench supply and soldering station for developing biosignal sensor prototypes (ECG, PPG). ESD wrist strap and mat; prototypes never go on a person without electrical-safety testing and ethics approval.');
    I('bm-testrig', '材料萬能試驗機', 'Universal testing machine', '對骨板、支架或縫線試片做拉伸、壓縮或彎曲測試，得到應力－應變曲線；依標準方法夾持試片，試驗時關上防護罩。', 'Tensile, compression or bending tests on plates, scaffolds or suture specimens give a stress–strain curve; specimens are gripped per the standard method and the guard is closed during a test.');
    I('bm-shelves', '耗材與零件架', 'Consumables & parts shelving', '線材、耗材、電子零件與列印線材分類存放並標示；化學品與鋰電池依規定分開儲存。', 'Filament, consumables and electronic parts sorted and labelled; chemicals and lithium batteries stored separately as required.');
    I('bm-microscope', '倒立顯微鏡與攝影系統', 'Inverted microscope & camera', '從培養皿底部觀察活細胞貼附與型態（相位差），攝影機擷取影像做量化；觀察時間短、避免培養基降溫。', 'Looks up through the dish bottom at living cells (phase contrast); the camera captures images for quantification. Keep sessions short so the medium does not cool.');
    I('bm-centrifuge', '桌上型冷凍離心機', 'Benchtop refrigerated centrifuge', '對稱配重、蓋好再啟動、停穩才開；生物檢體用密封轉子，破管時依生物安全程序處理。', 'Balance symmetrically, close the lid before starting, open only when stopped; sealed rotors for biological samples, broken tubes follow the biosafety procedure.');
    I('bm-workstation', 'CAD／影像分割工作站', 'CAD & segmentation workstation', '從 CT 影像分割骨骼、建立 3D 模型，設計導板與植入物並輸出 STL；病人影像去識別化，檔案版本與設計審查紀錄要保存。', 'Segments bone from CT, builds the 3D model, designs guides and implants and exports STL; patient images are de-identified, file versions and design reviews are kept.');
    I('bm-desk', '實驗紀錄與設計管制桌', 'Lab notebook & design-control desk', '實驗紀錄本逐日記錄、簽名；醫療器材開發依設計管制（需求、驗證、確效、風險管理）留存設計歷史檔。', 'The lab notebook is dated and signed daily; device development follows design controls (inputs, verification, validation, risk management) kept in the design history file.');
    I('bm-sink', '洗手槽與洗眼器', 'Hand-wash sink & eyewash', '進出實驗室洗手；水龍頭附洗眼器，每週測試出水。生物廢液先消毒再排放，化學廢液分類收集。', 'Wash hands on the way in and out; the faucet-mounted eyewash is tested weekly. Biological liquid waste is disinfected first; chemical waste is collected by category.');
    I('bm-chart', '實驗計畫與 SOP', 'Protocol & SOPs', '每個實驗都有核准的計畫、風險評估與 SOP；生物材料使用需生物安全委員會核准。', 'Every experiment has an approved protocol, risk assessment and SOP; biological materials need biosafety committee approval.');
    I('bm-whiteboard', '專案與設計審查白板', 'Project & design-review board', '專案進度：需求 → 設計 → 驗證 → 確效；本週設計審查與待辦。', 'Project status: requirements → design → verification → validation; this week’s design review and to-dos.');
    // ---- back wall: BSC, CO₂ incubators, −80 freezer, fridge; 3D printers under the window
    P('hood', [-4.55, 0, -4.05], 0, { name: ['第二級生物安全櫃', 'Class II biosafety cabinet'], info: 'bm-bsc', equip: 'lab' }, (k, S, Q) => {
      const w = 1.35, d = 0.82; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => k.box(0.05, 0.72, 0.05, a * (w / 2 - 0.06), 0.36, b * (d / 2 - 0.08), '#5a646b', 'paint')); k.box(w - 0.1, 0.03, d - 0.14, 0, 0.15, 0, '#5a646b', 'paint');
      k.box(w, 0.16, d, 0, 0.8, 0, '#eef1f2', 'paint'); k.box(w, 1.25, 0.04, 0, 1.5, -d / 2 + 0.02, '#eef1f2', 'paint'); [-1, 1].forEach(s => k.box(0.06, 1.25, d, s * (w / 2 - 0.03), 1.5, 0, '#eef1f2', 'paint')); k.box(w, 0.42, d, 0, 2.33, 0, '#eef1f2', 'paint');
      k.box(w - 0.12, 0.012, d - 0.16, 0, 0.885, -0.02, C.steel, 'metal'); k.box(w - 0.12, 0.03, 0.08, 0, 0.9, d / 2 - 0.06, '#c9d0d3', 'metal'); for (let i = 0; i < 12; i++) k.box(0.01, 0.031, 0.06, -w / 2 + 0.12 + i * 0.1, 0.91, d / 2 - 0.06, C.ink, 'plastic');
      k.box(w - 0.12, 0.62, 0.016, 0, 1.25, d / 2 - 0.02, '#cfe6f0', 'glass', -0.17, 0, 0); k.box(w - 0.12, 0.03, 0.04, 0, 0.95, d / 2 + 0.03, C.steel2, 'satin'); k.box(w - 0.22, 0.03, 0.2, 0, 2.08, -0.1, '#ffffff', 'glow'); k.box(w - 0.3, 0.02, 0.02, 0, 2.06, 0.1, '#b9a6ff', 'plastic');
      k.box(w - 0.1, 0.16, 0.02, 0, 2.3, d / 2 + 0.01, '#2b3036', 'plastic'); S(0.34, 0.11, panelCanvas(c, [say('氣流正常', 'Airflow OK'), say('下吹・吸入 ✓', 'down · in ✓')], '#10261a'), -0.3, 2.3, d / 2 + 0.022, 0, 1.0); k.box(0.05, 0.03, 0.005, 0.4, 2.3, d / 2 + 0.022, C.led, 'glow');
      k.rbox(0.06, 0.2, 0.05, 0.01, -0.35, 0.99, -0.05, '#f4f6f8', 'plastic', 0.3, 0, 0); k.rbox(0.16, 0.05, 0.1, 0.01, 0.1, 0.92, -0.08, '#5fa8e0', 'plastic'); for (let i = 0; i < 5; i++) k.cyl(0.012, 0.012, 0.09, 0.04 + i * 0.03, 0.97, -0.08, '#f2f6f8', 'glass', 0, 0, 0, 6); beaker(k, 0.38, 0.89, -0.1, 0.05, 0.12, '#f3c9d6');
      stool(k, 0.0, 0.72, 0.66, '#2f6f8f');
      Q.push({ p: [0.0, 2.48, d / 2 + 0.012], w: 0.42, h: 0.21, uv: L.tag('BSC II', say('生物安全櫃', 'Biosafety cabinet'), { band: '#c0392b' }) }); Q.push({ p: [0.42, 1.0, d / 2 + 0.005], w: 0.16, h: 0.08, uv: L.tag('BSL-2', say('生物危害', 'biohazard'), { band: '#d68a00', bg: '#fff3c4' }) });
    });
    P('incubator', [-3.05, 0, -4.12], 0, { name: ['二氧化碳培養箱', 'CO₂ incubator'], info: 'bm-incubator', equip: 'lab' }, (k, S, Q) => {
      k.box(0.72, 0.2, 0.72, 0, 0.1, 0, '#5a646b', 'paint'); [0, 1].forEach(j => { const y = 0.2 + j * 0.88; k.rbox(0.7, 0.86, 0.72, 0.02, 0, y + 0.43, 0, '#f2f4f5', 'paint'); k.box(0.62, 0.78, 0.015, -0.02, y + 0.43, 0.365, '#f8f9f9', 'paint'); k.box(0.03, 0.3, 0.04, 0.27, y + 0.45, 0.38, C.grey, 'satin'); k.box(0.2, 0.08, 0.005, -0.12, y + 0.76, 0.374, '#13241c', 'plastic'); k.box(0.14, 0.03, 0.004, -0.12, y + 0.77, 0.378, C.led, 'glow'); });
      k.cyl(0.11, 0.11, 1.35, 0.52, 0.7, -0.18, '#6d7a82', 'paint', 0, 0, 0, 14); k.sph(0.11, 0.08, 0.11, 0.52, 1.375, -0.18, '#6d7a82', 'paint', 10); k.rbox(0.08, 0.1, 0.08, 0.02, 0.52, 1.5, -0.18, C.steel, 'metal'); k.tor(0.13, 0.008, 0.52, 1.1, -0.18, C.grey, 'satin', H2, 0, 0, PI * 2, 8); k.tube([[0.52, 1.55, -0.18], [0.45, 1.7, -0.3], [0.3, 1.5, -0.3]], 0.006, '#2f6fd0', 'rubber', 12, 4);
      Q.push({ p: [-0.12, 1.84, 0.374], w: 0.2, h: 0.08, uv: L.tag('37 °C · CO₂', say('培養箱 A', 'Incubator A')) }); Q.push({ p: [0.52, 0.9, -0.068], w: 0.14, h: 0.07, ry: 0, uv: L.tag('CO₂', say('鋼瓶固定', 'chained'), { band: '#6d7a82' }) });
    });
    P('freezer', [-1.9, 0, -4.1], 0, { name: ['超低溫冷凍櫃', 'Ultra-low freezer'], info: 'bm-freezer', equip: 'cart' }, (k, S, Q) => {
      k.rbox(0.82, 1.95, 0.84, 0.02, 0, 0.99, 0, '#f2f4f5', 'paint'); k.box(0.74, 1.7, 0.02, 0, 0.95, 0.42, '#f8f9f9', 'paint'); k.box(0.05, 0.4, 0.06, 0.3, 1.1, 0.45, C.grey, 'satin'); k.box(0.3, 0.12, 0.01, -0.12, 1.86, 0.425, '#0e2236', 'plastic'); k.box(0.18, 0.05, 0.005, -0.12, 1.87, 0.432, '#5ab8ff', 'glow'); k.box(0.03, 0.03, 0.005, 0.08, 1.87, 0.432, C.led, 'glow'); c.castors(k, [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]], 0.04);
      Q.push({ p: [-0.12, 1.72, 0.432], w: 0.24, h: 0.12, uv: L.tag('−80 °C', say('庫存圖登錄', 'log the rack map'), { band: '#1f5c99' }) });
    });
    P('fridge', [-0.85, 0, -4.12], 0, { name: ['4 °C 試劑冰箱', '4 °C reagent fridge'], info: 'bm-fridge', equip: 'cart' }, (k, S, Q) => {
      k.box(0.7, 1.9, 0.04, 0, 0.95, -0.33, '#eef1f2', 'paint'); [-0.33, 0.33].forEach(x => k.box(0.04, 1.9, 0.7, x, 0.95, 0, '#eef1f2', 'paint')); k.box(0.7, 0.3, 0.7, 0, 0.15, 0, '#eef1f2', 'paint'); k.box(0.7, 0.2, 0.7, 0, 1.8, 0, '#eef1f2', 'paint'); k.box(0.62, 1.4, 0.02, 0, 1.0, 0.35, '#bfe0f0', 'glass');
      for (let i = 0; i < 4; i++) { k.box(0.6, 0.015, 0.5, 0, 0.45 + i * 0.36, 0.05, '#cfd6da', 'satin'); for (let j = 0; j < 5; j++) k.rbox(0.07, 0.1, 0.07, 0.01, -0.2 + j * 0.1, 0.51 + i * 0.36, 0.1, ['#f3c9d6', '#f4f6f8', '#f1c40f', '#5fa8e0', '#f3c9d6'][j], 'plastic'); } k.box(0.04, 0.5, 0.04, 0.3, 1.1, 0.37, C.grey, 'satin'); k.box(0.1, 0.03, 0.005, -0.15, 1.78, 0.362, C.led, 'glow');
      Q.push({ p: [-0.12, 1.8, 0.352], w: 0.16, h: 0.08, uv: L.tag('4 °C', say('培養基・試劑', 'media · reagents')) });
    });
    let head = null, bed = null;
    P('printer3d', [3.15, 0, -4.15], 0, { name: ['3D 列印機（FDM＋光固化）', '3D printers (FDM + resin)'], info: 'bm-printer', equip: 'device' }, (k, S, Q, g) => {
      baseRun(k, 2.4, 0.66, { top: '#3a454d' });
      const fx = -0.55; k.rbox(0.5, 0.06, 0.42, 0.01, fx, TOP + 0.03, -0.02, '#2b3036', 'paint'); [-0.22, 0.22].forEach(x => k.box(0.04, 0.5, 0.04, fx + x, TOP + 0.31, -0.18, '#2b3036', 'paint')); k.box(0.48, 0.04, 0.04, fx, TOP + 0.56, -0.18, '#2b3036', 'paint'); k.rbox(0.14, 0.12, 0.1, 0.01, fx + 0.22, TOP + 0.1, 0.18, '#f26b1d', 'plastic'); k.box(0.08, 0.04, 0.004, fx + 0.22, TOP + 0.1, 0.232, '#9fe1ff', 'glow');
      k.cyl(0.09, 0.09, 0.06, fx - 0.36, TOP + 0.45, -0.18, '#2fa36b', 'plastic', 0, 0, H2, 16); k.cyl(0.035, 0.035, 0.065, fx - 0.36, TOP + 0.45, -0.18, '#d6dcdf', 'plastic', 0, 0, H2, 10); k.box(0.04, 0.3, 0.04, fx - 0.36, TOP + 0.25, -0.18, '#2b3036', 'paint'); k.tube([[fx - 0.3, TOP + 0.46, -0.18], [fx - 0.12, TOP + 0.62, -0.1], [fx, TOP + 0.36, -0.05]], 0.003, '#2fa36b', 'plastic', 16, 3);
      // moving bed (skull slice texture + partly printed cranium) and moving extruder carriage
      const bk = c.makeKit(c.K); bk.box(0.3, 0.012, 0.3, 0, 0, 0, '#20262c', 'metal'); bk.lathe([[0.001, 0.0], [0.08, 0.0], [0.085, 0.03], [0.07, 0.06], [0.04, 0.075]], 0, 0.006, 0, '#f0ebe0', 'plastic', 14); const bedG = bk.build({ shadow: false }); const bt = L.screenOf(0.3, 0.3, bedCanvas(c), 0, 0.0065, 0, 0, 0.35, -H2); bedG.add(bt); bedG.position.set(fx, TOP + 0.09, -0.02); g.add(bedG); bed = bedG;
      const hk = c.makeKit(c.K); hk.box(0.07, 0.08, 0.06, 0, 0, 0, '#f26b1d', 'plastic'); hk.cyl(0.006, 0.002, 0.03, 0, -0.055, 0.0, C.steel, 'metal', 0, 0, 0, 6); hk.box(0.02, 0.02, 0.005, 0, 0.01, 0.031, '#ffb347', 'glow'); const headG = hk.build({ shadow: false }); headG.position.set(fx, TOP + 0.22, -0.02); g.add(headG); head = headG; k.box(0.44, 0.02, 0.03, fx, TOP + 0.26, -0.02, C.steel2, 'metal');
      const rx = 0.25; k.rbox(0.3, 0.16, 0.3, 0.02, rx, TOP + 0.08, -0.05, '#e9ecec', 'paint'); k.rbox(0.28, 0.32, 0.28, 0.02, rx, TOP + 0.32, -0.05, '#ff8a1e', 'fluid'); k.box(0.14, 0.02, 0.14, rx, TOP + 0.38, -0.05, C.steel2, 'metal'); k.cyl(0.008, 0.008, 0.2, rx, TOP + 0.48, -0.05, C.steel2, 'metal', 0, 0, 0, 6); k.tor(0.05, 0.008, rx, TOP + 0.36, -0.05, '#7ec9ff', 'paint', 0, 0, 0, PI, 10); [-0.03, 0.03].forEach(x => k.cyl(0.008, 0.008, 0.03, rx + x, TOP + 0.36, 0.0, C.steel, 'metal', H2, 0, 0, 8)); k.box(0.1, 0.035, 0.004, rx, TOP + 0.1, 0.101, '#9fe1ff', 'glow');
      k.rbox(0.22, 0.24, 0.22, 0.02, 0.62, TOP + 0.12, -0.08, '#2b3036', 'plastic'); k.rbox(0.22, 0.2, 0.22, 0.02, 0.88, TOP + 0.1, -0.08, '#2b3036', 'plastic'); k.box(0.16, 0.06, 0.004, 0.62, TOP + 0.2, 0.031, '#7d4bff', 'glow');
      k.rbox(0.3, 0.02, 0.18, 0.01, 0.75, TOP + 0.01, 0.18, '#dfe5e8', 'paint'); k.lathe([[0.001, 0], [0.05, 0], [0.06, 0.04], [0.04, 0.07], [0.001, 0.08]], 0.68, TOP + 0.02, 0.18, '#f0ebe0', 'plastic', 12); k.tor(0.04, 0.008, 0.82, TOP + 0.03, 0.18, '#7ec9ff', 'paint', H2, 0, 0, PI, 10);
      Q.push({ p: [fx - 0.08, TOP + 0.03, 0.192], w: 0.16, h: 0.05, uv: L.tag('FDM', say('頭骨教學模型', 'skull model')) }); Q.push({ p: [rx, TOP + 0.52, 0.092], w: 0.22, h: 0.08, uv: L.tag(say('光固化', 'Resin'), say('手術導板', 'surgical guide'), { band: '#f26b1d' }) }); Q.push({ p: [0.75, TOP + 0.022, 0.18], w: 0.22, h: 0.1, up: true, uv: L.tag(say('完成品', 'Finished'), say('待尺寸驗證', 'to measure'), { size: 18 }) });
      Q.push({ p: [0.75, TOP + 0.26, 0.031], w: 0.24, h: 0.08, uv: L.tag(say('清洗・二次固化', 'Wash · cure'), 'IPA', { band: '#7d4bff' }) });
    });
    if (head) L.anim(L.firstMesh(head), t => { head.position.x = -0.55 + 0.11 * Math.sin(t * 0.9); head.position.z = -0.02 + 0.08 * Math.sin(t * 0.37); }); if (bed) L.anim(L.firstMesh(bed), t => { bed.position.z = -0.02 + 0.03 * Math.sin(t * 0.37 + 1.2); });
    if (c.objs.printer3d) Object.assign(c.objs.printer3d.userData, { head, bed });
    // ---- right wall: electronics bench, testing machine
    let scope = null;
    P('electronics', [5.12, 0, -1.9], -H2, { name: ['電子量測工作台', 'Electronics bench'], info: 'bm-electronics', equip: 'device' }, (k, S, Q) => {
      baseRun(k, 2.4, 0.75, { top: '#46525c' }); k.box(2.3, 0.003, 0.6, 0, TOP + 0.002, 0.02, '#3c6f9a', 'rubber'); k.box(2.4, 0.03, 0.3, 0, TOP + 0.62, -0.22, '#dfe5e8', 'paint'); [-1.15, 1.15].forEach(x => k.box(0.03, 0.62, 0.3, x, TOP + 0.31, -0.22, '#dfe5e8', 'paint'));
      for (let i = 0; i < 10; i++) k.box(0.18, 0.1, 0.22, -0.95 + i * 0.21, TOP + 0.69, -0.22, ['#e74c3c', '#f1c40f', '#2fa36b', '#2f6fd0', '#f4f6f8'][i % 5], 'plastic');
      k.rbox(0.4, 0.2, 0.28, 0.015, -0.55, TOP + 0.1, -0.12, '#2b3036', 'plastic'); k.box(0.22, 0.14, 0.004, -0.62, TOP + 0.11, 0.022, '#081610', 'plastic'); scope = S(0.2, 0.12, scopeCanvas(c), -0.62, TOP + 0.11, 0.025, 0, 1.15); for (let i = 0; i < 6; i++) k.cyl(0.01, 0.01, 0.02, -0.44 + (i % 2) * 0.05, TOP + 0.16 - Math.floor(i / 2) * 0.045, 0.03, '#9aa5aa', 'plastic', H2, 0, 0, 8);
      k.rbox(0.3, 0.12, 0.25, 0.015, -0.1, TOP + 0.06, -0.12, '#dfe5e8', 'paint'); k.box(0.12, 0.04, 0.004, -0.15, TOP + 0.08, 0.008, '#ff5a3c', 'glow'); k.box(0.12, 0.04, 0.004, -0.15, TOP + 0.03, 0.008, '#4dff8f', 'glow'); [['#e74c3c', 0.0], ['#1d262c', 0.05]].forEach(([col, x]) => k.cyl(0.008, 0.008, 0.02, x, TOP + 0.04, 0.01, col, 'plastic', H2, 0, 0, 8));
      k.rbox(0.24, 0.1, 0.2, 0.015, 0.3, TOP + 0.05, -0.1, '#2b3036', 'plastic'); k.box(0.1, 0.03, 0.004, 0.27, TOP + 0.06, 0.002, '#ffb347', 'glow'); k.cyl(0.04, 0.05, 0.02, 0.48, TOP + 0.01, 0.1, C.ink, 'plastic', 0, 0, 0, 12); k.tube([[0.48, TOP + 0.02, 0.1], [0.5, TOP + 0.12, 0.12], [0.42, TOP + 0.08, 0.2]], 0.006, '#f2c230', 'plastic', 10, 4); k.cyl(0.006, 0.002, 0.14, 0.42, TOP + 0.07, 0.22, C.steel, 'metal', 0.9, 0, 0.4, 6);
      k.box(0.16, 0.012, 0.1, 0.1, TOP + 0.03, 0.2, '#1f7a3a', 'paint'); [[0.06, 0.18], [0.13, 0.2], [0.1, 0.23]].forEach(([x, z]) => k.box(0.025, 0.006, 0.02, x, TOP + 0.04, z, C.ink, 'plastic')); k.box(0.012, 0.012, 0.012, 0.16, TOP + 0.042, 0.17, '#ff3b3b', 'glow'); k.rbox(0.05, 0.05, 0.05, 0.01, 0.18, TOP + 0.06, 0.22, C.grey, 'satin');
      k.tube([[-0.45, TOP + 0.05, 0.02], [-0.2, TOP + 0.02, 0.15], [0.06, TOP + 0.04, 0.2]], 0.004, '#2f6fd0', 'rubber', 14, 4); k.tube([[-0.1, TOP + 0.04, 0.01], [0.0, TOP + 0.02, 0.12], [0.14, TOP + 0.04, 0.22]], 0.004, '#e74c3c', 'rubber', 14, 4);
      k.rbox(0.2, 0.2, 0.2, 0.02, 0.85, TOP + 0.1, -0.15, '#2b3036', 'plastic'); k.cyl(0.06, 0.06, 0.01, 0.85, TOP + 0.13, -0.044, '#5a646b', 'plastic', H2, 0, 0, 14); k.seg([0.95, TOP + 0.2, -0.15], [0.7, TOP + 0.5, -0.05], 0.01, 0.01, C.white, 'paint', 6); k.tor(0.06, 0.012, 0.65, TOP + 0.48, 0.05, C.white, 'paint', 1.2, 0, 0, PI * 2, 10); k.disc(0.055, 0.65, TOP + 0.47, 0.06, '#fffbe6', 'glow', 1.2 - H2, 0, 0, 12);
      stool(k, -0.2, 0.75, 0.66, '#2f6f8f');
      Q.push({ p: [-0.55, TOP + 0.22, 0.021], w: 0.14, h: 0.05, uv: L.tag('CH1 ECG', 'CH2 PPG', { size: 16 }) }); Q.push({ p: [0.1, TOP + 0.04, 0.27], w: 0.14, h: 0.07, up: true, uv: L.tag(say('感測原型', 'Sensor proto'), 'rev B', { band: '#1f7a3a' }) }); Q.push({ p: [-0.95, TOP + 0.6, -0.068], w: 0.26, h: 0.1, uv: L.tag(say('防靜電區', 'ESD area'), say('戴腕帶', 'wear strap'), { band: '#f1c40f' }) });
    });
    if (scope) { const tx = scope.material.map; L.anim(scope, t => { tx.offset.x = (t * 0.18) % 1; }); c.objs.electronics.userData.scopeTex = tx; }
    P('testrig', [4.95, 0, 0.95], -H2, { name: ['材料萬能試驗機', 'Universal testing machine'], info: 'bm-testrig', equip: 'device' }, (k, S, Q) => {
      legTable(k, 1.3, 0.75, 0.8, '#5a646b', 'paint'); k.rbox(0.5, 0.18, 0.36, 0.02, -0.2, 0.89, -0.05, '#2f6f8f', 'paint'); [-0.38, -0.02].forEach(x => k.cyl(0.025, 0.025, 1.05, x, 1.5, -0.05, '#dfe5e8', 'metal', 0, 0, 0, 12)); k.rbox(0.5, 0.12, 0.2, 0.02, -0.2, 2.06, -0.05, '#2f6f8f', 'paint'); k.box(0.44, 0.08, 0.14, -0.2, 1.62, -0.05, '#e0e5e7', 'metal');
      k.cyl(0.03, 0.03, 0.08, -0.2, 1.54, -0.05, C.ink, 'paint', 0, 0, 0, 10); k.box(0.07, 0.07, 0.05, -0.2, 1.47, -0.05, C.steel2, 'metal'); k.box(0.07, 0.07, 0.05, -0.2, 1.08, -0.05, C.steel2, 'metal'); k.box(0.02, 0.32, 0.006, -0.2, 1.27, -0.05, '#e8e2c8', 'paint'); k.box(0.012, 0.12, 0.008, -0.2, 1.27, -0.05, '#e8e2c8', 'paint');
      k.box(0.46, 0.85, 0.01, -0.2, 1.45, 0.16, '#d6eef8', 'glass'); k.rbox(0.3, 0.02, 0.22, 0.01, 0.38, 0.81, 0.05, '#2b3036', 'plastic'); k.rbox(0.3, 0.2, 0.012, 0.01, 0.38, 0.93, -0.06, '#2b3036', 'plastic', -0.25, 0, 0); S(0.27, 0.17, curveCanvas(c), 0.38, 0.93, -0.052, 0, 0.95, -0.25);
      Q.push({ p: [-0.2, 0.89, 0.13], w: 0.2, h: 0.08, uv: L.tag(say('拉伸試驗', 'Tensile test'), say('防護罩關閉', 'guard closed'), { band: '#2f6f8f' }) });
    });
    // ---- left wall: shelves, inverted microscope, centrifuge bench
    P('shelves', [-5.25, 0, -1.7], H2, { name: ['耗材與零件架', 'Consumables & parts shelving'], info: 'bm-shelves', equip: 'cart' }, (k, S, Q) => {
      wireShelf(k, 1.6, 0.44, [0.12, 0.52, 0.92, 1.32, 1.72], 1.9);
      for (let i = 0; i < 6; i++) k.cyl(0.09, 0.09, 0.06, -0.62 + i * 0.25, 1.42, 0.02, ['#2fa36b', '#f4f6f8', '#e74c3c', '#2f6fd0', '#f1c40f', '#2b3036'][i], 'plastic', H2, 0, 0, 14); for (let i = 0; i < 8; i++) k.box(0.16, 0.1, 0.3, -0.65 + i * 0.185, 0.98, 0, ['#e74c3c', '#f1c40f', '#2f6fd0', '#2fa36b'][i % 4], 'plastic');
      for (let i = 0; i < 4; i++) k.box(0.34, 0.26, 0.36, -0.56 + i * 0.37, 0.26, 0, '#e3e9ec', 'paint'); for (let i = 0; i < 5; i++) k.box(0.26, 0.22, 0.3, -0.6 + i * 0.3, 0.64, 0, ['#f4f6f8', '#dfe8ee'][i % 2], 'paint'); for (let i = 0; i < 6; i++) k.box(0.2, 0.12, 0.2, -0.6 + i * 0.24, 1.79, 0, '#f4f6f8', 'paint');
      [['線材', 'Filament', '#2fa36b', 1.38], ['電子零件', 'Components', '#2f6fd0', 0.98], ['培養耗材', 'Culture ware', '#c0392b', 0.58], ['鋰電池分開', 'Li cells apart', '#d68a00', 1.78]].forEach(([zh, en, band, y], i) => Q.push({ p: [-0.55 + (i % 2) * 1.1, y - 0.03, 0.235], w: 0.2, h: 0.1, uv: L.tag(zh, en, { band }) }));
    });
    P('microscope', [-5.1, 0, 0.45], H2, { name: ['倒立顯微鏡與攝影系統', 'Inverted microscope & camera'], info: 'bm-microscope', equip: 'microscope' }, (k, S, Q) => {
      [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].forEach(([x, z]) => k.box(0.07, 0.72, 0.07, x, 0.36, z, '#5a646b', 'paint')); k.rbox(1.2, 0.08, 0.7, 0.01, 0, 0.78, 0, '#3a4148', 'paint');
      const mx = -0.15; k.rbox(0.26, 0.12, 0.42, 0.02, mx, 0.88, -0.02, '#e9ecec', 'paint'); k.box(0.06, 0.4, 0.06, mx, 1.1, -0.2, '#e9ecec', 'paint'); k.flat([mx, 1.3, -0.2], [mx, 1.36, 0.0], 0.05, 0.05, '#e9ecec', 'paint'); k.box(0.24, 0.02, 0.2, mx, 1.05, 0.02, C.ink, 'satin'); k.disc(0.035, mx, 1.04, 0.02, '#cfe8c8', 'glass', -H2, 0, 0, 14); k.cyl(0.045, 0.045, 0.012, mx, 1.062, 0.02, '#e8f3f6', 'glass', 0, 0, 0, 14); k.cyl(0.03, 0.03, 0.006, mx, 1.07, 0.02, '#f3c9d6', 'fluid', 0, 0, 0, 12);
      [0, 1, 2].forEach(i => { const a = i * 0.8 - 0.8; k.cyl(0.01, 0.008, 0.05, mx + Math.sin(a) * 0.03, 1.0, 0.02 + Math.cos(a) * 0.03, '#b8c1c6', 'metal', 0, 0, 0, 6); }); [-0.028, 0.028].forEach(x => k.cyl(0.011, 0.011, 0.09, mx + x, 1.02, 0.2, C.ink, 'plastic', -1.0, 0, 0, 8));
      k.rbox(0.1, 0.08, 0.1, 0.01, mx + 0.18, 0.98, -0.02, C.ink, 'plastic'); k.cyl(0.025, 0.025, 0.06, mx + 0.13, 0.98, -0.02, C.ink, 'plastic', 0, 0, H2, 10); k.tube([[mx + 0.23, 0.98, -0.02], [mx + 0.32, 0.9, -0.15], [0.32, 0.86, -0.2]], 0.005, C.ink, 'rubber', 14, 4);
      monitor(k, S, 0.32, 0.82, -0.15, 0.46, 0.29, cellsCanvas(c), -0.3, 0.95); stool(k, -0.15, 0.62, 0.66, '#2f6f8f');
      Q.push({ p: [mx, 0.88, 0.19], w: 0.16, h: 0.06, uv: L.tag(say('倒立顯微', 'Inverted'), say('相位差', 'phase'), { size: 18 }) });
    });
    P('centrifuge', [-5.1, 0, 2.3], H2, { name: ['桌上型冷凍離心機', 'Benchtop refrigerated centrifuge'], info: 'bm-centrifuge', equip: 'lab' }, (k, S, Q) => {
      baseRun(k, 1.4, 0.7); k.rbox(0.56, 0.36, 0.58, 0.04, -0.25, TOP + 0.18, -0.02, '#e9ecec', 'paint'); k.cyl(0.22, 0.22, 0.03, -0.25, TOP + 0.37, -0.02, '#9fd3e8', 'glass', 0, 0, 0, 22); k.box(0.36, 0.06, 0.04, -0.25, TOP + 0.12, 0.275, C.ink, 'plastic'); k.box(0.12, 0.025, 0.005, -0.3, TOP + 0.12, 0.297, '#5ab8ff', 'glow');
      k.rbox(0.12, 0.08, 0.12, 0.02, 0.25, TOP + 0.04, 0.05, C.white, 'paint'); k.cyl(0.03, 0.03, 0.02, 0.25, TOP + 0.09, 0.05, '#2b3036', 'rubber', 0, 0, 0, 10); k.cyl(0.07, 0.08, 0.1, 0.48, TOP + 0.05, 0.0, C.white, 'paint', 0, 0, 0, 14); k.cyl(0.06, 0.06, 0.02, 0.48, TOP + 0.11, 0.0, '#9fd3e8', 'glass', 0, 0, 0, 14);
      Q.push({ p: [-0.25, TOP + 0.24, 0.272], w: 0.2, h: 0.08, uv: L.tag(say('對稱配重', 'Balance tubes'), '4 °C', { band: '#2f6f8f' }) });
    });
    // ---- island bench (main)
    P('bench', [-0.4, 0, -0.85], 0, { name: ['生醫工程實驗島台', 'Biomedical engineering island'], info: 'bm-bench', equip: 'lab' }, (k, S, Q) => {
      const Lb = 3.4, D = 1.5; baseRun(k, Lb, D, { two: true, top: '#3a454d' }); k.box(Lb - 0.3, 0.3, 0.14, 0, TOP + 0.15, 0, C.lam2, 'paint'); [-1.55, 0, 1.55].forEach(x => k.box(0.03, 0.5, 0.3, x, TOP + 0.55, 0, C.steel2, 'metal')); [1.3, 1.62].forEach(y => k.box(Lb - 0.18, 0.024, 0.3, 0, y, 0, '#dfe4e6', 'paint'));
      for (let i = 0; i < 12; i++) { const x = -1.45 + i * 0.26; if (i % 2) k.box(0.16, 0.1, 0.12, x, 1.365, 0.02, ['#f4f6f8', '#e3f0f6'][i % 4 > 1 ? 1 : 0], 'paint'); else bottle(k, x, 1.312, 0.03, 0.04, 0.16, '#f2f6f8', 'solid', ['#c0392b', '#2f6fd0', '#2fa36b'][i % 3]); if (i % 3 === 0) k.box(0.2, 0.08, 0.12, x + 0.1, 1.67, 0.0, '#f4f6f8', 'paint'); }
      k.cyl(0.08, 0.1, 0.02, -1.15, TOP + 0.01, 0.42, '#d6dcdf', 'paint', 0, 0, 0, 14); k.cyl(0.012, 0.012, 0.32, -1.15, TOP + 0.17, 0.42, C.grey, 'satin', 0, 0, 0, 8); for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; k.cyl(0.012, 0.008, 0.26, -1.15 + Math.cos(a) * 0.06, TOP + 0.2, 0.42 + Math.sin(a) * 0.06, ['#2f6fd0', '#f1c40f', '#e74c3c', '#2fa36b', '#f4f6f8'][i], 'plastic', 0.15 * Math.sin(a), 0, -0.15 * Math.cos(a), 8); }
      k.rbox(0.24, 0.05, 0.1, 0.01, -0.8, TOP + 0.025, 0.42, '#5fa8e0', 'plastic'); for (let i = 0; i < 6; i++) k.cyl(0.008, 0.008, 0.1, -0.9 + i * 0.04, TOP + 0.07, 0.42, '#f2f6f8', 'glass', 0, 0, 0, 6); k.rbox(0.12, 0.08, 0.12, 0.02, -0.5, TOP + 0.04, 0.45, C.white, 'paint'); k.cyl(0.03, 0.03, 0.02, -0.5, TOP + 0.09, 0.45, '#2b3036', 'rubber', 0, 0, 0, 10);
      k.rbox(0.36, 0.015, 0.25, 0.008, 0.05, TOP + 0.008, 0.42, '#2b3036', 'plastic'); k.rbox(0.36, 0.24, 0.012, 0.008, 0.05, TOP + 0.12, 0.3, '#2b3036', 'plastic', -0.2, 0, 0); S(0.33, 0.21, cadCanvas(c), 0.05, TOP + 0.12, 0.308, 0, 0.9, -0.2);
      k.lathe([[0.001, 0], [0.03, 0], [0.032, 0.02], [0.02, 0.05], [0.02, 0.3], [0.035, 0.34], [0.03, 0.37], [0.001, 0.38]], 0.55, TOP + 0.034, 0.42, '#f0ebe0', 'plastic', 12, 0, 0, H2 * 0.95); k.rbox(0.18, 0.012, 0.06, 0.01, 0.6, TOP + 0.03, 0.55, '#7ec9ff', 'paint');
      k.rbox(0.1, 0.04, 0.16, 0.02, 0.95, TOP + 0.02, 0.42, '#2b3036', 'plastic'); k.tor(0.05, 0.012, 0.95, TOP + 0.045, 0.58, '#2b3036', 'rubber', H2, 0, 0, PI * 2, 12); k.box(0.012, 0.012, 0.004, 0.95, TOP + 0.042, 0.42 + 0.081, '#4dff8f', 'glow');
      k.rbox(0.18, 0.06, 0.2, 0.015, -0.6, TOP + 0.03, -0.42, C.white, 'paint'); beaker(k, -0.6, TOP + 0.06, -0.42, 0.045, 0.1, '#f3c9d6'); [0, 1, 2, 3].forEach(i => k.cyl(0.045, 0.045, 0.012, 0.2, TOP + 0.006 + i * 0.013, -0.45, '#e8f3f6', 'glass', 0, 0, 0, 14)); k.rbox(0.22, 0.1, 0.12, 0.01, 0.6, TOP + 0.05, -0.42, '#4a7fd0', 'paint'); k.cyl(0.004, 0.004, 0.15, 1.0, TOP + 0.003, -0.4, C.steel, 'metal', 0, 0.4, H2, 6);
      stool(k, 0.3, 1.0); stool(k, -0.9, -1.0);
      Q.push({ p: [0, TOP + 0.22, 0.071], w: 0.34, h: 0.17, uv: L.tag(say('乾區：原型・模型', 'Dry: prototypes'), '', { size: 18 }) }); Q.push({ p: [0, TOP + 0.22, -0.071], w: 0.34, h: 0.17, ry: PI, uv: L.tag(say('濕區：細胞・材料', 'Wet: cells · materials'), '', { band: '#c0392b', size: 18 }) }); Q.push({ p: [0.95, TOP + 0.042, 0.33], w: 0.12, h: 0.06, up: true, uv: L.tag(say('穿戴原型', 'Wearable'), 'PPG', { size: 16 }) });
    });
    // ---- front wall: sink + eyewash, notebook desk, CAD workstation; protocol lectern; project board
    P('sink', [-2.4, 0, 4.15], PI, { name: ['洗手槽與洗眼器', 'Hand-wash sink & eyewash'], info: 'bm-sink', equip: 'sink' }, (k, S, Q) => {
      baseRun(k, 1.4, 0.62, { top: C.steel }); k.box(0.56, 0.012, 0.4, -0.2, TOP, 0.0, '#9aa5aa', 'metal'); k.tube([[-0.2, TOP, -0.25], [-0.2, TOP + 0.34, -0.22], [-0.2, TOP + 0.28, -0.05]], 0.013, C.steel, 'metal', 14, 6); k.cyl(0.03, 0.035, 0.05, 0.08, TOP + 0.05, -0.2, '#3fae4a', 'plastic', 0, 0, 0, 10); k.lathe([[0.001, 0], [0.04, 0.0], [0.05, 0.03]], 0.08, TOP + 0.075, -0.2, '#3fae4a', 'plastic', 12);
      k.rbox(0.12, 0.22, 0.1, 0.02, 0.45, 1.25, -0.25, C.white, 'plastic'); k.rbox(0.28, 0.3, 0.1, 0.02, -0.55, 1.4, -0.26, C.white, 'plastic'); k.rbox(0.36, 0.42, 0.36, 0.02, 0.48, 0.21, 0.5, '#e74c3c', 'plastic'); k.rbox(0.36, 0.42, 0.36, 0.02, 0.1, 0.21, 0.5, '#f1c40f', 'plastic');
      Q.push({ p: [0.08, 1.15, -0.29], w: 0.24, h: 0.12, uv: L.tag(say('洗眼器', 'Eyewash'), say('每週測試', 'tested weekly'), { band: '#2f9e44' }) }); Q.push({ p: [0.48, 0.38, 0.681], w: 0.18, h: 0.09, uv: L.tag(say('生物廢棄物', 'Biohazard'), '', { band: '#c0392b', size: 18 }) }); Q.push({ p: [0.1, 0.38, 0.681], w: 0.18, h: 0.09, uv: L.tag(say('化學廢液', 'Chem waste'), '', { band: '#d68a00', size: 18 }) });
    });
    P('desk', [-4.25, 0, 3.78], PI, { name: ['實驗紀錄與設計管制桌', 'Lab notebook & design-control desk'], info: 'bm-desk', equip: 'chart' }, (k, S, Q) => {
      legTable(k, 1.4, 0.7, 0.76, '#dfe6e2'); c.chair(k, 0, 0.62, 0, '#2f6f8f'); k.box(0.3, 0.012, 0.22, -0.1, 0.766, 0.05, '#f7f5ee', 'paint'); k.box(0.3, 0.012, 0.22, 0.2, 0.768, 0.05, '#f7f5ee', 'paint'); k.box(0.004, 0.014, 0.22, 0.05, 0.77, 0.05, '#2f6fd0', 'paint');
      for (let i = 0; i < 5; i++) k.box(0.06, 0.3, 0.24, -0.6 + i * 0.07, 0.91, -0.2, ['#2f6fd0', '#c0392b', '#2fa36b', '#f1c40f', '#8e44ad'][i], 'plastic'); k.rbox(0.36, 0.02, 0.24, 0.01, 0.42, 0.77, -0.08, '#2b3036', 'plastic'); k.rbox(0.36, 0.22, 0.012, 0.01, 0.42, 0.88, -0.2, '#2b3036', 'plastic', -0.2, 0, 0);
      Q.push({ p: [-0.1, 0.773, 0.05], w: 0.26, h: 0.18, up: true, uv: L.tag(say('實驗紀錄本', 'Lab notebook'), say('逐日簽名', 'signed daily'), { band: '#2f6fd0' }) }); Q.push({ p: [-0.46, 1.08, -0.08], w: 0.3, h: 0.1, uv: L.tag(say('設計歷史檔', 'Design history file'), 'DHF · ISO 13485', { size: 16 }) });
    });
    P('workstation', [2.9, 0, 3.75], PI, { name: ['CAD／影像分割工作站', 'CAD & segmentation workstation'], info: 'bm-workstation', equip: 'imaging' }, (k, S, Q) => {
      legTable(k, 1.6, 0.75, 0.76, '#dfe6e2'); c.chair(k, 0, 0.66, 0, '#2f6f8f'); monitor(k, S, -0.3, 0.76, -0.18, 0.52, 0.32, cadCanvas(c), 0.12); monitor(k, S, 0.3, 0.76, -0.18, 0.52, 0.32, segCanvas(c), -0.12); keyboard(k, 0, 0.76, 0.12);
      k.cyl(0.04, 0.045, 0.04, -0.45, 0.78, 0.15, '#2b3036', 'plastic', 0, 0, 0, 12); k.rbox(0.2, 0.42, 0.42, 0.01, 0.68, 0.98, -0.05, '#2b3036', 'plastic'); k.box(0.004, 0.02, 0.15, 0.578, 1.1, -0.05, '#2f6fd0', 'glow');
    });
    P('chart', [1.15, 0, 2.0], -0.35, { name: ['實驗計畫與 SOP', 'Protocol & SOPs'], info: 'bm-chart', equip: 'chart' }, (k, S, Q) => {
      k.cyl(0.24, 0.26, 0.03, 0, 0.015, 0, '#55606a', 'satin', 0, 0, 0, 16); k.cyl(0.03, 0.03, 1.0, 0, 0.53, 0, C.grey, 'satin', 0, 0, 0, 8); k.box(0.48, 0.025, 0.36, 0, 1.06, 0.02, '#cfd6da', 'paint', -0.32, 0, 0); k.box(0.22, 0.008, 0.3, -0.11, 1.08, 0.02, '#f7f5ee', 'paint', -0.32, 0, 0.03); k.box(0.22, 0.008, 0.3, 0.11, 1.08, 0.02, '#f7f5ee', 'paint', -0.32, 0, -0.03);
      Q.push({ p: [0, 1.0, 0.22], w: 0.34, h: 0.12, uv: L.tag(say('實驗計畫・SOP', 'Protocol · SOP'), say('風險評估 ✓', 'risk assessed ✓'), { band: '#2f6f8f' }) });
    });
    P('whiteboard', [-4.25, 0, 4.47], PI, { name: ['專案與設計審查白板', 'Project & design-review board'], info: 'bm-whiteboard', equip: 'chart', hot: true }, (k, S, Q, g) => {
      k.rbox(1.66, 0.86, 0.04, 0.01, 0, 1.82, 0, '#c9d1d6', 'paint'); k.box(1.5, 0.03, 0.07, 0, 1.38, 0.035, '#b9c3c8', 'paint');
      const wt = c.wallText([say('導板專案：需求 ✓ 設計 ✓ 驗證 ▶ 確效', 'Guide project: inputs ✓ design ✓ verify ▶ validate'), say('PPG 穿戴：rev B 雜訊量測', 'PPG wearable: rev B noise test'), say('支架細胞貼附：第 3 天影像', 'Scaffold cells: day-3 imaging'), say('週四 設計審查 14:00', 'Thu design review 14:00')], 1.58, 0.78, { title: say('專案看板　Projects', 'Projects'), px: 768, size: 30, bg: '#fdfdfb', sim: true });
      board(wt); wt.position.set(0, 1.82, 0.024); g.add(wt);
    });
    c.put('door', [0, 0, 4.35], PI);
    L.decor(k => { k.at(-3.1, 0, -4.5, 0, () => wallCabinets(k, 1.6, 2.2)); k.cyl(0.075, 0.075, 0.46, 1.42, 0.5, 4.38, '#c0392b', 'paint', 0, 0, 0, 12); k.cyl(0.03, 0.03, 0.06, 1.42, 0.76, 4.38, C.ink, 'plastic', 0, 0, 0, 8); }, false);
    c.setField('bench');
    L.alias({ field: 'bench', bed: 'bench', instruments: 'bench', tray: 'bench', scale: 'bench', monitor: 'electronics', ultrasound: 'electronics', analyser: 'electronics', device: 'printer3d', carm: 'testrig', imaging: 'workstation', lightbox: 'workstation', endoscopy: 'microscope', lab: 'incubator', oven: 'incubator', drugs: 'fridge', cart: 'shelves', drain: 'sink', 'crash-cart': 'sink', anaesthesia: 'hood', handover: 'desk', recovery: 'desk', huddle: 'whiteboard', lights: 'bench' });
    return c.H;
  };
})();
