/* TCM internship tier: virtual-patient clinic (inspection → listening → inquiry → pulse → pattern →
   treatment), a pulse trainer with a pressure-sensitive waveform, a tongue trainer and an acupoint
   locator. Scores are formative feedback for learning, not clinical assessments. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const zh = () => window.HT.i18n.isZh();
  const pick = (z, e) => zh() ? z : e;
  const rnd = n => Math.floor(Math.random() * n);
  const choice = arr => arr[rnd(arr.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------------------------------------------------------------- pulse model
  const DEPTH = { floating: ['浮', 'floating'], middle: ['中', 'middle'], deep: ['沉', 'deep'] };
  const RATE = { slow: ['遲', 'slow'], normal: ['平', 'normal rate'], rapid: ['數', 'rapid'] };
  const FORCE = { strong: ['實／有力', 'replete / forceful'], weak: ['虛／無力', 'deficient / weak'], normal: ['中等', 'moderate'] };
  const SHAPE = { wiry: ['弦', 'wiry'], slippery: ['滑', 'slippery'], rough: ['澀', 'rough'], tight: ['緊', 'tight'], fine: ['細', 'fine'], surging: ['洪', 'surging'], soggy: ['濡', 'soggy'], knotted: ['結', 'knotted'], intermittent: ['代', 'intermittent'], skipping: ['促', 'skipping'], moderate: ['緩', 'moderate'] };
  const SHAPE_DESC = { wiry: ['如按琴弦，端直而長', 'like pressing a string, straight and long'], slippery: ['往來流利，如盤走珠', 'smooth, like beads rolling on a plate'], rough: ['往來艱澀，如輕刀刮竹', 'hesitant, like a knife scraping bamboo'], tight: ['緊張有力，如轉繩索', 'tense and forceful, like a twisted rope'], fine: ['脈細如線，應指明顯', 'thread-like but distinct'], surging: ['來盛去衰，如波濤洶湧', 'surging in, fading out, like waves'], soggy: ['浮細而軟', 'floating, fine and soft'], knotted: ['緩而時一止，止無定數', 'slow with irregular pauses'], intermittent: ['脈來一止，止有定數', 'regular pauses'], skipping: ['數而時一止', 'rapid with irregular pauses'], moderate: ['一息四至，和緩均勻', 'four beats per breath, even'] };

  function pulseWave(ctx, w, h, p, pressure, time) {
    // amplitude by depth vs pressure (0 light … 1 heavy)
    let amp = p.depth === 'floating' ? 1 - 0.75 * pressure : p.depth === 'deep' ? 0.15 + 0.85 * pressure : 1 - Math.abs(pressure - 0.5) * 1.2;
    amp = Math.max(0.05, amp) * (p.force === 'weak' ? 0.45 : p.force === 'strong' ? 1.1 : 0.8) * (p.shape.includes('fine') || p.shape.includes('soggy') ? 0.55 : 1);
    const bpm = p.bpm, period = 60 / bpm;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line-2') || '#ccc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, h * 0.7); ctx.lineTo(w, h * 0.7); ctx.stroke();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary') || '#1f6f5f'; ctx.lineWidth = 2.2; ctx.beginPath();
    const span = 4; // seconds across the canvas
    let beatIndex = 0, skipBeat = -1;
    if (p.shape.includes('knotted') || p.shape.includes('skipping')) skipBeat = 2 + Math.floor((time / 7) % 3);
    if (p.shape.includes('intermittent')) skipBeat = 3;
    for (let x = 0; x < w; x++) {
      const tt = time + (x / w) * span;
      const phase = (tt % period) / period; beatIndex = Math.floor(tt / period);
      let y = 0;
      const missing = skipBeat >= 0 && (beatIndex % (skipBeat + 1) === skipBeat);
      if (!missing) {
        if (p.shape.includes('wiry')) y = phase < 0.08 ? phase / 0.08 : phase < 0.45 ? 1 - (phase - 0.08) * 0.6 : Math.max(0, 0.78 - (phase - 0.45) * 2.2);
        else if (p.shape.includes('slippery')) y = Math.max(0, Math.sin(Math.PI * Math.min(1, phase / 0.55)));
        else if (p.shape.includes('rough')) y = Math.max(0, Math.sin(Math.PI * Math.min(1, phase / 0.5))) * (0.75 + 0.25 * Math.sin(phase * 60 + beatIndex)) * (0.7 + 0.3 * ((beatIndex * 7919) % 5) / 5);
        else if (p.shape.includes('tight')) y = phase < 0.06 ? phase / 0.06 : Math.max(0, 1 - (phase - 0.06) * 2.6) * (1 + 0.12 * Math.sin(phase * 90));
        else if (p.shape.includes('surging')) y = phase < 0.1 ? phase / 0.1 : Math.max(0, 1 - (phase - 0.1) * 1.3);
        else y = phase < 0.12 ? phase / 0.12 : Math.max(0, 1 - (phase - 0.12) * 1.5) * (phase < 0.5 ? 1 : 0.9);
      }
      const py = h * 0.7 - y * amp * h * 0.55;
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
    }
    ctx.stroke();
  }
  function randomPulse() {
    const depth = choice(['floating', 'middle', 'deep']);
    const rate = choice(['slow', 'normal', 'rapid']);
    const bpm = rate === 'slow' ? 44 + rnd(12) : rate === 'rapid' ? 96 + rnd(30) : 62 + rnd(26);
    const force = choice(['strong', 'weak', 'normal']);
    const shapes = Object.keys(SHAPE).filter(s => !(depth !== 'floating' && s === 'soggy') && !(rate !== 'slow' && s === 'knotted') && !(rate !== 'rapid' && s === 'skipping') && !(force === 'strong' && s === 'fine'));
    const shape = [choice(shapes)];
    if (Math.random() < 0.35) { const extra = choice(['wiry', 'slippery', 'fine']); if (!shape.includes(extra) && !['knotted', 'intermittent', 'skipping'].includes(shape[0])) shape.push(extra); }
    return { depth, rate, bpm, force, shape };
  }
  function pulseLabel(p) { return `${DEPTH[p.depth][zh() ? 0 : 1]}${zh() ? '' : ', '}${RATE[p.rate][zh() ? 0 : 1]}${zh() ? '' : ', '}${FORCE[p.force][zh() ? 0 : 1]}${zh() ? '' : ', '}${p.shape.map(s => SHAPE[s][zh() ? 0 : 1]).join(zh() ? '' : ' + ')}`; }

  let audioCtx = null;
  function beep() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 70; g.gain.value = 0.0001; o.connect(g); g.connect(audioCtx.destination); const now = audioCtx.currentTime; g.gain.exponentialRampToValueAtTime(0.5, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12); o.start(now); o.stop(now + 0.13); } catch (e) { /* no audio */ } }

  function pulseTrainer(root) {
    let p = randomPulse(), pressure = 0.5, start = performance.now(), raf, lastBeat = -1, sound = false;
    root.innerHTML = `<div class="sim"><div class="card panel"><span class="eyebrow">${pick('把脈訓練器', 'PULSE TRAINER')}</span><h3>${pick('以舉按尋三種指力探脈，再辨識脈象', 'Explore with light, medium and deep pressure, then identify the pulse')}</h3><canvas id="pulseCanvas" width="640" height="220"></canvas><label class="range-row">${pick('指力：舉 ↔ 按', 'Pressure: light ↔ heavy')}<input id="pressure" type="range" min="0" max="1" step="0.01" value="0.5"><output id="pressureOut">${pick('尋', 'mid')}</output></label><div class="row"><button class="button light small" id="soundBtn">🔈 ${pick('脈搏聲', 'pulse sound')}</button><span class="small muted" id="bpmHint"></span></div></div>
      <div class="card panel"><h3>${pick('你的判斷', 'Your reading')}</h3>
      <label>${pick('脈位', 'Depth')}<select id="qDepth">${Object.entries(DEPTH).map(([k, v]) => `<option value="${k}">${v[zh() ? 0 : 1]}</option>`).join('')}</select></label>
      <label>${pick('脈率（一息四至為平；約 60–90／分）', 'Rate (4 beats per breath ≈ 60–90/min is normal)')}<select id="qRate">${Object.entries(RATE).map(([k, v]) => `<option value="${k}">${v[zh() ? 0 : 1]}</option>`).join('')}</select></label>
      <label>${pick('脈力', 'Force')}<select id="qForce">${Object.entries(FORCE).map(([k, v]) => `<option value="${k}">${v[zh() ? 0 : 1]}</option>`).join('')}</select></label>
      <fieldset><legend>${pick('脈形（可複選）', 'Shape (multiple)')}</legend><div class="row">${Object.entries(SHAPE).map(([k, v]) => `<label class="chip" style="font-weight:400"><input type="checkbox" value="${k}" style="width:auto;margin-right:4px">${v[zh() ? 0 : 1]}</label>`).join('')}</div></fieldset>
      <div class="row"><button class="button primary" id="pulseSubmit">${window.HT.i18n.t('submitAnswer')}</button><button class="button light" id="pulseNext">${pick('下一個脈象', 'Next pulse')}</button></div><div id="pulseResult" style="margin-top:12px"></div></div></div>`;
    const canvas = root.querySelector('#pulseCanvas'), ctx = canvas.getContext('2d');
    const draw = () => { const time = (performance.now() - start) / 1000; pulseWave(ctx, canvas.width, canvas.height, p, pressure, time); const beat = Math.floor(time / (60 / p.bpm)); if (sound && beat !== lastBeat) { lastBeat = beat; beep(); } raf = requestAnimationFrame(draw); };
    draw();
    root.querySelector('#pressure').oninput = e => { pressure = Number(e.target.value); root.querySelector('#pressureOut').textContent = pressure < 0.33 ? pick('舉', 'light') : pressure > 0.66 ? pick('按', 'heavy') : pick('尋', 'mid'); };
    root.querySelector('#soundBtn').onclick = () => { sound = !sound; root.querySelector('#soundBtn').textContent = (sound ? '🔊 ' : '🔈 ') + pick('脈搏聲', 'pulse sound'); };
    root.querySelector('#pulseNext').onclick = () => { p = randomPulse(); start = performance.now(); root.querySelector('#pulseResult').innerHTML = ''; root.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false); };
    root.querySelector('#pulseSubmit').onclick = () => {
      const d = root.querySelector('#qDepth').value, r = root.querySelector('#qRate').value, f = root.querySelector('#qForce').value, s = [...root.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
      let score = 0; score += d === p.depth ? 30 : 0; score += r === p.rate ? 20 : 0; score += f === p.force ? 20 : 0;
      const hit = s.filter(x => p.shape.includes(x)).length, miss = s.filter(x => !p.shape.includes(x)).length; score += Math.max(0, Math.round(30 * (hit / p.shape.length) - 10 * miss));
      root.querySelector('#pulseResult').innerHTML = `<div class="notice"><span class="score">${score} / 100</span><br>${pick('正確脈象：', 'Correct pulse: ')}<b>${esc(pulseLabel(p))}</b> · ${p.bpm} bpm<br><span class="small muted">${p.shape.map(x => SHAPE_DESC[x][zh() ? 0 : 1]).join('；')}</span></div>`;
      window.HT.app.recordSim('pulse', score);
    };
    return () => cancelAnimationFrame(raf);
  }

  // ---------------------------------------------------------------- tongue model
  const TB = { pale: ['淡白', 'pale', '#e9b7b7'], normal: ['淡紅', 'pale red (normal)', '#e08a8a'], red: ['紅', 'red', '#d85a5a'], crimson: ['絳', 'crimson', '#b62f3a'], purple: ['紫暗', 'purple / dusky', '#8c4a6a'] };
  const TC = { white: ['白', 'white', 'rgba(255,255,255,.85)'], yellow: ['黃', 'yellow', 'rgba(230,200,90,.85)'], grey: ['灰黑', 'grey-black', 'rgba(90,90,90,.75)'], none: ['無苔／剝落', 'absent / peeled', 'transparent'] };
  const TQ = { thin: ['薄', 'thin'], thick: ['厚', 'thick'], greasy: ['膩', 'greasy'], dry: ['燥', 'dry'] };
  const TS = { swollen: ['胖大齒痕', 'swollen with tooth marks'], thin: ['瘦薄', 'thin'], cracked: ['裂紋', 'cracked'], prickly: ['芒刺', 'prickly'], normal: ['正常', 'normal'] };
  function tongueSvg(t, size) {
    const body = TB[t.body][2];
    const uid = 'tg' + Math.random().toString(36).slice(2, 8);
    const coatColor = TC[t.coat][2];
    const thick = t.quality === 'thick' || t.quality === 'greasy';
    const w = t.shape === 'swollen' ? 1.12 : t.shape === 'thin' ? 0.82 : 1;
    const outline = `M100 22 C${100 + 56 * w} 22 ${100 + 66 * w} 70 ${100 + 60 * w} 118 C${100 + 55 * w} 160 ${100 + 32 * w} 186 100 186 C${100 - 32 * w} 186 ${100 - 55 * w} 160 ${100 - 60 * w} 118 C${100 - 66 * w} 70 ${100 - 56 * w} 22 100 22 Z`;
    const coat = t.coat === 'none' ? `<path d="M${100 - 30 * w} 50 C100 44 100 44 ${100 + 30 * w} 50 L${100 + 26 * w} 100 C100 110 100 110 ${100 - 26 * w} 100 Z" fill="rgba(200,60,60,.25)" opacity=".7"/>` : `<path d="M${100 - 46 * w} 36 C100 28 100 28 ${100 + 46 * w} 36 C${100 + 52 * w} 80 ${100 + 44 * w} 120 ${100 + 24 * w} 150 C100 160 100 160 ${100 - 24 * w} 150 C${100 - 44 * w} 120 ${100 - 52 * w} 80 ${100 - 46 * w} 36 Z" fill="url(#${uid})" opacity="${thick ? 0.97 : 0.6}"/>${t.quality === 'greasy' ? `<path d="M${100 - 30 * w} 60 Q100 70 ${100 + 30 * w} 60 M${100 - 32 * w} 88 Q100 98 ${100 + 32 * w} 88 M${100 - 24 * w} 116 Q100 126 ${100 + 24 * w} 116" stroke="rgba(0,0,0,.09)" stroke-width="7" fill="none" stroke-linecap="round"/>` : ''}${t.quality === 'dry' ? `<g stroke="rgba(120,60,40,.5)" stroke-width="1.6" fill="none">${[...Array(14)].map((_, i) => `<path d="M${72 + (i * 29) % 56} ${48 + (i * 17) % 90} l${(i % 2 ? 5 : -4)} 7"/>`).join('')}</g>` : ''}`;
    const marks = (t.shape === 'swollen' ? `<path d="M${100 - 58 * w} 60 q7 10 0 20 q7 10 0 20 q7 10 0 20 q7 10 0 20 M${100 + 58 * w} 60 q-7 10 0 20 q-7 10 0 20 q-7 10 0 20 q-7 10 0 20" stroke="rgba(120,40,40,.55)" stroke-width="3" fill="none"/>` : '') + (t.shape === 'cracked' ? '<path d="M100 44 v118 M84 86 l16 22 M118 100 l-18 20 M90 130 l10 12" stroke="rgba(110,30,30,.7)" stroke-width="2" fill="none"/>' : '') + (t.shape === 'prickly' ? '<g fill="#b3202a">' + [...Array(22)].map((_, i) => `<circle cx="${64 + (i * 37) % 72}" cy="${56 + (i * 23) % 120}" r="2.4"/>`).join('') + '</g>' : '');
    return `<svg class="tongue-svg" viewBox="0 0 200 200" width="${size || 220}" height="${size || 220}" role="img"><defs><radialGradient id="${uid}" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="${coatColor}"/><stop offset="70%" stop-color="${coatColor}"/><stop offset="100%" stop-color="${coatColor.replace(/[\d.]+\)$/, '0)')}"/></radialGradient><linearGradient id="${uid}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,.25)"/><stop offset="100%" stop-color="rgba(0,0,0,.12)"/></linearGradient></defs><path d="M30 8 Q100 -6 170 8" stroke="#8a3f46" stroke-width="3" fill="none" opacity=".4"/><path d="${outline}" fill="${body}" stroke="#7a2e36" stroke-width="2"/><path d="${outline}" fill="url(#${uid}s)"/><path d="M100 60 v112" stroke="rgba(120,40,40,.28)" stroke-width="2.2" stroke-linecap="round"/>${coat}${marks}</svg>`;
  }
  function randomTongue() { const body = choice(Object.keys(TB)); const coat = choice(['white', 'white', 'yellow', 'yellow', 'grey', 'none']); const quality = coat === 'none' ? 'thin' : choice(Object.keys(TQ)); const shape = choice(['normal', 'normal', 'swollen', 'thin', 'cracked', 'prickly']); return { body, coat, quality, shape }; }
  function tongueMeaning(t) {
    const m = [];
    m.push({ pale: pick('淡白：氣血兩虛或陽虛', 'Pale: qi–blood or yang deficiency'), normal: pick('淡紅：正常或病輕', 'Pale red: normal or mild'), red: pick('紅：實熱或陰虛內熱', 'Red: heat or yin-deficiency heat'), crimson: pick('絳：熱入營血', 'Crimson: heat in ying/blood'), purple: pick('紫暗：血瘀或寒凝', 'Purple: stasis or cold') }[t.body]);
    m.push({ white: pick('白苔：表證、寒證', 'White coating: exterior or cold'), yellow: pick('黃苔：裡熱', 'Yellow: interior heat'), grey: pick('灰黑苔：裡熱極或寒極', 'Grey-black: extreme heat or cold'), none: pick('無苔／剝落：胃陰虛', 'Absent/peeled: stomach yin deficiency') }[t.coat]);
    if (t.coat !== 'none') m.push({ thin: pick('薄：邪淺', 'thin: shallow pathogen'), thick: pick('厚：邪盛入裡', 'thick: pathogen entering the interior'), greasy: pick('膩：痰濕食積', 'greasy: phlegm-damp or food'), dry: pick('燥：津傷', 'dry: fluid damage') }[t.quality]);
    m.push({ swollen: pick('胖大齒痕：脾虛濕盛', 'swollen/tooth-marked: spleen deficiency with damp'), thin: pick('瘦薄：氣血陰虛', 'thin: qi–blood–yin deficiency'), cracked: pick('裂紋：陰虛或熱盛', 'cracked: yin deficiency or heat'), prickly: pick('芒刺：熱極', 'prickly: extreme heat'), normal: '' }[t.shape]);
    return m.filter(Boolean).join('；');
  }
  function tongueTrainer(root) {
    let t = randomTongue();
    const sel = (id, obj) => `<select id="${id}">${Object.entries(obj).map(([k, v]) => `<option value="${k}">${v[zh() ? 0 : 1]}</option>`).join('')}</select>`;
    root.innerHTML = `<div class="sim"><div class="card panel"><span class="eyebrow">${pick('舌診訓練器', 'TONGUE TRAINER')}</span><div id="tongueView">${tongueSvg(t, 260)}</div><p class="small muted">${pick('觀察舌質顏色、形態與舌苔的顏色、厚薄、潤燥。', 'Observe body colour and shape, and the coating colour, thickness and moisture.')}</p></div>
      <div class="card panel"><h3>${pick('你的判讀', 'Your reading')}</h3><label>${pick('舌質', 'Tongue body')}${sel('qBody', TB)}</label><label>${pick('舌形', 'Shape')}${sel('qShape', TS)}</label><label>${pick('苔色', 'Coating colour')}${sel('qCoat', TC)}</label><label>${pick('苔質', 'Coating quality')}${sel('qQuality', TQ)}</label><div class="row"><button class="button primary" id="tongueSubmit">${window.HT.i18n.t('submitAnswer')}</button><button class="button light" id="tongueNext">${pick('下一個舌象', 'Next tongue')}</button></div><div id="tongueResult" style="margin-top:12px"></div></div></div>`;
    root.querySelector('#tongueNext').onclick = () => { t = randomTongue(); root.querySelector('#tongueView').innerHTML = tongueSvg(t, 260); root.querySelector('#tongueResult').innerHTML = ''; };
    root.querySelector('#tongueSubmit').onclick = () => {
      let s = 0; if (root.querySelector('#qBody').value === t.body) s += 35; if (root.querySelector('#qShape').value === t.shape) s += 20; if (root.querySelector('#qCoat').value === t.coat) s += 25; if (t.coat === 'none' || root.querySelector('#qQuality').value === t.quality) s += 20;
      root.querySelector('#tongueResult').innerHTML = `<div class="notice"><span class="score">${s} / 100</span><br><b>${esc(TB[t.body][zh() ? 0 : 1])} · ${esc(TS[t.shape][zh() ? 0 : 1])} · ${esc(TC[t.coat][zh() ? 0 : 1])}${t.coat !== 'none' ? ' · ' + esc(TQ[t.quality][zh() ? 0 : 1]) : ''}</b><br><span class="small">${esc(tongueMeaning(t))}</span></div>`;
      window.HT.app.recordSim('tongue', s);
    };
  }

  // ---------------------------------------------------------------- virtual clinic cases
  const PATTERNS = {
    'wind-cold': ['風寒束表', 'Wind-cold binding the exterior'], 'wind-heat': ['風熱犯肺', 'Wind-heat invading the lung'], 'summer-damp': ['暑濕感冒', 'Summer-heat with damp'],
    'phlegm-damp-lung': ['痰濕蘊肺', 'Phlegm-damp in the lung'], 'phlegm-heat-lung': ['痰熱壅肺', 'Phlegm-heat in the lung'], 'lung-yin-def': ['肺陰虧虛', 'Lung yin deficiency'],
    'liver-stomach': ['肝氣犯胃', 'Liver qi invading the stomach'], 'spleen-cold': ['脾胃虛寒', 'Spleen–stomach deficiency cold'], 'stomach-yin': ['胃陰不足', 'Stomach yin deficiency'],
    'heart-spleen': ['心脾兩虛', 'Heart–spleen deficiency'], 'liver-fire-heart': ['肝火擾心', 'Liver fire harassing the heart'], 'heart-kidney': ['心腎不交', 'Heart–kidney disharmony'],
    'liver-yang': ['肝陽上亢', 'Ascending liver yang'], 'phlegm-damp-mid': ['痰濕中阻', 'Phlegm-damp obstructing the middle'], 'qi-blood-def': ['氣血虧虛', 'Qi–blood deficiency'],
    'cold-damp-bi': ['寒濕痹阻', 'Cold-damp bi'], 'kidney-def-lbp': ['腎虛腰痛', 'Kidney-deficiency low back pain'], 'stasis-lbp': ['瘀血腰痛', 'Blood-stasis low back pain'],
    'qi-stag-stasis': ['氣滯血瘀', 'Qi stagnation with blood stasis'], 'cold-congeal': ['寒凝血瘀', 'Cold congealing with stasis'], 'qi-blood-def-menses': ['氣血虛弱', 'Qi–blood deficiency (menses)'],
    'spleen-def-child': ['脾虛', 'Spleen deficiency (child)'], 'food-stag': ['乳食積滯', 'Food stagnation'],
    'wind-yang-tremor': ['風陽內動', 'Internal wind from yang'], 'marrow-def': ['髓海不足', 'Marrow insufficiency'], 'qi-def-stasis': ['氣虛血瘀', 'Qi deficiency with stasis'],
    'qi-yin-def': ['氣陰兩虛', 'Qi–yin deficiency'], 'kidney-yin-def': ['腎陰虧虛', 'Kidney yin deficiency'],
  };
  const FORMULAS = ['麻黃湯', '桂枝湯', '荊防敗毒散', '銀翹散', '桑菊飲', '新加香薷飲', '二陳湯', '清氣化痰丸', '沙參麥冬湯', '柴胡疏肝散', '黃芪建中湯', '益胃湯', '歸脾湯', '龍膽瀉肝湯', '交泰丸', '天麻鉤藤飲', '半夏白朮天麻湯', '八珍湯', '獨活寄生湯', '左歸丸', '身痛逐瘀湯', '膈下逐瘀湯', '少腹逐瘀湯', '聖愈湯', '參苓白朮散', '保和丸', '鎮肝熄風湯', '補陽還五湯', '生脈散', '六味地黃丸', '血府逐瘀湯', '補中益氣湯'];
  const C = (id, profile, cc, ccEn, inspect, inspectEn, tongue, listen, listenEn, inquiry, inquiryEn, pulse, pattern, formula, points, principle, principleEn) => ({ id, profile, cc, ccEn, inspect, inspectEn, tongue, listen, listenEn, inquiry, inquiryEn, pulse, pattern, formula, points, principle, principleEn });
  const CASES = [
    C('cold-1', { age: 28, sex: 'M', job: '工程師 / engineer' }, '昨日淋雨後惡寒發熱、頭痛、無汗、周身痠痛，鼻塞流清涕', 'Chills and fever since getting caught in rain yesterday, headache, no sweating, body aches, clear nasal discharge', '面色稍白，精神尚可，裹衣', 'Slightly pale, alert, wrapped in clothing', { body: 'normal', coat: 'white', quality: 'thin', shape: 'normal' }, '聲音正常，無口氣', 'Normal voice, no odour', ['惡寒重發熱輕，無汗', '頭痛、肢體痠痛', '二便正常', '不渴', '食慾稍差', '睡眠可'], ['chills > fever, no sweat', 'headache, limb aches', 'bowel/bladder normal', 'no thirst', 'appetite slightly reduced', 'sleep fine'], { depth: 'floating', rate: 'normal', bpm: 78, force: 'strong', shape: ['tight'] }, 'wind-cold', '荊防敗毒散', ['GB20', 'LI4', 'LU7', 'GV14', 'BL12'], '辛溫解表，宣肺散寒', 'Release the exterior with warm acrid herbs; diffuse the lung and dispel cold'),
    C('cold-2', { age: 34, sex: 'F', job: '教師 / teacher' }, '發熱微惡風兩天，咽喉腫痛，咳嗽痰黃，口渴', 'Two days of fever with mild aversion to wind, sore swollen throat, cough with yellow sputum, thirst', '面赤，咽紅', 'Flushed face, red throat', { body: 'red', coat: 'yellow', quality: 'thin', shape: 'normal' }, '聲音略啞，咳聲重濁', 'Slightly hoarse, heavy cough', ['發熱重惡寒輕，微汗', '頭脹痛', '小便黃', '口渴喜冷飲', '食慾可', '睡眠可'], ['fever > chills, slight sweat', 'distending headache', 'yellow urine', 'thirst for cold drinks', 'appetite ok', 'sleep ok'], { depth: 'floating', rate: 'rapid', bpm: 102, force: 'strong', shape: ['slippery'] }, 'wind-heat', '銀翹散', ['LI4', 'LI11', 'LU11', 'GV14', 'TE5'], '辛涼解表，清熱利咽', 'Release the exterior with cool acrid herbs; clear heat and benefit the throat'),
    C('cough-1', { age: 56, sex: 'M', job: '司機 / driver' }, '咳嗽三個月，痰多色白易咯，胸悶，體胖', 'Three months of cough with copious white sputum easily expectorated, chest oppression, overweight', '形體肥胖，面色淡黃', 'Obese, sallow complexion', { body: 'pale', coat: 'white', quality: 'greasy', shape: 'swollen' }, '痰聲轆轆', 'Rattling phlegm sounds', ['無寒熱', '痰多色白', '大便偏溏', '不渴', '食少脘痞', '嗜睡'], ['no chills/fever', 'copious white sputum', 'loose stool', 'no thirst', 'poor appetite with fullness', 'somnolence'], { depth: 'middle', rate: 'normal', bpm: 72, force: 'normal', shape: ['slippery', 'moderate'] }, 'phlegm-damp-lung', '二陳湯', ['ST40', 'LU5', 'CV12', 'BL13', 'BL20'], '燥濕化痰，理氣止咳', 'Dry damp, transform phlegm, regulate qi and stop cough'),
    C('cough-2', { age: 45, sex: 'F', job: '護理師 / nurse' }, '咳嗽半年，乾咳少痰、痰中帶血絲，午後潮熱、盜汗', 'Six months of dry cough with scant blood-streaked sputum, afternoon tidal fever, night sweats', '形體消瘦，兩顴潮紅', 'Thin, malar flush', { body: 'red', coat: 'none', quality: 'thin', shape: 'thin' }, '咳聲短促', 'Short dry cough', ['午後潮熱', '盜汗', '大便乾', '口乾咽燥', '食慾差', '失眠'], ['afternoon tidal fever', 'night sweats', 'dry stool', 'dry mouth and throat', 'poor appetite', 'insomnia'], { depth: 'middle', rate: 'rapid', bpm: 96, force: 'weak', shape: ['fine'] }, 'lung-yin-def', '沙參麥冬湯', ['BL13', 'LU9', 'KI6', 'BL43', 'SP6'], '滋陰潤肺，止咳化痰（需排除結核與腫瘤）', 'Nourish yin, moisten the lung (exclude TB and malignancy)'),
    C('stomach-1', { age: 38, sex: 'F', job: '業務 / sales' }, '胃脘脹痛半年，痛連兩脅，情緒緊張時加重，噯氣頻繁', 'Six months of epigastric distending pain radiating to both flanks, worse with stress, frequent belching', '面色正常，神情焦慮', 'Normal colour, anxious', { body: 'normal', coat: 'white', quality: 'thin', shape: 'normal' }, '噯氣頻作，太息', 'Frequent belching and sighing', ['無寒熱', '胸脅脹悶', '大便時溏時結', '不渴', '食慾隨情緒', '多夢'], ['no chills/fever', 'chest and flank fullness', 'alternating stool', 'no thirst', 'appetite varies with mood', 'dream-disturbed sleep'], { depth: 'middle', rate: 'normal', bpm: 76, force: 'normal', shape: ['wiry'] }, 'liver-stomach', '柴胡疏肝散', ['LR3', 'PC6', 'CV12', 'ST36', 'LR14'], '疏肝理氣，和胃止痛', 'Course the liver, regulate qi, harmonise the stomach'),
    C('stomach-2', { age: 62, sex: 'M', job: '退休 / retired' }, '胃痛隱隱十年，喜溫喜按，空腹痛甚，得食則緩，泛吐清水', 'Ten years of dull stomach pain relieved by warmth and pressure, worse on an empty stomach, vomiting clear fluid', '面色萎黃，神疲', 'Sallow, fatigued', { body: 'pale', coat: 'white', quality: 'thin', shape: 'swollen' }, '語聲低微', 'Low weak voice', ['畏寒肢冷', '神疲乏力', '大便溏', '不渴', '食少', '睡眠尚可'], ['cold intolerance, cold limbs', 'fatigue', 'loose stool', 'no thirst', 'poor appetite', 'sleep ok'], { depth: 'deep', rate: 'slow', bpm: 54, force: 'weak', shape: ['fine'] }, 'spleen-cold', '黃芪建中湯', ['CV12', 'ST36', 'BL20', 'BL21', 'CV6'], '溫中健脾，和胃止痛', 'Warm the middle, fortify the spleen, harmonise the stomach'),
    C('insomnia-1', { age: 41, sex: 'F', job: '會計 / accountant' }, '入睡困難、多夢易醒三個月，心悸健忘，神疲食少', 'Three months of difficulty falling asleep, dream-disturbed sleep, palpitations, forgetfulness, fatigue and poor appetite', '面色無華', 'Lustreless complexion', { body: 'pale', coat: 'white', quality: 'thin', shape: 'normal' }, '聲低', 'Low voice', ['無寒熱', '頭暈', '大便溏', '不渴', '食少腹脹', '多夢易醒'], ['no chills/fever', 'dizziness', 'loose stool', 'no thirst', 'poor appetite with bloating', 'wakes easily'], { depth: 'middle', rate: 'normal', bpm: 70, force: 'weak', shape: ['fine'] }, 'heart-spleen', '歸脾湯', ['HT7', 'SP6', 'BL15', 'BL20', 'EX-HN16'], '補益心脾，養血安神', 'Tonify heart and spleen, nourish blood, calm the spirit'),
    C('insomnia-2', { age: 36, sex: 'M', job: '主管 / manager' }, '不寐、急躁易怒一個月，頭脹目赤，口苦，小便黃', 'One month of insomnia with irritability, head distension, red eyes, bitter taste, yellow urine', '面紅目赤', 'Red face and eyes', { body: 'red', coat: 'yellow', quality: 'thin', shape: 'normal' }, '聲高氣粗', 'Loud forceful voice', ['無寒熱', '頭脹痛', '便秘尿黃', '口苦口渴', '食慾可', '徹夜難眠'], ['no chills/fever', 'head distension', 'constipation, yellow urine', 'bitter taste, thirst', 'appetite ok', 'sleepless all night'], { depth: 'middle', rate: 'rapid', bpm: 94, force: 'strong', shape: ['wiry'] }, 'liver-fire-heart', '龍膽瀉肝湯', ['LR2', 'HT7', 'GB20', 'EX-HN3', 'KI1'], '清肝瀉火，鎮心安神', 'Clear liver fire, settle the heart'),
    C('dizzy-1', { age: 58, sex: 'F', job: '家管 / homemaker' }, '眩暈耳鳴半年，每因惱怒加重，頭脹痛，面紅，血壓 160/95', 'Six months of dizziness and tinnitus worse with anger, head distension, flushed face, BP 160/95', '面紅，體格壯實', 'Flushed, robust build', { body: 'red', coat: 'yellow', quality: 'thin', shape: 'normal' }, '語聲高亢', 'Loud voice', ['無寒熱', '頭脹目眩', '便秘', '口苦', '食慾可', '少寐多夢'], ['no chills/fever', 'head distension, vertigo', 'constipation', 'bitter taste', 'appetite ok', 'little sleep with dreams'], { depth: 'middle', rate: 'normal', bpm: 82, force: 'strong', shape: ['wiry'] }, 'liver-yang', '天麻鉤藤飲', ['GB20', 'LR3', 'KI3', 'GV20', 'LI11'], '平肝潛陽，滋養肝腎（配合血壓監測與西藥）', 'Calm the liver, subdue yang, nourish liver–kidney (with BP monitoring and medication)'),
    C('dizzy-2', { age: 50, sex: 'M', job: '廚師 / chef' }, '眩暈頭重如裹，胸悶噁心，嗜睡，體胖', 'Dizziness with a heavy, wrapped head, chest oppression, nausea, somnolence, overweight', '形體肥胖，面色淡', 'Obese, pale complexion', { body: 'pale', coat: 'white', quality: 'greasy', shape: 'swollen' }, '痰多', 'Copious phlegm', ['無寒熱', '頭重', '大便溏', '不渴', '食少多寐', '嗜睡'], ['no chills/fever', 'heavy head', 'loose stool', 'no thirst', 'poor appetite', 'somnolence'], { depth: 'middle', rate: 'normal', bpm: 74, force: 'normal', shape: ['slippery', 'moderate'] }, 'phlegm-damp-mid', '半夏白朮天麻湯', ['ST40', 'CV12', 'GV20', 'PC6', 'SP9'], '化痰祛濕，健脾和胃', 'Transform phlegm, dispel damp, fortify the spleen'),
    C('lbp-1', { age: 47, sex: 'M', job: '搬運工 / mover' }, '腰部冷痛重著一週，陰雨加重，轉側不利', 'One week of cold heavy low back pain, worse in damp weather, difficulty turning', '面色正常，行動遲緩', 'Normal colour, moves slowly', { body: 'pale', coat: 'white', quality: 'greasy', shape: 'normal' }, '無特殊', 'Nothing special', ['畏寒', '腰痛重著', '二便正常', '不渴', '食慾可', '睡眠可'], ['cold intolerance', 'heavy back pain', 'bowel/bladder normal', 'no thirst', 'appetite ok', 'sleep ok'], { depth: 'deep', rate: 'normal', bpm: 70, force: 'normal', shape: ['tight'] }, 'cold-damp-bi', '獨活寄生湯', ['BL23', 'BL40', 'GV3', 'BL25', 'EX-B7'], '散寒除濕，溫經通絡（配合灸法）', 'Dispel cold-damp, warm the channels (with moxibustion)'),
    C('lbp-2', { age: 66, sex: 'F', job: '退休 / retired' }, '腰痛痠軟五年，反覆發作，勞累加重，臥則減輕，膝軟', 'Five years of recurrent sore weak low back pain, worse with exertion, better lying down, weak knees', '面色淡，精神不振', 'Pale, listless', { body: 'pale', coat: 'white', quality: 'thin', shape: 'normal' }, '聲低', 'Low voice', ['手足不溫', '腰膝痠軟', '夜尿多', '不渴', '食慾可', '睡眠淺'], ['cool hands and feet', 'sore weak back and knees', 'nocturia', 'no thirst', 'appetite ok', 'light sleep'], { depth: 'deep', rate: 'normal', bpm: 66, force: 'weak', shape: ['fine'] }, 'kidney-def-lbp', '左歸丸', ['BL23', 'KI3', 'GV4', 'CV4', 'BL52'], '補腎益精，強腰壯骨', 'Tonify the kidney, boost essence, strengthen the back'),
    C('menses-1', { age: 24, sex: 'F', job: '學生 / student' }, '經前及經期小腹脹痛拒按三年，經血色暗有塊，塊下痛減，乳房脹', 'Three years of premenstrual and menstrual distending lower-abdominal pain refusing pressure, dark clotted blood, pain eases after clots pass, breast distension', '面色正常，眉頭緊鎖', 'Normal colour, frowning', { body: 'purple', coat: 'white', quality: 'thin', shape: 'normal' }, '太息', 'Sighing', ['無寒熱', '小腹脹痛', '二便正常', '不渴', '食慾可', '經期煩躁'], ['no chills/fever', 'lower abdominal distension', 'normal', 'no thirst', 'appetite ok', 'irritable with menses'], { depth: 'middle', rate: 'normal', bpm: 76, force: 'strong', shape: ['wiry', 'rough'] }, 'qi-stag-stasis', '膈下逐瘀湯', ['SP6', 'CV3', 'LR3', 'SP10', 'EX-CA1'], '行氣活血，化瘀止痛', 'Move qi and blood, dispel stasis, relieve pain'),
    C('menses-2', { age: 19, sex: 'F', job: '學生 / student' }, '經期小腹冷痛喜溫，經血量少色暗，手足冷', 'Cold menstrual pain relieved by warmth, scant dark flow, cold hands and feet', '面色青白', 'Pale-bluish complexion', { body: 'pale', coat: 'white', quality: 'thin', shape: 'normal' }, '無特殊', 'Nothing special', ['畏寒', '小腹冷痛', '大便溏', '不渴', '食慾可', '睡眠可'], ['cold intolerance', 'cold lower abdominal pain', 'loose stool', 'no thirst', 'appetite ok', 'sleep ok'], { depth: 'deep', rate: 'slow', bpm: 58, force: 'normal', shape: ['tight'] }, 'cold-congeal', '少腹逐瘀湯', ['CV4', 'SP6', 'ST29', 'CV6', 'SP8'], '溫經散寒，化瘀止痛（配合艾灸）', 'Warm the channels, dispel cold, dispel stasis (with moxibustion)'),
    C('child-1', { age: 4, sex: 'M', job: '幼兒 / toddler' }, '厭食三個月，面黃肌瘦，大便溏，易感冒', 'Three months of poor appetite, sallow thin, loose stool, frequent colds', '面黃肌瘦，神疲', 'Sallow and thin, tired', { body: 'pale', coat: 'white', quality: 'thin', shape: 'swollen' }, '聲低', 'Quiet voice', ['易汗', '無特殊', '大便溏', '不渴', '不思食', '睡眠可'], ['sweats easily', 'nothing special', 'loose stool', 'no thirst', 'no desire to eat', 'sleep ok'], { depth: 'middle', rate: 'normal', bpm: 96, force: 'weak', shape: ['fine', 'moderate'] }, 'spleen-def-child', '參苓白朮散', ['ST36', 'BL20', 'CV12', 'EX-UE10', 'SP6'], '健脾益氣（配合小兒推拿：補脾經、摩腹、捏脊）', 'Fortify the spleen (with paediatric tuina: spleen channel, abdominal rubbing, spinal pinching)'),
    C('parkinson-1', { age: 68, sex: 'M', job: '退休教授 / retired professor' }, '右手靜止性顫抖兩年，動作遲緩，步態小碎，頭暈耳鳴，腰膝痠軟；已服左旋多巴', 'Two years of right-hand resting tremor, bradykinesia, shuffling gait, dizziness, tinnitus, sore weak back and knees; on levodopa', '面具臉，形體消瘦', 'Masked face, thin', { body: 'red', coat: 'none', quality: 'thin', shape: 'thin' }, '語聲低微單調', 'Low monotone voice', ['五心煩熱', '頭暈耳鳴', '便秘', '口乾', '食慾可', '失眠多夢'], ['heat in palms and soles', 'dizziness and tinnitus', 'constipation', 'dry mouth', 'appetite ok', 'insomnia with dreams'], { depth: 'middle', rate: 'normal', bpm: 72, force: 'weak', shape: ['wiry', 'fine'] }, 'marrow-def', '左歸丸', ['GB20', 'GV20', 'LR3', 'KI3', 'GB34'], '滋補肝腎，填精益髓，息風止顫（配合神經科治療與 DBS 評估）', 'Nourish liver–kidney, fill marrow, extinguish wind (alongside neurology care and DBS evaluation)'),
    C('stroke-1', { age: 63, sex: 'F', job: '退休 / retired' }, '中風後三個月左側肢體無力，手足腫脹，面色萎黃，氣短乏力', 'Three months after stroke: left-sided weakness, swollen hand and foot, sallow, short of breath and fatigued', '面色萎黃，左側肢體痿軟', 'Sallow, flaccid left limbs', { body: 'pale', coat: 'white', quality: 'thin', shape: 'swollen' }, '語聲低怯', 'Low timid voice', ['自汗', '肢體麻木', '大便溏', '不渴', '食少', '睡眠可'], ['spontaneous sweating', 'limb numbness', 'loose stool', 'no thirst', 'poor appetite', 'sleep ok'], { depth: 'deep', rate: 'normal', bpm: 70, force: 'weak', shape: ['fine', 'rough'] }, 'qi-def-stasis', '補陽還五湯', ['LI15', 'LI11', 'LI4', 'GB30', 'ST36'], '益氣活血，通經活絡（配合復健與頭皮針）', 'Boost qi, quicken blood, free the channels (with rehabilitation and scalp acupuncture)'),
    C('diabetes-1', { age: 55, sex: 'M', job: '商人 / businessman' }, '口渴多飲、多尿半年，疲乏無力，體重減輕，空腹血糖 168 mg/dL', 'Six months of thirst, polydipsia, polyuria, fatigue, weight loss; fasting glucose 168 mg/dL', '形體偏瘦，面色少華', 'Thin, dull complexion', { body: 'red', coat: 'none', quality: 'dry', shape: 'thin' }, '無特殊', 'Nothing special', ['五心煩熱', '神疲乏力', '便乾尿頻', '口渴多飲', '多食易飢', '睡眠尚可'], ['heat in palms and soles', 'fatigue', 'dry stool, frequent urine', 'thirst', 'hunger', 'sleep ok'], { depth: 'middle', rate: 'rapid', bpm: 92, force: 'weak', shape: ['fine'] }, 'qi-yin-def', '生脈散', ['BL20', 'BL23', 'SP6', 'KI3', 'EX-B3'], '益氣養陰，生津止渴（配合血糖監測與內分泌治療）', 'Boost qi and nourish yin (with glucose monitoring and endocrine care)'),
  ];
  const INQUIRY = [['寒熱', 'Cold/heat'], ['頭身', 'Head/body'], ['二便', 'Stool/urine'], ['口渴', 'Thirst'], ['飲食', 'Appetite'], ['睡眠', 'Sleep']];

  function clinic(root) {
    let c = choice(CASES), stepI = 0, answers = {}, stop = null;
    const steps = ['望', '聞', '問', '切', '辨證', '治法處方', '結果'];
    const stepsEn = ['Inspection', 'Listening', 'Inquiry', 'Pulse', 'Pattern', 'Treatment', 'Result'];
    function header() { return `<div class="row" style="justify-content:space-between"><div><span class="eyebrow">${pick('中醫實習門診 · 病例', 'TCM INTERNSHIP CLINIC · CASE')} ${esc(c.id)}</span><h3 data-no-translate>${c.profile.age} ${pick('歲', 'y')} · ${c.profile.sex === 'F' ? pick('女', 'F') : pick('男', 'M')} · ${esc(c.profile.job)}</h3><p><b>${pick('主訴：', 'Chief complaint: ')}</b>${esc(pick(c.cc, c.ccEn))}</p></div><div class="row">${steps.map((s, i) => `<span class="chip ${i === stepI ? 'active' : ''}">${pick(s, stepsEn[i])}</span>`).join('')}</div></div>`; }
    function render() {
      if (stop) { stop(); stop = null; }
      let body = '';
      if (stepI === 0) body = `<div class="sim"><div class="card panel"><h4>${pick('望診', 'Inspection')}</h4><p>${esc(pick(c.inspect, c.inspectEn))}</p>${tongueSvg(c.tongue, 220)}</div><div class="card panel"><h4>${pick('記錄舌象', 'Record the tongue')}</h4><label>${pick('舌質', 'Body')}<select id="aBody">${Object.entries(TB).map(([k, v]) => `<option value="${k}">${v[zh() ? 0 : 1]}</option>`).join('')}</select></label><label>${pick('苔色', 'Coating')}<select id="aCoat">${Object.entries(TC).map(([k, v]) => `<option value="${k}">${v[zh() ? 0 : 1]}</option>`).join('')}</select></label><label>${pick('苔質', 'Quality')}<select id="aQuality">${Object.entries(TQ).map(([k, v]) => `<option value="${k}">${v[zh() ? 0 : 1]}</option>`).join('')}</select></label><button class="button primary" id="nextStep">${pick('下一步：聞診', 'Next: listening')}</button></div></div>`;
      else if (stepI === 1) body = `<div class="card panel"><h4>${pick('聞診（聲音與氣味）', 'Listening and smelling')}</h4><p>${esc(pick(c.listen, c.listenEn))}</p><button class="button primary" id="nextStep">${pick('下一步：問診', 'Next: inquiry')}</button></div>`;
      else if (stepI === 2) body = `<div class="card panel"><h4>${pick('問診：十問歌（點選問題取得回答）', 'Inquiry: the ten questions (click to ask)')}</h4><div class="row" id="askRow">${INQUIRY.map((q, i) => `<button class="chip" data-ask="${i}">${pick(q[0], q[1])}</button>`).join('')}</div><ul id="askLog" class="small" style="margin-top:10px"></ul><button class="button primary" id="nextStep">${pick('下一步：切診', 'Next: pulse')}</button></div>`;
      else if (stepI === 3) body = `<div class="sim"><div class="card panel"><h4>${pick('切診：把脈', 'Pulse')}</h4><canvas id="caseCanvas" width="640" height="200"></canvas><label class="range-row">${pick('指力', 'Pressure')}<input id="casePressure" type="range" min="0" max="1" step="0.01" value="0.5"><output></output></label></div><div class="card panel"><label>${pick('脈位', 'Depth')}<select id="aDepth">${Object.entries(DEPTH).map(([k, v]) => `<option value="${k}">${v[zh() ? 0 : 1]}</option>`).join('')}</select></label><label>${pick('脈率', 'Rate')}<select id="aRate">${Object.entries(RATE).map(([k, v]) => `<option value="${k}">${v[zh() ? 0 : 1]}</option>`).join('')}</select></label><label>${pick('脈力', 'Force')}<select id="aForce">${Object.entries(FORCE).map(([k, v]) => `<option value="${k}">${v[zh() ? 0 : 1]}</option>`).join('')}</select></label><div class="row">${Object.entries(SHAPE).map(([k, v]) => `<label class="chip" style="font-weight:400"><input type="checkbox" value="${k}" style="width:auto;margin-right:4px">${v[zh() ? 0 : 1]}</label>`).join('')}</div><button class="button primary" id="nextStep" style="margin-top:10px">${pick('下一步：辨證', 'Next: pattern')}</button></div></div>`;
      else if (stepI === 4) { const opts = shuffle([c.pattern, ...shuffle(Object.keys(PATTERNS).filter(k => k !== c.pattern)).slice(0, 3)]); body = `<div class="card panel"><h4>${pick('辨證：請選擇最符合的證型', 'Pattern: choose the best fit')}</h4><div class="quiz">${opts.map(o => `<label class="opt"><input type="radio" name="pattern" value="${o}" style="width:auto">${PATTERNS[o][zh() ? 0 : 1]}</label>`).join('')}</div><button class="button primary" id="nextStep">${pick('下一步：治法與處方', 'Next: treatment')}</button></div>`; }
      else if (stepI === 5) { const fx = shuffle([c.formula, ...shuffle(FORMULAS.filter(f => f !== c.formula)).slice(0, 3)]); const pts = shuffle([...c.points, ...shuffle(['LI4', 'ST36', 'SP6', 'PC6', 'GB34', 'LR3', 'CV12', 'BL23', 'GV20', 'HT7', 'KI3', 'ST40', 'CV4', 'GB20', 'LI11', 'BL40'].filter(p => !c.points.includes(p))).slice(0, 4)]); body = `<div class="card panel"><h4>${pick('治法處方', 'Treatment plan')}</h4><label>${pick('主方', 'Formula')}<select id="aFormula">${fx.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select></label><fieldset><legend>${pick('針灸處方（選 3–6 穴）', 'Acupuncture (choose 3–6 points)')}</legend><div class="row">${pts.map(p => `<label class="chip" style="font-weight:400"><input type="checkbox" value="${p}" style="width:auto;margin-right:4px">${p}</label>`).join('')}</div></fieldset><button class="button primary" id="nextStep">${pick('送出並評分', 'Submit for scoring')}</button></div>`; }
      else {
        let s = 0, fb = [];
        const tongueOk = (answers.body === c.tongue.body ? 1 : 0) + (answers.coat === c.tongue.coat ? 1 : 0) + (c.tongue.coat === 'none' || answers.quality === c.tongue.quality ? 1 : 0); s += Math.round(15 * tongueOk / 3); fb.push(`${pick('舌象', 'Tongue')} ${Math.round(15 * tongueOk / 3)}/15`);
        const asked = (answers.asked || []).length; s += Math.min(10, asked * 2); fb.push(`${pick('問診完整度', 'Inquiry completeness')} ${Math.min(10, asked * 2)}/10`);
        const ps = (answers.depth === c.pulse.depth ? 8 : 0) + (answers.rate === c.pulse.rate ? 6 : 0) + (answers.force === c.pulse.force ? 6 : 0) + Math.max(0, Math.round(5 * ((answers.shape || []).filter(x => c.pulse.shape.includes(x)).length / c.pulse.shape.length) - 2 * (answers.shape || []).filter(x => !c.pulse.shape.includes(x)).length)); s += ps; fb.push(`${pick('脈診', 'Pulse')} ${ps}/25`);
        const pat = answers.pattern === c.pattern ? 25 : 0; s += pat; fb.push(`${pick('辨證', 'Pattern')} ${pat}/25`);
        const fxs = answers.formula === c.formula ? 15 : 0; s += fxs; fb.push(`${pick('方劑', 'Formula')} ${fxs}/15`);
        const hit = (answers.points || []).filter(p => c.points.includes(p)).length; const ptsS = Math.min(10, Math.round(10 * hit / Math.min(3, c.points.length))); s += ptsS; fb.push(`${pick('針灸', 'Acupuncture')} ${ptsS}/10`);
        window.HT.app.recordSim('clinic', s);
        body = `<div class="card panel"><span class="score">${s} / 100</span><p>${fb.join(' · ')}</p><div class="kv"><b>${pick('正確證型', 'Pattern')}</b><span>${PATTERNS[c.pattern][zh() ? 0 : 1]}</span><b>${pick('舌象', 'Tongue')}</b><span>${TB[c.tongue.body][zh() ? 0 : 1]} · ${TC[c.tongue.coat][zh() ? 0 : 1]}${c.tongue.coat !== 'none' ? ' · ' + TQ[c.tongue.quality][zh() ? 0 : 1] : ''} · ${TS[c.tongue.shape][zh() ? 0 : 1]}</span><b>${pick('脈象', 'Pulse')}</b><span>${esc(pulseLabel(c.pulse))} · ${c.pulse.bpm} bpm</span><b>${pick('治法', 'Principle')}</b><span>${esc(pick(c.principle, c.principleEn))}</span><b>${pick('主方', 'Formula')}</b><span>${esc(c.formula)}</span><b>${pick('針灸', 'Points')}</b><span>${c.points.join(', ')}</span></div><p class="form-note" style="margin-top:10px">${pick('評分為學習回饋，非臨床能力認證；實際診療須由合格中醫師執行。', 'Scores are learning feedback, not clinical certification; real care must be delivered by licensed practitioners.')}</p><div class="row" style="margin-top:10px"><button class="button primary" id="newCase">${pick('下一位病人', 'Next patient')}</button><button class="button light" id="askMentor">${window.HT.i18n.t('ask')}</button></div></div>`;
      }
      root.innerHTML = header() + body;
      const next = root.querySelector('#nextStep');
      if (stepI === 2) { root.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => { const i = Number(b.dataset.ask); answers.asked = answers.asked || []; if (!answers.asked.includes(i)) answers.asked.push(i); b.classList.add('active'); const li = document.createElement('li'); li.textContent = `${pick(INQUIRY[i][0], INQUIRY[i][1])}：${pick(c.inquiry[i], c.inquiryEn[i])}`; root.querySelector('#askLog').appendChild(li); }); }
      if (stepI === 3) { const cv = root.querySelector('#caseCanvas'), ctx = cv.getContext('2d'); let pr = 0.5, st = performance.now(), raf; const draw = () => { pulseWave(ctx, cv.width, cv.height, c.pulse, pr, (performance.now() - st) / 1000); raf = requestAnimationFrame(draw); }; draw(); root.querySelector('#casePressure').oninput = e => { pr = Number(e.target.value); }; stop = () => cancelAnimationFrame(raf); }
      if (next) next.onclick = () => {
        if (stepI === 0) { answers.body = root.querySelector('#aBody').value; answers.coat = root.querySelector('#aCoat').value; answers.quality = root.querySelector('#aQuality').value; }
        if (stepI === 3) { answers.depth = root.querySelector('#aDepth').value; answers.rate = root.querySelector('#aRate').value; answers.force = root.querySelector('#aForce').value; answers.shape = [...root.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value); }
        if (stepI === 4) { const r = root.querySelector('input[name=pattern]:checked'); if (!r) { window.HT.app.toast(pick('請選擇證型', 'Choose a pattern')); return; } answers.pattern = r.value; }
        if (stepI === 5) { answers.formula = root.querySelector('#aFormula').value; answers.points = [...root.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value); }
        stepI++; render();
      };
      const nc = root.querySelector('#newCase'); if (nc) nc.onclick = () => { c = choice(CASES.filter(x => x !== c)); stepI = 0; answers = {}; render(); };
      const am = root.querySelector('#askMentor'); if (am) am.onclick = () => window.HT.tutor.open({ id: 'case', title: `病例 ${c.id}：${c.cc}`, titleEn: `Case ${c.id}: ${c.ccEn}`, summary: `證型 ${PATTERNS[c.pattern][0]}，主方 ${c.formula}`, summaryEn: `Pattern ${PATTERNS[c.pattern][1]}, formula ${c.formula}` });
    }
    render();
    return () => { if (stop) stop(); };
  }

  // ---------------------------------------------------------------- acupoint locator
  const FRONT = { 'GV20': [100, 14], 'EX-HN3': [100, 34], 'EX-HN5': [84, 36], 'ST8': [84, 24], 'LI20': [94, 46], 'GV26': [100, 50], 'ST6': [86, 54], 'ST7': [82, 46], 'CV22': [100, 76], 'CV17': [100, 112], 'LU1': [72, 84], 'ST25': [88, 158], 'CV12': [100, 142], 'CV8': [100, 160], 'CV6': [100, 170], 'CV4': [100, 178], 'CV3': [100, 186], 'LR14': [80, 122], 'GB24': [82, 130], 'LI15': [54, 86], 'LI11': [44, 128], 'LI10': [42, 136], 'LU5': [52, 126], 'PC6': [40, 180], 'HT7': [44, 192], 'LU7': [38, 186], 'LU9': [40, 194], 'LI4': [34, 204], 'TE5': [36, 182], 'SP10': [84, 232], 'ST34': [78, 234], 'ST35': [78, 252], 'ST36': [78, 268], 'ST40': [76, 300], 'SP9': [86, 262], 'SP6': [92, 322], 'LR3': [86, 354], 'KI3': [92, 338], 'ST41': [82, 342], 'ST44': [80, 360], 'GB41': [74, 358], 'KI1': [88, 366], 'GB34': [70, 262], 'GB39': [72, 322], 'BL2': [92, 32] };
  const BACK = { 'GV14': [100, 68], 'GB20': [90, 52], 'GB21': [74, 72], 'BL13': [92, 90], 'BL15': [92, 100], 'BL18': [92, 120], 'BL20': [92, 132], 'BL23': [92, 150], 'GV4': [100, 150], 'BL25': [92, 162], 'BL40': [78, 246], 'BL57': [78, 300], 'BL60': [74, 338], 'GB30': [68, 180], 'SI11': [76, 96], 'EX-B7': [84, 162], 'GV3': [100, 162], 'BL32': [94, 172], 'BL54': [86, 180], 'BL36': [78, 196], 'BL54b': [0, 0] };
  delete BACK.BL54b;
  function bodySvg(side) {
    const pts = side === 'front' ? FRONT : BACK;
    const outline = '<path d="M100 2a14 14 0 0 1 14 14v12q0 10-8 16l-2 10h18q14 0 20 12l16 70-10 4-14-56v62l-14 8 10 58 2 60 8 30h-18l-10-36-6-50-6 50-10 36h-18l8-30 2-60 10-58-14-8v-62l-14 56-10-4 16-70q6-12 20-12h18l-2-10q-8-6-8-16v-12a14 14 0 0 1 14-14z" fill="rgba(200,160,130,.35)" stroke="var(--ink)" stroke-width="1.2"/>';
    const dots = Object.entries(pts).map(([code, [x, y]]) => `<g class="pt" data-code="${code}"><circle cx="${x}" cy="${y}" r="3" fill="var(--primary)" stroke="var(--surface)" stroke-width="1" opacity=".85"/><circle cx="${200 - x}" cy="${y}" r="3" fill="var(--primary)" stroke="var(--surface)" stroke-width="1" opacity="${['GV', 'CV', 'EX-HN3', 'GV26', 'CV22', 'CV17', 'CV12', 'CV8', 'CV6', 'CV4', 'CV3', 'GV20', 'GV14', 'GV4', 'GV3'].some(p => code.startsWith(p)) ? 0 : 0.85}"/></g>`).join('');
    return `<svg class="body-map" viewBox="0 0 200 380" id="bodyMap"><title>${side}</title>${outline}${dots}</svg>`;
  }
  function locator(root) {
    const all = window.HT_TCM ? window.HT_TCM.points : [];
    let side = 'front', target = null, showDots = false;
    const pickTarget = () => { const keys = Object.keys(side === 'front' ? FRONT : BACK); const code = choice(keys); target = { code, pt: all.find(p => p.code === code) }; };
    pickTarget();
    function render() {
      root.innerHTML = `<div class="sim"><div class="card panel"><span class="eyebrow">${pick('穴位定位訓練', 'ACUPOINT LOCATOR')}</span><div class="row"><button class="chip ${side === 'front' ? 'active' : ''}" data-side="front">${pick('正面', 'Front')}</button><button class="chip ${side === 'back' ? 'active' : ''}" data-side="back">${pick('背面', 'Back')}</button><button class="chip ${showDots ? 'active' : ''}" id="toggleDots">${pick('顯示所有穴點', 'Show all points')}</button></div><div id="mapWrap" style="margin-top:10px">${bodySvg(side)}</div></div>
        <div class="card panel"><h3>${pick('請在人體圖上點出：', 'Click the location of:')} <span data-no-translate>${target.code} ${target.pt ? esc(target.pt.zh) + ' · ' + esc(target.pt.py) : ''}</span></h3>${target.pt ? `<p class="small muted">${esc(pick(target.pt.loc_zh, target.pt.loc_en))}</p>` : ''}<div id="locResult"></div><button class="button light" id="locNext">${pick('下一個穴位', 'Next point')}</button></div></div>`;
      const svg = root.querySelector('#bodyMap');
      svg.querySelectorAll('.pt').forEach(g => g.style.opacity = showDots ? 1 : 0);
      svg.addEventListener('click', e => {
        const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * 200, y = (e.clientY - r.top) / r.height * 380;
        const [tx, ty] = (side === 'front' ? FRONT : BACK)[target.code]; const d = Math.min(Math.hypot(x - tx, y - ty), Math.hypot(x - (200 - tx), y - ty));
        const s = d < 7 ? 100 : d < 14 ? 70 : d < 24 ? 40 : 0;
        root.querySelector('#locResult').innerHTML = `<div class="notice"><span class="score">${s} / 100</span> · ${pick('偏差', 'offset')} ${d.toFixed(0)} px<br>${target.pt ? esc(pick(target.pt.ind_zh, target.pt.ind_en)) : ''}</div>`;
        const g = svg.querySelector(`.pt[data-code="${target.code}"]`); if (g) g.style.opacity = 1;
        window.HT.app.recordSim('locator', s);
      }, { once: true });
      root.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { side = b.dataset.side; pickTarget(); render(); });
      root.querySelector('#toggleDots').onclick = () => { showDots = !showDots; render(); };
      root.querySelector('#locNext').onclick = () => { pickTarget(); render(); };
    }
    render();
  }

  window.HT = window.HT || {};
  window.HT.internTcm = { clinic, pulseTrainer, tongueTrainer, locator, tongueSvg, CASES, PATTERNS };
})(window);
