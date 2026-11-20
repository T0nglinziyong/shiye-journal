import catalog from './templates.json' with {type:'json'};
import {isMaterialSlot} from './template-elements.js';
export const templateCatalog=catalog;
export const templateEnabled=template=>template.usage?.status!=='deferred';
const clamp=v=>Math.max(0,Math.min(1,v));
const roles={focal:['focal','secondary'],material:['secondary','focal','information'],background:['background'],accent:['accent','marker','connector','divider']};
const dimensions=a=>[Number(a.physicalWidthMM??a.widthMM),Number(a.physicalHeightMM??a.heightMM)];
const terms=a=>[a.title,...(a.tags||[]),...(a.contentTags||[]),...(a.contentCategories||[]),...(a.themeTags||[]),...(a.styleTags||[]),...(a.materialTags||[])].filter(Boolean).join(' ').toLowerCase();
const overlap=(wanted,text)=>wanted.length?wanted.filter(s=>text.includes(s.toLowerCase())).length/wanted.length:null;
export const materialSlots=t=>t.elements.filter(isMaterialSlot);
export function slotAffinity(asset,slot,paper){
 const [w,h]=dimensions(asset),[,,sw,sh]=slot.box;
 if(!(w>0&&h>0&&paper.width>0&&paper.height>0))return {score:0,geometry:0,reason:'缺少真实尺寸'};
 const geometry=Math.exp(-.85*(Math.abs(Math.log(w/(paper.width*sw)))+Math.abs(Math.log(h/(paper.height*sh)))));
 const role=roles[slot.role]?.some(r=>[asset.role,...(asset.secondaryRoles||[])].includes(r))?1:.35;
 const type=slot.accepts?.includes(asset.kind)?1:.35;
 const text=terms(asset),content=overlap(slot.content||[],text),style=overlap(slot.styles||[],text);
 const semantic=content??.5,styleScore=style??.5;
 return {score:clamp(geometry*(.72+.13*role+.09*type+.03*semantic+.03*styleScore)),geometry,role,type};
}
// Rectangular Hungarian assignment with one private empty column per source.
export function maximumAssignment(weights){
 const n=weights.length;if(!n)return [];
 const m=weights[0].length;if(m<n)throw Error('分配列不足');
 const u=Array(n+1).fill(0),v=Array(m+1).fill(0),p=Array(m+1).fill(0),way=Array(m+1).fill(0);
 for(let i=1;i<=n;i++){
  p[0]=i;let j0=0;const min=Array(m+1).fill(Infinity),used=Array(m+1).fill(false);
  do{used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;
   for(let j=1;j<=m;j++)if(!used[j]){const cur=-weights[i0-1][j-1]-u[i0]-v[j];if(cur<min[j]){min[j]=cur;way[j]=j0;}if(min[j]<delta){delta=min[j];j1=j;}}
   for(let j=0;j<=m;j++){if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;}j0=j1;
  }while(p[j0]!==0);
  do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);
 }
 const result=Array(n).fill(-1);for(let j=1;j<=m;j++)if(p[j])result[p[j]-1]=j-1;return result;
}
function relationScore(assigned,materials,slots){
 let total=0,count=0;
 for(let i=0;i<assigned.length;i++)for(let j=i+1;j<assigned.length;j++){
  const a=assigned[i],b=assigned[j],x=dimensions(materials[a.source]),y=dimensions(materials[b.source]),s=slots[a.slot].box,t=slots[b.slot].box;
  total+=Math.exp(-Math.abs(Math.log((x[0]*x[1]/(y[0]*y[1]))/(s[2]*s[3]/(t[2]*t[3])))));count++;
 }return count?total/count:.5;
}
export function scoreTemplate(template,materials,paper,{styles=[],content=[]}={}){
 const slots=materialSlots(template),affinities=materials.map(a=>slots.map(s=>slotAffinity(a,s,paper)));
 const weights=affinities.map(row=>[...row.map(x=>x.score),...materials.map(()=>.34)]);
 const allocation=maximumAssignment(weights),assigned=allocation.flatMap((slot,source)=>slot<slots.length?[{source,slot,affinity:affinities[source][slot]}]:[]);
 const unused=materials.filter((_,i)=>!assigned.some(a=>a.source===i)).map(a=>a.alias||a.id);
 const geometric=assigned.reduce((n,a)=>n+a.affinity.geometry,0)/Math.max(1,materials.length);
 const compatibility=assigned.reduce((n,a)=>n+a.affinity.score,0)/Math.max(1,materials.length);
 const relationships=relationScore(assigned,materials,slots);
 const coverage=assigned.reduce((n,a)=>n+(slots[a.slot].weight||1),0)/Math.max(1,slots.reduce((n,s)=>n+(s.weight||1),0));
 const descriptor=[...styles,...content,...materials.map(terms)].join(' '),style=overlap(template.styles||[],descriptor)??.5;
 const thematic=overlap(template.content||[],descriptor)??.5;
 const aspect=Math.exp(-Math.abs(Math.log((paper.width/paper.height)/template.aspect)));
 const score=materials.length?100*clamp(.34*compatibility+.22*geometric+.16*relationships+.16*coverage+.05*style+.03*thematic+.04*aspect):0;
 return {id:template.id,title:template.title,family:template.family,score,components:{size:geometric,relationships,compatibility,coverage,style,content:thematic,aspect},
  assignments:assigned.map(a=>({alias:materials[a.source].alias||materials[a.source].id,slotId:slots[a.slot].id,score:a.affinity.score,box:slots[a.slot].box})),unused,
  emptySlots:slots.filter((_,i)=>!assigned.some(a=>a.slot===i)).map(s=>s.id)};
}
export function rankTemplates({materials=[],paper={width:148,height:210},styles=[],content=[],limit=5,templates=catalog.templates}={}){
 if(!Number.isFinite(paper.width)||!Number.isFinite(paper.height)||paper.width<=0||paper.height<=0)throw Error('纸张尺寸无效');
 const pending=templates.filter(templateEnabled).map(t=>scoreTemplate(t,materials,paper,{styles,content})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)),chosen=[];
 while(pending.length&&chosen.length<Math.min(12,Math.max(1,limit))){
  let best=0,bestScore=-Infinity;
  for(let i=0;i<pending.length;i++){const s=pending[i].score-chosen.filter(t=>t.family===pending[i].family).length*3;if(s>bestScore){bestScore=s;best=i;}}
  chosen.push(pending.splice(best,1)[0]);
 }return chosen;
}
export function templateMarginalScores({selected=[],candidates=[],paper={width:148,height:210},styles=[],content=[],templates=catalog.templates}={}){
 templates=templates.filter(templateEnabled);
 const base=templates.map(t=>scoreTemplate(t,selected,paper,{styles,content}));
 const bestBefore=Math.max(0,...base.map(b=>b.score));
 return new Map(candidates.map(asset=>{
  let best=null;
  for(let i=0;i<templates.length;i++){
   const after=scoreTemplate(templates[i],[...selected,asset],paper,{styles,content}),alias=asset.alias||asset.id;
   if(!after.assignments.some(a=>a.alias===alias))continue;
   // A poor starting fit cannot win merely by improving from zero.
   const gain=after.score-base[i].score,utility=Math.max(0,gain)*after.score/100;
   if(!best||utility>best.utility)best={templateId:after.id,title:after.title,gain,utility,before:base[i].score,after:after.score,bestBefore,slotId:after.assignments.find(a=>a.alias===alias).slotId};
  }
  return [asset.alias||asset.id,best||{gain:0,utility:0,bestBefore}];
 }));
}
