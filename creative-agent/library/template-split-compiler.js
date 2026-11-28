/** Keep an optional joint source allocation out of the family compiler until
 * its two generated paper objects can be replaced atomically. */
export function withoutSplitAssignments(plan){
 const splitSlots=new Set((plan?.splitGroups||[]).flatMap(group=>group.slots));
 return {...plan,splitGroups:[],assignments:plan.assignments.map(choice=>splitSlots.has(choice.slot)?
  {slot:choice.slot,asset:null,method:'generated'}:choice)};
}

export function applyTemplateSplitPlan(result,plan){
 if(!plan?.splitGroups?.length)return result;
 const original=result.operations,byId=new Map(original.map((op,index)=>[op.id,{op,index}]));
 const groupAt=new Map(),skip=new Set(),reorder=[];
 for(const group of plan.splitGroups){
  const sorted=group.parts.map(part=>({...part,original:byId.get(part.slot)}));
  if(sorted.some(part=>part.original?.op.op!=='paper.add'))throw new Error(`模板 ${plan.templateId} 的裁片槽位缺少可替换纸张`);
  sorted.sort((a,b)=>a.original.index-b.original.index);
  const pieces=sorted.map(part=>({id:part.slot,region:{shape:'rect',space:'source',unit:'ratio',box:part.sourceRegion},
   place:{...part.original.op.place,at:part.at||part.centerMm||part.original.op.place.at}}));
  groupAt.set(sorted[0].original.index,{op:'material.split',asset:group.asset,pieces,keepRemainder:true});
  for(const part of sorted)skip.add(part.original.index);
  for(const part of sorted.slice(1)){
   const earlier=original.slice(0,part.original.index).reverse().find(op=>op.id&&op.id!==part.slot&&op.op!=='page.update');
   if(earlier)reorder.push({op:'layer.stack',target:part.slot,reference:earlier.id,side:'after'});
  }
 }
 const operations=[];let inserted=false;
 for(let i=0;i<original.length;i++){
  if(!inserted&&original[i].op==='layer.stack'){operations.push(...reorder);inserted=true;}
  if(groupAt.has(i))operations.push(groupAt.get(i));
  if(!skip.has(i))operations.push(original[i]);
 }
 if(!inserted)operations.push(...reorder);
 return {...result,operations,matching:plan};
}
