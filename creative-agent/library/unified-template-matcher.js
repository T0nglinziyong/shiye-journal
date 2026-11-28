// One allocation engine for every measured template family. Family adapters
// only describe slots and test whether a physical piece fits one slot.
export const MATCHING_VERSION='unified-v1';
const sourceId=asset=>asset.alias||asset.id;
const round=value=>Math.round(value*1000)/1000;
const clamp=value=>Math.max(0,Math.min(1,value));
const luminance=color=>{
 if(!/^#[\da-f]{6}$/i.test(color||''))return null;
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
};
const overlap=(a,b)=>{
 if(!a?.box||!b?.box||a.page!==b.page)return 0;
 const [x,y,w,h]=a.box,[u,v,p,q]=b.box;
 const area=Math.max(0,Math.min(x+w,u+p)-Math.max(x,u))*Math.max(0,Math.min(y+h,v+q)-Math.max(y,v));
 return area/Math.max(.00001,Math.min(w*h,p*q));
};
const isPaper=slot=>slot.splitKind==='paper';
const qualityFor=(slot,asset,score,normalize)=>{
 let quality=normalize(score);
 if(isPaper(slot)){
  const actual=luminance(asset?.mainColor),expected=luminance(slot.preferredColor);
  if(actual!==null&&expected!==null)quality-=.32*Math.abs(actual-expected);
 }
 return Math.max(0,quality);
};
const sourceCanSplit=asset=>asset.kind==='paper'&&['repeatable','splittable'].includes(asset.preservation)&&
  asset.visualRoles?.some(role=>role==='plain-paper'||role==='pattern-paper'||role==='writing-card');

function sourceRegions(asset,a,b){
 const W=Number(asset.physicalWidthMM),H=Number(asset.physicalHeightMM);
 const [aw,ah]=a.sizeMm,[bw,bh]=b.sizeMm,regions=[];
 // Each rectangle has its exact target physical dimensions. Area alone is
 // insufficient: the two rectangles must actually pack inside the source.
 if(aw+bw<=W+.001&&Math.max(ah,bh)<=H+.001)regions.push([
  [0,0,aw/W,ah/H],[aw/W,0,bw/W,bh/H]]);
 if(ah+bh<=H+.001&&Math.max(aw,bw)<=W+.001)regions.push([
  [0,0,aw/W,ah/H],[0,ah/H,bw/W,bh/H]]);
 return regions;
}
function relationIncrement(slot,choice,previous,slotsById,assetsById){
 const color=choice.asset?assetsById.get(choice.asset)?.mainColor:slot.preferredColor,light=luminance(color);
 if(light===null)return 0;
 let score=0;
 for(const [otherId,otherChoice] of previous){
  const otherSlot=slotsById.get(otherId);
  if(!isPaper(slot)||!isPaper(otherSlot))continue;
  const o=overlap(slot,otherSlot);if(o<.18)continue;
  const otherLight=luminance(otherChoice.asset?assetsById.get(otherChoice.asset)?.mainColor:otherSlot.preferredColor);
  if(otherLight===null)continue;
  const separation=Math.abs(light-otherLight);
  score+=o*(separation<.1?-.22:.025);
 }
 return score;
}

/** Choose one option per slot, including optional two-slot physical splits.
 * Required-for-final materials are preferred here; final delivery validates
 * their actual presence after the user has had a chance to edit the draft. */
export function solveTemplateAssignments({templateId,slots,assets,scoreCandidate,defaultScore=.3,
 normalizeScore=value=>clamp(value),defaultQuality=.35,bindings={},mustUse=[],beamWidth=64,enableSplits=true}={}){
 if(!templateId||!Array.isArray(slots)||!Array.isArray(assets)||typeof scoreCandidate!=='function')throw new TypeError('匹配输入不完整');
 const ids=new Set(),assetsById=new Map();
 for(const asset of assets){const id=sourceId(asset);if(!id||assetsById.has(id))throw new RangeError(`素材 ID 重复或缺失：${id}`);assetsById.set(id,asset);}
 const slotsById=new Map(slots.map(slot=>[slot.id,slot]));
 for(const slot of slots){if(!slot.id||ids.has(slot.id))throw new RangeError(`槽位 ID 重复或缺失：${slot.id}`);ids.add(slot.id);}
 const choices=new Map(slots.map(slot=>[slot.id,[]]));
 for(const slot of slots){
  const wanted=bindings[slot.id];
  for(const asset of assets){
   if(wanted&&sourceId(asset)!==wanted)continue;
   const result=scoreCandidate(asset,slot);if(!result)continue;
   choices.get(slot.id).push({...result,slot:slot.id,asset:sourceId(asset),
    quality:qualityFor(slot,asset,result.score,normalizeScore),method:result.method||'complete'});
  }
  choices.get(slot.id).sort((a,b)=>b.quality-a.quality||a.asset.localeCompare(b.asset));
  choices.set(slot.id,choices.get(slot.id).slice(0,8));
 }
 const compounds=new Map(slots.map(slot=>[slot.id,[]]));
 if(enableSplits)for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++){
  const a=slots[i],b=slots[j];if(!isPaper(a)||!isPaper(b)||!a.sizeMm||!b.sizeMm||overlap(a,b)>.18)continue;
  const aLight=luminance(a.preferredColor),bLight=luminance(b.preferredColor);
  if(aLight!==null&&bLight!==null&&Math.abs(aLight-bLight)>.22)continue;
  for(const asset of assets){
   const id=sourceId(asset);if(!sourceCanSplit(asset)||bindings[a.id]&&bindings[a.id]!==id||bindings[b.id]&&bindings[b.id]!==id)continue;
   for(const [regionA,regionB] of sourceRegions(asset,a,b)){
    const pieceA={...asset,physicalWidthMM:a.sizeMm[0],physicalHeightMM:a.sizeMm[1],preservation:'whole'};
    const pieceB={...asset,physicalWidthMM:b.sizeMm[0],physicalHeightMM:b.sizeMm[1],preservation:'whole'};
    const fitA=scoreCandidate(pieceA,a),fitB=scoreCandidate(pieceB,b);
    if(!fitA||!fitB)continue;
    const partA={...fitA,slot:a.id,asset:id,method:'split',sourceRegion:regionA,quality:qualityFor(a,asset,fitA.score,normalizeScore)};
    const partB={...fitB,slot:b.id,asset:id,method:'split',sourceRegion:regionB,quality:qualityFor(b,asset,fitB.score,normalizeScore)};
    // No reward simply for using the same source. Splitting has a modest
    // complexity cost and competes with independent materials and defaults.
    const compound={asset:id,slots:[a.id,b.id],parts:[partA,partB],cost:.08};
    compounds.get(a.id).push(compound);compounds.get(b.id).push(compound);
   }
  }
 }
 for(const options of compounds.values())options.sort((a,b)=>
  b.parts.reduce((n,p)=>n+p.quality,0)-a.parts.reduce((n,p)=>n+p.quality,0));
 const searchSlots=[...slots].sort((a,b)=>{
  const ac=choices.get(a.id).length+compounds.get(a.id).length,bc=choices.get(b.id).length+compounds.get(b.id).length;
  return ac-bc||b.weight-a.weight||a.id.localeCompare(b.id);
 });
 const required=new Set(mustUse);
 let beam=[{value:0,used:new Set(),selected:new Map(),splitGroups:[]}];
 let pruned=false;
 for(let step=0;step<searchSlots.length;step++){
  const slot=searchSlots[step];
  const next=[];
  for(const state of beam){
   if(state.selected.has(slot.id)){next.push(state);continue;}
   const requested=bindings[slot.id];
   const fallback={slot:slot.id,asset:null,method:'generated',score:defaultScore,
    quality:defaultQuality,reason:requested?'指定素材无法安全放入槽位':'使用模板默认对象'};
   for(const choice of [fallback,...choices.get(slot.id)]){
    if(choice.asset&&state.used.has(choice.asset))continue;
    const selected=new Map(state.selected);selected.set(slot.id,choice);
    const used=new Set(state.used);if(choice.asset)used.add(choice.asset);
    const relation=relationIncrement(slot,choice,state.selected,slotsById,assetsById);
    next.push({value:state.value+slot.weight*choice.quality+relation+
     (choice.asset ? (required.has(choice.asset) ? 0.18 : 0.025) : 0),used,selected,splitGroups:state.splitGroups});
   }
   for(const group of compounds.get(slot.id).slice(0,12)){
    if(state.used.has(group.asset)||group.slots.some(id=>state.selected.has(id)))continue;
    const selected=new Map(state.selected),used=new Set(state.used);used.add(group.asset);
    let relation=0,quality=0;
    for(const part of group.parts){const partSlot=slotsById.get(part.slot);relation+=relationIncrement(partSlot,part,state.selected,slotsById,assetsById);quality+=partSlot.weight*part.quality;selected.set(part.slot,part);}
    next.push({value:state.value+quality+relation-group.cost+
     (required.has(group.asset) ? 0.18 : 0.025),used,selected,splitGroups:[...state.splitGroups,group]});
   }
  }
  const future=searchSlots.slice(step+1);
  const bound=state=>state.value+future.reduce((sum,later)=>state.selected.has(later.id)?sum:
   sum+later.weight*Math.max(defaultQuality,choices.get(later.id)[0]?.quality||0),0);
  next.sort((a,b)=>bound(b)-bound(a)||b.value-a.value||b.used.size-a.used.size);
  if(next.length>beamWidth)pruned=true;
  beam=next.slice(0,beamWidth);
 }
 beam.sort((a,b)=>b.value-a.value||b.used.size-a.used.size);
 const best=beam[0],denominator=slots.reduce((n,s)=>n+s.weight,0)||1;
 const assignments=slots.map(slot=>best.selected.get(slot.id));
 return {templateId,matchingVersion:MATCHING_VERSION,assignments,used:[...best.used],
  unused:assets.map(sourceId).filter(id=>!best.used.has(id)),splitGroups:best.splitGroups,
  score:round(clamp(best.value/denominator)),mustUseSatisfied:[...required].every(id=>best.used.has(id)),
  missingRequired:[...required].filter(id=>!best.used.has(id)),approximate:pruned};
}
