/* Fast-start loader (v3.3). Classic scripts: works from file://, GitHub Pages and the Python server.
   Phase 1 loads only the shell (config, core interface strings, icons, preferences, account,
   membership, department list, a 4 KB home summary and app.js) so the home page paints first.
   Everything else — the 2,400-course catalogue, course players, simulators, atlases, labs,
   language packs and data chunks — is lazy-loaded per route, then prefetched while idle. */
(function () {
  'use strict';
  var loaded = {};
  var loadingCss = {};
  function load(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = function () { resolve(src); };
      s.onerror = function () { delete loaded[src]; reject(new Error('Unable to load ' + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  function loadCss(href) {
    if (loadingCss[href]) return loadingCss[href];
    loadingCss[href] = new Promise(function (resolve) {
      if (document.querySelector('link[href="' + href + '"]')) { resolve(href); return; }
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      l.onload = function () { resolve(href); };
      l.onerror = function () { resolve(href); };
      document.head.appendChild(l);
    });
    return loadingCss[href];
  }
  function loadJson(url) {
    if (loaded[url]) return loaded[url];
    loaded[url] = fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.json(); })
      .catch(function (e) { delete loaded[url]; throw e; });
    return loaded[url];
  }
  function series(list) { return list.reduce(function (p, f) { return p.then(function () { return typeof f === 'function' ? f() : load(f); }); }, Promise.resolve()); }

  // Route → modules. Each entry is loaded once, in order, only when that page is first opened.
  var MODULES = {
    catalog: ['data/catalog.js'],
    // The course page opens from its own ~6 KB preview chunk (catalogue entry included); the
    // catalogue itself arrives through the idle prefetch.
    course: ['voice.js', 'tutor.js', 'xp.js', 'workbench.js', 'theatre.js', 'theatre3d.js', 'procedures.js', 'intern-tcm.js', 'intern-western.js', 'tcm-library.js', 'tcm-library-v2.js', 'course-player.js'],
    intern: ['data/catalog.js', 'voice.js', 'tutor.js', 'xp.js', 'workbench.js', 'theatre.js', 'theatre3d.js', 'procedures.js', 'intern-tcm.js', 'intern-western.js', 'tcm-library.js', 'tcm-library-v2.js'],
    workbench: ['data/catalog.js', 'voice.js', 'tutor.js', 'xp.js', 'workbench.js', 'theatre.js', 'theatre3d.js', 'procedures.js'],
    procedures: ['data/catalog.js', 'voice.js', 'tutor.js', 'xp.js', 'workbench.js', 'theatre.js', 'theatre3d.js', 'procedures.js'],
    tcm: ['data/catalog.js', 'tcm-library.js', 'tcm-library-v2.js', 'content-hub.js', 'acu-atlas.js'],
    acu: ['voice.js', 'tutor.js', 'tcm-library.js', 'acu-atlas.js'],
    pharmacy: ['voice.js', 'tutor.js', 'pharmacy-lab.js'],
    twins: ['voice.js', 'tutor.js', 'twins.js'],
    nobel: ['data/catalog.js', 'nobel-explorer.js'],
    ai: ['data/catalog.js', 'nobel-explorer.js'],
    parkinson: ['data/catalog.js', 'content-hub.js'],
    resources: ['data/catalog.js', 'content-hub.js'],
    learn: ['data/catalog.js', 'content-hub.js', 'voice.js', 'tutor.js', 'xp.js', 'workbench.js', 'theatre.js', 'theatre3d.js', 'procedures.js'],
    progress: ['data/catalog.js'],
    sources: ['data/catalog.js'],
    membership: [],
    home: []
  };
  var CSS = { workbench: ['workbench.css', 'theatre.css'], procedures: ['workbench.css', 'theatre.css', 'procedures.css'], course: ['workbench.css', 'theatre.css', 'procedures.css', 'content-hub.css'], intern: ['workbench.css', 'theatre.css', 'content-hub.css'], learn: ['workbench.css', 'theatre.css', 'content-hub.css'], tcm: ['content-hub.css', 'acu-atlas.css'], parkinson: ['content-hub.css'], resources: ['content-hub.css'], acu: ['content-hub.css', 'acu-atlas.css'], pharmacy: ['pharmacy-lab.css'], twins: ['twins.css'] };

  window.HT = window.HT || {};
  window.HT.loadScript = load;
  window.HT.loadCss = loadCss;
  window.HT.loadJson = loadJson;
  window.HT.loader = {
    modules: MODULES,
    ensure: function (page) {
      var mods = MODULES[page] || [];
      var css = CSS[page] || [];
      css.forEach(loadCss);
      return series(mods).then(function () {
        // Modules that were stubbed in the shell need to re-bind their hooks.
        if (window.HT.afterModuleLoad) window.HT.afterModuleLoad(page);
      });
    },
    prefetch: function () {
      var order = ['data/catalog.js', 'voice.js', 'tutor.js', 'xp.js', 'workbench.js', 'theatre.js', 'theatre3d.js', 'procedures.js', 'course-player.js', 'intern-tcm.js', 'intern-western.js', 'tcm-library.js', 'tcm-library-v2.js', 'content-hub.js', 'acu-atlas.js', 'pharmacy-lab.js', 'twins.js', 'nobel-explorer.js'];
      var i = 0;
      function next() {
        if (i >= order.length) return;
        var src = order[i++];
        var run = function () { load(src).then(function () { schedule(next); }, function () { schedule(next); }); };
        run();
      }
      function schedule(fn) { if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 4000 }); else setTimeout(fn, 600); }
      schedule(next);
    },
    loaded: function (src) { return !!loaded[src]; }
  };

  (function boot() {
    var start = Date.now();
    load('config.js').then(function () {
      var cfg = window.HT_CONFIG || {};
      var isFile = location.protocol === 'file:';
      var host = location.hostname || '';
      var staticHost = /(^|\.)github\.io$/i.test(host) || /(^|\.)pages\.dev$/i.test(host) || /(^|\.)netlify\.app$/i.test(host);
      window.HT.staticMode = cfg.siteMode === 'static' || (cfg.siteMode !== 'server' && (isFile || staticHost));
      window.HT.fileMode = isFile;
      window.HT.bootStartedAt = start;
      // Shell only: ~160 KB raw instead of the former 2.6 MB synchronous chain.
      return series(['i18n.js', 'icons.js', 'personalization.js', 'locale.js', 'account.js', 'membership.js', 'safe-links.js', 'data/departments.js', 'data/home-summary.js', 'app.js']);
    }).catch(function (error) {
      var main = document.getElementById('main');
      if (!main) return;
      main.innerHTML = '';
      var h = document.createElement('h2'); h.textContent = '學院載入失敗 / The academy could not load';
      var p = document.createElement('p'); p.textContent = '請先完整解壓縮 ZIP，再以 Chrome、Edge、Firefox 或 Safari 開啟最外層 index.html，並保留 public/academy/ 的所有檔案。Extract the whole ZIP before opening index.html.';
      var c = document.createElement('code'); c.textContent = error.message;
      main.append(h, p, c);
    });
  })();
})();
