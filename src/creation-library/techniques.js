import catalog from './methods.json' with {type:'json'};
import {libraryID} from './compiler.js';
import {advancedShapeControls,resolvedShapeOptions} from '../advanced-shape-options.js';
import {compileTitle,titleFields,titleHelp} from './title.js';
import {techniqueExample,exampleMaterials} from './examples.js';
export const techniqueCatalog=catalog;
const common=['id','reference','at','rotationDeg'];
const graphic=['widthMm','heightMm','colors','seed'];
const fields={
 title:titleFields,materials:['aliases','caption','fontFamily','fontSizePt','gapMm','colors'],
 graphic:[...graphic,'waypoints','strokeWidthMm','options','fill','opacity'],pattern:['widthMm','heightMm','colors','options','strokeWidthMm'],
 tape:['aliases','widthMm','heightMm','lengthMm'],record:[...graphic,'items','fontFamily','fontSizePt','gapMm'],
 write:['target','box','text','fontFamily','fontSizePt','colors'],relate:['target','referenceTarget','edge','amountMm'],tear:['target','path','keep','depthMm','periodMm','seed'],window:['target','box','corePlace'],split:['target','parts','gapRatio'],weave:['strip','through']
};
const required={title:['text'],materials:['aliases'],graphic:[],pattern:[],tape:['aliases'],record:['items'],write:['target','box','text'],relate:['target','referenceTarget'],tear:['target','path'],window:['target','box'],split:['target'],weave:['strip','through']};
const fieldHelp={...titleHelp,options:'结构参数：花瓣数、星角、波浪起伏等；保留为可编辑 geometry.options，具体键见方法示例及 geometry 帮助',fill:'数字图形填充 HEX 或 null（空心）',opacity:'数字图形透明度 0–1',id:'本次结果唯一编号',reference:'page/page.left/page.right/node:<已有组ID>，默认 page',at:'中心位置 [x,y]，毫米，默认 [70,70]',rotationDeg:'整体旋转角度',widthMm:'数字图形或文字区域宽度，毫米；不会缩放实体',heightMm:'数字区域高度，毫米',colors:'1–4 个六位 HEX 颜色',seed:'固定纹样或撕口种子',text:'完整文字，长标题自动换行',fontFamily:'服务器已安装字体名',fontSizePt:'字号 pt',pattern:'plain/dots/stripes/grid',count:'纹样数量 1–30',aliases:'本任务中 1–8 个不重复的素材别名',caption:'可选图下注释，不自动编造',gapMm:'材料或条目间距毫米',waypoints:'路线 2–6 个 [x,y] 比例点',strokeWidthMm:'线宽毫米',lengthMm:'真实胶带取用长度毫米',items:'1–12 条用户提供或任务允许的文字',target:'已放置实体素材节点 ID',referenceTarget:'已有参照节点 ID',edge:'top/right/bottom/left',amountMm:'露出宽度毫米',path:'局部轨迹 {points:[[x,y],...],unit:"ratio"|"mm",closed?:boolean}',keep:'left/right/inside/outside',depthMm:'撕口深度毫米',periodMm:'撕口周期毫米',box:'开窗局部比例 [x,y,width,height]',parts:'分成 2–8 段',gapRatio:'段间保留余料占原长的比例'};
function methodFields(method){
 const base=['write','relate','tear','window','split','weave'].includes(method.recipe)?['id']:common;
 let specific=fields[method.recipe];
 if(method.recipe==='graphic')specific=specific.filter(k=>method.defaults.shape?!['seed','waypoints'].includes(k):k!=='options'&&(k!=='waypoints'||method.defaults.motif==='trail'));
 if(method.recipe==='pattern'&&['echo','bands'].includes(method.defaults.pattern))specific=specific.filter(k=>!['options','strokeWidthMm'].includes(k));
 return [...base,...specific];
}
export function describeTechnique(id){
 const method=catalog.methods.find(m=>m.id===id);if(!method)throw Error('未知教程方法');
 const names=methodFields(method),help={...fieldHelp,...titleHelp,corePlace:'可选窗芯位置，使用 layer.update.place 的完整结构。传入时显示并定位窗芯；不传则隐藏保留。位置按裁下窗芯的外接框定位，保留原图裁切来源',strip:'已经放置并对准孔位的真实纸条节点 ID；不缩放或自动拉长',through:'按穿行顺序给 2–16 项 {target,sideAfter:"front"|"back",region? ,window?}；region 用 material.window 的 Region 开新孔，window 引用已有孔 ID，二选一。新孔窗芯隐藏保留；输出报告列出替代后的框与窗芯 ID',...(method.recipe==='write'?{box:'素材局部可写区域 [x,y,width,height]，各值为比例；需先观察图片，避开重要图案',text:'完整正文，最多 500 字；不截断，实际高度需看预览'}:{})};
 const example=techniqueExample(method);
 return {...method,parameters:Object.fromEntries(names.map(k=>[k,{description:help[k],required:k==='id'||required[method.recipe].includes(k)||(k==='corePlace'&&method.defaults.reuseCore===true)}])),geometryOptions:advancedShapeControls(method.defaults.shape||method.defaults.pattern),example:{materials:exampleMaterials.filter(a=>(example.parameters.aliases||[]).includes(a.alias)||example.before.some(op=>op.asset===a.alias)),prepare:example.before,note:'示例别名和已有节点来自本例准备步骤；实际调用替换成本次素材和节点。'},tool:{name:'creation_recipe',arguments:{kind:'technique',recipeId:id,transactionId:'unique-id',baseSceneRevision:'当前版本',parameters:example.parameters}}};
}
function validate(method,params){
 libraryID(params.id);const allowed=new Set(methodFields(method));
 for(const key of Object.keys(params))if(!allowed.has(key))throw Error('该方法不支持参数：'+key);
 for(const key of required[method.recipe])if(params[key]===undefined)throw Error('缺少参数：'+key);
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
 if(params.caption!==undefined&&(typeof params.caption!=='string'||params.caption.length>1000))throw Error('注释过长');
 if(params.pattern!==undefined&&!['plain','dots','stripes','grid'].includes(params.pattern))throw Error('未知背景花纹');
 if(params.items&&(!Array.isArray(params.items)||!params.items.length||params.items.length>12||params.items.some(t=>typeof t!=='string'||!t.trim()||t.length>180)))throw Error('条目格式无效');
 if(params.aliases&&(!Array.isArray(params.aliases)||!params.aliases.length||params.aliases.length>8||new Set(params.aliases).size!==params.aliases.length))throw Error('素材列表无效或重复');
 if(params.parts!==undefined&&(!Number.isInteger(params.parts)||params.parts<2||params.parts>8))throw Error('分裁数量为 2–8');
 if(params.gapRatio!==undefined&&(!Number.isFinite(params.gapRatio)||params.gapRatio<0||params.gapRatio>.05))throw Error('余料间隔比例为 0–0.05');
}
const mmPlace=(x,y)=>({reference:'parent',at:[x,y],unit:'mm'});
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
 let width=p.widthMm||70,height=p.heightMm||38;const children=[],notes=[];let seq=0;
 const shape=(kind,x,y,w,h,style={})=>children.push({op:'graphic.add',id:id+'-g'+(++seq),geometry:typeof kind==='string'?{kind}:kind,place:mmPlace(x,y),size:{width:w,height:h,unit:'mm'},style:{fill:colors[0],...style}});
 const text=(content,x,y,w,style={})=>children.push({op:'text.add',id:id+'-t'+(++seq),content,place:{...mmPlace(x,y),anchor:'top-left'},size:{width:w,unit:'mm'},style:{fontFamily:font,fontSizePt:fontSize,color:colors[0],...style}});
 if(method.recipe==='title'){
  const title=compileTitle(p,{widthExplicit:parameters.widthMm!==undefined});
  width=title.width;height=title.height;children.push(...title.children);notes.push(...title.notes);
 }else if(method.recipe==='materials'){
  const rows=p.aliases.map(alias=>{const a=materials.find(a=>(a.alias||a.id)===alias);if(!a)throw Error('素材不在授权范围：'+alias);const w=Number(a.physicalWidthMM??a.widthMM),h=Number(a.physicalHeightMM??a.heightMM);if(!(w>0&&h>0))throw Error('素材尺寸缺失');return {alias,w,h};});
  const gap=p.gapMm??4;let right=0,bottom=0,positions=[];
  for(let i=0;i<rows.length;i++){
   const a=rows[i],previous=positions[i-1],maxW=Math.max(...rows.map(a=>a.w)),maxH=Math.max(...rows.map(a=>a.h));let x=0,y=0;
   if(p.arrangement==='row'){x=previous?previous.x+rows[i-1].w+gap:0;}
   if(p.arrangement==='grid'){x=(i%2)*(maxW+gap);y=Math.floor(i/2)*(maxH+gap);}
   if(p.arrangement==='stagger'){x=previous?previous.x+rows[i-1].w+gap:0;y=i%2?maxH*.2:0;}
   if(p.arrangement==='stack'){x=i*gap;y=i*gap;}
   if(p.arrangement==='diagonal'){x=i*(maxW*.65+gap);y=i*(maxH*.55+gap);}
   if(p.arrangement==='triangle'){x=(i%3===1?maxW+gap:i%3===2?(maxW+gap)/2:0);y=Math.floor(i/3)*(maxH*2+gap)+(i%3===2?maxH+gap:0);}
   if(p.arrangement==='s-route'){x=(Math.sin(i*1.5)+1)*maxW*.4;y=i*(maxH*.75+gap);}
   positions.push({x,y});right=Math.max(right,x+a.w);bottom=Math.max(bottom,y+a.h);
   children.push({op:'material.add',id:id+'-m'+i,asset:a.alias,place:mmPlace(x+a.w/2,y+a.h/2)});
  }
  width=right;height=bottom;
  if(p.caption){const captionFont=p.fontSizePt||11,captionHeight=Math.ceil([...p.caption].length/Math.max(1,width/(captionFont*.353)))*captionFont*.45;text(p.caption,0,height+gap,width,{fontSizePt:captionFont});height+=gap+captionHeight;}
 }else if(method.recipe==='graphic'){
  if(p.shape)resolvedShapeOptions(p.shape,p.options);
  shape(p.shape?{kind:p.shape,...(p.options?{options:p.options}:{})}:{kind:'sketch',motif:p.motif,seed:p.seed||17,...(p.waypoints?{waypoints:p.waypoints}:{})},width/2,height/2,width,height,{fill:p.fill??null,stroke:colors[0],strokeWidthMm:p.strokeWidthMm||.65,opacity:p.opacity??1});
 }else if(method.recipe==='pattern'){
  if(p.pattern==='echo'){for(let i=0;i<3;i++)shape('ellipse',width*(.15+i*.35),height*(i===1?.25:.75),3+i,3+i,{fill:colors[i%colors.length]});}
  else if(p.pattern==='bands'){shape('rect',width*.4,height*.5,width*.7,height*.25,{fill:colors[0]});shape('rect',width*.79,height*.5,width*.12,height*.25,{fill:colors[1]||colors[0]});}
  else {resolvedShapeOptions(p.pattern,p.options);shape({kind:p.pattern,options:{showOuterBorder:false,...p.options}},width/2,height/2,width,height,{fill:null,stroke:colors[1]||colors[0],strokeWidthMm:p.strokeWidthMm??.25});}
 }else if(method.recipe==='tape'){
  if(p.aliases.length!==1)throw Error('胶带方法需要一个胶带来源');
  const alias=p.aliases[0],a=materials.find(a=>(a.alias||a.id)===alias);if(a?.kind!=='tape')throw Error('只能取用本次真实胶带来源');
  const points=p.arrangement==='corners'?[[0,0,-35],[width,height,145]]:[[width/2,height/2,p.arrangement==='divider'?0:-10]];
  points.forEach(([x,y,r],i)=>children.push({op:'material.tape',id:id+'-tape'+i,asset:alias,lengthMm:p.lengthMm||25,place:{...mmPlace(x,y),rotationDeg:r},caps:{start:'torn',end:'torn',depthMm:.5}}));
 }else if(method.recipe==='record'){
  const size=p.fontSizePt||11,gap=p.gapMm??4,col=p.layout==='columns'?2:1,rowWidth=width/col;
  const heights=p.items.map(t=>Math.max(1,Math.ceil([...t].length/Math.max(1,(rowWidth-10)/(size*.353))))*size*.48+gap);
  let y=0;for(let i=0;i<p.items.length;i++){
   if(i%col===0&&i>0)y+=Math.max(...heights.slice(i-col,i));const x=(i%col)*rowWidth;
   if(['numbered','timeline'].includes(p.layout)){shape('ellipse',x+3,y+3,5,5,{fill:colors[1]||colors[0]});text(String(i+1),x+1.5,y+.6,5,{fontSizePt:8});}
   else if(p.layout==='checklist')shape('rect',x+2,y+3,3,3,{fill:null,stroke:colors[0],strokeWidthMm:.3});
   text(p.items[i],x+8,y,rowWidth-9,{fontSizePt:size});
  }height=Math.max(height,y+Math.max(...heights.slice(-col)));
  if(p.layout==='timeline'){shape('rect',3,height/2,.25,height,{fill:colors[1]||colors[0]});children.unshift(children.pop());}
 }else {
  const target=p.target;libraryID(target);let operations;
  if(method.recipe==='relate')operations=[{op:'material.relate',target,relation:{kind:'peek',reference:'node:'+p.referenceTarget,edge:p.edge||'right',exposedMm:p.amountMm??4}}];
  if(method.recipe==='tear')operations=[{op:'material.tear',target,resultId:id,path:p.path,keep:p.keep||'left',depthMm:p.depthMm??.5,periodMm:p.periodMm||3,seed:p.seed||17,keepRemainder:true}];
  if(method.recipe==='window')operations=[{op:'material.window',target,resultId:id,windowId:id+'-window',cutoutId:id+'-core',region:{shape:'rect',space:'local',unit:'ratio',box:p.box},keepRemainder:true},{op:'layer.update',target:id+'-core',hidden:!p.corePlace,...(p.corePlace?{place:structuredClone(p.corePlace)}:{})}];
  if(method.recipe==='split'){const count=p.parts||2,gap=p.gapRatio??.02,w=(1-gap*(count-1))/count;operations=[{op:'material.split',target,keepRemainder:true,pieces:Array.from({length:count},(_,i)=>({id:id+'-part'+i,region:{shape:'rect',space:'local',unit:'ratio',box:[i*(w+gap),0,w,1]}}))}];}
  return {operations,report:{methodId,output:method.recipe==='relate'?target:method.recipe==='split'?id+'-part0':id,...(method.recipe==='split'?{outputs:Array.from({length:p.parts||2},(_,i)=>id+'-part'+i)}:{}),notes:['裁片与余料保存在真实来源账本；后续用现有裁片节点继续处理。'],...(method.recipe==='window'?{retainedNode:id+'-core',coreVisible:Boolean(p.corePlace),reuse:'使用现有窗芯节点继续处理；隐藏时先 layer.update hidden:false，再按窗芯裁片的外接框定位'}:{})}};
 }
 return {operations:[{op:'group.compose',id,layoutBox:{width,height,unit:'mm'},place:{reference:p.reference||'page',at:p.at||[70,70],unit:'mm',rotationDeg:p.rotationDeg||0},children}],report:{methodId,groupId:id,widthMm:width,heightMm:height,notes}};
}
