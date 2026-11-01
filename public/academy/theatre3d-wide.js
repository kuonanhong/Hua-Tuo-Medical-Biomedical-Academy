/* v4.1 wide-angle and look-around camera for the 3D rooms (theatre3d.js walk mode in the shift game and the 3D board of
   the procedures page). The user asked for「廣角鏡頭：左右上下前後的畫面都收錄」, so this add-on gives:
   · a field-of-view slider 55–120° (theatre3d clamps: first person 120°, follow camera 100°),
   · look-around nudges (⬆⬇⬅➡, keyboard Alt+arrows / [ ] / - =) with ±80° pitch, six-direction `lookAt`, a 180° quick turn,
   · gyroscope look on phones (DeviceOrientation with screen-orientation compensation; iOS permission on a tap),
   · a live six-view strip 前後左右上下 rendered off-screen from the player's eye (90° each, re-rendered every ~400 ms, paused while
     hidden / a dialogue is open),
   · a 360° equirectangular panorama (6 × 1024 cube map → 4096 × 2048 in a fragment shader, tone-mapped like the main view) with a
     drag-to-pan viewer, PNG save and Web Share. The canvas is returned so the shift codex can keep a「環景照」.
   Pure add-on: it only uses `handle.raw()`, `handle.setFov`, `handle.setView` of theatre3d.js and returns a no-op controller when WebGL
   (`handle.raw`) is missing, so the 2D fallback keeps working. Teaching simulation only; no device settings, no real patients. */
