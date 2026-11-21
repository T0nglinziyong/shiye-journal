import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingCreationProject} from '../src/matching-project.js';
import {createCreationDocument} from '../src/creation-document.js';

const state={assets:[],matchMode:'single',matchRatio:'b6',matchStyle:'随材而定',matchStyles:['随材而定'],matchPurposes:['自由创作'],matchPurpose:'自由创作',matchIntent:'写一页手帐',matchContentPolicy:'original',matchCreationMode:'edit'};
const scope={candidateAssetIDs:[],required:[],preferred:[],available:[]};

test('AI creation submits a real single page when matching selects single',async()=>{
  const p=matchingCreationProject(state,scope,[]);
  const d=p.drafts[0];
  assert.equal(d.pageMode,'single');
  assert.equal(d.matchingTwoPageWorkspace,undefined);
  assert.equal(d.inactivePageDimmed,undefined);
  assert.ok(d.canvas.width<d.canvas.height);
  const document=await createCreationDocument({draft:d,assets:[],aliases:{},title:p.title,prompt:p.intent,pagePurposes:p.purposes,styles:p.styles,materialPriority:p.materialPriority});
  assert.equal(document.page.pageMode,'single');
  assert.equal(document.source.mode,'single');
  assert.equal(document.source.baseDraft.pageMode,'single');
});

test('AI spread and manual two-sheet workspace retain their own modes',()=>{
  const spread=matchingCreationProject({...state,matchMode:'spread'},scope,[]).drafts[0];
  assert.equal(spread.pageMode,'spread');
  assert.ok(spread.canvas.width>spread.canvas.height);
  const manual=matchingCreationProject(state,scope,[],false).drafts[0];
  assert.equal(manual.pageMode,'spread');
  assert.equal(manual.matchingTwoPageWorkspace,true);
  assert.equal(manual.inactivePageDimmed,true);
});
