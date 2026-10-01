import test from 'node:test';
import assert from 'node:assert/strict';
import {seriesCovers,parseTags,searchableSeries,seriesMembers,usedAssetIDs,withUsageStatus,projectAssetIDs} from '../src/library-model.js';
import {canvasObjects,objectCorners,selectPolygon,moveSelection,clampCanvasPosition} from '../src/canvas-selection.js';
import {materialPrintPlacements,pagePDF} from '../src/pdf-export.js';
import {candidateMetadata,importPaperDimensions,saveImportBatch} from '../src/import-save.js';
import {classificationResult,classifyRecord} from '../src/classification.js';
import {createAIRecorder,redact} from '../src/ai-diagnostics.js';
import {assetEditorValue} from '../src/asset-editor.js';
import {draft,physicalPlacement,recommend} from '../src/domain.js';

test('series covers follow current membership, five-cover limit, and Swift fallback',()=>{
  const assets=Array.from({length:6},(_,i)=>({id:String(i),seriesID:'s'}));
  assert.deepEqual(seriesCovers({id:'s',coverAssetIDs:['gone','4','2']},assets).map(a=>a.id),['4','2']);
  assert.deepEqual(seriesCovers({id:'s',coverAssetIDs:[]},assets).map(a=>a.id),['0','1','2']);
  assert.equal(seriesCovers({id:'s',coverAssetIDs:assets.map(a=>a.id)},assets).length,5);
  assert.deepEqual(parseTags('春天，植物、春天,  旅行 '),['春天','植物','旅行']);
  assert.ok(searchableSeries({id:'s',title:'系列',styleTags:['复古']},assets).includes('复古'));
});
test('series contents independently filter tags, organization and actual used works',()=>{
  const assets=[{id:'a',seriesID:'s',title:'A',reviewStatus:'ready',kind:'paper',createdAt:'2026-01-01',styleTags:['植物'],isFavorite:true},{id:'b',seriesID:'s',title:'B',kind:'tape',createdAt:'2026-01-02'},{id:'c',seriesID:'other',title:'C'},{id:'internal',seriesID:'s',isProjectInternal:true,title:'内置'}];
  const projects=[{isDraft:false,isUsed:true,drafts:[{items:[{assetID:'a'},{assetID:'b',isParked:true}]}]},{isDraft:true,isUsed:true,drafts:[{items:[{assetID:'b'}]}]},{isDraft:false,isUsed:false,drafts:[{items:[{assetID:'b'}]}]}];
  assert.deepEqual([...usedAssetIDs(projects)],['a']);
  assert.deepEqual(seriesMembers('s',assets,projects).map(a=>a.id),['b','a']);
  assert.deepEqual(seriesMembers('s',assets,projects,{query:'植物'}).map(a=>a.id),['a']);
  assert.deepEqual(seriesMembers('s',assets,projects,{status:'unready'}).map(a=>a.id),['b']);
  assert.deepEqual(seriesMembers('s',assets,projects,{status:'used'}).map(a=>a.id),['a']);
  assert.deepEqual(seriesMembers('s',assets,projects,{status:'unused'}).map(a=>a.id),['b']);
  assert.deepEqual(seriesMembers('s',assets,projects,{status:'favorite'}).map(a=>a.id),['a']);
  assert.deepEqual(seriesMembers('s',assets,projects,{sort:'name',ascending:true}).map(a=>a.id),['a','b']);
  assert.equal(seriesMembers('s',assets,projects,{status:'outside'}).length,0);
});
test('latest manual or project use event controls asset status without losing legacy projects',()=>{
  const work={isDraft:false,isUsed:true,drafts:[{items:[{assetID:'a'},{assetID:'b',isParked:true}]}]};
  assert.deepEqual([...projectAssetIDs(work)],['a']);
  assert.deepEqual([...usedAssetIDs([work],[{id:'a'},{id:'b'}])],['a']);
  const unused=withUsageStatus({id:'a',title:'素材'},false,'2026-09-30T00:00:00.000Z');
  assert.equal(unused.usageStatus,'unused');
  assert.deepEqual([...usedAssetIDs([work],[unused])],[]);
  const used=withUsageStatus(unused,true,'2026-09-30T01:00:00.000Z');
  assert.deepEqual([...usedAssetIDs([work],[used])],['a']);
  assert.deepEqual([...usedAssetIDs([],[used])],['a']);
});
test('lasso requires full enclosure of rotated objects and honors type and lock filters',()=>{
  const item={id:'a',x:50,y:50,width:40,height:10,rotation:45};
  const d={canvas:{width:100,height:100},items:[item,{...item,id:'locked',isLocked:true},{...item,id:'parked',isParked:true}],textBlocks:[{...item,id:'text'}],primitives:[{...item,id:'hidden',hidden:true}]};
  const p=[{x:35,y:35},{x:39,y:35},{x:39,y:39},{x:35,y:39}];
  assert.deepEqual(selectPolygon(d,p,{material:true}),[]);
  assert.deepEqual(selectPolygon(d,[{x:20,y:20},{x:80,y:20},{x:80,y:80},{x:20,y:80}],{material:true}),['a']);
  assert.equal(canvasObjects(d).length,2);
  assert.equal(objectCorners(item).length,4);
  assert.deepEqual(selectPolygon(d,[{x:NaN,y:0},...p]),[]);
});
test('group movement uses gesture starts and preserves physical sizes and locked objects',()=>{
  const a={id:'a',x:5,y:5,width:20,height:30},b={id:'b',x:15,y:25,width:10,height:10},locked={id:'l',x:1,y:1,locked:true};
  const d={canvas:{width:100,height:100},items:[a,locked],textBlocks:[b]},starts=new Map([['a',{x:5,y:5}],['b',{x:15,y:25}],['l',{x:1,y:1}]]);
  moveSelection(d,starts,10,20);moveSelection(d,starts,15,25);
  assert.equal(a.x,20);assert.equal(b.x,30);assert.equal(a.width,20);assert.equal(locked.x,1);
  moveSelection(d,starts,Infinity,0);assert.equal(a.x,20);
  moveSelection(d,starts,-10000,-10000);assert.equal(a.x,0);assert.equal(b.x,10);assert.equal(a.y,0);
  moveSelection(d,starts,10000,10000);assert.equal(b.x,100);assert.equal(b.y,100);
  assert.deepEqual(clampCanvasPosition(d,a,-200,500),{x:0,y:100});
});
test('material PDF packs A4 at true sizes and refuses unmeasured/oversized material',()=>{
  const assets=[{title:'a',physicalWidthMM:190,physicalHeightMM:200},{title:'b',physicalWidthMM:190,physicalHeightMM:200}];
  const p=materialPrintPlacements(assets);assert.equal(p[0].page,0);assert.equal(p[1].page,1);assert.equal(p[0].width,190);
  assert.throws(()=>materialPrintPlacements([{title:'未测量'}]),/校准/);
  assert.throws(()=>materialPrintPlacements([{title:'大',physicalWidthMM:195,physicalHeightMM:100}]),/放不进/);
});
test('mature PDF encoder produces parseable pages at exact physical size',async()=>{
  const {PDFDocument}=await import('pdf-lib');
  const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJVAA//Z','base64');
  const pdf=await pagePDF([{jpeg,width:210,height:297,pixelWidth:1,pixelHeight:1},{jpeg,width:148,height:210,pixelWidth:1,pixelHeight:1}]),parsed=await PDFDocument.load(await pdf.arrayBuffer());
  assert.equal(parsed.getPageCount(),2);assert.ok(Math.abs(parsed.getPages()[0].getWidth()-210*72/25.4)<1e-8);assert.ok(Math.abs(parsed.getPages()[1].getHeight()-210*72/25.4)<1e-8);assert.equal(pdf.type,'application/pdf');
  await assert.rejects(pagePDF([{jpeg,width:NaN,height:297}]),/尺寸/);await assert.rejects(pagePDF([]),/页面/);await assert.rejects(pagePDF([{jpeg:new Uint8Array([255]),width:210,height:297}]));
});
test('import records preserve candidate metadata and explicit unassigned series',()=>{
  const c={title:'票据',width:30.5,height:60,quantity:3,kind:'paper',role:'support',reviewStatus:'ready',seriesID:'__none__'};
  const a=candidateMetadata(c,{seriesID:'s'},'batch');assert.equal(a.seriesID,null);assert.equal(a.supply.quantity,3);assert.equal(a.kind,'paper');assert.equal(a.physicalWidthMM,30.5);
  assert.throws(()=>candidateMetadata({...c,quantity:1.5},{},null),/正整数/);
  assert.throws(()=>candidateMetadata({...c,width:-1},{},null),/宽高/);
  assert.deepEqual(importPaperDimensions({paperSize:'a5',paperOrientation:'landscape'}),[210,148]);
  assert.deepEqual(importPaperDimensions({paperSize:'custom',customImportWidth:12,customImportHeight:500,paperOrientation:'portrait'}),[12,500]);
});
test('classification rejects malformed enums and uses configured endpoint without changing stock',async()=>{
  assert.throws(()=>classificationResult({title:'x',tags:[],kind:'wrong',role:'focal',texture:'paper'},'asset'),/类型/);
  let payload;
  const result=await classifyRecord({kind:'project',record:{drafts:[]},settings:{key:'test-key',model:'test',endpoint:'https://example.test/chat',requestTimeout:30,provider:'custom'},assets:[],request:async(url,options)=>{assert.equal(url,'https://example.test/chat');payload=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:'{"title":"春天","tags":["植物"]}'}}]}));}});
  assert.equal(payload.model,'test');assert.deepEqual(result.styleTags,['植物']);
});
test('import saves once under double-click and permits retry after transaction failure',async()=>{
  const blob=new Blob(['synthetic']);
  const state={importMode:'material',importStep:'review',assets:[],projects:[],importRecords:[{confirmed:true,file:blob,selectedCandidates:[{selected:true,title:'合成',blob,width:20,height:30,region:{x:0,y:0,w:1,h:1}}]}]};
  const urls=new Map();let writes=0,release,started;
  const ready=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  const db={transaction:async()=>{writes++;started();await gate;}};
  const options={state,db,urls,render:()=>{}};
  const first=saveImportBatch(options);await ready;await saveImportBatch(options);assert.equal(writes,1);release();await first;
  await saveImportBatch(options);assert.equal(state.assets.length,1);assert.equal(writes,1);
  for(const url of urls.values())URL.revokeObjectURL(url);
  state.importStep='review';state.assets=[];
  db.transaction=async()=>{throw Error('offline');};
  await assert.rejects(saveImportBatch(options),/offline/);assert.equal(state.assets.length,0);assert.equal(state.importSaving,false);
});
test('automatic organization starts after commit and does not delay continuing import',async()=>{
  const blob=new Blob(['synthetic']),state={importMode:'material',importStep:'review',assets:[],projects:[],importRecords:[{confirmed:true,file:blob,selectedCandidates:[{selected:true,title:'素材 1',blob,region:{x:0,y:0,w:1,h:1}}]}]},urls=new Map();
  let committed=false,called=false,release;
  const work=new Promise(r=>release=r),db={transaction:async()=>{committed=true;}};
  await saveImportBatch({state,db,urls,render:()=>{},onSaved:async assets=>{assert.ok(committed);assert.equal(state.importStep,'done');assert.equal(assets.length,1);assets[0].title='background mutation';called=true;await work;}});
  assert.ok(called);assert.equal(state.assets[0].title,'素材 1');assert.equal(state.importSaving,false);
  release();for(const url of urls.values())URL.revokeObjectURL(url);
  state.importStep='review';db.transaction=async()=>{throw Error('offline');};called=false;
  await assert.rejects(saveImportBatch({state,db,urls,render:()=>{},onSaved:()=>{called=true;}}),/offline/);assert.equal(called,false);
});
test('saved import announces queued organization before remote upload finishes',async()=>{
  const blob=new Blob(['synthetic']),state={importMode:'material',importStep:'review',assets:[],projects:[],importRecords:[{confirmed:true,file:blob,selectedCandidates:[{selected:true,title:'素材 1',blob,region:{x:0,y:0,w:1,h:1}}]}]},urls=new Map();
  let release,announced=false,organized=false;const remote=new Promise(r=>release=r);
  await saveImportBatch({state,db:{stageImport:async()=>({pending:true}),flushProjects:()=>remote},urls,render:()=>{},onSaved:async(records,{waitForSave})=>{announced=true;await waitForSave();organized=true;}});
  assert.equal(state.importStep,'done');assert.ok(announced);assert.equal(organized,false);
  release();await new Promise(r=>setImmediate(r));assert.ok(organized);for(const url of urls.values())URL.revokeObjectURL(url);
});
test('AI metrics contain no private body; opt-in context redacts credentials before persistence',async()=>{
  const values=new Map(),db={get:async(_,id)=>values.get(id),put:async(_,value)=>values.set(value.id,structuredClone(value)),all:async()=>[...values.values()],transaction:async(_,fn)=>fn({objectStore:()=>({delete:id=>values.delete(id)})})};
  const response=()=>new Response(JSON.stringify({usage:{prompt_tokens:7,completion_tokens:3},choices:[{message:{content:'private-reply'}}]}));
  const settings={db,model:'test',key:'secret',request:async()=>response(),storage:{getItem:()=>null}};
  const r=await createAIRecorder(settings);await r.request('https://example.test',{body:JSON.stringify({messages:[{content:'private-photo secret'}]})});await r.finish('completed');
  assert.equal(values.size,1);assert.ok(!JSON.stringify([...values.values()]).includes('private'));
  settings.storage.getItem=()=> 'true';const captured=await createAIRecorder(settings);
  await captured.request('https://example.test',{body:JSON.stringify({messages:[{content:'private-photo secret'}],apiKey:'secret'})});await captured.finish('completed');
  const context=[...values.values()].find(v=>v.id.startsWith('ai-context-'));assert.equal(context.status,'completed');assert.ok(JSON.stringify(context).includes('private-photo'));assert.ok(!JSON.stringify(context).includes('secret'));
  assert.deepEqual(redact({headers:{Authorization:'Bearer secret'},key:'secret',text:'secret'},'secret'),{text:'[REDACTED]'});
});
test('asset metadata accepts zero stock, keeps manual dimensions, excludes unavailable recommendations',()=>{
  const old={id:'a',title:'old',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}};
  const fields={title:'纸品',kind:'paper',role:'support',texture:'牛皮纸',width:'20',height:'30',quantity:'0',tags:'旅行',contentTags:'票据',styleTags:'复古',materialTags:'牛皮纸',seriesID:'s',reviewStatus:'ready'};
  const a=assetEditorValue(old,fields);assert.equal(a.supply.quantity,0);assert.deepEqual(a.tags,['旅行','票据','复古','牛皮纸']);assert.equal(a.seriesID,'s');assert.equal(old.supply.quantity,1);
  assert.deepEqual(physicalPlacement(draft(),[a],['a']),[]);assert.deepEqual(recommend({...a,id:'core'},[a]),[]);
  assert.throws(()=>assetEditorValue(old,{...fields,width:'-2'}),/宽高/);
});
