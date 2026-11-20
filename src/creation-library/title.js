const pt=25.4/72;
const segments=text=>[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.segment);
const extent=(text,fontSize)=>segments(text).reduce((sum,ch)=>sum+fontSize*pt*(/^[\u0000-\u00ff]+$/u.test(ch)?.65:1),0);
const roles={primary:1.35,secondary:.78,normal:1};
const at=(x,y)=>({reference:'parent',at:[x,y],unit:'mm',anchor:'top-left'});

export const titleFields=['text','fontFamily','fontSizePt','widthMm','heightMm','colors','pattern','count','runs','emphasis','caption','gapMm','style','curveHeightMm'];
export const titleHelp={
 runs:'可选词组数组；每项 {text,role:primary|secondary|normal,breakBefore?,rotationDeg?,offsetMm?,style?}，text 拼接必须等于完整标题；按词义分组，不随机旋转每字',
 emphasis:'需底色或圈注的精确词组，必须在 text 中出现；多个同词默认均强调',
 style:'与 text.add 相同的文字 style；可组合 outline/gradient/shadow/fillOpacity/字体等，不包含位置尺寸',
 curveHeightMm:'弧形标题弯曲高度，-80–80 mm；正负改变方向，必须单行',
 caption:'标题旁的小注，用户事实或本任务允许的随写；不自动编造',
 gapMm:'词组间距，0–20 mm'
};

