/* Per-member workspace: theme, layout, sidebar side, font size, accent colour, icon mosaic,
   mentor voice (inferred gender, pitch, speed, style), interface language and currency.
   Saved in this browser per profile; export/import to move between devices. */
(function (window) {
  'use strict';
  const PREFIX = 'ht-workspace-v1:';
  const DEFAULTS = Object.freeze({ theme: 'system', layout: 'comfortable', sidebar: 'left', font: 'normal', accent: 'green', mosaic: true,
    voiceURI: '', voiceGender: 'auto', rate: 1, pitch: 1, style: 'professional', voiceLanguage: 'follow', language: 'auto', currency: 'auto' });
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bounded = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
  function normalize(x) {
    const i = x && typeof x === 'object' ? x : {};
    return {
      theme: ['system', 'light', 'dark'].includes(i.theme) ? i.theme : 'system',
      layout: ['comfortable', 'compact'].includes(i.layout) ? i.layout : 'comfortable',
      sidebar: ['left', 'right'].includes(i.sidebar) ? i.sidebar : 'left',
      font: ['small', 'normal', 'large'].includes(i.font) ? i.font : 'normal',
      accent: ['green', 'vermilion', 'indigo', 'plum'].includes(i.accent) ? i.accent : 'green',
      mosaic: i.mosaic !== false,
      voiceURI: typeof i.voiceURI === 'string' ? i.voiceURI.slice(0, 400) : '',
      voiceGender: ['auto', 'female', 'male'].includes(i.voiceGender) ? i.voiceGender : 'auto',
      rate: bounded(i.rate, 0.6, 1.5, 1), pitch: bounded(i.pitch, 0.6, 1.5, 1),
      style: ['professional', 'friendly', 'natural', 'brisk'].includes(i.style) ? i.style : 'professional',
      voiceLanguage: i.voiceLanguage === 'follow' || /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(i.voiceLanguage || '') ? i.voiceLanguage : 'follow',
      language: typeof i.language === 'string' ? i.language.slice(0, 12) : 'auto',
      currency: /^[A-Z]{3}$/.test(i.currency || '') ? i.currency : 'auto',
    };
  }
  let profileId = 'guest', prefs = Object.assign({}, DEFAULTS), listeners = [];
  const key = () => PREFIX + encodeURIComponent(profileId);
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function apply() {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme === 'system' ? (media && media.matches ? 'dark' : 'light') : prefs.theme;
    root.dataset.layout = prefs.layout; root.dataset.sidebar = prefs.sidebar; root.dataset.font = prefs.font; root.dataset.accent = prefs.accent;
    const m = document.getElementById('iconMosaic'); if (m) m.style.display = prefs.mosaic ? '' : 'none';
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = root.dataset.theme === 'dark' ? '#0f1416' : '#1f6f5f';
  }
  function load(id) {
    profileId = id || 'guest';
    try { prefs = normalize(JSON.parse(localStorage.getItem(key()) || 'null')); } catch (e) { prefs = Object.assign({}, DEFAULTS); }
    apply(); listeners.forEach(fn => fn(prefs));
    return prefs;
  }
  function update(patch) {
    prefs = normalize(Object.assign({}, prefs, patch));
    try { localStorage.setItem(key(), JSON.stringify(prefs)); } catch (e) { /* storage unavailable: session only */ }
    apply(); listeners.forEach(fn => fn(prefs));
    return prefs;
  }
  media && media.addEventListener && media.addEventListener('change', apply);

  function dialogMarkup() {
    const t = k => window.HT.i18n.t(k);
    const i18n = window.HT.i18n;
    const langOpts = ['auto', ...Object.keys(i18n.packs)].map(c => `<option value="${c}" ${prefs.language === c ? 'selected' : ''}>${c === 'auto' ? '◎ ' + t('followBrowser') : esc(i18n.names[c])}</option>`).join('');
    const currencies = Object.keys((window.HT_CONFIG.pricing || {}).rates || { TWD: 1 });
    const curOpts = ['auto', ...currencies].map(c => `<option value="${c}" ${prefs.currency === c ? 'selected' : ''}>${c === 'auto' ? '◎ ' + t('auto') : c}</option>`).join('');
    const narrLang = prefs.voiceLanguage === 'follow' ? i18n.current : prefs.voiceLanguage;
    const vlist = window.HT.voice.list(narrLang);
    const voiceOpts = `<option value="">${t('auto')}</option>` + vlist.map(v => `<option value="${esc(v.voice.voiceURI)}" ${prefs.voiceURI === v.voice.voiceURI ? 'selected' : ''}>${esc(v.voice.name)} · ${esc(v.voice.lang)} · ${v.gender === 'female' ? t('female') : v.gender === 'male' ? t('male') : '?'}${v.local ? '' : ' · ☁'}</option>`).join('');
    const sel = (name, options) => `<select data-pref="${name}">${options.map(([v, l]) => `<option value="${v}" ${String(prefs[name]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return `<form data-pref-form>
      <fieldset><legend>${t('workspace')}</legend><div class="form-grid">
        <label>${t('theme')}${sel('theme', [['system', t('system')], ['light', t('light')], ['dark', t('dark')]])}</label>
        <label>${t('layout')}${sel('layout', [['comfortable', t('comfortable')], ['compact', t('compact')]])}</label>
        <label>${t('sidebar')}${sel('sidebar', [['left', t('left')], ['right', t('right')]])}</label>
        <label>${t('fontSize')}${sel('font', [['small', 'A−'], ['normal', 'A'], ['large', 'A+']])}</label>
        <label>${t('accent')}${sel('accent', [['green', '● 青綠 Green'], ['vermilion', '● 朱砂 Vermilion'], ['indigo', '● 靛藍 Indigo'], ['plum', '● 紫 Plum']])}</label>
        <label>Icon mosaic${sel('mosaic', [['true', 'On'], ['false', 'Off']])}</label>
      </div></fieldset>
      <fieldset><legend>${t('language')} / ${t('currency')}</legend><div class="form-grid">
        <label>${t('language')}<select data-pref="language" data-no-translate>${langOpts}</select></label>
        <label>${t('currency')}<select data-pref="currency" data-no-translate>${curOpts}</select></label>
      </div><p class="form-note">${i18n.isZh() ? '介面語言與幣別預設依瀏覽器語言／時區判斷，不使用 GPS 或 IP；可在此手動覆寫。' : 'Language and currency default to the browser language and time zone, never GPS or IP; override them here.'}</p></fieldset>
      <fieldset><legend>${t('voice')}</legend><div class="form-grid">
        <label>${t('voiceGender')}${sel('voiceGender', [['auto', t('auto')], ['female', t('female')], ['male', t('male')]])}</label>
        <label>${t('style')}${sel('style', [['professional', t('professional')], ['friendly', t('friendly')], ['natural', t('natural')], ['brisk', t('brisk')]])}</label>
        <label>${t('language')}<select data-pref="voiceLanguage" data-no-translate><option value="follow" ${prefs.voiceLanguage === 'follow' ? 'selected' : ''}>${t('followBrowser')}</option>${[...new Set(['zh-TW', 'zh-CN', 'en-US', 'en-GB', 'ja-JP', 'ko-KR', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR', ...window.HT.voice.voices().map(v => v.lang)])].sort().map(c => `<option value="${esc(c)}" ${prefs.voiceLanguage === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label>${t('voice')}<select data-pref="voiceURI" data-no-translate>${voiceOpts}</select></label>
        <label class="range-row">${t('rate')}<input type="range" min="0.6" max="1.5" step="0.05" value="${prefs.rate}" data-pref="rate"><output>${prefs.rate.toFixed(2)}×</output></label>
        <label class="range-row">${t('pitch')}<input type="range" min="0.6" max="1.5" step="0.05" value="${prefs.pitch}" data-pref="pitch"><output>${prefs.pitch.toFixed(2)}</output></label>
      </div>
      <p class="form-note" data-voice-inventory>${i18n.isZh() ? `本裝置有 ${vlist.length} 個相符語音。聲音性別由名稱推測（瀏覽器沒有標準欄位）；男／女聲偏好僅在裝置有相符聲音時有效。風格調整語速、音高及停頓，不能保證真人音質。` : `${vlist.length} matching voices on this device. Gender is inferred from voice names (browsers expose no standard field); the preference applies only when a matching voice exists. Style adjusts pace and pauses, not voice identity or neural quality.`}</p>
      <div class="row"><button type="button" class="button" data-voice-test>▶ ${t('preview')}</button><button type="button" class="button light" data-voice-stop>${t('stop')}</button><button type="button" class="button light" data-voice-refresh>${i18n.isZh() ? '重新偵測聲音' : 'Refresh voices'}</button></div><p class="voice-diagnostics" data-voice-live role="status" aria-live="polite"></p></fieldset>
      <div class="dialog-actions"><button type="button" class="button light" data-pref-export>⤓ Export</button><label class="button light" style="cursor:pointer">⤒ Import<input type="file" accept="application/json,.json" data-pref-import hidden></label><button type="button" class="text-link" data-pref-reset>Reset</button></div>
    </form>`;
  }
  function refreshVoiceOptions() {
    const body = document.getElementById('dialogBody'); if (!body) return;
    const select = body.querySelector('[data-pref="voiceURI"]'); if (!select) return;
    const t = k => window.HT.i18n.t(k), z = window.HT.i18n.isZh();
    const lang = prefs.voiceLanguage === 'follow' ? window.HT.i18n.current : prefs.voiceLanguage;
    const items = window.HT.voice.list(lang);
    select.innerHTML = `<option value="">${t('auto')}</option>` + items.map(v => `<option value="${esc(v.voice.voiceURI)}">${esc(v.voice.name)} · ${esc(v.voice.lang)} · ${v.gender === 'female' ? t('female') + (z ? '（推測）' : ' (inferred)') : v.gender === 'male' ? t('male') + (z ? '（推測）' : ' (inferred)') : (z ? '性別未知' : 'gender unknown')}${v.local ? '' : ' · ☁'}</option>`).join('');
    const backend=window.HT.voice.state.backend;
    const local=(backend && backend.voices || []).filter(v=>v.id && String(v.language).split('-')[0]===String(lang).split('-')[0]);
    local.forEach(v=>{const option=document.createElement('option');option.value='server:'+v.id;option.textContent=v.label+' · '+v.language+' · '+(v.gender==='male'?t('male'):v.gender==='female'?t('female'):'?')+' · CPU';select.appendChild(option);});
    select.value = items.some(v => v.voice.voiceURI === prefs.voiceURI) || local.some(v=>'server:'+v.id===prefs.voiceURI) ? prefs.voiceURI : '';
    const note = body.querySelector('[data-voice-inventory]');
    if(note) note.textContent = z ? `裝置 ${items.length} 個聲音；本機 CPU ${local.length} 個相符聲音。語音載入可能稍晚；請按試聽。男／女聲依實際聲音名稱推測，調音高不代表變更性別。` : `${items.length} device voices; ${local.length} matching local CPU voices. Loading may be delayed; tap Preview. Gender is inferred from voice names; changing pitch does not change voice identity.`;
    const live = body.querySelector('[data-voice-live]');
    if(live) { const s=window.HT.voice.state; live.dataset.state=s.phase; live.textContent = (z ? '狀態：' : 'Status: ') + s.phase + (s.backend ? (s.backend.available ? (z ? ' · 已安裝本機 CPU 語音' : ' · local CPU voice installed') : (z ? ' · 本機 CPU 語音尚未設定' : ' · local CPU TTS not configured')) : '') + (s.phase==='unavailable' || s.phase==='blocked' ? (z ? '。請在頁面語音列按「再試一次」；確認媒體音量與手機 TTS 語言包。' : '. Tap Retry in the voice bar; check media volume and your phone TTS language pack.') : ''); }
  }
  window.addEventListener('ht:voices', refreshVoiceOptions);
  window.addEventListener('ht:voice-state', refreshVoiceOptions);
  function open() {
    const app = window.HT.app;
    app.dialog(window.HT.i18n.t('workspace'), dialogMarkup());
    const body = document.getElementById('dialogBody');
    body.querySelectorAll('[data-pref]').forEach(input => {
      input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
        const k = input.dataset.pref;
        let v = input.type === 'range' ? Number(input.value) : input.value;
        if (k === 'mosaic') v = v === 'true';
        update({ [k]: v, ...(k === 'voiceLanguage' ? { voiceURI: '' } : {}) });
        if (input.type === 'range') input.nextElementSibling.textContent = v.toFixed(2) + (k === 'rate' ? '×' : '');
        if (k === 'language' || k === 'currency') { app.applyLanguage(); }
        if (k === 'language') { open(); } else if (k === 'voiceLanguage') { refreshVoiceOptions(); }
      });
    });
    body.querySelector('[data-voice-test]').onclick = () => { const lang = prefs.voiceLanguage === 'follow' ? window.HT.i18n.current : prefs.voiceLanguage; const ok = window.HT.voice.speak(window.HT.voice.sample(lang), { lang, voiceURI: prefs.voiceURI, gender: prefs.voiceGender, rate: prefs.rate, pitch: prefs.pitch, style: prefs.style }); if (!ok) app.toast(window.HT.i18n.isZh() ? '此裝置沒有可用語音。' : 'No voice available on this device.'); };
    body.querySelector('[data-voice-stop]').onclick = () => window.HT.voice.stop();
    body.querySelector('[data-voice-refresh]').onclick = () => { window.HT.voice.ensureVoices().then(refreshVoiceOptions); window.HT.voice.backendStatus().then(refreshVoiceOptions); refreshVoiceOptions(); };
    refreshVoiceOptions();
    window.HT.voice.ensureVoices().then(refreshVoiceOptions);
    window.HT.voice.backendStatus().then(refreshVoiceOptions);
    body.querySelector('[data-pref-reset]').onclick = () => { update(Object.assign({}, DEFAULTS)); app.applyLanguage(); open(); };
    body.querySelector('[data-pref-export]').onclick = () => { const blob = new Blob([JSON.stringify({ format: 'huatuo-workspace', version: 1, preferences: prefs }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'HuaTuo_Workspace_Preferences.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    body.querySelector('[data-pref-import]').onchange = async e => { const f = e.target.files && e.target.files[0]; if (!f) return; try { if (f.size > 20000) throw new Error('size'); const d = JSON.parse(await f.text()); if (d.format !== 'huatuo-workspace') throw new Error('format'); update(normalize(d.preferences)); app.applyLanguage(); open(); } catch (err) { app.toast('Import failed'); } };
  }
  window.HT = window.HT || {};
  window.HT.prefs = { DEFAULTS, normalize, load, update, open, apply, get current() { return prefs; }, onChange(fn) { listeners.push(fn); },
    speechOptions() { const lang = prefs.voiceLanguage === 'follow' ? window.HT.i18n.current : prefs.voiceLanguage; return { lang, voiceURI: prefs.voiceURI, gender: prefs.voiceGender, rate: prefs.rate, pitch: prefs.pitch, style: prefs.style }; } };
})(window);
