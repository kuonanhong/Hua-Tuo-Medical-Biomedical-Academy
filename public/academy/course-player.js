/* Course page: stage/step navigator, step content, mentor narration, quiz, progress, lock
   for member-only sections (the first section of every course is free), internship tier
   hand-off to the simulators, sources and related courses. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = k => window.HT.i18n.t(k);
  const zh = () => window.HT.i18n.isZh();
  const pk = (o, f) => window.HT.locale.pick(o, f);
  const loaded = {};
  let current = { course: null, catalog: null, stage: 0, step: 0, tier: 'basic', cleanup: null };

  async function loadCourse(cat) {
    if (!loaded[cat.department]) {
      if (!(window.HT_COURSES && window.HT_COURSES[cat.department])) await window.HT.loadScript('data/' + cat.courseFile);
      loaded[cat.department] = true;
    }
    return (window.HT_COURSES[cat.department] || []).find(c => c.id === cat.id);
  }
  function internSim(dep) {
    const tcm = ['tcm-diagnosis', 'tcm-intern-clinic', 'tcm-internal', 'tcm-specialties', 'tcm-fundamentals', 'tcm-classics', 'tcm-diet'];
    if (tcm.includes(dep)) return ['clinic', 'pulse', 'tongue'];
    if (['acupoints', 'acupuncture-technique', 'moxa-cupping', 'tuina', 'thai-massage', 'qigong'].includes(dep)) return ['locator', 'clinic'];
    if (['cardiology', 'cardiac-surgery', 'emergency', 'critical-care', 'anesthesiology'].includes(dep)) return ['ecg', 'bp', 'soap'];
    if (['endocrinology', 'tcm-diet'].includes(dep)) return ['glucose', 'vitals'];
    if (['pathology-lab', 'hematology', 'nephrology', 'infectious-disease'].includes(dep)) return ['labs', 'soap'];
    if (['nursing', 'geriatrics-family', 'pediatrics', 'obstetrics'].includes(dep)) return ['bp', 'vitals', 'glucose'];
    return ['vitals', 'soap', 'bp'];
  }
  function contextText(cat) {
    if (!current.course || !cat || current.course.id !== cat.id) return cat ? `${cat.title} / ${cat.titleEn}: ${cat.summary} ${cat.summaryEn}` : '';
    const st = current.course.stages[current.stage], s = st && st.steps[current.step];
    return `${cat.title} / ${cat.titleEn}\n${cat.summary}\n${cat.summaryEn}\n\n${st ? st.title + ' / ' + st.titleEn : ''}\n${s ? `${s.title} / ${s.titleEn}\n目標: ${s.objective}\nObjective: ${s.objectiveEn}\n操作: ${s.instruction}\nInstruction: ${s.instructionEn}\n觀察: ${s.observation}\n失效: ${s.failure}\n驗收: ${s.check}\n知識點: ${s.knowledge.map(k => k.title + ': ' + k.text).join(' | ')}` : ''}`;
  }
  function narration(s) {
    const z = zh();
    const style = window.HT.prefs.current.style;
    const parts = [pk(s, 'title'), (z ? '目標。' : 'Objective. ') + pk(s, 'objective'), (z ? '操作。' : 'Instruction. ') + pk(s, 'instruction'), (z ? '觀察。' : 'Observation. ') + pk(s, 'observation')];
    if (style !== 'brisk') parts.push((z ? '若失效。' : 'If it fails. ') + pk(s, 'failure'));
    parts.push((z ? '驗收標準。' : 'Acceptance check. ') + pk(s, 'check'));
    if (style === 'professional') s.knowledge.forEach(k => parts.push((z ? '知識點。' : 'Knowledge. ') + pk(k, 'title') + '。' + pk(k, 'text')));
    return parts.join('\n');
  }
  async function render(root, id, opts) {
    opts = opts || {};
    if (current.cleanup) { current.cleanup(); current.cleanup = null; }
    const cat = window.HT_CATALOG.find(c => c.id === id);
    if (!cat) { root.innerHTML = `<div class="notice danger">Course not found: ${esc(id)}</div>`; return; }
    root.innerHTML = `<div class="loading">${t('loading')}</div>`;
    const course = await loadCourse(cat);
    if (!course) { root.innerHTML = `<div class="notice danger">Course data missing for ${esc(id)}. Run bash rebuild-curriculum.sh</div>`; return; }
    current.course = course; current.catalog = cat; current.tier = opts.tier || current.tier || 'basic';
    if (!opts.keep) { current.stage = 0; current.step = 0; }
    window.HT.tutor.setContext(cat);
    const progress = window.HT.account.progress.get(cat.id);
    const allSteps = course.stages.flatMap(s => s.steps);
    const doneCount = allSteps.filter(s => progress.completed.includes(s.id)).length;
    const dep = window.HT_DEPARTMENTS.departments.find(d => d.id === cat.department) || {};
    const hasIntern = cat.tiers.includes('intern');
    const related = window.HT_CATALOG.filter(c => c.department === cat.department && c.id !== cat.id).slice(0, 6);
    const stageNav = course.stages.map((st, si) => { const open = si === current.stage; const locked = !window.HT.membership.hasAccess(course, si); return `<details ${open ? 'open' : ''}><summary><span>${esc(pk(st, 'title'))}</span><span class="tag ${st.free ? 'free' : 'member'}">${st.free ? t('free') : t('member')}</span></summary><ol>${st.steps.map((s, i) => `<li><button class="${si === current.stage && i === current.step ? 'active' : ''} ${progress.completed.includes(s.id) ? 'done' : ''} ${locked ? 'locked' : ''}" data-go="${si}:${i}"><span>${si + 1}.${i + 1}</span> ${esc(pk(s, 'title'))}</button></li>`).join('')}</ol></details>`; }).join('');
    root.innerHTML = `<div class="course-head"><span class="ic">${window.HT.icons.render(cat.icon, { size: 84, title: cat.title })}</span><div style="flex:1;min-width:260px"><span class="eyebrow"><a href="#catalog?department=${cat.department}">${esc(pk(dep, 'title') || cat.departmentTitle)}</a> · ${esc(cat.kind)}${cat.flagship ? ` · <span class="tag flagship">${t('flagship')}</span>` : ''}</span><h1>${esc(pk(cat, 'title'))}</h1><p class="muted" data-no-translate>${esc(zh() ? cat.titleEn : cat.title)}</p><p>${esc(pk(cat, 'summary'))}</p><div class="row"><span class="tag free">${t('free')} · ${t('section')} 1</span><span class="tag member">${course.stages.length - 1} ${t('section')} · ${t('member')}</span>${hasIntern ? `<span class="tag intern">${t('tierIntern')}</span>` : ''}<span class="muted small">${cat.stepCount} ${t('step')} · ≈${cat.estimatedMinutes} ${t('minutes')}</span></div><div class="progress-bar" style="margin-top:10px;max-width:420px"><i style="width:${Math.round(100 * doneCount / allSteps.length)}%"></i></div><p class="small muted">${doneCount}/${allSteps.length} ${t('done')}</p></div></div>
      <div class="tier-tabs"><button class="${current.tier === 'basic' ? 'active' : ''}" data-tier="basic">${t('tierBasic')}</button>${hasIntern ? `<button class="${current.tier === 'intern' ? 'active' : ''}" data-tier="intern">${t('tierIntern')}</button>` : ''}</div>
      <div class="mentor-strip"><span>✳</span><span>${zh() ? '師傅在右側示範、學徒在左側操作：看目標、做操作、記觀察、過驗收。有疑問隨時問 AI 師傅。' : 'The master demonstrates, the apprentice performs: read the objective, do the instruction, record the observation, pass the check. Ask the AI mentor anytime.'}</span><button class="button small" id="askStep">${t('ask')}</button></div>
      ${current.tier === 'intern' ? `<div id="internArea"></div>` : `<div class="course-layout"><nav class="stage-nav" aria-label="Sections">${stageNav}</nav><section class="step-view card" id="stepView"></section></div>`}
      <h2 style="margin-top:28px">${t('sources')}</h2><ul class="source-list">${course.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a></li>`).join('')}</ul>
      <p class="form-note">${zh() ? '本課程為教學拆解（模板＋作者資料），不是臨床指引或手術 SOP；實際操作須在合格醫師監督與機構規範下進行。' : 'This course is an educational decomposition (templates plus authored data), not a clinical guideline or operative SOP; real practice requires qualified supervision and institutional protocols.'}</p>
      ${related.length ? `<h2>${t('related')}</h2><div class="grid cols-3">${related.map(c => `<a class="course-card card flat" href="#course/${c.id}"><span class="ic" style="flex-basis:44px;width:44px;height:44px">${window.HT.icons.render(c.icon, { size: 44 })}</span><div><h3 style="font-size:.95rem">${esc(pk(c, 'title'))}</h3><p class="desc">${esc(pk(c, 'summary'))}</p></div></a>`).join('')}</div>` : ''}`;
    root.querySelectorAll('[data-tier]').forEach(b => b.onclick = () => render(root, id, { tier: b.dataset.tier, keep: true }));
    root.querySelector('#askStep').onclick = () => window.HT.tutor.open(cat);
    if (current.tier === 'intern') { renderIntern(root.querySelector('#internArea'), cat); return; }
    root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { const [si, i] = b.dataset.go.split(':').map(Number); current.stage = si; current.step = i; renderStep(root, cat, course); root.querySelectorAll('[data-go]').forEach(x => x.classList.toggle('active', x === b)); });
    renderStep(root, cat, course);
  }
  function renderIntern(area, cat) {
    const sims = internSim(cat.department);
    const labels = { clinic: t('tcmClinic'), pulse: t('pulseTrainer'), tongue: t('tongueTrainer'), locator: zh() ? '穴位定位訓練' : 'Acupoint locator', bp: zh() ? '血壓測量' : 'Blood pressure', glucose: zh() ? '血糖' : 'Glucose', vitals: t('vitals'), ecg: zh() ? '心電圖判讀' : 'ECG rhythms', labs: zh() ? '檢驗判讀' : 'Lab panels', soap: zh() ? '臨床病例 SOAP' : 'SOAP case' };
    area.innerHTML = `<div class="notice">${zh() ? '實習級：面對虛擬病人實作本科相關技能。免費試學含第一個模擬器；其餘需通行證。' : 'Internship tier: practise this department’s skills on virtual patients. The first simulator is free; the rest need a pass.'}</div><div class="tier-tabs" id="simTabs">${sims.map((s, i) => `<button class="${i === 0 ? 'active' : ''}" data-sim="${s}">${labels[s]}</button>`).join('')}</div><div id="simArea"></div>`;
    const mount = s => { if (current.cleanup) { current.cleanup(); current.cleanup = null; } const box = area.querySelector('#simArea'); const idx = sims.indexOf(s); if (idx > 0 && !window.HT.membership.hasAccess(null, 1)) { box.innerHTML = lockMarkup(); return; } const fn = ({ clinic: window.HT.internTcm.clinic, pulse: window.HT.internTcm.pulseTrainer, tongue: window.HT.internTcm.tongueTrainer, locator: window.HT.internTcm.locator, bp: window.HT.internWestern.bpStation, glucose: window.HT.internWestern.glucoseStation, vitals: window.HT.internWestern.vitalsStation, ecg: window.HT.internWestern.ecgStation, labs: window.HT.internWestern.labStation, soap: window.HT.internWestern.soapStation })[s]; const r = fn(box); if (typeof r === 'function') current.cleanup = r; };
    area.querySelectorAll('[data-sim]').forEach(b => b.onclick = () => { area.querySelectorAll('[data-sim]').forEach(x => x.classList.toggle('active', x === b)); mount(b.dataset.sim); });
    if (sims.includes('locator')) window.HT.tcmLibrary.ensure().then(() => mount(sims[0])); else mount(sims[0]);
  }
  function lockMarkup() { return `<div class="lock-overlay"><div style="font-size:2rem">🔒</div><h3>${t('locked')}</h3><p class="muted">${t('lockedDesc')}</p><a class="button primary" href="#membership">${t('unlock')}</a></div>`; }
  function renderStep(root, cat, course) {
    const view = root.querySelector('#stepView'); if (!view) return;
    window.HT.voice.stop();
    const si = current.stage, st = course.stages[si], s = st.steps[current.step];
    if (!window.HT.membership.hasAccess(course, si)) { view.innerHTML = `<span class="eyebrow">${esc(pk(st, 'title'))}</span><h2>${esc(pk(s, 'title'))}</h2>${lockMarkup()}`; return; }
    const progress = window.HT.account.progress.get(cat.id); const done = progress.completed.includes(s.id);
    const flat = course.stages.flatMap((x, a) => x.steps.map((y, b) => [a, b])); const pos = flat.findIndex(([a, b]) => a === si && b === current.step);
    const block = (cls, label, text) => `<div class="block ${cls}"><h4>${label}</h4><p style="margin:0">${esc(text)}</p></div>`;
    view.innerHTML = `<span class="eyebrow">${esc(pk(st, 'title'))} · ${t('step')} ${si + 1}.${current.step + 1}</span><h2>${esc(pk(s, 'title'))}</h2><p class="muted small" data-no-translate>${esc(zh() ? s.titleEn : s.title)}</p>
      <div class="row"><button class="button small" id="narrate">${t('narrate')}</button><button class="button light small" id="stopNarrate">${t('stop')}</button><button class="button ${done ? 'light' : 'primary'} small" id="markDone">${done ? '✓ ' + t('done') : t('markDone')}</button></div>
      ${block('objective', '🎯 ' + t('objective'), pk(s, 'objective'))}${block('instruction', '🛠 ' + t('instruction'), pk(s, 'instruction'))}${block('observation', '👁 ' + t('observation'), pk(s, 'observation'))}${block('failure', '⚠ ' + t('failure'), pk(s, 'failure'))}${block('check', '✅ ' + t('check'), pk(s, 'check'))}
      <h3 style="margin-top:16px">${t('knowledge')}</h3><div class="knowledge">${s.knowledge.map(k => `<div class="k"><b>${esc(pk(k, 'title'))}</b>${esc(pk(k, 'text'))}</div>`).join('')}</div>
      <h3 style="margin-top:16px">${t('quiz')}</h3><div class="quiz" id="quiz"><p>${esc(pk(s.quiz, 'question'))}</p>${(zh() ? s.quiz.options : s.quiz.optionsEn).map((o, i) => `<label class="opt"><input type="radio" name="q" value="${i}" style="width:auto">${esc(o)}</label>`).join('')}<button class="button small" id="quizSubmit">${t('submit')}</button><p id="quizResult" style="margin-top:8px"></p></div>
      <div class="row" style="margin-top:18px;justify-content:space-between"><button class="button light" id="prevStep" ${pos <= 0 ? 'disabled' : ''}>← ${t('prev')}</button><button class="button" id="nextStep" ${pos >= flat.length - 1 ? 'disabled' : ''}>${t('next')} →</button></div>`;
    view.querySelector('#narrate').onclick = () => { const ok = window.HT.voice.speak(narration(s), window.HT.prefs.speechOptions()); if (!ok) window.HT.app.toast(zh() ? '此裝置沒有可用語音，請閱讀文字。' : 'No voice on this device; read the text.'); };
    view.querySelector('#stopNarrate').onclick = () => window.HT.voice.stop();
    view.querySelector('#markDone').onclick = async () => { await window.HT.account.progress.markDone(cat.id, s.id, !done); render(root, cat.id, { keep: true, tier: 'basic' }); };
    view.querySelector('#quizSubmit').onclick = () => { const r = view.querySelector('input[name=q]:checked'); if (!r) return; const ok = Number(r.value) === s.quiz.answer; view.querySelectorAll('.opt').forEach((o, i) => { o.classList.toggle('correct', i === s.quiz.answer); o.classList.toggle('wrong', i === Number(r.value) && !ok); }); view.querySelector('#quizResult').innerHTML = `<b>${ok ? t('correct') : t('incorrect')}</b> ${esc(pk(s.quiz, 'explanation'))}`; if (ok && !done) window.HT.account.progress.markDone(cat.id, s.id, true).then(() => { view.querySelector('#markDone').textContent = '✓ ' + t('done'); view.querySelector('#markDone').className = 'button light small'; }); };
    const go = d => { const [a, b] = flat[pos + d]; current.stage = a; current.step = b; render(root, cat.id, { keep: true, tier: 'basic' }); view.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    view.querySelector('#prevStep').onclick = () => go(-1); view.querySelector('#nextStep').onclick = () => go(1);
  }
  window.HT = window.HT || {};
  window.HT.coursePlayer = { render, loadCourse, contextText, internSim, get current() { return current; } };
})(window);
