const count=rows=>rows.filter(Boolean).length;

export function evaluateCreativeFrame({preview,document,scene,feedback,advisory,previous=null,turn,phase}){
  const sample=preview.visualSample||null;
  let pixelChange=null;
  if(sample&&previous?.visualSample){
    const a=Buffer.from(sample,'base64'),b=Buffer.from(previous.visualSample,'base64');
    if(a.length===b.length&&a.length){let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);pixelChange=Number((sum/(a.length*255)).toFixed(4));}
  }
  const used=new Set((scene?.layers||[]).filter(layer=>layer.surface==='page'&&layer.asset&&!layer.hidden).map(layer=>layer.asset));
  const required=new Set(feedback.required.map(item=>item.alias));
  return {turn,phase,sceneRevision:preview.sceneRevision,pngHash:preview.pngHash,artifact:preview.artifact||null,visualSample:sample,
    comparedTo:previous?.pngHash||null,pixelChange,
    metrics:{layers:advisory.layers,frameCoverage:advisory.pages.map(page=>({page:page.page,value:page.estimatedFrameCoverage})),requiredPresent:count(feedback.required.map(item=>item.present)),requiredTotal:feedback.required.length,optionalUsed:[...used].filter(alias=>!required.has(alias)).length,optionalTotal:Math.max(0,(document?.source?.materials?.length||0)-required.size),finalValidation:feedback.finalValidation,advisoryCount:advisory.observations.length},
    modelReview:null,humanReview:null};
}

export function attachCreativeReview(frames,review){
  const index=frames.findLastIndex(frame=>frame.pngHash===review.pngHash&&frame.sceneRevision===review.sceneRevision);
  if(index<0)throw Error('审查画面不在本次评测时间线中');
  return frames.map((frame,i)=>i===index?{...frame,modelReview:{approved:review.approved,observations:review.observations,issues:review.issues,nextStep:review.nextStep||null,turn:review.turn}}:frame);
}

export function summarizeCreativeEvaluation(frames,{humanReviews=[]}={}){
  const hashes=new Set(frames.map(frame=>frame.pngHash));
  for(const row of humanReviews){
    if(!hashes.has(row.pngHash)||!Number.isInteger(row.rating)||row.rating<1||row.rating>5||typeof row.note!=='string'||!row.note.trim())throw Error('人工审阅必须绑定已有画面，并给出 1–5 分和具体说明');
  }
  const reviews=new Map(humanReviews.map(row=>[row.pngHash,row]));
  const timeline=frames.map(({visualSample,...frame})=>({...frame,humanReview:reviews.get(frame.pngHash)||frame.humanReview}));
  const first=timeline[0],last=timeline.at(-1);
  return {frames:timeline,comparison:first&&last?{initial:first.pngHash,final:last.pngHash,initialMetrics:first.metrics,finalMetrics:last.metrics,revisions:timeline.length,pixelChanges:timeline.slice(1).map(frame=>({from:frame.comparedTo,to:frame.pngHash,value:frame.pixelChange})),humanReviewed:timeline.filter(frame=>frame.humanReview).length}:null};
}
