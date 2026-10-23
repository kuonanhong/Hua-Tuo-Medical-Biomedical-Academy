/* TCM learning library v2 (v3.4): the points tab embeds the interactive digital-twin bronze figure
   (acu-atlas.js); directory completeness is not localization validation. */
(function(w){
'use strict';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pick=(z,e)=>w.HT.i18n.isZh()?z:e;
let d,m,s,currentContext=null;
async function ensure(){
 if(!w.HT_TCM)await w.HT.loadScript('data/tcm-library.js');
 if(!w.HT_TCM_V2)await w.HT.loadScript('data/tcm-v2.js');
 if(!w.HT_CONTENT_V2)await w.HT.loadScript('data/content-v2.js');
 d=w.HT_TCM;m=w.HT_TCM_V2;s=w.HT_CONTENT_V2.sources;return d;
}
const refs=ids=>ids.map(id=>s.find(x=>x.id===id)).filter(Boolean).map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)} ↗</a>`).join(' · ');
function region(p){
 const code=p.code;const n=Number((code.match(/\d+$/)||[])[0]);const ch=code.replace(/\d+$/,'');
 // Broad educational regions by channel sequence. This avoids interpreting a referenced
 // point name such as 足三里 as the body region of the described point. Not point coordinates.
 const ranges={LU:[[2,'trunk'],[6,'arm'],[11,'hand']],LI:[[5,'hand'],[16,'arm'],[20,'head']],ST:[[10,'head'],[30,'trunk'],[34,'hip'],[40,'leg'],[45,'foot']],SP:[[5,'foot'],[9,'leg'],[11,'hip'],[21,'trunk']],HT:[[3,'arm'],[9,'hand']],SI:[[5,'hand'],[9,'arm'],[15,'back'],[19,'head']],BL:[[10,'head'],[35,'back'],[37,'hip'],[40,'leg'],[54,'back'],[59,'leg'],[67,'foot']],KI:[[6,'foot'],[10,'leg'],[27,'trunk']],PC:[[1,'trunk'],[4,'arm'],[9,'hand']],TE:[[5,'hand'],[14,'arm'],[15,'back'],[23,'head']],GB:[[20,'head'],[21,'arm'],[28,'trunk'],[32,'hip'],[39,'leg'],[44,'foot']],LR:[[4,'foot'],[9,'leg'],[11,'hip'],[14,'trunk']],GV:[[14,'back'],[28,'head']],CV:[[22,'trunk'],[24,'head']]};
 if(ranges[ch])return (ranges[ch].find(x=>n<=x[0])||[])[1]||'unknown';
 if(code.startsWith('EX-HN'))return 'head';
 if(code.startsWith('EX-CA'))return 'trunk';
 if(code.startsWith('EX-B'))return 'back';
 if(code.startsWith('EX-UE'))return n<=2?'arm':'hand';
 if(code.startsWith('EX-LE'))return n<=3?'hip':n<=6?'leg':'foot';
 const t=p.loc_zh;
 if(/足|趾|踝|跟骨|蹠|跖/.test(t))return 'foot';
 if(/小腿|脛|腓|膝|髕|膕|腘/.test(t))return 'leg';
 if(/大腿|股|髀|臀/.test(t))return 'hip';
 if(/手|指|掌|腕|橈骨莖/.test(t))return 'hand';
 if(/肘|臂|肱|腋/.test(t))return 'arm';
 if(/背|腰|脊|骶|尾|肩胛/.test(t))return 'back';
 if(/腹|臍|恥|乳|肋|胸|鎖骨/.test(t))return 'trunk';
 if(/頭|面|眉|眼|瞳|鼻|唇|頰|耳|髮|頸|項|喉|顎|顱/.test(t))return 'head';
 return 'unknown';
}
const regionNames={foot:['足／踝','Foot / ankle'],leg:['膝／小腿','Knee / leg'],hip:['大腿／臀','Thigh / hip'],hand:['手／腕','Hand / wrist'],arm:['上肢','Upper limb'],back:['背／腰','Back'],trunk:['胸／腹','Chest / abdomen'],head:['頭／頸','Head / neck'],unknown:['請讀文字地標','Read textual landmarks']};
const regionLabel=p=>pick(...regionNames[region(p)]);
function render(root,tab,filter){
 currentContext={id:"tcm-library",title:"金人與藥材辭典",titleEn:"Golden figure and medicinal directory",summary:"396穴與255藥材的有範圍教育目錄；定位未逐項審定；圖為示意，不能作臨床定位。",summaryEn:"A bounded educational directory of 396 points and 255 medicinals; individual localization review is pending, and the figure is schematic."};
 const st={tab:tab||'points',filter:filter||'',q:'',selected:'',view:'front',zoom:1};
 function controls(options,label){return `<div class="content-controls"><label>${label}<input id="tcm-search" type="search" autocomplete="off" value="${esc(st.q)}" placeholder="${esc(pick('中文／拼音／代碼／拉丁名','Name / pinyin / code / Latin'))}"></label><label>${pick('分類','Category')}<select id="tcm-filter"><option value="">${pick('全部','All')}</option>${options.map(o=>`<option value="${esc(o.id||o.code)}" ${(o.id||o.code)===st.filter?'selected':''}>${esc(pick(o.zh,o.en))}</option>`).join('')}</select></label></div>`;}
 function bind(update){root.querySelector('#tcm-search').oninput=e=>{st.q=e.target.value;update();};root.querySelector('#tcm-filter').onchange=e=>{st.filter=e.target.value;st.selected='';update();};}
 function draw(){
  const tabs=[['points',pick('金人與396穴','Golden figure & 396 points')],['herbs',pick('255藥材辭典','255 medicinal entries')],['formulas',pick('176歷史方名','176 historical formulas')],['classics',pick('經典與來源','Classics & sources')]];
  root.innerHTML=`<div class="section-head"><div><span class="eyebrow">TCM LEARNING LIBRARY · V2</span><h1>${pick('金人穴位與中藥材學習館','Golden figure and medicinal learning library')}</h1><p class="subtext">361 ${pick('經穴','classical points')} + 35 ${pick('經外穴','extra points')} · 255 ${pick('藥材','medicinals')}</p></div></div><div class="notice">${pick('本館是有範圍的學習目錄，不是全球所有草藥。金人為互動數位孿生：396 穴沿十四經排列、可看氣血流注與臟腑；點位為教學示意。396穴定位文字尚未逐項完成外部來源審定；任何圖點都不可作臨床定位或針刺依據。','This is a bounded learning collection, not every herb worldwide. The figure is an interactive digital twin: 396 points laid along the fourteen channels with qi flow and organs; positions are a teaching schematic. Individual external review of the 396 location texts is pending; no marker is a clinical or needling location.')}</div><div class="tier-tabs">${tabs.map(([k,l])=>`<button data-tab="${k}" class="${k===st.tab?'active':''}">${l}</button>`).join('')}</div><div id="tcm-body"></div>`;
  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(figure){figure.destroy();figure=null;}st.tab=b.dataset.tab;st.filter='';st.q='';st.selected='';draw();});
  if(st.tab==='points')points();else if(st.tab==='herbs')herbs();else if(st.tab==='formulas')formulas();else classics();
 }
 let figure=null;
 function points(){
  root.querySelector('#tcm-body').innerHTML=controls(d.meridians,pick('找穴位','Find a point'))+`<div class="atlas-layout"><section class="card atlas-map"><div id="atlas-figure" class="atlas-twin"><p class="muted small">${pick('載入互動金人…','Loading the interactive figure…')}</p></div><p class="small muted">${pick('互動數位孿生金人：396 穴沿十四經排列；點任一穴看經絡、氣血流注、臟腑與危險區；按經絡圖例或「十二經流注順序」看氣如何循行。點位為教學示意，非體表座標，不提供針刺參數。','Interactive digital-twin figure: 396 points laid along the fourteen channels; tap any point for its channel, qi flow, organ and danger zones; use the legend or the circulation tour to watch qi move. Points are a teaching schematic, not surface coordinates; no needling parameters.')}</p></section><section class="atlas-directory"><p id="point-count" aria-live="polite"></p><div class="point-list" id="point-list"></div><article class="card" id="point-detail" aria-live="polite"></article></section></div>`;
  bind(updatePoints);updatePoints();mountFigure();
 }
 async function mountFigure(){
  const host=root.querySelector('#atlas-figure');if(!host)return;
  try{
   if(!w.HT.acuAtlas){if(w.HT.loadCss)w.HT.loadCss('acu-atlas.css');await w.HT.loadScript('acu-atlas.js');}else if(w.HT.loadCss)w.HT.loadCss('acu-atlas.css');
   await w.HT.acuAtlas.ensure();
  }catch(e){host.innerHTML=`<p class="notice">${pick('互動金人載入失敗；請重新整理。','The interactive figure could not be loaded; please reload.')}</p>`;return;}
  if(!root.isConnected||root.querySelector('#atlas-figure')!==host)return;
  figure=w.HT.acuAtlas.embed(host,{selected:st.selected,compact:true,onPick:code=>{st.selected=code;figure.select(code);showPoint(false);},onChange:s=>{if(!s.selected&&s.activeChannels.size===1){const ch=[...s.activeChannels][0];const detail=root.querySelector('#point-detail');if(detail)detail.innerHTML=w.HT.acuAtlas.channelHtml(ch,s);bindDetail();}}});
  if(st.selected)showPoint(false);
 }
 function updatePoints(){
  const q=st.q.trim().toLowerCase();const ps=d.points.filter(p=>(!st.filter||(st.filter==='EX'?p.code.startsWith('EX'):p.code.replace(/[0-9].*$/,'')===st.filter))&&(!q||[p.code,p.zh,p.py,p.loc_zh,p.loc_en].join(' ').toLowerCase().includes(q)));
  root.querySelector('#point-count').textContent=`${ps.length} / 396 ${pick('穴；可用鍵盤Tab選取','entries; keyboard Tab supported')}`;
  root.querySelector('#point-list').innerHTML=ps.map(p=>`<button class="point-choice" data-select="${p.code}"><b>${p.code} ${esc(p.zh)}</b><small>${esc(p.py)} · ${esc(regionLabel(p))}</small></button>`).join('')||pick('沒有相符結果。','No matching entries.');
  if(!ps.some(p=>p.code===st.selected))st.selected=ps[0]?.code||'';
  root.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{st.selected=b.dataset.select;showPoint(true);});showPoint(true);
 }
 function bindDetail(){
  const detail=root.querySelector('#point-detail');if(!detail)return;
  detail.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{st.selected=b.dataset.goto;showPoint(true);});
  detail.querySelectorAll('[data-leg2]').forEach(b=>b.onclick=()=>{if(figure)figure.channel(b.dataset.leg2);});
 }
 function showPoint(syncFigure){
  const p=d.points.find(p=>p.code===st.selected);if(p)currentContext={id:'point-'+p.code,title:p.code+' '+p.zh,titleEn:p.code+' '+p.py,summary:'文字地標（未逐項外部審定）：'+p.loc_zh+'。傳統用途非療效證明；不得提供針刺操作。',summaryEn:'Inherited location draft, individual source review pending: '+p.loc_en+'. Traditional uses are not efficacy proof; do not provide needling procedures.'};root.querySelectorAll('[data-select]').forEach(b=>b.classList.toggle('active',b.dataset.select===st.selected));
  const rich=p&&w.HT.acuAtlas&&w.HT.acuAtlas.positions?w.HT.acuAtlas.detailHtml(p.code,{view:figure?figure.state.view:'front',link:'acu'}):'';
  root.querySelector('#point-detail').innerHTML=p?(rich||`<span class="eyebrow">${p.code} · ${esc(regionLabel(p))}</span><h2>${esc(p.zh)} <small>${esc(p.py)}</small></h2><p><b>${pick('文字地標：既有教學稿','Text landmarks: inherited educational draft')}</b><br>${esc(pick(p.loc_zh,p.loc_en))}</p><p><b>${pick('傳統用途：不等於療效證實','Traditional uses: not proof of efficacy')}</b><br>${esc(pick(p.ind_zh,p.ind_en))}</p>`)+`<div class="notice">${pick('學習順序：代碼 → 經絡 → 文字地標 → 標準核對。骨度分寸不是固定公分，圖點不能量尺。此頁不提供針刺深度、方向、留針或電刺激設定。','Study sequence: code → channel → landmarks → standards check. Body-proportional measures are not fixed centimeters. Do not measure the figure. No insertion depth, direction, retention or electrical settings are provided.')}</div><p class="small muted">${pick('名稱目錄對照WHO命名體系；個別定位文字未完成來源審定。WHO連結不代表WHO驗證本圖。','The directory follows WHO naming scope; individual location review is pending. WHO has not validated this drawing.')}</p><p class="source-list">${refs(['who361','acu'])}</p><a class="btn" href="#learn/acu-literacy">${pick('讀懂金人免費課','Free figure-literacy lesson')}</a> <a class="btn" href="#acu?point=${esc(p.code)}&tab=train">${pick('到病症選穴訓練 →','Point-selection trainer →')}</a>`:pick('請選一穴。','Choose a point.');
  bindDetail();
  if(syncFigure&&figure&&p)figure.select(p.code);
 }
 function herbs(){root.querySelector('#tcm-body').innerHTML=controls(d.herbCategories,pick('查藥材','Find a medicinal'))+`<p class="small muted">${pick('255個既有條目；11個有新增來源安全詳解，其餘待逐藥審定。含植物、礦物、動物及製品，不能統稱全球所有草藥。','255 inherited entries; 11 have new source-reviewed safety profiles. Others await individual review. Includes plants, minerals, animals and processed materials, not every herb worldwide.')}</p><div class="herb-layout"><div id="herb-list" class="herb-list"></div><article id="herb-detail" class="card"></article></div>`;bind(updateHerbs);updateHerbs();}
 function updateHerbs(){const q=st.q.trim().toLowerCase();const hs=d.herbs.filter(h=>(!st.filter||h.cat===st.filter)&&(!q||[h.zh,h.py,h.latin,h.act_zh,h.act_en].join(' ').toLowerCase().includes(q)));root.querySelector('#herb-list').innerHTML=`<p aria-live="polite">${hs.length} / 255</p>`+hs.map(h=>`<button class="point-choice" data-herb="${esc(h.zh)}"><b>${esc(h.zh)} ${m.profiles[h.zh]?'✓':''}</b><small>${esc(h.py)} · ${esc(h.latin)}</small></button>`).join('');if(!hs.some(h=>h.zh===st.selected))st.selected=hs[0]?.zh||'';root.querySelectorAll('[data-herb]').forEach(b=>b.onclick=()=>{st.selected=b.dataset.herb;showHerb();});showHerb();}
 function showHerb(){const h=d.herbs.find(h=>h.zh===st.selected);const p=h&&m.profiles[h.zh];if(h)currentContext={id:'herb-'+h.py,title:h.zh,titleEn:h.py+' '+h.latin,summary:(p?p.evidence+' '+p.risk:'既有教學稿，尚未逐藥臨床證據審定。傳統用途：'+h.act_zh)+'；不可開自用劑量或炮製程序。',summaryEn:(p?p.evidenceEn+' '+p.riskEn:'Inherited draft; individual clinical review pending. Traditional uses: '+h.act_en)+'; do not prescribe self-use doses or processing.'};root.querySelectorAll('[data-herb]').forEach(b=>b.classList.toggle('active',b.dataset.herb===st.selected));root.querySelector('#herb-detail').innerHTML=h?`<span class="eyebrow">${p?pick('新增來源安全詳解','SOURCE-REVIEWED SAFETY PROFILE'):pick('既有教學稿 · 待審定','INHERITED DRAFT · PENDING REVIEW')}</span><h2>${esc(h.zh)} <small>${esc(h.py)}</small></h2><p><b>${pick('藥材拉丁名（非批次／物種鑑定）','Medicinal Latin name (not batch/species authentication)')}</b><br>${esc(h.latin)}</p>${p?`<p><b>${pick('來源名稱與使用部位','Source naming and part')}</b><br>${esc(p.botanical)} · ${esc(p.part)}</p>`:''}<p><b>${pick('傳統性味歸經','Traditional classification')}</b><br>${esc(h.nature)} · ${esc(h.channels)}</p><p><b>${pick('傳統用途：不作療效背書','Traditional uses: not efficacy endorsement')}</b><br>${esc(pick(h.act_zh,h.act_en))}</p><p><b>${pick('證據邊界','Evidence boundary')}</b><br>${esc(p?pick(p.evidence,p.evidenceEn):pick('本條尚未逐藥完成臨床證據審查；傳統描述不能用作療效證明，請核對藥典、HKBU與NCCIH。','Individual clinical-evidence review is pending. Traditional descriptions are not efficacy evidence; cross-check pharmacopeias, HKBU and NCCIH.'))}</p><div class="notice"><b>${pick('安全與交互作用','Safety and interactions')}</b><p>${esc(p?pick(p.risk,p.riskEn):pick(h.caution||'未列注意不代表安全；孕哺、兒童、肝腎病與多重用藥均需個別核對。','An absent warning is not evidence of safety. Pregnancy/lactation, children, liver/kidney disease and multiple medicines need review.'))}</p>${pick('不提供自用劑量、炮製或煎煮程序；不可依照片或AI採食。','No self-use doses, processing or decoction instructions; do not consume items identified only by photo or AI.')}</div><p class="source-list">${refs(p?p.sources:['hkbu','herbs','toxic'])}</p><a class="btn" href="#learn/herb-identity">${pick('藥材身分免費課','Free medicinal identity lesson')}</a> <a class="btn" href="#pharmacy">${pick('到配伍實驗室練習配伍 →','Practise in the pharmacy lab →')}</a>`:pick('沒有相符結果。','No matching entries.');}
 function formulas(){root.querySelector('#tcm-body').innerHTML=controls(d.formulaCategories,pick('找歷史方名','Find a historical formula'))+`<div class="notice">${pick('歷史方劑不是自用處方。古方中的有毒、礦物與動物成分可能與現代法規及核准配方不同。此頁不呈現克數、組方或給藥操作；請查所在地核准製品與專業評估。','Historical formulas are not self-use prescriptions. Toxic, mineral and animal ingredients may differ from current regulation and licensed formulas. Quantities, assembly and administration instructions are omitted; verify locally licensed products with professionals.')}</div><div class="grid cols-2" id="formula-list"></div>`;const update=()=>{const q=st.q.toLowerCase();root.querySelector('#formula-list').innerHTML=d.formulas.filter(f=>(!st.filter||f.cat===st.filter)&&(!q||[f.zh,f.py,f.source].join(' ').toLowerCase().includes(q))).map(f=>`<article class="card"><h3>${esc(f.zh)} <small>${esc(f.py)}</small></h3><p>${esc(f.source)}</p><p><b>${pick('傳統敘述（非療效背書）','Traditional description (not efficacy endorsement)')}</b><br>${esc(pick(f.act_zh,f.act_en))}</p><p>${esc(pick(f.pat_zh,f.pat_en))}</p><p class="small muted">${pick('本條未完成逐方現代毒理、適應證與法規審定。','Individual modern toxicology, indication and regulatory review is pending.')}</p><p class="source-list">${refs(['hkbu','tcm'])}</p></article>`).join('');};bind(update);update();}
 function classics(){const cls=(w.HT_CATALOG||[]).filter(c=>c.department==='tcm-classics');root.querySelector('#tcm-body').innerHTML=`<div class="grid cols-2"><article class="card"><h2>${pick('標準、藥材影像與安全','Standards, medicinal images and safety')}</h2><p>${pick('HKBU提供真實藥材影像與詳細來源資料；本站連結原始資料，不複製其照片。交叉閱讀WHO命名、NCCIH證據與監管公告。','HKBU provides authentic images and detailed medicinal sources. We link without reproducing its images. Cross-read WHO nomenclature, NCCIH evidence and regulator alerts.')}</p><p class="source-list">${refs(['who361','hkbu','acu','herbs','toxic','alerts'])}</p></article><article class="card"><h2>${pick('免費學習與社群','Free learning and community')}</h2><p><a href="#parkinson">${pick('24堂巴金森與整合照護免費課','24 free Parkinson’s and integrative-care lessons')}</a></p><p class="source-list">${refs(['smartaction','actionai'])}</p><p class="small muted">${pick('社群測試站為使用者提供，這次未能獨立讀取；不作醫療證據。','User-provided community test sites could not be independently retrieved; they are not clinical-evidence sources.')}</p></article></div><h2>${pick('經典課程目錄','Classics in the course catalog')}</h2><div class="grid cols-3">${cls.map(c=>`<a class="card" href="#course/${esc(c.id)}"><h3>${esc(pick(c.title,c.titleEn))}</h3><p>${esc(pick(c.summary,c.summaryEn))}</p></a>`).join('')}</div>`;}
 draw();
 return ()=>{if(figure){figure.destroy();figure=null;}currentContext=null;};
}
w.HT=w.HT||{};w.HT.tcmLibrary={ensure,render,get currentContext(){return currentContext;}};
})(window);
