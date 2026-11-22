import {textLines} from '../editor-tools-model.js';
import {compileComposedTitle,validateTitleComposition} from './title-composition.js';

const pt=25.4/72;
const segments=text=>[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.segment);
const extent=(text,fontSize,fontFamily)=>segments(text).reduce((sum,ch)=>{
 const latin=/^[\u0000-\u00ff]+$/u.test(ch);
 const factor=fontFamily==='BaiLuBangBang'?(latin?(/^[A-Z]$/.test(ch)?0.94:0.66):1.1):fontFamily==='WoAiWanWeiWei'?(latin?0.5:1):(latin?0.65:1);
 return sum+fontSize*pt*factor;
},0);
const roles={primary:1.35,secondary:.78,normal:1};
const at=(x,y)=>({reference:'parent',at:[x,y],unit:'mm',anchor:'top-left'});

export const titleFields=['text','fontFamily','fontSizePt','widthMm','heightMm','colors','pattern','count','runs','emphasis','caption','captionFontFamily','gapMm','style','curveHeightMm','tapeOpacity','backdrop','ornament','glyph','letterStyles','backgrounds','accents'];
export const titleHelp={
 glyph:'组合标题的字形层 {split?:{middleText,middleFontFamily?,middleColor?,gapMm?,waveMm?},strokes?:[{index,kind:hotdog|triangle,box:[x,y,w,h],color?,tiltDeg?}],numberShadow?:{color?,indices?,diameterMm?,offsetMm?}}。index 按字素从 0 开始；笔画 box 是该字局部 0–1 比例区域。拆字会在上下两段之间写 middleText。字形层可和字效、背景独立组合。',
 letterStyles:'组合标题的逐字字效 [{index,style}]；style 使用 text.add 的颜色、描边、阴影、渐变等字段。可只给个别字变色，其余字沿用整体 style。',
 backgrounds:'组合标题的字下层数组：{kind:dots|squares|lines|hashes|mixed|reverse|enclosure,color?,colors?:十六进制色数组,count?,diameterMm?,gapMm?,paddingMm?,opacity?,strokeWidthMm?}。mixed 是分散小圆和方块；lines 是横贯标题的多道线，hashes 是横竖交错的整片井字底纹，count 控制线数。enclosure 是包围线，reverse 是反白色块。',
 accents:'组合标题的边缘点缀数组：{kind:dots|spark|notes,placement:around|upper-right|corners,color?,sizeMm?,count?}。点缀不使用素材库。',
 runs:'可选词组数组；每项 {text,role:primary|secondary|normal,fontFamily?,breakBefore?,rotationDeg?,offsetMm?,style?,backdrop?}。每个词组可有独立字下底形，例如前两个字空心方框、后两个字大圈；text 拼接必须等于完整标题',
 emphasis:'需底色或圈注的精确词组，必须在 text 中出现；多个同词默认均强调',
 style:'与 text.add 相同的文字 style；可组合 outline/gradient/shadow/fillOpacity/字体等，不包含位置尺寸',
 curveHeightMm:'弧形标题弯曲高度，-80–80 mm；正负改变方向，必须单行',
 caption:'标题旁的小注，用户事实或本任务允许的随写；不自动编造',
 captionFontFamily:'小注字体；默认沿用标题字体，可选预装字体或本机已安装字体',
 tapeOpacity:'数字胶带透明度，0.15–0.9；只影响标题后的胶带，不改变文字或真实素材',
 gapMm:'词组间距，0–20 mm',
 backdrop:'可编辑字下底形 {kind:paper|band|brush|oval|dots|squares|mixed|ring|none,paddingMm?:1–8,color?:HEX,opacity?:0.1–1,patternColor?:HEX,densityMm?:2–12,diameterMm?:2–20,staggerMm?:0–5,strokeOnly?:boolean,strokeWidthMm?:0.15–1.5}。squares+strokeOnly 为手绘空心方框，ring 为压在词组后方的大圈；也可在 runs 每项单独指定',
 ornament:'标题旁的可编辑点缀 {kind:spark|flower|leaf|confetti|none,color?:HEX,scaleMm?:2–7,opacity?:0.2–1}；按字群两端定位，不覆盖文字'
};

