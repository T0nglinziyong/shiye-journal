// Artistic titles remain ordinary editable groups/text. Metadata only records
// layout intent; there is no raster title or second render model.
import {styleFor,changedNodeProperties} from './scene-node-properties.js';
import {textEffectInsets} from './text-effects.js';
import {findSceneNode,assertSceneEditable} from './scene-v2.js';
import {assertPolicyOwnership,AI_SCENE_POLICY} from './scene-edit-policy.js';
import {assertNoLinkedDependents} from './scene-layout.js';
import {sceneStructureTransaction} from './scene-structure-edit.js';
const scale=page=>page.canvas.height/page.physicalPageHeightMM;
const baseStyle={fontSizePt:22,fontPreset:'hand',textAlign:'center',color:'#30463d'};
const charsOf=content=>{
 if(typeof content!=='string')throw Error('标题正文必须是字符串');
 const chars=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(content)].map(s=>s.segment);
 if(chars.length<1||chars.length>32||chars.some(ch=>/[\r\n]/.test(ch))||!content.trim())throw Error('艺术字适用于 1–32 个字素的单行短标题');return chars;
};
const variantsOf=(variants,length)=>{
 const result=new Map();for(const v of variants||[]){if(!Number.isInteger(v.index)||v.index<0||v.index>=length||result.has(v.index))throw Error('letters.index 越界或重复');result.set(v.index,v);}return result;
};
function newLetter(page,id,content,style,index){
 const font=(style.fontSizePt||22)*25.4/72*scale(page);
 const node={id,agentKey:id,type:'text',content,x:0,y:0,width:font*1.2,height:font*1.6,fontSize:font,style:'hand',color:'#30463d',alignment:'center',rotation:0,opacity:1,blendMode:'normal',zIndex:index};
 Object.assign(node,styleFor('text',style,page,node));return node;
}
function layoutLetters(page,group,nodes,offsets,gapMm){
 if(!(Number.isFinite(gapMm)&&gapMm>=0&&gapMm<=20))throw Error('字间距超出范围');
 const s=scale(page);let cursor=0;
 for(const [i,n] of nodes.entries()){
  const inset=textEffectInsets(n);n.width=n.fontSize*1.2+inset.left+inset.right;
  Object.assign(n,changedNodeProperties(page,n,{}));
  n.x=cursor+n.width/2+offsets[i][0]*s;n.y=offsets[i][1]*s;cursor+=n.width+gapMm*s;
 }
 const corners=nodes.flatMap(n=>{const a=n.rotation*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[n.x+x*n.width/2*c-y*n.height/2*sn,n.y+x*n.width/2*sn+y*n.height/2*c]);});
 const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),cx=(left+right)/2,cy=(top+bottom)/2;
 nodes.forEach(n=>{n.x-=cx;n.y-=cy;});group.children=nodes;group.layoutBox={width:Math.max(1,right-left),height:Math.max(1,bottom-top)};
 group.lettering={...group.lettering,gapMm,slots:nodes.map(n=>n.id),offsets:structuredClone(offsets),positions:nodes.map(n=>[n.x,n.y])};return group;
}
export function createLetteringGroup(page,item){
 const chars=charsOf(item.content),variants=variantsOf(item.letters,chars.length),style={...baseStyle,...item.style},offsets=[];
 const nodes=chars.map((ch,i)=>{const variant=variants.get(i)||{},node=newLetter(page,item.id+'-g'+(i+1),ch,{...style,...variant.style},i);node.rotation=variant.rotationDeg||0;offsets.push(variant.offsetMm||[0,0]);return node;});
 if(nodes.some(n=>n.id.length>128))throw Error('标题子节点 id 过长');
 const group={id:item.id,type:'group',name:'艺术字 · '+item.content,children:nodes,localTransform:[1,0,0,1,0,0],opacity:1,blendMode:'normal',zIndex:500,lettering:{version:1,style,nextIndex:chars.length+1}};
 return layoutLetters(page,group,nodes,offsets,item.gapMm??.8);
}
export function validateLettering(group){
 const l=group.lettering;if(l===undefined)return true;
 if(group.type!=='group'||!group.localTransform||!group.layoutBox||!l||l.version!==1||Object.keys(l).some(k=>!['version','style','nextIndex','slots','gapMm','offsets','positions'].includes(k))||!Array.isArray(l.slots)||!l.slots.length||l.slots.length>32||new Set(l.slots).size!==l.slots.length||!Number.isInteger(l.nextIndex)||l.nextIndex<1||l.nextIndex>100000||!(Number.isFinite(l.gapMm)&&l.gapMm>=0&&l.gapMm<=20))throw Error('艺术标题布局记录无效');
 for(const field of ['offsets','positions'])if(!Array.isArray(l[field])||l[field].length!==l.slots.length||l[field].some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>100000)))throw Error('艺术标题字位记录无效');
 // Reparenting/deleting a child is a valid ordinary edit. Reflow, not loading,
 // requires the original title structure to still be intact.
 if(!l.style||typeof l.style!=='object'||Array.isArray(l.style))throw Error('艺术标题默认样式无效');return true;
}
export function reflowLettering(page,id,change,{policy=AI_SCENE_POLICY}={}){
 const group=assertSceneEditable(page,id);assertPolicyOwnership(group,policy);validateLettering(group);
 if(!group.lettering)throw Error('text.reflow 只接受 text.lettering 创建的艺术标题');
 const meta=group.lettering,existing=meta.slots.map(id=>group.children.find(n=>n.id===id));
 if(existing.some(n=>!n||n.type!=='text')||existing.length!==group.children.length)throw Error('艺术标题子树已改动，不能自动重排');
 for(const node of existing){assertSceneEditable(page,node.id);assertPolicyOwnership(node,policy);if(node.layoutConstraint)throw Error('字位有独立 linked 约束，请先解除再整体重排');}
 const content=change.content??existing.map(n=>n.content).join(''),chars=charsOf(content),variants=variantsOf(change.letters,chars.length);
 const removed=existing.slice(chars.length);for(const node of removed)assertNoLinkedDependents(page,node.id);
 return sceneStructureTransaction(page,()=>{
  const style={...meta.style,...change.style},s=scale(page),offsets=[];let nextIndex=meta.nextIndex;
  const nodes=chars.map((ch,i)=>{
   const v=variants.get(i)||{},old=existing[i];let node;
   if(old){node=old;node.content=ch;Object.assign(node,styleFor('text',change.style,page,node),styleFor('text',v.style,page,node));}
   else{const id=group.id+'-g'+nextIndex++;if(id.length>128||findSceneNode(page,id))throw Error('新字位编号冲突或过长');node=newLetter(page,id,ch,{...style,...v.style},i);}
   node.rotation=v.rotationDeg??node.rotation??0;
   offsets.push(v.offsetMm||(!old?[0,0]:[meta.offsets[i][0]+(old.x-meta.positions[i][0])/s,meta.offsets[i][1]+(old.y-meta.positions[i][1])/s]));return node;
  });
  group.lettering={...meta,style,nextIndex};layoutLetters(page,group,nodes,offsets,change.gapMm??meta.gapMm);
  if(group.name?.startsWith('艺术字 · '))group.name='艺术字 · '+content;
  return group;
 },{policy});
}
