/* Western internship stations: blood-pressure cuff with Korotkoff sounds, glucose meter, SpO2 /
   temperature / respiratory-rate interpretation, ECG rhythm recognition, laboratory panels and
   a SOAP case. All values are simulated for training; thresholds follow published guidelines. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const zh = () => window.HT.i18n.isZh();
  const pick = (z, e) => zh() ? z : e;
  const rnd = n => Math.floor(Math.random() * n);
  const choice = a => a[rnd(a.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let audioCtx = null;
  function tick(freq, gain, dur) { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'triangle'; o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination); const now = audioCtx.currentTime; g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(gain, now + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, now + dur); o.start(now); o.stop(now + dur + 0.02); } catch (e) { /* no audio */ } }

  // ---------------------------------------------------------------- blood pressure
  function bpClass(s, d) {
    if (s > 180 || d > 120) return ['高血壓危象（需立即評估）', 'Hypertensive crisis (immediate evaluation)', 'danger'];
    if (s >= 140 || d >= 90) return ['第二期高血壓', 'Stage 2 hypertension', 'danger'];
    if (s >= 130 || d >= 80) return ['第一期高血壓', 'Stage 1 hypertension', 'warn'];
    if (s >= 120) return ['血壓偏高', 'Elevated', 'warn'];
    if (s < 90 || d < 60) return ['低血壓', 'Hypotension', 'warn'];
    return ['正常', 'Normal', 'ok'];
  }
  function bpStation(root) {
    let truth, cuff = 0, mode = 'idle', raf, hr, lastBeat = 0, deflateRate = 3;
    const newPatient = () => { const sets = [[118, 76], [128, 82], [136, 88], [148, 94], [162, 100], [184, 118], [104, 66], [88, 56], [122, 78], [142, 86]]; const [s, d] = choice(sets); truth = { s: s + rnd(5) - 2, d: d + rnd(5) - 2 }; hr = 56 + rnd(44); };
    newPatient();
    root.innerHTML = `<div class="sim"><div class="card panel"><span class="eyebrow">${pick('血壓測量站（聽診法）', 'BLOOD PRESSURE STATION (auscultatory)')}</span><p class="small muted">${pick('病人靜坐 5 分鐘、背有靠、雙腳平放、袖帶與心臟同高；充氣至脈搏消失上方 30 mmHg，再以每秒 2–3 mmHg 放氣，聽第一聲（收縮壓）與消失聲（舒張壓）。', 'Seated 5 minutes, back supported, feet flat, cuff at heart level; inflate 30 mmHg above pulse loss, deflate 2–3 mmHg/s, note the first sound (systolic) and the disappearance (diastolic).')}</p><canvas id="gauge" width="400" height="260"></canvas><div class="row"><button class="button primary" id="inflate">${pick('按住充氣', 'Hold to inflate')}</button><button class="button" id="deflate">${pick('緩慢放氣', 'Deflate slowly')}</button><button class="button light" id="release">${pick('快速洩氣', 'Release')}</button><label class="small" style="font-weight:400">${pick('放氣速率', 'Deflate rate')} <select id="rate" style="width:auto"><option value="2">2 mmHg/s</option><option value="3" selected>3 mmHg/s</option><option value="8">8 mmHg/s (${pick('太快', 'too fast')})</option></select></label></div><p class="small" id="sound"></p></div>
      <div class="card panel"><h3>${pick('記錄讀值', 'Record the reading')}</h3><div class="form-grid"><label>${pick('收縮壓', 'Systolic')}<input id="sys" type="number" inputmode="numeric"></label><label>${pick('舒張壓', 'Diastolic')}<input id="dia" type="number" inputmode="numeric"></label></div><label>${pick('分類（2017 ACC/AHA）', 'Classification (2017 ACC/AHA)')}<select id="cls"><option value="ok">${pick('正常', 'Normal')}</option><option value="warn">${pick('偏高／第一期', 'Elevated / Stage 1')}</option><option value="danger">${pick('第二期／危象', 'Stage 2 / crisis')}</option></select></label><div class="row"><button class="button primary" id="bpSubmit">${window.HT.i18n.t('submitAnswer')}</button><button class="button light" id="bpNext">${pick('下一位病人', 'Next patient')}</button></div><div id="bpResult" style="margin-top:12px"></div></div></div>`;
    const cv = root.querySelector('#gauge'), ctx = cv.getContext('2d');
    const draw = (now) => {
      const style = getComputedStyle(document.documentElement);
      ctx.clearRect(0, 0, cv.width, cv.height);
      // gauge
      ctx.strokeStyle = style.getPropertyValue('--line-2'); ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(200, 150, 110, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
      ctx.strokeStyle = style.getPropertyValue('--primary'); ctx.beginPath(); ctx.arc(200, 150, 110, Math.PI * 0.8, Math.PI * 0.8 + Math.PI * 1.4 * Math.min(1, cuff / 300)); ctx.stroke();
      ctx.fillStyle = style.getPropertyValue('--ink'); ctx.font = 'bold 34px Inter,system-ui'; ctx.textAlign = 'center'; ctx.fillText(Math.round(cuff) + ' mmHg', 200, 160);
      ctx.font = '13px Inter,system-ui'; ctx.fillText(mode === 'inflate' ? pick('充氣中', 'inflating') : mode === 'deflate' ? pick('放氣中', 'deflating') : '', 200, 190);
      // simulate
      const dt = 1 / 60;
      if (mode === 'inflate') cuff = Math.min(300, cuff + 60 * dt);
      if (mode === 'deflate') { cuff = Math.max(0, cuff - deflateRate * dt); if (cuff === 0) mode = 'idle'; }
      if (mode === 'release') { cuff = Math.max(0, cuff - 120 * dt); if (cuff === 0) mode = 'idle'; }
      const beatInterval = 60 / hr; const beat = Math.floor(now / 1000 / beatInterval);
      if (beat !== lastBeat) { lastBeat = beat; if (mode === 'deflate' && cuff <= truth.s && cuff >= truth.d) { const phase = (truth.s - cuff) / Math.max(1, truth.s - truth.d); tick(phase < 0.2 ? 180 : phase < 0.7 ? 140 : 110, phase < 0.7 ? 0.5 : 0.25, 0.06); root.querySelector('#sound').textContent = pick('🔊 Korotkoff 音', '🔊 Korotkoff sound'); const circle = ctx; circle.fillStyle = style.getPropertyValue('--danger'); circle.beginPath(); circle.arc(200, 60, 8, 0, Math.PI * 2); circle.fill(); } else root.querySelector('#sound').textContent = ''; }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const inflateBtn = root.querySelector('#inflate');
    const startInflate = e => { e.preventDefault(); mode = 'inflate'; };
    const stopInflate = () => { if (mode === 'inflate') mode = 'idle'; };
    inflateBtn.addEventListener('pointerdown', startInflate); inflateBtn.addEventListener('pointerup', stopInflate); inflateBtn.addEventListener('pointerleave', stopInflate); inflateBtn.addEventListener('pointercancel', stopInflate);
    inflateBtn.title = pick('按住充氣', 'Hold to inflate');
    root.querySelector('#deflate').onclick = () => { mode = 'deflate'; deflateRate = Number(root.querySelector('#rate').value); };
    root.querySelector('#release').onclick = () => { mode = 'release'; };
    root.querySelector('#bpNext').onclick = () => { newPatient(); cuff = 0; mode = 'idle'; root.querySelector('#bpResult').innerHTML = ''; root.querySelector('#sys').value = ''; root.querySelector('#dia').value = ''; };
    root.querySelector('#bpSubmit').onclick = () => {
      const s = Number(root.querySelector('#sys').value), d = Number(root.querySelector('#dia').value), c = root.querySelector('#cls').value;
      const es = Math.abs(s - truth.s), ed = Math.abs(d - truth.d);
      let score = Math.max(0, 40 - es * 4) + Math.max(0, 40 - ed * 4); const cls = bpClass(truth.s, truth.d); if (c === cls[2]) score += 20;
      root.querySelector('#bpResult').innerHTML = `<div class="notice"><span class="score">${Math.round(score)} / 100</span><br>${pick('實際血壓', 'True BP')} <b>${truth.s}/${truth.d} mmHg</b> · ${pick('心率', 'HR')} ${hr} · <span class="${cls[2]}">${pick(cls[0], cls[1])}</span><br><span class="small muted">${pick('誤差 ±4 mmHg 內可接受；放氣過快會高估舒張壓、低估收縮壓。', 'Within ±4 mmHg is acceptable; deflating too fast overestimates diastolic and underestimates systolic.')}</span></div>`;
      window.HT.app.recordSim('bp', Math.round(score));
    };
    return () => cancelAnimationFrame(raf);
  }

  // ---------------------------------------------------------------- glucose & other vitals
  function glucoseStation(root) {
    const scenarios = [
      { type: 'fasting', v: 92, ans: 'normal' }, { type: 'fasting', v: 112, ans: 'pre' }, { type: 'fasting', v: 138, ans: 'dm' }, { type: 'random', v: 240, ans: 'dm' }, { type: 'fasting', v: 58, ans: 'hypo', sym: true }, { type: 'a1c', v: 5.4, ans: 'normal' }, { type: 'a1c', v: 6.1, ans: 'pre' }, { type: 'a1c', v: 7.8, ans: 'dm' }, { type: 'ogtt', v: 165, ans: 'pre' }, { type: 'ogtt', v: 212, ans: 'dm' }, { type: 'random', v: 48, ans: 'hypo', sym: true }, { type: 'fasting', v: 101, ans: 'pre' },
    ];
    let s = choice(scenarios);
    const label = t => ({ fasting: pick('空腹血糖', 'Fasting glucose'), random: pick('隨機血糖', 'Random glucose'), a1c: 'HbA1c', ogtt: pick('OGTT 2 小時', 'OGTT 2-hour') })[t];
    const unit = t => t === 'a1c' ? '%' : 'mg/dL';
    const render = () => {
      root.innerHTML = `<div class="sim"><div class="card panel"><span class="eyebrow">${pick('血糖站', 'GLUCOSE STATION')}</span><div class="vital"><span class="small muted">${label(s.type)}${s.sym ? pick('（病人冒冷汗、心悸、手抖）', ' (patient sweating, palpitations, tremor)') : ''}</span><b>${s.v} ${unit(s.type)}</b></div><p class="small muted">${pick('指尖血糖操作：洗手、側指尖採血、第一滴可擦除、試紙未過期；ADA 標準：空腹 100–125 為糖尿病前期、≥126 為糖尿病；HbA1c 5.7–6.4／≥6.5；OGTT 2 小時 140–199／≥200；隨機 ≥200 伴症狀；<70 為低血糖。', 'Fingerstick technique: wash hands, side of fingertip, wipe first drop, unexpired strip. ADA: fasting 100–125 prediabetes, ≥126 diabetes; HbA1c 5.7–6.4 / ≥6.5; OGTT 2-h 140–199 / ≥200; random ≥200 with symptoms; <70 hypoglycaemia.')}</p></div>
        <div class="card panel"><label>${pick('判讀', 'Interpretation')}<select id="gAns"><option value="normal">${pick('正常', 'Normal')}</option><option value="pre">${pick('糖尿病前期', 'Prediabetes')}</option><option value="dm">${pick('符合糖尿病', 'Meets diabetes criteria')}</option><option value="hypo">${pick('低血糖（15 g 糖處置）', 'Hypoglycaemia (15 g carbohydrate)')}</option></select></label><div class="row"><button class="button primary" id="gSubmit">${window.HT.i18n.t('submitAnswer')}</button><button class="button light" id="gNext">${pick('下一個', 'Next')}</button></div><div id="gResult" style="margin-top:12px"></div></div></div>`;
      root.querySelector('#gSubmit').onclick = () => { const ok = root.querySelector('#gAns').value === s.ans; root.querySelector('#gResult').innerHTML = `<div class="notice"><span class="score">${ok ? 100 : 0} / 100</span> · ${ok ? window.HT.i18n.t('correct') : window.HT.i18n.t('incorrect')} ${pick('正確判讀：', 'Correct: ')}<b>${{ normal: pick('正常', 'Normal'), pre: pick('糖尿病前期', 'Prediabetes'), dm: pick('糖尿病（需第二次確認除非有症狀且 ≥200）', 'Diabetes (confirm with a second test unless symptomatic and ≥200)'), hypo: pick('低血糖：15 g 糖，15 分鐘後複測', 'Hypoglycaemia: 15 g carbohydrate, recheck in 15 min') }[s.ans]}</b></div>`; window.HT.app.recordSim('glucose', ok ? 100 : 0); };
      root.querySelector('#gNext').onclick = () => { s = choice(scenarios.filter(x => x !== s)); render(); };
    };
    render();
  }
  function vitalsStation(root) {
    const gen = () => ({ hr: choice([48, 62, 74, 88, 104, 128]), rr: choice([10, 14, 18, 24, 30]), spo2: choice([99, 97, 94, 90, 86]), temp: choice([36.4, 37.2, 38.3, 39.6, 35.1]), bmi: { h: 160 + rnd(30), w: 45 + rnd(60) } });
    let v = gen();
    const render = () => {
      const bmi = v.bmi.w / Math.pow(v.bmi.h / 100, 2);
      root.innerHTML = `<div class="card panel"><span class="eyebrow">${pick('生命徵象站', 'VITAL-SIGNS STATION')}</span><div class="vitals-grid"><div class="vital"><span class="small muted">${pick('心率', 'HR')}</span><b>${v.hr} /min</b></div><div class="vital"><span class="small muted">${pick('呼吸', 'RR')}</span><b>${v.rr} /min</b></div><div class="vital"><span class="small muted">SpO₂</span><b>${v.spo2} %</b></div><div class="vital"><span class="small muted">${pick('體溫', 'Temp')}</span><b>${v.temp.toFixed(1)} °C</b></div><div class="vital"><span class="small muted">BMI</span><b>${bmi.toFixed(1)}</b><span class="small muted">${v.bmi.h} cm · ${v.bmi.w} kg</span></div></div>
        <h4 style="margin-top:14px">${pick('哪些數值異常？（勾選）', 'Which values are abnormal? (tick)')}</h4><div class="row">${['hr', 'rr', 'spo2', 'temp', 'bmi'].map(k => `<label class="chip" style="font-weight:400"><input type="checkbox" value="${k}" style="width:auto;margin-right:4px">${{ hr: pick('心率', 'HR'), rr: pick('呼吸', 'RR'), spo2: 'SpO₂', temp: pick('體溫', 'Temp'), bmi: 'BMI' }[k]}</label>`).join('')}</div><div class="row" style="margin-top:10px"><button class="button primary" id="vSubmit">${window.HT.i18n.t('submitAnswer')}</button><button class="button light" id="vNext">${pick('下一位', 'Next')}</button></div><div id="vResult" style="margin-top:12px"></div></div>`;
      root.querySelector('#vSubmit').onclick = () => {
        const truth = { hr: v.hr < 60 || v.hr > 100, rr: v.rr < 12 || v.rr > 20, spo2: v.spo2 < 95, temp: v.temp >= 38 || v.temp < 35.5, bmi: bmi < 18.5 || bmi >= 24 };
        const sel = new Set([...root.querySelectorAll('input:checked')].map(i => i.value)); let s = 0; for (const k in truth) if (truth[k] === sel.has(k)) s += 20;
        root.querySelector('#vResult').innerHTML = `<div class="notice"><span class="score">${s} / 100</span><br><span class="small">${pick('正常範圍：心率 60–100、呼吸 12–20、SpO₂ ≥95%、體溫 35.5–37.9°C、BMI 18.5–23.9（台灣標準）。', 'Normal: HR 60–100, RR 12–20, SpO₂ ≥95%, temp 35.5–37.9 °C, BMI 18.5–23.9 (Taiwan).')} ${pick('異常：', 'Abnormal: ')}${Object.keys(truth).filter(k => truth[k]).join(', ') || pick('無', 'none')}</span></div>`;
        window.HT.app.recordSim('vitals', s);
      };
      root.querySelector('#vNext').onclick = () => { v = gen(); render(); };
    };
    render();
  }

  // ---------------------------------------------------------------- ECG rhythms
  const RHYTHMS = {
    nsr: ['正常竇性心律', 'Normal sinus rhythm', { rate: 72, p: true, qrs: 1, irregular: 0 }],
    brady: ['竇性心搏過緩', 'Sinus bradycardia', { rate: 44, p: true, qrs: 1, irregular: 0 }],
    tachy: ['竇性心搏過速', 'Sinus tachycardia', { rate: 125, p: true, qrs: 1, irregular: 0 }],
    af: ['心房顫動', 'Atrial fibrillation', { rate: 110, p: false, qrs: 1, irregular: 1, fib: true }],
    flutter: ['心房撲動', 'Atrial flutter', { rate: 150, p: false, qrs: 1, irregular: 0, saw: true }],
    svt: ['上心室心搏過速', 'Supraventricular tachycardia', { rate: 180, p: false, qrs: 1, irregular: 0 }],
    vt: ['心室頻脈', 'Ventricular tachycardia', { rate: 160, p: false, qrs: 3, irregular: 0 }],
    vf: ['心室顫動', 'Ventricular fibrillation', { vf: true }],
    chb: ['完全房室阻滯', 'Complete heart block', { rate: 36, p: true, qrs: 1.5, irregular: 0, dissoc: true }],
    stemi: ['ST 段上升（STEMI）', 'ST elevation (STEMI)', { rate: 84, p: true, qrs: 1, irregular: 0, st: 1 }],
    asystole: ['心搏停止', 'Asystole', { flat: true }],
    pvc: ['竇性心律合併心室早期收縮', 'Sinus rhythm with PVCs', { rate: 76, p: true, qrs: 1, irregular: 0, pvc: true }],
  };
  function drawEcg(ctx, w, h, r) {
    const style = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, w, h); ctx.strokeStyle = 'rgba(200,80,80,.18)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.strokeStyle = style.getPropertyValue('--ink'); ctx.lineWidth = 1.6; ctx.beginPath();
    const base = h * 0.6, pxPerSec = 125; // 25 mm/s with 5 px/mm
    let seed = 7;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    if (r.flat) { ctx.moveTo(0, base); for (let x = 0; x < w; x += 4) ctx.lineTo(x, base + (rand() - 0.5) * 2); ctx.stroke(); return; }
    if (r.vf) { ctx.moveTo(0, base); for (let x = 0; x < w; x += 2) ctx.lineTo(x, base + Math.sin(x / 9 + rand() * 2) * 28 * (0.5 + rand())); ctx.stroke(); return; }
    const beats = []; let t = 0.2; let pvcCount = 0;
    while (t < w / pxPerSec) { beats.push(t); let rr = 60 / r.rate; if (r.irregular) rr *= 0.6 + rand() * 0.8; if (r.pvc && ++pvcCount % 4 === 0) rr *= 0.6; t += rr; }
    const pTimes = r.dissoc ? Array.from({ length: 30 }, (_, i) => 0.1 + i * 0.75) : [];
    for (let x = 0; x < w; x++) {
      const tt = x / pxPerSec; let y = 0;
      if (r.saw) y += Math.abs(((tt * 5) % 1) - 0.5) * 10 - 2.5; if (r.fib) y += (rand() - 0.5) * 4;
      (r.dissoc ? pTimes : beats.map(b => b - 0.16)).forEach(pt => { const d = tt - pt; if (r.p && d > 0 && d < 0.09) y -= Math.sin(d / 0.09 * Math.PI) * 6; });
      beats.forEach((b, i) => {
        const d = tt - b; const wide = r.qrs > 1 || (r.pvc && i % 4 === 3); const qw = wide ? 0.14 : 0.08; const amp = wide ? 40 : 55;
        if (d > -0.02 && d < 0) y += (d + 0.02) / 0.02 * 5;
        if (d >= 0 && d < qw) { const ph = d / qw; y -= ph < 0.5 ? amp * (ph / 0.5) * (wide && i % 4 === 3 ? -1 : 1) : amp * (1 - (ph - 0.5) / 0.5) * (wide && i % 4 === 3 ? -1 : 1); if (!wide && ph > 0.6) y += 12 * (ph - 0.6) / 0.4; }
        if (d >= qw && d < qw + 0.3) { const ph = (d - qw) / 0.3; y -= Math.sin(ph * Math.PI) * (wide ? -14 : 9) + (r.st ? 14 : 0) * (ph < 0.6 ? 1 : (1 - (ph - 0.6) / 0.4)); }
      });
      const py = base + y; x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
    }
    ctx.stroke();
  }
  function ecgStation(root) {
    let key = choice(Object.keys(RHYTHMS));
    const render = () => {
      const opts = shuffle([key, ...shuffle(Object.keys(RHYTHMS).filter(k => k !== key)).slice(0, 3)]);
      root.innerHTML = `<div class="card panel"><span class="eyebrow">${pick('心電圖節律判讀（25 mm/s）', 'ECG RHYTHM RECOGNITION (25 mm/s)')}</span><canvas id="ecg" width="760" height="200"></canvas><div class="quiz">${opts.map(o => `<label class="opt"><input type="radio" name="rh" value="${o}" style="width:auto">${RHYTHMS[o][zh() ? 0 : 1]}</label>`).join('')}</div><div class="row"><button class="button primary" id="eSubmit">${window.HT.i18n.t('submitAnswer')}</button><button class="button light" id="eNext">${pick('下一張', 'Next strip')}</button></div><div id="eResult" style="margin-top:12px"></div></div>`;
      drawEcg(root.querySelector('#ecg').getContext('2d'), 760, 200, RHYTHMS[key][2]);
      root.querySelector('#eSubmit').onclick = () => { const r = root.querySelector('input[name=rh]:checked'); if (!r) return; const ok = r.value === key; const hints = { af: pick('RR 不規則、無 P 波、基線顫動', 'Irregularly irregular, no P waves, fibrillatory baseline'), vt: pick('寬 QRS 規則快速節律：有脈則同步電擊／藥物，無脈則去顫', 'Wide regular tachycardia: cardioversion/drugs if pulse, defibrillate if pulseless'), vf: pick('混亂無規則波形：立即去顫與 CPR', 'Chaotic waveform: immediate defibrillation and CPR'), chb: pick('P 與 QRS 無關、心室率慢：經皮起搏', 'AV dissociation with slow escape: pacing'), stemi: pick('ST 段上升 ≥1 mm 於相鄰導程：啟動心導管', 'ST elevation ≥1 mm in contiguous leads: activate the cath lab'), asystole: pick('確認導程與增益；CPR + epinephrine，不電擊', 'Confirm leads and gain; CPR + epinephrine, no shock'), flutter: pick('鋸齒狀 F 波，常 2:1 傳導 150/分', 'Sawtooth F waves, often 2:1 at 150/min'), svt: pick('規則窄 QRS 快速：迷走操作、adenosine', 'Regular narrow tachycardia: vagal manoeuvres, adenosine'), pvc: pick('寬大畸形提早 QRS 後代償間歇', 'Wide premature beats with compensatory pause') }; root.querySelector('#eResult').innerHTML = `<div class="notice"><span class="score">${ok ? 100 : 0} / 100</span> · ${pick('正確：', 'Correct: ')}<b>${RHYTHMS[key][zh() ? 0 : 1]}</b>${hints[key] ? '<br><span class="small">' + hints[key] + '</span>' : ''}</div>`; window.HT.app.recordSim('ecg', ok ? 100 : 0); };
      root.querySelector('#eNext').onclick = () => { key = choice(Object.keys(RHYTHMS).filter(k => k !== key)); render(); };
    };
    render();
  }

  // ---------------------------------------------------------------- labs
  const LABS = [
    { id: 'hyperK', vals: { Na: 138, K: 6.8, Cr: 3.2, Glu: 110, Hb: 11.2, WBC: 7.1, PLT: 210, CRP: 0.4, Trop: 8 }, ans: 'hyperK', why: ['高血鉀 6.8 合併腎功能惡化：立即心電圖、鈣、胰島素葡萄糖、考慮透析。', 'Potassium 6.8 with renal failure: ECG now, calcium, insulin–glucose, consider dialysis.'] },
    { id: 'sepsis', vals: { Na: 134, K: 4.1, Cr: 1.4, Glu: 150, Hb: 12.8, WBC: 22.5, CRP: 18.6, PLT: 95, Trop: 12 }, ans: 'sepsis', why: ['白血球 22.5、CRP 18.6、血小板下降：敗血症一小時組合。', 'WBC 22.5, CRP 18.6, falling platelets: sepsis one-hour bundle.'] },
    { id: 'acs', vals: { Na: 140, K: 4.0, Cr: 0.9, Glu: 98, Hb: 14.1, WBC: 8.0, CRP: 0.6, PLT: 240, Trop: 860 }, ans: 'acs', why: ['高敏肌鈣蛋白 860 ng/L：急性心肌損傷，依心電圖決定 PCI。', 'hs-troponin 860 ng/L: acute myocardial injury; PCI per ECG.'] },
    { id: 'hypoNa', vals: { Na: 118, K: 3.9, Cr: 0.8, Glu: 96, Hb: 13.0, WBC: 6.5, CRP: 0.3, PLT: 230, Trop: 5 }, ans: 'hypoNa', why: ['鈉 118：嚴重低血鈉，評估症狀與容積狀態，矯正勿超過每日 8 mmol/L。', 'Sodium 118: severe hyponatraemia; assess symptoms and volume, correct ≤8 mmol/L/day.'] },
    { id: 'anemia', vals: { Na: 139, K: 4.2, Cr: 1.0, Glu: 102, Hb: 6.4, WBC: 5.8, CRP: 0.2, PLT: 180, Trop: 4 }, ans: 'anemia', why: ['血紅素 6.4：嚴重貧血，評估出血與輸血指徵（<7 g/dL）。', 'Haemoglobin 6.4: severe anaemia; evaluate bleeding and transfusion threshold (<7 g/dL).'] },
    { id: 'dka', vals: { Na: 131, K: 5.4, Cr: 1.3, Glu: 468, Hb: 15.2, WBC: 13.0, CRP: 1.1, PLT: 300, Trop: 6 }, ans: 'dka', why: ['血糖 468 合併假性低鈉與高鉀：疑 DKA，查血氣與酮體。', 'Glucose 468 with pseudohyponatraemia and hyperkalaemia: suspect DKA; check gas and ketones.'] },
  ];
  const REF = { Na: '135–145', K: '3.5–5.0', Cr: '0.6–1.2', Glu: '70–140', Hb: '12–16', WBC: '4–10', CRP: '<0.5', PLT: '150–400', Trop: '<14' };
  function labStation(root) {
    let L = choice(LABS);
    const render = () => {
      const opts = shuffle(LABS.map(l => l.ans));
      root.innerHTML = `<div class="sim"><div class="card panel"><span class="eyebrow">${pick('檢驗判讀站', 'LAB INTERPRETATION STATION')}</span><table><tr><th>${pick('項目', 'Test')}</th><th>${pick('結果', 'Result')}</th><th>${pick('參考', 'Reference')}</th></tr>${Object.entries(L.vals).map(([k, v]) => `<tr><td>${k}</td><td><b>${v}</b></td><td class="muted">${REF[k]}</td></tr>`).join('')}</table></div><div class="card panel"><h4>${pick('最急迫的問題是？', 'What is the most urgent problem?')}</h4><div class="quiz">${opts.map(o => `<label class="opt"><input type="radio" name="lab" value="${o}" style="width:auto">${{ hyperK: pick('高血鉀', 'Hyperkalaemia'), sepsis: pick('敗血症', 'Sepsis'), acs: pick('急性冠心症', 'Acute coronary syndrome'), hypoNa: pick('嚴重低血鈉', 'Severe hyponatraemia'), anemia: pick('嚴重貧血', 'Severe anaemia'), dka: pick('糖尿病酮酸中毒', 'DKA') }[o]}</label>`).join('')}</div><div class="row"><button class="button primary" id="lSubmit">${window.HT.i18n.t('submitAnswer')}</button><button class="button light" id="lNext">${pick('下一組', 'Next panel')}</button></div><div id="lResult" style="margin-top:12px"></div></div></div>`;
      root.querySelector('#lSubmit').onclick = () => { const r = root.querySelector('input[name=lab]:checked'); if (!r) return; const ok = r.value === L.ans; root.querySelector('#lResult').innerHTML = `<div class="notice"><span class="score">${ok ? 100 : 0} / 100</span><br>${esc(pick(L.why[0], L.why[1]))}</div>`; window.HT.app.recordSim('labs', ok ? 100 : 0); };
      root.querySelector('#lNext').onclick = () => { L = choice(LABS.filter(x => x !== L)); render(); };
    };
    render();
  }

  // ---------------------------------------------------------------- SOAP case
  const SOAP = [
    { s: ['65 歲男性，胸口壓迫感 40 分鐘，冒冷汗，放射至左臂；有高血壓、吸菸。', '65-year-old man, 40 minutes of chest pressure with cold sweat radiating to the left arm; hypertension, smoker.'], o: ['BP 150/92, HR 98, SpO2 96%, ECG V2–V4 ST 上升 3 mm', 'BP 150/92, HR 98, SpO2 96%, ECG ST elevation 3 mm in V2–V4'], dx: 'stemi', orders: ['aspirin', 'cath', 'ecg'], distract: ['ct-head', 'antibiotic', 'lp'] },
    { s: ['72 歲女性，突發右側無力與言語不清 50 分鐘。', '72-year-old woman with sudden right-sided weakness and slurred speech 50 minutes ago.'], o: ['BP 178/98, HR 84 不規則, 血糖 132, NIHSS 12', 'BP 178/98, HR 84 irregular, glucose 132, NIHSS 12'], dx: 'stroke', orders: ['ct-head', 'ecg', 'tpa-eval'], distract: ['aspirin-now', 'antibiotic', 'cath'] },
    { s: ['24 歲女性，發燒 39°C、咳嗽濃痰三天，呼吸急促。', '24-year-old woman, fever 39 °C, productive cough for 3 days, short of breath.'], o: ['RR 28, SpO2 91%, HR 118, BP 96/60, 乳酸 3.8', 'RR 28, SpO2 91%, HR 118, BP 96/60, lactate 3.8'], dx: 'sepsis', orders: ['cultures', 'antibiotic', 'fluids'], distract: ['cath', 'tpa-eval', 'lp'] },
    { s: ['19 歲男性，右下腹痛 12 小時，由肚臍周圍轉移，噁心。', '19-year-old man, 12 hours of right lower quadrant pain migrating from the periumbilical area, nausea.'], o: ['T 38.1, McBurney 壓痛反彈痛, WBC 15.2', 'T 38.1, McBurney tenderness with rebound, WBC 15.2'], dx: 'appy', orders: ['surg-consult', 'npo', 'ct-abd'], distract: ['tpa-eval', 'cath', 'ecg'] },
  ];
  const DX = { stemi: ['STEMI', 'STEMI'], stroke: ['急性缺血性中風', 'Acute ischaemic stroke'], sepsis: ['敗血症／肺炎', 'Sepsis / pneumonia'], appy: ['急性闌尾炎', 'Acute appendicitis'], pe: ['肺栓塞', 'Pulmonary embolism'], gerd: ['胃食道逆流', 'GERD'] };
  const ORD = { aspirin: ['Aspirin 嚼服 + 啟動心導管', 'Chewed aspirin + activate cath lab'], cath: ['Primary PCI（door-to-balloon <90 分）', 'Primary PCI (door-to-balloon <90 min)'], ecg: ['12 導程心電圖 10 分鐘內', '12-lead ECG within 10 minutes'], 'ct-head': ['非顯影頭部 CT', 'Non-contrast head CT'], 'tpa-eval': ['評估靜脈溶栓／取栓適應症', 'Assess thrombolysis/thrombectomy eligibility'], 'aspirin-now': ['立即給 aspirin（CT 前）', 'Give aspirin immediately (before CT)'], antibiotic: ['一小時內廣效抗生素', 'Broad-spectrum antibiotics within 1 hour'], cultures: ['抗生素前抽血液培養 ×2', 'Blood cultures ×2 before antibiotics'], fluids: ['30 mL/kg 晶體液', '30 mL/kg crystalloid'], lp: ['腰椎穿刺', 'Lumbar puncture'], 'surg-consult': ['外科會診', 'Surgical consult'], npo: ['禁食、靜脈輸液、止痛', 'NPO, IV fluids, analgesia'], 'ct-abd': ['腹部 CT 或超音波', 'Abdominal CT or ultrasound'] };
  function soapStation(root) {
    let c = choice(SOAP);
    const render = () => {
      const dxOpts = shuffle([c.dx, ...shuffle(Object.keys(DX).filter(k => k !== c.dx)).slice(0, 3)]);
      const ordOpts = shuffle([...c.orders, ...c.distract]);
      root.innerHTML = `<div class="sim"><div class="card panel"><span class="eyebrow">${pick('臨床病例 · SOAP', 'CLINICAL CASE · SOAP')}</span><p><b>S</b> ${esc(pick(c.s[0], c.s[1]))}</p><p><b>O</b> ${esc(pick(c.o[0], c.o[1]))}</p></div><div class="card panel"><h4>A · ${pick('評估：最可能診斷', 'Assessment: most likely diagnosis')}</h4><div class="quiz">${dxOpts.map(d => `<label class="opt"><input type="radio" name="dx" value="${d}" style="width:auto">${DX[d][zh() ? 0 : 1]}</label>`).join('')}</div><h4>P · ${pick('計畫：選擇正確的即時處置（3 項）', 'Plan: choose the correct immediate actions (3)')}</h4><div class="row">${ordOpts.map(o => `<label class="chip" style="font-weight:400"><input type="checkbox" value="${o}" style="width:auto;margin-right:4px">${ORD[o][zh() ? 0 : 1]}</label>`).join('')}</div><div class="row" style="margin-top:10px"><button class="button primary" id="sSubmit">${window.HT.i18n.t('submitAnswer')}</button><button class="button light" id="sNext">${pick('下一個病例', 'Next case')}</button></div><div id="sResult" style="margin-top:12px"></div></div></div>`;
      root.querySelector('#sSubmit').onclick = () => { const r = root.querySelector('input[name=dx]:checked'); const sel = [...root.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value); let s = r && r.value === c.dx ? 40 : 0; s += sel.filter(o => c.orders.includes(o)).length * 20 - sel.filter(o => c.distract.includes(o)).length * 15; s = Math.max(0, Math.min(100, s)); root.querySelector('#sResult').innerHTML = `<div class="notice"><span class="score">${s} / 100</span><br>${pick('診斷：', 'Diagnosis: ')}<b>${DX[c.dx][zh() ? 0 : 1]}</b> · ${pick('處置：', 'Plan: ')}${c.orders.map(o => ORD[o][zh() ? 0 : 1]).join('；')}</div>`; window.HT.app.recordSim('soap', s); };
      root.querySelector('#sNext').onclick = () => { c = choice(SOAP.filter(x => x !== c)); render(); };
    };
    render();
  }
  window.HT = window.HT || {};
  window.HT.internWestern = { bpStation, glucoseStation, vitalsStation, ecgStation, labStation, soapStation, bpClass };
})(window);