function validateBackdrop(b){
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['kind','paddingMm','color','opacity','pattern','patternColor','densityMm','diameterMm','staggerMm','strokeOnly','strokeWidthMm'].includes(k))||!['paper','band','brush','oval','dots','squares','mixed','ring','none'].includes(b.kind))throw Error('文字底形参数无效');
  if(b.paddingMm!==undefined&&(!Number.isFinite(b.paddingMm)||b.paddingMm<1||b.paddingMm>8))throw Error('文字底形边距须为 1–8 mm');
  if(b.opacity!==undefined&&(!Number.isFinite(b.opacity)||b.opacity<.1||b.opacity>1))throw Error('文字底形透明度须为 0.1–1');
  if(b.densityMm!==undefined&&(!Number.isFinite(b.densityMm)||b.densityMm<2||b.densityMm>12))throw Error('文字底形纹样间距须为 2–12 mm');
  if(b.diameterMm!==undefined&&(!Number.isFinite(b.diameterMm)||b.diameterMm<2||b.diameterMm>20))throw Error('文字底形图案直径须为 2–20 mm');
  if(b.staggerMm!==undefined&&(!Number.isFinite(b.staggerMm)||b.staggerMm<0||b.staggerMm>5))throw Error('文字底形错列须为 0–5 mm');
  if(b.strokeOnly!==undefined&&typeof b.strokeOnly!=='boolean')throw Error('文字底形空心设置无效');
  if(b.strokeWidthMm!==undefined&&(!Number.isFinite(b.strokeWidthMm)||b.strokeWidthMm<.15||b.strokeWidthMm>1.5))throw Error('文字底形线宽须为 0.15–1.5 mm');
  if(b.pattern!==undefined&&!['plain','dots','stripes','grid'].includes(b.pattern))throw Error('文字底形纹样无效');
  for(const c of [b.color,b.patternColor])if(c!==undefined&&!/^#[\da-f]{6}$/i.test(c))throw Error('文字底形颜色须为 HEX');
}

export function validateTitle(p){
 if(p.treatment==='compose')validateTitleComposition(p);
 if(p.emphasis!==undefined&&(typeof p.emphasis!=='string'||!p.emphasis.trim()||!p.text.includes(p.emphasis)))throw Error('强调词必须出现在完整标题中');
 if(p.curveHeightMm!==undefined&&(!Number.isFinite(p.curveHeightMm)||Math.abs(p.curveHeightMm)>80))throw Error('弧高须为 -80–80 mm');
 if(p.gapMm!==undefined&&p.gapMm>20)throw Error('词组间距须为 0–20 mm');
 if(p.tapeOpacity!==undefined&&(!Number.isFinite(p.tapeOpacity)||p.tapeOpacity<.15||p.tapeOpacity>.9))throw Error('数字胶带透明度须为 0.15–0.9');
 if(p.style!==undefined&&(!p.style||typeof p.style!=='object'||Array.isArray(p.style)))throw Error('标题 style 无效');
 if(p.backdrop!==undefined)validateBackdrop(p.backdrop);
 if(p.ornament!==undefined){
  const o=p.ornament;
  if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!['kind','color','scaleMm','opacity'].includes(k))||!['spark','flower','leaf','confetti','none'].includes(o.kind))throw Error('标题点缀参数无效');
  if(o.color!==undefined&&!/^#[\da-f]{6}$/i.test(o.color))throw Error('标题点缀颜色须为 HEX');
  if(o.scaleMm!==undefined&&(!Number.isFinite(o.scaleMm)||o.scaleMm<2||o.scaleMm>7))throw Error('标题点缀尺寸须为 2–7 mm');
  if(o.opacity!==undefined&&(!Number.isFinite(o.opacity)||o.opacity<.2||o.opacity>1))throw Error('标题点缀透明度须为 0.2–1');
 }
 if(p.runs!==undefined){
  if(!Array.isArray(p.runs)||!p.runs.length||p.runs.length>24)throw Error('词组须为 1–24 项');
  for(const r of p.runs){
   if(!r||Object.keys(r).some(k=>!['text','role','fontFamily','breakBefore','rotationDeg','offsetMm','style','backdrop'].includes(k))||typeof r.text!=='string'||!r.text.length||!Object.hasOwn(roles,r.role||'normal'))throw Error('词组内容或角色无效');
   if(r.backdrop!==undefined)validateBackdrop(r.backdrop);
   if(r.fontFamily!==undefined&&(typeof r.fontFamily!=='string'||!r.fontFamily.trim()))throw Error('词组字体名无效');
   if(r.breakBefore!==undefined&&typeof r.breakBefore!=='boolean')throw Error('词组换行无效');
   if(r.rotationDeg!==undefined&&(!Number.isFinite(r.rotationDeg)||Math.abs(r.rotationDeg)>20))throw Error('词组旋转须为 -20–20 度');
   if(r.offsetMm!==undefined&&(!Array.isArray(r.offsetMm)||r.offsetMm.length!==2||!r.offsetMm.every(n=>Number.isFinite(n)&&Math.abs(n)<=20)))throw Error('词组偏移须为两个 -20–20 mm 数值');
  }
  if(p.runs.map(r=>r.text).join('')!==p.text)throw Error('词组拼接必须等于完整标题，不得丢字或增加文字');
 }
 if(p.treatment==='curve'&&(p.runs||p.text.includes('\n')))throw Error('弧形标题只接受完整单行文字；分组或多行请改用分行标题');
}

