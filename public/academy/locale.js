/* Content translation for languages beyond the authored zh-TW/en core. Uses the server route
   /api/translate (configured generative AI) with a bounded browser cache. Interface strings do
   not need this (see i18n.js). Original text is always kept when translation is unavailable. */
(function (window) {
  'use strict';
  const KEY = 'ht-translation-cache-v1', MAX = 2500;
  let cache = new Map();
  try { const saved = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(saved)) saved.slice(-MAX).forEach(([k, v]) => cache.set(k, v)); } catch (e) { /* ignore */ }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify([...cache].slice(-MAX))); } catch (e) { /* ignore */ } }
  const core = lang => lang === 'zh-TW' || lang === 'zh-CN' || lang === 'en';
  function available() { return !window.HT.staticMode && window.HT.account && window.HT.account.user() && window.HT.account.aiAvailable(); }
  async function translate(texts, lang) {
    if (core(lang)) return texts;
    const out = texts.map(t => cache.get(lang + '\u0000' + t));
    const missing = texts.filter((t, i) => out[i] === undefined && t && t.trim());
    if (missing.length && available()) {
      try {
        for (let i = 0; i < missing.length; i += 12) {
          const batch = missing.slice(i, i + 12);
          const r = await fetch((window.HT_CONFIG.apiBase || '') + '/api/translate', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: lang, texts: batch }) });
          if (!r.ok) break;
          const d = await r.json();
          if (Array.isArray(d.translations) && d.translations.length === batch.length) batch.forEach((t, j) => cache.set(lang + '\u0000' + t, d.translations[j]));
        }
        persist();
      } catch (e) { /* keep originals */ }
    }
    return texts.map(t => cache.get(lang + '\u0000' + t) || t);
  }
  /* Pick the authored language field for the current UI language: zh-* → zh, otherwise en. */
  function pick(obj, field, lang) {
    lang = lang || window.HT.i18n.current;
    if (!obj) return '';
    const zh = obj[field], en = obj[field + 'En'];
    if (lang.startsWith('zh')) return zh || en || '';
    return en || zh || '';
  }
  window.HT = window.HT || {};
  window.HT.locale = { translate, pick, core, available, clear() { cache.clear(); persist(); } };
})(window);
