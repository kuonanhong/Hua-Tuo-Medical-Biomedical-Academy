/* Pharmacy lab (v3.3): learn to compose a Chinese herbal formula or a Western drug regimen from
   zero, by trial and error. The learner picks a scenario (pattern or clinical case), fills a tray,
   and the lab grades it: 君臣佐使 structure, 十八反／十九畏, pregnancy and toxicity rules, hot/cold
   mismatch, essential components missing, wrong choices with their consequences, drug–drug and
   herb–drug interactions, patient-specific cautions — then shows several recommended combinations
   with the reasoning. Education only: no doses, no preparation steps, no individual prescribing. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = k => window.HT.i18n.t(k);
  const zh = () => window.HT.i18n.isZh();
  const say = (z, e) => zh() ? z : e;
  const bi = (o, k) => o ? (zh() ? (o[k] ?? o[k + 'En'] ?? '') : (o[k + 'En'] ?? o[k] ?? '')) : '';
  let LAB = null, TCM = null, HERBS = [], DRUGS = [], currentContext = null;

  async function ensure() {
    if (!window.HT_TCM) await window.HT.loadScript('data/tcm-library.js');
    TCM = window.HT_TCM;
    if (!LAB) {
      try { LAB = location.protocol === 'file:' ? null : await window.HT.loadJson('data/pharmacy-lab.json'); } catch (e) { LAB = null; }
      if (!LAB) { try { await window.HT.loadScript('data/pharmacy-lab.js'); LAB = window.HT_PHARMACY_LAB || null; } catch (e) { LAB = null; } }
    }
    HERBS = TCM.herbs.map(h => Object.assign({}, h)).concat(((LAB && LAB.extraHerbs) || []).filter(x => !TCM.herbs.some(h => h.zh === x.zh)).map(x => Object.assign({ cat: 'extra' }, x)));
    DRUGS = (LAB && LAB.western && LAB.western.drugs) || [];
    return !!LAB;
  }
  const herbByName = name => HERBS.find(h => h.zh === name);
  const drugById = id => DRUGS.find(d => d.id === id);
  const drugName = d => d ? (zh() ? `${d.zh}（${d.en}）` : d.en) : '';
  const SEV = { contraindicated: 3, major: 2, moderate: 1, minor: 0, monitor: 0 };

  // ---------------------------------------------------------------- herb evaluation
  function herbAliases() {
    const map = {};
    const inc = LAB.herbs.incompatibilities || {};
    (inc.eighteenAntagonisms || []).forEach(g => { if (Array.isArray(g.aliases)) g.aliases.forEach(a => { map[a] = g.a; }); else if (g.aliases && typeof g.aliases === 'object') Object.entries(g.aliases).forEach(([k, v]) => (Array.isArray(v) ? v : [v]).forEach(a => { map[a] = k; })); });
    return map;
  }
  function canonical(name, aliases) { return aliases[name] || name; }
  function evaluateHerbs(scenario, tray, flags, drugs) {
    const inc = LAB.herbs.incompatibilities || {}, preg = LAB.herbs.pregnancy || {}, tox = LAB.herbs.toxic || {};
    const aliases = herbAliases();
    const names = [...tray];
    const canon = names.map(n => canonical(n, aliases));
    const findings = [];
    // 十八反
    (inc.eighteenAntagonisms || []).forEach(g => {
      const hasA = canon.includes(g.a) || names.includes(g.a);
      if (!hasA) return;
      (g.b || []).forEach(b => { if (canon.includes(canonical(b, aliases)) || names.includes(b)) findings.push({ kind: 'incompatible', severity: 'contraindicated', herbs: [g.a, b], zh: `十八反：${g.a} 反 ${b}。${inc.note || ''}`, en: `Eighteen antagonisms: ${g.a} with ${b}. ${inc.noteEn || ''}` }); });
    });
    // 十九畏
    (inc.nineteenIncompatibilities || []).forEach(pair => { if (pair.every(x => canon.includes(canonical(x, aliases)) || names.includes(x))) findings.push({ kind: 'incompatible', severity: 'major', herbs: pair, zh: `十九畏：${pair[0]} 畏 ${pair[1]}。`, en: `Nineteen incompatibilities: ${pair[0]} with ${pair[1]}.` }); });
    // pregnancy
    if (flags.has('pregnancy')) {
      names.forEach(n => { if ((preg.forbidden || []).includes(n)) findings.push({ kind: 'pregnancy', severity: 'contraindicated', herbs: [n], zh: `${n}：妊娠禁用（峻下、破血、劇毒或動胎）。`, en: `${n}: contraindicated in pregnancy (purgative, blood-breaking, toxic or uterotonic).` }); else if ((preg.caution || []).includes(n)) findings.push({ kind: 'pregnancy', severity: 'moderate', herbs: [n], zh: `${n}：妊娠慎用。`, en: `${n}: use with caution in pregnancy.` }); });
    }
    // toxicity
    names.forEach(n => {
      const note = tox.notes && tox.notes[n];
      if ((tox['強毒'] || tox.strong || []).includes(n)) findings.push({ kind: 'toxic', severity: 'major', herbs: [n], zh: `${n}：大毒／強毒藥材，教學上只辨識，不配伍。${note ? bi(note, 'zh') : ''}`, en: `${n}: highly toxic; recognised in teaching only, not composed. ${note ? bi(note, 'zh') : ''}` });
      else if ((tox['有毒'] || tox.toxic || []).includes(n)) findings.push({ kind: 'toxic', severity: 'moderate', herbs: [n], zh: `${n}：有毒，須炮製、專業監督與劑量控制。${note ? bi(note, 'zh') : ''}`, en: `${n}: toxic; requires processing, supervision and dose control. ${note ? bi(note, 'zh') : ''}` });
    });
    // herb–drug
    (LAB.herbs.herbDrugInteractions || []).forEach(x => {
      if (!names.includes(x.herb) && !canon.includes(canonical(x.herb, aliases))) return;
      const hit = (x.drugs || []).filter(d => drugs.has(d) || [...drugs].some(id => { const dd = drugById(id); return dd && (dd.class === d || (dd.tags || []).includes(d)); }));
      if (hit.length) findings.push({ kind: 'herb-drug', severity: x.severity || 'moderate', herbs: [x.herb], drugs: hit, zh: `${x.herb} × ${hit.map(id => drugName(drugById(id)) || id).join('、')}：${x.zh}`, en: `${x.herb} × ${hit.map(id => drugName(drugById(id)) || id).join(', ')}: ${x.en}` });
    });
    // scenario fit
    const items = [], missing = [];
    if (scenario) {
      const essential = scenario.essential || [];
      essential.forEach(group => { const alts = group.split('|'); if (!alts.some(a => names.includes(a) || canon.includes(canonical(a, aliases)))) missing.push(alts); });
      const recommendedHerbs = new Set((scenario.recommended || []).flatMap(r => r.herbs || []));
      const acceptable = new Set(scenario.acceptable || []);
      const roles = {}; (scenario.recommended || []).forEach(r => Object.entries(r.roles || {}).forEach(([h, role]) => { roles[h] = roles[h] || role; }));
      names.forEach(n => {
        const wg = (scenario.wrong || []).find(g => (g.herbs || []).includes(n));
        let status, why;
        if (recommendedHerbs.has(n)) { status = 'correct'; why = roles[n] ? say(`${roles[n]}藥。`, `Role: ${roles[n]}. `) : ''; const h = herbByName(n); if (h) why += say(h.act_zh || '', h.act_en || ''); }
        else if (acceptable.has(n)) { status = 'acceptable'; why = say('可依兼症加減。', 'Acceptable addition according to accompanying signs.'); }
        else if (wg) { status = 'wrong'; why = bi(wg, 'zh'); }
        else { status = 'neutral'; const h = herbByName(n); why = say('本證推薦方中未列此藥；核對其性味歸經是否符合治則。', 'Not in the recommended formulas for this pattern; check whether its nature and channels fit the principle.') + (h ? ' ' + say(h.act_zh || '', h.act_en || '') : ''); }
        items.push({ name: n, status, why });
      });
      // hot/cold mismatch
      const bal = scenario.balance || {};
      const avoid = (bal.avoidNature || []).filter(Boolean), prefer = (bal.preferNature || []).filter(Boolean);
      let avoidCount = 0, preferCount = 0;
      names.forEach(n => { const h = herbByName(n); const nat = (h && h.nature) || ''; if (avoid.some(k => nat.includes(k))) avoidCount++; if (prefer.some(k => nat.includes(k))) preferCount++; });
      if (avoid.length && avoidCount >= 2 && avoidCount >= preferCount) findings.push({ kind: 'balance', severity: 'major', herbs: names.filter(n => { const h = herbByName(n); return h && avoid.some(k => (h.nature || '').includes(k)); }), zh: `寒熱偏性與證不符：本證宜${prefer.join('／') || '—'}，配伍中有 ${avoidCount} 味性${avoid.join('／')}之藥，恐遏邪或傷正。`, en: `Hot/cold mismatch: this pattern prefers ${prefer.join('/') || '—'} natures, yet ${avoidCount} herbs are ${avoid.join('/')}; risk of trapping the pathogen or damaging upright qi.` });
    }
    // A toxic or pregnancy-caution herb that belongs to a recommended formula for this pattern is a
    // processing / monitoring note, not a mistake (e.g. 杏仁 in 麻黃湯, 附子 in 四逆湯).
    if (scenario) {
      const recommendedHerbs = new Set((scenario.recommended || []).flatMap(r => r.herbs || []));
      findings.forEach(f => { if ((f.kind === 'toxic' || (f.kind === 'pregnancy' && f.severity !== 'contraindicated')) && (f.herbs || []).every(h => recommendedHerbs.has(h))) { f.severity = 'monitor'; f.kind = f.kind === 'toxic' ? 'processing' : f.kind; } });
    }
    const worst = findings.reduce((m, f) => Math.max(m, SEV[f.severity] ?? 1), -1);
    let score = 100;
    findings.forEach(f => { score -= f.severity === 'contraindicated' ? 35 : f.severity === 'major' ? 18 : f.severity === 'monitor' ? 0 : 8; });
    items.forEach(i => { if (i.status === 'wrong') score -= 12; if (i.status === 'neutral') score -= 3; });
    score -= 15 * missing.length;
    if (scenario) { const correct = items.filter(i => i.status === 'correct').length; if (!correct) score -= 20; }
    score = Math.max(0, Math.min(100, Math.round(score)));
    return { findings, items, missing, score, worst };
  }

  // ---------------------------------------------------------------- drug evaluation
  const flagLabelZh = f => ({ pregnancy: '孕婦', elderly: '高齡', ckd: '腎功能不全', asthma: '氣喘', hepatic: '肝功能不全', hf: '心衰竭', qt: 'QT 延長', child: '兒童', bleeding: '出血風險', hyperkalemia: '高血鉀', gout: '痛風', 'peptic-ulcer': '消化性潰瘍', depression: '憂鬱', seizure: '癲癇', dementia: '失智', parkinson: '巴金森', g6pd: 'G6PD 缺乏', myasthenia: '重症肌無力', hypertension: '高血壓' }[f] || f);
  function matches(drug, token) { return !!drug && (drug.id === token || drug.class === token || (drug.tags || []).includes(token) || (drug.classes || []).includes(token)); }
  function matchesAny(drug, expr) { return String(expr).split('|').some(tok => matches(drug, tok.trim())); }
  function evaluateDrugs(scenario, tray, flags, herbs) {
    const W = LAB.western;
    const list = [...tray].map(drugById).filter(Boolean);
    const findings = [];
    // interactions (a rule side may also name a patient context such as pregnancy|elderly|ckd|asthma)
    const CONTEXT = new Set(['pregnancy', 'elderly', 'ckd', 'asthma', 'hepatic', 'hf', 'qt', 'child', 'bleeding', 'hyperkalemia', 'gout', 'peptic-ulcer', 'depression', 'seizure', 'dementia', 'parkinson', 'g6pd', 'myasthenia', 'hypertension']);
    (W.classInteractions || []).forEach(rule => {
      const sides = [String(rule.a), String(rule.b)];
      const ctxSide = sides.findIndex(x => x.split('|').some(tok => CONTEXT.has(tok.trim())));
      if (ctxSide >= 0) {
        const ctxTokens = sides[ctxSide].split('|').map(x => x.trim()).filter(tok => CONTEXT.has(tok));
        if (!ctxTokens.some(tok => flags.has(tok))) return;
        const other = sides[1 - ctxSide];
        list.forEach(d => { if (matchesAny(d, other) && !findings.some(f => f.kind === 'patient' && f.rule === rule && f.drugs[0] === d.id)) findings.push({ kind: 'patient', rule, severity: rule.severity || 'moderate', drugs: [d.id], zh: `${drugName(d)}（${ctxTokens.map(flagLabelZh).join('／')}）：${rule.zh}`, en: `${d.en} (${ctxTokens.join('/')}): ${rule.en}` }); });
        return;
      }
      for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const a = list[i], b = list[j];
        if (matchesAny(a, rule.a) && matchesAny(b, rule.b) && !(rule.a === rule.b && j < i)) {
          if (findings.some(f => f.kind === 'interaction' && f.rule === rule && f.drugs.includes(a.id) && f.drugs.includes(b.id))) continue;
          findings.push({ kind: 'interaction', rule, severity: rule.severity || 'moderate', drugs: [a.id, b.id], zh: `${drugName(a)} × ${drugName(b)}：${rule.zh}`, en: `${a.en} × ${b.en}: ${rule.en}` });
        }
      }
    });
    // duplicates
    (W.duplicateClasses || []).forEach(cls => { const dup = list.filter(d => matches(d, cls)); if (dup.length > 1) findings.push({ kind: 'duplicate', severity: 'major', drugs: dup.map(d => d.id), zh: `同類重複：${dup.map(drugName).join('、')} 同屬 ${cls}，療效不相加而不良反應相加。`, en: `Therapeutic duplication: ${dup.map(d => d.en).join(', ')} are all ${cls}; no added benefit, additive adverse effects.` }); });
    // patient flags vs drugs
    const FLAG_RULES = [
      ['pregnancy', 'teratogenic', 'contraindicated', '妊娠禁用（致畸／胎兒毒性）', 'contraindicated in pregnancy (teratogenic / fetotoxic)'],
      ['ckd', 'nephrotoxic', 'major', '腎功能不全：腎毒性藥物加速腎損傷', 'renal impairment: nephrotoxic drug accelerates kidney injury'],
      ['ckd', 'renal-dose', 'moderate', '腎功能不全：需依 eGFR 調整或避免（教學不給劑量）', 'renal impairment: adjust or avoid according to eGFR (no doses given here)'],
      ['hepatic', 'hepatotoxic', 'major', '肝功能不全：肝毒性藥物', 'hepatic impairment: hepatotoxic drug'],
      ['elderly', 'fall-risk', 'major', '高齡：跌倒／鎮靜風險（Beers 準則）', 'older adult: fall / sedation risk (Beers criteria)'],
      ['elderly', 'anticholinergic', 'major', '高齡：抗膽鹼負荷，譫妄、尿滯留、便秘', 'older adult: anticholinergic burden — delirium, retention, constipation'],
      ['qt', 'qt-prolonging', 'major', 'QT 延長病史：加重 QT 延長、尖端扭轉', 'QT prolongation history: further QT prolongation, torsades'],
      ['asthma', 'beta-blocker-nonselective', 'contraindicated', '氣喘：非選擇性 β 阻斷劑誘發支氣管痙攣', 'asthma: non-selective beta-blocker provokes bronchospasm'],
      ['asthma', 'nsaid', 'moderate', '氣喘：NSAID 可誘發氣喘（AERD）', 'asthma: NSAIDs may trigger asthma (AERD)'],
      ['bleeding', 'bleeding-risk', 'major', '出血風險：加重出血', 'bleeding risk: increased bleeding'],
      ['hyperkalemia', 'hyperkalemia', 'major', '高血鉀傾向：進一步升高血鉀', 'hyperkalaemia tendency: further potassium rise'],
      ['gout', 'thiazide', 'moderate', '痛風：噻嗪類利尿劑升高尿酸', 'gout: thiazide raises urate'],
      ['hf', 'negative-inotrope', 'major', '心衰竭：負性肌力藥物惡化心衰', 'heart failure: negative inotrope worsens failure'],
      ['hf', 'fluid-retention', 'major', '心衰竭：水鈉滯留誘發失代償', 'heart failure: fluid retention precipitates decompensation'],
      ['peptic-ulcer', 'nsaid', 'major', '消化性潰瘍：NSAID 出血／穿孔', 'peptic ulcer: NSAID bleeding / perforation'],
      ['depression', 'depressogenic', 'moderate', '憂鬱病史：可能加重情緒症狀', 'depression history: may worsen mood'],
      ['seizure', 'lowers-seizure-threshold', 'major', '癲癇：降低癲癇閾值', 'epilepsy: lowers seizure threshold'],
      ['dementia', 'anticholinergic', 'major', '失智：抗膽鹼藥惡化認知', 'dementia: anticholinergic worsens cognition'],
      ['parkinson', 'dopamine-antagonist', 'contraindicated', '巴金森病：多巴胺拮抗劑加重運動症狀、抵消左旋多巴', 'Parkinson disease: dopamine antagonist worsens motor symptoms and blocks levodopa'],
      ['g6pd', 'g6pd-hemolysis', 'contraindicated', 'G6PD 缺乏：溶血', 'G6PD deficiency: haemolysis'],
      ['myasthenia', 'neuromuscular-blocking', 'major', '重症肌無力：加重無力', 'myasthenia: worsens weakness'],
      ['child', 'avoid-children', 'contraindicated', '兒童禁用', 'contraindicated in children'],
      ['sulfa-allergy', 'sulfonamide', 'contraindicated', '磺胺過敏', 'sulfonamide allergy'],
      ['penicillin-allergy', 'penicillin', 'contraindicated', '青黴素過敏（嚴重者亦慎用頭孢）', 'penicillin allergy (caution with cephalosporins if severe)'],
    ];
    FLAG_RULES.forEach(([flag, tag, sev, z, e]) => { if (!flags.has(flag)) return; list.forEach(d => { if (matches(d, tag)) findings.push({ kind: 'patient', severity: sev, drugs: [d.id], zh: `${drugName(d)}：${z}。`, en: `${d.en}: ${e}.` }); }); });
    // explicit contraindication text match for flags
    list.forEach(d => { (d.contra || []).forEach((c, i) => { const ce = (d.contraEn || [])[i] || c; const hit = [...flags].some(f => ({ pregnancy: /妊娠|懷孕|pregnan/i, ckd: /eGFR|腎|renal|kidney/i, hepatic: /肝|hepatic|liver/i, asthma: /氣喘|asthma/i, hf: /心衰|heart failure/i, gout: /痛風|gout/i, elderly: /高齡|elderly|older/i, child: /兒童|child/i, qt: /QT/i, depression: /憂鬱|depress/i, seizure: /癲癇|seizure|epilep/i, bleeding: /出血|bleed/i, hyperkalemia: /高血鉀|hyperkal/i, parkinson: /巴金森|帕金森|parkinson/i }[f] || /$^/).test(c + ' ' + ce)); if (hit && !findings.some(f => f.kind === 'patient' && f.drugs[0] === d.id)) findings.push({ kind: 'patient', severity: 'major', drugs: [d.id], zh: `${drugName(d)}：禁忌／注意 — ${c}`, en: `${d.en}: contraindication / caution — ${ce}` }); }); });
    // herb traps (herbs added alongside)
    (LAB.herbs.herbDrugInteractions || []).forEach(x => {
      if (!herbs.has(x.herb)) return;
      const hit = list.filter(d => (x.drugs || []).some(tok => matches(d, tok)));
      if (hit.length) findings.push({ kind: 'herb-drug', severity: x.severity || 'moderate', herbs: [x.herb], drugs: hit.map(d => d.id), zh: `${x.herb} × ${hit.map(drugName).join('、')}：${x.zh}`, en: `${x.herb} × ${hit.map(d => d.en).join(', ')}: ${x.en}` });
    });
    // scenario fit
    const items = [], missing = [];
    if (scenario) {
      (scenario.essential || []).forEach(group => { if (!list.some(d => matchesAny(d, group))) missing.push(group.split('|')); });
      const rec = new Set((scenario.recommended || []).flatMap(r => r.regimen || []));
      const acceptable = scenario.acceptable || [];
      list.forEach(d => {
        const wg = (scenario.wrong || []).find(g => { const ids = g.items || g.drugs || []; const hit = ids.some(tok => matches(d, tok)); if (!hit) return false; if (g.together) return ids.every(tok => list.some(x => matches(x, tok))); return true; });
        let status, why;
        if (rec.has(d.id) || (scenario.essential || []).some(g => matchesAny(d, g))) { status = 'correct'; why = bi(d, 'mechanism'); }
        else if (acceptable.some(tok => matches(d, tok))) { status = 'acceptable'; why = say('可依症狀加入的輔助治療。', 'Acceptable adjunct according to symptoms.'); }
        else if (wg) { status = 'wrong'; why = bi(wg, 'zh'); }
        else { status = 'neutral'; why = say('本情境未列此藥；核對適應症與交互作用。', 'Not listed for this scenario; check indication and interactions.') + ' ' + bi(d, 'mechanism'); }
        items.push({ id: d.id, name: drugName(d), status, why });
      });
      (scenario.herbTraps || []).forEach(tr => { if (herbs.has(tr.herb) && !findings.some(f => f.kind === 'herb-drug' && f.herbs && f.herbs[0] === tr.herb)) findings.push({ kind: 'herb-drug', severity: 'major', herbs: [tr.herb], drugs: [], zh: `${tr.herb}：${tr.zh}`, en: `${tr.herb}: ${tr.en}` }); });
    }
    // An interaction between two drugs that a recommended regimen for this scenario deliberately combines
    // (e.g. ARNI + MRA in HFrEF) is a monitoring requirement, not an error.
    if (scenario) {
      const regimens = (scenario.recommended || []).map(r => new Set(r.regimen || []));
      findings.forEach(f => { if (f.kind === 'interaction' && f.severity !== 'contraindicated' && regimens.some(set => f.drugs.every(id => set.has(id)))) { f.kind = 'monitor'; f.severity = 'monitor'; } });
    }
    let score = 100;
    findings.forEach(f => { score -= f.severity === 'contraindicated' ? 35 : f.severity === 'major' ? 18 : f.severity === 'monitor' ? 0 : 8; });
    items.forEach(i => { if (i.status === 'wrong') score -= 12; if (i.status === 'neutral') score -= 3; });
    score -= 15 * missing.length;
    score = Math.max(0, Math.min(100, Math.round(score)));
    return { findings, items, missing, score };
  }

  // ---------------------------------------------------------------- page
  async function render(root, params) {
    const ok = await ensure();
    const st = { tab: params.get('tab') === 'drug' ? 'drug' : 'herb', herbScenario: params.get('scenario') || '', drugScenario: '', herbTray: new Set(), drugTray: new Set(), extraDrugs: new Set(), extraHerbs: new Set(), flags: new Set(), q: '', cat: '', result: null };
    if (st.tab === 'drug' && params.get('scenario')) st.drugScenario = params.get('scenario');
    currentContext = { id: 'pharmacy-lab', title: '配伍實驗室', titleEn: 'Pharmacy lab', summary: '中草藥配伍與西藥處方組合的試錯教學：十八反十九畏、妊娠與毒性、君臣佐使、藥物交互作用與禁忌；不提供劑量。', summaryEn: 'Trial-and-error teaching for herbal formulas and Western regimens: incompatibilities, pregnancy and toxicity rules, formula roles, drug interactions and contraindications; no doses.' };
    root.innerHTML = `<div class="section-head"><div><span class="eyebrow">PHARMACY LAB · HERBAL FORMULAS & WESTERN REGIMENS</span><h1>${t('navPharmacy')}</h1><p class="subtext">${say('從零開始學配伍：先選一個證型或臨床情境，把藥放進配伍盤，按「評估配伍」。實驗室會指出十八反十九畏、妊娠與毒性禁忌、寒熱偏性不符、缺少的君臣藥、西藥交互作用與病人禁忌，說明「亂配會發生什麼」，並給多組推薦組合與藥性說明。', 'Learn to compose from zero: pick a pattern or clinical scenario, put medicines in the tray and press Evaluate. The lab flags incompatibilities, pregnancy and toxicity rules, hot/cold mismatch, missing chief/deputy herbs, drug interactions and patient-specific contraindications — explaining what goes wrong — and shows several recommended combinations with their rationale.')}</p></div></div>
      ${ok ? '' : `<div class="notice danger">${say('配伍教學資料（pharmacy-lab.json）尚未載入；請執行 bash rebuild-curriculum.sh 後重新整理。', 'Pharmacy data (pharmacy-lab.json) is not available yet; run bash rebuild-curriculum.sh and reload.')}</div>`}
      <div class="tier-tabs"><button data-ptab="herb" class="${st.tab === 'herb' ? 'active' : ''}">${t('herbTab')}</button><button data-ptab="drug" class="${st.tab === 'drug' ? 'active' : ''}">${t('drugTab')}</button></div>
      <div id="phBody" class="ph-body"></div>
      <p class="form-note">${say('本實驗室為本草與藥理教育，不提供劑量、煎煮炮製或個人處方；真實用藥須由醫師、中醫師與藥師評估。', 'This lab is materia-medica and pharmacology education; no doses, preparation or individual prescriptions are given. Real medication decisions belong to physicians, TCM practitioners and pharmacists.')}</p>`;
    root.querySelectorAll('[data-ptab]').forEach(b => b.onclick = () => { st.tab = b.dataset.ptab; st.result = null; st.q = ''; st.cat = ''; draw(); });
    const body = root.querySelector('#phBody');
    const FLAGS = [['pregnancy', '孕婦', 'Pregnancy'], ['elderly', '高齡', 'Older adult'], ['child', '兒童', 'Child'], ['ckd', '腎功能不全', 'CKD'], ['hepatic', '肝功能不全', 'Hepatic impairment'], ['asthma', '氣喘', 'Asthma'], ['hf', '心衰竭', 'Heart failure'], ['qt', 'QT 延長', 'QT prolongation'], ['bleeding', '出血風險', 'Bleeding risk'], ['hyperkalemia', '高血鉀傾向', 'Hyperkalaemia'], ['gout', '痛風', 'Gout'], ['peptic-ulcer', '消化性潰瘍', 'Peptic ulcer'], ['depression', '憂鬱', 'Depression'], ['seizure', '癲癇', 'Epilepsy'], ['dementia', '失智', 'Dementia'], ['parkinson', '巴金森', 'Parkinson'], ['g6pd', 'G6PD 缺乏', 'G6PD deficiency'], ['hypertension', '高血壓', 'Hypertension']];
    const flagLabel = f => { const x = FLAGS.find(y => y[0] === f); return x ? say(x[1], x[2]) : f; };
    const sevLabel = s => ({ contraindicated: say('禁忌', 'Contraindicated'), major: say('重大', 'Major'), moderate: say('中度', 'Moderate'), minor: say('輕微', 'Minor'), monitor: say('需監測', 'Monitor') }[s] || s);
    const statusLabel = s => ({ correct: t('correctLabel'), acceptable: t('acceptable'), wrong: t('notAdvisable'), neutral: say('未列', 'Not listed') }[s] || s);
    function flagsBar(scenario) {
      const auto = new Set((scenario && scenario.patientFlags) || []);
      return `<div class="ph-flags"><b>${say('病人條件', 'Patient conditions')}</b> ${FLAGS.map(([id, z, e]) => `<label class="chip ${st.flags.has(id) || auto.has(id) ? 'active' : ''} ${auto.has(id) ? 'auto' : ''}"><input type="checkbox" data-flag="${id}" ${st.flags.has(id) || auto.has(id) ? 'checked' : ''} ${auto.has(id) ? 'disabled' : ''}>${say(z, e)}</label>`).join('')}</div>`;
    }
    function findingsHtml(r) {
      return `<div class="ph-result"><div class="ph-score"><b>${t('score')} ${r.score}</b><span>${r.findings.length} ${say('項安全提醒', 'safety findings')} · ${r.missing.length} ${t('missing')}</span></div>
        ${r.findings.length ? `<ul class="ph-findings">${r.findings.sort((a, b) => (SEV[b.severity] ?? 1) - (SEV[a.severity] ?? 1)).map(f => `<li class="sev-${f.severity}"><span class="tag">${sevLabel(f.severity)} · ${{ incompatible: say('配伍禁忌', 'Incompatibility'), pregnancy: say('妊娠', 'Pregnancy'), toxic: say('毒性', 'Toxicity'), 'herb-drug': say('中西藥交互', 'Herb–drug'), balance: say('寒熱偏性', 'Hot/cold'), interaction: say('交互作用', 'Interaction'), duplicate: say('重複用藥', 'Duplication'), patient: say('病人禁忌', 'Patient-specific'), monitor: say('推薦組合內的已知交互：監測即可', 'Known interaction inside a recommended regimen: monitor'), processing: say('炮製與監督', 'Processing & supervision') }[f.kind] || f.kind}</span><p>${esc(bi(f, 'zh'))}</p></li>`).join('')}</ul>` : `<p class="ph-ok">✓ ${say('沒有配伍禁忌、交互作用或病人禁忌。', 'No incompatibilities, interactions or patient-specific contraindications.')}</p>`}
        ${r.items.length ? `<ul class="ph-items">${r.items.map(i => `<li class="s-${i.status}"><b>${esc(i.name)}</b> <span class="tag">${statusLabel(i.status)}</span><p>${esc(i.why || '')}</p></li>`).join('')}</ul>` : ''}
        ${r.missing.length ? `<div class="notice warn"><b>${t('missing')}</b> ${r.missing.map(alts => alts.map(a => `<span class="chip small">${esc(a)}</span>`).join(say(' 或 ', ' or '))).join('；')}</div>` : ''}
        <p class="small muted">${r.score >= 85 ? say('配伍合理：結構完整、無禁忌。比較下方推薦組合，理解每味／每藥的角色。', 'Sound combination: complete structure, no contraindications. Compare with the recommended sets to understand each component’s role.') : r.findings.some(f => f.severity === 'contraindicated') ? say('先移除「禁忌」項目，理解其機轉與後果，再重新配伍。', 'Remove the contraindicated items first, understand the mechanism and consequence, then recompose.') : say('看缺少的必要成分與「不宜」的原因，對照推薦組合再試一次。', 'Look at the missing essentials and why items are inadvisable, compare with the recommended sets and try again.')}</p></div>`;
    }
    // ------- herb tab
    function drawHerb() {
      const scenarios = (LAB && LAB.herbs && LAB.herbs.scenarios) || [];
      const sc = scenarios.find(s => s.id === st.herbScenario);
      const systems = [...new Set(scenarios.map(s => bi(s, 'system')))];
      const q = st.q.trim().toLowerCase();
      const cats = TCM.herbCategories || [];
      const list = HERBS.filter(h => (!st.cat || h.cat === st.cat) && (!q || [h.zh, h.py, h.latin, h.act_zh, h.act_en, h.nature].join(' ').toLowerCase().includes(q))).slice(0, 80);
      const tray = [...st.herbTray];
      const drugsList = DRUGS.filter(d => ['warfarin', 'aspirin', 'clopidogrel', 'digoxin', 'furosemide', 'hydrochlorothiazide', 'metformin', 'insulin', 'levothyroxine', 'phenelzine', 'sertraline', 'cyclosporine', 'simvastatin', 'amiodarone', 'lithium', 'prednisolone', 'oral-contraceptive', 'levodopa-carbidopa', 'theophylline', 'propranolol'].includes(d.id));
      body.innerHTML = `<div class="ph-layout"><section class="card ph-left">
          <div class="content-controls"><label>${t('scenario')}<select id="phScenario"><option value="">${say('— 自由配伍（只檢查禁忌）', '— free composition (rules only)')}</option>${systems.map(s => `<optgroup label="${esc(s)}">${scenarios.filter(x => bi(x, 'system') === s).map(x => `<option value="${x.id}" ${x.id === st.herbScenario ? 'selected' : ''}>${esc(bi(x, 'zh'))}</option>`).join('')}</optgroup>`).join('')}</select></label></div>
          ${sc ? `<article class="ph-scenario"><h2>${esc(bi(sc, 'zh'))} <small>${esc(zh() ? sc.en : sc.zh)}</small></h2><p><b>${say('證候', 'Presentation')}</b> ${esc(bi(sc, 'presentation'))}</p><p><b>${say('治則', 'Principle')}</b> ${esc(bi(sc, 'principle'))}</p></article>` : ''}
          ${flagsBar(sc)}
          <div class="ph-tray"><b>${t('tray')}</b><div class="row" id="phTray">${tray.length ? tray.map(n => { const h = herbByName(n); return `<span class="chip ph-chip ${st.result && st.result.items.find(i => i.name === n) ? 's-' + st.result.items.find(i => i.name === n).status : ''}" title="${esc(h ? h.nature + ' · ' + h.channels : '')}">${esc(n)} <small>${esc(h ? h.nature : '')}</small><button type="button" data-untray="${esc(n)}" aria-label="remove">×</button></span>`; }).join('') : `<span class="muted small">${say('從右側藥材清單加入，或輸入名稱。', 'Add from the list on the right or type a name.')}</span>`}</div>
            <div class="row"><input id="phAdd" type="search" list="phHerbList" placeholder="${esc(say('輸入藥材名加入，例如 麻黃、桂枝', 'Type a herb name, e.g. 麻黃, 桂枝'))}"><datalist id="phHerbList">${HERBS.map(h => `<option value="${esc(h.zh)}">${esc(h.py)} · ${esc(h.nature || '')}</option>`).join('')}</datalist><button class="button primary small" id="phEval" ${tray.length ? '' : 'disabled'}>${t('evaluate')}</button><button class="button light small" id="phClear">${t('clearTray')}</button></div>
            <details class="ph-drugs"><summary>${say('病人同時服用的西藥（檢查中西藥交互作用）', 'Western medicines the patient also takes (herb–drug check)')}</summary><div class="row">${drugsList.map(d => `<label class="chip ${st.extraDrugs.has(d.id) ? 'active' : ''}"><input type="checkbox" data-xdrug="${d.id}" ${st.extraDrugs.has(d.id) ? 'checked' : ''}>${esc(drugName(d))}</label>`).join('')}</div></details></div>
          ${st.result ? findingsHtml(st.result) : ''}
          ${sc ? `<details class="ph-recs" ${st.result ? 'open' : ''}><summary><b>${t('recommendedCombos')}</b></summary>${(sc.recommended || []).map((r, i) => `<div class="ph-rec"><b>${esc(r.formula || '')}</b><p class="row">${(r.herbs || []).map(h => `<span class="chip small role-${esc((r.roles || {})[h] || '')}">${esc(h)}${(r.roles || {})[h] ? `<em>${esc((r.roles || {})[h])}</em>` : ''}</span>`).join('')}</p><p class="small">${esc(bi(r, 'why'))}</p><button class="button light small" data-apply-herb="${i}">${say('放入配伍盤', 'Load into tray')}</button></div>`).join('')}${(sc.wrong || []).length ? `<div class="ph-wrong"><b>${t('pitfall')}</b><ul>${sc.wrong.map(w => `<li><b>${(w.herbs || []).join('、')}</b>：${esc(bi(w, 'zh'))}</li>`).join('')}</ul></div>` : ''}</details>` : ''}
        </section>
        <aside class="card ph-right"><div class="content-controls"><label>${say('查藥材', 'Find a medicinal')}<input id="phSearch" type="search" value="${esc(st.q)}" placeholder="${esc(say('名稱／拼音／功效／性味', 'name / pinyin / action / nature'))}"></label><label>${t('category')}<select id="phCat"><option value="">${say('全部', 'All')}</option>${cats.map(c => `<option value="${esc(c.id)}" ${st.cat === c.id ? 'selected' : ''}>${esc(bi(c, 'zh'))}</option>`).join('')}</select></label></div>
          <div class="ph-list">${list.map(h => `<button class="point-choice ${st.herbTray.has(h.zh) ? 'active' : ''}" data-herb="${esc(h.zh)}"><b>${esc(h.zh)} <small>${esc(h.py)}</small></b><small>${esc(h.nature || '')} · ${esc(h.channels || '')}<br>${esc(zh() ? h.act_zh : h.act_en)}</small></button>`).join('') || `<p class="muted small">${t('noResults')}</p>`}</div></aside></div>`;
      bindCommon();
      body.querySelector('#phScenario').onchange = e => { st.herbScenario = e.target.value; st.result = null; st.herbTray.clear(); st.flags.clear(); draw(); };
      body.querySelectorAll('[data-herb]').forEach(b => b.onclick = () => { const n = b.dataset.herb; if (st.herbTray.has(n)) st.herbTray.delete(n); else st.herbTray.add(n); st.result = null; draw(); });
      body.querySelectorAll('[data-untray]').forEach(b => b.onclick = () => { st.herbTray.delete(b.dataset.untray); st.result = null; draw(); });
      body.querySelector('#phAdd').onchange = e => { const v = e.target.value.trim(); const h = HERBS.find(x => x.zh === v || x.py.toLowerCase() === v.toLowerCase()); if (h) { st.herbTray.add(h.zh); st.result = null; draw(); } else window.HT.app.toast(say('找不到此藥材', 'Herb not found')); };
      body.querySelector('#phEval').onclick = () => { const flags = new Set([...st.flags, ...((sc && sc.patientFlags) || [])]); st.result = evaluateHerbs(sc, st.herbTray, flags, st.extraDrugs); window.HT.app.recordSim('pharmacy-herb-' + (sc ? sc.id : 'free'), st.result.score); draw(); };
      body.querySelector('#phClear').onclick = () => { st.herbTray.clear(); st.result = null; draw(); };
      body.querySelectorAll('[data-apply-herb]').forEach(b => b.onclick = () => { const r = sc.recommended[Number(b.dataset.applyHerb)]; st.herbTray = new Set(r.herbs || []); st.result = null; draw(); });
      body.querySelectorAll('[data-xdrug]').forEach(i => i.onchange = () => { if (i.checked) st.extraDrugs.add(i.dataset.xdrug); else st.extraDrugs.delete(i.dataset.xdrug); st.result = null; draw(); });
    }
    // ------- drug tab
    function drawDrug() {
      const W = (LAB && LAB.western) || { scenarios: [], drugs: [] };
      const scenarios = W.scenarios || [];
      const sc = scenarios.find(s => s.id === st.drugScenario);
      const systems = [...new Set(scenarios.map(s => bi(s, 'system') || s.system))];
      const q = st.q.trim().toLowerCase();
      const classes = [...new Set(DRUGS.map(d => d.class))].sort();
      const list = DRUGS.filter(d => (!st.cat || d.class === st.cat || d.system === st.cat) && (!q || [d.id, d.en, d.zh, d.class, d.classZh, d.classEn, (d.uses || []).join(' '), (d.usesEn || []).join(' ')].join(' ').toLowerCase().includes(q))).slice(0, 80);
      const tray = [...st.drugTray];
      const herbChoices = ['丹參', '當歸', '甘草', '麻黃', '人參', '銀杏葉', '附子', '貫葉連翹', '黃連', '大黃', '川芎', '紅花', '何首烏', '枸杞子', '五味子'].filter(h => herbByName(h));
      body.innerHTML = `<div class="ph-layout"><section class="card ph-left">
          <div class="content-controls"><label>${t('scenario')}<select id="phScenario"><option value="">${say('— 自由組合（只檢查交互作用）', '— free regimen (interactions only)')}</option>${systems.map(s => `<optgroup label="${esc(s)}">${scenarios.filter(x => (bi(x, 'system') || x.system) === s).map(x => `<option value="${x.id}" ${x.id === st.drugScenario ? 'selected' : ''}>${esc(bi(x, 'zh'))}</option>`).join('')}</optgroup>`).join('')}</select></label></div>
          ${sc ? `<article class="ph-scenario"><h2>${esc(bi(sc, 'zh'))} <small>${esc(zh() ? sc.en : sc.zh)}</small></h2><p><b>${say('情境', 'Presentation')}</b> ${esc(bi(sc, 'presentation'))}</p><p><b>${say('治療目標', 'Goal')}</b> ${esc(bi(sc, 'goal'))}</p></article>` : ''}
          ${flagsBar(sc)}
          <div class="ph-tray"><b>${t('tray')}</b><div class="row" id="phTray">${tray.length ? tray.map(id => { const d = drugById(id); const it = st.result && st.result.items.find(i => i.id === id); return `<span class="chip ph-chip ${it ? 's-' + it.status : ''}" title="${esc(d ? bi(d, 'mechanism') : '')}">${esc(drugName(d) || id)} <small>${esc(d ? (zh() ? d.classZh || d.class : d.classEn || d.class) : '')}</small><button type="button" data-untray="${esc(id)}" aria-label="remove">×</button></span>`; }).join('') : `<span class="muted small">${say('從右側藥物清單加入，或輸入名稱。', 'Add from the list on the right or type a name.')}</span>`}</div>
            <div class="row"><input id="phAdd" type="search" list="phDrugList" placeholder="${esc(say('輸入藥名加入，例如 metformin、二甲雙胍', 'Type a drug name, e.g. metformin'))}"><datalist id="phDrugList">${DRUGS.map(d => `<option value="${esc(d.en)}">${esc(d.zh)} · ${esc(d.classZh || d.class)}</option>`).join('')}</datalist><button class="button primary small" id="phEval" ${tray.length ? '' : 'disabled'}>${t('evaluate')}</button><button class="button light small" id="phClear">${t('clearTray')}</button></div>
            <details class="ph-drugs"><summary>${say('病人同時服用的中藥（檢查中西藥交互作用）', 'Herbs the patient also takes (herb–drug check)')}</summary><div class="row">${herbChoices.map(h => `<label class="chip ${st.extraHerbs.has(h) ? 'active' : ''}"><input type="checkbox" data-xherb="${esc(h)}" ${st.extraHerbs.has(h) ? 'checked' : ''}>${esc(h)}</label>`).join('')}</div></details></div>
          ${st.result ? findingsHtml(st.result) : ''}
          ${sc ? `<details class="ph-recs" ${st.result ? 'open' : ''}><summary><b>${t('recommendedCombos')}</b></summary>${(sc.recommended || []).map((r, i) => `<div class="ph-rec"><p class="row">${(r.regimen || []).map(id => { const d = drugById(id); return `<span class="chip small" title="${esc(d ? bi(d, 'mechanism') : '')}">${esc(drugName(d) || id)}<em>${esc(d ? (zh() ? d.classZh || d.class : d.classEn || d.class) : '')}</em></span>`; }).join('')}</p><p class="small">${esc(bi(r, 'why'))}</p><button class="button light small" data-apply-drug="${i}">${say('放入配伍盤', 'Load into tray')}</button></div>`).join('')}${(sc.wrong || []).length ? `<div class="ph-wrong"><b>${t('pitfall')}</b><ul>${sc.wrong.map(w => `<li><b>${(w.items || w.drugs || []).map(id => drugName(drugById(id)) || id).join('、')}</b>${w.together ? say('（併用）', ' (together)') : ''}：${esc(bi(w, 'zh'))}</li>`).join('')}</ul></div>` : ''}</details>` : ''}
        </section>
        <aside class="card ph-right"><div class="content-controls"><label>${say('查藥物', 'Find a drug')}<input id="phSearch" type="search" value="${esc(st.q)}" placeholder="${esc(say('學名／中文／類別／適應症', 'name / class / indication'))}"></label><label>${t('category')}<select id="phCat"><option value="">${say('全部', 'All')}</option>${classes.map(c => `<option value="${esc(c)}" ${st.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>
          <div class="ph-list">${list.map(d => `<button class="point-choice ${st.drugTray.has(d.id) ? 'active' : ''}" data-drug="${esc(d.id)}"><b>${esc(drugName(d))}</b><small>${esc(zh() ? d.classZh || d.class : d.classEn || d.class)} · ${esc((zh() ? d.uses : d.usesEn || d.uses) || []).slice(0, 80)}<br>${esc(bi(d, 'mechanism')).slice(0, 90)}</small></button>`).join('') || `<p class="muted small">${t('noResults')}</p>`}</div></aside></div>`;
      bindCommon();
      body.querySelector('#phScenario').onchange = e => { st.drugScenario = e.target.value; st.result = null; st.drugTray.clear(); st.flags.clear(); draw(); };
      body.querySelectorAll('[data-drug]').forEach(b => b.onclick = () => { const id = b.dataset.drug; if (st.drugTray.has(id)) st.drugTray.delete(id); else st.drugTray.add(id); st.result = null; draw(); });
      body.querySelectorAll('[data-untray]').forEach(b => b.onclick = () => { st.drugTray.delete(b.dataset.untray); st.result = null; draw(); });
      body.querySelector('#phAdd').onchange = e => { const v = e.target.value.trim().toLowerCase(); const d = DRUGS.find(x => x.en.toLowerCase() === v || x.id === v || x.zh === e.target.value.trim()); if (d) { st.drugTray.add(d.id); st.result = null; draw(); } else window.HT.app.toast(say('找不到此藥物', 'Drug not found')); };
      body.querySelector('#phEval').onclick = () => { const flags = new Set([...st.flags, ...((sc && sc.patientFlags) || [])]); st.result = evaluateDrugs(sc, st.drugTray, flags, st.extraHerbs); window.HT.app.recordSim('pharmacy-drug-' + (sc ? sc.id : 'free'), st.result.score); draw(); };
      body.querySelector('#phClear').onclick = () => { st.drugTray.clear(); st.result = null; draw(); };
      body.querySelectorAll('[data-apply-drug]').forEach(b => b.onclick = () => { const r = sc.recommended[Number(b.dataset.applyDrug)]; st.drugTray = new Set(r.regimen || []); st.result = null; draw(); });
      body.querySelectorAll('[data-xherb]').forEach(i => i.onchange = () => { if (i.checked) st.extraHerbs.add(i.dataset.xherb); else st.extraHerbs.delete(i.dataset.xherb); st.result = null; draw(); });
    }
    function bindCommon() {
      const s = body.querySelector('#phSearch'); if (s) s.oninput = e => { st.q = e.target.value; draw(); const n = body.querySelector('#phSearch'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } };
      const c = body.querySelector('#phCat'); if (c) c.onchange = e => { st.cat = e.target.value; draw(); };
      body.querySelectorAll('[data-flag]').forEach(i => i.onchange = () => { if (i.checked) st.flags.add(i.dataset.flag); else st.flags.delete(i.dataset.flag); st.result = null; draw(); });
    }
    function draw() { root.querySelectorAll('[data-ptab]').forEach(b => b.classList.toggle('active', b.dataset.ptab === st.tab)); if (!LAB) { body.innerHTML = ''; return; } if (st.tab === 'drug') drawDrug(); else drawHerb(); }
    draw();
    return () => { currentContext = null; };
  }
  window.HT = window.HT || {};
  window.HT.pharmacyLab = { ensure, render, evaluateHerbs, evaluateDrugs, get currentContext() { return currentContext; } };
})(window);
