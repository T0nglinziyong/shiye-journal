// Intent helpers lower into ordinary editable Scene nodes. They never add a
// competing model or rasterize text, and use the same place/style/update path.
import {creationNode,creationLocation,sceneScale,insertSceneNode} from './creation-scene-core.js';
import {changedNodeProperties,dimensions,styleFor} from './scene-node-properties.js';
import {measureSceneText} from './scene-text-layout.js';
import {textEffectInsets} from './text-effects.js';
import {worldBox,spatialPath} from './scene-spatial.js';
const graphemes=text=>[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.segment);
export function addLettering(doc,item,assets,{finishNode}){
 const chars=graphemes(item.content);if(chars.length<1||chars.length>32||chars.some(ch=>/[\r\n]/.test(ch))||!item.content.trim())throw Error('艺术字适用于 1–32 个字素的单行短标题');
 const overrides=new Map();for(const variant of item.letters||[]){if(variant.index>=chars.length||overrides.has(variant.index))throw Error('letters.index 越界或重复');overrides.set(variant.index,variant);}
 const s=sceneScale(doc.page),gap=(item.gapMm??.8)*s,nodes=[];let cursor=0;
 for(const [i,ch] of chars.entries()){
  const variant=overrides.get(i)||{},style={fontSizePt:22,fontPreset:'hand',textAlign:'center',color:'#30463d',...item.style,...variant.style},font=style.fontSizePt*25.4/72*s;
  const n={id:item.id+'-g'+(i+1),agentKey:item.id+'-g'+(i+1),type:'text',content:ch,x:0,y:0,width:font*1.2,height:font*1.6,fontSize:font,style:'hand',color:'#30463d',alignment:'center',rotation:variant.rotationDeg||0,opacity:1,blendMode:'normal',zIndex:i};
  Object.assign(n,styleFor('text',style,doc.page,n));const inset=textEffectInsets(n);n.width=font*1.2+inset.left+inset.right;
  Object.assign(n,changedNodeProperties(doc.page,n,{}));
  n.x=cursor+n.width/2+(variant.offsetMm?.[0]||0)*s;n.y=(variant.offsetMm?.[1]||0)*s;cursor+=n.width+gap;nodes.push(n);
 }
 const corners=nodes.flatMap(n=>{const a=n.rotation*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[n.x+x*n.width/2*c-y*n.height/2*sn,n.y+x*n.width/2*sn+y*n.height/2*c]);});
 const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 nodes.forEach(n=>{n.x-=cx;n.y-=cy;});
 const group={id:item.id,type:'group',name:'艺术字 · '+item.content,children:nodes,localTransform:[1,0,0,1,0,0],layoutBox:{width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY)},opacity:1,blendMode:'normal',zIndex:500};
 doc=insertSceneNode(doc,group,assets,item.parent);
 return finishNode(doc,item.id,{place:item.place,order:item.order},assets,{created:true});
}
function random(seed){let n=seed>>>0;return()=>{n=(Math.imul(1664525,n)+1013904223)>>>0;return n/4294967296;};}
export function addDecoration(doc,item,assets,{finishNode}){
 const target=creationNode(doc,item.target),path=spatialPath(doc.page.layers,target.id),parent=path.ancestors.at(-1)?.id,box=worldBox(doc.page,target.id),s=sceneScale(doc.page),rng=random(item.seed??42);
 if(item.kind==='highlight'&&(target.type!=='text'||String(target.content).includes('\n')||target.type==='text'&&measureSceneText(target).lines.length!==1))throw Error('关键词高亮需要一个单行短文字图层；不是自动词语识别');
 const measured=target.type==='text'?measureSceneText(target):null;
 const contentWidth=measured?Math.min(box.w,measured.width):box.w;
 const extent=item.size?dimensions(doc.page,item.size,{parentID:parent,ratio:box.w/Math.max(box.h,1)}):{width:contentWidth/s,height:box.h/s};
 const width=extent.width*s,height=item.kind==='bracket'?extent.height*s:Math.max(1,Math.min(3*s,extent.height*s/6));
 const penWidth=item.style?.strokeWidthMm??(item.kind==='highlight'?Math.max(.5,Math.min(8,(target.fontSize||12)/s*.45)):.55);
 let points;
 if(item.kind==='bracket')points=[[width*.15,0],[0,0],[0,height],[width*.15,height]];
 else points=Array.from({length:7},(_,i)=>[width*i/6,(rng()-.5)*height*.35]);
 const node={id:item.id,agentKey:item.id,type:'ink',points:points.map(([x,y])=>({x,y,p:.5})),width:penWidth*s,color:item.kind==='highlight'?'#E8D66B':'#546E7A',penStyle:item.kind==='highlight'?'marker':'ballpoint',layoutRotation:0,zIndex:500,opacity:item.kind==='highlight'?.45:1,blendMode:item.kind==='highlight'?'multiply':'normal'};
 const style={...item.style,strokeWidthMm:penWidth};Object.assign(node,changedNodeProperties(doc.page,node,{style}));
 doc=insertSceneNode(doc,node,assets,parent);
 const align=target.alignment||'left',fractionX=measured?(align==='center'?.5:align==='right'?1-contentWidth/(2*box.w):contentWidth/(2*box.w)):.5;
 const pad=textEffectInsets(target),fractionY=item.kind==='highlight'?(pad.top+(target.fontSize||box.h)*.62)/box.h:1;
 const placement=item.place||(item.kind==='bracket'?{reference:'node:'+target.id,referenceAnchor:'middle-left',anchor:'middle-right',offset:{value:[-1.5,0],unit:'mm'},rotationSpace:'reference',rotationDeg:0,behavior:'linked'}:{reference:'node:'+target.id,at:[fractionX,fractionY],unit:'ratio',anchor:'center',offset:{value:item.kind==='underline'?[0,1.5]:[0,0],unit:'mm'},rotationSpace:'reference',rotationDeg:0,behavior:'linked'});
 return finishNode(doc,item.id,{place:placement,order:item.order||{[item.kind==='highlight'?'before':'after']:target.id}},assets,{created:true});
}
