import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {applyToolCalls,agentTools,directPageToTools} from '../src/creative.js';
import {toolContracts,validateTool} from '../src/creative-contract.js';
import {textLines} from '../src/editor-tools-model.js';

const assets=[
  {id:'paper',title:'衬纸',kind:'paper',role:'support',physicalWidthMM:80,physicalHeightMM:100,supply:{quantity:1},blobId:'paper-image'},
  {id:'photo',title:'窗边的光',kind:'photo',role:'focal',physicalWidthMM:45,physicalHeightMM:65,supply:{quantity:2}},
  {id:'tape',title:'蓝色胶带',kind:'tape',role:'connector',physicalWidthMM:100,physicalHeightMM:12,supply:{quantity:1}}
];
const aliases={m1:'paper',m2:'photo',m3:'tape'};
const call=(name,args)=>({name,arguments:args});
function run(base,calls,options={}){return applyToolCalls(calls,base,assets,aliases,options);}
function success(base,calls,options={}){const r=run(base,calls,options);assert.ok(r.results.every(r=>r.ok),JSON.stringify(r.results));return r.draft;}
const crop=values=>({op:'crop',box:{unit:'ratio',mode:'keep',values},angle:0,finish:null});
const placed=()=>success(draft(),[call('place_materials',{items:[{asset:'m1',piece:'p1',x:.5,y:.5},{asset:'m2',piece:'p2',x:.2,y:.25}]})]);

test('the advertised Swift tools plus atomic craft plan all execute editable changes or inspection',()=>{
  const names=['apply_craft_plan','compose_story_page','compose_page','place_materials','edit_materials','upsert_materials','move_elements','arrange_elements','fit_text_to','upsert_primitives','upsert_text','delete_elements','set_paper','inspect_materials','finish_design'];
  assert.deepEqual(agentTools.map(t=>t.function.name).sort(),names.sort());
  assert.deepEqual(Object.keys(toolContracts).sort(),names.sort());
  let d=success(draft(),[call('compose_story_page',{grammar:'diary',title:'光落在纸上',lead:'窗边的光留下柔软的影子。',notes:['纸面的纹理接住了光。','蓝色让这一页安静下来。'],microcopy:'留住一个小片刻',focal:'m2',support:'m1',paper:'#FCFAF0',ink:'#30463D',accent:'#547DA4'})]);
  assert.equal(d.textBlocks.length,5);assert.equal(d.items.length,2);assert.ok(d.items.every(i=>i.id&&i.generationBaseline));
  d=success(d,[call('compose_page',{graphics:[{key:'g1',kind:'rectangle',width:.3,height:.25,x:.5,y:.6}],texts:[{key:'t1',content:'写下真实看到的光。',width:.25,x:.5,y:.6,font_size:24}]})]);
  d=success(d,[call('place_materials',{items:[{asset:'m3',piece:'p3',x:.5,y:.6}]}),call('edit_materials',{items:[{piece:'p3',operations:[{op:'tape',unit:'mm',start:20,length:50}]}]})]);
  assert.ok(Math.abs(d.items.find(i=>i.creativePieceID==='p3').width-50/297*1000)<1e-6);
  d=success(d,[call('upsert_materials',{items:[{asset:'m2',piece:'p4',unit:1,operations:[{op:'whole'}],placement:{x:.8,y:.4,rotation:0,z:20}}],remove:[]})]);
  d=success(d,[call('move_elements',{items:[{key:'p4',relative_to:'g1',offset:[.7,0]}]}),call('arrange_elements',{keys:['p3','p4'],mode:'row',x:.5,y:.5,gap_mm:4})]);
  d=success(d,[call('fit_text_to',{key:'t1',target:'g1',padding_mm:[2,2,2,2],color:'#20483D'}),call('upsert_primitives',{items:[{key:'frame',kind:'frame',match_size_to:'p4',padding_mm:[2,2,2,2],fill:null}]}),call('upsert_text',{items:[{key:'t1',content:'纸面留下柔软的影子。',width:.3,x:.5,y:.7,font_size:24}]})]);
  d=success(d,[call('delete_elements',{keys:['frame']}),call('set_paper',{color:'#F0F5EE',pattern:'grid',intent:'留下连续的阅读空间'})]);
  const inspected=run(d,[call('inspect_materials',{keys:['p3','m1']})]);assert.equal(inspected.committed,false);assert.equal(inspected.results[0].data.materials[0].widthMM,50);assert.equal(inspected.results[0].data.materials[1].sourceRef.blobId,'paper-image');
  d=success(d,[call('finish_design',{summary:'光和纸的对话'})]);assert.equal(d.agentRun.status,'finished');
});

