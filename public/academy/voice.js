/* Device TTS first, optional local CPU TTS second. A request is never labelled as audible
   before onstart/onplaying. No voice count precondition: Android/iOS may populate it later. */
(function (window) {
  'use strict';
  const synth = window.speechSynthesis;
  const DEFAULT = Object.freeze({ voiceURI: '', gender: 'auto', rate: 1, pitch: 1, style: 'professional', language: 'follow' });
  const STYLE = Object.freeze({ professional: {rate: .92, pitch: .98, pause: 220}, friendly: {rate: .98, pitch: 1.03, pause: 150}, natural: {rate: 1, pitch: 1, pause: 180}, brisk: {rate: 1.15, pitch: 1, pause: 100} });
  // Hints only. Web Speech has no gender metadata; an unknown voice stays unknown.
  const FEMALE = /\bfemale\b|女|hsiao|xiaoxiao|xiaoyi|yating|yaoyao|huihui|nanami|haruka|sunhi|heami|zira|aria|jenny|samantha|karen|moira|tessa|fiona|victoria|ting.?ting|mei.?jia|sin.?ji|kyoko|monica|paulina|amelie|alice|federica|helena|zuzana|luciana|milena|alva|satu|katya|damayanti|kanya/i;
  const MALE = /\bmale\b|男|yunjhe|yunxi|yunyang|kangkang|keita|naoki|injoon|david|mark|christopher|ryan|brian|george|daniel|\balex\b|fred|rishi|arthur|conrad|henri|stefan|hans|luca|diego|jorge|carlos|miguel|pedro|dmitry|pavel|ivan|yuri|otoya|sin.?hung|wan.?lung|ko.?hung/i;
  const base = value => String(value || '').toLowerCase().replace(/_/g, '-').split('-')[0];
  const norm = value => String(value || '').toLowerCase().replace(/_/g, '-').replace('zh-hant', 'zh-tw').replace('zh-hans', 'zh-cn');
  let state = {phase:'idle', engine:'', message:'', voiceCount:0, backend:null};
  let serial = 0, session = null, lastRequest = null, change = null, listeners = [], readyPromise = null, dock = null;
  const timers = new Set();
  function after(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; }
  function clearTimers() { timers.forEach(clearTimeout); timers.clear(); }
  function voices() { try { return synth ? Array.from(synth.getVoices() || []) : []; } catch (e) { return []; } }
  function inferGender(v) { const n = v.name || ''; if (FEMALE.test(n)) return 'female'; if (MALE.test(n)) return 'male'; return 'unknown'; }
  function list(lang) { return voices().filter(v => !lang || base(v.lang) === base(lang)).map(v => ({voice:v, gender:inferGender(v), local:v.localService === true})); }
  function choose(lang, prefs) {
    const p = Object.assign({}, DEFAULT, prefs || {}), candidates = list(lang);
    if (!candidates.length) return null;
    const exact = candidates.find(v => p.voiceURI && (v.voice.voiceURI === p.voiceURI || v.voice.name === p.voiceURI));
    if (exact) return exact.voice;
    return candidates.sort((a,b) => score(b)-score(a))[0].voice;
    function score(v) { return (norm(v.voice.lang) === norm(lang) ? 12 : 0) + (v.gender === p.gender && p.gender !== 'auto' ? 5 : 0) + (v.local ? 2 : 0) + (v.voice.default ? 1 : 0); }
  }
  function chunk(text) {
    const parts = [], sentences = String(text || '').replace(/\s+/g,' ').match(/(?:[^。.!?！？；;]|\.(?=\d))+[。.!?！？；;]?/g) || [];
    sentences.forEach(sentence => {
      let s = sentence.trim();
      while (s.length > 140) { let cut = Math.max(s.lastIndexOf('，',140),s.lastIndexOf(',',140),s.lastIndexOf(' ',140)); if(cut < 45) cut = 140; else cut++; parts.push(s.slice(0,cut).trim()); s=s.slice(cut).trim(); }
      if(s) parts.push(s);
    });
    return parts;
  }
  function emit(patch) {
    state = Object.assign({}, state, patch, {voiceCount:voices().length});
    const active = ['starting','loading','speaking','paused','ready-audio'].includes(state.phase);
    if(change) change(active);
    listeners.forEach(fn => { try { fn(Object.assign({},state)); } catch(e) {} });
    if(window.dispatchEvent && window.CustomEvent) window.dispatchEvent(new CustomEvent('ht:voice-state',{detail:Object.assign({},state)}));
    paint();
  }
  function cancelAudio(s) { if(!s) return; if(s.abort) s.abort.abort(); if(s.audio) {s.audio.pause(); s.audio.removeAttribute('src');} if(s.url) URL.revokeObjectURL(s.url); }
  function stop(silent) {
    serial++; const old = session; session = null; clearTimers(); cancelAudio(old);
    try { if(synth) synth.cancel(); } catch(e) {}
    if(!silent) emit({phase:'idle',engine:'',message:''});
  }
  function ensureVoices(timeout) {
    if(voices().length) return Promise.resolve(voices());
    if(readyPromise) return readyPromise;
    readyPromise = new Promise(resolve => {
      const start=Date.now(), poll=() => { const found=voices(); if(found.length || Date.now()-start >= (timeout || 3500)) { readyPromise=null; emit({}); resolve(found); } else setTimeout(poll,150); };
      poll();
    });
    return readyPromise;
  }
  function valid(s) { return session === s && serial === s.id; }
  function fail(s, code) { if(!valid(s)) return; emit({phase:code === 'not-allowed' ? 'blocked' : 'unavailable',engine:s.engine || '',message:code || 'speech-unavailable'}); }
  function next(s) {
    if(!valid(s) || s.paused) return;
    if(s.index >= s.chunks.length) { emit({phase:'finished', message:'',engine:s.engine}); return; }
    const Utterance=window.SpeechSynthesisUtterance;
    if(!synth || !Utterance) { fallback(s,'unsupported'); return; }
    const text=s.chunks[s.index], u=new Utterance(text), v=choose(s.opts.lang,s.opts), style=STYLE[s.opts.style] || STYLE.professional;
    s.engine='device'; s.current=u; s.started=false;
    u.lang = v ? v.lang : s.opts.lang; if(v) u.voice=v;
    u.rate=Math.max(.5,Math.min(2,s.opts.rate*style.rate)); u.pitch=Math.max(.5,Math.min(2,s.opts.pitch*style.pitch)); u.volume=1;
    u.onstart=() => { if(!valid(s) || s.current!==u) return; s.started=true; emit({phase:s.paused?'paused':'speaking', engine:'device',message:'',voice:v?v.name:''}); };
    u.onend=() => { if(!valid(s) || s.current!==u) return; s.current=null; s.index++; if(!s.paused) after(()=>next(s),style.pause); };
    u.onerror=e => { if(!valid(s) || s.current!==u) return; s.current=null; fallback(s,e.error || 'synthesis-failed'); };
    emit({phase:'starting',engine:'device',voice:v?v.name:'',message:voices().length?'':'loading-voices'});
    try { synth.resume(); synth.speak(u); } catch(e) { fallback(s,'synthesis-failed'); return; }
    // A silent browser rejection must be visible. Retry only once when voices arrive; otherwise
    // use server audio or ask for a fresh explicit tap. Never advance past a failed paragraph.
    after(() => {
      if(!valid(s) || s.current!==u || s.started || s.paused) return;
      if(!s.retried && voices().length) { s.retried=true; s.current=null; try{synth.cancel();}catch(e){} next(s); }
      else fallback(s,'start-timeout');
    },3200);
  }
  function apiBase() { return String((window.HT_CONFIG || {}).apiBase || '').replace(/\/$/,''); }
  function serverPossible() { return !(window.HT && window.HT.fileMode) && (!(window.HT && window.HT.staticMode) || !!apiBase()); }
  async function backendStatus() {
    if(!serverPossible() || !window.fetch) { emit({backend:{available:false,reason:'static-host'}}); return state.backend; }
    try { const r=await fetch(apiBase()+'/api/tts/status',{credentials:'same-origin'}); if(!r.ok) throw Error('unavailable'); const d=await r.json(); emit({backend:d}); return d; } catch(e) { emit({backend:{available:false,reason:'not-configured'}}); return state.backend; }
  }
  async function fallback(s, reason) {
    if(!valid(s) || s.fallback) { if(valid(s)) fail(s,reason); return; }
    s.fallback=true; s.current=null; try{if(synth) synth.cancel();}catch(e){}
    if(!serverPossible() || !window.fetch || !window.Audio) { fail(s,reason); return; }
    emit({phase:'loading',engine:'local-server',message:'generating-audio'});
    try {
      s.abort = window.AbortController ? new AbortController() : null;
      const r=await fetch(apiBase()+'/api/tts',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:s.chunks.slice(s.index).join(' '),language:s.opts.lang,voice:s.opts.voiceURI,gender:s.opts.gender,rate:s.opts.rate,style:s.opts.style}),...(s.abort?{signal:s.abort.signal}:{})});
      if(!valid(s)) return;
      if(!r.ok) { let error='local-tts-unavailable'; try {const d=await r.json(); error=d.error||d.message||error;}catch(e){} throw Error(error); }
      const blob=await r.blob(); if(!valid(s)) return;
      if(!blob.size || !/audio\//.test(blob.type)) throw Error('invalid-audio');
      s.url=URL.createObjectURL(blob); s.audio=new Audio(s.url); s.engine='local-server';
      s.audio.onplaying=()=>{if(valid(s))emit({phase:'speaking',engine:'local-server',message:''});};
      s.audio.onended=()=>{if(valid(s))emit({phase:'finished',engine:'local-server',message:''});};
      s.audio.onerror=()=>{if(valid(s))fail(s,'audio-playback-error');};
      emit({phase:'ready-audio',engine:'local-server',message:'tap-play-audio'});
      try { await s.audio.play(); } catch(e) { if(valid(s))emit({phase:'ready-audio',engine:'local-server',message:'tap-play-audio'}); }
    } catch(e) { if(valid(s))fail(s,e.message || reason); }
  }
  function speak(text, options) {
    const input=String(text || '').trim(); if(!input) return false;
    const opts=Object.assign({},DEFAULT,options || {}); opts.lang=opts.lang || document.documentElement.lang || navigator.language || 'zh-TW';
    opts.rate=Number(opts.rate)||1; opts.pitch=Number(opts.pitch)||1;
    lastRequest={text:input,opts}; stop(true);
    const s={id:serial,index:0,chunks:chunk(input.slice(0,6000)),opts,paused:false}; session=s;
    if(!s.chunks.length) return false;
    ensureVoices(); if(opts.voiceURI.indexOf('server:')===0)fallback(s,'server-selected');else next(s); return true;
  }
  function pause() { const s=session; if(!s || !['speaking','starting'].includes(state.phase))return; s.paused=true; if(s.audio)s.audio.pause(); else try{synth.pause();}catch(e){} emit({phase:'paused'}); }
  function resume() {
    const s=session; if(!s)return false;
    if(s.audio) { s.paused=false; s.audio.play().catch(()=>emit({phase:'ready-audio',message:'tap-play-audio'})); return true; }
    if(s.paused){s.paused=false; if(s.current && !s.started){s.current=null;try{synth.cancel();}catch(e){}next(s);return true;} if(s.current){try{synth.resume();}catch(e){fallback(s,'resume-failed');} emit({phase:'speaking'});}else next(s);return true;}
    return false;
  }
  function retry() { if(state.phase==='ready-audio') return resume(); return lastRequest ? speak(lastRequest.text,lastRequest.opts) : unlock(); }
  function sample(lang) { const texts={zh:'歡迎來到華佗醫藥生醫學院。請先觀看師傅示範，再依紅色箭頭完成虛擬練習。您可以暫停、重播，或開啟輔助。',en:'Welcome to Hua Tuo Medical Academy. Watch the mentor first, then follow the red arrows in the virtual practice. You can pause, replay, or turn on assistance.',ja:'華佗医学院へようこそ。まず師匠の実演を見て、赤い矢印に沿って仮想実習を進めましょう。',ko:'화타 의학원에 오신 것을 환영합니다. 먼저 스승의 시범을 보고 빨간 화살표를 따라 가상 실습을 해 보세요.',es:'Bienvenido a la Academia Médica Hua Tuo. Primero observa al mentor y sigue las flechas rojas en la práctica virtual.',fr:'Bienvenue à l’Académie médicale Hua Tuo. Observez le mentor puis suivez les flèches rouges pendant la simulation.',de:'Willkommen in der Hua Tuo Medizinakademie. Beobachten Sie zuerst den Mentor und folgen Sie den roten Pfeilen in der Simulation.',pt:'Bem-vindo à Academia Médica Hua Tuo. Observe o mentor e siga as setas vermelhas na prática virtual.'}; return texts[base(lang)] || texts.en; }
  function unlock() { const options=window.HT && window.HT.prefs ? window.HT.prefs.speechOptions() : {lang:document.documentElement.lang}; return speak(sample(options.lang),options); }
  const M={
    en:{voice:'Voice',enable:'Enable / test speech',settings:'Voice settings',pause:'Pause',resume:'Resume / play',retry:'Retry speech',stop:'Stop',idle:'Tap to enable speech',starting:'Starting voice…',loading:'Generating local audio…',speaking:'Speaking',paused:'Paused',finished:'Finished',ready:'Audio is ready — tap Play',blocked:'Tap Retry to allow audio',unavailable:'Voice unavailable',help:'If silent: turn up media volume; enable the phone’s text-to-speech engine and download the lesson language. Local CPU speech requires the server and a matching voice model. Device voices vary; pitch does not change voice gender.',device:'Device voice',server:'Local CPU voice'},
    zh:{voice:'師傅語音',enable:'啟用／測試語音',settings:'聲音設定',pause:'暫停',resume:'繼續／播放',retry:'再試一次',stop:'停止',idle:'點一下啟用聲音',starting:'正在啟動聲音…',loading:'本機正在生成語音…',speaking:'正在講解',paused:'已暫停',finished:'講解結束',ready:'語音已生成，請按播放',blocked:'請按「再試一次」允許播放',unavailable:'目前無法發聲',help:'若沒有聲音：調高媒體音量；在手機設定啟用文字轉語音引擎並下載教材語言。離線 CPU 語音需啟動伺服器並安裝相符語音模型。各裝置聲音不同；調音高不代表男／女聲。',device:'裝置語音',server:'本機 CPU 語音'}
  };
  function words(){ return M[base((window.HT && window.HT.i18n && window.HT.i18n.current)||document.documentElement.lang)] || M.en; }
  function paint() {
    if(!dock)return; const m=words(), phase=state.phase;
    const label=phase==='ready-audio'?m.ready:phase==='error'||phase==='unavailable'?m.unavailable:m[phase]||m.idle;
    dock.querySelector('[data-voice-status]').textContent=label + (state.voice ? ' · '+state.voice : '');
    dock.querySelector('[data-voice-enable]').textContent=m.enable;
    dock.querySelector('[data-voice-settings]').textContent=m.settings;
    dock.querySelector('[data-voice-pause]').textContent=m.pause;
    dock.querySelector('[data-voice-resume]').textContent=m.resume;
    dock.querySelector('[data-voice-retry]').textContent=m.retry;
    dock.querySelector('[data-voice-stop]').textContent=m.stop;
    dock.querySelector('[data-voice-help]').textContent=m.help;
    dock.querySelector('[data-voice-pause]').hidden=!['speaking','starting'].includes(phase);
    dock.querySelector('[data-voice-resume]').hidden=!['paused','ready-audio'].includes(phase);
    dock.querySelector('[data-voice-retry]').hidden=!['blocked','unavailable','error'].includes(phase);
    dock.querySelector('[data-voice-stop]').hidden=!['speaking','starting','paused','loading','ready-audio'].includes(phase);
    dock.dataset.phase=phase;
    if(['blocked','unavailable','error'].includes(phase))dock.querySelector('details').open=true;
  }
  function mount() {
    if(!document.createElement || document.getElementById('voiceDock'))return;
    const main=document.getElementById('main'); if(!main || !main.parentNode)return;
    dock=document.createElement('section');dock.id='voiceDock';dock.className='voice-dock';dock.setAttribute('aria-label','Voice controls');
    dock.innerHTML='<div class="voice-dock-row"><button type="button" class="button light small" data-voice-enable></button><span data-voice-status role="status" aria-live="polite"></span><button type="button" class="button light small" data-voice-pause hidden></button><button type="button" class="button small" data-voice-resume hidden></button><button type="button" class="button light small" data-voice-retry hidden></button><button type="button" class="button light small" data-voice-stop hidden></button><button type="button" class="text-link" data-voice-settings></button></div><details><summary>ⓘ TTS · Android / iOS / CPU</summary><p data-voice-help></p></details>';
    main.parentNode.insertBefore(dock,main);
    dock.querySelector('[data-voice-enable]').onclick=unlock;
    dock.querySelector('[data-voice-pause]').onclick=pause;
    dock.querySelector('[data-voice-resume]').onclick=resume;
    dock.querySelector('[data-voice-retry]').onclick=retry;
    dock.querySelector('[data-voice-stop]').onclick=()=>stop();
    dock.querySelector('[data-voice-settings]').onclick=()=>{if(window.HT.prefs)window.HT.prefs.open();};
    paint();
  }
  function refresh(){emit({}); if(window.dispatchEvent && window.CustomEvent)window.dispatchEvent(new CustomEvent('ht:voices'));}
  if(synth) { if(synth.addEventListener)synth.addEventListener('voiceschanged',refresh); else {const previous=synth.onvoiceschanged;synth.onvoiceschanged=e=>{if(previous)previous(e);refresh();};} }
  if(window.addEventListener){window.addEventListener('languagechange',paint);window.addEventListener('hashchange',paint);}
  window.HT=window.HT || {};
  window.HT.voice={DEFAULT,STYLE,voices,list,choose,inferGender,chunk,speak,stop,pause,resume,retry,unlock,sample,ensureVoices,backendStatus,refresh:paint,mount,get state(){return Object.assign({},state);},get speaking(){return ['speaking','starting','loading','paused','ready-audio'].includes(state.phase);},set onStateChange(fn){change=fn;},onStatus(fn){listeners.push(fn);return()=>{listeners=listeners.filter(x=>x!==fn);};}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  ensureVoices();
})(window);
