import catalog from './methods.json' with {type:'json'};
import {libraryID} from './compiler.js';
export const techniqueCatalog=catalog;
const common=['id','reference','at','rotationDeg'];
const graphic=['widthMm','heightMm','colors','seed'];
const fields={
 title:[...graphic,'text','fontFamily','fontSizePt','pattern','count'],materials:['aliases','caption','fontFamily','fontSizePt','gapMm','colors'],
 graphic:[...graphic,'waypoints','strokeWidthMm'],pattern:[...graphic,'pattern','count','strokeWidthMm'],
 tape:['aliases','widthMm','heightMm','lengthMm','gapMm'],record:[...graphic,'items','fontFamily','fontSizePt','gapMm'],
 relate:['target','referenceTarget','edge','amountMm'],tear:['target','path','keep','depthMm','periodMm','seed'],window:['target','box'],split:['target','parts','gapRatio']
};
const required={title:['text'],materials:['aliases'],graphic:[],pattern:[],tape:['aliases'],record:['items'],relate:['target','referenceTarget'],tear:['target','path'],window:['target','box'],split:['target']};
const fieldHelp={id:'本次结果唯一编号',reference:'page/page.left/page.right/node:<已有组ID>，默认 page',at:'中心位置 [x,y]，毫米，默认 [70,70]',rotationDeg:'整体旋转角度',widthMm:'数字图形或文字区域宽度，毫米；不会缩放实体',heightMm:'数字区域高度，毫米',colors:'1–4 个六位 HEX 颜色',seed:'固定纹样或撕口种子',text:'完整文字，长标题自动换行',fontFamily:'服务器已安装字体名',fontSizePt:'字号 pt',pattern:'plain/dots/stripes/grid',count:'纹样数量 1–30',aliases:'本任务中 1–8 个不重复的素材别名',caption:'可选图下注释，不自动编造',gapMm:'材料或条目间距毫米',waypoints:'路线 2–6 个 [x,y] 比例点',strokeWidthMm:'线宽毫米',lengthMm:'真实胶带取用长度毫米',items:'1–12 条用户提供或任务允许的文字',target:'已放置实体素材节点 ID',referenceTarget:'已有参照节点 ID',edge:'top/right/bottom/left',amountMm:'露出宽度毫米',path:'局部轨迹 {points:[[x,y],...],unit:"ratio"|"mm",closed?:boolean}',keep:'left/right/inside/outside',depthMm:'撕口深度毫米',periodMm:'撕口周期毫米',box:'开窗局部比例 [x,y,width,height]',parts:'分成 2–8 段',gapRatio:'段间保留余料占原长的比例'};
export function describeTechnique(id){
 const method=catalog.methods.find(m=>m.id===id);if(!method)throw Error('未知教程方法');
 const names=[...common,...fields[method.recipe]];
 return {...method,parameters:Object.fromEntries(names.map(k=>[k,{description:fieldHelp[k],required:k==='id'||required[method.recipe].includes(k)}])),tool:{name:'creation_recipe',arguments:{kind:'technique',recipeId:id,transactionId:'unique-id',baseSceneRevision:'当前版本',parameters:{id:'group-id',...(method.recipe==='title'?{text:'你的标题'}:{})}}}};
}
function validate(method,params){
 libraryID(params.id);const allowed=new Set([...common,...fields[method.recipe]]);
 for(const key of Object.keys(params))if(!allowed.has(key))throw Error('该方法不支持参数：'+key);
 for(const key of required[method.recipe])if(params[key]===undefined)throw Error('缺少参数：'+key);
 for(const key of ['widthMm','heightMm','fontSizePt','strokeWidthMm','lengthMm','periodMm'])if(params[key]!==undefined&&(!Number.isFinite(params[key])||params[key]<=0||params[key]>1000))throw Error('尺寸参数无效：'+key);
 for(const key of ['gapMm','amountMm','depthMm'])if(params[key]!==undefined&&(!Number.isFinite(params[key])||params[key]<0||params[key]>200))throw Error('间距参数无效：'+key);
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
 const p={...method.defaults,...parameters},id=p.id,colors=p.colors||['#3D6871','#E6B45E','#F1E8D5'],font=p.fontFamily||'Xiaolai',fontSize=p.fontSizePt||18;
 let width=p.widthMm||70,height=p.heightMm||38;const children=[],notes=[];let seq=0;
 const shape=(kind,x,y,w,h,style={})=>children.push({op:'graphic.add',id:id+'-g'+(++seq),geometry:typeof kind==='string'?{kind}:kind,place:mmPlace(x,y),size:{width:w,height:h,unit:'mm'},style:{fill:colors[0],...style}});
 const text=(content,x,y,w,style={})=>children.push({op:'text.add',id:id+'-t'+(++seq),content,place:{...mmPlace(x,y),anchor:'top-left'},size:{width:w,unit:'mm'},style:{fontFamily:font,fontSizePt:fontSize,color:colors[0],...style}});
 const pattern=(kind,x,y,w,h,count=8)=>{
  if(kind==='plain')return;
  for(let i=0;i<count;i++){
   if(kind==='dots')shape('ellipse',x+(i%4+.5)*w/4,y+(Math.floor(i/4)+.5)*h/Math.ceil(count/4),1,1,{fill:colors[1]||colors[0]});
   else {const xx=x+(i+.5)*w/count;shape('path',xx,y+h/2,Math.max(.2,w/count),h,{fill:null,stroke:colors[1]||colors[0],strokeWidthMm:.25});children.at(-1).geometry={kind:'path',viewBox:[0,0,10,10],paths:[{d:kind==='stripes'?'M 0 10 L 10 0':'M 5 0 L 5 10'}]};}
  }
  if(kind==='grid')for(let i=1;i<Math.min(count,12);i++)shape('rect',x+w/2,y+i*h/count,w,.2,{fill:colors[1]||colors[0]});
 };
 if(method.recipe==='title'){
  if(p.treatment==='stack'&&parameters.widthMm===undefined)width=Math.min(width,Math.max(25,[...p.text].length*fontSize*.353/2+8));
  const sizeMm=fontSize*25.4/72,characters=[...p.text],wrap=Math.max(1,Math.floor((width-8)/sizeMm));
  const content=p.treatment==='vertical'?characters.join('\n'):p.text;
  const lines=p.treatment==='vertical'?characters.length:content.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil([...line].length/wrap)),0);
  height=Math.max(p.heightMm||14,lines*sizeMm*1.45+8);if(p.treatment==='vertical')width=Math.max(16,sizeMm+8);
  if(['highlight','label','bubble','seal'].includes(p.treatment))shape(['bubble','seal'].includes(p.treatment)?'ellipse':'rect',width/2,height/2,width,height,{fill:colors[2]||'#F1E8D5',stroke:p.treatment==='seal'?colors[0]:null,strokeWidthMm:.5,cornerRadiusRatio:.1});
  pattern(p.pattern||'plain',0,0,width,height,p.count||8);
  if(p.treatment==='stagger'&&characters.length<=32){
   const fit=Math.min(fontSize,(width-8)/Math.max(1,characters.length)*72/25.4);
   children.push({op:'text.lettering',id:id+'-letters',content:p.text,place:mmPlace(width/2,height/2),style:{fontFamily:font,fontSizePt:fit,color:colors[0]},letters:characters.map((_,index)=>({index,rotationDeg:index%2?4:-3,offsetMm:[0,index%2?1.2:0]}))});
  }else text(content,4,4,width-8,{...(p.treatment==='outline'?{color:colors[2]||'#FFFFFF',outline:{color:colors[0],widthMm:.35}}:{}),...(p.treatment==='curve'?{curveHeightMm:Math.min(8,height/4)}:{})});
  if(p.treatment==='underline')children.push({op:'graphic.add',id:id+'-underline',geometry:{kind:'stroke',unit:'mm',points:Array.from({length:9},(_,i)=>({x:i*(width-8)/8,y:Math.sin(i*.8)*.3,pressure:.6}))},place:mmPlace(width/2,height-2),style:{stroke:colors[1]||colors[0],strokeWidthMm:.65,penStyle:'fountain'}});
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
  shape({kind:'sketch',motif:p.motif,seed:p.seed||17,...(p.waypoints?{waypoints:p.waypoints}:{})},width/2,height/2,width,height,{fill:null,stroke:colors[0],strokeWidthMm:p.strokeWidthMm||.65});
 }else if(method.recipe==='pattern'){
  if(p.pattern==='echo'){for(let i=0;i<3;i++)shape('ellipse',width*(.15+i*.35),height*(i===1?.25:.75),3+i,3+i,{fill:colors[i%colors.length]});}
  else if(p.pattern==='bands'){shape('rect',width*.4,height*.5,width*.7,height*.25,{fill:colors[0]});shape('rect',width*.79,height*.5,width*.12,height*.25,{fill:colors[1]||colors[0]});}
  else pattern(p.pattern,0,0,width,height,p.count||8);
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
  if(p.layout==='timeline')shape('rect',3,height/2,.25,height,{fill:colors[1]||colors[0]});
 }else {
  const target=p.target;libraryID(target);let operations;
  if(method.recipe==='relate')operations=[{op:'material.relate',target,relation:{kind:'peek',reference:'node:'+p.referenceTarget,edge:p.edge||'right',exposedMm:p.amountMm??4}}];
  if(method.recipe==='tear')operations=[{op:'material.tear',target,resultId:id,path:p.path,keep:p.keep||'left',depthMm:p.depthMm??.5,periodMm:p.periodMm||3,seed:p.seed||17,keepRemainder:true}];
  if(method.recipe==='window')operations=[{op:'material.window',target,resultId:id,windowId:id+'-window',cutoutId:id+'-core',region:{shape:'rect',space:'local',unit:'ratio',box:p.box},keepRemainder:true},{op:'layer.update',target:id+'-core',hidden:true}];
  if(method.recipe==='split'){const count=p.parts||2,gap=p.gapRatio??.02,w=(1-gap*(count-1))/count;operations=[{op:'material.split',target,keepRemainder:true,pieces:Array.from({length:count},(_,i)=>({id:id+'-part'+i,region:{shape:'rect',space:'local',unit:'ratio',box:[i*(w+gap),0,w,1]}}))}];}
  return {operations,report:{methodId,output:id,notes:['裁片与余料保存在真实来源账本；后续用现有裁片节点继续处理。'],...(method.recipe==='window'?{retainedNode:id+'-core',reuse:'layer.update hidden:false 后定位'}:{})}};
 }
 return {operations:[{op:'group.compose',id,layoutBox:{width,height,unit:'mm'},place:{reference:p.reference||'page',at:p.at||[70,70],unit:'mm',rotationDeg:p.rotationDeg||0},children}],report:{methodId,groupId:id,widthMm:width,heightMm:height,notes}};
}
