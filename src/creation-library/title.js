import {textLines} from '../editor-tools-model.js';

const pt=25.4/72;
const segments=text=>[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.segment);
const extent=(text,fontSize)=>segments(text).reduce((sum,ch)=>sum+fontSize*pt*(/^[\u0000-\u00ff]+$/u.test(ch)?.65:1),0);
const roles={primary:1.35,secondary:.78,normal:1};
const at=(x,y)=>({reference:'parent',at:[x,y],unit:'mm',anchor:'top-left'});

export const titleFields=['text','fontFamily','fontSizePt','widthMm','heightMm','colors','pattern','count','runs','emphasis','caption','captionFontFamily','gapMm','style','curveHeightMm','tapeOpacity','backdrop'];
export const titleHelp={
 runs:'可选词组数组；每项 {text,role:primary|secondary|normal,fontFamily?,breakBefore?,rotationDeg?,offsetMm?,style?}。fontFamily 可给某个词组换字体；text 拼接必须等于完整标题；按词义分组，不随机旋转每字',
 emphasis:'需底色或圈注的精确词组，必须在 text 中出现；多个同词默认均强调',
 style:'与 text.add 相同的文字 style；可组合 outline/gradient/shadow/fillOpacity/字体等，不包含位置尺寸',
 curveHeightMm:'弧形标题弯曲高度，-80–80 mm；正负改变方向，必须单行',
 caption:'标题旁的小注，用户事实或本任务允许的随写；不自动编造',
 captionFontFamily:'小注字体；默认沿用标题字体，可选预装字体或本机已安装字体',
 tapeOpacity:'数字胶带透明度，0.15–0.9；只影响标题后的胶带，不改变文字或真实素材',
 gapMm:'词组间距，0–20 mm',
 backdrop:'可编辑文字底形 {kind:paper|band|brush|oval|dots|none,paddingMm?:1–8,color?:HEX,opacity?:0.1–1,pattern?:plain|dots|stripes|grid,patternColor?:HEX,densityMm?:2–12}；自动随字行宽度变化'
};

