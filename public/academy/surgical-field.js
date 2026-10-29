/* 華佗醫藥生醫學院 v3.9 — 術野精細操作 Precision operative field (教學模擬 / teaching simulation).
   A procedurally drawn, high-DPI operative field in which each hand holds a real instrument and moves its
   tip in millimetres (WASD = left, arrows = right, Shift = 0.2 mm fine). Drills cover all 43 western
   clinical departments. Educational only: no drug doses, infusion rates, ventilator/energy/needle/pacing
   settings, and every drawing here is a simulation, not a patient's anatomy or image. Classic script,
   no dependencies; attaches window.HT.surgicalField. Shipped compact (comments and indentation stripped,
   every name kept) to stay inside the 220 KB module budget; edit this file directly. */
(function(W){
'use strict';
const HT=W.HT=W.HT||{};
const doc=W.document;
const isZh=()=>!HT.i18n||!HT.i18n.isZh||HT.i18n.isZh();
const say=(z,e)=>isZh()?z:e;
const L2=v=>typeof v==='string'&&v.indexOf('|')>=0?say(v.slice(0,v.indexOf('|')),v.slice(v.indexOf('|')+1)):Array.isArray(v)?say(v[0],v[1]):(v&&typeof v==='object'?say(v.zh,v.en):String(v==null?'':v));
const T=(k,z,e)=>{try{const v=HT.i18n&&HT.i18n.t&&HT.i18n.t(k);if(v&&v!==k)return v;}catch(_){}return say(z,e);};
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const D2R=Math.PI/180,hyp=Math.hypot,PI=Math.PI;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const now=()=>(W.performance&&W.performance.now)?W.performance.now():Date.now();
const angN=a=>((a%360)+360)%360;
const angD=(a,b)=>{let d=angN(a-b);return d>180?d-360:d;};
function rng(s){return function(){s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function gauss(r){let u=0;while(!u)u=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*PI*r());}
function segD(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;let t=l?((px-ax)*dx+(py-ay)*dy)/l:0;t=clamp(t,0,1);return[hyp(px-ax-t*dx,py-ay-t*dy),t];}
function pDist(p,pts,closed){let best=1e9,bi=0,bt=0;const n=pts.length;if(n===1)return{d:hyp(p[0]-pts[0][0],p[1]-pts[0][1]),i:0,t:0};for(let i=0;i<n-(closed?0:1);i++){const a=pts[i],b=pts[(i+1)%n];const r=segD(p[0],p[1],a[0],a[1],b[0],b[1]);if(r[0]<best){best=r[0];bi=i;bt=r[1];}}return{d:best,i:bi,t:bt};}
function plen(pts,closed){let s=0;for(let i=1;i<pts.length;i++)s+=hyp(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);if(closed&&pts.length>2)s+=hyp(pts[0][0]-pts[pts.length-1][0],pts[0][1]-pts[pts.length-1][1]);return s;}
function resample(pts,step,closed){const src=closed?pts.concat([pts[0]]):pts,out=[src[0].slice()];let carry=0;for(let i=1;i<src.length;i++){const a=src[i-1],b=src[i],L=hyp(b[0]-a[0],b[1]-a[1]);let d=step-carry;while(d<=L){const t=d/L;out.push([lerp(a[0],b[0],t),lerp(a[1],b[1],t)]);d+=step;}carry=L-(d-step);}if(!closed){const last=src[src.length-1],o=out[out.length-1];if(hyp(last[0]-o[0],last[1]-o[1])>step*0.3)out.push(last.slice());}else if(out.length>1&&hyp(out[0][0]-out[out.length-1][0],out[0][1]-out[out.length-1][1])<step*0.5)out.pop();return out;}
function arc(cx,cy,rx,ry,a0,a1,n,rot){const o=[],c=Math.cos((rot||0)*D2R),s=Math.sin((rot||0)*D2R);for(let i=0;i<=n;i++){const a=(a0+(a1-a0)*i/n)*D2R,x=Math.cos(a)*rx,y=Math.sin(a)*ry;o.push([cx+x*c-y*s,cy+x*s+y*c]);}return o;}
function ring(cx,cy,r,n){const o=arc(cx,cy,r,r,0,360,n||48);o.pop();return o;}
function bez(p0,p1,p2,p3,n){const o=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;o.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}return o;}
function lens(cx,cy,half,width,rot){
const R=(half*half+(width/2)**2)/width,a=Math.asin(half/R)/D2R,o=[];
arc(0,-(R-width/2),R,R,90+a,90-a,20).forEach(p=>o.push(p));arc(0,R-width/2,R,R,-90+a,-90-a,20).forEach(p=>o.push(p));
const c=Math.cos(rot*D2R),s=Math.sin(rot*D2R);return o.map(([x,y])=>[cx+x*c-y*s,cy+x*s+y*c]);
}
function inPoly(p,poly){let ins=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])ins=!ins;}return ins;}
let CX=null;
const reduced=()=>{try{return!!(W.matchMedia&&W.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}};
function path(pts,closed){const c=CX;c.beginPath();c.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);if(closed)c.closePath();}
function spline(pts,closed){const c=CX;
const n=pts.length;c.beginPath();if(n<3){path(pts,closed);return;}
if(closed){const m=[(pts[n-1][0]+pts[0][0])/2,(pts[n-1][1]+pts[0][1])/2];c.moveTo(m[0],m[1]);for(let i=0;i<n;i++){const p=pts[i],q=pts[(i+1)%n];c.quadraticCurveTo(p[0],p[1],(p[0]+q[0])/2,(p[1]+q[1])/2);}c.closePath();return;}
c.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<n-1;i++){const p=pts[i],q=pts[i+1];c.quadraticCurveTo(p[0],p[1],(p[0]+q[0])/2,(p[1]+q[1])/2);}c.lineTo(pts[n-1][0],pts[n-1][1]);
}
function fillP(pts,f,s,w,smooth){const c=CX;(smooth?spline:path)(pts,true);if(f){c.fillStyle=f;c.fill();}if(s){c.strokeStyle=s;c.lineWidth=w||0.3;c.stroke();}}
function strokeP(pts,s,w,smooth,dash){const c=CX;(smooth?spline:path)(pts,false);c.strokeStyle=s;c.lineWidth=w;c.lineCap='round';c.lineJoin='round';if(dash)c.setLineDash(dash);c.stroke();if(dash)c.setLineDash([]);}
function ell(x,y,rx,ry,rot,f,s,w){const c=CX;c.beginPath();c.ellipse(x,y,Math.max(rx,.01),Math.max(ry,.01),(rot||0)*D2R,0,2*PI);if(f){c.fillStyle=f;c.fill();}if(s){c.strokeStyle=s;c.lineWidth=w||.3;c.stroke();}}
function rad(x,y,r,stops){const c=CX;const g=c.createRadialGradient(x,y,0,x,y,Math.max(r,.01));stops.forEach((s,i)=>g.addColorStop(s[0],s[1]));return g;}
function lin(x0,y0,x1,y1,stops){const c=CX;const g=c.createLinearGradient(x0,y0,x1,y1);stops.forEach(s=>g.addColorStop(s[0],s[1]));return g;}
function tube(pts,w,col,edge,hi,smooth){const c=CX;
strokeP(pts,edge,w,smooth!==false);strokeP(pts,col,w*0.78,smooth!==false);if(hi)strokeP(pts.map(p=>[p[0]-w*0.16,p[1]-w*0.16]),hi,w*0.22,smooth!==false);
}
let NOISE=null;
function noiseCanvas(){if(NOISE||!doc)return NOISE;const n=doc.createElement('canvas');n.width=n.height=128;const x=n.getContext('2d');if(!x)return null;const r=rng(11),img=x.createImageData(128,128);for(let i=0;i<img.data.length;i+=4){const v=r(),d=r()<.5;img.data[i]=img.data[i+1]=img.data[i+2]=d?40:255;img.data[i+3]=Math.floor(v*v*46);}x.putImageData(img,0,0);NOISE=n;return n;}
function grain(k,x0,y0,w,h,alpha){const c=CX;const n=noiseCanvas();if(!n)return;const p=c.createPattern(n,'repeat');if(!p)return;try{if(p.setTransform&&W.DOMMatrix)p.setTransform(new W.DOMMatrix([1.4/k,0,0,1.4/k,0,0]));}catch(_){}c.save();c.globalAlpha=alpha==null?1:alpha;c.fillStyle=p;c.fillRect(x0,y0,w,h);c.restore();}
const SH=a=>'rgba(110,60,45,'+a+')',HL=a=>'rgba(255,238,222,'+a+')',WH=a=>'rgba(255,255,255,'+a+')';
const SKIN={base:'#e7b393',lite:'#f4cfb3',dark:'#bf8464',deep:'#9c6248'};
function skinFill(outline,k,bb,smooth){const c=CX;
c.save();(smooth===false?path:spline)(outline,true);c.clip();
const cx=(bb[0]+bb[2])/2,w=bb[2]-bb[0];
c.fillStyle=lin(bb[0],0,bb[2],0,[[0,SKIN.deep],[.12,SKIN.dark],[.35,SKIN.base],[.5,SKIN.lite],[.65,SKIN.base],[.88,SKIN.dark],[1,SKIN.deep]]);c.fillRect(bb[0],bb[1],w,bb[3]-bb[1]);
c.fillStyle=rad(cx,(bb[1]+bb[3])/2,w*.6,[[0,'rgba(255,230,210,.18)'],[1,'rgba(120,60,40,0)']]);c.fillRect(bb[0],bb[1],w,bb[3]-bb[1]);
grain(k,bb[0],bb[1],w,bb[3]-bb[1],.9);c.restore();
}
function drape(win,bb,k,hole){const c=CX;
c.save();c.beginPath();c.rect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);
if(hole){c.moveTo(hole[0][0],hole[0][1]);for(let i=hole.length-1;i>0;i--)c.lineTo(hole[i][0],hole[i][1]);c.closePath();}else{c.moveTo(win[0],win[1]);c.lineTo(win[0],win[3]);c.lineTo(win[2],win[3]);c.lineTo(win[2],win[1]);c.closePath();}
c.fillStyle='#2a7783';c.fill('evenodd');c.clip('evenodd');
const r=rng(5),cx=hole?hole[0][0]:(win[0]+win[2])/2,cy=hole?hole[0][1]:(win[1]+win[3])/2,hw=hole?20:(win[2]-win[0])/2,hh=hole?20:(win[3]-win[1])/2;c.lineCap='round';
for(let i=0;i<16;i++){const a=r()*2*PI,ca=Math.cos(a),sa=Math.sin(a),x0=cx+ca*(hw+4),y0=cy+sa*(hh+4),L=40+r()*160,bend=(r()-.5)*30,x1=x0+ca*L-sa*bend,y1=y0+sa*L+ca*bend,w=5+r()*12;
c.globalAlpha=.26;c.strokeStyle='#123f47';c.lineWidth=w;c.beginPath();c.moveTo(x0,y0);c.quadraticCurveTo((x0+x1)/2-sa*bend,(y0+y1)/2+ca*bend,x1,y1);c.stroke();
c.globalAlpha=.2;c.strokeStyle='#7cc4cd';c.lineWidth=w*.3;c.beginPath();c.moveTo(x0-sa*w*.5,y0+ca*w*.5);c.quadraticCurveTo((x0+x1)/2-sa*(bend+w*.5),(y0+y1)/2+ca*(bend+w*.5),x1-sa*w*.5,y1+ca*w*.5);c.stroke();}
c.globalAlpha=1;grain(k,bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1],.55);c.restore();
if(!hole){const w=win[2]-win[0],h=win[3]-win[1];c.save();c.beginPath();c.rect(win[0],win[1],w,h);c.clip();c.strokeStyle='rgba(0,0,0,.28)';c.lineWidth=5;c.strokeRect(win[0]+1,win[1]+1,w-2,h-2);c.restore();
c.strokeStyle='#46a0ac';c.lineWidth=2.2;c.strokeRect(win[0]-1.1,win[1]-1.1,w+2.2,h+2.2);c.strokeStyle='rgba(8,40,46,.7)';c.lineWidth=.5;c.strokeRect(win[0]-2.3,win[1]-2.3,w+4.6,h+4.6);
[[win[0],win[1]],[win[2],win[1]],[win[0],win[3]],[win[2],win[3]]].forEach(([x,y])=>{ell(x,y,3.2,3.2,0,lin(x-3,y-3,x+3,y+3,[[0,'#f1f4f6'],[1,'#717c84']]),'#4d565c',.4);strokeP([[x-4,y+4],[x-14,y+14]],'#9aa5ad',1.2);});}
}
function prep(win,alpha){const c=CX;
const w=win[2]-win[0],h=win[3]-win[1],r=rng(19);c.save();c.beginPath();c.rect(win[0],win[1],w,h);c.clip();c.globalAlpha=alpha==null?.34:alpha;c.fillStyle='#9a4c14';c.fillRect(win[0],win[1],w,h);
for(let i=0;i<16;i++){const x=win[0]+r()*w,y=win[1]+r()*h,rr=(.12+r()*.28)*Math.max(w,h);c.globalAlpha=.13;c.fillStyle=rad(x,y,rr,[[0,r()<.5?'#5e2604':'#d08a4a'],[1,'rgba(150,80,30,0)']]);c.fillRect(x-rr,y-rr,2*rr,2*rr);}
c.globalAlpha=.22;c.strokeStyle='#4e2003';c.lineWidth=1.6;c.strokeRect(win[0]+.8,win[1]+.8,w-1.6,h-1.6);c.restore();}
function steel(y0,y1,tone){const c=CX;const t=tone||0;return lin(0,y0,0,y1,[[0,t?'#565f66':'#79848c'],[.32,'#f2f6f8'],[.55,'#aeb8bf'],[1,t?'#3e464c':'#5c666d']]);}
function poly(a,f,s,w){const c=CX;c.beginPath();c.moveTo(a[0],a[1]);for(let i=2;i<a.length;i+=2)c.lineTo(a[i],a[i+1]);c.closePath();if(f){c.fillStyle=f;c.fill();}if(s){c.strokeStyle=s;c.lineWidth=w||.25;c.stroke();}}
function fring(x,y,r,w,col){const c=CX;c.beginPath();c.arc(x,y,r,0,2*PI);c.strokeStyle=col||'#d9e0e5';c.lineWidth=w;c.stroke();c.strokeStyle='rgba(40,48,54,.6)';c.lineWidth=.3;c.beginPath();c.arc(x,y,r+w/2,0,2*PI);c.stroke();c.beginPath();c.arc(x,y,r-w/2,0,2*PI);c.stroke();}
function bar(x0,x1,w0,w1,fill,s){const c=CX;poly([x0,-w0/2,x1,-w1/2,x1,w1/2,x0,w0/2],fill||steel(-Math.max(w0,w1)/2,Math.max(w0,w1)/2),s||'rgba(40,48,54,.6)',.2);}
function scalpel(e,s){const c=CX;poly([0,0,5*s,-3.4*s,14*s,-5.1*s,27*s,-5.3*s,36*s,-4.4*s,40*s,-2.7*s,40*s,2*s,12*s,2*s,3.5*s,.9*s],steel(-5.3*s,2*s),'#56616a',.15);
c.strokeStyle=WH(.85);c.lineWidth=.22;c.beginPath();c.moveTo(.8,-.4);c.quadraticCurveTo(9*s,-5*s,30*s,-5*s);c.stroke();
ell(30*s,-1.4*s,4*s,.7*s,0,'rgba(60,70,78,.35)');const x0=38*s;bar(x0,x0+128,6.4,8.2);for(let i=0;i<10;i++){c.strokeStyle='rgba(60,70,78,.45)';c.lineWidth=.4;c.beginPath();c.moveTo(x0+40+i*4,-3.3);c.lineTo(x0+40+i*4,3.3);c.stroke();}
if(e)ell(2,0,3,3,0,'rgba(190,20,20,.25)');}
function scissors(e,L,bl,curve,heavy){const c=CX;const op=e?1:10,w=heavy?3.4:2.2;
[1,-1].forEach(sg=>{c.save();c.translate(bl,0);c.rotate(sg*op/2*D2R);c.translate(-bl,0);
const pts=[];for(let i=0;i<=8;i++){const x=bl*i/8,cv=curve*(1-i/8)**2;pts.push(x,-cv+sg*(i===0?.15:w*(.18+.3*i/8)));}for(let i=8;i>=0;i--){const x=bl*i/8,cv=curve*(1-i/8)**2;pts.push(x,-cv+sg*.05);}
poly(pts,steel(-w,w),'#4a545b',.15);bar(bl,L-18,2.6,2.2);c.save();c.translate(0,sg*3.2);c.restore();
c.beginPath();c.moveTo(L-22,sg*1);c.lineTo(L-16,sg*5);c.strokeStyle='#aeb8bf';c.lineWidth=2.2;c.stroke();fring(L-9,sg*8.5,6.5,1.8);c.restore();});
ell(bl,0,1.6,1.6,0,'#c9d1d6','#4a545b',.25);}
function forceps(e,L,teeth,adson){const c=CX;const gap=e?.1:2.6;
[1,-1].forEach(sg=>{const tip=adson?.45:.7,mid=adson?1.2:2.6;const pts=[0,sg*gap/2,adson?40:L*.3,sg*(gap/2+mid*.7),adson?52:L*.55,sg*(gap/2+3.6),L-6,sg*2.2,L,sg*.4,L,sg*.1,L-8,sg*1.2,adson?52:L*.55,sg*(gap/2+1.2),adson?40:L*.3,sg*(gap/2+mid*.25),tip,sg*gap/2+sg*.05];
poly(pts,steel(-4,4),'#4a545b',.15);c.strokeStyle='rgba(60,70,78,.4)';c.lineWidth=.3;for(let x=(adson?60:L*.6);x<L-14;x+=2.2){c.beginPath();c.moveTo(x,sg*(gap/2+1.4));c.lineTo(x+.8,sg*(gap/2+3));c.stroke();}
if(teeth)poly([0,sg*gap/2,1.2,sg*(gap/2-.7*sg*sg),1.8,sg*gap/2],'#3d464c');});
ell(L-1,0,1.4,2,0,'#9aa5ad');}
function clampI(e,L,jaw,w,gold){const c=CX;const op=e?0:7;
[1,-1].forEach(sg=>{c.save();c.translate(jaw+3,0);c.rotate(sg*op/2*D2R);c.translate(-jaw-3,0);
const pts=[];for(let i=0;i<=8;i++){const x=(jaw+3)*i/8;pts.push(x,-1.6*(1-i/8)**2+sg*(w*(.15+.35*i/8)));}for(let i=8;i>=0;i--){const x=(jaw+3)*i/8;pts.push(x,-1.6*(1-i/8)**2+sg*.04);}
poly(pts,steel(-w,w),'#4a545b',.15);c.strokeStyle='rgba(40,46,52,.45)';c.lineWidth=.18;for(let x=1;x<jaw;x+=.9){c.beginPath();c.moveTo(x,-1.6*(1-x/jaw)**2+sg*.1);c.lineTo(x,-1.6*(1-x/jaw)**2+sg*w*.4);c.stroke();}
bar(jaw+3,L-22,3.4,2.6);for(let i=0;i<3;i++)poly([L-34+i*3,sg*1.2,L-32.5+i*3,sg*2.4,L-31+i*3,sg*1.2],'#7b868e');
c.beginPath();c.moveTo(L-22,sg*1.2);c.lineTo(L-16,sg*5);c.strokeStyle='#aeb8bf';c.lineWidth=2.4;c.stroke();fring(L-9,sg*8.5,6.5,1.9,gold?'#d8b25a':null);c.restore();});
c.fillStyle='#c3ccd2';c.fillRect(jaw+1,-2.2,4.5,4.4);c.strokeStyle='#4a545b';c.lineWidth=.2;c.strokeRect(jaw+1,-2.2,4.5,4.4);}
function needleDriver(e){const c=CX;clampI(true,150,12,4.2,true);c.strokeStyle='#2f343a';c.lineWidth=.55;c.beginPath();c.arc(-1.2,-2.6,4.4,-.3*PI,.95*PI);c.stroke();c.strokeStyle=WH(.6);c.lineWidth=.15;c.beginPath();c.arc(-1.2,-2.6,4.25,-.2*PI,.5*PI);c.stroke();
c.strokeStyle='#6a3fa0';c.lineWidth=.35;c.beginPath();c.moveTo(-5.4,-1.3);c.bezierCurveTo(-12,6,-4,18,10,22);c.stroke();}
function retractor(e,kind){const c=CX;if(kind==='senn'){for(let i=-1;i<=1;i++){poly([0,i*3,6,i*3-.8,9,i*3-.8,9,i*3+.8,6,i*3+.8],steel(-4,4),'#4a545b');}bar(8,150,4,6);poly([146,-6,160,-7,160,7,146,6],steel(-7,7),'#4a545b');return;}
poly([0,-9,0,9,13,9.5,14,-9.5],steel(-10,10,1),'#3d464c',.3);c.fillStyle=WH(.35);c.fillRect(2,-7,2,14);bar(13,140,11,12);c.fillStyle='rgba(50,58,64,.25)';c.fillRect(30,-1.5,90,3);poly([138,-7,152,-7.5,154,7.5,138,7],steel(-8,8,1),'#3d464c');}
function yankauer(e){const c=CX;const g='rgba(232,242,248,.82)';ell(0,0,2.4,2.4,0,g,'#7c8b94',.25);for(let i=0;i<4;i++)ell(.4+i*.6,(i%2?1:-1)*.8,.35,.35,0,'#55636b');strokeP([[1,0],[18,-3],[40,-2],[60,4]],'#7c8b94',4,true);strokeP([[1,0],[18,-3],[40,-2],[60,4]],g,3.2,true);bar(58,170,7,9,'rgba(228,238,244,.85)','#7c8b94');strokeP([[170,0],[200,6],[240,-6]],'rgba(220,232,240,.7)',6,true);if(e)ell(0,0,5,5,0,'rgba(130,0,0,.18)');}
function pencil(e){const c=CX;bar(0,14,1.2,1.8);bar(14,20,4,6,'#58616a');poly([20,-5,130,-5.6,140,-3,140,3,130,5.6,20,5],lin(0,-6,0,6,[[0,'#7d8ea0'],[.4,'#e8eef4'],[1,'#6a7a8b']]),'#4c5967',.25);ell(44,-5.2,3.5,1.7,0,'#e4c228','#7d6a12',.2);ell(58,-5.2,3.5,1.7,0,'#3b74d6','#1d3e7a',.2);strokeP([[140,0],[170,4],[220,-10]],'#3a4148',2.6,true);
if(e){ell(0,0,4,4,0,rad(0,0,4,[[0,'rgba(230,240,255,.95)'],[.5,'rgba(120,170,255,.5)'],[1,'rgba(120,170,255,0)']]));}}
function bipolar(e){const c=CX;const g=e?.05:1.4;[1,-1].forEach(sg=>{poly([0,sg*g/2,25,sg*(g/2+.9),60,sg*(g/2+1.6),66,sg*(g/2+7),160,sg*(g/2+8.4),160,sg*(g/2+6),70,sg*(g/2+4.6),62,sg*(g/2+.3),25,sg*(g/2+.3),.5,sg*g/2],sg>0?'#3e6ea8':'#4a7cb8','#203a5a',.2);bar(0,25,.7,1.2);});
strokeP([[160,0],[190,8],[230,0]],'#d5dde3',2.2,true);if(e)ell(0,0,3,3,0,rad(0,0,3,[[0,'rgba(230,240,255,.95)'],[1,'rgba(120,170,255,0)']]));}
function lapTool(e,kind){const c=CX;bar(12,320,5,5,lin(0,-2.5,0,2.5,[[0,'#1e2328'],[.4,'#59626a'],[1,'#14181c']]),'#0b0d0f');bar(8,13,4.2,5,'#9aa5ad');
if(kind==='hook'){strokeP([[10,0],[2,0],[0,-2.6]],'#c9d1d6',.9);if(e)ell(0,-2.4,3,3,0,rad(0,-2.4,3,[[0,'rgba(230,240,255,.95)'],[1,'rgba(120,170,255,0)']]));return;}
const op=e?.4:9;[1,-1].forEach(sg=>{c.save();c.translate(9,0);c.rotate(sg*op*D2R);c.translate(-9,0);poly([0,sg*.2,9,sg*2.3,9,sg*.1],'#bfc8ce','#4a545b',.15);for(let x=1.5;x<8;x+=1.5)ell(x,sg*.9,.45,.3,0,'#4a545b');c.restore();});}
function probe(e,curved){const c=CX;c.save();poly([-22,-7,22,-7,26,-3,26,3,22,7,-22,7,-26,3,-26,-3],lin(0,-7,0,7,[[0,'#cfd6db'],[.45,'#f6f8f9'],[1,'#9aa4ab']]),'#5b656c',.35);poly([-20,-5.4,20,-5.4,20,5.4,-20,5.4],curved?'#5f6870':'#3a4249');
ell(23.5,0,1.4,1.4,0,'#3fb36b');strokeP([[26,0],[60,4],[110,-6]],'#2e353b',3.2,true);if(e)ell(0,0,30,10,0,'rgba(120,200,255,.16)');c.restore();}
function steth(e){const c=CX;ell(0,0,20,20,0,lin(-20,-20,20,20,[[0,'#f2f5f7'],[.5,'#9aa4ab'],[1,'#e1e6e9']]),'#4c565d',.5);ell(0,0,16.5,16.5,0,'#2f3439');ell(-4,-5,6,4,-30,WH(.12));bar(19,34,5,4);strokeP([[34,0],[70,10],[130,-10],[180,10]],'#22272b',4.2,true);if(e)ell(0,0,24,24,0,null,'rgba(60,170,255,.6)',.8);}
function electrode(e,lab){const c=CX;ell(0,0,11,11,0,'#f3f1ea','#9e9a8e',.4);ell(0,0,6,6,0,'#d8d4c4');ell(0,0,2.6,2.6,0,lin(-2,-2,2,2,[[0,'#f5f7f8'],[1,'#7c868e']]),'#4f585f',.3);if(lab!==false){strokeP([[2.6,0],[30,6],[80,-4]],lab===true?'#d2342c':'#3c454c',1.4,true);}}
function otoscope(e){const c=CX;poly([0,-1.3,14,-4.6,14,4.6,0,1.3],'#1d2226','#000',.2);poly([14,-9,32,-9,34,-6,34,6,32,9,14,9],'#2a3036','#0d0f11',.3);ell(24,0,5,5,0,'#8db4c9','#0d0f11',.3);bar(34,120,13,14,lin(0,-7,0,7,[[0,'#59636b'],[.4,'#e6ebee'],[1,'#4f5961']]));for(let x=50;x<115;x+=3){c.strokeStyle='rgba(30,36,40,.35)';c.lineWidth=.4;c.beginPath();c.moveTo(x,-6.5);c.lineTo(x,6.5);c.stroke();}if(e)ell(-4,0,6,3,0,'rgba(255,248,210,.45)');}
function ophtho(e){const c=CX;poly([0,-12,30,-12,34,-8,34,8,30,12,0,12,-2,8,-2,-8],'#262c31','#0d0f11',.3);ell(14,0,6.5,6.5,0,'#4b555c','#0d0f11',.3);ell(14,0,2.2,2.2,0,'#9cc4dc');bar(34,120,13,14,lin(0,-7,0,7,[[0,'#59636b'],[.4,'#e6ebee'],[1,'#4f5961']]));if(e)ell(-8,0,9,4,0,'rgba(255,248,210,.4)');}
function mirror(e){const c=CX;ell(0,0,10.5,10.5,0,lin(-10,-10,10,10,[[0,'#f8fbfc'],[.5,'#9fb6c2'],[1,'#e7eef2']]),'#59646b',.8);ell(-3,-3,4,2.4,-40,WH(.55));bar(10,40,1.6,1.8);bar(40,160,6.5,7);}
function explorer(e){const c=CX;strokeP([[0,0],[2.5,-5],[8,-7.5],[16,-6],[24,-1.2],[30,0]],'#9aa5ad',.8,true);strokeP([[0,0],[2.5,-5],[8,-7.5],[16,-6],[24,-1.2],[30,0]],'#e9eef1',.3,true);bar(30,160,6.5,7);}
function handpiece(e){const c=CX;bar(0,9,1.1,1.3,lin(0,-.6,0,.6,[[0,'#a07a2a'],[.5,'#f3dc94'],[1,'#8a6a20']]));poly([9,-5,21,-5,23,-2,23,2,21,5,9,5],steel(-5,5),'#4a545b');bar(22,40,5,7);bar(40,150,9,11,lin(0,-5,0,5,[[0,'#6e7880'],[.4,'#f1f4f6'],[1,'#56606a']]));if(e)ell(0,0,3,3,0,'rgba(220,240,255,.45)');}
function microF(e){const c=CX;const g=e?.03:.55;[1,-1].forEach(sg=>poly([0,sg*g/2,10,sg*(g/2+.6),30,sg*(g/2+2),110,sg*2.6,110,sg*.2,30,sg*(g/2+.4),10,sg*(g/2+.1),0,sg*(g/2+.02)],lin(0,-3,0,3,[[0,'#7b7f9a'],[.4,'#e3e5f1'],[1,'#62677f']]),'#3b3f55',.08));}
function microS(e){const c=CX;const op=e?.5:7;[1,-1].forEach(sg=>{c.save();c.translate(5,0);c.rotate(sg*op*D2R);c.translate(-5,0);poly([0,sg*.02,5,sg*.45,5,sg*.05],'#d6dae6','#3b3f55',.06);c.restore();});bar(5,110,1.2,5,lin(0,-3,0,3,[[0,'#7b7f9a'],[.4,'#e3e5f1'],[1,'#62677f']]));}
function microN(e){const c=CX;microF(true);c.strokeStyle='#25292d';c.lineWidth=.08;c.beginPath();c.arc(-.25,-.5,.7,-.3*PI,.9*PI);c.stroke();strokeP([[-.9,-.1],[-3,2],[2,5]],'#1b3f8a',.04,true);}
function cystotome(e){const c=CX;strokeP([[0,0],[.5,-.35],[.9,-.2],[25,-.2]],'#c3cbd1',.3);poly([25,-1.4,34,-1.6,34,1.6,25,1.4],'#2f87c6','#164c73',.1);bar(34,90,6,6.5,'rgba(235,242,246,.75)','#7e8c95');}
function drill(e){const c=CX;bar(0,44,2.4,2.6,steel(-1.3,1.3));c.strokeStyle='rgba(50,58,64,.55)';c.lineWidth=.3;for(let x=2;x<42;x+=2){c.beginPath();c.moveTo(x,-1.2);c.lineTo(x+1.4,1.2);c.stroke();}bar(44,60,9,11,steel(-5.5,5.5,1));poly([60,-16,140,-18,150,-10,150,10,140,18,60,16],lin(0,-18,0,18,[[0,'#4d5458'],[.35,'#b7c0c6'],[1,'#3a4044']]),'#24292d',.4);poly([78,-16,132,-17,132,17,78,16],'#d9822b','#7a4413',.3);if(e)ell(0,0,4,4,0,'rgba(255,240,200,.4)');}
function cupI(e){const c=CX;bar(0,250,9,11);c.beginPath();c.arc(0,0,26,.5*PI,1.5*PI);c.closePath();c.fillStyle=lin(-26,-26,0,26,[[0,'#d7dde1'],[.5,'#8e989f'],[1,'#c4ccd1']]);c.fill();c.strokeStyle='#3c454c';c.lineWidth=.6;c.stroke();const r=rng(3);c.fillStyle='rgba(70,78,84,.35)';for(let i=0;i<70;i++){const a=(.5+r())*PI,d=8+r()*17;ell(Math.cos(a)*d,Math.sin(a)*d,.7,.7,0,'rgba(70,78,84,.35)');}}
function marker(e,col){const c=CX;poly([0,0,3.5,-1.8,3.5,1.8],col||'#6b2fa8');bar(3.5,12,3.6,7,'#efeaf3','#6d6676');bar(12,125,9,9.4,'#f4f1f6','#6d6676');bar(108,130,10,10,col||'#6b2fa8','#3a1d5a');}
function pen(e){const c=CX;strokeP([[-5,0],[5,0]],'#f5d000',.4);strokeP([[0,-5],[0,5]],'#f5d000',.4);ell(0,0,1.6,1.6,0,null,'#f5d000',.3);bar(6,100,1.5,6,'#d9dde0','#4f585f');}
function caliper(e){const c=CX;strokeP([[-4,0],[4,0]],'#4fd1ff',.35);strokeP([[0,-4],[0,4]],'#4fd1ff',.35);ell(0,0,1.2,1.2,0,null,'#4fd1ff',.25);bar(5,90,1.3,5,'#d9dde0','#4f585f');}
function finger(e,nitrile){const c=CX,g=nitrile===false?'#efe1bf':'#8ab3e6',d=nitrile===false?'#b9a57c':'#4a77b0';c.save();c.globalAlpha=.9;
poly([0,-6.2,40,-7,52,-8.5,58,-6,58,6,52,8.5,40,7,0,6.2],lin(0,-8,0,8,[[0,d],[.45,g],[1,d]]),d,.35);ell(2.2,0,5.6,6.3,0,g,d,.35);ell(7,-1,5,3.4,0,WH(.2));strokeP([[22,-5.4],[23,5.4]],'rgba(30,50,90,.25)',.45);strokeP([[44,-7],[45,7]],'rgba(30,50,90,.2)',.45);c.restore();if(e)ell(0,0,9,9,0,WH(.18),'rgba(40,90,170,.5)',.6);}
function scanner(e){const c=CX;poly([0,-12,30,-14,34,-8,34,8,30,14,0,12],'#30363b','#111',.4);poly([-1,-9,2,-9,2,9,-1,9],'#b31d1d');bar(34,80,12,14,'#3d444a','#111');poly([70,7,110,24,104,32,64,14],'#2b3136');if(e){c.save();c.globalAlpha=.7;strokeP([[-1,-9],[-60,-18]],'#ff2a2a',.5);strokeP([[-1,9],[-60,18]],'#ff2a2a',.5);strokeP([[-60,-18],[-60,18]],'#ff2a2a',.9);c.restore();}}
function sponge(e){const c=CX;ell(0,0,9,7,0,'#9a5418','#6d360b',.4);const r=rng(9);for(let i=0;i<12;i++)ell(-6+r()*12,-4.5+r()*9,1.6,.7,r()*180,'rgba(255,225,170,.35)');fring(6,0,5,1.6);[1,-1].forEach(sg=>{bar(10,210,2.6,2.6);c.save();c.translate(0,sg*1.5);c.restore();fring(222,sg*8,6.5,1.8);});}
function laryngo(e){const c=CX;c.save();c.scale(1,-1);const g=lin(0,-10,0,4,[[0,'#b9c3ca'],[.4,'#f3f6f8'],[1,'#7f8a92']]);c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(30,6,64,-6);c.lineTo(66,-1);c.quadraticCurveTo(30,12,-1,3.5);c.closePath();c.fillStyle=g;c.fill();c.strokeStyle='#4a545b';c.lineWidth=.3;c.stroke();poly([56,-6,66,-9,68,-2,58,1],'#9aa5ad','#4a545b');ell(24,3,2,1.4,10,'#fff8d8');
c.save();c.translate(64,-5);c.rotate(-PI/2);bar(0,118,26,26,lin(0,-13,0,13,[[0,'#5d676f'],[.4,'#e7ecef'],[1,'#4c565e']]));for(let x=14;x<110;x+=4){c.strokeStyle='rgba(30,36,40,.3)';c.lineWidth=.5;c.beginPath();c.moveTo(x,-12);c.lineTo(x,12);c.stroke();}c.restore();if(e)ell(6,1,7,3,10,'rgba(255,248,210,.45)');c.restore();}
function ett(e){const c=CX;const tube=[[0,0],[30,-6],[70,-22],[120,-50],[170,-70]];strokeP(tube,'rgba(160,200,215,.75)',7.6,true);strokeP(tube,'rgba(235,248,252,.65)',6,true);strokeP(tube.map(p=>[p[0],p[1]-.2]),'#4b555c',1,true);ell(9,-1.5,9,5.4,-12,'rgba(210,235,245,.55)','rgba(120,160,175,.7)',.3);poly([-1,-3.6,2,3.6,-2,3.2],'rgba(160,200,215,.8)');c.save();c.translate(170,-70);c.rotate(-.38);bar(0,18,10,10,'#e7ebee','#4c565e');c.restore();}
function slideI(e){const c=CX;c.save();c.globalAlpha=.9;bar(0,75,1.2,1.2,'rgba(200,230,235,.85)','rgba(80,120,130,.8)');c.restore();bar(52,75,1.6,1.6,'#f0f0f0','#888');}
function inkI(e,col){const c=CX;ell(1.5,0,2.6,2.1,0,col||'#1e7a3a','#0d3d1c',.2);bar(3,110,1.6,1.8,'#d8b98a','#8a6a3a');}
function punch(e){const c=CX;ell(0,0,2,2,0,null,'#c9d1d6',.45);bar(2,26,4.4,4.4);bar(26,90,7,8,'#e7ebee','#4c565e');for(let x=32;x<86;x+=3){c.strokeStyle='rgba(30,36,40,.3)';c.lineWidth=.4;c.beginPath();c.moveTo(x,-3.6);c.lineTo(x,3.6);c.stroke();}}
function wireTip(e){const c=CX;strokeP([[0,0],[-1.2,-1.5],[-.4,-3.4],[1.6,-4]],'#16191c',.45,true);strokeP([[0,0],[40,0]],'#16191c',.4);}
const TOOLS={
s10:{n:'#10 手術刀|#10 scalpel',c:'cut',d:e=>scalpel(e,1)},
s15:{n:'#15 手術刀|#15 scalpel',c:'cut',d:e=>scalpel(e,.62)},
metz:{n:'Metzenbaum 剪|Metzenbaum scissors',c:'sci',d:e=>scissors(e,178,30,2.6,0)},
mayo:{n:'Mayo 剪|Mayo scissors',c:'sci',d:e=>scissors(e,150,38,1.2,1)},
fT:{n:'有齒鑷|toothed forceps',c:'gr',d:e=>forceps(e,145,1,0)},
fN:{n:'無齒鑷（DeBakey）|non-toothed forceps (DeBakey)',c:'gr',d:e=>forceps(e,150,0,0)},
adson:{n:'Adson 鑷|Adson forceps',c:'gr',d:e=>forceps(e,120,1,1)},
nd:{n:'持針器＋彎針|needle driver + curved needle',c:'nd',d:needleDriver},
kelly:{n:'止血鉗（Kelly）|haemostat (Kelly)',c:'cl',d:e=>clampI(e,140,18,4.6)},
mosq:{n:'蚊式鉗|mosquito clamp',c:'cl',d:e=>clampI(e,125,13,3.2)},
army:{n:'Army-Navy 拉鉤|Army-Navy retractor',c:'rt',d:e=>retractor(e,'army')},
senn:{n:'Senn 拉鉤|Senn retractor',c:'rt',d:e=>retractor(e,'senn')},
yank:{n:'Yankauer 吸引管|Yankauer suction',c:'su',d:yankauer},
pen:{n:'電燒筆|electrosurgical pencil',c:'en',d:pencil},
bip:{n:'雙極電凝鑷|bipolar forceps',c:'en',d:bipolar},
lgr:{n:'腹腔鏡抓鉗|laparoscopic grasper',c:'lap',d:e=>lapTool(e,'gr')},
lhk:{n:'腹腔鏡電鉤|laparoscopic hook',c:'lap',d:e=>lapTool(e,'hook')},
cam:{n:'腹腔鏡鏡頭（30°）|laparoscope camera (30°)',c:'cam',d:e=>{bar(0,320,10,10,lin(0,-5,0,5,[[0,'#2a2f34'],[.4,'#9aa4ab'],[1,'#1e2226']]));ell(0,0,4,4,0,'#6fb7e8');}},
wire:{n:'導絲（J 形尖端）|guidewire (J-tip)',c:'wire',d:wireTip},
us:{n:'超音波探頭|ultrasound probe',c:'us',d:e=>probe(e,0)},
usC:{n:'凸陣探頭|curvilinear probe',c:'us',d:e=>probe(e,1)},
st:{n:'聽診器|stethoscope',c:'st',d:steth},
el:{n:'心電圖電極貼片|ECG electrode',c:'el',d:e=>electrode(e,true)},
oto:{n:'耳鏡|otoscope',c:'oto',d:otoscope},
oph:{n:'眼底鏡／光源|ophthalmoscope / light',c:'oph',d:ophtho},
mir:{n:'口鏡|dental mirror',c:'mir',d:mirror},
exp:{n:'探針|dental explorer',c:'exp',d:explorer},
bur:{n:'牙科手機（車針）|dental handpiece (bur)',c:'bur',d:handpiece},
mf:{n:'顯微鑷|microforceps',c:'gr',d:microF},
ms:{n:'顯微剝離剪|micro-dissecting scissors',c:'sci',d:microS},
mn:{n:'顯微持針器（10-0）|micro needle holder (10-0)',c:'nd',d:microN},
cys:{n:'截囊針|cystotome',c:'cut',d:cystotome},
drl:{n:'骨鑽|bone drill',c:'drl',d:drill},
cup:{n:'髖臼杯置入器|acetabular cup inserter',c:'cup',d:cupI},
mk:{n:'皮膚標記筆|skin marker',c:'mk',d:e=>marker(e)},
ctr:{n:'勾畫筆|contouring pen',c:'mk',d:pen},
cal:{n:'電子卡尺|digital caliper',c:'mk',d:caliper},
fg:{n:'手指觸診（檢查手套）|palpating finger (exam glove)',c:'fg',d:e=>finger(e,true)},
fgS:{n:'手指（無菌手套）|finger (sterile glove)',c:'fg',d:e=>finger(e,false)},
scan:{n:'條碼掃描器|barcode scanner',c:'sc',d:scanner},
spg:{n:'海綿鉗（消毒）|sponge stick (prep)',c:'sp',d:sponge},
lar:{n:'喉頭鏡（Macintosh）|laryngoscope (Macintosh)',c:'lar',d:laryngo},
ett:{n:'氣管內管|endotracheal tube',c:'ett',d:ett},
sld:{n:'推片|spreader slide',c:'sl',d:slideI},
ink:{n:'組織墨水棒|tissue-ink applicator',c:'ink',d:e=>inkI(e)},
pun:{n:'環鑽切片器|punch biopsy tool',c:'cut',d:punch}
};
const SHARP={cut:1,sci:1,nd:1,en:1,exp:1,bur:1,drl:1,cl:1,clip:1,lap:1,wire:1,lar:1,ett:1,cup:1};
const VERB={cut:'切開|incise',sci:'剪開／剝離|cut / dissect',gr:'夾持|grasp',nd:'入針／出針|needle bite',cl:'夾閉|clamp',rt:'牽開固定|retract & hold',su:'吸引|suction',en:'電凝止血|coagulate',lap:'抓取|grasp',cam:'穩住鏡頭|steady camera',wire:'推進／停放|advance / park',us:'擷取影像|capture view',st:'聽診|listen',el:'貼上|place',oto:'觀察|inspect',oph:'照明觀察|illuminate',mir:'牽開反射|retract / reflect',exp:'探查|probe',bur:'切削|cut',drl:'鑽孔|drill',cup:'置入敲擊|seat / impact',mk:'標記|mark',fg:'觸診／固定|palpate / hold',sc:'掃描|scan',sp:'消毒塗擦|paint prep',lar:'上提|lift',ett:'置入|pass',sl:'推片|spread',ink:'上墨|ink'};
const R={};
const mir=pts=>pts.concat(pts.slice(0,-1).reverse().map(p=>[-p[0],p[1]]));
const sheet=(X,col)=>{const{c,bb}=X;c.fillStyle=lin(bb[0],bb[1],bb[2],bb[3],[[0,col||'#c5d4db'],[1,'#a9bcc5']]);c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);};
const shade=(pts,col,w)=>strokeP(pts,col,w,true);
function both(f){f(1);f(-1);}
function surg(X){const{c,k,bb,D}=X;if(D.win){prep(D.win);drape(D.win,bb,k);}}
R.torso=X=>{
const{c,k,D}=X,g=!!(D.rv&&D.rv.preg);sheet(X);
const half=[[52,-338],[54,-262],[68,-238],[150,-222],[188,-204],[184,-150],[178,-80],[g?172:158,40],[g?180:162,120],[180,200],[178,290],[168,405],[40,405],[14,334],[0,324]];
const o=half.concat(half.slice(0,-1).reverse().map(p=>[-p[0],p[1]]));
skinFill(o,k,[-200,-340,200,405]);
c.save();spline(o,true);c.clip();
c.fillStyle=lin(0,-340,0,-290,[[0,'rgba(90,45,30,.35)'],[1,'rgba(90,45,30,0)']]);c.fillRect(-60,-340,120,50);
both(s=>{shade([[s*46,-336],[s*30,-272],[s*14,-214]],'rgba(120,70,50,.13)',9);shade([[s*12,-213],[s*60,-221],[s*110,-219],[s*152,-227]],HL(.38),4.5);shade([[s*14,-207],[s*60,-215],[s*110,-213],[s*150,-220]],'rgba(120,70,50,.16)',3.5);
for(let i=0;i<7;i++){const y0=-186+23*i;shade([[s*15,y0],[s*60,y0+6],[s*110,y0+22],[s*162,y0+44]],SH(.035),7);}
if(!g)shade([[s*30,-40],[s*80,-33],[s*130,-47],[s*170,-82]],SH(.15),6);
shade([[s*6,-28],[s*50,-8],[s*100,17],[s*150,46]],SH(.15),5);shade([[s*70,-10],[s*72,80],[s*64,200]],SH(.06),6);
ell(s*112,196,11,8,0,HL(.28));shade([[s*112,202],[s*70,236],[s*24,268]],SH(.18),3);
ell(s*100,-82,13,12,0,rad(s*100,-82,13,[[0,'#9c5c48'],[.7,'#b77a62'],[1,'rgba(183,122,98,0)']]));ell(s*100,-82,3.4,3.4,0,'#8a4d3c');});
ell(0,-206,10,5.5,0,'rgba(120,70,50,.22)');shade([[-15,-163],[15,-163]],'rgba(255,240,225,.32)',3);shade([[-6,-292],[0,-284],[6,-292]],HL(.45),2.5);ell(0,-262,9,3.5,0,'rgba(120,70,50,.1)');
shade([[0,-30],[0,260]],SH(.07),3);ell(0,300,58,28,0,'rgba(90,50,35,.12)');
if(g){ell(0,105,150,178,0,rad(-35,30,210,[[0,HL(.38)],[1,'rgba(150,90,60,0)']]));shade([[0,-40],[0,262]],'rgba(80,40,25,.28)',2.4);ell(0,100,7.5,5,0,rad(0,100,7.5,[[0,'#6a3a2a'],[1,'rgba(160,100,75,0)']]));}
else{ell(0,95,6.5,8.5,0,rad(0,96,8.5,[[0,'#4e261a'],[.55,'#9c5e44'],[1,'rgba(200,140,110,0)']]));c.strokeStyle='rgba(255,230,210,.5)';c.lineWidth=.8;c.beginPath();c.arc(0,95,7,1.1*PI,1.9*PI);c.stroke();}
c.restore();surg(X);
};
R.back=X=>{
const{c,k,D,lab}=X;sheet(X);
const half=[[58,-345],[70,-300],[180,-262],[188,-200],[172,-80],[150,40],[178,150],[184,260],[170,340],[10,340],[0,330]];
const o=mir(half);skinFill(o,k,[-200,-345,200,340]);c.save();spline(o,true);c.clip();
both(s=>{shade([[s*34,-290],[s*38,-100],[s*34,120]],HL(.18),20);shade([[s*52,-282],[s*58,-220],[s*92,-176]],SH(.16),4);shade([[s*50,-264],[s*100,-272],[s*160,-278]],HL(.2),5);
shade([[s*42,168],[s*70,118],[s*120,96],[s*160,116],[s*182,150]],HL(.32),5);shade([[s*42,174],[s*70,124],[s*120,103],[s*160,122]],SH(.15),3);
ell(s*45,178,5,4,0,rad(s*45,178,5,[[0,'rgba(90,45,30,.5)'],[1,'rgba(90,45,30,0)']]));shade([[s*4,230],[s*60,250],[s*150,240]],SH(.12),6);});
SPINE.forEach(([n,y])=>{ell(0,y+3,5.5,6.5,0,SH(.16));ell(0,y,4.6,6,0,HL(.42));});
shade([[0,212],[0,340]],'rgba(80,40,28,.45)',2.2);c.restore();surg(X);
};
const SPINE=[['C7',-300],['T1',-280],['T2',-259],['T3',-238],['T4',-217],['T5',-196],['T6',-175],['T7',-154],['T8',-133],['T9',-112],['T10',-91],['T11',-70],['T12',-45],['L1',-8],['L2',30],['L3',65],['L4',100],['L5',135],['S1',172]];
R.head=X=>{
const{c,k,bb,D}=X;sheet(X,'#b9cbd3');
const o=[[-92,-12],[-94,-52],[-78,-92],[-44,-119],[0,-129],[50,-119],[92,-88],[116,-40],[119,10],[110,55],[94,90],[72,118],[30,130],[-40,128],[-92,120],[-104,100],[-112,96],[-108,84],[-126,70],[-104,40],[-100,20]];
skinFill(o,k,[-130,-130,120,130]);c.save();spline(o,true);c.clip();
const hair=[[-70,-80],[-30,-122],[40,-125],[100,-70],[122,0],[112,60],[96,80],[86,30],[70,-10],[40,-45],[0,-62],[-40,-70]];
c.save();spline(hair,true);c.fillStyle='#3a2a22';c.fill();c.clip();const r=rng(4);c.strokeStyle='rgba(120,90,70,.35)';c.lineWidth=.5;for(let i=0;i<420;i++){const x=-80+r()*210,y=-130+r()*220;c.beginPath();c.moveTo(x,y);c.lineTo(x+4+r()*4,y+2+r()*3);c.stroke();}c.restore();
if(D.win){c.save();c.beginPath();c.rect(D.win[0],D.win[1],D.win[2]-D.win[0],D.win[3]-D.win[1]);c.clip();skinFill(o,k,[-130,-130,120,130]);const r2=rng(8);for(let i=0;i<900;i++)ell(D.win[0]+r2()*(D.win[2]-D.win[0]),D.win[1]+r2()*(D.win[3]-D.win[1]),.25,.25,0,'rgba(60,40,30,.4)');c.restore();}
shade([[-30,58],[20,56],[62,60]],HL(.25),5);shade([[-96,14],[-86,10],[-72,14]],'#4a3328',3);shade([[-98,30],[-84,33],[-72,28]],'#5a3a2c',1);
const ear=[[64,8],[78,-3],[92,8],[97,40],[91,70],[81,87],[70,83],[66,64],[60,46]];
fillP(ear,lin(60,0,97,0,[[0,SKIN.dark],[.5,SKIN.lite],[1,SKIN.dark]]),SH(.35),.6,true);ell(77,46,9,12,0,rad(76,47,12,[[0,'#6e3c2a'],[1,'rgba(160,100,75,.2)']]));shade([[70,14],[86,18],[88,44],[80,70]],HL(.35),2.4);ell(62,46,3.5,5,0,SKIN.base,SH(.3),.4);
c.restore();surg(X);
};
R.face=X=>{
const{c,k,bb}=X;c.fillStyle=lin(bb[0],0,bb[2],0,[[0,SKIN.dark],[.5,SKIN.lite],[1,SKIN.base]]);c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);grain(k,bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1],.9);
shade([[-34,-40],[-30,-10],[-26,20],[-20,44]],SH(.28),2.4);shade([[-32,-40],[-28,-10],[-24,20],[-18,44]],HL(.3),1.6);
for(let i=-6;i<=6;i++)shade([[-60,i*9-20],[0,i*9+6],[60,i*9+32]],SH(.06),.7);
const r=rng(21);for(let i=0;i<9;i++)ell(-2.4+r()*4.8,-1.6+r()*3.2,1.2+r()*1.6,1+r()*1.3,r()*180,i%3?'rgba(92,52,34,.75)':'rgba(60,32,22,.8)');
};
R.skin=X=>{
const{c,k,bb}=X;c.fillStyle=lin(0,bb[1],0,bb[3],[[0,SKIN.base],[.5,SKIN.lite],[1,SKIN.dark]]);c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);grain(k,bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1],.9);
for(let i=-5;i<=5;i++)shade([[-60,i*7],[0,i*7+2],[60,i*7]],SH(.05),.6);
const r=rng(17);for(let i=0;i<70;i++){const x=-40+r()*80,y=-30+r()*60;if(hyp(x,y)>9)strokeP([[x,y],[x+1.6,y-.6]],'rgba(80,50,35,.35)',.12);}
const blob=ring(0,0,6,28).map(([x,y],i)=>[x*(1+.12*Math.sin(i*1.7)),y*(.82+.1*Math.cos(i*2.3))]);
fillP(blob,rad(1,-.5,7,[[0,'#7a3f2c'],[.6,'#9e5a42'],[1,'#c58a70']]),'rgba(90,40,25,.4)',.3,true);
ell(3.2,-1.8,2.2,1.8,20,rad(3,-2,2.4,[[0,'#4d2418'],[1,'rgba(77,36,24,.2)']]));ell(2.6,-2.4,.8,.5,0,'rgba(255,240,230,.4)');
for(let i=0;i<10;i++)ell(-4+r()*6,-3+r()*6,.5,.3,r()*180,'rgba(250,235,220,.5)');
};
R.eye=X=>{
const{c,k,bb,D}=X,ext=D.rv&&D.rv.ext;
if(ext){c.fillStyle=lin(0,bb[1],0,bb[3],[[0,SKIN.base],[.5,SKIN.lite],[1,SKIN.dark]]);c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);grain(k,bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1],.8);
const r=rng(2);c.strokeStyle='#3d2a20';c.lineWidth=.5;for(let i=0;i<90;i++){const x=-22+r()*40,y=-22+Math.sin((x+22)/40*PI)*-4+r()*3;c.beginPath();c.moveTo(x,y);c.lineTo(x+2.6,y-1);c.stroke();}
shade([[-19,-9],[0,-14],[19,-8]],SH(.3),1.2);const fis=arc(0,-1,15,6.5,180,360,24).concat(arc(0,-1,15,5.5,0,180,24));
fillP(fis,'#f3efe8');c.save();path(fis,true);c.clip();ell(0,0,5.8,5.8,0,rad(0,0,5.8,[[0,'#2a1a12'],[.4,'#6b4a2e'],[.85,'#8a6440'],[1,'#3e2c1e']]));ell(0,0,2.4,2.4,0,'#0c0806');ell(-1.2,-1.4,.7,.5,0,WH(.85));c.restore();
strokeP(arc(0,-1,15,6.5,180,360,24),'#3a2418',.55);strokeP(arc(0,-1,15,5.5,0,180,24),'#5a3a2c',.4);for(let i=0;i<26;i++){const p=arc(0,-1,15,6.5,190+i*6.2,190+i*6.2,1)[0];strokeP([p,[p[0]*1.06,p[1]-2.4]],'#20140e',.25);}
return;}
c.fillStyle='#7d4b44';c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);ell(0,0,13.5,11.5,0,'#c97c70');
ell(0,0,12.4,10.6,0,rad(-2,-2,13,[[0,'#fbf8f2'],[.8,'#eee6dc'],[1,'#cdb8aa']]));const r=rng(6);for(let i=0;i<26;i++){const a=r()*2*PI,r0=7+r()*1.2;const pts=[];let x=Math.cos(a)*r0,y=Math.sin(a)*r0*.86;for(let j=0;j<5;j++){pts.push([x,y]);x+=Math.cos(a+(r()-.5))*1.1;y+=Math.sin(a+(r()-.5))*1.1;}strokeP(pts,'rgba(178,40,40,.45)',.08+r()*.06,true);}
[-1,1].forEach(s=>{strokeP(arc(0,s*11.8,10,2.6,s>0?180:0,s>0?360:180,20),'#c5ccd2',.5);strokeP([[-10,s*11.6],[-14,s*14]],'#c5ccd2',.5);strokeP([[10,s*11.6],[14,s*14]],'#c5ccd2',.5);});
ell(0,0,5.95,5.95,0,rad(0,0,5.95,[[.86,'rgba(120,140,160,0)'],[1,'rgba(110,130,150,.6)']]));c.save();ell(0,0,5.8,5.8,0,rad(0,0,5.8,[[.6,'#5b3d27'],[.75,'#7d5634'],[1,'#4a3220']]));for(let i=0;i<90;i++){const a=i*4*D2R;strokeP([[Math.cos(a)*3.7,Math.sin(a)*3.7],[Math.cos(a+.05)*5.7,Math.sin(a+.05)*5.7]],i%2?'rgba(40,24,14,.35)':'rgba(170,130,90,.25)',.09);}c.restore();
ell(0,0,3.6,3.6,0,rad(0,.3,3.6,[[0,'#ff8a3a'],[.6,'#e0581f'],[1,'#8a2a10']]));ell(0,0,3.6,3.6,0,null,'rgba(60,20,10,.6)',.12);
ell(-1.2,-1.4,.5,.5,0,WH(.95));ell(1.4,-1.3,.35,.35,0,WH(.85));ell(5.4,-2.6,.7,.25,-25,'rgba(160,40,30,.5)');
};
R.ear=X=>{
const{c,k,bb,D}=X;c.fillStyle=lin(bb[0],0,bb[2],0,[[0,SKIN.base],[1,SKIN.dark]]);c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);grain(k,bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1],.8);
const r=rng(12);c.strokeStyle='rgba(60,40,30,.6)';c.lineWidth=.35;for(let i=0;i<160;i++){const x=18+r()*30,y=-45+r()*50;c.beginPath();c.moveTo(x,y);c.lineTo(x+3,y+2);c.stroke();}
const ear=[[-12,-24],[6,-40],[24,-30],[30,0],[24,26],[10,44],[-4,40],[-8,22],[-16,8],[-18,-6]];
fillP(ear,lin(-18,0,30,0,[[0,SKIN.dark],[.45,SKIN.lite],[1,SKIN.dark]]),SH(.4),.7,true);
shade([[-6,-26],[8,-33],[22,-24],[26,0],[20,22],[10,36]],SH(.28),2.4);shade([[-4,-18],[10,-20],[16,-4],[12,14],[2,24]],HL(.45),2.8);
ell(2,4,9,12,10,rad(0,5,12,[[0,'#6e3a28'],[.7,'#b0705a'],[1,'rgba(190,130,105,.1)']]));ell(-5,6,3.8,4.8,0,rad(-5,6,4.8,[[0,'#1c0c08'],[.7,'#5a2c1e'],[1,'rgba(120,70,50,.2)']]));
fillP([[-14,0],[-10,4],[-11,12],[-15,13],[-17,6]],SKIN.base,SH(.35),.4,true);ell(6,38,6,5,0,HL(.25));
};
const HAND_OUT=[[-30,70],[-36,20],[-40,5],[-62,-40],[-56,-55],[-46,-42],[-30,-22],[-28.5,-32],[-28.5,-104],[-22,-113],[-15.5,-104],[-15.5,-36],[-11,-36],[-11,-116],[-4,-125],[3,-116],[3,-36],[7.5,-36],[7.5,-106],[14,-115],[20.5,-106],[20.5,-34],[24.5,-32],[24.5,-86],[30,-93],[35.5,-86],[35.5,-20],[38,10],[32,70]];
const HANDJ={mcp:[[-22,-32],[-4,-32],[14,-32],[30,-30]],pip:[[-22,-74],[-4,-82],[14,-76],[30,-62]]};
const TEETH=(()=>{const t=[];[[2.6,-20.4,5.2,5.6,'1'],[7.3,-18.6,5.6,6,'2'],[11.6,-15,6.6,7.4,'3'],[15,-10.4,7,7.8,'4'],[17.4,-4.9,7,8,'5'],[19.3,2.4,10.8,10.2,'6'],[20.5,12.4,10.2,9.8,'7']].forEach(([x,y,w,h,n])=>{[1,-1].forEach(s=>{t.push({x:s*x,y,w,h,n:(s<0?'4':'3')+n,a:Math.atan2(s>0?1:-1,0)});});});return t;})();
function tooth(tt,k){const c=CX;c.save();c.translate(tt.x,tt.y);const ang=Math.atan2(tt.y+26,tt.x)-PI/2;c.rotate(ang);const w=tt.w,h=tt.h,post=Number(tt.n[1])>=4;
const pts=arc(0,0,w/2,h/2,0,360,24).map(([x,y],i)=>[x*(1+.05*Math.cos(i*4*D2R*15)),y]);fillP(pts,rad(-w*.15,-h*.2,Math.max(w,h)*.7,[[0,'#fffdf6'],[.7,'#efe7d4'],[1,'#c9bc9e']]),'rgba(120,105,80,.6)',.14,true);
if(post){strokeP([[-w*.38,0],[-w*.1,-h*.06],[w*.12,h*.05],[w*.38,0]],'rgba(120,96,60,.55)',.16,true);if(Number(tt.n[1])>=6){strokeP([[-w*.05,0],[-w*.08,h*.42]],'rgba(120,96,60,.5)',.13);strokeP([[w*.25,0],[w*.3,h*.38]],'rgba(120,96,60,.45)',.12);strokeP([[0,0],[0,-h*.42]],'rgba(120,96,60,.45)',.12);}}
else strokeP([[-w*.35,-h*.1],[w*.35,-h*.1]],WH(.6),.2);c.restore();}
R.mouth=X=>{
const{c,k,bb,D,lab}=X;
if(D.rv&&D.rv.molar){c.fillStyle='#b5615a';c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);ell(-12,0,6,6.2,0,'#efe7d4','rgba(120,105,80,.6)',.1);ell(12,0,6,6.2,0,'#efe7d4','rgba(120,105,80,.6)',.1);
const crown=arc(0,0,5.6,5.3,0,360,40).map(([x,y],i)=>[x*(1+.04*Math.sin(i*.9)),y]);fillP(crown,rad(-1,-1,7,[[0,'#fffbef'],[.75,'#eee4cf'],[1,'#c4b593']]),'rgba(120,105,80,.7)',.1,true);
[[-3,2.6],[1.2,2.9],[4.2,1.3],[-2.6,-2.8],[2.6,-2.6]].forEach(([x,y])=>ell(x,y,1.8,1.6,0,rad(x-.4,y-.4,2,[[0,WH(.7)],[1,WH(0)]])));
strokeP([[-4.4,.2],[-1.6,-.2],[.8,.3],[3.2,-.2],[4.6,.4]],'rgba(110,84,50,.75)',.16,true);strokeP([[-.6,.2],[-.8,4.6]],'rgba(110,84,50,.65)',.12,true);strokeP([[2.8,.1],[3.4,3.8]],'rgba(110,84,50,.6)',.11,true);strokeP([[.2,-.1],[.2,-4.8]],'rgba(110,84,50,.65)',.12,true);
[[.2,0],[-3.4,0],[3.8,.1]].forEach(([x,y])=>ell(x,y,.32,.28,0,'#5c4426'));lab(0,-6.4,L2('舌側|lingual'),{s:10});lab(0,6.6,L2('頰側|buccal'),{s:10});lab(-6.4,0,L2('近心|mesial'),{s:10,a:'right'});return;}
c.fillStyle='#5a1e1e';c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);ell(0,-2,33,34,0,'#c86e66');ell(0,10,14,17,0,rad(0,6,18,[[0,'#e48f8a'],[.8,'#c96a66'],[1,'#a5504c']]));shade([[0,-6],[0,22]],'rgba(120,40,40,.3)',.8);
strokeP(arc(0,14,21,36,197,343,40),'#e79a92',9,true);TEETH.forEach(tt=>tooth(tt,k));
if(D.rv&&D.rv.labels)TEETH.forEach(tt=>{if(/[67]$/.test(tt.n))lab(tt.x*1.33,tt.y+1,tt.n,{s:10,col:'#ffe'});});
};
R.airway=X=>{
const{c,k,bb,lab}=X;sheet(X,'#cbd6dc');
const outer=[[-95,-38],[-70,-46],[-56,-40],[-48,-30],[-30,-36],[10,-34],[40,-26],[95,-24],[95,52],[-95,52]];fillP(outer,lin(0,-40,0,50,[[0,SKIN.base],[1,SKIN.dark]]),SH(.4),.6,true);
fillP([[-92,34],[95,30],[95,52],[-95,52]],'#e2dcc8','rgba(120,110,90,.6)',.4);for(let x=-20;x<95;x+=14)ell(x,39,6,4.5,0,'#ece6d3','rgba(120,110,90,.5)',.3);
fillP([[-58,-30],[-46,-24],[-20,-18],[10,-14],[30,-8],[95,-10],[95,30],[-92,30],[-80,0]],'#a8433f',null,0,true);
fillP([[-48,-22],[-30,-20],[-6,-10],[4,4],[-4,24],[-40,24],[-60,6]],rad(-26,0,34,[[0,'#e48f8a'],[1,'#b9605b']]),'rgba(100,30,30,.4)',.4,true);
fillP([[8,-14],[14,-22],[17,-18],[14,-6],[16,2],[12,2]],'#f0b2a7','rgba(110,40,40,.6)',.3,true);
fillP([[22,-8],[95,-12],[95,4],[26,6]],'#56181a');for(let x=30;x<95;x+=7)strokeP([[x,-9],[x+1,5]],'rgba(230,200,190,.35)',1.6);
strokeP([[22,-5],[28,-1]],'#f6f1ea',1.2);fillP([[24,8],[95,8],[95,22],[28,20]],'#7a2f2b');strokeP([[24,6],[32,8]],'#5b1e1c',1.2);
fillP([[-58,-36],[-52,-32],[-50,-22],[-56,-22]],'#f3ecdc','rgba(110,100,80,.6)',.3);fillP([[-60,20],[-52,18],[-50,10],[-58,8]],'#f3ecdc','rgba(110,100,80,.6)',.3);
lab(-56,-44,L2('上門齒|upper incisors'),{s:10});lab(-25,8,L2('舌|tongue'),{s:10,col:'#fff'});lab(15,-27,L2('會厭|epiglottis'),{s:10});lab(60,-2,L2('氣管|trachea'),{s:10,col:'#fff'});lab(60,16,L2('食道|oesophagus'),{s:10,col:'#fff'});
};
R.limb=X=>{
const{c,k,bb,D,lab}=X,v=(D.rv&&D.rv.v)||'thigh';sheet(X);
if(v==='thigh'){const o=[[-160,-48],[160,-40],[160,40],[-160,48]];skinFill(o,k,[-160,-50,160,50],false);ell(-95,0,18,22,0,HL(.3));ell(100,4,16,18,0,HL(.3));shade([[-95,-4],[0,-2],[100,2]],SH(.06),10);lab(-95,-30,L2('大轉子|greater trochanter'),{s:10});lab(100,-26,L2('股骨外髁|lateral condyle'),{s:10});}
else if(v==='knee'){const o=[[-62,-150],[62,-150],[58,-40],[62,10],[52,70],[44,150],[-44,150],[-52,70],[-62,10],[-58,-40]];skinFill(o,k,[-64,-150,64,150]);ell(0,-5,22,26,0,rad(-4,-10,26,[[0,HL(.5)],[1,HL(0)]]));shade(arc(0,-5,22,26,200,340,16),SH(.2),2);
fillP([[-8,20],[8,20],[7,56],[-7,56]],HL(.22));shade([[-9,20],[-8,56]],SH(.16),1.6);shade([[9,20],[8,56]],SH(.16),1.6);ell(0,60,9,6,0,HL(.35));shade([[-52,30],[-12,32]],SH(.08),1.5);shade([[12,32],[52,30]],SH(.08),1.5);
lab(-48,-100,L2('外側|lateral'),{s:10});lab(48,-100,L2('內側|medial'),{s:10});}
else if(v==='kneelat'){const thigh=[[-170,-60],[0,-22],[12,18],[-170,10]],leg=[[0,-18],[140,44],[134,70],[-6,20]];skinFill(thigh,k,[-170,-60,12,18],false);skinFill(leg,k,[-6,-18,140,70],false);ell(-150,-26,12,10,0,HL(.35));ell(0,0,9,8,0,HL(.35));ell(128,56,8,7,0,HL(.35));}
else if(v==='forearm'){const o=[[-170,-36],[170,-28],[170,28],[-170,36]];skinFill(o,k,[-170,-36,170,36],false);shade([[130,-27],[130,27]],SH(.2),1);shade([[138,-27],[138,27]],SH(.14),1);
const vv=D.rv.avf;strokeP([[-170,-14],[-60,-12],[40,-16],[120,-12],[150,-9]],vv?'rgba(110,70,120,.55)':'rgba(70,90,150,.32)',vv?7:3.5,true);strokeP([[-170,16],[0,18],[150,14]],'rgba(70,90,150,.25)',3,true);
if(vv){ell(40,-16,9,6,0,'rgba(120,70,120,.35)');ell(128,-11,4,3,0,'rgba(120,60,80,.5)');lab(128,-24,L2('吻合口|anastomosis'),{s:10});}
if(D.rv.iv){fillP([[-20,-14],[22,-14],[22,14],[-20,14]],'rgba(235,245,250,.55)','rgba(150,170,180,.8)',.4);strokeP([[-6,0],[30,2]],'#e8f1f4',2.2);fillP([[30,-5],[44,-5],[44,7],[30,7]],'#f0c93a','#9a7a16',.3);ell(-6,0,1.2,1.2,0,'rgba(160,40,40,.6)');}
}
else if(v==='hand'||v==='hands'){const one=(ox,palm)=>{const o=HAND_OUT.map(([x,y])=>[ox+x,y]);skinFill(o,k,[ox-64,-126,ox+40,70]);
if(palm){shade([[ox-32,-12],[ox+34,-22]],SH(.22),1);shade([[ox-30,4],[ox+8,-12]],SH(.2),1);shade([[ox-26,40],[ox-30,0],[ox-38,-20]],SH(.18),1);}else HANDJ.mcp.concat(HANDJ.pip).forEach(([x,y],i)=>ell(ox+x,y,i<4?5.4:4.2,i<4?4.2:3.4,0,i<4?HL(.45):SH(.16)));};
if(v==='hand')one(0,false);else{one(-60,true);one(60,false);lab(-60,80,L2('左手（掌面）|left hand (palm)'),{s:10});lab(60,80,L2('右手（手背）|right hand (back)'),{s:10});}}
};
const NERVE_MICRO=[[-10,6.8],[-6,5.8],[-2.5,4.4],[1,2.9],[4,1.4],[7,-.4],[10.5,-2.2]];
const PLANE_MICRO=NERVE_MICRO.map((p,i,a)=>{const q=a[Math.min(i+1,a.length-1)],o=a[Math.max(i-1,0)],dx=q[0]-o[0],dy=q[1]-o[1],L=hyp(dx,dy)||1;return[p[0]+dy/L*1.15,p[1]-dx/L*1.15];}).slice(1,6);
R.micro=X=>{
const{c,k,bb}=X;c.fillStyle='#3a1914';c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);
for(let i=-14;i<=14;i++)strokeP([[bb[0],i*1.15],[0,i*1.15+1.6],[bb[2],i*1.15-.4]],i%2?'#b98576':'#a4706a',1.05,true);
const tum=PLANE_MICRO.concat(arc(-3.4,-2.6,6.8,6.4,-35,-225,26).slice(1));fillP(tum,rad(-4,-4,8,[[0,'#e1cfa0'],[.7,'#c2aa78'],[1,'#9c845c']]),'rgba(90,70,40,.6)',.08,true);
const r=rng(31);for(let i=0;i<10;i++){const a=r()*2*PI,x=-4+Math.cos(a)*3,y=-3+Math.sin(a)*3;strokeP([[x,y],[x+1.2,y+.6],[x+2,y+.2]],'rgba(170,40,40,.6)',.06,true);}
tube(NERVE_MICRO,1.25,'#f1e7c6','#b9a675',WH(.6));for(let i=0;i<3;i++)strokeP(NERVE_MICRO.map(p=>[p[0],p[1]-.35+i*.35]),'rgba(160,140,90,.35)',.04,true);
tube([[10.5,-7.5],[6,-5],[3,-4.2],[.5,-5.6],[-2.5,-7.6]],.82,'#c4332e','#7e1714','rgba(255,190,180,.7)');
c.save();c.globalAlpha=.18;strokeP(PLANE_MICRO,'#ffffff',.5,true);c.restore();
};
R.anast=X=>{
const{c,k,bb,D}=X;c.fillStyle='#1f5fa6';c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);grain(k,bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1],.4);
[-1,1].forEach(s=>{tube([[s*7.5,0],[s*.45,0]],2.1,'#c96a62','#8e3a34','rgba(255,215,205,.6)',false);ell(s*.45,0,.26,1.02,0,'#e9b2a8','#8e3a34',.04);ell(s*.45,0,.14,.78,0,'#5a1210');
fillP([[s*4,-2.2],[s*5.2,-2.2],[s*5.2,2.2],[s*4,2.2]],steel(-2.2,2.2),'#3c454c',.05);});
strokeP([[-4.6,2.6],[-4.6,3.6],[4.6,3.6],[4.6,2.6]],'#aeb8bf',.35);
};
R.spineAx=X=>{
const{c,bb,lab}=X;c.fillStyle='#2d1a18';c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);
both(s=>{ell(s*25,-30,17,14,s*10,'#8c3b33');ell(s*30,38,10,18,s*-15,'#7d352f');});
const bone=lin(0,-40,0,50,[[0,'#efe5cc'],[1,'#d9c9a2']]);
ell(0,32,24,17,0,bone,'#a89466',.8);const r=rng(5);for(let i=0;i<60;i++)ell(-20+r()*40,20+r()*24,.7,.5,0,'rgba(160,130,80,.35)');
both(s=>{poly([s*8,18,s*18,16,s*23,-5,s*13,-7],bone,'#a89466',.6);poly([s*20,-6,s*41,-11,s*41,-16,s*20,-14],bone,'#a89466',.5);ell(s*18,-18,4.2,3.4,0,bone,'#a89466',.4);});
poly([13,-6,20,-14,6,-22,3,-42,-3,-42,-6,-22,-20,-14,-13,-6],bone,'#a89466',.6);
ell(0,4,10,8.5,0,'#4b5b78','#2e3a52',.5);const r2=rng(9);for(let i=0;i<14;i++)ell(-6+r2()*12,2+r2()*6,.9,.9,0,'#e8d27a');
both(s=>{ell(s*21.5,7,3.6,2.8,0,'#e8cf6a','#9b8530',.3);});
ell(-18,58,10,10,0,rad(-20,55,11,[[0,'#e05a4c'],[1,'#8e2219']]),'#5a120c',.4);ell(19,58,12,8,0,rad(18,56,12,[[0,'#6f7fc0'],[1,'#2f3c78']]),'#1c2550',.4);
lab(0,-48,L2('後側（術者側）|posterior (surgeon side)'),{s:10,col:'#fff'});lab(-18,74,L2('主動脈|aorta'),{s:10,col:'#fff'});lab(19,74,L2('下腔靜脈|IVC'),{s:10,col:'#fff'});lab(0,4,L2('硬膜囊|dural sac'),{s:10,col:'#fff'});
};
R.bone=X=>{
const{c,k,bb,lab}=X;c.fillStyle=lin(0,bb[1],0,bb[3],[[0,'#8c3b33'],[.5,'#6d2a25'],[1,'#8c3b33']]);c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);
for(let y=bb[1];y<bb[3];y+=1.6)strokeP([[bb[0],y],[bb[2],y+.8]],'rgba(40,10,8,.18)',.3);
c.fillStyle='#f0e6cc';c.fillRect(bb[0],-12,bb[2]-bb[0],24);c.fillStyle=lin(0,-7,0,7,[[0,'#d9b45e'],[.5,'#e7c879'],[1,'#d9b45e']]);c.fillRect(bb[0],-7,bb[2]-bb[0],14);
const r=rng(7);for(let i=0;i<110;i++)ell(bb[0]+r()*(bb[2]-bb[0]),-6+r()*12,.8,.5,r()*180,'rgba(160,110,40,.35)');
strokeP([[2,-12],[6,0],[10,12]],'#4a2a1a',.45);tube([[bb[0],21],[bb[2],20]],3,'#b8352e','#6e1612','rgba(255,190,180,.6)',false);tube([[bb[0],25],[bb[2],25.5]],2.2,'#f0e1a8','#a8955a',null,false);
c.fillStyle=steel(-16,-12);c.fillRect(-46,-16,94,4);c.strokeStyle='#3c454c';c.lineWidth=.3;c.strokeRect(-46,-16,94,4);
[-36,-22,-8,10,24,38].forEach(x=>{ell(x,-14,2.6,1.6,0,'#2a2f33');if(x!==24){ell(x,-15.4,3,1.2,0,steel(-17,-14),'#3c454c',.2);c.fillStyle='rgba(150,160,168,.75)';c.fillRect(x-1.2,-14,2.4,26);}});
lab(24,-22,L2('目標螺孔|target hole'),{s:10,col:'#fff'});lab(-30,23,L2('神經血管束|neurovascular bundle'),{s:10,col:'#fff'});
};
R.pelvisAP=X=>{
const{c,k,bb,lab}=X;c.fillStyle='#0d0f10';c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);
const b=lin(-80,-80,60,60,[[0,'rgba(210,215,215,.85)'],[1,'rgba(160,165,168,.85)']]);
fillP([[-30,-10],[-70,-60],[-60,-95],[10,-90],[40,-50],[42,10],[30,18],[20,0]],b,null,0,true);fillP([[14,20],[60,30],[70,44],[40,46],[18,40]],b,null,0,true);fillP([[-4,30],[20,34],[30,66],[10,80],[-14,62]],b,null,0,true);
ell(18,46,9,13,0,'#0d0f10');strokeP(arc(16,20,4,5,0,180,12),'rgba(250,250,250,.9)',1.4);fillP([[-30,70],[-48,60],[-60,110],[-40,120]],b,null,0,true);
c.save();c.beginPath();c.arc(0,0,27,-.2*PI,.8*PI);c.lineTo(0,0);c.closePath();c.fillStyle='rgba(40,42,44,.9)';c.fill();c.restore();strokeP(arc(0,0,27,27,-36,144,30),'rgba(250,250,250,.85)',1.2);
strokeP([[-40,24],[70,24]],'rgba(120,220,255,.6)',.5,false,[3,2]);lab(16,32,L2('淚滴|teardrop'),{s:10,col:'#cfe'});lab(55,20,L2('兩淚滴連線|inter-teardrop line'),{s:10,col:'#cfe'});
};
const RIBY=n=>-98+22*(n-2);
R.lat=X=>{
const{c,k,bb,lab}=X;sheet(X);const o=[[-120,-150],[120,-150],[130,120],[-130,120]];skinFill(o,k,[-130,-150,130,120],false);
for(let n=2;n<=9;n++){const y=RIBY(n);shade([[-120,y+26.4],[0,y],[120,y-26.4]],HL(.22),9);shade([[-120,y+33],[0,y+6.6],[120,y-19.8]].map(p=>[p[0],p[1]-6]),SH(.08),2);}
shade([[-38,-130],[-48,-60],[-62,10]],SH(.28),3);shade([[42,-125],[48,-60],[58,15]],SH(.28),3);
ell(0,-138,22,10,0,'rgba(60,40,30,.25)');ell(-96,-21,5,5,0,'#9c5c48');lab(-52,26,L2('胸大肌外緣|pectoralis edge'),{s:10});lab(60,26,L2('闊背肌前緣|latissimus edge'),{s:10});lab(-96,-32,L2('乳頭線|nipple line'),{s:10});lab(0,-146,L2('腋窩|axilla'),{s:10});
};
R.slice=X=>{
const{c,k,bb,D,lab}=X,v=(D.rv&&D.rv.v)||'hn';c.fillStyle='#000';c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);
const g=(x)=>`rgb(${x},${x},${x})`;
if(v==='hn'){ell(0,0,62,52,0,g(70));ell(0,0,57,47,0,g(112));both(s=>{ell(s*45,8,8,14,0,g(128));ell(s*32,16,5,11,s*20,g(100));ell(s*18,-2,2.6,2.6,0,g(200));ell(s*23,2,3.4,3,0,g(150));});
strokeP(arc(0,-14,36,32,200,340,24),g(235),5);ell(0,-12,9,7,0,'#000');ell(0,20,11,9,0,g(225));ell(0,33,8,7,0,g(200));ell(0,33,5,4.6,0,g(105));strokeP(arc(0,40,9,6,20,160,10),g(225),2.4);
const t=ring(-20,0,7,30).map(([x,y],i)=>[-20+(x+20)*(1+.12*Math.sin(i*1.3)),y*(1+.1*Math.cos(i*1.9))]);X.lab(-20,-15,'GTV',{s:10,col:'#fd0',bg:'rgba(0,0,0,.6)'});fillP(t,g(150),g(185),.8,true);}
else if(v==='liver'){ell(0,0,150,110,0,g(60));ell(0,0,142,102,0,g(98));fillP([[-138,-30],[-90,-90],[-10,-95],[30,-60],[10,10],[-60,70],[-130,40]],g(132),null,0,true);ell(95,10,30,45,0,g(120));ell(0,62,18,16,0,g(230));ell(-10,38,7,7,0,g(215));ell(14,40,9,7,0,g(140));both(s=>ell(s*55,55,18,26,s*30,g(150)));ell(40,-30,28,20,0,g(30));ell(-55,-10,16,10,20,g(78),g(110),.8);}
else{ell(0,0,175,120,0,g(60));ell(0,0,166,112,0,g(105));both(s=>{ell(s*72,0,24,24,0,g(235));ell(s*72,0,16,16,0,g(200));});ell(0,-34,26,18,0,g(70));ell(0,0,18,15,0,g(128));ell(0,30,13,11,0,g(118));ell(2,30,5,4,0,'#000');ell(0,75,40,12,0,g(230));}
lab(bb[0]+4,bb[1]+4,L2('模擬 CT 斷層（非真實影像）|simulated CT slice (not a real image)'),{s:10,a:'left',col:'#9cf',screen:1});
};
const TREES={
coronary:{segs:[{id:'LM',p:[[-46,-34],[-36,-27],[-28,-23]],r:2.3},{id:'LAD',p:[[-28,-23],[-18,-12],[-8,-2],[2,9],[12,22],[20,36],[24,44]],r:1.6,steer:1},{id:'LCx',p:[[-28,-23],[-36,-8],[-40,10],[-38,28],[-32,42]],r:1.5,steer:1,side:1},
{id:'D1',p:[[-10,-4],[2,-14],[16,-16],[26,-12]],r:1,steer:1,side:1},{id:'D2',p:[[8,16],[22,10],[32,12]],r:.9,steer:1,side:1},{id:'OM',p:[[-39,6],[-26,14],[-18,26]],r:.9,side:1}],entry:[-46,-34],target:[21,38],lesion:[0,6.5],bg:'chest'},
iliac:{segs:[{id:'AO',p:[[0,-62],[0,-25]],r:8},{id:'RCIA',p:[[0,-25],[-14,-10],[-25,5]],r:4.6},{id:'REIA',p:[[-25,5],[-32,25],[-36,44],[-38,62]],r:4},{id:'RIIA',p:[[-25,5],[-17,20],[-13,34]],r:3,side:1},
{id:'LCIA',p:[[0,-25],[14,-10],[25,5]],r:4.6,steer:1},{id:'LEIA',p:[[25,5],[32,25],[36,44],[38,62]],r:4,steer:1},{id:'LIIA',p:[[25,5],[17,20],[13,34]],r:3,steer:1,side:1}],entry:[-38,61],target:[36.5,48],lesion:[34,36],bg:'pelvis'},
neuro:{segs:[{id:'ICA',p:[[-6,46],[-4,30],[-8,18],[-2,8],[4,12],[6,2],[2,-6]],r:2},{id:'M1',p:[[2,-6],[14,-10],[26,-12]],r:1.5,steer:1},{id:'A1',p:[[2,-6],[-6,-16],[-12,-28]],r:1.1,steer:1,side:1},
{id:'M2s',p:[[26,-12],[34,-22],[42,-30]],r:1.1,steer:1},{id:'M2i',p:[[26,-12],[36,-8],[44,-2]],r:1.1,steer:1,side:1}],entry:[-6,46],target:[38,-26],lesion:[30,-16],bg:'skull'}
};
R.vessels=X=>{
const{c,k,bb,D,S,lab}=X,tr=TREES[D.rv.tree];c.fillStyle=rad(0,0,90,[[0,'#a9adaf'],[1,'#5f6365']]);c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);grain(k,bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1],1);
c.save();c.globalAlpha=.22;if(tr.bg==='pelvis'){strokeP([[-70,-40],[-40,-20],[-20,20]],'#fff',8,true);strokeP([[70,-40],[40,-20],[20,20]],'#fff',8,true);for(let y=-60;y<-20;y+=12)ell(0,y,14,5,0,'#fff');}else if(tr.bg==='chest'){for(let i=0;i<6;i++)strokeP([[-60,-40+i*16],[0,-30+i*16],[60,-44+i*16]],'#fff',3,true);for(let y=-45;y<45;y+=14)ell(40,y,7,5,0,'#fff');}else{ell(0,0,52,44,0,null,'#fff',3);}c.restore();
const vis=S.contrast>0?.35+.55*S.contrast:.32;c.save();c.globalAlpha=vis;tr.segs.forEach(sg=>{strokeP(sg.p,'#1e2224',sg.r*2,true);});c.restore();
if(tr.lesion){ell(tr.lesion[0],tr.lesion[1],2.4,2.4,0,'rgba(170,175,178,.75)');}
if(D.rv.tree==='neuro'){ell(tr.lesion[0],tr.lesion[1],3,2,-30,'rgba(40,20,20,.65)');lab(tr.lesion[0],tr.lesion[1]-5,L2('血栓|clot'),{s:10,col:'#fdd'});}
else lab(tr.lesion[0]+6,tr.lesion[1],L2('狹窄|stenosis'),{s:10,col:'#fdd',a:'left'});
fillP([[tr.entry[0]-2.4,tr.entry[1]-1],[tr.entry[0]+2.4,tr.entry[1]-1],[tr.entry[0]+3,tr.entry[1]+10],[tr.entry[0]-3,tr.entry[1]+10]],'rgba(30,30,30,.85)');lab(tr.entry[0],tr.entry[1]+13,L2('鞘管|sheath'),{s:10,col:'#fff'});
lab(bb[0]+4,bb[1]+4,L2('模擬透視路徑圖（非真實影像）|simulated fluoroscopic roadmap (not a real image)'),{s:10,a:'left',col:'#fff',screen:1});
};
R.lap=X=>{
const{c,k,bb,D,lab}=X,v=D.rv.v;c.fillStyle='#2a0f0c';c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);
const tis=(pts,a,b,s)=>fillP(pts,rad(pts[0][0]*.3,pts[0][1]*.3,90,[[0,a],[1,b]]),s||'rgba(60,20,15,.4)',.4,true);
const sheen=(x,y,r)=>ell(x,y,r,r*.45,-20,WH(.22));
if(v==='chole'){tis([[-90,-70],[90,-70],[90,-18],[40,-10],[10,-16],[-30,-6],[-90,-2]],'#9a3f2e','#5e1f16');sheen(-30,-40,18);sheen(40,-45,12);
fillP([[34,-38],[44,-22],[36,-4],[14,6],[-4,10],[-8,4],[8,-10],[22,-30]],rad(30,-22,30,[[0,'#9bb07a'],[1,'#5f7240']]),'rgba(40,50,20,.5)',.4,true);sheen(30,-24,6);
tis([[30,30],[90,20],[90,70],[20,70]],'#e7c35a','#b8902e');tis([[-90,34],[-20,40],[30,58],[30,70],[-90,70]],'#d79a8c','#9c5a4d');}
else if(v==='pelvis'){tis([[-90,-70],[90,-70],[90,-30],[-90,-30]],'#d9a092','#a5675a');ell(0,4,26,19,0,rad(-6,-4,28,[[0,'#f0b0a0'],[1,'#c67462']]),'rgba(90,30,20,.4)',.5);sheen(-8,-4,8);both(s=>{ell(s*42,10,9,6,s*15,rad(s*40,8,10,[[0,'#f7ece0'],[1,'#d6c2ae']]),'rgba(90,60,40,.4)',.3);strokeP([[s*22,-4],[s*36,-6],[s*50,2],[s*54,14]],'#e79c8a',2.6,true);strokeP([[s*20,-10],[s*50,-26],[s*80,-34]],'#d48a78',3,true);});tis([[-90,50],[-30,44],[-10,70],[-90,70]],'#c98c7c','#8e4f42');}
else if(v==='kidney'){tis([[-90,-70],[90,-70],[90,70],[-90,70]],'#e8c26a','#b38a35');ell(8,-4,28,44,-12,rad(0,-12,46,[[0,'#a8483a'],[1,'#6e2219']]),'rgba(60,15,10,.5)',.5);sheen(0,-20,10);tis([[-90,-40],[-60,-50],[-50,70],[-90,70]],'#d79a8c','#9c5a4d');fillP([[30,40],[90,30],[90,70],[20,70]],'#a5524a');}
else if(v==='appendix'){tis([[-90,-10],[-30,-30],[-10,10],[-30,60],[-90,70]],'#d8a698','#a06a5c');strokeP([[-70,-6],[-36,-2],[-6,12]],'rgba(250,240,230,.6)',2.4,true);tis([[-10,10],[40,0],[70,20],[40,46],[6,34]],'#f0c868','#c09038');tube([[-4,12],[12,20],[26,30],[34,40]],7,'#d0473c','#8a2018','rgba(255,200,190,.5)');tis([[10,-70],[90,-70],[90,-30],[40,-24],[0,-40]],'#e0a99c','#a86c5e');}
else{tis([[-90,-70],[90,-70],[90,20],[-90,30]],'#d9a3a0','#a06a68');const r=rng(4);for(let i=0;i<70;i++)ell(-85+r()*170,-65+r()*85,.6+r(),.5+r()*.8,0,'rgba(30,25,25,.45)');strokeP([[-90,-10],[-20,-20],[40,-8],[90,-18]],'rgba(90,40,40,.6)',1.5,true);tis([[-90,34],[90,26],[90,70],[-90,70]],'#b06a5c','#7e3f34');tis([[-90,-70],[-60,-70],[-56,30],[-90,34]],'#c48c80','#8a5046');}
};
R.bench=X=>{
const{c,k,bb,D,S,lab}=X,v=D.rv.v;c.fillStyle=lin(bb[0],bb[1],bb[2],bb[3],[[0,'#c9cfd2'],[.5,'#e9edef'],[1,'#b7bec2']]);c.fillRect(bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);grain(k,bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1],.5);
const paper=(x0,y0,w,h,rot)=>{c.save();c.translate(x0,y0);c.rotate((rot||0)*D2R);c.shadowColor='rgba(0,0,0,.25)';c.shadowBlur=6;c.fillStyle='#fbfaf6';c.fillRect(-w/2,-h/2,w,h);c.restore();};
const t=(x,y,s,o)=>lab(x,y,s,Object.assign({s:11,col:'#223'},o||{}));
if(v==='board'){paper(0,-8,112,76);c.fillStyle='#1e6f6a';c.fillRect(-56,-46,112,11);t(0,-40.5,L2('手術安全查核 · 劃刀前暫停（Time-out）|Surgical safety checklist · Time-out before incision'),{col:'#fff',s:11});
TIMEOUT_ITEMS.forEach((it,i)=>{const y=-26+11*i;c.strokeStyle='#33464b';c.lineWidth=.5;c.strokeRect(-49,y-3.2,6.4,6.4);t(-39,y,L2(it),{a:'left'});});
c.save();c.translate(-62,52);c.rotate(-6*D2R);c.fillStyle='#fdfdfd';c.fillRect(-27,-5,54,10);c.strokeStyle='#9aa';c.lineWidth=.3;c.strokeRect(-27,-5,54,10);for(let x=-2;x<22;x+=1.3){c.fillStyle=(x*7|0)%3?'#222':'#fff';c.fillRect(x,-3.5,.7,7);}c.restore();t(-74,52,L2('虛擬病人 甲 · ID 0007|Virtual patient A · ID 0007'),{s:9});
paper(58,50,46,38,4);t(58,38,L2('手術同意書|Consent form'),{s:10});t(52,46,L2('病人：虛擬病人 甲|Patient: virtual patient A'),{s:9});t(52,53,'ID 0007',{s:9});strokeP([[44,62],[50,59],[56,63],[64,58]],'#25408f',.4,true);}
else if(v==='meds'){paper(-56,30,48,56,-3);t(-56,8,L2('醫囑（虛擬）|Order (virtual)'),{s:10});t(-56,18,L2('病人：甲 · ID 0007|Patient A · ID 0007'),{s:9});t(-56,26,L2('藥品：A（一般劑型）|Drug: A (standard form)'),{s:9});t(-56,34,L2('途徑／時間：依醫囑|Route / time: per order'),{s:9});t(-56,46,L2('本練習不含劑量|No dose in this exercise'),{s:8,col:'#a33'});
c.save();c.translate(-50,-34);c.fillStyle='#fdfdfd';c.fillRect(-28,-5,56,10);c.strokeStyle='#9aa';c.lineWidth=.3;c.strokeRect(-28,-5,56,10);for(let x=2;x<26;x+=1.3){c.fillStyle=(x*7|0)%3?'#222':'#fff';c.fillRect(x,-3.5,.7,7);}c.restore();t(-58,-34,L2('腕帶 甲|Wristband A'),{s:9});
VIALS.forEach((vl,i)=>{if(S.carry&&S.carry.id===i)return;vial(vl.p[0],vl.p[1],vl.col);t(vl.p[0],vl.p[1]+17,L2(vl.n),{s:9});});
paper(48,42,52,36,0);t(48,28,L2('五對核對|Five rights'),{s:10});RIGHTS.forEach((r,i)=>{c.strokeStyle='#33464b';c.lineWidth=.4;c.strokeRect(26,33+i*5.6-2,4,4);t(32,33+i*5.6,L2(r),{s:8,a:'left'});});}
else if(v==='room'){c.fillStyle='#f3efe4';c.fillRect(-90,-60,180,120);c.strokeStyle='#3a3f44';c.lineWidth=2.2;c.strokeRect(-90,-60,180,120);c.fillStyle='#f3efe4';c.fillRect(70,-61.5,18,3);strokeP(arc(70,-60,18,18,0,90,12),'#7a8088',.4,true,[1.5,1]);t(79,-66,L2('門（出口）|door (exit)'),{s:10});
c.fillStyle='#8b6b4a';c.fillRect(-14,-12,28,18);[[-30,-2],[30,-20],[-30,34]].forEach(([x,y],i)=>{c.fillStyle='#5d7c8a';c.fillRect(x-8,y-8,16,16);});ell(-30,-2,6,6,0,'#e2b896');t(-30,14,L2('病人|patient'),{s:10});
strokeP([[4,-2],[12,2]],'#666',1.2);ell(12.5,2.2,1,1,0,'#c33');t(8,-6,L2('剪刀／筆|scissors / pen'),{s:9});ell(86,10,2.4,2.4,0,'#d22');t(80,18,L2('警鈴|alarm'),{s:9});t(0,66,L2('會談室平面圖（1:20）|interview room floor plan (1:20)'),{s:10});}
else if(v==='mse'){paper(0,0,150,104);ell(-30,-22,13,15,0,'#e2b896','#a07050',.4);fillP([[-52,10],[-8,10],[-2,46],[-58,46]],'#6a7f9a',null,0,true);strokeP([[-36,-25],[-33,-25]],'#333',.8);strokeP([[-27,-25],[-24,-25]],'#333',.8);strokeP(arc(-30,-14,4,2,200,340,8),'#844',.6);
MSE.forEach(m=>{ell(m.p[0],m.p[1],6.5,6.5,0,'rgba(40,110,150,.12)','rgba(40,110,150,.6)',.4);t(m.p[0],m.p[1]+10,L2(m.n),{s:9});});}
else if(v==='pedigree'){paper(0,0,150,100);c.strokeStyle='rgba(80,120,160,.15)';c.lineWidth=.3;for(let x=-74;x<75;x+=5){c.beginPath();c.moveTo(x,-50);c.lineTo(x,50);c.stroke();}for(let y=-49;y<50;y+=5){c.beginPath();c.moveTo(-75,y);c.lineTo(75,y);c.stroke();}t(-64,-40,'I',{s:11});t(-64,15,'II',{s:11});}
else if(v==='karyo'){paper(0,0,150,100);KARYO.forEach(kk=>{c.strokeStyle='#7a8a96';c.lineWidth=.3;c.setLineDash([1,1]);c.strokeRect(kk.slot[0]-8,kk.slot[1]-12,16,24);c.setLineDash([]);t(kk.slot[0],kk.slot[1]+16,kk.n,{s:10});});KARYO.forEach((kk,i)=>{chrom(kk.slot[0]-3,kk.slot[1],kk.len,kk.cen);if(!S.placed||!S.placed[i]){if(!(S.carry&&S.carry.id===i))chrom(kk.free[0],kk.free[1],kk.len,kk.cen);}else chrom(kk.slot[0]+3,kk.slot[1],kk.len,kk.cen);});}
else if(v==='grossing'){c.fillStyle='#f4f4ef';c.fillRect(-80,-50,120,100);c.strokeStyle='#bbb';c.lineWidth=.4;c.strokeRect(-80,-50,120,100);const sp=lens(-20,0,18,12,0);fillP(sp,rad(-22,-2,20,[[0,'#e9b9a0'],[1,'#c98a6e']]),'#8a5a44',.3,true);ell(-20,0,3.2,2.6,0,'#6a3a2a');strokeP([[-38,0],[-46,-4],[-50,2]],'#222',.3,true);t(-48,-8,L2('長縫線＝外側|long suture = lateral'),{s:8});
c.fillStyle='#2f6fb2';c.fillRect(46,-36,26,30);c.fillStyle='#4d8ad0';c.fillRect(48,-34,22,4);t(59,-40,L2('包埋盒|cassette'),{s:9});paper(60,26,34,30,2);t(60,18,L2('申請單 S-0007|requisition S-0007'),{s:8});t(60,26,L2('部位：皮膚|site: skin'),{s:8});['#1e7a3a','#2a4fb0','#111'].forEach((cl,i)=>ell(-66+i*10,42,3.2,3.2,0,cl,'#333',.3));}
else if(v==='slide'){c.fillStyle='rgba(200,232,238,.85)';c.fillRect(-40,0,76,1.2);c.strokeStyle='rgba(80,120,130,.8)';c.lineWidth=.15;c.strokeRect(-40,0,76,1.2);c.fillStyle='#f0f0f0';c.fillRect(14,-.1,22,1.4);t(25,-4,L2('標籤端|label end'),{s:9});
if(!(S.smear>0))ell(-25,-.6,1.8,.9,0,'#8e1010');else{c.fillStyle=lin(-26,0,-26+S.smear,0,[[0,'rgba(150,20,20,.85)'],[.8,'rgba(190,60,60,.5)'],[1,'rgba(190,60,60,.1)']]);c.fillRect(-26,-.35,S.smear,.4);}
c.fillStyle='#9aa3a8';c.fillRect(-48,1.2,100,3);t(0,10,L2('側視圖：推片角度|side view: spreader angle'),{s:10});}
else if(v==='section'){const L=SECTION;L.forEach(l=>{c.fillStyle=l.col;c.fillRect(-60,l.y0,120,l.y1-l.y0);});const r=rng(3);for(let i=0;i<40;i++)ell(-58+r()*116,-23+r()*10,1.5+r()*1.5,1+r(),0,'rgba(255,240,170,.5)');for(let y=-10;y<9;y+=1.6)strokeP([[-60,y],[60,y+.4]],'rgba(90,20,20,.25)',.3);t(0,-36,L2('體壁截面（教學示意）|body-wall section (teaching schematic)'),{s:10});}
else if(v==='ppe'){paper(0,0,120,110);ell(0,-34,11,13,0,'#e2b896','#a07050',.4);fillP([[-8,-28],[8,-28],[9,-22],[-9,-22]],'#f2f2ee','#888',.3);fillP([[-10,-38],[10,-38],[10,-33],[-10,-33]],'rgba(170,220,240,.6)','#567',.3);fillP([[-20,-18],[20,-18],[26,40],[-26,40]],'#e8f0c8','#8a9a60',.4,true);both(s=>{fillP([[s*20,-16],[s*34,14],[s*30,18],[s*18,-4]],'#e8f0c8','#8a9a60',.3,true);ell(s*33,20,5,6,0,'#6aa0dd','#356',.3);});strokeP([[-6,-22],[-16,-26]],'#888',.5);}
};
const TIMEOUT_ITEMS=[['病人身分（兩種識別）','Patient identity (two identifiers)'],['手術部位與側別已標記','Site & side marked'],['手術名稱與同意一致','Procedure matches consent'],['過敏與預期關鍵事件','Allergies & anticipated critical events'],['必要影像已顯示','Essential imaging displayed'],['器械無菌與清點','Instrument sterility & count']];
const RIGHTS=[['對的病人','right patient'],['對的藥品','right drug'],['對的劑量（由醫囑核對）','right dose (checked vs order)'],['對的途徑','right route'],['對的時間','right time']];
const VIALS=[{p:[8,-24],col:'#3a7bd5',n:['藥品 A','Drug A']},{p:[30,-24],col:'#3a7bd5',n:['藥品 A-XR（外觀相似）','Drug A-XR (look-alike)']},{p:[52,-24],col:'#d5833a',n:['藥品 B','Drug B']}];
function vial(x,y,col){const c=CX;c.save();c.translate(x,y);c.fillStyle='rgba(225,238,244,.9)';c.fillRect(-6,-10,12,22);c.strokeStyle='#7d8c95';c.lineWidth=.3;c.strokeRect(-6,-10,12,22);c.fillStyle=col;c.fillRect(-6.5,-14,13,4.5);c.fillStyle='#fff';c.fillRect(-5,-4,10,9);for(let i=-4;i<4;i+=1.2){c.fillStyle='#222';c.fillRect(i,2,.5,2.4);}c.restore();}
const MSE=[{p:[-30,-42],n:['外觀','appearance']},{p:[-62,18],n:['行為／動作','behaviour']},{p:[6,-34],n:['言語','speech']},{p:[-6,-8],n:['情緒／情感','mood / affect']},{p:[28,-40],n:['思考形式與內容','thought']},{p:[50,-16],n:['知覺','perception']},{p:[30,14],n:['認知／定向','cognition']},{p:[54,30],n:['病識感與判斷','insight & judgement']},{p:[6,36],n:['風險評估','risk']}];
const KARYO=[{n:'1',len:18,cen:.48,slot:[-48,-20],free:[30,26]},{n:'9',len:12,cen:.35,slot:[-14,-20],free:[52,-24]},{n:'X',len:14,cen:.4,slot:[20,-20],free:[-46,28]}];
function chrom(x,y,len,cen){const c=CX;c.save();c.translate(x,y);[-1.1,1.1].forEach(dx=>{const top=-len/2,cy=top+len*cen;c.fillStyle='#7a5aa8';c.beginPath();c.ellipse(dx,(top+cy)/2,1.2,(cy-top)/2,0,0,2*PI);c.fill();c.beginPath();c.ellipse(dx,(cy+len/2)/2,1.2,(len/2-cy)/2,0,0,2*PI);c.fill();for(let b=top+1.5;b<len/2-1;b+=2.2){c.fillStyle='rgba(30,10,60,.55)';c.fillRect(dx-1.2,b,2.4,.6);}});c.restore();}
const SECTION=[{y0:-30,y1:-28.6,col:'#d79b7a',n:['表皮','epidermis']},{y0:-28.6,y1:-24.5,col:'#e9b8a0',n:['真皮','dermis']},{y0:-24.5,y1:-12,col:'#f2d27a',n:['皮下脂肪','subcutaneous fat']},{y0:-12,y1:-10.8,col:'#f4f1e6',n:['深筋膜','deep fascia']},{y0:-10.8,y1:9.6,col:'#b04a42',n:['骨骼肌','skeletal muscle']},{y0:9.6,y1:10.6,col:'#f2e6d0',n:['骨膜','periosteum']},{y0:10.6,y1:19,col:'#efe5cc',n:['皮質骨','cortical bone']},{y0:19,y1:30,col:'#d9a85e',n:['骨髓','marrow']}];
const LAYC={skin:'#efb7a0',fat:'#f2d27a',fascia:'#f4f1e6',muscle:'#b04a42',bone:'#efe5cc',organ:'#d98f86'};
const Z=(k,p,w,n,x,o)=>Object.assign({k,p,w,n,x},o||{});
const SITES={
abd:{reg:'torso',view:{c:[0,36],w:140},win:[-48,-24,48,100],inc:[[0,-6],[0,78]],ten:[18,36],lay:['skin','fat','fascia','organ'],
deep:Z('b',null,0,'腹膜／腸道|peritoneum / bowel','一刀切穿白線進入腹腔，可能傷及腸道：腸漏、腹膜炎。|Cutting straight through the linea alba can hit bowel: leak, peritonitis.'),
ves:'網膜血管分支|omental vessel branch',nerve:null,plane:Z('b',null,4,'小腸（貼近層面）|small bowel (next to the plane)','剝離偏離層面傷及腸壁：延遲性腸穿孔。|Leaving the plane injures the bowel wall: delayed perforation.')},
rlq:{reg:'torso',view:{c:[-74,156],w:110},win:[-122,116,-26,196],inc:[[-98,149],[-74,156],[-50,163]],ten:[-74,140],lay:['skin','fat','fascia','muscle'],
dz:[Z('a',[[-44,272],[-47,200],[-48,150],[-44,100]],2.6,'腹壁下動脈（深層）|inferior epigastric artery (deep)','切口內延過度傷及腹壁下動脈：腹壁血腫。|Too far medially cuts the inferior epigastric artery: rectus-sheath haematoma.',{sub:1,depth:3})],
deep:Z('b',null,0,'盲腸／腸道|caecum / bowel','切得太深進入腹腔可能傷及盲腸。|Cutting too deep can enter the caecum.'),ves:'闌尾動脈|appendicular artery',nerve:'髂腹下神經|iliohypogastric nerve'},
pfann:{reg:'torso',view:{c:[0,236],w:150},win:[-82,204,82,276],inc:bez([-60,232],[-20,247],[20,247],[60,232],16),ten:[0,220],lay:['skin','fat','fascia','muscle'],
dz:[-1,1].map(s=>Z('a',[[s*72,292],[s*73,240],[s*70,180]],3,'腹壁下血管|inferior epigastric vessels','切口向外延伸過遠傷及腹壁下血管：大量出血、血腫。|Too far laterally cuts the inferior epigastric vessels: bleeding, haematoma.',{sub:1,depth:1})),
deep:Z('u',null,0,'膀胱|bladder','過深切入下腹中線可能傷及膀胱：尿漏。|Cutting too deep in the low midline can injure the bladder: urine leak.'),ves:'腹壁下動脈分支|inferior epigastric branch',nerve:'髂腹股溝神經|ilioinguinal nerve'},
neck:{reg:'torso',view:{c:[0,-232],w:100},win:[-50,-262,50,-204],inc:bez([-34,-226],[-12,-218],[12,-218],[34,-226],14),ten:[0,-210],lay:['skin','fat','muscle','organ'],
dz:[-1,1].map(s=>Z('v',[[s*14,-282],[s*13,-244],[s*13,-204]],1.6,'頸前靜脈|anterior jugular vein','劃破頸前靜脈：術野出血、空氣栓塞風險。|Cutting the anterior jugular vein: bleeding and air-embolism risk.',{sub:1,depth:2})),
deep:Z('v',null,0,'帶狀肌／甲狀腺被膜|strap muscles / thyroid capsule','刀切過深進入甲狀腺：出血、視野不清。|Cutting too deep enters the thyroid: bleeding and a bloody field.'),ves:'甲狀腺中靜脈|middle thyroid vein',nerve:'喉返神經|recurrent laryngeal nerve',
plane:Z('n',null,3.2,'喉返神經|recurrent laryngeal nerve','偏離層面夾到或熱傷喉返神經：聲音沙啞、雙側時呼吸道阻塞。|Off the plane, the recurrent laryngeal nerve is injured: hoarseness; bilateral injury obstructs the airway.')},
sternum:{reg:'torso',view:{c:[0,-119],w:230},win:[-60,-215,60,-22],inc:[[0,-200],[0,-38]],ten:[26,-120],lay:['skin','fat','fascia','bone'],band:1.2,
dz:[-1,1].map(s=>Z('a',[[s*18,-205],[s*19,-120],[s*18,-40]],2.2,'胸廓內動脈（深層）|internal thoracic artery (deep)','偏離中線：胸骨鋸開不對稱、胸骨不穩、傷及胸廓內動脈。|Off the midline: asymmetric sternotomy, instability, internal thoracic artery injury.',{sub:1,depth:2})),
deep:Z('a',null,0,'骨膜（胸骨）|periosteum (sternum)','刀在骨膜上反覆切割：出血、骨膜剝離不平均。|Repeated cuts on the periosteum: bleeding, uneven stripping.'),ves:'胸骨旁穿通支|parasternal perforator',nerve:null},
scalp:{reg:'head',view:{c:[0,-6],w:180},win:[-75,-95,76,82],inc:[[50,62],[48,30],[46,0],[38,-28],[20,-52],[-6,-70],[-36,-78],[-60,-78]],ten:[72,10],lay:['skin','fascia','muscle','bone'],
dz:[Z('a',[[40,86],[41,50],[39,22],[30,4],[16,-14],[0,-28]],1.8,'顳淺動脈|superficial temporal artery','切口偏前切斷顳淺動脈：頭皮大量出血、皮瓣血流變差。|Drifting anteriorly cuts the superficial temporal artery: brisk bleeding, poor flap perfusion.',{sub:1,depth:2}),
Z('n',[[26,78],[16,52],[0,26],[-18,8],[-36,-2]],1.6,'顏面神經額支|frontal branch of the facial nerve','切口過前、過低傷及額支：同側抬眉無力（額肌麻痺）。|Too anterior or low injures the frontal branch: brow paralysis.',{sub:1,depth:2})],
deep:Z('a',null,0,'顳肌／骨膜|temporalis / periosteum','切入顳肌：肌肉出血、術後咀嚼痛。|Cutting into temporalis: muscle bleeding and painful chewing.'),ves:'顳淺動脈分支|superficial temporal branch',nerve:'顏面神經額支|frontal branch of facial nerve'},
backmid:{reg:'back',view:{c:[0,84],w:170},win:[-50,10,50,158],inc:[[0,28],[0,138]],ten:[24,84],lay:['skin','fat','fascia','muscle'],
deep:Z('a',null,0,'腰背筋膜／椎旁肌|lumbodorsal fascia / paraspinal muscle','偏離中線切入椎旁肌：出血增加、術後疼痛。|Cutting into paraspinal muscle off the midline: more bleeding and pain.'),ves:'節段動脈背側支|dorsal segmental branch',nerve:'神經根|nerve root',
plane:Z('du',null,3.4,'硬膜囊|dural sac','剝離時刺破硬膜：腦脊髓液滲漏、頭痛。|Tearing the dura while dissecting: CSF leak and headache.')},
groin:{reg:'torso',view:{c:[-64,284],w:120},win:[-100,238,-28,332],inc:[[-64,252],[-63,318]],ten:[-46,284],lay:['skin','fat','fascia','organ'],
dz:[Z('n',[[-82,240],[-84,330]],2,'股神經|femoral nerve','偏外側傷及股神經：股四頭肌無力、大腿前內側麻。|Too lateral injures the femoral nerve: quadriceps weakness, thigh numbness.',{sub:1,depth:2}),Z('v',[[-49,240],[-48,330]],3,'股靜脈|femoral vein','偏內側傷及股靜脈：大出血。|Too medial injures the femoral vein: major bleeding.',{sub:1,depth:2})],
deep:Z('a',null,0,'股動脈|femoral artery','一刀切到筋膜下：直接傷及股動脈。|One cut through the fascia goes straight into the femoral artery.'),ves:'旋髂淺靜脈|superficial circumflex iliac vein',nerve:'股神經|femoral nerve'},
thigh:{reg:'limb',rv:{v:'thigh'},view:{c:[0,0],w:150},win:[-80,-30,80,30],inc:[[-60,0],[60,-2]],ten:[0,14],lay:['skin','fat','fascia','muscle'],
deep:Z('a',null,0,'股外側肌|vastus lateralis','一刀穿過闊筋膜張肌進入股外側肌：肌肉出血。|Cutting through the fascia lata into vastus lateralis: muscle bleeding.'),ves:'股深動脈穿通支|profunda perforator',nerve:'股外側肌神經分支|nerve to vastus lateralis'},
knee:{reg:'limb',rv:{v:'knee'},view:{c:[0,-12],w:150},win:[-50,-92,50,64],inc:[[0,-66],[0,38]],ten:[-22,-12],lay:['skin','fat','fascia','organ'],
dz:[Z('n',[[62,20],[30,40],[0,47],[-22,51]],1.5,'隱神經髕下支|infrapatellar branch of saphenous nerve','切口下端超過，切斷髕下支：術後膝外側麻木、神經瘤痛。|Past the lower end cuts the infrapatellar branch: knee numbness or neuroma pain.',{sub:1,depth:1})],
deep:Z('a',null,0,'伸肌支持帶／關節囊|retinaculum / capsule','過深切開關節囊：關節液外漏、出血。|Cutting too deep opens the capsule: fluid leak and bleeding.'),ves:'膝下內側動脈|inferomedial genicular artery',nerve:'隱神經髕下支|infrapatellar nerve'},
chestlat:{reg:'lat',view:{c:[0,-17],w:140},win:[-70,-52,70,18],inc:[[-50,-6.2],[0,-17.2],[50,-28.2]],ten:[0,-36],lay:['skin','fat','muscle','organ'],
dz:[Z('n',[[-60,-12.3],[60,-38.7]],1.8,'第五肋下緣神經血管束|neurovascular bundle under rib 5','沿肋骨下緣切開：傷及肋間神經血管束，出血與慢性胸壁痛。|Along the lower rib border you cut the intercostal bundle: bleeding, chronic pain.',{sub:1,depth:2})],
deep:Z('p',null,0,'壁層胸膜／肺|parietal pleura / lung','一刀切穿胸膜：肺實質損傷、漏氣。|Cutting through the pleura injures the lung: air leak.'),ves:'肋間動脈|intercostal artery',nerve:'肋間神經|intercostal nerve'},
face:{reg:'face',view:{c:[0,0],w:60},win:null,inc:[[-16,-7.5],[0,0],[16,7.5]],ten:[-4,12],lay:['skin','fat','fascia','muscle'],bite:2,gap:4.5,
deep:Z('n',null,0,'SMAS／顏面神經頰支|SMAS / buccal branch','切穿 SMAS 傷及顏面神經頰支：上唇與臉頰無力。|Cutting through the SMAS injures the buccal branch: weak cheek and upper lip.'),ves:'顏面動脈分支|facial artery branch',nerve:'顏面神經頰支|buccal branch of facial nerve'}
};
function geo(s){const P=resample(s.inc,1),h=Math.floor(P.length/2),a=P[Math.max(0,h-4)],b=P[Math.min(P.length-1,h+4)],ux=b[0]-a[0],uy=b[1]-a[1],L=hyp(ux,uy)||1;return{P,m:P[h],u:[ux/L,uy/L],n:[-uy/L,ux/L],L:plen(s.inc)};}
const V2=(p,u,a,n,b)=>[p[0]+u[0]*a+(n?n[0]*b:0),p[1]+u[1]*a+(n?n[1]*b:0)];
const angOf=v=>angN(Math.atan2(v[1],v[0])/D2R);
const go=(h,p,lab,o)=>Object.assign({t:'go',h,p,lab,tol:2},o||{});
const tr=(h,pts,lab,o)=>Object.assign({t:'trace',h,path:pts,lab,band:1.5,passes:1},o||{});
const kn=(at,o)=>Object.assign({t:'knot',seq:'LRL',at,rad:14,lab:'打結：左手、右手、左手三個單結（方結）|Tie: left, right, left throws (square knot)'},o||{});
const adv=(h,p,n,lab,o)=>Object.assign({t:'adv',h,p,n,lab,tol:3},o||{});
const rel=h=>({t:'rel',h});
const gR=(x,y,lab,tol)=>go('R',[x,y],lab,{tol,stamp:'check'}),gN=(x,y,lab,tol)=>go('R',[x,y],lab,{tol,need:'L',stamp:'check'}),hL=(x,y,lab,tol)=>go('L',[x,y],lab,{tol,hold:1});
const LB=(z,e)=>[z,e];
function D(key,o){return Object.assign({key,tools:{L:['fT'],R:['s10']},steps:[],dz:[],magMax:2.5,tolRef:1,rv:{},start:null},o);}
const B={};
B.timeout=()=>D('timeout',{reg:'bench',rv:{v:'board'},view:{c:[0,6],w:186},t:'劃刀前暫停（WHO Time-out）|WHO time-out before incision',g:'左手按腕帶、右手比對同意書，再逐項核對。|Left holds the wristband, right compares the consent, then tick each item.',
tools:{L:['fg'],R:['fg','mk']},start:{L:[-90,30,140],R:[92,10,35]},tolRef:2,
steps:[hL(-62,52,'按住病人腕帶（身分來源一）|hold the wristband (identity source 1)',7),go('R',[52,47],'比對同意書上的姓名與 ID（來源二）|compare the name and ID on the consent (source 2)',{tol:7,need:'L'})]
.concat(TIMEOUT_ITEMS.map((it,i)=>go('R',[-46,-26+11*i],LB('核對「'+it[0]+'」','confirm "'+it[1]+'"'),{tol:3.5,stamp:'check'}))).concat([rel('L')])});
B.incise=(cfg)=>{const s=SITES[cfg.site];
return D('incise',{reg:s.reg,rv:Object.assign({},s.rv,{preg:cfg.preg}),view:s.view,win:s.win,t:'沿標記線切開（分層深度）|Incision along the marked line (depth by layer)',g:'左手繃皮；刀順線切兩趟：皮膚、皮下，勿第三趟。|Left tensions the skin; two passes along the line — skin, then fat — never a third.',
tools:{L:['fg','fT'],R:['s10','s15']},marks:[{t:'line',p:s.inc,col:'#6b2fa8',dash:1}],lay:s.lay,dz:(s.dz||[]).slice(),deep:s.deep,
steps:[go('L',s.ten,'在切線旁按住並繃緊皮膚（F）|press beside the line and tension the skin (F)',{tol:6,hold:1}),
tr('R',s.inc,'Space 下刀，沿紫線切兩趟（皮膚 → 皮下），再按 Space 抬刀|Space to engage, cut two passes along the purple line (skin → fat), Space to lift',{band:s.band||1.6,passes:2,align:1,need:'L',ink:'cut',tool:['s10','s15'],cov:.9}),rel('L')]});};
function openWound(s,gape,extra){return Object.assign({pts:resample(s.inc,1),gape,depth:3,lay:s.lay},extra||{});}
B.haemo=(cfg)=>{const s=SITES[cfg.site],g=geo(s),P=g.P,pts=[.2,.42,.6,.8,.32].map((t,i)=>{const p=P[Math.floor(t*(P.length-1))];return V2(p,g.n,(i%2?-1:1)*2.4);});
return D('haemo',{reg:s.reg,rv:Object.assign({},s.rv,{preg:cfg.preg}),view:{c:g.m,w:Math.min(s.view.w,Math.max(70,g.L*1.3))},win:s.win,t:'止血：吸引與電凝|Haemostasis: suction and coagulation',g:'左手吸引露出出血點，右手精準止血。|Suction reveals each bleeder; coagulate exactly on it.',
tools:{L:['yank'],R:[cfg.R||'pen','bip','mosq']},wound:openWound(s,6),dz:(s.dz||[]).filter(z=>!z.sub),bleed:{pts,start:3,max:5,every:9},tolRef:1.2,
steps:[{t:'bleed',lab:'左手吸引、右手止血：控制所有出血點，再把術野吸乾|Suction with the left, control every bleeder with the right, then dry the field'}]});};
B.suture=(cfg)=>{const s=SITES[cfg.site],g=geo(s),sp=s.gap||8,bite=s.bite||4,st=[];
[-1,0,1].forEach((j,i)=>{const c0=V2(g.m,g.u,j*sp),en=V2(c0,g.n,bite),ex=V2(c0,g.n,-bite),ev=V2(c0,g.n,bite+2.5);
st.push(go('L',ev,LB(`第 ${i+1} 針 · 夾住近側皮緣並外翻（F）`,`Stitch ${i+1} · grasp and evert the near edge (F)`),{tol:2.6,hold:1,tool:['adson','fT']}));
st.push(go('R',en,LB(`第 ${i+1} 針 · 針垂直皮膚在入針點入針（Space）`,`Stitch ${i+1} · enter perpendicular at the entry mark (Space)`),{tol:s.bite?.9:1.4,need:'L',tool:'nd',stamp:'bite'}));
st.push(go('R',ex,LB(`第 ${i+1} 針 · 沿針的弧度在對側出針點出針`,`Stitch ${i+1} · follow the needle's curve out at the exit mark`),{tol:s.bite?.9:1.4,tool:'nd',stamp:'stitch',pair:en}));
st.push(kn(c0,{rad:16}));st.push(rel('L'));});
return D('suture',{reg:s.reg,rv:Object.assign({},s.rv,{preg:cfg.preg}),view:{c:g.m,w:Math.max(46,sp*7.5)},win:s.win,t:'間斷縫合（入針／出針與打結）|Interrupted sutures (bites and knots)',g:'左手外翻皮緣，右手照標記入針出針，再左右交替打結。|Left everts, right bites at the marks, then alternate three throws.',
tools:{L:['adson','fT'],R:['nd','mayo']},wound:openWound(s,s.bite?1.2:2.6,{depth:2,seg:[-sp*2,sp*2]}),steps:st,tolRef:s.bite?.6:1,magMax:s.bite?4:2.5,
marks:[-1,0,1].reduce((a,j)=>{const c0=V2(g.m,g.u,j*sp);a.push({t:'dot',p:V2(c0,g.n,bite)},{t:'dot',p:V2(c0,g.n,-bite)});return a;},[])});};
B.ligate=(cfg)=>{const s=SITES[cfg.site],g=geo(s),m=g.m,ves=[V2(m,g.n,-16),V2(m,g.n,16)],c1=V2(m,g.n,4.5),c2=V2(m,g.n,-4.5),tie=V2(m,g.n,8),na=angOf(g.u);
const nerve=Z('n',[V2(m,g.u,10,g.n,-16),V2(m,g.u,10,g.n,16)],1.6,s.nerve||'鄰近神經|adjacent nerve','夾到旁邊的神經：壓碎傷，術後麻木或無力。|Clamping the adjacent nerve crushes it: numbness or weakness.',{bed:1});
return D('ligate',{reg:s.reg,rv:Object.assign({},s.rv,{preg:cfg.preg}),view:{c:m,w:64},win:s.win,t:'血管結紮：夾－夾－剪－綁|Vessel ligation: clamp, clamp, cut, tie',g:'兩鉗垂直夾、中間剪斷、左手繞線、交替打結。|Two square clamps, divide between, pass the tie, alternate throws.',
tools:{L:['fT','fN'],R:['kelly','mosq','metz']},wound:openWound(s,18,{bedCol:'#c9786a'}),vessel:{p:ves,w:3,k:'a',n:s.ves||'血管|vessel'},dz:[nerve],tolRef:1.2,
steps:[go('R',c1,'第一把止血鉗垂直夾住近端（Space；, . 旋轉）|first clamp square across the proximal mark (Space; , . rotate)',{tol:1.8,ang:na,angTol:18,sym:1,tool:['kelly','mosq'],stamp:'clamp'}),
go('R',c2,'第二把止血鉗夾住遠端標記|second clamp across the distal mark',{tol:1.8,ang:na,angTol:18,sym:1,tool:['kelly','mosq'],stamp:'clamp'}),
go('R',m,'換 Metzenbaum 剪（Tab），在兩鉗中間剪斷|switch to Metzenbaum scissors (Tab) and divide between the clamps',{tol:1.4,tool:'metz',stamp:'divide'}),
go('L',tie,'把結紮線繞過近端鉗下方（F）|pass the tie under the proximal clamp (F)',{tol:2,tool:['fT','fN'],stamp:'tie'}),kn(tie,{rad:18})]});};
B.retract=(cfg)=>{const s=SITES[cfg.site],g=geo(s),m=g.m,hold=V2(m,g.n,4.5),tg=[V2(m,g.u,9,g.n,9),V2(m,g.u,-8,g.n,12),V2(m,g.n,15)];
return D('retract',{reg:s.reg,rv:Object.assign({},s.rv,{preg:cfg.preg}),view:{c:V2(m,g.n,6),w:70},win:s.win,t:'雙手牽開暴露|Two-hand retraction and exposure',g:'左手拉鉤撐住（會回彈），右手確認深部結構。|Left retractor holds (it springs back); right confirms deep structures.',
tools:{L:['army','senn'],R:['fN','metz']},wound:openWound(s,4,{retract:1}),drift:1,dz:[Z('n',[V2(tg[0],g.u,-10),V2(tg[0],g.u,10)],1.4,s.nerve||'深部神經|deep nerve','以剪刀觸及神經：神經損傷。|Touching the nerve with scissors: nerve injury.',{bed:1})],tolRef:1.2,
steps:[go('L',hold,'Army-Navy 拉鉤勾住皮緣並維持（F）|hook the wound edge with the Army-Navy and hold (F)',{tol:2.4,hold:1,tool:['army','senn']}),
go('R',tg[0],'以無齒鑷輕觸辨認深部神經（保護它）|gently identify the deep nerve with non-toothed forceps (protect it)',{tol:2,need:'L',tool:'fN',stamp:'check'}),
go('R',tg[1],'確認深筋膜層面|confirm the deep fascial plane',{tol:2,need:'L',tool:'fN',stamp:'check'}),
go('R',tg[2],'確認血管走向|confirm the course of the vessel',{tol:2,need:'L',tool:'fN',stamp:'check'}),rel('L')]});};
B.dissect=(cfg)=>{const s=SITES[cfg.site],g=geo(s),m=g.m,pl=s.plane||Z('n',null,3.2,s.nerve||'神經|nerve','偏離層面傷及神經。|Leaving the plane injures the nerve.'),path=[V2(m,g.u,-14,g.n,2),V2(m,g.u,-5,g.n,2.6),V2(m,g.u,5,g.n,1.6),V2(m,g.u,14,g.n,2.2)];
const dz=Z(pl.k,path.map(p=>V2(p,g.n,pl.w)),pl.k==='b'?3:1.4,pl.n,pl.x,{bed:1});
return D('dissect',{reg:s.reg,rv:Object.assign({},s.rv,{preg:cfg.preg}),view:{c:m,w:60},win:s.win,t:'沿組織層面剝離|Dissection along a tissue plane',g:'左手反向牽引，右手剪刀沿虛線層面推剪。|Left counter-traction; right scissors push-cut along the dotted plane.',
tools:{L:['fN','adson'],R:['metz','ms']},wound:openWound(s,18,{bedCol:'#d6a08a'}),dz:[dz],tolRef:.8,marks:[{t:'line',p:path,col:'#f7f7f2',dash:1}],
steps:[go('L',V2(m,g.n,-6),'夾住對側組織反向牽引（F）|grasp the opposite tissue for counter-traction (F)',{tol:2.4,hold:1,tool:['fN','adson']}),tr('R',path,'Space 開始，沿虛線層面剝離；完成後再按 Space|Space to start, dissect along the dotted plane; Space again to finish',{band:.9,need:'L',ink:'dissect',tool:['metz','ms']}),rel('L')]});};
B.micro=()=>D('micro',{reg:'micro',view:{c:[0,0],w:22},magMax:6,tolRef:.2,t:'顯微剝離：腫瘤與神經之間|Microdissection between tumour and nerve',g:'放大 4–6×：左手拉被膜，右手沿蛛網膜層面剝離，遠離神經。|At 4–6×: left retracts the capsule, right follows the arachnoid plane, clear of the nerve.',
tools:{L:['mf','bip'],R:['ms','mf']},start:{L:[-8,-5,150],R:[8,-3,30]},
dz:[Z('n',NERVE_MICRO,.72,'顏面神經|facial nerve','剪到或拉扯顏面神經：術後臉部癱瘓。|Cutting or stretching the facial nerve: postoperative facial palsy.'),Z('a',[[10.5,-7.5],[6,-5],[3,-4.2],[.5,-5.6],[-2.5,-7.6]],.5,'小腦前下動脈（AICA）|anterior inferior cerebellar artery','傷及 AICA：出血與腦幹／小腦梗塞。|Injuring AICA: haemorrhage and brainstem or cerebellar infarction.')],
steps:[go('L',[-6,-2.5],'顯微鑷輕夾腫瘤被膜、向上反向牽引（F）|gently grasp the capsule and retract it away (F)',{tol:.8,hold:1,tool:'mf'}),tr('R',PLANE_MICRO,'沿白色層面剝離（Space 開始／結束），放大並用 Shift|dissect along the white plane (Space start/stop); magnify and use Shift',{band:.32,need:'L',ink:'dissect',tool:'ms'}),rel('L')]});
B.rhexis=()=>D('rhexis',{reg:'eye',view:{c:[0,0],w:28},magMax:6,tolRef:.15,t:'連續環形撕囊（顯微）|Continuous curvilinear capsulorhexis (micro)',g:'左手穩眼球；右手中央刺囊後沿 5.2 mm 圓撕一圈。|Left steadies; right punctures centrally, then tears round the 5.2 mm circle.',
tools:{L:['mf'],R:['cys','mf']},start:{L:[9,-6,330],R:[7,5,30]},marks:[{t:'line',p:ring(0,0,2.6,60),col:WH(.7),dash:1,closed:1}],
dz:[Z('cap',null,.3,'瞳孔緣／虹膜|pupil margin / iris','撕囊往外跑：放射狀裂口延伸到周邊、後囊破裂與玻璃體脫出。|The rhexis runs out: radial tear, posterior-capsule rupture, vitreous loss.',{c:[0,0],R:3.6})],
steps:[hL(5.2,-3,'器械經側切口穩定眼球（F）|stabilise the globe through the side port (F)',.6),go('R',[0,0],'在中央刺開前囊（Space）|puncture the anterior capsule centrally (Space)',{tol:.45,need:'L',tool:'cys'}),
tr('R',ring(0,0,2.6,72),'沿虛線圓連續撕囊一圈|tear continuously around the dotted circle',{band:.3,closed:1,need:'L',ink:'rhexis',tool:['cys','mf']}),rel('L')]});
B.fundus=()=>D('fundus',{reg:'eye',rv:{ext:1},view:{c:[0,-2],w:52},magMax:4,tolRef:.3,inset:'fundus',t:'眼底鏡：由顳側 15° 找視盤|Ophthalmoscopy: find the disc from 15° temporal',g:'左手扶額撐瞼；右手由顳側 15° 找紅光，再找視盤與黃斑。|Left steadies; right approaches 15° temporal for the red reflex, then disc and macula.',
tools:{L:['fg'],R:['oph']},start:{L:[-6,-20,110],R:[-18,10,195]},
steps:[hL(2,-12,'扶住前額、拇指撐開上眼瞼（F）|steady the forehead, thumb lifts the upper lid (F)',2),go('R',[-1.2,0],'由顳側約 15° 對準瞳孔，看到紅光反射（, . 調角度）|from about 15° temporal, aim at the pupil for the red reflex (, . to angle)',{tol:1,need:'L',ang:195,angTol:12,tool:'oph'}),
go('R',[.4,.3],'微調（Shift）沿血管找到視盤|fine-adjust (Shift) along a vessel to the optic disc',{tol:.35,need:'L',tool:'oph',img:'disc'}),go('R',[-.5,.2],'請病人看光源，觀察黃斑|ask the patient to look at the light; view the macula',{tol:.35,need:'L',tool:'oph',img:'mac'}),rel('L')]});
B.oto=(cfg,child)=>{const g0=child?[8,38]:[14,-30],g1=child?[13,44]:[19,-36];
return D(child?'otoChild':'oto',{reg:'ear',view:{c:[2,4],w:96},magMax:3,tolRef:.5,inset:'oto',t:child?'兒童耳鏡：耳廓往下往後拉|Paediatric otoscopy: pull the pinna down and back':'耳鏡檢查：拉直外耳道|Otoscopy: straighten the ear canal',
g:child?'幼兒：耳垂往下往後拉，耳鏡輕放再微調。|Young child: pull the lobule down and back, rest the speculum, then fine-adjust.':'耳廓往上往後拉直耳道，耳鏡輕放再微調。|Pull the pinna up and back, rest the speculum, then fine-adjust.',
tools:{L:['fg'],R:['oto']},start:{L:[30,child?46:-44,330],R:[-36,22,200]},
dz:[Z('wall',null,0,'外耳道壁|ear-canal wall','未拉直耳道就推入耳鏡：外耳道壁擦傷、疼痛，病童會抗拒。|Without straightening the canal you scrape its wall: pain; a child will resist.',{c:[-5,6],r:4.4,cond:'noHold'})],
steps:[go('L',g0,child?'捏住耳垂（F）|grasp the lobule (F)':'捏住耳輪上緣（F）|grasp the upper helix (F)',{tol:3}),go('L',g1,child?'往下往後拉並維持（F）|pull down and back and hold (F)':'往上往後拉並維持（F）|pull up and back and hold (F)',{tol:2.4,hold:1}),
go('R',[-5,6],'耳鏡輕放外耳道口（Space）|rest the speculum at the canal entrance (Space)',{tol:2,need:'L',tool:'oto'}),go('R',[-4.3,5.1],'微調讓鼓膜與光錐置中（Space）|fine-adjust to centre the drum and light reflex (Space)',{tol:.5,need:'L',tool:'oto',img:'tm'}),rel('L')]});};
B.otoChild=c=>B.oto(c,1);
const toothAt=n=>{const t=TEETH.find(x=>x.n===n);return[t.x,t.y];};
B.dental=()=>{const p46=toothAt('46'),p47=toothAt('47'),p45=toothAt('45'),p36=toothAt('36');
return D('dental',{reg:'mouth',rv:{labels:1},view:{c:[0,0],w:66},magMax:3,tolRef:.6,t:'口鏡與探針：窩溝檢查順序|Mirror and explorer: pit-and-fissure check',g:'口鏡壓舌反光，探針依序查窩溝，避開舌與口底。|Mirror retracts and reflects; the explorer checks each pit, clear of the tongue.',
tools:{L:['mir'],R:['exp']},start:{L:[8,26,80],R:[-26,26,110]},
dz:[Z('n',null,0,'舌頭／口底（舌神經）|tongue / floor of mouth (lingual nerve)','探針刺到舌頭或口底：撕裂傷，口底區域靠近舌神經。|The explorer lacerates the tongue or floor of mouth, near the lingual nerve.',{c:[0,11],r:8,by:'R'})],
steps:[hL(5,9,'口鏡壓住舌頭、反射光線（F）|mirror retracts the tongue and reflects light (F)',2.4),
go('R',p46,'46 中央窩|46 central pit',{tol:1.2,need:'L',stamp:'check'}),go('R',V2(p46,[-.85,.5],3.4),'46 頰側窩|46 buccal pit',{tol:1.1,need:'L',stamp:'check'}),
go('R',p47,'47 中央窩|47 central pit',{tol:1.2,need:'L',stamp:'check'}),go('R',p45,'45 遠心窩|45 distal pit',{tol:1.2,need:'L',stamp:'check'}),go('R',p36,'36 中央窩（對側）|36 central pit (other side)',{tol:1.2,need:'L',stamp:'check'}),rel('L')]});};
const CAVITY=[[-4.2,-.9],[-1.6,-1.2],[.2,-1.0],[.6,-2.2],[1.2,-1.0],[3.2,-1.1],[4.5,-.6],[4.5,1.1],[3.2,1.2],[1.6,1.3],[-.3,1.3],[-.7,2.6],[-1.3,1.4],[-3.4,1.2],[-4.5,.6]];
B.cavity=()=>D('cavity',{reg:'mouth',rv:{molar:1},view:{c:[0,0],w:17},magMax:4,tolRef:.15,t:'第一類窩洞外形（沿窩溝）|Class I cavity outline along the fissures',g:'車針沿窩溝外形一圈，保留邊緣嵴與牙尖。|The bur follows the fissures, sparing ridges and cusps.',
tools:{L:['mir'],R:['bur']},start:{L:[-7.5,7.5,120],R:[6,6,40]},marks:[{t:'line',p:CAVITY,col:'rgba(40,40,40,.6)',dash:1,closed:1}],
dz:[[-3,2.6],[1.2,2.9],[4.2,1.3],[-2.6,-2.8],[2.6,-2.6]].map(c=>Z('cusp',null,0,'牙尖|cusp tip','車到牙尖：牙尖被削弱，日後崩裂。|Cutting into a cusp weakens it: later fracture.',{c,r:.75})).concat([Z('cusp',[[-5.2,-2.6],[-5.2,2.6]],.45,'近心邊緣嵴|mesial marginal ridge','切穿邊緣嵴：窩洞變成第二類，牙齒強度大減。|Breaking the marginal ridge makes a class II cavity and weakens the tooth.')]),
steps:[hL(-7,7.3,'口鏡撐開頰側（F）|mirror retracts the cheek (F)',1.2),tr('R',CAVITY,'Space 開始，沿虛線窩溝外形繞一圈|Space to start, follow the dotted outline once',{band:.3,closed:1,need:'L',ink:'bur',tool:'bur'}),rel('L')]});
B.wire=(cfg,v)=>{const tr0=TREES[v||'iliac'],e=tr0.entry,s0=tr0.segs[0].p,a0=angOf([s0[1][0]-s0[0][0],s0[1][1]-s0[0][1]]);
return D('wire',{reg:'vessels',rv:{tree:v||'iliac'},view:{c:v==='coronary'?[-8,4]:[0,0],w:v==='neuro'?104:124},magMax:3,tolRef:.8,
t:v==='coronary'?'冠狀動脈導絲：進入 LAD 越過狹窄|Coronary wire: into the LAD across the stenosis':v==='neuro'?'神經介入導絲：ICA → M1 血栓遠端|Neuro-interventional wire: ICA → M1 beyond the clot':'跨髂動脈導絲：右股入路到左側病灶|Crossover wire: right femoral access to the left-sided lesion',
g:'左手固定鞘管；右手推進，分叉先轉 J 尖。|Left pins the sheath; right advances, torquing the J-tip at forks.',
tools:{L:['fg'],R:['wire']},start:{L:[e[0]+24,e[1]+20,30],R:[e[0],e[1]-1,a0]},lumen:tr0,
steps:[go('L',[e[0],e[1]+8],'按住鞘管尾端固定（F）|pin the sheath hub (F)',{tol:3,hold:1}),{t:'lumen',h:'R',target:tr0.target,tol:2.2,need:'L',lab:'推進導絲到病灶遠端標記，停好後按 Space|advance to the mark beyond the lesion, then Space to park'},rel('L')]});};
const LAPV={
chole:{t:'腹腔鏡膽囊：鏡頭置中與抓取|Laparoscopic cholecystectomy: camera centring and grasping',tg:[[32,-30,'抓住膽囊底往頭側推|Grasp the fundus and push it cephalad'],[2,5,'抓住 Hartmann 囊往外側拉|Grasp Hartmann’s pouch and retract laterally'],[-11,13,'辨認膽囊管（安全關鍵視野）|Identify the cystic duct (critical view of safety)']],
dz:[Z('d',[[-26,-8],[-27,20],[-29,54]],2.6,'總膽管|common bile duct','誤夾或燒到總膽管：膽管損傷，膽汁漏與狹窄。|Grasping or burning the bile duct: leak and stricture.'),Z('b',[[-84,48],[-30,50],[10,62]],6,'十二指腸|duodenum','器械碰傷十二指腸：延遲穿孔。|Instrument injury to the duodenum: delayed perforation.')]},
pelvis:{t:'婦科腹腔鏡：骨盆巡視|Gynaecological laparoscopy: pelvic survey',tg:[[0,-4,'撥動子宮底呈現骨盆|Present the uterine fundus'],[-42,10,'檢查右側卵巢|Inspect the right ovary'],[42,10,'檢查左側卵巢|Inspect the left ovary'],[0,38,'檢查道格拉斯窩|Inspect the pouch of Douglas']],
dz:[-1,1].map(s=>Z('u',[[s*54,-2],[s*57,30],[s*55,64]],2.2,'輸尿管|ureter','器械或能量碰到輸尿管：輸尿管損傷、尿漏。|Instruments or energy on the ureter: ureteric injury and urine leak.')).concat([-1,1].map(s=>Z('a',[[s*72,-36],[s*74,20],[s*70,64]],4,'髂外血管|external iliac vessels','抓到髂外血管：大出血。|Grasping the iliac vessels: major haemorrhage.')))},
kidney:{t:'泌尿腹腔鏡：腎臟暴露|Urological laparoscopy: kidney exposure',tg:[[34,-10,'抓起外側附著處|Lift the lateral attachments'],[12,36,'抬起腎下極|Lift the lower pole'],[-8,0,'接近腎門（先辨認腎靜脈）|Approach the hilum (identify the renal vein first)']],
dz:[Z('v',[[-16,6],[-50,10],[-90,12]],4,'腎靜脈|renal vein','撕裂腎靜脈：大出血，可能要轉開腹。|Tearing the renal vein: major bleeding and possible conversion.'),Z('b',[[-80,-30],[-62,0],[-64,64]],9,'結腸|colon','器械碰傷結腸：腸穿孔。|Instrument injury to the colon: perforation.')]},
appendix:{t:'兒童腹腔鏡闌尾：鏡頭與抓取|Paediatric laparoscopic appendicectomy',tg:[[-40,0,'沿盲腸結腸帶找到闌尾根部|Follow the taenia to the base'],[32,40,'抓住闌尾尖端提起|Grasp and lift the appendix tip'],[12,24,'在根部旁繫膜開窗|Make a window in the mesoappendix near the base']],
dz:[Z('b',[[10,-66],[40,-44],[86,-36]],8,'迴腸末端|terminal ileum','抓傷迴腸：腸壁撕裂。|Grasping the ileum tears the bowel wall.'),Z('a',[[7,14],[16,22],[24,31]],1,'闌尾動脈|appendicular artery','開窗時撕破闌尾動脈：出血模糊視野。|Tearing the appendicular artery: bleeding obscures the view.')]},
thorax:{t:'胸腔鏡：葉間裂與淋巴結|Thoracoscopy: fissure and lymph nodes',tg:[[4,-24,'提起肺葉暴露葉間裂|Lift the lobe to expose the fissure'],[22,12,'抓住下葉邊緣|Grasp the lower-lobe edge'],[44,-30,'抓取淋巴結（不要壓到血管）|Grasp the lymph node (off the vessel)']],
dz:[Z('a',[[-20,-14],[10,-11],[40,-14],[60,-12]],3,'肺動脈分支|pulmonary artery branch','肺動脈分支撕裂：致命性出血。|Torn pulmonary artery branch: life-threatening bleeding.'),Z('n',[[-70,-66],[-66,30]],1.4,'膈神經|phrenic nerve','能量器械傷及膈神經：同側橫膈麻痺。|Energy injury to the phrenic nerve: hemidiaphragm paralysis.')]}
};
B.lap=(cfg,v)=>{const L=LAPV[v||'chole'];
return D('lap',{reg:'lap',rv:{v:v||'chole'},view:{c:[0,0],w:120},camera:1,magMax:2,tolRef:1.2,t:L.t,g:'左手＝鏡頭：先置中目標，右手再抓。|Left hand = camera: centre the target, then grasp.',
tools:{L:['cam'],R:['lgr','lhk']},start:{L:[0,0,150],R:[24,30,35]},dz:L.dz.slice(),
steps:L.tg.map(([x,y,lab])=>go('R',[x,y],LB(lab.split('|')[0]+'（先用左手鏡頭置中）',lab.split('|')[1]+' (centre it with the camera first)'),{tol:2.6,centre:1,tool:['lgr'],stamp:'check'}))});};
B.pedicle=()=>{const en=[19,-12],tg=[8,36],dir=angOf([en[0]-tg[0],en[1]-tg[1]]);
return D('pedicle',{reg:'spineAx',view:{c:[0,14],w:124},magMax:3,tolRef:.8,t:'椎弓根螺釘：進入點與軌跡角|Pedicle screw: entry point and trajectory',g:'進入點＋約 13° 內聚；左手穩導引，分 6 次推進並保持角度。|Entry point and ~13° convergence; left steadies the guide; six advances holding the angle.',
tools:{L:['fg'],R:['drl']},start:{L:[40,-30,330],R:[36,-34,300]},marks:[{t:'line',p:[en,tg],col:'rgba(120,230,255,.7)',dash:1}],drillLine:1,
dz:[Z('du',null,0,'硬膜囊／馬尾|dural sac / cauda equina','內側穿出進入椎管：硬膜撕裂、神經損傷。|Medial breach into the canal: dural tear and neural injury.',{c:[0,4],r:9}),Z('n',null,0,'出口神經根|exiting nerve root','外下側穿出碰到神經根：根性疼痛或無力。|Inferolateral breach hits the exiting root: radicular pain, weakness.',{c:[21.5,7],r:3.4}),Z('a',null,0,'主動脈|aorta','前側穿出過深：主動脈損傷，致命出血。|Anterior over-penetration injures the aorta: fatal haemorrhage.',{c:[-18,58],r:10}),Z('v',null,0,'下腔靜脈|inferior vena cava','前側穿出過深：下腔靜脈損傷。|Anterior over-penetration injures the IVC.',{c:[19,58],r:10})],
steps:[hL(27,-26,'穩住導引套筒（F）|steady the drill guide (F)',4),go('R',en,'骨鑽尖端放在進入點並對準軌跡（, . 旋轉），Space 開始|drill tip on the entry, align with the trajectory (, . rotate), Space to start',{tol:1.5,ang:dir,angTol:5,need:'L',tool:'drl'}),
adv('R',en,6,'按 Space 6 次推進，保持角度|Space six times to advance, holding the angle',{step:7.5,ang:dir,angTol:5,need:'L',tool:'drl',tol:1.5}),rel('L')]});};
B.drillBone=()=>D('drillBone',{reg:'bone',view:{c:[8,2],w:110},magMax:3,tolRef:.8,t:'鋼板螺釘鑽孔：垂直、雙皮質|Plate-screw drilling: perpendicular and bicortical',g:'垂直骨幹鑽 7 下；最後一下穿出對側皮質時按住 Shift 防衝出。|Drill perpendicular in seven presses; hold Shift on the last to avoid plunging.',
tools:{L:['fg'],R:['drl']},start:{L:[40,-40,300],R:[46,-30,280]},drillLine:1,
dz:[Z('a',[[-60,21],[60,20]],3.2,'神經血管束|neurovascular bundle','穿出對側皮質後失控衝出：傷及神經血管束。|Plunging past the far cortex injures the bundle.')],
steps:[hL(24,-20,'鑽孔導引壓在螺孔上（F）|seat the drill guide on the hole (F)',2.4),go('R',[24,-16],'鑽頭放在螺孔中心並與骨幹垂直（Space）|drill on the hole centre, perpendicular to the shaft (Space)',{tol:1.2,ang:270,angTol:6,need:'L',tool:'drl'}),
adv('R',[24,-16],7,'Space 推進 7 次（最後一下按住 Shift）|Space seven times (hold Shift on the last)',{step:4,ang:270,angTol:6,need:'L',tool:'drl',tol:1.4,plunge:1}),rel('L')]});
B.cup=()=>D('cup',{reg:'pelvisAP',view:{c:[4,12],w:156},magMax:2.5,tolRef:1,t:'髖臼杯角度（外展約 40°）|Acetabular cup orientation (about 40° inclination)',g:'以淚滴為參考，杯在髖臼中心、外展約 40°，敲擊時保持角度。|Teardrop reference; cup at the centre, ~40° inclination, impact holding the angle.',
tools:{L:['fg'],R:['cup']},start:{L:[40,60,30],R:[-40,40,160]},marks:[{t:'line',p:[[0,0],[-60*Math.cos(50*D2R),60*Math.sin(50*D2R)]],col:'rgba(120,230,255,.55)',dash:1}],
dz:[Z('b',null,0,'髖臼內壁|medial acetabular wall','杯放得太內側：內壁穿破，假體突入骨盆。|Cup too medial: medial-wall breach and protrusion into the pelvis.',{c:[21,6],r:6})],
steps:[hL(16,22,'觸摸淚滴作參考（F）|palpate the teardrop reference (F)',3),go('R',[0,0],'置入器對準髖臼中心、外展 40°（Space）|inserter at the centre, 40° inclination (Space)',{tol:2,ang:130,angTol:5,need:'L',tool:'cup'}),adv('R',[0,0],3,'Space 敲擊 3 次，保持角度|Space three impactions, hold the angle',{step:0,ang:130,angTol:5,need:'L',tool:'cup',tol:2}),rel('L')]});
B.lumbar=()=>D('lumbar',{reg:'back',view:{c:[0,80],w:300},tolRef:2.5,t:'腰椎節段定位（只辨識，不穿刺）|Lumbar level identification (landmarks only, no needle)',g:'雙手髂嵴定 Tuffier 線（≈L4），標記 L4–L5；只定位、不穿刺。|Both hands on the crests (Tuffier ≈ L4), mark L4–L5; landmarks only, no needle.',
tools:{L:['fg'],R:['fg','mk']},start:{L:[-150,40,150],R:[150,40,30]},
dz:[Z('conus',null,0,'L2 以上（脊髓圓錐高度）|above L2 (conus level)','把節段標在 L2 以上：真實程序在此高度可能傷及脊髓圓錐。|Marking above L2: in a real procedure this level risks the conus medullaris.',{poly:[[-24,-70],[24,-70],[24,46],[-24,46]],by:'R',tool:'mk'})],
steps:[hL(-120,98,'放在左側髂嵴最高點（F）|on the top of the left iliac crest (F)',6),go('R',[120,98],'放在右側髂嵴最高點 → 連成 Tuffier 線|on the top of the right iliac crest → Tuffier’s line',{tol:6,need:'L',stamp:'tuffier'}),rel('L'),
go('R',[0,100],'沿中線摸到 L4 棘突（Space）|palpate the L4 spinous process in the midline (Space)',{tol:4,tool:'fg'}),go('R',[0,118],'換標記筆（Tab），標記 L4–L5 椎間隙|switch to the marker (Tab) and mark the L4–L5 interspace',{tol:4,tool:'mk',stamp:'x'})]});
B.marrow=()=>{const sp=[];for(let i=0;i<=70;i++){const a=i/70*4*PI,r=2+i/70*24;sp.push([45+Math.cos(a)*r,178+Math.sin(a)*r]);}
return D('marrow',{reg:'back',view:{c:[40,176],w:130},tolRef:1.5,t:'骨髓檢查部位定位（後上髂棘）|Bone-marrow site landmarking (posterior iliac crest)',g:'觸摸固定後上髂棘並標記，再由中心向外消毒；只定位。|Palpate and fix the PSIS, mark it, prep outward; landmarking only.',
tools:{L:['fg'],R:['mk','spg']},start:{L:[-10,150,150],R:[100,150,30]},
dz:[Z('conus',null,0,'薦髂關節／薦骨|sacroiliac joint / sacrum','位置太內側：落在薦髂關節或薦骨，取樣不佳且疼痛。|Too medial: the sacroiliac joint or sacrum — poor sample and pain.',{c:[22,192],r:6,by:'R',tool:'mk'}),Z('n',null,0,'坐骨切跡（坐骨神經方向）|sciatic notch (toward the sciatic nerve)','位置太外下：接近坐骨切跡與坐骨神經。|Too inferolateral: toward the sciatic notch and nerve.',{c:[72,232],r:12,by:'R',tool:'mk'})],
steps:[hL(45,178,'觸摸後上髂棘並繃緊皮膚（F）|palpate the PSIS and tension the skin (F)',3.5),go('R',[46,174],'在後上髂棘上標記 X|mark an X on the PSIS',{tol:2.5,need:'L',tool:'mk',stamp:'x'}),rel('L'),tr('R',sp,'換海綿鉗，由標記中心向外畫圈消毒|switch to the sponge stick; prep outward from the mark',{band:5,ink:'paint',tool:'spg',cov:.8})]});};
const V_ECG=[['V1',-22,-90],['V2',22,-90],['V3',56,-73],['V4',90,-56],['V5',130,-56],['V6',160,-56]];
B.ecg=()=>{const st=[go('L',[0,-163],'摸到胸骨角（Louis 角，第二肋）（F）|find the sternal angle (angle of Louis, 2nd rib) (F)',{tol:5})];
const lead=(i,holdAt)=>{const[n,x,y]=V_ECG[i];if(holdAt)st.push(go('L',holdAt,LB(`往下數肋間，手指停在 ${n} 的肋間（F）`,`count down the spaces and keep a finger on the ${n} space (F)`),{tol:5,hold:1}));
st.push(go('R',[x,y],LB(`貼上 ${n}`,`place ${n}`),{tol:5,need:holdAt?'L':null,stamp:'lead',name:n,tool:'el',miss:i<2?'V1/V2 貼太高：可能出現假性右束支傳導阻滯或前壁梗塞型態。|V1/V2 too high can mimic RBBB or an old anterior infarct.':'胸前導程位置偏移：R 波遞增改變，序列比較不可靠。|Displaced chest leads alter R-wave progression and spoil serial comparison.'}));if(holdAt)st.push(rel('L'));};
lead(0,[-22,-86]);lead(1,[22,-86]);lead(3,[90,-54]);lead(2);lead(4);lead(5);
return D('ecg',{reg:'torso',view:{c:[62,-112],w:270},tolRef:3,t:'胸前導程 V1–V6 定位|Precordial leads V1–V6',g:'左手由胸骨角往下數肋間並停住，右手依序貼 V1–V6。|Left counts the spaces from the sternal angle and stays; right places V1–V6.',
tools:{L:['fg'],R:['el']},start:{L:[-60,-190,140],R:[180,-30,40]},steps:st});};
B.ausc=()=>D('ausc',{markDz:1,reg:'torso',view:{c:[22,-168],w:236},tolRef:3.5,t:'心臟聽診五區（配合頸動脈脈搏）|Cardiac auscultation areas (timed with the carotid pulse)',g:'左手觸頸動脈定 S1，右手聽診器依序聽五區。|Left feels the carotid to time S1; right listens at the five areas.',
tools:{L:['fg'],R:['st']},start:{L:[-90,-300,150],R:[150,-40,40]},
dz:[Z('a',null,0,'左頸動脈（同時壓兩側）|left carotid (both sides pressed)','同時壓兩側頸動脈：腦血流下降、暈厥。|Pressing both carotids at once reduces cerebral flow: syncope.',{c:[38,-272],r:6,by:'R'})],
steps:[hL(-38,-272,'輕觸右頸動脈脈搏並維持（F）|lightly feel the right carotid pulse and keep it (F)',5)].concat([[-22,-140,'主動脈區（右第二肋間）','aortic area (right 2nd space)'],[22,-140,'肺動脈區（左第二肋間）','pulmonary area (left 2nd space)'],[22,-115,'Erb 點（左第三肋間）','Erb’s point (left 3rd space)'],[22,-80,'三尖瓣區（左下胸骨緣）','tricuspid area (lower left sternal edge)'],[88,-58,'二尖瓣區（心尖）','mitral area (apex)']]
.map(([x,y,z,e])=>go('R',[x,y],LB(''+z,e),{tol:5,need:'L',tool:'st',stamp:'check'}))).concat([rel('L')])});
B.lungs=()=>D('lungs',{reg:'torso',view:{c:[0,-112],w:300},tolRef:4,t:'肺部聽診：左右對照|Lung auscultation: side-to-side comparison',g:'由上而下、左右交替比較。|Top to bottom, alternating sides.',
tools:{L:['fg'],R:['st']},start:{L:[-170,-220,150],R:[160,-20,40]},
steps:[[-50,-180],[50,-180],[-72,-120],[72,-120],[-104,-46],[104,-46]].map(([x,y],i)=>go('R',[x,y],LB(`${i%2?'左':'右'}側${['上','上','中','中','下','下'][i]}肺野`,`${i%2?'left':'right'} ${['upper','upper','middle','middle','lower','lower'][i]} zone`),{tol:7,tool:'st',stamp:'check'}))});
B.palp=()=>D('palp',{reg:'torso',view:{c:[0,90],w:340},tolRef:6,t:'腹部觸診順序（右下腹痛）|Abdominal palpation sequence (right-lower-quadrant pain)',g:'從離痛點最遠處開始、痛處最後，再雙手觸肝緣。|Start furthest from the pain, finish there; then feel the liver edge bimanually.',
tools:{L:['fg'],R:['fg']},start:{L:[-180,140,150],R:[180,140,30]},
dz:[Z('pain',null,0,'右下腹痛點|tender right lower quadrant','一開始就壓痛點：病人防衛性收縮，其他區域都摸不清楚。|Starting at the tender spot makes the patient guard: the rest is lost.',{c:[-73,157],r:20,by:'R',until:5})],
steps:[[70,30,'左上腹','left upper quadrant'],[70,150,'左下腹','left lower quadrant'],[-70,30,'右上腹','right upper quadrant'],[0,4,'上腹','epigastrium'],[0,215,'恥骨上','suprapubic'],[-73,157,'右下腹（最後）','right lower quadrant (last)']]
.map(([x,y,z,e])=>go('R',[x,y],LB('右手輕觸：'+z,'Right, light palpation: '+e),{tol:9,stamp:'check'})).concat([hL(-164,42,'從背後托起右腰（F）|lift the right flank from behind (F)',8),go('R',[-96,46],'肋緣下，吸氣時感覺肝緣|below the costal margin, feel the liver edge on inspiration',{tol:7,need:'L'}),rel('L')])});
const USV={
fast:{t:'創傷 FAST 四個切面|Trauma FAST: four windows',probe:'usC',w:[[-160,-6,270,'ruq','右上腹（肝腎間隙）','right upper quadrant (hepatorenal)'],[156,-24,270,'luq','左上腹（脾腎間隙）','left upper quadrant (splenorenal)'],[0,236,180,'pel','恥骨上（膀胱後）','suprapubic (behind the bladder)',10],[0,-16,180,'sub','劍突下（心包）','subxiphoid (pericardium)']],view:{c:[0,100],w:380}},
lung:{t:'肺超音波：胸膜滑動|Lung ultrasound: pleural sliding',probe:'us',w:[[-90,-140,270,'lung','右前胸第二肋間','right anterior 2nd space'],[90,-140,270,'lung','左前胸第二肋間','left anterior 2nd space'],[-158,-40,270,'lung','右側胸下緣','right lateral base']],view:{c:[0,-100],w:380}},
thyroid:{t:'甲狀腺超音波：橫切與縱切|Thyroid ultrasound: transverse and longitudinal',probe:'us',w:[[0,-240,180,'thyT','頸前橫切（掃過整個腺體）','transverse (sweep through the gland)',8],[-22,-240,270,'thyL','右葉縱切','right lobe longitudinal']],view:{c:[0,-246],w:140}},
kidney:{t:'腎臟超音波：長軸|Renal ultrasound: long axis',probe:'usC',w:[[-160,14,250,'kid','右腎（側腹斜切）','right kidney (flank, oblique)'],[160,0,290,'kid','左腎（側腹斜切）','left kidney (flank, oblique)']],view:{c:[0,0],w:380}},
bladder:{t:'膀胱掃描：橫切與縱切|Bladder scan: transverse and sagittal',probe:'usC',w:[[0,240,180,'blad','恥骨上橫切（上下掃過）','suprapubic transverse (sweep)',8],[0,240,270,'bladS','恥骨上縱切','suprapubic sagittal']],view:{c:[0,236],w:160}},
fetal:{t:'產科超音波：胎頭、胎盤、羊水|Obstetric ultrasound: head, placenta, fluid',probe:'usC',w:[[-24,196,200,'fhead','胎頭雙頂徑切面','fetal head (biparietal plane)'],[10,20,180,'plac','胎盤位置','placental site'],[70,120,270,'afi','最大羊水囊','deepest fluid pocket']],view:{c:[0,110],w:380},preg:1},
pelvis:{t:'經腹婦科超音波|Transabdominal pelvic ultrasound',probe:'usC',w:[[0,236,270,'ut','子宮正中縱切','uterus midline sagittal'],[0,236,180,'utT','子宮橫切','uterus transverse'],[-46,232,210,'ov','右側卵巢','right ovary']],view:{c:[0,230],w:170}},
liver:{t:'肝臟超音波：找到病灶|Liver ultrasound: find the lesion',probe:'usC',w:[[-92,22,210,'liv','右肋緣下斜切（掃過肝臟）','right subcostal oblique (sweep the liver)',10],[-150,-30,250,'livI','右肋間切面','right intercostal']],view:{c:[-60,0],w:260}},
gb:{t:'膽囊超音波|Gallbladder ultrasound',probe:'usC',w:[[-72,30,240,'gb','右肋緣下（膽囊長軸）','right subcostal (gallbladder long axis)'],[-110,0,200,'gbT','膽囊橫切','gallbladder transverse']],view:{c:[-70,10],w:220}}
};
B.us=(cfg,v)=>{const U=USV[v||'fast'],st=[];
U.w.forEach(([x,y,a,img,z,e,sw])=>{st.push(go('L',[x,y],LB('在「'+z+'」塗耦合凝膠（F）','apply gel at the '+e+' window (F)'),{tol:8,stamp:'gel'}));st.push(go('R',[x,y],LB('探頭放在'+z+'，標記朝向正確（, . 轉）'+(sw?'，上下掃過再擷取':''),'probe on the '+e+', marker correctly oriented (, . rotate)'+(sw?', sweep through, then capture':'')),{tol:6,ang:a,angTol:14,tool:U.probe,img,sweep:sw||0,stamp:'check'}));});
return D('us',{reg:'torso',rv:{preg:U.preg},view:U.view,tolRef:3,inset:'us',t:U.t,g:'左手塗凝膠，右手放探頭、轉對方向，影像清楚再擷取。|Gel with the left; place and orient the probe; capture a clear image.',
tools:{L:['fg'],R:[U.probe,U.probe==='us'?'usC':'us']},start:{L:[-200,300,150],R:[200,300,30]},steps:st});};
B.safetri=()=>D('safetri',{markDz:1,reg:'lat',view:{c:[0,-36],w:230},tolRef:2,t:'胸管安全三角定位（只定位）|Chest-drain safe-triangle landmarks (landmarking only)',g:'摸兩條肌緣，標第五肋間腋中線、第六肋上緣；只定位。|Find both muscle borders; mark the 5th space mid-axillary above the 6th rib; landmarks only.',
tools:{L:['fg'],R:['mk']},start:{L:[90,20,30],R:[-90,30,150]},
dz:[Z('n',[[-60,-12.3],[60,-38.7]],2,'第五肋下緣神經血管束|neurovascular bundle under rib 5','標記在肋骨下緣：真實置管會傷及肋間動脈與神經。|At a rib’s lower border a real drain injures the intercostal artery and nerve.',{by:'R'}),Z('b',null,0,'過低（橫膈／肝脾）|too low (diaphragm / liver / spleen)','位置太低：真實置管可能穿過橫膈傷及肝或脾。|Too low: a real drain may cross the diaphragm into the liver or spleen.',{poly:[[-80,22],[80,-14],[80,120],[-80,120]],by:'R'}),Z('b',null,0,'胸大肌／乳房組織|pectoralis / breast tissue','位置太前：穿過胸大肌與乳房組織。|Too anterior: through pectoralis and breast tissue.',{poly:[[-140,-140],[-44,-140],[-64,30],[-140,30]],by:'R'})],
steps:[go('L',[52,-42],'摸闊背肌前緣（F）|feel the anterior border of latissimus dorsi (F)',{tol:6}),go('L',[-50,-42],'摸胸大肌外緣（F）|feel the lateral border of pectoralis major (F)',{tol:6}),go('R',[0,-17.5],'第五肋間、腋中線、緊貼第六肋上緣標記|mark the 5th space, mid-axillary line, just above the 6th rib',{tol:3,tool:'mk',stamp:'x'})]});
B.biopsy=()=>D('biopsy',{reg:'skin',view:{c:[0,0],w:52},magMax:4,tolRef:.5,t:'皮膚切片：邊緣標記與取樣點|Skin biopsy: margin marking and sampling site',g:'先畫 2 mm 邊界，垂直皮紋繃皮，環鑽取最具代表處。|Draw a 2 mm margin, stretch across the skin lines, punch the most representative area.',
tools:{L:['fg'],R:['mk','pun']},start:{L:[-16,18,130],R:[18,14,40]},marks:[{t:'line',p:ring(0,0,8.4,60),col:'rgba(107,47,168,.35)',dash:1,closed:1}],
steps:[tr('R',ring(0,0,8.4,64),'Space 開始，沿虛線在病灶外 2 mm 畫邊界|Space to start, draw the 2 mm margin on the dotted line',{band:.6,closed:1,ink:'ink',tool:'mk'}),hL(0,12,'垂直皮紋方向繃緊皮膚（F）|stretch the skin perpendicular to the skin lines (F)',2),
go('R',[3.2,-1.8],'換環鑽（Tab），對準最隆起、最深色處（Space）|switch to the punch (Tab), centre it on the most raised, darkest area (Space)',{tol:.8,need:'L',tool:'pun',stamp:'punch'}),rel('L')]});
B.ellipse=()=>{const pts=lens(0,0,16.5,11,25);return D('ellipse',{reg:'face',view:{c:[0,0],w:60},magMax:4,tolRef:.6,t:'順皮紋的梭形切除設計|Fusiform excision along the skin lines',g:'長軸順皮紋、長寬約 3:1，繃皮後沿虛線畫梭形。|Long axis along the skin lines, about 3:1; tension and trace the outline.',
tools:{L:['fg'],R:['mk']},start:{L:[-18,18,130],R:[20,16,40]},marks:[{t:'line',p:pts,col:'rgba(107,47,168,.35)',dash:1,closed:1}],
steps:[hL(-6,14,'沿短軸方向繃緊皮膚（F）|tension the skin along the short axis (F)',2),tr('R',pts,'Space 開始，沿虛線畫出梭形|Space to start, trace the fusiform outline',{band:.8,closed:1,need:'L',ink:'ink',tool:'mk'}),rel('L')]});};
B.contour=()=>{const pts=ring(-20,0,12,64);return D('contour',{reg:'slice',rv:{v:'hn'},view:{c:[-6,6],w:140},magMax:3,tolRef:1,t:'放射治療：勾畫 CTV（GTV＋5 mm）|Radiotherapy: contour the CTV (GTV + 5 mm)',g:'沿 GTV 外 5 mm 畫閉合輪廓，避開脊髓與腮腺；不涉及劑量。|Trace 5 mm outside the GTV, avoiding cord and parotid; no dose involved.',
tools:{L:['fg'],R:['ctr']},start:{L:[-50,50,140],R:[20,40,40]},marks:[{t:'line',p:pts,col:'rgba(255,220,0,.45)',dash:1,closed:1}],
dz:[Z('oar',null,0,'脊髓 PRV|spinal-cord PRV','輪廓侵入脊髓：照射範圍包含脊髓，可能造成放射性脊髓病變。|The contour includes the cord: risk of radiation myelopathy.',{c:[0,33],r:8.5}),Z('oar',null,0,'右側腮腺|right parotid','輪廓包到腮腺：口乾症風險增加。|Including the parotid raises the risk of xerostomia.',{poly:arc(-45,8,8,14,0,360,24)})],
steps:[tr('R',pts,'Space 開始，沿黃色虛線畫閉合輪廓|Space to start, trace the closed contour on the yellow dotted line',{band:1.2,closed:1,ink:'contour',tool:'ctr'})]});};
B.measure=()=>{const c0=[-55,-10],a=20*D2R,A=[c0[0]-16*Math.cos(a),c0[1]-16*Math.sin(a)],Bp=[c0[0]+16*Math.cos(a),c0[1]+16*Math.sin(a)],C=[c0[0]+10*Math.sin(a),c0[1]-10*Math.cos(a)],Dd=[c0[0]-10*Math.sin(a),c0[1]+10*Math.cos(a)];
return D('measure',{reg:'slice',rv:{v:'liver'},view:{c:[-50,-4],w:120},magMax:3,tolRef:.8,t:'病灶測量：長軸與垂直短軸|Lesion measurement: long and perpendicular short axis',g:'先量最長徑，再量與之垂直的短徑。|Longest diameter first, then the perpendicular short axis.',
tools:{L:['cal'],R:['cal']},start:{L:[-90,30,150],R:[-10,30,30]},
steps:[go('L',A,'卡尺放在病灶長軸一端（F）|caliper on one end of the long axis (F)',{tol:1.5,hold:1,stamp:'dot'}),go('R',Bp,'卡尺放在長軸另一端|caliper on the other end of the long axis',{tol:1.5,need:'L',stamp:'meas',pair:A}),rel('L'),
go('L',C,'短軸一端（與長軸垂直）（F）|one end of the perpendicular short axis (F)',{tol:1.5,hold:1,stamp:'dot'}),go('R',Dd,'短軸另一端|the other end of the short axis',{tol:1.5,need:'L',stamp:'meas',pair:C}),rel('L')]});};
B.room=()=>D('room',{reg:'bench',rv:{v:'room'},view:{c:[0,0],w:210},tolRef:3,t:'精神科會談室安全布置|Psychiatric interview-room safety',g:'出口暢通、坐近門不擋路、移走尖銳物、找警鈴。|Exit clear, sit near the door, remove sharps, find the alarm.',
tools:{L:['fg'],R:['fg']},start:{L:[-90,60,140],R:[90,60,40]},
dz:[Z('pain',null,0,'遠離出口的座位|seat far from the exit','坐在離門最遠處：情況升高時你和病人都被困住。|Furthest from the door: if things escalate, you are both trapped.',{c:[-30,34],r:9,by:'R'})],
steps:[gR(79,-60,'確認出口（門）暢通|confirm the exit door is clear',6),gR(30,-20,'選擇靠門、但不擋住病人出口的座位|choose the seat near the door that does not block the patient',6),gR(10,1,'移走桌上的剪刀／筆|remove the scissors / pen from the table',5),gR(86,10,'找到警鈴|locate the alarm',5)]});
B.mse=()=>D('mse',{reg:'bench',rv:{v:'mse'},view:{c:[0,0],w:160},tolRef:3,t:'精神狀態檢查（MSE）觀察順序|Mental-state examination: observation order',g:'外觀→行為→言語→情緒→思考→知覺→認知→病識感→風險。|Appearance → behaviour → speech → mood → thought → perception → cognition → insight → risk.',
tools:{L:['fg'],R:['fg']},start:{L:[-70,40,140],R:[70,50,40]},
steps:MSE.map(m=>go('R',m.p,LB(''+m.n[0],m.n[1]),{tol:6,stamp:'check'}))});
B.rights=()=>D('rights',{reg:'bench',rv:{v:'meds'},view:{c:[0,6],w:176},tolRef:3,t:'給藥五對與條碼掃描（不含劑量）|Five rights and barcode scanning (no doses)',g:'掃腕帶、拿對藥（小心外觀相似）、掃藥瓶、勾五對；不含劑量。|Scan the wristband, pick the right drug (look-alikes!), scan it, tick the five rights; no doses.',
tools:{L:['fg'],R:['scan','fg']},start:{L:[-30,60,140],R:[70,-60,40]},
dz:VIALS.slice(1).map(v=>Z('wrong',null,0,v.n,'拿錯外觀相似的藥品：給藥錯誤（藥品錯誤）。|Picking the look-alike: a wrong-drug error.',{c:v.p,r:6,by:'L'})),
steps:[go('R',[-36,-34],'掃描病人腕帶條碼|scan the wristband barcode',{tol:5,tool:'scan',stamp:'check'}),go('L',VIALS[0].p,'拿起醫囑的藥品 A（F）|pick up the ordered drug A (F)',{tol:4,hold:1,carry:0}),
go('R',S=>[S.tips.L.x,S.tips.L.y+2],'掃描左手藥瓶的條碼|scan the barcode on the vial in the left hand',{tol:5,need:'L',tool:'scan',stamp:'check'}),rel('L')]
.concat(RIGHTS.map((r,i)=>go('R',[28,33+i*5.6],LB('勾選「'+r[0]+'」','tick "'+r[1]+'"'),{tol:2.6,tool:'fg',stamp:'check'})))});
const PED=[['I-1',-25,-30,'sq','父（未患病）','father (unaffected)'],['I-2',25,-30,'ci','母（未患病）','mother (unaffected)'],['I',0,-30,'hline','婚配線','mating line'],['sib',0,-8,'sib','子代線','sibship line'],['II-1',-30,15,'sqf','兒子（患病）','son (affected)'],['II-2',0,15,'ci','女兒（未患病）','daughter (unaffected)'],['II-3',30,15,'sqfp','先證者（患病男性）','proband (affected male)']];
B.pedigree=()=>D('pedigree',{reg:'bench',rv:{v:'pedigree'},view:{c:[0,0],w:162},tolRef:2,t:'繪製家系圖（標準符號）|Drawing a pedigree (standard symbols)',g:'□男 ○女，塗滿＝患病，箭頭＝先證者。|□ male, ○ female, filled = affected, arrow = proband.',
tools:{L:['fg'],R:['mk']},start:{L:[-60,46,140],R:[60,46,40]},
steps:PED.slice(0,2).map(p=>go('R',[p[1],p[2]],LB(''+p[0]+' '+p[4],p[0]+' '+p[5]),{tol:2.5,stamp:p[3]})).concat([hL(0,-23,'按住直尺（F）|hold the ruler (F)',4)],PED.slice(2,4).map(p=>go('R',[p[1],p[2]],LB('畫'+p[4],'draw the '+p[5]),{tol:2.5,need:'L',stamp:p[3]})),[rel('L')],PED.slice(4).map(p=>go('R',[p[1],p[2]],LB(''+p[0]+' '+p[4],p[0]+' '+p[5]),{tol:2.5,stamp:p[3]})))});
B.karyo=()=>D('karyo',{reg:'bench',rv:{v:'karyo'},view:{c:[0,0],w:162},tolRef:2,t:'核型配對：同源染色體|Karyotype pairing: homologous chromosomes',g:'依長度、著絲點與帶型配對同源染色體。|Pair homologues by length, centromere and banding.',
tools:{L:['fg'],R:['fg']},start:{L:[-60,44,140],R:[60,44,40]},
steps:KARYO.reduce((a,k,i)=>a.concat([go('L',k.free,'夾起染色體（F）|pick up the chromosome (F)',{tol:4,hold:1,carry:i}),go('R',k.slot,LB('放到第 '+k.n+' 號同源位置','place it at homologue '+k.n),{tol:4,need:'L',place:i}),rel('L')]),[])});
B.layers=()=>D('layers',{reg:'bench',rv:{v:'section'},view:{c:[0,0],w:130},tolRef:.8,t:'體壁層次由淺到深|Body-wall layers from superficial to deep',g:'由淺到深點出每一層。|Point to each layer, superficial to deep.',
tools:{L:['fg'],R:['fg']},start:{L:[-56,36,140],R:[56,36,40]},
steps:SECTION.slice(0,7).map((l,i)=>go('R',[-40+i*13,(l.y0+l.y1)/2],LB(''+l.n[0],l.n[1]),{tol:Math.max(.5,(l.y1-l.y0)/2),stamp:'check',tolX:8}))});
B.landmarks=()=>D('landmarks',{reg:'torso',view:{c:[0,10],w:380},tolRef:4,t:'體表解剖標記|Surface anatomy landmarks',g:'依序點出體表標記。|Point to each landmark in turn.',
tools:{L:['fg'],R:['fg']},start:{L:[-190,-200,150],R:[190,200,30]},
steps:[[0,-163,'胸骨角','sternal angle'],[0,-50,'劍胸關節','xiphisternal joint'],[88,-58,'心尖','apex'],[0,95,'臍','umbilicus'],[-112,196,'右側髂前上棘','right ASIS'],[-73,157,'McBurney 點','McBurney’s point']].map(([x,y,z,e])=>go('R',[x,y],LB(''+z,e),{tol:6,stamp:'check'}))});
B.specimen=()=>{const pts=lens(-20,0,18,12,0);return D('specimen',{reg:'bench',rv:{v:'grossing'},view:{c:[-6,0],w:166},tolRef:1,t:'檢體定向、上墨與包埋|Specimen orientation, inking and cassette',g:'夾中央不壓切緣，上墨一圈，入盒核對標籤。|Hold the centre, ink all round, cassette and check the label.',
tools:{L:['fT','fg'],R:['ink','fg']},start:{L:[-70,40,140],R:[30,40,40]},marks:[{t:'line',p:pts,col:'rgba(20,110,50,.35)',dash:1,closed:1}],
dz:[Z('cap',pts,.9,'手術切緣|surgical margin','夾壓切緣：組織變形，切緣判讀不準。|Crushing the margin distorts it: unreliable margin assessment.',{by:'L'})],
steps:[go('L',[-20,1.5],'鑷子夾住檢體中央（F）|forceps hold the specimen centre (F)',{tol:2.6,hold:1,tool:'fT'}),tr('R',pts,'Space 開始，沿邊緣上墨一圈|Space to start, ink the margin all round',{band:1.2,closed:1,need:'L',ink:'tink',tool:'ink'}),rel('L'),
go('R',[59,-21],'把檢體放進包埋盒|place the specimen in the cassette',{tol:6,tool:'fg',stamp:'check'}),go('L',[60,26],'按住申請單（F）|hold the requisition (F)',{tol:6,hold:1,tool:'fg'}),go('R',[59,-34],'核對包埋盒標籤與申請單|check the cassette label against the requisition',{tol:4,need:'L',tool:'fg',stamp:'check'}),rel('L')]});};
B.smear=()=>D('smear',{reg:'bench',rv:{v:'slide'},view:{c:[-6,-10],w:92},magMax:3,tolRef:.6,t:'血液抹片：推片角度與速度|Blood film: spreader angle and stroke',g:'推片 30–45° 碰血滴，再穩定向前推出羽狀緣。|Spreader at 30–45° into the drop, then one steady forward stroke.',
tools:{L:['fg'],R:['sld']},start:{L:[30,-24,300],R:[-10,-26,215]},
steps:[hL(25,0,'壓住玻片標籤端（F）|hold the label end of the slide (F)',3),go('R',[-21,0],'推片 30–45° 放在血滴前（, . 調角度）|spreader at 30–45° just in front of the drop (, . angle)',{tol:1.5,ang:215,angTol:8,need:'L',tool:'sld',miss:'角度太陡：抹片又厚又短；太平：太薄太長。|Too steep makes a thick, short film; too shallow a thin, long one.'}),
go('R',[-25.5,0],'往後碰到血滴，讓血沿邊緣散開|back into the drop; let it spread along the edge',{tol:1.2,need:'L',tool:'sld'}),tr('R',[[-25.5,0],[12,0]],'Space 開始，保持角度穩定往前推|Space to start, push forward steadily at the same angle',{band:1.2,need:'L',ink:'smear',tool:'sld',angLock:[215,10]}),rel('L')]});
B.aseptic=()=>{const zz=[];for(let i=0;i<=8;i++)zz.push([-6+(i%2?7:-7),-8+i*2]);
return D('aseptic',{reg:'limb',rv:{v:'forearm',iv:1},view:{c:[-24,10],w:170},tolRef:2,t:'無菌非觸碰技術（ANTT）換敷料|Aseptic non-touch technique: dressing change',g:'撕舊敷料、來回消毒；非無菌左手不碰關鍵部位。|Remove, scrub; the non-sterile left hand never touches the key site.',
tools:{L:['fg'],R:['fN','spg','fgS','mk']},start:{L:[-110,50,140],R:[60,40,40]},marks:[{t:'pack',p:[-80,42]}],
dz:[Z('key',null,0,'關鍵部位（插入點）|key site (insertion point)','非無菌的手碰到已消毒的關鍵部位：導管相關血流感染風險。|A non-sterile hand touched the key site: line-infection risk.',{c:[-6,0],r:6,by:'L',from:2})],
steps:[go('R',[20,-12],'由外往插入點方向低角度撕除舊敷料|peel the old dressing low and slow toward the insertion site',{tol:3,tool:'fN',stamp:'peel'}),tr('R',zz,'換消毒棒，在插入點來回擦拭（Space 開始／結束）|switch to the applicator; scrub back and forth over the site (Space start/stop)',{band:2.6,ink:'clean',tool:'spg',cov:.85}),
go('L',[-80,42],'只拿新敷料的邊緣（F）|hold only the edges of the new dressing (F)',{tol:4,hold:1,tool:'fg'}),go('R',[-6,0],'把敷料置中貼在插入點上|centre the dressing over the insertion site',{tol:2,need:'L',tool:'fgS',stamp:'dressing'}),rel('L'),go('R',[16,11],'換標記筆，在敷料邊註記日期|switch to the marker and date the dressing border',{tol:3,tool:'mk',stamp:'check'})]});};
B.hygiene=()=>D('hygiene',{reg:'limb',rv:{v:'hands'},view:{c:[0,-30],w:240},tolRef:4,t:'WHO 乾洗手六步驟|WHO hand-rub: six steps',g:'六個部位各搓 3 下：順序與覆蓋都重要。|Three strokes at each of six areas: order and coverage matter.',
tools:{L:['fg'],R:['fg']},start:{L:[-120,60,140],R:[120,60,40]},
steps:[[-60,18,'掌心對掌心','palm to palm'],[60,18,'手背（右掌搓左手背，交換）','backs of hands'],[63,-38,'指縫（手指交叉）','finger webs'],[56,-80,'指背','backs of fingers'],[-110,-36,'拇指旋轉搓','rotational thumbs'],[-62,0,'指尖在掌心旋轉','fingertips in the palm']].map(([x,y,z,e],i)=>adv('R',[x,y],3,LB(`第 ${i+1} 步：${z}（Space ×3）`,`Step ${i+1}: ${e} (Space ×3)`),{tol:9,step:0,stamp:'check'}))});
B.ppe=()=>D('ppe',{reg:'bench',rv:{v:'ppe'},view:{c:[0,0],w:140},tolRef:2.5,t:'脫除個人防護裝備順序|Doffing personal protective equipment',g:'正面都算污染：手套→護目鏡→隔離衣→口罩→手部衛生。|Fronts are contaminated: gloves → goggles → gown → mask → hand hygiene.',
tools:{L:['fg'],R:['fg']},start:{L:[-56,46,140],R:[56,46,40]},
dz:[Z('key',null,0,'護目鏡正面|front of goggles','手碰護目鏡正面：自我污染。|Touching the front of the goggles: self-contamination.',{c:[0,-35.5],r:3,by:'R'}),Z('key',null,0,'口罩正面|front of mask','手碰口罩正面：自我污染。|Touching the front of the mask: self-contamination.',{c:[0,-25],r:2.8,by:'R'})],
steps:[go('L',[33,21],'捏住右手手套掌側外面（F）|pinch the outside of the right glove at the palm (F)',{tol:3}),gR(-30,16,'沒戴手套的手指伸入左手套內側脫下|ungloved fingers slide inside the left glove to remove it',3),gR(11,-36,'拿護目鏡耳掛處移除|remove the goggles by the ear-pieces',2.6),
gR(-15,-26,'解開隔離衣頸部綁帶|untie the gown at the neck',2.6),gR(-10,-23,'拿口罩下方綁帶移除|remove the mask by the lower strap',2.2),gR(46,46,'手部衛生|hand hygiene',6)]});
B.cpr=()=>D('cpr',{markDz:1,reg:'torso',view:{c:[0,-84],w:270},tolRef:4,t:'胸外按壓：手的位置與節奏|Chest compressions: hand position and rate',g:'掌根放胸骨下半段、雙手扣指，每分鐘 100–120 下並完全回彈。|Heel on the lower sternum, hands interlocked, 100–120 per minute with full recoil.',
tools:{L:['fg'],R:['fg']},start:{L:[-120,-10,150],R:[120,-10,30]},
dz:[Z('b',null,0,'劍突|xiphoid','壓在劍突上：肝臟損傷，按壓無效。|Pressing on the xiphoid: liver injury and ineffective compressions.',{c:[0,-28],r:14}),Z('b',null,0,'肋骨（偏外側）|ribs (too lateral)','手放偏外側：肋骨骨折、按壓無效。|Hands too lateral: rib fractures and ineffective compressions.',{poly:[[40,-170],[200,-170],[200,0],[40,0]]})],
steps:[hL(0,-76,'掌根放在胸骨下半段中央（F）|heel of the hand on the lower half of the sternum (F)',8),go('R',[0,-76],'疊在左手上、手指互扣（Space）|on top of the left hand, fingers interlocked (Space)',{tol:9,need:'L'}),adv('R',[0,-76],12,'Space 以 100–120 次／分節奏按壓 12 下|Space 12 compressions at 100–120 per minute',{tol:11,step:0,need:'L',rhythm:[500,600]}),rel('L')]});
B.airway=()=>{const ax=200;return D('airway',{reg:'airway',view:{c:[-14,-2],w:200},magMax:2,tolRef:2,inset:'laryngo',t:'直接喉鏡：左手上提、右手置管|Direct laryngoscopy: lift with the left, intubate with the right',g:'左手喉鏡入會厭谷、沿把手上提（不撬門齒），右手置管。|Left blade in the vallecula, lift along the handle (no levering); right passes the tube.',
tools:{L:['lar'],R:['ett']},start:{L:[-74,-48,ax],R:[-80,-10,200]},
dz:[Z('teeth',null,0,'上門齒|upper incisors','以門齒為支點撬：牙齒斷裂，視野反而更差。|Levering on the incisors breaks teeth and worsens the view.',{c:[-56,-32],r:5}),Z('b',null,0,'食道|oesophagus','管子進入食道：未發現的食道插管會造成缺氧。|Tube in the oesophagus: unrecognised oesophageal intubation causes hypoxia.',{c:[27,13],r:4.5,by:'R'})],
steps:[go('L',[4,-13],'刀片尖端放進會厭谷，沿把手方向上提（F；Q／E 調角度）|blade tip into the vallecula, lift along the handle (F; Q/E to angle)',{tol:3.2,hold:1,ang:ax,angTol:15,angDz:0,tool:'lar'}),go('R',[24,-3],'看見聲門後，把管子放過聲帶（Space）|with the cords in view, pass the tube between them (Space)',{tol:3,need:'L',tool:'ett',img:'cords'}),rel('L')]});};
B.leopold=()=>D('leopold',{reg:'torso',rv:{preg:1},view:{c:[0,96],w:380},tolRef:6,t:'Leopold 四步觸診|Leopold manoeuvres',g:'①子宮底 ②兩側 ③恥骨上 ④入盆。|① fundus ② sides ③ suprapubic ④ engagement.',
tools:{L:['fg'],R:['fg']},start:{L:[-180,300,150],R:[180,300,30]},
steps:[hL(-32,-30,'① 子宮底左側（F）|① left side of the fundus (F)',9),gN(32,-30,'① 子宮底右側，判斷哪一極在上|① right side of the fundus — which pole?',9),rel('L'),
hL(-126,100,'② 穩住一側（F）|② steady one side (F)',10),gN(126,100,'② 觸摸對側找胎背|② feel the other side for the fetal back',10),rel('L'),
gR(0,222,'③ 恥骨上方單手握住先露部|③ one-hand grip of the presenting part above the symphysis',9),
hL(-40,214,'④ 面向病人腳端，沿骨盆入口（F）|④ facing the feet, along the pelvic inlet (F)',9),gN(40,214,'④ 判斷是否入盆|④ judge engagement',9),rel('L')]});
B.fistula=()=>D('fistula',{reg:'limb',rv:{v:'forearm',avf:1},view:{c:[30,-6],w:300},tolRef:4,t:'動靜脈廔管評估：看、摸、聽|AV-fistula assessment: look, feel, listen',g:'抬高手臂，摸震顫、聽雜音、看皮膚。|Raise the arm; feel the thrill, hear the bruit, check the skin.',
tools:{L:['fg'],R:['fg','st']},start:{L:[190,50,30],R:[100,60,40]},
steps:[hL(160,0,'托起手腕抬高手臂（F）|lift the wrist to raise the arm (F)',8),go('R',[128,-11],'在吻合口摸連續震顫|feel the continuous thrill at the anastomosis',{tol:5,need:'L',tool:'fg',stamp:'check'}),go('R',[60,-12],'換聽診器，沿靜脈聽連續雜音|switch to the stethoscope; listen for a continuous bruit',{tol:6,need:'L',tool:'st',stamp:'check'}),go('R',[40,-16],'檢查瘤樣擴張處皮膚（變薄、發亮？）|check the skin over the aneurysmal segment (thin, shiny?)',{tol:6,need:'L',tool:'fg',stamp:'check'}),rel('L')]});
B.thyroidPalp=()=>D('thyroidPalp',{markDz:1,reg:'torso',view:{c:[0,-256],w:130},tolRef:2.5,t:'甲狀腺觸診（站在病人後方）|Thyroid palpation (from behind)',g:'先找軟骨與峽部；左手推氣管，右手觸葉、請病人吞嚥。|Cartilages and isthmus first; left displaces the trachea, right palpates on swallowing.',
tools:{L:['fg'],R:['fg']},start:{L:[50,-200,40],R:[-50,-200,140]},
dz:[-1,1].map(s=>Z('a',null,0,'頸動脈竇|carotid sinus','按壓頸動脈竇：心跳變慢、暈厥（年長者尤甚）。|Pressing the carotid sinus can slow the heart and cause syncope.',{c:[s*38,-262],r:6})),
steps:[gR(0,-286,'甲狀軟骨|thyroid cartilage',4),gR(0,-262,'環狀軟骨|cricoid cartilage',4),gR(0,-243,'峽部（環狀軟骨下方）|isthmus (below the cricoid)',4),hL(20,-240,'把氣管輕推向右（F）|gently displace the trachea to the right (F)',4),gN(-22,-240,'觸摸右葉，請病人吞嚥|palpate the right lobe as the patient swallows',4),rel('L')]});
B.joints=()=>D('joints',{reg:'limb',rv:{v:'hand'},view:{c:[0,-40],w:170},tolRef:2,t:'手部關節觸診（MCP／PIP）|Hand joint palpation (MCP / PIP)',g:'托住手腕，依序觸診 MCP 與 PIP。|Support the wrist; palpate the MCP then PIP joints.',
tools:{L:['fg'],R:['fg']},start:{L:[0,90,90],R:[60,30,40]},
steps:[hL(0,50,'托住手腕（F）|support the wrist (F)',6)].concat(HANDJ.mcp.map((p,i)=>go('R',p,LB(`第 ${i+2} 掌指關節`,`MCP ${i+2}`),{tol:3,need:'L',stamp:'check'})),HANDJ.pip.map((p,i)=>go('R',p,LB(`第 ${i+2} 近端指間關節`,`PIP ${i+2}`),{tol:3,need:'L',stamp:'check'})),[rel('L')])});
B.gonio=()=>D('gonio',{reg:'limb',rv:{v:'kneelat'},view:{c:[-14,10],w:340},tolRef:3,t:'量角器擺放：膝關節屈曲|Goniometer placement: knee flexion',g:'軸心在外上髁，兩臂分別對準大轉子與外踝。|Axis on the epicondyle, arms to the trochanter and the malleolus.',
tools:{L:['fg'],R:['fg']},start:{L:[-120,-80,150],R:[60,60,30]},
steps:[hL(-150,-26,'固定臂對準大轉子（F）|stationary arm to the greater trochanter (F)',5),go('R',[0,0],'軸心放在股骨外上髁|axis on the lateral femoral epicondyle',{tol:3,need:'L',stamp:'x'}),go('R',[128,56],'移動臂對準外踝|moving arm to the lateral malleolus',{tol:4,need:'L',stamp:'gon'}),rel('L')]});
B.pressure=()=>D('pressure',{reg:'back',view:{c:[0,-30],w:380},tolRef:5,t:'壓力性損傷好發部位檢查|Pressure-injury site inspection',g:'扶肩翻身，依序檢查骨突處皮膚。|Support the turn; check the skin over each bony prominence.',
tools:{L:['fg'],R:['fg']},start:{L:[-190,-200,150],R:[190,100,30]},
steps:[hL(-160,-232,'扶住肩膀協助側翻（F）|support the shoulder for the turn (F)',9)].concat([[92,-178,'右肩胛下角','right scapular angle'],[-92,-178,'左肩胛下角','left scapular angle'],[0,-133,'胸椎棘突','thoracic spinous processes'],[0,192,'薦骨','sacrum'],[0,228,'尾骨','coccyx']].map(([x,y,z,e])=>go('R',[x,y],LB(''+z,e),{tol:7,need:'L',stamp:'check'})),[rel('L')])});
B.palpBack=()=>D('palpBack',{reg:'back',view:{c:[0,140],w:210},tolRef:3,t:'下背疼痛觸診：小面關節與薦髂關節|Low-back palpation: facet and sacroiliac joints',g:'穩住骨盆，依序觸診小面關節與薦髂關節。|Steady the pelvis; palpate the facets and sacroiliac joints.',
tools:{L:['fg'],R:['fg']},start:{L:[-120,220,150],R:[120,220,30]},
steps:[hL(-110,150,'穩住骨盆（F）|steady the pelvis (F)',8)].concat([[18,118,'右側 L4–L5 小面關節','right L4–L5 facet'],[-18,118,'左側 L4–L5 小面關節','left L4–L5 facet'],[42,168,'右側薦髂關節','right sacroiliac joint'],[-42,168,'左側薦髂關節','left sacroiliac joint']].map(([x,y,z,e])=>go('R',[x,y],LB(''+z,e),{tol:4,need:'L',stamp:'check'})),[rel('L')])});
B.anast=()=>{const st=[];[-.6,0,.6].forEach((y,i)=>{st.push(go('L',[-.62,y-.28],LB(`第 ${i+1} 針 · 顯微鑷輕撐開管口（F）`,`Bite ${i+1} · microforceps open the lumen (F)`),{tol:.3,hold:1}));st.push(go('R',[-.78,y],LB(`第 ${i+1} 針 · 左側管壁入針（距切緣約 2 倍壁厚）`,`Bite ${i+1} · enter the left wall (about two wall-thicknesses from the edge)`),{tol:.16,need:'L',tool:'mn',stamp:'bite'}));st.push(go('R',[.78,y],LB(`第 ${i+1} 針 · 右側管壁對稱出針`,`Bite ${i+1} · exit the right wall symmetrically`),{tol:.16,tool:'mn',stamp:'stitch',pair:[-.78,y]}));st.push(kn([0,y],{rad:5}));st.push(rel('L'));});
return D('anast',{reg:'anast',view:{c:[0,0],w:14},magMax:6,tolRef:.12,t:'顯微血管吻合：前壁三針|Microvascular anastomosis: three front-wall bites',g:'4–6×：撐開管口、對稱入出針、交替打結，針距一致。|At 4–6×: open the lumen, symmetric bites, alternate throws, even spacing.',
tools:{L:['mf'],R:['mn']},start:{L:[-4,3.5,150],R:[4,3.5,30]},steps:st,marks:[-.6,0,.6].reduce((a,y)=>a.concat([{t:'dot',p:[-.78,y],r:.07},{t:'dot',p:[.78,y],r:.07}]),[]),
dz:[Z('cap',null,0,'對側（後壁）|back wall','針穿過管腔勾到後壁：吻合口阻塞、栓塞。|Catching the back wall through the lumen: an occluded, thrombosed anastomosis.',{poly:[[-.3,-1.2],[.3,-1.2],[.3,1.2],[-.3,1.2]],by:'R'})]});};
const DEPTS={
'neurosurgery':'scalp|timeout incise haemo micro|suture retract|bip',
'neurology':'|lumbar fundus wire:neuro||',
'cardiology':'|ecg ausc wire:coronary||',
'cardiac-surgery':'sternum|timeout incise haemo|suture|',
'vascular-surgery':'groin|timeout wire:iliac anast ligate|incise haemo retract suture|',
'thoracic-surgery':'chestlat|timeout incise lap:thorax safetri|haemo suture|',
'orthopedics':'thigh|timeout drillBone retract suture|incise haemo|',
'joint-reconstruction':'knee|timeout cup incise|suture haemo|',
'spine':'backmid|timeout incise pedicle retract|haemo suture dissect|',
'general-surgery':'abd|timeout incise lap:chole ligate|haemo suture retract dissect|',
'urology':'pfann|timeout lap:kidney us:bladder incise|suture haemo|',
'ent':'neck|timeout oto dissect anast|incise haemo suture|',
'ophthalmology':'|timeout rhexis fundus||',
'plastic-surgery':'face|timeout ellipse suture anast|haemo|',
'obstetrics':'pfann|timeout us:fetal leopold incise|suture haemo||1',
'gynecology':'pfann|timeout lap:pelvis us:pelvis incise|suture haemo|',
'pediatric-surgery':'rlq|timeout lap:appendix incise suture|haemo ligate|',
'anesthesiology':'|timeout airway lumbar||',
'pain-medicine':'|lumbar palpBack||',
'dentistry':'|dental cavity||',
'emergency':'|cpr us:fast ecg safetri||',
'critical-care':'|airway us:lung ecg safetri||',
'gastroenterology':'|palp us:gb||',
'pulmonology':'|lungs safetri us:lung||',
'nephrology':'|us:kidney fistula||',
'endocrinology':'|us:thyroid thyroidPalp||',
'rheumatology':'|joints gonio||',
'hematology':'|marrow smear||',
'oncology':'|marrow aseptic||',
'radiation-oncology':'|contour measure||',
'infectious-disease':'|aseptic hygiene||',
'dermatology':'|biopsy ellipse||',
'psychiatry':'|room mse||',
'pediatrics':'|otoChild lungs||',
'rehabilitation':'|gonio pressure||',
'geriatrics-family':'|ausc palp pressure||',
'radiology':'|measure us:liver wire:iliac||',
'pathology-lab':'|specimen smear||',
'nursing':'|ecg aseptic cpr||',
'pharmacology':'|rights aseptic||',
'public-health':'|hygiene ppe||',
'medical-genetics':'|pedigree karyo||',
'foundations':'|layers landmarks||'
};
Object.keys(DEPTS).forEach(k=>{const[site,core,ex,R,preg]=DEPTS[k].split('|');DEPTS[k]={site:site||undefined,core:core.split(' '),ex:ex?ex.split(' '):[],R:R||undefined,preg:preg?1:undefined};});
const KW={
timeout:/time-?out|暫停|查核|核對|WHO|sign-?in|劃刀前|簡報|身分|同意/i,
incise:/切開|切口|劃刀|開顱|開胸|開腹|進腹|入路|皮瓣/i,haemo:/止血|出血|電燒|電凝/i,
ligate:/結紮|血管控制|\btie\b/i,suture:/縫合|關閉|關腹|關顱|縫線/i,retract:/牽開|牽引|暴露|顯露/i,dissect:/剝離|分離|神經保護/i,
micro:/顯微|神經|腫瘤|橋小腦角|CPA/i,rhexis:/白內障|撕囊|水晶體/i,fundus:/眼底|視盤|視乳頭|網膜|眼瞼|視力/i,
oto:/耳|鼓膜/i,otoChild:/耳|鼓膜|發燒/i,dental:/檢查|齲|牙周/i,cavity:/窩洞|充填|齲/i,
wire:/導絲|導管|介入|血栓|支架|PCI/i,lap:/腹腔鏡|胸腔鏡|鏡頭|VATS/i,
pedicle:/螺釘|椎弓根|固定|融合/i,drillBone:/鑽|螺釘|鋼板|骨折/i,cup:/髖|髖臼|置換/i,
lumbar:/腰椎|穿刺|硬膜外|脊髓/i,marrow:/骨髓/i,ecg:/心電圖|導程|心律|ECG|EKG/i,ausc:/聽診|雜音|瓣膜|心音/i,
lungs:/聽診|呼吸音|肺|喘/i,palp:/觸診|腹痛|腹部/i,us:/超音波|掃描|FAST|POCUS/i,safetri:/胸管|氣胸|胸腔引流|肋膜/i,
biopsy:/切片|病灶/i,ellipse:/切除|梭形|疤痕/i,contour:/勾畫|靶區|輪廓|計畫|CTV|GTV/i,measure:/測量|大小|RECIST/i,
room:/安全|暴力|激動|風險/i,mse:/精神狀態|會談|評估|MSE/i,rights:/給藥|五對|條碼|用藥/i,
pedigree:/家系|遺傳/i,karyo:/核型|染色體/i,layers:/層次|組織/i,landmarks:/體表|標記|解剖/i,
specimen:/檢體|切緣|包埋/i,smear:/抹片|血片/i,aseptic:/無菌|敷料|導管|感染|ANTT/i,hygiene:/手部衛生|洗手/i,
ppe:/防護|隔離|PPE/i,cpr:/心肺復甦|按壓|心跳停止|CPR/i,airway:/插管|呼吸道|喉頭鏡/i,leopold:/胎位|觸診|產檢/i,
fistula:/廔管|透析/i,thyroidPalp:/甲狀腺|結節/i,joints:/關節|類風濕|滑膜/i,
gonio:/關節活動度|角度|ROM/i,pressure:/壓傷|褥瘡|翻身/i,palpBack:/下背|腰痛|薦髂|小面/i,anast:/吻合|繞道/i,
};
const DRILL_KEYS=Object.keys(B);
function cfgFor(dept){return DEPTS[dept]||DEPTS[String(dept||'').replace(/_/g,'-')]||null;}
function buildDrill(spec,dept){const cfg=cfgFor(dept)||{},[key,v]=String(spec).split(':');const f=B[key];if(!f)return null;const d=f(cfg,v);d.id=spec;d.dept=dept;d.core=(cfg.core||[]).includes(spec);return d;}
function templateFor(department,stage,caseInfo){let dept=department;if(!cfgFor(dept)){const s=String(department||'')+' '+(caseInfo&&(caseInfo.department||caseInfo.id)||'');dept=Object.keys(DEPTS).find(k=>s.indexOf(k)>=0)||(/surg/i.test(s)?'general-surgery':'foundations');}
const cfg=DEPTS[dept];return{id:dept,department:dept,site:cfg.site||null,drills:cfg.core.slice(),extra:(cfg.ex||[]).slice()};}
function stageText(stage,caseInfo){const f=v=>!v?'':typeof v==='string'?v:[v.zh,v.en].filter(Boolean).join(' ');return[stage&&f(stage.title),stage&&f(stage.question),stage&&f(stage.evidence),caseInfo&&f(caseInfo.station),caseInfo&&f(caseInfo.title)].join(' ');}
function drillsFor(department,stage,caseInfo){const tp=typeof department==='object'&&department?department:templateFor(department,stage,caseInfo),txt=stageText(stage,caseInfo),title=stageText(stage,null);
const score=(spec,i,core)=>{const k=spec.split(':')[0];let s=core?4-i*.3:0;if(KW[k]&&KW[k].test(title))s+=12;else if(KW[k]&&KW[k].test(txt))s+=6;return s;};
const list=tp.drills.map((d,i)=>({id:d,s:score(d,i,1)})).concat(tp.extra.map((d,i)=>({id:d,s:score(d,i,0)})).filter(x=>x.s>=6));
return list.sort((a,b)=>b.s-a.s).map(x=>{const d=buildDrill(x.id,tp.department);return{id:x.id,key:d.key,title:d.t,goal:d.g,core:d.core,suggested:false,score:x.s};}).map((d,i)=>Object.assign(d,{suggested:i===0}));}
function templates(){return Object.keys(DEPTS).map(dept=>{const cfg=DEPTS[dept];return{id:dept,departments:[dept],site:cfg.site||null,drills:cfg.core.map(id=>{const d=buildDrill(id,dept);return{id,key:d.key,title:d.t,steps:d.steps.length};}),extra:(cfg.ex||[]).slice()};});}
TREES.coronary.route=[['LM',1],['LAD',1]];TREES.iliac.route=[['REIA',-1],['RCIA',-1],['LCIA',1],['LEIA',1]];TREES.neuro.route=[['ICA',1],['M1',1],['M2s',1]];
function routePts(tr){const out=[];tr.route.forEach(([id,dir])=>{const s=tr.segs.find(x=>x.id===id);const p=dir>0?s.p:s.p.slice().reverse();p.forEach(q=>{if(!out.length||hyp(q[0]-out[out.length-1][0],q[1]-out[out.length-1][1])>.01)out.push(q);});});const r=resample(out,.8);const i=r.reduce((b,p,j)=>hyp(p[0]-tr.target[0],p[1]-tr.target[1])<hyp(r[b][0]-tr.target[0],r[b][1]-tr.target[1])?j:b,0);return r.slice(0,i+1).concat([tr.target.slice()]);}
const GR=['S','A','B','C','D'];
const HC={L:'#2a74d4',R:'#cf7a17'};
const KCOL={a:'#d0342c',v:'#4b5fb0',n:'#e9d27a',d:'#7aa246',b:'#c98a72',u:'#e9d8b0',du:'#7f8fb8',p:'#c9c9d6',oar:'#ff5a4f',cap:'#ffffff',cusp:'#ffd54a',wall:'#ff5a4f',pain:'#ff9f43',conus:'#ff5a4f',wrong:'#ff5a4f',key:'#ff5a4f',teeth:'#ffffff'};
function bestKey(){return 'ht-field-best-v1';}
function loadBest(){try{return JSON.parse(W.localStorage.getItem(bestKey())||'{}')||{};}catch(_){return{};}}
function saveBest(map){try{W.localStorage.setItem(bestKey(),JSON.stringify(map));}catch(_){}}
function createField(host,opts){
opts=opts||{};
const tpl=templateFor(opts.department,opts.stage,opts.caseInfo),list=drillsFor(tpl,opts.stage,opts.caseInfo);
if(opts.drill&&!list.some(d=>d.id===opts.drill)&&(tpl.drills.includes(opts.drill)||tpl.extra.includes(opts.drill))){const d=buildDrill(opts.drill,tpl.department);list.unshift({id:opts.drill,key:d.key,title:d.t,goal:d.g,core:d.core,suggested:false,score:0});}
const RM=opts.reducedMotion!=null?!!opts.reducedMotion:reduced();
let S=null,destroyed=false,raf=0,slowT=0,settleT=0,cv=null,ctx=null,W0=600,H0=420,dpr=1,ro=null,lastTap={h:null,t:0},drag=null,pinch=null,pointers=new Map(),msgT=0,runTok=0;
const uid='sf'+Math.floor(Math.random()*1e6);
const caseId=(opts.caseInfo&&opts.caseInfo.id)||'practice',stageIdx=opts.stageIndex|0;
function initState(id){
const D0=buildDrill(id,tpl.department);if(!D0)return;
const mk=(h,d)=>{const s=(D0.start&&D0.start[h])||d;const tl=D0.tools[h];return{x:s[0],y:s[1],a:s[2],tool:tl[0],eng:false,ox:0,oy:0,ot:0,mv:[],sx:s[0],sy:s[1]};};
const v=D0.view;
S={D:D0,si:0,tips:{L:mk('L',[v.c[0]-v.w*.24,v.c[1]+v.w*.18,140]),R:mk('R',[v.c[0]+v.w*.24,v.c[1]+v.w*.18,40])},active:'R',hold:{L:null,R:null},cuts:[],stamps:[],blood:[],leaks:[],fx:[],labels:[],mag:1,fine:false,
m:{devSum:0,devN:0,devMax:0,travel:0,misses:0,dangers:0,coordOK:0,coordBad:0,misalign:0,t0:0,hits:[]},last:{},kn:0,adv:{n:0,t:0,depth:0},tr:null,lumen:null,carry:null,placed:{},smear:0,contrast:0,sweep:null,done:false,result:null,assisted:false,demo:null,tremorOff:false,outView:false,peeled:false,bleedT:0,spawned:0,fail:false};
if(D0.lumen)S.lumen={trail:[D0.lumen.entry.slice()],push:0,pushT:0,routed:routePts(D0.lumen)};
if(D0.bleed){D0.bleed.pts.slice(0,D0.bleed.start).forEach((p,i)=>S.blood.push(src(p,i)));S.spawned=D0.bleed.start;}
const v0=D0.view,m0=Math.max(D0.tolRef*6,v0.w*.05),fx=[v0.c[0]-v0.w/2,v0.c[1]-v0.w*.33,v0.c[0]+v0.w/2,v0.c[1]+v0.w*.33];allTargets(D0).forEach(p=>{fx[0]=Math.min(fx[0],p[0]-m0);fx[1]=Math.min(fx[1],p[1]-m0);fx[2]=Math.max(fx[2],p[0]+m0);fx[3]=Math.max(fx[3],p[1]+m0);});S.fit=fx;const bw=(fx[2]-fx[0])*.2,bh=(fx[3]-fx[1])*.25;S.bounds=[fx[0]-bw,fx[1]-bh,fx[2]+bw,fx[3]+bh];
S.ideal=idealLen(D0);prepStep();updateUI(true);requestDraw();
}
function allTargets(D0){const o=[];D0.steps.forEach(st=>{if((st.t==='go'||st.t==='adv')&&Array.isArray(st.p))o.push(st.p);else if(st.t==='trace')st.path.forEach(p=>o.push(p));else if(st.t==='knot')o.push(st.at);else if(st.t==='lumen')o.push(st.target,D0.lumen.entry);});return o;}
function src(p,i){return{x:p[0],y:p[1],vol:18+i*6,rate:i%2?26:18,on:1,seed:7+i*13};}
function idealLen(D0){const pos={L:[D0.start?D0.start.L[0]:0,D0.start?D0.start.L[1]:0],R:[D0.start?D0.start.R[0]:0,D0.start?D0.start.R[1]:0]};let s=0;
D0.steps.forEach(st=>{if(st.t==='go'||st.t==='adv'){const p=typeof st.p==='function'?null:st.p;if(p){s+=hyp(p[0]-pos[st.h][0],p[1]-pos[st.h][1]);pos[st.h]=p;}}else if(st.t==='trace'){s+=hyp(st.path[0][0]-pos[st.h][0],st.path[0][1]-pos[st.h][1])+plen(st.path,st.closed)*(st.passes||1);pos[st.h]=st.path[st.closed?0:st.path.length-1];}else if(st.t==='lumen'){s+=plen(routePts(D0.lumen));}});
return Math.max(1,s);}
const cur=()=>S&&S.D.steps[S.si];
const tipOf=h=>S.tips[h];
function eff(h){const t=S.tips[h],f=S.tremorOff?0:Math.exp(-(now()-t.ot)/150);return[t.x+t.ox*f,t.y+t.oy*f];}
function tgt(st){return!st||!st.p?null:typeof st.p==='function'?st.p(S):st.p;}
function holdOK(h){const hd=S.hold[h];if(!hd)return false;const e=eff(h);return hyp(e[0]-hd.p[0],e[1]-hd.p[1])<=hd.tol;}
function prepStep(){const st=cur();S.sweep=null;S.adv={n:0,t:0,depth:0};S.kn=0;
if(st&&st.t==='trace'){const res=resample(st.path,.5,st.closed);S.tr={res,depth:new Uint8Array(res.length),vis:null,stroke:null};}else S.tr=null;
if(st&&st.t==='rel'){S.hold[st.h]=null;if(st.h==='L'&&S.carry!=null)S.carry=null;S.si++;prepStep();return;}
if(st&&(st.t==='go'||st.t==='adv')&&st.tool&&!toolOK(st.h,st.tool)&&S.si===0)setTool(st.h,Array.isArray(st.tool)?st.tool[0]:st.tool,true);
if(!st&&!S.done)finish(false);
}
function toolOK(h,need){if(!need)return true;const t=S.tips[h].tool;return Array.isArray(need)?need.includes(t):need===t;}
function toolName(id){return L2((TOOLS[id]||{}).n||id);}
function needTool(h,st){return Array.isArray(st.tool)?st.tool[0]:st.tool;}
function msg(text,kind){if(kind!=='danger'&&S.dangerT&&now()-S.dangerT<900)return;if(kind==='danger')S.dangerT=now();S.msg=text;S.msgKind=kind||'info';const n=host.querySelector('[data-sf-msg]');if(n){n.textContent=text;n.className='sf-msg '+(kind||'info');}if(opts.onMessage)try{opts.onMessage(text,kind);}catch(_){}}
function stepSize(fine){return(fine?.2:1)/Math.max(1,S.mag);}
function nudge(h,sx,sy,fine,repeat){if(!S||S.done||S.demoLock)return;const t=S.tips[h],f=!!(fine||S.fine);t.rep=repeat?Math.min(60,(t.rep||0)+1):0;const acc=!f&&t.rep>8?Math.min(4,1+(t.rep-8)/10):1;const st=stepSize(f)*acc;moveBy(h,sx*st,sy*st,f);}
function moveBy(h,dx,dy,fine,noTremor){
if(!S||S.done)return;if(!S.m.t0)S.m.t0=now();const t=S.tips[h],before=eff(h),st=cur();
let nx=t.x+dx,ny=t.y+dy;const b=bounds();nx=clamp(nx,b[0],b[2]);ny=clamp(ny,b[1],b[3]);
const tm=now();t.mv.push([tm,hyp(nx-t.x,ny-t.y)]);while(t.mv.length&&tm-t.mv[0][0]>400)t.mv.shift();
const speed=t.mv.reduce((s,m)=>s+m[1],0)/.4;let sig=(0.035+0.016*speed)*(fine||S.fine?.35:1)*Math.max(.12,S.D.tolRef);sig=Math.min(sig,.9*Math.max(.2,S.D.tolRef));
if(S.tremorOff||noTremor)sig=0;const r=S.rng||(S.rng=rng(99));
if(S.lumen&&h==='R'&&st&&st.t==='lumen'){const ok=lumenOK(t,[nx,ny]);if(!ok){requestDraw();return;}}
t.x=nx;t.y=ny;t.ox=gauss(r)*sig;t.oy=gauss(r)*sig;t.ot=tm;t.sig=sig;S.active=h;
const after=eff(h);S.m.travel+=hyp(after[0]-before[0],after[1]-before[1]);
if(S.lumen&&h==='R')trail(after);
if(st&&st.t==='trace'&&st.h===h&&t.eng)traceMove(st,h,before,after);
if(st&&st.t==='go'&&st.h===h&&st.sweep){const p=tgt(st);if(hyp(after[0]-p[0],after[1]-p[1])<=st.tol*2.6){if(!S.sweep)S.sweep={min:after[1],max:after[1]};S.sweep.min=Math.min(S.sweep.min,after[1]);S.sweep.max=Math.max(S.sweep.max,after[1]);}}
if(S.D.camera&&h==='R')camCheck();
dangerMove(h,after);holdCheck();if(S.bleedOn&&h==='L')suction(after,.08);requestDraw();updateRead();
}
function bounds(){return S.D.camera?[-88,-68,88,68]:S.bounds;}
function rotate(h,dir,fine){if(!S||S.done)return;const t=S.tips[h];t.a=angN(t.a+dir*(fine?1:5));S.active=h;requestDraw();updateRead();}
function setTool(h,id,quiet){if(!S||!TOOLS[id])return;const t=S.tips[h];if(t.eng){t.eng=false;endStroke(h);}t.tool=id;S.active=h;if(!quiet)msg(say(`${h==='L'?'左手':'右手'}換成：${toolName(id)}`,`${h==='L'?'Left':'Right'} hand now holds: ${toolName(id)}`),'info');updateUI();requestDraw();}
function cycleTool(h){const tl=S.D.tools[h],i=tl.indexOf(S.tips[h].tool);setTool(h,tl[(i+1)%tl.length]);}
function zoom(f,absolute){if(!S)return;const m=absolute?f:S.mag*f;S.mag=clamp(Math.round(m*100)/100,1,S.D.magMax||2.5);requestDraw();updateRead();updateUI();}
function holdCheck(){const hd=S.hold.L;if(!hd)return;const ok=holdOK('L');if(ok!==hd.ok){hd.ok=ok;if(!ok)msg(S.D.wound&&S.D.wound.retract?L2('⚠ 左手鬆脫：暴露塌陷！移回固定點。|⚠ Left hand slipped: exposure collapsed! Return to the hold point.'):L2('⚠ 左手離開固定點：先移回去再繼續。|⚠ Left hand left its hold point: return it before continuing.'),'warn');else msg(L2('左手已重新固定。|Left hand is holding again.'),'ok');updateRead();}}
function camCheck(){const e=eff('R'),c=eff('L'),vw=S.D.view.w/S.mag,vh=vw*H0/W0,out=Math.abs(e[0]-c[0])>vw/2||Math.abs(e[1]-c[1])>vh/2;if(out&&!S.outView){S.outView=true;S.m.coordBad++;msg(L2('⚠ 右手器械離開畫面：看不見的器械很危險。|⚠ The right instrument left the view: unseen instruments are unsafe.'),'warn');}else if(!out)S.outView=false;}
function lumenOK(t,np){const tr=S.D.lumen;let best=null;tr.segs.forEach(sg=>{const r=pDist(np,sg.p);const inside=r.d<=sg.r-.25;if(inside&&(!best||r.d/sg.r<best.q))best={sg,q:r.d/sg.r,i:r.i};});
const tm=now();if(!best){S.lumen.push=tm-S.lumen.pushT<1600?S.lumen.push+1:1;S.lumen.pushT=tm;S.m.misses+=.25;
if(S.lumen.push>=3){S.lumen.push=0;contact({k:'wall',n:['血管壁','vessel wall'],x:['導絲反覆頂住血管壁：內膜剝離或穿孔。','Repeatedly pushing the wire into the wall: dissection or perforation.']},[t.x,t.y],'wall');}else msg(L2('頂到血管壁：退一點、轉尖端。|Against the wall: back off and torque.'),'warn');return false;}
const prev=S.lumen.seg;if(best.sg.steer&&prev&&prev!==best.sg.id){const p=best.sg.p,j=Math.min(best.i+1,p.length-1),dir=angOf([p[j][0]-p[Math.max(0,j-1)][0],p[j][1]-p[Math.max(0,j-1)][1]]);if(Math.abs(angD(t.a,dir))>60&&Math.abs(angD(t.a,dir+180))>60){msg(L2('分叉處：先用 , . 轉 J 尖朝向分支。|At the fork: torque the J-tip (, .) first.'),'warn');return false;}}
if(best.sg.side&&prev!==best.sg.id)msg(L2('進入側枝：退回主幹。|Side branch entered: back to the main channel.'),'warn');
S.lumen.seg=best.sg.id;S.lumen.push=0;if(!holdOK('L')&&S.D.steps[S.si].need==='L'){S.lumen.slip=(S.lumen.slip||0)+1;if(S.lumen.slip%12===1){S.m.coordBad++;msg(L2('左手沒固定鞘管：導絲會回彈（F）。|Sheath not pinned: the wire will kick back (F).'),'warn');}}else if(S.lumen.slip){S.m.coordOK++;S.lumen.slip=0;}return true;}
function trail(p){const tl=S.lumen.trail,last=tl[tl.length-1];if(tl.length>1){const pv=tl[tl.length-2];if(hyp(p[0]-pv[0],p[1]-pv[1])<.9){tl.pop();return;}}if(hyp(p[0]-last[0],p[1]-last[1])>=1)tl.push([p[0],p[1]]);}
function startStroke(h,st){const e=eff(h);S.tr.vis=new Uint8Array(S.tr.res.length);S.tr.too=false;S.tr.mis=false;S.tr.ang=false;S.tr.coord=null;const stroke={ink:st.ink||'cut',pts:[[e[0],e[1],depthAt(e)]],h,lay:S.D.lay};S.cuts.push(stroke);S.tr.stroke=stroke;mark(e,st);}
function endStroke(h){const st=cur();if(!S.tr||!S.tr.stroke)return;const vis=S.tr.vis;for(let i=0;i<vis.length;i++)if(vis[i])S.tr.depth[i]=Math.min(9,S.tr.depth[i]+1);S.tr.stroke=null;if(st&&st.t==='trace'){if(S.tr.coord===true)S.m.coordOK++;else if(S.tr.coord===false)S.m.coordBad++;const cov=coverage(st);if(cov>=(st.cov||.9)){msg(say(`完成描線（覆蓋 ${Math.round(cov*100)}%）。`,`Trace complete (${Math.round(cov*100)}% covered).`),'ok');next();}else msg(say(`已覆蓋 ${Math.round(cov*100)}%${st.passes>1?`（需要第 ${Math.min(st.passes,maxPass()+1)} 趟）`:''}；繼續沿線完成。`,`${Math.round(cov*100)}% covered${st.passes>1?` (pass ${Math.min(st.passes,maxPass()+1)} needed)`:''}; continue along the line.`),'info');}}
function maxPass(){let m=0;S.tr.depth.forEach(d=>{if(d>m)m=d;});return m;}
function coverage(st){const need=st.passes||1;let n=0;S.tr.depth.forEach(d=>{if(d>=need)n++;});return n/S.tr.res.length;}
function depthAt(p){if(!S.tr)return 1;let m=0;const res=S.tr.res,band=cur()&&cur().band||1.5;for(let i=0;i<res.length;i++)if(Math.abs(res[i][0]-p[0])<band&&Math.abs(res[i][1]-p[1])<band&&hyp(res[i][0]-p[0],res[i][1]-p[1])<=band)m=Math.max(m,S.tr.depth[i]);return m+1;}
function mark(p,st){const res=S.tr.res,band=st.band;let hitDone=false;for(let i=0;i<res.length;i++){const dx=res[i][0]-p[0],dy=res[i][1]-p[1];if(Math.abs(dx)<=band&&Math.abs(dy)<=band&&hyp(dx,dy)<=band){S.tr.vis[i]=1;if(S.tr.depth[i]>=(st.passes||1))hitDone=true;}}return hitDone;}
function traceMove(st,h,a,b){const L=hyp(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(L/.35)),t=S.tips[h];
if(st.need&&!holdOK(st.need)){if(S.tr.coord!==false)msg(L2('左手沒固定：切線會歪。|Left hand not holding: the line wanders.'),'warn');S.tr.coord=false;}else if(S.tr.coord==null)S.tr.coord=true;
if(st.align&&L>.3){const mv=angOf([b[0]-a[0],b[1]-a[1]]),d=Math.abs(angD(t.a,mv+180));if(d>45&&!S.tr.mis){S.tr.mis=true;S.m.misalign++;msg(L2('刀片沒順著切線（, . 旋轉）：切緣會斜。|Blade not aligned with the cut (, . rotate): a bevelled edge.'),'warn');}}
if(st.angLock&&!S.tr.ang&&Math.abs(angD(t.a,st.angLock[0]))>st.angLock[1]){S.tr.ang=true;S.m.misses++;msg(L2('推片角度跑掉：抹片不均。|Spreader angle drifted: uneven film.'),'warn');}
for(let i=1;i<=n;i++){const p=[lerp(a[0],b[0],i/n),lerp(a[1],b[1],i/n)],d=pDist(p,st.path,st.closed).d;S.m.devSum+=d;S.m.devN++;if(d>S.m.devMax)S.m.devMax=d;
const dep=st.ink==='cut'?Math.min(4,depthAt(p)):1,done=mark(p,st);S.tr.stroke.pts.push([p[0],p[1],dep]);
if(st.ink==='cut'&&done&&!S.tr.too&&st.passes){const pr=(S.tr.res.length&&S.tr.depth.reduce((m,x)=>Math.max(m,x),0))>=st.passes;if(pr){S.tr.too=true;if(S.D.deep)contact(S.D.deep,p,'deep');}}
dangerAt(h,p,'move',dep);}
if(st.ink==='smear')S.smear=Math.max(S.smear,clamp(b[0]+26,0,38));}
const SOFT={pain:1,conus:1,wrong:1,key:1,glob:1,teeth:1,cusp:1,oar:1,cap:1,wall:1};
function hits(z,p){if(z.p)return pDist(p,z.p).d<=z.w;if(z.R)return Math.abs(hyp(p[0]-z.c[0],p[1]-z.c[1])-z.R)<=z.w||hyp(p[0]-z.c[0],p[1]-z.c[1])>z.R;if(z.r)return hyp(p[0]-z.c[0],p[1]-z.c[1])<=z.r;if(z.poly)return inPoly(p,z.poly);return false;}
function eligible(z,h,mode,depth){if(z.by&&z.by!==h)return false;if(z.until!=null&&S.si>=z.until)return false;if(z.from!=null&&S.si<z.from)return false;if(z.cond==='noHold'&&holdOK('L'))return false;if(z.sub&&(depth||0)<(z.depth||2))return false;const t=S.tips[h],cat=(TOOLS[t.tool]||{}).c;
if(z.tool)return t.tool===z.tool;if(S.D.markDz)return mode==='act';if(z.k==='key')return mode==='act'||mode==='hold';if(z.k==='cusp'||z.k==='oar'||z.k==='cap')return mode==='move'||(mode==='act'&&(SHARP[cat]||cat==='gr'||cat==='mk'));if(SOFT[z.k])return mode==='act';if(z.k==='n'||z.k==='b')return SHARP[cat]||(mode==='act'&&t.tool==='fT')||(mode==='act'&&cat==='lap');return!!SHARP[cat]&&(mode==='act'||t.eng||cat==='wire');}
function dangerAt(h,p,mode,depth){const zs=S.D.dz;for(let i=0;i<zs.length;i++){const z=zs[i];if(!eligible(z,h,mode,depth))continue;if(hits(z,p))contact(z,p,i);}}
function dangerMove(h,p){const t=S.tips[h];const st=cur();if(S.hold.L&&h==='L')dangerAt('L',p,'hold');if(t.eng||((TOOLS[t.tool]||{}).c==='wire'))return;if(st&&st.t==='bleed')return;}
function contact(z,p,id){const key=String(id),tm=now();if(S.last[key]&&tm-S.last[key]<1400)return;S.last[key]=tm;S.m.dangers++;if(!S.m.hits.includes(L2(z.n)))S.m.hits.push(L2(z.n));
const k=z.k;if(k==='a'||k==='v'){S.blood.push({x:p[0],y:p[1],vol:12,rate:k==='a'?60:30,on:1,nick:1,seed:(tm|0)%97,art:k==='a'});S.fx.push({k:'flash',p,col:'#ff3b30',t0:tm});}
else if(k==='n')S.fx.push({k:'nerve',z,p,t0:tm});else if(k==='d'||k==='b'||k==='u'||k==='du'||k==='p')S.leaks.push({x:p[0],y:p[1],k,t0:tm});else if(k==='oar')S.fx.push({k:'oar',z,t0:tm});else S.fx.push({k:'flash',p,col:'#ff3b30',t0:tm});
msg('⚠ '+L2('觸及危險結構：|Danger structure: ')+L2(z.n)+' — '+T('pitfall','若做錯會怎樣','If done wrong')+'：'+L2(z.x),'danger');if(navigator.vibrate&&!RM)try{navigator.vibrate(60);}catch(_){}requestDraw();}
function action(h,fine){if(!S||S.done||S.demoLock)return;if(!S.m.t0)S.m.t0=now();const st=cur();S.active=h;if(!st)return;
if(st.t==='trace'){if(st.h!==h)return wrongHand(st);if(st.tool&&!toolOK(h,st.tool))return toolMsg(h,st);const t=S.tips[h];t.eng=!t.eng;if(t.eng){startStroke(h,st);msg(L2('下壓：沿線移動，再按一次抬起。|Engaged: follow the line; press again to lift.'),'info');}else endStroke(h);requestDraw();updateUI();return;}
if(st.t==='bleed')return bleedAct(h);
if(st.t==='knot')return knotAct(h);
if(st.t==='lumen')return lumenAct(h);
if(st.t==='adv')return advAct(h,st,fine);
if(st.t==='go')return goAct(h,st);
}
function wrongHand(st){msg(say(`這一步用${st.h==='L'?'左手（F）':'右手（Space）'}。`,`This step uses the ${st.h==='L'?'left hand (F)':'right hand (Space)'}.`),'warn');}
function toolMsg(h,st){S.m.misses+=.5;msg(say(`此步需要：${toolName(needTool(h,st))}（Tab 或下方器械盤切換）。`,`This step needs: ${toolName(needTool(h,st))} (Tab or the tray below).`),'warn');updateUI();}
function goAct(h,st){
if(st.h!==h){if(h==='L'&&S.D.lumen&&holdOK('L')){S.contrast=1;requestDraw();return;}return wrongHand(st);}
if(st.tool&&!toolOK(h,st.tool))return toolMsg(h,st);
const e=eff(h),p=tgt(st);dangerAt(h,e,'act');
if(st.need&&!holdOK(st.need)){S.m.coordBad++;msg(S.hold[st.need]?L2('另一手已離開固定點：先移回去（F 的位置）。|The other hand has left its hold: return it first.'):L2('先用左手固定（F），再用右手操作。|Hold with the left hand first (F), then work with the right.'),'warn');return;}
if(st.centre){const c=eff('L'),vw=S.D.view.w/S.mag;if(hyp(p[0]-c[0],p[1]-c[1])>vw*.2){S.m.coordBad++;msg(L2('目標不在畫面中央：先移動左手鏡頭把它置中。|The target is not centred: move the camera (left hand) first.'),'warn');return;}S.m.coordOK++;}
const d=st.tolX?(Math.abs(e[0]-p[0])<=st.tolX?Math.abs(e[1]-p[1]):99):hyp(e[0]-p[0],e[1]-p[1]);
if(d>st.tol){S.m.misses++;const later=S.D.steps.slice(S.si+1).find(s=>s.t==='go'&&s.h===h&&typeof s.p!=='function'&&hyp(e[0]-s.p[0],e[1]-s.p[1])<=s.tol);
msg(later?say('順序不對：先完成「'+L2(st.lab)+'」。','Wrong order: first do "'+L2(st.lab)+'".'):d<=st.tol*3?say(`接近了：偏差 ${d.toFixed(d<1?2:1)} mm（容許 ${st.tol} mm）。按住 Shift 微調。`,`Close: ${d.toFixed(d<1?2:1)} mm off (tolerance ${st.tol} mm). Hold Shift to fine-tune.`)+(st.miss?' '+L2(st.miss):''):L2('不在目標上，看紅框與距離讀數。|Not on the target — follow the ring and the distance readout.'),'warn');return;}
if(st.ang!=null){const a=S.tips[h].a;let df=Math.abs(angD(a,st.ang));if(st.sym)df=Math.min(df,Math.abs(angD(a,st.ang+180)));if(df>st.angTol){S.m.misses++;if(st.angDz!=null&&S.D.dz[st.angDz])contact(S.D.dz[st.angDz],e,'ang'+st.angDz);else msg(say(`角度差 ${Math.round(df)}°（容許 ${st.angTol}°）：用 ${h==='L'?'Q／E':', ／ .'} 旋轉。`,`Angle off by ${Math.round(df)}° (tolerance ${st.angTol}°): rotate with ${h==='L'?'Q / E':', / .'}.`)+(st.miss?' '+L2(st.miss):''),'warn');return;}}
if(st.sweep&&(!S.sweep||S.sweep.max-S.sweep.min<st.sweep)){msg(say(`請把探頭上下掃過目標（至少 ${st.sweep} mm）再擷取。`,`Sweep the probe through the target (at least ${st.sweep} mm) before capturing.`),'warn');return;}
S.m.devSum+=d;S.m.devN++;S.m.devMax=Math.max(S.m.devMax,d);if(st.need)S.m.coordOK++;
if(st.stamp)S.stamps.push({t:st.stamp,p:[e[0],e[1]],tp:p.slice(),a:S.tips[h].a,name:st.name,pair:st.pair||(st.stamp==='tuffier'&&S.hold.L?S.hold.L.p:null)});
if(st.stamp==='peel')S.peeled=true;
if(st.hold)S.hold[h]={p:p.slice(),tol:Math.max(st.tol*1.7,S.D.tolRef*2.2),ok:true};
if(st.carry!=null)S.carry={id:st.carry,h};
if(st.place!=null){S.placed[st.place]=1;S.carry=null;}
msg('✓ '+L2(st.lab)+say(`（偏差 ${d.toFixed(d<1?2:1)} mm）`,` (${d.toFixed(d<1?2:1)} mm off)`),'ok');next();
}
function knotAct(h){const st=cur(),want=st.seq[S.kn];if(h!==want){S.m.misses++;msg(say(`打結順序：下一個單結用${want==='L'?'左手（F）':'右手（Space）'}。`,`Throw order: the next throw is the ${want==='L'?'left hand (F)':'right hand (Space)'}.`),'warn');return;}
const a=eff('L'),b=eff('R');if(hyp(a[0]-st.at[0],a[1]-st.at[1])>st.rad||hyp(b[0]-st.at[0],b[1]-st.at[1])>st.rad){S.m.coordBad++;msg(L2('雙手都要靠近線結才能打結。|Both hands must be near the knot to tie it.'),'warn');return;}
S.m.coordOK++;S.kn++;msg(say(`第 ${S.kn} 個單結完成（${st.seq.length} 個）。`,`Throw ${S.kn} of ${st.seq.length} done.`),'ok');if(S.kn>=st.seq.length){S.stamps.push({t:'knot',p:st.at.slice()});next();}else{requestDraw();updateUI();}}
function advAct(h,st,fine){if(st.h!==h)return wrongHand(st);if(st.tool&&!toolOK(h,st.tool))return toolMsg(h,st);if(st.need&&!holdOK(st.need)){S.m.coordBad++;msg(L2('先用左手固定（F），再推進。|Hold with the left hand first (F), then advance.'),'warn');return;}
const e=eff(h),t=S.tips[h],d=hyp(e[0]-st.p[0],e[1]-st.p[1]);if(d>st.tol){S.m.misses++;msg(say(`離開了起點 ${d.toFixed(1)} mm：移回去再繼續。`,`You moved ${d.toFixed(1)} mm off the entry: go back before continuing.`),'warn');return;}
if(st.rhythm){const tm=S.fakeT!=null?S.fakeT:now();if(S.adv.t){const iv=tm-S.adv.t;if(iv<st.rhythm[0]*.9){S.m.misses++;msg(say(`太快（${Math.round(60000/iv)} 次／分）：目標 100–120。`,`Too fast (${Math.round(60000/iv)}/min): aim for 100–120.`),'warn');}else if(iv>st.rhythm[1]*1.15){S.m.misses++;msg(say(`太慢（${Math.round(60000/iv)} 次／分）：目標 100–120。`,`Too slow (${Math.round(60000/iv)}/min): aim for 100–120.`),'warn');}else{S.m.coordOK++;}}S.adv.t=tm;}
if(st.ang!=null){const df=Math.abs(angD(t.a,st.ang));if(df>st.angTol){S.m.misses++;const tip=advTip(st,S.adv.depth+(st.step||0));const zi=S.D.dz.findIndex(z=>hits(z,tip));if(zi>=0)contact(S.D.dz[zi],tip,zi);else msg(say(`角度偏 ${Math.round(df)}°：軌跡偏離，可能穿出皮質。`,`Angle off by ${Math.round(df)}°: the track deviates and may breach the cortex.`),'warn');}}
S.adv.n++;S.adv.depth+=st.step||0;
if(st.plunge&&S.adv.n===st.n&&!(fine||S.fine)){S.adv.depth+=6;const tip=advTip(st,S.adv.depth);if(S.D.dz[0])contact(S.D.dz[0],tip,'plunge');}
if(st.ang!=null&&S.adv.n<=st.n){const tip=advTip(st,S.adv.depth);S.D.dz.forEach((z,i)=>{if(z.c&&hits(z,tip))contact(z,tip,i);});}
if(st.stamp&&S.adv.n===st.n)S.stamps.push({t:st.stamp,p:st.p.slice()});
msg(say(`${S.adv.n}／${st.n}`,`${S.adv.n} / ${st.n}`)+(st.step?say(`（深度 ${S.adv.depth.toFixed(0)} mm）`,` (depth ${S.adv.depth.toFixed(0)} mm)`):''),'info');
if(S.adv.n>=st.n){S.drillTrack=st.step?{p:st.p.slice(),a:t.a,depth:S.adv.depth}:S.drillTrack;next();}else{requestDraw();updateUI();}}
function advTip(st,depth){const a=S.tips[st.h].a*D2R;return[st.p[0]-Math.cos(a)*depth,st.p[1]-Math.sin(a)*depth];}
function lumenAct(h){const st=cur();if(h==='L'){if(holdOK('L')){S.contrast=1;msg(L2('注射少量顯影劑：路徑圖更清楚。|Contrast puff: the roadmap is clearer.'),'info');requestDraw();}return;}const e=eff('R'),d=hyp(e[0]-st.target[0],e[1]-st.target[1]);if(d>st.tol){S.m.misses++;msg(say(`導絲尖端距離停放點 ${d.toFixed(1)} mm。`,`Wire tip is ${d.toFixed(1)} mm from the parking mark.`),'warn');return;}S.m.devSum+=d;S.m.devN++;S.m.devMax=Math.max(S.m.devMax,d);msg(L2('✓ 導絲已停在病灶遠端。|✓ Wire parked beyond the lesion.'),'ok');next();}
function next(){S.si++;prepStep();updateUI(true);requestDraw();updateRead();}
function bleedAct(h){const e=eff(h),t=S.tips[h];
if(h==='L'){if((TOOLS[t.tool]||{}).c!=='su')return toolMsg('L',{tool:'yank'});S.bleedOn=!S.bleedOn;t.eng=S.bleedOn;msg(S.bleedOn?L2('吸引開啟。|Suction on.'):L2('吸引關閉。|Suction off.'),'info');requestDraw();return;}
const cat=(TOOLS[t.tool]||{}).c;if(cat!=='en'&&cat!=='cl')return toolMsg('R',{tool:S.D.tools.R[0]});
let best=null,bd=1e9;S.blood.forEach(b=>{if(!b.on)return;const d=hyp(b.x-e[0],b.y-e[1]);if(d<bd){bd=d;best=b;}});
dangerAt('R',e,'act');t.eng=true;setTimeout(()=>{if(S&&S.tips){S.tips.R.eng=false;requestDraw();}},220);
if(best&&bd<=1.7){if(best.vol>30&&!S.assisted){S.m.misses++;msg(L2('出血點被血蓋住：先吸引。|Bleeder hidden under blood: suction first.'),'warn');return;}best.on=0;best.char=1;S.m.devSum+=bd;S.m.devN++;S.m.devMax=Math.max(S.m.devMax,bd);msg(say(`✓ 出血點已控制（偏差 ${bd.toFixed(1)} mm）。`,`✓ Bleeder controlled (${bd.toFixed(1)} mm off).`),'ok');
if(S.spawned<S.D.bleed.max&&S.blood.filter(b=>b.on).length<2){S.blood.push(src(S.D.bleed.pts[S.spawned],S.spawned));S.spawned++;msg(L2('又一個出血點出現了。|Another bleeder appears.'),'warn');}bleedDone();}
else{S.m.misses++;S.stamps.push({t:'burn',p:e.slice()});msg(say(`沒有點在出血點上（${best?bd.toFixed(1)+' mm':'—'}）：周邊組織熱傷害。`,`Missed the bleeder (${best?bd.toFixed(1)+' mm':'—'}): thermal injury to the surrounding tissue.`),'warn');}
requestDraw();}
function pooled(){return S.blood.reduce((s,b)=>s+b.vol,0);}
function bleedDone(){if(S.blood.some(b=>b.on)||S.spawned<S.D.bleed.max)return;if(pooled()>70&&!S.assisted){msg(L2('出血已控制：把術野吸乾。|Bleeders controlled: suction the field dry.'),'info');return;}S.blood.forEach(b=>{b.vol=Math.min(b.vol,4);});S.bleedOn=false;S.tips.L.eng=false;next();}
function suction(p,dt){let any=false;S.blood.forEach(b=>{const d=hyp(b.x-p[0],b.y-p[1]);if(d<7+Math.sqrt(b.vol/PI)){b.vol=Math.max(0,b.vol-260*dt*(d<3?1:.5));any=true;}});if(any&&cur()&&cur().t==='bleed')bleedDone();}
function simTick(dt){if(!S||S.done)return false;let anim=false;const st=cur();
S.blood.forEach(b=>{if(b.on){b.vol+=b.rate*dt*(b.nick?.5:1);if(b.nick){b.age=(b.age||0)+dt;if(b.age>7)b.on=0;}anim=true;}else if(b.vol>0&&b.nick&&b.age<9)anim=true;});
if(S.bleedOn){suction(eff('L'),dt);anim=true;}
if(st&&st.t==='bleed'){S.bleedT+=dt;if(S.spawned<S.D.bleed.max&&S.bleedT>S.D.bleed.every*(S.spawned-S.D.bleed.start+1)){S.blood.push(src(S.D.bleed.pts[S.spawned],S.spawned));S.spawned++;}if(pooled()>1900&&!S.fail){S.fail=true;msg(L2('✗ 血淹滿術野：本次失敗。|✗ The field flooded: drill failed.'),'danger');finish(true);return false;}anim=true;}
if(S.hold.L&&S.D.drift&&S.tips.L){const t=S.tips.L,c=S.D.wound?geo({inc:S.D.wound.pts}).m:[t.x,t.y];const dx=c[0]-t.x,dy=c[1]-t.y,L=hyp(dx,dy)||1;t.x+=dx/L*.28*dt;t.y+=dy/L*.28*dt;holdCheck();anim=true;}
if(S.contrast>0){S.contrast=Math.max(0,S.contrast-dt*.35);anim=true;}
return anim;}
function finish(failed){if(S.done)return;S.done=true;['L','R'].forEach(h=>{S.tips[h].eng=false;});const m=S.m,tm=now(),secs=m.t0?(tm-m.t0)/1000:0,D0=S.D;
const mean=m.devN?m.devSum/m.devN:0,econ=m.travel>0?clamp(S.ideal/m.travel,0,1):1,coord=(m.coordOK+m.coordBad)?m.coordOK/(m.coordOK+m.coordBad):1,ref=D0.tolRef||1,par=S.ideal/8+D0.steps.length*4+6;
const pen={dev:Math.min(34,mean/ref*13+m.devMax/ref*3),econ:Math.min(14,(1-econ)*20),time:clamp((secs-par)/par*8,0,8),danger:Math.min(48,m.dangers*12),coord:(1-coord)*20,miss:Math.min(12,m.misses*2),align:Math.min(8,m.misalign*2)};
let score=Math.round(clamp(100-Object.values(pen).reduce((a,b)=>a+b,0),0,100));let grade=failed?'D':score>=90?'S':score>=80?'A':score>=68?'B':score>=55?'C':'D';if(m.dangers&&(grade==='S'||grade==='A'))grade='B';
const tips=[];const worst=Object.entries(pen).sort((a,b)=>b[1]-a[1]).filter(x=>x[1]>1.5).map(x=>x[0]);
const TIP={dev:LB('放慢、按住 Shift；對準後停半秒讓顫抖消退再動作。','Slow down, hold Shift; pause half a second after aligning, then act.'),econ:LB('直線移向下一目標，少來回修正。','Move straight to the next target; fewer corrections.'),time:LB('先看一次「示範路徑」，再一氣呵成。','Watch the ideal path once, then work in one flow.'),danger:LB('先認出危險結構再下刀，保持一個器械寬的距離。','Spot the danger structures first; keep an instrument-width away.'),coord:LB('左手先固定並保持，右手才動作。','Hold with the left hand first and keep it; then act with the right.'),miss:LB('距離讀數小於容許值再按動作鍵。','Act only when the readout is within tolerance.'),align:LB('刀片順著切線方向（, . 旋轉）。','Keep the blade aligned with the cut (, . rotate).')};
worst.slice(0,3).forEach(k=>tips.push(L2(TIP[k])));if(m.hits.length)tips.unshift(L2('避開：|Avoid: ')+m.hits.join('、'));if(!tips.length)tips.push(L2('非常穩定！試試更高倍率。|Very steady! Try higher magnification.'));
S.result={drill:D0.id,key:D0.key,title:L2(D0.t),grade:S.assisted?'assisted':grade,score:S.assisted?null:score,mean,max:m.devMax,economy:econ,time:secs,dangers:m.dangers,coordination:coord,misses:Math.round(m.misses),assisted:S.assisted,failed:!!failed,tips};
const map=loadBest(),key=`${caseId}#${stageIdx}#${D0.id}`,prev=map[key],g=S.result.grade,rank=x=>x==='assisted'?5:x==null?9:GR.indexOf(x);let improved=false;
if(!failed&&(prev==null||rank(g)<rank(prev))){map[key]=g;saveBest(map);improved=true;}
if(!failed&&improved)try{HT.xp&&HT.xp.record&&HT.xp.record({kind:'stage',department:tpl.department,caseId,attempts:(g==='S'||g==='A')?1:2,assisted:S.assisted,precision:{kind:'precision',grade:g,drill:D0.id,score:S.result.score,department:tpl.department}});}catch(_){}
if(opts.onDone&&!failed)try{opts.onDone(S.result);}catch(_){}
stopRun();updateUI(true);requestDraw();
}
function stopRun(){runTok++;S&&(S.demoLock=false);}
function plan(){const st=cur(),ops=[];if(!st)return ops;const mv=(h,p)=>ops.push({o:'mv',h,p}),ac=(h,f)=>ops.push({o:'act',h,fine:f}),tl=(h,id)=>ops.push({o:'tool',h,id}),ro=(h,a)=>ops.push({o:'rot',h,a});
const need=(h,s)=>{if(s.tool&&!toolOK(h,s.tool))tl(h,needTool(h,s));};const reHold=()=>{if(st.need&&S.hold[st.need]&&!holdOK(st.need))mv(st.need,S.hold[st.need].p);};
if(st.t==='go'){need(st.h,st);reHold();const p=tgt(st);if(st.centre)mv('L',p);if(st.ang!=null)ro(st.h,st.ang);mv(st.h,p);if(st.sweep){mv(st.h,[p[0],p[1]-st.sweep/2-.5]);mv(st.h,[p[0],p[1]+st.sweep/2+.5]);mv(st.h,p);}ac(st.h);}
else if(st.t==='trace'){need(st.h,st);reHold();if(st.angLock)ro(st.h,st.angLock[0]);const pts=resample(st.path,.6,st.closed);if(st.closed)pts.push(pts[0],pts[1]||pts[0]);for(let ps=0;ps<(st.passes||1);ps++){const seq=ps%2?pts.slice().reverse():pts;mv(st.h,seq[0]);if(st.align)ro(st.h,angOf([seq[0][0]-seq[Math.min(3,seq.length-1)][0],seq[0][1]-seq[Math.min(3,seq.length-1)][1]]));ac(st.h);seq.forEach((p,i)=>{if(st.align&&i>0)ops.push({o:'rot',h:st.h,a:angOf([seq[i-1][0]-p[0],seq[i-1][1]-p[1]]),q:1});ops.push({o:'mv',h:st.h,p,q:1});});ac(st.h);}}
else if(st.t==='knot'){['L','R'].forEach(h=>{const e=eff(h);if(hyp(e[0]-st.at[0],e[1]-st.at[1])>st.rad*.8)mv(h,[st.at[0]+(h==='L'?-1:1)*st.rad*.3,st.at[1]]);});st.seq.split('').forEach(h=>ac(h));}
else if(st.t==='adv'){need(st.h,st);reHold();mv(st.h,st.p);if(st.ang!=null)ro(st.h,st.ang);for(let i=0;i<st.n;i++)ops.push({o:'act',h:st.h,fine:true,rh:st.rhythm?550:0});}
else if(st.t==='lumen'){reHold();const r=S.lumen.routed;let j=0;const e=eff('R');r.forEach((p,i)=>{if(hyp(p[0]-e[0],p[1]-e[1])<hyp(r[j][0]-e[0],r[j][1]-e[1]))j=i;});for(let i=j+1;i<r.length;i++){ops.push({o:'rot',h:'R',a:angOf([r[i][0]-r[i-1][0],r[i][1]-r[i-1][1]]),q:1});ops.push({o:'mv',h:'R',p:r[i],q:1});}ac('R');}
else if(st.t==='bleed'){if(S.tips.L.tool!=='yank')tl('L','yank');const cat=(TOOLS[S.tips.R.tool]||{}).c;if(cat!=='en'&&cat!=='cl')tl('R',S.D.tools.R[0]);ops.push({o:'bleed'});}
return ops;}
function runOps(ops,instant,tok,done){let i=0;const stepFn=()=>{if(destroyed||tok!==runTok||!S)return;while(i<ops.length){const op=ops[i++];if(exec(op,instant,tok,stepFn)==='wait')return;}done();};stepFn();}
function exec(op,instant,tok,resume){const quick=instant||op.q;
if(op.o==='tool'){setTool(op.h,op.id,true);return;}if(op.o==='rot'){S.tips[op.h].a=angN(op.a);if(!quick)requestDraw();return;}
if(op.o==='act'){if(op.rh)S.fakeT=(S.fakeT||now())+op.rh;action(op.h,op.fine);S.fakeT=op.rh?S.fakeT:null;if(!instant){setTimeout(resume,RM?30:160);return 'wait';}return;}
if(op.o==='bleed'){S.blood.forEach(b=>{if(b.on)b.vol=Math.min(b.vol,20);});while(S.spawned<S.D.bleed.max){S.blood.push(src(S.D.bleed.pts[S.spawned],S.spawned));S.spawned++;}S.blood.filter(b=>b.on).forEach(b=>{tweenTo('L',[b.x,b.y],true);tweenTo('R',[b.x+.2,b.y],true);action('R');});S.blood.forEach(b=>{b.vol=0;});bleedDone();return;}
if(op.o==='mv'){if(quick){tweenTo(op.h,op.p,true);if(!instant&&op.q){if((S.qn=(S.qn||0)+1)%3===0){setTimeout(resume,RM?0:16);return 'wait';}}return;}const from=[S.tips[op.h].x,S.tips[op.h].y],dur=Math.min(700,180+hyp(op.p[0]-from[0],op.p[1]-from[1])/(S.D.view.w/4)*400),t0=now();
const f=()=>{if(destroyed||tok!==runTok||!S)return;const k=Math.min(1,(now()-t0)/dur),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;tweenTo(op.h,[lerp(from[0],op.p[0],e),lerp(from[1],op.p[1],e)],true);if(k<1)W.requestAnimationFrame(f);else resume();};if(RM){tweenTo(op.h,op.p,true);setTimeout(resume,40);}else W.requestAnimationFrame(f);return 'wait';}}
function tweenTo(h,p,noTremor){const t=S.tips[h];moveBy(h,p[0]-t.x,p[1]-t.y,true,noTremor);}
function assist(instant){if(!S||S.done)return;S.assisted=true;S.tremorOff=true;S.demo=null;const tok=++runTok;S.demoLock=false;let guard=0;
const loop=()=>{if(destroyed||tok!==runTok||!S||S.done)return;if(++guard>400){finish(false);return;}const before=S.si;runOps(plan(),instant||RM,tok,()=>{if(S.done)return;if(S.si===before&&cur()&&cur().t!=='bleed'){const st=cur();if(st.t==='trace'){S.tr.depth.fill(st.passes||1);next();}else if(st.t==='go'||st.t==='lumen'||st.t==='knot'||st.t==='adv'){S.m.misses=Math.max(0,S.m.misses-1);next();}}if(instant||RM)loop();else setTimeout(loop,120);});};
msg(L2('⚡ 輔助完成中（會標記為使用輔助）…|⚡ Completing with assistance (recorded as assisted)…'),'info');loop();}
function demoPath(){if(!S||S.done)return;const pts=[];S.D.steps.forEach((st,i)=>{if(i<S.si)return;if(st.t==='go'||st.t==='adv'){const p=tgt(st);if(p)pts.push({h:st.h,p,i});}else if(st.t==='trace')resample(st.path,1.5,st.closed).forEach(p=>pts.push({h:st.h,p,i,line:1}));else if(st.t==='lumen')S.lumen.routed.forEach(p=>pts.push({h:'R',p,i,line:1}));else if(st.t==='bleed')S.blood.forEach(b=>b.on&&pts.push({h:'R',p:[b.x,b.y],i}));});
S.demo={pts,t0:now(),dur:RM?0:Math.min(9000,1200+pts.length*60)};msg(L2('✨ 示範路徑：依序走過每個目標（不計分）。|✨ Ideal path: each target in order (not scored).'),'info');requestDraw();if(RM)setTimeout(()=>{if(S&&S.demo){S.demo=null;requestDraw();}},5000);}
function requestDraw(){if(destroyed||raf)return;raf=W.requestAnimationFrame(frame);}
let lastT=0;
function frame(tm){raf=0;if(destroyed||!S||!ctx)return;const dt=lastT?Math.min(.1,(tm-lastT)/1000):0;lastT=tm;let anim=false;
if(!RM)anim=simTick(dt)||anim;draw();const ttm=now();
if(['L','R'].some(h=>ttm-S.tips[h].ot<500&&(S.tips[h].ox||S.tips[h].oy)&&!S.tremorOff))anim=true;if(S.fx.some(f=>ttm-f.t0<1000)||S.leaks.some(l=>ttm-l.t0<1600))anim=true;if(S.demo&&S.demo.dur&&ttm-S.demo.t0<S.demo.dur)anim=true;else if(S.demo&&S.demo.dur){S.demo=null;}
if(anim&&!RM){raf=W.requestAnimationFrame(frame);}else lastT=0;
if(RM){clearTimeout(slowT);if(!S.done&&(cur()&&cur().t==='bleed'||S.bleedOn||(S.hold.L&&S.D.drift)||S.blood.some(b=>b.on)))slowT=setTimeout(()=>{if(destroyed||!S)return;simTick(.25);requestDraw();},250);clearTimeout(settleT);if(['L','R'].some(h=>ttm-S.tips[h].ot<500))settleT=setTimeout(()=>{if(!destroyed)requestDraw();},520);}}
function baseView(asp){const f=S.fit,w=Math.max(f[2]-f[0],(f[3]-f[1])/asp);return{w:S.D.camera?S.D.view.w:w,c:S.D.camera?S.D.view.c:[(f[0]+f[2])/2,(f[1]+f[3])/2]};}
function view(){const D0=S.D,bv=baseView(H0/W0),vw=bv.w/S.mag,k=W0/vw,vh=H0/k;let c;
if(D0.camera)c=eff('L');else{const a=eff(S.active);c=[lerp(bv.c[0],a[0],1-1/S.mag),lerp(bv.c[1],a[1],1-1/S.mag)];const bw=bv.w,bh=bw*H0/W0;c[0]=clamp(c[0],bv.c[0]-bw/2+vw/2,bv.c[0]+bw/2-vw/2);c[1]=clamp(c[1],bv.c[1]-bh/2+vh/2,bv.c[1]+bh/2-vh/2);}
return{k,c,vw,vh,bb:[c[0]-vw/2,c[1]-vh/2,c[0]+vw/2,c[1]+vh/2]};}
function toS(v,p){return[(p[0]-v.c[0])*v.k+W0/2,(p[1]-v.c[1])*v.k+H0/2];}
function draw(){const c=ctx,D0=S.D,v=view();S.v=v;CX=ctx;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,cv.width,cv.height);
c.setTransform(dpr*v.k,0,0,dpr*v.k,dpr*(W0/2-v.c[0]*v.k),dpr*(H0/2-v.c[1]*v.k));S.labels=[];
const X={c,k:v.k,bb:v.bb,S,D:D0,lab:(x,y,t,o)=>S.labels.push([x,y,t,o||{}])};
try{(R[D0.reg]||R.bench)(X);}catch(e){if(W.console)W.console.warn('surgical-field region',e);}
if(D0.wound)drawWound(X);drawDangers(X);drawMarks(X);drawCuts(X);drawStamps(X);drawBlood(X);drawFx(X);if(S.lumen)drawWire(X);if(S.drillTrack||(cur()&&cur().t==='adv'&&D0.drillLine))drawTrack(X);if(S.demo)drawGhost(X);drawTools(X);
c.setTransform(dpr,0,0,dpr,0,0);drawLabels(v);drawHud(v);drawInset(v);}
function px(n){return n/S.v.k;}
function drawWound(X){const{c}=X,w=S.D.wound,P=w.pts,n=P.length,g0=w.gape,G=geo({inc:P});const ret=w.retract&&S.hold.L&&S.hold.L.ok;const mid=(n-1)/2;
const edges=[[],[]];for(let i=0;i<n;i++){const a=P[Math.max(0,i-2)],b=P[Math.min(n-1,i+2)],dx=b[0]-a[0],dy=b[1]-a[1],L=hyp(dx,dy)||1,nx=-dy/L,ny=dx/L;let t=i/(n-1);if(w.seg){const s=(i-mid);t=(s-w.seg[0])/(w.seg[1]-w.seg[0]);if(t<0||t>1){edges[0].push(P[i]);edges[1].push(P[i]);continue;}}const g=g0*Math.pow(Math.sin(PI*clamp(t,0,1)),.55),bulge=ret?13*Math.exp(-Math.pow((i-mid)/Math.max(8,n*.18),2)):0;edges[0].push([P[i][0]+nx*(g/2+bulge),P[i][1]+ny*(g/2+bulge)]);edges[1].push([P[i][0]-nx*g/2,P[i][1]-ny*g/2]);}
const poly=edges[0].concat(edges[1].slice().reverse()),lay=w.lay||['skin','fat','fascia','muscle'],deepCol=w.bedCol||LAYC[lay[Math.min(lay.length-1,w.depth)]]||'#c97a6c';
c.save();fillP(poly,deepCol);path(poly,true);c.clip();const r=rng(3);const bb=[Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1])),Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1]))];
if(/muscle/.test(lay[Math.min(lay.length-1,w.depth)])||w.bedCol)for(let i=0;i<40;i++){const x=bb[0]+r()*(bb[2]-bb[0]),y=bb[1]+r()*(bb[3]-bb[1]);strokeP([[x,y],[x+G.u[0]*6,y+G.u[1]*6]],'rgba(90,20,15,.22)',.25);}
for(let i=0;i<26;i++)ell(bb[0]+r()*(bb[2]-bb[0]),bb[1]+r()*(bb[3]-bb[1]),.8+r()*1.4,.5+r(),r()*180,'rgba(255,235,150,.35)');
if(S.D.vessel){const vs=S.D.vessel,div=S.stamps.some(s=>s.t==='divide');if(div){const m=G.m,a=vs.p[0],b=vs.p[1],ux=(b[0]-a[0])/hyp(b[0]-a[0],b[1]-a[1]),uy=(b[1]-a[1])/hyp(b[0]-a[0],b[1]-a[1]);tube([a,[m[0]-ux*1.2,m[1]-uy*1.2]],vs.w,'#c4332e','#7e1714','rgba(255,190,180,.6)',false);tube([[m[0]+ux*1.2,m[1]+uy*1.2],b],vs.w,'#c4332e','#7e1714','rgba(255,190,180,.6)',false);}else tube(vs.p,vs.w,'#c4332e','#7e1714','rgba(255,190,180,.6)',false);}
S.D.dz.filter(z=>z.bed).forEach(z=>drawZ(z,true));c.restore();
edges.forEach(e=>{strokeP(e,LAYC.fat,Math.min(2.4,g0*.35),true);strokeP(e,'rgba(255,225,215,.9)',.45,true);strokeP(e,'rgba(150,40,30,.55)',.2,true);});}
function drawZ(z,inBed){const c=CX;const col=KCOL[z.k]||'#ff5a4f';c.save();if(z.sub&&!inBed){c.globalAlpha=.75;if(z.p){strokeP(z.p,col,Math.max(z.w*.9,px(2)),true,[px(5),px(4)]);}c.restore();return;}
if(z.p&&z.k!=='cusp'&&z.k!=='cap'){if(z.k==='n')tube(z.p,z.w*1.4,'#efe2b4','#a89466',WH(.55));else if(z.k==='a')tube(z.p,z.w*1.4,'#c8342e','#7a1612','rgba(255,190,180,.6)');else if(z.k==='v')tube(z.p,z.w*1.4,'#4f5ea8','#28306a','rgba(200,210,255,.4)');else if(z.k==='b')tube(z.p,z.w*1.6,'#d59a88','#9c5e4e','rgba(255,230,220,.4)');else if(z.k==='u')tube(z.p,z.w*1.4,'#efe1c4','#b7a37a',WH(.4));else if(z.k==='d')tube(z.p,z.w*1.3,'#a8c27a','#6c8640','rgba(255,255,230,.4)');else strokeP(z.p,col,z.w,true);}
c.restore();}
function drawDangers(X){const{c}=X,seen={};S.D.dz.forEach(z=>{if(z.bed){const lp=z.p&&z.p[Math.floor(z.p.length/2)],nm=L2(z.n);if(lp&&!seen[nm]){seen[nm]=1;X.lab(lp[0],lp[1],'⚠ '+nm,{s:10,col:'#ffd4cf',bg:'rgba(120,20,15,.6)'});}return;}if(z.p)drawZ(z,false);if(z.until!=null&&S.si>=z.until)return;if(z.from!=null&&S.si<z.from)return;c.save();c.globalAlpha=.55;c.setLineDash([px(4),px(3)]);c.strokeStyle=KCOL[z.k]||'#ff5a4f';c.lineWidth=px(1.4);
if(z.R){c.beginPath();c.arc(z.c[0],z.c[1],z.R,0,2*PI);c.stroke();}else if(z.r){c.beginPath();c.arc(z.c[0],z.c[1],z.r,0,2*PI);c.stroke();}else if(z.poly){path(z.poly,true);c.stroke();}else if(z.p&&(z.k==='cusp'||z.k==='cap')){strokeP(z.p,KCOL[z.k],z.w,false,[px(4),px(3)]);}
c.restore();const lp=z.c||(z.p&&z.p[Math.floor(z.p.length/2)])||(z.poly&&z.poly[0]),nm=L2(z.n);if(lp&&!seen[nm]){seen[nm]=1;X.lab(lp[0],lp[1],'⚠ '+nm,{s:10,col:'#ffd4cf',bg:'rgba(120,20,15,.6)'});}});}
function drawMarks(X){const{c}=X;(S.D.marks||[]).forEach(m=>{if(m.t==='line'){c.save();strokeP(m.closed?m.p.concat([m.p[0]]):m.p,m.col,px(1.6),true,m.dash?[px(6),px(4)]:null);c.restore();}else if(m.t==='dot')ell(m.p[0],m.p[1],m.r||px(2.4),m.r||px(2.4),0,'#6b2fa8');else if(m.t==='pack'){c.fillStyle='#4a7fb5';c.fillRect(m.p[0]-14,m.p[1]-11,28,22);c.fillStyle='rgba(235,245,250,.9)';c.fillRect(m.p[0]-9,m.p[1]-7,18,14);X.lab(m.p[0],m.p[1]+15,L2('無菌敷料包|sterile pack'),{s:9});}});
const st=cur();if(!st||S.done)return;const col=HC[st.h]||HC.R,pulse=RM?1:.75+.25*Math.sin(now()/220);
const ringAt=(p,r,h)=>{c.save();c.strokeStyle=HC[h];c.globalAlpha=pulse;c.lineWidth=px(2.2);c.setLineDash([px(5),px(3)]);c.beginPath();c.arc(p[0],p[1],Math.max(r,px(9)),0,2*PI);c.stroke();c.setLineDash([]);c.strokeStyle='#d4242a';c.lineWidth=px(1);c.beginPath();c.moveTo(p[0]-px(4),p[1]);c.lineTo(p[0]+px(4),p[1]);c.moveTo(p[0],p[1]-px(4));c.lineTo(p[0],p[1]+px(4));c.stroke();c.restore();X.lab(p[0],p[1]-Math.max(r,px(9))-px(9),(h==='L'?'L':'R')+' · '+(S.si+1),{s:11,col:'#fff',bg:HC[h]});};
if(st.t==='go'||st.t==='adv'){const p=tgt(st);if(p)ringAt(p,st.tol,st.h);if(st.ang!=null){const a=st.ang*D2R;c.save();c.globalAlpha=.55;strokeP([p,[p[0]+Math.cos(a)*px(70),p[1]+Math.sin(a)*px(70)]],col,px(1.5),false,[px(4),px(4)]);if(st.sym)strokeP([p,[p[0]-Math.cos(a)*px(70),p[1]-Math.sin(a)*px(70)]],col,px(1.5),false,[px(4),px(4)]);c.restore();}}
else if(st.t==='trace'){if(!(S.D.marks||[]).some(m=>m.t==='line')){c.save();strokeP(st.closed?st.path.concat([st.path[0]]):st.path,WH(.75),px(1.6),true,[px(6),px(4)]);c.restore();}ringAt(st.path[0],st.band,st.h);}
else if(st.t==='knot')ringAt(st.at,st.rad*.4,st.seq[S.kn]);else if(st.t==='lumen')ringAt(st.target,st.tol,'R');}
function drawCuts(X){const{c}=X;S.cuts.forEach(cu=>{const p=cu.pts;if(p.length<2)return;const ink=cu.ink;
if(ink==='cut'){const n=p.length,gw=[0,.5,1.9,2.9,3.7],Le=[],Ri=[];let dm=1;for(let i=0;i<n;i++){const a=p[Math.max(0,i-2)],b=p[Math.min(n-1,i+2)],dx=b[0]-a[0],dy=b[1]-a[1],l=hyp(dx,dy)||1,nx=-dy/l,ny=dx/l,dd=Math.min(4,p[i][2]);dm=Math.max(dm,dd);const g=gw[dd]*(.3+.7*Math.min(1,Math.min(i,n-1-i)/5))/2;Le.push([p[i][0]+nx*g,p[i][1]+ny*g]);Ri.push([p[i][0]-nx*g,p[i][1]-ny*g]);}
fillP(Le.concat(Ri.slice().reverse()),dm>=3?'#efe9dc':dm>=2?'#e8c25c':'#a3241d');if(dm>=2){c.save();path(Le.concat(Ri.slice().reverse()),true);c.clip();const r=rng(n);for(let i=0;i<n;i+=2)ell(p[i][0]+(r()-.5)*1.4,p[i][1]+(r()-.5)*1.4,.5+r()*.5,.35+r()*.3,r()*180,'rgba(255,240,170,.55)');c.restore();}
strokeP(p.map(q=>[q[0],q[1]]),dm>=3?'rgba(170,40,30,.6)':'rgba(130,16,12,.85)',dm>=2?.45:.3,true);[Le,Ri].forEach(e=>{strokeP(e,'rgba(120,28,22,.55)',.3,true);strokeP(e,'rgba(255,214,196,.85)',.16,true);});return;}
const style={paint:['rgba(150,72,18,.42)',7],ink:['#6b2fa8',.55],contour:['#ffd200',px(2)],dissect:['rgba(255,250,240,.9)',Math.max(.12,px(1.5))],rhexis:[WH(.9),.06],bur:['#3b3530',.32],tink:['#1e7a3a',1.1],clean:[WH(.28),3],smear:[null,0],none:[null,0]}[ink]||['#333',.5];
if(style[0])strokeP(p.map(q=>[q[0],q[1]]),style[0],style[1],true);});}
function drawStamps(X){const{c}=X;S.stamps.forEach(s=>{const p=s.p;
switch(s.t){
case 'check':{c.save();c.translate(p[0],p[1]);c.scale(px(1),px(1));c.strokeStyle='#1e9e55';c.lineWidth=3;c.lineCap='round';c.beginPath();c.moveTo(-5,0);c.lineTo(-1,4);c.lineTo(6,-5);c.stroke();c.restore();break;}
case 'x':strokeP([[p[0]-2.4,p[1]-2.4],[p[0]+2.4,p[1]+2.4]],'#6b2fa8',.7);strokeP([[p[0]+2.4,p[1]-2.4],[p[0]-2.4,p[1]+2.4]],'#6b2fa8',.7);break;
case 'lead':c.save();c.translate(p[0],p[1]);electrode(false,false);c.restore();X.lab(p[0],p[1]-15,s.name,{s:11,col:'#fff',bg:'#334'});break;
case 'gel':ell(p[0],p[1],9,6,0,'rgba(150,210,255,.45)','rgba(120,180,230,.6)',.3);break;
case 'bite':ell(p[0],p[1],Math.max(.05,S.D.tolRef*.25),Math.max(.05,S.D.tolRef*.25),0,'#5a1010');break;
case 'stitch':if(s.pair){const mx=(p[0]+s.pair[0])/2,my=(p[1]+s.pair[1])/2;c.beginPath();c.moveTo(s.pair[0],s.pair[1]);c.quadraticCurveTo(mx+1,my-1,p[0],p[1]);c.strokeStyle='#2346a8';c.lineWidth=Math.max(.04,S.D.tolRef*.28);c.stroke();}break;
case 'knot':ell(p[0],p[1],Math.max(.08,S.D.tolRef*.7),Math.max(.06,S.D.tolRef*.5),0,'#1b3580');strokeP([p,[p[0]+S.D.tolRef*2,p[1]-S.D.tolRef*1.5]],'#1b3580',Math.max(.04,S.D.tolRef*.25));strokeP([p,[p[0]+S.D.tolRef*2.2,p[1]+S.D.tolRef*.6]],'#1b3580',Math.max(.04,S.D.tolRef*.25));break;
case 'clamp':c.save();c.translate(p[0],p[1]);c.rotate(s.a*D2R);c.globalAlpha=.95;clampI(true,140,18,4.6);c.restore();break;
case 'tie':ell(p[0],p[1],2,1,0,null,'#f2f2f2',.45);break;
case 'tuffier':if(s.pair)strokeP([s.pair,p],'#6b2fa8',px(1.5),false,[px(6),px(4)]);break;
case 'punch':ell(p[0],p[1],2,2,0,rad(p[0],p[1],2,[[0,'#7a1010'],[1,'#c0504a']]),'#5a1010',.15);break;
case 'dressing':c.fillStyle='rgba(225,240,250,.55)';c.fillRect(p[0]-14,p[1]-11,28,22);c.strokeStyle='rgba(120,150,170,.9)';c.lineWidth=.4;c.strokeRect(p[0]-14,p[1]-11,28,22);break;
case 'meas':if(s.pair){strokeP([s.pair,p],'#4fd1ff',px(1.6));X.lab((p[0]+s.pair[0])/2,(p[1]+s.pair[1])/2-px(10),hyp(p[0]-s.pair[0],p[1]-s.pair[1]).toFixed(1)+' mm',{s:11,col:'#4fd1ff',bg:'rgba(0,0,0,.6)'});}break;
case 'gon':{const ax=[0,0],a1=[-150,-26];strokeP([a1,ax,p],'#1e6fd1',1.6);const A=Math.abs(angD(angOf([a1[0],a1[1]]),angOf([p[0],p[1]])));X.lab(8,-14,say(`屈曲約 ${Math.round(180-A)}°`,`flexion ≈ ${Math.round(180-A)}°`),{s:12,col:'#fff',bg:'#1e6fd1'});break;}
case 'burn':ell(p[0],p[1],.9,.9,0,'rgba(60,30,10,.55)');break;
case 'divide':break;
case 'dot':ell(p[0],p[1],px(3),px(3),0,'#4fd1ff');break;
case 'sq':case 'sqf':case 'sqfp':c.fillStyle=s.t==='sq'?'#fff':'#222';c.fillRect(p[0]-4,p[1]-4,8,8);c.strokeStyle='#222';c.lineWidth=.6;c.strokeRect(p[0]-4,p[1]-4,8,8);if(s.t==='sqfp'){strokeP([[p[0]-12,p[1]+10],[p[0]-5,p[1]+5]],'#222',.6);poly([p[0]-5,p[1]+5,p[0]-8.5,p[1]+5.6,p[0]-6.4,p[1]+8],'#222');}break;
case 'ci':ell(p[0],p[1],4.3,4.3,0,'#fff','#222',.6);break;
case 'hline':strokeP([[p[0]-21,p[1]],[p[0]+21,p[1]]],'#222',.6);break;
case 'sib':strokeP([[0,-30],[0,-8],[-30,-8],[30,-8]].length?[[0,-30],[0,-8]]:[],'#222',.6);strokeP([[-30,-8],[30,-8]],'#222',.6);[-30,0,30].forEach(x=>strokeP([[x,-8],[x,11]],'#222',.6));break;
default:break;}});}
function blob(b,r){const c=CX;const n=14,rr=rng(b.seed||1),pts=[];for(let i=0;i<n;i++){const a=i/n*2*PI;pts.push([b.x+Math.cos(a)*r*(.8+rr()*.45),b.y+Math.sin(a)*r*(.8+rr()*.45)]);}return pts;}
function drawBlood(X){const{c}=X,tm=now();S.blood.forEach(b=>{const r=Math.sqrt(Math.max(0,b.vol)/PI);if(r>.15){const pts=blob(b,r);fillP(pts,rad(b.x-r*.2,b.y-r*.2,r*1.3,[[0,b.art?'#c41812':'#8e0f0c'],[.7,'#6e0a08'],[1,'rgba(80,6,6,.85)']]),null,0,true);ell(b.x-r*.35,b.y-r*.4,r*.32,r*.14,-30,WH(.35));}
if(b.on&&b.vol<=30){const pr=RM?1:1+.25*Math.sin(tm/(b.art?140:260));ell(b.x,b.y,.7*pr,.7*pr,0,b.art?'#ff3b2f':'#b2140f');}
if(b.char)ell(b.x,b.y,.8,.8,0,'rgba(50,25,10,.75)');});
S.leaks.forEach(l=>{const col={d:'rgba(120,170,40,.7)',b:'rgba(120,80,30,.75)',u:'rgba(240,220,120,.6)',du:'rgba(200,230,255,.6)',p:WH(.85)}[l.k]||WH(.6);if(l.k==='p'){for(let i=0;i<5;i++)ell(l.x+Math.cos(i*1.3)*2,l.y+Math.sin(i*1.7)*2,.6+i*.15,.6+i*.15,0,null,col,.15);}else{ell(l.x,l.y,3,2.2,0,col);ell(l.x+1.4,l.y+1.8,1.2,1,0,col);}});}
function drawFx(X){const{c}=X,tm=now();S.fx=S.fx.filter(f=>tm-f.t0<(RM?1500:1000));S.fx.forEach(f=>{const k=RM?1:1-(tm-f.t0)/1000;c.save();c.globalAlpha=Math.max(0,k);
if(f.k==='nerve'&&f.z&&f.z.p){strokeP(f.z.p,'rgba(255,240,80,.9)',Math.max(f.z.w*2.4,px(6)),true);}else if(f.k==='oar'&&f.z){c.fillStyle='rgba(255,40,30,.4)';if(f.z.poly){path(f.z.poly,true);c.fill();}else if(f.z.c){c.beginPath();c.arc(f.z.c[0],f.z.c[1],f.z.r||4,0,2*PI);c.fill();}}
else if(f.p){c.strokeStyle=f.col;c.lineWidth=px(3);c.beginPath();c.arc(f.p[0],f.p[1],px(10+20*(1-k)),0,2*PI);c.stroke();}c.restore();});}
function drawWire(X){const{c}=X,tr0=S.D.lumen,pts=S.lumen.trail.concat([eff('R')]);strokeP([[tr0.entry[0],tr0.entry[1]+10]].concat(pts),'#121416',Math.max(.35,px(1.6)),true);if(S.contrast>0){c.save();c.globalAlpha=S.contrast*.6;tr0.segs.forEach(sg=>strokeP(sg.p,'#000',sg.r*2,true));c.restore();}}
function drawTrack(X){const{c}=X,st=cur(),tr0=S.drillTrack||(st&&st.t==='adv'?{p:st.p,a:S.tips[st.h].a,depth:S.adv.depth}:null);if(!tr0||!tr0.depth)return;const a=tr0.a*D2R,e=[tr0.p[0]-Math.cos(a)*tr0.depth,tr0.p[1]-Math.sin(a)*tr0.depth];strokeP([tr0.p,e],'rgba(40,30,25,.85)',2.4);strokeP([tr0.p,e],'rgba(170,150,120,.7)',1);}
function drawGhost(X){const{c}=X,d=S.demo,pts=d.pts;if(!pts.length)return;c.save();c.globalAlpha=.55;pts.forEach((q,i)=>{if(q.line&&i>0&&pts[i-1].line&&pts[i-1].i===q.i)strokeP([pts[i-1].p,q.p],HC[q.h],px(2.4));else if(!q.line){ell(q.p[0],q.p[1],px(7),px(7),0,null,HC[q.h],px(2));X.lab(q.p[0]+px(10),q.p[1]-px(10),String(q.i+1),{s:10,col:'#fff',bg:HC[q.h]});}});c.restore();
if(d.dur){const k=clamp((now()-d.t0)/d.dur,0,1),j=Math.min(pts.length-1,Math.floor(k*pts.length)),q=pts[j],t=S.tips[q.h];c.save();c.globalAlpha=.45;c.translate(q.p[0],q.p[1]);c.rotate(t.a*D2R);(TOOLS[t.tool]||TOOLS.fg).d(false);c.restore();}}
function drawTools(X){const{c}=X;const order=S.active==='L'?['R','L']:['L','R'];order.forEach(h=>{const t=S.tips[h],e=eff(h),tool=TOOLS[t.tool]||TOOLS.fg;if(S.D.camera&&t.tool==='cam')return;const hidden=S.D.camera&&h==='R'&&S.outView;
c.save();c.translate(e[0],e[1]);c.rotate(((tool.c==='wire'?t.a+180:t.a))*D2R);if(!RM){c.shadowColor='rgba(0,0,0,.35)';c.shadowBlur=8*dpr;c.shadowOffsetX=3*dpr;c.shadowOffsetY=4*dpr;}if(hidden)c.globalAlpha=.25;tool.d(t.eng||(S.hold[h]&&h==='L'&&(TOOLS[t.tool].c==='gr'||TOOLS[t.tool].c==='fg')));c.restore();
if(S.carry&&S.carry.h===h){if(S.D.rv.v==='meds')vial(e[0],e[1]-14,VIALS[S.carry.id].col);else if(S.D.rv.v==='karyo')chrom(e[0],e[1]-10,KARYO[S.carry.id].len,KARYO[S.carry.id].cen);}
c.save();c.strokeStyle=HC[h];c.lineWidth=px(h===S.active?2.4:1.4);c.beginPath();c.arc(e[0],e[1],px(7),0,2*PI);c.stroke();c.fillStyle=HC[h];c.beginPath();c.arc(e[0],e[1],px(1.6),0,2*PI);c.fill();c.restore();
X.lab(e[0]+px(12),e[1]+px(14),h+(S.hold[h]?(holdOK(h)?' ✋':' ⚠'):''),{s:11,col:'#fff',bg:HC[h]});});}
function drawLabels(v){const c=ctx;c.textBaseline='middle';S.labels.forEach(([x,y,t,o])=>{const s=o.screen?[x,y]:toS(v,[x,y]);if(!o.screen&&(s[0]<-40||s[0]>W0+40||s[1]<-20||s[1]>H0+20))return;c.font=`${o.b?'700 ':''}${o.s||11}px system-ui, -apple-system, "Noto Sans TC", sans-serif`;c.textAlign=o.a||'center';const w=c.measureText(t).width;const x0=c.textAlign==='left'?s[0]:c.textAlign==='right'?s[0]-w:s[0]-w/2;
if(o.bg){c.fillStyle=o.bg;c.fillRect(x0-3,s[1]-(o.s||11)*.7,w+6,(o.s||11)*1.4);}else{c.fillStyle=WH(.62);if(o.col&&/^#f|#fff|#cfe|#9cf|#fdd|#ffe/i.test(o.col))c.fillStyle='rgba(0,0,0,.45)';c.fillRect(x0-2,s[1]-(o.s||11)*.62,w+4,(o.s||11)*1.24);}c.fillStyle=o.col||'#1d2a30';c.fillText(t,s[0],s[1]);});}
function drawHud(v){const c=ctx;if(S.D.camera){c.save();c.fillStyle='rgba(0,0,0,.9)';c.beginPath();c.rect(0,0,W0,H0);const r=Math.min(W0,H0)*.12;c.moveTo(r,8);c.arcTo(W0-8,8,W0-8,H0-8,r);c.arcTo(W0-8,H0-8,8,H0-8,r);c.arcTo(8,H0-8,8,8,r);c.arcTo(8,8,W0-8,8,r);c.closePath();c.fill('evenodd');c.restore();c.strokeStyle=WH(.35);c.lineWidth=1;c.beginPath();c.arc(W0/2,H0/2,Math.min(W0,H0)*.2*1,0,2*PI);c.stroke();}
c.font='600 11px system-ui, sans-serif';c.textAlign='left';c.textBaseline='middle';const tag='🔬 '+T('sfTeaching','教學模擬','Teaching simulation');const tw=c.measureText(tag).width;c.fillStyle='rgba(15,25,30,.72)';c.fillRect(8,8,tw+14,20);c.fillStyle='#fff';c.fillText(tag,15,18);
const mt=S.mag.toFixed(1)+'×'+(S.mag>2.5?' '+L2('顯微鏡|microscope'):S.mag>1?' '+L2('放大鏡|loupe'):'');const mw=c.measureText(mt).width;c.fillStyle='rgba(15,25,30,.72)';c.fillRect(W0-mw-22,8,mw+14,20);c.fillStyle='#fff';c.fillText(mt,W0-mw-15,18);
const want=70/v.k,nice=[.1,.2,.5,1,2,5,10,20,50,100].find(n=>n>=want*.6)||100,Lp=nice*v.k;c.fillStyle='rgba(15,25,30,.72)';c.fillRect(8,H0-26,Lp+54,18);c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.moveTo(14,H0-17);c.lineTo(14+Lp,H0-17);c.moveTo(14,H0-21);c.lineTo(14,H0-13);c.moveTo(14+Lp,H0-21);c.lineTo(14+Lp,H0-13);c.stroke();c.fillStyle='#fff';c.fillText(nice+' mm',20+Lp,H0-17);
if(S.done&&S.result){c.fillStyle='rgba(0,0,0,.35)';c.fillRect(0,0,W0,H0);c.font='800 54px system-ui, sans-serif';c.textAlign='center';c.fillStyle=S.result.failed?'#ff6b5e':'#fff';c.fillText(S.result.failed?'✗':S.result.grade==='assisted'?'⚡':S.result.grade,W0/2,H0/2);}}
function drawInset(v){const st=cur(),D0=S.D;if(!st&&!S.done)return;const kind=D0.inset;if(!kind)return;const sz=Math.max(110,Math.min(200,W0*.34)),x0=W0-sz-10,y0=34,c=ctx;const e=eff('R');
let q=0,off=[0,0],img=null,show=false;const s2=st&&st.img?st:D0.steps.slice(S.si).find(s=>s.img)||D0.steps.slice(0,S.si).reverse().find(s=>s.img);
if(s2){img=s2.img;const p=tgt(s2)||[0,0];const d=hyp(e[0]-p[0],e[1]-p[1]);const tol=s2.tol||2;let aq=1;if(s2.ang!=null){const t=S.tips.R;let df=Math.abs(angD(t.a,s2.ang));if(s2.sym)df=Math.min(df,Math.abs(angD(t.a,s2.ang+180)));aq=clamp(1-(df-s2.angTol)/(s2.angTol*3),0,1);}q=clamp(1-(d-tol)/(tol*3),0,1)*aq;off=[(e[0]-p[0])/(tol*4),(e[1]-p[1])/(tol*4)];show=d<tol*6;}
if(kind==='laryngo'){const lq=S.hold.L&&holdOK('L')?1:clamp(1-hyp(eff('L')[0]-4,eff('L')[1]+13)/14,0,.6);q=lq;show=hyp(eff('L')[0]-4,eff('L')[1]+13)<26||!!S.hold.L;img='cords';off=[0,(1-lq)*.5];}
if(kind==='oto'&&!holdOK('L')&&img)q*=.25;
if(!show)return;c.save();c.fillStyle='rgba(0,0,0,.85)';c.fillRect(x0-3,y0-3,sz+6,sz+22);c.beginPath();if(kind==='us'){const r0=sz*.08;c.moveTo(x0+sz/2-r0,y0+4);c.lineTo(x0+4,y0+sz-4);c.quadraticCurveTo(x0+sz/2,y0+sz+10,x0+sz-4,y0+sz-4);c.lineTo(x0+sz/2+r0,y0+4);c.closePath();}else c.arc(x0+sz/2,y0+sz/2,sz/2-3,0,2*PI);c.clip();
usImage(kind,img,x0,y0,sz,q,off);c.restore();c.font='10px system-ui, sans-serif';c.textAlign='center';c.fillStyle='#cfe';c.fillText(kind==='us'?L2('模擬超音波影像（教學）|Simulated ultrasound (teaching)'):kind==='oto'?L2('模擬耳鏡視野|Simulated otoscope view'):kind==='fundus'?L2('模擬眼底視野|Simulated fundus view'):L2('模擬喉鏡視野|Simulated laryngoscope view'),x0+sz/2,y0+sz+12);}
function usImage(kind,img,x0,y0,sz,q,off){const c=CX;const cx=x0+sz/2+off[0]*sz*.3,cy=y0+sz/2+off[1]*sz*.3,u=sz/2;
if(kind==='us'){c.fillStyle='#0c0c0c';c.fillRect(x0,y0,sz,sz);const n=noiseCanvas();if(n){c.globalAlpha=.25+.45*q;c.drawImage(n,x0,y0,sz,sz);c.globalAlpha=1;}c.globalAlpha=.25+.75*q;const gy=v=>`rgba(${v},${v},${v},${.55+.4*q})`;
const E=(x,y,rx,ry,col,rot)=>{c.beginPath();c.ellipse(cx+x*u,y0+y*sz+off[1]*sz*.2,Math.max(1,rx*u),Math.max(1,ry*sz),rot||0,0,2*PI);c.fillStyle=col;c.fill();};const Ln=(pts,col,w)=>{c.beginPath();pts.forEach((p,i)=>c[i?'lineTo':'moveTo'](cx+p[0]*u,y0+p[1]*sz));c.strokeStyle=col;c.lineWidth=w;c.stroke();};
const IA={bladS:'blad',livI:'liv',gbT:'gb',utT:'ut'};img=IA[img]||img;const m={ruq:()=>{E(-.2,.45,.9,.32,gy(120));E(.3,.68,.38,.17,gy(95),-.4);E(.3,.68,.22,.08,gy(200),-.4);Ln([[-.6,.55],[.05,.62],[.6,.55]],gy(220),2);},luq:()=>{E(.1,.42,.7,.26,gy(110));E(-.2,.7,.36,.16,gy(95),.3);E(-.2,.7,.2,.07,gy(200),.3);},pel:()=>{E(0,.45,.45,.2,'#020202');E(0,.74,.4,.12,gy(105));},blad:()=>{E(0,.45,.48,.2,'#020202');},
sub:()=>{E(0,.25,.9,.14,gy(110));E(0,.6,.62,.3,gy(70));[[-.22,.5],[.22,.5],[-.22,.74],[.22,.74]].forEach(([x,y])=>E(x,y,.17,.1,'#050505'));Ln([[-.65,.4],[0,.3],[.65,.4]],gy(230),3);},lung:()=>{Ln([[-1,.26],[1,.26]],gy(240),3);c.fillStyle='rgba(0,0,0,.85)';c.fillRect(x0,y0+sz*.22,sz*.18,sz);c.fillRect(x0+sz*.82,y0+sz*.22,sz*.18,sz);[.5,.74].forEach(y=>Ln([[-.6,y],[.6,y]],gy(130),1.5));},
thyT:()=>{E(-.42,.38,.32,.14,gy(140));E(.42,.38,.32,.14,gy(140));c.beginPath();c.arc(cx,y0+sz*.32,u*.2,PI,2*PI);c.strokeStyle=gy(235);c.lineWidth=3;c.stroke();c.fillStyle='rgba(0,0,0,.8)';c.fillRect(cx-u*.18,y0+sz*.32,u*.36,sz);E(-.82,.45,.1,.05,'#020202');E(.82,.45,.1,.05,'#020202');},thyL:()=>{E(0,.4,.75,.14,gy(140));},
kid:()=>{E(0,.5,.75,.24,gy(95));E(0,.5,.45,.1,gy(210));},fhead:()=>{E(0,.5,.55,.32,null);c.strokeStyle=gy(235);c.lineWidth=3;c.stroke();Ln([[-.4,.5],[.4,.5]],gy(200),1.5);},plac:()=>{E(0,.28,.9,.12,gy(150));E(0,.62,.7,.2,'#050505');},afi:()=>{E(0,.55,.6,.28,'#030303');E(.3,.6,.12,.07,gy(170));},
ut:()=>{E(-.3,.32,.32,.14,'#030303');E(.2,.58,.55,.17,gy(120),-.2);Ln([[-.15,.6],[.6,.53]],gy(220),2);},ov:()=>{E(.1,.55,.3,.16,gy(115));[[0,.52],[.18,.58],[.06,.62]].forEach(([x,y])=>E(x,y,.05,.03,'#030303'));},
liv:()=>{E(0,.5,.95,.4,gy(115));E(-.1,.5,.14,.08,gy(60));},gb:()=>{E(0,.45,.8,.35,gy(110));E(0,.5,.42,.1,'#030303');}}[img];
if(m)m();c.globalAlpha=1;return;}
if(kind==='oto'){c.fillStyle='#4a1b14';c.fillRect(x0,y0,sz,sz);c.beginPath();c.arc(cx,cy,u*.62,0,2*PI);c.fillStyle=`rgba(${170+40*q},${160+40*q},${165+40*q},${.3+.7*q})`;c.fill();c.strokeStyle='rgba(240,230,220,.6)';c.lineWidth=2;c.stroke();c.strokeStyle=`rgba(250,245,235,${.4+.5*q})`;c.lineWidth=3;c.beginPath();c.moveTo(cx-u*.05,cy-u*.45);c.lineTo(cx,cy);c.stroke();c.fillStyle=`rgba(255,255,240,${.7*q})`;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+u*.38,cy+u*.25);c.lineTo(cx+u*.28,cy+u*.38);c.fill();if(q<.5){c.fillStyle='rgba(150,80,60,.95)';c.beginPath();c.arc(x0+sz*.3,y0+sz*.5,u*.9,0,2*PI);c.fill();}return;}
if(kind==='fundus'){c.fillStyle=rad(cx,cy,u,[[0,'#ff8a3a'],[1,'#7a1e08']]);c.fillRect(x0,y0,sz,sz);c.globalAlpha=.2+.8*q;const dx=img==='mac'?u*.5:0;c.beginPath();c.arc(cx-dx,cy,u*.22,0,2*PI);c.fillStyle='#ffe1a0';c.fill();c.beginPath();c.arc(cx-dx+3,cy,u*.1,0,2*PI);c.fillStyle='#fff3d0';c.fill();[[-1,-.6],[-1,.6],[1,-.5],[1,.5]].forEach(([sx,sy])=>{c.beginPath();c.moveTo(cx-dx,cy);c.quadraticCurveTo(cx-dx+sx*u*.6,cy+sy*u*.2,cx-dx+sx*u*1.1,cy+sy*u*.7);c.strokeStyle='#8e1a0c';c.lineWidth=2.4;c.stroke();});c.beginPath();c.arc(cx-dx+u*.65,cy+4,u*.14,0,2*PI);c.fillStyle='rgba(90,20,10,.55)';c.fill();c.globalAlpha=1;return;}
if(kind==='laryngo'){c.fillStyle='#5a1810';c.fillRect(x0,y0,sz,sz);c.fillStyle='#c8706a';c.beginPath();c.ellipse(cx,cy-u*.55+off[1]*u,u*.55,u*.3,0,0,2*PI);c.fill();if(q>.5){c.fillStyle='#1a0606';c.beginPath();c.moveTo(cx-u*.3,cy+u*.45);c.lineTo(cx,cy-u*.2);c.lineTo(cx+u*.3,cy+u*.45);c.fill();c.strokeStyle='#f6f0e8';c.lineWidth=4;c.beginPath();c.moveTo(cx-u*.3,cy+u*.45);c.lineTo(cx-u*.02,cy-u*.18);c.moveTo(cx+u*.3,cy+u*.45);c.lineTo(cx+u*.02,cy-u*.18);c.stroke();}}}
const best=()=>loadBest();
function drillChips(){const bm=best();return list.map(d=>{const g=bm[`${caseId}#${stageIdx}#${d.id}`];return `<button type="button" class="sf-chip${S&&S.D.id===d.id?' on':''}" data-sf-drill="${esc(d.id)}" aria-pressed="${S&&S.D.id===d.id}">${d.suggested?'★ ':''}${esc(L2(d.title))}${g?` <b class="sf-g sf-g-${esc(g)}">${g==='assisted'?'⚡':esc(g)}</b>`:''}</button>`;}).join('');}
function trayHTML(h){const st=cur(),want=st&&st.h===h&&st.tool?(Array.isArray(st.tool)?st.tool:[st.tool]):(st&&st.t==='bleed'?(h==='L'?['yank']:[S.D.tools.R[0]]):[]);return S.D.tools[h].map(id=>`<button type="button" class="sf-tool${S.tips[h].tool===id?' on':''}" data-sf-tool="${h}:${id}" aria-pressed="${S.tips[h].tool===id}">${want.includes(id)?'★ ':''}${esc(toolName(id))}</button>`).join('');}
function verb(h){const c0=(TOOLS[S.tips[h].tool]||{}).c;return L2(VERB[c0]||['動作','action']);}
function legend(){return `<details class="sf-legend"><summary>${esc(T('sfControls','操作說明（鍵盤／觸控）','Controls (keyboard / touch)'))}</summary><ul>
    <li><b class="sf-kL">${L2('左手|Left')}</b> W A S D ${L2('移動尖端（每下 1 mm，按住連續；Shift 0.2 mm）· Q／E 旋轉 · F 動作（夾、牽開、吸引、扶鏡頭）|move the tip (1 mm per press, hold to repeat; Shift 0.2 mm) · Q / E rotate · F action (grasp, retract, suction, camera)')}</li>
    <li><b class="sf-kR">${L2('右手|Right')}</b> ↑↓←→ ${L2('移動 · , ／ . 旋轉 · 空白鍵 動作（切、剪、電凝、夾、入針、推導絲、放探頭）|move · , / . rotate · Space action (cut, coagulate, clamp, stitch, advance wire, place probe)')}</li>
    <li>${L2('Tab 換器械 · ＋／－、滾輪、雙指＝放大（顯微科別到 6×，步距隨倍率縮小）· Esc 關閉 · 拖曳尖端移動，長按或連點兩下＝動作 · 下方兩組方向鍵控制左右手器械|Tab switches instrument · + / −, wheel, pinch = magnification (micro up to 6×; steps shrink with it) · Esc closes · drag a tip to move, long-press or double-tap = action · the two pads below drive the left / right instruments')}</li></ul></details>`;}
function shell(){host.innerHTML=`<section class="sf" role="dialog" aria-modal="false" aria-labelledby="${uid}-t" tabindex="-1">
    <header class="sf-head"><div class="sf-titles"><b id="${uid}-t">🔬 ${esc(T('sfTitle','術野精細操作','Precision operative field'))}</b><span class="sf-sim">${esc(T('sfTeaching','教學模擬','Teaching simulation'))} · ${esc(L2('非真實病人影像|not a real patient'))}</span></div><button type="button" class="sf-x" data-sf-close aria-label="${esc(T('sfClose','關閉術野（Esc）','Close the field (Esc)'))}">✕</button></header>
    <div class="sf-drills" role="group" aria-label="${esc(T('sfDrills','練習項目','Drills'))}" data-sf-drills></div>
    <p class="sf-goal" data-sf-goal></p><p class="sf-step" data-sf-step aria-live="polite"></p>
    <div class="sf-stage" data-sf-stage><canvas class="sf-canvas" tabindex="0" role="img" aria-label="${esc(L2('術野畫布：WASD 左手、方向鍵右手、F 與空白鍵動作|Operative field canvas: WASD left hand, arrows right hand, F and Space actions'))}"></canvas></div>
    <div class="sf-read" data-sf-read aria-live="off"></div>
    <div class="sf-tray"><div class="sf-hand" data-h="L"><span class="sf-hl">${esc(T('sfLeftHand','左手','Left hand'))}</span><div data-sf-tray="L"></div></div><div class="sf-hand" data-h="R"><span class="sf-hr">${esc(T('sfRightHand','右手','Right hand'))}</span><div data-sf-tray="R"></div></div></div>
    <div class="sf-acts"><button type="button" class="sf-btn sf-act-l" data-sf-act="L"></button><button type="button" class="sf-btn sf-act-r" data-sf-act="R"></button><button type="button" class="sf-btn" data-sf-fine aria-pressed="false">🎯 ${esc(T('sfFine','精細','Fine'))}</button><span class="sf-zoom"><button type="button" class="sf-btn" data-sf-zoom="-1" aria-label="${esc(L2('縮小|Zoom out'))}">−</button><b data-sf-mag>1.0×</b><button type="button" class="sf-btn" data-sf-zoom="1" aria-label="${esc(L2('放大|Zoom in'))}">＋</button></span>
      <button type="button" class="sf-btn" data-sf-demo>✨ ${esc(T('sfShowPath','示範路徑','Show the ideal path'))}</button><button type="button" class="sf-btn sf-assist" data-sf-assist>⚡ ${esc(T('sfAssist','輔助完成','Complete with assistance'))}</button><button type="button" class="sf-btn" data-sf-restart>↺ ${esc(T('sfRestart','重來','Restart'))}</button></div>
    <p class="sf-msg info" data-sf-msg aria-live="assertive"></p><div class="sf-result" data-sf-result hidden></div>${legend()}</section>`;
cv=host.querySelector('canvas');ctx=cv.getContext('2d');bind();}
function updateRead(){const n=host.querySelector('[data-sf-read]');if(!n||!S)return;const st=cur();const part=h=>{const t=S.tips[h],e=eff(h);let d=null;if(st&&st.h===h&&(st.t==='go'||st.t==='adv')){const p=tgt(st);d=hyp(e[0]-p[0],e[1]-p[1]);}else if(st&&st.t==='trace'&&st.h===h)d=pDist(e,st.path,st.closed).d;else if(st&&st.t==='lumen'&&h==='R')d=hyp(e[0]-st.target[0],e[1]-st.target[1]);else if(st&&st.t==='knot')d=hyp(e[0]-st.at[0],e[1]-st.at[1]);else if(S.hold[h])d=hyp(e[0]-S.hold[h].p[0],e[1]-S.hold[h].p[1]);
const fx=v=>v==null?'—':v<1?v.toFixed(2):v.toFixed(1);return `<span class="sf-r${h===S.active?' on':''}" style="--hc:${HC[h]}"><b>${h}</b> ${esc(toolName(t.tool))} · ${fx(d)} mm${S.hold[h]?(holdOK(h)?' · ✋':' · ⚠'):''}${t.a!=null?` · ${Math.round(t.a)}°`:''}</span>`;};
const sig=Math.max(S.tips.L.sig||0,S.tips.R.sig||0);n.innerHTML=part('L')+part('R')+`<span class="sf-r">${esc(L2('顫抖|tremor'))} ±${sig.toFixed(2)} mm · ${esc(L2('步距|step'))} ${stepSize(S.fine).toFixed(2)} mm</span>`;const mg=host.querySelector('[data-sf-mag]');if(mg)mg.textContent=S.mag.toFixed(1)+'×';}
function updateUI(full){if(!S||destroyed)return;const q=s=>host.querySelector(s);const st=cur();
if(full){const dr=q('[data-sf-drills]');if(dr)dr.innerHTML=drillChips();const g=q('[data-sf-goal]');if(g)g.textContent=L2(S.D.t)+'：'+L2(S.D.g);}
const sp=q('[data-sf-step]');if(sp)sp.textContent=S.done?(S.result&&S.result.failed?L2('本次失敗。|This attempt failed.'):L2('✓ 練習完成。|✓ Drill complete.')):st?`${S.si+1}/${S.D.steps.length} · ${st.t==='knot'||st.t==='bleed'?'':st.h==='L'?L2('左手：|Left: '):L2('右手：|Right: ')}${L2(st.lab)}`+(st.t==='knot'?` (${S.kn}/${st.seq.length})`:st.t==='adv'?` (${S.adv.n}/${st.n})`:st.t==='trace'&&S.tr?` (${Math.round(coverage(st)*100)}%)`:''):'';
['L','R'].forEach(h=>{const tr0=q(`[data-sf-tray="${h}"]`);if(tr0)tr0.innerHTML=trayHTML(h);const b=q(`[data-sf-act="${h}"]`);if(b)b.textContent=(h==='L'?'F · '+L2('左手：|Left: '):L2('空白鍵 · 右手：|Space · Right: '))+verb(h);const hd=q(`.sf-hand[data-h="${h}"]`);if(hd)hd.classList.toggle('on',S.active===h);});
const fb=q('[data-sf-fine]');if(fb)fb.setAttribute('aria-pressed',String(!!S.fine));const as=q('[data-sf-assist]');if(as)as.disabled=!!S.done;const de=q('[data-sf-demo]');if(de)de.disabled=!!S.done;
const res=q('[data-sf-result]');if(res){if(S.done&&S.result){const r=S.result,pct=v=>Math.round(v*100)+'%';res.hidden=false;res.innerHTML=`<div class="sf-grade sf-g-${esc(r.grade)}">${r.failed?'✗':r.grade==='assisted'?'⚡':esc(r.grade)}</div><div><b>${esc(r.title)}</b> · ${r.failed?esc(L2('失敗|failed')):r.assisted?esc(T('sfAssisted','已使用輔助（不評等級）','Completed with assistance (not graded)')):esc(L2('得分|score'))+' '+r.score}
      <dl class="sf-metrics">${[[L2('平均偏差|mean deviation'),r.mean.toFixed(2)+' mm'],[L2('最大偏差|max deviation'),r.max.toFixed(2)+' mm'],[L2('路徑經濟性|path economy'),pct(r.economy)],[L2('時間|time'),r.time.toFixed(1)+' s'],[L2('危險接觸|danger contacts'),r.dangers],[L2('雙手協調|two-hand coordination'),pct(r.coordination)]].map(([a,b])=>`<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>
      <ul class="sf-tips">${r.tips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><div class="sf-res-acts"><button type="button" class="sf-btn" data-sf-restart>↺ ${esc(T('sfAgain','再練一次','Practise again'))}</button><button type="button" class="sf-btn sf-assist" data-sf-close>${esc(T('sfBack','返回工作台','Back to the workbench'))}</button></div></div>`;res.querySelectorAll('[data-sf-restart]').forEach(b=>b.onclick=()=>select(S.D.id));res.querySelectorAll('[data-sf-close]').forEach(b=>b.onclick=close);}else{res.hidden=true;res.innerHTML='';}}
bindDynamic();updateRead();}
function bindDynamic(){host.querySelectorAll('[data-sf-drill]').forEach(b=>b.onclick=()=>select(b.dataset.sfDrill));host.querySelectorAll('[data-sf-tool]').forEach(b=>b.onclick=()=>{const[h,id]=b.dataset.sfTool.split(':');setTool(h,id);});}
function select(id){stopRun();initState(id);focusCanvas();}
function close(){if(destroyed)return;if(opts.onClose)try{opts.onClose(S&&S.result);}catch(_){}}
function focusCanvas(){try{cv&&cv.focus({preventScroll:true});}catch(_){}}
function onKey(e,external){if(destroyed||!S)return false;const k=e.key||'',lk=k.length===1?k.toLowerCase():k,tg=e.target||{},tag=(tg.tagName||'').toUpperCase(),fine=!!e.shiftKey||S.fine;const stop=()=>{if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();};
if(k==='Escape'){stop();close();return true;}if(/INPUT|SELECT|TEXTAREA/.test(tag))return false;
const mv={w:['L',0,-1],a:['L',-1,0],s:['L',0,1],d:['L',1,0],ArrowUp:['R',0,-1],ArrowDown:['R',0,1],ArrowLeft:['R',-1,0],ArrowRight:['R',1,0]}[lk];
if(mv&&!e.ctrlKey&&!e.metaKey&&!e.altKey){stop();nudge(mv[0],mv[1],mv[2],fine,!!e.repeat);return true;}
if(lk==='q'||lk==='e'){stop();rotate('L',lk==='q'?-1:1,fine);return true;}if(k===','||k==='<'||k==='.'||k==='>'){stop();rotate('R',(k===','||k==='<')?-1:1,fine);return true;}
if(lk==='f'&&!e.ctrlKey&&!e.metaKey){stop();if(!e.repeat)action('L',fine);return true;}
if((k===' '||k==='Spacebar')&&(external||!/BUTTON|SUMMARY|A/.test(tag))){stop();if(!e.repeat)action('R',fine);return true;}
if(k==='+'||k==='='||k==='Add'){stop();zoom(1.25);return true;}if(k==='-'||k==='_'||k==='Subtract'){stop();zoom(.8);return true;}
if(k==='Tab'){const sec=host.querySelector('.sf');if(tg===cv&&!e.shiftKey){stop();cycleTool(S.active);return true;}const f=[...sec.querySelectorAll('button:not([disabled]),summary,canvas,[href]')].filter(x=>x.offsetParent!==null||x===cv);if(!f.length)return false;const i=f.indexOf(tg);if(e.shiftKey&&(i<=0)){stop();f[f.length-1].focus();return true;}if(!e.shiftKey&&i===f.length-1){stop();f[0].focus();return true;}return false;}
return false;}
function bind(){const sec=host.querySelector('.sf');sec.addEventListener('keydown',e=>onKey(e,false));
host.querySelector('[data-sf-close]').onclick=close;host.querySelectorAll('[data-sf-act]').forEach(b=>b.onclick=()=>action(b.dataset.sfAct));host.querySelector('[data-sf-fine]').onclick=()=>{S.fine=!S.fine;updateUI();};
host.querySelectorAll('[data-sf-zoom]').forEach(b=>b.onclick=()=>zoom(Number(b.dataset.sfZoom)>0?1.25:.8));host.querySelector('[data-sf-demo]').onclick=demoPath;host.querySelector('[data-sf-assist]').onclick=()=>assist(false);host.querySelectorAll('.sf-acts [data-sf-restart]').forEach(b=>b.onclick=()=>select(S.D.id));
host.querySelectorAll('.sf-hand').forEach(hd=>hd.addEventListener('click',e=>{if(e.target===hd||e.target.classList.contains('sf-hl')||e.target.classList.contains('sf-hr')){S.active=hd.dataset.h;updateUI();requestDraw();}}));
cv.addEventListener('pointerdown',pDown);cv.addEventListener('pointermove',pMove);cv.addEventListener('pointerup',pUp);cv.addEventListener('pointercancel',pUp);cv.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.12:1/1.12);},{passive:false});cv.addEventListener('contextmenu',e=>e.preventDefault());
if(W.ResizeObserver){ro=new W.ResizeObserver(resize);ro.observe(host.querySelector('[data-sf-stage]'));}else W.addEventListener('resize',resize);resize();}
function resize(){if(destroyed||!cv)return;const st=host.querySelector('[data-sf-stage]');const w=Math.max(240,Math.floor(st.clientWidth||600));let h=Math.round(w*(w<560?.74:.66));const vh=W.innerHeight||800;h=Math.max(200,Math.min(h,Math.round(vh*.62)));dpr=Math.min(W.devicePixelRatio||1,2.5);W0=w;H0=h;cv.style.width=w+'px';cv.style.height=h+'px';cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);requestDraw();}
function local(e){const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];}
function pDown(e){if(!S)return;focusCanvas();pointers.set(e.pointerId,local(e));try{cv.setPointerCapture(e.pointerId);}catch(_){}if(pointers.size===2){const[a,b]=[...pointers.values()];pinch={d:hyp(a[0]-b[0],a[1]-b[1]),m:S.mag};if(drag){clearTimeout(drag.lt);drag=null;}return;}
const p=local(e),v=S.v||view();let h=S.active,bd=1e9;['L','R'].forEach(k=>{const s=toS(v,eff(k)),d=hyp(s[0]-p[0],s[1]-p[1]);if(d<bd){bd=d;h=k;}});if(bd>90)h=S.active;
drag={id:e.pointerId,h,x:p[0],y:p[1],moved:0,t0:now(),acted:false};S.active=h;drag.lt=setTimeout(()=>{if(drag&&drag.moved<7&&!drag.acted){drag.acted=true;action(drag.h);}},520);updateUI();requestDraw();}
function pMove(e){if(!pointers.has(e.pointerId))return;const p=local(e);pointers.set(e.pointerId,p);if(pinch&&pointers.size===2){const[a,b]=[...pointers.values()];zoom(pinch.m*hyp(a[0]-b[0],a[1]-b[1])/Math.max(10,pinch.d),true);return;}
if(!drag||drag.id!==e.pointerId)return;const dx=p[0]-drag.x,dy=p[1]-drag.y;drag.x=p[0];drag.y=p[1];drag.moved+=hyp(dx,dy);const k=(S.v||view()).k,g=(e.shiftKey||S.fine)?.25:1;if(drag.moved>=3)moveBy(drag.h,dx/k*g,dy/k*g,e.shiftKey||S.fine);}
function pUp(e){pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;if(!drag||drag.id!==e.pointerId)return;clearTimeout(drag.lt);const tap=drag.moved<7&&now()-drag.t0<350&&!drag.acted;if(tap){if(lastTap.h===drag.h&&now()-lastTap.t<420){action(drag.h);lastTap={h:null,t:0};}else lastTap={h:drag.h,t:now()};}drag=null;}
shell();initState((opts.drill&&list.some(d=>d.id===opts.drill))?opts.drill:list[0].id);
msg(L2('把器械尖端移到虛線圈目標；L／R 標示用哪隻手。|Bring the tip to the ringed target; the L / R tag says which hand.'),'info');
const api={
get state(){return S?{drill:S.D.id,key:S.D.key,step:S.si,steps:S.D.steps.length,type:cur()&&cur().t,tips:{L:Object.assign({},S.tips.L),R:Object.assign({},S.tips.R)},eff:{L:eff('L'),R:eff('R')},target:cur()&&(tgt(cur())||cur().target||(cur().path&&cur().path[0])||cur().at)||null,mag:S.mag,dangers:S.m.dangers,done:S.done,result:S.result,hold:!!(S.hold.L&&holdOK('L')),template:tpl.department,
stepInfo:cur()?Object.assign({},cur(),{p:tgt(cur())||undefined,route:S.lumen&&S.lumen.routed,blood:S.blood.map(b=>({x:b.x,y:b.y,vol:b.vol,on:!!b.on})),knot:S.kn,adv:S.adv.n}):null}:null;},
drills:list,template:tpl,key:e=>onKey(e,true),nudge:(h,sx,sy,fine,repeat)=>nudge(h,sx,sy,fine,repeat),action:(h,fine)=>action(h,fine),setActive:h=>{if(S){S.active=h;updateUI();requestDraw();}},assist:instant=>assist(!!instant),demo:demoPath,select,rotate,zoom,setTool,moveBy:(h,dx,dy,fine)=>moveBy(h,dx,dy,fine),
setTremor:on=>{if(S)S.tremorOff=!on;},targets:()=>{const v=baseView(.66),h=v.w*.33;return{view:[v.c[0]-v.w/2,v.c[1]-h,v.c[0]+v.w/2,v.c[1]+h],pts:allTargets(S.D),camera:!!S.D.camera};},focus:focusCanvas,redraw:requestDraw,
destroy(){destroyed=true;runTok++;if(raf)W.cancelAnimationFrame(raf);clearTimeout(slowT);clearTimeout(settleT);if(ro)ro.disconnect();else W.removeEventListener('resize',resize);host.innerHTML='';S=null;}
};
return api;
}
let active=null;
function mount(host,opts){
if(!host||!doc)return function(){};
const f=createField(host,opts||{});active=f;
const cleanup=function(){if(active===f)active=null;f.destroy();};
['key','nudge','action','setActive','assist','demo','select','focus','redraw','zoom','rotate','setTool','moveBy','setTremor','targets'].forEach(k=>{cleanup[k]=f[k];});
Object.defineProperty(cleanup,'state',{get:()=>f.state});cleanup.drills=f.drills;cleanup.template=f.template;
return cleanup;
}
HT.surgicalField={mount,templates,templateFor,drillsFor,departments:()=>Object.keys(DEPTS),tools:()=>Object.keys(TOOLS),get active(){return active;},version:'3.9'};
})(window);