test('compose_page is atomic and prior calls survive an invalid component',()=>{
  const r=run(draft(),[call('set_paper',{color:'#EAF0EE'}),call('compose_page',{paper:{color:'#FFFFFF'},materials:[{asset:'m2',piece:'p',x:.5,y:.5}],texts:[{key:'bad',content:'无效字号',x:.5,y:.5,width:.4,font_size:401}]})]);
  assert.deepEqual(r.results.map(r=>r.ok),[true,false]);assert.equal(r.draft.paperColor,'#EAF0EE');assert.equal(r.draft.items.length,0);assert.equal(r.draft.textBlocks.length,0);
});

test('page bleed and oversized text remain editable without changing real material size',()=>{
  const paper={...assets[0],physicalWidthMM:163.63,physicalHeightMM:212.75};
  const result=applyToolCalls(directPageToTools({version:3,style:'自由构图',intent:null,
    paper:{color:'#FCFAF0',pattern:'plain'},
    items:[{asset:'m1',piece:'底纸',unit:0,operations:[{op:'whole'}],placement:{x:.255,y:.505,rotation:-1,z:2},relation:null}],
    text_blocks:[{content:'多行文字可有意跨过纸边，不应被误认作实物违规。'.repeat(8),font_style:'sans',x:.3,y:.9,width:.24,height:.04,font_size:28,color:'#30463d'}]
  }),draft({mode:'spread',ratio:'a5'}),[paper],{m1:'paper'});
  assert.equal(result.results[0].ok,true,JSON.stringify(result.results));
  const page=result.draft,placed=page.items[0];
  assert.equal(page.agentRun.status,'finished');
  assert.ok(placed.y+placed.height/2>page.canvas.height);
  assert.ok(Math.abs(placed.width-paper.physicalWidthMM/page.physicalPageHeightMM*page.canvas.height)<1e-6);
  assert.ok(Math.abs(placed.height-paper.physicalHeightMM/page.physicalPageHeightMM*page.canvas.height)<1e-6);
  assert.ok(page.textBlocks[0].height>.04*page.canvas.height);
});

test('ratio/pt/mm and relative positions share the same physical scale',()=>{
  let d=placed();const original=d.items[0].width;
  d=success(d,[call('move_elements',{items:[{key:'p1',x:105,y:148.5,coordinate_unit:'mm'}]}),call('upsert_primitives',{items:[{key:'g',kind:'frame',relative_to:'p1',offset:[0,0],match_size_to:'p1',padding_mm:[4,2,6,8]}]}),call('upsert_text',{items:[{key:'t',content:'位置',width:100,size_unit:'pt',x:100,y:100,coordinate_unit:'pt',font_size:20}]})]);
  const p=d.items[0],g=d.primitives[0],t=d.textBlocks[0];assert.equal(p.width,original);assert.ok(Math.abs(p.x-105/297*1000)<1e-6);assert.equal(t.x,100);assert.equal(t.width,100);assert.ok(Math.abs(g.width-p.width-10/297*1000)<1e-6);assert.ok(Math.abs(g.y-p.y-3/297*1000)<1e-6);
});

test('append and replace keep source crop and baseline consistent',()=>{
  let d=placed();d=success(d,[call('edit_materials',{items:[{piece:'p1',mode:'replace',operations:[crop([.1,.1,.8,.8])]}]})]);
  d=success(d,[call('edit_materials',{items:[{piece:'p1',mode:'append',operations:[{op:'trim',edge:'left',quantity:{unit:'mm',mode:'remove',value:8},finish:null}]}]})]);
  const p=d.items[0];assert.ok(Math.abs(p.cropRect.x-.2)<1e-6);assert.ok(Math.abs(p.cropRect.width-.7)<1e-6);assert.equal(p.materialSteps.length,2);assert.equal(p.generationBaseline.width,p.width);assert.deepEqual(p.generationBaseline.cropRect,p.cropRect);
  d=success(d,[call('edit_materials',{items:[{piece:'p1',mode:'replace',operations:[{op:'whole'}]}]})]);assert.equal(d.items[0].cropRect,null);assert.equal(d.items[0].materialSteps.length,1);assert.ok(Math.abs(d.items[0].width-80/297*1000)<1e-6);
});

test('nonoverlapping source slices share one inventory unit; overlapping copies are rejected',()=>{
  const base=placed(),items=[{asset:'m1',piece:'left',unit:0,operations:[crop([0,0,.5,1])],placement:{x:.3,y:.5,rotation:0,z:1}},{asset:'m1',piece:'right',unit:0,operations:[crop([.5,0,.5,1])],placement:{x:.7,y:.5,rotation:0,z:2}}];
  const d=success(base,[call('upsert_materials',{items,remove:['p1']})]);assert.equal(d.items.filter(i=>i.assetID==='paper').length,2);
  const bad=run(d,[call('upsert_materials',{items:[{...items[0],piece:'duplicate'}]})]);assert.equal(bad.results[0].ok,false);assert.equal(bad.draft.items.length,d.items.length);
  const over=run(base,[call('place_materials',{items:[{asset:'m2',piece:'p3',unit:2}]})]);assert.equal(over.results[0].ok,false);
});

