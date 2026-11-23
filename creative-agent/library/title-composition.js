// A title is built from three independent, editable layers: lettering,
// native text paint, and pen/highlighter geometry. No material is consumed.
const mmPerPt=25.4/72;
const chars=text=>[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(part=>part.segment);
const place=(x,y)=>({reference:'parent',at:[x,y],unit:'mm',anchor:'top-left'});
const hex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const range=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
const rect=(x,y,w,h)=>({shape:'rect',space:'local',unit:'ratio',box:[x,y,w,h]});

export function validateTitleComposition(p){
 const g=p.glyph||{},allowedGlyph=['split','strokes','numberShadow'];
 if(p.glyph!==undefined&&(!p.glyph||typeof p.glyph!=='object'||Array.isArray(p.glyph)))throw Error('标题字形参数无效');
 if(Object.keys(g).some(key=>!allowedGlyph.includes(key)))throw Error('标题字形参数无效');
 if(g.split){
  const s=g.split;
  if(Object.keys(s).some(key=>!['middleText','middleFontFamily','middleColor','gapMm','waveMm'].includes(key))||typeof s.middleText!=='string'||!s.middleText.trim()||s.middleText.length>80||!range(s.gapMm??4.2,0.5,8)||!range(s.waveMm??1.2,0,3)||s.middleColor!==undefined&&!hex(s.middleColor))throw Error('拆字中部文字或间距无效');
 }
 if(g.strokes){
  if(!Array.isArray(g.strokes)||g.strokes.length>12)throw Error('字形笔画数量无效');
  for(const s of g.strokes)if(!s||Object.keys(s).some(key=>!['index','kind','box','color','tiltDeg'].includes(key))||!Number.isInteger(s.index)||s.index<0||s.index>=chars(p.text).length||!['hotdog','triangle'].includes(s.kind)||!Array.isArray(s.box)||s.box.length!==4||s.box.some(x=>!range(x,0,1))||s.box[2]<.06||s.box[3]<.2||s.box[0]+s.box[2]>1||s.box[1]+s.box[3]>1||s.color!==undefined&&!hex(s.color)||!range(s.tiltDeg??0,-35,35))throw Error('笔画替换须指定字位、竖撇区域和形状');
 }
 if(g.numberShadow){
  const s=g.numberShadow;
  if(Object.keys(s).some(key=>!['color','indices','diameterMm','offsetMm'].includes(key))||s.color!==undefined&&!hex(s.color)||s.indices!==undefined&&(!Array.isArray(s.indices)||s.indices.some(i=>!Number.isInteger(i)||i<0||i>=chars(p.text).length||!/\d/u.test(chars(p.text)[i])))||!range(s.diameterMm??2.8,1,8)||!range(s.offsetMm??.8,-3,4))throw Error('数字半圆阴影参数无效');
 }
 if(g.split&&(g.strokes?.length||g.numberShadow))throw Error('拆字与单笔画替换或数字阴影需分别生成再组合');
 if(p.letterStyles!==undefined){
  if(!Array.isArray(p.letterStyles)||p.letterStyles.length>32)throw Error('逐字字效须为数组');
  const seen=new Set();for(const item of p.letterStyles){
   if(!item||Object.keys(item).some(key=>!['index','style'].includes(key))||!Number.isInteger(item.index)||item.index<0||item.index>=chars(p.text).length||seen.has(item.index)||!item.style||typeof item.style!=='object'||Array.isArray(item.style))throw Error('逐字字效的字位或样式无效');
   seen.add(item.index);
  }
 }
 if(p.backgrounds!==undefined&&!Array.isArray(p.backgrounds))throw Error('标题背景须为数组');
 for(const b of p.backgrounds||[]){
  if(!b||Object.keys(b).some(key=>!['kind','color','colors','count','diameterMm','gapMm','opacity','strokeWidthMm','paddingMm'].includes(key))||!['dots','squares','lines','hashes','mixed','reverse','enclosure'].includes(b.kind)||b.color!==undefined&&!hex(b.color)||b.colors!==undefined&&(!Array.isArray(b.colors)||b.colors.length<1||b.colors.length>4||b.colors.some(color=>!hex(color)))||b.count!==undefined&&(!Number.isInteger(b.count)||!range(b.count,2,12))||!range(b.diameterMm??2.6,1,7)||!range(b.gapMm??2.2,.7,10)||!range(b.opacity??.9,.1,1)||!range(b.strokeWidthMm??.55,.15,1.5)||!range(b.paddingMm??2,0,8))throw Error('标题背景参数无效');
 }
 if(p.accents!==undefined&&!Array.isArray(p.accents))throw Error('标题点缀须为数组');
 for(const a of p.accents||[]){
  if(!a||Object.keys(a).some(key=>!['kind','placement','color','sizeMm','count'].includes(key))||!['dots','spark','notes'].includes(a.kind)||!['around','upper-right','corners'].includes(a.placement)||a.color!==undefined&&!hex(a.color)||!range(a.sizeMm??2,1,6)||!Number.isInteger(a.count??4)||!range(a.count??4,1,12))throw Error('标题点缀参数无效');
 }
 if((p.backgrounds||[]).length>6||(p.accents||[]).length>4)throw Error('标题装饰层数过多');
 if(chars(p.text).length>32||p.text.includes('\n')||p.runs)throw Error('组合标题支持 1–32 个字的单行文字；多行请分组调用');
}

export function compileComposedTitle(p){
 validateTitleComposition(p);
 const colors=p.colors||['#25443D','#E6B45E','#FFFDF6'],size=p.style?.fontSizePt??p.fontSizePt??28,fontMm=size*mmPerPt,glyphs=chars(p.text),font=p.fontFamily||'BaiLuBangBang';
 const split=p.glyph?.split;
 const widths=glyphs.map(ch=>fontMm*(/^[\x00-\x7f]$/u.test(ch)?(/[ilI1.,]/u.test(ch)?.4:.66):1.05)*(split?.92:1));
 const advance=widths.reduce((a,b)=>a+b,0),width=p.widthMm??Math.max(35,advance+12),left=5,top=6;
 if(width<advance+left+2)throw Error('组合标题宽度不足；增大 widthMm 或减小字号');
 const gap=split?.gapMm??4.2,wave=split?.waveMm??1.2,bodyHeight=fontMm*(split?1.55:1.42)+(split?gap+wave*2:0);
 let height=Math.max(p.heightMm||0,top+bodyHeight+7),seq=0;
 const background=[],lettering=[],masks=[],overlays=[],placedMarks=[];
 const id=s=>p.id+'-'+s+'-'+(++seq);
 const graphic=(target,kind,x,y,w,h,style,geometry)=>target.push({op:'graphic.add',id:id(kind),geometry:geometry||{kind},place:place(x,y),size:{width:w,height:h,unit:'mm'},style});
 const text=(ch,x,y,w,style)=>{const node={op:'text.add',id:id('letter'),content:ch,place:place(x,y),size:{width:w,unit:'mm'},style};lettering.push(node);return node;};
 const style={fontFamily:font,fontSizePt:size,color:colors[0],...p.style};
 const accent=colors[1]||colors[0],paper=colors[2]||'#FFFDF6';

 // The dots and squares are separated by at least gapMm, including when the
 // title grows. They stay much smaller than the glyph height.
 for(const [backgroundIndex,b] of (p.backgrounds||[]).entries()){
  const color=b.color||accent,opacity=b.opacity??.9,pad=b.paddingMm??2;
  if(b.kind==='lines'||b.kind==='hashes'){
   const x=Math.max(.2,left-pad),y=Math.max(.2,top-.6),w=Math.min(width-x-.2,advance+pad*2),h=fontMm*1.48;
   const count=b.count??(b.kind==='lines'?5:3),stroke=b.strokeWidthMm??(b.kind==='lines'?.48:.38);
   const ink=i=>b.colors?.[i%b.colors.length]||color;
   for(let i=0;i<count;i++){
    const yy=h*(i+1)/(count+1)+Math.sin(i*2.13+backgroundIndex)*Math.min(.45,h/(count+1)*.2);
    const side=w*(.025+.045*(.5+.5*Math.sin(i*1.7+backgroundIndex))),end=w*(.94-.045*(.5+.5*Math.cos(i*2.1)));
    const path=`M ${side} ${yy} Q ${w*.48} ${yy+Math.sin(i*2.5)*.45} ${end} ${yy+Math.cos(i*1.9)*.25}`;
    graphic(background,'path',x,y,w,h,{fill:null,stroke:ink(i),strokeWidthMm:stroke,opacity:opacity*.72},{kind:'path',viewBox:[0,0,w,h],paths:[{d:path}]});
   }
   if(b.kind==='hashes')for(let i=0;i<count;i++){
    const xx=w*(i+1)/(count+1)+Math.sin(i*1.9+backgroundIndex)*Math.min(.8,w/(count+1)*.12);
    const path=`M ${xx} ${h*.04} Q ${xx+Math.sin(i*2.4)*.5} ${h*.53} ${xx+Math.cos(i*1.7)*.35} ${h*.96}`;
    graphic(background,'path',x,y,w,h,{fill:null,stroke:ink(i+count),strokeWidthMm:stroke,opacity:opacity*.72},{kind:'path',viewBox:[0,0,w,h],paths:[{d:path}]});
   }
  }else if(['dots','squares','mixed'].includes(b.kind)){
   const d=Math.min(b.diameterMm??Math.max(1.8,fontMm*.27),fontMm*.42),gapMm=b.gapMm??Math.max(1.2,d*.75),step=d*1.55+gapMm;
   const count=Math.max(1,Math.floor((advance+pad*2+gapMm)/step));
   const span=count*step-gapMm,begin=Math.max(.2,left+(advance-span)/2);
   for(let i=0;i<count;i++){
    const motif=b.kind==='mixed'?['ellipse','rect','ellipse','rect','ellipse','rect','ellipse','rect'][i%8]:{dots:'ellipse',squares:'rect'}[b.kind];
    const varied=d*(.61+.36*Math.abs(Math.sin(i*2.17+backgroundIndex*.83))),jitter=Math.min(gapMm*.3,.9)*Math.sin(i*2.83+backgroundIndex*1.37);
    const w=varied,h=varied;
    const x=Math.max(.2,Math.min(width-w-.2,begin+i*step+jitter));
    const band=-.18+1.5*(.5+.5*Math.sin(i*2.31+backgroundIndex*1.71));
    const y=Math.max(.3,top+fontMm*band-h/2);
    const radius=Math.hypot(w,h)/2;
    if(placedMarks.some(mark=>Math.hypot(x+w/2-mark.x,y+h/2-mark.y)<radius+mark.radius+.65))continue;
    placedMarks.push({x:x+w/2,y:y+h/2,radius});
    const markColor=b.colors?.[i%b.colors.length]||color,alpha=opacity*(.74+.23*Math.abs(Math.sin(i*1.73+backgroundIndex)));
    graphic(background,motif,x,y,w,h,{fill:markColor,fillOpacity:alpha});
    if(motif==='rect')background.at(-1).place.rotationDeg=((i*7+backgroundIndex*3)%5-2)*1.7;
   }
  }else if(b.kind==='reverse'){
   graphic(background,'rect',Math.max(.2,left-pad),Math.max(.2,top-pad),Math.min(width-left+pad,advance+pad*2),bodyHeight+pad*2,{fill:color,fillOpacity:opacity});
  }else{
   const x=Math.max(.2,left-pad),y=Math.max(.2,top-pad),w=Math.min(width-x,advance+pad*2),h=bodyHeight+pad*2;
   const path=`M 0 ${h*.23} Q ${w*.12} ${-h*.04} ${w*.24} ${h*.13} Q ${w*.32} ${h*.25} ${w*.4} ${h*.12} Q ${w*.5} ${-h*.05} ${w*.62} ${h*.12} Q ${w*.72} ${h*.23} ${w*.82} ${h*.11} Q ${w*.94} ${-h*.01} ${w} ${h*.23} M 0 ${h*.78} Q ${w*.13} ${h*1.04} ${w*.25} ${h*.86} Q ${w*.34} ${h*.73} ${w*.42} ${h*.87} Q ${w*.53} ${h*1.05} ${w*.64} ${h*.87} Q ${w*.74} ${h*.73} ${w*.84} ${h*.88} Q ${w*.95} ${h*1.03} ${w} ${h*.78}`;
   graphic(background,'path',x,y,w,h,{fill:null,stroke:color,strokeWidthMm:b.strokeWidthMm??.55,opacity},{kind:'path',viewBox:[0,0,w,h],paths:[{d:path}]});
  }
 }

 let cursor=left;
 for(const [index,ch] of glyphs.entries()){
  const cw=widths[index],glyphX=cursor,change=p.glyph?.strokes?.filter(s=>s.index===index)||[];
  const letterStyle={...style,...(p.letterStyles||[]).find(item=>item.index===index)?.style};
  if(split){
   // A larger glyph on the original character advance makes the Chinese
   // lettering visibly taller than the small middle line, as in hand lettering.
   const delta=Math.sin(index*1.8)*wave,splitStyle={...letterStyle,fontSizePt:(letterStyle.fontSizePt||size)*(1.17+(index%3-1)*.055)};
   const upper=text(ch,glyphX,top+delta,cw*1.22,splitStyle);
   const lower=text(ch,glyphX,top+fontMm*.12+gap+delta,cw*1.22,splitStyle);
   masks.push({op:'layer.mask',target:upper.id,mode:'replace',region:rect(0,0,1,.49)});
   masks.push({op:'layer.mask',target:lower.id,mode:'replace',region:rect(0,.51,1,.49)});
  }else{
   const node=text(ch,glyphX,top,cw*1.28,letterStyle);
   for(const stroke of change){
    const [rx,ry,rw,rh]=stroke.box;
    masks.push({op:'layer.mask',target:node.id,mode:'subtract',region:rect(rx,ry,rw,rh)});
    const x=glyphX+cw*rx,y=top+fontMm*1.3*ry,w=cw*rw,h=fontMm*1.3*rh;
    if(stroke.kind==='hotdog'){
     const path=`M ${w*.48} 0 C ${w*.88} 0 ${w*.95} ${h*.14} ${w*.77} ${h*.32} L ${w*.62} ${h*.85} C ${w*.56} ${h*1.05} ${w*.04} ${h*1.03} ${w*.12} ${h*.76} L ${w*.23} ${h*.17} C ${w*.26} ${h*.06} ${w*.34} 0 ${w*.48} 0 Z`;
     graphic(overlays,'path',x,y,w,h,{fill:stroke.color||letterStyle.color},{kind:'path',viewBox:[0,0,w,h],paths:[{d:path}]});
    }else{
     const path=`M 0 0 L ${w} 0 L ${w*.53} ${h} Z`;
     graphic(overlays,'path',x,y,w,h,{fill:stroke.color||letterStyle.color},{kind:'path',viewBox:[0,0,w,h],paths:[{d:path}]});
    }
    overlays.at(-1).place.rotationDeg=stroke.tiltDeg??0;
   }
   if(p.glyph?.numberShadow&&/\d/u.test(ch)&&(!p.glyph.numberShadow.indices||p.glyph.numberShadow.indices.includes(index))){
    const s=p.glyph.numberShadow,d=s.diameterMm??2.8,x=glyphX+cw*.64+(s.offsetMm??.8),y=top+fontMm*.77;
    const path=`M 0 ${d*.48} A ${d*.5} ${d*.5} 0 0 1 ${d} ${d*.48} L ${d} ${d*.67} A ${d*.5} ${d*.5} 0 0 0 0 ${d*.67} Z`;
    graphic(background,'path',x,y,d,d,{fill:s.color||accent,fillOpacity:.72},{kind:'path',viewBox:[0,0,d,d],paths:[{d:path}]});
   }
  }
  cursor+=cw;
 }
 if(split){
  const letters=chars(split.middleText),middleSize=Math.min(13.5,size*.4),fontFamily=split.middleFontFamily||'WoAiWanWeiWei';
  const inkWidth=ch=>middleSize*mmPerPt*(/^[\x00-\x7f]$/u.test(ch)?(/[ilI1.,]/u.test(ch)?.36:.57):1);
  const lastWidth=inkWidth(letters.at(-1)),step=letters.length>1?Math.max(0,(advance-lastWidth)/(letters.length-1)):0;
  // Keep each middle character editable. Explicit positions survive renderers
  // that do not implement Canvas letterSpacing and pin both outside edges.
  letters.forEach((ch,index)=>{
   if(ch===' ')return;
   const x=left+index*step;
   overlays.push({op:'text.add',id:id('middle'),content:ch,place:place(x,top+fontMm*.66+gap*.55+wave*.3),size:{width:Math.max(inkWidth(ch)*1.5,2),unit:'mm'},style:{fontFamily,fontSizePt:middleSize,color:split.middleColor||colors[0],textAlign:'left'}});
  });
  height=Math.max(height,top+fontMm*1.65+gap+wave*2+5);
 }

 const addAccent=(a,index)=>{
  const color=a.color||accent,s=a.sizeMm??2,count=a.count??4;
  const positions=[];
  if(a.placement==='upper-right')for(let j=0;j<count;j++)positions.push([Math.min(width-s-.5,left+advance-1+(j%3)*s*.9),Math.max(.2,top-3-Math.floor(j/3)*s*.8)]);
  else if(a.placement==='corners')positions.push([left-2,top-3],[left+advance,top-3],[left-2,top+bodyHeight],[left+advance,top+bodyHeight]);
  else for(let j=0;j<count;j++)positions.push([Math.max(.2,left-2+(j/(Math.max(1,count-1)))*(advance+4)),j%2?top+bodyHeight+.8:Math.max(.2,top-3)]);
  for(const [j,[x,y]] of positions.slice(0,count).entries()){
   const d=s*(j%3===0?.72:1),px=Math.max(.2,Math.min(width-d-.2,x));
   if(a.kind==='dots')graphic(overlays,'ellipse',px,y,d,d,{fill:color,fillOpacity:.7});
   else if(a.kind==='spark')graphic(overlays,'path',px,y,d,d,{fill:color},{kind:'path',viewBox:[0,0,d,d],paths:[{d:`M ${d*.5} 0 Q ${d*.56} ${d*.42} ${d} ${d*.5} Q ${d*.56} ${d*.57} ${d*.5} ${d} Q ${d*.43} ${d*.57} 0 ${d*.5} Q ${d*.43} ${d*.43} ${d*.5} 0 Z`}]});
   else graphic(overlays,'path',px,y,d,d,{fill:null,stroke:color,strokeWidthMm:.45},{kind:'path',viewBox:[0,0,d,d],paths:[{d:`M ${d*.36} ${d*.78} L ${d*.36} ${d*.15} L ${d*.82} ${d*.07} L ${d*.82} ${d*.59} M ${d*.36} ${d*.78} A ${d*.17} ${d*.12} 0 1 1 ${d*.02} ${d*.78} A ${d*.17} ${d*.12} 0 1 1 ${d*.36} ${d*.78} M ${d*.82} ${d*.59} A ${d*.16} ${d*.12} 0 1 1 ${d*.5} ${d*.59} A ${d*.16} ${d*.12} 0 1 1 ${d*.82} ${d*.59}`}]});
  }
  height=Math.max(height,...positions.map(([,y])=>y+s+2));
 };
 (p.accents||[]).forEach(addAccent);
 // Masks follow the text nodes they target. The transaction remains a single
 // editable group; no bitmap or material.add is introduced.
 const lettersWithMasks=lettering.flatMap(node=>[node,...masks.filter(mask=>mask.target===node.id)]);
 const children=[...background,...lettersWithMasks,...overlays];
 if(children.length>100)throw Error('标题图层超过 100 个；减少背景数量或缩短标题');
 return {children,width,height,notes:['字形、文字效果和背景均为可编辑文字/笔画；笔画替换区域由 box 精确指定。']};
}
