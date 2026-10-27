/* Licensed real teaching images + transparent, local image-processing tools.
   No generative imagery, disease detector, HU/DICOM calibration or patient upload. */
(function (scope) {
  'use strict';
  scope.HT = scope.HT || {};
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const zh = () => !scope.HT.i18n || scope.HT.i18n.isZh();
  const say = (z,e) => zh() ? z : e;
  const bi = o => typeof o === 'string' ? o : o ? (zh() ? o.zh || o.en : o.en || o.zh) : '';
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  function processPixels(input,width,height,options) {
    options = options || {};
    if (!(width > 0 && height > 0) || input.length !== width * height * 4) throw new Error('Invalid pixel dimensions');
    const out = new Uint8ClampedArray(input.length), gray = new Float32Array(width*height);
    const center = clamp(Number(options.center) || 128,1,255), windowWidth = clamp(Number(options.width) || 256,8,512);
    const low = center - windowWidth/2;
    for (let i=0;i<input.length;i+=4) {
      gray[i/4] = .2126*input[i]+.7152*input[i+1]+.0722*input[i+2];
      for (let c=0;c<3;c++) out[i+c]=clamp((input[i+c]-low)*255/(windowWidth-1),0,255);
      out[i+3]=input[i+3];
    }
    if (options.edges) for(let y=1;y<height-1;y++) for(let x=1;x<width-1;x++) {
      const i=y*width+x, a=gray[i-width-1],b=gray[i-width],c=gray[i-width+1],d=gray[i-1],f=gray[i+1],g=gray[i+width-1],h=gray[i+width],j=gray[i+width+1];
      const gx=-a+c-2*d+2*f-g+j,gy=-a-2*b-c+g+2*h+j;
      if(Math.hypot(gx,gy)>clamp(Number(options.edgeThreshold)||150,10,1020)) {out[i*4]=0;out[i*4+1]=235;out[i*4+2]=255;}
    }
    return out;
  }
  const items = () => (scope.HT.realImagingData && scope.HT.realImagingData.items) || [];
  function available(department) { return items().filter(item => !department || department==='all' || item.departments.includes(department)); }
  function mount(root,opts) {
    opts=opts||{}; const list=available(opts.department),usesRaf=typeof scope.requestAnimationFrame==='function';let disposed=false,token=0,current=null,loaded=null,drag=null,frame=null;
    const st={zoom:1,panX:0,panY:0,center:128,width:256,edges:false,showAnswer:false,slice:0};
    if(!list.length) {
      root.innerHTML=`<section class="ri-panel"><h3>${say('真實影像圖庫','Real teaching images')}</h3><p>${say('本科尚未收錄經授權核實的真實影像；既有示意圖會繼續清楚標示為模擬。','No verified licensed real image is bundled for this specialty yet. Existing diagrams remain explicitly labelled as simulations.')}</p><a class="button" href="#imaging">${say('開啟所有已收錄影像','Browse the available real images')}</a></section>`;
      return ()=>{disposed=true;};
    }
    root.innerHTML=`<section class="ri-panel"><header class="ri-header"><div><span class="eyebrow">${say('真實影像 · 可追溯來源','REAL IMAGES · TRACEABLE SOURCES')}</span><h3>${say('影像觀察工作站','Image observation workstation')}</h3></div><label>${say('選擇影像','Choose image')}<select data-ri-select aria-label="${say('選擇真實醫學影像','Choose a real medical image')}">${list.map(x=>`<option value="${esc(x.id)}">${esc(bi(x.title))}</option>`).join('')}</select></label></header>
    <p class="ri-scope">${say('圖庫病例與目前虛擬個案分開；不可把這張圖當成目前個案的檢查結果。影像為公開教學樣本，不提供病人診斷。','These source cases are separate from the current fictional case. Do not treat this image as that case’s test result. These are public teaching samples, not patient diagnosis.')}</p>
    <div class="ri-views"><figure><div class="ri-image-wrap"><img data-ri-original alt="" decoding="async"></div><figcaption>${say('檔案原圖（未加互動濾鏡）','Bundled source preview (no interactive filters)')}</figcaption></figure><figure><div class="ri-image-wrap ri-processed"><canvas data-ri-canvas role="img" tabindex="0" aria-label="${say('處理後影像；方向鍵平移，正負鍵縮放','Processed image; arrow keys pan, plus/minus zoom')}"></canvas><p data-ri-error class="ri-error" hidden></p></div><figcaption>${say('互動處理預覽 · 青色邊緣不是病灶標記','Processed preview · cyan edges are not disease labels')}</figcaption></figure></div>
    <div class="ri-controls"><label data-ri-slice-wrap hidden>${say('顯微鏡 Z 切片','Microscopy Z slice')} <output data-ri-slice-label></output><input type="range" data-ri-slice min="0" max="0" step="1" value="0"></label><label>${say('縮放','Zoom')} <output data-ri-zoom-label>1.0×</output><input type="range" data-ri-zoom min="1" max="4" step="0.1" value="1"></label><label>${say('亮度窗中心（像素）','Window centre (pixel values)')}<input type="range" data-ri-center min="1" max="255" value="128"></label><label>${say('亮度窗寬（像素）','Window width (pixel values)')}<input type="range" data-ri-width min="8" max="512" value="256"></label><label class="ri-check"><input type="checkbox" data-ri-edges>${say('Sobel 邊緣疊圖','Sobel edge overlay')}</label><button type="button" data-ri-reset>${say('重設影像','Reset view')}</button></div>
    <p class="small muted">${say('拖曳處理後影像可平移；鍵盤方向鍵也可操作。這是已轉成 JPEG／PNG 的 8 位元教學影像，窗寬窗位只改變顯示像素，不是原始 DICOM／HU。','Drag the processed image to pan, or use arrow keys. These JPEG/PNG teaching images use 8-bit display pixels; window controls do not operate on original DICOM/Hounsfield units.')}</p>
    <div data-ri-status class="small" role="status" aria-live="polite"></div><article data-ri-details></article></section>`;
    const q=s=>root.querySelector(s), canvas=q('[data-ri-canvas]'), original=q('[data-ri-original]'), error=q('[data-ri-error]');
    let ctx=null;try{ctx=canvas.getContext('2d',{willReadFrequently:true});}catch(e){}
    function fail(msg){if(disposed)return;error.hidden=false;error.textContent=msg;canvas.hidden=true;q('[data-ri-status]').textContent=msg;}
    function queue(){if(disposed||frame!==null)return;frame=usesRaf?scope.requestAnimationFrame(()=>{frame=null;draw();}):scope.setTimeout(()=>{frame=null;draw();},16);}
    function draw(){
      if(disposed||!loaded)return;
      if(!ctx){fail(say('此瀏覽器無法啟動影像處理；左側原圖仍可查看。','Image processing is unavailable in this browser; the source image remains visible.'));return;}
      const scale=Math.min(1,960/Math.max(loaded.naturalWidth,loaded.naturalHeight));
      const w=Math.max(1,Math.round(loaded.naturalWidth*scale)),h=Math.max(1,Math.round(loaded.naturalHeight*scale));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0b1114';ctx.fillRect(0,0,w,h);
      const dw=w*st.zoom,dh=h*st.zoom;st.panX=clamp(st.panX,-(dw-w)/2,(dw-w)/2);st.panY=clamp(st.panY,-(dh-h)/2,(dh-h)/2);
      ctx.drawImage(loaded,(w-dw)/2+st.panX,(h-dh)/2+st.panY,dw,dh);
      try{const im=ctx.getImageData(0,0,w,h);im.data.set(processPixels(im.data,w,h,st));ctx.putImageData(im,0,0);canvas.hidden=false;error.hidden=true;}
      catch(e){fail(say('像素處理受到瀏覽器限制；請以本機伺服器啟動，仍可閱讀左側原圖。','The browser blocked pixel processing. Start the local server; the source image remains available.'));}
      q('[data-ri-zoom-label]').textContent=st.zoom.toFixed(1)+'×';
    }
    function details(){const a=current; q('[data-ri-details]').innerHTML=`<h4>${esc(bi(a.title))} <small>${esc(a.modality)}</small></h4><p>${esc(bi(a.description))}</p><ol>${a.observe.map(p=>`<li>${esc(bi(p))}</li>`).join('')}</ol><div class="ri-question"><strong>${say('先想一想','Think first')}：${esc(bi(a.question))}</strong><button type="button" data-ri-answer aria-expanded="${st.showAnswer}">${st.showAnswer?say('收起解說','Hide explanation'):say('查看師傅解說','Show mentor explanation')}</button>${st.showAnswer?`<p>${esc(bi(a.answer))}</p>`:''}</div><p class="ri-limit">${esc(bi(a.limit))}</p><footer class="ri-credit"><a href="${esc(a.sourcePage)}" target="_blank" rel="noopener noreferrer">${say('原始來源與病例說明','Source and original case')}</a> · ${esc(a.author)} · <a href="${esc(a.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(a.license)}</a><br>${esc(bi(a.changes))}<details><summary>${say('授權與檔案核驗','License and file verification')}</summary><code data-ri-hash>SHA-256 ${esc(a.frames?a.frames[st.slice].sha256:a.sha256)}</code><p>${say('來源檔與互動產生的衍生影像遵循本圖列明的授權；作者不因此替本學院背書。','The source and any derived image follow the image license shown here; attribution does not imply endorsement.')}</p></details></footer>`; q('[data-ri-answer]').onclick=()=>{st.showAnswer=!st.showAnswer;details();};}
    function reset(){st.zoom=1;st.panX=st.panY=0;st.center=128;st.width=256;st.edges=false;q('[data-ri-zoom]').value=1;q('[data-ri-center]').value=128;q('[data-ri-width]').value=256;q('[data-ri-edges]').checked=false;queue();}
    function choose(id){const a=list.find(x=>x.id===id)||list[0];current=a;q('[data-ri-select]').value=a.id;st.showAnswer=false;st.slice=0;reset();details();q('[data-ri-slice-wrap]').hidden=!a.frames;q('[data-ri-slice]').max=a.frames?a.frames.length-1:0;q('[data-ri-slice]').value=0;loadFrame(0);}
    function loadFrame(index){const a=current;st.slice=index;loaded=null;token++;const own=token;canvas.hidden=true;error.hidden=false;error.textContent=say('載入本機影像…','Loading bundled image…');q('[data-ri-status]').textContent=error.textContent;original.alt=bi(a.title);q('[data-ri-slice-label]').textContent=a.frames?`${index+1}/${a.frames.length}`:'';q('[data-ri-hash]').textContent='SHA-256 '+(a.frames?a.frames[index].sha256:a.sha256);original.onload=()=>{if(disposed||own!==token)return;loaded=original;draw();q('[data-ri-status]').textContent=say('原圖已載入。先觀察，再切換演算法比較。','Source loaded. Observe it, then compare processing.');};original.onerror=()=>{if(disposed||own!==token)return;fail(say('影像檔遺失或無法載入；請重新解壓完整程式包，或開啟下方原始來源。','Image file is missing or could not load. Re-extract the complete package or open the source link below.'));};original.src=a.frames?a.frames[index].path:a.path;}
    q('[data-ri-select]').onchange=e=>choose(e.target.value);q('[data-ri-slice]').oninput=e=>loadFrame(Number(e.target.value));
    for(const key of ['zoom','center','width'])q('[data-ri-'+key+']').oninput=e=>{st[key]=Number(e.target.value);queue();};
    q('[data-ri-edges]').onchange=e=>{st.edges=e.target.checked;queue();};q('[data-ri-reset]').onclick=reset;
    canvas.onpointerdown=e=>{if(st.zoom<=1)return;drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture?.(e.pointerId);};
    canvas.onpointermove=e=>{if(!drag)return;const r=canvas.getBoundingClientRect();st.panX+=(e.clientX-drag.x)*canvas.width/Math.max(1,r.width);st.panY+=(e.clientY-drag.y)*canvas.height/Math.max(1,r.height);drag={x:e.clientX,y:e.clientY};queue();};
    canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};canvas.onkeydown=e=>{const delta={ArrowLeft:[20,0],ArrowRight:[-20,0],ArrowUp:[0,20],ArrowDown:[0,-20]}[e.key];if(delta){e.preventDefault();st.panX+=delta[0];st.panY+=delta[1];queue();}else if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();st.zoom=clamp(st.zoom+(e.key==='-'?-.2:.2),1,4);q('[data-ri-zoom]').value=st.zoom;queue();}};
    choose(opts.imageId||list[0].id);
    return ()=>{disposed=true;token++;original.onload=original.onerror=null;canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=canvas.onkeydown=null;if(frame!==null){if(usesRaf)scope.cancelAnimationFrame?.(frame);else scope.clearTimeout(frame);}loaded=null;drag=null;};
  }
  scope.HT.realImaging={mount,available,processPixels};
  if(typeof module!=='undefined'&&module.exports)module.exports={processPixels};
})(typeof window!=='undefined'?window:globalThis);
