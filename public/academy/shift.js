/* 值班模式 Shift mode (v4.1) — a full-screen, walk-around, one-shift story game for every department, western and
   TCM, with several cases per department. Entry card (case list, name, role, "start now" from the real clock) → the
   case's 3D room (theatre3d walk mode when available; a 2D top-down floor plan without WebGL or on request) → segs
   with title cards → beats: guided "next step" + "take me there", typed dialogue with tappable glossary, phone calls
   and messages, mini-games (workbench stage / whole procedure, precision-field drill, imaging & twin panel, choice,
   order, vitals monitor, find-the-object, and the TCM stations: pulse 脈診, tongue 舌診, points 取穴, herb 配伍), a
   codex of people / places / items / equipment, a wide-angle 🌐 camera cluster with 360° panoramas, save & resume,
   and a 9:16 ending card to save or share. Data: data/shifts/<department>.json (case `main`) and
   data/shifts/<department>--<case>.json (format huatuo-shift-v1 / v2, validated by tools/build_shifts.py).
   Design inspired by the one-shift game form; all code and assets are the academy's own. Teaching simulation only —
   fictional patients, no doses, herb weights, needle depths or device settings. */
(function (window) {
  'use strict';
  const document = window.document;
  const HT = window.HT = window.HT || {};
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const zh = () => !HT.i18n || HT.i18n.isZh();
  const say = (z, e) => zh() ? z : e;
  const T = (k, z, e) => { const v = HT.i18n && HT.i18n.t ? HT.i18n.t(k) : null; return v && v !== k ? v : say(z, e); };
  const t = k => T(k, k, k);
  const bl = v => v && typeof v === 'object' ? (zh() ? (v.zh || v.en || '') : (v.en || v.zh || '')) : String(v == null ? '' : v);
  const FILE = location.protocol === 'file:';
  const SITE_URL = 'https://kuonanhong.github.io/Hua-Tuo-Medical-Biomedical-Academy/';
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const FAST = () => !!(window.__HT_SHIFT_FAST || store.get('ht-shift-fast') === '1');
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
  const json = (k, d) => { try { return JSON.parse(store.get(k) || 'null') || d; } catch (e) { return d; } };
  const pad = n => String(n).padStart(2, '0');
  const hhmm = m => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uid = () => { const u = HT.account && HT.account.user && HT.account.user(); return (u && (u.id || u.username)) || 'guest'; };
  const TCM = 'tcm-fundamentals tcm-classics tcm-diagnosis acupuncture-technique moxa-cupping tuina thai-massage qigong tcm-internal tcm-specialties tcm-diet tcm-intern-clinic acupoints herbs formulas'.split(' ');
  const WESTERN = 'neurosurgery neurology cardiology cardiac-surgery vascular-surgery thoracic-surgery orthopedics joint-reconstruction spine general-surgery urology ent ophthalmology plastic-surgery obstetrics gynecology pediatric-surgery anesthesiology pain-medicine dentistry emergency critical-care gastroenterology pulmonology nephrology endocrinology rheumatology hematology oncology radiation-oncology infectious-disease dermatology psychiatry pediatrics rehabilitation geriatrics-family radiology pathology-lab nursing pharmacology public-health medical-genetics foundations'.split(' ');
  const FAC = { western: { zh: '西醫臨床', en: 'Western clinical', accent: '#2f6f8f', key: 'shiftFacultyWestern' }, tcm: { zh: '中醫藥針灸推拿', en: 'TCM · acupuncture · tuina', accent: '#b5432f', key: 'shiftFacultyTcm' } };
  const facultyOf = id => { const m = ((window.HT_DEPARTMENTS || {}).departments || []).find(d => d.id === id); return (m && m.faculty === 'tcm') || TCM.includes(id) ? 'tcm' : 'western'; };
  const deptMeta = id => ((window.HT_DEPARTMENTS || {}).departments || []).find(d => d.id === id) || { id, title: id, titleEn: id, glyph: facultyOf(id) === 'tcm' ? 'yinyang' : 'stethoscope', accent: FAC[facultyOf(id)].accent, faculty: facultyOf(id) };
  const deptName = m => zh() ? (m.title || m.id) : (m.titleEn || m.title || m.id);
  const facName = f => T(FAC[f].key, FAC[f].zh, FAC[f].en);
  // case ids: `main` is data/shifts/<dept>.json (v4.0 key), every other case is data/shifts/<dept>--<case>.json
  const shiftId = (dept, cas) => !cas || cas === 'main' ? dept : dept + '--' + cas;
  const saveKeyFor = (dept, cas, role) => `ht-shift:${shiftId(dept, cas)}:${role}`;
  const caseCount = n => (n => { const L = (window.HT.i18n && window.HT.i18n.current) || 'en'; const w = window.HT.i18n && window.HT.i18n.t ? window.HT.i18n.t('shiftCases') : ''; return /^zh/.test(L) ? `${n} 個病例` : L === 'en' || !w || w === 'shiftCases' ? `${n} case${n === 1 ? '' : 's'}` : `${n} ${w}`; })(n);

  // ---------------------------------------------------------------- data
  let indexP = null; const shifts = {};
  // index v1 rows carry only `department`; v2 rows add id / case / caseTitle / condition / difficulty / faculty
  function normIndex(idx) { (idx.shifts || []).forEach(s => { s.id = s.id || s.department; s.case = s.case || 'main'; s.faculty = s.faculty || facultyOf(s.department); s.caseTitle = s.caseTitle || s.title; s.difficulty = s.difficulty || 2; }); idx.shifts = (idx.shifts || []).slice().sort((a, b) => a.department.localeCompare(b.department) || (a.case === 'main' ? -1 : b.case === 'main' ? 1 : a.case.localeCompare(b.case))); return idx; }
  const casesOf = (idx, dept) => (idx && idx.shifts || []).filter(s => s.department === dept);
  const deptsOf = idx => [...new Set((idx && idx.shifts || []).map(s => s.department))];
  function loadIndex() {
    if (window.HT_SHIFT_INDEX) return Promise.resolve(normIndex(window.HT_SHIFT_INDEX));
    if (!indexP) {
      const viaScript = () => HT.loadScript('data/shifts/index.js').then(() => window.HT_SHIFT_INDEX || { shifts: [] });
      indexP = (FILE || !HT.loadJson ? viaScript() : HT.loadJson('data/shifts/index.json').catch(viaScript)).then(normIndex).catch(() => { indexP = null; return { shifts: [] }; });
    }
    return indexP;
  }
  // id = `<dept>` or `<dept>--<case>`: the .js wrapper (window.HT_SHIFTS[id]) first (file:// safe), JSON over http as fallback
  function loadShift(id) {
    if (!/^[a-z0-9-]{2,60}(--[a-z0-9-]{2,30})?$/.test(id)) return Promise.reject(new Error('Invalid department'));
    if (shifts[id]) return shifts[id];
    const fromWindow = () => window.HT_SHIFTS && window.HT_SHIFTS[id];
    shifts[id] = (fromWindow() ? Promise.resolve(fromWindow()) : HT.loadScript('data/shifts/' + id + '.js').then(fromWindow).catch(() => null)
      .then(doc => doc || (FILE ? null : fetch('data/shifts/' + id + '.json', { credentials: 'same-origin' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }))))
      .then(doc => { if (!doc || !/^huatuo-shift-v[12]$/.test(doc.format || '')) throw new Error(T('shiftNoData', '此科尚無值班劇本。', 'No shift script for this department yet.')); doc.department = doc.department || id.split('--')[0]; doc.case = doc.case || (id.includes('--') ? id.split('--')[1] : 'main'); return doc; })
      .catch(e => { delete shifts[id]; throw e; });
    return shifts[id];
  }
  async function ensureDeps() {
    const need = [];
    if (!HT.xp) need.push('xp.js');
    if (!HT.workbench || !HT.workbench.mount) need.push('workbench.js');
    if (!HT.theatre) need.push('theatre.js');
    if (!HT.theatre3d) need.push('theatre3d.js');
    if (!HT.procedures) need.push('procedures.js');
    for (const f of need) { try { await HT.loadScript(f); } catch (e) { /* optional pieces degrade below */ } }
    ['workbench.css', 'theatre.css'].forEach(c => { if (HT.loadCss) HT.loadCss(c); });
  }

  // ---------------------------------------------------------------- real-clock start rule
  function startSegFor(minutes, segs) {
    if (!segs || !segs.length) return 0;
    const h = minutes / 60;
    const nearest = goal => segs.reduce((b, s, i) => Math.abs(s.t - goal) < Math.abs(segs[b].t - goal) ? i : b, 0);
    if (h >= 5 && h < 11) return 0;
    if (h >= 11 && h < 16) return nearest(13 * 60);
    if (h >= 16 && h < 21) return nearest(17 * 60);
    let i = -1; segs.forEach((s, k) => { if (s.mood === 'night') i = k; });
    if (i < 0) segs.forEach((s, k) => { if (s.mood === 'eve') i = k; });
    return i < 0 ? segs.length - 1 : i;
  }
  const segLabel = i => [T('shiftMorning', '早班', 'Morning'), T('shiftNoon', '午班', 'Midday'), T('shiftEvening', '晚班', 'Evening'), T('shiftNight', '夜班', 'Night')][i];
  function bandOf(minutes) { const h = minutes / 60; return h >= 5 && h < 11 ? 0 : h >= 11 && h < 16 ? 1 : h >= 16 && h < 21 ? 2 : 3; }

  // ---------------------------------------------------------------- sound (Web Audio, synthesised, no files)
  const Snd = {
    ctx: null, ringTimer: null, alarmTimer: null,
    pref() { return store.get('ht-shift-sound'); },
    get muted() { const p = this.pref(); if (p === '0') return true; if (p === '1') return false; return reduced(); },
    set muted(v) { store.set('ht-shift-sound', v ? '0' : '1'); if (v) this.stopRing(); },
    ensure() { if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return this.ctx; } try { const C = window.AudioContext || window.webkitAudioContext; this.ctx = C ? new C() : null; } catch (e) { this.ctx = null; } return this.ctx; },
    tone(f, dur, type, gain, at, slide) { const c = this.ctx; if (!c) return; try { const o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; const t0 = c.currentTime + (at || 0); o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain || 0.08, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02); } catch (e) { /* ignore */ } },
    play(name) {
      if (this.muted || !this.ensure()) return;
      if (name === 'blip') this.tone(880, 0.05, 'square', 0.03);
      else if (name === 'card') { this.tone(523, 0.18, 'sine', 0.07); this.tone(784, 0.26, 'sine', 0.06, 0.12); }
      else if (name === 'success') { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.06, i * 0.09)); }
      else if (name === 'error') { this.tone(180, 0.22, 'sawtooth', 0.05, 0, 120); }
      else if (name === 'arrive') { this.tone(660, 0.08, 'triangle', 0.05); this.tone(990, 0.12, 'triangle', 0.05, 0.08); }
      else if (name === 'item') { this.tone(1046, 0.08, 'square', 0.03); this.tone(1568, 0.14, 'square', 0.03, 0.08); }
      else if (name === 'msg') { this.tone(1200, 0.07, 'sine', 0.06); this.tone(1600, 0.1, 'sine', 0.05, 0.1); }
      else if (name === 'alarm') { this.tone(988, 0.12, 'square', 0.04); this.tone(988, 0.12, 'square', 0.04, 0.2); this.tone(988, 0.12, 'square', 0.04, 0.4); }
    },
    startRing() { this.stopRing(); if (this.muted || !this.ensure()) return; const burst = () => { for (let i = 0; i < 2; i++) { this.tone(440, 0.42, 'sine', 0.07, i * 0.6); this.tone(480, 0.42, 'sine', 0.05, i * 0.6); } }; burst(); this.ringTimer = setInterval(burst, 2400); },
    stopRing() { if (this.ringTimer) { clearInterval(this.ringTimer); this.ringTimer = null; } },
    startAlarm() { this.stopAlarm(); if (this.muted || !this.ensure()) return; this.play('alarm'); this.alarmTimer = setInterval(() => this.play('alarm'), 1800); },
    stopAlarm() { if (this.alarmTimer) { clearInterval(this.alarmTimer); this.alarmTimer = null; } }
  };

  // ---------------------------------------------------------------- room geometry shared by 2D plan & legacy 3D names
  const LEGACY = { instruments: 'tray', drugs: 'cart', drain: 'drains', handover: 'huddle', anaesthesia: 'anesthesia', ultrasound: 'us', endoscopy: 'endo', bed: 'field', bench: 'field', 'crash-cart': 'cart', desk: 'chart', workstation: 'imaging', centrifuge: 'lab', analyser: 'lab', hood: 'lab' };
  const FROM_LEGACY = { tray: 'instruments', backtable: 'instruments', cart: 'drugs', drains: 'drain', huddle: 'handover', anesthesia: 'anaesthesia', us: 'ultrasound', endo: 'endoscopy', wallpacs: 'imaging', esu: 'device', warmer: 'device', kick: 'instruments', ivpole: 'drugs', specimen: 'lab', lights: 'field' };
  const normHot = id => FROM_LEGACY[id] || id;
  const HOT2D = { field: [640, 370], bed: [640, 370], bench: [640, 370], monitor: [455, 215], imaging: [900, 95], anaesthesia: [330, 300], instruments: [930, 330], drugs: [1060, 470], drain: [760, 500], lab: [1070, 180], chart: [150, 150], whiteboard: [330, 95], handover: [980, 610], recovery: [330, 600], door: [90, 620], device: [160, 430], sink: [560, 95], lightbox: [1130, 300], ultrasound: [800, 220], endoscopy: [520, 545], microscope: [700, 170], carm: [860, 450], 'crash-cart': [1150, 600], desk: [560, 640], centrifuge: [150, 290], analyser: [1010, 260], hood: [760, 640], workstation: [1040, 80],
    // v4.1 TCM / lab hotspots (defaults; the new rooms place them with HOT2D_ROOM)
    couch: [980, 330], needles: [455, 215], moxa: [330, 300], cups: [160, 430], electro: [800, 220], lamp: [760, 500], 'meridian-chart': [330, 95], bronze: [330, 300], 'pulse-desk': [640, 370], cabinet: [900, 95], scale: [455, 215], grinder: [800, 220], decoction: [330, 300], granules: [900, 95], traction: [980, 330], mat: [330, 600], hplc: [900, 95], oven: [1070, 180], autoclave: [900, 95], washer: [330, 95], packing: [640, 370], 'sterile-store': [1070, 300], printer3d: [980, 330], incubator: [150, 290] };
  // per-room 1200×720 layouts: the main hotspot sits where the OR table sits, the door is always bottom-left
  const HOT2D_ROOM = {
    'tcm-clinic': { 'pulse-desk': [640, 370], couch: [980, 330], bronze: [330, 300], 'meridian-chart': [330, 95], cabinet: [900, 95], chart: [150, 150], whiteboard: [560, 95], desk: [560, 640], sink: [1130, 300], door: [90, 620], handover: [980, 610], lamp: [800, 220] },
    acupuncture: { couch: [640, 370], recovery: [980, 330], needles: [455, 215], electro: [800, 220], lamp: [760, 500], moxa: [330, 300], cups: [160, 430], 'meridian-chart': [330, 95], whiteboard: [560, 95], sink: [1130, 300], chart: [150, 150], door: [90, 620], handover: [980, 610], 'crash-cart': [1150, 600] },
    'herbal-pharmacy': { cabinet: [640, 370], scale: [455, 215], grinder: [800, 220], decoction: [330, 300], granules: [900, 95], workstation: [1040, 80], desk: [560, 640], chart: [150, 150], door: [90, 620], sink: [1130, 300], handover: [980, 610] },
    tuina: { couch: [640, 370], traction: [980, 330], mat: [330, 600], cups: [160, 430], lamp: [760, 500], whiteboard: [560, 95], chart: [150, 150], desk: [560, 640], sink: [1130, 300], door: [90, 620], handover: [980, 610] },
    'decoction-lab': { bench: [640, 370], hood: [760, 640], hplc: [900, 95], oven: [1070, 180], grinder: [150, 290], scale: [330, 95], microscope: [700, 170], workstation: [1040, 80], desk: [560, 640], sink: [560, 95], door: [90, 620], chart: [150, 150] },
    cssd: { packing: [640, 370], washer: [330, 95], autoclave: [900, 95], 'sterile-store': [1070, 300], incubator: [1130, 470], workstation: [1040, 80], whiteboard: [560, 95], sink: [160, 430], door: [90, 620], chart: [150, 150], desk: [560, 640] },
    'biomed-lab': { bench: [640, 370], hood: [330, 300], incubator: [150, 290], printer3d: [980, 330], microscope: [700, 170], workstation: [1040, 80], desk: [560, 640], sink: [560, 95], door: [90, 620], chart: [150, 150] }
  };
  const HOT_ICON = { field: '🩻', bed: '🛏', bench: '🧫', monitor: '📈', imaging: '🖥', anaesthesia: '🫁', instruments: '🧰', drugs: '💊', drain: '🧵', lab: '🧪', chart: '📋', whiteboard: '🗒', handover: '🗣', recovery: '🛏', door: '🚪', device: '⚙', sink: '🚰', lightbox: '🩻', ultrasound: '📡', endoscopy: '🔭', microscope: '🔬', carm: '☢', 'crash-cart': '🚨', desk: '🖊', centrifuge: '🌀', analyser: '🧬', hood: '🧯', workstation: '🖥',
    couch: '🛏', needles: '🪡', moxa: '🔥', cups: '🫙', electro: '⚡', lamp: '💡', 'meridian-chart': '🗺', bronze: '🧍', 'pulse-desk': '🪷', cabinet: '🗄', scale: '⚖', grinder: '🥣', decoction: '🫖', granules: '📦', traction: '🛏', mat: '🧘', hplc: '📊', oven: '🌡', autoclave: '♨', washer: '🫧', packing: '📦', 'sterile-store': '🚪', printer3d: '🖨', incubator: '🧫' };
  const HOT_NAME = { field: ['手術台／病人', 'Table / patient'], bed: ['病床', 'Bed'], bench: ['實驗桌', 'Bench'], monitor: ['生理監視器', 'Monitor'], imaging: ['影像工作站', 'Imaging'], anaesthesia: ['麻醉機', 'Anaesthesia'], instruments: ['器械台', 'Instruments'], drugs: ['藥物車', 'Drug cart'], drain: ['引流／管路', 'Drains'], lab: ['檢驗站', 'Labs'], chart: ['病歷', 'Chart'], whiteboard: ['白板', 'Whiteboard'], handover: ['交班區', 'Handover'], recovery: ['恢復室床', 'Recovery bed'], door: ['門口', 'Door'], device: ['專科設備', 'Device'], sink: ['刷手台', 'Scrub sink'], lightbox: ['看片燈', 'Lightbox'], ultrasound: ['超音波', 'Ultrasound'], endoscopy: ['內視鏡塔', 'Endoscopy tower'], microscope: ['顯微鏡', 'Microscope'], carm: ['C 臂', 'C-arm'], 'crash-cart': ['急救車', 'Crash cart'], desk: ['工作桌', 'Desk'], centrifuge: ['離心機', 'Centrifuge'], analyser: ['自動分析儀', 'Analyser'], hood: ['生物安全櫃', 'Safety cabinet'], workstation: ['判讀工作站', 'Workstation'],
    couch: ['治療床', 'Treatment couch'], needles: ['無菌針盤與銳器盒', 'Needle tray & sharps'], moxa: ['艾灸區（抽煙）', 'Moxa station'], cups: ['罐具與刮痧板', 'Cups & gua sha'], electro: ['電針機', 'Electro-stimulator'], lamp: ['紅外線燈', 'Infrared lamp'], 'meridian-chart': ['經絡掛圖', 'Meridian chart'], bronze: ['針灸銅人', 'Bronze figure'], 'pulse-desk': ['脈枕診桌', 'Pulse desk'], cabinet: ['百子櫃', 'Herb cabinet'], scale: ['戥秤／天平', 'Scale'], grinder: ['搗藥缽／粉碎機', 'Mortar / grinder'], decoction: ['煎藥機', 'Decoction machine'], granules: ['科學中藥顆粒櫃', 'Granule cabinet'], traction: ['牽引床', 'Traction bed'], mat: ['導引／功法墊區', 'Daoyin mats'], hplc: ['HPLC／TLC 層析', 'HPLC / TLC'], oven: ['乾燥箱／水浴鍋', 'Oven / water bath'], autoclave: ['高壓滅菌鍋', 'Autoclave'], washer: ['清洗消毒機', 'Washer-disinfector'], packing: ['包裝台', 'Packing table'], 'sterile-store': ['無菌庫房', 'Sterile store'], printer3d: ['3D 列印機', '3D printer'], incubator: ['培養箱', 'Incubator'] };
  const ROOM_HOTS = { or: 'field monitor anaesthesia instruments drugs drain imaging whiteboard chart sink door recovery lab device handover', er: 'bed monitor crash-cart drugs imaging chart whiteboard door ultrasound lab handover drain', ward: 'bed monitor drugs chart whiteboard door desk handover recovery crash-cart sink', icu: 'bed monitor anaesthesia drugs chart whiteboard door desk handover crash-cart drain sink', clinic: 'bed desk chart monitor door ultrasound imaging sink workstation handover', imaging: 'bed imaging workstation ultrasound lightbox endoscopy monitor door chart handover', lab: 'bench microscope centrifuge analyser hood desk workstation door chart sink', reading: 'workstation lightbox imaging desk door chart monitor', dental: 'bed device lightbox sink instruments imaging door chart',
    'tcm-clinic': 'pulse-desk couch bronze meridian-chart cabinet chart whiteboard desk sink door handover lamp', acupuncture: 'couch needles electro lamp moxa cups meridian-chart whiteboard sink chart door handover recovery crash-cart', 'herbal-pharmacy': 'cabinet scale grinder decoction granules workstation desk chart door sink handover', tuina: 'couch traction mat cups lamp whiteboard chart desk sink door handover', 'decoction-lab': 'bench hood hplc oven grinder scale microscope workstation desk sink door chart', cssd: 'packing washer autoclave sterile-store incubator workstation whiteboard sink door chart desk', 'biomed-lab': 'bench hood incubator printer3d microscope workstation desk sink door chart' };
  const ROOM_MAIN = { or: 'field', er: 'bed', ward: 'bed', icu: 'bed', clinic: 'bed', imaging: 'bed', lab: 'bench', reading: 'workstation', dental: 'bed', 'tcm-clinic': 'pulse-desk', acupuncture: 'couch', 'herbal-pharmacy': 'cabinet', tuina: 'couch', 'decoction-lab': 'bench', cssd: 'packing', 'biomed-lab': 'bench' };
  const roomMain = r => ROOM_MAIN[r] || 'field';
  // v1 generic ids in a v2 room: every id maps onto a role, every new room names an object for each role
  const ROLE_OF = { field: 'main', bench: 'main', 'pulse-desk': 'main', packing: 'main', bed: 'patient', recovery: 'patient', drain: 'patient', couch: 'patient', traction: 'patient', mat: 'patient', monitor: 'device', anaesthesia: 'device', device: 'device', ultrasound: 'device', endoscopy: 'device', carm: 'device', electro: 'device', lamp: 'device', decoction: 'device', hplc: 'device', oven: 'device', autoclave: 'device', washer: 'device', printer3d: 'device', incubator: 'device', centrifuge: 'device', analyser: 'device', hood: 'device', microscope: 'device', imaging: 'screen', lightbox: 'screen', workstation: 'screen', whiteboard: 'screen', 'meridian-chart': 'screen', bronze: 'screen', instruments: 'store', drugs: 'store', lab: 'store', cabinet: 'store', needles: 'store', cups: 'store', moxa: 'store', scale: 'store', grinder: 'store', granules: 'store', 'sterile-store': 'store', 'crash-cart': 'store', chart: 'work', desk: 'work', sink: 'wash', handover: 'people', door: 'door' };
  const ROLE_SPOT = { 'tcm-clinic': { main: 'pulse-desk', patient: 'couch', device: 'lamp', screen: 'meridian-chart', store: 'cabinet', work: 'desk', wash: 'sink', people: 'handover' }, acupuncture: { main: 'couch', patient: 'couch', device: 'electro', screen: 'meridian-chart', store: 'needles', work: 'whiteboard', wash: 'sink', people: 'handover' }, 'herbal-pharmacy': { main: 'cabinet', patient: 'desk', device: 'decoction', screen: 'workstation', store: 'cabinet', work: 'desk', wash: 'sink', people: 'handover' }, tuina: { main: 'couch', patient: 'couch', device: 'traction', screen: 'whiteboard', store: 'cups', work: 'desk', wash: 'sink', people: 'handover' }, 'decoction-lab': { main: 'bench', patient: 'bench', device: 'hplc', screen: 'workstation', store: 'scale', work: 'desk', wash: 'sink', people: 'desk' }, cssd: { main: 'packing', patient: 'packing', device: 'autoclave', screen: 'workstation', store: 'sterile-store', work: 'desk', wash: 'sink', people: 'whiteboard' }, 'biomed-lab': { main: 'bench', patient: 'bench', device: 'printer3d', screen: 'workstation', store: 'incubator', work: 'desk', wash: 'sink', people: 'desk' } };
  const hotSets = {}; const hotsOf = room => hotSets[room] || (hotSets[room] = new Set((ROOM_HOTS[room] || ROOM_HOTS.or).split(' ')));
  function roomHot(room, id) { id = normHot(id); if (!id) return roomMain(room); if (hotsOf(room).has(id)) return id; const R = ROLE_SPOT[room]; if (R) { const role = ROLE_OF[id] || 'main'; return role === 'door' ? 'door' : (R[role] || R.main); } return HOT2D[id] ? id : roomMain(room); }
  const BODY_HOME = { mentor: 'field', anaesthetist: 'anaesthesia', scrub: 'instruments', circulating: 'drugs', specialist: 'lab', perfusionist: 'device', radiographer: 'imaging', neurophys: 'device', physio: 'recovery', nurse: 'recovery', tech: 'device', patient: 'field', family: 'door', student: 'whiteboard', pharmacist: 'drugs', resident: 'chart', porter: 'door', herbalist: 'cabinet', therapist: 'couch' };
  const HOME_OFFSET = { mentor: [70, 60], anaesthetist: [0, 70], scrub: [-60, 60], circulating: [-70, -40], specialist: [-60, 50], perfusionist: [70, 0], radiographer: [0, 70], neurophys: [-70, 10], physio: [80, 0], nurse: [80, -10], tech: [60, 30], patient: [0, 0], family: [90, -40], student: [70, 40], pharmacist: [-70, 20], resident: [60, 40], porter: [60, -60], herbalist: [-70, 50], therapist: [70, 50] };
  const ROOM_NAMES = { or: ['手術室', 'Operating room'], er: ['急診室', 'Emergency bay'], ward: ['病房', 'Ward'], icu: ['加護病房', 'ICU'], clinic: ['診間', 'Clinic'], imaging: ['檢查室', 'Procedure room'], lab: ['檢驗室', 'Laboratory'], reading: ['判讀室', 'Reading room'], dental: ['牙科診療室', 'Dental operatory'], 'tcm-clinic': ['中醫診間', 'TCM clinic'], acupuncture: ['針灸治療室', 'Acupuncture room'], 'herbal-pharmacy': ['中藥局', 'Herbal pharmacy'], tuina: ['推拿治療室', 'Tuina room'], 'decoction-lab': ['中藥品管實驗室', 'Herbal QC lab'], cssd: ['消毒供應中心', 'CSSD'], 'biomed-lab': ['生醫工程實驗室', 'Biomed engineering lab'] };
  const roomName = r => ROOM_NAMES[r] || [r, r];
  const TCM_ROOM = r => /^(tcm-clinic|acupuncture|herbal-pharmacy|tuina|decoction-lab)$/.test(r);
  const FLOORS = { or: ['#d8e3df', '#b7c9c2', '#e9f0ee'], er: ['#d9e1e6', '#b9c8d0', '#eef3f6'], ward: ['#e6dfd2', '#cbbfae', '#f4efe6'], icu: ['#dfe4e8', '#bcc6cd', '#eef2f4'], clinic: ['#e8e2d5', '#cdc2b0', '#f6f1e8'], imaging: ['#d6dde3', '#b4bfc8', '#eaeff3'], lab: ['#e0e6e2', '#bfc9c4', '#eef3f0'], reading: ['#3a4650', '#2a343c', '#4a5660'], dental: ['#e3ebe9', '#c2d0cc', '#f0f5f4'], 'tcm-clinic': ['#e2d3bd', '#c7b291', '#f1e8d8'], acupuncture: ['#e6dccd', '#cbbca4', '#f4eee4'], 'herbal-pharmacy': ['#d9c3a2', '#b89a70', '#e9dcc6'], tuina: ['#e3d9c8', '#c6b89f', '#f2ebdf'], 'decoction-lab': ['#dfe6e2', '#bdc9c3', '#eef3f0'], cssd: ['#dde4e8', '#bac6cd', '#edf2f5'], 'biomed-lab': ['#e0e4ea', '#bfc7d2', '#eef1f5'] };
  const MAIN_KIND = { field: 'table', bed: 'bed', bench: 'bench', workstation: 'bench', 'pulse-desk': 'desk', couch: 'couch', cabinet: 'cabinet', packing: 'packing' };

  // ---------------------------------------------------------------- 2D floor plan (no WebGL, or on request)
  class Plan {
    constructor(host, game) {
      this.g = game; this.host = host; this.room = game.data.room; this.cast = []; this.target = null; this.find = null; this.dest = null; this.raf = 0; this.keys = {}; this.last = 0;
      const p = this.spot('door'); this.me = { x: p[0], y: p[1] - 60 };
      this.el = document.createElement('div'); this.el.className = 'sh-plan'; host.appendChild(this.el);
      this.main = roomMain(this.room);
      this.hots = new Set(hotsOf(this.room));
      Object.values(game.data.places || {}).forEach(pl => this.hots.add(this.hot(pl.hot)));
      (game.data.codex || []).forEach(c => { if (c.hot) this.hots.add(this.hot(c.hot)); });
      game.data.segs.forEach(s => s.beats.forEach(b => { if (b.mini && b.mini.type === 'find') this.hots.add(this.hot(b.mini.hot)); }));
      this.portrait = host.clientHeight > host.clientWidth * 1.05;
      this.build(); this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
      this.ro = window.ResizeObserver ? new ResizeObserver(() => { const p = host.clientHeight > host.clientWidth * 1.05; if (p !== this.portrait) { this.portrait = p; this.build(); } }) : null; if (this.ro) this.ro.observe(host);
      this.onKey = e => { if (game.ui.dialogOpen() || game.panelOpen) return; const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; const map = { w: 'u', ArrowUp: 'u', s: 'd', ArrowDown: 'd', a: 'l', ArrowLeft: 'l', d: 'r', ArrowRight: 'r', i: 'u', k: 'd', j: 'l', l: 'r' }; if (!map[k]) return; e.preventDefault(); this.keys[this.dir(map[k])] = e.type === 'keydown'; if (e.type === 'keydown') this.dest = null; };
      window.addEventListener('keydown', this.onKey); window.addEventListener('keyup', this.onKey);
    }
    up() { return this.portrait ? ' transform="rotate(-90)"' : ''; }
    hot(id) { return roomHot(this.room, id); }
    isMain(id) { return this.hot(id) === this.main; }
    spot(hot) { const h = this.hot(hot); const p = (HOT2D_ROOM[this.room] && HOT2D_ROOM[this.room][h]) || HOT2D[h] || HOT2D.field; return [p[0], p[1]]; }
    standing(hot) { const p = this.spot(hot); return [p[0], Math.min(690, p[1] + (this.isMain(hot) ? 110 : 62))]; }
    castPos(c) { if (c.at && Array.isArray(c.at)) return c.at; const home = this.hot(c.at && typeof c.at === 'string' ? c.at : (BODY_HOME[c.body] || 'door')); const p = this.spot(home); const main = home === this.main; const o = main ? (HOME_OFFSET[c.body] || [0, 60]) : [p[0] > 1000 ? -66 : 66, 6]; const x = p[0] + o[0], y = p[1] + o[1] + (main && c.body !== 'patient' ? 70 : 0); return [Math.max(60, Math.min(1140, x)), Math.max(60, Math.min(660, y))]; }
    // the main object: table + patient (or), bed / couch + patient, lab bench, pulse desk, herb cabinet, packing table
    mainArt(kind, w, h) {
      const L = -w / 2, Tp = -h / 2;
      if (kind === 'bench') return `<rect x="${L + 14}" y="${Tp + 18}" width="${w - 28}" height="${h - 36}" rx="18" fill="#dfe8e4"/><rect x="${L + 30}" y="${Tp + 34}" width="54" height="26" rx="5" fill="#9fb8c4"/><circle cx="${L + 120}" cy="4" r="12" fill="#cfe0e8"/><rect x="${w / 2 - 90}" y="${Tp + 30}" width="60" height="44" rx="6" fill="#b7cbd3"/>`;
      if (kind === 'desk') return `<rect x="${L + 14}" y="${Tp + 18}" width="${w - 28}" height="${h - 36}" rx="12" fill="#c9a06c"/><ellipse cx="${L + 70}" cy="2" rx="30" ry="14" fill="#b94a3c"/><rect x="${L + 44}" y="-5" width="52" height="10" rx="5" fill="#f2c9a0"/><rect x="${w / 2 - 96}" y="${Tp + 30}" width="60" height="38" rx="4" fill="#fff7e6" stroke="#8a6d3b"/><line x1="${w / 2 - 86}" y1="${Tp + 40}" x2="${w / 2 - 46}" y2="${Tp + 40}" stroke="#8a6d3b" stroke-width="2"/><line x1="${w / 2 - 86}" y1="${Tp + 50}" x2="${w / 2 - 54}" y2="${Tp + 50}" stroke="#8a6d3b" stroke-width="2"/><circle cx="${w / 2 - 30}" cy="-14" r="9" fill="#ffd166"/>`;
      if (kind === 'couch') return `<rect x="${L + 14}" y="${Tp + 18}" width="${w - 28}" height="${h - 36}" rx="18" fill="#e8ded0"/><rect x="${L + 16}" y="${Tp + 20}" width="44" height="${h - 40}" rx="12" fill="#f6f1e8"/><ellipse cx="${L + 44}" cy="0" rx="20" ry="18" fill="#f2c9a0"/><rect x="${L + 70}" y="-22" width="${w - 110}" height="44" rx="16" fill="#d9c7b0" opacity=".95"/>`;
      if (kind === 'cabinet') { let cells = ''; for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) cells += `<rect x="${L + 20 + c * 28}" y="${Tp + 20 + r * 28}" width="24" height="24" rx="3" fill="#7a4f2a" stroke="#5a381c"/><circle cx="${L + 32 + c * 28}" cy="${Tp + 32 + r * 28}" r="2.6" fill="#e2c27a"/>`; return `<rect x="${L + 14}" y="${Tp + 14}" width="${w - 28}" height="${h - 28}" rx="8" fill="#8a5a30"/>${cells}`; }
      if (kind === 'packing') return `<rect x="${L + 14}" y="${Tp + 18}" width="${w - 28}" height="${h - 36}" rx="12" fill="#dfe6ea"/><rect x="${L + 30}" y="${Tp + 30}" width="70" height="60" rx="4" fill="#9fd3e8" opacity=".85"/><rect x="${L + 110}" y="${Tp + 36}" width="56" height="48" rx="4" fill="#c7d6dd"/><rect x="${w / 2 - 80}" y="${Tp + 30}" width="52" height="60" rx="4" fill="#9fd3e8" opacity=".85"/>`;
      return `<rect x="${L + 14}" y="${Tp + 18}" width="${w - 28}" height="${h - 36}" rx="18" fill="#b9e2d8"/><ellipse cx="${L + 44}" cy="0" rx="22" ry="20" fill="#f2c9a0"/><rect x="${L + 72}" y="-22" width="${w - 110}" height="44" rx="16" fill="#cfe6f0" opacity=".9"/>`;
    }
    build() {
      const room = this.room; const main = this.main; const mk = MAIN_KIND[main] || 'table';
      const F = FLOORS[room] || FLOORS.or;
      const dark = room === 'reading'; const tcm = TCM_ROOM(room); const stroke = dark ? '#8aa' : tcm ? '#8a6d3b' : '#6f8a84';
      const hot = id => { const p = this.spot(id); const nm = HOT_NAME[id] || [id, id]; const w = id === main ? 260 : 96, h = id === main ? 120 : 64; const rx = id === main ? 26 : 12;
        return `<g class="sh-hot" data-hot="${id}" transform="translate(${p[0]} ${p[1]})" role="button" tabindex="0" aria-label="${esc(say(nm[0], nm[1]))}"><g class="sh-upright"${UP}><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${rx}" fill="${id === main ? (dark ? '#5a6a74' : tcm ? '#b98a5a' : '#8fb0a4') : (dark ? '#2f3b44' : '#ffffff')}" stroke="${stroke}" stroke-width="2" opacity=".96"/>${id === main ? this.mainArt(mk, w, h) : ''}<text y="${id === main ? -h / 2 - 10 : 7}" text-anchor="middle" font-size="${id === main ? 15 : 22}" fill="${dark ? '#fff' : '#1d2a2a'}">${id === main ? esc(say(nm[0], nm[1])) : HOT_ICON[id] || '•'}</text>${id === main ? '' : `<text y="${h / 2 + 15}" text-anchor="middle" font-size="12" font-weight="600" fill="${dark ? '#e8edeb' : '#1d2a2a'}">${esc(say(nm[0], nm[1]))}</text>`}</g></g>`; };
      const order = [main].concat([...this.hots].filter(h => h !== main));
      const P = this.portrait; this.el.classList.toggle('sh-portrait', P); const UP = this.up();
      this.el.innerHTML = `<svg viewBox="${P ? '0 0 720 1200' : '0 0 1200 720'}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(say(roomName(room)[0], roomName(room)[1]))}"><g data-inner transform="${P ? 'translate(720 0) rotate(90)' : ''}"><defs><linearGradient id="shFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${F[2]}"/><stop offset="1" stop-color="${F[1]}"/></linearGradient><filter id="shShadow"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity=".3"/></filter></defs>
        <rect width="1200" height="720" fill="#10191d"/><rect x="30" y="30" width="1140" height="660" rx="18" fill="url(#shFloor)" stroke="${dark ? '#6a7a84' : stroke}" stroke-width="6"/>${tcm ? '<rect x="30" y="30" width="1140" height="14" rx="4" fill="#b5432f" opacity=".55"/>' : ''}
        ${Array.from({ length: 11 }, (_, i) => `<line x1="${130 + i * 95}" y1="30" x2="${130 + i * 95}" y2="690" stroke="rgba(255,255,255,${dark ? 0.06 : 0.35})"/>`).join('')}${Array.from({ length: 6 }, (_, i) => `<line x1="30" y1="${125 + i * 95}" x2="1170" y2="${125 + i * 95}" stroke="rgba(255,255,255,${dark ? 0.06 : 0.3})"/>`).join('')}
        
        <rect x="42" y="580" width="22" height="90" rx="4" fill="#9fb0b8"/>
        <g class="sh-hots">${order.map(hot).join('')}</g><g class="sh-people"></g><g class="sh-markers"></g><g class="sh-you" transform="translate(${this.me.x} ${this.me.y})"><g class="sh-upright"${UP}><ellipse cy="22" rx="18" ry="6" fill="rgba(0,0,0,.3)"/><circle class="body" r="18" fill="#2b8f7a" stroke="#fff" stroke-width="3"/><text y="5" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">${esc(T('shiftYou', '你', 'YOU'))}</text></g></g></g></svg>`;
      const svg = this.el.querySelector('svg'); this.svg = svg; this.inner = svg.querySelector('[data-inner]');
      svg.addEventListener('pointerdown', e => { const hotEl = e.target.closest('.sh-hot'), per = e.target.closest('.sh-person'); if (hotEl) { this.tapHot(hotEl.dataset.hot); return; } if (per) { this.tapCast(per.dataset.cast); return; } const pt = this.toSvg(e); if (pt) { this.dest = { x: Math.max(60, Math.min(1140, pt.x)), y: Math.max(60, Math.min(660, pt.y)), then: null }; } });
      svg.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const hotEl = e.target.closest('.sh-hot'); if (hotEl) { e.preventDefault(); this.tapHot(hotEl.dataset.hot); } });
      this.drawPeople(); this.drawMarkers();
    }
    toSvg(e) { try { const pt = this.svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const m = (this.inner || this.svg).getScreenCTM(); if (!m) return null; const q = pt.matrixTransform(m.inverse()); return { x: q.x, y: q.y }; } catch (err) { return null; } }
    tapHot(id) { const s = this.standing(id); this.dest = { x: s[0], y: s[1], then: () => { this.g.onInteract(id); if (this.target && !this.target.castId && this.hot(this.target.hot) === id) this.g.onArrive(this.target); } }; }
    tapCast(id) { const c = this.cast.find(x => x.id === id); if (!c) return; const p = this.castPos(c); this.dest = { x: p[0] + 46, y: p[1] + 10, then: () => this.g.onTalk(id) }; }
    setCast(list) { this.cast = list.filter(c => !c.hidden); this.drawPeople(); }
    drawPeople() { const g = this.el.querySelector('.sh-people'); if (!g) return; g.innerHTML = this.cast.map(c => { const p = this.castPos(c); const lying = c.body === 'patient'; const tg = this.target && this.target.castId === c.id; const met = this.g.met.has(c.id);
      return `<g class="sh-person ${tg ? 'target' : ''}" data-cast="${esc(c.id)}" transform="translate(${p[0]} ${p[1]})" role="button" tabindex="0" aria-label="${esc(c.label)}"><g class="sh-upright"${this.up()}>${lying ? `<rect x="-40" y="-14" width="80" height="28" rx="12" fill="#cfe6f0" stroke="#fff" stroke-width="2"/><circle cx="-26" cy="0" r="12" fill="#f2c9a0"/>` : `<ellipse cy="20" rx="16" ry="5" fill="rgba(0,0,0,.28)"/><circle class="body" r="17" fill="${esc(c.color || '#607d8b')}" stroke="#fff" stroke-width="3"/><text y="4" text-anchor="middle" font-size="10" font-weight="800" fill="#fff">${esc(c.tag || '')}</text>`}<text y="${lying ? 34 : 38}" text-anchor="middle" font-size="12" font-weight="700" fill="#1d2a2a" stroke="rgba(255,255,255,.8)" stroke-width="3" paint-order="stroke">${esc(c.name)}</text>${met || tg ? '' : `<text x="22" y="-16" font-size="16" fill="#1f6f5f" font-weight="800">?</text>`}</g></g>`; }).join(''); }
    drawMarkers() { const g = this.el.querySelector('.sh-markers'); if (!g) return; let p = null; if (this.target) { if (this.target.castId) { const c = this.cast.find(x => x.id === this.target.castId); if (c) p = this.castPos(c); } if (!p && this.target.hot) p = this.spot(this.target.hot); }
      if (this.find) { const f = this.spot(this.find); const fid = this.hot(this.find); p = p || null; g.innerHTML = `<g transform="translate(${f[0]} ${f[1]})"><circle class="sh-ring2d" r="50" fill="none" stroke="#74c0fc" stroke-width="4"/></g>`; this.el.querySelectorAll('.sh-hot').forEach(h => h.classList.toggle('find', h.dataset.hot === fid)); return; }
      const tid = this.target && !this.target.castId ? this.hot(this.target.hot) : null;
      this.el.querySelectorAll('.sh-hot').forEach(h => { h.classList.remove('find'); h.classList.toggle('target', !!(tid && tid === h.dataset.hot)); });
      g.innerHTML = p ? `<g transform="translate(${p[0]} ${p[1]})"><circle class="sh-ring2d" r="46" fill="none" stroke="#ffd166" stroke-width="4"/><g class="sh-upright"${this.up()}><g class="sh-marker"><rect x="-13" y="-78" width="26" height="40" rx="8" fill="#ffd166"/><text y="-48" text-anchor="middle" font-size="26" font-weight="900" fill="#15202b">!</text></g></g></g>` : ''; }
    setTarget(tg) { this.target = tg; this.drawPeople(); this.drawMarkers(); }
    setFind(hot) { this.find = hot; this.drawMarkers(); }
    walkTo(tg) { return new Promise(res => { let p; if (tg.castId) { const c = this.cast.find(x => x.id === tg.castId); p = c ? this.castPos(c) : this.standing(tg.hot || 'field'); p = [p[0] + 46, p[1] + 10]; } else p = this.standing(tg.hot || 'field'); this.dest = { x: p[0], y: p[1], then: res }; if (FAST()) { this.me.x = p[0]; this.me.y = p[1]; } }); }
    near() { let best = null, bd = 90; this.cast.forEach(c => { const p = this.castPos(c); const d = Math.hypot(p[0] - this.me.x, p[1] - this.me.y); if (d < bd) { bd = d; best = { kind: 'cast', id: c.id }; } }); return best; }
    loop(ts) { if (this.dead) return; this.raf = requestAnimationFrame(this.loop); const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000); this.last = ts; const sp = 240;
      let dx = 0, dy = 0; if (this.keys.u) dy -= 1; if (this.keys.d) dy += 1; if (this.keys.l) dx -= 1; if (this.keys.r) dx += 1;
      if (dx || dy) { const n = Math.hypot(dx, dy); this.me.x = Math.max(60, Math.min(1140, this.me.x + dx / n * sp * dt)); this.me.y = Math.max(60, Math.min(660, this.me.y + dy / n * sp * dt)); this.moved(); }
      else if (this.dest) { const ddx = this.dest.x - this.me.x, ddy = this.dest.y - this.me.y; const d = Math.hypot(ddx, ddy); if (d < 4) { const then = this.dest.then; this.dest = null; if (then) then(); this.moved(); } else { const st = Math.min(d, sp * dt * (FAST() ? 6 : 1)); this.me.x += ddx / d * st; this.me.y += ddy / d * st; this.moved(); } } }
    moved() { const you = this.el.querySelector('.sh-you'); if (you) you.setAttribute('transform', `translate(${this.me.x.toFixed(1)} ${this.me.y.toFixed(1)})`); if (this.target && !this.g.arrivedOnce) { const c = this.target.castId ? this.cast.find(x => x.id === this.target.castId) : null; const p = c ? this.castPos(c) : this.target.hot ? this.standing(this.target.hot) : null; if (p && Math.hypot(p[0] - this.me.x, p[1] - this.me.y) < 70) this.g.onArrive(this.target); } }
    dir(d) { return this.portrait ? ({ u: 'l', d: 'r', l: 'd', r: 'u' })[d] || d : d; }
    dpad(d, on) { this.keys[this.dir(d)] = on; if (on) this.dest = null; }
    dispose() { this.dead = true; cancelAnimationFrame(this.raf); if (this.ro) this.ro.disconnect(); window.removeEventListener('keydown', this.onKey); window.removeEventListener('keyup', this.onKey); if (this.el.parentNode) this.el.parentNode.removeChild(this.el); }
  }

  // ---------------------------------------------------------------- the game
  class Game {
    constructor(root, o) {
      Object.assign(this, { root, dept: o.dept, cas: o.cas || (o.data && o.data.case) || 'main', data: o.data, meta: o.meta, idx: o.idx || null, role: o.role, name: o.name || '', mode2d: o.mode2d, onLeave: o.onLeave, onFinish: o.onFinish });
      this.id = shiftId(this.dept, this.cas); this.faculty = facultyOf(this.dept);
      this.cast = this.data.cast || {}; this.places = this.data.places || {}; this.segs = this.data.segs || [];
      this.flags = {}; this.items = []; this.met = new Set(); this.visited = new Set(); this.seen = new Set(); this.newCodex = new Set(); this.panos = {};
      this.stats = { stages: 0, grades: [], choicesOk: 0, choices: 0, calls: 0, items: 0, drills: 0, imaging: 0, minis: 0, tcm: 0 };
      this.clock = 0; this.day = 0; this.doneSegs = []; this.playedMs = 0; this.waiters = []; this.dead = false; this.panelOpen = false; this.target = null; this.findHot = null; this.arrivedOnce = false; this.sessionStart = Date.now();
      const saved = o.resume; const start = startSegFor(this.nowMinutes(), this.segs);
      this.order = saved && Array.isArray(saved.order) && saved.order.length ? saved.order : this.segs.map((s, i) => this.segs[(start + i) % this.segs.length].id);
      this.startSegId = this.order[0];
      this.pos = { seg: 0, beat: 0 };
      if (saved) { this.flags = saved.flags || {}; this.items = saved.items || []; this.met = new Set(saved.met || []); this.visited = new Set(saved.visited || []); this.seen = new Set(saved.seen || []); Object.assign(this.stats, saved.stats || {}); this.clock = saved.clock || 0; this.day = saved.day || 0; this.doneSegs = saved.doneSegs || []; this.playedMs = saved.playedMs || 0; this.name = saved.name || this.name; this.xpDone = !!saved.xpDone;
        const si = this.order.indexOf(saved.seg); if (si >= 0) { this.pos.seg = si; const seg = this.segById(saved.seg); let bi = seg ? seg.beats.findIndex(b => b.id === saved.beat) : -1; if (bi < 0) bi = Math.min(Number(saved.beatIdx) || 0, seg ? seg.beats.length - 1 : 0); this.pos.beat = Math.max(0, bi); } }
      // the codex is shared by every case of the department (people met, places, items, equipment seen, panoramas)
      const cx = json('ht-shift-codex:' + this.dept, null); if (cx) { (cx.met || []).forEach(x => this.met.add(x)); (cx.visited || []).forEach(x => this.visited.add(x)); (cx.seen || []).forEach(x => this.seen.add(x)); (cx.items || []).forEach(x => { if (!this.items.includes(x)) this.items.push(x); }); Object.assign(this.panos, cx.panos || {}); }
      this.resumed = !!saved;
    }
    nowMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
    segById(id) { return this.segs.find(s => s.id === id); }
    saveKey() { return saveKeyFor(this.dept, this.cas, this.role); }
    saveCodex() { store.set('ht-shift-codex:' + this.dept, JSON.stringify({ met: [...this.met], visited: [...this.visited], seen: [...this.seen], items: this.items, panos: this.panos })); }
    save() { if (this.dead || this.finished) return; const seg = this.segById(this.order[this.pos.seg]); const beat = seg && seg.beats[this.pos.beat]; this.playedMs += Date.now() - this.sessionStart; this.sessionStart = Date.now();
      store.set(this.saveKey(), JSON.stringify({ v: 2, dept: this.dept, case: this.cas, role: this.role, seg: seg ? seg.id : this.order[0], beat: beat ? beat.id : null, beatIdx: this.pos.beat, order: this.order, clock: this.clock, day: this.day, flags: this.flags, items: this.items, stats: this.stats, name: this.name, met: [...this.met], visited: [...this.visited], seen: [...this.seen], doneSegs: this.doneSegs, playedMs: this.playedMs, xpDone: !!this.xpDone, at: Date.now() }));
      this.saveCodex();
      this.ui.flashSaved(); }
    wait(setup) { return new Promise((res, rej) => { const w = { res, rej }; this.waiters.push(w); setup(v => { this.waiters = this.waiters.filter(x => x !== w); res(v); }, w); }); }
    cancelWaits() { const ws = this.waiters; this.waiters = []; ws.forEach(w => { try { w.rej(new Error('shift-disposed')); } catch (e) { /* ignore */ } }); }

    // ---- life cycle
    async start() {
      this.ui = new UI(this);
      await this.ui.build();
      await this.mountScene();
      this.keyHandler = e => this.onKey(e); window.addEventListener('keydown', this.keyHandler);
      this.tick = setInterval(() => { if (!this.dead) this.ui.setClock(this.clock); }, 1000);
      this.run().catch(e => { if (!/shift-disposed/.test(String(e && e.message))) console.error(e); });
    }
    dispose() { if (this.dead) return; this.dead = true; this.cancelWaits(); clearInterval(this.tick); window.removeEventListener('keydown', this.keyHandler); Snd.stopRing(); Snd.stopAlarm(); if (this.minisCleanup) { try { this.minisCleanup(); } catch (e) { /* ignore */ } this.minisCleanup = null; } if (HT.tableImaging && HT.tableImaging.isOpen && HT.tableImaging.isOpen()) HT.tableImaging.close(); this.unmountScene(); this.ui.dispose(); if (window.__htShift && window.__htShift.game === this) window.__htShift = null; }
    leave() { this.save(); const r = this.onLeave; this.dispose(); if (r) r(); }

    // ---- scene (3D walk / legacy 3D / 2D)
    // Every visible cast member gets its own standing spot: the body's home hotspot when free, otherwise the next
    // free hotspot of the room (scripts may have two patients, two students …), so avatars never overlap.
    castList() {
      if (this._castList) return this._castList;
      let patientSeen = false; const used = {}; const room = this.data.room; const orLike = /^(or|er|imaging|dental|clinic)$/.test(room); const main = roomMain(room);
      const pool = [...hotsOf(room)].filter(h => h !== main && h !== 'door').concat(['door']);
      const pick = want => { want = roomHot(room, want); const cands = [want].concat(want === main ? [roomHot(room, 'recovery')] : []).concat(pool); for (const h of cands) { if (h && !used[h]) { used[h] = 1; return h; } } return want; };
      // v2 rooms: the first patient lies on the couch / sits at the pulse desk in plain view; the OR hides them under the drapes
      this._castList = Object.keys(this.cast).filter(id => !this.cast[id].phoneOnly).map(id => { const c = this.cast[id]; const isPatient = c.body === 'patient'; const hidden = isPatient && !patientSeen && orLike; if (isPatient) patientSeen = true;
        const want = isPatient ? (hidden ? 'field' : (orLike ? 'recovery' : 'bed')) : (BODY_HOME[c.body] || 'door'); const at = hidden ? 'field' : pick(want);
        return { id, label: bl(c.name) + ' · ' + bl(c.role), name: bl(c.name), role: bl(c.role), color: c.color, tag: c.tag, body: c.body, hidden, at }; });
      return this._castList;
    }
    async mountScene() {
      const host = this.ui.stage; host.innerHTML = '';
      const T3 = HT.theatre3d;
      const can3d = !this.mode2d && T3 && T3.available && T3.available();
      if (can3d) {
        try {
          await T3.ensure();
          if (this.dead) return;
          const walkCapable = !!(T3.walk || /setCast|walkTo|api\.walk/.test(String(T3.mount)));
          this.walkCapable = walkCapable;
          const cast = this.castList();
          const legacySlots = { mentor: 'mentor', anaesthetist: 'anesthetist', scrub: 'scrub', circulating: 'circulating' }; const used = {}; this.roleToCast = {};
          // walk build: people come from setCast (api.roles holds only the player); legacy build: map bodies onto its fixed team slots
          const roles = walkCapable ? [] : cast.filter(c => !c.hidden).map(c => { const slot = legacySlots[c.body]; const id = slot && !used[slot] ? slot : (used.extra ? null : 'extra'); if (!id) return null; used[id] = 1; this.roleToCast[id] = c.id; return { id, zh: c.label, en: c.label, cap: c.color, skin: '#e8b48f', body: c.body, castId: c.id }; }).filter(Boolean);
          if (walkCapable) cast.forEach(c => { this.roleToCast[c.id] = c.id; });
          roles.push({ id: 'player', zh: this.name || T('shiftYou', '你', 'You'), en: this.name || 'You', cap: '#1f6f5f', skin: '#f2c9a0', player: true });
          const c = { id: 'shift-' + this.id, department: this.dept, kind: 'procedure', title: this.data.title, tiles: [] };
          const self = this;
          const api = { walk: true, spawn: 'door', view: 'follow', roomType: this.data.room, c, roles, playerId: 'player', fieldType: HT.theatre && HT.theatre.fieldType ? HT.theatre.fieldType(c) : 'generic', st: { view: 'follow', zoom: 1 }, map: [], s: {}, engine: { hands: { left: null, right: null }, anchors: [], tolerance: 0 }, doneStations: new Set(), lines: [], hotspots: (HT.theatre && HT.theatre.HOTSPOTS) || {}, vitals: { hr: 76, bp: '118/72', spo2: 98, rr: 14, etco2: 36, temp: '36.6' }, progress: 0.3, photoEnabled: store.get('ht-theatre-photo') !== '0', photo: scenePhoto(this.dept, this.data.room),
            imaging: () => HT.theatre && HT.theatre.ensureImaging ? HT.theatre.ensureImaging() : Promise.reject(new Error('no imaging')),
            openImaging: (target, opener) => self.openImaging(target, opener),
            onImaging: (target, opener, onClose) => { if (self.ui.dialogOpen() || self.panelOpen || self.findHot || self.target) return false; if (store.get('ht-table-imaging-auto') === '0') return false; self.openImaging(target, opener, onClose); return true; },
            onPick: id => self.onInteract(normHot(id)), onHot: id => self.onInteract(normHot(id)), onZone: () => {}, onRole: id => self.onTalk(self.roleToCast[id] || id),
            onTalk: id => self.onTalk(self.roleToCast[id] || id), onInteract: id => self.onInteract(normHot(id)), onArrive: tg => self.onArrive(tg), onFatal: () => self.fallback2d() };
          this.api3 = api;
          this.h = T3.mount(host, api);
          if (!this.h || this.h.disposed) throw new Error('3D unavailable');
          this.scene = this.adapter3d();
          if (typeof this.h.setCast === 'function') this.h.setCast(cast);
          if (typeof this.h.setFov === 'function') this.h.setFov(70);
          this.ui.setSceneMode('3d'); this.watchPerf(); return;
        } catch (e) { console.warn('shift: 3D unavailable, using the 2D plan', e); this.unmountScene(); }
      }
      this.plan = new Plan(host, this); this.plan.setCast(this.castList()); this.scene = this.adapter2d(); this.ui.setSceneMode('2d');
      if (this.target) this.scene.setTarget(this.target); if (this.findHot) this.scene.setFind(this.findHot);
    }
    // Weak GPUs (and software renderers): render the room at half resolution and upscale with CSS.
    watchPerf() { const pref = store.get('ht-shift-lowres'); if (pref === '1') { this.setLowRes(true); return; } if (pref === '0' || !this.h) return; const h = this.h; setTimeout(() => { if (this.dead || this.h !== h) return; const f0 = h.frames || 0; setTimeout(() => { if (this.dead || this.h !== h) return; if ((h.frames || 0) - f0 < 24) this.setLowRes(true); }, 2000); }, 1200); }
    setLowRes(on) { this.lowRes = !!on; this.root.classList.toggle('sh-lowres', this.lowRes); setTimeout(() => this.scene && this.scene.resize(), 50); }
    unmountScene() { this.ui.closeWide(); if (this.h) { try { this.h.dispose(); } catch (e) { /* ignore */ } this.h = null; } if (this.plan) { this.plan.dispose(); this.plan = null; } this.scene = null; }
    fallback2d() { if (this.dead || this.plan) return; this.mode2d = true; this.unmountScene(); this.mountScene(); }
    toggle2d() { this.mode2d = !this.mode2d; store.set('ht-shift-2d', this.mode2d ? '1' : '0'); this.unmountScene(); this.mountScene().then(() => { if (this.scene && this.target) this.scene.setTarget(this.target); if (this.scene && this.findHot) this.scene.setFind(this.findHot); }); }
    adapter3d() {
      const h = this.h, g = this;
      const legacy = id => LEGACY[id] || id;
      return {
        kind: '3d',
        setTarget(tg) { this.stand = null; if (typeof h.setTarget === 'function') { try { const r = h.setTarget(tg ? (tg.castId && !tg.hiddenCast ? tg.castId : tg.hot) : null); if (r && Array.isArray(r.at)) this.stand = r.at; } catch (e) { /* ignore */ } } },
        setFind(hot) { if (typeof h.setTarget === 'function' && hot) { try { const r = h.setTarget(hot); if (r && Array.isArray(r.at)) this.stand = r.at; } catch (e) { /* ignore */ } } else if (!hot && typeof h.setTarget === 'function') { try { h.setTarget(g.target ? (g.target.castId || g.target.hot) : null); } catch (e) { /* ignore */ } } },
        walkTo(tg) { const target = tg.castId && !tg.hiddenCast ? tg.castId : tg.hot;
          if (FAST() && typeof h.teleport === 'function' && this.stand) { try { h.teleport(this.stand); } catch (e) { /* ignore */ } return sleep(80); }
          if (typeof h.walkTo === 'function') return h.walkTo(target).catch(() => new Promise(() => {}));
          if (typeof h.flyTo === 'function') { try { h.flyTo(legacy(tg.hot || 'field')); } catch (e) { /* ignore */ } } return sleep(FAST() ? 60 : 420); },
        near() { return typeof h.near === 'function' ? h.near() : null; },
        bubble(id, text, ms) { if (typeof h.bubble === 'function') { try { h.bubble(id, text, ms); return; } catch (e) { /* ignore */ } } try { g.api3.lines = text ? [{ role: g.legacyRoleOf(id), text }] : []; h.update(g.api3); } catch (e) { /* ignore */ } },
        emote(id, kind) { if (typeof h.emote === 'function') { try { h.emote(id, kind); } catch (e) { /* ignore */ } } },
        setMood(m) { if (typeof h.setMood === 'function') { try { h.setMood(m); } catch (e) { /* ignore */ } } },
        setView(v) { if (typeof h.setView === 'function') { try { h.setView(v); } catch (e) { /* ignore */ } } },
        vitals(v) { try { g.api3.vitals = v; h.update(g.api3); } catch (e) { /* ignore */ } },
        showCard(hot) { if (typeof h.showCard === 'function') { try { h.showCard(legacy(hot), null, null); } catch (e) { /* ignore */ } } },
        resize() { if (typeof h.resize === 'function') h.resize(); }
      };
    }
    adapter2d() { const p = this.plan; return { kind: '2d', setTarget: tg => p.setTarget(tg), setFind: hot => p.setFind(hot), walkTo: tg => p.walkTo(tg), near: () => p.near(), bubble: () => {}, emote: () => {}, setMood: () => {}, setView: () => {}, vitals: () => {}, showCard: () => {}, resize: () => {} }; }
    legacyRoleOf(castId) { const k = Object.keys(this.roleToCast || {}).find(r => this.roleToCast[r] === castId); return k || castId; }
    openImaging(target, opener, onClose) { if (!HT.theatre || !HT.theatre.ensureImaging) return Promise.resolve(); return HT.theatre.ensureImaging().then(ti => ti.open(target, { department: this.dept, title: bl(this.data.title), opener, onClose })).then(() => { if (HT.xp) HT.xp.record({ kind: 'imaging' }); }).catch(() => {}); }

    // ---- scene events
    resolveTarget(to) {
      if (typeof to === 'string' && to.startsWith('place:')) { const pid = to.slice(6); const pl = this.places[pid] || {}; return { kind: 'place', id: pid, hot: pl.hot || 'field', label: bl(pl.name) || pid }; }
      const c = this.cast[to]; const list = this.castList(); const entry = list.find(x => x.id === to);
      const hiddenCast = !!(entry && entry.hidden);
      return { kind: 'cast', id: to, castId: to, hiddenCast, hot: hiddenCast ? 'field' : (entry && typeof entry.at === 'string' ? entry.at : BODY_HOME[(c || {}).body] || 'field'), label: c ? bl(c.name) : to };
    }
    // the scene only reports arrival at the target it was given, so any arrival while waiting counts (ids may be legacy names)
    onArrive(tg) { if (!this.arrival) return; const want = this.arrival.tg; const id = tg && typeof tg === 'object' ? (tg.id || tg.castId || tg.hot) : tg; if (id == null || typeof id !== 'string' || id === want.castId || normHot(id) === want.hot || id === want.id || (tg && tg.kind === 'point') || this.scene && this.scene.kind === '3d') this.arrived(); }
    onTalk(castId) { if (!castId || !this.cast[castId]) return; const c = this.cast[castId]; if (!this.met.has(castId)) { this.met.add(castId); this.newCodex.add('cast:' + castId); this.ui.codexBadge(); }
      if (this.arrival && this.arrival.tg.castId === castId) { this.arrived(); return; }
      if (this.ui.dialogOpen() || this.panelOpen) return;
      const txt = bl(c.about) || bl(c.role); this.scene && this.scene.bubble(castId, txt.slice(0, zh() ? 28 : 60), 2600); this.scene && this.scene.emote(castId, 'nod'); this.ui.toast(`${bl(c.name)}：${txt}`); Snd.play('blip'); }
    sameHot(a, b) { return a === b || LEGACY[a] === b || LEGACY[b] === a || roomHot(this.data.room, a) === roomHot(this.data.room, b); }
    onInteract(hot) { if (!hot) return; if (!this.seen.has(hot)) { this.seen.add(hot); this.newCodex.add('equip:' + hot); this.ui.codexBadge(); }
      if (this.findHot) { if (this.sameHot(hot, this.findHot)) { this.findResolve && this.findResolve(true); } else { this.findAttempts++; this.ui.toast(T('shiftFindWrong', '不是這個，再找找', 'Not that one, keep looking')); Snd.play('error'); } return; }
      if (this.arrival && !this.arrival.tg.castId && this.sameHot(this.arrival.tg.hot, hot)) this.arrived(); }
    arrived() { if (!this.arrival) return; const a = this.arrival; this.arrival = null; this.arrivedOnce = true; if (a.tg.kind === 'place' && !this.visited.has(a.tg.id)) { this.visited.add(a.tg.id); this.newCodex.add('place:' + a.tg.id); this.ui.codexBadge(); } if (a.tg.castId && !this.met.has(a.tg.castId)) { this.met.add(a.tg.castId); this.newCodex.add('cast:' + a.tg.castId); this.ui.codexBadge(); } Snd.play('arrive'); a.done(); }
    go() { if (this.arrival && !this.arrival.walking) { const a = this.arrival; a.walking = true; this.ui.setNextBusy(true); this.scene.walkTo(a.tg).then(() => { if (this.arrival === a) this.arrived(); }).catch(() => {}); } else if (this.findHot && this.scene) { this.findAssisted = true; this.scene.walkTo({ hot: this.findHot }).then(() => { if (this.findHot) { this.scene.showCard(this.findHot); this.findResolve && this.findResolve(true); } }).catch(() => {}); } }
    talk() { const n = this.scene && this.scene.near(); if (n && n.kind === 'cast' && n.id) { this.onTalk(n.id); return; } if (n && (n.kind === 'hot' || n.kind === 'equip') && n.id) { this.onInteract(normHot(n.id)); return; } if (this.arrival) this.go(); }
    onKey(e) {
      if (this.dead || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
      const k = e.key;
      if (k === 'Escape') { if (this.ui.pop) { this.ui.closePop(); e.preventDefault(); return; } if (this.ui.codexEl) { this.ui.closeCodex(); e.preventDefault(); return; } if (this.panelOpen) return; if (HT.tableImaging && HT.tableImaging.isOpen && HT.tableImaging.isOpen()) return; if (this.ui.titleEl) { this.ui.dismissTitle(); return; } if (!this.ui.confirmEl) { this.ui.confirmLeave(); e.preventDefault(); } return; }
      if (this.ui.confirmEl || this.panelOpen) return;
      if (k === 'Enter' || k === ' ') { if (this.ui.titleEl) { e.preventDefault(); this.ui.dismissTitle(); return; } if (this.ui.ringEl) { e.preventDefault(); this.ui.answerRing(); return; } if (this.ui.dialogOpen()) { e.preventDefault(); this.ui.advance(); return; } }
      const lk = k.length === 1 ? k.toLowerCase() : k;
      if (lk === 'g') { e.preventDefault(); this.go(); } else if (lk === 'e') { e.preventDefault(); this.talk(); } else if (lk === 'm') { e.preventDefault(); this.ui.toggleSound(); }
    }

    // ---- flow
    async run() {
      if (this.resumed && this.pos.beat > 0) this.ui.toast(T('shiftResume', '繼續上次', 'Resume') + ' · ' + bl(this.segById(this.order[this.pos.seg]).name));
      for (; this.pos.seg < this.order.length; this.pos.seg++, this.pos.beat = 0) {
        const seg = this.segById(this.order[this.pos.seg]); if (!seg) continue;
        const prev = this.clock || Math.max(0, seg.t - 25); const base = this.day * 1440; let target = base + seg.t;
        if (target < prev && this.pos.seg > 0) { this.day++; target = this.day * 1440 + seg.t; }
        this.clock = Math.max(this.clock, target);
        if (this.pos.beat === 0 || !this.resumed) { await this.ui.titleCard(seg, prev, this.clock, this.pos.seg > 0 && this.day > 0 && seg.id === this.order[0] ? T('shiftNewDay', '新的一天', 'A new day') : null); }
        this.resumed = false; this.scene && this.scene.setMood(seg.mood || 'day'); this.ui.setSeg(seg);
        for (; this.pos.beat < seg.beats.length; this.pos.beat++) {
          const b = seg.beats[this.pos.beat];
          if (b.roles && b.roles.length && !b.roles.includes(this.role)) continue;
          if (b.when && !this.whenOk(b.when)) continue;
          if (b.t != null) this.clock = Math.max(this.clock, this.day * 1440 + b.t);
          this.save();
          await this.beat(b, seg);
          if (this.dead) return;
          this.clock += 3;
          if (b.end) this.endFlag = true;
        }
        if (!this.doneSegs.includes(seg.id)) this.doneSegs.push(seg.id);
      }
      await this.ending();
    }
    whenOk(w) { const v = this.flags[w.flag]; const want = w.is === undefined ? true : w.is; return v === want || (want === false && v == null); }
    async beat(b, seg) {
      let isCall = false;
      if (b.ring) { isCall = !!b.ring.call; await this.ring(b.ring); if (isCall) this.stats.calls++; }
      if (b.to) await this.goTo(b.to, b.guide);
      if (b.lines && b.lines.length) await this.say(b.lines, { call: isCall, from: b.ring && b.ring.from });
      let result = null;
      if (b.mini) { result = await this.mini(b.mini, b); this.stats.minis++; this.clock += 6; }
      if (b.post && b.post.length) await this.say(b.post, {});
      if (b.set) Object.assign(this.flags, b.set);
      if (b.item) this.collect(b.item);
      return result;
    }
    collect(id) { if (!this.items.includes(id)) { this.items.push(id); this.stats.items++; this.newCodex.add('item:' + id); const e = (this.data.codex || []).find(c => c.id === id); this.ui.toast('📖 ' + (e ? bl(e.name) : id) + ' · ' + T('shiftCodex', '圖鑑', 'Codex')); Snd.play('item'); this.ui.codexBadge(); } }
    async goTo(to, guide) {
      const tg = this.resolveTarget(to); this.target = tg;
      this.ui.setNext(bl(guide) || tg.label, true); this.scene && this.scene.setTarget(tg); this.targetsSet = (this.targetsSet || 0) + 1;
      await this.wait(done => { this.arrival = { tg, done }; if (FAST()) setTimeout(() => this.go(), 30); });
      this.target = null; this.arrival = null; this.scene && this.scene.setTarget(null); this.ui.setNext('', false); this.ui.setNextBusy(false);
    }
    async say(lines, opts) { for (let i = 0; i < lines.length; i++) { const [who, text] = lines[i]; await this.ui.line(who, bl(text), { call: opts.call && who !== 'me' && who !== 'sys', last: i === lines.length - 1 }); if (this.dead) return; } this.ui.hideDialog(); }
    async ring(r) { await this.ui.ring(r); }

    // ---- minis
    async mini(m, b) {
      const type = m.type; let r;
      try {
        if (type === 'stage' || type === 'procedure') r = await this.miniStage(m, b);
        else if (type === 'drill') r = await this.miniDrill(m, b);
        else if (type === 'imaging') r = await this.miniImaging(m, b);
        else if (type === 'choice' || type === 'vitals') r = await this.miniChoice(m, b);
        else if (type === 'order') r = await this.miniOrder(m, b);
        else if (type === 'find') r = await this.miniFind(m, b);
        else if (type === 'pulse' || type === 'tongue') r = await this.miniExam(m, b);
        else if (type === 'points') r = await this.miniPoints(m, b);
        else if (type === 'herb') r = await this.miniHerb(m, b);
        else r = { ok: false, attempts: 0, assisted: false };
      } catch (e) { if (/shift-disposed/.test(String(e && e.message))) throw e; console.warn('shift mini failed', type, e); r = { ok: false, attempts: 0, assisted: false, error: true }; }
      if (this.dead) return r;
      if (r.ok) Snd.play('success');
      return r;
    }
    // choice-style options block shared by choice / vitals / pulse / tongue: resolves {ok, attempts, assisted}
    optionsBlock(p, m, state) {
      const letters = 'ABCD'; const host = document.createElement('div'); host.innerHTML = `<p class="sh-q">${esc(bl(m.q))}</p><div class="sh-opts">${m.options.map((o, i) => `<button type="button" class="sh-opt" data-opt="${i}"><span class="sh-letter">${letters[i] || i + 1}</span><span>${esc(bl(o))}</span></button>`).join('')}</div><div data-why></div>`;
      p.body.appendChild(host);
      let attempts = 0, first = null;
      return this.wait(done => {
        host.querySelectorAll('[data-opt]').forEach(btn => btn.onclick = () => { const i = Number(btn.dataset.opt); const o = m.options[i]; attempts++; if (first === null) first = !!o.ok;
          host.querySelectorAll('.sh-opt').forEach(x => x.classList.remove('hint')); btn.classList.add(o.ok ? 'ok' : 'bad'); const why = host.querySelector('[data-why]'); why.innerHTML = `<div class="sh-why ${o.ok ? 'ok' : 'bad'}"><b>${o.ok ? '✓ ' + esc(T('shiftCorrect', '正確', 'Correct')) : '✗ ' + esc(T('shiftWrong', '再想想', 'Think again'))}</b>${esc(bl(o.why))}</div>${o.ok ? `<button type="button" class="sh-cont" data-cont>${esc(T('shiftContinue', '繼續', 'Continue'))} →</button>` : `<button type="button" class="sh-cont" data-retry>${esc(T('shiftTryAgain', '再試一次', 'Try again'))}</button>`}`;
          if (o.set) Object.assign(this.flags, o.set);
          Snd.play(o.ok ? 'success' : 'error');
          if (o.ok) { host.querySelectorAll('[data-opt]').forEach(x => { x.disabled = true; }); why.querySelector('[data-cont]').onclick = () => done({ ok: first, attempts, assisted: !!state.assisted }); why.querySelector('[data-cont]').focus(); if (state.onCorrect) state.onCorrect(o); }
          else { btn.disabled = true; why.querySelector('[data-retry]').onclick = () => { why.innerHTML = ''; }; } });
        state.hint = () => { const i = m.options.findIndex(o => o.ok); const el = host.querySelector(`[data-opt="${i}"]`); if (el && !el.disabled) { el.classList.add('hint'); state.assisted = true; } };
        p.onClose = () => done({ ok: false, attempts, assisted: !!state.assisted, skipped: true });
      });
    }
    // 脈診站 / 舌診站: a procedural drawing (labelled 示意) above the options
    async miniExam(m, b) {
      const isPulse = m.type === 'pulse'; const state = { assisted: false, hint: null };
      const p = this.ui.panel(isPulse ? T('shiftPulse', '脈診站', 'Pulse station') : T('shiftTongue', '舌診站', 'Tongue station'), bl(this.data.title), { compact: true, assist: () => { if (state.hint) state.hint(); } });
      const wrap = document.createElement('div'); wrap.className = 'sh-exam'; p.body.appendChild(wrap);
      let sim = null;
      if (isPulse) {
        wrap.innerHTML = `<div class="sh-press" role="radiogroup" aria-label="${esc(T('shiftPressure', '指力', 'Pressure'))}"><span>${esc(T('shiftPressure', '指力', 'Pressure'))}</span>${[['float', T('shiftPressFloat', '浮取', 'Light')], ['mid', T('shiftPressMid', '中取', 'Medium')], ['deep', T('shiftPressDeep', '沉取', 'Deep')]].map(([k, l], i) => `<button type="button" role="radio" aria-checked="${i === 1}" data-press="${k}">${esc(l)}</button>`).join('')}<kbd>1 2 3</kbd></div><div class="sh-canvas"><canvas width="900" height="420" aria-label="${esc(T('shiftPulseSimShort', '脈象模擬', 'Pulse simulation'))}"></canvas><span class="sh-sim">${esc(T('shiftPulseSim', '示意：脈象模擬，非真實波形', 'Schematic: simulated pulse, not a real waveform'))}</span></div>`;
        sim = pulseStation(wrap.querySelector('canvas'), m.pulse, { tick: () => { if (!Snd.muted && Snd.ensure()) Snd.tone(220, 0.03, 'sine', 0.05); } });
        const setPress = k => { sim.setLevel(k); wrap.querySelectorAll('[data-press]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.press === k))); };
        wrap.querySelectorAll('[data-press]').forEach(x => x.onclick = () => setPress(x.dataset.press));
        const keyH = e => { const k = { 1: 'float', 2: 'mid', 3: 'deep' }[e.key]; if (k && !/INPUT|TEXTAREA/.test(e.target.tagName)) { setPress(k); e.preventDefault(); } }; p.el.addEventListener('keydown', keyH);
      } else {
        wrap.innerHTML = `<div class="sh-canvas sh-tongue"><canvas width="900" height="420" aria-label="${esc(T('shiftTongueSchematic', '舌象示意圖', 'Tongue schematic'))}"></canvas><span class="sh-sim">${esc(T('shiftTongueSim', '示意圖：舌象模擬', 'Schematic tongue drawing'))}</span></div>`;
        sim = tongueStation(wrap.querySelector('canvas'), m.tongue || {});
      }
      const res = await this.optionsBlock(p, m, state);
      if (sim) sim.stop(); p.close();
      this.stats.choices++; this.stats.tcm++; if (res.ok) this.stats.choicesOk++;
      return res;
    }
    // 取穴站: the acupuncture figure (acu-atlas) embedded; one point at a time, 3 tries each; falls back to a choice
    async miniPoints(m, b) {
      const codes = (m.codes || []).slice(); if (!codes.length) return { ok: false, attempts: 0, assisted: false };
      let atlas = null;
      try { if (!HT.acuAtlas) { if (HT.loadCss) HT.loadCss('acu-atlas.css'); await HT.loadScript('acu-atlas.js'); } else if (HT.loadCss) HT.loadCss('acu-atlas.css'); await HT.acuAtlas.ensure(); atlas = HT.acuAtlas; } catch (e) { atlas = null; }
      if (this.dead) throw new Error('shift-disposed');
      const TC = window.HT_TCM || {}; const pt = code => (TC.points || []).find(x => x.code === code) || { code, zh: code, py: '' };
      const label = code => { const q = pt(code); return `${q.zh}${q.py ? ' ' + q.py : ''} ${code}`; };
      if (!atlas || !atlas.embed) { // file:// without the figure data, or the atlas failed: name the point instead
        const pool = (TC.points || []).map(x => x.code).filter(c => !codes.includes(c)); const pick = pool.length ? pool.sort(() => Math.random() - 0.5).slice(0, 3) : ['LI11', 'ST44', 'SP9'].filter(c => !codes.includes(c));
        const opts = [codes[0]].concat(pick).sort(() => Math.random() - 0.5).map(c => ({ zh: label(c), en: label(c), ok: c === codes[0], why: c === codes[0] ? { zh: '正確的穴位。', en: 'The right point.' } : { zh: `那是 ${label(c)}。`, en: `That is ${label(c)}.` } }));
        const r = await this.miniChoice({ type: 'choice', q: { zh: `請選出 ${label(codes[0])}`, en: `Pick ${label(codes[0])}` }, options: opts }, b); this.stats.tcm++; return r;
      }
      const state = { assisted: false }; let fig = null, cur = 0, tries = 0, busy = false, attempts = 0, finish = null; const found = [];
      const p = this.ui.panel(T('shiftPoints', '取穴站', 'Point location'), bl(m.q), { assist: () => reveal(true) });
      p.body.innerHTML = `<div class="sh-points"><div class="sh-fig" data-fig></div><div class="sh-pts-side"><p class="sh-q">${esc(bl(m.q))}</p><div class="sh-ask" data-ask></div><div class="sh-pt-list" data-list>${codes.map((c, i) => `<span class="sh-pt" data-pt="${i}">${esc(label(c))}</span>`).join('')}</div><div class="sh-pt-msg" data-msg aria-live="polite"></div><div data-done></div></div></div>`;
      const self = this;
      const ask = () => { const c = codes[cur]; p.body.querySelector('[data-ask]').innerHTML = `<b>${esc(T('shiftTapPoint', '請點出', 'Tap'))}</b> <span class="sh-pt-big">${esc(pt(c).zh)}</span> <small>${esc(pt(c).py || '')} · ${esc(c)}</small> <em>${tries ? esc(say(`第 ${tries + 1} 次`, `try ${tries + 1}`)) : ''}</em>`; p.body.querySelectorAll('[data-pt]').forEach((el, i) => { el.classList.toggle('cur', i === cur); el.classList.toggle('ok', found[i] === true); el.classList.toggle('bad', found[i] === false); }); };
      const next = () => { busy = false; cur++; tries = 0; if (cur >= codes.length) { const okAll = found.every(x => x === true); p.body.querySelector('[data-done]').innerHTML = `<div class="sh-why ${okAll ? 'ok' : 'bad'}"><b>${okAll ? '✓ ' + esc(T('shiftCorrect', '正確', 'Correct')) : esc(T('shiftDone', '完成', 'Done'))}</b>${esc(say(`找到 ${found.filter(x => x).length}/${codes.length} 個穴位。`, `Found ${found.filter(x => x).length}/${codes.length} points.`))}</div><button type="button" class="sh-cont" data-cont>${esc(T('shiftContinue', '繼續', 'Continue'))} →</button>`; const cb = p.body.querySelector('[data-cont]'); cb.onclick = () => finish && finish({ ok: okAll, attempts, assisted: state.assisted }); cb.focus(); Snd.play(okAll ? 'success' : 'blip'); p.body.querySelector('[data-ask]').innerHTML = ''; return; } ask(); };
      function reveal(byAssist) { if (cur >= codes.length || !fig || busy) return; busy = true; const c = codes[cur]; try { fig.select(c); } catch (e) { /* ignore */ } if (byAssist) { state.assisted = true; found[cur] = true; p.body.querySelector('[data-msg]').textContent = '✨ ' + label(c); } else { found[cur] = false; p.body.querySelector('[data-msg]').textContent = say(`這裡是 ${label(c)}`, `Here: ${label(c)}`); } setTimeout(() => { if (!self.dead && finish) next(); }, FAST() ? 60 : 900); }
      const onPick = code => { if (cur >= codes.length || busy) return; attempts++; const want = codes[cur]; if (code === want) { busy = true; found[cur] = true; try { fig.select(code); } catch (e) { /* ignore */ } p.body.querySelector('[data-msg]').textContent = '✓ ' + T('shiftPointFound', '找到了', 'Found') + ' · ' + label(code); Snd.play('item'); setTimeout(() => { if (!self.dead && finish) next(); }, FAST() ? 60 : 700); return; }
        tries++; Snd.play('error'); p.body.querySelector('[data-msg]').textContent = '✗ ' + T('shiftPointHint', '那是', 'That is') + ' ' + label(code); if (tries >= 3) reveal(false); else ask(); };
      const res = await this.wait(done => { finish = done; try { fig = atlas.embed(p.body.querySelector('[data-fig]'), { view: m.view || 'front', compact: true, labels: false, flow: false, onPick }); } catch (e) { fig = null; } if (!fig) { done({ ok: false, attempts: 0, assisted: false, error: true }); return; } ask(); p.onClose = () => done({ ok: false, attempts, assisted: state.assisted, skipped: true }); });
      if (fig && fig.destroy) { try { fig.destroy(); } catch (e) { /* ignore */ } } p.close();
      this.stats.tcm++; return res;
    }
    // 配伍站: a tray of herb cards from data/tcm-library.js; select exactly the herbs asked for
    async miniHerb(m, b) {
      try { if (!window.HT_TCM) await HT.loadScript('data/tcm-library.js'); } catch (e) { /* cards fall back to names only */ }
      if (this.dead) throw new Error('shift-disposed');
      const TC = window.HT_TCM || {}; const herbs = TC.herbs || []; const cats = {}; (TC.herbCategories || []).forEach(c => { cats[c.id] = c; });
      const info = name => herbs.find(h => h.zh === name) || { zh: name, py: '', latin: '', cat: '', act_zh: '', act_en: '' };
      const pick = new Set(m.pick || []); const all = (m.pick || []).concat(m.distractors || []).sort(() => Math.random() - 0.5);
      const formula = m.formula ? (TC.formulas || []).find(f => f.zh === m.formula) : null;
      const state = { assisted: false }; let attempts = 0, finish = null; const sel = new Set();
      const p = this.ui.panel(T('shiftHerb', '配伍站', 'Herb station'), bl(m.q) + (m.formula ? ' · ' + m.formula : ''), { assist: () => { state.assisted = true; sel.clear(); pick.forEach(h => sel.add(h)); sync(); } });
      p.body.innerHTML = `<p class="sh-q">${esc(bl(m.q))}</p><div class="sh-tray" role="group">${all.map(h => { const q = info(h); const c = cats[q.cat] || {}; return `<button type="button" class="sh-herb" data-herb="${esc(h)}" aria-pressed="false" style="--hc:${esc(c.color || '#8a6d3b')}"><b>${esc(q.zh)}</b><small>${esc(q.py || '')}</small><i>${esc(q.latin || '')}</i><em>${esc(zh() ? (c.zh || '').split('：')[0] : (c.en || '').split(':')[0])}</em></button>`; }).join('')}</div><div class="sh-tray-acts"><span data-count></span><button type="button" class="sh-cont" data-confirm>${esc(T('shiftHerbConfirm', '確認配伍', 'Confirm'))}</button></div><div data-why></div>`;
      const sync = () => { p.body.querySelectorAll('[data-herb]').forEach(el => el.setAttribute('aria-pressed', String(sel.has(el.dataset.herb)))); p.body.querySelector('[data-count]').textContent = say(`已選 ${sel.size} 味`, `${sel.size} selected`); };
      const line = h => { const q = info(h); const a = zh() ? q.act_zh : q.act_en; return `<li><b>${esc(q.zh)}</b>${a ? ' — ' + esc(a) : ''}</li>`; };
      const res = await this.wait(done => { finish = done;
        p.body.querySelectorAll('[data-herb]').forEach(el => el.onclick = () => { const h = el.dataset.herb; if (sel.has(h)) sel.delete(h); else sel.add(h); Snd.play('blip'); sync(); });
        p.body.querySelector('[data-confirm]').onclick = () => { attempts++; const missed = [...pick].filter(h => !sel.has(h)), extra = [...sel].filter(h => !pick.has(h)); const why = p.body.querySelector('[data-why]');
          if (!missed.length && !extra.length) { p.body.querySelectorAll('[data-herb]').forEach(el => { el.disabled = true; el.classList.toggle('ok', pick.has(el.dataset.herb)); }); p.body.querySelector('[data-confirm]').disabled = true;
            why.innerHTML = `<div class="sh-why ok"><b>✓ ${esc(T('shiftCorrect', '正確', 'Correct'))}</b>${formula ? `<div class="sh-formula"><b>${esc(formula.zh)}</b> <small>${esc(formula.py || '')} · ${esc(formula.source || '')}</small><p>${esc(zh() ? formula.act_zh : formula.act_en)}</p>${formula.pat_zh ? `<p class="sh-muted">${esc(zh() ? formula.pat_zh : formula.pat_en || '')}</p>` : ''}</div>` : ''}<ul class="sh-herb-list">${[...pick].map(line).join('')}</ul></div><button type="button" class="sh-cont" data-cont>${esc(T('shiftContinue', '繼續', 'Continue'))} →</button>`;
            const cb = why.querySelector('[data-cont]'); cb.onclick = () => finish && finish({ ok: attempts === 1, attempts, assisted: state.assisted }); cb.focus(); Snd.play('success'); return; }
          Snd.play('error'); p.body.querySelectorAll('[data-herb]').forEach(el => { el.classList.toggle('bad', extra.includes(el.dataset.herb)); });
          why.innerHTML = `<div class="sh-why bad"><b>✗ ${esc(T('shiftWrong', '再想想', 'Think again'))}</b>${missed.length ? `<p>${esc(T('shiftHerbMissed', '少了', 'Missing'))}：</p><ul class="sh-herb-list">${missed.map(line).join('')}</ul>` : ''}${extra.length ? `<p>${esc(T('shiftHerbExtra', '多了', 'Not in this set'))}：</p><ul class="sh-herb-list">${extra.map(line).join('')}</ul>` : ''}</div>`; };
        p.onClose = () => done({ ok: false, attempts, assisted: state.assisted, skipped: true }); sync(); });
      p.close(); this.stats.tcm++; return res;
    }
    async miniStage(m, b) {
      const kind = m.type === 'procedure' ? T('shiftKindProcedure', '完整程序', 'Whole procedure') : T('shiftKindStage', '工序', 'Stage');
      let lib = null; try { lib = await HT.procedures.loadLibrary(this.dept); } catch (e) { lib = null; }
      if (this.dead) throw new Error('shift-disposed');
      const spec = lib && lib.cases.find(c => c.id === m.case);
      if (!spec) { this.ui.toast(T('shiftLoadError', '值班劇本載入失敗', 'Could not load')); return { ok: false, attempts: 0, assisted: false }; }
      const stageTitle = m.type === 'stage' && spec.stages[m.stage] ? bl(spec.stages[m.stage].title) : bl(spec.title);
      if (spec.locked) { const p = this.ui.panel(kind, stageTitle, {}); p.body.innerHTML = `<div class="sh-locked"><div class="sh-lock">🔒</div><p>${esc(T('shiftLocked', '此程序需學習通行證，先略過。', 'This procedure needs a learning pass; skipped for now.'))}</p><p><a class="button primary" href="#membership">${esc(T('unlock', '啟用通行證', 'Unlock'))}</a></p><button type="button" class="sh-cont" data-skip>${esc(T('shiftSkip', '略過', 'Skip'))}</button></div>`; await this.wait(done => { p.body.querySelector('[data-skip]').onclick = () => done(); p.onClose = done; }); p.close(); return { ok: false, attempts: 0, assisted: false, locked: true }; }
      store.del(`ht-workbench-v2:${uid()}:shift:${spec.id}`);
      const p = this.ui.panel(kind, stageTitle, { assist: () => { const btn = p.body.querySelector('[data-assist]'); if (btn && !btn.disabled) btn.click(); } });
      const host = document.createElement('div'); p.body.appendChild(host);
      let cleanup = null; const self = this;
      const result = await this.wait((done, w) => {
        let finished = false;
        cleanup = HT.workbench.mount(host, { spec, library: [spec], department: self.dept, storageId: 'shift', stageIndex: m.type === 'stage' ? (m.stage | 0) : 0, singleStage: m.type === 'stage', hideSelector: true, scene: 'tiles', onLocked: () => done({ ok: false, attempts: 0, assisted: false }), onComplete: snap => { if (finished) return; finished = true; const hist = (snap && snap.history) || []; const h = m.type === 'stage' ? hist.find(x => x.stage === (m.stage | 0)) : null; const assisted = h ? !!h.assisted : hist.some(x => x.assisted); const attempts = h ? h.attempts : hist.reduce((n, x) => n + (x.attempts || 1), 0); setTimeout(() => done({ ok: true, attempts, assisted }), FAST() ? 50 : 700); } });
        self.minisCleanup = () => { if (cleanup) cleanup(); cleanup = null; };
        p.onClose = () => done({ ok: false, attempts: 0, assisted: false, skipped: true });
      });
      if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } } this.minisCleanup = null; p.close();
      if (result.ok) this.stats.stages += m.type === 'stage' ? 1 : (spec.stages.length || 1);
      return result;
    }
    async miniDrill(m, b) {
      if (!HT.surgicalField) { try { await HT.loadScript('surgical-field.js'); } catch (e) { return { ok: false, attempts: 0, assisted: false }; } }
      if (HT.loadCss) await HT.loadCss('surgical-field.css');
      if (this.dead) throw new Error('shift-disposed');
      // a template that this build of surgical-field.js does not know (TCM templates land with F2): skip, never mount a wrong one
      const tplId = m.template || this.dept; const SF = HT.surgicalField;
      try { const known = SF.departments ? SF.departments() : []; const tpl = known.includes(tplId) ? (SF.templates ? SF.templates().find(t => t.id === tplId) : null) : null; const has = known.includes(tplId) && (!tpl || !m.drill || tpl.drills.some(d => d.id === m.drill) || (tpl.extra || []).includes(m.drill)); if (!has) { this.ui.toast(T('shiftDrillMissing', '此精細操作尚未提供，先略過', 'This drill is not available yet; skipped')); await sleep(FAST() ? 30 : 900); return { ok: false, attempts: 0, assisted: false, skipped: true }; } } catch (e) { /* template lookup is best effort */ }
      const p = this.ui.panel(T('shiftStatDrills', '精細操作', 'Precision drill'), bl(this.data.title), { assist: () => { if (field && field.assist) field.assist(true); } });
      const host = document.createElement('div'); p.body.appendChild(host);
      let field = null, last = null; const self = this;
      const result = await this.wait(done => {
        field = HT.surgicalField.mount(host, { department: m.template || self.dept, drill: m.drill, stageIndex: 0, caseInfo: { id: 'shift-' + self.id, title: self.data.title, department: m.template || self.dept }, onDone: r => { last = r; setTimeout(() => done({ ok: !r.failed, grade: r.grade, score: r.score, attempts: 1, assisted: !!r.assisted }), FAST() ? 50 : 900); }, onClose: r => done(last ? { ok: !last.failed, grade: last.grade, attempts: 1, assisted: !!last.assisted } : { ok: false, attempts: 0, assisted: false, skipped: true }) });
        self.minisCleanup = () => { if (field) field(); field = null; };
        p.onClose = () => done(last ? { ok: !last.failed, grade: last.grade, attempts: 1, assisted: !!last.assisted } : { ok: false, attempts: 0, assisted: false, skipped: true });
        if (field && field.focus) setTimeout(() => field && field.focus(), 50);
      });
      if (field) { try { field(); } catch (e) { /* ignore */ } } this.minisCleanup = null; p.close();
      if (result.ok) { this.stats.drills++; if (result.grade) this.stats.grades.push(result.grade); }
      return result;
    }
    async miniImaging(m, b) {
      this.ui.setNext(T('shiftOpenImaging', '打開影像', 'Open imaging') + ' · ' + bl(this.data.title), false);
      let ti = null; try { ti = await HT.theatre.ensureImaging(); } catch (e) { ti = null; }
      if (this.dead) throw new Error('shift-disposed');
      if (ti) await this.wait(done => { ti.open({ kind: 'region', id: m.region }, { department: this.dept, title: bl(this.data.title), onClose: () => done() }).catch(() => done()); });
      if (this.dead) throw new Error('shift-disposed');
      this.ui.setNext('', false);
      if (m.question) await this.ui.question(bl(m.question), bl(m.answer));
      this.stats.imaging++;
      return { ok: true, attempts: 1, assisted: false };
    }
    async miniChoice(m, b) {
      const isV = m.type === 'vitals';
      const p = this.ui.panel(isV ? T('shiftKindVitals', '生命徵象', 'Vitals') : T('shiftKindDecision', '判斷', 'Decision'), isV ? eventName(m.event) : T('shiftPickBest', '選一個最合理的做法', 'Pick the most reasonable action'), { compact: true, assist: () => { const i = m.options.findIndex(o => o.ok); const el = p.body.querySelector(`[data-opt="${i}"]`); if (el) { el.classList.add('hint'); assisted = true; } } });
      let assisted = false, attempts = 0, first = null, picked = null;
      const letters = 'ABCD';
      p.body.innerHTML = `${isV ? `<div class="sh-vitals"><canvas width="900" height="300" aria-label="${esc(eventName(m.event))}"></canvas><span class="sh-alarm">ALARM</span><span class="sh-sim">${esc(T('shiftSimulation', '教學模擬 · 非真實病人', 'Teaching simulation'))}</span></div><p class="sh-q">${esc(T('shiftMonitorShows', '監視器顯示：', 'The monitor shows: ') + eventName(m.event) + T('shiftFirstResponse', '。你的第一個反應是？', '. What is your first response?'))}</p>` : `<p class="sh-q">${esc(bl(m.q))}</p>`}<div class="sh-opts">${m.options.map((o, i) => `<button type="button" class="sh-opt" data-opt="${i}"><span class="sh-letter">${letters[i] || i + 1}</span><span>${esc(bl(o))}</span></button>`).join('')}</div><div data-why></div>`;
      let mon = null; if (isV) { mon = vitalsMonitor(p.body.querySelector('canvas'), m.event); Snd.startAlarm(); this.scene && this.scene.vitals(mon.vitals); this.scene && this.scene.setMood('alarm'); }
      const res = await this.wait(done => {
        p.body.querySelectorAll('[data-opt]').forEach(btn => btn.onclick = () => { const i = Number(btn.dataset.opt); const o = m.options[i]; attempts++; if (first === null) first = !!o.ok; picked = o;
          p.body.querySelectorAll('.sh-opt').forEach(x => x.classList.remove('hint')); btn.classList.add(o.ok ? 'ok' : 'bad'); const why = p.body.querySelector('[data-why]'); why.innerHTML = `<div class="sh-why ${o.ok ? 'ok' : 'bad'}"><b>${o.ok ? '✓ ' + esc(T('shiftCorrect', '正確', 'Correct')) : '✗ ' + esc(T('shiftWrong', '再想想', 'Think again'))}</b>${esc(bl(o.why))}</div>${o.ok ? `<button type="button" class="sh-cont" data-cont>${esc(T('shiftContinue', '繼續', 'Continue'))} →</button>` : `<button type="button" class="sh-cont" data-retry>${esc(T('shiftTryAgain', '再試一次', 'Try again'))}</button>`}`;
          if (o.set) Object.assign(this.flags, o.set);
          Snd.play(o.ok ? 'success' : 'error');
          if (o.ok) { p.body.querySelectorAll('[data-opt]').forEach(x => { x.disabled = true; }); why.querySelector('[data-cont]').onclick = () => done({ ok: first, attempts, assisted }); why.querySelector('[data-cont]').focus(); }
          else { btn.disabled = true; why.querySelector('[data-retry]').onclick = () => { why.innerHTML = ''; }; } });
        p.onClose = () => done({ ok: false, attempts, assisted, skipped: true });
      });
      if (mon) mon.stop(); Snd.stopAlarm(); if (isV && this.scene) { this.scene.vitals({ hr: 76, bp: '118/72', spo2: 98, rr: 14, etco2: 36, temp: '36.6' }); const seg = this.segById(this.order[this.pos.seg]); this.scene.setMood(seg && seg.mood || 'day'); }
      p.close(); this.stats.choices++; if (res.ok) this.stats.choicesOk++;
      return res;
    }
    async miniOrder(m, b) {
      const steps = m.steps.map((s, i) => ({ i, text: bl(s) })); const shuffled = steps.slice(); for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
      if (shuffled.every((s, k) => s.i === k)) shuffled.reverse();
      let next = 0, attempts = 0, assisted = false;
      const p = this.ui.panel(T('shiftKindOrder', '排序', 'Order'), T('shiftOrderHint', '依序點選步驟', 'Tap the steps in order'), { compact: true, assist: () => { assisted = true; place(next); } });
      p.body.innerHTML = `<p class="sh-q">${esc(bl(m.q))}</p><div class="sh-order"><div><h4>${esc(T('shiftOrderHint', '依序點選步驟', 'Tap the steps in order'))}</h4><div class="sh-opts" data-pool>${shuffled.map(s => `<button type="button" class="sh-opt" data-step="${s.i}"><span class="sh-letter">•</span><span>${esc(s.text)}</span></button>`).join('')}</div></div><div><h4>${esc(T('shiftYourOrder', '你的順序', 'Your order'))}</h4><div class="sh-opts" data-done></div></div></div><div data-why></div>`;
      const self = this; let finish = null;
      function place(i) { const btn = p.body.querySelector(`[data-pool] [data-step="${i}"]`); if (!btn) return; btn.remove(); const d = document.createElement('div'); d.className = 'sh-opt placed'; d.innerHTML = `<span class="sh-letter">${next + 1}</span><span>${esc(steps[i].text)}</span>`; p.body.querySelector('[data-done]').appendChild(d); next++; Snd.play('blip'); if (next >= steps.length) { p.body.querySelector('[data-why]').innerHTML = `<div class="sh-why ok"><b>✓ ${esc(T('shiftCorrect', '正確', 'Correct'))}</b>${esc(say(attempts ? `順序完成（錯了 ${attempts} 次）。` : '一次到位。', attempts ? `Done (${attempts} wrong taps).` : 'First time right.'))}</div><button type="button" class="sh-cont" data-cont>${esc(T('shiftContinue', '繼續', 'Continue'))} →</button>`; const c = p.body.querySelector('[data-cont]'); c.onclick = () => finish && finish({ ok: attempts === 0, attempts, assisted }); c.focus(); Snd.play('success'); } }
      const res = await this.wait(done => { finish = done; p.body.querySelectorAll('[data-pool] [data-step]').forEach(btn => btn.onclick = () => { const i = Number(btn.dataset.step); if (i === next) place(i); else { attempts++; btn.classList.remove('wrong'); void btn.offsetWidth; btn.classList.add('wrong'); Snd.play('error'); } }); p.onClose = () => done({ ok: false, attempts, assisted, skipped: true }); });
      p.close(); return res;
    }
    async miniFind(m, b) {
      this.findHot = m.hot; this.findAttempts = 0; this.findAssisted = false;
      this.ui.setNext('🔍 ' + bl(m.q), true, T('shiftFindHint', '點房間裡的那個東西', 'Tap that object in the room'));
      this.scene && this.scene.setFind(m.hot);
      await this.wait(done => { this.findResolve = done; if (FAST()) setTimeout(() => this.go(), 30); });
      const r = { ok: this.findAttempts === 0, attempts: this.findAttempts, assisted: this.findAssisted };
      this.findHot = null; this.findResolve = null; this.scene && this.scene.setFind(null); this.ui.setNext('', false); this.ui.setNextBusy(false);
      this.ui.toast('✓ ' + (HOT_NAME[m.hot] ? say(HOT_NAME[m.hot][0], HOT_NAME[m.hot][1]) : m.hot));
      return r;
    }

    // ---- ending
    async ending() {
      this.playedMs += Date.now() - this.sessionStart; this.sessionStart = Date.now(); this.finished = true;
      // XP once per department + case (`shift:<dept>` for main keeps v4.0 records, `shift:<dept>--<case>` for the others)
      if (!this.xpDone && HT.xp) { this.xpDone = true; try { HT.xp.record({ kind: 'case', department: this.dept, caseId: 'shift:' + this.id }); } catch (e) { /* ignore */ } }
      store.set(this.saveKey(), JSON.stringify({ v: 2, done: true, dept: this.dept, case: this.cas, role: this.role, name: this.name, stats: this.stats, at: Date.now(), xpDone: true }));
      this.saveCodex();
      try { if (HT.app && HT.app.recordSim) HT.app.recordSim('shift-' + this.id, Math.round(100 * (this.stats.choicesOk + this.stats.stages) / Math.max(1, this.stats.choices + this.stats.stages))); } catch (e) { /* ignore */ }
      Snd.play('success');
      const canvas = await drawEndingCard(this);
      this.ui.ending(canvas);
      if (this.onFinish) this.onFinish();
    }
    link() { return `#shift?department=${this.dept}${this.cas !== 'main' ? '&case=' + this.cas : ''}`; }
    caseLine() { const parts = []; if (this.data.caseTitle && bl(this.data.caseTitle) !== bl(this.data.title)) parts.push(bl(this.data.caseTitle)); if (this.data.condition) parts.push(bl(this.data.condition)); return parts.join(' · '); }
    otherCases() { return casesOf(this.idx, this.dept).filter(s => s.case !== this.cas); }
    recapText() { const seg = id => this.segById(id); const line = this.order.map(id => seg(id)).filter(Boolean).map(s => `${hhmm(s.t)} ${bl(s.name)}${s.note ? ' — ' + bl(s.note) : ''}`).join('\n'); const st = this.statsList().map(([k, v]) => `${k}: ${v}`).join(' · '); const cl = this.caseLine();
      return `${bl(this.data.title)} · ${deptName(this.meta)}${cl ? '\n' + cl : ''}\n${T('shiftPlayedAs', '扮演', 'Played as')}: ${this.roleName()}${this.name ? ' · ' + this.name : ''}\n${line}\n${st}\n${T('shiftSimulation', '教學模擬 · 非真實病人', 'Teaching simulation · not a real patient')}\n${SITE_URL}${this.link()}`; }
    roleName() { const r = (this.data.roles || []).find(x => x.id === this.role); return r ? (zh() ? r.zh : r.en) : this.role; }
    statsList() { const s = this.stats; let want = ((this.data.ending && this.data.ending.stats) || ['stages', 'grades', 'choices', 'calls', 'items', 'time']).slice(); if (s.tcm && !want.includes('tcm')) want = want.filter(k => !(k === 'stages' && !s.stages) && !(k === 'grades' && !s.grades.length)).concat(['tcm']); const mins = Math.max(1, Math.round(this.playedMs / 60000));
      const all = { stages: [T('shiftStatStages', '完成工序', 'Stages passed'), String(s.stages)], grades: [T('shiftStatGrades', '精準評等', 'Precision grades'), s.grades.length ? s.grades.join(' ') : '—'], choices: [T('shiftStatChoices', '正確選擇', 'Correct choices'), `${s.choicesOk}/${s.choices}`], calls: [T('shiftStatCalls', '接聽來電', 'Calls answered'), String(s.calls)], items: [T('shiftStatItems', '收集物品', 'Items collected'), String(this.items.length)], time: [T('shiftStatTime', '遊玩時間', 'Time played'), `${mins} ${T('shiftMinutes', '分鐘', 'min')}`], drills: [T('shiftStatDrills', '精細操作', 'Precision drills'), String(s.drills)], imaging: [T('shiftStatImaging', '影像判讀', 'Images read'), String(s.imaging)], tcm: [T('shiftStatTcm', '診察', 'TCM examinations'), String(s.tcm)] };
      return want.filter(k => all[k]).slice(0, 6).map(k => all[k]); }
    // 360° panorama from the wide-angle cluster → codex item `panorama-<seg>` with a small thumbnail (shared per department)
    addPanorama(canvas) { if (!canvas || !canvas.width) return; const seg = this.order[this.pos.seg] || 'day'; const id = 'panorama-' + seg; try { const th = document.createElement('canvas'); th.width = 192; th.height = 96; th.getContext('2d').drawImage(canvas, 0, 0, 192, 96); this.panos[id] = th.toDataURL('image/jpeg', 0.6); const keys = Object.keys(this.panos); while (keys.length > 8) delete this.panos[keys.shift()]; } catch (e) { this.panos[id] = ''; } if (!this.items.includes(id)) { this.items.push(id); this.stats.items++; } this.newCodex.add('item:' + id); this.ui.codexBadge(); this.saveCodex(); this.ui.toast('🌐 ' + T('shiftPanoramaSaved', '環景照已存入圖鑑', 'Panorama saved to the codex')); Snd.play('item'); }
  }
  function eventName(ev) { return ({ hypotension: ['血壓下降', 'Hypotension'], desaturation: ['血氧下降', 'Desaturation'], bradycardia: ['心搏過緩', 'Bradycardia'], tachyarrhythmia: ['快速心律不整', 'Tachyarrhythmia'], hypertension: ['血壓升高', 'Hypertension'], fever: ['發燒', 'Fever'], bleeding: ['出血', 'Bleeding'], hypoglycaemia: ['低血糖', 'Hypoglycaemia'], seizure: ['癲癇發作', 'Seizure'], arrest: ['心跳停止', 'Cardiac arrest'] }[ev] || [ev, ev]).map((x, i) => x)[zh() ? 0 : 1]; }
  function scenePhoto(dept, room) { const entries = window.HT_SCENE_PHOTOS && window.HT_SCENE_PHOTOS.scenes; if (FILE || !Array.isArray(entries)) return null; const list = entries.filter(p => p && /^[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(p.file || '')); const byDept = list.filter(p => p.department === dept), byRoom = list.filter(p => !p.department && p.room === room); const pick = byDept.find(p => p.panorama) || byDept[0] || byRoom.find(p => p.panorama) || byRoom[0]; if (!pick) return null; return { src: 'assets/scenes/' + pick.file, panorama: !!pick.panorama, credit: pick.credit || '', width: Number(pick.storedWidth || pick.width) || 0, height: Number(pick.storedHeight || pick.height) || 0 }; }

  // ---------------------------------------------------------------- vitals monitor strip (procedural, labelled simulation)
  function vitalsMonitor(cv, event) {
    const g = cv.getContext('2d'); const W = cv.width, H = cv.height; let raf = 0, x = 0, t0 = performance.now(), tt = 0, last = t0; const prev = [null, null, null];
    const E = { hypotension: { hr: [78, 122], sbp: [118, 82], dbp: [74, 48], spo2: [98, 96], rr: [14, 22] }, desaturation: { hr: [80, 112], sbp: [120, 126], dbp: [74, 78], spo2: [97, 86], rr: [14, 28] }, bradycardia: { hr: [72, 38], sbp: [122, 92], dbp: [76, 56], spo2: [98, 96], rr: [14, 14] }, tachyarrhythmia: { hr: [84, 168], sbp: [120, 84], dbp: [74, 52], spo2: [98, 95], rr: [16, 22], irregular: true }, hypertension: { hr: [76, 92], sbp: [124, 196], dbp: [78, 112], spo2: [98, 97], rr: [14, 16] }, fever: { hr: [80, 118], sbp: [118, 104], dbp: [72, 60], spo2: [97, 95], rr: [16, 24], temp: [36.8, 39.2] }, bleeding: { hr: [82, 128], sbp: [120, 78], dbp: [74, 44], spo2: [98, 95], rr: [14, 26] }, hypoglycaemia: { hr: [76, 108], sbp: [120, 112], dbp: [74, 70], spo2: [98, 97], rr: [14, 18] }, seizure: { hr: [80, 130], sbp: [120, 150], dbp: [74, 90], spo2: [97, 88], rr: [14, 24] }, arrest: { hr: [78, 0], sbp: [118, 0], dbp: [74, 0], spo2: [98, 70], rr: [14, 0] } }[event] || { hr: [78, 122], sbp: [118, 82], dbp: [74, 48], spo2: [98, 96], rr: [14, 22] };
    const lerp = (a, b, k) => a + (b - a) * k; const k = () => Math.min(1, tt / 9);
    const cur = () => ({ hr: Math.round(lerp(E.hr[0], E.hr[1], k())), sbp: Math.round(lerp(E.sbp[0], E.sbp[1], k())), dbp: Math.round(lerp(E.dbp[0], E.dbp[1], k())), spo2: Math.round(lerp(E.spo2[0], E.spo2[1], k())), rr: Math.round(lerp(E.rr[0], E.rr[1], k())), temp: E.temp ? lerp(E.temp[0], E.temp[1], k()).toFixed(1) : '36.8' });
    const gs = (p, m, w, a) => a * Math.exp(-((p - m) ** 2) / (2 * w * w));
    function wave(ch, time, v) { if (v.hr <= 0) return ch === 0 ? 0.02 * Math.sin(time * 3) : 0.02; const beat = 60 / Math.max(25, v.hr); let ph = time % beat; if (E.irregular) ph = (time + 0.11 * Math.sin(time * 7.3)) % beat; if (ch === 0) return gs(ph, 0.08, 0.02, 0.12) + gs(ph, 0.22, 0.012, 1.1) + gs(ph, 0.25, 0.012, -0.25) + gs(ph, 0.45, 0.05, 0.25); if (ch === 1) { const q = (ph - 0.22) / beat; const amp = Math.max(0.15, (v.sbp - v.dbp) / 60); return q < 0 ? 0.05 : q < 0.12 ? q / 0.12 * amp : Math.max(0.05, amp * (1 - (q - 0.12) * 1.3)); } const q = ((ph - 0.3 + beat) % beat) / beat; return Math.sin(Math.min(1, q * 2.2) * Math.PI) * 0.8 * (v.spo2 / 100) + 0.1; }
    g.fillStyle = '#04090b'; g.fillRect(0, 0, W, H);
    const COL = ['#4dff8f', '#ff6b6b', '#74c0fc'], LAB = ['ECG II', 'ART', 'SpO₂'];
    function frame(now) { raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; tt = (now - t0) / 1000; const v = cur(); const steps = Math.max(1, Math.round(dt * 110)); const plotW = W - 230;
      for (let s = 0; s < steps; s++) { const time = tt - (steps - s) / 110; const nx = x + 1; if (nx >= plotW) { x = 0; prev.fill(null); continue; } g.fillStyle = '#04090b'; g.fillRect(nx + 1, 0, 12, H); for (let ch = 0; ch < 3; ch++) { const y0 = 20 + ch * 92; const y = y0 + 60 - wave(ch, time, v) * 50; g.strokeStyle = COL[ch]; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, prev[ch] == null ? y : prev[ch]); g.lineTo(nx, y); g.stroke(); prev[ch] = y; } x = nx; }
      g.fillStyle = '#0a1216'; g.fillRect(plotW + 4, 0, W - plotW - 4, H); const alarm = tt > 2 && Math.floor(tt * 2) % 2 === 0;
      [[String(v.hr), 'HR', COL[0], v.hr < 50 || v.hr > 110], [`${v.sbp}/${v.dbp}`, 'ART', COL[1], v.sbp < 90 || v.sbp > 170], [String(v.spo2), 'SpO₂ %', COL[2], v.spo2 < 92]].forEach(([val, lab, c, bad], i) => { g.fillStyle = bad && alarm ? '#ffd166' : c; g.font = '600 15px system-ui'; g.fillText(lab, plotW + 16, 28 + i * 92); g.font = `700 ${val.length > 5 ? 34 : 46}px ui-monospace, Menlo, monospace`; g.fillText(val, plotW + 16, 72 + i * 92); });
      g.fillStyle = '#9ab'; g.font = '13px system-ui'; LAB.forEach((l, i) => g.fillText(l, 6, 16 + i * 92)); g.fillStyle = '#cfe'; g.font = '13px system-ui'; g.fillText(`RR ${v.rr}   T ${v.temp}°`, plotW + 16, H - 10); }
    raf = requestAnimationFrame(frame);
    return { stop: () => cancelAnimationFrame(raf), get vitals() { const v = cur(); return { hr: Math.round(lerp(E.hr[0], E.hr[1], 1)), bp: `${E.sbp[1]}/${E.dbp[1]}`, spo2: E.spo2[1], rr: E.rr[1], etco2: 36, temp: E.temp ? E.temp[1].toFixed(1) : '36.8', note: eventName(event) }; } };
  }

  // ---------------------------------------------------------------- 脈診站: wrist, three finger pads 寸關尺, a 浮/中/沉 pressure gauge and a procedural
  // pulse trace per quality (schematic — labelled 示意, never a real waveform; the quality name is never drawn)
  const PULSE = {
    floating: { bpm: 74, shape: 'normal', levels: [1, 0.62, 0.22] }, deep: { bpm: 70, shape: 'normal', levels: [0.18, 0.5, 1] },
    slow: { bpm: 50, shape: 'normal', levels: [0.6, 1, 0.8] }, rapid: { bpm: 104, shape: 'normal', levels: [0.65, 1, 0.8] },
    wiry: { bpm: 76, shape: 'wiry', levels: [0.85, 1, 0.9], width: 2.6 }, slippery: { bpm: 84, shape: 'slippery', levels: [0.7, 1, 0.85] },
    thready: { bpm: 80, shape: 'thready', levels: [0.45, 0.9, 0.65], width: 1.3 }, surging: { bpm: 86, shape: 'surging', levels: [1, 1, 0.7] },
    choppy: { bpm: 72, shape: 'choppy', levels: [0.6, 1, 0.75], jitter: 0.35 }, tight: { bpm: 92, shape: 'tight', levels: [0.9, 1, 0.9], width: 2.4 },
    weak: { bpm: 66, shape: 'weak', levels: [0.45, 0.6, 0.4] }, knotted: { bpm: 54, shape: 'normal', levels: [0.6, 1, 0.8], irregular: true, drop: 0.22 },
    intermittent: { bpm: 74, shape: 'normal', levels: [0.6, 1, 0.8], dropEvery: 4 }, moderate: { bpm: 72, shape: 'normal', levels: [0.6, 1, 0.8], amp: 0.8 }
  };
  function pulseShape(kind, f) { // f = fraction of the beat period → 0..1
    const gs = (m, w, a) => a * Math.exp(-((f - m) ** 2) / (2 * w * w));
    if (kind === 'wiry') return f < 0.04 ? f / 0.04 : f < 0.42 ? 1 : f < 0.5 ? 1 - (f - 0.42) / 0.08 : 0;
    if (kind === 'tight') return f < 0.03 ? f / 0.03 : f < 0.34 ? 0.92 + 0.08 * Math.sin(f * 90) : f < 0.4 ? 0.92 * (1 - (f - 0.34) / 0.06) : 0;
    if (kind === 'slippery') return f < 0.5 ? Math.pow(Math.sin(f / 0.5 * Math.PI), 2) : 0;
    if (kind === 'thready') return gs(0.1, 0.028, 0.5);
    if (kind === 'surging') return f < 0.08 ? Math.pow(f / 0.08, 0.6) : gs(0.08, 0.07, 1) * 0.98;
    if (kind === 'weak') return gs(0.16, 0.1, 0.42);
    if (kind === 'choppy') return gs(0.1, 0.05, 1) + gs(0.3, 0.05, 0.25) + 0.08 * Math.sin(f * 140) + 0.06 * Math.sin(f * 310);
    return gs(0.1, 0.045, 1) + gs(0.3, 0.05, 0.25); // normal arterial shape
  }
  function pulseStation(cv, quality, opts) {
    const g = cv.getContext('2d'); const W = cv.width, H = cv.height; const P = PULSE[quality] || PULSE.moderate; const LV = { float: 0, mid: 1, deep: 2 }; let level = 'mid';
    let raf = 0, t0 = performance.now(), last = t0, nextBeat = 0.6, beats = [], n = 0, samples = new Array(640).fill(0), si = 0, acc = 0, fadeLevel = P.levels[1], dead = false;
    const period = () => 60 / P.bpm * (P.irregular ? 0.75 + Math.random() * 0.5 : 1);
    const value = t => { let v = 0; beats.forEach(b => { const f = (t - b.t0) / b.period; if (f >= 0 && f < 1) v += pulseShape(P.shape, f) * b.amp; }); return v; };
    function frame(now) { if (dead) return; raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = (now - t0) / 1000;
      while (t >= nextBeat) { n++; const per = period(); const dropped = (P.dropEvery && n % P.dropEvery === 0) || (P.drop && Math.random() < P.drop); if (!dropped) { const amp = (P.amp || 1) * (P.jitter ? 1 - P.jitter * Math.random() : 1); beats.push({ t0: nextBeat, period: per, amp }); if (beats.length > 4) beats.shift(); if (opts && opts.tick) opts.tick(); } nextBeat += per; }
      const want = P.levels[LV[level]]; fadeLevel += (want - fadeLevel) * Math.min(1, dt * 6);
      const amp = Math.max(0, Math.min(1.2, value(t) * fadeLevel));
      acc += dt * 110; while (acc >= 1) { samples[si] = amp; si = (si + 1) % samples.length; acc -= 1; }
      draw(amp, t);
    }
    function draw(amp, t) {
      g.clearRect(0, 0, W, H); const grd = g.createLinearGradient(0, 0, 0, 260); grd.addColorStop(0, '#fbf3e8'); grd.addColorStop(1, '#f1e4d2'); g.fillStyle = grd; g.fillRect(0, 0, W, 262);
      // forearm (elbow left → hand right), pulse pillow under the wrist, radial artery along the thumb side
      g.save(); g.fillStyle = '#c0392b'; rrect(g, 372, 196, 128, 34, 14); g.fill(); g.fillStyle = 'rgba(0,0,0,.08)'; rrect(g, 380, 224, 112, 8, 4); g.fill(); g.restore();
      g.fillStyle = '#f0c9a6'; g.beginPath(); g.moveTo(40, 110); g.bezierCurveTo(180, 100, 300, 112, 440, 118); g.lineTo(440, 196); g.bezierCurveTo(300, 206, 180, 214, 40, 212); g.closePath(); g.fill();
      g.fillStyle = '#ecbf9a'; g.beginPath(); g.moveTo(440, 118); g.bezierCurveTo(470, 112, 500, 108, 528, 112); g.bezierCurveTo(600, 118, 620, 150, 598, 178); g.bezierCurveTo(580, 200, 540, 206, 500, 198); g.lineTo(440, 196); g.closePath(); g.fill(); // palm
      g.beginPath(); g.moveTo(520, 112); g.bezierCurveTo(540, 70, 586, 62, 598, 84); g.bezierCurveTo(606, 100, 586, 118, 556, 124); g.closePath(); g.fill(); // thumb
      g.strokeStyle = 'rgba(192,57,43,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(250, 136); g.bezierCurveTo(330, 132, 400, 130, 480, 128); g.stroke();
      g.fillStyle = 'rgba(0,0,0,.08)'; g.font = '600 13px system-ui'; g.fillText(T('shiftRadialArtery', '橈動脈', 'radial artery'), 252, 160);
      // three finger pads 寸 關 尺 (寸 nearest the wrist crease)
      [[470, '寸', 'cun'], [430, '關', 'guan'], [390, '尺', 'chi']].forEach(([x, z, e], i) => { const s = 1 + 0.16 * amp; g.save(); g.translate(x, 132); g.scale(s, s); g.fillStyle = `rgba(255,209,102,${0.25 + 0.6 * amp})`; g.beginPath(); g.arc(0, 0, 24, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.strokeStyle = '#8a6d3b'; g.lineWidth = 2.2; g.beginPath(); g.arc(0, 0, 17, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore(); g.fillStyle = '#1d2a2a'; g.font = '800 20px system-ui'; g.textAlign = 'center'; g.fillText(z, x, 96); g.font = '600 11px system-ui'; g.fillStyle = '#5b6670'; g.fillText(e, x, 78); g.textAlign = 'left'; });
      // depth gauge: 浮取 / 中取 / 沉取 → skin / flesh / bone layers with the finger pressed to that depth
      const gx = 650, gy = 44, gw = 210, bh = 60; const bands = [['#f6d9c2', T('shiftLayerSkin', '皮', 'skin')], ['#e5a88f', T('shiftLayerFlesh', '肉', 'flesh')], ['#ece6da', T('shiftLayerBone', '骨', 'bone')]];
      bands.forEach(([c, l], i) => { g.fillStyle = c; g.fillRect(gx, gy + 20 + i * bh, gw, bh); g.fillStyle = '#1d2a2a'; g.font = '600 13px system-ui'; g.fillText(l, gx + gw + 8, gy + 20 + i * bh + 36); });
      g.strokeStyle = '#8a6d3b'; g.lineWidth = 2; g.strokeRect(gx, gy + 20, gw, bh * 3);
      const depth = LV[level]; const fy = gy + 20 + depth * bh + 22; g.fillStyle = '#f0c9a6'; rrect(g, gx + gw / 2 - 26, 6, 52, fy - 6, 22); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5; rrect(g, gx + gw / 2 - 26, 6, 52, fy - 6, 22); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(gx + gw / 2, 18, 16, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b5432f'; g.font = '800 15px system-ui'; g.textAlign = 'center'; g.fillText([T('shiftPressFloatLong', '浮取 · 輕按', 'light touch'), T('shiftPressMidLong', '中取 · 稍按', 'medium'), T('shiftPressDeepLong', '沉取 · 重按', 'firm')][depth], gx + gw / 2, gy + 20 + bh * 3 + 24); g.textAlign = 'left';
      // the trace strip
      g.fillStyle = '#0b1216'; rrect(g, 20, 270, W - 40, 134, 12); g.fill(); g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; for (let x = 40; x < W - 20; x += 40) { g.beginPath(); g.moveTo(x, 278); g.lineTo(x, 396); g.stroke(); } for (let y = 290; y < 400; y += 26) { g.beginPath(); g.moveTo(28, y); g.lineTo(W - 28, y); g.stroke(); }
      g.strokeStyle = '#ffb347'; g.lineWidth = P.width || 2; g.lineJoin = 'round'; g.beginPath(); const x0 = 40, px = (W - 80) / samples.length; for (let k = 0; k < samples.length; k++) { const v = samples[(si + k) % samples.length]; const x = x0 + k * px, y = 388 - v * 100; if (k === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '600 12px system-ui'; g.fillText(T('shiftPulseAxis', '指下脈動 · 時間 →', 'under the fingers · time →'), 40, 288);
    }
    function rrect(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); } }
    raf = requestAnimationFrame(frame); draw(0, 0);
    return { setLevel(k) { if (LV[k] != null) level = k; }, get level() { return level; }, stop() { dead = true; cancelAnimationFrame(raf); } };
  }
  // ---------------------------------------------------------------- 舌診站: a procedural tongue under a daylight lamp (labelled 示意圖)
  const TONGUE_BODY = { pale: '#efb9bf', red: '#d9534f', crimson: '#a9182a', purple: '#7d4b86', 'pale-purple': '#b58ab4', normal: '#e3858e' };
  function tongueStation(cv, tg) {
    const g = cv.getContext('2d'); const W = cv.width, H = cv.height; let raf = 0, dead = false; const body = TONGUE_BODY[tg.body] || TONGUE_BODY.normal; const coat = tg.coat || 'thin-white', shape = tg.shape || 'normal';
    const seed = Math.random() * 1000; const rnd = (i) => { const x = Math.sin(seed + i * 12.9898) * 43758.5453; return x - Math.floor(x); };
    function tonguePath(c, cx, cy, w, h, scallop) { c.beginPath(); const steps = 48; for (let i = 0; i <= steps; i++) { const a = -Math.PI / 2 + (i / steps) * Math.PI * 2; let rx = w / 2, ry = h / 2; // egg: narrower at the tip (bottom)
        const sy = Math.sin(a); const taper = sy > 0 ? 1 - 0.28 * sy : 1; let x = cx + Math.cos(a) * rx * taper, y = cy + sy * ry; if (scallop && Math.abs(Math.cos(a)) > 0.55) { const k = 1 - 0.035 * Math.abs(Math.sin(i * 2.4)); x = cx + (x - cx) * k; } if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); } c.closePath(); }
    function draw(t) {
      g.clearRect(0, 0, W, H); const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#f4f8fb'); sky.addColorStop(1, '#e3ebf0'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // daylight lamp
      g.fillStyle = '#d9dee3'; g.fillRect(380, 0, 140, 14); g.fillStyle = '#fffdf4'; g.fillRect(392, 14, 116, 8); const beam = g.createRadialGradient(450, 20, 10, 450, 20, 420); beam.addColorStop(0, 'rgba(255,255,240,.55)'); beam.addColorStop(1, 'rgba(255,255,240,0)'); g.fillStyle = beam; g.fillRect(0, 0, W, H);
      g.fillStyle = '#5b6670'; g.font = '600 12px system-ui'; g.textAlign = 'center'; g.fillText(T('shiftDaylight', '日光燈 · 自然光下觀察', 'daylight lamp'), 450, 36); g.textAlign = 'left';
      // skin and lips (open mouth), the tongue protrudes downward: root at the top, tip at the bottom
      g.fillStyle = '#f1cdb1'; g.fillRect(150, 50, 600, 360); g.fillStyle = '#d98a7e'; g.beginPath(); g.moveTo(250, 150); g.bezierCurveTo(340, 96, 560, 96, 650, 150); g.bezierCurveTo(560, 128, 340, 128, 250, 150); g.closePath(); g.fill(); // upper lip
      g.fillStyle = '#3a1a1e'; g.beginPath(); g.moveTo(250, 150); g.bezierCurveTo(330, 230, 570, 230, 650, 150); g.bezierCurveTo(560, 128, 340, 128, 250, 150); g.closePath(); g.fill(); // mouth
      g.fillStyle = '#fff6ee'; for (let i = 0; i < 8; i++) { rr(g, 300 + i * 38, 140, 30, 22, 5); g.fill(); } // upper teeth
      const jit = shape === 'trembling' ? Math.sin(t * 46) * 2.2 + Math.sin(t * 29) * 1.2 : 0; const dev = shape === 'deviated' ? 0.2 : 0;
      let w = 236, h = 262; if (shape === 'swollen') { w = 296; h = 278; } if (shape === 'thin') { w = 176; h = 256; }
      const cx = 450 + jit + (shape === 'deviated' ? 34 : 0), cy = 270; g.save(); g.translate(cx, cy); g.rotate(dev); g.translate(-cx, -cy);
      g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 18; g.shadowOffsetY = 8; g.fillStyle = body; tonguePath(g, cx, cy, w, h, shape === 'swollen' || shape === 'teeth-marked'); g.fill(); g.shadowColor = 'transparent';
      const sh = g.createRadialGradient(cx - 30, cy - 50, 20, cx, cy, h * 0.75); sh.addColorStop(0, 'rgba(255,255,255,.22)'); sh.addColorStop(1, 'rgba(60,0,10,.22)'); g.fillStyle = sh; tonguePath(g, cx, cy, w, h, shape === 'swollen' || shape === 'teeth-marked'); g.fill();
      g.save(); tonguePath(g, cx, cy, w, h, shape === 'swollen' || shape === 'teeth-marked'); g.clip();
      // midline sulcus and papillae
      g.strokeStyle = 'rgba(80,0,10,.22)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy - h / 2 + 30); g.lineTo(cx, cy + h / 2 - 50); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 90; i++) { const x = cx - w / 2 + rnd(i) * w, y = cy - h / 2 + rnd(i + 100) * h; g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); }
      if (shape === 'cracked') { g.strokeStyle = 'rgba(70,0,12,.55)'; g.lineWidth = 2; [[0, -70, 0, 60], [-10, -20, -48, 20], [12, -5, 52, 30], [-6, 30, -30, 70], [8, 40, 36, 76]].forEach(([x1, y1, x2, y2]) => { g.beginPath(); g.moveTo(cx + x1, cy + y1); g.lineTo(cx + x2, cy + y2); g.stroke(); }); }
      // coat over the posterior two thirds (root at the top)
      const thick = /thick|greasy/.test(coat); const yellow = /yellow/.test(coat); const greasy = /greasy/.test(coat); const dry = coat === 'dry';
      if (coat !== 'none') { const alpha = thick ? 0.82 : 0.4; g.fillStyle = yellow ? `rgba(226,196,96,${alpha})` : `rgba(250,250,245,${alpha})`; g.beginPath(); g.ellipse(cx, cy - h * 0.12, w * 0.36, h * 0.36, 0, 0, Math.PI * 2); g.fill();
        if (thick) { g.fillStyle = yellow ? 'rgba(200,160,60,.5)' : 'rgba(255,255,255,.5)'; for (let i = 0; i < 160; i++) { const a = rnd(i + 300) * Math.PI * 2, r = Math.sqrt(rnd(i + 500)); g.beginPath(); g.arc(cx + Math.cos(a) * r * w * 0.34, cy - h * 0.12 + Math.sin(a) * r * h * 0.34, 1.4 + rnd(i + 700) * 1.6, 0, Math.PI * 2); g.fill(); } }
        if (coat === 'peeled') { g.globalCompositeOperation = 'destination-out'; [[-40, -30, 36], [30, 10, 28], [-10, 50, 22]].forEach(([dx, dy, r]) => { g.beginPath(); g.ellipse(cx + dx, cy + dy, r, r * 0.7, 0.4, 0, Math.PI * 2); g.fill(); }); g.globalCompositeOperation = 'source-over'; g.fillStyle = body; [[-40, -30, 36], [30, 10, 28], [-10, 50, 22]].forEach(([dx, dy, r]) => { g.beginPath(); g.ellipse(cx + dx, cy + dy, r, r * 0.7, 0.4, 0, Math.PI * 2); g.fill(); }); }
        if (dry) { g.strokeStyle = 'rgba(120,90,40,.45)'; g.lineWidth = 1; for (let i = 0; i < 26; i++) { const x = cx - w * 0.3 + rnd(i + 900) * w * 0.6, y = cy - h * 0.42 + rnd(i + 950) * h * 0.56; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd(i + 990) - 0.5) * 22, y + (rnd(i + 1010) - 0.5) * 22); g.stroke(); } } }
      if (greasy || coat === 'none') { g.fillStyle = `rgba(255,255,255,${greasy ? 0.5 : 0.35})`; g.beginPath(); g.ellipse(cx - w * 0.16, cy - h * 0.2, w * 0.1, h * 0.06, -0.5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(cx + w * 0.12, cy - h * 0.02, w * 0.07, h * 0.04, 0.3, 0, Math.PI * 2); g.fill(); }
      g.restore();
      if (shape === 'teeth-marked' || shape === 'swollen') { g.strokeStyle = 'rgba(120,20,30,.35)'; g.lineWidth = 2; tonguePath(g, cx, cy, w, h, true); g.stroke(); }
      g.restore();
      g.fillStyle = '#d98a7e'; g.beginPath(); g.moveTo(250, 150); g.bezierCurveTo(300, 182, 340, 196, 380, 204); g.bezierCurveTo(360, 214, 320, 206, 250, 150); g.fill(); g.beginPath(); g.moveTo(650, 150); g.bezierCurveTo(600, 182, 560, 196, 520, 204); g.bezierCurveTo(540, 214, 580, 206, 650, 150); g.fill(); // lower lip corners
    }
    function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
    const anim = shape === 'trembling' && !reduced(); const t0 = performance.now();
    function frame(now) { if (dead) return; draw((now - t0) / 1000); if (anim) raf = requestAnimationFrame(frame); }
    frame(t0);
    return { stop() { dead = true; cancelAnimationFrame(raf); } };
  }

  // ---------------------------------------------------------------- ending card (1080×1920 canvas)
  function loadImage(src) { return new Promise(res => { if (!src) { res(null); return; } const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }
  async function drawEndingCard(g) {
    const W = 1080, H = 1920; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    const accent = g.meta.accent || '#2f7f6f'; const photoSrc = HT.icons && HT.icons.photoFile ? HT.icons.photoFile(g.dept) : '';
    let img = await loadImage(photoSrc);
    const rr = (px, py, w, h, r) => { x.beginPath(); if (x.roundRect) x.roundRect(px, py, w, h, r); else { x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); } };
    const font = (w, s) => `${w} ${s}px system-ui, "Noto Sans TC", "PingFang TC", sans-serif`;
    const fit = (txt, maxW, w, s) => { let size = s; x.font = font(w, size); while (x.measureText(txt).width > maxW && size > 18) { size -= 2; x.font = font(w, size); } return size; };
    function paint(withPhoto) {
      const grd = x.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#13232a'); grd.addColorStop(0.55, '#0c161b'); grd.addColorStop(1, '#070d10'); x.fillStyle = grd; x.fillRect(0, 0, W, H);
      x.strokeStyle = 'rgba(255,255,255,.04)'; x.lineWidth = 1; for (let i = 0; i < W; i += 60) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); } for (let i = 0; i < H; i += 60) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
      const glow = x.createRadialGradient(540, 330, 40, 540, 330, 520); glow.addColorStop(0, hexA(accent, 0.45)); glow.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = glow; x.fillRect(0, 0, W, 900);
      x.fillStyle = accent; x.fillRect(0, 0, W, 14);
      // icon
      const S = 220, ix = (W - S) / 2, iy = 120; x.save(); rr(ix, iy, S, S, 52); x.clip(); x.fillStyle = '#1d2a30'; x.fillRect(ix, iy, S, S); if (withPhoto && img) { const sc = Math.max(S / img.naturalWidth, S / img.naturalHeight); const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc; x.drawImage(img, ix + (S - dw) / 2, iy + (S - dh) / 2, dw, dh); } else { x.fillStyle = accent; x.font = font(800, 110); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(deptName(g.meta).slice(0, 1), ix + S / 2, iy + S / 2 + 6); } x.restore(); rr(ix, iy, S, S, 52); x.lineWidth = 8; x.strokeStyle = accent; x.stroke();
      x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = 'rgba(255,255,255,.7)'; x.font = font(700, 26); x.fillText((deptName(g.meta) + ' · ' + T('shiftDayOf', '值班日', 'Shift day')).toUpperCase(), 540, 400);
      const cl = g.caseLine ? g.caseLine() : '';
      x.fillStyle = '#fff'; const ts = fit(bl(g.data.title), 940, 800, cl ? 62 : 68); x.font = font(800, ts); x.fillText(bl(g.data.title), 540, cl ? 470 : 480);
      if (cl) { x.fillStyle = '#ffd166'; const cs = fit(cl, 900, 700, 30); x.font = font(700, cs); x.fillText(cl, 540, 516); }
      x.fillStyle = 'rgba(255,255,255,.75)'; x.font = font(500, cl ? 28 : 32); x.fillText(bl(g.data.ending && g.data.ending.title) || T('shiftEnd', '下班了', 'End of shift'), 540, cl ? 556 : 532);
      // player
      rr(90, 586, 900, 90, 24); x.fillStyle = 'rgba(255,255,255,.08)'; x.fill(); x.fillStyle = '#fff'; x.font = font(700, 34); x.textAlign = 'left'; const who = (g.name ? g.name + ' · ' : '') + g.roleName(); x.fillText(who, 130, 643); x.textAlign = 'right'; x.fillStyle = 'rgba(255,255,255,.65)'; x.font = font(500, 26); x.fillText(T('shiftPlayedAs', '扮演', 'Played as'), 950, 643);
      // timeline
      x.textAlign = 'left'; x.fillStyle = 'rgba(255,255,255,.55)'; x.font = font(700, 24); x.fillText(T('shiftTimeline', '今日時間軸', "Today's timeline").toUpperCase(), 100, 740);
      const segs = g.order.map(id => g.segById(id)).filter(Boolean); const rowH = Math.min(78, Math.floor(560 / Math.max(1, segs.length))); x.strokeStyle = hexA(accent, 0.6); x.lineWidth = 4; x.beginPath(); x.moveTo(170, 775); x.lineTo(170, 775 + rowH * (segs.length - 1)); x.stroke();
      segs.forEach((s, i) => { const y = 775 + i * rowH; x.fillStyle = accent; x.beginPath(); x.arc(170, y, 11, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.font = `700 28px ui-monospace, Menlo, monospace`; x.fillText(hhmm(s.t), 205, y + 10); x.font = font(700, 30); x.fillText(bl(s.name), 330, y + 10); if (s.note) { x.fillStyle = 'rgba(255,255,255,.6)'; x.font = font(500, 22); let nt = bl(s.note); while (nt.length > 4 && x.measureText(nt).width > 640) nt = nt.slice(0, -2) + '…'; x.fillText(nt, 330, y + 40); } });
      // stats
      const stats = g.statsList(); const top = 1390; x.fillStyle = 'rgba(255,255,255,.55)'; x.font = font(700, 24); x.fillText(T('shiftRecap', '今日回顧', "Today's recap").toUpperCase(), 100, top - 30);
      stats.forEach(([k, v], i) => { const col = i % 3, row = Math.floor(i / 3); const px = 90 + col * 306, py = top + row * 150; rr(px, py, 288, 130, 22); x.fillStyle = 'rgba(255,255,255,.07)'; x.fill(); x.fillStyle = '#fff'; x.textAlign = 'center'; const vs = fit(v, 250, 800, 56); x.font = font(800, vs); x.fillText(v, px + 144, py + 70); x.fillStyle = 'rgba(255,255,255,.65)'; x.font = font(500, 22); x.fillText(k, px + 144, py + 108); x.textAlign = 'left'; });
      // xp
      const xp = HT.xp ? HT.xp.state() : null; if (xp) { x.fillStyle = '#ffd166'; x.font = font(700, 28); x.textAlign = 'center'; x.fillText(`Lv.${xp.level} ${xp.title} · ${xp.xp} XP`, 540, 1735); }
      x.fillStyle = 'rgba(255,255,255,.5)'; x.font = font(500, 22); x.textAlign = 'center'; x.fillText(T('shiftSimulation', '教學模擬 · 非真實病人', 'Teaching simulation · not a real patient'), 540, 1790);
      x.fillStyle = 'rgba(255,255,255,.8)'; x.font = font(700, 24); x.fillText('華佗醫藥生醫學院 · HUA TUO MEDICAL ACADEMY', 540, 1835); x.fillStyle = accent; x.font = font(600, 22); x.fillText(SITE_URL.replace(/^https:\/\//, ''), 540, 1872);
    }
    paint(true);
    try { cv.toDataURL('image/png'); } catch (e) { img = null; paint(false); }
    return cv;
  }
  function hexA(hex, a) { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); if (!m) return `rgba(47,127,111,${a})`; return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`; }

  // ---------------------------------------------------------------- UI (HUD, overlays)
  class UI {
    constructor(g) { this.g = g; this.root = g.root; this.typing = null; this.pop = null; }
    async build() {
      const g = this.g; const root = this.root; root.className = 'sh sh-game'; root.style.setProperty('--sh-accent', g.meta.accent || '#2f7f6f'); root.setAttribute('role', 'application'); root.setAttribute('aria-label', bl(g.data.title));
      root.innerHTML = `<div class="sh-stage" data-sh-stage></div><div class="sh-hud">
        <div class="sh-top"><div class="sh-clock" data-sh-clock><b class="sh-mono" data-sh-time>--:--</b><small data-sh-seg></small></div>
          <div class="sh-next off" data-sh-next role="status" aria-live="polite"><span class="sh-next-text"><i>${esc(T('shiftNext', '下一步', 'Next'))} ·</i><span data-sh-next-text></span></span><button type="button" class="sh-go" data-sh-go>${esc(T('shiftTakeMe', '帶我去', 'Take me there'))}<kbd>G</kbd></button></div>
          <div class="sh-chips"><button type="button" class="sh-chip" data-sh-fs title="${esc(T('shiftFullscreen', '全螢幕', 'Full screen'))}" aria-label="${esc(T('shiftFullscreen', '全螢幕', 'Full screen'))}">⤢</button><button type="button" class="sh-chip" data-sh-codex title="${esc(T('shiftCodex', '圖鑑', 'Codex'))}" aria-label="${esc(T('shiftCodex', '圖鑑', 'Codex'))}">📖</button><button type="button" class="sh-chip" data-sh-save title="${esc(T('shiftSave', '保存', 'Save'))}" aria-label="${esc(T('shiftSave', '保存', 'Save'))}">💾</button><button type="button" class="sh-chip" data-sh-sound title="${esc(T('shiftSound', '音效', 'Sound'))}" aria-label="${esc(T('shiftSound', '音效', 'Sound'))}" aria-pressed="${!Snd.muted}">${Snd.muted ? '🔇' : '🔊'}</button><button type="button" class="sh-chip" data-sh-view title="${esc(T('shiftViewFp', '第一人稱', 'First person'))}" aria-label="${esc(T('shiftViewFp', '第一人稱', 'First person'))}">⚙</button><button type="button" class="sh-chip" data-sh-wide title="${esc(T('shiftWide', '廣角鏡頭', 'Wide-angle camera'))}" aria-label="${esc(T('shiftWide', '廣角鏡頭', 'Wide-angle camera'))}" aria-pressed="false">🌐</button><button type="button" class="sh-chip" data-sh-2d title="${esc(T('shiftView2d', '2D 平面圖', '2D floor plan'))}" aria-label="${esc(T('shiftView2d', '2D 平面圖', '2D floor plan'))}">🗺</button><button type="button" class="sh-chip" data-sh-leave title="${esc(T('shiftLeave', '離開', 'Leave'))}" aria-label="${esc(T('shiftLeave', '離開', 'Leave'))}">✕</button></div></div>
        <div class="sh-dpad sh-hidden" data-sh-dpad aria-label="D-pad"><button type="button" data-d="u" aria-label="↑">▲</button><button type="button" data-d="l" aria-label="←">◀</button><button type="button" data-d="r" aria-label="→">▶</button><button type="button" data-d="d" aria-label="↓">▼</button></div>
        <div class="sh-bottom"><button type="button" class="sh-talkbtn" data-sh-talk><span>E</span><small>${esc(T('shiftTalk', '對話', 'Talk'))}</small></button></div>
        <div class="sh-hint">${esc(T('shiftKeys', 'G 帶我去 · E 對話 · Enter 繼續 · M 靜音 · Esc 關閉', 'G take me there · E talk · Enter continue · M mute · Esc close'))}</div>
        <div class="sh-toast" data-sh-toast role="status"></div></div>`;
      this.stage = root.querySelector('[data-sh-stage]'); this.hud = root.querySelector('.sh-hud');
      const q = s => root.querySelector(s);
      q('[data-sh-go]').onclick = () => g.go(); q('[data-sh-talk]').onclick = () => g.talk();
      q('[data-sh-fs]').onclick = () => this.toggleFullscreen(); q('[data-sh-codex]').onclick = () => this.openCodex(); q('[data-sh-save]').onclick = () => { g.save(); this.toast('💾 ' + T('shiftProgressSaved', '進度已保存', 'Progress saved')); };
      q('[data-sh-sound]').onclick = () => this.toggleSound(); q('[data-sh-view]').onclick = () => this.toggleView(); q('[data-sh-wide]').onclick = () => this.toggleWide(); q('[data-sh-2d]').onclick = () => g.toggle2d(); q('[data-sh-leave]').onclick = () => this.confirmLeave();
      root.querySelectorAll('[data-sh-dpad] button').forEach(b => { const d = b.dataset.d; const on = e => { e.preventDefault(); if (g.plan) g.plan.dpad(d, true); }; const off = () => { if (g.plan) g.plan.dpad(d, false); }; b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); });
      this.enterFullscreen();
      this.popState = () => { if (g.dead) return; if (this.leaving) return; this.confirmLeave(true); };
      try { history.pushState({ htShift: 1 }, ''); window.addEventListener('popstate', this.popState); } catch (e) { /* ignore */ }
      this.fsChange = () => { if (g.dead) return; const fs = document.fullscreenElement === root; q('[data-sh-fs]').textContent = fs ? '⤡' : '⤢'; q('[data-sh-fs]').title = fs ? T('shiftExitFs', '離開全螢幕', 'Exit full screen') : T('shiftFullscreen', '全螢幕', 'Full screen'); if (!fs) { root.classList.add('sh-fixed'); document.body.classList.add('sh-lock'); } setTimeout(() => g.scene && g.scene.resize(), 60); };
      document.addEventListener('fullscreenchange', this.fsChange);
      this.setClock(g.clock);
    }
    enterFullscreen() { const root = this.root; const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); const can = !ios && typeof root.requestFullscreen === 'function' && document.fullscreenEnabled !== false; root.classList.add('sh-fixed'); document.body.classList.add('sh-lock'); this.fallbackFs = !can; if (can) { const p = root.requestFullscreen({ navigationUI: 'hide' }); if (p && p.catch) p.catch(() => { this.fallbackFs = true; }); } }
    toggleFullscreen() { const root = this.root; if (document.fullscreenElement === root) { document.exitFullscreen().catch(() => {}); return; } if (typeof root.requestFullscreen === 'function') { const p = root.requestFullscreen({ navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } }
    exitFullscreen() { if (document.fullscreenElement === this.root && document.exitFullscreen) document.exitFullscreen().catch(() => {}); this.root.classList.remove('sh-fixed'); document.body.classList.remove('sh-lock'); }
    setSceneMode(m) { this.root.querySelector('[data-sh-dpad]').classList.toggle('sh-hidden', m !== '2d'); this.root.querySelector('[data-sh-2d]').classList.toggle('on', m === '2d'); this.root.querySelector('[data-sh-2d]').textContent = m === '2d' ? '🧊' : '🗺'; this.root.querySelector('[data-sh-view]').classList.toggle('sh-hidden', m === '2d'); this.root.querySelector('[data-sh-wide]').classList.toggle('sh-hidden', m === '2d'); if (m === '2d') this.closeWide(); this.root.dataset.scene = m; }
    // ---- wide-angle camera cluster (theatre3d-wide.js by W): FOV 55–120, look around, six-view strip, 360° panorama, gyro
    async toggleWide() { if (this.wideCtl) { this.closeWide(); return; } const g = this.g; if (!g.h || !g.scene || g.scene.kind !== '3d') return; const chip = this.root.querySelector('[data-sh-wide]'); chip.disabled = true;
      try { if (!HT.theatre3dWide) { if (HT.loadCss) HT.loadCss('wide.css'); await HT.loadScript('theatre3d-wide.js'); } else if (HT.loadCss) HT.loadCss('wide.css'); } catch (e) { /* no wide module in this build */ }
      chip.disabled = false; if (g.dead || !g.h || !HT.theatre3dWide || typeof HT.theatre3dWide.attach !== 'function') { this.toast(T('shiftWideMissing', '此版本沒有廣角模組', 'Wide-angle module not available')); return; }
      const host = document.createElement('div'); host.className = 'sh-wide'; this.hud.appendChild(host); this.wideHost = host;
      const onPano = cv => { if (cv && cv.width) g.addPanorama(cv); };
      host.addEventListener('ht:panorama', e => onPano(e.detail && (e.detail.canvas || e.detail)));
      try { this.wideCtl = HT.theatre3dWide.attach(g.h, host, { onPanorama: onPano, onCapture: onPano, room: g.data.room, department: g.dept, title: bl(g.data.title) }) || { destroy() {} }; } catch (e) { console.warn('shift: wide attach failed', e); host.remove(); this.wideHost = null; return; }
      if (typeof HT.theatre3dWide.capturePanorama === 'function') { const b = document.createElement('button'); b.type = 'button'; b.className = 'sh-pano'; b.textContent = '🖼 ' + T('shiftPanorama', '環景照存圖鑑', 'Panorama → codex'); b.onclick = async () => { if (b.disabled) return; b.disabled = true; try { const cv = await HT.theatre3dWide.capturePanorama(g.h, { size: 1024 }); onPano(cv); } catch (e) { this.toast(T('shiftLoadError', '無法產生圖片', 'Could not render the image')); } b.disabled = false; }; host.appendChild(b); }
      chip.classList.add('on'); chip.setAttribute('aria-pressed', 'true'); if (this.g.panelOpen || this.dialogOpen()) this.pauseWide(true); }
    closeWide() { if (this.wideCtl) { try { this.wideCtl.destroy(); } catch (e) { /* ignore */ } this.wideCtl = null; } if (this.wideHost) { this.wideHost.remove(); this.wideHost = null; } const chip = this.root && this.root.querySelector('[data-sh-wide]'); if (chip) { chip.classList.remove('on'); chip.setAttribute('aria-pressed', 'false'); } }
    pauseWide(on) { const c = this.wideCtl; if (!c) return; try { if (on && typeof c.pause === 'function') c.pause(); else if (!on && typeof c.resume === 'function') c.resume(); } catch (e) { /* ignore */ } if (this.wideHost) this.wideHost.classList.toggle('sh-paused', !!on); }
    toggleView() { const g = this.g; if (!g.scene || g.scene.kind !== '3d') return; this.fp = !this.fp; if (g.api3 && g.api3.st) g.api3.st.view = this.fp ? 'fp' : 'follow'; g.scene.setView(this.fp ? 'fp' : 'follow'); this.root.querySelector('[data-sh-view]').classList.toggle('on', this.fp); this.toast(this.fp ? T('shiftViewFp', '第一人稱', 'First person') : T('shiftViewFollow', '跟隨視角', 'Follow camera')); }
    toggleSound() { Snd.muted = !Snd.muted; const b = this.root.querySelector('[data-sh-sound]'); b.textContent = Snd.muted ? '🔇' : '🔊'; b.setAttribute('aria-pressed', String(!Snd.muted)); if (!Snd.muted) Snd.play('blip'); }
    setClock(m) { const el = this.root.querySelector('[data-sh-time]'); if (el) el.textContent = hhmm(m); }
    setSeg(seg) { const el = this.root.querySelector('[data-sh-seg]'); if (el) el.textContent = bl(seg.name); }
    setNext(text, showGo, hint) { const n = this.root.querySelector('[data-sh-next]'); n.classList.toggle('off', !text); this.root.querySelector('[data-sh-next-text]').textContent = text || ''; this.root.querySelector('[data-sh-go]').classList.toggle('sh-hidden', !showGo); this.root.querySelector('[data-sh-talk]').classList.toggle('off', !text && this.root.dataset.scene !== '3d'); if (hint) this.toast(hint); }
    setNextBusy(b) { const go = this.root.querySelector('[data-sh-go]'); go.disabled = !!b; go.textContent = b ? '…' : ''; if (!b) go.innerHTML = `${esc(T('shiftTakeMe', '帶我去', 'Take me there'))}<kbd>G</kbd>`; }
    toast(msg) { const el = this.root.querySelector('[data-sh-toast]'); el.textContent = msg; el.classList.add('show'); clearTimeout(this.toastT); this.toastT = setTimeout(() => el.classList.remove('show'), 2600); }
    flashSaved() { const b = this.root.querySelector('[data-sh-save]'); if (!b) return; b.classList.add('on'); clearTimeout(this.savedT); this.savedT = setTimeout(() => b.classList.remove('on'), 700); }
    codexBadge() { const b = this.root.querySelector('[data-sh-codex]'); if (!b) return; let s = b.querySelector('.sh-badge'); const n = this.g.newCodex.size; if (!n) { if (s) s.remove(); return; } if (!s) { s = document.createElement('span'); s.className = 'sh-badge'; b.appendChild(s); } s.textContent = String(n); }
    dialogOpen() { return !!this.dialogEl; }

    // ---- title card
    titleCard(seg, from, to, extra) {
      const g = this.g; return g.wait(done => {
        this.dismissTitle(); Snd.play('card');
        const el = document.createElement('div'); el.className = 'sh-titlecard'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', bl(seg.name));
        el.innerHTML = `<div class="sh-tc">${extra ? `<div class="sh-tc-mood">${esc(extra)}</div>` : ''}<div class="sh-tc-clock sh-mono" data-tc-clock>${hhmm(from)}</div><div class="sh-tc-mood">${esc(segLabel(bandOf(seg.t)))} · ${esc(({ day: T('shiftMoodDay', '日間', 'DAY'), eve: T('shiftMoodEve', '傍晚', 'EVENING'), night: T('shiftMoodNight', '夜間', 'NIGHT') })[seg.mood] || '')}</div><h2>${esc(bl(seg.name))}</h2><p>${esc(bl(seg.sub))}</p><div class="sh-tc-bar"><i></i></div><button type="button" class="sh-ghost" data-tc-go>${esc(T('shiftContinue', '繼續', 'Continue'))} ↵</button></div>`;
        this.root.appendChild(el); this.titleEl = el; this.titleDone = done; this.root.classList.add('sh-card-up');
        const clockEl = el.querySelector('[data-tc-clock]'); const dur = reduced() || FAST() ? 0 : 1100; const t0 = performance.now(); const span = Math.max(0, to - from);
        const anim = now => { if (this.titleEl !== el) return; const k = dur ? Math.min(1, (now - t0) / dur) : 1; const e = 1 - Math.pow(1 - k, 3); clockEl.textContent = hhmm(from + Math.round(span * e)); if (k < 1) requestAnimationFrame(anim); else clockEl.textContent = hhmm(to); };
        requestAnimationFrame(anim);
        el.querySelector('[data-tc-go]').onclick = () => this.dismissTitle(); el.querySelector('[data-tc-go]').focus({ preventScroll: true });
        this.titleT = setTimeout(() => this.dismissTitle(), FAST() ? 250 : 3600);
      });
    }
    dismissTitle() { if (!this.titleEl) return; clearTimeout(this.titleT); const el = this.titleEl, done = this.titleDone; this.titleEl = null; this.titleDone = null; el.remove(); this.root.classList.remove('sh-card-up'); this.setClock(this.g.clock); if (done) done(); }

    // ---- dialogue
    line(who, text, o) {
      const g = this.g; return g.wait(done => {
        const c = g.cast[who]; const isMe = who === 'me', isSys = who === 'sys';
        if (!this.dialogEl) { const el = document.createElement('div'); el.className = 'sh-dialog'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-live', 'polite'); el.innerHTML = `<div class="sh-speaker"></div><div class="sh-text" data-sh-text></div><div class="sh-adv"><span data-sh-advhint></span><i>▼</i></div>`; this.root.appendChild(el); this.dialogEl = el; this.root.classList.add('sh-talking'); this.pauseWide(true); el.addEventListener('click', e => { if (e.target.closest('.sh-term') || e.target.closest('button')) return; this.advance(); }); }
        const el = this.dialogEl; el.classList.toggle('sh-me', isMe); el.classList.toggle('sh-sys', isSys); el.classList.toggle('sh-call', !!o.call);
        const name = isMe ? (g.name || T('shiftYou', '你', 'You')) : isSys ? T('shiftNarration', '旁白', 'Narration') : c ? bl(c.name) : who;
        const tag = isMe ? 'ME' : isSys ? '…' : (c && c.tag) || who.slice(0, 3).toUpperCase(); const color = isMe ? (g.meta.accent || '#2f7f6f') : isSys ? '#607d8b' : (c && c.color) || '#607d8b';
        el.querySelector('.sh-speaker').innerHTML = isSys ? `<small>${esc(name)}</small>` : `<span class="sh-tag" style="--tag:${esc(color)}">${esc(tag)}</span><b>${esc(name)}</b>${c ? `<small>· ${esc(bl(c.role))}</small>` : ''}${o.call ? '<span class="sh-callico">📞 ' + esc(T('shiftCall', '來電', 'Call')) + '</span>' : ''}`;
        el.querySelector('[data-sh-advhint]').textContent = o.last ? T('shiftContinue', '繼續', 'Continue') : T('shiftNext', '下一步', 'Next');
        const txtEl = el.querySelector('[data-sh-text]'); const rich = this.glossary(text); const chars = Array.from(text); const perChar = FAST() || reduced() ? 0 : (zh() ? 26 : 13);
        if (this.typing) { clearInterval(this.typing.timer); this.typing = null; }
        let i = 0; const finishTyping = () => { if (this.typing && this.typing.timer) clearInterval(this.typing.timer); this.typing = null; txtEl.innerHTML = rich; txtEl.querySelectorAll('.sh-term').forEach(b => b.onclick = ev => { ev.stopPropagation(); this.showPop(b, Number(b.dataset.term)); }); el.querySelector('.sh-adv').style.visibility = 'visible'; };
        el.querySelector('.sh-adv').style.visibility = 'hidden';
        if (!perChar) { txtEl.textContent = ''; finishTyping(); } else { txtEl.textContent = ''; const timer = setInterval(() => { i += 1; txtEl.textContent = chars.slice(0, i).join(''); if (i % 3 === 0) Snd.play('blip'); if (i >= chars.length) finishTyping(); }, perChar); this.typing = { timer, finish: finishTyping }; }
        if (!isMe && !isSys && g.scene) { g.scene.bubble(who, text.length > (zh() ? 30 : 70) ? text.slice(0, zh() ? 30 : 70) + '…' : text, 4000); g.scene.emote(who, 'nod'); }
        this.lineDone = () => { this.lineDone = null; if (g.scene) g.scene.bubble(who, '', 0); done(); };
        if (FAST() && !window.__HT_SHIFT_MANUAL) setTimeout(() => this.advance(), 40);
      });
    }
    advance() { if (this.typing) { this.typing.finish(); return; } if (this.qaDone) { return; } if (this.lineDone) { Snd.play('blip'); this.lineDone(); } }
    hideDialog() { if (this.dialogEl) { this.dialogEl.remove(); this.dialogEl = null; } this.root.classList.remove('sh-talking'); this.closePop(); if (!this.g.panelOpen) this.pauseWide(false); }
    question(q, a) { const g = this.g; return g.wait(done => { if (!this.dialogEl) { const el = document.createElement('div'); el.className = 'sh-dialog'; el.setAttribute('role', 'dialog'); el.innerHTML = `<div class="sh-speaker"></div><div class="sh-text" data-sh-text></div>`; this.root.appendChild(el); this.dialogEl = el; this.root.classList.add('sh-talking'); }
      const el = this.dialogEl; el.classList.remove('sh-me', 'sh-call'); el.classList.add('sh-sys'); el.querySelector('.sh-speaker').innerHTML = `<span class="sh-tag" style="--tag:#3b7ddd">?</span><b>${esc(T('shiftWhat', '想一想', 'Think'))}</b>`; const adv = el.querySelector('.sh-adv'); if (adv) adv.remove();
      el.querySelector('[data-sh-text]').innerHTML = `${esc(q)}<div class="sh-qa">${a ? `<button type="button" class="sh-ghost" data-sh-show>${esc(T('shiftShowAnswer', '顯示答案', 'Show answer'))}</button>` : ''}<button type="button" class="sh-ghost" data-sh-qcont>${esc(T('shiftContinue', '繼續', 'Continue'))} →</button></div>`;
      this.qaDone = true; const show = el.querySelector('[data-sh-show]'); if (show) show.onclick = () => { show.remove(); const p = document.createElement('p'); p.className = 'sh-answer'; p.textContent = a; el.querySelector('[data-sh-text]').appendChild(p); }; el.querySelector('[data-sh-qcont]').onclick = () => { this.qaDone = false; this.hideDialog(); done(); }; if (FAST()) setTimeout(() => { if (show) show.click(); el.querySelector('[data-sh-qcont]') && el.querySelector('[data-sh-qcont]').click(); }, 80); }); }
    glossary(text) { const gl = this.g.data.glossary || []; const terms = gl.map((e, i) => ({ i, term: bl(e.term) })).filter(x => x.term).sort((a, b) => b.term.length - a.term.length); if (!terms.length) return esc(text); const re = new RegExp('(' + terms.map(x => x.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', zh() ? 'g' : 'gi'); return text.split(re).map(part => { const hit = terms.find(x => zh() ? x.term === part : x.term.toLowerCase() === part.toLowerCase()); return hit ? `<button type="button" class="sh-term" data-term="${hit.i}" aria-label="${esc(part)} · ${esc(T('shiftWhat', '這是什麼？', 'What is this?'))}">${esc(part)}</button>` : esc(part); }).join(''); }
    showPop(anchor, i) { this.closePop(); const e = (this.g.data.glossary || [])[i]; if (!e) return; const pop = document.createElement('div'); pop.className = 'sh sh-pop'; pop.setAttribute('role', 'tooltip'); pop.innerHTML = `<button type="button" aria-label="close">×</button><b>${esc(bl(e.term))}</b>${esc(bl(e.plain))}`; document.body.appendChild(pop); const r = anchor.getBoundingClientRect(); const w = Math.min(300, window.innerWidth - 16); pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px'; const h = pop.offsetHeight; pop.style.top = (r.top - h - 10 > 8 ? r.top - h - 10 : r.bottom + 10) + 'px'; pop.querySelector('button').onclick = () => this.closePop(); this.pop = pop; this.popOut = ev => { if (!pop.contains(ev.target) && ev.target !== anchor) this.closePop(); }; setTimeout(() => document.addEventListener('pointerdown', this.popOut, true), 0); }
    closePop() { if (this.pop) { this.pop.remove(); this.pop = null; } if (this.popOut) { document.removeEventListener('pointerdown', this.popOut, true); this.popOut = null; } }

    // ---- phone call / message
    ring(r) {
      const g = this.g; return g.wait(done => {
        const from = r.from && g.cast[r.from]; const isCall = !!r.call;
        const el = document.createElement('div'); el.className = 'sh-ring' + (isCall ? '' : ' sh-msg') + (isCall && !reduced() ? ' shake' : ''); el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', bl(r.title));
        el.innerHTML = `<div class="sh-ring-head"><div class="sh-avatar" style="--tag:${esc((from && from.color) || '#607d8b')}">${esc(isCall ? '📞' : '💬')}</div><div><b>${esc(bl(r.title))}</b><small>${from ? esc(bl(from.name) + ' · ' + bl(from.role)) : esc(isCall ? T('shiftCall', '來電', 'Call') : T('shiftMessage', '訊息', 'Message'))}</small></div></div><p>${esc(bl(r.sub))}</p><div class="sh-ring-acts"><button type="button" class="sh-answer-btn" data-sh-answer>${esc(isCall ? '📞 ' + T('shiftAnswerCall', '接聽', 'Answer') : T('shiftOpen', '查看', 'Open'))}</button></div>`;
        this.root.appendChild(el); this.ringEl = el; this.ringDone = done;
        if (isCall) { Snd.startRing(); try { if (navigator.vibrate && !reduced()) navigator.vibrate([300, 200, 300, 200, 300]); } catch (e) { /* ignore */ } } else Snd.play('msg');
        el.querySelector('[data-sh-answer]').onclick = () => this.answerRing(); el.querySelector('[data-sh-answer]').focus({ preventScroll: true });
        // Enter / Space answer the call even when focus drifted back to the room (keyboard players, screen readers)
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.answerRing(); } });
        this.ringKey = e => { if (!this.ringEl || (e.key !== 'Enter' && e.key !== ' ')) return; if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; e.preventDefault(); this.answerRing(); };
        document.addEventListener('keydown', this.ringKey, true);
        if (FAST()) setTimeout(() => this.answerRing(), 60);
      });
    }
    answerRing() { if (!this.ringEl) return; Snd.stopRing(); try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) { /* ignore */ } if (this.ringKey) { document.removeEventListener('keydown', this.ringKey, true); this.ringKey = null; } const el = this.ringEl, done = this.ringDone; this.ringEl = null; this.ringDone = null; el.remove(); Snd.play('blip'); if (done) done(); }

    // ---- mini-game panel
    panel(kind, title, opts) {
      const g = this.g; const el = document.createElement('section'); el.className = 'sh-panel' + (opts.compact ? ' sh-panel-compact' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', title);
      el.innerHTML = `<header class="sh-panel-head"><span class="sh-kind">${esc(kind)}</span><b>${esc(title)}</b>${opts.assist ? `<button type="button" class="sh-assist" data-sh-assist>✨ ${esc(T('shiftAssist', '輔助', 'Assist'))}</button>` : ''}<button type="button" data-sh-skip aria-label="${esc(T('shiftSkip', '略過', 'Skip'))}">${esc(T('shiftSkip', '略過', 'Skip'))} ✕</button></header><div class="sh-panel-body" data-sh-panel-body></div>`;
      this.root.appendChild(el); this.root.classList.add('sh-busy'); g.panelOpen = true; this.pauseWide(true); const body = el.querySelector('[data-sh-panel-body]');
      const p = { el, body, onClose: null, close: () => { if (!el.parentNode) return; el.remove(); this.root.classList.remove('sh-busy'); g.panelOpen = false; if (!this.dialogOpen()) this.pauseWide(false); this.root.focus({ preventScroll: true }); } };
      const assist = el.querySelector('[data-sh-assist]'); if (assist) assist.onclick = () => { if (opts.assist) opts.assist(); };
      el.querySelector('[data-sh-skip]').onclick = () => { if (p.onClose) p.onClose(); };
      el.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented && !(HT.tableImaging && HT.tableImaging.isOpen && HT.tableImaging.isOpen())) { e.stopPropagation(); if (p.onClose) p.onClose(); } });
      setTimeout(() => { const f = el.querySelector('button.sh-opt, [data-pool] button, .wb-board, canvas, button'); if (f && f.focus) f.focus({ preventScroll: true }); }, 30);
      return p;
    }

    // ---- codex
    openCodex() { const g = this.g; this.closeCodex(); const el = document.createElement('section'); el.className = 'sh-codex'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', T('shiftCodex', '圖鑑', 'Codex'));
      const roomHots = new Set((ROOM_HOTS[g.data.room] || ROOM_HOTS.or).split(' ')); Object.values(g.places).forEach(p => roomHots.add(p.hot)); (g.data.codex || []).forEach(c => { if (c.hot) roomHots.add(c.hot); });
      const INFO = (HT.theatre3d && HT.theatre3d.INFO) || {};
      const tabs = [
        ['people', T('shiftPeople', '人物', 'People'), Object.keys(g.cast).map(id => { const c = g.cast[id]; const on = g.met.has(id); return { on, nu: g.newCodex.has('cast:' + id), icon: `<span style="background:${esc(c.color || '#607d8b')};width:100%;height:100%;display:grid;place-items:center;font-size:.8rem">${esc(c.tag || '?')}</span>`, name: bl(c.name), sub: bl(c.role) + (on ? ' · ' + bl(c.about) : ''), key: 'cast:' + id }; })],
        ['places', T('shiftPlaces', '地點', 'Places'), Object.keys(g.places).map(id => { const p = g.places[id]; const on = g.visited.has(id); const inf = INFO[LEGACY[p.hot] || p.hot]; return { on, nu: g.newCodex.has('place:' + id), icon: HOT_ICON[p.hot] || '📍', name: bl(p.name), sub: on && inf ? (zh() ? inf[2] : inf[3]) : (HOT_NAME[p.hot] ? say(HOT_NAME[p.hot][0], HOT_NAME[p.hot][1]) : ''), key: 'place:' + id }; })],
        ['items', T('shiftItems', '物品', 'Items'), (g.data.codex || []).filter(c => c.kind === 'item').map(c => { const on = g.items.includes(c.id); return { on, nu: g.newCodex.has('item:' + c.id), icon: '🎒', name: bl(c.name), sub: on ? bl(c.text) : T('shiftNotYet', '尚未解鎖', 'Not yet'), key: 'item:' + c.id }; }).concat(Object.keys(g.panos || {}).map(id => { const sg = g.segById(id.replace(/^panorama-/, '')); return { on: true, nu: g.newCodex.has('item:' + id), icon: g.panos[id] ? `<img src="${g.panos[id]}" alt="" style="width:100%;height:100%;object-fit:cover">` : '🌐', name: T('shiftPanoramaItem', '環景照', 'Panorama') + (sg ? ' · ' + bl(sg.name) : ''), sub: say(roomName(g.data.room)[0], roomName(g.data.room)[1]) + ' · 360°', key: 'item:' + id }; }))],
        ['equipment', T('shiftEquipment', '設備', 'Equipment'), (g.data.codex || []).filter(c => c.kind === 'equipment').map(c => ({ on: g.items.includes(c.id) || (c.hot && g.seen.has(c.hot)), nu: g.newCodex.has('item:' + c.id) || (c.hot && g.newCodex.has('equip:' + c.hot)), icon: HOT_ICON[c.hot] || '⚙', name: bl(c.name), sub: bl(c.text), key: 'item:' + c.id })).concat([...roomHots].filter(h => !(g.data.codex || []).some(c => c.hot === h)).map(h => { const inf = INFO[LEGACY[h] || h]; const on = g.seen.has(h); return { on, nu: g.newCodex.has('equip:' + h), icon: HOT_ICON[h] || '⚙', name: HOT_NAME[h] ? say(HOT_NAME[h][0], HOT_NAME[h][1]) : h, sub: inf ? (zh() ? inf[2] : inf[3]) : '', key: 'equip:' + h }; }))],
        ['concepts', T('shiftConcepts', '概念', 'Concepts'), (g.data.codex || []).filter(c => c.kind === 'concept' || c.kind === 'person').map(c => { const on = g.items.includes(c.id); return { on, nu: g.newCodex.has('item:' + c.id), icon: '💡', name: bl(c.name), sub: on ? bl(c.text) : T('shiftNotYet', '尚未解鎖', 'Not yet'), key: 'item:' + c.id }; })]
      ].filter(tb => tb[2].length);
      const total = tabs.reduce((n, tb) => n + tb[2].length, 0), unlocked = tabs.reduce((n, tb) => n + tb[2].filter(e => e.on).length, 0);
      const icon = HT.icons && HT.icons.photoFile ? HT.icons.photoFile(g.dept) : '';
      el.innerHTML = `<header class="sh-panel-head"><span class="sh-cxic" style="width:36px;height:36px;border-radius:10px;overflow:hidden;flex:0 0 36px">${icon ? `<img src="${esc(icon)}" alt="" style="width:100%;height:100%;object-fit:cover">` : ''}</span><b>📖 ${esc(T('shiftCodex', '圖鑑', 'Codex'))} · ${esc(deptName(g.meta))} <small style="color:var(--sh-muted);font-weight:500">${unlocked}/${total}</small></b><button type="button" data-sh-cx-close aria-label="close">✕</button></header><div class="sh-tabs" role="tablist">${tabs.map((tb, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-tab="${tb[0]}">${esc(tb[1])} <small>${tb[2].filter(e => e.on).length}/${tb[2].length}</small></button>`).join('')}</div><div class="sh-panel-body" data-cx-body></div>`;
      this.root.appendChild(el); this.codexEl = el; const body = el.querySelector('[data-cx-body]');
      const show = id => { const tb = tabs.find(x => x[0] === id) || tabs[0]; el.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tb[0]))); body.innerHTML = `<div class="sh-codex-list">${tb[2].map(e => `<div class="sh-cx ${e.on ? '' : 'locked'}" data-cx-key="${esc(e.key)}"><div class="sh-cxic">${e.icon}</div><div><b>${esc(e.name)}${e.nu ? '<span class="sh-new">NEW</span>' : ''}</b><small>${esc(e.sub)}</small></div></div>`).join('')}</div>`; tb[2].forEach(e => g.newCodex.delete(e.key)); this.codexBadge(); };
      el.querySelectorAll('[role=tab]').forEach(b => b.onclick = () => show(b.dataset.tab)); el.querySelector('[data-sh-cx-close]').onclick = () => this.closeCodex(); show(tabs[0] && tabs[0][0]); el.querySelector('[data-sh-cx-close]').focus({ preventScroll: true }); }
    closeCodex() { if (this.codexEl) { this.codexEl.remove(); this.codexEl = null; } }

    // ---- leave confirm
    confirmLeave(fromBack) { const g = this.g; if (this.confirmEl) return; const el = document.createElement('div'); el.className = 'sh-confirm'; el.setAttribute('role', 'alertdialog'); el.innerHTML = `<div class="sh-box"><p>${esc(T('shiftLeaveConfirm', '離開值班？進度已保存。', 'Leave the shift? Your progress is saved.'))}</p><div class="sh-actions"><button type="button" class="sh-ghost" data-stay>${esc(T('shiftStay', '留下', 'Stay'))}</button><button type="button" class="sh-big" style="flex:0 0 auto;min-height:48px;padding:0 22px" data-leave>${esc(T('shiftLeave', '離開', 'Leave'))}</button></div></div>`;
      this.root.appendChild(el); this.confirmEl = el; g.save();
      el.querySelector('[data-stay]').onclick = () => { el.remove(); this.confirmEl = null; if (fromBack) { try { history.pushState({ htShift: 1 }, ''); } catch (e) { /* ignore */ } } };
      el.querySelector('[data-leave]').onclick = () => { el.remove(); this.confirmEl = null; this.leaving = true; g.leave(); };
      el.querySelector('[data-stay]').focus({ preventScroll: true }); }

    // ---- ending overlay
    ending(canvas) { const g = this.g; this.hideDialog(); const el = document.createElement('div'); el.className = 'sh-ending'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', T('shiftEnd', '下班了', 'End of shift'));
      el.innerHTML = `<div class="sh-end-img"></div><div class="sh-end-acts"><button type="button" class="primary" data-end-save>⤓ ${esc(T('shiftSaveImage', '儲存圖片', 'Save image'))}</button><button type="button" data-end-share>↗ ${esc(T('shiftShare', '分享', 'Share'))}</button><button type="button" data-end-copy>⎘ ${esc(T('shiftCopyRecap', '複製文字回顧', 'Copy recap'))}</button><button type="button" data-end-again>↻ ${esc(T('shiftAgain', '再值一班', 'Another shift'))}</button><button type="button" data-end-role>⇄ ${esc(T('shiftChangeRole', '換角色', 'Change role'))}</button><button type="button" data-end-home>⌂ ${esc(T('shiftBackHome', '回學院', 'Back to the academy'))}</button></div>`;
      el.querySelector('.sh-end-img').appendChild(canvas); canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', g.recapText()); this.root.appendChild(el); this.endingEl = el; this.root.classList.add('sh-ended');
      const file = () => new Promise(res => { try { canvas.toBlob(b => res(b ? new File([b], `huatuo-shift-${g.dept}.png`, { type: 'image/png' }) : null), 'image/png'); } catch (e) { res(null); } });
      el.querySelector('[data-end-save]').onclick = async () => { const f = await file(); if (!f) { this.toast(T('shiftLoadError', '無法產生圖片', 'Could not render the image')); return; } const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
      const link = location.href.split('#')[0] + g.link();
      const others = g.otherCases(); if (others.length) { const nx = others.find(s => !json(saveKeyFor(g.dept, s.case, g.role), { done: false }).done) || others[0]; const b = document.createElement('button'); b.type = 'button'; b.className = 'primary'; b.setAttribute('data-end-next', nx.case); b.textContent = '→ ' + T('shiftNextCase', '下一個病例', 'Next case') + ' · ' + bl(nx.caseTitle || nx.title); el.querySelector('[data-end-again]').before(b); b.onclick = () => { const to = `#shift?department=${g.dept}&case=${nx.case}&role=${encodeURIComponent(g.role)}`; g.dispose(); location.hash = to; }; }
      el.querySelector('[data-end-share]').onclick = async () => { const f = await file(); const data = { title: bl(g.data.title), text: g.recapText(), url: link }; try { if (f && navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share(Object.assign({ files: [f] }, data)); return; } if (navigator.share) { await navigator.share(data); return; } } catch (e) { if (e && e.name === 'AbortError') return; } copyText(link).then(() => this.toast(T('shiftLinkCopied', '連結已複製', 'Link copied'))); };
      el.querySelector('[data-end-copy]').onclick = () => copyText(g.recapText()).then(() => this.toast(T('shiftCopied', '已複製', 'Copied')));
      el.querySelector('[data-end-again]').onclick = () => { store.del(g.saveKey()); const r = g.onLeave; g.dispose(); if (r) r({ again: true, role: g.role }); };
      el.querySelector('[data-end-role]').onclick = () => { const r = g.onLeave; g.dispose(); if (r) r({ pickRole: true }); };
      el.querySelector('[data-end-home]').onclick = () => { g.dispose(); location.hash = '#home'; };
      (el.querySelector('[data-end-next]') || el.querySelector('[data-end-save]')).focus({ preventScroll: true }); }
    dispose() { this.closeWide(); this.hideDialog(); this.dismissTitle(); this.closeCodex(); if (this.ringEl) { this.ringEl.remove(); this.ringEl = null; } if (this.ringKey) { document.removeEventListener('keydown', this.ringKey, true); this.ringKey = null; } if (this.typing) clearInterval(this.typing.timer); document.removeEventListener('fullscreenchange', this.fsChange); window.removeEventListener('popstate', this.popState); this.exitFullscreen(); if (this.root) { this.root.className = 'sh'; this.root.innerHTML = ''; } }
  }
  function copyText(text) { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text)); return Promise.resolve(fallbackCopy(text)); }
  function fallbackCopy(text) { try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- pages: picker, entry card, game host
  let active = null;
  const dots = d => '●'.repeat(Math.max(1, Math.min(3, d | 0))) + '○'.repeat(3 - Math.max(1, Math.min(3, d | 0)));
  const diffName = d => [T('shiftDiff1', '入門', 'Easy'), T('shiftDiff2', '標準', 'Standard'), T('shiftDiff3', '進階', 'Demanding')][Math.max(1, Math.min(3, d | 0)) - 1];
  // completion / save state of one case across its roles (✓ when any role finished it, 💾 when a save exists)
  function caseState(dept, cas, roles) { let done = 0, saved = false; (roles || []).forEach(r => { const s = json(saveKeyFor(dept, cas, r.id), null); if (s && s.done) done++; else if (s) saved = true; }); return { done, saved }; }
  function renderPicker(root, idx, params) {
    params = params || new URLSearchParams();
    const all = idx.shifts || []; const byDept = {}; all.forEach(s => { (byDept[s.department] = byDept[s.department] || []).push(s); });
    const tile = m => { const cs = byDept[m.id] || []; const on = cs.length > 0; const first = cs[0]; const stateN = cs.filter(s => caseState(m.id, s.case, s.roles).done).length; const hay = [deptName(m), m.title, m.titleEn].concat(cs.map(s => [bl(s.caseTitle), bl(s.condition), bl(s.title), s.caseTitle && s.caseTitle.zh, s.caseTitle && s.caseTitle.en, s.condition && s.condition.zh, s.condition && s.condition.en, roomName(s.room).join(' ')].join(' '))).join(' ').toLowerCase();
      return `<a class="sh-tile ${on ? '' : 'soon'}" data-dept="${esc(m.id)}" data-fac="${esc(facultyOf(m.id))}" data-hay="${esc(hay)}" style="--tile-accent:${esc(m.accent)}" href="#shift?department=${esc(m.id)}" ${on ? '' : 'aria-disabled="true" tabindex="-1"'}><span class="sh-icon">${HT.icons ? HT.icons.dept(m.id, m.accent, m.glyph, 52) : ''}</span><span style="min-width:0"><b>${esc(deptName(m))}</b><small>${on ? esc(cs.length > 1 ? cs.map(s => bl(s.condition || s.caseTitle)).filter(Boolean).slice(0, 3).join(' · ') : bl(first.tagline || first.title)) : esc(T('shiftComingSoon', '即將推出', 'Coming soon'))}</small>${on ? `<small class="sh-meta"><span class="sh-count">${esc(caseCount(cs.length))}</span>${stateN ? ` <span class="sh-done">✓ ${stateN}</span>` : ''} · ≈${cs.reduce((n, s) => n + (s.minutes || 25), 0)} ${esc(T('shiftMinutes', '分鐘', 'min'))}</small>` : ''}</span>${on ? '<span class="sh-play" aria-hidden="true">▶</span>' : ''}</a>`; };
    const group = (fac, ids) => { const ms = ids.map(deptMeta).sort((a, b) => ((byDept[b.id] || []).length ? 1 : 0) - ((byDept[a.id] || []).length ? 1 : 0)); const n = ms.filter(m => byDept[m.id]).length; const cases = ms.reduce((k, m) => k + (byDept[m.id] || []).length, 0);
      return `<section class="sh-fac" data-fac-group="${fac}" id="shift-${fac}" style="--sh-fac:${FAC[fac].accent}"><h2><span class="sh-fac-dot"></span>${esc(facName(fac))} <small>${n}/${ids.length} ${esc(T('shiftDeptUnit', '科', 'departments'))} · ${esc(caseCount(cases))}</small></h2><div class="sh-grid">${ms.map(tile).join('')}</div></section>`; };
    let fac = params.get('faculty') || store.get('ht-shift-fac') || 'all'; if (!/^(all|western|tcm)$/.test(fac)) fac = 'all';
    root.innerHTML = `<div class="sh sh-entry sh-picker" style="max-width:1040px"><div class="section-head"><div><span class="eyebrow">${esc(T('shiftTitle', '一日值班', 'One-day shift'))}</span><h1>${esc(T('shiftPicker', '選一科開始值班', 'Choose a department to start a shift'))}</h1><p class="subtext">${esc(T('shiftPickerSub', '每一科都是一天', 'Every department is one day'))} · ${esc(caseCount(all.length))} · ${deptsOf(idx).length} ${esc(T('shiftDeptUnit', '科', 'departments'))}</p></div></div>
      <div class="sh-pick-bar"><div class="sh-tabs sh-fac-tabs" role="tablist">${[['all', T('shiftAll', '全部', 'All')], ['western', facName('western')], ['tcm', facName('tcm')]].map(([k, l]) => `<button type="button" role="tab" data-fac-tab="${k}" aria-selected="${k === fac}">${esc(l)}</button>`).join('')}</div><label class="sh-search"><span aria-hidden="true">🔍</span><input type="search" data-sh-search placeholder="${esc(T('shiftSearch', '搜尋科別、病例、病症', 'Search department, case, condition'))}" aria-label="${esc(T('shiftSearch', '搜尋科別、病例、病症', 'Search'))}"></label></div>
      ${group('western', WESTERN)}${group('tcm', TCM)}
      <p class="sh-note sh-empty sh-hidden" data-sh-empty>${esc(T('noResults', '沒有符合的結果', 'No results'))}</p>
      <p class="sh-note">${esc(T('shiftSimulation', '教學模擬 · 非真實病人', 'Teaching simulation · not a real patient'))} · ${esc(T('shiftCaseNote', '每個病例約 20–25 分鐘；進度自動保存，可隨時離開再繼續。', 'About 20–25 minutes per case; progress is saved automatically, leave and resume any time.'))}</p></div>`;
    const apply = () => { const q = (root.querySelector('[data-sh-search]').value || '').trim().toLowerCase(); let shown = 0; root.querySelectorAll('.sh-tile').forEach(a => { const ok = (fac === 'all' || a.dataset.fac === fac) && (!q || a.dataset.hay.includes(q)); a.classList.toggle('sh-hidden', !ok); if (ok) shown++; }); root.querySelectorAll('[data-fac-group]').forEach(g => g.classList.toggle('sh-hidden', fac !== 'all' && g.dataset.facGroup !== fac)); root.querySelectorAll('[data-fac-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.facTab === fac))); root.querySelector('[data-sh-empty]').classList.toggle('sh-hidden', shown > 0); };
    root.querySelectorAll('[data-fac-tab]').forEach(b => b.onclick = () => { fac = b.dataset.facTab; store.set('ht-shift-fac', fac); apply(); });
    root.querySelector('[data-sh-search]').oninput = apply; apply();
  }
  // Entry card: department header → case list (v2) → name → roles of the selected case → start / resume → clock line
  function renderEntry(root, ctx) {
    const { dept, data, meta, params, idx } = ctx; const cas = ctx.cas || data.case || 'main'; const roles = data.roles || []; const saved = {}; roles.forEach(r => { const s = json(saveKeyFor(dept, cas, r.id), null); if (s && !s.done) saved[r.id] = s; });
    const done = {}; roles.forEach(r => { const s = json(saveKeyFor(dept, cas, r.id), null); if (s && s.done) done[r.id] = true; });
    let role = params.get('role') && roles.some(r => r.id === params.get('role')) ? params.get('role') : (Object.keys(saved)[0] || (roles[0] && roles[0].id));
    const name = store.get('ht-shift-name') || '';
    const now = new Date(); const minutes = now.getHours() * 60 + now.getMinutes(); const startIdx = startSegFor(minutes, data.segs); const band = bandOf(minutes);
    const mode2d = store.get('ht-shift-2d') === '1' || params.get('view') === '2d' || !(HT.theatre3d && HT.theatre3d.available && HT.theatre3d.available());
    const fac = facultyOf(dept); const cases = casesOf(idx, dept); const multi = cases.length > 1 || (cases.length === 1 && cases[0].case !== 'main');
    const caseRow = s => { const st = caseState(dept, s.case, s.roles); const on = s.case === cas; return `<button type="button" class="sh-case ${on ? 'on' : ''} ${st.done ? 'done' : ''}" role="radio" aria-checked="${on}" data-case="${esc(s.case)}"><span class="sh-icon">${HT.icons ? HT.icons.dept(dept, meta.accent, meta.glyph, 40) : ''}</span><span class="sh-case-main"><b>${esc(bl(s.caseTitle || s.title))}</b><small>${s.condition ? `<span class="sh-cond">${esc(bl(s.condition))}</span>` : ''}<span>${esc(say(roomName(s.room)[0], roomName(s.room)[1]))}</span><span class="sh-dots" title="${esc(diffName(s.difficulty))}" aria-label="${esc(T('shiftDifficulty', '難度', 'Difficulty'))} ${esc(diffName(s.difficulty))}">${dots(s.difficulty)}</span><span>≈${s.minutes || 25} ${esc(T('shiftMinutes', '分鐘', 'min'))}</span></small></span><span class="sh-case-state">${st.done ? `<span class="sh-done" title="${esc(T('shiftCompleted', '已完成', 'Completed'))}">✓${st.done > 1 ? ' ' + st.done : ''}</span>` : ''}${st.saved ? `<span class="sh-resume-tag">💾 ${esc(T('shiftContinue', '繼續', 'Continue'))}</span>` : ''}</span></button>`; };
    root.innerHTML = `<div class="sh sh-entry sh-fac-${fac}" style="--sh-accent:${esc(meta.accent || '#2f7f6f')};--sh-fac:${FAC[fac].accent}"><div class="sh-card"><div class="sh-card-head"><div class="sh-icon">${HT.icons ? HT.icons.dept(dept, meta.accent, meta.glyph, 92) : ''}</div><div style="min-width:0"><span class="sh-eyebrow"><span class="sh-fac-tag">${esc(facName(fac))}</span> ${esc(deptName(meta))} · ${esc(T('shiftTitle', '一日值班', 'One-day shift'))} · ≈${data.minutes || 25} ${esc(T('shiftMinutes', '分鐘', 'min'))}</span><h1>${esc(bl(data.title))}</h1><p class="sh-tagline">${esc(bl(data.tagline))}</p>${data.condition || (data.caseTitle && bl(data.caseTitle) !== bl(data.title)) ? `<p class="sh-caseline">${data.caseTitle && bl(data.caseTitle) !== bl(data.title) ? `<b>${esc(bl(data.caseTitle))}</b>` : ''}${data.condition ? `<span class="sh-cond">${esc(bl(data.condition))}</span>` : ''}<span class="sh-room">${esc(say(roomName(data.room)[0], roomName(data.room)[1]))}</span></p>` : ''}</div></div>
      ${multi ? `<div class="sh-field"><label>${esc(T('shiftCases', '病例', 'Cases'))} <span style="font-weight:400;color:var(--sh-muted)">· ${esc(caseCount(cases.length))}</span></label><div class="sh-cases" role="radiogroup">${cases.map(caseRow).join('')}</div></div>` : ''}
      <div class="sh-field"><label for="shName">${esc(T('shiftYourName', '你的名字', 'Your name'))} <span style="font-weight:400;color:var(--sh-muted)">(${esc(T('shiftNamePlaceholder', '可留白', 'optional'))})</span></label><input id="shName" type="text" maxlength="24" value="${esc(name)}" autocomplete="nickname"></div>
      <div class="sh-field"><label>${esc(T('shiftRole', '角色', 'Role'))}</label><div class="sh-roles" role="radiogroup">${roles.map(r => `<button type="button" class="sh-role" role="radio" aria-pressed="${r.id === role}" aria-checked="${r.id === role}" data-role="${esc(r.id)}"><b>${esc(zh() ? r.zh : r.en)}${saved[r.id] ? ' · 💾' : done[r.id] ? ' · ✓' : ''}</b><small>${esc(bl(r.desc))}</small></button>`).join('')}</div></div>
      <div class="sh-actions"><button type="button" class="sh-big" data-sh-begin>▶ ${esc(T('shiftBegin', '開始值班', 'Start the shift'))}</button><button type="button" class="sh-ghost ${saved[role] ? '' : 'sh-hidden'}" data-sh-resume>💾 ${esc(T('shiftResume', '繼續上次', 'Resume'))}</button></div>
      <div class="sh-clockline"><span>🕒 ${esc(T('shiftByClock', '依現在時間安排', 'Scheduled by the clock'))} · ${esc(hhmm(minutes))} →</span>${[0, 1, 2, 3].map(i => `<span class="sh-seg ${i === band ? 'on' : ''}">${esc(segLabel(i))}</span>`).join('')}<span>· ${esc(bl(data.segs[startIdx].name))} ${esc(hhmm(data.segs[startIdx].t))}</span></div>
      <p class="sh-note">${esc(T('shiftSimulation', '教學模擬 · 非真實病人', 'Teaching simulation · not a real patient'))} · ${data.segs.length} ${esc(T('shiftMoments', '個時段', 'moments'))} · ${(data.glossary || []).length} ${esc(T('shiftGlossaryTerms', '個名詞解釋', 'glossary terms'))} · ${mode2d ? esc(T('shiftView2d', '2D 平面圖', '2D floor plan')) : esc(T('shiftView3d', '3D 房間', '3D room'))}</p></div>
      <p class="sh-note" style="text-align:center"><a href="#shift${fac === 'tcm' ? '?faculty=tcm' : ''}">← ${esc(T('shiftAllDepts', '全部科別', 'All departments'))}</a> · <a href="#procedures?department=${esc(dept)}">${esc(T('departmentLibrary', '科別程序庫', 'Procedure library'))} →</a>${fac === 'tcm' ? ` · <a href="#acu">${esc(T('navAcu', '針灸銅人', 'Acupuncture atlas'))}</a> · <a href="#tcm">${esc(T('navTcm', '本草圖書館', 'TCM library'))}</a>` : ''}</p></div>`;
    const sync = () => { root.querySelectorAll('[data-role]').forEach(b => { const on = b.dataset.role === role; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-checked', String(on)); }); root.querySelector('[data-sh-resume]').classList.toggle('sh-hidden', !saved[role]); };
    root.querySelectorAll('[data-role]').forEach(b => b.onclick = () => { role = b.dataset.role; sync(); });
    // picking another case loads its script and re-renders the card (its own roles, saves and clock line); the URL follows
    root.querySelectorAll('[data-case]').forEach(b => b.onclick = async () => { const c = b.dataset.case; if (c === cas) return; b.classList.add('loading'); try { const d2 = await loadShift(shiftId(dept, c)); if (!root.isConnected) return; const p = new URLSearchParams(params); p.delete('role'); if (c === 'main') p.delete('case'); else p.set('case', c); try { history.replaceState(history.state, '', location.href.split('#')[0] + '#shift?' + p.toString()); } catch (e) { /* ignore */ } renderEntry(root, { dept, cas: c, data: d2, meta, params: p, idx }); } catch (e) { b.classList.remove('loading'); const n = document.createElement('p'); n.className = 'notice danger'; n.textContent = e.message; b.after(n); } });
    const begin = resume => { const nm = root.querySelector('#shName').value.trim(); store.set('ht-shift-name', nm); Snd.ensure(); if (!resume) store.del(saveKeyFor(dept, cas, role)); startGame(root, { dept, cas, data, meta, idx, role, name: nm, params, resume: resume ? saved[role] : null, mode2d: store.get('ht-shift-2d') === '1' || params.get('view') === '2d' }); };
    root.querySelector('[data-sh-begin]').onclick = () => begin(false); root.querySelector('[data-sh-resume]').onclick = () => begin(true);
    if (params.get('autostart') === '1') begin(false);
  }
  function startGame(main, o) {
    if (active) { active.dispose(); active = null; }
    const host = document.createElement('div'); main.innerHTML = ''; main.appendChild(host);
    const entry = (p) => renderEntry(main, { dept: o.dept, cas: o.cas, data: o.data, meta: o.meta, params: p || o.params, idx: o.idx });
    const back = r => { active = null; if (r && r.again) { store.del(saveKeyFor(o.dept, o.cas, r.role || o.role)); const p = new URLSearchParams(o.params); p.set('role', r.role || o.role); entry(p); return; } entry(); };
    const g = new Game(host, Object.assign({}, o, { onLeave: back }));
    active = g; window.__htShift = { game: g, state: () => ({ dept: g.dept, case: g.cas, id: g.id, seg: g.order[g.pos.seg], beat: (g.segById(g.order[g.pos.seg]) || { beats: [] }).beats[g.pos.beat] && g.segById(g.order[g.pos.seg]).beats[g.pos.beat].id, beatIdx: g.pos.beat, clock: g.clock, flags: g.flags, items: g.items.slice(), stats: g.stats, met: [...g.met], visited: [...g.visited], scene: g.scene && g.scene.kind, panel: g.panelOpen, dialog: g.ui && g.ui.dialogOpen(), title: !!(g.ui && g.ui.titleEl), ring: !!(g.ui && g.ui.ringEl), ending: !!(g.ui && g.ui.endingEl), target: g.target && g.target.id, targetsSet: g.targetsSet || 0, find: g.findHot, order: g.order, wide: !!(g.ui && g.ui.wideCtl), dead: g.dead }), go: () => g.go(), talk: () => g.talk(), advance: () => g.ui.advance(), answer: () => g.ui.answerRing(), dismissTitle: () => g.ui.dismissTitle(), assist: () => { const b = g.root.querySelector('[data-sh-assist]'); if (b) b.click(); }, save: () => g.save(), ui: g.ui };
    g.start();
  }
  function mount(main, params) {
    params = params || new URLSearchParams();
    const dept = params.get('department') || '';
    main.innerHTML = `<div class="loading">${esc(t('loadingModule'))}</div>`;
    let cancelled = false;
    (async () => {
      await ensureDeps(); if (cancelled) return;
      const idx = await loadIndex(); if (cancelled) return;
      if (!dept) { renderPicker(main, idx, params); return; }
      // case: the URL's, else `main`, else the department's first listed case (a department may ship only `--` files)
      const cases = casesOf(idx, dept); const want = params.get('case') || '';
      const cas = want && /^[a-z0-9-]{2,30}$/.test(want) ? want : (cases.some(s => s.case === 'main') || !cases.length ? 'main' : cases[0].case);
      let data; try { data = await loadShift(shiftId(dept, cas)); } catch (e) { if (cancelled) return; main.innerHTML = `<div class="sh sh-entry"><div class="notice danger">${esc(e.message || T('shiftNoData', '此科尚無值班劇本。', 'No shift script yet.'))}</div></div>`; const d2 = document.createElement('div'); main.appendChild(d2); renderPicker(d2, idx, params); return; }
      if (cancelled) return;
      renderEntry(main, { dept, cas, data, meta: deptMeta(dept), params, idx });
    })().catch(e => { if (!cancelled) { main.innerHTML = `<div class="notice danger">${esc(e.message)}</div>`; console.error(e); } });
    return () => { cancelled = true; if (active) { active.save(); active.dispose(); active = null; } };
  }
  HT.shift = { mount, loadIndex, loadShift, startSegFor, bandOf, Snd, shiftId, saveKeyFor, casesOf, roomHot, rooms: Object.keys(ROOM_HOTS), hotspots: Object.keys(HOT_NAME), version: '4.1', get active() { return active; } };
})(window);
