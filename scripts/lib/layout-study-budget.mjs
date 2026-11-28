// Research-only limits; these do not change the production creation workflow.
export function createLayoutStudyBudget({maxRequests=3,deadlineMs=90000,maxPreviews=1,now=Date.now}={}){
  if(!Number.isInteger(maxPreviews)||maxPreviews<1||maxPreviews>5)throw Error('无效的阶段预览预算');
  if(!Number.isInteger(maxRequests)||maxRequests<1||!Number.isFinite(deadlineMs)||deadlineMs<=0)throw Error('无效的阶段研究预算');
  const startedAt=now();let requests=0,preview=null;const previews=[];
  const stop=reason=>{throw Object.assign(Error('阶段研究已停止：'+reason),{code:'LAYOUT_STUDY_STOP',reason});};
  const check=()=>{if(previews.length>=maxPreviews)stop(maxPreviews===1?'first-preview':'preview-limit');if(now()-startedAt>=deadlineMs)stop('deadline');};
  return {
    deadlineMs,maxRequests,maxPreviews,
    beforeModel(){check();if(requests>=maxRequests)stop('request-limit');},
    // Count HTTP attempts, including retries inside the provider adapter.
    async fetch(fetcher,url,options){check();if(requests>=maxRequests)stop('request-limit');requests++;return fetcher(url,options);},
    capture(value){if(!previews.some(p=>p.sceneRevision&&p.sceneRevision===value.sceneRevision)){preview=value;previews.push(value);}},
    snapshot(){return {maxRequests,requests,deadlineMs,elapsedMs:now()-startedAt,preview,previews:[...previews],maxPreviews};},
  };
}
