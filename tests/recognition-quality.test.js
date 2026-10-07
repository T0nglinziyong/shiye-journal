import test from 'node:test';
import assert from 'node:assert/strict';
import {assessFastRecognition,fastCandidateForFusion,fastEvidenceCoverage} from '../src/recognition-quality.js';

const candidate=(x,y,w,h,extra={})=>({
  x,y,w,h,pixels:100,proposalSource:'region',recognitionConfidence:.76,
  paperContactRatio:.92,interiorBackgroundRatio:.02,insideEvidenceRatio:.32,
  fillRatio:.86,rectFill:.90,
  mask:{width:20,height:20,alpha:new Uint8Array(400).fill(255),polygons:[]},
  ...extra
});
const seeds=(width,height,points)=>{
  const out=new Uint8Array(width*height);
  for(const [x,y] of points)out[y*width+x]=1;
  return out;
};

test('fast scene is accepted only when strong foreground seeds are covered',()=>{
  const width=100,height=100,item=candidate(.10,.10,.60,.60);
  const points=[];for(let y=20;y<50;y+=5)for(let x=20;x<50;x+=5)points.push([x,y]);
  const foregroundSeeds=seeds(width,height,points);
  const coverage=fastEvidenceCoverage([item],foregroundSeeds,width,height);
  assert.equal(coverage.total,36);assert.equal(coverage.coverage,1);
  assert.equal(assessFastRecognition([item],{foregroundSeeds,width,height}).reliable,true);
});

test('missing material evidence forces instance-level reconciliation even when remaining fast candidates look confident',()=>{
  const width=100,height=100,item=candidate(.08,.08,.34,.34),points=[];
  for(let y=15;y<35;y+=4)for(let x=15;x<35;x+=4)points.push([x,y]);
  for(let y=62;y<82;y+=4)for(let x=62;x<82;x+=4)points.push([x,y]);
  const assessment=assessFastRecognition([item],{foregroundSeeds:seeds(width,height,points),width,height});
  assert.equal(assessment.reliable,false);
  assert.ok(assessment.reasons.includes('uncovered-foreground-seeds'));
  assert.ok(assessment.coverage<.90);
});

test('loose edge enclosure with page leakage cannot end the recognition pipeline early',()=>{
  const bad=candidate(.08,.08,.72,.42,{
    proposalSource:'edge',paperContactRatio:.88,interiorBackgroundRatio:.23,
    fillRatio:.51,rectFill:.53,recognitionConfidence:.78
  });
  const assessment=assessFastRecognition([bad]);
  assert.equal(assessment.reliable,false);
  assert.ok(assessment.reasons.includes('page-background-inside'));
  assert.ok(assessment.reasons.includes('loose-edge-enclosure'));
});

test('validated recovered white carrier remains eligible for slow-path fusion despite irregular fill',()=>{
  const recovered=candidate(.58,.68,.22,.25,{
    proposalSource:'edge',edgeMethod:'fast-outside-in-carrier',
    physicalCarrierRecovered:true,paperContactRatio:.18,interiorBackgroundRatio:.03,
    fillRatio:.44,rectFill:.46,carrierEdgeSupport:.32,carrierSeedCoverage:.96,
    carrierAreaRatio:1.72,recognitionConfidence:.62
  });
  assert.equal(fastCandidateForFusion(recovered),true);
  const internal=candidate(.20,.20,.08,.08,{
    proposalSource:'edge',paperContactRatio:.02,interiorBackgroundRatio:0,
    fillRatio:.94,recognitionConfidence:.70
  });
  assert.equal(fastCandidateForFusion(internal),false);
});
