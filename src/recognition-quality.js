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
