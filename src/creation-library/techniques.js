import catalog from './methods.json' with {type:'json'};
import {libraryID} from './compiler.js';
import {advancedShapeControls,resolvedShapeOptions} from '../advanced-shape-options.js';
import {compileAccents} from './accents.js';
import {compileFilm} from './film.js';
import {compileTitle,titleFields,titleHelp} from './title.js';
import {techniqueExample,exampleMaterials} from './examples.js';
import {measureSceneText} from '../scene-text-layout.js';
import {styleFor} from '../scene-node-properties.js';
import {tapeDimensions} from '../tape-strip.js';
import {journalBundledFonts} from '../journal-font-catalog.js';
export const techniqueCatalog=catalog;
const common=['id','reference','at','rotationDeg'];
const graphic=['widthMm','heightMm','colors','seed'];
const fields={
 accent:['widthMm','heightMm','colors','motif','arrangement','motifSizeMm','count','positions','protectedBoxes','clearanceMm','strokeWidthMm','opacity','aliases'],
 film:['aliases','gapMm','bendMm','frameInset','holesPerFrame','colors'],
 title:titleFields,materials:['aliases','caption','fontFamily','fontSizePt','gapMm','colors'],
 graphic:[...graphic,'waypoints','strokeWidthMm','options','fill','opacity'],pattern:['widthMm','heightMm','colors','options','strokeWidthMm'],
 tape:['aliases','widthMm','heightMm','lengthMm','segments'],record:[...graphic,'items','fontFamily','fontSizePt','gapMm'],
 write:['target','box','text','fontFamily','fontSizePt','colors'],relate:['target','referenceTarget','edge','amountMm'],tear:['target','path','keep','depthMm','periodMm','seed'],window:['target','box','corePlace'],split:['target','parts','gapRatio'],weave:['strip','through']
};
const required={accent:[],film:['aliases'],title:['text'],materials:['aliases'],graphic:[],pattern:[],tape:['aliases'],record:['items'],write:['target','box','text'],relate:['target','referenceTarget'],tear:['target','path'],window:['target','box'],split:['target'],weave:['strip','through']};
const fieldHelp={...titleHelp,motif:'rings/spark/sprig/stitch/confetti/materials；同页优先保持一种语言',arrangement:'corner/edge/arc；positions 可覆盖布局',motifSizeMm:'数字点缀单元基准尺寸 1–30 mm，不影响实体尺寸',positions:'本组内比例中心 [[x,y],...]，实体时与 aliases 一一对应；数字时数量由位置数决定',protectedBoxes:'本组内须避开的比例区域 [[x,y,width,height],...]；不自动识别内容',clearanceMm:'保护区和点缀彼此之间的最小间距 0–20 mm',bendMm:'照片组的弧形排布高度，-80–80 mm；只旋转和平移，不变形照片',frameInset:'边带占边框高度的比例 0.02–0.25；照片保持真实尺寸，边框据此向外扩展',holesPerFrame:'每格上下边各 2–32 个透明齿孔',options:'结构参数：花瓣数、星角、波浪起伏等；保留为可编辑 geometry.options，具体键见方法示例及 geometry 帮助',fill:'数字图形填充 HEX 或 null（空心）',opacity:'数字图形透明度 0–1',id:'本次结果唯一编号',reference:'page/page.left/page.right/node:<已有组ID>，默认 page',at:'中心位置 [x,y]，毫米，默认 [70,70]',rotationDeg:'整体旋转角度',widthMm:'数字图形或文字区域宽度，毫米；不会缩放实体',heightMm:'数字区域高度，毫米',colors:'1–4 个六位 HEX 颜色',seed:'固定纹样或撕口种子',text:'完整文字，长标题自动换行',fontFamily:'服务器已安装字体名',fontSizePt:'字号 pt',pattern:'plain/dots/stripes/grid',count:'纹样数量 1–30',aliases:'本任务中 1–8 个不重复的素材别名',caption:'可选图下注释，不自动编造',gapMm:'材料或条目间距毫米',waypoints:'路线 2–6 个 [x,y] 比例点',strokeWidthMm:'线宽毫米',lengthMm:'每段真实胶带默认取用长度，毫米',segments:'每段的局部摆放 [{at:[x,y],rotationDeg?,lengthMm?},...]；单段方法 1 项，双角方法 2 项；省略角度时沿用方法默认值，坐标位于 widthMm × heightMm 范围内',items:'1–12 条用户提供或任务允许的文字',target:'已放置实体素材节点 ID',referenceTarget:'已有参照节点 ID',edge:'top/right/bottom/left',amountMm:'露出宽度毫米',path:'局部轨迹 {points:[[x,y],...],unit:"ratio"|"mm",closed?:boolean}',keep:'left/right/inside/outside',depthMm:'撕口深度毫米',periodMm:'撕口周期毫米',box:'开窗局部比例 [x,y,width,height]',parts:'分成 2–8 段',gapRatio:'段间保留余料占原长的比例'};
function methodFields(method){
 const base=['write','relate','tear','window','split','weave'].includes(method.recipe)?['id']:common;
 let specific=fields[method.recipe];
 if(method.recipe==='graphic'){
  specific=specific.filter(k=>method.defaults.shape?!['seed','waypoints'].includes(k):k!=='options'&&(k!=='waypoints'||method.defaults.motif==='trail'));
  if(method.defaults.shape==='bubble')specific=[...specific,'text','fontFamily','fontSizePt'];
 }
 if(method.recipe==='pattern'&&['echo','bands'].includes(method.defaults.pattern))specific=specific.filter(k=>!['options','strokeWidthMm'].includes(k));
 return [...base,...specific];
}
export function describeTechnique(id,{includeFontSuggestions=true}={}){
 const method=catalog.methods.find(m=>m.id===id);if(!method)throw Error('未知教程方法');
 const names=methodFields(method),help={...fieldHelp,...titleHelp,...(method.recipe==='accent'?{count:'数字点缀候选数量 1–24；指定 positions 时以其长度为准；避让可能减少实际数量',widthMm:'点缀组局部范围宽度，毫米；不会缩放实体',heightMm:'点缀组局部范围高度，毫米；不会缩放实体'}:{}),...(method.recipe==='tape'?{widthMm:'胶带摆放范围宽度，毫米；不会缩放实体',heightMm:'胶带摆放范围高度，毫米；不会缩放实体'}:{}),corePlace:'可选窗芯位置，使用 layer.update.place 的完整结构。传入时显示并定位窗芯；不传则隐藏保留。位置按裁下窗芯的外接框定位，保留原图裁切来源',strip:'已经放置并对准孔位的真实纸条节点 ID；不缩放或自动拉长',through:'按穿行顺序给 2–16 项 {target,sideAfter:"front"|"back",region? ,window?}；region 用 material.window 的 Region 开新孔，window 引用已有孔 ID，二选一。新孔窗芯隐藏保留；输出报告列出替代后的框与窗芯 ID',...(method.recipe==='write'?{box:'素材局部可写区域 [x,y,width,height]，各值为比例；需先观察图片，避开重要图案',text:'完整正文，最多 500 字；不截断，实际高度需看预览'}:{}),...(method.defaults.shape==='bubble'?{text:'气泡中的短批注；超出框内可写区域时报错'}:{})};
 if(method.id==='magazine-offset')help.caption='主图下方的可选短图注，仅对应 aliases 首项；不自动编造';
 const example=techniqueExample(method);
 return {...method,parameters:Object.fromEntries(names.map(k=>[k,{description:help[k],...(includeFontSuggestions&&(k==='fontFamily'||k==='captionFontFamily')?{suggestedFonts:journalBundledFonts.map(f=>({family:f.family,label:f.label}))}:{}),required:k==='id'||required[method.recipe].includes(k)||(k==='corePlace'&&method.defaults.reuseCore===true)||(method.id==='graphic-route'&&k==='waypoints')||(method.id==='title-cross-shadow'&&k==='caption')||(['title-scattered-round','title-scattered-triangle','title-number-route'].includes(method.id)&&k==='runs')||(method.defaults.shape==='bubble'&&k==='text')}])),geometryOptions:advancedShapeControls(method.defaults.shape||method.defaults.pattern),example:{materials:exampleMaterials.filter(a=>(example.parameters.aliases||[]).includes(a.alias)||example.before.some(op=>op.asset===a.alias)),prepare:example.before,note:'示例别名和已有节点来自本例准备步骤；实际调用替换成本次素材和节点。'},tool:{name:'creation_recipe',arguments:{kind:'technique',recipeId:id,transactionId:'unique-id',baseSceneRevision:'当前版本',parameters:example.parameters}}};
}
function validate(method,params){
 libraryID(params.id);const allowed=new Set(methodFields(method));
 for(const key of Object.keys(params))if(!allowed.has(key))throw Error('该方法不支持参数：'+key);
 for(const key of required[method.recipe])if(params[key]===undefined)throw Error('缺少参数：'+key);
 if(method.id==='graphic-route'&&params.waypoints===undefined)throw Error('转折阅读线需要两个以上真实焦点的 waypoints');
 if(method.defaults.shape==='bubble'&&params.text===undefined)throw Error('气泡批注框需要短文字 text');
 if(method.id==='title-cross-shadow'&&!params.caption?.trim())throw Error('穿字横带需要 caption 小字');
 if(['title-scattered-round','title-scattered-triangle','title-number-route'].includes(method.id)&&!params.runs)throw Error('错落字位需要 runs 词组');
 if(method.defaults.reuseCore&&!params.corePlace)throw Error('复用窗芯需要给出 corePlace');
 for(const key of ['widthMm','heightMm','fontSizePt','strokeWidthMm','lengthMm','periodMm'])if(params[key]!==undefined&&(!Number.isFinite(params[key])||params[key]<=0||params[key]>1000))throw Error('尺寸参数无效：'+key);
 for(const key of ['gapMm','amountMm','depthMm'])if(params[key]!==undefined&&(!Number.isFinite(params[key])||params[key]<0||params[key]>200))throw Error('间距参数无效：'+key);
 if(params.opacity!==undefined&&(!Number.isFinite(params.opacity)||params.opacity<0||params.opacity>1))throw Error('透明度须为 0–1');
 if(params.fill!==undefined&&params.fill!==null&&!/^#[\da-f]{6}$/i.test(params.fill))throw Error('填充须为 HEX 或 null');
 if(params.colors&&(!Array.isArray(params.colors)||!params.colors.length||params.colors.length>4||params.colors.some(c=>!/^#[\da-f]{6}$/i.test(c))))throw Error('颜色必须为六位 HEX');
 if(params.at&&(!Array.isArray(params.at)||params.at.length!==2||!params.at.every(Number.isFinite)))throw Error('位置无效');
 if(params.rotationDeg!==undefined&&(!Number.isFinite(params.rotationDeg)||Math.abs(params.rotationDeg)>360))throw Error('旋转角度无效');
 if(params.count!==undefined&&(!Number.isInteger(params.count)||params.count<1||params.count>30))throw Error('纹样数量为 1–30');
 if(params.seed!==undefined&&(!Number.isInteger(params.seed)||params.seed<1||params.seed>2147483646))throw Error('种子无效');
 if(params.text!==undefined&&(typeof params.text!=='string'||!params.text.trim()||params.text.length>500))throw Error('文字应为 1–500 字');
 if(params.fontFamily!==undefined&&(typeof params.fontFamily!=='string'||!params.fontFamily.trim()))throw Error('字体名无效');
 if(params.captionFontFamily!==undefined&&(typeof params.captionFontFamily!=='string'||!params.captionFontFamily.trim()))throw Error('小注字体名无效');
 if(params.caption!==undefined&&(typeof params.caption!=='string'||params.caption.length>1000))throw Error('注释过长');
 if(params.pattern!==undefined&&!['plain','dots','stripes','grid'].includes(params.pattern))throw Error('未知背景花纹');
 if(params.items&&(!Array.isArray(params.items)||!params.items.length||params.items.length>12||params.items.some(t=>typeof t!=='string'||!t.trim()||t.length>180)))throw Error('条目格式无效');
 if(params.aliases&&(!Array.isArray(params.aliases)||!params.aliases.length||params.aliases.length>8||new Set(params.aliases).size!==params.aliases.length))throw Error('素材列表无效或重复');
 if(params.waypoints!==undefined&&(!Array.isArray(params.waypoints)||params.waypoints.length<2||params.waypoints.length>6||params.waypoints.some(point=>!Array.isArray(point)||point.length!==2||point.some(n=>!Number.isFinite(n)||n<0||n>1))))throw Error('阅读线路点须为 2–6 个区域内比例坐标');
 if(params.parts!==undefined&&(!Number.isInteger(params.parts)||params.parts<2||params.parts>8))throw Error('分裁数量为 2–8');
 if(params.gapRatio!==undefined&&(!Number.isFinite(params.gapRatio)||params.gapRatio<0||params.gapRatio>.05))throw Error('余料间隔比例为 0–0.05');
}
const mmPlace=(x,y)=>({reference:'parent',at:[x,y],unit:'mm'});
const measureTextHeight=(content,width,fontSizePt,fontFamily)=>measureSceneText({type:'text',content,width,...styleFor('text',{fontSizePt,fontFamily},{canvas:{height:100},physicalPageHeightMM:100})}).height;
export function compileTechnique({methodId,parameters,materials=[]}){
 const method=catalog.methods.find(m=>m.id===methodId);if(!method)throw Error('未知教程方法');validate(method,parameters);
 const p={...method.defaults,...parameters,...(method.defaults.options?{options:{...method.defaults.options,...parameters.options}}:{})},id=p.id,colors=p.colors||['#3D6871','#E6B45E','#F1E8D5'],font=p.fontFamily||'Xiaolai',fontSize=p.fontSizePt||18;
 if(method.recipe==='weave'){
  libraryID(p.strip);
  if(!Array.isArray(p.through)||p.through.length<2||p.through.length>16)throw Error('穿插需要 2–16 个孔位');
  const operations=[],frames=new Map(),retainedNodes=[],windows=[];
  for(const [i,entry] of p.through.entries()){
   if(!entry||Object.keys(entry).some(k=>!['target','region','window','sideAfter'].includes(k))||!['front','back'].includes(entry.sideAfter)||Boolean(entry.region)===Boolean(entry.window))throw Error('每个孔位须指定目标、穿出面以及新 region 或已有 window');
   libraryID(entry.target);if(entry.target===p.strip)throw Error('纸条不能穿过自身');
   let window=entry.window;
   if(entry.region){
    const target=frames.get(entry.target)||entry.target,resultId=id+'-frame'+i,core=id+'-core'+i;window=id+'-window'+i;
    operations.push({op:'material.window',target,resultId,windowId:window,cutoutId:core,region:structuredClone(entry.region),keepRemainder:true},{op:'layer.update',target:core,hidden:true});
    frames.set(entry.target,resultId);retainedNodes.push(core);
   }else libraryID(window);
   windows.push({target:entry.target,window,sideAfter:entry.sideAfter});
  }
  const through=windows.map(w=>({...w,target:frames.get(w.target)||w.target}));
  operations.push({op:'material.weave',strip:p.strip,through});
  return {operations,report:{methodId,output:p.strip,frames:Object.fromEntries(frames),retainedNodes,through,notes:['先对齐真实纸条与窗口；孔径、方向、层级或长度不满足时整批拒绝。新框替代原节点，所有窗芯仍在来源账本中；再次操作使用报告中的节点 ID。']}};
 }
 if(method.recipe==='write'){
  libraryID(p.target);
  if(!Array.isArray(p.box)||p.box.length!==4||!p.box.every(Number.isFinite)||p.box[0]<0||p.box[1]<0||p.box[2]<=0||p.box[3]<=0||p.box[0]+p.box[2]>1||p.box[1]+p.box[3]>1)throw Error('可写区域须为素材内的比例框');
  const reference='node:'+p.target;
  return {operations:[{op:'text.add',id,content:p.text,place:{reference,at:p.box.slice(0,2),unit:'ratio',anchor:'top-left',rotationSpace:'reference',rotationDeg:0,behavior:'linked'},size:{reference,width:p.box[2],unit:'ratio',behavior:'linked'},style:{fontFamily:font,fontSizePt:p.fontSizePt||11,lineHeight:1.5,color:colors[0]}}],report:{methodId,output:id,writingRegion:p.box,notes:['按素材当前局部坐标书写，移动与旋转跟随素材。区域高度是检查边界，不会裁掉正文或缩小字号；长文需分段或改排。']}};
 }
 let accentReport;let width=p.widthMm||70,height=p.heightMm||38,placementAt=p.at||[70,70];const children=[],notes=[];let seq=0;
 const shape=(kind,x,y,w,h,style={})=>children.push({op:'graphic.add',id:id+'-g'+(++seq),geometry:typeof kind==='string'?{kind}:kind,place:mmPlace(x,y),size:{width:w,height:h,unit:'mm'},style:{fill:colors[0],...style}});
 const text=(content,x,y,w,style={})=>children.push({op:'text.add',id:id+'-t'+(++seq),content,place:{...mmPlace(x,y),anchor:'top-left'},size:{width:w,unit:'mm'},style:{fontFamily:font,fontSizePt:fontSize,color:colors[0],...style}});
 if(method.recipe==='title'){
  const title=compileTitle(p,{widthExplicit:parameters.widthMm!==undefined});
  width=title.width;height=title.height;children.push(...title.children);notes.push(...title.notes);
 }else if(method.recipe==='accent'){
  const accents=compileAccents(p,materials);width=accents.width;height=accents.height;children.push(...accents.children);notes.push(...accents.notes);accentReport={skipped:accents.skipped};
 }else if(method.recipe==='film'){
  const film=compileFilm(p,materials);width=film.width;height=film.height;children.push(...film.children);notes.push(...film.notes);
 }else if(method.recipe==='materials'){
  const rows=p.aliases.map(alias=>{const a=materials.find(a=>(a.alias||a.id)===alias);if(!a)throw Error('素材不在授权范围：'+alias);const w=Number(a.physicalWidthMM??a.widthMM),h=Number(a.physicalHeightMM??a.heightMM);if(!(w>0&&h>0))throw Error('素材尺寸缺失');return {alias,w,h};});
  const gap=p.gapMm??4;let right=0,bottom=0,positions=[];
  for(let i=0;i<rows.length;i++){
   const a=rows[i],previous=positions[i-1],maxW=Math.max(...rows.map(a=>a.w)),maxH=Math.max(...rows.map(a=>a.h));let x=0,y=0;
   if(p.arrangement==='row'){x=previous?previous.x+rows[i-1].w+gap:0;}
   if(p.arrangement==='grid'){x=(i%2)*(maxW+gap);y=Math.floor(i/2)*(maxH+gap);}
   if(p.arrangement==='stagger'){x=previous?previous.x+rows[i-1].w+gap:0;y=i%2?maxH*.2:0;}
   if(p.arrangement==='magazine'){x=i?rows[0].w+gap:0;y=i===0?0:i===1?rows[0].h*.12:previous.y+rows[i-1].h+gap;}
   if(p.arrangement==='stack'){x=i*gap;y=i*gap;}
   if(p.arrangement==='diagonal'&&previous){x=previous.x+rows[i-1].w*.58+gap*.45;y=previous.y+rows[i-1].h*.52+gap*.45;}
   if(p.arrangement==='diagonal-open'){x=i*(maxW*.65+gap);y=i*(maxH*.55+gap);}
   if(p.arrangement==='triangle'){x=(i%3===1?maxW+gap:i%3===2?(maxW+gap)/2:0);y=Math.floor(i/3)*(maxH*2+gap)+(i%3===2?maxH+gap:0);}
   if(p.arrangement==='s-route'){x=(Math.sin(i*1.5)+1)*maxW*.4;y=i*(maxH*.75+gap);}
   positions.push({x,y});right=Math.max(right,x+a.w);bottom=Math.max(bottom,y+a.h);
   children.push({op:'material.add',id:id+'-m'+i,asset:a.alias,place:mmPlace(x+a.w/2,y+a.h/2)});
  }
  width=right;height=bottom;
  if(p.caption){
   const captionFont=p.fontSizePt||11,captionWidth=p.arrangement==='magazine'?rows[0].w:width;
   const captionY=p.arrangement==='magazine'?rows[0].h+gap:height+gap;
   const captionHeight=measureTextHeight(p.caption,captionWidth,captionFont,font);
   text(p.caption,0,captionY,captionWidth,{fontSizePt:captionFont});height=Math.max(height,captionY+captionHeight);
  }
 }else if(method.recipe==='graphic'){
  if(p.shape)resolvedShapeOptions(p.shape,p.options);
  shape(p.shape?{kind:p.shape,...(p.options?{options:p.options}:{})}:{kind:'sketch',motif:p.motif,seed:p.seed||17,...(p.waypoints?{waypoints:p.waypoints}:{})},width/2,height/2,width,height,{fill:p.fill??null,stroke:colors[0],strokeWidthMm:p.strokeWidthMm||.65,opacity:p.opacity??1});
  if(p.shape==='bubble'){
   const inset=Math.max(2,width*.1),bodyTop=height*.09,bodyBottom=height*.68,bodyWidth=width-2*inset,fontSize=p.fontSizePt??11;
   if(bodyWidth<=5)throw Error('气泡批注框宽度不足');
   const contentHeight=measureTextHeight(p.text,bodyWidth,fontSize,font);
   if(contentHeight>bodyBottom-bodyTop)throw Error('气泡批注文字超出框内可写区域；增大框或缩短文字');
   text(p.text,inset,bodyTop+(bodyBottom-bodyTop-contentHeight)/2,bodyWidth,{fontSizePt:fontSize,textAlign:'center'});
  }
 }else if(method.recipe==='pattern'){
  if(p.pattern==='echo'){for(let i=0;i<3;i++)shape('ellipse',width*(.15+i*.35),height*(i===1?.25:.75),3+i,3+i,{fill:colors[i%colors.length]});}
  else if(p.pattern==='bands'){shape('rect',width*.4,height*.5,width*.7,height*.25,{fill:colors[0]});shape('rect',width*.79,height*.5,width*.12,height*.25,{fill:colors[1]||colors[0]});}
  else {resolvedShapeOptions(p.pattern,p.options);shape({kind:p.pattern,options:{showOuterBorder:false,...p.options}},width/2,height/2,width,height,{fill:null,stroke:colors[1]||colors[0],strokeWidthMm:p.strokeWidthMm??.25});}
 }else if(method.recipe==='tape'){
  if(p.aliases.length!==1)throw Error('胶带方法需要一个胶带来源');
  const alias=p.aliases[0],a=materials.find(a=>(a.alias||a.id)===alias);if(a?.kind!=='tape')throw Error('只能取用本次真实胶带来源');
  const defaults=p.arrangement==='corners'?[{at:[0,0],rotationDeg:-35},{at:[width,height],rotationDeg:145}]:[{at:[width/2,height/2],rotationDeg:p.arrangement==='divider'?0:-10}];
  const segments=p.segments??defaults,band=tapeDimensions(a).widthMM;
  if(!Array.isArray(segments)||segments.length!==defaults.length)throw Error('胶带段数与方法不符');
  if((p.lengthMm??25)<2)throw Error('胶带段至少要有 2 mm');
  let left=0,top=0,right=width,bottom=height;
  for(const [i,segment] of segments.entries()){
   if(!segment||Object.keys(segment).some(k=>!['at','rotationDeg','lengthMm'].includes(k))||!Array.isArray(segment.at)||segment.at.length!==2||!segment.at.every(Number.isFinite)||segment.at[0]<0||segment.at[0]>width||segment.at[1]<0||segment.at[1]>height||segment.rotationDeg!==undefined&&(!Number.isFinite(segment.rotationDeg)||Math.abs(segment.rotationDeg)>180)||segment.lengthMm!==undefined&&(!Number.isFinite(segment.lengthMm)||segment.lengthMm<2||segment.lengthMm>1000))throw Error('胶带段位置、角度或长度无效');
   const length=segment.lengthMm??p.lengthMm??25,angle=(segment.rotationDeg??defaults[i].rotationDeg)*Math.PI/180;
   const dx=(Math.abs(Math.cos(angle))*(length+band)+Math.abs(Math.sin(angle))*band)/2;
   const dy=(Math.abs(Math.sin(angle))*(length+band)+Math.abs(Math.cos(angle))*band)/2;
   left=Math.min(left,segment.at[0]-dx);top=Math.min(top,segment.at[1]-dy);
   right=Math.max(right,segment.at[0]+dx);bottom=Math.max(bottom,segment.at[1]+dy);
  }
  segments.forEach((segment,i)=>children.push({op:'material.tape',id:id+'-tape'+i,asset:alias,lengthMm:segment.lengthMm??p.lengthMm??25,place:{...mmPlace(segment.at[0]-left,segment.at[1]-top),rotationDeg:segment.rotationDeg??defaults[i].rotationDeg},caps:{start:'torn',end:'torn',depthMm:.5}}));
  const shiftX=(left+right-width)/2,shiftY=(top+bottom-height)/2,rotation=(p.rotationDeg??0)*Math.PI/180;
  placementAt=[placementAt[0]+shiftX*Math.cos(rotation)-shiftY*Math.sin(rotation),placementAt[1]+shiftX*Math.sin(rotation)+shiftY*Math.cos(rotation)];
  width=right-left;height=bottom-top;
 }else if(method.recipe==='record'){
  const size=p.fontSizePt||11,gap=p.gapMm??4,col=p.layout==='columns'?2:1,rowWidth=width/col;
  const heights=p.items.map(t=>Math.max(8,measureTextHeight(t,rowWidth-9,size,font))+gap);
  let y=0;for(let i=0;i<p.items.length;i++){
   if(i%col===0&&i>0)y+=Math.max(...heights.slice(i-col,i));const x=(i%col)*rowWidth;
   if(['numbered','timeline'].includes(p.layout)){shape('ellipse',x+3,y+3,5,5,{fill:colors[1]||colors[0]});text(String(i+1),x+1.5,y+.6,5,{fontSizePt:8});}
   else if(p.layout==='checklist')shape('rect',x+2,y+3,3,3,{fill:null,stroke:colors[0],strokeWidthMm:.3});
   text(p.items[i],x+8,y,rowWidth-9,{fontSizePt:size});
  }height=Math.max(height,y+Math.max(...heights.slice(-col)));
  if(p.layout==='timeline'&&y>0){shape('rect',3,3+y/2,.25,y,{fill:colors[1]||colors[0]});children.unshift(children.pop());}
 }else {
  const target=p.target;libraryID(target);let operations;
  if(method.recipe==='relate')operations=[{op:'material.relate',target,relation:{kind:'peek',reference:'node:'+p.referenceTarget,edge:p.edge||'right',exposedMm:p.amountMm??4}}];
  if(method.recipe==='tear')operations=[{op:'material.tear',target,resultId:id,path:p.path,keep:p.keep||'left',depthMm:p.depthMm??.5,periodMm:p.periodMm||3,seed:p.seed||17,keepRemainder:true}];
  if(method.recipe==='window')operations=[{op:'material.window',target,resultId:id,windowId:id+'-window',cutoutId:id+'-core',region:{shape:'rect',space:'local',unit:'ratio',box:p.box},keepRemainder:true},{op:'layer.update',target:id+'-core',hidden:!p.corePlace,...(p.corePlace?{place:structuredClone(p.corePlace)}:{})}];
  if(method.recipe==='split'){const count=p.parts||2,gap=p.gapRatio??.02,w=(1-gap*(count-1))/count;operations=[{op:'material.split',target,keepRemainder:true,pieces:Array.from({length:count},(_,i)=>({id:id+'-part'+i,region:{shape:'rect',space:'local',unit:'ratio',box:[i*(w+gap),0,w,1]}}))}];}
  return {operations,report:{methodId,output:method.recipe==='relate'?target:method.recipe==='split'?id+'-part0':id,...(method.recipe==='split'?{outputs:Array.from({length:p.parts||2},(_,i)=>id+'-part'+i)}:{}),notes:['裁片与余料保存在真实来源账本；后续用现有裁片节点继续处理。'],...(method.recipe==='window'?{retainedNode:id+'-core',coreVisible:Boolean(p.corePlace),reuse:'使用现有窗芯节点继续处理；隐藏时先 layer.update hidden:false，再按窗芯裁片的外接框定位'}:{})}};
 }
 return {operations:[{op:'group.compose',id,layoutBox:{width,height,unit:'mm'},place:{reference:p.reference||'page',at:placementAt,unit:'mm',rotationDeg:p.rotationDeg||0},children}],report:{methodId,groupId:id,widthMm:width,heightMm:height,notes,...accentReport}};
}
