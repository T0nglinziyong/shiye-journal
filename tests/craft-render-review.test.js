import test from 'node:test';
import assert from 'node:assert/strict';
import opentype from 'opentype.js';
import {glyphCutGeometry} from '../src/craft-glyphs.js';
import {geometryArea,rectangleGeometry} from '../src/craft-topology.js';
import {project} from '../src/domain.js';
import {applyToolCalls} from '../src/creative.js';
import {assetSourceRevision} from '../src/material-anatomy.js';
import {craftSceneHash} from '../src/craft-fingerprint.js';
import {stabilizeImportedCraftScene} from '../src/craft-import-identity.js';
import {createCreativeBudget} from '../src/ai-budget.js';
import {reviewFinalCreativeScene} from '../src/creative-visual-review.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {parseCompositeMask} from '../src/material-processing-editor.js';
const material={id:'paper',kind:'paper',title:'合成纸',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}};
const whole=d=>({format:'shiye-craft-plan',version:2,commandId:'original',baseSceneHash:craftSceneHash(d),pieces:[{id:'piece',asset:'m1',sourceRevision:assetSourceRevision(material),extraction:{type:'whole'},centerMM:[60,70]}]});
const execute=(p,d)=>applyToolCalls(p,d,[material],{m1:material.id},{processing:'自由拆解',allowNoText:true});
const finished=()=>{const d=project().drafts[0];return execute(whole(d),d).draft;};
const response=content=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]}),{headers:{'Content-Type':'application/json'}});