export function compileTitle(p,{widthExplicit=false}={}){
 validateTitle(p);
 if(p.treatment==='compose')return compileComposedTitle(p);
 const colors=p.colors||['#3D6871','#E6B45E','#F1E8D5'],fontSize=p.style?.fontSizePt??p.fontSizePt??18,accent=colors[1]||colors[0],ground=colors[2]||'#F1E8D5';
 let width=p.widthMm||70;
 if(p.treatment==='stack'&&!widthExplicit)width=Math.max(28,Math.min(70,extent(p.text,fontSize,p.fontFamily)/2+10));
 if(p.treatment==='seal'&&!widthExplicit)width=Math.max(34,Math.min(70,extent(p.text,fontSize,p.fontFamily)+16));
 if(p.treatment==='vertical')width=Math.max(16,fontSize*pt+10);
 if(width<=10)throw Error('标题宽度须大于 10 mm');
 const style={fontFamily:p.fontFamily||'Xiaolai',fontSizePt:fontSize,color:colors[0]};
 if(p.treatment==='outline')Object.assign(style,{fillOpacity:0,outline:{color:colors[0],widthMm:.35,offsetMm:[0,0]}});
 if(p.treatment==='offset-outline')style.outline={color:accent,widthMm:.4,offsetMm:[.6,.7]};
 if(p.treatment==='shadow')style.shadow={color:accent,offsetMm:[.8,.9],blurMm:0};
 if(p.treatment==='cross-shadow')style.shadow={color:accent,offsetMm:[1.15,1.25],blurMm:0};
 if(p.treatment==='gap-shadow')Object.assign(style,{outline:{color:ground,widthMm:.3,offsetMm:[0,0]},shadow:{color:accent,offsetMm:[1.5,1.5],blurMm:0}});
 if(['gradient','gradient-outline'].includes(p.treatment))style.gradient={angleDeg:90,stops:[{offset:0,color:accent},{offset:1,color:colors[0]}]};
 if(p.treatment==='gradient-outline')style.outline={color:colors[0],widthMm:.35,offsetMm:[0,0]};
 Object.assign(style,p.style);
 const children=[],texts=[],background=[],overlay=[],notes=[];let next=0;
 const shape=(kind,x,y,w,h,paint={})=>({op:'graphic.add',id:p.id+'-mark'+(++next),geometry:{kind},place:at(x,y),size:{width:w,height:h,unit:'mm'},style:{fill:accent,...paint}});
 const motif=(kind,x,y,size,color,opacity,index)=>{
  const s=size,paths=[];
  if(kind==='spark')paths.push({d:`M ${s*.5} 0 Q ${s*.56} ${s*.4} ${s} ${s*.5} Q ${s*.56} ${s*.56} ${s*.5} ${s} Q ${s*.44} ${s*.56} 0 ${s*.5} Q ${s*.44} ${s*.44} ${s*.5} 0 Z`});
  if(kind==='flower'){
   for(let j=0;j<5;j++){const a=j*Math.PI*2/5-Math.PI/2,cx=s*(.5+.29*Math.cos(a)),cy=s*(.5+.29*Math.sin(a)),r=s*.19;paths.push({d:`M ${cx-r} ${cy} a ${r} ${r} 0 1 0 ${2*r} 0 a ${r} ${r} 0 1 0 ${-2*r} 0 Z`});}
  }
  if(kind==='leaf')paths.push({d:`M ${s*.45} ${s*.92} Q ${s*.34} ${s*.55} ${s*.08} ${s*.44} Q ${s*.38} ${s*.18} ${s*.58} ${s*.52} Q ${s*.62} ${s*.2} ${s*.92} ${s*.08} Q ${s*.85} ${s*.55} ${s*.58} ${s*.62} Q ${s*.64} ${s*.8} ${s*.45} ${s*.92} Z`});
  if(kind==='confetti')paths.push({d:`M ${s*.06} ${s*.18} L ${s*.38} ${s*.06} L ${s*.48} ${s*.38} L ${s*.16} ${s*.5} Z M ${s*.58} ${s*.46} L ${s*.96} ${s*.28} L ${s*.84} ${s*.62} Z M ${s*.44} ${s*.72} L ${s*.7} ${s*.65} L ${s*.75} ${s*.88} L ${s*.48} ${s*.96} Z`});
  return {op:'graphic.add',id:p.id+'-ornament'+index,geometry:{kind:'path',viewBox:[0,0,s,s],paths},place:at(x,y),size:{width:s,height:s,unit:'mm'},style:{fill:color,fillOpacity:opacity}};
 };
 const addText=(content,x,y,w,s)=>{
  const size=s.fontSizePt||fontSize,rowHeight=size*pt*(s.lineHeight||1.3),lineWidth=Math.max(1,w-1);
  const layout=textLines({content,width:lineWidth,fontSize:size*pt,fixedLineHeight:rowHeight},value=>extent(value,size,s.fontFamily));
  const lines=layout.lines.length,h=lines*rowHeight+Math.abs(s.curveHeightMm||0)+2;
  const op={op:'text.add',id:p.id+'-text'+(++next),content,place:at(x,y),size:{width:w,unit:'mm'},style:s};
  const lastLine=[...layout.lines].reverse().find(line=>line.text.trim())?.text||'';
  const inkLines=layout.lines.filter(line=>line.text.trim()).map(line=>({x,y:y+line.y,width:Math.min(w,extent(line.text,size,s.fontFamily)),height:size*pt*1.1}));
  texts.push({op,x,y,w,h,inkHeight:(lines-1)*rowHeight+size*pt*1.1,lastLineWidth:Math.min(w,extent(lastLine,size,s.fontFamily)),lineCount:lines,inkLines});return texts.at(-1);
 };
 let runs=p.runs;
 if(!runs&&p.emphasis){const pieces=p.text.split(p.emphasis);runs=[];pieces.forEach((part,i)=>{if(part)runs.push({text:part});if(i<pieces.length-1)runs.push({text:p.emphasis,role:'primary'});});}
 if(runs&&p.treatment==='vertical')throw Error('竖排使用完整文字，不接受词组布局');
 if(runs){
  const longest=Math.max(...runs.map(run=>extent(run.text,fontSize*roles[run.role||'normal'],run.fontFamily||style.fontFamily)*1.32+4));
  if(longest>width-10){
   if(widthExplicit&&['stagger','phrases'].includes(p.treatment)&&width-10<longest*.7)throw Error('标题词组宽度不足；增大 widthMm 或减小 fontSizePt，不能把词组拆成单字换行');
   if(!widthExplicit)width=longest+10;
  }
  let x=5,y=5,lineH=0;
  for(const run of runs){
   const primary=run.role==='primary',s={...style,fontSizePt:fontSize*roles[run.role||'normal'],...run.style,...(run.fontFamily?{fontFamily:run.fontFamily}:{})};
   const w=Math.min(width-10,extent(run.text,s.fontSizePt,s.fontFamily)*1.32+4);
   if((run.breakBefore||x+w>width-5)&&x>5){x=5;y+=lineH+(p.gapMm??2);lineH=0;}
   const dx=run.offsetMm?.[0]||0,dy=run.offsetMm?.[1]||(primary?0:s.fontSizePt*pt*.18);
   const t=addText(run.text,x+dx,y+dy,w,s);
   t.backdrop=run.backdrop;
   if(run.rotationDeg)t.op.place.rotationDeg=run.rotationDeg;
   if(p.treatment==='highlight'&&(p.emphasis?run.text===p.emphasis:primary))for(const line of t.inkLines)background.push(shape('rect',line.x-.7,line.y+line.height*.48,line.width+1.4,line.height*.52,{fill:accent,fillOpacity:.45}));
   if(p.treatment==='circle'&&(p.emphasis?run.text===p.emphasis:primary))for(const line of t.inkLines)background.push(shape('ellipse',line.x-1,line.y-1,line.width+2,line.height+2,{fill:null,stroke:accent,strokeWidthMm:.45}));
   x+=w+(p.gapMm??1.2);lineH=Math.max(lineH,t.inkHeight+Math.abs(dy));
  }
 }else{
  const content=p.treatment==='vertical'?segments(p.text).join('\n'):p.text;
  if(p.treatment==='curve'){
   const needed=extent(content,style.fontSizePt,style.fontFamily)*1.04+12;
   if(widthExplicit&&needed>width)throw Error('弧形标题文字超出宽度；增大 widthMm 或减小 fontSizePt，不会自动丢字');
   width=Math.max(width,needed);style.curveHeightMm=p.curveHeightMm??style.curveHeightMm??5;
  }
  const t=addText(content,5,5,width-10,p.treatment==='seal'?{...style,textAlign:'center'}:style);
  if(p.treatment==='seal'){
   if(t.inkHeight>width-10)throw Error('邮戳圈记文字超出圆形范围；缩短标签或增大 widthMm');
   const dy=Math.max(0,(width-t.inkHeight)/2-t.y);
   t.y+=dy;t.op.place.at[1]+=dy;
   for(const line of t.inkLines)line.y+=dy;
  }
  if(['highlight','circle'].includes(p.treatment))notes.push('未给强调词或主词组，本次保留普通标题；请指定 emphasis 或 runs 中的 primary。');
  if(p.treatment==='stagger')notes.push('未提供词组，保留连续读序；不自动随机旋转每字。');
 }
 const mainTexts=texts.slice();
 let height=Math.max(p.heightMm||14,...texts.map(t=>t.y+t.h+5));
 if(p.treatment==='seal')height=Math.max(height,width);
 if(p.caption){
  if(p.treatment==='cross-shadow'){
   const first=mainTexts[0],available=width-12,initial=Math.min(9,fontSize*.34),captionFamily=p.captionFontFamily||style.fontFamily,needed=extent(p.caption,initial,captionFamily)*1.2+3;
   const small=needed>available?initial*(available-3)/(needed-3):initial;
   if(small<6||p.caption.includes('\n'))throw Error('穿字横带的小字过长；缩短 caption 或增大 widthMm');
   const w=Math.min(available,extent(p.caption,small,captionFamily)*1.2+3),y=first.y+first.inkHeight*.68;
   const captionX=Math.max(3,first.x+first.lastLineWidth*.5-w*.5);
   overlay.push(shape('rect',captionX-1,y-.35,w+2,small*pt*1.2+.7,{fill:ground,fillOpacity:.82}));
   const t=addText(p.caption,captionX,y,w,{fontFamily:captionFamily,fontSizePt:small,color:colors[0]});
   overlay.push(t.op);height=Math.max(height,t.y+t.h+5);
  }else{const y=p.treatment==='seal'?width+3:Math.max(...texts.map(t=>t.y+t.inkHeight))+3;const t=addText(p.caption,5,y,width-10,{fontFamily:p.captionFontFamily||style.fontFamily,fontSizePt:Math.min(12,fontSize*.65),color:colors[0]});height=t.y+t.h+5;}
 }
 if(['bubble','seal'].includes(p.treatment))background.unshift(shape('ellipse',0,0,width,p.treatment==='seal'?width:height,{fill:ground,...(p.treatment==='seal'?{stroke:colors[0],strokeWidthMm:.4}:{})}));
 if(p.treatment==='tape'){
  const lines=mainTexts.flatMap(t=>t.inkLines);
  for(const [index,line] of lines.entries()){
   const x=Math.max(0,line.x-2),y=Math.max(0,line.y+line.height*.12),w=Math.min(width-x,line.width+4),h=Math.max(2.4,line.height*1.15);
   const notch=Math.min(.7,h*.18),d=`M 0 0 L ${w} 0 L ${w-notch} ${h*.24} L ${w} ${h*.47} L ${w-notch} ${h*.72} L ${w} ${h} L 0 ${h} L ${notch} ${h*.75} L 0 ${h*.53} L ${notch} ${h*.27} Z`;
   background.push({op:'graphic.add',id:p.id+'-tape'+index,geometry:{kind:'path',viewBox:[0,0,w,h],paths:[{d}]},place:at(x,y),size:{width:w,height:h,unit:'mm'},style:{fill:ground,fillOpacity:p.tapeOpacity??.62,stroke:accent,strokeWidthMm:.12}});
   if(p.pattern==='dots')for(let dx=2;dx<w-1;dx+=3.8)background.push(shape('ellipse',x+dx,y+h*.75,.45,.45,{fill:accent,fillOpacity:.34}));
   if(p.pattern==='stripes'||p.pattern==='grid'){
    const paths=[];
    for(let dx=2;dx<w-1;dx+=4.2)paths.push({d:p.pattern==='stripes'?`M ${dx} ${h*.85} L ${Math.min(w-1,dx+1.8)} ${h*.15}`:`M ${dx} ${h*.15} L ${dx} ${h*.85}`});
    if(p.pattern==='grid')paths.push({d:`M 1 ${h*.5} L ${w-1} ${h*.5}`});
    background.push({op:'graphic.add',id:p.id+'-tape-pattern'+index,geometry:{kind:'path',viewBox:[0,0,w,h],paths},place:at(x,y),size:{width:w,height:h,unit:'mm'},style:{fill:null,stroke:accent,strokeWidthMm:.12,opacity:.34}});
   }
  }
  notes.push('标题后方为可编辑数字胶带，不消耗实体胶带来源。');
 }
 if(p.treatment==='underline'){
  const last=mainTexts.at(-1),bottom=last.y+last.inkHeight;
  const sameRow=last.lineCount===1?mainTexts.filter(t=>t.lineCount===1&&Math.abs(t.y-last.y)<1):[last];
  const left=Math.min(...sameRow.map(t=>t.x)),right=Math.max(...sameRow.map(t=>t.x+t.lastLineWidth));
  const lineWidth=Math.max(1,Math.min(width-left,right-left));
  children.push({op:'graphic.add',id:p.id+'-underline',geometry:{kind:'stroke',unit:'mm',points:Array.from({length:9},(_,i)=>({x:i*lineWidth/8,y:Math.sin(i*.8)*.22,pressure:.6}))},place:at(left,bottom+1),style:{stroke:accent,strokeWidthMm:.55,penStyle:'fountain'}});
  height=Math.max(height,bottom+5);
 }
 if(p.pattern&&p.pattern!=='plain'&&p.treatment!=='tape'){
  const count=p.count||8;
  for(let i=0;i<count;i++){
   const x=(i+.5)*width/count;
   if(p.pattern==='dots')background.push(shape('ellipse',x,2,.9,.9,{fill:accent,fillOpacity:.45}));
   else {const g=shape('rect',x,1,width/count,3,{fill:null,stroke:accent,strokeWidthMm:.25});g.geometry={kind:'path',viewBox:[0,0,10,10],paths:[{d:p.pattern==='grid'?'M 5 0 L 5 10 M 0 5 L 10 5':'M 0 10 L 10 0'}]};background.push(g);}
  }
 }
 const defaultBackdrop=p.backdrop||({label:{kind:'paper',paddingMm:3},'script-dots':{kind:'dots',densityMm:5.2,diameterMm:3.2,staggerMm:2.2},'paper-lettering':{kind:'band',paddingMm:4,opacity:.95}}[p.treatment]);
 let backdropIndex=0;
 for(const t of mainTexts){
  const backdrop=t.backdrop??defaultBackdrop;
  if(!backdrop||backdrop.kind==='none')continue;
  const pad=backdrop.paddingMm??3,density=backdrop.densityMm??4,ink=t.inkLines,base=backdrop.color||(p.treatment==='paper-lettering'?colors[0]:ground),patternColor=backdrop.patternColor||accent,opacity=backdrop.opacity??.86;
  const motifBackground=['dots','squares','mixed'].includes(backdrop.kind);
  const boxes=ink.map(l=>({x:Math.max(0,l.x-pad),y:Math.max(0,l.y-pad*.65),w:Math.min(width-Math.max(0,l.x-pad),l.width+pad*2),h:l.height+pad*1.4,line:l}));
  for(const b of boxes){
   const i=backdropIndex++;
   if(motifBackground){
    const line=b.line,requestedDiameter=backdrop.diameterMm??Math.max(2,fontSize*pt*.3),diameter=backdrop.strokeOnly?requestedDiameter:Math.min(requestedDiameter,fontSize*pt*.42);
    const outlined=backdrop.strokeOnly===true;
    const step=Math.max(density,diameter*1.28+1.1),count=outlined&&backdrop.kind==='squares'?4:Math.max(1,Math.min(14,Math.floor(line.width/step)));
    for(let j=0;j<count;j++){
     const phase=Math.sin((j+1)*12.43+i*4.9),size=Math.max(2,Math.min(12,diameter*(.78+.25*Math.cos(j*2.8+i))));
     const cx=outlined&&backdrop.kind==='squares'?line.x+line.width*(j%2===0?.28:j===3?.98:.74):line.x+line.width*(j+.5)/count+phase*Math.min(.18,density*.04);
     const cy=outlined&&backdrop.kind==='squares'?line.y+line.height*(j<2?.18:1.03):line.y+line.height*.48+((j%3)-1)*(backdrop.staggerMm??2.2)+Math.sin(j*2.1+i)*.32;
     const x=Math.max(0,Math.min(width-size,cx-size/2)),y=Math.max(0,cy-size/2);
     const square=backdrop.kind==='squares'||(backdrop.kind==='mixed'&&j%3!==0);
     const tile=shape(square?'rect':'ellipse',x,y,size,size,outlined?{fill:null,stroke:patternColor,strokeWidthMm:backdrop.strokeWidthMm??.7,opacity}:{fill:patternColor,fillOpacity:opacity*(j%4===0?.72:.88)});
     tile.id=p.id+'-backdrop-'+i+'-'+j;
     if(square)tile.place.rotationDeg=(j%2===0?-1:1)*(2+j%3*2);
     background.push(tile);height=Math.max(height,y+size+2);
    }
    continue;
   }
   if(backdrop.kind==='ring'){
    const line=b.line,diameter=backdrop.diameterMm??Math.max(12,line.height*1.6),count=line.width>diameter*.7?2:1;
    for(let j=0;j<count;j++){
     const d=Math.min(20,diameter*(j===0?1:.84)),cx=line.x+line.width*(j===0?.34:.84),cy=line.y+line.height*(j===0?.5:.94);
     const x=Math.max(0,Math.min(width-d,cx-d/2)),y=Math.max(0,cy-d/2);
     const ring=shape('ellipse',x,y,d,d,{fill:null,stroke:patternColor,strokeWidthMm:backdrop.strokeWidthMm??.65,opacity});
     ring.id=p.id+'-backdrop-'+i+'-ring'+j;background.push(ring);height=Math.max(height,y+d+2);
    }
    continue;
   }
   let geometry={kind:backdrop.kind==='oval'?'ellipse':'rect'};
   if(backdrop.kind==='paper'||backdrop.kind==='brush'){
    const {w,h}=b,soft=backdrop.kind==='brush';
    geometry={kind:'path',viewBox:[0,0,w,h],paths:[{d:soft?`M 0 ${h*.34} Q ${w*.18} ${-h*.08} ${w*.52} ${h*.08} L ${w} ${h*.24} L ${w*.94} ${h*.8} Q ${w*.5} ${h*1.04} 0 ${h*.77} Z`:`M 0 ${h*.13} L ${w*.23} 0 L ${w*.62} ${h*.04} L ${w} 0 L ${w*.98} ${h*.89} L ${w*.69} ${h} L ${w*.32} ${h*.96} L 0 ${h} Z`}]};
   }
   background.unshift({op:'graphic.add',id:p.id+'-backdrop'+i,geometry,place:at(b.x,b.y),size:{width:b.w,height:b.h,unit:'mm'},style:{fill:base,fillOpacity:opacity}});
   if(backdrop.kind==='paper')background.unshift({op:'graphic.add',id:p.id+'-backdrop-underlay'+i,geometry,place:at(b.x+.9,b.y+1.05),size:{width:Math.min(b.w,width-b.x-.9),height:b.h,unit:'mm'},style:{fill:patternColor,fillOpacity:Math.min(.55,opacity*.46)}});
   if(backdrop.pattern&&backdrop.pattern!=='plain'){
    const paths=[];
    for(let xx=1.2;xx<b.w-1;xx+=backdrop.pattern==='stripes'?density*.55:density){
     if(backdrop.pattern==='dots'){
      const dot=shape('ellipse',b.x+xx,b.y+b.h*.83,(Math.floor(xx/density)%3===0?.65:.38),.42,{fill:patternColor,fillOpacity:.55});background.push(dot);
     }else if(backdrop.pattern==='stripes'){
      // A narrow lower-edge hatch acts like printed paper, without ruling through the lettering.
      const y0=b.h*.77,y1=b.h*.97,dx=Math.min(2.3,b.w-xx-1);
      if(dx>0)paths.push({d:`M ${xx} ${y1} L ${xx+dx} ${y0}`});
     }else{
      paths.push({d:`M ${xx} ${b.h*.83} L ${xx} ${b.h*.97}`});
     }
    }
    if(backdrop.pattern==='grid')paths.push({d:`M 1 ${b.h*.89} L ${b.w-1} ${b.h*.89}`});
    if(paths.length)background.push({op:'graphic.add',id:p.id+'-backdrop-pattern'+i,geometry:{kind:'path',viewBox:[0,0,b.w,b.h],paths},place:at(b.x,b.y),size:{width:b.w,height:b.h,unit:'mm'},style:{fill:null,stroke:patternColor,strokeWidthMm:.17,opacity:.64}});
   }
   height=Math.max(height,b.y+b.h+(backdrop.kind==='paper'?1.4:2));
  }
 }
 if(['scatter-round','scatter-triangle','number-route'].includes(p.treatment)){
  const box=mainTexts[0],y=Math.min(height-3,box.y+box.inkHeight+1),x=Math.max(2,box.x+box.lastLineWidth+1);
  if(p.treatment==='scatter-round'){
   children.push(shape('ellipse',Math.min(width-5,x),y,2.5,2.5,{fill:accent}));
   children.push(shape('ellipse',Math.min(width-4,box.x+box.lastLineWidth*.4),Math.max(1,box.y-2),1,1,{fill:accent,fillOpacity:.8}));
  }
  if(p.treatment==='scatter-triangle'){
   children.push({op:'graphic.add',id:p.id+'-triangle',geometry:{kind:'path',viewBox:[0,0,3,3],paths:[{d:'M 1.5 0 L 3 3 L 0 3 Z'}]},place:at(Math.min(width-5,x),y),size:{width:3,height:3,unit:'mm'},style:{fill:accent}});
   children.push(shape('ellipse',Math.min(width-4,box.x+box.lastLineWidth*.45),Math.max(1,box.y-2),.8,.8,{fill:accent,fillOpacity:.8}));
  }
  if(p.treatment==='number-route'){
   const endY=Math.min(height-2,y+1);
   children.push({op:'graphic.add',id:p.id+'-route',geometry:{kind:'path',viewBox:[0,0,width,height],paths:[{d:`M 2 ${Math.min(height-2,y+3)} Q ${width*.5} ${Math.min(height-1,y+4)} ${width-2} ${endY}`}]},place:at(0,0),size:{width,height,unit:'mm'},style:{fill:null,stroke:accent,strokeWidthMm:.35}});
   children.push(shape('ellipse',width-3,endY-.65,1.3,1.3,{fill:accent}));
  }
 }
 const ornament=p.ornament;
 if(ornament&&ornament.kind!=='none'){
  const s=ornament.scaleMm??4.2,c=ornament.color||accent,alpha=ornament.opacity??.84,first=mainTexts[0],last=mainTexts.at(-1);
  const x=Math.max(1,Math.min(width-s-1,last.x+last.lastLineWidth+1.2));
  const y=last.y+last.inkHeight+1.15;
  children.push(motif(ornament.kind,x,y,s,c,alpha,0));
  if(ornament.kind==='flower')children.push(shape('ellipse',x+s*.43,y+s*.43,s*.14,s*.14,{fill:ground,fillOpacity:.94}));
  // A quieter echo ties the ornament to the title instead of scattering symbols over the page.
  const small=Math.max(1.4,s*.42),upperX=Math.max(1,Math.min(width-small-1,first.x+Math.min(first.lastLineWidth*.18,5)));
  children.push(motif(ornament.kind==='flower'?'spark':ornament.kind,upperX,Math.max(.3,first.y-small-1),small,c,alpha*.55,1));
  height=Math.max(height,y+s+1.2);
 }
 const ordinaryTexts=texts.filter(t=>!overlay.includes(t.op)).map(t=>t.op);
 return {children:[...background,...ordinaryTexts,...overlay,...children],width,height,notes};
}
