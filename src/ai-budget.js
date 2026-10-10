export function creativeRequestLimit(value){
 const number=Number(value);
 return Number.isFinite(number)&&number!==0?Math.round(Math.min(30,Math.max(1,number))):5;
}

export function createCreativeBudget(value,{reservedVisualRequests=0}={}){
 const limit=creativeRequestLimit(value);
 // Never reserve so much budget that fewer than two creation calls remain.
 const reserve=Math.max(0,Math.min(4,Math.floor(Number(reservedVisualRequests)||0),limit-2));
 const counts={limit,totalRequests:0,planningRequests:0,creationRequests:0,
   formatRepairRequests:0,visualReviewRequests:0,reservedVisualRequests:reserve,stopReason:null};
 return {
  begin(phase='creation'){
   const budgetExhausted=counts.totalRequests>=limit;
   const reserved=phase!=='visual-review'&&counts.totalRequests>=limit-reserve;
   if(budgetExhausted||reserved){
    counts.stopReason='request-limit';
    const error=Error('已达到 '+limit+' 轮预算'+(reserved?'（预留最后的视觉复核请求）':'')+'，此前成功的步骤仍已保存');
    error.code='request-limit';throw error;
   }
   counts.totalRequests++;
   const field=phase==='planning'?'planningRequests':phase==='format-repair'?'formatRepairRequests':
     phase==='visual-review'?'visualReviewRequests':'creationRequests';
   counts[field]++;
   return {...counts};
  },
  stop(reason){counts.stopReason=reason;return {...counts};},
  snapshot(){return {...counts};}
 };
}
