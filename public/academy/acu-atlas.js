/* Interactive bronze-figure acupuncture atlas (v3.3): fourteen channels drawn on a golden figure,
   every classical point ordered along its channel, animated qi flow, organ highlighting, the
   twelve-channel circulation, and a trial-and-error point-selection trainer (condition → pattern →
   choose points → feedback with consequences → recommended combinations).
   Teaching schematic only: no needle depth, angle or manipulation parameters are given. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = k => window.HT.i18n.t(k);
  const zh = () => window.HT.i18n.isZh();
  const say = (z, e) => zh() ? z : e;
  const bi = (o, k) => o ? (zh() ? (o[k] ?? o[k + 'En'] ?? '') : (o[k + 'En'] ?? o[k] ?? '')) : '';
  let FIG, TCM, ATLAS = null, positions = null, currentContext = null;

  // ---------------------------------------------------------------- data
  async function ensure() {
    if (!window.HT_TCM) await window.HT.loadScript('data/tcm-library.js');
    if (!window.HT_ACU_FIGURE) await window.HT.loadScript('data/acu-figure.js');
    TCM = window.HT_TCM; FIG = window.HT_ACU_FIGURE;
    if (!ATLAS) {
      try { ATLAS = location.protocol === 'file:' ? null : await window.HT.loadJson('data/acu-atlas.json'); } catch (e) { ATLAS = null; }
      if (!ATLAS) { try { await window.HT.loadScript('data/acu-atlas.js'); ATLAS = window.HT_ACU_ATLAS || null; } catch (e) { ATLAS = null; } }
    }
    if (!positions) positions = computePositions();
    return true;
  }
  const codeNum = code => Number((code.match(/\d+$/) || [0])[0]);
  const channelOf = code => code.startsWith('EX-') ? 'EX' : code.replace(/\d+$/, '');
  function computePositions() {
    const out = { front: {}, back: {} };
    const byChannel = {};
    TCM.points.forEach(p => { (byChannel[channelOf(p.code)] = byChannel[channelOf(p.code)] || []).push(p.code); });
    Object.values(byChannel).forEach(list => list.sort((a, b) => codeNum(a) - codeNum(b)));
    Object.entries(FIG.channels).forEach(([ch, spec]) => {
      ['front', 'back'].forEach(view => {
        const ms = spec[view]; if (!ms) return;
        const codes = byChannel[ch] || [];
        const paths = []; let current = [], prev = null;
        ms.forEach(m => {
          if (m === null) { if (current.length) paths.push(current); current = []; prev = null; return; }
          const [code, x, y] = m;
          const a = codes.indexOf(code);
          if (prev && a > 0) {
            const pa = codes.indexOf(prev[0]);
            for (let k = pa + 1; k < a; k++) { const f = (k - pa) / (a - pa); const c = codes[k]; const px = prev[1] + (x - prev[1]) * f, py = prev[2] + (y - prev[2]) * f; out[view][c] = { x: px, y: py, ch, interpolated: true }; current.push([c, px, py]); }
          }
          out[view][code] = { x, y, ch, interpolated: false }; current.push([code, x, y]); prev = m;
        });
        if (current.length) paths.push(current);
        spec['paths_' + view] = paths;
      });
    });
    Object.entries(FIG.extras || {}).forEach(([code, spec]) => { ['front', 'back'].forEach(view => { if (spec[view]) out[view][code] = { x: spec[view][0], y: spec[view][1], ch: 'EX', interpolated: false }; }); });
    return out;
  }
  const pointInfo = code => TCM.points.find(p => p.code === code);
  const profile = code => ATLAS && ATLAS.pointProfiles ? ATLAS.pointProfiles[code] : null;
  const meridianMeta = ch => (TCM.meridians || []).find(m => m.code === ch) || (ATLAS && ATLAS.meridians && ATLAS.meridians[ch]) || { code: ch, zh: ch, en: ch };
  const riskOf = code => ATLAS && ATLAS.riskZones ? ATLAS.riskZones.filter(z => (z.codes || []).includes(code)) : [];
  const bilateral = code => { const ch = channelOf(code); return ch === 'EX' ? !/^EX-(HN1|HN3|CA1|B[2-9]|HN11|HN12|HN13|HN10)$/.test(code) : FIG.channels[ch] && FIG.channels[ch].bilateral; };
  function viewsFor(code) { return ['front', 'back'].filter(v => positions[v][code]); }

  // ---------------------------------------------------------------- figure rendering
  function figureSvg(st) {
    const view = st.view, body = FIG.body[view], M = FIG.mirrorAxis;
    const mirror = x => 2 * M - x;
    const colors = FIG.colors;
    const active = st.activeChannels; // Set of channel codes
    const showAll = st.showMeridians === 'all' || !active.size;
    const shapeOf = (f, cls) => f.d ? `<path d="${f.d}" class="${cls} acu-${f.part}"/>` : `<ellipse cx="${f.cx}" cy="${f.cy}" rx="${f.rx}" ry="${f.ry}" class="${cls} acu-${f.part}"/>`;
    // Outline layer (dark, slightly wider) under the gold layer gives one continuous silhouette.
    const outline = body.limbs.map(l => `<path d="${l.d}" class="acu-limb-outline" stroke-width="${l.w + 4}"/>`).join('') + body.fills.map(f => shapeOf(f, 'acu-body-outline')).join('');
    const shapes = body.fills.map(f => shapeOf(f, 'acu-body')).join('');
    const limbs = body.limbs.map(l => `<path d="${l.d}" class="acu-limb" stroke-width="${l.w}"/>`).join('');
    const details = body.details.map(d => `<path d="${d}" class="acu-line"/>`).join('');
    const organs = Object.entries(body.organs || {}).map(([ch, list]) => list.map(o => `<ellipse cx="${o.cx}" cy="${o.cy}" rx="${o.rx}" ry="${o.ry}" class="acu-organ ${o.ring ? 'ring' : ''} ${active.has(ch) ? 'on' : ''}" style="--c:${colors[ch] || '#999'}"/>`).join('')).join('');
    let paths = '', flows = '';
    Object.entries(FIG.channels).forEach(([ch, spec]) => {
      const sub = spec['paths_' + view]; if (!sub) return;
      const on = active.has(ch);
      const cls = `acu-path ${on ? 'on' : ''} ${!showAll && !on ? 'dim' : ''}`;
      sub.forEach((pts, i) => {
        if (pts.length < 2) return;
        const d = 'M' + pts.map(p => `${p[1].toFixed(1)},${p[2].toFixed(1)}`).join(' L');
        const dm = 'M' + pts.map(p => `${mirror(p[1]).toFixed(1)},${p[2].toFixed(1)}`).join(' L');
        paths += `<path id="acu-${view}-${ch}-${i}" d="${d}" class="${cls}" stroke="${colors[ch]}" data-ch="${ch}"/>`;
        if (spec.bilateral) paths += `<path d="${dm}" class="${cls}" stroke="${colors[ch]}" data-ch="${ch}"/>`;
        if (on && st.flow) {
          flows += `<path d="${d}" class="acu-flow" stroke="${colors[ch]}"/><circle r="5" class="acu-qi" fill="${colors[ch]}"><animateMotion dur="${(3 + pts.length / 6).toFixed(1)}s" repeatCount="indefinite" rotate="auto"><mpath href="#acu-${view}-${ch}-${i}"/></animateMotion></circle>`;
          if (spec.bilateral) flows += `<path d="${dm}" class="acu-flow" stroke="${colors[ch]}"/>`;
        }
      });
    });
    let points = '';
    const status = st.status || {}; const selected = st.selected; const picked = st.picked;
    Object.entries(positions[view]).forEach(([code, p]) => {
      const ch = p.ch, on = ch === 'EX' ? true : active.has(ch);
      const isSel = selected === code, isPicked = picked.has(code), s = status[code];
      const r = isSel ? 6.5 : isPicked ? 5.5 : (p.interpolated ? 3 : 3.8);
      const cls = `acu-pt ${isSel ? 'sel' : ''} ${isPicked ? 'picked' : ''} ${s ? 's-' + s : ''} ${!showAll && !on ? 'dim' : ''}`;
      const col = ch === 'EX' ? '#8a5a2b' : colors[ch];
      const label = (isSel || isPicked || (st.labels && !p.interpolated) || s) ? `<text x="${p.x < M ? p.x - 9 : p.x + 9}" y="${p.y + 3.5}" text-anchor="${p.x < M ? 'end' : 'start'}" class="acu-lbl ${isSel || s ? 'strong' : ''}">${code}</text>` : '';
      const one = (x, side) => `<g class="acu-ptg" data-code="${code}" data-side="${side}" role="button" tabindex="0" aria-label="${code} ${esc(pointInfo(code)?.zh || '')}"><circle cx="${x}" cy="${p.y}" r="11" class="acu-hit"/><circle cx="${x}" cy="${p.y}" r="${r}" class="${cls}" fill="${col}"/>${side === 'r' ? label : ''}</g>`;
      points += one(p.x, 'r');
      if (bilateral(code)) points += one(mirror(p.x), 'l');
    });
    const ringEx = FIG.extras['EX-HN1'] && view === 'front' && st.selected === 'EX-HN1' ? FIG.extras['EX-HN1'].ring.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#8a5a2b"/>`).join('') : '';
    return `<svg class="acu-svg" viewBox="${FIG.viewBox.join(' ')}" style="width:${Math.round(st.zoom * 100)}%" role="img" aria-label="${esc(say('銅人經絡示意圖，非臨床定位', 'Bronze-figure channel schematic, not clinical localisation'))}">
      <defs><linearGradient id="acuBronze" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8b5c13"/><stop offset=".35" stop-color="#e9c568"/><stop offset=".55" stop-color="#f6e2a0"/><stop offset=".75" stop-color="#d9ad4b"/><stop offset="1" stop-color="#8d5f16"/></linearGradient><radialGradient id="acuGlow"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><filter id="acuShadow" x="-20%" y="-10%" width="140%" height="130%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#5a3a08" flood-opacity=".35"/></filter><filter id="acuBlur"><feGaussianBlur stdDeviation="2.2"/></filter></defs>
      <g filter="url(#acuShadow)">${outline}</g><g>${limbs}${shapes}</g><g>${details}</g><g class="acu-organs">${organs}</g><g class="acu-paths">${paths}</g><g class="acu-flows">${flows}</g><g class="acu-points">${points}${ringEx}</g>
      <text x="200" y="896" text-anchor="middle" class="acu-foot">${esc(say('教學示意 · 點位沿經絡排序 · 非體表座標、不提供針刺參數', 'TEACHING SCHEMATIC · POINTS ORDERED ALONG CHANNELS · NOT SURFACE COORDINATES, NO NEEDLING PARAMETERS'))}</text></svg>`;
  }

  // ---------------------------------------------------------------- trainer evaluation
  function evaluate(pattern, condition, picked) {
    const primary = new Set(pattern.primary || []), secondary = new Set(pattern.secondary || []);
    const wrongGroups = (pattern.wrong || []).concat(condition.wrong || []);
    const result = { items: [], missing: [], score: 0, dangers: 0, wrong: 0, hits: 0 };
    picked.forEach(code => {
      const risks = riskOf(code);
      const danger = risks.find(z => z.severity === 'forbidden' || z.severity === 'high');
      const caution = risks.find(z => z.severity === 'caution' || z.severity === 'medium');
      const wg = wrongGroups.find(g => (g.codes || []).includes(code));
      let status, why;
      if (primary.has(code)) { status = 'correct'; result.hits++; why = bi(pattern, 'rationale'); }
      else if (secondary.has(code)) { status = 'acceptable'; why = say('配穴，可依兼症加減。', 'Supporting point; add or omit according to accompanying signs.'); }
      else if (wg) { status = 'wrong'; result.wrong++; why = bi(wg, 'zh') || wg.zh || ''; if (!zh() && wg.en) why = wg.en; }
      else { status = 'neutral'; const pr = profile(code); why = pr ? (say('本證未列此穴；其主治：', 'Not listed for this pattern; its functions: ') + bi(pr, 'functions')) : say('本證未列此穴；請核對其主治與經絡是否相關。', 'Not listed for this pattern; check whether its functions and channel are relevant.'); }
      // A prescribed point inside a risk zone stays correct: the zone becomes a handling caution.
      // A point that is not prescribed for this pattern and lies in a high-risk/forbidden zone is a danger.
      if (danger && (status === 'correct' || status === 'acceptable')) { status += ' caution'; why += ' ⚠ ' + bi(danger, 'zh') + (danger.consequence ? ' → ' + bi(danger, 'consequence') : ''); }
      else if (danger) { status = 'danger'; result.dangers++; why += ' ⚠ ' + bi(danger, 'zh') + (danger.consequence ? ' → ' + bi(danger, 'consequence') : ''); }
      else if (caution) { why += ' ⚠ ' + bi(caution, 'zh'); }
      result.items.push({ code, status, why });
    });
    (pattern.primary || []).forEach(code => { if (!picked.has(code)) result.missing.push(code); });
    const base = primary.size ? Math.round(70 * result.hits / primary.size) : 70;
    result.score = Math.max(0, Math.min(100, base + (result.wrong ? Math.max(0, 20 - 10 * result.wrong) : 20) + (result.dangers ? 0 : 10) - 5 * Math.max(0, picked.size - primary.size - secondary.size - 2)));
    return result;
  }

  // ---------------------------------------------------------------- page
  async function render(root, params) {
    await ensure();
    const st = { view: 'front', zoom: 1, labels: false, flow: true, showMeridians: 'all', activeChannels: new Set(), selected: params.get('point') || '', picked: new Set(), status: {}, tab: params.get('tab') || 'points', condition: params.get('condition') || '', pattern: '', result: null, tour: null, q: '' };
    if (st.selected && positions.front[st.selected] === undefined && positions.back[st.selected]) st.view = 'back';
    if (st.selected) st.activeChannels.add(channelOf(st.selected));
    let tourTimer = null;
    const conditions = (ATLAS && ATLAS.conditions) || [];
    const colors = FIG.colors;
    currentContext = { id: 'acu-atlas', title: '針灸銅人互動圖譜', titleEn: 'Interactive acupuncture atlas', summary: '十四經銅人示意、氣血流注與病症選穴訓練；不提供針刺深度、角度或自行針刺指導。', summaryEn: 'Fourteen-channel bronze-figure schematic, qi circulation and a condition-based point-selection trainer; no needling depth, angle or self-needling guidance.' };

    root.innerHTML = `<div class="section-head"><div><span class="eyebrow">ACUPUNCTURE BRONZE FIGURE · 14 CHANNELS · ${TCM.points.length} POINTS</span><h1>${t('navAcu')}</h1><p class="subtext">${say('十四經絡與 396 穴沿經排列在銅人上：點任何穴位看它屬哪條經、氣往哪裡流、連到哪個臟腑；再到「病症選穴」依證型自己配穴，系統告訴你哪些對、哪些不宜、哪些是危險區，並給多組推薦配穴。', 'Fourteen channels and 396 points are laid along the figure: tap any point to see its channel, where qi flows next and which organ it connects to; then open the trainer to choose points for a pattern — the atlas tells you which are right, which are inadvisable, which lie in danger zones, and shows several recommended combinations.')}</p></div></div>
      <div class="acu-layout"><section class="card acu-figure-card"><div class="acu-toolbar" id="acuTools"></div><div class="acu-viewport" id="acuViewport"></div><div class="acu-legend" id="acuLegend"></div></section>
      <section class="acu-side"><div class="tier-tabs acu-tabs"><button data-atab="points" class="${st.tab === 'points' ? 'active' : ''}">${say('穴位與經絡', 'Points & channels')}</button><button data-atab="train" class="${st.tab === 'train' ? 'active' : ''}">${say('病症選穴訓練', 'Point-selection trainer')}</button><button data-atab="theory" class="${st.tab === 'theory' ? 'active' : ''}">${say('配穴原則與流注', 'Principles & circulation')}</button></div><div id="acuPanel" class="acu-panel" aria-live="polite"></div></section></div>
      <p class="form-note">${say('本圖為教學示意：點位依 WHO 命名沿各經路徑按順序排列，並非任何個人的體表座標；不提供進針深度、角度、手法或電刺激參數。真實針灸須由合格醫師執行。', 'Teaching schematic: points follow WHO nomenclature and are ordered along each channel path; they are not surface coordinates for any individual. No insertion depth, angle, manipulation or electro-stimulation parameters are given. Real acupuncture must be performed by a qualified practitioner.')}</p>`;

    const viewport = root.querySelector('#acuViewport'), panel = root.querySelector('#acuPanel');
    function drawTools() {
      root.querySelector('#acuTools').innerHTML = `<div class="row"><button class="chip ${st.view === 'front' ? 'active' : ''}" data-view="front">${t('frontView')}</button><button class="chip ${st.view === 'back' ? 'active' : ''}" data-view="back">${t('backView')}</button><label class="small">${t('zoom')} <input type="range" id="acuZoom" min="1" max="2.4" step=".2" value="${st.zoom}"></label></div><div class="row"><button class="chip ${st.labels ? 'active' : ''}" id="acuLabels">${say('標示代碼', 'Labels')}</button><button class="chip ${st.flow ? 'active' : ''}" id="acuFlow">${t('qiFlow')}</button><button class="chip ${st.showMeridians === 'all' ? 'active' : ''}" id="acuAll">${t('showMeridians')}</button><button class="chip ${st.tour ? 'active' : ''}" id="acuTour">${st.tour ? '■ ' : '▶ '}${t('flowOrder')}</button><button class="chip" id="acuReset">${t('reset')}</button></div>`;
      root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { st.view = b.dataset.view; drawAll(); });
      root.querySelector('#acuZoom').oninput = e => { st.zoom = Number(e.target.value); drawFigure(); };
      root.querySelector('#acuLabels').onclick = () => { st.labels = !st.labels; drawAll(); };
      root.querySelector('#acuFlow').onclick = () => { st.flow = !st.flow; drawAll(); };
      root.querySelector('#acuAll').onclick = () => { st.showMeridians = st.showMeridians === 'all' ? 'active' : 'all'; drawAll(); };
      root.querySelector('#acuTour').onclick = () => { if (st.tour) stopTour(); else startTour(); };
      root.querySelector('#acuReset').onclick = () => { stopTour(); st.activeChannels.clear(); st.selected = ''; st.picked.clear(); st.status = {}; st.result = null; drawAll(); };
    }
    function drawLegend() {
      root.querySelector('#acuLegend').innerHTML = FIG.flowOrder.concat(['GV', 'CV']).map(ch => { const m = meridianMeta(ch); return `<button class="acu-leg ${st.activeChannels.has(ch) ? 'on' : ''}" data-leg="${ch}" style="--c:${colors[ch]}"><i></i><span>${ch} ${esc(bi(m, 'zh'))}</span><small>${FIG.hours[ch] ? FIG.hours[ch] : ''}</small></button>`; }).join('');
      root.querySelectorAll('[data-leg]').forEach(b => b.onclick = () => { const ch = b.dataset.leg; if (st.activeChannels.has(ch) && st.activeChannels.size === 1) st.activeChannels.clear(); else { st.activeChannels.clear(); st.activeChannels.add(ch); } st.selected = ''; if (!FIG.channels[ch]['paths_' + st.view]) st.view = FIG.channels[ch].paths_front ? 'front' : 'back'; st.tab = st.tab === 'train' ? 'train' : 'points'; drawAll(); });
    }
    function drawFigure() {
      viewport.innerHTML = figureSvg(st);
      viewport.querySelectorAll('.acu-ptg').forEach(g => { const open = e => { e.preventDefault(); selectPoint(g.dataset.code); }; g.onclick = open; g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') open(e); }; });
      viewport.querySelectorAll('.acu-path').forEach(p => p.onclick = () => { const ch = p.dataset.ch; st.activeChannels.clear(); st.activeChannels.add(ch); st.selected = ''; drawAll(); });
    }
    function selectPoint(code) {
      stopTour();
      if (st.tab === 'train' && st.pattern) { if (st.picked.has(code)) st.picked.delete(code); else st.picked.add(code); st.result = null; st.status = {}; }
      st.selected = code; st.activeChannels.clear(); if (channelOf(code) !== 'EX') st.activeChannels.add(channelOf(code));
      const p = pointInfo(code);
      if (p) currentContext = { id: 'point-' + code, title: code + ' ' + p.zh, titleEn: code + ' ' + p.py, summary: '文字地標：' + p.loc_zh + '。傳統主治：' + p.ind_zh + '。' + (profile(code) ? '功能：' + (profile(code).functions || '') : '') + ' 不提供針刺操作參數。', summaryEn: 'Landmarks: ' + p.loc_en + '. Traditional indications: ' + p.ind_en + '. ' + (profile(code) ? 'Functions: ' + (profile(code).functionsEn || '') : '') + ' No needling parameters.' };
      drawAll();
    }
    function startTour() { stopTour(); let i = 0; st.tour = true; st.selected = ''; st.showMeridians = 'active'; const step = () => { const ch = FIG.flowOrder[i % 12]; st.activeChannels.clear(); st.activeChannels.add(ch); if (!FIG.channels[ch]['paths_' + st.view]) st.view = FIG.channels[ch].paths_front ? 'front' : 'back'; st.tourChannel = ch; i++; drawAll(); }; step(); tourTimer = setInterval(step, 4200); }
    function stopTour() { if (tourTimer) clearInterval(tourTimer); tourTimer = null; if (st.tour) { st.tour = false; st.tourChannel = null; } }

    // ---- side panels
    function panelPoints() {
      const q = st.q.trim().toLowerCase();
      const ch = [...st.activeChannels][0];
      const list = TCM.points.filter(p => (!ch || channelOf(p.code) === ch || (ch === 'EX' && p.code.startsWith('EX'))) && (!q || [p.code, p.zh, p.py, p.loc_zh, p.loc_en, p.ind_zh, p.ind_en].join(' ').toLowerCase().includes(q))).slice(0, q ? 60 : 80);
      const sel = st.selected ? pointInfo(st.selected) : null, pr = st.selected ? profile(st.selected) : null, risks = st.selected ? riskOf(st.selected) : [];
      const m = ch ? meridianMeta(ch) : null, am = ch && ATLAS && ATLAS.meridians ? ATLAS.meridians[ch] : null;
      const nextCh = ch && FIG.flowOrder.includes(ch) ? FIG.flowOrder[(FIG.flowOrder.indexOf(ch) + 1) % 12] : null;
      const pos = st.selected ? positions[st.view][st.selected] || positions.front[st.selected] || positions.back[st.selected] : null;
      const codesOnCh = st.selected && ch ? TCM.points.filter(p => channelOf(p.code) === ch).map(p => p.code).sort((a, b) => codeNum(a) - codeNum(b)) : [];
      const at = codesOnCh.indexOf(st.selected);
      panel.innerHTML = `${st.tour && st.tourChannel ? `<div class="notice acu-tour-note"><b>${t('flowOrder')}</b> · ${esc(bi(meridianMeta(st.tourChannel), 'zh'))} · ${FIG.hours[st.tourChannel]}${am && ATLAS.meridians[st.tourChannel] ? '<br>' + esc(bi(ATLAS.meridians[st.tourChannel], 'flow')) : ''}</div>` : ''}
        ${sel ? `<article class="acu-detail card flat"><span class="eyebrow" style="color:${colors[channelOf(sel.code)] || '#8a5a2b'}">${esc(sel.code)} · ${esc(bi(meridianMeta(channelOf(sel.code)), 'zh'))}</span><h2>${esc(sel.zh)} <small>${esc(sel.py)}</small></h2>
          ${pr ? `<p class="acu-cats">${(zh() ? pr.category : pr.categoryEn || pr.category || []).map(c => `<span class="tag">${esc(c)}</span>`).join(' ')}</p>` : ''}
          <p><b>${say('文字地標（教學稿）', 'Landmarks (teaching draft)')}</b><br>${esc(zh() ? sel.loc_zh : sel.loc_en)}</p>
          ${pr ? `<p><b>${say('功能', 'Functions')}</b><br>${esc(bi(pr, 'functions'))}</p>` : ''}
          <p><b>${say('傳統主治（非療效證明）', 'Traditional indications (not efficacy proof)')}</b><br>${esc(pr ? bi(pr, 'indications') : (zh() ? sel.ind_zh : sel.ind_en))}</p>
          ${pr && pr.qiNote ? `<p class="acu-qi-note">☯ ${esc(bi(pr, 'qiNote'))}</p>` : ''}
          ${pr && pr.pairs && pr.pairs.length ? `<p><b>${say('常用配穴', 'Classic partners')}</b> ${pr.pairs.map(c => `<button class="chip small" data-goto="${c}">${c} ${esc(pointInfo(c)?.zh || '')}</button>`).join(' ')}</p>` : ''}
          ${at >= 0 ? `<p class="small"><b>${t('qiFlow')}</b>：${at > 0 ? `<button class="chip small" data-goto="${codesOnCh[at - 1]}">← ${codesOnCh[at - 1]}</button>` : ''} <span class="acu-here">${esc(sel.code)}</span> ${at < codesOnCh.length - 1 ? `<button class="chip small" data-goto="${codesOnCh[at + 1]}">${codesOnCh[at + 1]} →</button>` : nextCh ? `<button class="chip small" data-leg2="${nextCh}">→ ${nextCh} ${esc(bi(meridianMeta(nextCh), 'zh'))}</button>` : ''}</p>` : ''}
          ${risks.length ? `<div class="notice danger acu-risk"><b>⚠ ${t('dangerZone')}</b>${risks.map(z => `<p>${esc(bi(z, 'zh'))}${z.consequence ? `<br><small>${t('consequence')}：${esc(bi(z, 'consequence'))}</small>` : ''}</p>`).join('')}</div>` : (pr && pr.caution ? `<p class="notice warn">⚠ ${esc(bi(pr, 'caution'))}</p>` : '')}
          <p class="small muted">${say(`銅人位置：${st.view === 'front' ? '正面' : '背面'}示意，沿經順序第 ${at + 1}／${codesOnCh.length} 穴${pos && pos.interpolated ? '（沿經內插）' : ''}。`, `Figure position: ${st.view} view, point ${at + 1}/${codesOnCh.length} along the channel${pos && pos.interpolated ? ' (interpolated)' : ''}.`)} <a href="#tcm?tab=points">${say('金人目錄 →', 'Directory →')}</a></p></article>` : ''}
        ${m && !sel ? `<article class="card flat acu-detail"><span class="eyebrow" style="color:${colors[ch]}">${esc(ch)} · ${FIG.hours[ch] || ''}</span><h2>${esc(bi(m, 'zh'))}</h2><p>${esc(bi(m, 'scope') || '')}</p>${am ? `<p><b>${say('循行', 'Pathway')}</b><br>${esc(bi(am, 'flow'))}</p><p><b>${say('病候', 'Pathology')}</b><br>${esc(bi(am, 'pathology'))}</p><p class="small muted">${esc(bi(am, 'organ'))} · ${esc(bi(am, 'element'))} · ${say('表裡', 'paired')}: ${esc(am.pair || '')} · ${esc(bi(am, 'direction'))}</p>${am.keyPoints ? `<p>${am.keyPoints.map(c => `<button class="chip small" data-goto="${c}">${c} ${esc(pointInfo(c)?.zh || '')}</button>`).join(' ')}</p>` : ''}` : ''}${nextCh ? `<p class="small">${t('qiFlow')} → <button class="chip small" data-leg2="${nextCh}">${nextCh} ${esc(bi(meridianMeta(nextCh), 'zh'))}</button></p>` : ''}</article>` : ''}
        <div class="content-controls"><label>${say('找穴位', 'Find a point')}<input id="acuSearch" type="search" value="${esc(st.q)}" placeholder="${esc(say('代碼／名稱／拼音／主治', 'code / name / pinyin / indication'))}"></label></div>
        <div class="point-list acu-list">${list.map(p => `<button class="point-choice ${p.code === st.selected ? 'active' : ''}" data-goto="${p.code}"><b>${p.code} ${esc(p.zh)}</b><small>${esc(p.py)} · ${esc(bi(meridianMeta(channelOf(p.code)), 'zh'))}${riskOf(p.code).some(z => z.severity === 'high' || z.severity === 'forbidden') ? ' ⚠' : ''}</small></button>`).join('')}</div>`;
      bindPanel();
    }
    function panelTrain() {
      if (!conditions.length) { panel.innerHTML = `<div class="notice">${say('病症選穴教學資料（acu-atlas.json）尚未載入或尚未建置；請執行 bash rebuild-curriculum.sh 後重新整理。', 'The condition/point-combination data (acu-atlas.json) is not available yet; run bash rebuild-curriculum.sh and reload.')}</div>`; return; }
      const systems = [...new Set(conditions.map(c => bi(c, 'system')))];
      const cond = conditions.find(c => c.id === st.condition);
      const pat = cond && (cond.patterns || []).find(p => p.id === st.pattern);
      const picked = [...st.picked];
      panel.innerHTML = `<div class="content-controls"><label>${t('chooseCondition')}<select id="acuCond"><option value="">—</option>${systems.map(s => `<optgroup label="${esc(s)}">${conditions.filter(c => bi(c, 'system') === s).map(c => `<option value="${c.id}" ${c.id === st.condition ? 'selected' : ''}>${esc(bi(c, 'zh'))}</option>`).join('')}</optgroup>`).join('')}</select></label></div>
        ${cond ? `<article class="card flat acu-cond"><h2>${esc(bi(cond, 'zh'))} <small>${esc(zh() ? cond.en : cond.zh)}</small></h2><p>${esc(bi(cond, 'overview'))}</p>${cond.redFlags ? `<p class="notice danger"><b>${t('redFlags')}</b> ${esc(bi(cond, 'redFlags'))}</p>` : ''}
          <p class="row acu-patterns">${(cond.patterns || []).map(p => `<button class="chip ${p.id === st.pattern ? 'active' : ''}" data-pat="${p.id}">${esc(bi(p, 'zh'))}</button>`).join('')}</p>
          ${pat ? `<div class="acu-pattern"><p><b>${say('證候', 'Presentation')}</b> ${esc(bi(pat, 'presentation'))}</p><p><b>${say('治則', 'Principle')}</b> ${esc(bi(pat, 'principle'))}${pat.method ? ' · ' + esc(bi(pat, 'method')) : ''}</p>
            <div class="acu-tray"><b>${t('selectedPoints')}</b> <span class="muted small">${say('點銅人上的穴位或下方搜尋加入；再按核對。', 'Tap points on the figure or search below, then check.')}</span><div class="row" id="acuTray">${picked.length ? picked.map(c => `<span class="chip acu-chip ${st.status[c] ? 's-' + st.status[c].split(' ')[0] : ''}" style="--c:${colors[channelOf(c)] || '#8a5a2b'}">${c} ${esc(pointInfo(c)?.zh || '')} <button type="button" data-unpick="${c}" aria-label="remove">×</button></span>`).join('') : `<span class="muted small">—</span>`}</div>
            <div class="row"><input id="acuPick" type="search" placeholder="${esc(say('輸入代碼或名稱加入，例如 LI4、合谷', 'Type a code or name, e.g. LI4, Hegu'))}" list="acuPickList"><datalist id="acuPickList">${TCM.points.map(p => `<option value="${p.code}">${esc(p.zh)} ${esc(p.py)}</option>`).join('')}</datalist><button class="button primary small" id="acuCheck" ${picked.length ? '' : 'disabled'}>${t('checkAnswer')}</button><button class="button light small" id="acuShow">${t('showAnswer')}</button><button class="button light small" id="acuClear">${t('clearTray')}</button></div></div>
            ${st.result ? renderResult(st.result, pat, cond) : ''}
            <details class="acu-combos" ${st.result ? 'open' : ''}><summary><b>${t('recommendedCombos')}</b></summary>${[{ zh: '主穴＋配穴', en: 'Primary + supporting', points: (pat.primary || []).concat(pat.secondary || []), why: pat.rationale, whyEn: pat.rationaleEn }].concat(cond.combos || []).map((cb, i) => `<div class="acu-combo"><b>${esc(bi(cb, 'zh'))}</b><p class="row">${cb.points.map(c => `<span class="chip small" style="--c:${colors[channelOf(c)] || '#8a5a2b'}">${c} ${esc(pointInfo(c)?.zh || '')}</span>`).join('')}</p><p class="small">${esc(bi(cb, 'why'))}</p><button class="button light small" data-apply="${i}">${say('顯示在銅人', 'Show on figure')}</button></div>`).join('')}</details>` : `<p class="muted small">${t('choosePattern')}</p>`}</article>` : `<div class="notice">${say('先選病症，再選證型；系統會依證型評估你選的穴位：正確／可接受／不宜／危險區，並列出缺少的主穴與多組推薦配穴。', 'Choose a condition and a pattern; the atlas then grades each point you choose (correct / acceptable / inadvisable / danger zone), lists missing primary points and shows several recommended combinations.')}</div>`}`;
      bindPanel();
      const condSel = root.querySelector('#acuCond'); if (condSel) condSel.onchange = e => { st.condition = e.target.value; st.pattern = ''; st.picked.clear(); st.status = {}; st.result = null; const c = conditions.find(x => x.id === st.condition); if (c && c.patterns && c.patterns.length) st.pattern = c.patterns[0].id; drawAll(); };
      root.querySelectorAll('[data-pat]').forEach(b => b.onclick = () => { st.pattern = b.dataset.pat; st.picked.clear(); st.status = {}; st.result = null; drawAll(); });
      root.querySelectorAll('[data-unpick]').forEach(b => b.onclick = () => { st.picked.delete(b.dataset.unpick); st.result = null; st.status = {}; drawAll(); });
      const pick = root.querySelector('#acuPick'); if (pick) pick.onchange = () => { const v = pick.value.trim(); const p = TCM.points.find(x => x.code.toLowerCase() === v.toLowerCase() || x.zh === v || x.py.toLowerCase() === v.toLowerCase()); if (p) { st.picked.add(p.code); st.result = null; st.status = {}; st.selected = p.code; st.activeChannels.clear(); st.activeChannels.add(channelOf(p.code)); drawAll(); } else window.HT.app.toast(say('找不到此穴位', 'Point not found')); };
      const check = root.querySelector('#acuCheck'); if (check) check.onclick = () => { st.result = evaluate(pat, cond, st.picked); st.status = {}; st.result.items.forEach(i => { st.status[i.code] = i.status.split(' ')[0]; }); st.result.missing.forEach(c => { st.status[c] = 'missing'; }); st.activeChannels = new Set([...st.picked, ...st.result.missing].map(channelOf).filter(c => c !== 'EX')); st.showMeridians = 'active'; window.HT.app.recordSim('acu-' + cond.id, st.result.score); drawAll(); };
      const show = root.querySelector('#acuShow'); if (show) show.onclick = () => applyCombo((pat.primary || []).concat(pat.secondary || []));
      const clear = root.querySelector('#acuClear'); if (clear) clear.onclick = () => { st.picked.clear(); st.status = {}; st.result = null; st.activeChannels.clear(); drawAll(); };
      root.querySelectorAll('[data-apply]').forEach(b => b.onclick = () => { const i = Number(b.dataset.apply); const list = i === 0 ? (pat.primary || []).concat(pat.secondary || []) : (cond.combos || [])[i - 1].points; applyCombo(list); });
    }
    function applyCombo(list) { st.status = {}; list.forEach(c => { st.status[c] = 'correct'; }); st.activeChannels = new Set(list.map(channelOf).filter(c => c !== 'EX')); st.showMeridians = 'active'; st.flow = true; const first = list.find(c => positions[st.view][c]); if (!first) { const alt = list.find(c => positions.front[c] || positions.back[c]); if (alt) st.view = positions.front[alt] ? 'front' : 'back'; } drawAll(); }
    function renderResult(r, pat, cond) {
      const labels = { correct: t('correctLabel'), acceptable: t('acceptable'), wrong: t('notAdvisable'), danger: t('dangerZone'), neutral: say('未列', 'Not listed'), missing: t('missing') };
      return `<div class="acu-result"><div class="acu-score"><b>${t('score')} ${r.score}</b><span>${r.hits}/${(pat.primary || []).length} ${say('主穴', 'primary')} · ${r.wrong} ${t('notAdvisable')} · ${r.dangers} ${t('dangerZone')}</span></div>
        <ul class="acu-feedback">${r.items.map(i => `<li class="s-${i.status.split(' ')[0]} ${i.status.includes('caution') ? 'caution' : ''}"><b>${i.code} ${esc(pointInfo(i.code)?.zh || '')}</b> <span class="tag">${labels[i.status.split(' ')[0]] || i.status}${i.status.includes('caution') ? ' + ⚠ ' + say('操作注意', 'handling caution') : ''}</span><p>${esc(i.why)}</p></li>`).join('')}
        ${r.missing.map(c => `<li class="s-missing"><b>${c} ${esc(pointInfo(c)?.zh || '')}</b> <span class="tag">${t('missing')}</span><p>${esc(say('本證主穴，建議加入。', 'A primary point for this pattern; add it.'))} ${profile(c) ? esc(bi(profile(c), 'functions')) : ''}</p></li>`).join('')}</ul>
        <p class="small muted">${r.score >= 85 ? say('很好：主穴齊全且避開危險區。可再看推薦組合比較配穴邏輯。', 'Well done: primary points complete and danger zones avoided. Compare with the recommended sets.') : r.dangers ? say('先改掉危險區穴位：了解其解剖風險與後果，再重新配穴。', 'Remove the danger-zone points first: understand the anatomical risk and consequence, then re-select.') : say('比較推薦組合，想想缺少的主穴屬哪條經、治則是什麼，再試一次。', 'Compare the recommended sets, think about which channel the missing points belong to and the treatment principle, then try again.')} <button class="button light small" id="acuAgain">${t('tryAgain')}</button></p></div>`;
    }
    function panelTheory() {
      const pr = (ATLAS && ATLAS.comboPrinciples) || [], gl = (ATLAS && ATLAS.glossary) || [];
      panel.innerHTML = `<article class="card flat"><h2>${t('flowOrder')}</h2><p class="small">${say('十二經氣血依序流注，每經各主一個時辰（子午流注）；按下方任一經可在銅人上顯示該經與臟腑。', 'Qi circulates through the twelve channels in order, each dominant for two hours (midnight–noon ebb-flow). Tap a channel to show it and its organ on the figure.')}</p><ol class="acu-flow-list">${FIG.flowOrder.map((ch, i) => `<li><button class="acu-leg ${st.activeChannels.has(ch) ? 'on' : ''}" data-leg2="${ch}" style="--c:${colors[ch]}"><i></i><span>${ch} ${esc(bi(meridianMeta(ch), 'zh'))}</span><small>${FIG.hours[ch]}</small></button>${i < 11 ? '<em>→</em>' : '<em>↺</em>'}</li>`).join('')}</ol></article>
        ${pr.length ? `<article class="card flat"><h2>${say('配穴原則', 'Combination principles')}</h2>${pr.map(p => `<details><summary><b>${esc(bi(p, 'zh'))}</b></summary><p>${esc(bi(p, 'text'))}</p><p class="row">${(p.examples || []).map(pair => `<button class="chip small" data-pair="${pair.join(',')}">${pair.map(c => c + ' ' + (pointInfo(c)?.zh || '')).join(' + ')}</button>`).join('')}</p></details>`).join('')}</article>` : ''}
        ${gl.length ? `<article class="card flat"><h2>${say('名詞', 'Glossary')}</h2>${gl.map(g => `<details><summary><b>${esc(bi(g, 'zh'))}</b> <small>${esc(zh() ? g.en : g.zh)}</small></summary><p>${esc(bi(g, 'text'))}</p></details>`).join('')}</article>` : ''}
        ${ATLAS && ATLAS.riskZones ? `<article class="card flat"><h2>${t('dangerZone')}</h2>${ATLAS.riskZones.map(z => `<details><summary><b>${z.severity === 'forbidden' ? '⛔' : z.severity === 'high' ? '⚠' : '△'} ${esc(bi(z, 'zh')).slice(0, 48)}</b></summary><p>${esc(bi(z, 'zh'))}</p>${z.consequence ? `<p><b>${t('consequence')}</b> ${esc(bi(z, 'consequence'))}</p>` : ''}<p class="row">${(z.codes || []).slice(0, 40).map(c => `<button class="chip small" data-goto="${c}">${c}</button>`).join('')}</p></details>`).join('')}</article>` : ''}`;
      bindPanel();
      root.querySelectorAll('[data-pair]').forEach(b => b.onclick = () => applyCombo(b.dataset.pair.split(',')));
    }
    function bindPanel() {
      root.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { const c = b.dataset.goto; const v = viewsFor(c); if (v.length && !v.includes(st.view)) st.view = v[0]; selectPoint(c); });
      root.querySelectorAll('[data-leg2]').forEach(b => b.onclick = () => { const ch = b.dataset.leg2; st.activeChannels.clear(); st.activeChannels.add(ch); st.selected = ''; if (!FIG.channels[ch]['paths_' + st.view]) st.view = FIG.channels[ch].paths_front ? 'front' : 'back'; drawAll(); });
      const s = root.querySelector('#acuSearch'); if (s) { s.oninput = e => { st.q = e.target.value; panelPoints(); const n = root.querySelector('#acuSearch'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }; }
      const again = root.querySelector('#acuAgain'); if (again) again.onclick = () => { st.picked.clear(); st.status = {}; st.result = null; drawAll(); };
    }
    function drawAll() { drawTools(); drawLegend(); drawFigure(); root.querySelectorAll('[data-atab]').forEach(b => b.classList.toggle('active', b.dataset.atab === st.tab)); if (st.tab === 'train') panelTrain(); else if (st.tab === 'theory') panelTheory(); else panelPoints(); }
    root.querySelectorAll('[data-atab]').forEach(b => b.onclick = () => { st.tab = b.dataset.atab; drawAll(); });
    if (st.condition) { const c = conditions.find(x => x.id === st.condition); if (c && c.patterns) { st.pattern = c.patterns[0].id; st.tab = 'train'; } }
    drawAll();
    return () => { stopTour(); currentContext = null; };
  }
  window.HT = window.HT || {};
  window.HT.acuAtlas = { ensure, render, evaluate, get positions() { return positions; }, get currentContext() { return currentContext; } };
})(window);