test('continuous tape can supply repeated pieces without enlarging the calibrated strip',()=>{
  const strips=[{asset:'m3',piece:'tape-a',unit:0,operations:[crop([0,0,.35,1])],placement:{x:.3,y:.3,rotation:0,z:1}},{asset:'m3',piece:'tape-b',unit:1,operations:[crop([0,0,.35,1])],placement:{x:.7,y:.3,rotation:0,z:2}}];
  const d=success(draft(),[call('upsert_materials',{items:strips,remove:[]})]);
  assert.equal(d.items.length,2);
  assert.ok(d.items.every(item=>Math.abs(item.width-35/297*1000)<1e-6));
  const copy=run(d,[call('upsert_materials',{items:[{asset:'m1',piece:'paper-copy',unit:1,operations:[{op:'whole'}],placement:{x:.5,y:.7,rotation:0,z:3}}],remove:[]})]);
  assert.equal(copy.results[0].ok,false);
});

test('arrange preserves all material dimensions in row, column and unequal grid',()=>{
  for(const mode of ['row','column','grid']){const d=placed(),sizes=d.items.map(i=>[i.width,i.height]);const arranged=success(d,[call('arrange_elements',{keys:['p1','p2'],mode,x:.5,y:.5,gap_mm:3,columns:2})]);assert.deepEqual(arranged.items.map(i=>[i.width,i.height]),sizes);assert.ok(arranged.items.every(i=>i.generationBaseline.x===i.x&&i.generationBaseline.y===i.y));}
});

test('fit_text_to preserves every character, shrinks to fit, and rolls back impossible fitting',()=>{
  const content='每一个字都留在这一块纸上。'.repeat(5);let d=success(draft(),[call('upsert_primitives',{items:[{key:'box',kind:'rectangle',x:.5,y:.5,width:.35,height:.3}]}),call('upsert_text',{items:[{key:'t',content,width:.9,font_size:32}]})]);
  d=success(d,[call('fit_text_to',{key:'t',target:'box',padding_mm:[2,2,2,2]})]);const t=d.textBlocks[0],lines=textLines(t,text=>Array.from(text).length*t.fontSize);assert.equal(lines.lines.map(l=>l.text).join(''),content);assert.ok(lines.height<=t.height+1e-6);assert.ok(t.fontSize<32);
  const impossible=run(d,[call('upsert_primitives',{items:[{key:'tiny',kind:'rectangle',x:.5,y:.5,width:.02,height:.02}]}),call('fit_text_to',{key:'t',target:'tiny',padding_mm:[0,0,0,0]})]);assert.equal(impossible.results[1].ok,false);assert.equal(impossible.draft.textBlocks[0].content,content);assert.deepEqual(impossible.draft.textBlocks[0],t);
});

test('inspection reports scanned visible bounds and processed source dimensions',()=>{
  let d=placed();d=success(d,[call('edit_materials',{items:[{piece:'p1',operations:[crop([.1,0,.8,1])]}]})]);
  const options={visibleBounds:{paper:{x:.2,y:.1,width:.6,height:.8}}};const r=run(d,[call('inspect_materials',{keys:['p1']})],options),info=r.results[0].data.materials[0];assert.equal(info.boundsKnown,true);assert.ok(Math.abs(info.visibleWidthMM-48)<1e-6);assert.equal(info.visibleHeightMM,80);assert.equal(info.sourceWidthMM,80);assert.equal(info.widthMM,64);assert.match(info.sourceDescription,/衬纸/);
  const fitted=success(d,[call('upsert_text',{items:[{key:'t',content:'可见区域',width:.3,font_size:24}]}),call('fit_text_to',{key:'t',target:'p1',padding_mm:[0,0,0,0]})],options);assert.ok(Math.abs(fitted.textBlocks[0].width-48/297*1000)<1e-6);
  const unscanned=run(d,[call('fit_text_to',{key:'missing',target:'p1'})]);assert.equal(unscanned.results[0].ok,false);
});

