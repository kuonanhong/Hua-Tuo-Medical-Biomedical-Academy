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
    // Server responses enforce access and must never survive a logout in script cache.
    if (location.protocol !== 'file:') {
      const response = await fetch('data/' + cat.courseFile.replace(/\.js$/, '.json'), { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Course load failed (' + response.status + ')');
      const courses = await response.json();
      window.HT_COURSES = window.HT_COURSES || {};
      window.HT_COURSES[cat.department] = courses;
      return courses.find(c => c.id === cat.id);
    }
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
    const allSteps = course.stages.flatMap(s => s.steps || []);
    const doneCount = progress.completed.length;
    const dep = window.HT_DEPARTMENTS.departments.find(d => d.id === cat.department) || {};
    const hasIntern = cat.tiers.includes('intern');
    const related = window.HT_CATALOG.filter(c => c.department === cat.department && c.id !== cat.id).slice(0, 6);
    const stageNav = course.stages.map((st, si) => { const open = si === current.stage; const locked = !window.HT.membership.hasAccess(course, si); return `<details ${open ? 'open' : ''}><summary><span>${esc(pk(st, 'title'))}</span><span class="tag ${st.free ? 'free' : 'member'}">${st.free ? t('free') : t('member')}</span></summary><ol>${(st.steps || []).map((s, i) => `<li><button class="${si === current.stage && i === current.step ? 'active' : ''} ${progress.completed.includes(s.id) ? 'done' : ''} ${locked ? 'locked' : ''}" data-go="${si}:${i}"><span>${si + 1}.${i + 1}</span> ${esc(pk(s, 'title'))}</button></li>`).join('')}${locked && !(st.steps || []).length ? `<li><button class="locked" data-locked-stage="${si}">🔒 ${t('unlock')}</button></li>` : ''}</ol></details>`; }).join('');
    root.classList.add('course-workbench-first');
    root.innerHTML = `<div class="course-head"><span class="ic">${window.HT.icons.render(cat.icon, { size: 84, title: cat.title })}</span><div style="flex:1;min-width:260px"><span class="eyebrow"><a href="#catalog?department=${cat.department}">${esc(pk(dep, 'title') || cat.departmentTitle)}</a> · ${esc(cat.kind)}${cat.flagship ? ` · <span class="tag flagship">${t('flagship')}</span>` : ''}</span><h1>${esc(pk(cat, 'title'))}</h1><p class="muted" data-no-translate>${esc(zh() ? cat.titleEn : cat.title)}</p><p>${esc(pk(cat, 'summary'))}</p><div class="row"><span class="tag free">${t('free')} · ${t('section')} 1</span><span class="tag member">${course.stages.length - 1} ${t('section')} · ${t('member')}</span>${hasIntern ? `<span class="tag intern">${t('tierIntern')}</span>` : ''}<span class="muted small">${cat.stepCount} ${t('step')} · ≈${cat.estimatedMinutes} ${t('minutes')}</span></div><div class="progress-bar" style="margin-top:10px;max-width:420px"><i style="width:${Math.min(100,Math.round(100 * doneCount / (cat.stepCount || allSteps.length || 1)))}%"></i></div><p class="small muted">${doneCount}/${cat.stepCount || allSteps.length} ${t('done')}</p></div></div>
      <div class="tier-tabs"><button class="${current.tier === 'basic' ? 'active' : ''}" data-tier="basic">${t('tierBasic')}</button>${hasIntern ? `<button class="${current.tier === 'intern' ? 'active' : ''}" data-tier="intern">${t('tierIntern')}</button>` : ''}</div>
      <div class="mentor-strip"><span>✳</span><span>${zh() ? '先在主畫面看師傅示範，再移動雙手取得證據、通過判讀。技術解說與來源在後段。有疑問可問 AI 師傅。' : 'Watch the mentor, move the hand cursors, collect evidence and pass the reasoning check. Technical explanations and sources follow the workspace. Ask the AI mentor anytime.'}</span><button class="button small" id="askStep">${t('ask')}</button></div>
      ${current.tier === 'intern' ? `<div id="internArea"></div>` : `<div class="course-layout"><nav class="stage-nav" aria-label="Sections">${stageNav}</nav><section class="step-view card" id="stepView"></section></div>`}
      <h2 style="margin-top:28px">${t('sources')}</h2><ul class="source-list">${course.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a></li>`).join('')}</ul>
      <p class="form-note">${zh() ? '本課程為教學拆解（模板＋作者資料），不是臨床指引或手術 SOP；實際操作須在合格醫師監督與機構規範下進行。' : 'This course is an educational decomposition (templates plus authored data), not a clinical guideline or operative SOP; real practice requires qualified supervision and institutional protocols.'}</p>
      ${related.length ? `<h2>${t('related')}</h2><div class="grid cols-3">${related.map(c => `<a class="course-card card flat" href="#course/${c.id}"><span class="ic" style="flex-basis:44px;width:44px;height:44px">${window.HT.icons.render(c.icon, { size: 44 })}</span><div><h3 style="font-size:.95rem">${esc(pk(c, 'title'))}</h3><p class="desc">${esc(pk(c, 'summary'))}</p></div></a>`).join('')}</div>` : ''}`;
    root.querySelectorAll('[data-locked-stage]').forEach(b => b.onclick = () => { current.stage=Number(b.dataset.lockedStage);current.step=0;renderStep(root,cat,course); });
    root.querySelectorAll('[data-tier]').forEach(b => b.onclick = () => render(root, id, { tier: b.dataset.tier, keep: true }));
    root.querySelector('#askStep').onclick = () => window.HT.tutor.open(cat);
    if (current.tier === 'intern') { renderIntern(root.querySelector('#internArea'), cat); return; }
    root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { const [si, i] = b.dataset.go.split(':').map(Number); current.stage = si; current.step = i; renderStep(root, cat, course); root.querySelectorAll('[data-go]').forEach(x => x.classList.toggle('active', x === b)); });
    renderStep(root, cat, course);
  }
  function renderIntern(area, cat) {
    const sims = ['workbench', ...internSim(cat.department)];
    const labels = { workbench: zh() ? '師徒動手工作台' : 'Mentor-led workbench', clinic: t('tcmClinic'), pulse: t('pulseTrainer'), tongue: t('tongueTrainer'), locator: zh() ? '穴位定位訓練' : 'Acupoint locator', bp: zh() ? '血壓測量' : 'Blood pressure', glucose: zh() ? '血糖' : 'Glucose', vitals: t('vitals'), ecg: zh() ? '心電圖判讀' : 'ECG rhythms', labs: zh() ? '檢驗判讀' : 'Lab panels', soap: zh() ? '臨床病例 SOAP' : 'SOAP case' };
    area.innerHTML = `<div class="notice">${zh() ? '實習級：面對虛擬病人實作本科相關技能。免費試學含第一個模擬器；其餘需通行證。' : 'Internship tier: practise this department’s skills on virtual patients. The first simulator is free; the rest need a pass.'}</div><div class="tier-tabs" id="simTabs">${sims.map((s, i) => `<button class="${i === 0 ? 'active' : ''}" data-sim="${s}">${labels[s]}</button>`).join('')}</div><div id="simArea"></div>`;
    const mount = s => { if (current.cleanup) { current.cleanup(); current.cleanup = null; } const box = area.querySelector('#simArea'); const idx = sims.indexOf(s); if (idx > 0 && !window.HT.membership.hasAccess(null, 1)) { box.innerHTML = lockMarkup(); return; } if(s === 'workbench'){ const run = spec => { if (!box.isConnected && box.isConnected !== undefined) return; current.cleanup=window.HT.workbench.mount(box,{spec: spec || undefined, department:cat.department,course:cat}); }; if (window.HT.procedures && window.HT.procedures.caseForCourse) window.HT.procedures.caseForCourse(cat).then(run).catch(() => run(null)); else run(null); return; } const fn = ({ clinic: window.HT.internTcm.clinic, pulse: window.HT.internTcm.pulseTrainer, tongue: window.HT.internTcm.tongueTrainer, locator: window.HT.internTcm.locator, bp: window.HT.internWestern.bpStation, glucose: window.HT.internWestern.glucoseStation, vitals: window.HT.internWestern.vitalsStation, ecg: window.HT.internWestern.ecgStation, labs: window.HT.internWestern.labStation, soap: window.HT.internWestern.soapStation })[s]; const r = fn(box); if (typeof r === 'function') current.cleanup = r; };
    area.querySelectorAll('[data-sim]').forEach(b => b.onclick = () => { area.querySelectorAll('[data-sim]').forEach(x => x.classList.toggle('active', x === b)); mount(b.dataset.sim); });
    if (sims.includes('locator')) window.HT.tcmLibrary.ensure().then(() => mount(sims[0])); else mount(sims[0]);
  }
  function lockMarkup() { return `<div class="lock-overlay"><div style="font-size:2rem">🔒</div><h3>${t('locked')}</h3><p class="muted">${t('lockedDesc')}</p><a class="button primary" href="#membership">${t('unlock')}</a></div>`; }
  function renderStep(root, cat, course) {
    const view = root.querySelector('#stepView'); if (!view) return;
    if(current.cleanup){current.cleanup();current.cleanup=null;}
    window.HT.voice.stop();
    const si = current.stage, st = course.stages[si];
    if (!st) { current.stage=0;current.step=0;return renderStep(root,cat,course); }
    if (st.locked || !window.HT.membership.hasAccess(course, si)) { view.innerHTML = `<span class="eyebrow">${esc(pk(st, 'title'))}</span>${lockMarkup()}`; return; }
    const s = (st.steps || [])[current.step];
    if(!s){view.innerHTML=lockMarkup();return;}
    const progress = window.HT.account.progress.get(cat.id); let done = progress.completed.includes(s.id), practicePassed=false, quizPassed=false;
    const flat = course.stages.flatMap((x, a) => (x.steps || []).map((y, b) => [a, b])); const pos = flat.findIndex(([a, b]) => a === si && b === current.step);
    const block = (cls, label, text) => `<div class="block ${cls}"><h4>${label}</h4><p style="margin:0">${esc(text)}</p></div>`;
    const mapped = window.HT.workbench.mappedCase(cat.department,cat.id), fallbackSpec=window.HT.workbench.CASES.find(c=>c.id===mapped);
    view.innerHTML = `<span class="eyebrow">${esc(pk(st, 'title'))} · ${t('step')} ${si + 1}.${current.step + 1}</span><h2>${esc(pk(s, 'title'))}</h2>
      <p class="small muted">${zh() ? '本步搭配本科程序庫中最相關的多站工序（或已編寫的安全個案）實作；完整程序庫見「科別程序庫」。' : 'This step practises the most relevant multi-station workflow from this department’s procedure library (or an authored safety case); see the department library for the full set.'} <a href="#procedures?department=${esc(cat.department)}">${t('departmentLibrary')} →</a></p>
      <div id="courseWorkbench"></div>
      <div class="notice" id="completionGate" aria-live="polite"></div>
      <details class="card panel" style="margin-top:16px"><summary><b>${zh() ? '本課技術解說、學習目標與知識點' : 'Lesson explanation, objectives and knowledge'}</b></summary><div class="row" style="margin:12px 0"><button class="button small" id="narrate">${t('narrate')}</button><button class="button light small" id="stopNarrate">${t('stop')}</button></div>
      ${block('objective', '🎯 ' + t('objective'), pk(s, 'objective'))}${block('instruction', '🛠 ' + t('instruction'), pk(s, 'instruction'))}${block('observation', '👁 ' + t('observation'), pk(s, 'observation'))}${block('failure', '⚠ ' + t('failure'), pk(s, 'failure'))}${block('check', '✅ ' + t('check'), pk(s, 'check'))}
      <h3 style="margin-top:16px">${t('knowledge')}</h3><div class="knowledge">${(s.knowledge || []).map(k => `<div class="k"><b>${esc(pk(k, 'title'))}</b>${esc(pk(k, 'text'))}</div>`).join('')}</div></details>
      <h3 style="margin-top:16px">${t('quiz')}</h3><div class="quiz" id="quiz"><p>${esc(pk(s.quiz, 'question'))}</p>${(zh() ? s.quiz.options : s.quiz.optionsEn).map((o, i) => `<label class="opt"><input type="radio" name="q" value="${i}" style="width:auto">${esc(o)}</label>`).join('')}<button class="button small" id="quizSubmit">${t('submit')}</button><p id="quizResult" style="margin-top:8px"></p></div>
      <div class="row" style="margin-top:18px;justify-content:space-between"><button class="button light" id="prevStep" ${pos <= 0 ? 'disabled' : ''}>← ${t('prev')}</button><button class="button primary" id="nextStep">${t('next')} →</button></div>`;
    const gate=async()=>{const n=view.querySelector('#completionGate');if(!n)return;if(practicePassed&&quizPassed){n.textContent=zh()?'✓ 主畫面實作與本課驗收均已通過，完成紀錄已保存。':'✓ Workspace practice and lesson check passed; the completion record is saved.';if(!done){done=true;await window.HT.account.progress.markDone(cat.id,s.id,true);}}else{n.textContent=zh()?`待完成：${practicePassed?'':'師徒主畫面實作'}${!practicePassed&&!quizPassed?'、':''}${quizPassed?'':'本課驗收題'}。`:`Pending: ${practicePassed?'':'workspace practice'}${!practicePassed&&!quizPassed?' and ':''}${quizPassed?'':'lesson check'}.`;}};
    const token = {}; current.benchToken = token;
    const mountBench = spec => { if (current.benchToken !== token || !view.isConnected) return; if (current.cleanup) { current.cleanup(); current.cleanup = null; } const box = view.querySelector('#courseWorkbench'); if (!box) return; current.cleanup=window.HT.workbench.mount(box,{spec:spec && spec.stages && spec.stages.length ? spec : undefined,caseId:mapped,department:cat.department,course:cat,storageId:cat.id+':'+s.id,stageIndex:Math.max(0,pos)%((spec && spec.stages && spec.stages.length) || fallbackSpec.stages.length),singleStage:true,hideSelector:true,onComplete:()=>{practicePassed=true;gate();}}); };
    if (window.HT.procedures && window.HT.procedures.caseForCourse) window.HT.procedures.caseForCourse(cat).then(c => mountBench(c || fallbackSpec)).catch(() => mountBench(fallbackSpec)); else mountBench(fallbackSpec);
    gate();
    view.querySelector('#narrate').onclick = () => window.HT.voice.speak(narration(s), window.HT.prefs.speechOptions());
    view.querySelector('#stopNarrate').onclick = () => window.HT.voice.stop();
    view.querySelector('#quizSubmit').onclick = () => { const r = view.querySelector('input[name=q]:checked'); if (!r) return; const ok = Number(r.value) === s.quiz.answer; quizPassed=ok;view.querySelectorAll('.opt').forEach((o, i) => { o.classList.toggle('correct', i === s.quiz.answer); o.classList.toggle('wrong', i === Number(r.value) && !ok); }); view.querySelector('#quizResult').innerHTML = `<b>${ok ? t('correct') : t('incorrect')}</b> ${esc(pk(s.quiz, 'explanation'))}`;gate(); };
    const go = d => { const target=flat[pos+d];if(!target)return;const [a,b]=target;current.stage=a;current.step=b;render(root,cat.id,{keep:true,tier:'basic'});view.scrollIntoView({behavior:'smooth',block:'start'}); };
    view.querySelector('#prevStep').onclick=()=>go(-1);
    view.querySelector('#nextStep').onclick=()=>{if(!practicePassed||!quizPassed){gate();view.querySelector('#completionGate').scrollIntoView({behavior:'smooth',block:'center'});return;}if(pos<flat.length-1)go(1);else if(course.stages.some(x=>x.locked)){location.hash='#membership';}else{window.HT.app.toast(zh()?'已完成本課目前可用的工序。':'All currently available steps in this course are complete.');}};
  }
  window.HT = window.HT || {};
  window.HT.coursePlayer = { render, loadCourse, contextText, internSim, get current() { return current; } };
})(window);
