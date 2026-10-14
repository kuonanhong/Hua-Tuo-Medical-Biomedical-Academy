/* Classic-script loader: works when index.html is double-clicked (file://), on static hosts
   (GitHub Pages) and behind the Python server. ES-module imports are blocked under file://,
   so every module attaches to window.HT instead. */
(function () {
  'use strict';
  function load(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = resolve; s.onerror = () => reject(new Error('Unable to load ' + src));
      document.head.appendChild(s);
    });
  }
  window.HT = window.HT || {};
  window.HT.loadScript = load;
  (async function () {
    await load('config.js');
    const cfg = window.HT_CONFIG || {};
    const isFile = location.protocol === 'file:';
    const staticHost = /(^|\.)github\.io$/i.test(location.hostname || '') || /(^|\.)pages\.dev$/i.test(location.hostname || '') || /(^|\.)netlify\.app$/i.test(location.hostname || '');
    window.HT.staticMode = cfg.siteMode === 'static' || (cfg.siteMode !== 'server' && (isFile || staticHost));
    window.HT.fileMode = isFile;
    for (const f of ['i18n.js', 'icons.js', 'data/departments.js', 'data/catalog.js', 'voice.js', 'personalization.js', 'locale.js', 'account.js', 'membership.js', 'tutor.js', 'intern-tcm.js', 'intern-western.js', 'tcm-library.js', 'nobel-explorer.js', 'course-player.js', 'app.js']) {
      await load(f);
    }
  })().catch(error => {
    const main = document.getElementById('main');
    if (!main) return;
    main.innerHTML = '';
    const h = document.createElement('h2'); h.textContent = '學院載入失敗 / The academy could not load';
    const p = document.createElement('p'); p.textContent = '請先完整解壓縮 ZIP，再以 Chrome、Edge、Firefox 或 Safari 開啟最外層 index.html，並保留 public/academy/ 的所有檔案。Extract the whole ZIP before opening index.html.';
    const c = document.createElement('code'); c.textContent = error.message;
    main.append(h, p, c);
  });
})();