test('same exported recipe compiles to stable scene identities on repeated independent imports',()=>{
 const base=project().drafts[0],p=whole(base),a=execute(p,base).draft,b=execute(p,base).draft;
 assert.notEqual(a.items[0].id,b.items[0].id);
 stabilizeImportedCraftScene(a,base,'task');stabilizeImportedCraftScene(b,base,'task');assert.equal(craftSceneHash(a),craftSceneHash(b));
 assert.equal(a.craftReceipts[0].resultHash,craftSceneHash(a));
});
test('tiny noneditable remainders are recorded and cannot be silently reallocated',()=>{
 const initial=finished();const p={...whole(initial),commandId:'split',consume:['piece'],pieces:[{...whole(initial).pieces[0],id:'child',parentId:'piece',extraction:{type:'rect_crop',boxMM:[1,0,99,80]}}]};
 const r=execute(p,initial);assert.equal(r.committed,true,JSON.stringify(r.results));assert.equal(r.draft.craftScraps.length,1);assert.equal(r.draft.craftScraps[0].areaMM2,80);
 assert.equal(r.draft.craftLedger.units[0].usedAreaMM2,8000);assert.equal(r.draft.craftLedger.units[0].remainingAreaMM2,0);
});
test('glyph preparation exports only numeric contours; missing glyphs are refused',()=>{
 const outline=new opentype.Path();outline.moveTo(0,0);outline.lineTo(800,0);outline.lineTo(800,800);outline.lineTo(0,800);outline.close();
 outline.moveTo(200,200);outline.lineTo(200,600);outline.lineTo(600,600);outline.lineTo(600,200);outline.close();
 const font=new opentype.Font({familyName:'Synthetic',styleName:'Regular',unitsPerEm:1000,ascender:800,descender:-200,glyphs:[new opentype.Glyph({name:'.notdef',advanceWidth:900,path:new opentype.Path()}),new opentype.Glyph({name:'O',unicode:79,advanceWidth:900,path:outline})]});
 const bytes=new Uint8Array(font.toArrayBuffer());const g=glyphCutGeometry(bytes,'O',{fontSizeMM:10});
 assert.ok(Math.abs(geometryArea(g.geometryMM)-48)<1e-6);assert.equal(g.geometryMM[0].length,2);assert.equal(g.fontBytes,undefined);
 assert.throws(()=>glyphCutGeometry(bytes,'Z'),{code:'GLYPH_MISSING'});
 const stencil=glyphCutGeometry(bytes,'O',{fontSizeMM:10,bridges:[{fromMM:[0,4],toMM:[3,4],widthMM:1}]});assert.ok(geometryArea(stencil.geometryMM)<48);
});
test('imported Boolean regions have a usable manual editor representation',()=>{
 const mask={shape:'region',outer:[[0,0],[1,0],[1,1],[0,1]],holes:[[[.2,.2],[.4,.2],[.4,.4],[.2,.4]]]};
 assert.deepEqual(parseCompositeMask(JSON.stringify(mask)),mask);assert.throws(()=>parseCompositeMask(JSON.stringify({...mask,url:'https://example.invalid'})));
});
test('final visual review receives the actual image and charges the shared budget',async()=>{
 const d=finished(),budget=createCreativeBudget(3);budget.begin();let requests=0;
 const output=await reviewFinalCreativeScene({draft:d,options:{model:'gpt-4.1',endpoint:'https://example.invalid/chat',key:'test',finalVisualReview:true,visualAssetIDs:['paper']},assets:[material],aliases:{m1:'paper'},budget,render:async()=> 'data:image/png;base64,AAAA',request:async(url,o)=>{
  requests++;const body=JSON.parse(o.body);assert.ok(body.messages.at(-1).content.some(p=>p.type==='image_url'));assert.equal(body.tools,undefined);return response({approved:true,issues:[]});
 }});
 assert.equal(requests,1);assert.equal(budget.snapshot().visualReviewRequests,1);assert.equal(output.agentRun.visualReview,'model-reviewed');assert.equal(output.agentRun.reviewedSceneHash,craftSceneHash(output));
});
test('a local visual repair is persisted, rerendered, then reviewed again within the same run',async()=>{
 const d=finished(),budget=createCreativeBudget(4);budget.begin();let calls=0,renders=0,saves=0;
 const output=await reviewFinalCreativeScene({draft:d,options:{model:'gpt-4.1',endpoint:'https://example.invalid/chat',key:'test',finalVisualReview:true,visualAssetIDs:['paper'],processing:'自由拆解'},assets:[material],aliases:{m1:'paper'},budget,render:async()=>{renders++;return 'data:image/png;base64,AAAA';},onTurn:async()=>{saves++;},request:async()=>++calls===1?response({approved:false,issues:['偏移'],tools:[{name:'move_elements',arguments:{items:[{key:'piece',x:.5,y:.4}]}}]}):response({approved:true,issues:[]})});
 assert.equal(calls,2);assert.equal(renders,2);assert.equal(saves,1);assert.equal(output.agentRun.reviewedSceneHash,craftSceneHash(output));assert.notEqual(output.items[0].y,d.items[0].y);
});
test('visual checks do not exceed budget and a failed repair cannot damage the completed scene',async()=>{
 const d=finished(),budget=createCreativeBudget(1);budget.begin();let calls=0;
 const common={draft:d,options:{model:'gpt-4.1',endpoint:'https://example.invalid/chat',key:'test',finalVisualReview:true,visualAssetIDs:['paper']},assets:[material],aliases:{m1:'paper'},budget,render:async()=> 'data:image/png;base64,AAAA',request:async()=>{calls++;return response({approved:false,issues:[],tools:[{name:'delete_elements',arguments:{keys:['piece']}}]});}};
 const exhausted=await reviewFinalCreativeScene(common);assert.equal(calls,0);assert.equal(exhausted.agentRun.visualReview,'budget-unavailable');
 const failed=await reviewFinalCreativeScene({...common,budget:createCreativeBudget(2)});assert.equal(craftSceneHash(failed),craftSceneHash(d));assert.equal(failed.agentRun.visualReview,'review-unavailable');
});
test('cancellation after visual response prevents any tool execution',async()=>{
 const controller=new AbortController(),d=finished();
 await assert.rejects(reviewFinalCreativeScene({draft:d,options:{model:'gpt-4.1',endpoint:'https://example.invalid/chat',key:'test',finalVisualReview:true,visualAssetIDs:['paper']},assets:[material],aliases:{m1:'paper'},budget:createCreativeBudget(3),signal:controller.signal,render:async()=> 'data:image/png;base64,AAAA',onResponse:()=>controller.abort(Error('stopped')),request:async()=>response({approved:false,issues:[],tools:[{name:'move_elements',arguments:{items:[{key:'piece',x:0,y:0}]}}]})}),/stopped/);
});
test('canonical renderer decodes each material once and refuses missing images instead of a misleading preview',async()=>{
 const d=finished(),events=[],ctx=new Proxy({measureText:s=>({width:s.length*10})},{get:(o,k)=>o[k]||((...args)=>events.push([k,...args])),set:(o,k,v)=>(o[k]=v,true)}),canvas={getContext:()=>ctx};
 let reads=0;const rendered=await renderSceneCanvas(d,{waitForFonts:false,createCanvas:()=>canvas,loadMaterialImage:async()=>{reads++;return {width:100,height:80};}});
 assert.equal(reads,1);assert.equal(rendered.report.sceneHash,craftSceneHash(d));assert.ok(events.some(e=>e[0]==='drawImage'));
 await assert.rejects(renderSceneCanvas(d,{waitForFonts:false,createCanvas:()=>canvas,loadMaterialImage:async()=>null}),/缺少素材/);
});
test('failed local persistence during a visual repair is not swallowed as an optional review error',async()=>{
 const failure=Error('disk full');
 await assert.rejects(reviewFinalCreativeScene({draft:finished(),options:{model:'gpt-4.1',endpoint:'https://example.invalid/chat',key:'test',finalVisualReview:true,visualAssetIDs:['paper'],processing:'自由拆解'},assets:[material],aliases:{m1:'paper'},budget:createCreativeBudget(3),render:async()=> 'data:image/png;base64,AAAA',onTurn:async()=>{throw failure;},request:async()=>response({approved:false,issues:['offset'],tools:[{name:'move_elements',arguments:{items:[{key:'piece',x:.5,y:.4}]}}]})}),error=>error===failure);
});
test('explicitly discarded remainder is reserved as waste, not free inventory',()=>{
 const initial=finished(),p={...whole(initial),commandId:'discard',consume:['piece'],keepRemainders:false,pieces:[{...whole(initial).pieces[0],id:'child',parentId:'piece',extraction:{type:'rect_crop',boxMM:[0,0,50,80]}}]};
 const r=execute(p,initial);assert.equal(r.committed,true,JSON.stringify(r.results));assert.equal(r.draft.craftScraps[0].reason,'explicit-discard');assert.equal(r.draft.craftLedger.units[0].remainingAreaMM2,0);
 const next={...whole(r.draft),commandId:'reuse-waste',pieces:[{...whole(r.draft).pieces[0],id:'illegal',extraction:{type:'rect_crop',boxMM:[50,0,50,80]}}]};
 const failed=execute(next,r.draft);assert.equal(failed.committed,false);assert.equal(failed.results[0].code,'SOURCE_REGION_OVERLAP');
});
test('additional diagonal cuts on a Boolean region do not fill previously cut holes',async()=>{
 const {cutMaterialDiagonal,materialMaskGeometry,addMaterialWindow}=await import('../src/material-mask.js');
 const mask={shape:'region',outer:[[0,0],[1,0],[1,1],[0,1]],holes:[[[.5,.5],[.7,.5],[.7,.7],[.5,.7]]]};
 const result=cutMaterialDiagonal(mask,[0,.1],[.1,0],'left');
 assert.equal(materialMaskGeometry(result).holes.length,1);
 const next=addMaterialWindow(result,{shape:'rectangle',box:[.2,.2,.1,.1]});assert.equal(materialMaskGeometry(next).holes.length,2);
 assert.throws(()=>addMaterialWindow(next,{shape:'rectangle',box:[.55,.55,.05,.05]}),/重叠/);
});
