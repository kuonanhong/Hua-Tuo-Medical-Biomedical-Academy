/* Authored course originals are Traditional Chinese and English. Optional AI translation is
   labelled, reversible and never silently advertised as a complete authored language edition. */
(function(window){
  'use strict';
  const KEY='ht-translation-cache-v2', MAX=2500;
  let cache=new Map(), cloudConsent=!!((window.HT_CONFIG||{}).aiAutoConsent), report={requested:0,translated:0,error:''}, busy=false, timer=null;
  const originals=new WeakMap(), rendered=new WeakMap(), attempted=new WeakMap(), originalOnly=new Set();
  try{const data=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(data))data.slice(-MAX).forEach(([k,v])=>{if(typeof k==='string'&&typeof v==='string')cache.set(k,v);});}catch(e){}
  function persist(){try{localStorage.setItem(KEY,JSON.stringify([...cache].slice(-MAX)));}catch(e){}}
  const core=lang=>['zh-TW','zh-CN','en'].includes(lang);
  const authored=lang=>['zh-TW','en'].includes(lang);
  function coverage(lang){
    lang=lang||window.HT.i18n.current;
    const cachedCount=[...cache.keys()].filter(k=>k.startsWith(lang+'\u0000')).length;
    const ui=window.HT.i18n.coverage?window.HT.i18n.coverage(lang):{translated:0,total:0};
    return Object.assign({},ui,{language:lang,originalLanguages:['zh-TW','en'],
      mode:authored(lang)?'original':!core(lang)&&cachedCount>0&&!originalOnly.has(lang)?'machine-translation':'source-fallback',
      cachedTranslations:cachedCount,showingOriginal:originalOnly.has(lang),
      fullMedicalTranslation:false,translationMedicallyReviewed:false});
  }
  function routes(){return window.HT.account && window.HT.account.aiRoutes ? window.HT.account.aiRoutes():[];}
  function route(){const r=routes();return r.find(x=>!x.cloud)||r[0];}
  function available(){return !window.HT.staticMode && window.HT.account && window.HT.account.aiAvailable() && !!route();}
  const key=(lang,text)=>lang+'\u0000'+text;
  async function translate(texts,lang){
    if(core(lang)||originalOnly.has(lang))return texts;
    const input=texts.map(x=>String(x||'')), missing=[...new Set(input.filter(t=>t.trim()&&!cache.has(key(lang,t))))];
    report={requested:missing.length,translated:0,error:''};
    const selected=route();
    if(missing.length && available() && (!selected.cloud || cloudConsent)){
      try{
        for(let i=0;i<missing.length;i+=12){
          const batch=missing.slice(i,i+12);
          const r=await fetch(String((window.HT_CONFIG||{}).apiBase||'').replace(/\/$/,'')+'/api/translate',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:lang,texts:batch,route:selected.id,cloudConsent:cloudConsent})});
          if(!r.ok){report.error='translation-unavailable';break;}
          const d=await r.json();
          if(!Array.isArray(d.translations)||d.translations.length!==batch.length||d.translations.some(t=>typeof t!=='string')){report.error='invalid-translation';break;}
          batch.forEach((t,j)=>{cache.set(key(lang,t),d.translations[j]);report.translated++;});
        }
        persist();
      }catch(e){report.error='translation-unavailable';}
    }else if(missing.length){report.error=selected&&selected.cloud&&!cloudConsent?'cloud-consent-required':'local-model-not-connected';}
    return input.map(t=>cache.get(key(lang,t))||t);
  }
  function pick(obj,field,lang){
    lang=lang||window.HT.i18n.current;if(!obj)return '';
    const text=lang.startsWith('zh')?(obj[field]||obj[field+'En']||''):(obj[field+'En']||obj[field]||'');
    return !core(lang)&&!originalOnly.has(lang)?(cache.get(key(lang,text))||text):text;
  }
  function cached(text,lang){lang=lang||window.HT.i18n.current;return originalOnly.has(lang)?text:(cache.get(key(lang,text))||text);}
  function showOriginal(){
    const lang=window.HT.i18n.current;originalOnly.add(lang);
    visibleNodes().forEach(n=>{const o=originals.get(n);if(o){n.nodeValue=o;rendered.set(n,o);attempted.set(n,lang);}});
    // Catalog titles may have been translated before DOM creation by pick(). Re-render from sources.
    if(window.HT.app && typeof window.HT.app.route==='function')window.HT.app.route();
    banner();
  }
  function banner(){
    if(!document.createElement)return;const main=document.getElementById('main');if(!main||!main.parentNode)return;
    let el=document.getElementById('translationNotice');
    if(!el){el=document.createElement('section');el.id='translationNotice';el.className='translation-notice';el.setAttribute('data-no-translate','');main.parentNode.insertBefore(el,main);}
    const lang=window.HT.i18n.current;
    el.hidden=authored(lang);if(authored(lang))return;
    const c=coverage(lang),tr=k=>window.HT.i18n.t(k);
    el.setAttribute('aria-label',tr('languageCoverage'));
    el.innerHTML='';
    const text=document.createElement('p');
    text.textContent=(window.HT.i18n.names[lang]||lang)+' · '+c.translated+'/'+c.total+' interface labels. '+tr('courseOriginals')+'. '+tr(c.mode==='machine-translation'?'machineTranslationNotice':'sourceFallbackNotice');
    el.appendChild(text);
    // Simplified Chinese has a translated interface, but course sources remain Traditional Chinese.
    if(core(lang))return;
    const actions=document.createElement('div');actions.className='row';
    if(routes().some(x=>x.cloud)){
      const label=document.createElement('label');label.className='small';const input=document.createElement('input');input.type='checkbox';input.checked=cloudConsent;input.style.width='auto';
      input.onchange=()=>{cloudConsent=input.checked;};label.append(input,document.createTextNode(' '+tr('cloudTranslationConsent')));actions.appendChild(label);
    }
    const button=document.createElement('button');button.type='button';button.className='button light small';button.textContent=tr('retryTranslation');
    button.onclick=()=>{originalOnly.delete(lang);const nodes=visibleNodes();nodes.forEach(n=>attempted.delete(n));schedule();};actions.appendChild(button);
    const reset=document.createElement('button');reset.type='button';reset.className='text-link';reset.textContent=tr('showOriginal');reset.onclick=showOriginal;actions.appendChild(reset);el.appendChild(actions);
    if(report.error){const status=document.createElement('p');status.className='small';status.setAttribute('role','status');status.textContent=report.error==='cloud-consent-required'?'Cloud translation needs the checkbox above. Original text is still available.':'Translation is unavailable. Original text is still available; connect a local AI backend to translate.';el.appendChild(status);}
  }

  function visibleNodes(){
    if(!document.createTreeWalker||!window.NodeFilter)return [];
    const out=[];
    ['main','dialogBody'].forEach(id=>{
      const root=document.getElementById(id);if(!root)return;
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
      while((n=walker.nextNode())){
        const p=n.parentElement;if(!p||p.closest('[data-t],[data-no-translate],[hidden],script,style,option,code,pre,svg,textarea,input,.msg.user'))continue;
        const text=n.nodeValue.trim();if(text.length<12||text.length>1500||/^(https?:|[\d\s.,/%+−=()]+$)/.test(text))continue;
        out.push(n);
      }
    });return out;
  }
  async function run(){
    if(busy)return;banner();const lang=window.HT.i18n.current;
    if(core(lang)||originalOnly.has(lang))return;
    const nodes=visibleNodes().filter(n=>attempted.get(n)!==lang).slice(0,60);if(!nodes.length)return;
    busy=true;
    const texts=nodes.map(n=>{if(!originals.has(n)||rendered.get(n)!==n.nodeValue)originals.set(n,n.nodeValue);attempted.set(n,lang);return originals.get(n);});
    const translated=await translate(texts,lang);
    if(window.HT.i18n.current===lang&&!originalOnly.has(lang))nodes.forEach((n,i)=>{if(n.isConnected){rendered.set(n,translated[i]);n.nodeValue=translated[i];}});
    busy=false;banner();if(visibleNodes().some(n=>attempted.get(n)!==window.HT.i18n.current))schedule();
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(run,250);}
  window.HT=window.HT||{};
  window.HT.locale={translate,pick,cached,core,authored,coverage,showOriginal,available,schedule,get report(){return Object.assign({},report);},clear(){cache.clear();persist();}};
  if(window.addEventListener){window.addEventListener('ht:language',schedule);window.addEventListener('hashchange',schedule);}
  if(window.MutationObserver&&document.body)new MutationObserver(mutations=>{if(mutations.some(m=>m.target && m.target.closest ? !m.target.closest('#translationNotice,#voiceDock'):true))schedule();}).observe(document.body,{childList:true,subtree:true});
  schedule();
})(window);
