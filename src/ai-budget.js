export function creativeRequestLimit(value){
 const number=Number(value);
 return Number.isFinite(number)&&number!==0?Math.round(Math.min(20,Math.max(1,number))):5;
}

export function createCreativeBudget(value){
 const limit=creativeRequestLimit(value);
 const counts={limit,totalRequests:0,creationRequests:0,formatRepairRequests:0,visualReviewRequests:0,stopReason:null};
 return {
  begin(phase='creation'){
   if(counts.totalRequests>=limit){counts.stopReason='request-limit';const error=Error('已达到 '+limit+' 轮上限，前面成功的步骤仍已保存');error.code='request-limit';throw error;}
   counts.totalRequests++;
   const field=phase==='format-repair'?'formatRepairRequests':phase==='visual-review'?'visualReviewRequests':'creationRequests';
   counts[field]++;
   return {...counts};
  },
  stop(reason){counts.stopReason=reason;return {...counts};},
  snapshot(){return {...counts};}
 };
}