export function validateTitle(p){
 if(p.emphasis!==undefined&&(typeof p.emphasis!=='string'||!p.emphasis.trim()||!p.text.includes(p.emphasis)))throw Error('强调词必须出现在完整标题中');
 if(p.curveHeightMm!==undefined&&(!Number.isFinite(p.curveHeightMm)||Math.abs(p.curveHeightMm)>80))throw Error('弧高须为 -80–80 mm');
 if(p.gapMm!==undefined&&p.gapMm>20)throw Error('词组间距须为 0–20 mm');
 if(p.tapeOpacity!==undefined&&(!Number.isFinite(p.tapeOpacity)||p.tapeOpacity<.15||p.tapeOpacity>.9))throw Error('数字胶带透明度须为 0.15–0.9');
 if(p.style!==undefined&&(!p.style||typeof p.style!=='object'||Array.isArray(p.style)))throw Error('标题 style 无效');
 if(p.backdrop!==undefined){
  const b=p.backdrop;
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['kind','paddingMm','color','opacity','pattern','patternColor','densityMm'].includes(k))||!['paper','band','brush','oval','dots','none'].includes(b.kind))throw Error('文字底形参数无效');
  if(b.paddingMm!==undefined&&(!Number.isFinite(b.paddingMm)||b.paddingMm<1||b.paddingMm>8))throw Error('文字底形边距须为 1–8 mm');
  if(b.opacity!==undefined&&(!Number.isFinite(b.opacity)||b.opacity<.1||b.opacity>1))throw Error('文字底形透明度须为 0.1–1');
  if(b.densityMm!==undefined&&(!Number.isFinite(b.densityMm)||b.densityMm<2||b.densityMm>12))throw Error('文字底形纹样间距须为 2–12 mm');
  if(b.pattern!==undefined&&!['plain','dots','stripes','grid'].includes(b.pattern))throw Error('文字底形纹样无效');
  for(const c of [b.color,b.patternColor])if(c!==undefined&&!/^#[\da-f]{6}$/i.test(c))throw Error('文字底形颜色须为 HEX');
 }
 if(p.runs!==undefined){
  if(!Array.isArray(p.runs)||!p.runs.length||p.runs.length>24)throw Error('词组须为 1–24 项');
  for(const r of p.runs){
   if(!r||Object.keys(r).some(k=>!['text','role','fontFamily','breakBefore','rotationDeg','offsetMm','style'].includes(k))||typeof r.text!=='string'||!r.text.length||!Object.hasOwn(roles,r.role||'normal'))throw Error('词组内容或角色无效');
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
 const colors=p.colors||['#3D6871','#E6B45E','#F1E8D5'],fontSize=p.style?.fontSizePt??p.fontSizePt??18,accent=colors[1]||colors[0],ground=colors[2]||'#F1E8D5';
 let width=p.widthMm||70;
 if(p.treatment==='stack'&&!widthExplicit)width=Math.max(28,Math.min(70,extent(p.text,fontSize)/2+10));
 if(p.treatment==='seal'&&!widthExplicit)width=Math.max(34,Math.min(70,extent(p.text,fontSize)+16));
 if(p.treatment==='vertical')width=Math.max(16,fontSize*pt+10);
 if(width<=10)throw Error('标题宽度须大于 10 mm');
 const style={fontFamily:p.fontFamily||'Xiaolai',fontSizePt:fontSize,color:colors[0]};
 if(p.treatment==='outline')Object.assign(style,{fillOpacity:0,outline:{color:colors[0],widthMm:.35,offsetMm:[0,0]}});
 if(p.treatment==='offset-outline')style.outline={color:accent,widthMm:.4,offsetMm:[.6,.7]};
 if(['shadow','cross-shadow'].includes(p.treatment))style.shadow={color:accent,offsetMm:[.6,.7],blurMm:.1};
 if(['gradient','gradient-outline'].includes(p.treatment))style.gradient={angleDeg:90,stops:[{offset:0,color:accent},{offset:1,color:colors[0]}]};
 if(p.treatment==='gradient-outline')style.outline={color:colors[0],widthMm:.35,offsetMm:[0,0]};
 Object.assign(style,p.style);
 const children=[],texts=[],background=[],overlay=[],notes=[];let next=0;
 const shape=(kind,x,y,w,h,paint={})=>({op:'graphic.add',id:p.id+'-mark'+(++next),geometry:{kind},place:at(x,y),size:{width:w,height:h,unit:'mm'},style:{fill:accent,...paint}});
 const addText=(content,x,y,w,s)=>{
  const size=s.fontSizePt||fontSize,rowHeight=size*pt*(s.lineHeight||1.3),lineWidth=Math.max(1,w-1);
  const layout=textLines({content,width:lineWidth,fontSize:size*pt,fixedLineHeight:rowHeight},value=>extent(value,size));
  const lines=layout.lines.length,h=lines*rowHeight+Math.abs(s.curveHeightMm||0)+2;
  const op={op:'text.add',id:p.id+'-text'+(++next),content,place:at(x,y),size:{width:w,unit:'mm'},style:s};
  const lastLine=[...layout.lines].reverse().find(line=>line.text.trim())?.text||'';
  const inkLines=layout.lines.filter(line=>line.text.trim()).map(line=>({x,y:y+line.y,width:Math.min(w,extent(line.text,size)),height:size*pt*1.1}));
  texts.push({op,x,y,w,h,inkHeight:(lines-1)*rowHeight+size*pt*1.1,lastLineWidth:Math.min(w,extent(lastLine,size)),lineCount:lines,inkLines});return texts.at(-1);
 };
 let runs=p.runs;
 if(!runs&&p.emphasis){const pieces=p.text.split(p.emphasis);runs=[];pieces.forEach((part,i)=>{if(part)runs.push({text:part});if(i<pieces.length-1)runs.push({text:p.emphasis,role:'primary'});});}
 if(runs&&p.treatment==='vertical')throw Error('竖排使用完整文字，不接受词组布局');
 if(runs){
  const longest=Math.max(...runs.map(run=>extent(run.text,fontSize*roles[run.role||'normal'])*1.32+4));
  if(longest>width-10){
   if(widthExplicit&&['stagger','phrases'].includes(p.treatment)&&width-10<longest*.7)throw Error('标题词组宽度不足；增大 widthMm 或减小 fontSizePt，不能把词组拆成单字换行');
   if(!widthExplicit)width=longest+10;
  }
  let x=5,y=5,lineH=0;
  for(const run of runs){
   const primary=run.role==='primary',s={...style,fontSizePt:fontSize*roles[run.role||'normal'],...run.style,...(run.fontFamily?{fontFamily:run.fontFamily}:{})};
   const w=Math.min(width-10,extent(run.text,s.fontSizePt)*1.32+4);
   if((run.breakBefore||x+w>width-5)&&x>5){x=5;y+=lineH+(p.gapMm??2);lineH=0;}
   const dx=run.offsetMm?.[0]||0,dy=run.offsetMm?.[1]||(primary?0:s.fontSizePt*pt*.18);
   const t=addText(run.text,x+dx,y+dy,w,s);
   if(run.rotationDeg)t.op.place.rotationDeg=run.rotationDeg;
   if(p.treatment==='highlight'&&(p.emphasis?run.text===p.emphasis:primary))for(const line of t.inkLines)background.push(shape('rect',line.x-.7,line.y+line.height*.48,line.width+1.4,line.height*.52,{fill:accent,fillOpacity:.45}));
   if(p.treatment==='circle'&&(p.emphasis?run.text===p.emphasis:primary))for(const line of t.inkLines)background.push(shape('ellipse',line.x-1,line.y-1,line.width+2,line.height+2,{fill:null,stroke:accent,strokeWidthMm:.45}));
   x+=w+(p.gapMm??1.2);lineH=Math.max(lineH,t.inkHeight+Math.abs(dy));
  }
 }else{
  const content=p.treatment==='vertical'?segments(p.text).join('\n'):p.text;
  if(p.treatment==='curve'){
   const needed=extent(content,style.fontSizePt)*1.04+12;
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
   const first=mainTexts[0],available=width-12,initial=Math.min(9,fontSize*.34),needed=extent(p.caption,initial)*1.2+3;
   const small=needed>available?initial*(available-3)/(needed-3):initial;
   if(small<6||p.caption.includes('\n'))throw Error('穿字横带的小字过长；缩短 caption 或增大 widthMm');
   const w=Math.min(available,extent(p.caption,small)*1.2+3),y=first.y+first.inkHeight*.68;
   overlay.push(shape('rect',Math.max(2,first.x+first.w*.5-w*.5)-1,y-.35,w+2,small*pt*1.2+.7,{fill:ground,fillOpacity:.82}));
   const t=addText(p.caption,Math.max(3,first.x+first.w*.5-w*.5),y,w,{fontFamily:p.captionFontFamily||style.fontFamily,fontSizePt:small,color:colors[0]});
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
 const backdrop=p.backdrop||({label:{kind:'paper',paddingMm:3},'script-dots':{kind:'dots',densityMm:4},'paper-lettering':{kind:'paper',paddingMm:4,pattern:'stripes',opacity:.95}}[p.treatment]);
 if(backdrop&&backdrop.kind!=='none'){
  const pad=backdrop.paddingMm??3,density=backdrop.densityMm??4,ink=mainTexts.flatMap(t=>t.inkLines),base=backdrop.color||(p.treatment==='paper-lettering'?colors[0]:ground),patternColor=backdrop.patternColor||accent,opacity=backdrop.opacity??.86;
  const boxes=backdrop.kind==='dots'?[{x:2,y:2,w:width-4,h:Math.max(6,Math.max(...ink.map(l=>l.y+l.height))+density*1.5)}]:ink.map(l=>({x:Math.max(0,l.x-pad),y:Math.max(0,l.y-pad*.65),w:Math.min(width-Math.max(0,l.x-pad),l.width+pad*2),h:l.height+pad*1.4}));
  let dots=0;
  for(const [i,b] of boxes.entries()){
   if(backdrop.kind==='dots'){
    for(let yy=b.y+1;yy<b.y+b.h-1;yy+=density)for(let xx=b.x+1+(Math.floor(yy/density)%2)*density*.5;xx<b.x+b.w-1;xx+=density){
     if(ink.some(l=>xx>l.x-1&&xx<l.x+l.width+1&&yy>l.y-1&&yy<l.y+l.height+1))continue;
     if(++dots<=180)background.unshift(shape('ellipse',xx,yy,.75,.75,{fill:patternColor,fillOpacity:opacity*.55}));
    }
    height=Math.max(height,b.y+b.h+2);continue;
   }
   let geometry={kind:backdrop.kind==='oval'?'ellipse':'rect'};
   if(backdrop.kind==='paper'||backdrop.kind==='brush'){
    const {w,h}=b,soft=backdrop.kind==='brush';
    geometry={kind:'path',viewBox:[0,0,w,h],paths:[{d:soft?`M 0 ${h*.34} Q ${w*.18} ${-h*.08} ${w*.52} ${h*.08} L ${w} ${h*.24} L ${w*.94} ${h*.8} Q ${w*.5} ${h*1.04} 0 ${h*.77} Z`:`M 0 ${h*.13} L ${w*.23} 0 L ${w*.62} ${h*.04} L ${w} 0 L ${w*.98} ${h*.89} L ${w*.69} ${h} L ${w*.32} ${h*.96} L 0 ${h} Z`}]};
   }
   background.unshift({op:'graphic.add',id:p.id+'-backdrop'+i,geometry,place:at(b.x,b.y),size:{width:b.w,height:b.h,unit:'mm'},style:{fill:base,fillOpacity:opacity}});
   if(backdrop.pattern&&backdrop.pattern!=='plain'){
    const paths=[];
    for(let xx=density;xx<b.w-1;xx+=density){
     if(backdrop.pattern==='dots')background.push(shape('ellipse',b.x+xx,b.y+b.h*.79,.45,.45,{fill:patternColor,fillOpacity:.4}));
     else paths.push({d:backdrop.pattern==='stripes'?`M ${xx} ${b.h*.8} L ${Math.min(b.w-1,xx+1.5)} ${b.h*.2}`:`M ${xx} ${b.h*.15} L ${xx} ${b.h*.85}`});
    }
    if(backdrop.pattern==='grid')paths.push({d:`M 1 ${b.h*.5} L ${b.w-1} ${b.h*.5}`});
    if(paths.length)background.push({op:'graphic.add',id:p.id+'-backdrop-pattern'+i,geometry:{kind:'path',viewBox:[0,0,b.w,b.h],paths},place:at(b.x,b.y),size:{width:b.w,height:b.h,unit:'mm'},style:{fill:null,stroke:patternColor,strokeWidthMm:.12,opacity:.35}});
   }
   height=Math.max(height,b.y+b.h+2);
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
 const ordinaryTexts=texts.filter(t=>!overlay.includes(t.op)).map(t=>t.op);
 return {children:[...background,...ordinaryTexts,...overlay,...children],width,height,notes};
}
