/* Specialty imaging digital twins (v2 extension): obstetrics, gynaecology, paediatric surgery, anaesthesiology,
   pain medicine, dentistry and pathology / laboratory medicine. Registers seven departments on
   window.HT.specialtyTwins (specialty-twins.js must load first) and reuses its drawing bases — ultrasound sectors,
   endoscope circle, chart frame, film grain, leader-line labels and the HUD with the bilingual "procedural
   simulation" watermark. Every picture is drawn algorithmically from a small model with a continuous parameter,
   a normal reference and therapies that visibly change it. Nothing here is a real patient image; no drug doses.
   Safe to load more than once and a no-op when the base module is missing. */
(function (window) {
  'use strict';
  const HT = window.HT, ST = HT && HT.specialtyTwins;
  if (!ST || typeof ST.register !== 'function' || !ST.bases) return;
  const B = ST.bases;
  const { W, H, clamp, lerp, grey, rng, noise, film, grad, rgrad, shape, poly, ell, rect, line, txt, dots, scope, vessels, chart, say, P, sev } = B;
  const TAU = Math.PI * 2, PI = Math.PI;
  const MOD = B.MOD || ST.MOD || {}, MODZH = B.MODZH || {};
  [['CTG', 'CARDIOTOCOGRAPHY', '胎心宮縮監測'], ['PARTO', 'PARTOGRAM', '產程圖'], ['HYST', 'HYSTEROSCOPY', '子宮鏡'], ['COLP', 'COLPOSCOPY', '陰道鏡'], ['LAP', 'LAPAROSCOPY', '腹腔鏡'], ['US3D', '3D ULTRASOUND', '3D 超音波'], ['FLUORO', 'FLUOROSCOPY', '透視'], ['CAPNO', 'CAPNOGRAPHY', '二氧化碳波形'], ['TOF', 'TRAIN-OF-FOUR', '四連刺激'], ['LARY', 'LARYNGOSCOPY', '喉鏡'], ['AIR', 'AIRWAY EXAM', '氣道檢查'], ['OPG', 'PANORAMIC (OPG)', '環口全景 X 光'], ['IOPA', 'PERIAPICAL', '根尖片'], ['BW', 'BITEWING', '咬翼片'], ['PERIO', 'PERIODONTAL CHART', '牙周圖表'], ['CBCT', 'CONE-BEAM CT', '錐狀射束 CT'], ['PHOTO', 'CLINICAL PHOTO', '臨床照片'], ['SMEAR', 'BLOOD SMEAR', '血液抹片'], ['HE', 'H&E HISTOLOGY', 'H&E 組織切片'], ['GRAM', 'GRAM STAIN', '革蘭氏染色'], ['UMIC', 'URINE MICROSCOPY', '尿液鏡檢'], ['LAB', 'LAB TREND', '檢驗趨勢'], ['COAG', 'COAGULATION', '凝血檢查']].forEach(([k, e, z]) => { if (!MOD[k]) MOD[k] = e; if (!MODZH[k]) MODZH[k] = z; });

  // ------------------------------------------------------------------ helpers
  // Label palette resolved at use time, so it follows light (paper) or dark backgrounds painted later.
  const pal = g => ({ get n() { return g._light ? '#0d47a1' : '#8fe3ff'; }, get a() { return g._light ? '#b71c1c' : '#ffb3b3'; }, get t() { return g._light ? '#1b5e20' : '#9f9'; }, get w() { return g._light ? '#8a4b00' : '#ffd27a'; } });
  const pw = (x, xs, ys) => { if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return lerp(ys[i - 1], ys[i], (x - xs[i - 1]) / ((xs[i] - xs[i - 1]) || 1)); return ys[ys.length - 1]; };
  const hsh = n => { let h = Math.imul((Math.floor(n) * 1000003) ^ 0x2545f491, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const vn = t => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return lerp(hsh(i), hsh(i + 1), u) * 2 - 1; };
  const gs = (x, m, sd) => Math.exp(-((x - m) * (x - m)) / (2 * sd * sd));
  const tri = (x, a, b, c) => x <= a || x >= c ? 0 : x < b ? (x - a) / (b - a) : (c - x) / (c - b);
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rom = n => ['0', 'I', 'II', 'III', 'IV'][clamp(Math.round(n), 0, 4)];
  const mt = (g, s, x, y, o) => txt(g, s, x, y, Object.assign({ s: 12, mono: true, c: g._light ? '#243238' : '#9fe', sh: !g._light }, o || {}));
  const usBg = g => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); };
  const rot = (cx, cy, a) => { const ca = Math.cos(a), sa = Math.sin(a); return (x, y) => [cx + x * ca - y * sa, cy + x * sa + y * ca]; };
  // Ultrasound sector that does not clear the canvas (allows dual displays); fn draws inside the clip.
  function sector(g, o, fn) {
    o = o || {}; const cx = o.cx == null ? W / 2 : o.cx, cy = o.cy == null ? 30 : o.cy, r0 = o.r0 || 24, r1 = o.r1 || 420, a0 = o.a0 == null ? PI / 2 - .7 : o.a0, a1 = o.a1 == null ? PI / 2 + .7 : o.a1;
    const path = () => { g.beginPath(); g.arc(cx, cy, r1, a0, a1); g.arc(cx, cy, r0, a1, a0, true); g.closePath(); };
    g.save(); path(); g.clip(); g.fillStyle = rgrad(g, cx, cy, r0, r1, [o.near || '#555', o.mid || '#343434', o.far || '#151515']); g.fillRect(0, 0, W, H); noise(g, .55, 'overlay', 2.4); noise(g, .3, 'overlay', 1.1);
    fn(cx, cy); noise(g, .38, 'overlay', 2.4); g.restore(); g.save(); path(); g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1; g.stroke(); g.restore();
  }
  // High-frequency linear-array frame with depth ticks.
  function linear(g, o, fn) {
    o = o || {}; const x0 = 64, y0 = 40, x1 = 576, y1 = 446; usBg(g);
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip(); g.fillStyle = grad(g, 0, y0, 0, y1, [o.near || '#4c4c4c', o.mid || '#333', o.far || '#1a1a1a']); g.fillRect(x0, y0, x1 - x0, y1 - y0); noise(g, .55, 'overlay', 2.2); noise(g, .3, 'overlay', 1);
    fn(x0, y0, x1, y1); noise(g, .38, 'overlay', 2.2); g.restore(); rect(g, x0, y0, x1 - x0, y1 - y0, { s: 'rgba(255,255,255,.18)', lw: 1 });
    if (o.pxcm) for (let d = 1; d * o.pxcm < y1 - y0; d++) { line(g, [[x0 - 8, y0 + d * o.pxcm], [x0, y0 + d * o.pxcm]], '#9ab', 1); mt(g, d + ' cm', x0 - 12, y0 + d * o.pxcm + 4, { s: 10, c: '#9ab', a: 'right' }); }
  }
  // Bright-field microscope field (circular) with vignette.
  function micro(g, o, fn) {
    o = o || {}; const cx = 320, cy = 252, r = 212; g.fillStyle = '#040404'; g.fillRect(0, 0, W, H);
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip(); g.fillStyle = rgrad(g, cx - 40, cy - 50, 10, r * 1.25, [o.b0 || '#f8eef0', o.b1 || '#e6d2d8']); g.fillRect(0, 0, W, H); noise(g, .12, 'multiply', 1.3); noise(g, .1, 'soft-light', .7);
    fn(cx, cy, r); noise(g, .1, 'overlay', 1.1); g.fillStyle = rgrad(g, cx, cy, r * .6, r, ['rgba(0,0,0,0)', 'rgba(30,15,20,.5)']); g.fillRect(0, 0, W, H); g.restore(); ell(g, cx, cy, r, r, { s: '#161616', lw: 6 });
  }
  // Image-intensifier fluoroscopy field; inv = "black bone" display (dense structures and contrast dark).
  function fluoro(g, inv, fn) {
    const cx = 320, cy = 252, r = 220; g.fillStyle = '#040404'; g.fillRect(0, 0, W, H);
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip(); g.fillStyle = rgrad(g, cx, cy, 20, r, inv ? ['#dcdfdf', '#b2b7b8'] : ['#3a3d41', '#16181a']); g.fillRect(0, 0, W, H);
    fn(cx, cy, r); noise(g, .45, 'overlay', 1.4); noise(g, .22, 'overlay', .8); g.fillStyle = rgrad(g, cx, cy, r * .7, r, ['rgba(0,0,0,0)', 'rgba(0,0,0,.4)']); g.fillRect(0, 0, W, H); g.restore(); ell(g, cx, cy, r, r, { s: '#202020', lw: 5 });
  }
  function paper(g, col) { g._light = true; g.fillStyle = col || '#f7f4ef'; g.fillRect(0, 0, W, H); noise(g, .07, 'multiply', 1.6); g.fillStyle = rgrad(g, W / 2, H / 2, 120, 470, ['rgba(255,255,255,0)', 'rgba(110,90,70,.12)']); g.fillRect(0, 0, W, H); }
  function cal(g, a, b, col) { col = col || '#ffe14d'; line(g, [a, b], col, 1.2, [3, 4]); [a, b].forEach(p => { line(g, [[p[0] - 6, p[1]], [p[0] + 6, p[1]]], col, 1.6); line(g, [[p[0], p[1] - 6], [p[0], p[1] + 6]], col, 1.6); }); }
  function mbox(g, x, y, rows, w) { w = w || 200; rect(g, x, y, w, rows.length * 17 + 10, { f: g._light ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.6)', s: g._light ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.15)', lw: 1, r: 4 }); rows.forEach((r, i) => mt(g, r[0], x + 8, y + 19 + i * 17, { s: 11.5, c: r[1] || (g._light ? '#1d2b30' : '#e8f4f4'), sh: false })); }
  // Colour Doppler flecks along a set of points.
  function flow(g, pts, seed, w, a) { const R = rng(seed); pts.forEach(([x, y]) => { for (let j = 0; j < 3; j++) ell(g, x + (R() - .5) * w, y + (R() - .5) * w, 2.4 + R() * 2.6, 1.7 + R() * 1.6, { f: R() > .45 ? (R() > .5 ? `rgba(255,59,48,${a || .95})` : `rgba(255,138,61,${a || .95})`) : (R() > .5 ? `rgba(47,107,255,${a || .95})` : `rgba(51,196,255,${a || .95})`), rot: R() * 3 }); }); }
  const ring = (x, y, r, n) => Array.from({ length: n }, (_, i) => [x + Math.cos(i / n * TAU) * r, y + Math.sin(i / n * TAU) * r]);
  const plen = pts => pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
  function subPath(pts, len) { const out = [pts[0]]; let acc = 0; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (acc + l >= len) { const t = (len - acc) / (l || 1); out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]); return out; } acc += l; out.push(b); } return out; }
  // Sweep-mode trace (monitor style): fn(t) in [0..1] of panel height; erase bar at sweep position.
  function trace(g, x, y, w, h, col, sec, fn, sweep, lw) {
    g.save(); g.beginPath(); for (let px = 0; px <= w; px += 1.5) { const t = px / w * sec, v = fn(t); const yy = y + h - clamp(v, -.2, 1.15) * h; px ? g.lineTo(x + px, yy) : g.moveTo(x + px, yy); } g.strokeStyle = col; g.lineWidth = lw || 2; g.lineJoin = 'round'; g.shadowColor = col; g.shadowBlur = 6; g.stroke(); g.restore();
    if (sweep != null) rect(g, x + sweep * w - 4, y - 4, 14, h + 8, { f: '#03070a' });
  }

  // ================================================================ OBSTETRICS
  const gaTxt = w => { const d = Math.round(w * 7); return Math.floor(d / 7) + 'w+' + (d % 7) + 'd'; };
  const crlMm = w => Math.max(2, Math.pow(Math.max(0, w * 7 - 23.73) / 8.052, 2)); // Robinson: GA(d) = 8.052·√CRL + 23.73
  function crlUS(g, s) {
    const w = s.v, mm = crlMm(w), px = 2.3, L = mm * px, m = clamp((w - 7) / 6, 0, 1), c = pal(g);
    const sRx = clamp(Math.max(L * .62 + 24, (w * 7 - 30) * px * .62), 30, 205), sRy = sRx * .72, sx = 330, sy = 262;
    const x0 = sx - L / 2, y0 = sy + sRy * .3, U = (u, v) => [x0 + u * L, y0 + v * L], hr = lerp(.27, .2, m), [hx, hy] = U(hr * .95, -.1);
    usBg(g);
    sector(g, { cy: 26, r1: 440, a0: PI / 2 - .72, a1: PI / 2 + .72, near: '#525252', mid: '#363636', far: '#161616' }, () => {
      line(g, [[90, 70], [550, 70]], 'rgba(225,225,225,.5)', 5); line(g, [[100, 92], [540, 94]], 'rgba(170,170,170,.32)', 10);
      ell(g, 330, 272, 250, 175, { f: '#5a5a5a', blur: 18 }); ell(g, 330, 272, 236, 162, { f: '#686868', blur: 22 }); dots(g, 44, 330, 272, 220, 150, 7, 'rgba(40,40,40,.35)', 4, 6);
      ell(g, sx, sy, sRx + 14, sRy + 14, { s: 'rgba(205,205,205,.75)', lw: 12, a0: .25, a1: PI - .25, open: true, blur: 8 });
      ell(g, sx, sy, sRx, sRy, { f: '#070707', s: 'rgba(235,235,235,.85)', lw: 3, blur: 2 });
      if (w < 12.5) ell(g, sx + sRx * .55, sy - sRy * .4, Math.max(6, 2.6 * px), Math.max(6, 2.6 * px), { s: `rgba(240,240,240,${clamp(1.3 - (w - 9) / 3.5, .25, 1)})`, lw: 2.5 });
      if (w < 12) ell(g, sx, y0 - L * .05, L * .64 + 10, L * .44 + 8, { s: `rgba(200,200,200,${clamp(.6 - (w - 8) / 7, .12, .6)})`, lw: 1.2 });
      // embryo / fetus (unit coordinates: crown at 0, rump at 1)
      ell(g, hx, hy, hr * L, hr * L * .95, { f: '#8a8a8a', blur: 4 });
      const [bx, by] = U(.62, -.05); ell(g, bx, by, .38 * L, lerp(.16, .2, m) * L, { f: '#8e8e8e', blur: 4, rot: .1 });
      shape(g, [U(.3, -.25), U(.45, -.2), U(.42, .08), U(.3, .1)], { f: '#8a8a8a', blur: 3 });
      if (m > .25) ell(g, hx, hy, hr * L, hr * L * .95, { s: `rgba(235,235,235,${.25 + .6 * m})`, lw: 1.5 + 3 * m });
      if (m > .3) for (let i = 0; i < 9; i++) { const u = .3 + i * .075; const [px2, py2] = U(u, -.27 + .1 * (u - .3) * (u - .3) * 4); ell(g, px2, py2, 1.6 + m, 1.6 + m, { f: `rgba(240,240,240,${.4 + .5 * m})` }); }
      line(g, [U(.44, .1), U(.5 + .05 * m, .1 + .2 * m)], '#8a8a8a', Math.max(2, .06 * L)); line(g, [U(.86, .1), U(.78, .13 + .24 * m)], '#8a8a8a', Math.max(2, .07 * L));
      if (w > 8 && w < 12) ell(g, ...U(.62, .17), .07 * L, .05 * L, { f: '#b5b5b5', blur: 2 });
      ell(g, ...U(.44, -.03), Math.max(2, .03 * L), Math.max(2, .03 * L), { f: '#f2f2f2', blur: 3 });
      if (w >= 11) shape(g, [U(.22, -.3), U(.33, -.31), U(.42, -.26)], { open: true, s: 'rgba(0,0,0,.8)', lw: Math.max(1.5, .012 * L * 4) });
      cal(g, U(-.02, -.1), U(1.0, -.04));
    });
    mbox(g, 14, 38, [['CRL ' + mm.toFixed(1) + ' mm'], ['GA ' + gaTxt(w) + ' (Robinson)'], [say('胎心 ', 'FHR ') + (w < 9 ? 170 : 158) + ' bpm'], w >= 11 && w < 14 ? ['NT ' + (1.2 + (w - 11) * .3).toFixed(1) + ' mm (11–13+6 w)'] : [say('11–14 週量頸部透明帶', 'NT measured at 11–14 w'), '#9ab']], 214);
    const L2 = s.L; L2(sx + sRx, sy, '妊娠囊', 'Gestational sac', 540, 110); L2(hx, hy - hr * L, w < 9 ? '胚胎頭端' : '胎頭（顱骨鈣化中）', w < 9 ? 'Cephalic pole' : 'Head (skull ossifying)', 470, 400);
    L2(sx, sy + sRy + 10, '絨毛膜（早期胎盤）', 'Chorion frondosum (early placenta)', 120, 440); L2(...U(.5, -.07), '頭臀長量測線', 'Crown–rump length calipers', 120, 150, '#ffe14d');
    if (w < 12.5) L2(sx + sRx * .55, sy - sRy * .4, '卵黃囊', 'Yolk sac', 540, 200); if (w > 8 && w < 12) L2(...U(.62, .17), '生理性中腸疝出（8–12 週）', 'Physiological midgut herniation (8–12 w)', 520, 440); if (w >= 11) L2(...U(.33, -.31), '頸部透明帶', 'Nuchal translucency', 120, 200, c.w);
  }
  const BIO = { w: [14, 20, 24, 28, 32, 36, 40], bpd: [27, 47, 60, 72, 82, 89, 95], hc: [100, 175, 225, 265, 295, 320, 340], ac: [80, 150, 195, 235, 275, 310, 350], fl: [14, 33, 44, 53, 61, 68, 74] };
  const bio = (w, k) => pw(w, BIO.w, BIO[k]), gaOf = (v, k) => pw(v, BIO[k], BIO.w);
  const efw = (hc, ac, fl) => Math.pow(10, 1.326 - .00326 * ac * fl / 100 + .0107 * hc / 10 + .0438 * ac / 10 + .158 * fl / 10); // Hadlock (HC, AC, FL in cm)
  const cent = z => 100 / (1 + Math.exp(-1.702 * z));
  function biometryUS(g, s) {
    const w = s.normal ? (s.x.bioGA || 32) : (s.x.bioGA = s.v), fgr = !s.normal, c = pal(g), px = 1.75;
    const bpd = bio(w, 'bpd') * (fgr ? .97 : 1), hc = bio(w, 'hc') * (fgr ? .97 : 1), ac = bio(w, 'ac') * (fgr ? .84 : 1), fl = bio(w, 'fl') * (fgr ? .95 : 1);
    const e = efw(hc, ac, fl), e0 = efw(bio(w, 'hc'), bio(w, 'ac'), bio(w, 'fl')), ec = cent(Math.log(e / e0) / .13), acc = cent(Math.log(ac / bio(w, 'ac')) / .07);
    usBg(g);
    const hx = 165, hy = 285, ofd = 2 * hc / PI - bpd, rx = ofd / 2 * px, ry = bpd / 2 * px, R = rot(hx, hy, -.12);
    sector(g, { cx: hx, cy: 44, r1: 385, a0: PI / 2 - .46, a1: PI / 2 + .46 }, () => {
      ell(g, hx, hy, rx + 11, ry + 11, { f: '#3e3e3e', blur: 10, rot: -.12 }); ell(g, hx, hy, rx, ry, { f: '#252525', rot: -.12 });
      dots(g, 14, hx, hy, rx * .7, ry * .7, 7, 'rgba(70,70,70,.5)', 12, 5);
      line(g, [R(-rx * .93, 0), R(-rx * .44, 0)], 'rgba(220,220,220,.8)', 2); line(g, [R(-rx * .2, 0), R(rx * .93, 0)], 'rgba(220,220,220,.8)', 2);
      poly(g, [R(-rx * .44, -ry * .09), R(-rx * .2, -ry * .09), R(-rx * .2, ry * .09), R(-rx * .44, ry * .09)], { f: '#060606', s: 'rgba(230,230,230,.8)', lw: 1.5 });
      [-1, 1].forEach(sd => ell(g, ...R(rx * .02, sd * ry * .2), rx * .15, ry * .15, { f: '#141414', s: 'rgba(150,150,150,.5)', lw: 1.2, rot: -.12 }));
      shape(g, [R(-rx * .1, ry * .55), R(rx * .15, ry * .5), R(rx * .3, ry * .62)], { open: true, s: 'rgba(210,210,210,.55)', lw: 2 });
      ell(g, hx, hy, rx, ry, { s: 'rgba(242,242,242,.95)', lw: 4.5 + w * .08, rot: -.12, blur: 4 });
      ell(g, hx, hy, rx + 4, ry + 4, { s: 'rgba(255,225,77,.85)', lw: 1.2, rot: -.12, dash: [3, 4] }); cal(g, R(rx * .05, -ry - 3), R(rx * .05, ry - 3));
    });
    const ax = 478, ay = 285, ar = ac / PI / 2 * px;
    sector(g, { cx: ax, cy: 44, r1: 385, a0: PI / 2 - .46, a1: PI / 2 + .46 }, () => {
      ell(g, ax, ay, ar + 8, ar * .96 + 8, { f: '#3a3a3a', blur: 8 }); ell(g, ax, ay, ar, ar * .96, { f: '#545454', blur: 6 }); dots(g, 16, ax, ay, ar * .7, ar * .7, 6, 'rgba(90,90,90,.4)', 7, 5);
      ell(g, ax - ar * .38, ay - ar * .02, ar * .25, ar * .19, { f: '#060606', blur: 2, rot: .3 });
      shape(g, [[ax + ar * .12, ay - ar * .7], [ax + ar * .06, ay - ar * .34], [ax - ar * .1, ay - ar * .14]], { open: true, s: '#0a0a0a', lw: Math.max(4, ar * .1) }); shape(g, [[ax + ar * .12, ay - ar * .7], [ax + ar * .06, ay - ar * .34], [ax - ar * .1, ay - ar * .14]], { open: true, s: 'rgba(200,200,200,.4)', lw: 1 });
      [[0, .8], [-.12, .66], [.12, .66]].forEach(([dx, dy]) => ell(g, ax + ar * dx + ar * .12, ay + ar * dy, ar * .07, ar * .06, { f: '#f2f2f2', blur: 3 }));
      [-1, 1].forEach(sd => ell(g, ax, ay, ar * .92, ar * .9, { s: 'rgba(230,230,230,.6)', lw: 3, a0: sd > 0 ? -.5 : PI - .4, a1: sd > 0 ? .3 : PI + .5, open: true }));
      ell(g, ax, ay, ar + 3, ar * .96 + 3, { s: 'rgba(255,225,77,.85)', lw: 1.2, dash: [3, 4] });
    });
    mbox(g, 236, 36, [['GA ' + gaTxt(w)], ['BPD ' + bpd.toFixed(0) + ' mm'], ['HC ' + hc.toFixed(0) + ' mm'], ['AC ' + ac.toFixed(0) + ' mm · ' + Math.round(acc) + '%', acc < 10 ? '#ff8a80' : null], ['FL ' + fl.toFixed(0) + ' mm'], ['EFW ' + Math.round(e) + ' g · ' + Math.round(ec) + '%', ec < 10 ? '#ff8a80' : null], ['HC/AC ' + (hc / ac).toFixed(2), hc / ac > bio(w, 'hc') / bio(w, 'ac') + .06 ? '#ff8a80' : null]], 170);
    const L = s.L; L(...R(-rx * .32, -ry * .09), '透明中隔腔', 'Cavum septi pellucidi', 30, 120); L(...R(rx * .02, ry * .2), '視丘', 'Thalami', 40, 440); L(...R(rx * .6, -ry), 'BPD 量測＋HC 描線', 'BPD calipers + HC trace', 236, 440, '#ffe14d');
    L(ax - ar * .38, ay, '胃泡', 'Stomach', 610, 160); L(ax + ar * .08, ay - ar * .4, '臍靜脈（肝內段）', 'Umbilical vein (intrahepatic)', 610, 120); L(ax + ar * .12, ay + ar * .8, '脊椎', 'Spine', 610, 400);
    if (fgr) L(ax + ar, ay - ar * .3, '腹圍 <第 10 百分位（頭部相對保留）', 'AC <10th centile (head-sparing)', 640, 210, c.a);
  }
  function uaDoppler(g, s) {
    const del = s.has('delivery'), k = s.normal ? 0 : s.k, c = pal(g), edv = pw(k, [0, .55, .62, 1], [.36, .02, -.02, -.32]);
    usBg(g);
    sector(g, { cy: 30, r1: 196, a0: PI / 2 - .66, a1: PI / 2 + .66 }, () => {
      ell(g, 320, 140, 230, 90, { f: '#0b0b0b', blur: 12 });
      if (!del) { const P2 = t => [190 + t * 270, 150 - t * 34 + Math.sin(t * 5) * 8]; for (let i = 0; i < 3; i++) { const pts = []; for (let t = 0; t <= 1.001; t += .04) { const [x, y] = P2(t); pts.push([x, y + Math.sin(t * 22 + i * 2.1) * 9]); } shape(g, pts, { open: true, s: i === 1 ? 'rgba(50,110,255,.95)' : 'rgba(230,52,40,.95)', lw: i === 1 ? 9 : 6 }); }
        line(g, [[320, 30], [326, 196]], 'rgba(255,255,255,.55)', 1, [4, 4]); line(g, [[314, 126], [334, 128]], '#fff', 2); line(g, [[315, 142], [335, 144]], '#fff', 2); }
      else ell(g, 320, 150, 170, 50, { f: '#6a6a6a', blur: 16 });
    });
    const x0 = 40, x1 = 596, y0 = 214, y1 = 446, base = 382, amp = 128;
    rect(g, x0, y0, x1 - x0, y1 - y0, { f: '#020202', s: 'rgba(255,255,255,.15)', lw: 1 });
    for (let v = -20; v <= 60; v += 20) { const y = base - v / 48 * amp; if (y > y0 && y < y1) { line(g, [[x1 - 6, y], [x1, y]], '#9ab', 1); mt(g, v, x1 + 4, y + 4, { s: 10, c: '#9ab' }); } }
    mt(g, 'cm/s', x1 - 8, y0 + 14, { s: 10, c: '#9ab', a: 'right' });
    const per = 62, vel = ph => edv + (1 - edv) * (ph < .1 ? Math.sin(ph / .1 * PI / 2) : Math.exp(-(ph - .1) * 3.2));
    let mean = 0; for (let i = 0; i < 100; i++) mean += vel(i / 100) / 100;
    if (!del) {
      g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip(); g.beginPath(); g.moveTo(x0, base); for (let x = x0; x <= x1; x++) g.lineTo(x, base - vel(((x - x0) / per) % 1) * amp); g.lineTo(x1, base); g.closePath();
      g.fillStyle = grad(g, 0, base - amp, 0, base + 50, ['rgba(255,255,255,.95)', 'rgba(185,185,185,.72)', 'rgba(150,150,150,.6)']); g.fill(); noise(g, .55, 'overlay', 1.2);
      g.beginPath(); for (let x = x0; x <= x1; x++) { const y = base - vel(((x - x0) / per) % 1) * amp; x === x0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.stroke(); g.restore();
    } else mt(g, say('無訊號', 'NO SIGNAL'), 320, 330, { s: 16, a: 'center', c: '#9ab' });
    line(g, [[x0, base], [x1, base]], 'rgba(170,200,255,.75)', 1);
    const pi = (1 - edv) / mean, ri = 1 - edv;
    mbox(g, 452, 36, del ? [[say('已分娩', 'Delivered')]] : [['UA PI ' + pi.toFixed(2), pi > 1.3 ? '#ff8a80' : null], ['RI ' + ri.toFixed(2)], ['S/D ' + (edv > .02 ? (1 / edv).toFixed(1) : '∞')], ['PSV ' + 48 + ' cm/s'], ['EDV ' + Math.round(edv * 48) + ' cm/s', edv < .05 ? '#ff8a80' : null]], 176);
    const L = s.L; L(250, 150, '臍帶（兩條動脈、一條靜脈）', 'Umbilical cord (two arteries, one vein)', 30, 60);
    if (!del) { L(x0 + per * 2.1 + 6, base - amp, '收縮期峰值', 'Peak systole', 140, 236); const xe = x0 + per * 4 - 3; L(xe, base - edv * amp, edv > .06 ? '舒張末期仍有正向血流' : edv > -.05 ? '舒張末期血流消失（AEDF）' : '舒張末期血流逆流（REDF）', edv > .06 ? 'Forward end-diastolic flow present' : edv > -.05 ? 'Absent end-diastolic flow (AEDF)' : 'Reversed end-diastolic flow (REDF)', 420, 300, edv > .06 ? c.n : c.a); }
    else L(320, 330, '分娩後臍動脈都卜勒不再適用（交由新生兒團隊）', 'After birth the umbilical Doppler no longer applies (neonatal team)', 120, 250, c.t);
  }
  function praeviaUS(g, s) {
    const cs = s.has('cs') && !s.normal, c = pal(g); let d = s.normal ? 40 : s.v; if (s.has('rescan') && !s.normal) d += d >= 0 ? 22 : d > -20 ? 9 : 2;
    const px = 3, os = [330, 232], path = [[612, 430], [560, 330], [470, 262], [400, 240], os, [262, 246], [190, 290], [120, 360], [80, 430]];
    const sOs = plen(path.slice(0, 5)), sEdge = clamp(sOs - d * px, 30, plen(path) - 10), pla = subPath(path, sEdge), E = pla[pla.length - 1];
    usBg(g);
    sector(g, { cy: 16, r1: 452, a0: PI / 2 - .8, a1: PI / 2 + .8, near: '#5a5a5a', mid: '#3a3a3a', far: '#181818' }, () => {
      ell(g, 330, 372, 310, 200, { f: '#666', blur: 22 });
      if (!cs) { shape(g, [[150, 330], [250, 270], [330, 254], [430, 264], [530, 322], [604, 452], [70, 452]], { f: '#0b0b0b', blur: 8 }); ell(g, 330, 402, 112, 82, { f: '#2c2c2c', blur: 6 }); ell(g, 330, 402, 112, 82, { s: 'rgba(235,235,235,.85)', lw: 6, blur: 3 }); line(g, [[236, 402], [424, 402]], 'rgba(210,210,210,.55)', 2); }
      else { shape(g, [[160, 330], [330, 282], [520, 330]], { open: true, s: 'rgba(220,220,220,.7)', lw: 3 }); ell(g, 252, 264, 34, 6, { f: 'rgba(240,240,240,.85)', rot: -.25, blur: 3 }); }
      shape(g, [[262, 94], [362, 84], [374, 160], [358, 236], [300, 240], [282, 170]], { f: '#7c7c7c', blur: 10 }); shape(g, [[318, 90], [322, 160], [330, 232]], { open: true, s: 'rgba(235,235,235,.9)', lw: 2.5 });
      shape(g, [[86, 118], [200, 98], [250, 150], [220, 222], [120, 232], [66, 180]], { f: '#060606', blur: 4 });
      if (!cs) { g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; [[48, '#9a9a9a', 8], [34, '#b4b4b4', 4]].forEach(([lw, col, bl]) => { g.beginPath(); pla.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.strokeStyle = col; g.lineWidth = lw; g.shadowColor = col; g.shadowBlur = bl; g.stroke(); }); g.restore(); dots(g, 18, (pla[0][0] + E[0]) / 2, (pla[0][1] + E[1]) / 2, Math.abs(pla[0][0] - E[0]) / 2 + 10, 40, 4, 'rgba(60,60,60,.5)', 17, 3); cal(g, E, os); }
    });
    const cat = d >= 20 ? 0 : d > 0 ? 1 : 2;
    mbox(g, 14, 38, cs ? [[say('剖腹產後', 'After caesarean')]] : [['TVUS · ' + [say('胎盤位置正常', 'normally sited'), say('低置胎盤', 'low-lying placenta'), say('前置胎盤', 'placenta praevia')][cat], ['#e8f4f4', '#ffd27a', '#ff8a80'][cat]], [(d >= 0 ? say('下緣距內口 ', 'edge to os ') : say('覆蓋內口 ', 'overlaps os by ')) + Math.abs(d).toFixed(0) + ' mm'], [say('≥20 mm 正常 · <20 mm 低置', '≥20 mm normal · <20 mm low-lying'), '#9ab']], 230);
    const L = s.L; L(os[0], os[1], '子宮頸內口', 'Internal os', 120, 300); L(322, 150, '子宮頸管', 'Cervical canal', 470, 120); L(150, 170, '膀胱', 'Bladder', 60, 260);
    if (!cs) { L(pla[1][0], pla[1][1], cat === 2 ? '胎盤覆蓋內口' : '胎盤（後壁）', cat === 2 ? 'Placenta covering the os' : 'Placenta (posterior wall)', 560, 220, cat ? c.a : c.n); L(330, 402, '胎頭', 'Fetal head', 470, 440); if (s.has('rescan')) L(E[0], E[1], '子宮下段形成後胎盤「上移」', 'Placenta "migrates" as the lower segment forms', 380, 70, c.t); }
    else L(252, 264, '子宮下段切口', 'Lower-segment incision', 110, 400, c.t);
  }
  function fetus(g, x, y, th, a) {
    g.save(); g.globalAlpha = a == null ? 1 : a; g.translate(x, y); g.rotate(th);
    const sk = '#ebbb9e', sk2 = '#c98f72';
    [-1, 1].forEach(sd => shape(g, [[sd * 18, 66], [sd * 44, 44], [sd * 46, -64], [sd * 34, -96], [sd * 22, -66], [sd * 22, 42]], { f: sk2, s: 'rgba(0,0,0,.25)', lw: 1 }));
    ell(g, 0, 8, 46, 76, { f: rgrad(g, -14, -10, 4, 84, ['#f6d0b6', sk, sk2]), s: 'rgba(0,0,0,.2)', lw: 1 });
    [-1, 1].forEach(sd => shape(g, [[sd * 34, -34], [sd * 12, -6], [sd * 4, -12], [sd * 26, -44]], { f: sk2 }));
    ell(g, 0, -104, 44, 46, { f: rgrad(g, -12, -118, 4, 52, ['#f8d6be', sk, sk2]), s: 'rgba(0,0,0,.2)', lw: 1 }); ell(g, -30, -104, 7, 10, { f: sk2 });
    shape(g, [[8, 30], [40, 60], [30, 100], [60, 120]], { open: true, s: 'rgba(230,230,255,.7)', lw: 5 });
    g.restore();
  }
  const presName = th => th < 30 ? [say('臀位（縱產式）', 'Breech (longitudinal lie)'), 2] : th < 60 ? [say('斜產式', 'Oblique lie'), 1] : th < 120 ? [say('橫產式', 'Transverse lie'), 2] : th < 150 ? [say('斜產式', 'Oblique lie'), 1] : [say('頭位（縱產式）', 'Cephalic (longitudinal lie)'), 0];
  function breechMap(g, s) {
    const cs = s.has('cs') && !s.normal, ecv = s.has('ecv') && !s.normal, c = pal(g), deg = s.normal || ecv ? 180 : s.v, th = deg * PI / 180;
    g.fillStyle = '#0f1519'; g.fillRect(0, 0, W, H); noise(g, .1, 'overlay', 2);
    shape(g, [[150, 40], [490, 40], [548, 200], [526, 380], [444, 462], [196, 462], [114, 380], [92, 200]], { f: 'rgba(230,190,170,.14)', s: 'rgba(230,200,180,.5)', lw: 2 });
    [-1, 1].forEach(sd => shape(g, [[320 + sd * 40, 452], [320 + sd * 150, 360], [320 + sd * 196, 330], [320 + sd * 186, 420], [320 + sd * 120, 462]], { f: 'rgba(225,215,195,.28)', s: 'rgba(225,215,195,.6)', lw: 2 })); rect(g, 308, 430, 24, 30, { f: 'rgba(225,215,195,.5)', r: 4 });
    const ux = 320, uy = 228;
    if (!cs) { ell(g, ux, uy, 152, 192, { f: 'rgba(200,90,90,.26)', s: 'rgba(240,140,140,.8)', lw: 3 }); ell(g, ux, uy, 140, 180, { s: 'rgba(170,60,95,.85)', lw: 18, a0: PI * 1.12, a1: PI * 1.55, open: true }); fetus(g, ux, uy + 12, th); }
    else { ell(g, ux, uy + 70, 84, 104, { f: 'rgba(200,90,90,.34)', s: 'rgba(240,140,140,.8)', lw: 3 }); line(g, [[230, 408], [410, 408]], '#ff6b6b', 3, [8, 5]); }
    ell(g, ux, uy + 208, 20, 10, { f: 'rgba(240,160,160,.6)' });
    const hp = [ux + 40 * Math.sin(th), uy + 12 - 40 * Math.cos(th)];
    if (!cs) { ell(g, hp[0], hp[1], 9, 9, { f: '#4dff8f', blur: 10 }); }
    if (ecv) [[0, 1], [PI, -1]].forEach(([a0]) => { ell(g, ux, uy, 176, 210, { s: '#4dff8f', lw: 3, a0: a0 + .5, a1: a0 + 1.6, open: true }); });
    const [nm, sevr] = presName(deg);
    txt(g, nm, 24, 64, { s: 17, c: ['#9f9', '#ffd27a', '#ff8a80'][sevr], w: '800' }); mt(g, (cs ? say('已剖腹產', 'delivered by caesarean') : say('胎兒長軸 ', 'fetal axis ') + Math.round(deg) + '°'), 24, 86, { s: 12 });
    const L = s.L; if (!cs) { L(hp[0], hp[1], deg < 90 ? '胎心最清楚處（臍上）' : '胎心最清楚處（臍下）', deg < 90 ? 'Fetal heart loudest above the umbilicus' : 'Fetal heart loudest below the umbilicus', 560, 120, c.t); const hd = [ux + 104 * Math.sin(th), uy + 12 - 104 * Math.cos(th)]; L(hd[0], hd[1], deg < 90 ? '胎頭在子宮底' : '胎頭', deg < 90 ? 'Head in the fundus' : 'Head', 560, 60); const bt = [ux - 60 * Math.sin(th), uy + 12 + 60 * Math.cos(th)]; L(bt[0], bt[1], deg < 60 ? '先露部：臀部（伸腿臀位）' : '先露部', deg < 60 ? 'Presenting part: buttocks (frank breech)' : 'Presenting part', 560, 400, deg < 60 ? c.a : c.n); if (ecv) L(ux + 160, uy - 40, 'ECV「前滾翻」轉成頭位', 'ECV "forward roll" to cephalic', 560, 230, c.t); }
    else L(320, 408, '下腹橫切口（Pfannenstiel）', 'Pfannenstiel incision', 120, 440, c.t);
    L(ux, uy + 208, '子宮頸', 'Cervix', 120, 400);
  }
  function presentUS(g, s) {
    const cs = s.has('cs') && !s.normal, ecv = s.has('ecv') && !s.normal, c = pal(g), deg = s.normal || ecv ? 180 : s.v, h = clamp((deg - 110) / 60, 0, 1), b = clamp((70 - deg) / 60, 0, 1), tr = clamp(1 - Math.abs(deg - 90) / 40, 0, 1);
    usBg(g);
    sector(g, { cy: 24, r1: 440 }, () => {
      shape(g, [[200, 70], [440, 70], [470, 120], [420, 160], [220, 160], [170, 120]], { f: '#070707', blur: 4 });
      ell(g, 320, 330, 260, 170, { f: '#5e5e5e', blur: 18 }); if (!cs) ell(g, 320, 330, 236, 148, { f: '#0c0c0c', blur: 10 });
      if (!cs) {
        if (h > 0) { const x = lerp(640, 320, h); ell(g, x, 322, 104, 86, { f: `rgba(44,44,44,${h})` }); ell(g, x, 322, 104, 86, { s: `rgba(240,240,240,${.9 * h})`, lw: 6, blur: 3 }); line(g, [[x - 90, 322], [x + 90, 322]], `rgba(210,210,210,${.6 * h})`, 2); }
        if (b > 0) { const x = lerp(0, 320, b); ell(g, x, 330, 112, 74, { f: `rgba(120,120,120,${.9 * b})`, blur: 8 }); [-1, 1].forEach(sd => line(g, [[x + sd * 30, 300], [x + sd * 70, 386]], `rgba(245,245,245,${.9 * b})`, 6)); ell(g, x, 362, 16, 10, { f: `rgba(160,160,160,${b})` }); }
        if (tr > 0) for (let i = 0; i < 9; i++) ell(g, 160 + i * 36, 300 + Math.sin(i * .6) * 8, 8, 6, { f: `rgba(240,240,240,${.85 * tr})`, blur: 2 });
      }
    });
    const L = s.L; L(320, 115, '母體膀胱', 'Maternal bladder', 120, 70);
    if (cs) L(320, 330, '剖腹產後：子宮已排空', 'After caesarean: uterus empty', 460, 420, c.t);
    else if (h > .5) L(320, 322, '胎頭在子宮下段（頭位）', 'Fetal head in the lower segment (cephalic)', 470, 430, ecv ? c.t : c.n);
    else if (b > .3) L(lerp(0, 320, b), 340, '臀部與股骨（臀位）', 'Buttocks and femurs (breech)', 470, 430, c.a);
    else L(320, 300, '胎兒脊椎橫越（橫產式）', 'Fetal spine across the uterus (transverse)', 470, 430, c.a);
  }
  // CTG: scrolling paper, 10-minute window; pattern from k (0 normal → early → variable → late → bradycardia).
  const ctgM = k => ({ early: tri(k, .1, .26, .42), vari: tri(k, .32, .5, .68), late: k < .6 ? 0 : clamp((k - .6) / .14, 0, 1), brady: clamp((k - .84) / .14, 0, 1), red: clamp((k - .62) / .28, 0, 1), acc: clamp(1 - k / .34, 0, 1) });
  const cTime = n => n * 3 + (hsh(n + 33) - .5) * .5;
  function fhr(t, m, now) {
    const n = Math.round(t / 3), A = lerp(6.5, 1.3, m.red); let v = 140 + 14 * m.red * (1 - m.brady);
    v += A * (.75 * vn(t * 7) + .35 * vn(t * 19 + 9)) + A * .35 * (hsh(Math.floor(t * 90)) - .5);
    const b = Math.floor(t / 4); if (hsh(b + 71) > .35) v += 20 * m.acc * gs(t, b * 4 + 1 + hsh(b + 5) * 2, .22);
    for (let j = n - 1; j <= n + 1; j++) { const cc = cTime(j), o = (hsh(j + 11) - .5) * .7, u = t - (cc + o), sd = u < 0 ? .09 : .14; v -= 22 * m.early * gs(t, cc, .3); v -= m.vari * (38 + 22 * hsh(j + 3)) * Math.exp(-(u * u) / (2 * sd * sd)); v += 7 * m.vari * (gs(u, -.32, .08) + gs(u, .42, .09)); v -= m.late * (16 + 16 * m.red) * gs(t, cc + .62, .3); }
    if (m.brady > 0) v -= m.brady * 58 * sm(now - 4.2, now - 3.4, t);
    return v;
  }
  const toco = t => { const n = Math.round(t / 3); let v = 12 + 2 * vn(t * 3); for (let j = n - 1; j <= n + 1; j++) v += 58 * gs(t, cTime(j), .27); return v; };
  function ctg(g, s) {
    const k0 = s.normal ? 0 : s.k, k = s.has('resus') ? k0 * .38 : k0, m = ctgM(k), del = s.has('expedite') && !s.normal, c = pal(g);
    const now = 30 + s.time * .5, x0 = 22, x1 = 618, pxm = (x1 - x0) / 10, X = t => x1 - (now - t) * pxm, fy = v => 292 - (v - 50) / 160 * 246, ty = v => 440 - v / 100 * 112;
    paper(g, '#fbf1ee');
    rect(g, x0, 46, x1 - x0, 246, { f: 'rgba(255,255,255,.35)' }); rect(g, x0, fy(160), x1 - x0, fy(110) - fy(160), { f: 'rgba(120,200,140,.13)' }); rect(g, x0, 328, x1 - x0, 112, { f: 'rgba(255,255,255,.35)' });
    g.save(); g.beginPath(); g.rect(x0, 40, x1 - x0, 404); g.clip();
    for (let t = Math.floor(now - 10) - 1; t <= now + 1; t += .5) { const x = X(t), maj = Math.abs(t - Math.round(t)) < .01, col = maj ? 'rgba(200,70,70,.45)' : 'rgba(210,110,110,.22)'; line(g, [[x, 46], [x, 292]], col, maj ? 1.2 : .7); line(g, [[x, 328], [x, 440]], col, maj ? 1.2 : .7); if (maj && Math.round(t) % 2 === 0) mt(g, '+' + Math.round(t) + "'", x + 3, 308, { s: 9.5, c: '#a55' }); }
    g.restore();
    for (let v = 50; v <= 210; v += 10) line(g, [[x0, fy(v)], [x1, fy(v)]], v % 30 === 0 ? 'rgba(200,70,70,.45)' : 'rgba(210,110,110,.2)', v % 30 === 0 ? 1.1 : .6);
    for (let v = 0; v <= 100; v += 20) line(g, [[x0, ty(v)], [x1, ty(v)]], v % 50 === 0 ? 'rgba(200,70,70,.45)' : 'rgba(210,110,110,.2)', 1);
    [60, 90, 120, 150, 180, 210].forEach(v => mt(g, v, x0 + 4, fy(v) - 3, { s: 9.5, c: '#a33' })); [0, 50, 100].forEach(v => mt(g, v, x0 + 4, ty(v) - 3, { s: 9.5, c: '#a33' })); mt(g, 'FHR bpm', x0 + 30, 58, { s: 10, c: '#a33' }); mt(g, 'UA mmHg', x0 + 30, 342, { s: 10, c: '#a33' });
    const tEnd = del ? now - 3.2 : now, xe = X(tEnd);
    const tr = (fn, yf, lw) => { g.save(); g.beginPath(); for (let x = x0; x <= xe; x += 1.5) { const t = now - (x1 - x) / pxm, y = yf(fn(t)); x === x0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.strokeStyle = '#1d1d24'; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); g.restore(); };
    tr(t => clamp(fhr(t, m, now), 55, 205), fy, 1.4); tr(t => clamp(toco(t), 0, 100), ty, 1.3);
    if (del) { line(g, [[xe, 46], [xe, 440]], '#1b5e20', 2, [6, 4]); }
    const bl = Math.round(140 + 14 * m.red * (1 - m.brady)), cat = del ? -1 : m.brady > .3 || m.late > .4 || m.red > .5 ? 2 : m.vari > .4 ? 1 : 0;
    const dec = m.brady > .3 ? say('延長減速／心搏過緩', 'prolonged / bradycardia') : m.late > .4 ? say('晚期（反覆）', 'late (recurrent)') : m.vari > .4 ? say('變異', 'variable') : m.early > .3 ? say('早期', 'early') : say('無', 'none');
    mbox(g, 404, 50, [[cat < 0 ? say('已分娩：描記結束', 'Delivered: trace ends') : 'NICE / FIGO: ' + [say('正常', 'Normal'), say('可疑', 'Suspicious'), say('病理', 'Pathological')][cat], ['#1b5e20', '#1b5e20', '#8a4b00', '#b71c1c'][cat + 1]], [say('基線 ', 'Baseline ') + bl + ' bpm'], [say('變異度 ', 'Variability ') + (m.red > .5 ? '<5' : '5–25') + ' bpm'], [say('加速 ', 'Accelerations ') + (m.acc > .3 ? say('有', 'present') : say('無', 'absent'))], [say('減速 ', 'Decelerations ') + dec]], 206);
    const L = s.L; let lab = false;
    for (let j = Math.round(now / 3) - 3; j <= Math.round(now / 3) + 1 && !lab; j++) { const cc = cTime(j), tn = m.late > .4 ? cc + .62 : m.vari > .4 ? cc + (hsh(j + 11) - .5) * .7 : cc, x = X(tn); if (x < x0 + 110 || x > xe - 30 || x > 390) continue; lab = true; L(X(cc), ty(toco(cc)), '宮縮高峰', 'Contraction peak', X(cc) + 50, 360, c.n); if (m.late > .4 || m.vari > .4 || m.early > .3) L(x, fy(fhr(tn, m, now)), m.late > .4 ? '晚期減速：落後宮縮高峰、緩慢恢復' : m.vari > .4 ? '變異減速：V 形急降急升（臍帶受壓）' : '早期減速：與宮縮同步（胎頭受壓）', m.late > .4 ? 'Late deceleration: lags the peak, slow recovery' : m.vari > .4 ? 'Variable deceleration: abrupt V (cord compression)' : 'Early deceleration: mirrors the contraction (head compression)', Math.min(x + 60, 380), 250, m.late > .4 ? c.a : m.vari > .4 ? c.w : c.n); }
    L(x0 + 60, fy(bl), '基線 ' + bl + ' bpm（正常 110–160）', 'Baseline ' + bl + ' bpm (normal 110–160)', 120, 72, bl > 160 ? c.a : c.n);
    if (m.brady > .3 && !del) L(xe - 40, fy(bl - 55), '急性心搏過緩 ≥3 分鐘：立即分娩', 'Acute bradycardia ≥3 min: deliver now', 300, 230, c.a); if (del) L(xe, 150, '胎兒娩出，描記結束', 'Baby born, trace ends', 470, 220, c.t);
  }
  function partogram(g, s) {
    const r = s.normal ? 1.2 : s.v, aug = s.has('augment') && !s.normal, cs = s.has('cs') && !s.normal, c = pal(g);
    paper(g, '#f6f7f2'); const X = h => 92 + h * 42, Y = cm => 356 - cm * 24;
    rect(g, X(0), Y(10), X(12) - X(0), Y(0) - Y(10), { f: 'rgba(255,255,255,.6)', s: '#7a8a80', lw: 1 });
    for (let h = 0; h <= 12; h++) { line(g, [[X(h), Y(10)], [X(h), Y(0)]], 'rgba(80,110,95,.25)', 1); mt(g, h, X(h), Y(0) + 15, { s: 10.5, a: 'center' }); }
    for (let cm = 0; cm <= 10; cm++) { line(g, [[X(0), Y(cm)], [X(12), Y(cm)]], 'rgba(80,110,95,.25)', 1); mt(g, cm, X(0) - 8, Y(cm) + 4, { s: 10.5, a: 'right' }); }
    mt(g, say('子宮頸擴張（cm）X · 胎頭下降（觸及五分之幾）O', 'Cervix (cm) X · descent (fifths palpable) O'), X(0), Y(10) - 22, { s: 11 }); mt(g, say('活躍期小時', 'hours of active phase'), X(12), Y(0) + 30, { s: 10.5, a: 'right' });
    line(g, [[X(0), Y(4)], [X(6), Y(10)]], '#d08a00', 2.5); line(g, [[X(4), Y(4)], [X(10), Y(10)]], '#c62828', 2.5);
    const cross = r < 1 ? 4 / (1 - r) : 99, ta = aug ? Math.min(cross, 9) : 99, r2 = Math.max(r, 1.15), dil = h => Math.min(10, h <= ta ? 4 + r * h : 4 + r * ta + r2 * (h - ta));
    let full = 99; for (let h = 0; h <= 12; h += .05) if (dil(h) >= 10) { full = h; break; }
    const tcs = cs ? Math.min(12, aug ? ta + 4 : Math.min(cross, 10) + 2, full) : 99, tEnd = Math.min(12, full, tcs), pts = [];
    for (let h = 0; h <= tEnd + 1e-6; h += 1) pts.push([X(h), Y(dil(h))]); if (tEnd % 1 > .05) pts.push([X(tEnd), Y(dil(tEnd))]);
    line(g, pts, '#263238', 1.6); pts.forEach(([x, y]) => { line(g, [[x - 5, y - 5], [x + 5, y + 5]], '#263238', 2.2); line(g, [[x + 5, y - 5], [x - 5, y + 5]], '#263238', 2.2); });
    for (let h = 0; h <= tEnd + 1e-6; h += 2) { const f5 = clamp(5 - (dil(h) - 4) / 6 * 4, 0, 5); ell(g, X(h), Y(f5 * 2), 5, 5, { s: '#1565c0', lw: 2 }); }
    for (let h = 0; h < Math.min(12, tEnd); h += .5) { const n = h >= ta ? 4 : r < .7 ? 2 : 3; for (let i = 0; i < 5; i++) rect(g, X(h) + 2, 412 - i * 7, 17, 6, { f: i < n ? (h >= ta ? '#c62828' : '#ef9a9a') : 'rgba(0,0,0,.05)' }); }
    mt(g, say('宮縮／10 分', 'contractions / 10 min'), X(0) - 4, 434, { s: 10, a: 'left' });
    for (let h = 0; h <= tEnd; h += .5) ell(g, X(h), 66 + 6 * Math.sin(h * 3), 2.4, 2.4, { f: '#455a64' }); mt(g, 'FHR 140', X(0) - 6, 70, { s: 10, a: 'right' });
    if (aug && cross < 12) { line(g, [[X(ta), Y(dil(ta)) - 12], [X(ta), Y(dil(ta)) + 12]], '#1b5e20', 3); }
    if (cs && tcs < 99) rect(g, X(tcs) - 16, Y(dil(tcs)) - 30, 40, 18, { f: '#b71c1c', r: 4 }), mt(g, 'C/S', X(tcs) + 4, Y(dil(tcs)) - 17, { s: 11, a: 'center', c: '#fff', sh: false });
    const L = s.L; L(X(3), Y(7), '警戒線（每小時 1 cm）', 'Alert line (1 cm/h)', 130, 150, c.w); L(X(8), Y(8), '行動線（右移 4 小時）', 'Action line (4 h to the right)', 470, 150, c.a);
    const last = pts[pts.length - 1]; L(last[0], last[1], (cross < 12 && !aug ? '跨過行動線：產程遲滯，' : '子宮頸 ') + dil(tEnd).toFixed(1) + ' cm', (cross < 12 && !aug ? 'Crossed the action line: delay — ' : 'Cervix ') + dil(tEnd).toFixed(1) + ' cm', Math.min(last[0] + 50, 560), Math.max(last[1] - 40, 150), cross < 12 && !aug ? c.a : c.n);
    if (aug && cross < 12) L(X(ta), Y(dil(ta)), '人工破水＋催產素：曲線變陡', 'Amniotomy + oxytocin: the line steepens', 460, 300, c.t); else if (aug) L(X(Math.min(tEnd, 4)), Y(dil(Math.min(tEnd, 4))), '進展在警戒線左側：不需加速', 'Progress left of the alert line: augmentation not needed', 460, 300, c.w); if (cs && tcs < 99) L(X(tcs), Y(dil(tcs)) - 24, '產程停滯：剖腹產', 'Arrest of labour: caesarean', 470, 250, c.a);
  }
  const OB_RX = {
    steroids: { zh: '產前類固醇（胎肺成熟）', en: 'Antenatal corticosteroids', text: '預期 34 週前（部分指引至 36 週）早產或計畫提早分娩時給予母體類固醇，促進胎肺表面張力素生成，減少新生兒呼吸窘迫、腦室內出血與死亡；效果在給藥後 24 小時至 7 天最佳。超音波與都卜勒影像不會因此改變。', textEn: 'When birth before about 34 weeks (up to 36 in some guidance) is expected or planned, maternal corticosteroids accelerate fetal surfactant production and reduce neonatal respiratory distress, intraventricular haemorrhage and death; benefit is greatest from 24 hours to 7 days after the course. The ultrasound and Doppler images do not change.' },
    magnesium: { zh: '硫酸鎂（胎兒神經保護）', en: 'Magnesium sulfate (fetal neuroprotection)', text: '預期 30–32 週前分娩時給予母體硫酸鎂可降低腦性麻痺風險；子癇前症時也用來預防子癇抽搐，需監測反射、呼吸與尿量。影像不會改變。', textEn: 'Given to the mother when birth is expected before about 30–32 weeks, magnesium sulfate reduces the risk of cerebral palsy; in pre-eclampsia it also prevents eclamptic seizures, with monitoring of reflexes, breathing and urine output. The image does not change.' },
    delivery: { zh: '計畫分娩', en: 'Planned delivery', text: '生長遲滯的分娩時機取決於週數與都卜勒：舒張末期血流消失或逆流、靜脈導管異常或胎心監測惡化時，在類固醇（與早週數的硫酸鎂）之後於三級醫院分娩，多為剖腹產；出生後臍動脈都卜勒不再適用，由新生兒團隊接手。', textEn: 'Timing of birth in growth restriction depends on gestation and Doppler: absent or reversed end-diastolic flow, an abnormal ductus venosus or a deteriorating CTG prompts delivery in a tertiary unit — usually by caesarean — after steroids (and magnesium at early gestations); after birth the umbilical Doppler no longer applies and the neonatal team takes over.' },
    rescan: { zh: '32 週複查超音波', en: 'Repeat scan at 32 weeks', text: '20 週時的低置胎盤多數會因子宮下段形成而「上移」，因此在 32 週（必要時 36 週）以經陰道超音波複查胎盤下緣與子宮頸內口的距離，作為分娩方式的依據；完全覆蓋內口者較少改善。', textEn: 'Most placentas that are low-lying at 20 weeks "migrate" as the lower uterine segment forms, so the distance from edge to internal os is rechecked transvaginally at 32 (and if needed 36) weeks to plan the mode of birth; placentas that cover the os seldom resolve.' },
    cs: { zh: '剖腹產', en: 'Caesarean birth', text: '前置胎盤（覆蓋內口或下緣距內口 <20 mm）、持續臀位或產程停滯而無法安全經陰道分娩時，採取子宮下段剖腹產；前置胎盤合併前次剖腹產疤痕需先排除植入性胎盤。影像上子宮已排空、下段可見切口。', textEn: 'Lower-segment caesarean is chosen when placenta praevia (covering the os or within 20 mm), a persistent breech or arrested labour makes vaginal birth unsafe; praevia over a previous caesarean scar must first be screened for placenta accreta. The image shows the emptied uterus and the lower-segment incision.' },
    ecv: { zh: '外轉胎位術（ECV）', en: 'External cephalic version (ECV)', text: '單胎臀位在 36–37 週後，於超音波與胎心監測下經腹壁把胎兒臀部推離骨盆、引導胎頭向下「前滾翻」轉成頭位；成功率約五成，可明顯降低剖腹產率。前置胎盤、破水或胎心異常為禁忌。', textEn: 'For a singleton breech from 36–37 weeks, the buttocks are lifted out of the pelvis and the head guided down in a "forward roll" through the abdominal wall under ultrasound and CTG monitoring; about half succeed, substantially lowering the caesarean rate. Placenta praevia, ruptured membranes or an abnormal CTG are contraindications.' },
    resus: { zh: '子宮內復甦', en: 'Intrauterine resuscitation', text: '胎心監測可疑或病理時先處理可逆原因：改左側臥避開下腔靜脈壓迫、靜脈輸液矯正低血壓、停止催產素並視需要以子宮鬆弛劑處理過度收縮，同時排除臍帶脫垂、胎盤早期剝離與子宮破裂；圖形改善即可繼續監測。', textEn: 'A suspicious or pathological CTG first prompts correction of reversible causes: left lateral position to relieve aortocaval compression, IV fluids for hypotension, stopping oxytocin and tocolysis for hyperstimulation, while excluding cord prolapse, abruption and uterine rupture; if the pattern improves, monitoring continues.' },
    expedite: { zh: '加速分娩（器械或剖腹）', en: 'Expedite birth (instrumental or caesarean)', text: '子宮內復甦無效、持續病理性圖形或急性心搏過緩 ≥3 分鐘時，子宮頸全開者以真空吸引或產鉗，否則第一類緊急剖腹產（決定到分娩目標 30 分鐘）；胎兒娩出後移除探頭，描記結束，並送臍帶血氣分析。', textEn: 'If intrauterine resuscitation fails, the trace stays pathological or there is an acute bradycardia of 3 minutes or more, birth is expedited — ventouse or forceps if fully dilated, otherwise a category 1 caesarean (decision-to-delivery target 30 minutes); once the baby is born the transducers come off, the trace ends and paired cord gases are sent.' },
    augment: { zh: '人工破水＋催產素加速', en: 'Amniotomy + oxytocin augmentation', text: '活躍期進展落到警戒線右側時重新評估胎位、胎頭下降與宮縮；排除頭盆不稱後人工破水，並以催產素把宮縮加強到每 10 分鐘 4–5 次，產程圖上的擴張曲線隨之變陡；過度宮縮時減量或停藥。', textEn: 'When active-phase progress falls to the right of the alert line, position, descent and contractions are reassessed; once disproportion is excluded, amniotomy and oxytocin raise contractions to 4–5 per 10 minutes and the dilatation line on the partogram steepens. Hyperstimulation requires reduction or stopping.' }
  };
  const OB_CONDS = [
    { id: 'fgr', zh: '胎兒生長遲滯（FGR）', en: 'Fetal growth restriction', rx: ['steroids', 'magnesium', 'delivery'], views: [
      { id: 'crl', zh: '頭臀長（定週數）', en: 'Crown–rump length (dating)', mod: 'US', hdr: 'TRANSABDOMINAL US · CRL', p: P('妊娠週數', 'Gestational age', 6, 14, 12, ' w', { step: .1, normal: 12, fmt: v => gaTxt(v) + ' · CRL ' + crlMm(v).toFixed(1) + ' mm' }), h: { scale: [46, '2 cm'] }, draw: crlUS },
      { id: 'biometry', zh: '生物測量', en: 'Biometry', mod: 'US', hdr: 'FETAL BIOMETRY · DUAL', p: P('妊娠週數', 'Gestational age', 20, 40, 32, ' w', { step: .1, normal: 32, fmt: v => gaTxt(v) }), h: { scale: [35, '2 cm'] }, draw: biometryUS },
      { id: 'doppler', zh: '臍動脈都卜勒', en: 'Umbilical artery Doppler', mod: 'DUS', hdr: 'UMBILICAL ARTERY · PW DOPPLER', p: P('胎盤阻力', 'Placental resistance', 0, 100, 62, '%', { fmt: v => v + '% · ' + (v < 50 ? 'EDF +' : v < 66 ? 'AEDF' : 'REDF') }), draw: uaDoppler }],
      f: '準確週數以 11–14 週頭臀長（CRL）定出，之後以雙頂徑、頭圍、腹圍與股骨長推估胎兒體重。估計體重或腹圍低於第 10 百分位、或生長曲線下跌即懷疑生長遲滯；胎盤功能不全時頭部相對保留、腹圍最先落後。臍動脈都卜勒反映胎盤阻力：舒張末期血流由減少、消失（AEDF）到逆流（REDF）代表胎兒窘迫逐步加重。', fEn: 'Gestation is best set by the crown–rump length at 11–14 weeks; later the biparietal diameter, head and abdominal circumference and femur length estimate fetal weight. An estimated weight or abdominal circumference below the 10th centile, or a falling growth curve, suggests restriction; in placental insufficiency the head is relatively spared and the abdomen lags first. Umbilical artery Doppler reflects placental resistance: end-diastolic flow that is reduced, then absent (AEDF) and finally reversed (REDF) marks progressive fetal compromise.' },
    { id: 'praevia', zh: '前置胎盤／低置胎盤', en: 'Placenta praevia / low-lying placenta', rx: ['rescan', 'steroids', 'cs'], views: [{ id: 'tvus', zh: '經陰道超音波', en: 'Transvaginal ultrasound', mod: 'US', hdr: 'TVUS SAGITTAL · LOWER SEGMENT', p: P('胎盤下緣距內口', 'Edge to internal os', -30, 40, -10, ' mm', { normal: 40, fmt: v => (v >= 0 ? '+' : '') + v + ' mm' }), h: { scale: [60, '2 cm'] }, draw: praeviaUS }],
      f: '經陰道超音波最能準確測量胎盤下緣與子宮頸內口的距離，即使出血也安全。胎盤覆蓋內口稱為前置胎盤，下緣距內口 <20 mm 為低置胎盤，≥20 mm 為正常位置。典型表現為無痛性鮮紅色陰道出血；應避免內診，並排除合併植入性胎盤。', fEn: 'Transvaginal ultrasound measures the distance from the placental edge to the internal cervical os most accurately and is safe even with bleeding. A placenta covering the os is praevia, an edge within 20 mm is low-lying, and 20 mm or more is normally sited. The classic presentation is painless bright-red bleeding; digital examination is avoided and placenta accreta is excluded.' },
    { id: 'breech', zh: '臀位', en: 'Breech presentation', rx: ['ecv', 'cs'], views: [
      { id: 'map', zh: '胎位示意圖', en: 'Presentation diagram', mod: 'MAP', hdr: 'FETAL LIE & PRESENTATION', p: P('胎兒長軸角度', 'Fetal axis', 0, 180, 10, '°', { normal: 180, fmt: v => v + '° · ' + presName(v)[0] }), draw: breechMap },
      { id: 'us', zh: '恥骨上超音波', en: 'Suprapubic ultrasound', mod: 'US', hdr: 'SUPRAPUBIC US · PRESENTING PART', p: P('胎兒長軸角度', 'Fetal axis', 0, 180, 10, '°', { normal: 180, fmt: v => v + '° · ' + presName(v)[0] }), draw: presentUS }],
      f: '28 週約四分之一胎兒為臀位，足月只剩 3–4%；類型有伸腿臀位（臀先、雙腿伸直貼臉）、完全臀位與足式臀位。超音波在恥骨上方看到臀部與股骨而非胎頭，胎頭位於子宮底，胎心在臍上最清楚。足月臀位先嘗試外轉胎位術，失敗者多計畫剖腹產。', fEn: 'About a quarter of fetuses are breech at 28 weeks but only 3–4% at term; frank (legs extended to the face), complete and footling breech are the main types. Ultrasound above the symphysis shows buttocks and femurs instead of the head, which lies in the fundus, and the fetal heart is loudest above the umbilicus. At term ECV is offered first, and most persistent breeches are delivered by planned caesarean.' },
    { id: 'ctg', zh: '產時胎心監測（CTG）', en: 'Intrapartum CTG', rx: ['resus', 'expedite'], views: [{ id: 'ctg', zh: '胎心宮縮描記', en: 'CTG trace', mod: 'CTG', hdr: 'CTG · FHR + UTERINE ACTIVITY', p: P('圖形', 'Pattern', 0, 100, 74, '', { fmt: v => v < 12 ? say('正常', 'normal') : v < 38 ? say('早期減速', 'early decelerations') : v < 62 ? say('變異減速', 'variable decelerations') : v < 85 ? say('晚期減速', 'late decelerations') : say('心搏過緩', 'bradycardia') }), draw: ctg, anim: true }],
      f: '判讀順序：基線（正常 110–160 bpm）、變異度（正常 5–25 bpm）、加速（出現時令人安心）與減速。早期減速與宮縮同步如鏡像，是胎頭受壓的良性表現；變異減速呈 V 形急降急升，反映臍帶受壓；晚期減速在宮縮高峰後才開始且緩慢恢復，代表子宮胎盤供氧不足。NICE（2017）與 FIGO 把圖形分為正常、可疑與病理，急性心搏過緩需立即處理。', fEn: 'Read in order: baseline (normal 110–160 bpm), variability (normal 5–25 bpm), accelerations (reassuring when present) and decelerations. Early decelerations mirror contractions and reflect benign head compression; variable decelerations drop and recover abruptly in a V, reflecting cord compression; late decelerations begin after the contraction peak and recover slowly, signalling uteroplacental hypoxia. NICE (2017) and FIGO classify traces as normal, suspicious or pathological, and an acute bradycardia demands immediate action.' },
    { id: 'labour', zh: '產程遲滯（產程圖）', en: 'Slow labour progress (partogram)', rx: ['augment', 'cs'], views: [{ id: 'partogram', zh: 'WHO 產程圖', en: 'WHO partograph', mod: 'PARTO', hdr: 'WHO PARTOGRAPH · ACTIVE PHASE', p: P('子宮頸擴張速度', 'Dilatation rate', .2, 1.6, .4, ' cm/h', { step: .05, normal: 1.2, fmt: v => v.toFixed(2) + ' cm/h' }), draw: partogram }],
      f: 'WHO 產程圖從活躍期（傳統為 4 cm）開始以 X 記錄子宮頸擴張，警戒線代表每小時 1 cm，行動線在其右側 4 小時；曲線跨過警戒線要重新評估，跨過行動線要介入。原因以「3P」思考：產力（宮縮不足）、產道與胎兒（胎位不正、頭盆不稱）。WHO 2020 年產程照護指引改以 5 cm 為活躍期起點，並以每公分的時間上限判斷。', fEn: 'The WHO partograph plots cervical dilatation (X) from the active phase (classically 4 cm); the alert line represents 1 cm per hour and the action line lies 4 hours to its right. Crossing the alert line prompts reassessment, crossing the action line intervention, and causes are framed as the "3 Ps": power (weak contractions), passage and passenger (malposition, disproportion). The 2020 WHO Labour Care Guide starts the active phase at 5 cm and uses time limits per centimetre instead.' }
  ];
  ST.register({ id: 'obstetrics', zh: '產科', en: 'Obstetrics', rx: OB_RX, conds: OB_CONDS });

  // ================================================================ GYNAECOLOGY
  const FIGO = [['帶蒂宮腔內', 'pedunculated intracavitary'], ['黏膜下，<50% 在肌層', 'submucous, <50% intramural'], ['黏膜下，≥50% 在肌層', 'submucous, ≥50% intramural'], ['肌層內、貼內膜', 'intramural, contacts endometrium'], ['完全肌層內', 'entirely intramural'], ['漿膜下，≥50% 在肌層', 'subserosal, ≥50% intramural'], ['漿膜下，<50% 在肌層', 'subserosal, <50% intramural'], ['帶蒂漿膜下', 'pedunculated subserosal'], ['其他（子宮頸）', 'other (cervical)']];
  function uterusUS(g, s, mode) {
    const c = pal(g), Q = rot(345, 250, .32), myo = s.has('myomectomy'), uae = s.has('uae') && !myo, pol = s.has('polypectomy');
    const t = mode === 'fibroid' && !s.normal ? s.v : -1, et = mode === 'endo' ? (s.normal || pol ? 3 : s.v) : 7, polyp = mode === 'endo' && !s.normal && !pol && s.v > 7;
    const R = 27 * (uae ? .78 : 1), showF = t >= 0 && !myo, cy = pw(t, [0, 1, 2, 3, 4, 5, 6, 7], [4, -2, -24, -41, -49, -74, -96, -130]), fx = t > 7 ? lerp(50, -125, t - 7) : 50, fy = t > 7 ? lerp(cy, -10, t - 7) : cy, eh = et * 3.2 / 2;
    const [bx, by] = Q(fx, fy), rp = clamp((s.v - 6) * 2.4, 6, 26);
    usBg(g);
    sector(g, { cy: 18, r1: 452, a0: PI / 2 - .78, a1: PI / 2 + .78, near: '#575757', mid: '#383838', far: '#171717' }, () => {
      dots(g, 30, 330, 300, 280, 160, 14, 'rgba(90,90,90,.35)', 8, 10);
      const body = [Q(-178, -30), Q(-80, -50), Q(30, -94), Q(140, -88), Q(192, -10), Q(150, 86), Q(30, 94), Q(-80, 50), Q(-178, 30)];
      shape(g, body, { f: '#6a6a6a', blur: 14 }); dots(g, 26, 345, 250, 150, 70, 6, 'rgba(50,50,50,.35)', 21, 4); shape(g, body, { s: 'rgba(205,205,205,.3)', lw: 2 });
      if (showF && t >= 4.6 && t <= 7.6) ell(g, bx, by, R + 9, R + 9, { f: '#6a6a6a', blur: 10 });
      const endo = [Q(-70, 0), Q(-10, -eh * .8), Q(70, -eh), Q(135, -eh * .6), Q(150, 0), Q(135, eh * .6), Q(70, eh), Q(-10, eh * .8)];
      shape(g, endo, { f: et > 10 ? '#c2c2c2' : '#b2b2b2', blur: 6 }); shape(g, [Q(-70, 0), Q(40, 0), Q(140, 0)], { open: true, s: 'rgba(255,255,255,.7)', lw: 1.4 });
      shape(g, [Q(-182, 0), Q(-120, 2), Q(-70, 0)], { open: true, s: 'rgba(225,225,225,.7)', lw: 2.5 });
      if (polyp) { const [px, py] = Q(62, 0); ell(g, px, py, rp, rp * .8, { f: '#d8d8d8', blur: 4 }); dots(g, 4, px, py, rp * .5, rp * .4, 2.2, 'rgba(20,20,20,.7)', 6); line(g, [Q(62, -eh - 26), Q(62, -rp * .4)], 'rgba(255,60,48,.95)', 3); flow(g, [Q(62, -eh - 18), Q(62, -eh - 6), Q(62, -rp * .2)], 9, 5); }
      if (showF) {
        if (t >= 6.5 && t <= 7.5) line(g, [Q(fx, -88), Q(fx, fy + R)], '#5c5c5c', 10); if (t <= .6) line(g, [Q(fx, -eh), Q(fx, fy - R)], '#5c5c5c', 8);
        if (t < 2.6) ell(g, bx, by, R + 4, R * .94 + 4, { s: 'rgba(215,215,215,.75)', lw: 4, blur: 3 });
        ell(g, bx, by, R, R * .94, { f: uae ? '#262626' : '#3d3d3d', blur: 3 }); for (let i = 1; i < 4; i++) ell(g, bx, by, R * i / 4, R * i / 4 * .9, { s: 'rgba(110,110,110,.35)', lw: 1.5, a0: i, a1: i + 2.4, open: true });
        if (uae) dots(g, 7, bx, by, R * .5, R * .5, 4, 'rgba(8,8,8,.8)', 3, 3); ell(g, bx, by, R, R * .94, { s: 'rgba(190,190,190,.5)', lw: 1.5 });
        const a2 = Math.atan2(by - 18, bx - 320); for (let i = -3; i <= 3; i++) { const ox = bx + Math.cos(a2 + PI / 2) * i * R * .28, oy = by + Math.sin(a2 + PI / 2) * i * R * .28; line(g, [[ox + Math.cos(a2) * R * .8, oy + Math.sin(a2) * R * .8], [ox + Math.cos(a2) * (R + 120), oy + Math.sin(a2) * (R + 120)]], 'rgba(0,0,0,.34)', 3); }
        if (!uae) flow(g, ring(bx, by, R + 4, 11), 5, 6);
        cal(g, [bx - R, by], [bx + R, by]);
      }
      if (myo && t >= 0) line(g, [[bx - 16, by - 5], [bx + 16, by + 5]], 'rgba(240,240,240,.85)', 3);
      if (mode === 'endo') cal(g, Q(96, -eh), Q(96, eh));
    });
    const L = s.L; L(...Q(-150, 0), '子宮頸', 'Cervix', 90, 180); L(...Q(185, 0), '子宮底', 'Fundus', 570, 330);
    if (mode === 'fibroid') {
      const ty = Math.round(clamp(t, 0, 8)), mm = Math.round(R * 2 / 3.2);
      mbox(g, 14, 38, showF ? [['FIGO ' + ty + ' · ' + say(FIGO[ty][0], FIGO[ty][1])], [say('肌瘤 ', 'Fibroid ') + mm + ' mm' + (uae ? say('（栓塞後）', ' (post-UAE)') : '')]] : [[myo ? say('肌瘤已切除', 'Fibroid removed') : say('子宮肌層均勻', 'Homogeneous myometrium')]], 250);
      L(...Q(110, -eh), '子宮內膜', 'Endometrium', 470, 70);
      if (showF) { L(bx, by - R, ty <= 2 ? '黏膜下肌瘤（凸入宮腔）' : ty <= 4 ? '肌層內肌瘤' : ty <= 7 ? '漿膜下肌瘤（外凸）' : '子宮頸肌瘤', ty <= 2 ? 'Submucous fibroid (indents the cavity)' : ty <= 4 ? 'Intramural fibroid' : ty <= 7 ? 'Subserosal fibroid (bulges outward)' : 'Cervical fibroid', 120, 120, c.a); L(bx + 40, by + R + 50, '扇形「百葉窗」聲影', 'Fan-shaped "venetian blind" shadowing', 470, 405); if (!uae) L(bx + R, by, '周邊環狀血流', 'Peripheral circumferential flow', 560, 230, '#ff8a80'); else L(bx, by, '栓塞後梗塞、血流消失、體積縮小', 'Infarcted after UAE: no flow, smaller', 560, 230, c.t); }
      else if (myo) L(bx, by, ty <= 2 ? '子宮鏡切除後宮腔平整' : '肌層縫合疤痕', ty <= 2 ? 'Smooth cavity after hysteroscopic resection' : 'Myometrial repair scar', 560, 230, c.t);
    } else {
      mbox(g, 14, 38, [['ET ' + et.toFixed(1) + ' mm', et > 4 ? '#ff8a80' : null], [say('停經後閾值 4 mm', 'Postmenopausal cut-off 4 mm'), '#9ab']], 220);
      L(...Q(96, -eh), et > 4 ? '內膜增厚（雙層 ' + et.toFixed(1) + ' mm）' : '內膜薄（雙層 ' + et.toFixed(1) + ' mm）', et > 4 ? 'Thickened endometrium (double layer ' + et.toFixed(1) + ' mm)' : 'Thin endometrium (double layer ' + et.toFixed(1) + ' mm)', 470, 70, et > 4 ? c.a : c.n);
      if (polyp) L(...Q(62, 0), '息肉＋單一供血血管（蒂血管徵）', 'Polyp with a single feeding vessel (pedicle artery sign)', 120, 420, c.a); if (pol) L(...Q(40, 0), '息肉切除後內膜變薄', 'Thin lining after polypectomy', 120, 420, c.t);
    }
  }
  function hysteroscopy(g, s, mode) {
    const c = pal(g), k = s.normal ? 0 : s.k, done = s.has(mode === 'fibroid' ? 'myomectomy' : mode === 'polyp' ? 'polypectomy' : 'metroplasty'), sep = mode === 'septum' && !s.normal ? (done ? .06 : .25 + k * .75) : 0;
    let fx = 0, fy = 0, fr = 0;
    scope(g, { bg: '#c9776a' }, (cx, cy, r) => {
      g.fillStyle = rgrad(g, cx, cy - 20, 10, r, ['rgba(90,20,20,.55)', 'rgba(210,130,115,0)']); g.fillRect(0, 0, W, H); noise(g, .25, 'overlay', 1.2); vessels(g, cx, cy, r, 14, 31, 'rgba(160,40,40,.45)', 1.2);
      const ost = (x, y) => { ell(g, x, y, 12, 9, { f: '#3a0d0d', blur: 6 }); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; line(g, [[x + Math.cos(a) * 12, y + Math.sin(a) * 9], [x + Math.cos(a) * 26, y + Math.sin(a) * 20]], 'rgba(120,40,35,.35)', 2); } };
      ost(cx - 105, cy - 52); ost(cx + 105, cy - 52);
      if (sep > 0) { const len = sep * 300; shape(g, [[cx - 36, cy - r], [cx + 36, cy - r], [cx + 22, cy - r + len], [cx, cy - r + len + 18], [cx - 22, cy - r + len]], { f: rgrad(g, cx, cy - r + len / 2, 4, len, ['#f0c8bc', '#cf8f80']), s: 'rgba(255,255,255,.3)', lw: 2, blur: 8 }); line(g, [[cx - 6, cy - r], [cx - 4, cy - r + len]], 'rgba(255,255,255,.35)', 3); }
      if (mode === 'septum' && done) { rect(g, cx - 40, cy - r, 80, 40, { f: 'rgba(240,215,200,.6)' }); dots(g, 8, cx, cy - r + 24, 34, 10, 2, 'rgba(60,30,20,.7)', 4); }
      if (mode === 'fibroid' && k > 0 && !done) { fr = 50 + k * 85; fx = cx + 70; fy = cy + 70; ell(g, fx, fy, fr, fr * .8, { f: rgrad(g, fx - 30, fy - 30, 10, fr * 1.2, ['#f8e6de', '#e2b4a6', '#c98c7c']), blur: 10 }); vessels(g, fx, fy, fr * .8, 6, 13, 'rgba(170,40,40,.6)', 1.5); ell(g, fx - fr * .35, fy - fr * .35, fr * .2, fr * .1, { f: 'rgba(255,255,255,.4)', rot: -.6, blur: 10 }); }
      if (mode === 'fibroid' && done) { ell(g, cx + 60, cy + 90, 70, 34, { f: 'rgba(240,220,190,.75)', blur: 6 }); dots(g, 10, cx + 60, cy + 90, 60, 26, 2.5, 'rgba(60,30,20,.65)', 7); }
      if (mode === 'polyp' && k > 0 && !done) { fr = 24 + k * 46; fx = cx + 30; fy = cy + 10 + k * 40; shape(g, [[cx + 60, cy - r * .72], [cx + 84, cy - r * .5], [fx + fr * .8, fy - fr * .3], [fx + fr * .5, fy + fr * .9], [fx - fr * .5, fy + fr * .9], [fx - fr * .8, fy - fr * .3], [cx + 40, cy - r * .5]], { f: rgrad(g, fx - 10, fy - 20, 6, fr * 2.4, ['#f2a49a', '#d4655b', '#a8423b']), blur: 8 }); vessels(g, fx, fy, fr, 5, 41, 'rgba(140,20,20,.65)', 1.3); ell(g, fx - fr * .3, fy - fr * .2, fr * .25, fr * .1, { f: 'rgba(255,255,255,.4)', rot: -.5, blur: 8 }); }
      if (mode === 'polyp' && done) { ell(g, cx + 70, cy - r * .62, 18, 12, { f: 'rgba(245,225,200,.85)', blur: 4 }); dots(g, 5, cx + 70, cy - r * .62, 14, 8, 2, 'rgba(60,30,20,.7)', 3); }
    });
    const L = s.L; L(215, 200, '右輸卵管開口', 'Right tubal ostium', 90, 90); L(425, 200, '左輸卵管開口', 'Left tubal ostium', 550, 90);
    if (fr && mode === 'fibroid') L(fx, fy - fr * .5, '黏膜下肌瘤：白色光滑圓頂、表面血管', 'Submucous fibroid: smooth white dome with surface vessels', 470, 440, c.a);
    if (fr && mode === 'polyp') L(fx, fy, '內膜息肉：柔軟、粉紅、可隨水流擺動', 'Endometrial polyp: soft, pink, sways in the fluid', 470, 440, c.a);
    if (sep > .1) L(320, 70 + sep * 150, '中線中隔把宮腔分成兩半', 'Midline septum dividing the cavity', 470, 440, c.a);
    if (done) L(mode === 'septum' ? 320 : mode === 'polyp' ? 390 : 380, mode === 'septum' ? 70 : mode === 'polyp' ? 130 : 342, mode === 'septum' ? '切開後單一宮腔、兩側開口同時可見' : '切除後的基部（電燒痕）', mode === 'septum' ? 'Single cavity after incision, both ostia in one view' : 'Resected base (diathermy)', 120, 440, c.t);
    if (!fr && !done && sep <= .1) L(320, 300, '宮腔平整、內膜薄', 'Smooth cavity, thin endometrium', 470, 440);
  }
  function coronal3D(g, s) {
    const c = pal(g), k = s.normal ? 0 : s.k, done = s.has('metroplasty'), sep = s.normal ? 0 : done ? .06 : .2 + .8 * k, mm = Math.round(sep * 34);
    usBg(g); g.save(); g.beginPath(); g.rect(40, 36, 560, 410); g.clip(); g.fillStyle = rgrad(g, 320, 240, 20, 360, ['#3a3a3a', '#141414']); g.fillRect(0, 0, W, H); noise(g, .5, 'overlay', 2.2);
    shape(g, [[170, 122], [470, 122], [506, 172], [452, 322], [362, 402], [278, 402], [188, 322], [134, 172]], { f: '#6e6e6e', blur: 16 }); dots(g, 40, 320, 250, 160, 120, 6, 'rgba(50,50,50,.35)', 5, 4);
    shape(g, [[204, 152], [436, 152], [334, 362], [306, 362]], { f: '#c6c6c6', blur: 8 });
    if (sep > 0) shape(g, [[296, 140], [344, 140], [330, 152 + sep * 200], [320, 168 + sep * 200], [310, 152 + sep * 200]], { f: '#6e6e6e', blur: 6 });
    noise(g, .35, 'overlay', 2); g.restore(); rect(g, 40, 36, 560, 410, { s: 'rgba(255,255,255,.15)', lw: 1 });
    line(g, [[204, 150], [436, 150]], '#ffe14d', 1.2, [4, 4]); if (sep > .08) cal(g, [320, 150], [320, 152 + sep * 200]);
    mbox(g, 50, 46, [[say('外側子宮底凹陷 ', 'External fundal indentation ') + '3 mm'], [say('中隔長度 ', 'Septum length ') + mm + ' mm', mm >= 10 ? '#ff8a80' : null], [mm >= 10 ? say('→ 中隔子宮', '→ septate uterus') : say('→ 宮腔形狀正常', '→ normal cavity'), mm >= 10 ? '#ff8a80' : '#9f9']], 250);
    const L = s.L; L(320, 124, '外側子宮底平滑（非雙角）', 'Smooth outer fundus (not bicornuate)', 470, 90); L(260, 200, '內膜（宮腔）', 'Endometrium (cavity)', 90, 300);
    if (sep > .08) L(320, 150 + sep * 120, '中隔', 'Septum', 520, 300, c.a); else if (done) L(320, 170, '切開後殘留 <1 cm', 'Residual <1 cm after resection', 520, 300, c.t);
  }
  function ovaryUS(g, s) {
    const c = pal(g), k = s.normal ? 0 : s.k, gone = s.has('cyst-rescan') && k < .3, surg = s.has('cyst-surgery') && !s.normal, ooph = surg && k >= .6, cyst = !s.normal && !gone && !surg;
    const R = 62 + 58 * k, cx = 320, cy = 236, mm = Math.round(38 + 92 * k), R2 = rng(17), nPap = k > .45 ? Math.min(6, 1 + Math.floor((k - .45) / .07)) : 0;
    usBg(g);
    sector(g, { cy: 22, r1: 440, a0: PI / 2 - .7, a1: PI / 2 + .7 }, () => {
      if (k > .82 && cyst) shape(g, [[110, 370], [250, 340], [420, 350], [560, 390], [560, 450], [90, 450]], { f: '#050505', blur: 6 });
      if (!ooph) { ell(g, cx, cy, cyst ? R + 26 : 92, cyst ? R + 18 : 66, { f: '#6a6a6a', blur: 12 }); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + .3, rr = cyst ? R + 14 : 50; ell(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .8, 6 + R2() * 6, 5 + R2() * 5, { f: '#0a0a0a' }); } }
      else { dots(g, 30, cx, cy, 150, 80, 12, 'rgba(90,90,90,.5)', 4, 8); }
      if (cyst) {
        ell(g, cx, cy + R + 40, R * .9, 50, { f: 'rgba(255,255,255,.12)', blur: 30 });
        ell(g, cx, cy, R, R * .86, { f: '#050505', s: 'rgba(225,225,225,.9)', lw: 2 + (k > .6 ? 2 : 0) });
        g.save(); g.beginPath(); g.ellipse(cx, cy, R, R * .86, 0, 0, TAU); g.clip();
        if (k > .25) { const n = Math.min(5, 1 + Math.floor((k - .25) / .1)); for (let i = 0; i < n; i++) { const a = R2() * PI; line(g, [[cx + Math.cos(a) * R, cy + Math.sin(a) * R], [cx - Math.cos(a) * R * (.4 + R2() * .5), cy - Math.sin(a) * R * .6]], 'rgba(220,220,220,.85)', 1.5 + (k > .6 ? 2 : 0)); } }
        for (let i = 0; i < nPap; i++) { const a = -PI * .9 + i * .35, px = cx + Math.cos(a) * R * .9, py = cy + Math.sin(a) * R * .78; ell(g, px, py, 10 + k * 6, 8 + k * 4, { f: '#bdbdbd', blur: 2 }); if (k > .6) flow(g, [[px, py]], i + 3, 6); }
        if (k > .7) { shape(g, [[cx - R * .2, cy + R * .1], [cx + R * .3, cy - R * .2], [cx + R * .55, cy + R * .25], [cx + R * .2, cy + R * .6], [cx - R * .3, cy + R * .5]], { f: '#a8a8a8', blur: 4 }); flow(g, ring(cx + R * .15, cy + R * .25, R * .25, 9).concat(ring(cx + R * .15, cy + R * .25, R * .1, 5)), 11, 10); }
        g.restore();
      }
      if (gone || (surg && !ooph)) { ell(g, cx - 20, cy - 10, 12, 10, { f: '#0a0a0a' }); ell(g, cx + 26, cy + 14, 9, 8, { f: '#0a0a0a' }); if (surg) line(g, [[cx - 40, cy + 30], [cx + 40, cy + 34]], 'rgba(240,240,240,.7)', 2); }
    });
    const B = [k < .25, nPap > 0 && k < .6, false, k >= .25 && k < .45, k < .45], M = [k >= .85, k >= .82, nPap >= 4, k >= .7, k >= .8];
    const anyB = B.some(Boolean), anyM = M.some(Boolean), res = !cyst ? -1 : anyB && !anyM ? 0 : anyM && !anyB ? 2 : 1;
    const bx = 488, rows = [['IOTA ' + say('簡易規則', 'simple rules')]].concat(['B1', 'B2', 'B3', 'B4', 'B5'].map((n, i) => [(cyst && B[i] ? '■ ' : '□ ') + n, cyst && B[i] ? '#9f9' : '#789']), ['M1', 'M2', 'M3', 'M4', 'M5'].map((n, i) => [(cyst && M[i] ? '■ ' : '□ ') + n, cyst && M[i] ? '#ff8a80' : '#789']), [[res < 0 ? '—' : [say('良性', 'Benign'), say('無法判定', 'Inconclusive'), say('惡性', 'Malignant')][res], ['#9f9', '#ffd27a', '#ff8a80'][res] || '#9ab']]);
    mbox(g, bx, 36, rows, 146);
    const L = s.L;
    if (cyst) { L(cx - R, cy, k < .25 ? '單房、無回音、壁薄（單純性囊腫）' : k < .45 ? '多房、平滑中隔' : '實質成分／乳突', k < .25 ? 'Unilocular, anechoic, thin wall (simple cyst)' : k < .45 ? 'Multilocular, smooth septa' : 'Solid tissue / papillary projections', 40, 120, k < .25 ? c.n : c.a); L(cx, cy + R + 30, '後方回音增強', 'Posterior acoustic enhancement', 440, 406); mt(g, say('最大徑 ', 'max diameter ') + mm + ' mm', 14, 460 - 34, { s: 11.5 }); if (k > .8) L(160, 380, '腹水', 'Ascites', 90, 392, c.a); if (k > .7) L(cx + R * .2, cy + R * .25, '實質部分豐富血流（彩色分數 4）', 'Very strong flow in solid tissue (colour score 4)', 470, 330, c.a); }
    else if (ooph) L(cx, cy, '附件已切除（轉介婦癌科分期）', 'Adnexa removed (staging by gynae-oncology)', 440, 420, c.t);
    else L(cx, cy, gone ? '功能性囊腫已自行消退' : surg ? '囊腫剝除後保留卵巢' : '正常卵巢與濾泡', gone ? 'Functional cyst has resolved' : surg ? 'Ovary preserved after cystectomy' : 'Normal ovary with follicles', 440, 420, gone || surg ? c.t : c.n);
    if (s.has('cyst-rescan') && k >= .3) L(cx + R, cy - 10, '複查仍存在 → 進一步處理', 'Persists at review → further management', 440, 300, c.w);
  }
  function ectopicUS(g, s) {
    const c = pal(g), k = s.normal ? 0 : s.k, sx = s.has('salpingectomy'), mtx = s.has('mtx') && !sx, mass = !s.normal && !sx, ff = s.normal || sx ? 0 : k, mr = mtx ? 13 : 22;
    usBg(g);
    sector(g, { cy: 20, r1: 446, a0: PI / 2 - .76, a1: PI / 2 + .76 }, () => {
      shape(g, [[110, 160], [240, 140], [330, 190], [320, 290], [200, 320], [110, 260]], { f: '#6b6b6b', blur: 14 }); ell(g, 220, 230, 70, s.normal ? 10 : 22, { f: '#bcbcbc', blur: 6, rot: -.2 }); if (!s.normal) ell(g, 222, 232, 14, 6, { f: '#0b0b0b', rot: -.2 });
      ell(g, 510, 210, 54, 40, { f: '#666', blur: 10 }); for (let i = 0; i < 5; i++) ell(g, 492 + i * 9, 205 + (i % 2) * 14, 6, 5, { f: '#0b0b0b' }); ell(g, 520, 216, 14, 13, { s: 'rgba(230,230,230,.6)', lw: 3 });
      if (mass) { ell(g, 410, 250, mr + 10, mr + 6, { f: '#5a5a5a', blur: 8 }); ell(g, 410, 250, mr, mr * .9, { s: `rgba(240,240,240,${mtx ? .45 : .9})`, lw: 6, blur: 2 }); ell(g, 410, 250, mr * .55, mr * .5, { f: '#070707' }); if (!mtx) flow(g, ring(410, 250, mr + 6, 12), 23, 7); }
      if (ff > 0) { shape(g, [[150, 330], [260, 320 - ff * 20], [380, 330], [470, 360 + ff * 20], [420, 380 + ff * 40], [200, 380 + ff * 30]], { f: '#060606', blur: 6 }); if (ff > .55) dots(g, 6, 300, 360, 70, 20, 10, 'rgba(120,120,120,.8)', 5, 6); if (ff > .85) shape(g, [[80, 120], [130, 100], [150, 150], [100, 170]], { f: '#060606', blur: 4 }); }
    });
    mbox(g, 14, 38, [['β-hCG +'], [say('宮內妊娠囊：無', 'Intrauterine sac: none'), s.normal ? '#789' : '#ff8a80'], [say('道格拉斯窩液體 ', 'Pouch of Douglas fluid ') + [say('無', 'none'), say('少量', 'small'), say('中量', 'moderate'), say('大量（含血塊）', 'large, with clot')][Math.min(3, Math.ceil(ff * 3))]]], 260);
    const L = s.L; L(222, 232, s.normal ? '子宮內膜' : '宮腔內無妊娠囊（蛻膜增厚）', s.normal ? 'Endometrium' : 'No intrauterine sac (thick decidua)', 90, 400, s.normal ? c.n : c.a); L(510, 196, '卵巢（黃體）', 'Ovary (corpus luteum)', 560, 120);
    if (mass) L(410, 250 - mr, mtx ? 'MTX 後腫塊縮小、血流減少' : '附件「甜甜圈徵」＋環狀血流', mtx ? 'Mass smaller with less flow after MTX' : 'Adnexal "bagel" ring with ring of fire', 470, 80, mtx ? c.t : c.a);
    if (ff > 0) L(300, 360, ff > .55 ? '回音性積液與血塊：破裂出血' : '道格拉斯窩積液', ff > .55 ? 'Echogenic fluid and clot: rupture' : 'Fluid in the pouch of Douglas', 470, 408, c.a); if (ff > .85) L(115, 135, '積液延伸到肝腎間隙', 'Fluid reaching Morison\'s pouch', 90, 80, c.a);
    if (mtx && k > .5) L(410, 290, '腹腔出血多：不適合藥物治療 → 手術', 'Large haemoperitoneum: not for methotrexate → surgery', 440, 330, c.a); if (sx) L(410, 250, '輸卵管切除後附件區乾淨', 'Adnexa clear after salpingectomy', 470, 80, c.t);
  }
  function lapPelvis(g, s, mode) {
    const c = pal(g), k = s.normal ? 0 : s.k, exc = s.has('excision'), hor = s.has('hormonal') && !exc, sx = s.has('salpingectomy'), mtx = s.has('mtx') && !sx; const R = rng(42), les = [];
    for (let i = 0; i < 28; i++) { const zone = i % 4, a = R(); les.push({ x: zone === 0 ? 320 + (R() - .5) * 120 : zone === 1 ? 320 + (a > .5 ? 1 : -1) * (50 + R() * 50) : zone === 2 ? 320 + (a > .5 ? 1 : -1) * (150 + R() * 30) : 320 + (R() - .5) * 160, y: zone === 0 ? 345 + R() * 22 : zone === 1 ? 300 + R() * 60 : zone === 2 ? 280 + R() * 40 : 130 + R() * 20, t: i % 3 }); }
    const n = mode === 'endo' ? Math.round(3 + 24 * k) : 0, oma = mode === 'endo' && k > .45 && !exc, adh = mode === 'endo' && k > .55 && !exc, obl = mode === 'endo' && k > .8 && !exc;
    scope(g, { bg: '#b86455', r: 206 }, (cx, cy, r) => {
      g.fillStyle = rgrad(g, cx, cy + 40, 10, r * 1.1, ['rgba(255,200,170,.25)', 'rgba(60,10,10,.25)']); g.fillRect(0, 0, W, H); noise(g, .2, 'overlay', 1.4);
      ell(g, cx, cy + 96, 72, 34, { f: rgrad(g, cx, cy + 96, 4, 72, ['#2a0806', '#7a2b22']), blur: 10 });
      [-1, 1].forEach(sd => shape(g, [[cx + sd * 30, cy + 44], [cx + sd * 72, cy + 98], [cx + sd * 112, cy + 152]], { open: true, s: 'rgba(240,200,185,.6)', lw: 10 }));
      shape(g, [[cx - 200, cy + 150], [cx - 150, cy + 120], [cx - 120, cy + 170], [cx - 160, cy + 210]], { f: rgrad(g, cx - 160, cy + 160, 5, 60, ['#f3b28f', '#c9795a']), blur: 6 });
      [-1, 1].forEach(sd => shape(g, [[cx + sd * 70, cy - 70], [cx + sd * 150, cy - 140], [cx + sd * 200, cy - 160]], { open: true, s: '#d98c7d', lw: 9 }));
      ell(g, cx, cy - 30, 96, 70, { f: rgrad(g, cx - 20, cy - 70, 10, 110, ['#f7c8bd', '#d9897b', '#b8574a']), blur: 8 }); ell(g, cx - 30, cy - 70, 30, 12, { f: 'rgba(255,255,255,.35)', rot: -.3, blur: 10 });
      [-1, 1].forEach(sd => { const big = (oma && sd < 0); if (!(sx && sd > 0)) shape(g, [[cx + sd * 82, cy - 56], [cx + sd * 140, cy - 68], [cx + sd * 182, cy - 28], [cx + sd * 172, cy + 12]], { open: true, s: '#e19a8c', lw: 13 }); ell(g, cx + sd * 128, cy + 22, big ? 34 + 44 * (k - .45) : 32, big ? 24 + 30 * (k - .45) : 21, { f: big ? rgrad(g, cx + sd * 120, cy + 10, 4, 60, ['#9a6a80', '#5e2f45']) : rgrad(g, cx + sd * 120, cy + 14, 4, 34, ['#fbece6', '#d8b2a6']), blur: 5 }); });
      if (sx) { ell(g, cx + 92, cy - 54, 9, 7, { f: '#3b2216' }); }
      for (let i = 0; i < n; i++) { const l = les[i]; if (exc) { shape(g, ring(l.x, l.y, 9, 7).map(([x, y], j) => [x + (hsh(i * 9 + j) - .5) * 6, y + (hsh(i * 7 + j) - .5) * 6]), { f: '#f2e3c6', s: '#4a2a1a', lw: 2 }); continue; } if (l.t === 0) dots(g, 4, l.x, l.y, 6, 5, 2.2, '#2a1410', i + 3); else if (l.t === 1) { ell(g, l.x, l.y, 5, 4, { f: hor ? '#a86a5a' : '#d42a2a', blur: 3 }); ell(g, l.x - 1, l.y - 1, 1.6, 1.2, { f: 'rgba(255,255,255,.6)' }); } else shape(g, ring(l.x, l.y, 8, 6), { f: 'rgba(246,236,226,.8)', blur: 3 }); }
      if (adh) for (let i = 0; i < 3; i++) shape(g, [[cx - 128 + i * 6, cy + 4], [cx - 90, cy - 10 + i * 10], [cx - 60, cy - 20 + i * 8], [cx - 70, cy + 20 + i * 4], [cx - 120, cy + 30]], { f: 'rgba(250,245,240,.32)', s: 'rgba(255,255,255,.4)', lw: 1 });
      if (obl) shape(g, [[cx - 80, cy + 70], [cx + 60, cy + 64], [cx + 90, cy + 110], [cx - 40, cy + 140], [cx - 100, cy + 110]], { f: rgrad(g, cx, cy + 100, 10, 90, ['#f3b28f', '#c9795a']), blur: 6 });
      if (mode === 'ecto') { if (!s.normal && !sx) { const er = mtx ? 14 : 18 + 16 * Math.max(k, .3); ell(g, cx + 160, cy - 52, er * 1.6, er, { f: rgrad(g, cx + 150, cy - 60, 3, er * 2, ['#8a4a7a', '#4a1a3a']), rot: .5, blur: 4 }); } const bl = s.normal || sx ? 0 : k; if (bl > 0) { ell(g, cx, cy + 100, 60 + 70 * bl, 26 + 26 * bl, { f: 'rgba(80,6,6,.88)', blur: 6 }); dots(g, Math.round(3 + 6 * bl), cx, cy + 100, 50 + 50 * bl, 18 + 14 * bl, 8, 'rgba(40,0,0,.9)', 8, 4); } }
      line(g, [[cx + 230, cy + 160], [cx + 70, cy + 60]], '#9aa3a8', 12); line(g, [[cx + 230, cy + 160], [cx + 70, cy + 60]], 'rgba(255,255,255,.35)', 3); line(g, [[cx + 70, cy + 60], [cx + 52, cy + 44]], '#5f676c', 6);
    });
    const L = s.L; L(320, 230, '子宮', 'Uterus', mode === 'endo' ? 470 : 120, 60); L(320, 350, '道格拉斯窩', 'Pouch of Douglas', 470, 440);
    if (mode === 'endo') {
      const st = k < .25 ? 1 : k < .5 ? 2 : k < .75 ? 3 : 4; mt(g, s.normal ? say('正常骨盆腔', 'Normal pelvis') : 'rASRM ' + say('第 ', 'stage ') + rom(st) + say(' 期', ''), 24, 60, { s: 13, c: s.normal ? '#9f9' : '#ffd27a', w: '700' });
      if (n && !exc) { L(les[0].x, les[0].y, '黑色「火藥燒灼」斑', 'Black "powder-burn" lesions', 120, 430, c.a); if (n > 1) L(les[1].x, les[1].y, hor ? '紅色病灶變淡（荷爾蒙抑制）' : '紅色火焰狀活動性病灶', hor ? 'Red lesions fading (suppression)' : 'Red flame-like active lesions', 120, 120, hor ? c.t : c.a); if (n > 5) L(les[5].x, les[5].y, '白色纖維化疤痕', 'White fibrotic scarring', 560, 380, c.a); }
      if (oma) L(192, 274, '巧克力囊腫（子宮內膜瘤）', 'Endometrioma ("chocolate cyst")', 90, 330, c.a); if (adh) L(230, 262, '沾黏帶', 'Adhesions', 90, 220, c.a); if (obl) L(320, 360, '道格拉斯窩閉鎖', 'Obliterated pouch of Douglas', 470, 400, c.a);
      if (exc && n) L(les[0].x, les[0].y, '病灶切除後的腹膜缺損', 'Peritoneal defects after excision', 120, 430, c.t);
    } else {
      if (!s.normal && !sx) L(480, 200, mtx ? 'MTX 後輸卵管腫脹縮小' : '壺腹部輸卵管妊娠（紫藍色腫脹）', mtx ? 'Tubal swelling smaller after MTX' : 'Ampullary tubal pregnancy (purple-blue swelling)', 560, 70, mtx ? c.t : c.a); if (!s.normal && !sx && k > 0) L(320, 356, '腹腔積血與血塊', 'Haemoperitoneum and clot', 120, 430, c.a); if (sx) L(412, 198, '輸卵管已切除、積血吸淨', 'Tube removed, blood evacuated', 560, 70, c.t);
    }
  }
  function colpo(g, s, lugol) {
    const c = pal(g), k = s.normal ? 0 : s.k, lz = s.has('lletz'), cx = 320, cy = 250, ec = 58, R = rng(29);
    const a0 = -2.5, a1 = -.55, ro = ec + 26 + 46 * k, pts = []; for (let i = 0; i <= 10; i++) { const a = lerp(a0, a1, i / 10); pts.push([cx + Math.cos(a) * (ro + (R() - .5) * 14), cy + 6 + Math.sin(a) * (ro + (R() - .5) * 14) * .8]); } for (let i = 10; i >= 0; i--) { const a = lerp(a0, a1, i / 10); pts.push([cx + Math.cos(a) * ec * .95, cy + 6 + Math.sin(a) * ec * .7]); }
    g.fillStyle = '#060606'; g.fillRect(0, 0, W, H); g.save(); g.beginPath(); g.arc(320, 248, 212, 0, TAU); g.clip();
    g.fillStyle = rgrad(g, 320, 248, 40, 260, ['#d98a86', '#9c4c4b']); g.fillRect(0, 0, W, H); noise(g, .2, 'overlay', 1.6);
    [[30, ['#e2e6e9', '#8d9396', '#c3c8cc']], [400, ['#c3c8cc', '#8d9396', '#e2e6e9']]].forEach(([y, st]) => rect(g, 50, y, 540, 74, { f: grad(g, 0, y, 0, y + 74, st) }));
    ell(g, cx, cy, 152, 132, { f: rgrad(g, cx - 40, cy - 50, 10, 168, lugol ? ['#86451f', '#4d200c'] : ['#f6cbc4', '#d88f88']), blur: 12 }); noise(g, .12, 'overlay', 1.2);
    ell(g, cx, cy + 6, ec, ec * .7, { f: lugol ? '#c86a62' : '#b8333a', blur: 6 }); dots(g, 46, cx, cy + 6, ec * .9, ec * .6, 4, 'rgba(255,170,170,.35)', 9);
    ell(g, cx, cy + 6, ec + 4, ec * .7 + 4, { s: 'rgba(255,240,240,.5)', lw: 1.5 }); ell(g, cx, cy + 6, 26, 7, { f: '#3a0a0e', blur: 3 });
    [[cx - 96, cy + 42], [cx + 102, cy + 58]].forEach(([x, y]) => ell(g, x, y, 9, 8, { f: lugol ? 'rgba(160,90,40,.8)' : 'rgba(240,220,160,.8)', blur: 3 }));
    if (k > 0 && !lz) {
      if (!lugol) {
        shape(g, pts, { f: `rgba(250,250,248,${.3 + .6 * k})`, blur: lerp(14, 2, k) });
        g.save(); poly(g, pts, {}); g.clip(); const n = Math.round(20 + 60 * k); for (let i = 0; i < n; i++) ell(g, cx - 140 + R() * 280, cy - 130 + R() * 140, lerp(.8, 2.6, k), lerp(.8, 2.6, k), { f: 'rgba(170,30,40,.75)' });
        if (k > .4) for (let x = cx - 140; x < cx + 140; x += lerp(26, 16, k)) for (let y = cy - 130; y < cy; y += lerp(26, 16, k)) poly(g, [[x, y], [x + 14, y + 2], [x + 16, y + 15], [x + 2, y + 14]], { s: `rgba(170,40,45,${(k - .4) * 1.2})`, lw: 1.2 });
        if (k > .55) shape(g, pts.map(([x, y]) => [lerp(x, cx, .35), lerp(y, cy - 40, .35)]), { f: 'rgba(255,255,255,.55)', blur: 3 });
        if (k > .8) for (let i = 0; i < 4; i++) { const sx2 = cx - 60 + i * 34, sy = cy - 70; const p2 = []; for (let j = 0; j < 8; j++) p2.push([sx2 + Math.sin(j * 1.7) * 6, sy + j * 6]); shape(g, p2, { open: true, s: 'rgba(160,20,30,.9)', lw: 1.6 }); }
        g.restore();
      } else shape(g, pts, { f: `rgba(222,186,80,${.5 + .45 * k})`, blur: 3 });
    }
    if (lz) { ell(g, cx, cy + 4, 96, 76, { f: rgrad(g, cx, cy + 4, 5, 96, ['#ead8ad', '#c79c64', '#3b2416']), blur: 4 }); ell(g, cx, cy + 4, 96, 76, { s: '#2a1a10', lw: 6 }); ell(g, cx, cy + 4, 12, 6, { f: '#3a0a0e' }); }
    g.fillStyle = rgrad(g, 320, 248, 140, 212, ['rgba(0,0,0,0)', 'rgba(0,0,0,.55)']); g.fillRect(0, 0, W, H); g.restore(); ell(g, 320, 248, 212, 212, { s: '#1b1b1b', lw: 6 });
    const gr = k < .12 ? 0 : k < .4 ? 1 : k < .8 ? 2 : 3;
    mt(g, lz ? say('LLETZ 後', 'After LLETZ') : lugol ? say('碘試驗（Lugol）', 'Lugol\'s iodine (Schiller)') : 'IFCPC: ' + [say('正常', 'normal'), say('第 1 級（輕度）', 'grade 1 (minor)'), say('第 2 級（重度）', 'grade 2 (major)'), say('懷疑侵襲癌', 'suspicious for invasion')][gr], 24, 60, { s: 13, w: '700', c: lz ? '#9f9' : ['#9f9', '#ffd27a', '#ff8a80', '#ff5252'][lugol ? (gr ? 2 : 0) : gr] });
    const L = s.L; L(cx, cy + 6, '子宮頸外口', 'External os', 470, 440); L(cx + ec + 2, cy + 18, '鱗狀柱狀交界（轉化區）', 'Squamocolumnar junction (transformation zone)', 520, 360);
    if (k > 0 && !lz) L(pts[5][0], pts[5][1], lugol ? '碘不染色區（芥末黃）' : gr === 1 ? '薄而淡的醋白、細點狀' : gr === 2 ? '濃厚醋白、粗點狀與鑲嵌、邊界銳利' : '異型血管、表面不規則', lugol ? 'Iodine-negative area (mustard yellow)' : gr === 1 ? 'Thin faint acetowhite, fine punctation' : gr === 2 ? 'Dense acetowhite, coarse punctation and mosaic, sharp border' : 'Atypical vessels, irregular surface', 120, 110, c.a);
    else if (lz) L(cx - 70, cy, '電圈切除面（電燒邊緣）', 'Loop excision crater (diathermy rim)', 120, 110, c.t); else L(cx - 100, cy - 40, lugol ? '正常鱗狀上皮染成深褐色' : '正常鱗狀上皮', lugol ? 'Normal squamous epithelium stains mahogany' : 'Normal squamous epithelium', 120, 110);
  }
  const GY_RX = {
    myomectomy: { zh: '肌瘤切除術', en: 'Myomectomy', text: 'FIGO 0–2 型黏膜下肌瘤以子宮鏡電切，3–6 型以腹腔鏡或開腹切除並分層縫合肌層，保留子宮與生育能力。影像上肌瘤消失、留下高回音的縫合疤痕，宮腔恢復平整。', textEn: 'FIGO type 0–2 submucous fibroids are resected hysteroscopically and types 3–6 removed laparoscopically or by laparotomy with layered closure of the myometrium, preserving the uterus and fertility. The fibroid disappears, leaving an echogenic repair scar and a smooth cavity.' },
    uae: { zh: '子宮動脈栓塞（UAE）', en: 'Uterine artery embolisation', text: '經股動脈或橈動脈導管把栓塞顆粒送入兩側子宮動脈，肌瘤因缺血梗塞而縮小，六個月時體積約減少 40–60%，周邊血流消失；適合不想手術者，想懷孕者需審慎評估。', textEn: 'Through a femoral or radial catheter, embolic particles are delivered into both uterine arteries; the fibroids infarct and shrink by about 40–60% in volume at six months and lose their peripheral flow. Suitable for those wishing to avoid surgery, though future pregnancy needs careful counselling.' },
    polypectomy: { zh: '子宮鏡息肉切除', en: 'Hysteroscopic polypectomy', text: '在子宮鏡直視下以剪刀、電切環或組織粉碎器由基部切除息肉並送病理，同時評估其餘內膜；停經後出血且內膜 >4 mm 時須取得組織排除子宮內膜癌。術後內膜變薄、宮腔平整。', textEn: 'Under direct hysteroscopic vision the polyp is removed at its base with scissors, a loop or a tissue morcellator and sent for histology while the rest of the endometrium is inspected; postmenopausal bleeding with an endometrium over 4 mm needs tissue to exclude endometrial cancer. Afterwards the lining is thin and the cavity smooth.' },
    metroplasty: { zh: '子宮鏡中隔切開', en: 'Hysteroscopic septum resection', text: '以剪刀或電切環由中隔下緣向上切開到兩側輸卵管開口連線，纖維中隔回縮成為單一宮腔；可降低反覆流產，術後以 3D 超音波確認殘留中隔 <1 cm。', textEn: 'The septum is incised from its lower edge up to the line joining the tubal ostia with scissors or a loop, and the fibrous tissue retracts to leave a single cavity; it may reduce recurrent miscarriage, and 3D ultrasound afterwards confirms a residual septum under 1 cm.' },
    'cyst-rescan': { zh: '6–12 週後複查', en: 'Repeat scan in 6–12 weeks', text: '育齡女性的單純性囊腫（單房、無回音、壁薄）多為功能性濾泡或黃體囊腫，數個週期內自行消退；複查時已消失則免手術，持續存在或出現實質成分才進一步處理。', textEn: 'In women of reproductive age a simple cyst (unilocular, anechoic, thin-walled) is usually a functional follicular or corpus luteum cyst that resolves within a few cycles; if it has gone at review no surgery is needed, while persistence or a new solid component prompts further management.' },
    'cyst-surgery': { zh: '依風險手術', en: 'Risk-matched surgery', text: '良性特徵的持續性囊腫以腹腔鏡囊腫剝除保留卵巢；具 IOTA 惡性特徵（不規則實質、乳突 ≥4、腹水、豐富血流）者轉介婦癌科行分期手術，並避免在腹腔內弄破囊腫。', textEn: 'A persistent cyst with benign features is shelled out laparoscopically, preserving the ovary; one with IOTA malignant features (irregular solid tissue, four or more papillary projections, ascites, very strong flow) is referred to a gynaecological oncologist for staging surgery, avoiding intraperitoneal rupture.' },
    mtx: { zh: '甲氨蝶呤（藥物治療原則）', en: 'Methotrexate (medical management principle)', text: '血行動力學穩定、無明顯腹腔出血、腫塊小且 β-hCG 低的子宮外孕，可用甲氨蝶呤抑制滋養層細胞並追蹤 β-hCG 至陰性；腫塊在超音波上逐漸縮小，期間腹痛加劇或出血即改手術。', textEn: 'A stable ectopic pregnancy without significant haemoperitoneum, with a small mass and a low β-hCG, may be treated with methotrexate, which halts trophoblast growth, following β-hCG until negative; the mass shrinks gradually on ultrasound, and worsening pain or bleeding means surgery.' },
    salpingectomy: { zh: '腹腔鏡輸卵管切除', en: 'Laparoscopic salpingectomy', text: '破裂或不穩定的輸卵管妊娠以腹腔鏡切除患側輸卵管並清除腹腔積血；對側輸卵管正常時，切除優於造口保留。影像上附件腫塊與積液消失。', textEn: 'A ruptured or unstable tubal ectopic is treated by laparoscopic removal of the affected tube and evacuation of the haemoperitoneum; with a healthy contralateral tube, salpingectomy is preferred to salpingostomy. The adnexal mass and free fluid disappear.' },
    lletz: { zh: '子宮頸環狀電圈切除（LLETZ）', en: 'Large loop excision of the transformation zone (LLETZ)', text: '局部麻醉下以通電線圈切除整個轉化區，一次完成 CIN2–3 的診斷與治療，標本送病理確認切緣。陰道鏡下見電燒過的圓形切除面，數週內上皮化癒合，之後以 HPV 檢測追蹤。', textEn: 'Under local anaesthesia an electrified wire loop removes the whole transformation zone, diagnosing and treating CIN2–3 in one step, and the specimen is sent to confirm the margins. Colposcopy shows a round diathermied crater that re-epithelialises within weeks; follow-up is by HPV test.' },
    surveil: { zh: 'CIN1 追蹤觀察', en: 'Surveillance for CIN1', text: 'CIN1 與低度病變多在一到兩年內自行消退，以 12 個月後的 HPV／抹片追蹤代替切除，避免影響日後懷孕（早產）。此選項不處理病灶，影像不會改變。', textEn: 'CIN1 and low-grade changes mostly regress within one to two years, so HPV testing or cytology at 12 months replaces excision, avoiding effects on future pregnancy (preterm birth). The lesion is not treated, so the image does not change.' },
    excision: { zh: '腹腔鏡切除內膜異位病灶', en: 'Laparoscopic excision of endometriosis', text: '腹腔鏡下切除腹膜病灶、分離沾黏並剝除巧克力囊腫壁，同時送病理確診，可改善疼痛與自然受孕率；畫面中黑、紅、白色病灶變成腹膜缺損，沾黏帶已鬆解。', textEn: 'Laparoscopically, peritoneal implants are excised, adhesions divided and endometrioma walls stripped, with histology confirming the diagnosis; pain and natural fertility improve. On screen the black, red and white lesions are replaced by peritoneal defects and the adhesion bands are released.' },
    hormonal: { zh: '荷爾蒙抑制治療', en: 'Hormonal suppression', text: '黃體素、複方口服避孕藥或 GnRH 類似物抑制排卵與內膜增生，紅色活動性病灶變淡、疼痛減輕；但纖維化、沾黏與巧克力囊腫不會消失，停藥後容易復發。', textEn: 'Progestogens, combined pills or GnRH analogues suppress ovulation and endometrial growth, so red active lesions fade and pain eases; fibrosis, adhesions and endometriomas do not disappear, and recurrence is common after stopping.' }
  };
  const tv = (id, zh, en, hdr, p, fn, h) => ({ id, zh, en, mod: 'US', hdr, p, h: h || { scale: [64, '2 cm'] }, draw: fn });
  const GY_CONDS = [
    { id: 'fibroid', zh: '子宮肌瘤（FIGO 分類）', en: 'Uterine fibroids (FIGO classification)', rx: ['myomectomy', 'uae'], views: [tv('tvus', '經陰道超音波', 'Transvaginal ultrasound', 'TVUS SAGITTAL · UTERUS', P('FIGO 位置', 'FIGO position', 0, 8, 2, '', { step: .1, normal: 0, fmt: v => 'FIGO ' + Math.round(v) }), (g, s) => uterusUS(g, s, 'fibroid')), { id: 'hyst', zh: '子宮鏡', en: 'Hysteroscopy', mod: 'HYST', hdr: 'HYSTEROSCOPY · SALINE DISTENSION', p: sev('凸入宮腔程度', 'Protrusion'), draw: (g, s) => hysteroscopy(g, s, 'fibroid') }],
      f: '肌瘤是子宮平滑肌的良性腫瘤，超音波上為邊界清楚的低回音圓形腫塊，帶有扇形「百葉窗」聲影，彩色都卜勒見周邊環狀血流。FIGO 0–8 依與宮腔及漿膜的關係分型：0 型帶蒂在宮腔內、1–2 型黏膜下、3–4 型肌層內、5–6 型漿膜下、7 型帶蒂漿膜下、8 型為子宮頸等其他位置。黏膜下肌瘤最常造成經血過多與不孕。', fEn: 'Fibroids are benign smooth-muscle tumours, seen as well-defined hypoechoic round masses with fan-shaped "venetian blind" shadowing and peripheral circumferential flow on colour Doppler. FIGO types 0–8 describe their relation to the cavity and serosa: 0 pedunculated intracavitary, 1–2 submucous, 3–4 intramural, 5–6 subserosal, 7 pedunculated subserosal and 8 other sites such as the cervix. Submucous fibroids most often cause heavy bleeding and subfertility.' },
    { id: 'endometrium', zh: '內膜增厚與子宮內膜息肉', en: 'Thickened endometrium and polyp', rx: ['polypectomy'], views: [tv('tvus', '經陰道超音波', 'Transvaginal ultrasound', 'TVUS SAGITTAL · ENDOMETRIUM', P('內膜厚度', 'Endometrial thickness', 2, 20, 12, ' mm', { step: .5, normal: 3 }), (g, s) => uterusUS(g, s, 'endo')), { id: 'hyst', zh: '子宮鏡', en: 'Hysteroscopy', mod: 'HYST', hdr: 'HYSTEROSCOPY · SALINE DISTENSION', p: sev('息肉大小', 'Polyp size'), draw: (g, s) => hysteroscopy(g, s, 'polyp') }],
      f: '停經後出血時以經陰道超音波量測雙層內膜厚度：≤4 mm 時子宮內膜癌機率很低，>4 mm 或持續出血則需取樣或子宮鏡。息肉表現為宮腔內局部高回音病灶，彩色都卜勒常見單一供血血管（蒂血管徵）。子宮鏡可直接看見並同時切除。', fEn: 'In postmenopausal bleeding, transvaginal ultrasound measures the double-layer endometrial thickness: at 4 mm or less endometrial cancer is unlikely, while over 4 mm or persistent bleeding needs sampling or hysteroscopy. A polyp is a focal echogenic lesion in the cavity, often with a single feeding vessel on colour Doppler (pedicle artery sign). Hysteroscopy shows it directly and allows removal at the same time.' },
    { id: 'septum', zh: '中隔子宮', en: 'Septate uterus', rx: ['metroplasty'], views: [{ id: 'hyst', zh: '子宮鏡', en: 'Hysteroscopy', mod: 'HYST', hdr: 'HYSTEROSCOPY · SALINE DISTENSION', p: sev('中隔長度', 'Septum length'), draw: (g, s) => hysteroscopy(g, s, 'septum') }, { id: 'coronal', zh: '3D 超音波冠狀面', en: '3D ultrasound coronal plane', mod: 'US3D', hdr: '3D US · CORONAL RECONSTRUCTION', p: sev('中隔長度', 'Septum length'), h: { scale: [59, '1 cm'] }, draw: coronal3D }],
      f: '胚胎期兩側米勒管融合後中隔未被吸收，留下把宮腔分成兩半的纖維肌性中隔，與反覆流產及早產有關。3D 超音波冠狀面最能區分：中隔子宮外側子宮底平滑（凹陷 <1 cm），雙角子宮則有 >1 cm 的外側凹裂。子宮鏡下見中線隆起，兩側各有一個輸卵管開口。', fEn: 'After fusion of the Müllerian ducts the midline septum fails to resorb, leaving a fibromuscular wall that divides the cavity; it is linked to recurrent miscarriage and preterm birth. The coronal plane of 3D ultrasound distinguishes it best: a septate uterus has a smooth outer fundus (indentation under 1 cm), whereas a bicornuate uterus has an external cleft over 1 cm. Hysteroscopy shows a midline ridge with one tubal ostium on each side.' },
    { id: 'ovarian-cyst', zh: '卵巢囊腫（IOTA 簡易規則）', en: 'Ovarian cyst (IOTA simple rules)', rx: ['cyst-rescan', 'cyst-surgery'], views: [tv('tvus', '經陰道超音波', 'Transvaginal ultrasound', 'TVUS · ADNEXA', P('複雜度', 'Complexity', 0, 100, 15, '%', { fmt: v => v < 25 ? say('單純', 'simple') : v < 45 ? say('多房', 'multilocular') : v < 70 ? say('乳突／實質', 'papillary / solid') : say('不規則實質＋腹水', 'irregular solid + ascites') }), ovaryUS)],
      f: 'IOTA 簡易規則以五個良性（B）與五個惡性（M）超音波特徵判讀附件腫塊：只有 B 特徵為良性，只有 M 特徵為惡性，兩者皆有或皆無則無法判定，需專家評估或 ADNEX 模型。單房、無回音、壁薄、後方回音增強的單純性囊腫幾乎都是良性；不規則實質、乳突、腹水與豐富血流提示惡性。', fEn: 'The IOTA simple rules classify adnexal masses by five benign (B) and five malignant (M) ultrasound features: only B features means benign, only M features malignant, and both or neither is inconclusive, needing expert review or the ADNEX model. A unilocular, anechoic, thin-walled cyst with posterior enhancement is almost always benign; irregular solid tissue, papillary projections, ascites and strong flow suggest malignancy.' },
    { id: 'ectopic', zh: '子宮外孕', en: 'Ectopic pregnancy', rx: ['mtx', 'salpingectomy'], views: [tv('tvus', '經陰道超音波', 'Transvaginal ultrasound', 'TVUS · UTERUS + LEFT ADNEXA', P('腹腔積液', 'Free fluid', 0, 100, 40, '%'), ectopicUS), { id: 'lap', zh: '腹腔鏡', en: 'Laparoscopy', mod: 'LAP', hdr: 'LAPAROSCOPY · PELVIS', p: P('腹腔積血', 'Haemoperitoneum', 0, 100, 40, '%'), draw: (g, s) => lapPelvis(g, s, 'ecto') }],
      f: 'β-hCG 陽性但經陰道超音波宮腔內不見妊娠囊，附件見與卵巢分開的腫塊（「甜甜圈徵」或不均質團塊），即高度懷疑子宮外孕，95% 位於輸卵管。道格拉斯窩積液、尤其含血塊的回音性液體或延伸到肝腎間隙，代表破裂出血。不穩定的病人不等影像，直接手術。', fEn: 'A positive β-hCG with no intrauterine sac on transvaginal scan and an adnexal mass separate from the ovary (a "bagel" ring or an inhomogeneous blob) strongly suggests ectopic pregnancy, 95% of which are tubal. Fluid in the pouch of Douglas, especially echogenic clot or fluid reaching Morison\'s pouch, indicates rupture and bleeding. An unstable patient goes to theatre without waiting for imaging.' },
    { id: 'cin', zh: '子宮頸上皮內病變（陰道鏡）', en: 'Cervical intraepithelial neoplasia (colposcopy)', rx: ['lletz', 'surveil'], views: [{ id: 'aceto', zh: '醋酸後陰道鏡', en: 'Colposcopy after acetic acid', mod: 'COLP', hdr: 'COLPOSCOPY · 5% ACETIC ACID', p: sev('病變等級', 'Lesion grade'), draw: (g, s) => colpo(g, s, false) }, { id: 'lugol', zh: '碘試驗', en: 'Lugol\'s iodine', mod: 'COLP', hdr: 'COLPOSCOPY · LUGOL\'S IODINE', p: sev('病變等級', 'Lesion grade'), draw: (g, s) => colpo(g, s, true) }],
      f: '塗上 3–5% 醋酸後，核質比高的異常上皮暫時變白（醋白），最常見於轉化區的鱗狀柱狀交界。IFCPC 分級：第 1 級（輕度）為薄而淡的醋白與細點狀、細鑲嵌；第 2 級（重度）為濃厚醋白、邊界銳利、粗點狀與粗鑲嵌及內緣徵；異型血管、不規則表面與潰瘍則懷疑侵襲癌。碘試驗中異常上皮不染色，呈芥末黃。', fEn: 'After 3–5% acetic acid, epithelium with a high nuclear-to-cytoplasmic ratio turns temporarily white (acetowhite), most often in the transformation zone at the squamocolumnar junction. IFCPC grading: grade 1 (minor) is thin faint acetowhite with fine punctation and mosaic; grade 2 (major) is dense acetowhite with a sharp border, coarse punctation and mosaic and an inner border sign; atypical vessels, an irregular surface or ulceration suggest invasion. With Lugol\'s iodine abnormal epithelium fails to stain and looks mustard-yellow.' },
    { id: 'endometriosis', zh: '子宮內膜異位症', en: 'Endometriosis', rx: ['excision', 'hormonal'], views: [{ id: 'lap', zh: '腹腔鏡', en: 'Laparoscopy', mod: 'LAP', hdr: 'DIAGNOSTIC LAPAROSCOPY · PELVIS', p: sev('病灶範圍', 'Disease extent'), draw: (g, s) => lapPelvis(g, s, 'endo') }],
      f: '子宮內膜樣組織長在子宮外，腹腔鏡下可見黑色「火藥燒灼」斑、紅色火焰狀活動性病灶與白色纖維化疤痕，好發於子宮薦骨韌帶、道格拉斯窩與卵巢窩。卵巢巧克力囊腫在超音波上為均勻的「毛玻璃」回音，嚴重時沾黏使道格拉斯窩閉鎖。rASRM 依病灶、囊腫與沾黏分 I–IV 期，但期別與疼痛程度不一定相符。', fEn: 'Endometrium-like tissue grows outside the uterus: laparoscopy shows black "powder-burn" spots, red flame-like active lesions and white fibrotic scars, favouring the uterosacral ligaments, pouch of Douglas and ovarian fossae. Ovarian endometriomas have uniform "ground-glass" echoes on ultrasound, and in severe disease adhesions obliterate the pouch of Douglas. The rASRM system stages disease I–IV by implants, cysts and adhesions, though stage correlates poorly with pain.' }
  ];
  ST.register({ id: 'gynecology', zh: '婦科', en: 'Gynaecology', rx: GY_RX, conds: GY_CONDS });

  // ================================================================ PAEDIATRIC SURGERY
  const gas = (g, x, y, rx, ry, rr) => ell(g, x, y, rx, ry, { f: grey(26, .92), blur: 3, rot: rr || 0 });
  function neoSkel(g, chest) {
    film(g, '#1f2226', '#060708');
    shape(g, [[150, 14], [490, 14], [548, 150], [556, 330], [506, 452], [134, 452], [84, 330], [92, 150]], { f: grey(100, .72), blur: 28 });
    const sp = y => { rect(g, 309, y, 22, 15, { f: grey(205, .85), blur: 2, r: 3 }); [-1, 1].forEach(sd => ell(g, 320 + sd * 14, y + 6, 3.5, 4.5, { s: grey(230, .7), lw: 1.5 })); };
    for (let y = 26; y < 400; y += chest ? 26 : 24) sp(y);
    const ribs = chest ? 9 : 4, y0 = chest ? 54 : 30, dy = chest ? 25 : 22;
    for (let i = 0; i < ribs; i++) [-1, 1].forEach(sd => { const y = y0 + i * dy; shape(g, [[320 + sd * 16, y], [320 + sd * 130, y - 10 + i * 2], [320 + sd * 200, y + 30 + i * 3]], { open: true, s: grey(205, .5), lw: 4 }); });
    if (chest) [-1, 1].forEach(sd => line(g, [[320 + sd * 30, 44], [320 + sd * 150, 34]], grey(215, .7), 5));
    [-1, 1].forEach(sd => { shape(g, [[320 + sd * 36, 410], [320 + sd * 120, 372], [320 + sd * 150, 392], [320 + sd * 120, 440], [320 + sd * 50, 446]], { f: grey(190, .8), blur: 4 }); line(g, [[320 + sd * 100, 448], [320 + sd * 120, 480]], grey(200, .85), 12); });
    [[230, 26], [410, 26]].forEach(([x, y]) => { ell(g, x, y, 13, 13, { s: grey(240, .8), lw: 2 }); ell(g, x, y, 3, 3, { f: grey(240, .9) }); });
  }
  function bowelGas(g, n, seed, area, scale) { const R = rng(seed); for (let i = 0; i < n; i++) { const x = area[0] + R() * (area[2] - area[0]), y = area[1] + R() * (area[3] - area[1]); gas(g, x, y, (8 + R() * 9) * (scale || 1), (6 + R() * 7) * (scale || 1), R() * 3); } }
  function neoAbd(g, s, mode) {
    const c = pal(g), k = s.normal ? 0 : s.k, ng = s.has('ng') && !s.normal, op = (s.has('duodenostomy') || s.has('laparotomy')) && !s.normal;
    neoSkel(g, false);
    shape(g, [[110, 112], [300, 112], [292, 190], [200, 236], [110, 204]], { f: grey(126, .45), blur: 22 });
    [-1, 1].forEach(sd => shape(g, [[320 + sd * 10, 104], [320 + sd * 110, 86], [320 + sd * 200, 110]], { open: true, s: grey(150, .5), lw: 6 }));
    let st = 0;
    if (mode === 'duo') {
      const db = op ? 0 : k, ds = ng ? .7 : 1;
      gas(g, 408, 154, (db ? 62 : 42) * ds, (db ? 44 : 28) * ds, .2); if (db > 0) gas(g, 288, 198, 34 * ds, 28 * ds, -.3);
      bowelGas(g, Math.round(26 * (1 - db)), 5, [170, 200, 470, 392]);
    } else {
      st = s.normal ? 0 : s.has('laparotomy') ? 0 : s.has('nec-medical') && s.v < 2.7 ? 1 : s.v;
      const dil = st >= 1 ? clamp((st - .6) / 1.4, 0, 1) * (ng ? .7 : 1) : 0, R = rng(19); gas(g, 408, 150, 40, 26, .2);
      if (st === 0) bowelGas(g, 26, 5, [170, 190, 470, 392]);
      const loopP = (x, y, a, len, bend) => { const pts = []; for (let j = 0; j <= 8; j++) { const u = j / 8 - .5, bb = bend * (1 - 4 * u * u); pts.push([x + Math.cos(a) * u * len - Math.sin(a) * bb, y + Math.sin(a) * u * len + Math.cos(a) * bb]); } return pts; };
      const offs = (pts, d) => pts.map((p, j) => { const q = pts[Math.min(j + 1, pts.length - 1)], o = pts[Math.max(j - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1; return [p[0] - dy / l * d, p[1] + dx / l * d]; });
      for (let i = 0; i < (st ? 9 : 0); i++) { const x = 180 + (i % 3) * 120 + (R() - .5) * 30, y = 214 + Math.floor(i / 3) * 70 + (R() - .5) * 18, w = 13 + 15 * dil, pts = loopP(x, y, R() * PI, 70 + R() * 34, (R() - .5) * 46);
        line(g, pts, grey(30, .9), w); [-1, 1].forEach(sd => line(g, offs(pts, sd * (w / 2 + 1.5)), grey(150, .35), 2));
        if (st >= 1.8) { const pz = clamp((st - 1.8) / .7, 0, 1); [-1, 1].forEach(sd => { const wall = offs(pts, sd * (w / 2 + 3)); line(g, wall, grey(16, .55 * pz), 1.6); for (let j = 0; j < wall.length - 1; j++) for (let t = 0; t < 1; t += .34) ell(g, lerp(wall[j][0], wall[j + 1][0], t) + (R() - .5) * 3, lerp(wall[j][1], wall[j + 1][1], t) + (R() - .5) * 3, 2.4, 2.1, { f: grey(14, .75 * pz) }); }); }
        if (st >= 2.7) [-1, 1].forEach(sd => line(g, offs(pts, sd * (w / 2)), grey(228, .85), 2.2));
      }
      if (st >= 2.3) { const pv = clamp((st - 2.3) / .4, 0, 1); for (let i = 0; i < 7; i++) { const a = PI + .4 + i * .3; shape(g, [[248, 176], [248 + Math.cos(a) * 60, 176 + Math.sin(a) * 34 - 10], [248 + Math.cos(a) * 110, 170 + Math.sin(a) * 60 - 20]], { open: true, s: grey(30, .75 * pv), lw: 2.2 }); } }
      if (st >= 2.7) { const fa = clamp((st - 2.7) / .3, 0, 1); ell(g, 320, 250, 176, 124, { f: grey(20, .5 * fa), blur: 20 }); line(g, [[332, 130], [300, 330]], grey(225, .7 * fa), 3); }
    }
    if (ng) { shape(g, [[318, 0], [318, 96], [360, 140], [398, 150]], { open: true, s: '#f7f9fb', lw: 3 }); ell(g, 402, 152, 8, 6, { s: '#f7f9fb', lw: 2 }); }
    if (op) { for (let i = 0; i < 8; i++) { const x = 220 + i * 14, y = 150 + i * 3; line(g, [[x, y - 5], [x, y + 5]], '#f7f9fb', 2.5); } if (mode === 'nec') { ell(g, 210, 350, 38, 30, { s: '#f7f9fb', lw: 2.5, dash: [5, 3] }); ell(g, 210, 350, 12, 10, { f: grey(40, .9) }); } }
    ell(g, 330, 300, 12, 5, { f: '#f7f9fb', rot: .4 });
    noise(g, .5, 'overlay', 1.3);
    const L = s.L; L(408, 150, '胃泡', 'Stomach', 560, 90); L(320, 300, '臍帶夾', 'Umbilical clamp', 560, 330);
    if (mode === 'duo') { if (k > 0 && !op) { L(288, 198, '雙泡徵：胃＋近端十二指腸', 'Double bubble: stomach + proximal duodenum', 80, 90, c.a); L(330, 360, k > .8 ? '遠端無氣體：閉鎖' : '遠端仍有少量氣體：狹窄／膜／扭轉？', k > .8 ? 'No distal gas: atresia' : 'Some distal gas: stenosis, web or volvulus?', 80, 440, c.a); } else L(320, 300, op ? '吻合後遠端腸道出現氣體' : '正常的新生兒腸氣分布', op ? 'Distal gas after the anastomosis' : 'Normal neonatal gas pattern', 80, 440, op ? c.t : c.n); if (ng) L(318, 60, '鼻胃管', 'Nasogastric tube', 80, 60, c.t); }
    else { const stg = st >= 2.7 ? 'III' : st >= 1.8 ? 'II' : st >= 1 ? 'I' : '—'; mt(g, 'Bell ' + stg, 70, 60, { s: 14, w: '700', c: st >= 2.7 ? '#ff5252' : st >= 1.8 ? '#ff8a80' : st >= 1 ? '#ffd27a' : '#9f9' }); if (st >= 1) L(254, 214, '腸袢擴張', 'Dilated loops', 80, 120, c.a); if (st >= 1.8) L(420, 304, '腸壁積氣（泡狀／線狀）', 'Pneumatosis intestinalis (bubbly / linear)', 560, 400, c.a); if (st >= 2.3) L(200, 160, '門靜脈積氣', 'Portal venous gas', 300, 64, c.a); if (st >= 2.7) { L(316, 230, '游離氣體：美式足球徵＋鐮狀韌帶', 'Free air: football sign + falciform ligament', 560, 230, c.a); L(170, 304, 'Rigler 徵（腸壁兩側可見）', 'Rigler\'s sign (both sides of the wall)', 80, 400, c.a); } if (s.has('nec-medical') && !s.normal) L(320, 260, s.v < 2.7 ? '禁食＋抗生素後積氣消退' : '穿孔：保守治療無效 → 手術', s.v < 2.7 ? 'Pneumatosis resolving on medical care' : 'Perforation: medical care fails → surgery', 560, 160, s.v < 2.7 ? c.t : c.a); if (s.has('laparotomy') && !s.normal) L(210, 350, '腸切除＋造口', 'Resection + stoma', 80, 400, c.t); if (st === 0 && !s.normal && !s.has('laparotomy')) L(320, 260, '腸氣正常', 'Normal gas', 560, 160, c.t); }
  }
  function neoChest(g, s, mode) {
    const c = pal(g), k = s.normal ? 0 : s.k, ng = s.has('ng') && !s.normal, rep = (s.has('cdh-repair') || s.has('oa-repair')) && !s.normal;
    neoSkel(g, true);
    const cdh = mode === 'cdh' && !s.normal, sh = cdh ? (rep ? -10 : -k * 56) : 0;
    [-1, 1].forEach(sd => { const left = sd > 0; const hypo = left && cdh; shape(g, [[320 + sd * 26 + (left ? 0 : sh), 60], [320 + sd * 120, 56], [320 + sd * 196, 140], [320 + sd * 200, 270], [320 + sd * 34, 268]], { f: grey(hypo ? 40 : 30, hypo && !rep ? .3 : .9), blur: 8 }); });
    shape(g, [[296 + sh, 120], [350 + sh, 112], [392 + sh, 160], [404 + sh, 236], [360 + sh, 268], [286 + sh, 268], [262 + sh, 222], [272 + sh, 160]], { f: grey(178, .92), blur: 12 });
    line(g, [[320, 10], [320 + sh * .6, 120]], grey(24, .8), 9); [-1, 1].forEach(sd => line(g, [[320 + sh * .6, 120], [320 + sh * .6 + sd * 34, 152]], grey(24, .7), 6));
    shape(g, [[100, 272], [200, 252], [300, 274]], { open: true, s: grey(160, .9), lw: 6 }); if (!cdh || rep) shape(g, [[340, 280], [440, 262], [540, 282]], { open: true, s: rep ? '#f7f9fb' : grey(160, .9), lw: rep ? 4 : 6, dash: rep ? [8, 4] : null });
    shape(g, [[110, 290], [530, 290], [540, 440], [100, 440]], { f: grey(112, .4), blur: 20 });
    if (cdh && !rep) { const R = rng(23), n = Math.round(4 + 12 * k), sc = ng ? .7 : 1; for (let i = 0; i < n; i++) { const x = 380 + R() * 130, y = 80 + R() * 185, r = (12 + R() * 11) * sc; ell(g, x, y, r, r * .85, { f: grey(22, .92), s: grey(200, .55), lw: 2 }); } bowelGas(g, Math.round(20 * (1 - k)), 7, [160, 310, 480, 420]); }
    else { gas(g, 410, 316, 34, 22, .2); bowelGas(g, 22, 7, [160, 330, 480, 420]); }
    if (mode === 'oa' && !s.normal) {
      const pe = 135 - s.v * 14, pw2 = (rep ? 0 : ng ? 9 : 15); if (!rep) shape(g, [[320 - pw2, 30], [320 + pw2, 30], [320 + pw2 * .8, pe - 6], [320, pe + 4], [320 - pw2 * .8, pe - 6]], { f: grey(20, .9), blur: 4 });
      if (rep) shape(g, [[318, 0], [322, 200], [350, 290], [404, 314]], { open: true, s: '#f7f9fb', lw: 3 });
      else if (ng) line(g, [[318, 0], [320, pe - 4]], '#f7f9fb', 4);
      else { line(g, [[318, 0], [320, pe - 30]], '#f7f9fb', 3); for (let i = 0; i < 3; i++) ell(g, 320, pe - 18 - i * 9, 11, 7, { s: '#f7f9fb', lw: 2.6 }); }
      if (rep) for (let i = 0; i < 3; i++) line(g, [[150 + i * 14, 132 + i * 6], [156 + i * 14, 158 + i * 6]], '#f7f9fb', 2);
    } else if (mode === 'cdh') { if (cdh && !rep && k > .35) shape(g, [[318, 0], [318 + sh * .6, 120], [360, 180], [410, 190]], { open: true, s: '#f7f9fb', lw: 3 }); else shape(g, [[318, 0], [318 + sh * .6, 150], [350, 290], [404, 314]], { open: true, s: '#f7f9fb', lw: 3 }); if (rep) line(g, [[540, 160], [480, 200], [470, 240]], '#f7f9fb', 4, [8, 4]); }
    else shape(g, [[318, 0], [322, 200], [350, 290], [404, 314]], { open: true, s: '#f7f9fb', lw: 3 });
    noise(g, .5, 'overlay', 1.3);
    const L = s.L; L(320 + sh, 200, sh < -20 ? '縱膈與心臟推向右側' : '心臟／胸腺陰影', sh < -20 ? 'Mediastinum and heart pushed right' : 'Cardiothymic shadow', 80, 100, sh < -20 ? c.a : c.n);
    if (mode === 'cdh') { if (cdh && !rep) { L(440, 170, '左胸內含氣腸袢', 'Gas-filled bowel loops in the left chest', 560, 70, c.a); if (k > .35) L(408, 190, '鼻胃管尖端在胸腔（胃疝入）', 'NG tip in the chest (herniated stomach)', 560, 300, c.a); L(320, 380, '腹部腸氣少（舟狀腹）', 'Little abdominal gas (scaphoid abdomen)', 80, 440, c.a); } else if (rep) { L(440, 268, '橫膈補片', 'Diaphragmatic patch', 560, 300, c.t); L(450, 170, '左肺發育不全（仍小）', 'Hypoplastic left lung (still small)', 560, 70, c.w); } else L(410, 316, '胃在腹部、橫膈完整', 'Stomach below an intact diaphragm', 560, 330); }
    else { if (!s.normal && !rep) { const pe = 135 - s.v * 14; L(320, pe - 18, ng ? 'Replogle 管持續抽吸上段盲囊' : '鼻胃管在上段盲囊捲曲', ng ? 'Replogle tube on suction in the upper pouch' : 'NG tube coiled in the upper pouch', 520, 70, ng ? c.t : c.a); L(410, 316, '胃有氣體：遠端氣管食道瘻（C 型）', 'Gas in stomach: distal TOF (type C)', 520, 400, c.a); } else L(330, 220, rep ? '吻合後鼻胃管順利進入胃' : '鼻胃管進入胃', rep ? 'NG passes the anastomosis into the stomach' : 'NG tube in the stomach', 520, 70, rep ? c.t : c.n); }
  }
  function pylorusUS(g, s) {
    const c = pal(g), t = s.normal ? 2 : s.v, op = s.has('pyloromyotomy') && !s.normal, len = 9 + (t - 1.5) * 3.3, px = 12, wy = 268, mw = t * px, x0 = 232, x1 = x0 + len * px;
    linear(g, { pxcm: 120 }, () => {
      shape(g, [[64, 40], [380, 40], [330, 120], [64, 160]], { f: '#5f5f5f', blur: 16 }); ell(g, 160, 110, 44, 22, { f: '#060606', blur: 3 });
      shape(g, [[70, 200], [210, 196], [x0 + 10, wy - 40], [x0 + 10, wy + 40], [200, 352], [70, 346]], { f: '#090909', blur: 6 }); dots(g, 14, 140, 270, 60, 60, 3, 'rgba(170,170,170,.4)', 4);
      [-1, 1].forEach(sd => { const y = wy + sd * (6 + mw / 2); shape(g, [[x0 - 18, y - sd * 10], [x0 + 20, y], [x1 - 20, y], [x1 + 18, y - sd * 6]], { open: true, s: '#1d1d1d', lw: mw }); });
      shape(g, [[x0 - 30, wy - 4], [x0, wy - 7], [x1, wy - 6], [x1 + 20, wy - 2], [x1 + 20, wy + 3], [x1, wy + 7], [x0, wy + 7], [x0 - 30, wy + 4]], { f: '#b8b8b8', blur: 3 });
      if (op) { shape(g, [[x0 + 30, wy - 6 - mw - 6], [x0 + (x1 - x0) / 2, wy - 6 - 2], [x1 - 30, wy - 6 - mw - 6]], { f: '#0f0f0f' }); shape(g, [[x0 + 50, wy - 8], [x0 + (x1 - x0) / 2, wy - 6 - mw * .7], [x1 - 50, wy - 8]], { f: '#a8a8a8', blur: 3 }); ell(g, x1 + 70, wy, 42, 26, { f: '#080808', blur: 4 }); }
      else shape(g, [[x1 + 20, wy - 6], [x1 + 140, wy - 14], [x1 + 140, wy + 10], [x1 + 20, wy + 6]], { f: '#505050', blur: 6 });
      rect(g, 430, 300, 130, 130, { f: '#1a1a1a', s: 'rgba(255,255,255,.3)', lw: 1 }); const ir = 10 + mw * .9; ell(g, 495, 365, ir, ir, { f: '#1d1d1d' }); ell(g, 495, 365, 9, 9, { f: '#b9b9b9', blur: 2 }); ell(g, 495, 365, ir, ir, { s: 'rgba(200,200,200,.4)', lw: 1.5 });
      cal(g, [x0 + (x1 - x0) * .4, wy - 7], [x0 + (x1 - x0) * .4, wy - 7 - mw]); cal(g, [x0, wy + 7 + mw + 14], [x1, wy + 7 + mw + 14]);
    });
    const pyl = t >= 3 && len >= 15;
    mbox(g, 300, 50, [[say('肌層厚度 ', 'Muscle ') + t.toFixed(1) + ' mm', t >= 3 ? '#ff8a80' : null], [say('通道長度 ', 'Channel length ') + len.toFixed(0) + ' mm', len >= 15 ? '#ff8a80' : null], [say('標準：≥3 mm、≥15 mm', 'Criteria: ≥3 mm, ≥15 mm'), '#9ab']], 210);
    const L = s.L; L(160, 110, '膽囊', 'Gallbladder', 300, 134); L(140, 280, '胃竇（內容物無法通過）', 'Antrum (contents not passing)', 100, 430); L(495, 365, pyl ? '橫切面「標靶徵」' : '幽門橫切面', pyl ? 'Transverse "target sign"' : 'Pylorus (transverse)', 470, 290);
    L((x0 + x1) / 2, wy - 6 - mw / 2, pyl ? '肥厚環狀肌（「子宮頸徵」）' : '幽門肌層', pyl ? 'Hypertrophied circular muscle ("cervix sign")' : 'Pyloric muscle', 420, 110, pyl ? c.a : c.n); if (op) L((x0 + x1) / 2, wy - 10, '肌層切開、黏膜膨出，十二指腸充盈', 'Muscle split, mucosa bulging, duodenum filling', 420, 190, c.t);
  }
  function intussUS(g, s) {
    const c = pal(g), k = s.normal ? 0 : s.k, red = (s.has('air-enema') || s.has('laparotomy')) && !s.normal, D = 26 + 14 * k, px = 8, R = D / 2 * px, x = 330, y = 250;
    linear(g, { pxcm: 80 }, () => {
      line(g, [[64, 52], [576, 52]], 'rgba(230,230,230,.6)', 3); line(g, [[64, 74], [576, 76]], 'rgba(180,180,180,.35)', 9); shape(g, [[64, 90], [200, 86], [160, 170], [64, 190]], { f: '#5e5e5e', blur: 14 });
      if (!red && !s.normal) {
        ell(g, x, y, R + 4, R + 4, { f: '#1e1e1e', blur: 2 }); ell(g, x, y, R - (4 + 6 * k) * px * .5, R - (4 + 6 * k) * px * .5, { f: '#9e9e9e', blur: 3 });
        ell(g, x + R * .15, y - R * .1, R * .52, R * .5, { f: '#232323' }); ell(g, x + R * .15, y - R * .1, R * .3, R * .28, { f: '#bdbdbd', blur: 2 }); ell(g, x + R * .15, y - R * .1, R * .1, R * .1, { f: '#2a2a2a' });
        [[-.45, .35], [-.2, .55], [.4, .5]].forEach(([dx, dy]) => ell(g, x + dx * R, y + dy * R, 9, 6, { f: '#2a2a2a' }));
        if (k > .6) ell(g, x - R * .5, y - R * .2, R * .18, R * .35, { f: '#050505', rot: .3 }); if (k < .7) flow(g, ring(x, y, R - 6, 10), 14, 7);
      } else { const Rr = rng(8); for (let i = 0; i < 5; i++) { const bx = 150 + i * 90, by = 220 + Rr() * 80; ell(g, bx, by, 26, 14, { f: '#3a3a3a' }); line(g, [[bx - 18, by - 6], [bx + 18, by - 6]], 'rgba(240,240,240,.8)', 3); for (let j = 0; j < 4; j++) line(g, [[bx - 10 + j * 7, by - 4], [bx - 12 + j * 7, by + 140]], 'rgba(0,0,0,.25)', 4); } }
      if (!red && !s.normal) cal(g, [x - R - 4, y + R + 12], [x + R + 4, y + R + 12]);
    });
    if (!red && !s.normal) mbox(g, 76, 372, [[say('直徑 ', 'Diameter ') + D.toFixed(0) + ' mm'], [say('血流 ', 'Flow ') + (k < .7 ? say('有', 'present') : say('消失', 'absent')), k < .7 ? null : '#ff8a80']], 170);
    const L = s.L; L(120, 130, '肝臟', 'Liver', 230, 66);
    if (!red && !s.normal) { L(x - R, y, '外層水腫腸壁（套鞘）', 'Oedematous outer wall (intussuscipiens)', 100, 300, c.a); L(x + R * .15, y - R * .1, '套入部（標靶中心）', 'Intussusceptum (centre of the target)', 470, 120, c.a); L(x - R * .2, y + R * .55, '腸繫膜脂肪與淋巴結', 'Mesenteric fat with lymph nodes', 470, 400); if (k > .6) L(x - R * .5, y - R * .2, '套疊內積液：較難復位', 'Trapped fluid: harder to reduce', 100, 180, c.a); }
    else L(330, 240, red ? '已復位：正常腸袢與氣體' : '正常腸袢', red ? 'Reduced: normal bowel loops with gas' : 'Normal bowel loops', 470, 120, red ? c.t : c.n);
  }
  function airEnema(g, s) {
    const c = pal(g), k = s.normal ? 0 : s.k, ok = s.has('air-enema') && !s.normal, lap = s.has('laparotomy') && !s.normal && !ok;
    const colon = [[320, 430], [330, 380], [380, 370], [420, 330], [440, 250], [446, 140], [420, 110], [320, 130], [220, 112], [196, 140], [194, 250], [200, 330], [220, 370]];
    const tot = plen(colon), um = ok ? 1 : 1 - .85 * k, sub = subPath(colon, tot * um), tip = sub[sub.length - 1];
    fluoro(g, false, () => {
      shape(g, [[120, 40], [520, 40], [560, 250], [520, 470], [120, 470], [80, 250]], { f: grey(96, .7), blur: 26 });
      for (let y = 40; y < 470; y += 26) rect(g, 308, y, 24, 18, { f: grey(205, .8), blur: 2, r: 3 }); [-1, 1].forEach(sd => shape(g, [[320 + sd * 40, 420], [320 + sd * 140, 370], [320 + sd * 170, 400], [320 + sd * 130, 460]], { f: grey(190, .8), blur: 4 }));
      if (!s.normal && !lap) { line(g, [[320, 480], [320, 440]], '#f7f9fb', 4); ell(g, 320, 436, 9, 6, { s: '#f7f9fb', lw: 2 }); g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); sub.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.strokeStyle = grey(20, .92); g.lineWidth = 34; g.shadowColor = grey(20); g.shadowBlur = 8; g.stroke(); g.restore(); }
      if (!s.normal && !ok && !lap) { ell(g, tip[0], tip[1], 26, 22, { f: grey(115, .95), blur: 4 }); ell(g, tip[0], tip[1], 30, 26, { s: grey(18, .85), lw: 5, a0: -1, a1: 1.6, open: true }); }
      if (ok) bowelGas(g, 24, 9, [230, 200, 410, 320], 1.1);
      if (lap || s.normal) bowelGas(g, 20, 4, [200, 150, 440, 380]); if (lap) for (let i = 0; i < 8; i++) line(g, [[320, 190 + i * 22], [328, 196 + i * 22]], '#f7f9fb', 2.5);
    });
    if (!s.normal && !lap) mbox(g, 400, 38, [[say('灌氣壓力 ', 'Insufflation ') + (ok ? 100 : 80) + ' mmHg (≤120)']], 230);
    const L = s.L; L(320, 436, s.normal || lap ? '直腸' : '肛管導管與氣球', s.normal || lap ? 'Rectum' : 'Rectal catheter and balloon', 470, 440);
    if (!s.normal && !ok && !lap) L(tip[0], tip[1], '套疊前端軟組織腫塊（爪徵）', 'Soft-tissue mass at the leading edge (claw sign)', 470, 104, c.a);
    if (ok) L(320, 260, '空氣自由逆流進入迴腸：復位成功', 'Free reflux of air into the ileum: reduced', 470, 70, c.t); if (lap) L(324, 260, '剖腹手法復位後', 'After manual reduction at laparotomy', 470, 70, c.t); if (s.normal) L(320, 260, '正常腸氣', 'Normal gas pattern', 470, 70);
  }
  const PS_RX = {
    ng: { zh: '鼻胃管減壓', en: 'Nasogastric decompression', text: '放置鼻胃管（食道閉鎖用 Replogle 雙腔管）持續低壓抽吸，排出吞入的空氣與膽汁、減少吸入與腸道擴張，同時禁食並以靜脈輸液矯正電解質；這是所有新生兒腸阻塞的第一步。影像上氣體減少並可見管路。', textEn: 'A nasogastric tube (a double-lumen Replogle tube in oesophageal atresia) on low continuous suction removes swallowed air and bile, reducing aspiration and distension, together with nil by mouth and IV fluids to correct electrolytes — the first step in any neonatal obstruction. Gas decreases and the tube is visible.' },
    duodenostomy: { zh: '十二指腸吻合（Kimura 菱形）', en: 'Duodenoduodenostomy (Kimura diamond)', text: '穩定後經右上腹或腹腔鏡把閉鎖近端與遠端十二指腸做菱形吻合，同時檢查有無腸旋轉不良與其他閉鎖；術後遠端腸道開始出現氣體。約三成合併唐氏症，需做心臟超音波。', textEn: 'Once stable, through a right upper incision or laparoscopically, the proximal and distal duodenum are joined in a diamond anastomosis while checking for malrotation and further atresias; afterwards gas appears in the distal bowel. About a third have Down syndrome, so an echocardiogram is needed.' },
    'nec-medical': { zh: '保守治療（禁食、減壓、抗生素）', en: 'Medical management (nil by mouth, decompression, antibiotics)', text: 'Bell I–II 期以禁食、鼻胃管減壓、廣效抗生素與全靜脈營養治療 7–14 天，並以連續腹部 X 光追蹤，腸壁積氣與門靜脈積氣隨之消退；出現游離氣體或臨床惡化即需手術。', textEn: 'Bell stage I–II disease is treated with nil by mouth, nasogastric decompression, broad-spectrum antibiotics and parenteral nutrition for 7–14 days with serial abdominal films, and pneumatosis and portal venous gas resolve; free air or clinical deterioration means surgery.' },
    laparotomy: { zh: '剖腹探查', en: 'Laparotomy', text: 'NEC 穿孔或壞死（III 期）、空氣灌腸失敗或腸套疊合併穿孔時開腹：切除壞死腸段並做造口（或一期吻合）；腸套疊則由遠端往近端把套入部「擠回」，無法復位或已壞死再切除。極低體重兒可先放腹腔引流。', textEn: 'Perforated or necrotic bowel (NEC stage III), a failed enema or an intussusception with perforation needs laparotomy: necrotic bowel is resected with a stoma (or primary anastomosis), and an intussusception is squeezed back from distal to proximal, resecting if irreducible or dead. Extremely small infants may first have a peritoneal drain.' },
    fluids: { zh: '先矯正代謝性鹼中毒', en: 'Correct the metabolic alkalosis first', text: '幽門狹窄嘔吐流失胃酸，造成低氯、低鉀性代謝性鹼中毒；手術不是急診，先以含鉀的生理食鹽水矯正氯與碳酸氫根再麻醉，以免術後呼吸暫停。這一步不改變超音波影像。', textEn: 'Vomiting in pyloric stenosis loses gastric acid, causing a hypochloraemic, hypokalaemic metabolic alkalosis; surgery is not an emergency, and saline with potassium corrects chloride and bicarbonate before anaesthesia to avoid postoperative apnoea. This step does not change the ultrasound image.' },
    pyloromyotomy: { zh: '幽門肌切開術（Ramstedt）', en: 'Pyloromyotomy (Ramstedt)', text: '經臍或腹腔鏡沿幽門前上方縱向切開肥厚的環狀肌，直到黏膜下層膨出而黏膜保持完整；數小時後即可餵食。超音波見肌層裂開、黏膜膨出，通道打開。', textEn: 'Through the umbilicus or laparoscopically, the hypertrophied circular muscle is split longitudinally on the anterosuperior pylorus until the submucosa bulges, leaving the mucosa intact; feeding starts within hours. Ultrasound shows the split muscle with bulging mucosa and an open channel.' },
    'air-enema': { zh: '空氣灌腸復位', en: 'Air enema reduction', text: '在透視（或超音波）導引下由肛門灌入空氣、壓力不超過約 120 mmHg，把套入的腸段推回；空氣自由逆流進入迴腸代表成功，成功率約八到九成。腹膜炎、休克或游離氣體為禁忌，失敗可再試一次或手術。', textEn: 'Under fluoroscopic (or ultrasound) guidance air is introduced per rectum at no more than about 120 mmHg to push the intussusceptum back; free reflux of air into the ileum marks success, achieved in about 80–90%. Peritonitis, shock or free air contraindicate it, and failure leads to one repeat attempt or surgery.' },
    'cdh-repair': { zh: '橫膈修補（穩定後）', en: 'Diaphragmatic repair (after stabilisation)', text: '先以溫和通氣（允許性高碳酸血症）、肺高壓治療與必要時 ECMO 穩定，數天後再手術把腸、胃與脾臟復位，直接縫合或以補片修補橫膈缺損。存活取決於肺發育不全與肺高壓的程度，而非修補本身。', textEn: 'The infant is first stabilised with gentle ventilation (permissive hypercapnia), treatment of pulmonary hypertension and ECMO if needed; days later the herniated bowel, stomach and spleen are returned and the defect closed primarily or with a patch. Survival depends on lung hypoplasia and pulmonary hypertension rather than the repair itself.' },
    'oa-repair': { zh: '瘻管結紮＋食道吻合', en: 'Fistula ligation + oesophageal anastomosis', text: '經右胸（或胸腔鏡）結紮氣管食道瘻並將上下段食道端端吻合；間距過長（超過約 3 個椎體）時先胃造口餵食、延遲吻合。術後鼻胃管可通過吻合口進入胃。', textEn: 'Through the right chest (or thoracoscopically) the tracheo-oesophageal fistula is ligated and the two oesophageal ends joined; a long gap (more than about three vertebral bodies) is managed with a gastrostomy and delayed anastomosis. Afterwards the nasogastric tube passes through the anastomosis into the stomach.' }
  };
  const nx = (id, zh, en, hdr, p, fn) => ({ id, zh, en, mod: 'XR', hdr, p, h: { lr: 'R', lrx: 30 }, draw: fn });
  const PS_CONDS = [
    { id: 'duodenal-atresia', zh: '十二指腸閉鎖', en: 'Duodenal atresia', rx: ['ng', 'duodenostomy'], views: [nx('axr', '新生兒腹部 X 光', 'Neonatal abdominal X-ray', 'NEONATAL AXR · SUPINE AP', sev('阻塞完整度', 'Obstruction'), (g, s) => neoAbd(g, s, 'duo'))],
      f: '出生數小時內膽汁性嘔吐（閉鎖多位於 Vater 壺腹遠端），腹部 X 光見胃與近端十二指腸兩個氣泡的「雙泡徵」。遠端完全無氣體為閉鎖；遠端有少量氣體要想到狹窄、膜狀阻塞或腸旋轉不良合併扭轉——後者是急診。產前超音波常見羊水過多與雙泡。', fEn: 'Bilious vomiting within hours of birth (most atresias lie distal to the ampulla) with a "double bubble" of stomach and proximal duodenum on the abdominal film. No distal gas means atresia; some distal gas raises stenosis, a web or malrotation with volvulus — the last an emergency. Antenatal scans often show polyhydramnios and the double bubble.' },
    { id: 'nec', zh: '壞死性小腸結腸炎（NEC）', en: 'Necrotising enterocolitis', rx: ['nec-medical', 'ng', 'laparotomy'], views: [nx('axr', '新生兒腹部 X 光', 'Neonatal abdominal X-ray', 'NEONATAL AXR · SUPINE AP', P('Bell 分期', 'Bell stage', 1, 3, 2.2, '', { step: .1, normal: 1, fmt: v => 'Bell ' + (v < 1.8 ? 'I' : v < 2.7 ? 'II' : 'III') + ' (' + v.toFixed(1) + ')' }), (g, s) => neoAbd(g, s, 'nec'))],
      f: '早產兒（常在開始餵食後）因腸黏膜缺血與細菌侵入造成腸壁壞死。修訂 Bell 分期：I 期為疑似（腸擴張、餵食不耐）；II 期確診，X 光見腸壁積氣（泡狀或線狀透亮）與門靜脈積氣；III 期進展合併休克或穿孔，仰臥片見「美式足球徵」與 Rigler 徵。', fEn: 'In premature infants, often after feeds begin, mucosal ischaemia and bacterial invasion cause bowel-wall necrosis. Modified Bell staging: stage I is suspected (distension, feed intolerance); stage II is definite, with pneumatosis intestinalis (bubbly or linear lucencies) and portal venous gas; stage III is advanced, with shock or perforation and a "football sign" and Rigler\'s sign on the supine film.' },
    { id: 'pyloric-stenosis', zh: '肥厚性幽門狹窄', en: 'Infantile hypertrophic pyloric stenosis', rx: ['fluids', 'pyloromyotomy'], views: [{ id: 'us', zh: '幽門超音波', en: 'Pylorus ultrasound', mod: 'US', hdr: 'LINEAR 12 MHz · PYLORUS LONGITUDINAL', p: P('幽門肌層厚度', 'Pyloric muscle thickness', 1.5, 6, 4, ' mm', { step: .1, normal: 2, fmt: v => v.toFixed(1) + ' mm' }), h: { scale: [120, '1 cm'] }, draw: pylorusUS }],
      f: '出生後 2–8 週（多為頭胎男嬰）出現漸進性噴射狀、非膽汁性嘔吐，餵食後可摸到「橄欖」腫塊。超音波標準：幽門肌層厚度 ≥3 mm、通道長度 ≥15 mm 且胃內容物無法通過，縱切面呈「子宮頸徵」、橫切面呈「標靶徵」。血液氣體見低氯低鉀性代謝性鹼中毒。', fEn: 'At 2–8 weeks (often firstborn boys) progressive projectile non-bilious vomiting develops, and an "olive" may be felt after a feed. Ultrasound criteria: pyloric muscle thickness of 3 mm or more and channel length of 15 mm or more with no passage of gastric contents — a "cervix sign" longitudinally and a "target sign" transversely. Blood gases show a hypochloraemic, hypokalaemic metabolic alkalosis.' },
    { id: 'intussusception', zh: '腸套疊', en: 'Intussusception', rx: ['air-enema', 'laparotomy'], views: [{ id: 'us', zh: '腹部超音波', en: 'Abdominal ultrasound', mod: 'US', hdr: 'LINEAR · RIGHT ABDOMEN TRANSVERSE', p: sev('水腫／病程', 'Oedema / duration'), h: { scale: [80, '1 cm'] }, draw: intussUS }, { id: 'enema', zh: '空氣灌腸透視', en: 'Air enema fluoroscopy', mod: 'FLUORO', hdr: 'AIR ENEMA · SUPINE', p: sev('套疊前端位置', 'Leading-edge position'), h: { lr: 'R', lrx: 120 }, draw: airEnema }],
      f: '6 個月到 3 歲幼兒陣發性哭鬧縮腿、嘔吐與「果醬樣」血便，多為迴腸套入結腸（迴結型），常與病毒感染後淋巴組織增生有關。超音波在右側腹見直徑約 3 cm 的「標靶徵」（橫切）或「假腎徵」（縱切），腸壁水腫、無血流或積液提示較難復位。空氣灌腸時套疊前端在透視下呈軟組織腫塊與「爪徵」。', fEn: 'A child of 6 months to 3 years has paroxysmal crying with drawn-up legs, vomiting and "redcurrant-jelly" stools, usually ileum telescoped into colon (ileocolic), often after viral lymphoid hyperplasia. Ultrasound in the right abdomen shows a target sign about 3 cm across (transverse) or a pseudo-kidney (longitudinal), and wall oedema, absent flow or trapped fluid predict harder reduction. At air enema the leading edge appears as a soft-tissue mass with a "claw sign".' },
    { id: 'cdh', zh: '先天性橫膈疝氣', en: 'Congenital diaphragmatic hernia', rx: ['ng', 'cdh-repair'], views: [nx('cxr', '新生兒胸腹 X 光', 'Neonatal chest–abdomen X-ray', 'NEONATAL CXR + ABDOMEN · AP', sev('疝入量', 'Herniated volume'), (g, s) => neoChest(g, s, 'cdh'))],
      f: '多為左後外側（Bochdalek）缺損，腸、胃甚至脾臟疝入胸腔，壓迫同側肺並使其發育不全，出生後立即呼吸窘迫、腹部呈舟狀。X 光見左胸充滿含氣腸袢、鼻胃管尖端在胸腔內、縱膈與心臟推向右側。不可用面罩加壓給氧（會讓腸胃脹氣更壓迫肺），應立即插管並放胃管減壓。', fEn: 'Usually a left posterolateral (Bochdalek) defect lets bowel, stomach and even spleen into the chest, compressing and leaving the ipsilateral lung hypoplastic; there is respiratory distress at birth and a scaphoid abdomen. The film shows gas-filled loops in the left chest, the nasogastric tube tip above the diaphragm and the mediastinum pushed right. Bag-mask ventilation is avoided because it inflates the bowel; the baby is intubated and the stomach decompressed.' },
    { id: 'oa-tof', zh: '食道閉鎖合併氣管食道瘻', en: 'Oesophageal atresia with tracheo-oesophageal fistula', rx: ['ng', 'oa-repair'], views: [nx('cxr', '新生兒胸腹 X 光', 'Neonatal chest–abdomen X-ray', 'NEONATAL CXR + ABDOMEN · AP', P('上下段間距', 'Gap', 1, 6, 2, ' VB', { step: .1, normal: 1, fmt: v => v.toFixed(1) + say(' 個椎體', ' vertebral bodies') }), (g, s) => neoChest(g, s, 'oa'))],
      f: '新生兒口水多、一餵就嗆咳發紺，鼻胃管插不下去。X 光見胃管在上段盲囊（約 T2–T4）捲曲；胃腸有氣體表示合併遠端氣管食道瘻（最常見的 C 型，約 85%），完全無氣則為單純閉鎖（A 型，間距常較長）。需篩檢 VACTERL 相關異常（脊椎、肛門、心臟、腎臟與四肢）。', fEn: 'The newborn drools, chokes and turns blue with feeds, and a nasogastric tube will not pass. The film shows the tube coiled in the upper pouch (about T2–T4); gas in the stomach and bowel means a distal tracheo-oesophageal fistula (type C, about 85%), while a gasless abdomen indicates pure atresia (type A, usually long-gap). VACTERL anomalies (vertebral, anorectal, cardiac, renal and limb) are screened for.' }
  ];
  ST.register({ id: 'pediatric-surgery', zh: '小兒外科', en: 'Paediatric surgery', rx: PS_RX, conds: PS_CONDS });

  // ================================================================ ANAESTHESIOLOGY
  const CAP_PAT = [['normal', '正常', 'Normal'], ['bronch', '支氣管痙攣', 'Bronchospasm'], ['rebreath', '再吸入', 'Rebreathing'], ['oesoph', '食道插管', 'Oesophageal'], ['curare', '箭毒裂隙', 'Curare cleft'], ['disc', '斷線', 'Disconnection'], ['arrest', '心跳停止', 'Cardiac arrest']];
  function capVal(t, pat, k, fix) {
    const T = 4, n = Math.floor(t / T), ph = (t % T) / T; let et = 36 + (pat === 'normal' ? (k - .5) * 10 : 0), base = 0, tau = .02, cleft = 0, amp = 1;
    if (!fix) { if (pat === 'bronch') tau = .03 + .22 * k; if (pat === 'rebreath') { base = 2 + 10 * k; et += 6 * k; } if (pat === 'curare') cleft = 4 + 14 * k; if (pat === 'oesoph') amp = n > 2 ? 0 : (6 + 14 * k) / 36 * Math.exp(-n * 1.2); if (pat === 'disc' && t > 12 * (1 - k * .8)) return 0; if (pat === 'arrest') et = 38 * Math.exp(-t * k * .35) + 2; }
    else if (pat === 'arrest') { if (t < 8) { et = 14 + 4 * Math.sin(t * 1.3); } else et = 42; }
    let v; if (ph < .06) v = 0; else if (ph < .62) { const u = ph - .06; v = 1 - Math.exp(-u / tau); v *= 1 + .06 * u; if (cleft && ph > .38 && ph < .46) v -= cleft / et * Math.sin((ph - .38) / .08 * PI); } else if (ph < .67) v = (1 - (ph - .62) / .05) * (1 - Math.exp(-.56 / tau)) * 1.03; else v = 0;
    return base + (et - base) * Math.max(0, v) * amp;
  }
  function capno(g, s) {
    const c = pal(g), pat = s.normal ? 'normal' : (s.x.pat || 'bronch'), k = s.normal ? .5 : s.k, fix = s.has('reposition') && !s.normal, sw = (s.time % 12) / 12;
    g.fillStyle = '#020805'; g.fillRect(0, 0, W, H); noise(g, .07, 'screen', 2);
    chart(g, 30, 52, 470, 250, { bg: '#020c07', nx: 12, ny: 6, grid: 'rgba(80,140,100,.2)' });
    const Y = v => 302 - v / 60 * 250; [0, 20, 40, 60].forEach(v => mt(g, v, 26, Y(v) + 4, { s: 10, a: 'right', c: '#ccb94a' }));
    trace(g, 30, 52, 470, 250, '#ffe14d', 12, t => capVal(t, pat, k, fix) / 60, sw, 2.4);
    let mx = 0, mn = 99; for (let t = 4; t < 12; t += .05) { const v = capVal(t, pat, k, fix); mx = Math.max(mx, v); mn = Math.min(mn, v); }
    const nums = [['EtCO₂', Math.round(mx), 'mmHg', '#ffe14d'], ['FiCO₂', Math.max(0, Math.round(mn)), 'mmHg', '#ffe14d'], ['RR', mx < 3 ? 0 : 15, '/min', '#9fe']];
    nums.forEach(([l, v, u, col], i) => { rect(g, 516, 52 + i * 84, 110, 76, { f: 'rgba(255,255,255,.04)', s: 'rgba(255,255,255,.12)', lw: 1, r: 6 }); mt(g, l, 524, 70 + i * 84, { s: 11, c: col }); txt(g, v, 616, 112 + i * 84, { s: 34, c: col, a: 'right', w: '800', mono: true }); mt(g, u, 524, 122 + i * 84, { s: 10, c: '#789' }); });
    chart(g, 30, 322, 596, 104, { bg: '#020c07', nx: 10, ny: 3, grid: 'rgba(80,140,100,.2)' }); mt(g, say('EtCO₂ 趨勢 30 分', 'EtCO₂ trend 30 min'), 36, 338, { s: 10.5, c: '#ccb94a' });
    const tr = m => { if (s.normal || pat === 'normal') return 36; const end = m > 27; if (pat === 'bronch') return fix && end ? 36 : 36 + 6 * k * sm(15, 27, m); if (pat === 'rebreath') return fix && end ? 36 : 36 + 6 * k * sm(5, 27, m); if (pat === 'curare') return 35; if (pat === 'oesoph') return m < 27 ? 0 : fix ? 36 : 4; if (pat === 'disc') return m < 27 ? 36 : fix ? 36 : 0; if (pat === 'arrest') return m < 25 ? 36 : fix ? (m < 29 ? 15 : 42) : 36 * (1 - k) + 2; return 36; };
    g.save(); g.beginPath(); for (let m = 0; m <= 30; m += .25) { const x = 30 + m / 30 * 596, y = 426 - tr(m) / 60 * 104; m ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokeStyle = '#ffe14d'; g.lineWidth = 2; g.stroke(); g.restore();
    const L = s.L, ok = pat === 'normal' || fix;
    if (ok && pat !== 'arrest') { const x = t => 30 + t / 12 * 470; L(x(4.1), Y(1), 'I 相：吸氣基線', 'Phase I: inspiratory baseline', 120, 330); L(x(4.35), Y(20), 'II 相：上升支', 'Phase II: expiratory upstroke', 60, 90); L(x(6.2), Y(capVal(6.2, pat, k, fix) + 1), 'III 相：肺泡平台', 'Phase III: alveolar plateau', 300, 70); L(x(6.58), Y(18), '0 相：吸氣下降', 'Phase 0: inspiratory downstroke', 420, 160); }
    if (!ok || pat === 'arrest') { const lab = { bronch: ['II 相變緩、III 相陡升：「鯊魚鰭」', 'Slow phase II, steep phase III: "shark fin"'], rebreath: ['基線不回零：再吸入 CO₂', 'Baseline does not return to zero: rebreathing'], oesoph: ['幾個漸小波形後變直線：食道插管', 'A few shrinking waves then flat: oesophageal intubation'], curare: ['平台上的凹陷：自發呼吸', 'Notch in the plateau: spontaneous effort'], disc: ['波形突然消失：斷線／阻塞', 'Sudden loss: disconnection / obstruction'], arrest: fix ? ['CPR 時 EtCO₂ 10–20，突然升高 = 自發循環恢復', 'EtCO₂ 10–20 during CPR, sudden rise = ROSC'] : ['EtCO₂ 逐漸下降：心輸出消失', 'Falling EtCO₂: loss of cardiac output'] }[pat]; L(30 + 6 / 12 * 470, Y(capVal(6, pat, k, fix)), lab[0], lab[1], 260, 80, fix ? c.t : c.a); }
    if (fix && pat !== 'normal') L(400, 426 - 36 / 60 * 104, '處置後波形恢復', 'Waveform restored after the fix', 300, 316, c.t); else L(560, 380, 'EtCO₂ 趨勢', 'EtCO₂ trend', 300, 316);
  }
  function mallampati(g, s) {
    const c = pal(g), cl = s.v, ty = pw(cl, [1, 2, 3, 4], [348, 302, 258, 196]);
    g.fillStyle = rgrad(g, 320, 220, 40, 420, ['#e7b597', '#b98065']); g.fillRect(0, 0, W, H); noise(g, .14, 'overlay', 1.6);
    ell(g, 320, 255, 156, 140, { f: '#8a3b36', blur: 6 }); g.save(); g.beginPath(); g.ellipse(320, 255, 144, 130, 0, 0, TAU); g.clip();
    g.fillStyle = '#5a1416'; g.fillRect(0, 0, W, H); ell(g, 320, 320, 80, 70, { f: rgrad(g, 320, 310, 5, 90, ['#9a2c2c', '#5a1416']) });
    rect(g, 150, 120, 340, 34, { f: grad(g, 0, 120, 0, 154, ['#f3efe6', '#d9d2c4']) }); for (let i = 0; i < 8; i++) line(g, [[170 + i * 40, 122], [170 + i * 40, 152]], 'rgba(120,110,90,.5)', 1.5);
    shape(g, [[170, 150], [470, 150], [460, 190], [180, 190]], { f: '#e8b0a6' }); for (let i = 0; i < 5; i++) line(g, [[250 + i * 30, 160], [250 + i * 30, 182]], 'rgba(180,120,110,.6)', 2);
    shape(g, [[176, 190], [464, 190], [440, 236], [380, 222], [340, 234], [300, 234], [260, 222], [200, 236]], { f: '#d9827a' });
    shape(g, [[306, 226], [334, 226], [340, 268], [320, 292], [300, 268]], { f: rgrad(g, 316, 250, 4, 44, ['#ef9a90', '#c46a62']) });
    [-1, 1].forEach(sd => { shape(g, [[320 + sd * 120, 236], [320 + sd * 84, 300], [320 + sd * 96, 390]], { open: true, s: '#c6625a', lw: 12 }); shape(g, [[320 + sd * 70, 240], [320 + sd * 56, 300], [320 + sd * 66, 390]], { open: true, s: '#a8483f', lw: 10 }); ell(g, 320 + sd * 78, 320, 16, 26, { f: '#b65a52' }); });
    shape(g, [[150, 400], [200, ty + 30], [270, ty], [320, ty - 6], [370, ty], [440, ty + 30], [490, 400], [490, 420], [150, 420]], { f: rgrad(g, 320, ty + 40, 10, 220, ['#f0a59c', '#d77a72', '#b95c55']) }); line(g, [[320, ty + 10], [320, 400]], 'rgba(150,60,55,.5)', 3);
    g.restore(); rect(g, 170, 376, 300, 26, { f: grad(g, 0, 376, 0, 402, ['#e9e3d6', '#f6f2ea']) });
    const n = clamp(Math.round(cl), 1, 4);
    txt(g, 'Mallampati ' + rom(n), 24, 64, { s: 18, w: '800', c: n >= 3 ? '#ff8a80' : '#9f9' });
    const L = s.L; L(320, 172, '硬顎', 'Hard palate', 560, 90); if (ty > 230) L(400, 214, '軟顎', 'Soft palate', 560, 160); if (ty > 284) L(320, 270, '懸雍垂', 'Uvula', 560, 230); if (ty > 330) L(400, 330, '咽門柱', 'Faucial pillars', 560, 300);
    L(320, Math.min(ty + 40, 380), n >= 3 ? '舌頭遮住大部分口咽：預測困難喉鏡' : '舌頭', n >= 3 ? 'Tongue hides most of the oropharynx: predicts difficult laryngoscopy' : 'Tongue', 90, 440, n >= 3 ? c.a : c.n);
  }
  function laryngoscopy(g, s) {
    const c = pal(g), g0 = s.normal ? 1 : s.v, gr = Math.max(1, Math.min(s.has('vl') ? Math.min(g0, 1.7) : g0, s.has('burp') ? Math.max(1, g0 - 1) : 9)), dg = -(gr - 1) * 62 - Math.max(0, gr - 2.4) * 45, de = -(gr - 1) * 10, dt = Math.max(0, gr - 3) * 130;
    scope(g, { bg: '#a8473f' }, (cx, cy, r) => {
      g.fillStyle = rgrad(g, cx, cy + 60, 10, r, ['rgba(60,10,10,.2)', 'rgba(150,60,50,0)']); g.fillRect(0, 0, W, H); noise(g, .22, 'overlay', 1.3);
      ell(g, cx, cy + 120, 170, 70, { f: '#7a2826', blur: 18 }); vessels(g, cx, cy + 60, r, 12, 23, 'rgba(120,30,30,.4)', 1.3);
      g.save(); g.translate(0, dg);
      ell(g, cx, cy + 10, 52, 70, { f: '#140404', blur: 6 }); for (let i = 0; i < 4; i++) ell(g, cx, cy + 30 + i * 8, 30 - i * 4, 6, { s: 'rgba(120,60,50,.3)', lw: 2 });
      [-1, 1].forEach(sd => { shape(g, [[cx, cy - 56], [cx + sd * 30, cy + 20], [cx + sd * 26, cy + 66]], { open: true, s: '#f2ece6', lw: 9 }); shape(g, [[cx, cy - 56], [cx + sd * 62, cy - 10], [cx + sd * 58, cy + 70]], { open: true, s: '#c06a62', lw: 14 }); ell(g, cx + sd * 30, cy + 78, 22, 18, { f: rgrad(g, cx + sd * 26, cy + 72, 2, 24, ['#e9a49b', '#b45a52']) }); });
      g.restore();
      g.save(); g.translate(0, de); shape(g, [[cx - 90, cy - 90], [cx - 60, cy - 48], [cx, cy - 34], [cx + 60, cy - 48], [cx + 90, cy - 90], [cx + 70, cy - 150], [cx - 70, cy - 150]], { f: rgrad(g, cx, cy - 70, 10, 110, ['#f3c2b6', '#d98d80']), blur: 4 }); shape(g, [[cx - 60, cy - 48], [cx, cy - 34], [cx + 60, cy - 48]], { open: true, s: 'rgba(255,255,255,.35)', lw: 2 }); g.restore();
      shape(g, [[cx - 230, cy - 230], [cx + 230, cy - 230], [cx + 230, cy - 130 + dt], [cx, cy - 104 + dt], [cx - 230, cy - 130 + dt]], { f: rgrad(g, cx, cy - 170, 10, 220, ['#d9827a', '#b5534c']), blur: 6 });
      rect(g, cx - 70, cy - 232, 140, 70, { f: grad(g, cx - 70, 0, cx + 70, 0, ['#8c9499', '#dfe4e7', '#8c9499']) }); ell(g, cx, cy - 162, 16, 6, { f: 'rgba(255,255,230,.9)', blur: 14 });
    });
    const n = gr < 1.5 ? '1' : gr < 2 ? '2a' : gr < 2.5 ? '2b' : gr < 3.5 ? '3' : '4';
    txt(g, 'Cormack–Lehane ' + n, 24, 64, { s: 18, w: '800', c: gr >= 2.5 ? '#ff8a80' : '#9f9' }); mt(g, s.has('vl') ? say('影像喉頭鏡', 'videolaryngoscope') : 'Macintosh 3', 24, 86, { s: 12 });
    const L = s.L; L(320, 244 + de - 40, '會厭', 'Epiglottis', 560, 120);
    if (gr < 2.5) L(320, 254 + dg + 20, gr < 1.5 ? '整個聲門與聲帶可見' : '只見後半聲門／杓狀軟骨', gr < 1.5 ? 'Whole glottis and cords visible' : 'Only the posterior glottis / arytenoids', 560, 330, (s.has('vl') || s.has('burp')) && g0 >= 2.5 ? c.t : c.n); else L(320, 254 - 120 + Math.min(dt, 120), gr < 3.5 ? '只見會厭：聲門被遮住' : '連會厭都看不到', gr < 3.5 ? 'Epiglottis only: glottis hidden' : 'Not even the epiglottis', 90, 400, c.a);
    if (gr < 2.5) L(350, 254 + dg + 78, '杓狀軟骨', 'Arytenoids', 560, 420);
  }
  const tofOf = d => { const R = clamp(1 - d / 60, 0, 1), cnt = d < 60 ? 4 : d < 70 ? 3 : d < 80 ? 2 : d < 90 ? 1 : 0, t1 = d < 60 ? 1 : clamp((96 - d) / 36, 0, 1); return [0, 1, 2, 3].map(i => i < cnt ? t1 * (1 - (1 - R) * i / 3) * (d >= 60 ? (1 - i * .25) : 1) : 0); };
  function tofView(g, s) {
    const c = pal(g), d0 = s.normal ? 0 : s.v, neo = s.has('neostigmine'), sug = s.has('sugammadex');
    const d = sug ? 0 : neo ? (d0 < 60 ? Math.max(0, d0 - 60) : d0 < 80 ? 6 + (d0 - 60) * .4 : d0 - 12) : d0, tw = tofOf(d), cnt = tw.filter(v => v > .01).length, ratio = cnt === 4 ? tw[3] / tw[0] : 0, ptc = cnt === 0 ? Math.max(0, Math.round((100 - d) / 1.6)) : null;
    g.fillStyle = '#04080b'; g.fillRect(0, 0, W, H); noise(g, .07, 'screen', 2);
    chart(g, 40, 56, 330, 300, { bg: '#051016', nx: 4, ny: 10, grid: 'rgba(90,150,170,.18)' }); line(g, [[40, 76], [370, 76]], 'rgba(150,220,255,.5)', 1, [5, 4]); mt(g, '100%', 44, 72, { s: 10, c: '#7cc' });
    tw.forEach((v, i) => { const x = 66 + i * 76, hh = v * 280; rect(g, x, 356 - hh, 46, hh, { f: grad(g, 0, 356 - hh, 0, 356, ['#6ff0ff', '#1f8fb0']), blur: 6, sc: '#4fe3ff' }); mt(g, 'T' + (i + 1), x + 23, 374, { s: 12, a: 'center', c: '#9fe' }); });
    const rows = [['TOF count', cnt, ''], ['TOF ratio', cnt === 4 ? Math.round(ratio * 100) : '—', cnt === 4 ? '%' : ''], ['PTC', ptc == null ? '—' : ptc, '']];
    rows.forEach(([l, v, u], i) => { rect(g, 394, 56 + i * 92, 232, 82, { f: 'rgba(255,255,255,.04)', s: 'rgba(255,255,255,.12)', lw: 1, r: 6 }); mt(g, l, 404, 76 + i * 92, { s: 12, c: '#9fe' }); txt(g, v + u, 616, 124 + i * 92, { s: 38, c: i === 1 && cnt === 4 && ratio < .9 ? '#ff8a80' : '#e8fbff', a: 'right', w: '800', mono: true }); });
    const safe = cnt === 4 && ratio >= .9; rect(g, 40, 396, 586, 44, { f: safe ? 'rgba(60,200,120,.2)' : 'rgba(255,80,80,.18)', r: 6 }); txt(g, safe ? say('TOF 比值 ≥0.9：可安全拔管', 'TOF ratio ≥0.9: safe to extubate') : say('殘餘阻斷：不要拔管（觸感無法偵測 >0.4 的衰減）', 'Residual block: do not extubate (fade >0.4 cannot be felt)'), 56, 424, { s: 14, c: safe ? '#9f9' : '#ff8a80', w: '700' });
    const L = s.L; if (cnt) L(66 + (cnt - 1) * 76 + 23, 356 - tw[cnt - 1] * 280, cnt === 4 ? (ratio < .9 ? 'T4 衰減（比值 ' + ratio.toFixed(2) + '）' : '無衰減') : 'T' + (cnt + 1) + ' 起消失', cnt === 4 ? (ratio < .9 ? 'T4 fade (ratio ' + ratio.toFixed(2) + ')' : 'No fade') : 'T' + (cnt + 1) + ' onward absent', 250, 110, ratio >= .9 ? c.t : c.a); else L(200, 350, '四個反應都消失：深度阻斷，看 PTC', 'No twitches: deep block, use the PTC', 250, 110, c.a);
    if (neo && d0 >= 60) L(510, 150, '新斯狄明有天花板效應：深度阻斷時不足', 'Neostigmine ceiling: insufficient for deep block', 400, 300, c.w); if (sug) L(510, 150, 'Sugammadex 包覆 rocuronium：完全恢復', 'Sugammadex encapsulates rocuronium: full recovery', 400, 300, c.t);
  }
  const BASE = { hr: 72, sys: 118, dia: 68, spo2: 99, et: 36, temp: 36.6, idx: 48, qrs: 0, shark: 0, ect: 0 };
  const SCEN = {
    hypot: t => { const d = sm(0, 4, t) * (1 - .35 * sm(9, 20, t)); return { hr: 72 - 10 * d, sys: 118 - 50 * d, dia: 68 - 28 * d, spo2: 99, et: 36 - 4 * d, temp: 36.6 - .02 * t, idx: 48 - 18 * d, qrs: 0, shark: 0, ect: 0 }; },
    anaph: t => { const d = sm(0, 3.5, t); return { hr: 72 + 58 * d, sys: 118 - 70 * d, dia: 68 - 40 * d, spo2: 99 - 11 * d, et: 36 - 17 * d, temp: 36.6, idx: 48, qrs: 0, shark: d, ect: 0 }; },
    mh: t => { const d = sm(0, 20, t); return { hr: 72 + 68 * d, sys: 118 + 22 * d - 40 * d * d, dia: 68 + 6 * d - 20 * d * d, spo2: 99 - 7 * d * d, et: 36 + 52 * d, temp: 36.6 + 3.4 * d * d, idx: 48, qrs: 0, shark: 0, ect: d > .55 ? 1 : 0 }; },
    last: t => { const a = sm(0, 2, t), b = sm(3, 11, t); return { hr: 72 + 24 * a * (1 - b) - 34 * b, sys: 118 + 12 * a - 66 * b, dia: 68 + 6 * a - 38 * b, spo2: 99 - 7 * b, et: 36 - 14 * b, temp: 36.6, idx: 48 + 25 * a * (1 - b) - 10 * b, qrs: b, shark: 0, ect: b > .6 ? 1 : 0 }; }
  };
  const MON_RX = { hypot: 'vasopressor', anaph: 'adrenaline', mh: 'dantrolene', last: 'lipid' };
  function vit(scen, t, tr) { const v = SCEN[scen](t); if (tr == null) return v; const r = clamp((t - tr) / 2.5, 0, 1) * .88, rt = clamp((t - tr) / 7, 0, 1) * .8, o = {}; Object.keys(v).forEach(key => { o[key] = v[key] + (BASE[key] - v[key]) * (key === 'temp' ? rt : r); }); return o; }
  function ecgV(t, v) { const p = 60 / Math.max(30, v.hr), n = Math.floor(t / p), ph = (t % p) / p, q = 1 + 2.4 * v.qrs; if (v.ect && n % 4 === 3) return .45 + .5 * Math.sin(clamp(ph / .4, 0, 1) * TAU) * (ph < .4 ? 1 : 0); return .35 + .1 * gs(ph, .12, .025) - .1 * gs(ph, .245, .006 * q) + .55 * gs(ph, .26, .009 * q) - .18 * gs(ph, .285, .009 * q) + .14 * gs(ph, .5, .05) * (v.qrs > .5 ? -1 : 1); }
  function monitor(g, s, scen) {
    const c = pal(g), T0 = s.normal ? 0 : s.v, rxOn = !s.normal && s.has(MON_RX[scen]), tr = T0 * .5, V = t => s.normal ? BASE : vit(scen, t, rxOn ? tr : null), v = V(T0), map = (v.sys + 2 * v.dia) / 3, sw = (s.time % 6) / 6;
    g.fillStyle = '#03070a'; g.fillRect(0, 0, W, H); noise(g, .07, 'screen', 2);
    const hp = 60 / Math.max(30, v.hr), pa = clamp((v.sys - v.dia) / 50, .15, 1);
    trace(g, 18, 46, 404, 76, '#39ff7a', 6, t => ecgV(t, v), sw);
    trace(g, 18, 132, 404, 60, '#4fe3ff', 6, t => { const ph = (t % hp) / hp; return .1 + pa * (.75 * gs(ph, .2, .06) + .35 * gs(ph, .45, .07)); }, sw);
    trace(g, 18, 206, 404, 76, '#ffe14d', 6, t => { const T = 5, ph = (t % T) / T, tau = .02 + .25 * v.shark; let y = ph < .06 || ph > .66 ? 0 : ph < .62 ? 1 - Math.exp(-(ph - .06) / tau) : (1 - (ph - .62) / .04); return Math.max(0, y) * v.et / 90; }, sw);
    [['II', 58, '#39ff7a'], ['Pleth', 144, '#4fe3ff'], ['CO₂', 218, '#ffe14d']].forEach(([t, y, col]) => { rect(g, 14, y - 12, 46, 16, { f: 'rgba(3,7,10,.85)' }); mt(g, t, 18, y, { s: 11, c: col }); });
    const box = (i, lab, val, unit, col, bad) => { const y = 46 + i * 44; rect(g, 432, y, 194, 40, { f: bad ? 'rgba(255,60,60,.22)' : 'rgba(255,255,255,.04)', s: bad ? '#ff5252' : 'rgba(255,255,255,.12)', lw: 1, r: 5 }); mt(g, lab, 440, y + 14, { s: 10.5, c: col }); txt(g, val, 618, y + 32, { s: 24, c: col, a: 'right', w: '800', mono: true }); mt(g, unit, 440, y + 32, { s: 9.5, c: '#789' }); };
    box(0, 'HR', Math.round(v.hr), 'bpm', '#39ff7a', v.hr > 120 || v.hr < 45); box(1, 'NIBP', Math.round(v.sys) + '/' + Math.round(v.dia), '(' + Math.round(map) + ')', '#ff8a80', map < 65); box(2, 'SpO₂', Math.round(v.spo2), '%', '#4fe3ff', v.spo2 < 92); box(3, 'EtCO₂', Math.round(v.et), 'mmHg', '#ffe14d', v.et > 50 || v.et < 25); box(4, 'Temp', v.temp.toFixed(1), '°C', '#ffb04d', v.temp > 38); box(5, say('麻醉深度', 'pEEG idx'), Math.round(v.idx), '40–60', '#e08cff', v.idx < 40 || v.idx > 60);
    chart(g, 18, 316, 608, 120, { bg: '#051009', nx: 10, ny: 4 }); const tx = m => 18 + m / 20 * 608;
    [['map', 20, 160, '#ff8a80'], ['hr', 20, 180, '#39ff7a'], ['et', 0, 100, '#ffe14d'], ['temp', 35, 41, '#ffb04d']].forEach(([key, lo, hi, col]) => { g.save(); g.beginPath(); for (let m = 0; m <= T0 + 1e-6; m += .2) { const w = V(m), val = key === 'map' ? (w.sys + 2 * w.dia) / 3 : w[key], y = 436 - (val - lo) / (hi - lo) * 120; m ? g.lineTo(tx(m), y) : g.moveTo(tx(m), y); } g.strokeStyle = col; g.lineWidth = 2; g.stroke(); g.restore(); });
    line(g, [[tx(T0), 316], [tx(T0), 436]], '#fff', 1, [4, 3]); if (rxOn) { line(g, [[tx(tr), 316], [tx(tr), 436]], '#4dff8f', 2); }
    mt(g, say('趨勢 0–20 分：MAP 紅、HR 綠、EtCO₂ 黃、體溫 橘', 'Trend 0–20 min: MAP red, HR green, EtCO₂ yellow, temp orange'), 24, 330, { s: 10, c: '#9fe' });
    const L = s.L, bad = s.normal ? 0 : 1; let li = 0; const SL = (x, y, z, e, col) => L(x, y, z, e, 300, 354 + 26 * li++, col);
    L(60, 84, '心電圖 II 導程', 'ECG lead II', 120, 300, c.n);
    if (bad) {
      if (scen === 'hypot') { if (map < 70) SL(530, 110, 'MAP <65 mmHg：誘導後低血壓', 'MAP <65 mmHg: post-induction hypotension', c.a); if (v.idx < 40) SL(530, 286, '指數 <40：麻醉過深', 'Index <40: too deep', c.a); }
      if (scen === 'anaph') { if (v.shark > .3) SL(200, 230, '鯊魚鰭：支氣管痙攣', 'Shark fin: bronchospasm', c.a); if (map < 75) SL(530, 110, '低血壓＋心搏過速', 'Hypotension + tachycardia', c.a); }
      if (scen === 'mh') { if (v.et > 45) SL(530, 198, '換氣增加仍持續上升的 EtCO₂', 'EtCO₂ rising despite more ventilation', c.a); if (v.temp > 37.6) SL(530, 242, '體溫上升（較晚出現）', 'Temperature rising (a late sign)', c.a); }
      if (scen === 'last') { if (v.qrs > .3) SL(220, 84, 'QRS 變寬、心律不整', 'QRS widening, arrhythmia', c.a); if (v.hr < 55) SL(530, 66, '心搏過緩', 'Bradycardia', c.a); }
      if (rxOn) SL(tx(tr), 330, '給藥／處置時間點：數值回復', 'Treatment given: values recover', c.t);
    }
  }
  const AN_RX = {
    reposition: { zh: '重新定位／抽痰／排除原因', en: 'Reposition / suction / fix the cause', text: '依波形處理：支氣管痙攣先抽痰、加深麻醉並給支氣管擴張劑；再吸入時加大新鮮氣流、更換鈉石灰或檢查單向閥；食道插管立即拔管重插；箭毒裂隙代表自發呼吸，追加麻醉或肌鬆；斷線重新接上；心跳停止時高品質 CPR 維持 EtCO₂ >10–20 mmHg，突然升高提示自發循環恢復。', textEn: 'Act on the waveform: for bronchospasm suction, deepen anaesthesia and give a bronchodilator; for rebreathing raise fresh gas flow, change the absorbent or check the valves; for oesophageal intubation remove and re-intubate at once; a curare cleft means spontaneous effort, so deepen anaesthesia or re-dose relaxant; reconnect a disconnection; in cardiac arrest high-quality CPR keeps EtCO₂ above 10–20 mmHg and a sudden rise suggests return of circulation.' },
    burp: { zh: 'BURP 喉部外壓＋體位調整', en: 'BURP manoeuvre + positioning', text: '頭頸「嗅花位」（肥胖者墊高成斜坡位），並由助手向後、向上、向右推甲狀軟骨（BURP），可讓喉鏡分級改善約一級；Mallampati 是術前檢查，不受此影響、影像不變。', textEn: 'The sniffing position (or ramping in obesity) plus backward, upward, rightward pressure on the thyroid cartilage (BURP) by an assistant usually improves the laryngoscopic grade by about one; the Mallampati class is a pre-operative examination and its image does not change.' },
    vl: { zh: '影像喉頭鏡', en: 'Videolaryngoscope', text: '高角度鏡片的攝影機在鏡片前端，不必對齊口、咽、喉三軸就能「繞過舌頭」看到聲門，多數困難喉鏡可改善到 1–2 級；需搭配塑形管芯，並依困難氣道流程備妥聲門上裝置與頸前通氣。Mallampati 影像不變。', textEn: 'A hyperangulated blade puts the camera at its tip, so the glottis is seen "around the tongue" without aligning the oral, pharyngeal and laryngeal axes, turning most difficult views into grade 1–2; a shaped stylet is needed, and the difficult-airway algorithm still prepares a supraglottic device and front-of-neck access. The Mallampati image does not change.' },
    neostigmine: { zh: '新斯狄明（＋抗膽鹼劑）', en: 'Neostigmine (+ anticholinergic)', text: '抑制乙醯膽鹼酯酶、增加神經肌肉接頭的乙醯膽鹼，與抗膽鹼劑併用避免心搏過緩；有「天花板效應」，需等四連刺激至少出現 2–4 個反應才有效，深度阻斷時無法讓 TOF 比值達到 0.9。', textEn: 'It inhibits acetylcholinesterase to raise acetylcholine at the junction and is given with an anticholinergic to prevent bradycardia; it has a ceiling effect, works only once at least 2–4 train-of-four responses are present and cannot bring a deep block to a TOF ratio of 0.9.' },
    sugammadex: { zh: '舒更葡糖（sugammadex）', en: 'Sugammadex', text: '環糊精分子包覆血中的 rocuronium 或 vecuronium，使其無法作用於受體；依阻斷深度調整後，連深度阻斷也能在數分鐘內讓 TOF 比值 ≥0.9。對 cisatracurium 與 succinylcholine 無效，拔管前仍以定量監測確認。', textEn: 'A cyclodextrin encapsulates circulating rocuronium or vecuronium so it cannot act on the receptor; scaled to the depth of block it reverses even a deep block to a TOF ratio of 0.9 or more within minutes. It does not work on cisatracurium or succinylcholine, and quantitative monitoring still confirms recovery before extubation.' },
    vasopressor: { zh: '升壓藥（原則）', en: 'Vasopressor (principle)', text: '誘導後低血壓多因血管擴張與交感張力下降：先減淺麻醉、輸液並抬腿，再以 α 促效劑（phenylephrine）或混合作用藥（心搏慢時用 ephedrine）把平均動脈壓恢復到 ≥65 mmHg；持續者以 norepinephrine 輸注。', textEn: 'Post-induction hypotension is mostly vasodilation and loss of sympathetic tone: lighten anaesthesia, give fluid and raise the legs, then restore a mean arterial pressure of 65 mmHg or more with an α-agonist (phenylephrine) or a mixed agent (ephedrine when bradycardic); persistent hypotension needs a norepinephrine infusion.' },
    adrenaline: { zh: '腎上腺素（過敏性休克）', en: 'Adrenaline for anaphylaxis', text: '停止可疑藥物（抗生素、肌鬆劑、chlorhexidine、乳膠）、呼救並給 100% 氧氣，靜脈小量逐步給予腎上腺素並快速輸液；腎上腺素同時收縮血管、增加心輸出並擴張支氣管，是唯一的第一線藥物。事後驗類胰蛋白酶並轉介過敏檢測。', textEn: 'Stop the suspected trigger (antibiotic, neuromuscular blocker, chlorhexidine, latex), call for help, give 100% oxygen, titrate small IV boluses of adrenaline and give fluid rapidly; adrenaline constricts vessels, raises cardiac output and dilates bronchi and is the only first-line drug. Tryptase is taken and the patient referred for allergy testing.' },
    dantrolene: { zh: '丹曲林（原則）', en: 'Dantrolene (principle)', text: '立即停用揮發性麻醉劑與 succinylcholine、以高流量純氧過度換氣並裝上活性碳過濾器，儘速給予 dantrolene 抑制肌漿網（RYR1）鈣離子釋放，同時主動降溫、處理高血鉀與心律不整；EtCO₂ 與體溫隨之下降。', textEn: 'Stop volatile agents and succinylcholine at once, hyperventilate with high-flow oxygen, fit activated-charcoal filters and give dantrolene as soon as possible to block calcium release from the sarcoplasmic reticulum (RYR1), while actively cooling and treating hyperkalaemia and arrhythmias; EtCO₂ and temperature then fall.' },
    lipid: { zh: '脂肪乳劑（原則）', en: 'Lipid emulsion (principle)', text: '局部麻醉劑全身毒性：停止注射、呼救、維持氣道與氧合，以 benzodiazepine 控制抽搐；出現心血管毒性時給 20% 脂肪乳劑作為「脂質匯」吸附脂溶性局麻藥，心跳停止時延長 CPR，並避免 vasopressin、鈣通道阻斷劑與大量腎上腺素。', textEn: 'In local anaesthetic systemic toxicity, stop injecting, call for help, secure the airway and oxygenation and treat seizures with a benzodiazepine; for cardiovascular toxicity give 20% lipid emulsion as a "lipid sink" for the lipophilic drug, continue CPR for longer in arrest, and avoid vasopressin, calcium-channel blockers and large doses of adrenaline.' }
  };
  const monView = scen => ({ id: 'monitor', zh: '麻醉監測儀', en: 'Anaesthetic monitor', mod: 'MON', hdr: 'ANAESTHETIC MONITOR · SCENARIO', p: P('發生後時間', 'Minutes since onset', 0, 20, 8, ' min', { normal: 0, step: .5 }), draw: (g, s) => monitor(g, s, scen), anim: true });
  const AN_CONDS = [
    { id: 'capnography', zh: '二氧化碳波形判讀', en: 'Capnography interpretation', rx: ['reposition'], views: [{ id: 'capno', zh: '二氧化碳波形', en: 'Capnogram', mod: 'CAPNO', hdr: 'MAINSTREAM CAPNOGRAPHY · 12 s SWEEP', p: sev('嚴重度', 'Severity'), draw: capno, anim: true, ui: s => CAP_PAT.map(([id, zh, en]) => ({ id, zh, en, active: (s.x.pat || 'bronch') === id })), onUi: (id, s) => { s.x.pat = id; } }],
      f: '正常波形分四相：I 相吸氣基線為 0、II 相呼氣上升支、III 相肺泡平台（EtCO₂ 約 35–45 mmHg）、0 相吸氣下降支；插管後持續出現波形才確認在氣管內，食道插管只有幾個漸小的波形後變成直線。支氣管痙攣使 II 相變緩、III 相陡升成「鯊魚鰭」，基線升高代表再吸入，平台上的凹陷（箭毒裂隙）代表自發呼吸。波形突然消失要想到斷線、管路阻塞或心跳停止。', fEn: 'A normal capnogram has four phases: phase I inspiratory baseline at zero, phase II expiratory upstroke, phase III alveolar plateau (EtCO₂ about 35–45 mmHg) and phase 0 inspiratory downstroke; a sustained waveform after intubation confirms tracheal placement, whereas oesophageal intubation gives a few shrinking waves and then a flat line. Bronchospasm slows phase II and steepens phase III into a "shark fin", a raised baseline means rebreathing, and a notch in the plateau (curare cleft) means spontaneous effort. Sudden loss of the waveform points to disconnection, obstruction or cardiac arrest.' },
    { id: 'airway', zh: '困難氣道評估', en: 'Difficult airway assessment', rx: ['burp', 'vl'], views: [{ id: 'laryngo', zh: '直接喉鏡', en: 'Direct laryngoscopy', mod: 'LARY', hdr: 'LARYNGOSCOPY · MACINTOSH 3', p: P('Cormack–Lehane 分級', 'Cormack–Lehane grade', 1, 4, 3, '', { step: .1, normal: 1, fmt: v => 'CL ' + v.toFixed(1) }), draw: laryngoscopy }, { id: 'mallampati', zh: 'Mallampati 分級', en: 'Mallampati class', mod: 'AIR', hdr: 'MALLAMPATI · SITTING, TONGUE OUT', p: P('Mallampati 分級', 'Mallampati class', 1, 4, 3, '', { step: .1, normal: 1, fmt: v => rom(v) }), draw: mallampati }],
      f: 'Mallampati 在病人坐姿、張口伸舌時觀察：I 級見軟顎、咽門柱與懸雍垂，II 級見軟顎與懸雍垂，III 級只見軟顎與懸雍垂基部，IV 級只見硬顎。Cormack–Lehane 描述直接喉鏡所見：1 級整個聲門、2 級部分聲門或只見杓狀軟骨、3 級只見會厭、4 級連會厭都看不到。單一指標預測力有限，需合併張口度、甲頦距離與頸部活動度評估。', fEn: 'Mallampati class is judged with the patient sitting, mouth open and tongue out: class I shows soft palate, pillars and uvula, II soft palate and uvula, III only the soft palate and base of the uvula, IV only the hard palate. Cormack–Lehane describes the view at direct laryngoscopy: grade 1 the whole glottis, 2 part of the glottis or only the arytenoids, 3 only the epiglottis, 4 not even the epiglottis. No single sign predicts well, so mouth opening, thyromental distance and neck movement are assessed together.' },
    { id: 'nmb', zh: '殘餘神經肌肉阻斷', en: 'Residual neuromuscular block', rx: ['neostigmine', 'sugammadex'], views: [{ id: 'tof', zh: '四連刺激監測', en: 'Train-of-four monitor', mod: 'TOF', hdr: 'QUANTITATIVE TOF · ADDUCTOR POLLICIS', p: P('阻斷深度', 'Depth of block', 0, 100, 30, '%', { normal: 0 }), draw: tofView }],
      f: '四連刺激以 2 Hz 刺激尺神經四次並觀察拇內收肌：非去極化肌鬆劑造成「衰減」，第四次與第一次反應的比值即 TOF 比值；阻斷加深時 T4 先消失、最後 T1 也消失，此時改以強直後計數（PTC）評估深度。拔管前需定量量測 TOF 比值 ≥0.9，因為目視或觸感無法偵測 0.4 以上的衰減，而殘餘阻斷會增加吸入與術後肺部併發症。', fEn: 'Train-of-four stimulates the ulnar nerve four times at 2 Hz and watches adductor pollicis: non-depolarising blockers cause "fade", and the fourth-to-first response is the TOF ratio; as block deepens T4 vanishes first and finally T1, after which the post-tetanic count gauges depth. Extubation requires a quantitatively measured TOF ratio of 0.9 or more, because fade above 0.4 cannot be detected by sight or feel and residual block increases aspiration and postoperative pulmonary complications.' },
    { id: 'induction-hypotension', zh: '麻醉誘導後低血壓', en: 'Post-induction hypotension', rx: ['vasopressor'], views: [monView('hypot')],
      f: '靜脈誘導藥（如 propofol）造成血管擴張與心肌抑制，加上插管後刺激減少，數分鐘內平均動脈壓下降；高齡、低血容、心衰與使用 ACE 抑制劑者風險較高。平均動脈壓 <65 mmHg 即使時間很短也與急性腎損傷及心肌損傷相關，處理要快。麻醉深度指數 <40 提示麻醉過深。', fEn: 'IV induction agents such as propofol vasodilate and depress the myocardium, and with the lull after intubation the mean arterial pressure falls within minutes; age, hypovolaemia, heart failure and ACE inhibitors raise the risk. Even brief periods below a mean of 65 mmHg are linked to acute kidney and myocardial injury, so treatment must be prompt. A processed-EEG index below about 40 suggests excessive depth.' },
    { id: 'anaphylaxis', zh: '術中過敏性休克', en: 'Perioperative anaphylaxis', rx: ['adrenaline'], views: [monView('anaph')],
      f: '常見誘因為抗生素、神經肌肉阻斷劑、chlorhexidine 與乳膠，通常在給藥數分鐘內發生。全身麻醉下皮疹常被鋪單遮住，最早的線索是突發低血壓、心搏過速、氣道壓上升與支氣管痙攣（鯊魚鰭波形），心輸出下降使 EtCO₂ 驟降。處理不可延誤：停藥、呼救、給腎上腺素與輸液。', fEn: 'Common triggers are antibiotics, neuromuscular blockers, chlorhexidine and latex, usually within minutes of exposure. Under general anaesthesia the rash is often hidden by drapes, so the first clues are sudden hypotension, tachycardia, rising airway pressure and bronchospasm (shark-fin capnogram), while falling cardiac output drops EtCO₂ sharply. Treatment must not wait: stop the drug, call for help, give adrenaline and fluid.' },
    { id: 'mh', zh: '惡性高熱', en: 'Malignant hyperthermia', rx: ['dantrolene'], views: [monView('mh')],
      f: '帶有 RYR1 等基因變異者接觸揮發性麻醉劑或 succinylcholine 後，骨骼肌鈣離子失控釋放造成高代謝危機。最早的徵象是增加換氣仍無法解釋、持續上升的 EtCO₂，接著心搏過速、咬肌或全身僵直、混合性酸中毒、高血鉀與肌球蛋白尿；體溫上升往往較晚。及早給予 dantrolene 使死亡率由 >70% 降到 <5%。', fEn: 'In people with RYR1 (or related) variants, volatile agents or succinylcholine trigger uncontrolled calcium release in skeletal muscle and a hypermetabolic crisis. The earliest sign is an EtCO₂ that keeps rising despite increased ventilation, followed by tachycardia, masseter or generalised rigidity, mixed acidosis, hyperkalaemia and myoglobinuria, while temperature often rises late. Early dantrolene has cut mortality from over 70% to under 5%.' },
    { id: 'last', zh: '局部麻醉劑全身毒性（LAST）', en: 'Local anaesthetic systemic toxicity', rx: ['lipid'], views: [monView('last')],
      f: '誤入血管或吸收過量的局麻藥會阻斷心肌與中樞神經的鈉離子通道。典型順序為口周麻木、金屬味、耳鳴、躁動到抽搐，接著心血管抑制：QRS 變寬、心搏過緩、心室心律不整、低血壓甚至心跳停止，其中 bupivacaine 的心毒性最強。超音波導引、分次回抽注射與限制總量是預防關鍵。', fEn: 'Local anaesthetic injected into a vessel or absorbed in excess blocks sodium channels in the heart and brain. The classic sequence is perioral numbness, metallic taste, tinnitus and agitation progressing to seizures, then cardiovascular depression — QRS widening, bradycardia, ventricular arrhythmias, hypotension and arrest — bupivacaine being the most cardiotoxic. Ultrasound guidance, incremental injection with aspiration and limiting the total amount are the keys to prevention.' }
  ];
  ST.register({ id: 'anesthesiology', zh: '麻醉科', en: 'Anaesthesiology', rx: AN_RX, conds: AN_CONDS });

  // ================================================================ PAIN MEDICINE
  function vertAP(g, cx, y, w, h, bone, edge, tp) {
    rect(g, cx - w / 2, y, w, h, { f: bone, s: edge, lw: 2.5, r: 8 });
    [-1, 1].forEach(sd => { ell(g, cx + sd * w * .33, y + h * .3, w * .09, h * .2, { s: edge, lw: 3 }); if (tp) poly(g, [[cx + sd * w * .45, y + h * .2], [cx + sd * (w * .5 + tp), y + h * .16], [cx + sd * (w * .5 + tp), y + h * .4], [cx + sd * w * .45, y + h * .44]], { f: bone, s: edge, lw: 1 }); });
    shape(g, [[cx - 6, y + h * .45], [cx + 6, y + h * .45], [cx + 4, y + h + 12], [cx, y + h + 18], [cx - 4, y + h + 12]], { f: edge });
  }
  const SPREAD = [['epi', '硬膜外擴散', 'Epidural spread'], ['vasc', '誤入血管', 'Intravascular'], ['it', '誤入脊髓腔', 'Intrathecal']];
  function tfInj(g, s) {
    const c = pal(g), pat = s.normal || s.has('redirect') ? 'epi' : (s.x.spread || 'vasc'), e = (s.normal ? 1.5 : s.v) / 3, inj = s.has('esi') && !s.normal, ok = inj && pat === 'epi', ink = 'rgba(12,12,14,.85)';
    const root = [[378, 262], [398, 292], [420, 330], [446, 374], [470, 410]], rootSub = subPath(root, plen(root) * clamp(.25 + e * (ok ? 1 : .75), .2, 1));
    fluoro(g, true, () => {
      const bone = 'rgba(70,72,74,.30)', edge = 'rgba(35,36,38,.55)';
      rect(g, 292, 20, 56, 380, { f: 'rgba(90,90,90,.08)' });
      [[38, 48], [128, 48], [218, 64]].forEach(([y, tp]) => vertAP(g, 320, y, 150, 72, bone, edge, tp));
      shape(g, [[232, 306], [408, 306], [380, 430], [320, 472], [260, 430]], { f: bone, s: edge, lw: 2.5 }); for (let i = 0; i < 3; i++) [-1, 1].forEach(sd => ell(g, 320 + sd * 40, 330 + i * 36, 9, 7, { s: edge, lw: 2 }));
      [-1, 1].forEach(sd => shape(g, [[320 + sd * 120, 480], [320 + sd * 150, 300], [320 + sd * 214, 200]], { open: true, s: 'rgba(40,40,40,.38)', lw: 12 }));
      line(g, [[560, 92], [378, 262]], '#151515', 2.6); line(g, [[560, 92], [600, 56]], '#151515', 6);
      if (pat === 'epi') { g.save(); g.lineCap = 'round'; g.beginPath(); rootSub.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.strokeStyle = ink; g.lineWidth = 9; g.shadowColor = ink; g.shadowBlur = 6; g.stroke(); g.restore(); ell(g, 354, 252 - 10 * e, 10 + 3 * e, 18 + 36 * e, { f: 'rgba(12,12,14,.6)', blur: 8 }); if (ok) { ell(g, 350, 240, 22, 50 + 40 * e, { f: 'rgba(12,12,14,.28)', blur: 16 }); ell(g, 420, 330, 30, 60, { f: 'rgba(12,12,14,.2)', blur: 16, rot: -.5 }); } }
      if (pat === 'vasc') { const R = rng(31), n = Math.round(2 + 5 * e); for (let i = 0; i < n; i++) { const pts = [[378, 262]]; let x = 378, y = 262; for (let j = 0; j < 7; j++) { x += -6 - R() * 8; y += -14 - R() * 16 + (i % 2 ? 20 : 0); pts.push([x, y]); } shape(g, pts, { open: true, s: `rgba(12,12,14,${.65 - i * .07})`, lw: 1.6 }); } shape(g, [[340, 150], [334, 110], [330, 60], [326, 30]], { open: true, s: 'rgba(12,12,14,.4)', lw: 1.4 }); }
      if (pat === 'it') { const top = 262 - 190 * e, bot = 262 + 130 * e; shape(g, [[290, top], [350, top], [352, bot], [320, bot + 20], [288, bot]], { f: 'rgba(12,12,14,.5)', blur: 6 }); for (let y = 60; y < bot; y += 90) if (y > top) [-1, 1].forEach(sd => ell(g, 320 + sd * 38, y + 40, 9, 6, { f: 'rgba(12,12,14,.5)', rot: sd * .6 })); for (let i = -2; i <= 2; i++) line(g, [[320 + i * 8, top + 10], [320 + i * 9, bot - 10]], 'rgba(220,220,220,.35)', 1.2); }
      if (inj && !ok) { line(g, [[530, 110], [560, 140]], '#d32f2f', 4); line(g, [[560, 110], [530, 140]], '#d32f2f', 4); }
    });
    mbox(g, 396, 36, [[say('顯影劑 ', 'Contrast ') + (e * 3).toFixed(1) + ' mL'], [say('型態：', 'Pattern: ') + say(...SPREAD.find(p => p[0] === pat).slice(1)), pat === 'epi' ? '#9f9' : '#ff8a80']], 232);
    const L = s.L; L(372, 238, 'L5 椎弓根', 'L5 pedicle', 520, 210); L(378, 262, '針尖（安全三角）', 'Needle tip (safe triangle)', 520, 270); L(320, 400, '薦椎', 'Sacrum', 120, 440);
    if (pat === 'epi') L(rootSub[rootSub.length - 1][0], rootSub[rootSub.length - 1][1], ok ? '類固醇隨顯影路徑擴散' : '沿 L5 神經根與硬膜外腔擴散', ok ? 'Steroid follows the confirmed route' : 'Spread along the L5 root and epidural space', 520, 420, c.t);
    if (pat === 'vasc') L(352, 200, '快速消失的細線：血管（可能為根動脈）', 'Thin lines that wash out: vascular (possible radicular artery)', 90, 120, c.a);
    if (pat === 'it') L(320, 220, '均勻雙側、勾出馬尾：蜘蛛膜下腔', 'Smooth, bilateral, outlines the cauda equina: intrathecal', 90, 120, c.a);
    if (inj && !ok) L(545, 125, '停止！型態不對時不可注射', 'Stop — never inject with this pattern', 400, 70, c.a);
  }
  function bodyFig(g, cx, top, hh, col, edge) {
    const B = (u, v) => [cx + u * hh, top + v * hh];
    [-1, 1].forEach(sd => { shape(g, [B(sd * .13, .17), B(sd * .17, .34), B(sd * .19, .5), B(sd * .2, .56), B(sd * .17, .56), B(sd * .16, .5), B(sd * .13, .34), B(sd * .1, .25)], { f: col, s: edge, lw: 1.5 }); shape(g, [B(sd * .012, .54), B(sd * .1, .5), B(sd * .105, .6), B(sd * .075, .72), B(sd * .068, .8), B(sd * .05, .93), B(sd * .075, .985), B(sd * .02, .985), B(sd * .02, .93), B(sd * .028, .8), B(sd * .025, .72), B(sd * .02, .6)], { f: col, s: edge, lw: 1.5 }); });
    shape(g, [B(-.13, .17), B(.13, .17), B(.1, .25), B(.085, .42), B(.1, .5), B(0, .55), B(-.1, .5), B(-.085, .42), B(-.1, .25)], { f: col, s: edge, lw: 1.5 }); rect(g, ...B(-.022, .115), .044 * hh, .06 * hh, { f: col }); ell(g, ...B(0, .065), .05 * hh, .062 * hh, { f: col, s: edge, lw: 1.5 });
    return B;
  }
  function hatch(g, pts, a) { g.save(); poly(g, pts, {}); g.clip(); poly(g, pts, { f: `rgba(220,40,40,${a * .55})` }); for (let x = -480; x < 640; x += 7) line(g, [[x, 0], [x + 480, 480]], `rgba(190,20,20,${.25 + a * .5})`, 1.2); g.restore(); poly(g, pts, { s: `rgba(170,20,20,${.4 + a * .5})`, lw: 1.2 }); }
  const WPI = [['jaw', .03, .1, 0], ['shoulder', .11, .18, 0], ['upper-arm', .155, .27, 0], ['lower-arm', .18, .43, 0], ['upper-leg', .06, .62, 0], ['lower-leg', .05, .82, 0], ['hip', .06, .5, 1]];
  function painMap(g, s, mode) {
    const c = pal(g), k0 = s.normal ? 0 : s.k, red = (s.has('esi') ? .4 : 1) * (s.has('rehab') ? .6 : 1), k = k0 * red, root = s.x.root || 'L5';
    paper(g, '#f5f6f3');
    const F = bodyFig(g, 190, 96, 340, '#e9e2da', '#8b7f76'), Bk = bodyFig(g, 460, 96, 340, '#e9e2da', '#8b7f76');
    mt(g, say('前', 'FRONT'), 190, 450, { a: 'center', s: 11 }); mt(g, say('後', 'BACK'), 460, 450, { a: 'center', s: 11 }); mt(g, say('右', 'R'), 108, 116, { s: 12, w: '700' }); mt(g, say('左', 'L'), 262, 116, { s: 12, w: '700' }); mt(g, say('左', 'L'), 378, 116, { s: 12, w: '700' }); mt(g, say('右', 'R'), 534, 116, { s: 12, w: '700' });
    if (mode === 'radic') {
      const yl = .5 + .5 * Math.max(.05, k), cut = (Bf, pts) => pts.filter(Boolean).map(([u, v]) => Bf(u, Math.min(v, yl)));
      const sdF = 1, sdB = -1, R = {
        L4: [[F, [[sdF * .03, .6], [sdF * .09, .58], [sdF * .07, .7], [sdF * .04, .8], [sdF * .03, .93], [sdF * .02, .95], [sdF * .022, .8], [sdF * .022, .66]]]],
        L5: [[F, [[sdF * .05, .72], [sdF * .074, .72], [sdF * .068, .8], [sdF * .052, .92], [sdF * .045, .985], [sdF * .02, .985], [sdF * .032, .92], [sdF * .042, .8]]], [Bk, [[sdB * .03, .5], [sdB * .1, .5], [sdB * .098, .62], [sdB * .075, .74], [sdB * .045, .7]]]],
        S1: [[Bk, [[sdB * .03, .52], [sdB * .09, .52], [sdB * .07, .74], [sdB * .062, .84], [sdB * .05, .93], [sdB * .06, .985], [sdB * .025, .985], [sdB * .025, .9], [sdB * .028, .74]]], [F, [[sdF * .05, .93], [sdF * .075, .985], [sdF * .058, .985]]]]
      };
      if (k > 0) { hatch(g, [Bk(-.05, .4), Bk(.05, .4), Bk(.06, .48), Bk(-.06, .48)].map(p => p), k * .6); R[root].forEach(([Bf, pts]) => { const pp = cut(Bf, pts); if (pp.length > 2) hatch(g, pp, k); }); }
      ['L4', 'L5', 'S1'].forEach(n => { if (n !== root) R[n].forEach(([Bf, pts]) => poly(g, pts.map(([u, v]) => Bf(u, v)), { s: 'rgba(60,90,160,.25)', lw: 1, dash: [3, 3] })); });
      mbox(g, 14, 38, [[say('神經根 ', 'Root ') + root + ' · NRS ' + (k0 * 8 * red + 1).toFixed(0) + '/10'], [k > .45 ? say('疼痛放射到膝下（神經根痛）', 'Radiates below the knee (radicular)') : say('疼痛侷限於臀部／大腿', 'Confined to buttock / thigh'), k > .45 ? '#b71c1c' : '#1d2b30']], 260);
      const L = s.L, tip = root === 'S1' ? Bk(-.05, Math.min(.9, yl)) : root === 'L5' ? F(.055, Math.min(.88, yl)) : F(.03, Math.min(.86, yl));
      if (k > 0) L(tip[0], tip[1], root + ' 皮節分布', root + ' dermatomal pattern', root === 'S1' ? 560 : 330, 300, c.a); else L(...F(0, .3), s.has('esi') || s.has('rehab') ? '疼痛緩解' : '無疼痛', s.has('esi') || s.has('rehab') ? 'Pain relieved' : 'No pain', 330, 300, c.t);
      L(...Bk(0, .44), '下背痛', 'Low back pain', 560, 120, k > 0 ? c.a : c.n);
    } else {
      const n = s.normal ? 0 : Math.round(s.v * (s.has('rehab') ? .6 : 1)), regs = [];
      WPI.forEach(([id, u, v, back]) => [-1, 1].forEach(sd => regs.push([back ? Bk : F, sd * u, v]))); regs.push([F, 0, .24], [F, 0, .36], [Bk, 0, .14], [Bk, 0, .26], [Bk, 0, .42]);
      const order = [0, 2, 14, 15, 17, 4, 6, 8, 18, 10, 12, 1, 3, 5, 7, 9, 11, 13, 16];
      order.slice(0, n).forEach(i => { const [Bf, u, v] = regs[i], [x, y] = Bf(u, v); g.save(); g.beginPath(); g.ellipse(x, y, 16, 19, 0, 0, TAU); g.clip(); g.fillStyle = 'rgba(220,40,40,.45)'; g.fillRect(x - 30, y - 30, 60, 60); for (let xx = x - 50; xx < x + 50; xx += 6) line(g, [[xx, y - 30], [xx + 30, y + 30]], 'rgba(180,20,20,.6)', 1.1); g.restore(); });
      mbox(g, 14, 38, [['WPI ' + n + '/19 · SSS ' + (n ? Math.min(12, 4 + Math.round(n / 3)) : 0)], [n >= 7 ? say('符合 ACR 2016（≥3 個月）', 'Meets ACR 2016 (≥3 months)') : say('未達標準', 'Criteria not met'), n >= 7 ? '#b71c1c' : '#1d2b30']], 260);
      const L = s.L; if (n) { const [Bf, u, v] = regs[order[0]]; L(...Bf(u, v), '多處、雙側、上下半身', 'Multiple, bilateral, above and below the waist', 330, 300, c.a); } else L(...F(0, .3), s.has('rehab') ? '多模式治療後疼痛區減少' : '無疼痛區', s.has('rehab') ? 'Fewer painful regions after multimodal care' : 'No painful regions', 330, 300, c.t);
      L(...Bk(0, .26), '非皮節分布（中樞敏感化）', 'Not dermatomal (central sensitisation)', 560, 120, c.n);
    }
  }
  const DIARY = {
    radic: { base: w => 7.2 - 2 * sm(0, 24, w), rx: { esi: [3, w => -3 * Math.exp(-(w - 4) / 6) * sm(3, 4, w)], rehab: [2, w => -2.5 * (1 - Math.exp(-(w - 2) / 5)) * (w > 2 ? 1 : 0)] } },
    wide: { base: w => 7 + .8 * Math.sin(w * 1.3), rx: { rehab: [2, w => -3 * (1 - Math.exp(-(w - 2) / 6)) * (w > 2 ? 1 : 0)] } },
    facet: { base: () => 6.6, rx: { mbb: [3, w => -5 * gs(w, 3.2, .18)], rf: [6, w => (-4 + 1.6 * sm(18, 24, w)) * sm(6, 7, w)] } },
    fbss: { base: () => 7.6, rx: { 'scs-trial': [4, w => -4 * sm(4, 4.3, w) * (1 - sm(5.2, 5.6, w))], 'scs-implant': [8, w => -4.2 * sm(8, 9, w)] } }
  };
  function nrsDiary(g, s, kind) {
    const c = pal(g), D = DIARY[kind], wk = s.normal ? 24 : s.v, R = rng(7), X = w => 70 + w / 24 * 530, Y = v => 420 - v / 10 * 340;
    paper(g, '#f6f7f2'); chart(g, 70, 80, 530, 340, { bg: 'rgba(255,255,255,.7)', grid: 'rgba(60,80,70,.2)', nx: 12, ny: 10 });
    for (let w = 0; w <= 24; w += 4) mt(g, w, X(w), 438, { s: 10.5, a: 'center' }); for (let v = 0; v <= 10; v += 2) mt(g, v, 62, Y(v) + 4, { s: 10.5, a: 'right' }); mt(g, say('週', 'weeks'), 600, 456, { s: 10.5, a: 'right' }); mt(g, 'NRS 0–10', 70, 72, { s: 11 });
    const act = Object.keys(D.rx).filter(id => s.has(id)), val = w => s.normal ? 1.4 : clamp(D.base(w) + act.reduce((a, id) => a + D.rx[id][1](w), 0), 0, 10);
    for (let d = 0; d <= wk * 7; d++) { const w = d / 7, v = clamp(val(w) + (R() - .5) * 2.2, 0, 10); ell(g, X(w), Y(v), 2.2, 2.2, { f: 'rgba(30,80,140,.45)' }); }
    g.save(); g.beginPath(); for (let w = 0; w <= wk; w += .1) { const y = Y(val(w)); w ? g.lineTo(X(w), y) : g.moveTo(X(w), y); } g.strokeStyle = '#0d47a1'; g.lineWidth = 2.5; g.stroke(); g.restore();
    line(g, [[X(wk), 80], [X(wk), 420]], 'rgba(0,0,0,.5)', 1, [4, 4]); if (kind === 'fbss') line(g, [[70, Y(3.8)], [600, Y(3.8)]], 'rgba(27,94,32,.6)', 1.5, [6, 4]);
    act.forEach(id => { const w0 = D.rx[id][0]; line(g, [[X(w0), 80], [X(w0), 420]], '#1b5e20', 2, [6, 3]); });
    const L = s.L; L(X(Math.min(wk, 1)), Y(val(Math.min(wk, 1))), s.normal ? '疼痛低而穩定' : '基準疼痛 NRS ' + val(0).toFixed(0), s.normal ? 'Low, stable pain' : 'Baseline NRS ' + val(0).toFixed(0), 140, 110, s.normal ? c.t : c.a);
    act.forEach((id, i) => { const w0 = D.rx[id][0], we = Math.min(wk, w0 + (id === 'mbb' ? .2 : 3)); if (wk >= w0) L(X(we), Y(val(we)), { esi: '注射後數週緩解，之後部分回升', rehab: '數週內逐步改善', mbb: '阻斷後短暫 ≥80% 緩解', rf: '射頻後持續緩解（6–12 個月後可能回升）', 'scs-trial': '試驗期間減輕 ≥50%', 'scs-implant': '植入後持續緩解' }[id], { esi: 'Relief for weeks, then partial return', rehab: 'Gradual improvement over weeks', mbb: 'Brief ≥80% relief after the block', rf: 'Sustained relief (may return after 6–12 months)', 'scs-trial': '≥50% relief during the trial', 'scs-implant': 'Sustained relief after implant' }[id], 330 + i * 10, 140 + i * 40, c.t); });
    if (kind === 'fbss') L(X(20), Y(3.8), '50% 緩解門檻', '50% relief threshold', 470, 380, c.t);
  }
  // Oblique lumbar "Scotty dog": nose = transverse process, eye = pedicle, ear = superior articular process,
  // neck = pars interarticularis, front leg = inferior articular process, body = lamina.
  function scotty(g, x, y, bone, edge) {
    rect(g, x - 74, y - 54, 196, 110, { f: 'rgba(80,80,80,.12)', r: 16 });
    const parts = [[[x - 26, y - 12], [x - 100, y - 14], [x - 104, y + 6], [x - 26, y + 12]], [[x - 20, y - 12], [x - 26, y - 64], [x - 8, y - 68], [x + 4, y - 14]], [[x - 10, y + 16], [x - 16, y + 72], [x + 6, y + 74], [x + 16, y + 18]], [[x + 8, y - 18], [x + 92, y - 22], [x + 98, y + 24], [x + 12, y + 26]], [[x + 88, y - 12], [x + 134, y - 26], [x + 138, y - 8], [x + 96, y + 6]], [[x + 70, y + 20], [x + 64, y + 68], [x + 86, y + 70], [x + 94, y + 20]]];
    parts.forEach(pt => poly(g, pt, { s: edge, lw: 5 })); ell(g, x, y, 24, 20, { s: edge, lw: 5 });
    parts.forEach(pt => poly(g, pt, { f: bone })); ell(g, x, y, 24, 20, { f: bone });
    ell(g, x, y, 12, 10, { s: edge, lw: 3.5 }); line(g, [[x - 8, y + 18], [x + 10, y + 20]], 'rgba(40,40,40,.35)', 2);
  }
  function rfFacet(g, s) {
    const c = pal(g), a = (s.normal ? 0 : s.v) * PI / 180, rf = s.has('rf') && !s.normal, mbb = s.has('mbb') && !s.normal;
    const x = 330, y = 290, nerve = [[x - 106, y - 24], [x - 64, y - 20], [x - 30, y - 16], [x - 22, y + 8], [x - 18, y + 40], [x - 8, y + 76]], tg = nerve[2];
    const dn = Math.atan2(nerve[3][1] - tg[1], nerve[3][0] - tg[0]), da = dn + a, ux = Math.cos(da), uy = Math.sin(da);
    const tip = [tg[0] - ux * 6, tg[1] - uy * 6], ctr = [tip[0] + ux * 28, tip[1] + uy * 28], A = 40, Bh = 19;
    let cov = 0; for (let i = 1; i < nerve.length; i++) for (let t = 0; t < 1; t += .05) { const px = lerp(nerve[i - 1][0], nerve[i][0], t) - ctr[0], py = lerp(nerve[i - 1][1], nerve[i][1], t) - ctr[1], pa = px * ux + py * uy, pb = -px * uy + py * ux; if ((pa / A) ** 2 + (pb / Bh) ** 2 <= 1) cov += Math.hypot(nerve[i][0] - nerve[i - 1][0], nerve[i][1] - nerve[i - 1][1]) * .05; }
    const mm = cov / 6;
    fluoro(g, true, () => {
      const bone = '#a4a7a9', edge = '#55585a'; scotty(g, x, y - 150, bone, edge); scotty(g, x, y, bone, edge);
      if (rf) { ell(g, ctr[0], ctr[1], A, Bh, { f: rgrad(g, ctr[0], ctr[1], 2, A, ['rgba(255,120,40,.75)', 'rgba(255,60,20,.25)']), rot: da, blur: 8 }); }
      else ell(g, ctr[0], ctr[1], A, Bh, { s: 'rgba(255,120,40,.85)', lw: 1.6, rot: da, dash: [5, 4] });
      g.save(); g.beginPath(); nerve.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.strokeStyle = rf ? 'rgba(120,120,120,.8)' : '#f2c200'; g.lineWidth = 3; g.setLineDash(rf ? [3, 3] : [7, 4]); g.stroke(); g.restore();
      if (mbb) ell(g, tg[0], tg[1], 14, 10, { f: 'rgba(12,12,14,.55)', blur: 6 });
      line(g, [tip, [tip[0] + ux * 320, tip[1] + uy * 320]], '#141414', 3); line(g, [tip, [tip[0] + ux * 60, tip[1] + uy * 60]], '#6b6b6b', 3.4);
    });
    mbox(g, 14, 38, [[say('電極與神經夾角 ', 'Electrode–nerve angle ') + Math.round(a * 180 / PI) + '°'], [say('神經覆蓋長度 ', 'Nerve coverage ') + mm.toFixed(1) + ' mm', mm > 6 ? '#9f9' : '#ff8a80']], 250);
    const L = s.L; L(x, y, '「蘇格蘭犬」的眼睛（椎弓根）', '"Scotty dog" eye (pedicle)', 470, 430); L(x - 16, y - 58, '耳朵：上關節突', 'Ear: superior articular process', 120, 120); L(x - 80, y, '鼻子：橫突', 'Nose: transverse process', 90, 440);
    L(tg[0], tg[1], mbb ? '內側支阻斷（局麻藥）：≥80% 緩解？' : '內側支（示意）：上關節突與橫突交界', mbb ? 'Medial branch block (LA): ≥80% relief?' : 'Medial branch (schematic) at the SAP–TP junction', 470, 120, mbb ? c.t : c.w);
    L(ctr[0] + ux * 20, ctr[1] + uy * 20, rf ? '射頻熱凝區（沿電極軸向）' : a < .3 ? '電極與神經平行：燒灼長度足夠' : '夾角過大：熱凝區只碰到一點神經', rf ? 'RF lesion (along the shaft)' : a < .3 ? 'Parallel electrode: enough nerve length' : 'Steep angle: lesion barely touches the nerve', 470, 300, rf || a < .3 ? c.t : c.a);
  }
  function scsXR(g, s) {
    const c = pal(g), lv = s.normal ? 9 : s.v, trial = s.has('scs-trial') && !s.normal, imp = s.has('scs-implant') && !s.normal, vy = n => 40 + (n - 7) * 50;
    film(g, '#202326', '#060708'); soft(g);
    for (let n = 7; n <= 14; n++) { const y = vy(n); rect(g, 262, y, 116, 40, { f: grey(196, .88), s: grey(230, .9), lw: 2, r: 6 }); [-1, 1].forEach(sd => ell(g, 320 + sd * 38, y + 12, 9, 12, { s: grey(235, .9), lw: 2.5 })); shape(g, [[316, y + 20], [324, y + 20], [322, y + 50], [318, y + 50]], { f: grey(220, .7) }); if (n <= 12) [-1, 1].forEach(sd => shape(g, [[320 + sd * 64, y + 10], [320 + sd * 160, y + 4], [320 + sd * 250, y + 60]], { open: true, s: grey(200, .55), lw: 6 })); else [-1, 1].forEach(sd => rect(g, sd > 0 ? 378 : 222, y + 8, 40, 12, { f: grey(195, .8), r: 4 })); txt(g, n <= 12 ? 'T' + n : 'L' + (n - 12), 220, y + 26, { s: 11, c: '#bcd', mono: true, a: 'right' }); }
    const tipY = vy(lv) + 4, entry = vy(13.6);
    [-1, 1].forEach((sd, j) => { const x = 320 + sd * 7; line(g, [[x, tipY], [x + sd * 2, entry]], '#f7f9fb', 2); for (let i = 0; i < 8; i++) rect(g, x - 2.5, tipY + i * 9, 5, 5.5, { f: '#ffffff' }); if (trial && !imp) line(g, [[x + sd * 2, entry], [x + sd * 40, entry + 60], [588, entry + 40 + j * 6]], '#f7f9fb', 1.6); });
    if (!trial && !imp) { line(g, [[330, entry], [372, entry + 90]], '#f7f9fb', 5); }
    if (trial) { rect(g, 560, 400, 56, 30, { f: 'rgba(240,240,240,.85)', r: 4 }); mt(g, 'EXT', 588, 420, { s: 10, a: 'center', c: '#123', sh: false }); }
    if (imp) { [-1, 1].forEach(sd => rect(g, 320 + sd * 9 - 4, entry - 2, 8, 14, { f: '#fff' })); shape(g, [[322, entry + 10], [380, entry + 60], [460, 430], [520, 440]], { open: true, s: '#f7f9fb', lw: 2.4 }); rect(g, 510, 410, 90, 54, { f: grad(g, 510, 410, 600, 464, ['#ffffff', '#cfd6da']), r: 14 }); }
    noise(g, .5, 'overlay', 1.3);
    const L = s.L, lvTxt = (lv <= 12 ? 'T' + Math.floor(lv) : 'L' + Math.floor(lv - 12)); L(328, tipY + 30, '8 極導線（背側硬膜外腔）', '8-contact leads (dorsal epidural space)', 520, 120, c.n); L(320, tipY, '導線尖端 ' + lvTxt + (lv >= 8 && lv <= 11 ? '（背腿痛常用 T8–T11）' : ''), 'Lead tip at ' + lvTxt + (lv >= 8 && lv <= 11 ? ' (T8–T11 typical for back/leg)' : ''), 520, 60, lv >= 8 && lv <= 11 ? c.t : c.w);
    if (!trial && !imp) L(352, entry + 45, 'Tuohy 針（L1–L2 椎板間）', 'Tuohy needle (L1–L2 interlaminar)', 120, 440); if (trial) L(588, 400, '外接試驗刺激器', 'External trial stimulator', 470, 330, c.t); if (imp) L(555, 437, '脈衝產生器（電池）＋固定錨', 'Pulse generator (battery) + anchors', 400, 330, c.t);
  }
  function soft(g) { shape(g, [[150, 20], [490, 20], [560, 240], [520, 470], [120, 470], [80, 240]], { f: grey(96, .55), blur: 30 }); }
  const PM_RX = {
    redirect: { zh: '調整針位', en: 'Redirect the needle', text: '顯影出現快速消失的線狀血管影（最好以即時或數位減影透視確認）或均勻的脊髓腔顯影時，立即停止、不注射類固醇，回撤並重新定位，直到顯影劑沿神經根與硬膜外腔擴散。', textEn: 'If contrast shows thin, rapidly vanishing vascular lines (best confirmed with live or digital subtraction fluoroscopy) or a smooth intrathecal myelogram, stop, inject no steroid, withdraw and reposition until contrast spreads along the nerve root and epidural space.' },
    esi: { zh: '硬膜外類固醇注射', en: 'Epidural steroid injection', text: '確認硬膜外擴散後注入局部麻醉劑與非顆粒性類固醇（經椎間孔途徑首選 dexamethasone 以降低栓塞風險），減輕神經根發炎；對急性神經根痛有短期效果，不適用於單純軸性下背痛。', textEn: 'Once epidural spread is confirmed, local anaesthetic and a non-particulate steroid (dexamethasone preferred transforaminally to reduce embolic risk) are injected to settle nerve-root inflammation; benefit is short-term for acute radicular pain and it is not for axial back pain alone.' },
    rehab: { zh: '多模式治療＋復健', en: 'Multimodal care + rehabilitation', text: '漸進式運動、認知行為治療、睡眠與情緒處理，搭配適當的非鴉片類與神經病變性止痛藥（gabapentinoid、SNRI、三環抗憂鬱劑），目標是功能恢復而非疼痛歸零，並避免長期鴉片類。疼痛日記曲線在數週內慢慢下降。', textEn: 'Graded exercise, cognitive behavioural therapy and attention to sleep and mood, with suitable non-opioid and neuropathic analgesics (gabapentinoids, SNRIs, tricyclics), aim at function rather than zero pain, avoiding long-term opioids. The pain-diary curve falls slowly over weeks.' },
    mbb: { zh: '內側支阻斷（診斷性）', en: 'Medial branch block (diagnostic)', text: '在透視下把少量局部麻醉劑注射到支配小面關節的內側支（上關節突與橫突交界處）；疼痛暫時減輕 ≥80%（常需兩次對照阻斷）即確認為小面關節痛，才進行射頻燒灼。', textEn: 'Under fluoroscopy a small volume of local anaesthetic is placed on the medial branch that supplies the facet joint, at the junction of the superior articular process and transverse process; temporary relief of 80% or more (often confirmed with two blocks) identifies facet pain and selects patients for radiofrequency denervation.' },
    rf: { zh: '射頻神經燒灼', en: 'Radiofrequency denervation', text: '射頻電極加熱到約 80 °C，形成沿電極軸向的橢圓形熱凝區，因此電極需與內側支平行才能燒到足夠長度；神經約 6–12 個月後再生、疼痛可能復發，可重複施作。', textEn: 'The radiofrequency electrode heats to about 80 °C and makes an elliptical lesion along its shaft, so it must lie parallel to the medial branch to coagulate enough length; the nerve regenerates after about 6–12 months and pain may return, when the procedure can be repeated.' },
    'scs-trial': { zh: '脊髓刺激器試驗', en: 'Spinal cord stimulator trial', text: '經皮把 8 極導線放入背側硬膜外腔（背腿痛通常在 T8–T11），外接刺激器試用 5–10 天；疼痛減輕 ≥50% 且功能改善者才永久植入。適用於背部手術後持續疼痛、複雜性區域疼痛症候群與疼痛性神經病變。', textEn: 'Percutaneous 8-contact leads are placed in the dorsal epidural space (usually T8–T11 for back and leg pain) and connected to an external stimulator for 5–10 days; only those with at least 50% relief and better function proceed to a permanent implant. Indications include persistent pain after spinal surgery, complex regional pain syndrome and painful neuropathy.' },
    'scs-implant': { zh: '永久植入（含脈衝產生器）', en: 'Permanent implant (with pulse generator)', text: '試驗成功後重新放置並固定導線，經皮下隧道接到埋在臀部或側腹的脈衝產生器；X 光可見導線、固定錨與電池。之後需定期程式調整，MRI 相容性依產品而定。', textEn: 'After a successful trial the leads are re-placed and anchored, then tunnelled under the skin to a pulse generator in the buttock or flank; the X-ray shows leads, anchors and battery. Regular programming follows, and MRI compatibility depends on the device.' }
  };
  const diaryView = kind => ({ id: 'diary', zh: '疼痛日記（NRS）', en: 'Pain diary (NRS)', mod: 'CH', hdr: 'PAIN DIARY · NRS WEEKLY', p: P('已記錄週數', 'Weeks recorded', 2, 24, 12, ' wk', { normal: 24 }), draw: (g, s) => nrsDiary(g, s, kind) });
  const PM_CONDS = [
    { id: 'epidural-injection', zh: '透視導引經椎間孔注射', en: 'Fluoroscopic transforaminal injection', rx: ['redirect', 'esi'], views: [{ id: 'fluoro', zh: '透視 AP 影像', en: 'Fluoroscopy AP', mod: 'FLUORO', hdr: 'C-ARM AP · LEFT L5 TRANSFORAMINAL', p: P('顯影劑量', 'Contrast volume', .3, 3, 1.5, ' mL', { step: .1, normal: 1.5, fmt: v => v.toFixed(1) + ' mL' }), h: { lr: 'R', lrx: 110 }, draw: tfInj, ui: s => SPREAD.map(([id, zh, en]) => ({ id, zh, en, active: (s.x.spread || 'vasc') === id })), onUi: (id, s) => { s.x.spread = id; } }],
      f: '針尖放在 L5 椎弓根下方的「安全三角」後注射顯影劑，正確的硬膜外擴散會沿神經根向外下方呈管狀，並向內進入硬膜外腔。若出現快速消失的細線則是誤入血管——經椎間孔途徑可能是根動脈，注入顆粒性類固醇可造成脊髓梗塞。均勻、雙側、勾出馬尾神經的顯影表示誤入蜘蛛膜下腔。', fEn: 'With the needle tip in the "safe triangle" below the L5 pedicle, contrast spreading correctly runs as a tube along the nerve root inferolaterally and medially into the epidural space. Thin lines that vanish quickly mean intravascular uptake — transforaminally possibly a radicular artery, where particulate steroid can cause spinal cord infarction. Smooth, bilateral contrast outlining the cauda equina means an intrathecal (subarachnoid) injection.' },
    { id: 'radiculopathy', zh: '腰椎神經根痛', en: 'Lumbar radicular pain', rx: ['esi', 'rehab'], views: [{ id: 'map', zh: '皮節疼痛圖', en: 'Dermatomal pain drawing', mod: 'MAP', hdr: 'PAIN DRAWING · DERMATOMES', p: sev('放射範圍', 'Radiation'), draw: (g, s) => painMap(g, s, 'radic'), ui: s => ['L4', 'L5', 'S1'].map(id => ({ id, zh: id, en: id, active: (s.x.root || 'L5') === id })), onUi: (id, s) => { s.x.root = id; } }, diaryView('radic')],
      f: '椎間盤突出或椎間孔狹窄壓迫神經根，疼痛沿皮節放射到膝下：L4 到大腿前方與小腿內側，L5 到小腿外側、足背與大拇趾，S1 到小腿後方、足外側與足底。檢查對應肌力（L5 伸大拇趾、S1 蹠屈）與反射（L4 膝反射、S1 踝反射）。多數在 6–12 週內自然改善。', fEn: 'A disc herniation or foraminal stenosis compresses the nerve root, and pain radiates below the knee in its dermatome: L4 to the anterior thigh and medial leg, L5 to the lateral leg, dorsum of the foot and big toe, S1 to the calf, lateral foot and sole. Examination matches power (L5 big-toe extension, S1 plantarflexion) and reflexes (L4 knee, S1 ankle). Most improve on their own within 6–12 weeks.' },
    { id: 'widespread', zh: '慢性廣泛性疼痛（纖維肌痛）', en: 'Chronic widespread pain (fibromyalgia)', rx: ['rehab'], views: [{ id: 'map', zh: '廣泛疼痛指數圖', en: 'Widespread pain index map', mod: 'MAP', hdr: 'PAIN DRAWING · WPI 19 REGIONS', p: P('疼痛區域數（WPI）', 'Painful regions (WPI)', 0, 19, 11, '', { normal: 0 }), draw: (g, s) => painMap(g, s, 'wide') }, diaryView('wide')],
      f: '疼痛不沿皮節分布而遍及全身多處，屬於中樞敏感化（痛覺可塑性）疼痛。ACR 2016 標準：廣泛疼痛指數（WPI，19 區）≥7 且症狀嚴重度 ≥5（或 WPI 4–6 且症狀 ≥9），五大區域至少 4 區疼痛並持續 ≥3 個月，常伴疲倦、睡不好與「腦霧」。影像與抽血多正常，治療以運動與多模式為主。', fEn: 'Pain is not dermatomal but widespread, reflecting central sensitisation (nociplastic pain). ACR 2016 criteria: a widespread pain index (WPI, 19 regions) of 7 or more with a symptom severity of 5 or more (or WPI 4–6 with severity 9 or more), pain in at least 4 of 5 body regions and duration of 3 months or more, often with fatigue, unrefreshing sleep and "fog". Imaging and blood tests are usually normal, and treatment centres on exercise and multimodal care.' },
    { id: 'facet', zh: '腰椎小面關節痛', en: 'Lumbar facet joint pain', rx: ['mbb', 'rf'], views: [{ id: 'rf', zh: '射頻燒灼示意（斜位透視）', en: 'RF denervation (oblique fluoroscopy)', mod: 'FLUORO', hdr: 'C-ARM OBLIQUE · MEDIAL BRANCH RF', p: P('電極與神經夾角', 'Electrode–nerve angle', 0, 90, 55, '°', { normal: 0 }), draw: rfFacet }, diaryView('facet')],
      f: '小面關節退化造成軸性下背痛，伸展、旋轉時加重，可延伸到臀部與大腿但不過膝。每個關節由上下兩支內側支（脊神經後支）支配，斜位透視下內側支走在「蘇格蘭犬」眼睛附近、上關節突與橫突交界處。影像上的退化與疼痛相關性不高，需以診斷性內側支阻斷確認。', fEn: 'Degenerate facet joints cause axial low back pain that is worse on extension and rotation and may spread to the buttock and thigh but not below the knee. Each joint is supplied by two medial branches of the dorsal rami, which on the oblique view run near the "Scotty dog\'s" eye at the junction of superior articular process and transverse process. Imaged degeneration correlates poorly with pain, so diagnostic medial branch blocks confirm it.' },
    { id: 'fbss', zh: '脊椎手術後持續疼痛', en: 'Persistent spinal pain after surgery', rx: ['scs-trial', 'scs-implant'], views: [{ id: 'xr', zh: '胸腰椎 X 光（脊髓刺激器）', en: 'Thoracolumbar X-ray (spinal cord stimulator)', mod: 'XR', hdr: 'THORACOLUMBAR AP · SCS LEADS', p: P('導線尖端位置', 'Lead tip level', 7, 12, 9, '', { step: .1, normal: 9, fmt: v => 'T' + v.toFixed(1) }), h: { lr: 'R', lrx: 30 }, draw: scsXR }, diaryView('fbss')],
      f: '背部手術後仍持續或復發的背痛與腿痛（舊稱「背部手術失敗症候群」，現稱第二型持續性脊椎疼痛症候群），原因包括硬膜外纖維化、鄰近節段退化與中樞敏感化。再次手術的效果常不理想；以神經病變性腿痛為主者可考慮脊髓刺激。X 光可確認導線位置與完整性。', fEn: 'Back and leg pain persisting or recurring after spinal surgery (formerly "failed back surgery syndrome", now persistent spinal pain syndrome type 2) arises from epidural fibrosis, adjacent-segment degeneration and central sensitisation. Repeat surgery often disappoints; when neuropathic leg pain dominates, spinal cord stimulation can be considered. X-rays confirm lead position and integrity.' }
  ];
  ST.register({ id: 'pain-medicine', zh: '疼痛科', en: 'Pain medicine', rx: PM_RX, conds: PM_CONDS });

  // ================================================================ DENTISTRY
  // Radiographic tooth: local crown towards -y, roots +y; o.up flips maxillary teeth.
  function tooth(g, o) {
    const w = o.w, ch = o.ch, rl = o.rl, de = o.de || 196, R = [];
    g.save(); g.translate(o.x, o.y); g.rotate(o.rot || 0); if (o.up) g.scale(1, -1);
    if (o.roots === 2) { R.push([[-w * .46, 0], [-w * .42, rl * .6], [-w * .3, rl], [-w * .18, rl * .62], [-w * .08, 0]]); R.push([[w * .08, 0], [w * .18, rl * .62], [w * .3, rl * .96], [w * .42, rl * .6], [w * .46, 0]]); } else R.push([[-w * .4, 0], [-w * .26, rl * .72], [0, rl], [w * .26, rl * .72], [w * .4, 0]]);
    const apices = R.map(r => r[2]);
    if (!o.noRoot) R.forEach(r => shape(g, r.map(([x, y]) => [x * 1.14, y + 3]), { s: grey(228, .55), lw: 1.4 }));
    if (o.lesion > 0) apices.forEach(([x, y]) => ell(g, x, y + 2, o.lesion, o.lesion * .85, { f: grey(62, .9), blur: 5 }));
    if (!o.noRoot) R.forEach(r => { shape(g, r.map(([x, y]) => [x * 1.07, y + 1.5]), { f: grey(66, .85) }); shape(g, r, { f: grey(de, .95), blur: 2 }); });
    const cr = o.molar ? [[-w / 2, 0], [-w * .54, -ch * .45], [-w * .44, -ch * .92], [-w * .26, -ch], [-w * .06, -ch * .9], [w * .14, -ch], [w * .42, -ch * .93], [w * .54, -ch * .45], [w / 2, 0]] : [[-w / 2, 0], [-w * .55, -ch * .5], [-w * .3, -ch * .97], [0, -ch], [w * .3, -ch * .97], [w * .55, -ch * .5], [w / 2, 0]];
    if (!o.noCrown) { shape(g, cr, { f: grey(240, .97), blur: 2 }); shape(g, cr.map(([x, y]) => [x * .8, y * .82 + 1]), { f: grey(de, .96) }); ell(g, 0, -ch * .3, w * .2, ch * .2, { f: grey(74, .95) }); }
    if (!o.noRoot) apices.forEach(([x, y]) => line(g, [[x * .6, o.noCrown ? 0 : -ch * .15], [x, y - 2]], o.rct ? '#fbfbfb' : grey(74, .9), o.rct ? 3.6 : 2.4));
    if (o.car && !o.noCrown) { const sd = o.car.side, pen = pw(o.car.d, [0, .2, .4, .6, .8, 1], [0, .065, .13, .2, .27, .34]) * w, sx = sd * w * .53; if (pen > 0) { poly(g, [[sx, -ch * .74], [sx - sd * Math.min(pen, w * .13), -ch * .56], [sx, -ch * .38]], { f: grey(52, .92) }); if (pen > w * .13) ell(g, sx - sd * (w * .13 + (pen - w * .13) / 2), -ch * .55, (pen - w * .13) / 2 + 3, ch * .1 + (pen - w * .13) * .5, { f: grey(56, .88), blur: 2 }); } }
    if (o.occ && !o.noCrown) ell(g, 0, -ch * .78, w * .22 * o.occ + 3, ch * .3 * o.occ + 2, { f: grey(50, .92), blur: 2 });
    if (o.fill && !o.noCrown) { const sd = o.fill; poly(g, [[sd * w * .02, -ch * .98], [sd * w * .56, -ch * .9], [sd * w * .56, -ch * .3], [sd * w * .22, -ch * .3], [sd * w * .18, -ch * .66], [sd * w * .02, -ch * .66]], { f: '#fbfbfb', blur: 2 }); }
    if (o.big && !o.noCrown) poly(g, [[-w * .42, -ch * .95], [w * .44, -ch * .95], [w * .3, -ch * .4], [-w * .3, -ch * .4]], { f: o.rct ? '#fbfbfb' : grey(52, .92), blur: 2 });
    g.restore();
  }
  const UT = { w: [23, 20, 23, 23, 23, 34, 32, 30], ch: [34, 30, 33, 28, 27, 27, 26, 25], rl: [44, 40, 54, 44, 42, 40, 38, 34] }, LT = { w: [19, 20, 22, 23, 24, 35, 33, 32], ch: [30, 30, 32, 27, 27, 26, 25, 24], rl: [40, 42, 50, 46, 46, 44, 42, 38] };
  const smile = dx => -28 * (dx / 230) * (dx / 230), tilt = dx => Math.atan(-56 * dx / 52900);
  const toothX = (T, i) => { let x = 0; for (let j = 0; j < i; j++) x += T.w[j] + 2; return x + T.w[i] / 2 + 1; };
  function opg(g, s, o) {
    const c = pal(g); film(g, '#202326', '#060708');
    shape(g, [[40, 40], [600, 40], [630, 300], [560, 470], [80, 470], [10, 300]], { f: grey(90, .5), blur: 40 });
    [-1, 1].forEach(sd => { ell(g, 320 + sd * 130, 118, 72, 40, { f: grey(36, .8), blur: 10 }); line(g, [[320 + sd * 60, 156], [320 + sd * 200, 150]], grey(215, .6), 3); line(g, [[320 + sd * 190, 118], [320 + sd * 300, 124]], grey(200, .55), 10); ell(g, 320 + sd * 242, 104, 18, 14, { f: grey(205, .85), blur: 4 }); });
    ell(g, 320, 104, 52, 52, { f: grey(30, .8), blur: 8 }); line(g, [[320, 60], [320, 150]], grey(210, .6), 3);
    shape(g, [[100, 150], [320, 140], [540, 150], [540, 236], [100, 236]], { f: grey(146, .45), blur: 18 }); line(g, [[110, 152], [320, 144], [530, 152]], grey(225, .55), 5);
    rect(g, 40, 186, 560, 18, { f: 'rgba(0,0,0,.22)' }); rect(g, 298, 250, 44, 230, { f: grey(200, .1) });
    const lower = (dx, dy, ang) => {
      g.save(); g.translate(320 + dx, 300 + dy); g.rotate(ang || 0); g.translate(-320, -300);
      const mand = [[78, 104], [58, 240], [66, 352], [150, 406], [320, 450], [490, 406], [574, 352], [582, 240], [562, 104], [530, 150], [504, 124], [482, 232], [460, 262], [320, 284], [180, 262], [158, 232], [136, 124], [110, 150]];
      shape(g, mand, { f: grey(150, .88), blur: 4 }); g.save(); poly(g, mand, {}); g.clip(); noise(g, .35, 'overlay', .9); g.restore();
      shape(g, [[66, 352], [150, 406], [320, 450], [490, 406], [574, 352]], { open: true, s: grey(225, .85), lw: 6 });
      [-1, 1].forEach(sd => { const cn = [[100, 222], [118, 280], [150, 330], [200, 352], [226, 356]].map(([x, y]) => [sd < 0 ? x : 640 - x, y]); shape(g, cn, { open: true, s: grey(215, .55), lw: 12 }); shape(g, cn, { open: true, s: grey(66, .8), lw: 8 }); });
      for (let i = 0; i < 8; i++) [-1, 1].forEach(sd => { const dx2 = sd * toothX(LT, i), x = 320 + dx2, yy = 290 + smile(dx2); if (i === 7) { const m3 = o.m3; if (m3) { const sideSgn = sd < 0 ? 1 : -1, th = m3.ang * PI / 180 * sideSgn, dep = { A: 0, B: 22, C: 44 }[m3.pg], tx = x + sd * 6, ty = yy + dep; if (m3.ext) { shape(g, [[tx - 16, ty - 22], [tx + 16, ty - 22], [tx + 12, ty + 40], [tx - 12, ty + 40]], { f: grey(96, .9), s: grey(225, .7), lw: 1.5 }); return; } tooth(g, { x: tx, y: ty, w: LT.w[7], ch: LT.ch[7], rl: LT.rl[7], roots: 2, molar: true, rot: tilt(dx2) + th, noCrown: m3.cor }); if (m3.cor) rect(g, tx - 20, ty - 30, 40, 26, { f: grey(150, .9), blur: 4 }); if (m3.pg === 'C' && !m3.cor) { const cn = [[100, 222], [118, 280], [150, 330], [200, 352]].map(([x2, y2]) => [sd < 0 ? x2 : 640 - x2, y2]); shape(g, cn, { open: true, s: 'rgba(40,40,40,.45)', lw: 9 }); } return; } } tooth(g, { x, y: yy, w: LT.w[i], ch: LT.ch[i], rl: LT.rl[i], roots: i >= 5 ? 2 : 1, molar: i >= 5, rot: tilt(dx2) }); });
      g.restore();
    };
    if (o.frac) { const k = o.frac.k, cl = (pts, dx, dy, ang) => { g.save(); poly(g, pts, {}); g.clip(); lower(dx, dy, ang); g.restore(); };
      cl([[0, 0], [262, 0], [262, 250], [248, 480], [0, 480]], 0, 0, 0); cl([[262, 0], [500, 0], [500, 200], [532, 430], [532, 480], [248, 480], [262, 250]], k * 3, k * 10, k * .02); cl([[500, 0], [640, 0], [640, 480], [532, 480], [532, 430], [500, 200]], -k * 6, -k * 16, -k * .04);
      if (k > .02) { line(g, [[262, 250], [257, 296], [264, 344], [255, 398], [252, 452]], grey(28, .95), 1.6 + 4.5 * k); line(g, [[500, 200], [509, 256], [502, 312], [521, 368], [530, 420]], grey(28, .95), 1.6 + 4.5 * k); }
      if (o.frac.orif) { const plate = (pts) => { line(g, pts, '#f7f9fb', 6); pts.forEach(([x, y]) => ell(g, x, y, 3.5, 3.5, { f: '#222', s: '#fff', lw: 1.5 })); }; plate([[478, 236], [496, 232], [516, 230], [536, 232]]); plate([[230, 330], [246, 328], [272, 326], [288, 326]]); plate([[226, 414], [244, 418], [270, 420], [288, 418]]); }
      if (o.frac.imf) { shape(g, [[110, 232], [320, 226], [530, 232]], { open: true, s: '#f7f9fb', lw: 2.5 }); shape(g, [[110, 262], [320, 270], [530, 262]], { open: true, s: '#f7f9fb', lw: 2.5 }); for (let i = 0; i < 9; i++) { const x = 140 + i * 45; line(g, [[x, 230], [x, 266]], 'rgba(247,249,251,.8)', 1.4); } }
    } else lower(0, 0, 0);
    for (let i = 0; i < 8; i++) [-1, 1].forEach(sd => { const dx2 = sd * toothX(UT, i); tooth(g, { x: 320 + dx2, y: 208 + smile(dx2), w: UT.w[i], ch: UT.ch[i], rl: UT.rl[i], roots: i >= 5 ? 2 : 1, molar: i >= 5, up: true, rot: tilt(dx2) - (i === 7 ? sd * .12 : 0) }); });
    noise(g, .5, 'overlay', 1.3);
    return { m3x: [320 - toothX(LT, 7) - 6, 320 + toothX(LT, 7) + 6] };
  }
  const PG = [['A', 'Pell–Gregory A', 'Pell–Gregory A'], ['B', 'Pell–Gregory B', 'Pell–Gregory B'], ['C', 'Pell–Gregory C', 'Pell–Gregory C']];
  const winter = a => a < -8 ? ['遠心傾斜', 'distoangular'] : a < 22 ? ['垂直', 'vertical'] : a < 70 ? ['近心傾斜', 'mesioangular'] : ['水平', 'horizontal'];
  function m3View(g, s) {
    const c = pal(g), ang = s.normal ? 0 : s.v, pg = s.normal ? 'A' : (s.x.pg || 'B'), ext = s.has('extraction') && !s.normal, cor = s.has('coronectomy') && !s.normal && !ext;
    const r = opg(g, s, { m3: { ang: s.normal ? 4 : ang, pg, ext, cor } }), dep = { A: 0, B: 22, C: 44 }[pg], y3 = 290 + smile(toothX(LT, 7)) + dep;
    const wn = winter(ang);
    mbox(g, 386, 38, ext ? [[say('已拔除（拔牙窩）', 'Extracted (socket)')]] : [['Winter: ' + say(wn[0], wn[1]) + ' ' + Math.round(ang) + '°'], ['Pell–Gregory ' + pg + ' · ' + say('第 II 類', 'class II')]], 240);
    const L = s.L; L(320, 152, '硬顎', 'Hard palate', 320, 60); L(190, 118, '上頜竇', 'Maxillary sinus', 150, 64); L(200, 352, '下齒槽神經管', 'Inferior alveolar canal', 90, 440);
    if (!ext) L(r.m3x[0], y3 - 20, cor ? '牙冠切除：牙根留在原位' : (s.normal ? '下顎第三大臼齒' : say(wn[0], wn[1]) + '阻生智齒（48）'), cor ? 'Coronectomy: roots left in situ' : (s.normal ? 'Lower third molar' : 'Impacted 48, ' + wn[1]), 130, 300, cor ? c.t : s.normal ? c.n : c.a); else L(r.m3x[0], y3, '拔牙窩（齒槽硬板勾勒）', 'Socket outlined by lamina dura', 130, 300, c.t);
    if (pg === 'C' && !ext && !cor && !s.normal) L(r.m3x[1], y3 + 30, '牙根變暗、神經管白線中斷 → CBCT', 'Darkened root, interrupted canal line → CBCT', 520, 440, c.a);
  }
  function fracView(g, s) {
    const c = pal(g), orif = s.has('orif') && !s.normal, imf = s.has('imf') && !s.normal, k = s.normal ? 0 : orif ? 0 : imf ? s.k * .3 : s.k;
    opg(g, s, { m3: { ang: 10, pg: 'A' }, frac: s.normal ? null : { k, orif, imf } });
    const L = s.L; L(200, 352, '下齒槽神經管', 'Inferior alveolar canal', 90, 440);
    if (!s.normal) { L(257, 360, k > .1 ? '聯合旁骨折（犬齒區）' : '聯合旁骨折線', k > .1 ? 'Parasymphyseal fracture (canine region)' : 'Parasymphyseal fracture line', 120, 120, orif ? c.t : c.a); L(516, 320, k > .1 ? '對側下顎角骨折：後段被肌肉往上拉' : '下顎角骨折線', k > .1 ? 'Contralateral angle fracture: posterior fragment pulled up' : 'Angle fracture line', 520, 440, orif ? c.t : c.a); if (k > .2) L(470, 250, '咬合平面錯位（階梯）', 'Step in the occlusal plane', 520, 70, c.a); if (orif) L(506, 233, 'Champy 線上的迷你骨板', 'Mini-plates on Champy\'s lines', 520, 70, c.t); if (imf) L(320, 230, '牙弓夾板＋顎間鋼絲', 'Arch bars + intermaxillary wires', 320, 60, c.t); }
    else L(320, 440, '下顎骨下緣連續', 'Continuous lower border', 470, 440, c.n);
  }
  function bone(g, x, y, w, h) { rect(g, x, y, w, h, { f: grey(138, .95) }); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); noise(g, .55, 'overlay', .8); dots(g, 60, x + w / 2, y + h / 2, w / 2, h / 2, 5, 'rgba(90,90,90,.35)', 3, 3); g.restore(); }
  function filmFrame(g, x, y, w, h, fn) { g.fillStyle = '#0d0e10'; g.fillRect(0, 0, W, H); g.save(); rect(g, x, y, w, h, { f: '#2a2c30', r: 18 }); g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, 18); else g.rect(x, y, w, h); g.clip(); fn(); noise(g, .45, 'overlay', 1.2); g.restore(); ell(g, x + 14, y + 14, 4, 4, { f: grey(230, .7) }); }
  function periapical(g, s, mode) {
    const c = pal(g), rct = s.has('rct') && !s.normal, ext = s.has('extraction') && !s.normal, mo = mode === 'follow' ? (s.normal ? 24 : s.v) : 0, s0 = 5, px = 10;
    const size = s.normal ? 0 : mode === 'pa' ? s.v : ext ? 0 : rct ? s0 * Math.exp(-mo / 7) : s0 + mo * .2, lesion = size * px / 2;
    filmFrame(g, 170, 40, 300, 412, () => {
      bone(g, 170, 150, 300, 310); const fill = ext && mode === 'follow' ? clamp(mo / 12, 0, 1) : 0;
      tooth(g, { x: 206, y: 186, w: 70, ch: 64, rl: 128, roots: 1, molar: false });
      tooth(g, { x: 444, y: 192, w: 92, ch: 64, rl: 120, roots: 2, molar: true });
      if (!ext) tooth(g, { x: 320, y: 190, w: 104, ch: 70, rl: 140, roots: 2, molar: true, lesion: lesion > 1 ? lesion : 0, rct, big: !s.normal, de: 192 });
      else { shape(g, [[268, 190], [372, 190], [360, 330], [280, 330]], { f: grey(lerp(80, 136, fill), .95), s: grey(225, lerp(.75, .2, fill)), lw: 2 }); }
      if (rct && !ext) { poly(g, [[270, 122], [370, 122], [366, 186], [274, 186]], { f: '#fbfbfb', blur: 2 }); }
    });
    mbox(g, 486, 40, [[mode === 'follow' ? say('術後 ', 'Month ') + Math.round(mo) + say(' 個月', '') : say('根尖片', 'Periapical film')], [say('根尖透射 ', 'Periapical lesion ') + size.toFixed(1) + ' mm', size > 1 ? '#ff8a80' : '#9f9'], ['PAI ' + (size < .8 ? 1 : size < 2 ? 2 : size < 4 ? 3 : size < 6 ? 4 : 5)]], 146);
    const L = s.L; L(206, 120, '第二小臼齒', 'Second premolar', 90, 70); L(444, 126, '第二大臼齒', 'Second molar', 560, 132);
    if (!ext) { L(320, 150, rct ? '根管充填＋牙冠封閉' : s.normal ? '第一大臼齒' : '深齲到達牙髓', rct ? 'Root filling + coronal seal' : s.normal ? 'First molar' : 'Deep caries into the pulp', 560, 176, rct ? c.t : s.normal ? c.n : c.a); if (size > 1) L(282, 332, rct && mode === 'follow' ? '病灶隨時間縮小（癒合中）' : '根尖透射、齒槽硬板中斷', rct && mode === 'follow' ? 'Lesion shrinking with time (healing)' : 'Periapical radiolucency, lamina dura lost', 90, 430, rct && mode === 'follow' ? c.t : c.a); else L(282, 332, rct ? '齒槽硬板重建、病灶癒合' : '根尖齒槽硬板完整', rct ? 'Lamina dura restored, lesion healed' : 'Intact apical lamina dura', 90, 430, rct ? c.t : c.n); if (rct && mode === 'pa' && size > 1) L(360, 300, '剛完成根管：病灶需 6–24 個月癒合', 'Just treated: healing takes 6–24 months', 560, 380, c.w); }
    else L(320, 260, mode === 'follow' && mo > 6 ? '拔牙窩逐漸被新骨填滿' : '空拔牙窩', mode === 'follow' && mo > 6 ? 'Socket filling with new bone' : 'Empty socket', 560, 380, c.t);
  }
  const ICDAS = d => d < .1 ? ['無', 'sound'] : d < .3 ? ['E1 琺瑯質外半', 'E1 outer enamel'] : d < .5 ? ['E2 琺瑯質內半', 'E2 inner enamel'] : d < .7 ? ['D1 牙本質外三分之一', 'D1 outer third of dentine'] : d < .9 ? ['D2 牙本質中三分之一', 'D2 middle third of dentine'] : ['D3 牙本質內三分之一', 'D3 inner third of dentine'];
  function bitewing(g, s) {
    const c = pal(g), d = s.normal ? 0 : s.k, rest = s.has('restoration') && !s.normal;
    filmFrame(g, 56, 66, 528, 352, () => {
      bone(g, 56, 66, 528, 110); bone(g, 56, 316, 528, 110); rect(g, 56, 236, 528, 10, { f: 'rgba(0,0,0,.25)' });
      const up = [[120, 22, 1], [196, 22, 1], [292, 34, 2], [400, 32, 2], [500, 31, 2]], lo = [[124, 23, 1], [200, 23, 1], [298, 35, 2], [406, 33, 2], [506, 32, 2]];
      up.forEach(([x, w, r], i) => tooth(g, { x, y: 176, w: w * 2.9, ch: 58, rl: 90, roots: r, molar: r === 2, up: true, car: i === 2 ? { side: -1, d: .25 } : null }));
      lo.forEach(([x, w, r], i) => tooth(g, { x, y: 312, w: w * 2.9, ch: 60, rl: 90, roots: r, molar: r === 2, car: i === 1 && !rest ? { side: 1, d } : null, fill: i === 1 && rest ? 1 : 0 }));
      [160, 248, 352, 454].forEach(x => { shape(g, [[x - 16, 330], [x, 318 + (s.normal ? 0 : 2)], [x + 16, 330]], { open: true, s: grey(205, .75), lw: 2 }); shape(g, [[x - 16, 158], [x, 170], [x + 16, 158]], { open: true, s: grey(205, .75), lw: 2 }); });
    });
    const ic = ICDAS(d);
    mbox(g, 66, 76, [[rest ? say('已填補（Class II）', 'Restored (class II)') : say('鄰接面齲 ', 'Proximal caries ') + say(ic[0], ic[1]), d >= .5 && !rest ? '#ff8a80' : null]], 260);
    const L = s.L; L(230, 286, rest ? '銀粉／樹脂填補（放射不透）' : d > .05 ? '接觸點下方三角形透射' : '鄰接面（無齲）', rest ? 'Amalgam / composite restoration (radiopaque)' : d > .05 ? 'Triangular radiolucency below the contact point' : 'Proximal surface (sound)', 120, 450, rest ? c.t : d > .05 ? c.a : c.n);
    L(248, 322, '齒槽骨嵴', 'Alveolar crest', 470, 450); L(292, 150, '上顎第一大臼齒近心早期齲（E1）', 'Early E1 lesion, mesial of upper first molar', 470, 50, c.w);
    if (d >= .5 && !rest) L(238, 268, '已進入牙本質：需填補', 'Into dentine: restore', 470, 290, c.a); else if (d > .05 && !rest) L(238, 268, s.has('fluoride') ? '氟化物再礦化：影像不會立刻改變' : '只在琺瑯質：先再礦化', s.has('fluoride') ? 'Remineralising: no immediate change' : 'Enamel only: remineralise first', 470, 290, c.w);
  }
  function perioChart(g, s) {
    const c = pal(g), p = s.normal ? 5 : s.v, srp = s.has('srp') && !s.normal, R = rng(13);
    const cej = 130, rootL = 136, crest = cej + 14 + p / 100 * rootL;
    paper(g, '#f6f7f2'); g._light = false; g.fillStyle = '#0d0e10'; g.fillRect(0, 0, W, 286);
    g.save(); rect(g, 50, 40, 540, 232, { f: '#2a2c30', r: 14 }); g.beginPath(); g.rect(50, 40, 540, 232); g.clip(); bone(g, 50, crest, 540, 260);
    [[130, 28], [240, 30], [370, 40], [500, 38]].forEach(([x, w], i) => { tooth(g, { x, y: cej, w: w * 2.4, ch: 56, rl: rootL, roots: i >= 2 ? 2 : 1, molar: i >= 2 }); if (!srp && p > 15) [-1, 1].forEach(sd => ell(g, x + sd * w * 1.25, crest - 8, 4, 7, { f: grey(232, .9) })); });
    if (p > 30) poly(g, [[300, crest], [318, crest + 34], [334, crest]], { f: grey(60, .9) }); noise(g, .45, 'overlay', 1.2); g.restore();
    rect(g, 50, 296, 540, 150, { f: 'rgba(255,255,255,.75)', s: '#8a9a90', lw: 1 }); const gm = 316;
    for (let mm = 0; mm <= 10; mm += 1) line(g, [[50, gm + mm * 12], [590, gm + mm * 12]], mm === 3 || mm === 5 ? 'rgba(200,80,60,.5)' : 'rgba(80,110,95,.18)', 1); mt(g, '3', 46, gm + 40, { s: 9.5, a: 'right', c: '#555', sh: false }); mt(g, '5', 46, gm + 64, { s: 9.5, a: 'right', c: '#555', sh: false });
    let maxP = 0; [130, 240, 370, 500].forEach((x, ti) => [-26, 0, 26].forEach((o, j) => { const base = 2 + p / 100 * 9 + (j !== 1 ? 1 : 0) + (ti === 2 && j === 0 && p > 30 ? 2 : 0) + (R() - .5), ppd = Math.max(2, Math.round(srp ? base - (base > 4 ? 2 : 1) : base)); maxP = Math.max(maxP, ppd); rect(g, x + o - 6, gm, 12, ppd * 12, { f: ppd >= 5 ? '#e53935' : ppd >= 4 ? '#fb8c00' : '#43a047' }); mt(g, ppd, x + o, gm - 5, { s: 10, a: 'center', c: '#223', sh: false }); if (!srp && p > 10 && R() > .3) ell(g, x + o, gm + ppd * 12 + 6, 3.5, 3.5, { f: '#d50000' }); }));
    const st = p < 15 ? 'I' : p < 33 ? 'II' : p < 55 ? 'III' : 'IV';
    txt(g, say('牙周炎第 ', 'Periodontitis stage ') + st + say(' 期', '') + ' · ' + say('骨喪失 ', 'bone loss ') + Math.round(p) + '%', 60, 64, { s: 14, w: '700', c: p < 15 ? '#9f9' : '#ffd27a' });
    const L = s.L; L(300, crest + 4, p > 30 ? '垂直型骨缺損' : '齒槽骨嵴', p > 30 ? 'Vertical (angular) defect' : 'Alveolar crest', 470, 90, p > 30 ? c.a : c.n); if (!srp && p > 15) L(130 + 28 * 1.25, crest - 8, '鄰接面牙結石', 'Interproximal calculus', 120, 120, c.a);
    L(370 - 26, gm + 30, srp ? '治療後囊袋變淺、不再出血（骨不會長回）' : '探測深度（紅點 = 探診出血）', srp ? 'Shallower pockets, no bleeding (bone does not regrow)' : 'Probing depths (red dot = bleeding on probing)', 470, 440, srp ? c.t : c.n);
  }
  function cbct(g, s) {
    const c = pal(g), h0 = s.normal ? 14 : s.v, gr = s.has('graft') && !s.normal, imp = s.has('implant') && !s.normal, h = h0 + (gr ? 3 : 0), px = 16, cy = 362, ctop = cy - 14, crest = ctop - h * px, wdt = lerp(4, 9, clamp((h0 - 4) / 12, 0, 1)) + (gr ? 2 : 0), Lm = clamp(h - 2, 6, 13), safe = h - 2 >= 6;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.save(); g.beginPath(); g.rect(40, 36, 560, 412); g.clip(); g.fillStyle = '#121212'; g.fillRect(0, 0, W, H); noise(g, .5, 'overlay', 1.6);
    shape(g, [[150, 60], [260, 50], [230, 200], [200, 440], [60, 440], [60, 60]], { f: grey(66, .9), blur: 14 }); shape(g, [[400, 120], [560, 100], [580, 440], [420, 440], [440, 260]], { f: grey(74, .9), blur: 14 });
    const bw = wdt * px / 2, outline = [[320 - bw, crest], [320 + bw, crest], [320 + bw + 40, crest + 90], [320 + 92, cy - 30], [320 + 74, cy + 20], [320 + 96, 432], [320 - 96, 432], [320 - 104, cy], [320 - bw - 50, crest + 110]];
    shape(g, outline, { f: grey(118, .95), blur: 3 }); g.save(); poly(g, outline, {}); g.clip(); noise(g, .6, 'overlay', .7); dots(g, 70, 320, (crest + 432) / 2, 90, (432 - crest) / 2, 4, 'rgba(60,60,60,.45)', 5, 2); g.restore(); shape(g, outline, { s: grey(228, .95), lw: 6 });
    if (gr) dots(g, 40, 320, crest + 18, bw + 10, 22, 3.5, 'rgba(240,240,240,.85)', 6);
    ell(g, 330, cy, 15, 14, { f: grey(36, .95), s: grey(225, .9), lw: 2.5 });
    rect(g, 260, ctop - 2 * px, 140, 2 * px, { f: 'rgba(255,60,60,.25)' });
    const iw = 4.1 * px / 2, il = (safe ? Lm : 6) * px; if (imp) { rect(g, 320 - iw, crest - 6, iw * 2, il, { f: grad(g, 320 - iw, 0, 320 + iw, 0, ['#9ea6ab', '#ffffff', '#9ea6ab']), r: 6 }); for (let y = crest + 6; y < crest + il - 6; y += 9) { line(g, [[320 - iw - 3, y], [320 - iw + 3, y + 4]], '#fff', 2); line(g, [[320 + iw + 3, y], [320 + iw - 3, y + 4]], '#fff', 2); } } else rect(g, 320 - iw, crest - 6, iw * 2, il, { s: '#4dff8f', lw: 1.5, dash: [5, 4], r: 6 });
    g.restore(); rect(g, 40, 36, 560, 412, { s: 'rgba(255,255,255,.15)', lw: 1 });
    line(g, [[230, crest], [230, ctop]], '#ffe14d', 1.6, [4, 3]); cal(g, [230, crest], [230, ctop]); cal(g, [320 - bw - 8, crest + 2 * px], [320 + bw + 8, crest + 2 * px]);
    mbox(g, 50, 46, [[say('可用骨高度 ', 'Available height ') + h.toFixed(1) + ' mm', h < 8 ? '#ff8a80' : null], [say('骨脊寬度 ', 'Ridge width ') + wdt.toFixed(1) + ' mm', wdt < 6 ? '#ff8a80' : null], [say('植體 ', 'Implant ') + '4.1 × ' + (safe ? Lm : 6).toFixed(0) + ' mm' + (safe ? '' : say('（侵犯安全距離）', ' (breaches margin)')), safe ? '#9f9' : '#ff8a80']], 270);
    const L = s.L; L(330, cy, '下齒槽神經管', 'Inferior alveolar canal', 470, 408); L(320 + 80, cy - 10, '舌側凹陷（避免穿出）', 'Lingual concavity (avoid perforation)', 560, 300, c.w); L(320, ctop - px, '2 mm 安全區', '2 mm safety zone', 470, 380, '#ff8a80');
    L(320, crest + 8, imp ? (Lm <= 8 ? '短植體保留安全距離' : '植體已植入') : gr ? '植骨後骨脊加寬加高' : '預定植體位置', imp ? (Lm <= 8 ? 'Short implant keeps the margin' : 'Implant placed') : gr ? 'Ridge widened and heightened by graft' : 'Planned implant', 470, 90, imp || gr ? c.t : c.n);
  }
  const ORAL = [['trauma', '創傷性潰瘍', 'Traumatic ulcer'], ['leuko', '白斑症', 'Leukoplakia'], ['erythro', '紅斑症', 'Erythroplakia'], ['scc', '鱗狀細胞癌', 'Squamous cell carcinoma']];
  function oralPhoto(g, s) {
    const c = pal(g), ty = s.normal ? null : (s.x.oral || 'leuko'), rv = s.has('review') && !s.normal, bx = s.has('biopsy') && !s.normal, mm = s.normal ? 0 : s.v * (rv && ty === 'leuko' ? .75 : 1) * (rv && ty === 'trauma' ? 0 : 1), r = mm * 3.2, lx = 432, ly = 262, R = rng(51);
    g.fillStyle = '#050505'; g.fillRect(0, 0, W, H); g.save(); g.beginPath(); g.arc(320, 250, 214, 0, TAU); g.clip();
    g.fillStyle = rgrad(g, 320, 250, 30, 280, ['#b9555a', '#6a1f24']); g.fillRect(0, 0, W, H);
    ell(g, 330, 270, 190, 150, { f: rgrad(g, 300, 230, 20, 230, ['#f0a29a', '#d9766f', '#b5524d']), blur: 10 }); for (let i = 0; i < 380; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 170; ell(g, 330 + Math.cos(a) * d, 270 + Math.sin(a) * d * .78, 1.6, 1.4, { f: 'rgba(255,210,205,.45)' }); }
    line(g, [[230, 270], [400, 266]], 'rgba(140,50,50,.35)', 4);
    shape(g, [[380, 30], [520, 90], [600, 250], [560, 430], [660, 440], [660, 20]], { f: '#c25a5a', blur: 8 });
    for (let i = 0; i < 6; i++) { const a = -1.15 + i * .36, tx = 320 + Math.cos(a) * 200, ty2 = 250 + Math.sin(a) * 196; g.save(); g.translate(tx, ty2); g.rotate(a + PI / 2); rect(g, -23, -15, 46, 30, { f: grad(g, 0, -15, 0, 15, ['#fffdf6', '#e4dbc8']), s: 'rgba(120,100,80,.35)', lw: 1, r: 9 }); ell(g, -8, -6, 8, 3, { f: 'rgba(255,255,255,.6)', blur: 3 }); g.restore(); }
    if (ty === 'trauma' && !rv) poly(g, [[500, 230], [466, 250], [500, 262]], { f: '#fbf7ee', s: 'rgba(120,100,80,.5)', lw: 1 });
    if (r > 0) {
      if (ty === 'trauma') { ell(g, lx, ly, r + 8, r * .7 + 7, { f: 'rgba(220,60,60,.6)', blur: 8 }); ell(g, lx, ly, r, r * .7, { f: rgrad(g, lx, ly, 2, r, ['#f4ead0', '#e6d7a8']), blur: 2 }); }
      if (ty === 'leuko') { const pts = ring(lx, ly, r, 14).map(([x, y]) => [x + (R() - .5) * r * .3, y + (R() - .5) * r * .2]); shape(g, pts, { f: 'rgba(246,244,238,.92)', blur: 3 }); if (s.k > .5) dots(g, Math.round(s.k * 14), lx, ly, r * .8, r * .7, 3, 'rgba(210,60,60,.75)', 7); dots(g, 18, lx, ly, r * .8, r * .7, 2.2, 'rgba(225,220,210,.9)', 9); }
      if (ty === 'erythro') { shape(g, ring(lx, ly, r, 12).map(([x, y]) => [x + (R() - .5) * r * .25, y + (R() - .5) * r * .2]), { f: rgrad(g, lx, ly, 2, r, ['#d8202a', '#b0141d']), blur: 4 }); dots(g, 30, lx, ly, r * .8, r * .7, 1.5, 'rgba(255,140,140,.5)', 4); }
      if (ty === 'scc') { ell(g, lx, ly, r + 10, r * .8 + 8, { f: rgrad(g, lx, ly, r * .6, r + 12, ['#f2c6bd', '#d98d86']), blur: 4 }); ell(g, lx, ly, r * .75, r * .58, { f: rgrad(g, lx, ly, 2, r, ['#8a6a4a', '#d8c89a', '#a84a44']) }); dots(g, 10, lx, ly, r * .5, r * .4, 3, 'rgba(70,40,20,.6)', 11); }
    }
    if (bx && r > 0) for (let i = 0; i < 3; i++) { const x = lx - r * .6 + i * r * .5, y = ly + r * .55; line(g, [[x - 5, y - 5], [x + 5, y + 5]], '#151515', 2); line(g, [[x + 5, y - 5], [x - 5, y + 5]], '#151515', 2); }
    ell(g, 260, 190, 60, 18, { f: 'rgba(255,255,255,.28)', rot: -.3, blur: 14 }); g.fillStyle = rgrad(g, 320, 250, 150, 214, ['rgba(0,0,0,0)', 'rgba(0,0,0,.55)']); g.fillRect(0, 0, W, H); g.restore(); ell(g, 320, 250, 214, 214, { s: '#1b1b1b', lw: 6 });
    const L = s.L; L(300, 300, '舌背', 'Dorsum of tongue', 90, 440); L(450, 120, '下顎牙齒', 'Lower teeth', 560, 60);
    const res = { trauma: ['非特異性潰瘍', 'non-specific ulceration'], leuko: [s.k > .5 ? '中度異生' : '輕度異生', s.k > .5 ? 'moderate dysplasia' : 'mild dysplasia'], erythro: ['重度異生／原位癌', 'severe dysplasia / carcinoma in situ'], scc: ['侵襲性鱗狀細胞癌 → 分期', 'invasive SCC → staging'] };
    if (!ty) L(lx, ly, '舌側緣（正常）', 'Lateral border of tongue (normal)', 560, 400);
    else if (ty === 'trauma' && rv) L(lx, ly, '去除尖銳牙尖兩週後已癒合', 'Healed 2 weeks after smoothing the sharp cusp', 560, 400, c.t);
    else { const nm = { trauma: ['創傷性潰瘍（鄰近斷裂尖牙）', 'Traumatic ulcer (next to a broken cusp)'], leuko: [s.k > .5 ? '非均質型白斑（紅白相間）' : '均質型白斑（擦不掉）', s.k > .5 ? 'Non-homogeneous leukoplakia (speckled)' : 'Homogeneous leukoplakia (cannot be wiped off)'], erythro: ['紅斑症：絨布樣鮮紅斑塊', 'Erythroplakia: velvety red patch'], scc: ['硬結、邊緣隆起的潰瘍', 'Indurated ulcer with rolled edges'] }[ty]; L(lx, ly - r * .5, nm[0], nm[1], 560, 400, ty === 'trauma' ? c.w : c.a); if (rv) L(lx + r, ly, '兩週後仍在 → 切片', 'Still present at 2 weeks → biopsy', 560, 200, c.a); if (bx) L(lx, ly + r * .55, '切片：' + res[ty][0], 'Biopsy: ' + res[ty][1], 120, 120, ty === 'trauma' ? c.t : c.a); }
  }
  const DE_RX = {
    extraction: { zh: '手術拔除', en: 'Surgical extraction', text: '翻開黏骨膜瓣、磨除部分骨頭，把牙齒分切後取出並縫合；術前以全景片或 CBCT 評估與下齒槽神經的距離。X 光上留下由齒槽硬板圍成的空拔牙窩，數月後由新骨填滿。', textEn: 'A mucoperiosteal flap is raised, bone removed and the tooth sectioned and delivered before suturing, with the relation to the inferior alveolar nerve assessed beforehand on panoramic film or CBCT. The radiograph shows an empty socket outlined by lamina dura that fills with new bone over months.' },
    coronectomy: { zh: '牙冠切除術', en: 'Coronectomy', text: '牙根與下齒槽神經管緊貼時只切除牙冠，把牙根修到骨嵴下 2–3 mm 並留在原位以避免神經損傷；X 光上牙根留在原處、上方被骨覆蓋，少數日後牙根上移需再處理。', textEn: 'When the roots lie against the inferior alveolar canal, only the crown is removed and the roots trimmed 2–3 mm below the bone crest and left in place to avoid nerve injury; the radiograph shows the roots in situ covered by bone, and a few later migrate and need removal.' },
    rct: { zh: '根管治療', en: 'Root canal treatment', text: '去除感染牙髓、清創並擴大根管，以牙膠緊密充填到根尖附近，再以填補或牙冠封閉；X 光上根管呈白色充填線。根尖病灶隨時間癒合，6–24 個月內透射區縮小、齒槽硬板重建。', textEn: 'Infected pulp is removed, the canals cleaned and shaped, then obturated with gutta-percha close to the apex and sealed with a restoration or crown; the canals appear as white filled lines. The periapical lesion heals over time, shrinking and regaining its lamina dura within 6–24 months.' },
    restoration: { zh: '齲齒填補', en: 'Restoration', text: '移除齲壞牙本質、保留健康結構，以複合樹脂或銀粉恢復外形與接觸點；X 光上填補物呈白色（銀粉最亮）。病灶進入牙本質（D1 以上）或已成洞時才需要填補。', textEn: 'Carious dentine is removed, sound tissue preserved and the tooth rebuilt with composite resin or amalgam, restoring shape and the contact point; the restoration is radiopaque (amalgam brightest). Restoration is needed once the lesion reaches dentine (D1 or deeper) or cavitates.' },
    fluoride: { zh: '氟化物與再礦化', en: 'Fluoride and remineralisation', text: '只在琺瑯質（E1–E2）的鄰接面早期病灶，可用氟漆、牙線與飲食控制使其再礦化或停止進展，並在 6–12 個月後複照；這是非侵入治療，X 光影像不會立刻改變。', textEn: 'Early proximal lesions confined to enamel (E1–E2) can be arrested or remineralised with fluoride varnish, flossing and diet control, with a repeat radiograph in 6–12 months; it is non-invasive and the radiograph does not change at once.' },
    srp: { zh: '牙周治療（齦下刮除與根面整平）', en: 'Periodontal therapy (scaling and root planing)', text: '移除齦上與齦下牙結石與菌斑生物膜並整平根面，加上口腔衛生指導與戒菸；牙周囊袋變淺、探診出血消失，但已流失的齒槽骨不會長回來，第 III–IV 期可能需要再生性手術。', textEn: 'Supra- and subgingival calculus and biofilm are removed and the roots planed, together with oral-hygiene instruction and smoking cessation; pockets shallow and bleeding on probing stops, but lost alveolar bone does not grow back, and stage III–IV disease may need regenerative surgery.' },
    implant: { zh: '植體植入', en: 'Implant placement', text: '在預定位置鑽孔後植入鈦植體，長度選擇需與下齒槽神經管保持至少 2 mm 安全距離，骨高度不足時改用短植體或先骨增生；數月骨整合後再裝上部結構。', textEn: 'A titanium implant is placed in a prepared osteotomy, its length chosen to keep at least 2 mm above the inferior alveolar canal; with insufficient height a short implant or prior bone augmentation is used. After months of osseointegration the restoration is attached.' },
    graft: { zh: '齒槽骨增生', en: 'Ridge augmentation', text: '以自體骨或骨替代材料加再生膜增加齒槽脊的寬度與高度（引導骨再生），4–6 個月後再植牙；CBCT 上可見顆粒狀植骨與加寬的骨脊。', textEn: 'Autogenous bone or a substitute under a barrier membrane widens and heightens the ridge (guided bone regeneration), with implant placement 4–6 months later; CBCT shows the granular graft and a broader ridge.' },
    review: { zh: '去除刺激、兩週複診', en: 'Remove the cause, review at 2 weeks', text: '磨平尖銳牙尖或調整假牙、戒菸與檳榔後兩週複診：創傷性潰瘍此時應已癒合；任何潰瘍、白斑或紅斑在去除原因兩週後仍未消失，都必須切片。', textEn: 'Smooth a sharp cusp or adjust the denture, stop tobacco and betel quid, and review in 2 weeks: a traumatic ulcer should have healed by then, and any ulcer, white or red patch still present 2 weeks after removing the cause must be biopsied.' },
    biopsy: { zh: '切片檢查', en: 'Biopsy', text: '在病灶最可疑處（紅色、硬結或潰瘍邊緣）做切開切片並包含部分正常組織，送病理判斷異生程度或癌化；紅斑症的惡性轉變率遠高於白斑症。', textEn: 'An incisional biopsy is taken from the most suspicious area (red, indurated or ulcer edge) including some normal tissue, and histology grades dysplasia or carcinoma; erythroplakia carries a far higher malignant risk than leukoplakia.' },
    orif: { zh: '開放復位內固定（迷你骨板）', en: 'Open reduction and internal fixation (mini-plates)', text: '經口內切口復位骨折，以鈦迷你骨板沿 Champy 理想固定線固定：下顎角在外斜線上放一片，聯合旁區上下各一片；恢復咬合後可早期張口。', textEn: 'Through intraoral incisions the fracture is reduced and fixed with titanium mini-plates along Champy\'s ideal lines: one on the external oblique ridge at the angle and two (upper and lower) in the parasymphysis; with the occlusion restored, early mouth opening is allowed.' },
    imf: { zh: '顎間固定（牙弓夾板）', en: 'Intermaxillary fixation (arch bars)', text: '以鋼絲把上下牙弓夾板綁在一起，利用咬合把骨折段導回原位；可單獨用於移位小的骨折，或在手術中先建立咬合再上骨板。X 光上牙冠周圍可見金屬夾板與鋼絲。', textEn: 'Upper and lower arch bars are wired together so the occlusion guides the fragments back; used alone for minimally displaced fractures or intra-operatively to set the bite before plating. The radiograph shows metal bars and wires around the crowns.' }
  };
  const DE_CONDS = [
    { id: 'third-molar', zh: '阻生智齒', en: 'Impacted lower third molar', rx: ['extraction', 'coronectomy'], views: [{ id: 'opg', zh: '環口全景 X 光', en: 'Panoramic radiograph', mod: 'OPG', hdr: 'ORTHOPANTOMOGRAM', p: P('Winter 角度', 'Winter angulation', -20, 90, 45, '°', { normal: 4, fmt: v => v + '° · ' + say(...winter(v)) }), h: { lr: 'R', lrx: 22, lry: 64 }, draw: m3View, ui: s => PG.map(([id, zh, en]) => ({ id, zh, en, active: (s.x.pg || 'B') === id })), onUi: (id, s) => { s.x.pg = id; } }],
      f: 'Winter 分類描述智齒長軸與第二大臼齒的角度：近心傾斜（最常見）、垂直、水平與遠心傾斜；Pell–Gregory 以深度（A 與咬合面同高、B 在咬合面與牙頸線之間、C 低於牙頸線）與和下顎枝的關係（I–III 類）分級。全景片上牙根變暗、神經管白線中斷或轉彎、牙根變窄，提示牙根與下齒槽神經關係密切，應再做 CBCT。', fEn: 'Winter\'s classification describes the long axis relative to the second molar: mesioangular (commonest), vertical, horizontal and distoangular; Pell–Gregory grades depth (A level with the occlusal plane, B between occlusal plane and cervical line, C below the cervical line) and ramus relationship (class I–III). Darkening of the root, interruption or diversion of the canal\'s white line and root narrowing on the panoramic film suggest intimate contact with the inferior alveolar nerve, calling for CBCT.' },
    { id: 'periapical', zh: '根尖周炎', en: 'Periapical periodontitis', rx: ['rct', 'extraction'], views: [{ id: 'pa', zh: '根尖片', en: 'Periapical radiograph', mod: 'IOPA', hdr: 'PERIAPICAL · LOWER FIRST MOLAR', p: P('病灶大小', 'Lesion size', 0, 10, 5, ' mm', { step: .5, normal: 0 }), h: { scale: [50, '5 mm'] }, draw: (g, s) => periapical(g, s, 'pa') }, { id: 'follow', zh: '追蹤（時間）', en: 'Follow-up over time', mod: 'IOPA', hdr: 'PERIAPICAL · FOLLOW-UP', p: P('治療後月數', 'Months after treatment', 0, 24, 12, ' mo', { normal: 24 }), h: { scale: [50, '5 mm'] }, draw: (g, s) => periapical(g, s, 'follow') }],
      f: '深齲或裂縫讓細菌進入牙髓，牙髓壞死後感染經根尖孔擴散，在根尖形成肉芽腫或囊腫。根尖片上為根尖周圍界線清楚的透射區，齒槽硬板中斷、牙周膜腔增寬；冷測無反應、叩診痛。根管治療後病灶隨時間逐漸癒合，未治療則持續擴大。', fEn: 'Deep caries or a crack lets bacteria into the pulp; after pulp necrosis the infection spreads through the apical foramen and forms a granuloma or cyst. The periapical film shows a well-defined radiolucency around the apex with loss of lamina dura and a widened ligament space; the tooth does not respond to cold and is tender to percussion. After root canal treatment the lesion gradually heals, whereas untreated it keeps enlarging.' },
    { id: 'caries', zh: '鄰接面齲齒（咬翼片）', en: 'Proximal caries (bitewing)', rx: ['restoration', 'fluoride'], views: [{ id: 'bw', zh: '咬翼片', en: 'Bitewing radiograph', mod: 'BW', hdr: 'BITEWING · RIGHT PREMOLAR–MOLAR', p: sev('病灶深度', 'Lesion depth'), h: { scale: [58, '5 mm'] }, draw: bitewing }],
      f: '咬翼片是發現鄰接面齲齒的最佳 X 光，病灶位於接觸點正下方，在琺瑯質中呈尖端朝向牙本質的三角形透射，到達牙本質後沿琺瑯牙本質交界擴散。放射分級：E1 琺瑯質外半、E2 琺瑯質內半、D1 牙本質外三分之一、D2 中三分之一、D3 內三分之一（接近牙髓）。X 光常低估實際深度。', fEn: 'The bitewing is the best radiograph for proximal caries, which sits just below the contact point as a triangular radiolucency in enamel pointing towards the dentine and then spreads along the enamel–dentine junction. Radiographic grades: E1 outer half of enamel, E2 inner half, D1 outer third of dentine, D2 middle third, D3 inner third near the pulp. Radiographs tend to underestimate the true depth.' },
    { id: 'periodontitis', zh: '牙周炎分期', en: 'Periodontitis staging', rx: ['srp'], views: [{ id: 'chart', zh: 'X 光＋牙周圖表', en: 'Radiograph + periodontal chart', mod: 'PERIO', hdr: 'PERIAPICAL SERIES + 6-POINT CHART (BUCCAL)', p: P('骨喪失（占牙根長）', 'Bone loss (of root length)', 0, 70, 38, '%', { normal: 5 }), draw: perioChart }],
      f: '菌斑引發的慢性發炎破壞牙周韌帶與齒槽骨，形成牙周囊袋（探測深度 ≥4 mm）與臨床附連喪失。2017 年分類以骨喪失占牙根長度分期：I 期 <15%、II 期在牙根冠方三分之一（15–33%）、III 期延伸到中三分之一以上、IV 期再合併大量牙齒喪失與咬合崩壞，並以進展速度分 A–C 級。探診出血代表仍有活動性發炎。', fEn: 'Plaque-driven chronic inflammation destroys the periodontal ligament and alveolar bone, forming pockets (probing depth 4 mm or more) and clinical attachment loss. The 2017 classification stages by bone loss as a share of root length: stage I under 15%, II within the coronal third (15–33%), III into the middle third or beyond, IV adding extensive tooth loss and collapse of the bite, with grades A–C for the rate of progression. Bleeding on probing indicates active inflammation.' },
    { id: 'implant', zh: '植牙部位評估（CBCT）', en: 'Implant site assessment (CBCT)', rx: ['implant', 'graft'], views: [{ id: 'cbct', zh: 'CBCT 橫斷面', en: 'CBCT cross-section', mod: 'CBCT', hdr: 'CBCT CROSS-SECTION · 36 SITE', p: P('神經管上方骨高度', 'Bone height above canal', 4, 16, 9, ' mm', { step: .5, normal: 14 }), h: { scale: [80, '5 mm'] }, draw: cbct }],
      f: '下顎後牙區植牙前以 CBCT 橫斷面量測齒槽脊寬度與下齒槽神經管上方的可用骨高度，並注意舌側凹陷以免穿出舌側皮質傷及血管。植體與神經管需保留至少 2 mm，寬度至少要比植體直徑多 1.5–2 mm 才能保有頰舌側骨壁。拔牙後骨脊會持續吸收變窄。', fEn: 'Before implants in the posterior mandible, CBCT cross-sections measure ridge width and the bone height available above the inferior alveolar canal, and look for a lingual concavity where perforation could injure vessels. At least 2 mm must be kept between implant and canal, and the width should exceed the implant diameter by about 1.5–2 mm to keep buccal and lingual walls. After extraction the ridge keeps resorbing and narrowing.' },
    { id: 'oral-lesion', zh: '口腔黏膜警訊病灶', en: 'Oral mucosal red flags', rx: ['review', 'biopsy'], views: [{ id: 'photo', zh: '口內照片', en: 'Intraoral photograph', mod: 'PHOTO', hdr: 'INTRAORAL · LATERAL BORDER OF TONGUE', p: P('病灶大小', 'Lesion size', 4, 30, 14, ' mm', { normal: 4 }), draw: oralPhoto, ui: s => ORAL.map(([id, zh, en]) => ({ id, zh, en, active: (s.x.oral || 'leuko') === id })), onUi: (id, s) => { s.x.oral = id; } }],
      f: '舌側緣與口底是口腔癌好發處，菸、酒與檳榔是主要危險因子。白斑症是擦不掉、也無法以其他診斷解釋的白色斑塊，非均質型惡性風險較高；紅斑症是絨布樣鮮紅斑塊，常已有重度異生或原位癌。超過兩週不癒合的潰瘍、硬結、邊緣隆起或出血都應轉介切片。', fEn: 'The lateral tongue and floor of mouth are the commonest sites of oral cancer, with tobacco, alcohol and betel quid the main risk factors. Leukoplakia is a white patch that cannot be wiped off or explained by another diagnosis, the non-homogeneous type carrying more risk; erythroplakia is a velvety red patch that often already shows severe dysplasia or carcinoma in situ. An ulcer that fails to heal within two weeks, induration, rolled edges or bleeding warrant referral for biopsy.' },
    { id: 'mandible-fracture', zh: '下顎骨骨折', en: 'Mandible fracture', rx: ['orif', 'imf'], views: [{ id: 'opg', zh: '環口全景 X 光', en: 'Panoramic radiograph', mod: 'OPG', hdr: 'ORTHOPANTOMOGRAM · TRAUMA', p: sev('移位程度', 'Displacement'), h: { lr: 'R', lrx: 22, lry: 64 }, draw: fracView }],
      f: '下顎骨像一個環，常在兩處同時骨折，典型組合是一側下顎角（常經過智齒）加對側聯合旁或犬齒區。全景片見透射的骨折線、下緣階梯與咬合平面錯位，臨床有咬合不正、下唇麻木（下齒槽神經受傷）與口底血腫。咀嚼肌拉力決定骨折是「有利型」或「不利型」，不利型需要固定。', fEn: 'The mandible behaves like a ring and often breaks in two places: typically one angle (often through the third molar) plus the opposite parasymphysis or canine region. The panoramic film shows lucent fracture lines and steps in the lower border and occlusal plane, while clinically there is malocclusion, lower-lip numbness (inferior alveolar nerve injury) and a sublingual haematoma. Muscle pull makes a fracture "favourable" or "unfavourable", and the latter needs fixation.' }
  ];
  ST.register({ id: 'dentistry', zh: '牙科', en: 'Dentistry', rx: DE_RX, conds: DE_CONDS });

  // ================================================================ PATHOLOGY & LABORATORY MEDICINE
  // Wright–Giemsa cells at ~4 px/µm (RBC ≈ 7.5 µm).
  function rbc(g, x, y, r, o) {
    o = o || {}; const rim = o.col || '#d9837a', pale = o.pale == null ? .36 : o.pale;
    if (o.sickle) { g.save(); g.translate(x, y); g.rotate(o.rot || 0); g.beginPath(); g.arc(0, 0, r * 1.15, PI * .1, PI * .9); g.arc(0, -r * .5, r * .95, PI * .8, PI * .2, true); g.closePath(); g.fillStyle = '#c2564e'; g.fill(); g.strokeStyle = 'rgba(120,40,40,.5)'; g.lineWidth = 1; g.stroke(); g.restore(); return; }
    const rx = r * (o.ov || 1), ry = r / (o.ov || 1);
    ell(g, x, y, rx, ry, { f: rgrad(g, x, y, 0, Math.max(rx, ry), pale > .05 ? ['rgba(250,225,220,.75)', 'rgba(244,200,192,.85)', rim] : [o.poly ? '#b8a2c8' : '#d9897f', rim]), s: 'rgba(150,60,55,.45)', lw: .9, rot: o.rot || 0 });
    if (pale > .05) ell(g, x, y, rx * pale, ry * pale, { f: 'rgba(252,236,232,.7)', rot: o.rot || 0 });
    if (o.target) ell(g, x, y, r * .22, r * .22, { f: rim });
    if (o.hj) ell(g, x + r * .4, y - r * .2, 2.2, 2.2, { f: '#4a2672' });
  }
  function wbc(g, x, y, type, R) {
    const nuc = '#4b2a7a', cyto = type === 'eos' ? '#f2b9a6' : type === 'baso' ? '#cdb6d8' : type === 'blast' || type === 'lymph' ? '#a9c0e0' : '#e9cfe0', r = { neut: 24, hyper: 25, lymph: 16, blast: 30, myelo: 27, meta: 25, band: 24, baso: 22, eos: 24, nrbc: 15 }[type];
    if (type !== 'nrbc') ell(g, x, y, r, r * .95, { f: rgrad(g, x - 4, y - 4, 2, r, ['rgba(255,255,255,.4)', cyto]), s: 'rgba(110,70,120,.4)', lw: 1 });
    if (type === 'neut' || type === 'eos' || type === 'myelo' || type === 'meta' || type === 'band') dots(g, type === 'eos' ? 26 : 30, x, y, r * .8, r * .8, type === 'eos' ? 2.2 : 1, type === 'eos' ? '#e05a3a' : 'rgba(150,80,130,.45)', Math.floor(R() * 99));
    if (type === 'neut' || type === 'hyper') { const n = type === 'hyper' ? 6 : 3 + Math.floor(R() * 2), pts = []; for (let i = 0; i < n; i++) { const a = -1.2 + i / (n - 1) * 2.4 + R() * .2; pts.push([x + Math.cos(a) * r * .45, y + Math.sin(a) * r * .45]); } for (let i = 1; i < n; i++) line(g, [pts[i - 1], pts[i]], nuc, 1.4); pts.forEach(([px, py]) => ell(g, px, py, r * .22, r * .18, { f: nuc, rot: R() * 3 })); }
    if (type === 'band') shape(g, [[x - r * .5, y - r * .3], [x, y + r * .35], [x + r * .5, y - r * .3]], { open: true, s: nuc, lw: r * .28 });
    if (type === 'meta') ell(g, x + r * .1, y, r * .5, r * .34, { f: nuc, a0: -1.2, a1: 4.4, rot: .3 });
    if (type === 'myelo') ell(g, x + r * .2, y, r * .52, r * .48, { f: '#5a3a8a' });
    if (type === 'lymph') ell(g, x + 2, y, r * .82, r * .8, { f: '#3f2470' });
    if (type === 'eos') [-1, 1].forEach(sd => ell(g, x + sd * r * .32, y, r * .3, r * .26, { f: nuc }));
    if (type === 'baso') dots(g, 40, x, y, r * .8, r * .8, 2, '#2a1048', Math.floor(R() * 99));
    if (type === 'blast') { ell(g, x + 2, y, r * .82, r * .78, { f: rgrad(g, x, y, 2, r, ['#8a6fb8', '#6a4c9a']) }); for (let i = 0; i < 2; i++) ell(g, x - 4 + i * 10, y - 4 + i * 6, 3.5, 3, { f: 'rgba(200,210,240,.7)' }); if (R() > .4) line(g, [[x - r * .7, y + r * .4], [x - r * .3, y + r * .65]], '#c2185b', 1.8); }
    if (type === 'nrbc') { ell(g, x, y, r, r, { f: '#cf8f92' }); ell(g, x, y, r * .55, r * .55, { f: '#2a1048' }); }
  }
  const SMEAR = {
    iron: { rx: { iron: .15, transfusion: .45 } }, b12: { rx: { b12: .12, transfusion: .5 } }, sickle: { rx: { transfusion: .3 } }, cml: { rx: { tki: .06 } }, blasts: { rx: { induction: .04 } }
  };
  function smear(g, s, kind) {
    const c = pal(g), tf = s.has('transfusion') && !s.normal, f0 = s.normal ? 0 : s.k, eff = Object.keys(SMEAR[kind].rx).filter(id => s.has(id)).reduce((a, id) => a * SMEAR[kind].rx[id], 1), f = f0 * eff, rec = eff < 1 && !s.normal, R = rng(77);
    micro(g, { b0: '#f9eff0', b1: '#ead6d8' }, (cx, cy, r) => {
      const step = kind === 'blasts' && !tf ? 34 + 10 * f : 31; let i = 0;
      for (let yy = cy - r; yy < cy + r; yy += step * .87) for (let xx = cx - r + ((Math.round((yy - cy) / (step * .87)) % 2) ? step / 2 : 0); xx < cx + r; xx += step) {
        i++; const x = xx + (R() - .5) * 9, y = yy + (R() - .5) * 9, a = hsh(i * 7 + 3), b = hsh(i * 13 + 5); if (Math.hypot(x - cx, y - cy) > r - 6 || b < .1) continue;
        const ab = a < f, rr = 14.5 + (R() - .5) * 2;
        if (kind === 'iron' && ab) rbc(g, x, y, rr * .78, { pale: .62, ov: b < .3 ? 2.1 : 1, rot: R() * 3, target: b > .9 });
        else if (kind === 'b12' && ab) rbc(g, x, y, rr * 1.18, { pale: .06, ov: 1.22, rot: R() * 3 });
        else if (kind === 'sickle' && ab) b < .65 ? rbc(g, x, y, rr, { sickle: true, rot: R() * TAU }) : rbc(g, x, y, rr, { target: true, hj: b > .92 });
        else if (rec && (kind === 'iron' || kind === 'b12') && b > .85) rbc(g, x, y, rr * 1.12, { pale: .05, poly: true });
        else rbc(g, x, y, rr, { rot: R() * 3 });
      }
      for (let p = 0; p < (kind === 'cml' ? 30 + f * 40 : kind === 'blasts' ? 14 - f * 12 : 18); p++) { const a = R() * TAU, d = Math.sqrt(R()) * (r - 10); ell(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2.2 + R(), 1.8 + R(), { f: '#7a4a9e' }); }
      const ws = [];
      if (kind === 'cml') { const n = 2 + Math.round(f * 16), types = ['myelo', 'myelo', 'meta', 'band', 'neut', 'baso', 'eos', 'myelo', 'meta', 'neut', 'baso', 'band']; for (let j = 0; j < n; j++) ws.push(f < .08 ? (j ? 'lymph' : 'neut') : types[j % types.length]); }
      else if (kind === 'blasts') { const n = 3 + Math.round(f * 7); for (let j = 0; j < n; j++) ws.push(hsh(j + 1) < f * 1.1 ? 'blast' : j % 2 ? 'lymph' : 'neut'); }
      else { ws.push(kind === 'b12' && f > .25 ? 'hyper' : 'neut', 'lymph'); if (kind === 'sickle' && f > .3) ws.push('nrbc'); }
      ws.forEach((t, j) => { const a = j * 2.39996 + .6, d = (r - 40) * Math.sqrt((j + .5) / Math.max(ws.length, 2)); wbc(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, t, R); });
      s.x.ws = ws;
    });
    const pct = Math.round(f * 100), lab = { iron: ['小球低色素紅血球', 'microcytic hypochromic cells'], b12: ['大卵圓形紅血球', 'macro-ovalocytes'], sickle: ['鐮刀細胞', 'sickle cells'], cml: ['左移顆粒球', 'left-shifted granulocytes'], blasts: ['芽細胞', 'blasts'] }[kind];
    mbox(g, 14, 38, [[say(lab[0], lab[1]) + ' ' + pct + '%', pct > 20 ? '#ff8a80' : null], rec ? [say('治療後', 'after treatment'), '#9f9'] : [say('Wright–Giemsa · 油鏡', 'Wright–Giemsa · oil'), '#9ab']], 240);
    const L = s.L, ws = s.x.ws || [], wpos = j => { const a = j * 2.39996 + .6, d = 172 * Math.sqrt((j + .5) / Math.max(ws.length, 2)); return [320 + Math.cos(a) * d, 252 + Math.sin(a) * d]; };
    L(...wpos(0), { neut: '嗜中性球（3–5 葉）', hyper: '多分葉嗜中性球（≥6 葉）', myelo: '骨髓細胞', meta: '後骨髓細胞', band: '桿狀核', baso: '嗜鹼性球', eos: '嗜酸性球', lymph: '淋巴球', blast: '芽細胞（核仁、Auer 小體）', nrbc: '有核紅血球' }[ws[0]] || '白血球', { neut: 'Neutrophil (3–5 lobes)', hyper: 'Hypersegmented neutrophil (≥6 lobes)', myelo: 'Myelocyte', meta: 'Metamyelocyte', band: 'Band form', baso: 'Basophil', eos: 'Eosinophil', lymph: 'Lymphocyte', blast: 'Blast (nucleoli, Auer rod)', nrbc: 'Nucleated red cell' }[ws[0]] || 'White cell', 470, 70, ws[0] === 'neut' || ws[0] === 'lymph' ? c.n : c.a);
    if (ws.length > 1) L(...wpos(1), ws[1] === 'lymph' ? '淋巴球' : ws[1] === 'blast' ? '芽細胞' : ws[1] === 'neut' ? '嗜中性球' : ws[1] === 'myelo' ? '骨髓細胞' : ws[1] === 'meta' ? '後骨髓細胞' : '白血球', ws[1] === 'lymph' ? 'Lymphocyte' : ws[1] === 'blast' ? 'Blast' : ws[1] === 'neut' ? 'Neutrophil' : ws[1] === 'myelo' ? 'Myelocyte' : ws[1] === 'meta' ? 'Metamyelocyte' : 'White cell', 120, 440);
    L(198, 150, pct > 5 && (kind === 'iron' || kind === 'b12' || kind === 'sickle') ? lab[0] : '正常紅血球（中央淡染 ≈1/3）', pct > 5 && (kind === 'iron' || kind === 'b12' || kind === 'sickle') ? lab[1].replace(/^./, m => m.toUpperCase()) : 'Normal red cells (central pallor ≈1/3)', 90, 112, pct > 5 ? c.a : c.n);
    if (rec && (kind === 'iron' || kind === 'b12')) L(430, 360, '新生的正常紅血球與網狀紅血球（多染性）', 'New normal cells and polychromatic reticulocytes', 470, 440, c.t);
    if (tf && kind === 'blasts') L(430, 360, '輸血補充紅血球，芽細胞仍在', 'Transfused red cells; blasts persist', 470, 440, c.w);
  }
  function histo(g, s) {
    g._light = true; const c = pal(g), k = s.normal ? 0 : s.k, exc = s.has('excise') && !s.normal, R = rng(61), inv = k > .75;
    g.fillStyle = '#f7eef4'; g.fillRect(0, 0, W, H); noise(g, .1, 'multiply', 1.3);
    g.fillStyle = grad(g, 0, 60, 0, 280, ['#f1c6d9', '#e9b0c8']); g.fillRect(30, 64, 580, 210);
    rect(g, 30, 270, 580, 18, { f: '#d77ba3' }); for (let x = 40; x < 600; x += 18) line(g, [[x, 272], [x + 10, 286]], 'rgba(150,40,90,.35)', 2);
    g.fillStyle = grad(g, 0, 288, 0, 450, ['#f3d3e2', '#efdbe6']); g.fillRect(30, 288, 580, 160); for (let i = 0; i < 26; i++) shape(g, [[30 + R() * 580, 300 + R() * 140], [30 + R() * 580, 300 + R() * 140], [30 + R() * 580, 300 + R() * 140]], { open: true, s: 'rgba(210,140,175,.45)', lw: 1.2 });
    [[130, 360], [470, 400]].forEach(([x, y]) => { ell(g, x, y, 22, 14, { s: '#c2477c', lw: 3 }); dots(g, 8, x, y, 12, 6, 2.5, '#d8484a', 4); });
    dots(g, 140, 320, 170, 290, 100, 1.8, 'rgba(90,40,120,.55)', 12);
    rect(g, 30, 58, 580, 9, { f: '#dba7cc' }); dots(g, 50, 320, 62, 288, 3, 1.6, 'rgba(70,30,110,.7)', 21);
    const n = Math.round(lerp(9, 15, Math.min(1, k * 1.6))), sp = 560 / n;
    for (let i = 0; i < n; i++) {
      const lenF = .86 + hsh(i + 3) * .14, x = 40 + sp * (i + .5) + (hsh(i + 9) - .5) * sp * .25, lean = (hsh(i + 17) - .5) * (8 + 16 * k), w = sp * lerp(.62, .84, Math.min(1, k * 1.5)), top = 64, bot = top + 200 * lenF, irr = k > .5 ? (k - .5) * 16 : 0;
      const P2 = (u, v) => [x + u * w / 2 + lean * v + (irr ? (hsh(i * 31 + Math.round(v * 9) + (u > 0 ? 7 : 0)) - .5) * irr : 0), top + v * (bot - top)];
      shape(g, [P2(-1, 0), P2(-1.02, .35), P2(-.98, .7), P2(-.8, .95), P2(0, 1.02), P2(.8, .95), P2(.98, .7), P2(1.02, .35), P2(1, 0)], { f: k > .4 ? '#c98cc0' : '#dcaed0', s: 'rgba(120,60,120,.35)', lw: 1 });
      const lum = k > .5 && k < .76 ? 2 + (i % 2) : 1; for (let q = 0; q < lum; q++) { const off = lum > 1 ? (q - (lum - 1) / 2) * .42 : 0, lw2 = lum > 1 ? .13 : lerp(.22, .14, k); shape(g, [P2(off - lw2, 0), P2(off - lw2 * .8, .8), P2(off, .9), P2(off + lw2 * .8, .8), P2(off + lw2, 0)], { f: '#fbf4f8' }); }
      const gob = Math.round(lerp(7, 0, Math.min(1, k * 1.4))); for (let j = 0; j < gob; j++) [-1, 1].forEach(sd => { const [gx, gy] = P2(sd * .52, .08 + j * .12); ell(g, gx, gy, w * .1, 7, { f: 'rgba(238,242,252,.95)', s: 'rgba(150,150,200,.45)', lw: 1 }); });
      const strat = Math.min(1, k * 1.6), hi = k > .5; for (let j = 0; j < 11; j++) [-1, 1].forEach(sd => { const v = .05 + j * .085, u = sd * (.8 - (k > .2 ? hsh(i * 13 + j * 2 + sd) * .45 * strat : 0)), [nx2, ny2] = P2(u, v); ell(g, nx2, ny2, hi ? 3 : k > .2 ? 2.2 : 2.6, hi ? 3.6 : k > .2 ? 6.5 : 3.2, { f: hi ? '#6a3f9a' : k > .2 ? '#3d1d6b' : '#4b2a7a', rot: hi ? hsh(i + j) * 3 : 0 }); if (hi && hsh(i * 7 + j) > .55) ell(g, nx2, ny2, 1.1, 1.1, { f: '#c2185b' }); });
    }
    line(g, [[536, 420], [596, 420]], '#2a1a30', 3); mt(g, '100 µm', 566, 412, { a: 'center', s: 10.5, c: '#2a1a30', sh: false });
    if (inv) { const ki = (k - .75) / .25; for (let i = 0; i < 6; i++) { const x = 90 + i * 85 + (R() - .5) * 30, y = 310 + R() * 90 * ki; ell(g, x, y, 54, 34, { f: 'rgba(200,190,225,.55)', blur: 10 }); shape(g, [[x - 24, y - 10], [x + 6, y - 20], [x + 26, y + 2], [x + 4, y + 16], [x - 20, y + 10]], { f: '#d7a6d0', s: 'rgba(80,30,110,.7)', lw: 4 }); ell(g, x, y - 2, 7, 4, { f: '#fbf4f8' }); dots(g, 4, x, y - 2, 4, 2, 1.2, '#7a2a8a', i + 9); } for (let x = 60; x < 600; x += 110) rect(g, x, 268, 22, 22, { f: '#f3d3e2' }); }
    if (exc) { rect(g, 30, 436, 580, 12, { f: 'rgba(20,40,120,.75)' }); for (let x = 30; x < 610; x += 6) line(g, [[x, 426], [x + 3, 436]], 'rgba(120,60,40,.35)', 1.2); }
    rect(g, 30, 64, 580, 384, { s: 'rgba(120,60,100,.4)', lw: 1 });
    const gr = k < .2 ? say('正常結腸黏膜', 'Normal colonic mucosa') : k < .5 ? say('管狀腺瘤，低度異生', 'Tubular adenoma, low-grade dysplasia') : k < .76 ? say('高度異生', 'High-grade dysplasia') : say('侵襲性腺癌（pT1，侵入黏膜下層）', 'Invasive adenocarcinoma (pT1, into submucosa)');
    mbox(g, 380, 38, [[gr, k > .5 ? '#b71c1c' : '#1d2b30'], [exc ? say('深部切緣以墨水標記', 'Deep margin inked') : 'H&E ×100', '#5a6a70']], 240);
    const L = s.L; L(120, 150, k < .2 ? '試管狀隱窩、基底小核、杯狀細胞多' : k < .5 ? '核拉長深染、假複層、杯狀細胞減少' : '篩狀結構、核失極性、明顯核仁', k < .2 ? 'Test-tube crypts, small basal nuclei, many goblet cells' : k < .5 ? 'Elongated hyperchromatic pseudostratified nuclei, fewer goblet cells' : 'Cribriform glands, loss of polarity, prominent nucleoli', 60, 54, k < .2 ? c.n : c.a);
    L(300, 279, inv ? '黏膜肌層被突破' : '黏膜肌層', inv ? 'Muscularis mucosae breached' : 'Muscularis mucosae', 470, 300, inv ? c.a : c.n); L(130, 360, '黏膜下層血管', 'Submucosal vessel', 90, 440, c.n);
    if (inv) L(260, 340, '不規則浸潤腺體＋促纖維增生間質', 'Infiltrating irregular glands + desmoplastic stroma', 470, 380, c.a); if (exc) L(320, 442, '切緣乾淨（墨水處無腫瘤）', 'Margin clear (no tumour at ink)', 470, 440, c.t);
  }
  const GRAMS = [['chains', '陽性球菌（成鏈）', 'GPC in chains'], ['clusters', '陽性球菌（成簇）', 'GPC in clusters'], ['rods', '陰性桿菌', 'Gram-negative rods'], ['diplo', '細胞內陰性雙球菌', 'Intracellular GN diplococci']];
  function gram(g, s) {
    const c = pal(g), org = s.normal ? 'none' : (s.x.org || 'clusters'), abx = s.has('abx') && !s.normal, load = (s.normal ? 0 : s.k) * (abx ? .1 : 1), R = rng(91), pur = '#3b1d6e', pink = '#d0455e';
    micro(g, { b0: '#f6e6ec', b1: '#e8cdd8' }, (cx, cy, r) => {
      for (let i = 0; i < 14; i++) ell(g, cx + (R() - .5) * 380, cy + (R() - .5) * 380, 30 + R() * 40, 20 + R() * 30, { f: 'rgba(225,150,175,.18)', blur: 14 });
      const neut = [[cx - 110, cy - 60], [cx + 90, cy + 70], [cx - 40, cy + 120], [cx + 120, cy - 110], [cx - 150, cy + 60]].slice(0, s.normal ? 1 : 5);
      neut.forEach(([x, y]) => { ell(g, x, y, 24, 22, { f: 'rgba(240,170,190,.8)', s: 'rgba(170,60,90,.45)', lw: 1 }); for (let j = 0; j < 4; j++) ell(g, x - 12 + j * 8, y + Math.sin(j * 2) * 6, 5, 4, { f: '#b32d55' }); });
      const R2 = rng(5), cocc = (x, y, col) => ell(g, x, y, 3.2, 3, { f: col, s: 'rgba(0,0,0,.25)', lw: .5 });
      if (org === 'clusters') { const n = Math.round(2 + load * 16); for (let i = 0; i < n; i++) { const x = cx + (R2() - .5) * 340, y = cy + (R2() - .5) * 340, m = 6 + Math.floor(R2() * 14); for (let j = 0; j < m; j++) cocc(x + (R2() - .5) * 26, y + (R2() - .5) * 22, abx && R2() > .5 ? '#a0527e' : pur); } }
      if (org === 'chains') { const n = Math.round(2 + load * 14); for (let i = 0; i < n; i++) { let x = cx + (R2() - .5) * 320, y = cy + (R2() - .5) * 320, a = R2() * TAU; const m = 6 + Math.floor(R2() * 12); for (let j = 0; j < m; j++) { cocc(x, y, pur); x += Math.cos(a) * 6.6; y += Math.sin(a) * 6.6; a += (R2() - .5) * .5; } } }
      if (org === 'rods') { const n = Math.round(4 + load * 90); for (let i = 0; i < n; i++) { const x = cx + (R2() - .5) * 360, y = cy + (R2() - .5) * 360; g.save(); g.translate(x, y); g.rotate(R2() * PI); rect(g, -7 * (abx ? 1.6 : 1), -2.2, 14 * (abx ? 1.6 : 1), 4.4, { f: pink, r: 2.2 }); g.restore(); } }
      if (org === 'diplo') neut.forEach(([x, y], ni) => { const m = Math.round(2 + load * 8); for (let j = 0; j < m; j++) { const px = x + (R2() - .5) * 26, py = y + (R2() - .5) * 22; [-1, 1].forEach(sd => ell(g, px + sd * 2.6, py, 2.6, 3.4, { f: pink, rot: .3 })); } });
    });
    const nm = GRAMS.find(q => q[0] === org);
    mbox(g, 14, 38, [[nm ? say(nm[1], nm[2]) : say('無細菌', 'No organisms'), nm && !abx ? '#ff8a80' : '#9f9'], [say('菌量 ', 'Load ') + Math.round(load * 100) + '%' + (abx ? say('（治療後）', ' (after treatment)') : '')]], 250);
    const L = s.L; L(210, 192, s.normal ? '少量嗜中性球、無細菌' : '大量嗜中性球（真正感染）', s.normal ? 'Few neutrophils, no organisms' : 'Many neutrophils (true infection)', 90, 110, s.normal ? c.n : c.w);
    if (nm) L(320, 252, abx ? '抗生素後細菌稀少且變形' : { clusters: '葡萄狀成簇（葡萄球菌）', chains: '成鏈（鏈球菌）', rods: '粉紅色桿菌（腸內菌）', diplo: '嗜中性球內的腎形雙球菌' }[org], abx ? 'Few, distorted organisms after antibiotics' : { clusters: 'Grape-like clusters (staphylococci)', chains: 'Chains (streptococci)', rods: 'Pink rods (enterobacteria)', diplo: 'Kidney-bean pairs inside neutrophils' }[org], 470, 440, abx ? c.t : c.a);
  }
  const URINE = [['oxalate', '草酸鈣結晶', 'Calcium oxalate'], ['rbc-cast', '紅血球圓柱', 'RBC casts'], ['wbc-cast', '白血球圓柱', 'WBC casts']];
  function urine(g, s) {
    const c = pal(g), ty = s.normal ? 'none' : (s.x.ur || 'rbc-cast'), tx = s.has('treat-urine') && !s.normal, n = Math.round((s.normal ? 0 : 1 + s.k * 9) * (tx ? .12 : 1)), R = rng(33);
    micro(g, { b0: '#ece8dc', b1: '#d9d3c2' }, (cx, cy, r) => {
      shape(g, [[cx - 160, cy + 80], [cx - 100, cy + 40], [cx - 60, cy + 90], [cx - 110, cy + 140], [cx - 170, cy + 130]], { f: 'rgba(225,220,205,.6)', s: 'rgba(150,140,120,.5)', lw: 1.2 }); ell(g, cx - 115, cy + 92, 9, 7, { f: 'rgba(120,110,90,.5)' });
      for (let i = 0; i < 6; i++) shape(g, [[cx - 200 + R() * 400, cy - 200 + R() * 400], [cx - 200 + R() * 400, cy - 200 + R() * 400], [cx - 200 + R() * 400, cy - 200 + R() * 400]], { open: true, s: 'rgba(180,170,150,.35)', lw: 2 });
      for (let i = 0; i < n; i++) {
        const x = cx + (R() - .5) * 320, y = cy + (R() - .5) * 300, a = R() * PI;
        if (ty === 'rbc-cast' || ty === 'wbc-cast') { g.save(); g.translate(x, y); g.rotate(a); rect(g, -60, -14, 120, 28, { f: 'rgba(235,230,215,.55)', s: 'rgba(140,130,110,.6)', lw: 1.2, r: 14 }); for (let j = 0; j < 9; j++) { const px = -48 + j * 12 + (R() - .5) * 4, py = (R() - .5) * 12; if (ty === 'rbc-cast') ell(g, px, py, 5.5, 5, { f: 'rgba(214,120,80,.85)', s: 'rgba(160,70,40,.6)', lw: .8 }); else { ell(g, px, py, 6, 6, { f: 'rgba(200,200,195,.9)', s: 'rgba(110,110,100,.6)', lw: .8 }); dots(g, 3, px, py, 3, 3, .9, 'rgba(90,90,90,.7)', j + i); } } g.restore(); if (ty === 'rbc-cast') for (let j = 0; j < 3; j++) { const ax = x + (R() - .5) * 90, ay = y + 40 + (R() - .5) * 40; ell(g, ax, ay, 6, 6, { s: 'rgba(190,90,60,.8)', lw: 1.6 }); for (let b = 0; b < 4; b++) ell(g, ax + Math.cos(b * 1.6) * 6, ay + Math.sin(b * 1.6) * 6, 1.6, 1.6, { f: 'rgba(190,90,60,.8)' }); } }
        if (ty === 'oxalate') { const sz = 7 + R() * 8; if (R() > .3) { poly(g, [[x - sz, y - sz], [x + sz, y - sz], [x + sz, y + sz], [x - sz, y + sz]], { f: 'rgba(250,250,245,.6)', s: 'rgba(90,90,80,.75)', lw: 1.4 }); line(g, [[x - sz, y - sz], [x + sz, y + sz]], 'rgba(90,90,80,.75)', 1.1); line(g, [[x + sz, y - sz], [x - sz, y + sz]], 'rgba(90,90,80,.75)', 1.1); } else { ell(g, x - sz * .5, y, sz * .6, sz * .45, { s: 'rgba(90,90,80,.7)', lw: 1.3 }); ell(g, x + sz * .5, y, sz * .6, sz * .45, { s: 'rgba(90,90,80,.7)', lw: 1.3 }); } }
      }
      for (let i = 0; i < 6; i++) ell(g, cx + (R() - .5) * 300, cy + (R() - .5) * 300, 5, 5, { s: 'rgba(170,110,90,.6)', lw: 1.2 });
    });
    const nm = URINE.find(q => q[0] === ty);
    mbox(g, 14, 38, [[nm ? say(nm[1], nm[2]) + ' ' + n + (ty === 'oxalate' ? '/hpf' : '/lpf') : say('無圓柱、無結晶', 'No casts or crystals'), nm && !tx ? '#ff8a80' : '#9f9'], [tx ? say('治療後', 'after treatment') : say('未染色沉渣 ×400', 'unstained sediment ×400'), '#9ab']], 250);
    const L = s.L; L(205, 360, '鱗狀上皮細胞', 'Squamous epithelial cell', 90, 440);
    if (nm && n > 0) L(320, 252, { 'rbc-cast': '紅血球圓柱＋棘狀紅血球：腎絲球腎炎', 'wbc-cast': '白血球圓柱：腎盂腎炎／間質性腎炎', oxalate: '「信封」八面體與啞鈴形結晶' }[ty], { 'rbc-cast': 'RBC casts + acanthocytes: glomerulonephritis', 'wbc-cast': 'WBC casts: pyelonephritis / interstitial nephritis', oxalate: '"Envelope" octahedra and dumbbell crystals' }[ty], 470, 70, tx ? c.t : c.a);
    else L(320, 252, tx ? '治療後沉渣清淨' : '少量紅血球（非變形）', tx ? 'Sediment clear after treatment' : 'Occasional normal red cells', 470, 70, tx ? c.t : c.n);
  }
  function tropView(g, s) {
    const c = pal(g), k = s.normal ? 0 : s.k, rp = s.has('reperfusion') && !s.normal, pk = lerp(60, 6000, k * k), X = h => 80 + h / 72 * 520, Y = v => 400 - Math.log10(clamp(v, 1, 10000)) / 4 * 330;
    const T = h => s.normal ? 5 : 5 + (rp ? pk * 1.3 * Math.pow(h / 11, 2.4) * Math.exp(2.4 * (1 - h / 11)) : pk * Math.pow(h / 20, 2) * Math.exp(2 * (1 - h / 20)));
    paper(g, '#f6f7f4'); chart(g, 80, 70, 520, 330, { bg: 'rgba(255,255,255,.8)', grid: 'rgba(60,80,90,.18)', nx: 12, ny: 4 });
    [1, 10, 100, 1000, 10000].forEach(v => mt(g, v, 72, Y(v) + 4, { s: 10.5, a: 'right' })); for (let h = 0; h <= 72; h += 12) mt(g, h + 'h', X(h), 418, { s: 10.5, a: 'center' }); mt(g, 'hs-cTnT ng/L (log)', 82, 62, { s: 11 });
    line(g, [[80, Y(14)], [600, Y(14)]], '#c62828', 1.5, [6, 4]); mt(g, '99th URL 14', 596, Y(14) - 5, { s: 10, a: 'right', c: '#c62828' });
    g.save(); g.beginPath(); for (let h = 0; h <= 72; h += .5) { const y = Y(T(h)); h ? g.lineTo(X(h), y) : g.moveTo(X(h), y); } g.strokeStyle = '#0d47a1'; g.lineWidth = 2.5; g.stroke(); g.restore();
    const pts = [2, 3, 5, 8, 14, 26, 50, 72]; pts.forEach(h => { ell(g, X(h), Y(T(h)), 4.5, 4.5, { f: '#0d47a1', s: '#fff', lw: 1.5 }); });
    const v0 = T(2), v1 = T(3), dl = v1 - v0, rule = v0 >= 52 || dl >= 5 ? 2 : v0 < 12 && dl < 3 ? 0 : 1;
    if (rp) line(g, [[X(3), 70], [X(3), 400]], '#1b5e20', 2, [6, 3]);
    mbox(g, 380, 318, [['0 h: ' + v0.toFixed(0) + ' · 1 h: ' + v1.toFixed(0) + ' ng/L'], ['Δ1h = ' + (dl >= 0 ? '+' : '') + dl.toFixed(0)], ['ESC 0/1 h: ' + [say('排除', 'rule-out'), say('觀察', 'observe'), say('納入', 'rule-in')][rule], ['#1b5e20', '#8a4b00', '#b71c1c'][rule]]], 210);
    const L = s.L, hp = rp ? 11 : 20; L(X(hp), Y(T(hp)), s.normal ? '低於第 99 百分位且穩定' : '峰值 ' + Math.round(T(hp)) + ' ng/L（' + hp + ' h）', s.normal ? 'Below the 99th percentile and flat' : 'Peak ' + Math.round(T(hp)) + ' ng/L at ' + hp + ' h', X(hp) + 40, 120, s.normal ? c.n : c.a);
    L(X(3), Y(T(3)), '入院 0／1 小時採檢', '0 h / 1 h samples on arrival', 150, 300, c.n); if (rp) L(X(30), Y(T(30)), '再灌流後更早達峰、快速下降（沖出）', 'Earlier, higher peak and faster fall after reperfusion (washout)', 320, 360, c.t);
  }
  function kView(g, s) {
    const c = pal(g), K0 = s.normal ? 4.2 : s.v, cal = s.has('calcium') && !s.normal, ins = s.has('insulin') && !s.normal, dia = s.has('dialysis') && !s.normal, any = cal || ins || dia;
    const Kt = h => { if (h <= 6) return lerp(4.4, K0, sm(0, 6, h)); let v = K0; if (ins) v -= 1 * sm(6, 7, h) * (1 - .8 * sm(9, 13, h)); if (dia) v = lerp(v, 4.5, sm(6.5, 10, h)); return v; };
    const X = h => 70 + h / 24 * 530, Y = v => 250 - (v - 3) / 5.5 * 190, now = any ? 7 : 6, Kn = Kt(now), Ke = cal ? Math.min(Kn, 5.6) : Kn;
    paper(g, '#f6f7f4'); rect(g, 70, 60, 530, 190, { f: 'rgba(255,255,255,.8)', s: '#9aa', lw: 1 });
    [[3.5, 5, 'rgba(80,180,120,.16)'], [5.5, 6, 'rgba(255,193,7,.16)'], [6, 6.5, 'rgba(255,152,0,.2)'], [6.5, 8.5, 'rgba(229,57,53,.16)']].forEach(([a, b, col]) => rect(g, 70, Y(b), 530, Y(a) - Y(b), { f: col }));
    for (let v = 3; v <= 8; v++) mt(g, v.toFixed(1), 64, Y(v) + 4, { s: 10, a: 'right' }); for (let h = 0; h <= 24; h += 6) mt(g, h + 'h', X(h), 266, { s: 10, a: 'center' }); mt(g, 'K⁺ mmol/L', 72, 54, { s: 11 });
    g.save(); g.beginPath(); for (let h = 0; h <= (any ? 24 : 6); h += .1) { const y = Y(Kt(h)); h ? g.lineTo(X(h), y) : g.moveTo(X(h), y); } g.strokeStyle = '#b71c1c'; g.lineWidth = 2.5; g.stroke(); g.restore();
    line(g, [[X(6), 60], [X(6), 250]], '#455a64', 1, [4, 3]); if (ins) mt(g, say('胰島素', 'insulin'), X(6) + 4, 74, { s: 10, c: '#1b5e20' }); if (dia) mt(g, say('透析', 'dialysis'), X(6.5) + 4, 88, { s: 10, c: '#1b5e20' }); if (cal) mt(g, say('鈣劑', 'calcium'), X(6) + 4, 102, { s: 10, c: '#1b5e20' });
    rect(g, 70, 290, 530, 150, { f: '#fdeeee', s: '#d99', lw: 1 }); for (let x = 70; x <= 600; x += 10) line(g, [[x, 290], [x, 440]], x % 50 === 20 ? 'rgba(220,80,80,.35)' : 'rgba(230,140,140,.18)', 1); for (let y = 290; y <= 440; y += 10) line(g, [[70, y], [600, y]], (y - 290) % 50 === 0 ? 'rgba(220,80,80,.35)' : 'rgba(230,140,140,.18)', 1);
    const tT = clamp((Ke - 5) / 2, 0, 1.4), pr = clamp((Ke - 6.3) / 1.2, 0, 1), qw = clamp((Ke - 6.8) / 1.2, 0, 1), sine = clamp((Ke - 7.8) / .6, 0, 1);
    g.save(); g.beginPath(); for (let x = 0; x <= 530; x += 1) { const t = x / 530 * 3, ph = (t % .8) / .8; let v = .1 * (1 - pr) * gs(ph, .12, .025) + (1 - sine) * (.9 * gs(ph, .26 + .02 * pr, .012 * (1 + 2 * qw)) - .2 * gs(ph, .29 + .02 * pr, .012 * (1 + 2 * qw))) + (.18 + .5 * tT) * gs(ph, .5 + .04 * qw, .04 - .012 * Math.min(1, tT)) + sine * .7 * Math.sin(ph * TAU); const y = 400 - v * 90; x ? g.lineTo(70 + x, y) : g.moveTo(70 + x, y); } g.strokeStyle = '#1d1d24'; g.lineWidth = 1.6; g.stroke(); g.restore();
    mt(g, 'ECG V2 · 25 mm/s', 76, 304, { s: 10 });
    const bandTxt = Kn < 5.5 ? say('正常／輕微', 'normal / mild') : Kn < 6 ? say('輕度', 'mild') : Kn < 6.5 ? say('中度', 'moderate') : say('重度', 'severe');
    mbox(g, 420, 66, [['K⁺ ' + Kn.toFixed(1) + ' · ' + bandTxt, Kn >= 6.5 ? '#b71c1c' : Kn >= 5.5 ? '#8a4b00' : '#1b5e20'], [say('時間 ', 'time ') + now + ' h']], 176);
    const L = s.L; L(X(now), Y(Kn), any ? (dia ? '透析：鉀真正移出、穩定下降' : ins ? '胰島素：鉀移入細胞，數小時後回升' : '鈣劑不降鉀') : '目前 K⁺ ' + Kn.toFixed(1), any ? (dia ? 'Dialysis: potassium removed, steady fall' : ins ? 'Insulin: shifted into cells, rebounds after hours' : 'Calcium does not lower K⁺') : 'Current K⁺ ' + Kn.toFixed(1), 300, 120, any ? (cal && !ins && !dia ? c.w : c.t) : Kn >= 6.5 ? c.a : c.n);
    L(70 + .5 / 3 * 530 * .8 + 10, 400 - (.18 + .5 * tT) * 90, tT > .5 ? (cal ? '鈣劑後心肌膜穩定、T 波較不尖' : 'T 波高尖') : '正常 T 波', tT > .5 ? (cal ? 'Membrane stabilised: T waves less peaked' : 'Peaked T waves') : 'Normal T wave', 300, 330, tT > .5 && !cal ? c.a : cal ? c.t : c.n); if (qw > .3) L(70 + .26 / 3 * 530 * .8, 320, 'QRS 變寬、P 波消失', 'Wide QRS, P waves lost', 470, 330, c.a);
  }
  const COAG = [['warfarin', '維生素 K 拮抗劑', 'Vitamin K antagonist'], ['heparin', '肝素（UFH）', 'Heparin (UFH)'], ['haemophilia', 'A 型血友病', 'Haemophilia A'], ['dic', 'DIC', 'DIC'], ['liver', '肝病', 'Liver disease']];
  function coagView(g, s) {
    const c = pal(g), pat = s.normal ? 'none' : (s.x.coag || 'dic'), rv = s.has('reverse') && !s.normal, kk = s.normal ? 0 : s.k * (rv ? { warfarin: .1, heparin: .05, haemophilia: .1, dic: .45, liver: .6 }[pat] : 1);
    const V = { none: k => [12, 30, 3, 250, .3], warfarin: k => [12 + 30 * k, 30 + 8 * k, 3, 250, .3], heparin: k => [12 + 2 * k, 30 + 70 * k, 3, 250, .3], haemophilia: k => [12, 30 + 45 * k, 3, 250, .3], dic: k => [12 + 14 * k, 30 + 30 * k, 3 - 2.4 * k, 250 - 220 * k, .3 + 19.7 * k], liver: k => [12 + 16 * k, 30 + 12 * k, 3 - 1.6 * k, 250 - 160 * k, .3 + 1.5 * k] }[pat](kk);
    const rows = [['PT', 's', V[0], 11, 13.5, 8, 50], ['INR', '', V[0] / 12, .9, 1.1, .6, 4.5], ['aPTT', 's', V[1], 25, 35, 15, 110], [say('纖維蛋白原', 'Fibrinogen'), 'g/L', V[2], 2, 4, 0, 6], [say('血小板', 'Platelets'), '×10⁹/L', V[3], 150, 400, 0, 500], ['D-dimer', 'mg/L FEU', V[4], 0, .5, 0, 21]];
    paper(g, '#f6f7f4');
    rows.forEach(([nm, u, v, lo, hi, mn, mx], i) => { const y = 74 + i * 60, X = q => 190 + (q - mn) / (mx - mn) * 380, flag = v > hi ? 'H' : v < lo ? 'L' : ''; mt(g, nm, 24, y + 20, { s: 13, w: '700' }); mt(g, u, 24, y + 36, { s: 10, c: '#667' }); rect(g, 190, y + 6, 380, 28, { f: 'rgba(0,0,0,.05)', r: 4 }); rect(g, X(lo), y + 6, X(hi) - X(lo), 28, { f: 'rgba(80,180,120,.28)' }); rect(g, 190, y + 14, Math.max(3, X(Math.min(v, mx)) - 190), 12, { f: flag ? '#e53935' : '#1e88e5', r: 3 }); mt(g, (v < 10 ? v.toFixed(1) : Math.round(v)) + ' ' + flag, 176, y + 25, { s: 12, a: 'right', c: flag ? '#b71c1c' : '#223', w: '700' }); });
    const nm = COAG.find(q => q[0] === pat);
    mbox(g, 380, 34, [[nm ? say(nm[1], nm[2]) : say('凝血功能正常', 'Normal coagulation'), nm && !rv ? '#b71c1c' : '#1b5e20'], [pat === 'haemophilia' ? say('第八因子 ', 'Factor VIII ') + Math.round(100 - 99 * kk) + '%' : rv ? say('矯正後', 'after correction') : say('混合試驗：', 'Mixing: ') + (pat === 'heparin' ? say('不矯正（抑制物）', 'no correction (inhibitor)') : say('可矯正（缺乏）', 'corrects (deficiency)'))]], 240);
    const L = s.L, pk = { none: 0, warfarin: 0, heparin: 2, haemophilia: 2, dic: 4, liver: 0 }[pat], [, , pv, , , pmn, pmx] = rows[pk], px = 190 + (Math.min(pv, pmx) - pmn) / (pmx - pmn) * 380;
    L(px, 74 + pk * 60 + 20, { none: 'PT 在參考範圍內', warfarin: 'PT／INR 延長（外源路徑）', heparin: 'aPTT 延長（內源路徑）', haemophilia: '只有 aPTT 延長', dic: 'D-dimer 大幅上升＋血小板、纖維蛋白原下降', liver: 'PT 延長為主（合成功能下降）' }[pat], { none: 'PT within the reference range', warfarin: 'Prolonged PT/INR (extrinsic)', heparin: 'Prolonged aPTT (intrinsic)', haemophilia: 'Isolated prolonged aPTT', dic: 'D-dimer high, platelets and fibrinogen low', liver: 'Mainly prolonged PT (reduced synthesis)' }[pat], 380, 450, pat === 'none' ? c.n : rv ? c.t : c.a);
  }
  const PA_RX = {
    iron: { zh: '補充鐵劑', en: 'Iron replacement', text: '口服鐵劑（隔日服用吸收較好），不耐受或吸收不良時改靜脈鐵，並找出失血原因（月經、腸胃道出血——中老年需內視鏡）；7–10 天網狀紅血球上升，新的正常大小紅血球與舊的小球同時存在（雙形性），約 2–3 個月抹片恢復正常。', textEn: 'Oral iron (alternate-day dosing absorbs better) or IV iron if not tolerated or absorbed, while finding the source of loss (menstrual, gastrointestinal — endoscopy in older adults); reticulocytes rise in 7–10 days, new normal-sized cells mix with the old microcytes (a dimorphic picture), and the smear normalises in about 2–3 months.' },
    transfusion: { zh: '輸血／交換輸血', en: 'Transfusion / exchange transfusion', text: '症狀性重度貧血時輸注紅血球立即提升血紅素；鐮刀型貧血的急性胸症候群或中風以交換輸血把 HbS 降到 30% 以下。抹片中捐血者的正常紅血球比例增加，但不能取代找出病因。', textEn: 'In symptomatic severe anaemia red-cell transfusion raises haemoglobin at once; in sickle cell acute chest syndrome or stroke, exchange transfusion lowers HbS below 30%. Donor normal cells increase on the smear, but transfusion does not replace finding the cause.' },
    b12: { zh: '補充維生素 B12／葉酸', en: 'Vitamin B12 / folate replacement', text: '惡性貧血需終身補充 B12（肌肉注射或口服），葉酸缺乏則口服葉酸；應先確認 B12 正常再單獨補葉酸，以免神經病變惡化。數天內網狀紅血球大增（多染性大細胞），數週後大卵圓形紅血球與多分葉嗜中性球消失；注意低血鉀。', textEn: 'Pernicious anaemia needs lifelong B12 (intramuscular or oral) and folate deficiency oral folate; B12 is checked first, because folate alone can worsen the neuropathy. Within days reticulocytes surge (large polychromatic cells), and over weeks macro-ovalocytes and hypersegmented neutrophils disappear; watch the potassium.' },
    tki: { zh: '酪胺酸激酶抑制劑（原則）', en: 'Tyrosine kinase inhibitor (principle)', text: 'CML 的 BCR-ABL1 融合基因產生持續活化的酪胺酸激酶；imatinib 等抑制劑阻斷其訊號，數週內白血球與幼稚顆粒球回到正常（血液學緩解），再以定量 PCR 追蹤分子反應。', textEn: 'In CML the BCR-ABL1 fusion produces a constitutively active tyrosine kinase; inhibitors such as imatinib block its signalling, and within weeks the white count and immature granulocytes return to normal (haematological remission), with quantitative PCR tracking the molecular response.' },
    induction: { zh: '誘導化療（原則）', en: 'Induction chemotherapy (principle)', text: '急性白血病確診（骨髓芽細胞 ≥20%，具特定基因異常者可更低）後依分型給予誘導化療，目標是完全緩解：骨髓芽細胞 <5% 且血球回復；化療後會先經歷全血球低下期，需輸血與預防感染。', textEn: 'Once acute leukaemia is confirmed (marrow blasts 20% or more, fewer with defining genetic changes), subtype-directed induction chemotherapy aims for complete remission — marrow blasts under 5% with count recovery; a period of pancytopenia follows that needs transfusion and infection prophylaxis.' },
    excise: { zh: '內視鏡完整切除', en: 'Endoscopic complete excision', text: '腺瘤以內視鏡整塊切除（必要時黏膜下剝離），病理評估切緣與異生程度；若已侵入黏膜下層（pT1），再依分化程度、淋巴血管侵犯、腫瘤芽生與侵犯深度決定是否追加手術。標本深部切緣以墨水標記。', textEn: 'Adenomas are removed en bloc endoscopically (submucosal dissection if needed) and pathology assesses margins and dysplasia; if cancer invades the submucosa (pT1), grade, lymphovascular invasion, tumour budding and depth decide whether surgery follows. The deep margin of the specimen is inked.' },
    abx: { zh: '依培養給予抗生素', en: 'Culture-directed antibiotics', text: '採檢後先依革蘭氏染色經驗性用藥（陽性球菌成簇要涵蓋金黃色葡萄球菌與 MRSA 風險、成鏈為鏈球菌、陰性桿菌涵蓋腸內菌），再依培養與藥敏調整；治療有效時重複檢體細菌明顯減少、殘留菌體變形。', textEn: 'After sampling, empirical therapy follows the Gram stain (clustered Gram-positive cocci cover Staphylococcus aureus and MRSA risk, chains streptococci, Gram-negative rods enterobacteria) and is refined by culture and sensitivities; on effective treatment repeat specimens show far fewer, distorted organisms.' },
    'treat-urine': { zh: '治療病因', en: 'Treat the cause', text: '紅血球圓柱代表腎絲球腎炎，需腎臟科評估、常需切片並依病因使用免疫抑制（原則）；白血球圓柱見於腎盂腎炎與間質性腎炎，依病因給抗生素或停用致病藥；草酸鈣結晶以大量飲水與飲食調整處理，並警覺乙二醇中毒。治療後沉渣中圓柱與結晶減少。', textEn: 'Red-cell casts mean glomerulonephritis, needing nephrology review, often biopsy and cause-directed immunosuppression (principle); white-cell casts occur in pyelonephritis and interstitial nephritis, treated with antibiotics or withdrawal of the culprit drug; calcium oxalate crystals are managed with high fluid intake and diet, with ethylene glycol poisoning kept in mind. After treatment casts and crystals diminish.' },
    reperfusion: { zh: '再灌流治療（PCI）', en: 'Reperfusion (PCI)', text: 'STEMI 儘早以 PCI（無法及時時溶栓）打通梗塞血管；再灌流把壞死心肌中的肌鈣蛋白一次「沖出」，曲線更早達到更高峰值後迅速下降，總釋放量（梗塞範圍）較小。', textEn: 'In STEMI the culprit artery is opened as early as possible by PCI (or thrombolysis if PCI cannot be timely); reperfusion "washes out" troponin from the necrotic myocardium, so the curve peaks earlier and higher and then falls quickly, while total release (infarct size) is smaller.' },
    calcium: { zh: '靜脈鈣劑（穩定心肌膜）', en: 'IV calcium (membrane stabilisation)', text: '高血鉀合併心電圖變化時先給靜脈鈣劑穩定心肌細胞膜，數分鐘內心電圖改善；但血鉀數值不變，必須同時進行降鉀治療。', textEn: 'With ECG changes, IV calcium is given first to stabilise the cardiac membrane, and the ECG improves within minutes; the potassium level itself does not change, so potassium-lowering treatment must follow.' },
    insulin: { zh: '胰島素＋葡萄糖（原則）', en: 'Insulin–glucose (principle)', text: '胰島素活化 Na⁺/K⁺-ATPase 把鉀移入細胞，30–60 分鐘內血鉀下降約 0.6–1.2 mmol/L，同時給葡萄糖並監測血糖防低血糖；效果只維持數小時、之後回升，所以只是爭取時間。', textEn: 'Insulin drives potassium into cells through Na⁺/K⁺-ATPase, lowering it by about 0.6–1.2 mmol/L within 30–60 minutes, with glucose and glucose monitoring to prevent hypoglycaemia; the effect lasts only hours before potassium rebounds, so it buys time.' },
    dialysis: { zh: '血液透析（原則）', en: 'Haemodialysis (principle)', text: '腎衰竭或難治性高血鉀時以血液透析真正把鉀移出體外，血鉀穩定降到正常範圍；其他排鉀方式還有利尿劑與口服鉀離子結合劑。', textEn: 'In renal failure or refractory hyperkalaemia, haemodialysis truly removes potassium from the body and the level falls steadily into the normal range; other routes of removal include diuretics and oral potassium binders.' },
    reverse: { zh: '依原因矯正', en: 'Correct the cause', text: '依型態處理：維生素 K 拮抗劑過量給維生素 K，出血時加凝血酶原複合物（PCC）；肝素停藥並視需要以 protamine 中和；A 型血友病補充第八因子；DIC 最重要是治療誘因（敗血症、產科、創傷），出血時補充血小板、冷凍沉澱品與血漿；肝病先試維生素 K，出血或術前再補充血品。', textEn: 'Act on the pattern: vitamin K antagonist excess needs vitamin K, plus prothrombin complex concentrate if bleeding; heparin is stopped and neutralised with protamine if needed; haemophilia A receives factor VIII; in DIC the trigger (sepsis, obstetric, trauma) is treated and platelets, cryoprecipitate and plasma given for bleeding; in liver disease vitamin K is tried, with blood products for bleeding or before procedures.' }
  };
  const smv = (kind, zh, en) => ({ id: 'smear', zh: '血液抹片', en: 'Blood smear', mod: 'SMEAR', hdr: 'PERIPHERAL SMEAR · WRIGHT–GIEMSA ×1000', p: P(zh, en, 0, 100, 60, '%', { normal: 0 }), h: { scale: [40, '10 µm'] }, draw: (g, s) => smear(g, s, kind) });
  const PA_CONDS = [
    { id: 'iron-deficiency', zh: '缺鐵性貧血', en: 'Iron-deficiency anaemia', rx: ['iron', 'transfusion'], views: [smv('iron', '異常紅血球比例', 'Abnormal red cells')],
      f: '最常見的貧血：小球性（MCV <80 fL）低色素紅血球，中央淡染區超過直徑一半，大小不一並見鉛筆狀細胞。鐵蛋白低是最具特異性的檢驗（發炎時可偽正常），運鐵蛋白飽和度低、RDW 升高。成年男性與停經後女性必須找出腸胃道失血原因。', fEn: 'The commonest anaemia: microcytic (MCV under 80 fL), hypochromic cells whose central pallor exceeds half the diameter, with anisocytosis and pencil cells. A low ferritin is the most specific test (it can be falsely normal in inflammation), with low transferrin saturation and a raised RDW. In men and postmenopausal women a gastrointestinal source must be sought.' },
    { id: 'megaloblastic', zh: '巨母紅血球性貧血', en: 'Megaloblastic anaemia', rx: ['b12', 'transfusion'], views: [smv('b12', '異常紅血球比例', 'Abnormal red cells')],
      f: '維生素 B12 或葉酸缺乏使 DNA 合成受阻，細胞核成熟落後於細胞質：抹片見大卵圓形紅血球（MCV 常 >110 fL）與多分葉嗜中性球（≥6 葉，或 5 葉者 >5%）。B12 缺乏（惡性貧血、胃切除、全素、metformin）還會造成脊髓亞急性合併退化。LDH 與間接膽紅素常升高（無效造血）。', fEn: 'Lack of vitamin B12 or folate impairs DNA synthesis, so nuclear maturation lags behind the cytoplasm: the smear shows macro-ovalocytes (MCV often over 110 fL) and hypersegmented neutrophils (6 or more lobes, or more than 5% with 5). B12 deficiency (pernicious anaemia, gastrectomy, vegan diet, metformin) also causes subacute combined degeneration of the cord. LDH and unconjugated bilirubin are often raised (ineffective erythropoiesis).' },
    { id: 'sickle', zh: '鐮刀型紅血球疾病', en: 'Sickle cell disease', rx: ['transfusion'], views: [smv('sickle', 'HbS 細胞比例', 'HbS cells')],
      f: 'β 球蛋白第 6 位胺基酸由麩胺酸變為纈胺酸（HbS），去氧時聚合使紅血球變成鐮刀狀，阻塞微血管並溶血。抹片見鐮刀細胞、標靶細胞，脾臟自體梗塞後出現 Howell–Jolly 小體；急性併發症有疼痛危機、急性胸症候群、中風與脾臟隔離。以血紅素電泳或 HPLC 確診。', fEn: 'A glutamate-to-valine change at position 6 of β-globin (HbS) polymerises on deoxygenation, sickling red cells that block microvessels and haemolyse. The smear shows sickle and target cells, plus Howell–Jolly bodies after splenic autoinfarction; acute complications include pain crises, acute chest syndrome, stroke and splenic sequestration. Diagnosis is by haemoglobin electrophoresis or HPLC.' },
    { id: 'cml', zh: '慢性骨髓性白血病', en: 'Chronic myeloid leukaemia', rx: ['tki'], views: [smv('cml', '白血球負荷', 'White-cell burden')],
      f: '費城染色體 t(9;22) 產生 BCR-ABL1，造成顆粒球全系列增生：白血球常 >100 ×10⁹/L，抹片見從芽細胞到成熟嗜中性球的各階段，以骨髓細胞與後骨髓細胞（「左移」）為主，嗜鹼性球增加是特徵，血小板常升高。慢性期芽細胞 <10%，脾臟腫大。', fEn: 'The Philadelphia chromosome t(9;22) creates BCR-ABL1 and a proliferation of the whole granulocyte series: white counts often exceed 100 ×10⁹/L, and the smear shows every stage from blast to neutrophil, dominated by myelocytes and metamyelocytes (a "left shift"), with characteristic basophilia and often raised platelets. In chronic phase blasts are under 10% and the spleen is enlarged.' },
    { id: 'acute-leukaemia', zh: '急性白血病', en: 'Acute leukaemia', rx: ['induction', 'transfusion'], views: [smv('blasts', '芽細胞比例', 'Blasts')],
      f: '骨髓被不成熟的芽細胞取代，周邊血見大型細胞、高核質比、細緻染色質與明顯核仁；骨髓性芽細胞可見 Auer 小體（紅色針狀），是 AML 的線索。正常造血受抑制，出現貧血、血小板低下出血與嗜中性球低下感染。合併 DIC 的急性前骨髓細胞白血病（APL）屬急症。', fEn: 'The marrow is replaced by immature blasts, and the blood shows large cells with a high nuclear-to-cytoplasmic ratio, fine chromatin and prominent nucleoli; myeloid blasts may contain Auer rods (red needles), a pointer to AML. Normal haematopoiesis is suppressed, causing anaemia, thrombocytopenic bleeding and neutropenic infection. Acute promyelocytic leukaemia with DIC is an emergency.' },
    { id: 'colon-adenoma', zh: '結腸腺瘤－癌序列（H&E）', en: 'Colon adenoma–carcinoma sequence (H&E)', rx: ['excise'], views: [{ id: 'he', zh: 'H&E 組織切片', en: 'H&E section', mod: 'HE', hdr: 'COLON BIOPSY · H&E ×100', p: sev('異生程度', 'Dysplasia'), draw: histo }],
      f: '正常結腸隱窩像排列整齊的試管，基底有小而一致的核，杯狀細胞多。腺瘤上皮核拉長、深染、假複層，杯狀細胞減少（低度異生）；高度異生出現篩狀結構、核失去極性與明顯核仁。只有穿過黏膜肌層侵入黏膜下層並引起促纖維增生反應，才是侵襲性腺癌（APC、KRAS、TP53 依序突變）。', fEn: 'Normal colonic crypts are orderly test tubes with small uniform basal nuclei and plentiful goblet cells. In an adenoma the nuclei are elongated, hyperchromatic and pseudostratified with fewer goblet cells (low-grade dysplasia); high-grade dysplasia adds cribriform architecture, loss of polarity and prominent nucleoli. Only invasion through the muscularis mucosae into the submucosa with a desmoplastic reaction is invasive adenocarcinoma (sequential APC, KRAS and TP53 mutations).' },
    { id: 'gram-stain', zh: '革蘭氏染色', en: 'Gram stain', rx: ['abx'], views: [{ id: 'gram', zh: '革蘭氏染色鏡檢', en: 'Gram stain microscopy', mod: 'GRAM', hdr: 'GRAM STAIN · ×1000 OIL', p: sev('細菌量', 'Organism load'), h: { scale: [40, '10 µm'] }, draw: gram, ui: s => GRAMS.map(([id, zh, en]) => ({ id, zh, en, active: (s.x.org || 'clusters') === id })), onUi: (id, s) => { s.x.org = id; } }],
      f: '結晶紫－碘複合物留在厚的肽聚糖細胞壁中呈紫色（革蘭氏陽性），有外膜、壁薄的細菌被酒精脫色後以番紅複染成粉紅色（革蘭氏陰性）。陽性球菌成簇多為葡萄球菌、成鏈為鏈球菌；陰性桿菌如大腸桿菌，嗜中性球內的陰性雙球菌提示淋病雙球菌或腦膜炎雙球菌。同時見大量嗜中性球代表感染而非汙染。', fEn: 'Crystal violet–iodine is retained by a thick peptidoglycan wall (purple, Gram-positive), whereas thin-walled bacteria with an outer membrane are decolourised by alcohol and counterstained pink with safranin (Gram-negative). Gram-positive cocci in clusters are usually staphylococci and in chains streptococci; Gram-negative rods include E. coli, and intracellular Gram-negative diplococci suggest gonococci or meningococci. Many neutrophils alongside indicate infection rather than contamination.' },
    { id: 'urine-sediment', zh: '尿沉渣鏡檢', en: 'Urine sediment microscopy', rx: ['treat-urine'], views: [{ id: 'urine', zh: '尿沉渣', en: 'Urine sediment', mod: 'UMIC', hdr: 'URINE SEDIMENT · BRIGHT FIELD ×400', p: sev('數量', 'Count'), h: { scale: [40, '20 µm'] }, draw: urine, ui: s => URINE.map(([id, zh, en]) => ({ id, zh, en, active: (s.x.ur || 'rbc-cast') === id })), onUi: (id, s) => { s.x.ur = id; } }],
      f: '圓柱在腎小管內由 Tamm–Horsfall 蛋白形成，所含細胞把病灶定位在腎臟：紅血球圓柱與變形紅血球（棘狀紅血球）代表腎絲球出血、即腎絲球腎炎，白血球圓柱見於腎盂腎炎與間質性腎炎。草酸鈣二水結晶呈「信封」八面體，一水結晶呈啞鈴或卵圓形，大量出現時要想到乙二醇中毒。', fEn: 'Casts form in the tubules from Tamm–Horsfall protein, and the cells they carry place the lesion in the kidney: red-cell casts and dysmorphic red cells (acanthocytes) mean glomerular bleeding — glomerulonephritis — while white-cell casts occur in pyelonephritis and interstitial nephritis. Calcium oxalate dihydrate crystals look like "envelopes" and monohydrate crystals like dumbbells or ovals, and large numbers raise ethylene glycol poisoning.' },
    { id: 'troponin', zh: '心肌梗塞的高敏感度肌鈣蛋白', en: 'High-sensitivity troponin in myocardial infarction', rx: ['reperfusion'], views: [{ id: 'trend', zh: '肌鈣蛋白趨勢', en: 'Troponin trend', mod: 'LAB', hdr: 'hs-cTnT · SERIAL SAMPLES', p: sev('梗塞範圍', 'Infarct size'), draw: tropView }],
      f: '壞死心肌釋放肌鈣蛋白，症狀後 1–3 小時開始上升、12–24 小時達峰、持續 7–14 天。心肌梗塞的定義是至少一個數值超過第 99 百分位上限並有上升或下降的動態變化，加上缺血證據；ESC 0/1 小時演算法依初值與 1 小時差值快速排除或納入。腎衰竭、心肌炎、肺栓塞與敗血症也會升高，但通常較平穩。', fEn: 'Necrotic myocardium releases troponin, rising 1–3 hours after symptoms, peaking at 12–24 hours and persisting 7–14 days. Myocardial infarction requires at least one value above the 99th-percentile upper reference limit with a rise or fall, plus evidence of ischaemia; the ESC 0/1-hour algorithm rules in or out from the first value and the 1-hour change. Renal failure, myocarditis, pulmonary embolism and sepsis also raise it, usually with a flatter profile.' },
    { id: 'hyperkalaemia', zh: '高血鉀', en: 'Hyperkalaemia', rx: ['calcium', 'insulin', 'dialysis'], views: [{ id: 'k', zh: '血鉀趨勢＋心電圖', en: 'Potassium trend + ECG', mod: 'LAB', hdr: 'POTASSIUM · TREND + ECG', p: P('血鉀', 'Potassium', 5, 8.4, 6.8, ' mmol/L', { step: .1, normal: 4.2, fmt: v => v.toFixed(1) + ' mmol/L' }), draw: kView }],
      f: '血鉀 5.5–5.9 為輕度、6.0–6.4 中度、≥6.5 mmol/L 重度（英國腎臟學會），常見原因為腎衰竭、藥物（ACE 抑制劑、保鉀利尿劑）與細胞釋出，並需排除溶血檢體造成的假性高血鉀。心電圖依序出現 T 波高尖、PR 延長與 P 波消失、QRS 變寬，最後成正弦波與心室顫動；但心電圖正常不代表安全。', fEn: 'Potassium 5.5–5.9 is mild, 6.0–6.4 moderate and 6.5 mmol/L or more severe (UK Renal Association); causes include renal failure, drugs (ACE inhibitors, potassium-sparing diuretics) and release from cells, and pseudohyperkalaemia from a haemolysed sample must be excluded. The ECG progresses through peaked T waves, a long PR with loss of P waves and a widening QRS to a sine wave and ventricular fibrillation, though a normal ECG does not mean safety.' },
    { id: 'coagulation', zh: '凝血檢查型態', en: 'Coagulation test patterns', rx: ['reverse'], views: [{ id: 'bars', zh: '凝血檢查', en: 'Coagulation screen', mod: 'COAG', hdr: 'COAGULATION SCREEN · REFERENCE RANGES', p: sev('異常程度', 'Derangement'), draw: coagView, ui: s => COAG.map(([id, zh, en]) => ({ id, zh, en, active: (s.x.coag || 'dic') === id })), onUi: (id, s) => { s.x.coag = id; } }],
      f: 'PT／INR 反映外源與共同路徑（第 VII、X、V、II 因子與纖維蛋白原），是追蹤維生素 K 拮抗劑與肝功能的指標；aPTT 反映內源路徑（第 XII、XI、IX、VIII 因子），受肝素與 A／B 型血友病影響。DIC 時凝血因子與血小板被消耗：PT 與 aPTT 延長、纖維蛋白原與血小板下降、D-dimer 大幅上升。混合試驗可分辨因子缺乏（可矯正）與抑制物（不能矯正）。', fEn: 'PT/INR reflects the extrinsic and common pathways (factors VII, X, V, II and fibrinogen) and tracks vitamin K antagonists and liver function; the aPTT reflects the intrinsic pathway (factors XII, XI, IX, VIII) and is prolonged by heparin and haemophilia A or B. In DIC factors and platelets are consumed: PT and aPTT lengthen, fibrinogen and platelets fall and D-dimer rises steeply. A mixing study separates factor deficiency (corrects) from an inhibitor (does not).' }
  ];
  ST.register({ id: 'pathology-lab', zh: '病理檢驗科', en: 'Pathology & laboratory medicine', rx: PA_RX, conds: PA_CONDS });
})(window);