test('Swift v3 direct pages decode atomically into real editable layers and relations',()=>{
  const page={version:3,style:'留白叙事',intent:'光与纹理',paper:{color:'#FCFAF0',pattern:'dots'},items:[{asset:'m1',piece:'p1',unit:0,role:'衬底',operations:[{op:'whole'}],placement:{x:.5,y:.5,rotation:0,z:10},relation:null},{asset:'m2',piece:'p2',unit:0,role:'主角',operations:[{op:'whole'}],placement:{x:.5,y:.5,rotation:0,z:11},relation:{kind:'behind',target:'p1',exposed_mm:0}}],text_blocks:[{content:'窗边的光',font_style:'serif',x:.5,y:.8,width:.6,height:.1,font_size:32,color:'#30463D'}]};
  const calls=directPageToTools(page);assert.equal(calls.length,1);const d=success(draft(),calls);assert.equal(d.style,'airy');assert.equal(d.items.length,2);assert.equal(d.textBlocks.length,1);assert.equal(d.items[1].x,d.items[0].x);assert.equal(d.items[1].zIndex,9);
  const decoded=applyToolCalls(JSON.stringify(page),draft(),assets,aliases);assert.equal(decoded.results[0].ok,true);
  const bleed=structuredClone(page);bleed.items[1].placement.x=3;bleed.items[1].relation=null;const accepted=run(draft(),directPageToTools(bleed));assert.equal(accepted.results[0].ok,true);
  const bad=structuredClone(page);bad.items[1].placement.x=4;bad.items[1].relation=null;assert.throws(()=>directPageToTools(bad),/合同不合法/);
});

test('unsupported decorative cuts, unknown fields, NaN, rotation overflow and locked edits fail explicitly',()=>{
  const d=placed();const badCalls=[call('edit_materials',{items:[{piece:'p1',operations:[{op:'windowFrame',box:{unit:'ratio',mode:'keep',values:[0,0,.5,.5]}}]}]}),call('edit_materials',{items:[{piece:'p1',operations:[{...crop([0,0,.5,.5]),finish:{line:'wave',depthMM:2,periodMM:5,corner:'square',radiusMM:0}}]}]}),call('upsert_text',{items:[{key:'t',content:'普通文字',width:.3,onclick:'alert(1)'}]}),call('move_elements',{items:[{key:'p1',x:NaN}]}),call('upsert_primitives',{items:[{key:'g',kind:'fake'}]}),call('set_paper',{color:'#FFFFFF',url:'https://example.com'})];
  const rejected=run(d,badCalls);assert.ok(rejected.results.every(r=>!r.ok));assert.deepEqual(rejected.draft,d);
  const edge=success(draft(),[call('place_materials',{items:[{asset:'m1',piece:'p',x:.5,y:50/297}]})]);const rotation=run(edge,[call('move_elements',{items:[{key:'p',rotation:45}]})]);assert.equal(rotation.results[0].ok,true);
  d.items[0].isLocked=true;for(const c of [call('move_elements',{items:[{key:'p1',x:.4}]}),call('delete_elements',{keys:['p1']}),call('edit_materials',{items:[{piece:'p1',operations:[crop([0,0,.8,.8])]}]}),call('arrange_elements',{keys:['p1','p2'],mode:'row'})])assert.equal(run(d,[c]).results[0].ok,false);
  assert.throws(()=>validateTool('move_elements',{items:[{key:'p1',width:20}]}),/未知字段/);
});

test('finish must be last, follows no failures and respects explicitly required materials without text quotas',()=>{
  const d=placed(),withText=success(d,[call('upsert_text',{items:[{key:'t',content:'完整的叙述',width:.5}]})]);
  const priorFailure=run(withText,[call('set_paper',{color:'red'}),call('finish_design',{})]);assert.deepEqual(priorFailure.results.map(r=>r.ok),[false,false]);assert.notEqual(priorFailure.draft.agentRun?.status,'finished');
  const early=run(withText,[call('finish_design',{}),call('set_paper',{color:'#FFFFFF'})]);assert.deepEqual(early.results.map(r=>r.ok),[false,true]);assert.notEqual(early.draft.agentRun?.status,'finished');
  assert.equal(run(d,[call('finish_design',{})]).results[0].ok,true);assert.equal(run(d,[call('finish_design',{})],{allowNoText:true}).results[0].ok,true);
  assert.equal(run(draft(),[call('finish_design',{})]).results[0].ok,true);
  assert.equal(run(withText,[call('finish_design',{})],{requiredAssetIDs:['tape']}).results[0].ok,false);
  const overflow=run(withText,Array.from({length:13},(_,n)=>call(n===12?'finish_design':'set_paper',n===12?{}:{color:'#FFFFFF'})));assert.ok(overflow.results.slice(0,12).every(r=>r.ok));assert.equal(overflow.results[12].ok,false);assert.notEqual(overflow.draft.agentRun?.status,'finished');
  const previouslyFinished=success(withText,[call('finish_design',{})]);const retry=run(previouslyFinished,[call('set_paper',{color:'red'}),call('finish_design',{})]);assert.deepEqual(retry.results.map(r=>r.ok),[false,false]);assert.equal(retry.draft.agentRun.status,'editing');
});

test('additional advertised craft plan has an executable contract and covered implementation',()=>{assert.ok(agentTools.find(t=>t.function.name==='apply_craft_plan')?.function.parameters.properties.pieces);});