export function validateTitle(p){
 if(p.emphasis!==undefined&&(typeof p.emphasis!=='string'||!p.emphasis.trim()||!p.text.includes(p.emphasis)))throw Error('强调词必须出现在完整标题中');
 if(p.curveHeightMm!==undefined&&(!Number.isFinite(p.curveHeightMm)||Math.abs(p.curveHeightMm)>80))throw Error('弧高须为 -80–80 mm');
 if(p.gapMm!==undefined&&p.gapMm>20)throw Error('词组间距须为 0–20 mm');
 if(p.style!==undefined&&(!p.style||typeof p.style!=='object'||Array.isArray(p.style)))throw Error('标题 style 无效');
 if(p.runs!==undefined){
  if(!Array.isArray(p.runs)||!p.runs.length||p.runs.length>24)throw Error('词组须为 1–24 项');
  for(const r of p.runs){
   if(!r||Object.keys(r).some(k=>!['text','role','breakBefore','rotationDeg','offsetMm','style'].includes(k))||typeof r.text!=='string'||!r.text.length||!Object.hasOwn(roles,r.role||'normal'))throw Error('词组内容或角色无效');
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
 const colors=p.colors||['#3D6871','#E6B45E','#F1E8D5'],fontSize=p.style?.fontSizePt??p.fontSizePt??18,accent=colors[1]||colors[0],ground=colors[2]||'#F1E8D5';
 let width=p.widthMm||70;
 if(p.treatment==='stack'&&!widthExplicit)width=Math.max(28,Math.min(70,extent(p.text,fontSize)/2+10));
 if(p.treatment==='vertical')width=Math.max(16,fontSize*pt+10);
 if(width<=10)throw Error('标题宽度须大于 10 mm');
 const style={fontFamily:p.fontFamily||'Xiaolai',fontSizePt:fontSize,color:colors[0]};
 if(p.treatment==='outline')Object.assign(style,{fillOpacity:0,outline:{color:colors[0],widthMm:.35,offsetMm:[0,0]}});
 if(p.treatment==='offset-outline')style.outline={color:accent,widthMm:.4,offsetMm:[.6,.7]};
 if(p.treatment==='shadow')style.shadow={color:accent,offsetMm:[.6,.7],blurMm:.1};
 if(['gradient','gradient-outline'].includes(p.treatment))style.gradient={angleDeg:90,stops:[{offset:0,color:accent},{offset:1,color:colors[0]}]};
 if(p.treatment==='gradient-outline')style.outline={color:ground,widthMm:.4,offsetMm:[0,0]};
 Object.assign(style,p.style);
 const children=[],texts=[],background=[],notes=[];let next=0;
 const shape=(kind,x,y,w,h,paint={})=>({op:'graphic.add',id:p.id+'-mark'+(++next),geometry:{kind},place:at(x,y),size:{width:w,height:h,unit:'mm'},style:{fill:accent,...paint}});
 const addText=(content,x,y,w,s)=>{
  const rowHeight=(s.fontSizePt||fontSize)*pt*(s.lineHeight||1.6),lineWidth=Math.max(1,w-1);
  const lines=content.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(extent(line,s.fontSizePt||fontSize)/lineWidth)),0);
  const h=lines*rowHeight+Math.abs(s.curveHeightMm||0)+2;
  const op={op:'text.add',id:p.id+'-text'+(++next),content,place:at(x,y),size:{width:w,unit:'mm'},style:s};
  texts.push({op,x,y,w,h,inkHeight:(lines-1)*rowHeight+(s.fontSizePt||fontSize)*pt*1.1,inkWidth:Math.min(w,Math.max(...content.split('\n').map(line=>extent(line,s.fontSizePt||fontSize))))});return texts.at(-1);
 };
 let runs=p.runs;
 if(!runs&&p.emphasis){const pieces=p.text.split(p.emphasis);runs=[];pieces.forEach((part,i)=>{if(part)runs.push({text:part});if(i<pieces.length-1)runs.push({text:p.emphasis,role:'primary'});});}
 if(runs&&p.treatment==='vertical')throw Error('竖排使用完整文字，不接受词组布局');
 if(runs){
  let x=5,y=5,lineH=0;
  for(const run of runs){
   const primary=run.role==='primary',s={...style,fontSizePt:fontSize*roles[run.role||'normal'],...run.style};
   const w=Math.min(width-10,extent(run.text,s.fontSizePt)+2);
   if((run.breakBefore||x+w>width-5)&&x>5){x=5;y+=lineH+(p.gapMm??2);lineH=0;}
   const dx=run.offsetMm?.[0]||0,dy=run.offsetMm?.[1]||(primary?0:s.fontSizePt*pt*.18);
   const t=addText(run.text,x+dx,y+dy,w,s);
   if(run.rotationDeg)t.op.place.rotationDeg=run.rotationDeg;
   if(p.treatment==='highlight'&&(p.emphasis?run.text===p.emphasis:primary))background.push(shape('rect',t.x-.7,t.y+t.inkHeight*.48,t.inkWidth+1.4,t.inkHeight*.52,{fill:accent,fillOpacity:.45}));
   if(p.treatment==='circle'&&(p.emphasis?run.text===p.emphasis:primary))background.push(shape('ellipse',t.x-1,t.y-1,t.inkWidth+2,t.inkHeight+2,{fill:null,stroke:accent,strokeWidthMm:.45}));
   x+=w+(p.gapMm??1.2);lineH=Math.max(lineH,t.inkHeight+Math.abs(dy));
  }
 }else{
  const content=p.treatment==='vertical'?segments(p.text).join('\n'):p.text;
  if(p.treatment==='curve'){
   const needed=extent(content,style.fontSizePt)*1.04+12;
   if(widthExplicit&&needed>width)throw Error('弧形标题文字超出宽度；增大 widthMm 或减小 fontSizePt，不会自动丢字');
   width=Math.max(width,needed);style.curveHeightMm=p.curveHeightMm??style.curveHeightMm??5;
  }
  const t=addText(content,5,5,width-10,style);
  if(['highlight','circle'].includes(p.treatment))notes.push('未给强调词或主词组，本次保留普通标题；请指定 emphasis 或 runs 中的 primary。');
  if(p.treatment==='stagger')notes.push('未提供词组，保留连续读序；不自动随机旋转每字。');
 }
 let height=Math.max(p.heightMm||14,...texts.map(t=>t.y+t.h+5));
 if(p.caption){const y=Math.max(...texts.map(t=>t.y+t.inkHeight))+3;const t=addText(p.caption,5,y,width-10,{fontFamily:style.fontFamily,fontSizePt:Math.min(12,fontSize*.65),color:colors[0]});height=t.y+t.h+5;}
 if(['label','bubble','seal'].includes(p.treatment))background.unshift(shape(['bubble','seal'].includes(p.treatment)?'ellipse':'rect',0,0,width,height,{fill:ground,...(p.treatment==='seal'?{stroke:colors[0],strokeWidthMm:.4}:{})}));
 if(p.treatment==='underline'){
  const main=texts.filter(t=>t.op.content!==p.caption),bottom=Math.max(...main.map(t=>t.y+t.inkHeight)),lineWidth=Math.min(width-10,Math.max(...main.map(t=>t.inkWidth)));
  children.push({op:'graphic.add',id:p.id+'-underline',geometry:{kind:'stroke',unit:'mm',points:Array.from({length:9},(_,i)=>({x:i*lineWidth/8,y:Math.sin(i*.8)*.22,pressure:.6}))},place:at(5,bottom+1),style:{stroke:accent,strokeWidthMm:.55,penStyle:'fountain'}});
  height=Math.max(height,bottom+5);
 }
 if(p.pattern&&p.pattern!=='plain'){
  const count=p.count||8;
  for(let i=0;i<count;i++){
   const x=(i+.5)*width/count;
   if(p.pattern==='dots')background.push(shape('ellipse',x,2,.9,.9,{fill:accent,fillOpacity:.45}));
   else {const g=shape('rect',x,1,width/count,3,{fill:null,stroke:accent,strokeWidthMm:.25});g.geometry={kind:'path',viewBox:[0,0,10,10],paths:[{d:p.pattern==='grid'?'M 5 0 L 5 10 M 0 5 L 10 5':'M 0 10 L 10 0'}]};background.push(g);}
  }
 }
 return {children:[...background,...texts.map(t=>t.op),...children],width,height,notes};
}
