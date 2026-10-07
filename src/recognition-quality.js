// Fast-pass quality gates shared by material recognition.
//
// The fast recognizer is an optimization, not the authority on instance count.
// A candidate can look locally plausible while still being an internal printed
// detail, an enclosure around neighbouring items, or one of several missed
// objects. These helpers decide when the fast scene is trustworthy enough to
// skip the slower instance/structural reconciliation pass.

const area=r=>Math.max(0,r?.w||0)*Math.max(0,r?.h||0);

export function isRecoveredCarrierCandidate(candidate){
  return candidate?.physicalCarrierRecovered===true
    ||candidate?.edgeMethod==='fast-outside-in-carrier'
    ||candidate?.edgeMethod==='fast-white-carrier';
}

function maskContainsGlobal(candidate,x,y,width,height){
  const mask=candidate?.mask;
  if(!mask?.alpha?.length||!mask.width||!mask.height)return false;
  const left=candidate.x*width,top=candidate.y*height,w=candidate.w*width,h=candidate.h*height;
  if(w<=0||h<=0||x<left||y<top||x>=left+w||y>=top+h)return false;
  const lx=Math.max(0,Math.min(mask.width-1,Math.floor((x-left)/w*mask.width)));
  const ly=Math.max(0,Math.min(mask.height-1,Math.floor((y-top)/h*mask.height)));
  return mask.alpha[ly*mask.width+lx]>127;
}

export function fastEvidenceCoverage(candidates,foregroundSeeds,width,height){
  if(!foregroundSeeds?.length||!width||!height)return {coverage:1,total:0,covered:0};
  let total=0,covered=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;if(!foregroundSeeds[i])continue;total++;
    if(candidates.some(candidate=>maskContainsGlobal(candidate,x,y,width,height)))covered++;
  }
  return {coverage:total?covered/total:1,total,covered};
}

export function assessFastRecognition(candidates,{foregroundSeeds,width,height}={}){
  const reasons=[];
  if(!candidates?.length)return {reliable:false,reasons:['empty'],coverage:0,strongSeedCount:0};
  if(candidates.length>12)reasons.push('too-many-candidates');

  for(const candidate of candidates){
    const confidence=candidate.recognitionConfidence??0;
    const paperContact=candidate.paperContactRatio??0;
    const backgroundLeak=candidate.interiorBackgroundRatio??1;
    const fill=candidate.fillRatio??0;
    const recovered=isRecoveredCarrierCandidate(candidate);
    if(confidence<.60)reasons.push('low-confidence');
    if(backgroundLeak>.16)reasons.push('page-background-inside');
    if(candidate.proposalSource==='edge'&&!recovered&&paperContact<.52)reasons.push('weak-paper-contact');
    if(candidate.proposalSource==='edge'&&!recovered&&fill<.60)reasons.push('loose-edge-enclosure');
  }

  const seed=fastEvidenceCoverage(candidates,foregroundSeeds,width,height);
  if(seed.total>=24&&seed.coverage<.90)reasons.push('uncovered-foreground-seeds');
  return {reliable:reasons.length===0,reasons:[...new Set(reasons)],coverage:seed.coverage,strongSeedCount:seed.total};
}

export function fastCandidateForFusion(candidate){
  if(!candidate||area(candidate)<1e-5)return false;
  const confidence=candidate.recognitionConfidence??0;
  const backgroundLeak=candidate.interiorBackgroundRatio??1;
  if(isRecoveredCarrierCandidate(candidate)){
    return confidence>=.48
      &&(candidate.carrierEdgeSupport??0)>=.20
      &&(candidate.carrierSeedCoverage??0)>=.80
      &&(candidate.carrierAreaRatio??0)>=1.02
      &&(candidate.carrierAreaRatio??99)<=5.2
      &&backgroundLeak<=.20;
  }
  return confidence>=.58
    &&(candidate.paperContactRatio??0)>=.70
    &&backgroundLeak<=.15
    &&(candidate.fillRatio??0)>=.45;
}


const intersection=(a,b)=>{
  const l=Math.max(a.x,b.x),t=Math.max(a.y,b.y),r=Math.min(a.x+a.w,b.x+b.w),d=Math.min(a.y+a.h,b.y+b.h);
  return Math.max(0,r-l)*Math.max(0,d-t);
};
const overlapOf=(a,b)=>intersection(a,b)/Math.max(1e-9,area(a));
const containsCenter=(outer,inner)=>{
  const x=inner.x+inner.w/2,y=inner.y+inner.h/2;
  return x>=outer.x&&x<=outer.x+outer.w&&y>=outer.y&&y<=outer.y+outer.h;
};

export function fastIdentityAnchor(candidate){
  if(!candidate||area(candidate)<.0015)return false;
  if(isRecoveredCarrierCandidate(candidate))return fastCandidateForFusion(candidate);
  const confidence=candidate.recognitionConfidence??0,fill=candidate.fillRatio??0;
  if(candidate.proposalSource==='region'){
    return confidence>=.60
      &&(candidate.interiorBackgroundRatio??1)<=.10
      &&(candidate.insideEvidenceRatio??0)>=.20
      &&fill>=.30;
  }
  // Pale/white physical items can legitimately contain lots of page-like
  // pixels. A compact edge carrier with very strong direct paper contact is
  // useful as an identity anchor even when it is not yet safe as final alpha.
  return candidate.proposalSource==='edge'
    &&confidence>=.60
    &&(candidate.paperContactRatio??0)>=.88
    &&fill>=.50
    &&area(candidate)<=.20;
}

export function reconcileInstancesWithFastAnchors(instances,fastCandidates){
  const anchors=fastCandidates.filter(fastIdentityAnchor).sort((a,b)=>area(b)-area(a)),unique=[];
  for(const anchor of anchors){
    if(unique.some(other=>overlapOf(anchor,other)>.78&&overlapOf(other,anchor)>.60))continue;
    unique.push(anchor);
  }
  const base=[],used=new Set();
  for(const instance of instances){
    const matches=unique.map((anchor,index)=>({anchor,index}))
      .filter(({anchor})=>containsCenter(instance,anchor)||overlapOf(anchor,instance)>.35);
    if(matches.length>=2){
      // Watershed has merged independently observed physical seeds. Replace
      // the merged instance by the anchors so later enclosure fusion cannot
      // erase the fact that multiple items exist.
      for(const {anchor,index} of matches){if(!used.has(index)){base.push(anchor);used.add(index);}}
      continue;
    }
    base.push(instance);
    if(matches.length===1)used.add(matches[0].index);
  }
  for(let i=0;i<unique.length;i++)if(!used.has(i))base.push(unique[i]);
  return {instances:base,anchors:unique};
}
