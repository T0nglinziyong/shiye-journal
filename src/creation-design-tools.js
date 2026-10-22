// Intent helpers lower into ordinary editable Scene nodes. They never add a
// competing model or rasterize text, and use the same place/style/update path.
import {sceneScale,insertSceneNode} from './creation-scene-core.js';
import {changedNodeProperties,styleFor} from './scene-node-properties.js';
import {textEffectInsets} from './text-effects.js';
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
