import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {requiresManualPaperConfirmation} from '../src/import-paper-review.js';

const corners=[{x:.03,y:.03},{x:.97,y:.03},{x:.97,y:.97},{x:.03,y:.97}];

test('initial missing A4 requires review even if UI draws default corner handles',()=>{
  assert.equal(requiresManualPaperConfirmation({paperSize:'a4'}),true);
  assert.equal(requiresManualPaperConfirmation({paperSize:'a4',corners,reviewFlag:true}),true);
});

test('switching between photos cannot promote a stored fallback rectangle to detection',()=>{
  const original={paperSize:'a4',corners,reviewFlag:true,correctedBitmap:null,appliedCorners:null};
  const resumed={...structuredClone(original)};
  assert.equal(requiresManualPaperConfirmation(original),true);
  assert.equal(requiresManualPaperConfirmation(resumed),true);
});

test('recognized paper, explicit confirmation, and paperless modes remain allowed',()=>{
  assert.equal(requiresManualPaperConfirmation({paperSize:'a4',corners}),false);
  assert.equal(requiresManualPaperConfirmation({paperSize:'a4',corners,reviewFlag:true,appliedCorners:'accepted'}),false);
  assert.equal(requiresManualPaperConfirmation({paperSize:'a4',corners,reviewFlag:true,correctedBitmap:{width:800,height:1200}}),false);
  assert.equal(requiresManualPaperConfirmation({paperSize:'none',reviewFlag:true}),false);
});

test('both active import and background prefetch consult the same review guard',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  const count=(app.match(/requiresManualPaperConfirmation\(/g)||[]).length;
  assert.equal(count,2,'both prefetch and active A4 paths must use the same guard');
  assert.match(app,/state\.paperSize!=='none'&&!rec\.paperNeedsReview/);
  assert.match(app,/rec\.paperNeedsReview=false;rec\.manualEdits=false/);
});

test('rotating a photo invalidates applied corners without clearing pending review',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/const old=state\.paperCorners,needsReview=!!rec\.paperNeedsReview;resetPaperCorrection\(state\);rec\.appliedCorners=null/);
  assert.match(app,/rec\.paperNeedsReview=needsReview/);
});
