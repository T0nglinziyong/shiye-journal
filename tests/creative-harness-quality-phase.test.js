import test from 'node:test';
import assert from 'node:assert/strict';
import {toolsForCreativePhase,phaseObservation} from '../compute-server/harness/phases.mjs';
import {evaluateCreativeFrame,attachCreativeReview,summarizeCreativeEvaluation} from '../compute-server/harness/quality-evaluation.mjs';
import {harnessTools} from '../compute-server/harness/agent.mjs';

const names=phase=>toolsForCreativePhase(harnessTools,phase).map(tool=>tool.function.name);

test('direction reserves editing until planning; later modes can revise or finish',()=>{
  assert.ok(!names('direction').includes('creation_apply'));
  assert.ok(names('layout').includes('explore_drafts'));
  assert.ok(names('layout').includes('read_template'));
  assert.ok(names('craft').includes('segment_material'));
  assert.ok(names('craft').includes('creation_finish'));
  assert.ok(names('review').includes('creation_apply'));
  assert.ok(names('review').includes('creation_finish'));
});

test('layout and review keep the full scene available for revision',()=>{
  const input={capture:{pngHash:'hash'},spaceStatus:{spaces:[],current:{},changed:[]},scene:{sceneRevision:'revision',layers:[{surface:'page',id:'visible'},{surface:'tray',id:'parked'}]},feedback:{required:[]},advisory:{observations:['check'],typography:{},pages:[],materialFrames:[{large:true}]},previousReview:null,remainingSeconds:10};
  const layout=phaseObservation('layout',input),review=phaseObservation('review',input);
  assert.equal(layout.scene.layers.length,2);
  assert.deepEqual(review.scene.layers.map(layer=>layer.id),['visible','parked']);
  assert.equal(review.advisory.materialFrames.length,1);
  assert.equal(review.remainingSeconds,10);
});

test('each render has reproducible metrics, pixel comparison and reviews tied to its exact version',()=>{
  const hash=n=>'sha256:'+String(n).repeat(64);
  const advisory={layers:{material:1,text:1},pages:[{page:'page',estimatedFrameCoverage:.2}],observations:['check']};
  const feedback={required:[{present:true},{present:false}],finalValidation:{ok:false,issue:'missing'}};
  const frame=(n,sample,previous)=>evaluateCreativeFrame({preview:{pngHash:hash(n),sceneRevision:hash(n),artifact:'preview-'+n+'.png',visualSample:Buffer.from(sample).toString('base64')},feedback,advisory,previous,turn:n,phase:'layout'});
  const first=frame(1,[0,0,0]),second=frame(2,[255,0,0],first);
  assert.equal(second.pixelChange,.3333);
  assert.equal(first.metrics.requiredPresent,1);
  assert.throws(()=>attachCreativeReview([first],{pngHash:hash(2),sceneRevision:hash(2)}),/不在本次评测时间线/);
  const reviewed=attachCreativeReview([first,second],{pngHash:hash(2),sceneRevision:hash(2),approved:true,observations:'画面清楚',issues:[],turn:2});
  const result=summarizeCreativeEvaluation(reviewed,{humanReviews:[{pngHash:hash(2),rating:4,note:'人工复核'}]});
  assert.equal(result.comparison.revisions,2);
  assert.equal(result.comparison.humanReviewed,1);
  assert.equal(result.frames[1].modelReview.approved,true);
  assert.equal(result.frames[1].humanReview.rating,4);
  assert.equal(result.frames[1].visualSample,undefined);
  assert.throws(()=>summarizeCreativeEvaluation(reviewed,{humanReviews:[{pngHash:hash(3),rating:5,note:'并未查看'}]}),/已有画面/);
});