(function (window) {
  'use strict';
  const HT = window.HT = window.HT || {};
  const doc = window.document;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const zh = () => !HT.i18n || typeof HT.i18n.isZh !== 'function' || HT.i18n.isZh();
  const T = (k, z, e) => { let v = null; try { v = HT.i18n && typeof HT.i18n.t === 'function' ? HT.i18n.t(k) : null; } catch (err) { v = null; } return v && v !== k ? v : (zh() ? z : e); };
  const RM = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PI = Math.PI, TAU = Math.PI * 2;
  const wrap = a => ((a + PI) % TAU + TAU) % TAU - PI;               // shortest signed angle
  const PITCH_MAX = 80 * PI / 180;
  const FOV_MIN = 55, FOV_MAX = 120, FOLLOW_CAP = 100;
  const STRIP_W = 160, STRIP_H = 100, STRIP_MS = 400;
  const DIRS = ['front', 'back', 'left', 'right', 'up', 'down'];
  const DIR_TXT = { front: ['wideFront', '前', 'Front'], back: ['wideBack', '後', 'Back'], left: ['wideLeft', '左', 'Left'], right: ['wideRight', '右', 'Right'], up: ['wideUp', '上', 'Up'], down: ['wideDown', '下', 'Down'] };
  const dirName = d => { const x = DIR_TXT[d]; return T(x[0], x[1], x[2]); };
  const store = { get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const now = () => (window.performance && performance.now ? performance.now() : Date.now());

  // ---------------------------------------------------------------- GLSL: the main view is tone-mapped on the way to the screen;
  // render targets are linear, so the off-screen passes apply the same ACES fit (three.js r170, MIT) and sRGB encoding themselves.
  const ACES = `vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 tone(vec3 c, float exposure, float mode){ if (mode < 0.5) return clamp(c * exposure, 0.0, 1.0);
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= exposure / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0); }
vec3 toSRGB(vec3 c){ vec3 lo = c * 12.92; vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055; return mix(lo, hi, step(vec3(0.0031308), c)); }`;
  const QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  // tone pass: flips rows so readRenderTargetPixels (bottom-up) comes out top-down
  const TONE_FRAG = `uniform sampler2D tex; uniform float exposure; uniform float mode; varying vec2 vUv; ${ACES}
void main(){ vec3 c = texture2D(tex, vec2(vUv.x, 1.0 - vUv.y)).rgb; gl_FragColor = vec4(toSRGB(tone(c, exposure, mode)), 1.0); }`;
  // equirect pass: u → longitude (turning right = yaw decreasing, as in theatre3d), v → latitude (row 0 = zenith after readback)
  const EQUI_FRAG = `uniform samplerCube cube; uniform float exposure; uniform float mode; uniform float yaw0; varying vec2 vUv; ${ACES}
void main(){ float lon = (vUv.x - 0.5) * 6.283185307; float lat = (0.5 - vUv.y) * 3.141592654; float yaw = yaw0 - lon; float cl = cos(lat);
  vec3 dir = vec3(sin(yaw) * cl, sin(lat), cos(yaw) * cl); vec3 c = textureCube(cube, dir).rgb; gl_FragColor = vec4(toSRGB(tone(c, exposure, mode)), 1.0); }`;

  // ---------------------------------------------------------------- per-renderer GPU helpers (full-screen quad + the two materials)
  const GPUS = new WeakMap();
  function gpuFor(raw) {
    const r = raw.renderer; let g = GPUS.get(r); if (g) return g;
    const THREE = raw.THREE;
    let floatOK = false; try { floatOK = !!(r.capabilities && r.capabilities.isWebGL2 && (r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float'))); } catch (e) { floatOK = false; }
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); const scene = new THREE.Scene(); const geo = new THREE.PlaneGeometry(2, 2);
    const toneMat = new THREE.ShaderMaterial({ uniforms: { tex: { value: null }, exposure: { value: 1 }, mode: { value: 1 } }, vertexShader: QUAD_VERT, fragmentShader: TONE_FRAG, depthTest: false, depthWrite: false });
    const equiMat = new THREE.ShaderMaterial({ uniforms: { cube: { value: null }, exposure: { value: 1 }, mode: { value: 1 }, yaw0: { value: 0 } }, vertexShader: QUAD_VERT, fragmentShader: EQUI_FRAG, depthTest: false, depthWrite: false });
    const quad = new THREE.Mesh(geo, toneMat); quad.frustumCulled = false; scene.add(quad);
    g = { THREE, type: floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType, floatOK, toneMat, equiMat, maxTex: (r.capabilities && r.capabilities.maxTextureSize) || 4096,
      exposure: () => Number(r.toneMappingExposure) || 1, mode: () => (r.toneMapping === THREE.ACESFilmicToneMapping ? 1 : 0),
      blit(mat, rt) { quad.material = mat; r.setRenderTarget(rt); r.render(scene, cam); } };
    GPUS.set(r, g); return g;
  }
  const rawOf = h => { try { return h && !h.disposed && typeof h.raw === 'function' ? h.raw() : null; } catch (e) { return null; } };
  function playerGroup(raw, handle) {
    const id = (handle && handle.api && handle.api.playerId) || 'player';
    const p = raw.people && raw.people[id]; if (p) return p;
    return (raw.scene.children || []).find(o => o.userData && o.userData.role === id && !o.userData.cast) || null;
  }
  // the player's eye: walk avatar → its head; workbench → the player figure (or the camera itself in first person)
  function eyeOf(raw, handle, out) {
    const w = raw.walk; if (w && w.player) { out.set(w.player.x, 1.62 + (w.player.bob || 0), w.player.z); return out; }
    if (raw.cam.view === 'first') { out.copy(raw.camera.position); return out; }
    const pl = playerGroup(raw, handle); if (pl) { out.set(pl.position.x, 1.62, pl.position.z); return out; }
    out.copy(raw.camera.position); return out;
  }
  // forward angles of the current view (theatre3d convention: dir = (sin yaw·cos pitch, sin pitch, cos yaw·cos pitch))
  const firstLike = cam => cam.view === 'first' || cam.view === 'fp';
  function viewAngles(cam) { if (firstLike(cam)) return { yaw: cam.first.yaw, pitch: cam.first.pitch, kind: 'first' }; if (cam.view === 'follow') return { yaw: cam.fYaw + PI, pitch: cam.fPitch, kind: 'follow' }; return { yaw: cam.yaw + PI, pitch: cam.pitch, kind: 'orbit' }; }
  function setAngles(cam, yaw, pitch) {
    if (firstLike(cam)) { cam.first.yaw = yaw; cam.first.pitch = clamp(pitch, -PITCH_MAX, PITCH_MAX); }
    else if (cam.view === 'follow') { cam.fYaw = yaw - PI; cam.fPitch = clamp(pitch, -1.2, -0.05); }
    else { cam.yaw = yaw - PI; cam.pitch = clamp(pitch, -1.45, -0.05); }
  }
  // run `fn` with the scene prepared for an eye-level off-screen render: no shadow re-render, no first-person hands, no own avatar
  function offscreen(raw, handle, fn) {
    const { renderer, camera } = raw; const player = playerGroup(raw, handle);
    const prev = { rt: renderer.getRenderTarget(), auto: renderer.shadowMap.autoUpdate, camVis: camera.visible, pl: player ? player.visible : null, clear: renderer.autoClear };
    renderer.shadowMap.autoUpdate = false; camera.visible = false; if (player) player.visible = false; renderer.autoClear = true;
    try { return fn(); } finally { renderer.setRenderTarget(prev.rt); renderer.shadowMap.autoUpdate = prev.auto; camera.visible = prev.camVis; if (player) player.visible = prev.pl; renderer.autoClear = prev.clear; }
  }
  const ROOM_NAMES = { or: ['手術室', 'Operating room'], er: ['急診室', 'Emergency bay'], ward: ['病房', 'Ward'], icu: ['加護病房', 'ICU'], clinic: ['診間', 'Clinic'], imaging: ['檢查室', 'Procedure room'], lab: ['檢驗室', 'Laboratory'], reading: ['判讀室', 'Reading room'], dental: ['牙科診療室', 'Dental operatory'], 'tcm-clinic': ['中醫診間', 'TCM clinic'], acupuncture: ['針灸治療室', 'Acupuncture room'], 'herbal-pharmacy': ['中藥局', 'Herbal pharmacy'], tuina: ['推拿治療室', 'Tuina room'], 'decoction-lab': ['中藥品管實驗室', 'Herbal QC lab'], cssd: ['消毒供應中心', 'Sterile services (CSSD)'], 'biomed-lab': ['生醫工程實驗室', 'Biomedical engineering lab'] };
  const roomLabel = type => { const n = ROOM_NAMES[type]; return n ? (zh() ? n[0] : n[1]) : String(type || ''); };
  const deptLabel = id => { if (!id) return ''; const m = ((window.HT_DEPARTMENTS || {}).departments || []).find(d => d.id === id); return m ? (zh() ? (m.title || id) : (m.titleEn || m.title || id)) : String(id).replace(/-/g, ' '); };
  const stamp = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

  // ---------------------------------------------------------------- 360° panorama (equirectangular 4096×2048 by default)
  async function capturePanorama(handle, opts) {
    opts = opts || {}; const raw = rawOf(handle); if (!raw || !raw.renderer) throw new Error('3D scene unavailable');
    const g = gpuFor(raw), THREE = raw.THREE;
    const W = Math.max(512, Math.min(g.maxTex, 2 * Math.round((Number(opts.size) || 4096) / 2))), H = W / 2;
    const face = Math.max(256, Math.min(g.maxTex, Number(opts.face) || Math.min(1024, W / 4)));
    // give the caller's "capturing…" toast a frame to paint before the heavy work
    if (opts.sync !== true) await new Promise(r => (window.requestAnimationFrame || setTimeout)(() => setTimeout(r, 0)));
    if (handle.disposed) throw new Error('3D scene disposed');
    const cubeRT = new THREE.WebGLCubeRenderTarget(face, { type: g.type, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const cubeCam = new THREE.CubeCamera(0.05, 80, cubeRT);
    const rtP = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
    const buf = new Uint8Array(W * H * 4);
    const yaw0 = Number.isFinite(opts.yaw) ? opts.yaw : viewAngles(raw.cam).yaw;
    const t0 = now();
    try {
      offscreen(raw, handle, () => {
        eyeOf(raw, handle, cubeCam.position); cubeCam.updateMatrixWorld(true); cubeCam.update(raw.renderer, raw.scene);
        g.equiMat.uniforms.cube.value = cubeRT.texture; g.equiMat.uniforms.exposure.value = g.exposure(); g.equiMat.uniforms.mode.value = g.mode(); g.equiMat.uniforms.yaw0.value = yaw0;
        g.blit(g.equiMat, rtP); raw.renderer.readRenderTargetPixels(rtP, 0, 0, W, H, buf);
      });
    } finally { cubeRT.dispose(); rtP.dispose(); }
    const canvas = doc.createElement('canvas'); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
    ctx.putImageData(new window.ImageData(new Uint8ClampedArray(buf.buffer), W, H), 0, 0);
    const room = opts.room || roomLabel(raw.type || (handle.info && handle.info().room)), dept = opts.department || deptLabel(handle.api && handle.api.c && handle.api.c.department);
    const when = new Date();
    if (opts.caption !== false) caption(ctx, W, H, [room, dept].filter(Boolean).join(' · '), T('wideCaption', '華佗學院 · 教學模擬', 'Hua Tuo Academy · teaching simulation') + ' · ' + when.toLocaleString());
    canvas.dataset.room = String(raw.type || ''); canvas.dataset.yaw = String(+yaw0.toFixed(3)); canvas.dataset.ms = String(Math.round(now() - t0)); canvas.dataset.file = `huatuo-360-${String(raw.type || 'room').replace(/[^a-z0-9-]/gi, '')}-${stamp(when)}.png`;
    return canvas;
  }
  function caption(ctx, W, H, left, right) {
    const band = Math.round(H * 0.052), fs = Math.round(band * 0.42), pad = Math.round(band * 0.5);
    const grad = ctx.createLinearGradient(0, H - band * 1.6, 0, H); grad.addColorStop(0, 'rgba(8,14,18,0)'); grad.addColorStop(1, 'rgba(8,14,18,.78)'); ctx.fillStyle = grad; ctx.fillRect(0, H - band * 1.6, W, band * 1.6);
    ctx.font = `600 ${fs}px system-ui, "Noto Sans TC", "PingFang TC", sans-serif`; ctx.textBaseline = 'middle'; ctx.fillStyle = '#eef6f3'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = fs * 0.25;
    ctx.textAlign = 'left'; ctx.fillText(left, pad, H - band * 0.55, W * 0.55); ctx.textAlign = 'right'; ctx.fillStyle = '#bfe6d8'; ctx.fillText(right, W - pad, H - band * 0.55, W * 0.42);
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(0, H - band * 1.6, W, 2);
  }

  // ---------------------------------------------------------------- panorama viewer overlay (drag to pan with wrap-around, wheel / pinch to zoom, save, share)
  function openViewer(canvas, opts) {
    opts = opts || {}; const parent = doc.fullscreenElement || doc.body;
    const canShare = !!(window.navigator && navigator.share && navigator.canShare && window.File);
    const el = doc.createElement('div'); el.className = 'wd-viewer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', T('widePanoTitle', '360° 環景照', '360° panorama'));
    el.innerHTML = `<div class="wd-viewer-bar"><b>🌐 ${esc(T('widePanoTitle', '360° 環景照', '360° panorama'))}</b><span class="wd-viewer-meta">${esc(opts.title || '')}</span><span class="wd-viewer-hint">${esc(T('wideViewerHint', '拖曳環視 · 滾輪／雙指縮放', 'Drag to look around · wheel / pinch to zoom'))}</span>
      <button type="button" class="wd-btn" data-wd-save>💾 ${esc(T('wideSave', '儲存圖片', 'Save image'))}</button>${canShare ? `<button type="button" class="wd-btn" data-wd-share>📤 ${esc(T('wideShare', '分享', 'Share'))}</button>` : ''}<button type="button" class="wd-btn wd-close" data-wd-close aria-label="${esc(T('wideClose', '關閉', 'Close'))}">✕</button></div><canvas class="wd-viewer-cv"></canvas><div class="wd-viewer-foot">${esc(T('wideCaption', '華佗學院 · 教學模擬', 'Hua Tuo Academy · teaching simulation'))} · ${canvas.width}×${canvas.height}</div>`;
    parent.appendChild(el);
    const cv = el.querySelector('.wd-viewer-cv'), ctx = cv.getContext('2d'); const W = canvas.width, H = canvas.height;
    const st = { u: 0, v: 0.5, zoom: 1, ptrs: new Map(), pinch: 0, drag: null, raf: 0 };
    function draw() {
      st.raf = 0; const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); const cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      // the image is scaled so its height fills the view at zoom 1 (a 2:1 panorama: wider than the screen → pans with wrap-around)
      const scale = (ch / H) * st.zoom; const dw = W * scale, dh = H * scale; const cx = cw / 2, cy = ch / 2;
      const maxV = Math.max(0, (dh - ch) / 2 / dh); st.v = clamp(st.v, 0.5 - maxV, 0.5 + maxV);
      const y = cy - st.v * dh; let x = cx - st.u * dw; x = ((x % dw) + dw) % dw - dw;
      ctx.fillStyle = '#070b0e'; ctx.fillRect(0, 0, cw, ch); ctx.imageSmoothingQuality = 'high';
      for (let xx = x; xx < cw; xx += dw) ctx.drawImage(canvas, xx, y, dw, dh);
      // compass ticks: 前 後 左 右 along the horizon
      ctx.font = `${Math.round(12 * dpr)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.75)';
      [['front', 0], ['right', 0.25], ['back', 0.5], ['left', 0.75]].forEach(([d, u]) => { let tx = cx + (u - st.u) * dw; tx = ((tx % dw) + dw) % dw; if (tx > cw) tx -= dw; ctx.fillText(dirName(d), tx, ch - 10 * dpr); });
    }
    const req = () => { if (!st.raf) st.raf = requestAnimationFrame(draw); };
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); st.ptrs.set(e.pointerId, e); if (st.ptrs.size === 2) { const [a, b] = [...st.ptrs.values()]; st.pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); st.drag = null; } else st.drag = { x: e.clientX, y: e.clientY, u: st.u, v: st.v }; });
    cv.addEventListener('pointermove', e => { if (!st.ptrs.has(e.pointerId)) return; st.ptrs.set(e.pointerId, e); const r = cv.getBoundingClientRect(); const dh = r.height * st.zoom, dw = dh * 2;
      if (st.ptrs.size === 2) { const [a, b] = [...st.ptrs.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (st.pinch) st.zoom = clamp(st.zoom * d / st.pinch, 0.5, 4); st.pinch = d; req(); return; }
      if (!st.drag) return; st.u = st.drag.u - (e.clientX - st.drag.x) / dw; st.v = st.drag.v - (e.clientY - st.drag.y) / dh; req(); });
    const up = e => { st.ptrs.delete(e.pointerId); if (st.ptrs.size < 2) st.pinch = 0; if (!st.ptrs.size) st.drag = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); st.zoom = clamp(st.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 4); req(); }, { passive: false });
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'ArrowLeft') { st.u -= 0.04; req(); } else if (e.key === 'ArrowRight') { st.u += 0.04; req(); } };
    const onResize = () => req();
    window.addEventListener('keydown', onKey, true); window.addEventListener('resize', onResize);
    const file = canvas.dataset.file || `huatuo-360-${stamp(new Date())}.png`;
    const blob = () => new Promise((res, rej) => { try { canvas.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), 'image/png'); } catch (e) { rej(e); } });
    el.querySelector('[data-wd-save]').onclick = async () => { const b = el.querySelector('[data-wd-save]'); b.disabled = true; try { const bl = await blob(); const url = URL.createObjectURL(bl); const a = doc.createElement('a'); a.href = url; a.download = file; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); if (opts.toast) opts.toast(T('wideSaved', '已儲存環景照', 'Panorama saved')); } catch (e) { try { window.open(canvas.toDataURL('image/png'), '_blank'); } catch (err) { /* ignore */ } } b.disabled = false; };
    const sh = el.querySelector('[data-wd-share]'); if (sh) sh.onclick = async () => { try { const bl = await blob(); const f = new window.File([bl], file, { type: 'image/png' }); const data = { files: [f], title: T('widePanoTitle', '360° 環景照', '360° panorama'), text: (opts.title ? opts.title + ' · ' : '') + T('wideCaption', '華佗學院 · 教學模擬', 'Hua Tuo Academy · teaching simulation') }; if (navigator.canShare(data)) await navigator.share(data); else await navigator.share({ title: data.title, text: data.text }); } catch (e) { /* cancelled */ } };
    function close() { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); if (st.raf) cancelAnimationFrame(st.raf); el.remove(); if (opts.onClose) opts.onClose(); }
    el.querySelector('[data-wd-close]').onclick = close; el.addEventListener('click', e => { if (e.target === el) close(); });
    draw(); setTimeout(() => { try { el.querySelector('[data-wd-close]').focus(); } catch (e) { /* ignore */ } }, 0);
    return { el, close, redraw: req };
  }

  // ---------------------------------------------------------------- attach(handle, host, opts) → ctl
  const NOOP = () => {};
  function noopCtl() { return { noop: true, destroyed: false, setFov: NOOP, fov: () => 0, toggleStrip: () => false, togglePanorama: () => Promise.resolve(null), toggleGyro: () => false, quickTurn: NOOP, lookAt: NOOP, pause: NOOP, resume: NOOP, capture: () => Promise.reject(new Error('3D scene unavailable')), destroy() { this.destroyed = true; } }; }
  function attach(handle, host, opts) {
    opts = opts || {}; const raw = rawOf(handle); if (!raw || !raw.renderer || !raw.cam) return noopCtl();
    host = host || handle.el || raw.renderer.domElement.parentNode; if (!host) return noopCtl();
    const THREE = raw.THREE, cam = raw.cam, g = gpuFor(raw); const gyroAPI = typeof window.DeviceOrientationEvent !== 'undefined';
    const needsPerm = gyroAPI && typeof window.DeviceOrientationEvent.requestPermission === 'function';
    const toast = opts.toast || (msg => { if (HT.app && HT.app.toast) HT.app.toast(msg); });
    const S = { destroyed: false, strip: null, viewer: null, gyro: null, anim: null, paused: false, lookBase: null, lastEye: [0, 0], busy: false };
    // ---- the control cluster
    const root = doc.createElement('div'); root.className = 'wd-ctl' + (opts.compact ? ' compact' : ''); root.setAttribute('role', 'group'); root.setAttribute('aria-label', T('wideAria', '廣角與環視控制', 'Wide-angle and look-around controls'));
    const fovTip = T('wideFovTip', '視野 55–120°（第一人稱可到 120°；跟隨視角最大 100°）', 'Field of view 55–120° (first person up to 120°; the follow camera caps at 100°)');
    root.innerHTML = `<div class="wd-row wd-fov" title="${esc(fovTip)}"><label><span class="wd-lab">${esc(T('wideFov', '視野', 'FOV'))}</span><input type="range" min="${FOV_MIN}" max="${FOV_MAX}" step="1" value="${Math.round(clamp(Number(handle.getFov ? handle.getFov() : cam.wfov) || 70, FOV_MIN, FOV_MAX))}" data-wd-fov aria-label="${esc(T('wideFov', '視野', 'FOV'))}"></label><output data-wd-fov-out>70°</output></div>
      <div class="wd-row wd-btns"><button type="button" class="wd-b" data-wd-turn title="${esc(T('wideTurn', '快速回頭', 'Quick turn'))}" aria-label="${esc(T('wideTurn', '快速回頭', 'Quick turn'))}">🔁</button><button type="button" class="wd-b" data-wd-strip aria-pressed="false" title="${esc(T('wideStrip', '六向視圖', 'Six-view strip'))}" aria-label="${esc(T('wideStrip', '六向視圖', 'Six-view strip'))}">🧭</button><button type="button" class="wd-b" data-wd-pano title="${esc(T('widePano', '360° 環景照', '360° panorama'))}" aria-label="${esc(T('widePano', '360° 環景照', '360° panorama'))}">🌐</button>${gyroAPI ? `<button type="button" class="wd-b" data-wd-gyro aria-pressed="false" title="${esc(T('wideGyro', '陀螺儀環視', 'Gyroscope look'))}" aria-label="${esc(T('wideGyro', '陀螺儀環視', 'Gyroscope look'))}">📱</button>` : `<button type="button" class="wd-b" data-wd-gyro disabled aria-disabled="true" title="${esc(T('wideGyroNone', '此裝置沒有陀螺儀', 'No gyroscope on this device'))}" aria-label="${esc(T('wideGyroNone', '此裝置沒有陀螺儀', 'No gyroscope on this device'))}">📱</button>`}</div>
      <div class="wd-pad" title="${esc(T('wideNudgeTip', '環視：點按或 Alt+方向鍵、[ ] 左右、- = 上下', 'Look around: tap, or Alt+arrows, [ ] yaw, - = pitch'))}"><button type="button" class="wd-b" data-wd-look="up" aria-label="${esc(dirName('up'))}">⬆</button><button type="button" class="wd-b" data-wd-look="left" aria-label="${esc(dirName('left'))}">⬅</button><button type="button" class="wd-b wd-eye" data-wd-look="front" aria-label="${esc(T('wideLookFront', '回正前方', 'Face front'))}" title="${esc(T('wideLookFront', '回正前方', 'Face front'))}">👁</button><button type="button" class="wd-b" data-wd-look="right" aria-label="${esc(dirName('right'))}">➡</button><button type="button" class="wd-b" data-wd-look="down" aria-label="${esc(dirName('down'))}">⬇</button></div>`;
    host.appendChild(root);
    const q = s => root.querySelector(s); const fovIn = q('[data-wd-fov]'), fovOut = q('[data-wd-fov-out]');
    const capTxt = T('wideFovFollowCap', '跟隨視角 ≤100°', 'follow ≤100°');
    function showFov() { const v = Math.round(ctl.fov()); fovOut.textContent = v + '°' + (v > FOLLOW_CAP && cam.view === 'follow' ? ' · ' + capTxt : ''); if (Number(fovIn.value) !== v) fovIn.value = v; }
    fovIn.addEventListener('input', () => ctl.setFov(Number(fovIn.value)));
    // ---- tweens (one at a time; reduced motion → instant)
    // rAF-driven ease-out; a timer guarantees the end state even when frames stall (software GL, background tab)
    function tween(ms, step) { if (S.anim) { cancelAnimationFrame(S.anim.raf); clearTimeout(S.anim.to); S.anim = null; } if (RM() || ms <= 0) { step(1); return; } const t0 = now(); const a = { raf: 0, to: 0 }; S.anim = a; const end = () => { if (S.anim === a) { clearTimeout(a.to); S.anim = null; step(1); } }; const f = () => { if (S.destroyed || S.anim !== a) return; const k = Math.min(1, (now() - t0) / ms); if (k < 1) { step(1 - Math.pow(1 - k, 3)); a.raf = requestAnimationFrame(f); } else end(); }; a.raf = requestAnimationFrame(f); a.to = setTimeout(() => { if (!S.destroyed) end(); }, ms + 40); }
    function turnTo(yaw, pitch, ms) { const a0 = viewAngles(cam); const dy = wrap(yaw - a0.yaw), dp = (pitch == null ? a0.pitch : pitch) - a0.pitch; tween(ms, k => setAngles(cam, a0.yaw + dy * k, a0.pitch + dp * k)); }
    // "front" is where the body was heading before this run of look-around calls; walking or dragging resets it
    function baseYaw() { const eye = raw.walk && raw.walk.player ? [raw.walk.player.x, raw.walk.player.z] : [raw.camera.position.x, raw.camera.position.z]; const moved = Math.hypot(eye[0] - S.lastEye[0], eye[1] - S.lastEye[1]) > 0.05; const dragged = cam.lastDrag !== S.lastDrag; if (S.lookBase == null || moved || dragged) S.lookBase = raw.walk && raw.walk.player && cam.view === 'follow' ? raw.walk.player.yaw : viewAngles(cam).yaw; S.lastEye = eye; S.lastDrag = cam.lastDrag; return S.lookBase; }
    // ---- keyboard: Alt+arrows, [ ] yaw, - = pitch (plain arrows and WASD keep walking)
    const STEP = 10 * PI / 180;
    function nudge(dyaw, dpitch) { const a = viewAngles(cam); setAngles(cam, a.yaw + dyaw, a.pitch + dpitch); }
    const onKey = e => { if (S.destroyed || e.ctrlKey || e.metaKey) return; const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const k = e.key; let used = true;
      if (e.altKey && k === 'ArrowLeft') nudge(STEP, 0); else if (e.altKey && k === 'ArrowRight') nudge(-STEP, 0); else if (e.altKey && k === 'ArrowUp') nudge(0, STEP); else if (e.altKey && k === 'ArrowDown') nudge(0, -STEP);
      else if (k === '[') nudge(STEP, 0); else if (k === ']') nudge(-STEP, 0); else if (k === '-' || k === '_') nudge(0, -STEP); else if (k === '=' || k === '+') nudge(0, STEP); else used = false;
      if (used) { e.preventDefault(); S.lookBase = null; } };
    window.addEventListener('keydown', onKey);
    // ---- gyroscope look
    const gyroBtn = q('[data-wd-gyro]');
    function gyroStart() {
      const euler = new THREE.Euler(), qq = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), qs = new THREE.Quaternion(), zee = new THREE.Vector3(0, 0, 1), fwd = new THREE.Vector3(); const D2R = PI / 180;
      const G = { off: null, last: 0 };
      const orient = () => { const so = window.screen && window.screen.orientation; const a = so && typeof so.angle === 'number' ? so.angle : (typeof window.orientation === 'number' ? window.orientation : 0); return a * D2R; };
      G.on = ev => { if (S.destroyed || ev.alpha == null || ev.beta == null) return; if (cam.view === 'follow' && handle.setView) { handle.setView('fp'); if (opts.onView) opts.onView('fp'); }
        euler.set(ev.beta * D2R, ev.alpha * D2R, -ev.gamma * D2R, 'YXZ'); qq.setFromEuler(euler); qq.multiply(q1); qq.multiply(qs.setFromAxisAngle(zee, -orient()));
        fwd.set(0, 0, -1).applyQuaternion(qq); const yaw = Math.atan2(fwd.x, fwd.z), pitch = Math.asin(clamp(fwd.y, -1, 1));
        if (G.off == null) G.off = wrap(viewAngles(cam).yaw - yaw);                      // start where the player is looking now
        const a = viewAngles(cam); const ty = yaw + G.off; setAngles(cam, a.yaw + wrap(ty - a.yaw) * 0.35, a.pitch + (clamp(pitch, -PITCH_MAX, PITCH_MAX) - a.pitch) * 0.35); S.lookBase = null; };
      window.addEventListener('deviceorientation', G.on, true); S.gyro = G; gyroBtn.setAttribute('aria-pressed', 'true'); gyroBtn.classList.add('on'); store.set('ht-gyro', '1');
    }
    function gyroStop() { if (S.gyro) { window.removeEventListener('deviceorientation', S.gyro.on, true); S.gyro = null; } gyroBtn.setAttribute('aria-pressed', 'false'); gyroBtn.classList.remove('on'); }
    function gyroToggle(on) {
      if (!gyroAPI) return false; const want = on === undefined ? !S.gyro : !!on; if (!want) { gyroStop(); store.set('ht-gyro', '0'); return false; } if (S.gyro) return true;
      if (needsPerm) { window.DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') gyroStart(); else toast(T('wideGyroDenied', '未取得動作感測權限；可在瀏覽器設定中開啟', 'Motion access was not granted; enable it in the browser settings')); }).catch(() => toast(T('wideGyroDenied', '未取得動作感測權限；可在瀏覽器設定中開啟', 'Motion access was not granted; enable it in the browser settings'))); return true; }
      gyroStart(); return true;
    }
    // ---- six-view strip
    function makeStrip() {
      const el = doc.createElement('div'); el.className = 'wd-strip'; el.setAttribute('role', 'img'); el.setAttribute('aria-label', T('wideStripAria', '六向視圖：前、後、左、右、上、下', 'Six-view strip: front, back, left, right, up, down'));
      const tiles = DIRS.map(d => { const f = doc.createElement('figure'); f.className = 'wd-tile'; f.dataset.dir = d; f.setAttribute('role', 'button'); f.tabIndex = 0; f.title = dirName(d); const c = doc.createElement('canvas'); c.width = STRIP_W; c.height = STRIP_H; const cap = doc.createElement('figcaption'); cap.textContent = dirName(d); f.appendChild(c); f.appendChild(cap); el.appendChild(f);
        const go = e => { e.preventDefault(); ctl.lookAt(d); }; f.onclick = go; f.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') go(e); }; return { d, cv: c, ctx: c.getContext('2d') }; });
      el.addEventListener('pointerdown', e => e.stopPropagation()); host.appendChild(el);
      const rtA = new THREE.WebGLRenderTarget(STRIP_W, STRIP_H, { type: g.type, depthBuffer: true, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      const rtB = new THREE.WebGLRenderTarget(6 * STRIP_W, STRIP_H, { type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, generateMipmaps: false }); rtB.scissorTest = true;
      const buf = new Uint8Array(6 * STRIP_W * STRIP_H * 4); const img = new window.ImageData(new Uint8ClampedArray(buf.buffer), 6 * STRIP_W, STRIP_H);
      const scratch = doc.createElement('canvas'); scratch.width = 6 * STRIP_W; scratch.height = STRIP_H; const sctx = scratch.getContext('2d');
      const tcam = new THREE.PerspectiveCamera(90, STRIP_W / STRIP_H, 0.05, 80); const eye = new THREE.Vector3(), look = new THREE.Vector3();
      const st = { timer: 0, last: 0, sig: '', ms: STRIP_MS, renders: 0, cost: 0 };
      function render() {
        const t0 = now(); const yaw = viewAngles(cam).yaw; const mood = handle.mood ? handle.mood() : '';
        offscreen(raw, handle, () => {
          eyeOf(raw, handle, eye);
          for (let i = 0; i < 6; i++) {
            const d = DIRS[i]; const y = d === 'back' ? yaw + PI : d === 'left' ? yaw + PI / 2 : d === 'right' ? yaw - PI / 2 : yaw;
            if (d === 'up') { look.set(eye.x, eye.y + 1, eye.z); tcam.up.set(-Math.sin(yaw), 0, -Math.cos(yaw)); }
            else if (d === 'down') { look.set(eye.x, eye.y - 1, eye.z); tcam.up.set(Math.sin(yaw), 0, Math.cos(yaw)); }
            else { look.set(eye.x + Math.sin(y), eye.y, eye.z + Math.cos(y)); tcam.up.set(0, 1, 0); }
            tcam.position.copy(eye); tcam.lookAt(look); tcam.updateMatrixWorld(true);
            raw.renderer.setRenderTarget(rtA); raw.renderer.render(raw.scene, tcam);
            g.toneMat.uniforms.tex.value = rtA.texture; g.toneMat.uniforms.exposure.value = g.exposure(); g.toneMat.uniforms.mode.value = g.mode();
            rtB.viewport.set(i * STRIP_W, 0, STRIP_W, STRIP_H); rtB.scissor.set(i * STRIP_W, 0, STRIP_W, STRIP_H); g.blit(g.toneMat, rtB);
          }
          raw.renderer.readRenderTargetPixels(rtB, 0, 0, 6 * STRIP_W, STRIP_H, buf);
        });
        sctx.putImageData(img, 0, 0); tiles.forEach((t, i) => t.ctx.drawImage(scratch, i * STRIP_W, 0, STRIP_W, STRIP_H, 0, 0, STRIP_W, STRIP_H));
        st.sig = [eye.x.toFixed(2), eye.y.toFixed(2), eye.z.toFixed(2), yaw.toFixed(2), mood].join('|'); st.last = now(); st.renders++; st.cost = st.last - t0;
        st.ms = st.cost > 90 ? 1600 : st.cost > 45 ? 800 : STRIP_MS;   // back off on weak GPUs / software renderers
        el.classList.add('live');
      }
      function tick() {
        st.timer = 0; if (S.destroyed || !S.strip) return;
        if (!(S.paused || S.busy || doc.hidden || handle.disposed || (opts.busy && opts.busy()))) {
          try { eyeOf(raw, handle, eye); const sig = [eye.x.toFixed(2), eye.y.toFixed(2), eye.z.toFixed(2), viewAngles(cam).yaw.toFixed(2), handle.mood ? handle.mood() : ''].join('|');
            if (sig !== st.sig || now() - st.last > 1600) render(); } catch (e) { /* a lost context: try again later */ }
        }
        st.timer = setTimeout(tick, st.ms);
      }
      st.timer = setTimeout(tick, 30);
      return { el, tiles, st, renderNow: render, dispose() { clearTimeout(st.timer); rtA.dispose(); rtB.dispose(); el.remove(); } };
    }
    const stripBtn = q('[data-wd-strip]');
    function stripToggle(on) { const want = on === undefined ? !S.strip : !!on; if (want && !S.strip) { S.strip = makeStrip(); } else if (!want && S.strip) { S.strip.dispose(); S.strip = null; } stripBtn.setAttribute('aria-pressed', String(!!S.strip)); stripBtn.classList.toggle('on', !!S.strip); store.set('ht-wide-strip', S.strip ? '1' : '0'); return !!S.strip; }
    // ---- panorama
    const panoBtn = q('[data-wd-pano]');
    async function panoToggle() {
      if (S.viewer) { S.viewer.close(); return null; }
      if (panoBtn.disabled) return null; panoBtn.disabled = true; panoBtn.classList.add('busy'); toast(T('wideCapturing', '正在拍攝 360° 環景…', 'Capturing the 360° panorama…'));
      try { const title = [roomLabel(raw.type), deptLabel(handle.api && handle.api.c && handle.api.c.department)].filter(Boolean).join(' · ');
        const canvas = await capturePanorama(handle, { size: opts.panoSize || 4096, room: opts.room, department: opts.department });
        if (S.destroyed) return canvas; S.lastPano = canvas; if (opts.onPanorama) { try { opts.onPanorama(canvas); } catch (e) { /* ignore */ } }
        S.viewer = openViewer(canvas, { title: opts.title || title, toast, onClose: () => { S.viewer = null; panoBtn.classList.remove('on'); } }); panoBtn.classList.add('on'); return canvas; }
      catch (e) { toast(T('widePanoFailed', '環景拍攝失敗', 'Panorama capture failed')); return null; }
      finally { panoBtn.disabled = false; panoBtn.classList.remove('busy'); }
    }
    // ---- wiring
    q('[data-wd-turn]').onclick = () => ctl.quickTurn(); stripBtn.onclick = () => stripToggle(); panoBtn.onclick = () => { panoToggle(); }; if (gyroAPI) gyroBtn.onclick = () => gyroToggle();
    root.querySelectorAll('[data-wd-look]').forEach(b => { b.onclick = () => ctl.lookAt(b.dataset.look); });
    root.addEventListener('pointerdown', e => e.stopPropagation()); root.addEventListener('keydown', e => e.stopPropagation());
    const onVis = () => { /* the strip tick checks document.hidden itself; nothing else to do */ };
    doc.addEventListener('visibilitychange', onVis);
    const watch = setInterval(() => { if (S.destroyed) return; if (handle.disposed || !root.isConnected) { ctl.destroy(); return; } showFov(); }, 500);
    const ctl = {
      noop: false, el: root, destroyed: false,
      setFov(deg) { const v = clamp(Number(deg) || 70, FOV_MIN, FOV_MAX); if (typeof handle.setFov === 'function') handle.setFov(v); else cam.wfov = v; showFov(); return v; },
      fov() { try { return typeof handle.getFov === 'function' ? handle.getFov() : cam.wfov; } catch (e) { return cam.wfov; } },
      toggleStrip: stripToggle, togglePanorama: panoToggle, toggleGyro: gyroToggle,
      capture: o => capturePanorama(handle, Object.assign({ room: opts.room, department: opts.department }, o || {})),
      quickTurn() { const a = viewAngles(cam); const p = a.pitch; const y0 = a.yaw; tween(250, k => setAngles(cam, y0 + PI * k, p)); S.lookBase = null; },
      lookAt(dir) { if (!DIRS.includes(dir)) return; const base = baseYaw(); const a = viewAngles(cam); const ms = 350;
        if ((dir === 'up' || dir === 'down') && cam.view === 'follow' && typeof handle.setView === 'function') { handle.setView('fp'); if (opts.onView) opts.onView('fp'); }
        if (dir === 'up') turnTo(a.yaw, PITCH_MAX, ms); else if (dir === 'down') turnTo(a.yaw, -PITCH_MAX, ms);
        else turnTo(dir === 'front' ? base : dir === 'back' ? base + PI : dir === 'left' ? base + PI / 2 : base - PI / 2, firstLike(cam) ? 0 : null, ms); },
      pause() { S.paused = true; if (S.strip) S.strip.el.classList.add('paused'); }, resume() { S.paused = false; if (S.strip) S.strip.el.classList.remove('paused'); },
      strip: () => S.strip, viewer: () => S.viewer, lastPanorama: () => S.lastPano || null, animating: () => !!S.anim,
      destroy() { if (S.destroyed) return; S.destroyed = true; ctl.destroyed = true; clearInterval(watch); window.removeEventListener('keydown', onKey); doc.removeEventListener('visibilitychange', onVis); if (S.anim) { cancelAnimationFrame(S.anim.raf); clearTimeout(S.anim.to); } gyroStop(); if (S.strip) { S.strip.dispose(); S.strip = null; } if (S.viewer) S.viewer.close(); root.remove(); }
    };
    showFov();
    if (opts.strip === true || (opts.strip !== false && store.get('ht-wide-strip') === '1')) stripToggle(true);
    return ctl;
  }

  HT.theatre3dWide = { attach, capturePanorama, openViewer, version: '4.1', FOV: [FOV_MIN, FOV_MAX], DIRS };
})(window);
