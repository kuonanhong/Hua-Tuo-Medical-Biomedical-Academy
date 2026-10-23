/* AI mentor panel. With the Python server and a configured route (llama.cpp, Ollama, OpenAI-compatible,
   Anthropic or Gemini) questions are answered generatively with the current course context and any
   indexed local documents. Without a route, the panel returns a clearly labelled curriculum summary. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = k => window.HT.i18n.t(k);
  let panel, history = [], context = null, busy = false, generation = 0;
  const autoConsent = () => !!(window.HT_CONFIG && window.HT_CONFIG.aiAutoConsent);

  function setContext(c) { context = c; const el = panel && panel.querySelector('[data-ctx]'); if (el) el.textContent = c ? (window.HT.locale.pick(c, 'title')) : ''; }
  function render() {
    const zh = window.HT.i18n.isZh(), routes = window.HT.account.aiRoutes();
    const ai = window.HT.account.aiAvailable() && routes.length;
    panel.innerHTML = `<div class="tutor-head"><div><b>${t('mentor')}</b><small class="muted" style="display:block" data-ctx data-no-translate>${context ? esc(window.HT.locale.pick(context, 'title')) : ''}</small></div><div class="row"><select id="tutorRoute" style="width:auto" ${ai ? '' : 'hidden'}>${routes.map(r => `<option value="${esc(r.id)}">${esc(r.label)} · ${esc(r.model)}</option>`).join('')}</select><button class="icon-btn" id="tutorClose" aria-label="Close">×</button></div></div>
      <div class="tutor-body" id="tutorBody">${history.length ? '' : `<div class="msg ai">${zh ? '我是華佗學院的 AI 師傅。可以問我巴金森照護、就醫準備、課程原理、來源查核與虛擬病例推理。我會參照目前可讀取的教材；生成內容仍須核對來源，不能作為個人診斷、處方或真人操作指示。' : 'I am the academy’s AI mentor. Ask about Parkinson care, appointment preparation, course principles, source checking or virtual case reasoning. Generated answers use accessible curriculum and still need source verification; they are not individual diagnoses, prescriptions or instructions for real procedures.'}${ai ? '' : `<span class="src">${t('offlineNote')}</span>`}</div>`}</div>
      <div class="tutor-foot"><textarea id="tutorInput" placeholder="${esc(t('placeholder'))}"></textarea><div class="row">${ai && routes.some(r => r.cloud) ? (autoConsent() ? `<label class="small muted" style="font-weight:400"><input type="checkbox" id="cloudConsent" style="width:auto;margin-right:4px" checked>${esc(t('autoConsentNote'))}</label>` : `<label class="small" style="font-weight:400"><input type="checkbox" id="cloudConsent" style="width:auto;margin-right:4px">${zh ? '同意將問題與課程脈絡送至雲端 AI' : 'Send my question and course context to the cloud AI'}</label>`) : '<span></span>'}<button class="button primary small" id="tutorSend">${t('send')}</button></div></div>`;
    const body = panel.querySelector('#tutorBody');
    history.forEach(m => body.appendChild(bubble(m)));
    panel.querySelector('#tutorClose').onclick = close;
    panel.querySelector('#tutorSend').onclick = send;
    panel.querySelector('#tutorInput').onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); };
    body.scrollTop = body.scrollHeight;
  }
  function bubble(m) { const d = document.createElement('div'); d.className = 'msg ' + (m.role === 'user' ? 'user' : 'ai'); d.textContent = m.text; if (m.src) { const s = document.createElement('span'); s.className = 'src'; s.textContent = m.src; d.appendChild(s); } return d; }
  function summaryAnswer(q) {
    const zh = window.HT.i18n.isZh();
    const words = q.toLowerCase().split(/[\s,，。？?、]+/).filter(w => w.length > 1);
    const hits = (window.HT_CATALOG || []).map(c => { const hay = (c.title + ' ' + c.titleEn + ' ' + c.summary + ' ' + c.summaryEn).toLowerCase(); let s = 0; words.forEach(w => { if (hay.includes(w)) s += w.length; }); if (context && c.id === context.id) s += 5; return [s, c]; }).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 3).map(x => x[1]);
    let text = '';
    if (context) text += (zh ? `目前課程「${context.title}」：${context.summary}\n\n` : `Current course "${context.titleEn}": ${context.summaryEn}\n\n`);
    if (hits.length) text += (zh ? '相關課程摘要：\n' : 'Related course summaries:\n') + hits.map(c => `• ${zh ? c.title : c.titleEn} — ${zh ? c.summary : c.summaryEn}`).join('\n');
    else text += zh ? '教材中沒有直接相符的主題。請改用課程名稱、穴位代碼（如 LI4）、方劑名或手術名稱提問。' : 'No directly matching topic in the curriculum. Try a course name, point code (e.g. LI4), formula or operation name.';
    return { role: 'ai', text, src: t('offlineNote') };
  }
  async function send() {
    if (busy) return;
    const epoch = generation;
    const input = panel.querySelector('#tutorInput'); const q = input.value.trim(); if (!q) return;
    input.value = ''; const body = panel.querySelector('#tutorBody');
    const um = { role: 'user', text: q }; history.push(um); body.appendChild(bubble(um));
    const ai = window.HT.account.aiAvailable() && window.HT.account.aiRoutes().length;
    // Server mode: the backend retrieves curriculum steps and indexed documents even without a generative route.
    const serverRetrieval = window.HT.account.mode() === 'server' && !!window.HT.account.user();
    if (!ai && !serverRetrieval) { const a = summaryAnswer(q); history.push(a); body.appendChild(bubble(a)); body.scrollTop = body.scrollHeight; return; }
    if (!window.HT.account.user()) { const a = { role: 'ai', text: window.HT.i18n.isZh() ? '請先登入後再向 AI 師傅提問。' : 'Please sign in to ask the AI mentor.' }; history.push(a); body.appendChild(bubble(a)); return; }
    busy = true; const thinking = bubble({ role: 'ai', text: t('thinking') }); body.appendChild(thinking); body.scrollTop = body.scrollHeight;
    try {
      const routeSel = panel.querySelector('#tutorRoute'); const route = routeSel ? routeSel.value : undefined;
      const consent = panel.querySelector('#cloudConsent'); const r = window.HT.account.aiRoutes().find(x => x.id === route);
      if (r && r.cloud && !autoConsent() && !(consent && consent.checked)) throw new Error(window.HT.i18n.isZh() ? '此路線為雲端 AI，請先勾選同意。' : 'This route is a cloud AI; please tick the consent box.');
      const ctxText = context ? window.HT.coursePlayer.contextText(context) : '';
      const d = await window.HT.account.request('/api/tutor', { question: q, context: ctxText, language: window.HT.i18n.current, route, cloudConsent: autoConsent() ? (consent ? consent.checked !== false : true) : !!(consent && consent.checked), history: history.slice(-6).map(m => ({ role: m.role, text: m.text })) });
      if (epoch !== generation) return;
      thinking.remove(); const a = { role: 'ai', text: d.answer, src: (d.generated === false ? t('offlineNote') : (d.model ? `${d.route} · ${d.model}` : '')) + (d.references && d.references.length ? ' · ' + d.references.map(x => x.source + (x.page ? ' p.' + x.page : '')).join('; ') : '') };
      history.push(a); body.appendChild(bubble(a));
    } catch (e) { if (epoch !== generation) return; thinking.remove(); const a = { role: 'ai', text: e.message }; history.push(a); body.appendChild(bubble(a)); }
    busy = false; body.scrollTop = body.scrollHeight;
  }
  function open(ctx) { panel = document.getElementById('tutorPanel'); if (ctx !== undefined) context = ctx; panel.hidden = false; render(); panel.querySelector('#tutorInput').focus(); }
  function close() { if (panel) panel.hidden = true; window.HT.voice.stop(); }
  function toggle(ctx) { panel = document.getElementById('tutorPanel'); if (panel.hidden) open(ctx); else close(); }
  window.HT = window.HT || {};
  function reset() { generation++; history = []; context = null; busy = false; close(); if (panel) panel.textContent = ''; }
  window.HT.tutor = { open, close, toggle, setContext, reset };
})(window);
