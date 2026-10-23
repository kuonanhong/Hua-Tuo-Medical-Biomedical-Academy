/* Apprentice XP, levels and badges (v3.5) — the "keep playing" layer. Stored per browser (and per
   signed-in user id) in localStorage; it is a learning-motivation record, not a credential. */
(function (window) {
  'use strict';
  const zh = () => !window.HT.i18n || window.HT.i18n.isZh();
  const say = (z, e) => zh() ? z : e;
  const KEY = () => 'ht-xp-v1:' + ((window.HT.account && window.HT.account.user && window.HT.account.user()) ? window.HT.account.user().id : 'guest');
  const LEVELS = [0, 120, 320, 640, 1100, 1700, 2500, 3500, 4800, 6400, 8300, 10500, 13000, 16000, 20000];
  const TITLES = [['見習生', 'Observer'], ['實習醫師', 'Intern'], ['住院醫師 R1', 'Resident R1'], ['住院醫師 R2', 'Resident R2'], ['住院醫師 R3', 'Resident R3'], ['總醫師', 'Chief resident'], ['主治醫師', 'Attending'], ['資深主治', 'Senior attending'], ['科主任', 'Department head'], ['教授', 'Professor'], ['講座教授', 'Distinguished professor'], ['院長', 'Hospital director'], ['大師', 'Master'], ['宗師', 'Grandmaster'], ['華佗', 'Hua Tuo']];
  const BADGES = {
    'first-stage': ['第一刀', 'First cut', '驗收通過第一道工序', 'Verified your first stage'],
    'no-assist-5': ['穩手', 'Steady hands', '連續 5 道工序不用輔助、一次通過', '5 stages in a row, first attempt, no assistance'],
    'no-assist-20': ['主刀', 'Lead surgeon', '連續 20 道工序不用輔助、一次通過', '20 stages in a row, first attempt, no assistance'],
    'case-complete': ['完整個案', 'Full case', '完成一整道程序的所有工序', 'Completed every stage of a procedure'],
    'dept-5': ['科別熟手', 'Department regular', '同一科完成 5 道程序', '5 procedures in one department'],
    'night-shift': ['夜班', 'Night shift', '在 22:00–06:00 之間練習', 'Practised between 22:00 and 06:00'],
    'theatre-3d': ['置身手術室', 'In the theatre', '在 3D 數位孿生手術室完成一道工序', 'Verified a stage inside the 3D theatre'],
    'all-views': ['三視角', 'Three views', '同一道程序用過第一、二、三視角', 'Used all three views in one procedure'],
    'imaging': ['影像判讀', 'Image reader', '打開影像工作站並比較正常對照', 'Opened the imaging station and compared with normal'],
    'ten-cases': ['十台刀', 'Ten cases', '完成 10 道程序', 'Completed 10 procedures']
  };
  function load() { try { return JSON.parse(localStorage.getItem(KEY()) || '{}'); } catch (e) { return {}; } }
  function save(d) { try { localStorage.setItem(KEY(), JSON.stringify(d)); } catch (e) { /* ignore */ } }
  function levelOf(xp) { let l = 0; while (l + 1 < LEVELS.length && xp >= LEVELS[l + 1]) l++; return l; }
  function state() { const d = load(); const xp = d.xp || 0, l = levelOf(xp); const next = LEVELS[l + 1] || LEVELS[l]; return { xp, level: l + 1, title: zh() ? TITLES[l][0] : TITLES[l][1], next, prev: LEVELS[l], pct: next > LEVELS[l] ? Math.round(100 * (xp - LEVELS[l]) / (next - LEVELS[l])) : 100, badges: d.badges || {}, streak: d.streak || 0, cases: d.cases || {}, stages: d.stages || 0 }; }
  function toast(msg) { if (window.HT.app && window.HT.app.toast) window.HT.app.toast(msg); }
  function award(d, id) { if (d.badges[id]) return; d.badges[id] = Date.now(); const b = BADGES[id]; if (b) toast('🏅 ' + say(b[0], b[1]) + ' · ' + say(b[2], b[3])); }
  // event: { kind: 'stage'|'case'|'view'|'imaging', department, caseId, attempts, assisted, theatre3d, views }
  function record(ev) {
    const d = load(); d.xp = d.xp || 0; d.badges = d.badges || {}; d.cases = d.cases || {}; d.views = d.views || {};
    const before = levelOf(d.xp);
    if (ev.kind === 'stage') {
      const base = 20; const bonus = ev.attempts === 1 ? 10 : 0; const assistPenalty = ev.assisted ? 12 : 0; const gain = Math.max(5, base + bonus - assistPenalty);
      d.xp += gain; d.stages = (d.stages || 0) + 1;
      d.streak = (!ev.assisted && ev.attempts === 1) ? (d.streak || 0) + 1 : 0;
      award(d, 'first-stage'); if (d.streak >= 5) award(d, 'no-assist-5'); if (d.streak >= 20) award(d, 'no-assist-20'); if (ev.theatre3d) award(d, 'theatre-3d');
      const h = new Date().getHours(); if (h >= 22 || h < 6) award(d, 'night-shift');
      toast(`+${gain} XP · ${say('工序通過', 'stage verified')}${ev.assisted ? ' · ' + say('（輔助）', '(assisted)') : ''}${d.streak >= 2 ? ' · ' + say('連勝', 'streak') + ' ' + d.streak : ''}`);
    } else if (ev.kind === 'case') {
      d.xp += 80; const dep = ev.department || 'x'; d.cases[dep] = d.cases[dep] || []; if (!d.cases[dep].includes(ev.caseId)) d.cases[dep].push(ev.caseId);
      award(d, 'case-complete'); if (d.cases[dep].length >= 5) award(d, 'dept-5'); if (Object.values(d.cases).reduce((n, l) => n + l.length, 0) >= 10) award(d, 'ten-cases');
      toast('+80 XP · ' + say('完成個案', 'case complete'));
    } else if (ev.kind === 'view') { const k = ev.caseId || 'x'; d.views[k] = Array.from(new Set((d.views[k] || []).concat([ev.view]))); if (d.views[k].length >= 3) award(d, 'all-views'); }
    else if (ev.kind === 'imaging') { award(d, 'imaging'); }
    const after = levelOf(d.xp); save(d);
    if (after > before) toast('🎉 ' + say(`升級！Lv.${after + 1} ${TITLES[after][0]}`, `Level up! Lv.${after + 1} ${TITLES[after][1]}`));
    if (window.dispatchEvent && window.CustomEvent) window.dispatchEvent(new CustomEvent('ht:xp', { detail: state() }));
    return state();
  }
  function badgeList() { const s = state(); return Object.keys(BADGES).map(id => ({ id, zh: BADGES[id][0], en: BADGES[id][1], descZh: BADGES[id][2], descEn: BADGES[id][3], earned: !!s.badges[id], at: s.badges[id] })); }
  function widget() { const s = state(); return `<span class="xp-badge" title="${s.xp} XP"><b>Lv.${s.level}</b> ${s.title}<i style="--p:${s.pct}%"></i><small>${s.xp} XP${s.streak >= 2 ? ' · 🔥' + s.streak : ''}</small></span>`; }
  window.HT = window.HT || {};
  window.HT.xp = { record, state, badgeList, widget, LEVELS, BADGES };
})(window);
