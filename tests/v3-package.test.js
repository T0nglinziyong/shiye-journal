import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,utimes} from 'node:fs/promises';
import {tmpdir,hostname} from 'node:os';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {tinyPNG,linkTestCanvas} from './offline-canvas-test-support.mjs';
import {validateCreationV2Commands} from '../src/creation-v2-commands.js';
import {creationCommandRegistry} from '../src/creation-v2-contract.js';
const paper=(id='paper',width=30,height=40)=>({id,title:id,kind:'paper',physicalWidthMM:width,physicalHeightMM:height,supply:{quantity:1}});
const mm=(x,y)=>({reference:'page',at:[x,y],unit:'mm'});
const ratio=(x,y)=>({reference:'page',at:[x,y],unit:'ratio'});
const material=(id,asset,place)=>({op:'material.add',id,asset,place});
const text=(id,content,x,y,width,size)=>({op:'text.add',id,content,place:mm(x,y),size:{width,unit:'mm'},style:{fontSizePt:size}});
const decision=(asset,choice='intact')=>({op:'material.decision',asset,choice,reason:choice==='intact'?'保留完整轮廓纳入本页叙事':'真实裁切或加工并保留来源与余料'});
async function makeTask(assets,title='统一创作测试',p=project(title)){
 const aliases=Object.fromEntries(assets.map((asset,i)=>['m'+(i+1),asset.id]));
 return createOfflineHandoff({project:p,assets,aliases,previews:assets.map((_,i)=>({alias:'m'+(i+1),bytes:tinyPNG})),settings:{includeThumbnails:true}});
}
async function withPackage(assets,fn,{p=project('统一创作测试'),canvas=true}={}){
 const task=await makeTask(assets,p.title,p),files=unzipSync(new Uint8Array(await task.blob.arrayBuffer())),dir=await mkdtemp(join(tmpdir(),'shiye-current-'));
 try{
  for(const [path,bytes] of Object.entries(files)){await mkdir(dirname(join(dir,path)),{recursive:true});await writeFile(join(dir,path),bytes);}
  if(canvas)await linkTestCanvas(dir);
  const run=(...args)=>spawnSync(process.execPath,['runtime/shiye.cjs',...args],{cwd:dir,encoding:'utf8',timeout:60000,env:{...process.env,SHIYE_RENDERER:'node'}});
  const ok=(...args)=>{const result=run(...args);assert.equal(result.status,0,args.join(' ')+': '+result.stderr);return JSON.parse(result.stdout);};
  const read=async path=>JSON.parse(await readFile(join(dir,path),'utf8'));
  const write=async(path,value)=>writeFile(join(dir,path),JSON.stringify(value));
  let sequence=0;
  const batch=operations=>({protocolVersion:2,transactionId:'test-'+(++sequence),baseSceneRevision:ok('info').sceneRevision,operations});
  const apply=async operations=>{const command=batch(operations);await write('work/commands.json',command);ok('apply','work/commands.json');return command;};
  await fn({task,files,dir,run,ok,read,write,batch,apply});
 }finally{await rm(dir,{recursive:true,force:true});}
}
test('current ZIP creates editable Scene, recovers stale locks and verifies real PNG bytes',async()=>{
 const assets=[paper()];await withPackage(assets,async({files,dir,run,ok,read,write,batch})=>{
 for(const path of ['START_HERE.md','TASK.json','scene.json','assets/overview.jpg','assets/size-map.jpg','assets/m1.png','assets/manifest.json','api/commands.schema.json','api/scene.schema.json','runtime/shiye.cjs','work/commands.json','fonts/MaShanZheng-Regular.ttf','fonts/OFL.txt'])assert.ok(files[path],path);
  const task=JSON.parse(new TextDecoder().decode(files['TASK.json']));
  assert.equal(task.creativeBriefRef,'design/GUIDE.md');assert.equal(task.materials[0].selection,'preferred');
  assert.equal(task.creativeBrief,undefined);
  assert.ok(files[task.creativeBriefRef]);
  const sceneBeforeGuide=await readFile(join(dir,'scene.json'));
  const brief=ok('brief');assert.equal(brief.materials[0].alias,'m1');assert.equal(brief.sourceContext,undefined);assert.equal(brief.route.context.mainCount,1);
  assert.ok(ok('guide').topics.some(topic=>topic.id==='tape'));
  assert.deepEqual(ok('guide','tape','stamps').guides.map(g=>g.id),['tape','stamps']);
  assert.equal(ok('guide','美式拼贴').guides[0].title,'美式拼贴');
  assert.match(run('guide','not-a-method').stderr,/GUIDE_TOPIC_UNKNOWN/);
  assert.deepEqual(await readFile(join(dir,'scene.json')),sceneBeforeGuide);
  assert.equal(JSON.parse(run('pack','--help').stdout).readOnly,true);
  assert.equal(JSON.parse(run('review','--help').stdout).readOnly,true);
  assert.equal((await read('scene.json')).page.layers.length,0);
  const commands=batch([material('hero','m1',mm(60,70)),text('title','一张蓝纸的今天',60,20,70,22),{op:'graphic.add',id:'dot',geometry:{kind:'ellipse'},place:mm(85,38),size:{width:8,height:8,unit:'mm'},style:{fill:'#d5e2d6'}},decision('m1')]);
  await write('work/commands.json',commands);
  const lock=join(dir,'work/.scene-write-lock');await mkdir(lock);await writeFile(join(lock,'owner.json'),JSON.stringify({pid:999999999,host:hostname(),createdAt:Date.now()-120000,token:'stale'}));await utimes(lock,new Date(Date.now()-120000),new Date(Date.now()-120000));
  ok('apply','work/commands.json');assert.equal(ok('apply','work/commands.json').replayed,true);
  const compact=ok('preview');assert.equal(compact.path,'output/preview.png');assert.equal(compact.geometryReview,undefined);assert.equal(compact.pixelReview,undefined);assert.ok(JSON.stringify(compact).length<1200);const saved=await read(compact.diagnosticsPath);assert.equal(saved.pngHash,compact.pngHash);const preview=ok('preview','--full');assert.equal(preview.pngHash,compact.pngHash);assert.equal(preview.geometryReview.pages.length,1);assert.equal(preview.geometryReview.materialFrames.length,0);assert.deepEqual(preview.geometryReview.graphicVocabulary,{kinds:['ellipse'],inkStrokes:0,pages:{page:1}});assert.equal(preview.pixelReview.pages.length,1);assert.ok(preview.pixelReview.pages[0].estimatedVisibleCoverage>0);ok('pack');
  const png=await readFile(join(dir,'output/preview.png'));assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(importEditableWork(await readFile(join(dir,'output/project.shiyeproject.json'),'utf8'),assets).drafts[0].items.length,1);
  const capture=await read('output/preview-capture.json');assert.equal(capture.rendererBackend,'node-canvas@3.2.3');assert.equal(capture.fonts,'Ma Shan Zheng (bundled)');assert.equal(capture.pixelReview.pages.length,1);assert.equal(ok('fonts').recommended.hand,'Ma Shan Zheng');
  const forged=Buffer.from(png);forged[forged.length-1]^=1;capture.pngHash='sha256:'+createHash('sha256').update(forged).digest('hex');await writeFile(join(dir,'output/preview.png'),forged);await write('output/preview-capture.json',capture);
  assert.match(run('pack').stderr,/PREVIEW_STALE/);ok('preview');
  const scene=await read('scene.json');scene.page.paperColor='#eeeeee';await write('scene.json',scene);assert.match(run('pack').stderr,/PREVIEW_STALE/);
 });
});
test('tape commands render and pack in Node without a browser document',async()=>{
 const tape={...paper('tape',60,12),kind:'tape',tapeAxis:'x',tapeRepeatMode:'repeatablePattern',tapeRepeatStartMM:0,tapeRepeatEndMM:20};
 await withPackage([tape],async({ok,read,apply})=>{
  await apply([{op:'material.tape',id:'tape-join',asset:'m1',lengthMm:22,widthMm:12,place:mm(40,50),texture:{mode:'repeat'},caps:{start:'torn',end:'angled',depthMm:.7}},decision('m1','crafted')]);
  assert.equal(ok('preview').ok,true);ok('pack');
  const output=await read('output/project.shiyeproject.json');
  assert.equal(output.page.layers[0].tapeStrip.textureMode,'repeat');
 });
});
test('one public protocol exposes executable help and delivers mask vector ink text',async()=>{
 await withPackage([paper('photo',30,20)],async({files,dir,ok,read,apply})=>{
  const help=ok('help');assert.equal(help.protocolVersion,2);assert.equal(help.operations.length,Object.keys(creationCommandRegistry).length);
  const described=ok('describe','material.add','text.add','graphic.add');assert.equal(described.descriptions.length,3);for(const [index,topic] of ['material.add','text.add','graphic.add'].entries()){const {ok:_,...single}=ok('describe',topic);assert.deepEqual(described.descriptions[index],single);}
  assert.ok(help.operations.some(row=>row.name==='material.glyphKnockout'));assert.ok(help.operations.every(row=>!row.name.startsWith('native.')));assert.ok(help.topics.includes('place'));
  assert.doesNotMatch(new TextDecoder().decode(files['api/commands.schema.json']),/native\./);
  assert.equal((await read('work/commands.json')).protocolVersion,2);ok('begin','work/next.json','--protocol=2');assert.equal((await read('work/next.json')).protocolVersion,2);
  await apply([material('photo','m1',ratio(.5,.4)),{op:'material.cut',mode:'keep',target:'photo',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,.5,1]}},{op:'layer.mask',target:'photo',region:{shape:'ellipse',space:'local',unit:'ratio',box:[0,0,1,1]},mode:'replace'},
   {op:'text.add',id:'caption',content:'这张照片让我想起今天。',place:{reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,5],unit:'mm'}},size:{width:60,unit:'mm'},style:{fontSizePt:12,color:'#334d4a'}},
   {op:'graphic.add',id:'triangle',geometry:{kind:'path',paths:[{d:'M0 10 L5 0 L10 10 Z',style:{fill:'#aabbcc'}}],viewBox:[0,0,10,10]},place:ratio(.2,.2),size:{width:10,height:10,unit:'mm'}},
   {op:'graphic.add',id:'stroke',geometry:{kind:'stroke',points:[{x:0,y:0},{x:20,y:0}],unit:'mm'},place:ratio(.5,.8),style:{strokeWidthMm:2,stroke:'#334d4a',penStyle:'marker'}},decision('m1','crafted')]);
  ok('preview');ok('pack');const output=await read('output/project.shiyeproject.json'),m=output.page.layers.find(n=>n.type==='material');assert.ok(m.vectorMask);assert.ok(m.materialMask);assert.ok(m.materialMask.outer.every(([x])=>x<=.5+1e-8));assert.equal(m.cropRect?.width??1,1);
  for(const type of ['material','text','shape','ink'])assert.equal(output.page.layers.filter(n=>n.type===type).length,1);
  assert.equal((await readFile(join(dir,'output/project.shiyeproject.json'),'utf8')).includes('\n'),false);
 });
});
test('named physical windows and weave survive PNG and project delivery',async()=>{
 const assets=[paper('frame',140,80),paper('strip',160,8)],p=project('开窗穿插',{mode:'spread',ratio:'a5'});p.processing='自由拆解';
 await withPackage(assets,async({ok,read,apply})=>{
  await apply([material('frame','m1',mm(150,100)),material('strip','m2',mm(150,100)),
   {op:'material.window',target:'frame',region:{shape:'rect',space:'local',unit:'ratio',box:[.1,.2,.15,.6]},windowId:'left-window'},
   {op:'material.window',target:'frame',region:{shape:'rect',space:'local',unit:'ratio',box:[.75,.2,.15,.6]},windowId:'right-window'},
   {op:'material.weave',strip:'strip',through:[{target:'frame',window:'left-window',sideAfter:'front'},{target:'frame',window:'right-window',sideAfter:'back'}]},decision('m1','crafted'),decision('m2','crafted')]);
  ok('preview');ok('pack');const output=await read('output/project.shiyeproject.json'),frame=output.page.layers.find(n=>n.creativePieceID==='frame'),strip=output.page.layers.find(n=>n.creativePieceID==='strip');
  assert.deepEqual(frame.craftWindowIDs,['left-window','right-window']);assert.equal(frame.materialMask.holes.length,2);assert.ok(strip.craftDisplaySlices?.length);
 },{p});
});
test('physical split keeps its offcut through check apply preview pack and reopen',async()=>{
 const assets=[paper('sheet',100,80)],p=project('实体分片',{ratio:'a5'});p.processing='自由拆解';
 await withPackage(assets,async({dir,ok,read,write,batch})=>{
  await write('work/commands.json',batch([material('parent','m1',ratio(.5,.45)),{op:'material.split',target:'parent',pieces:[{id:'left',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,.3,1]}},{id:'right',region:{shape:'rect',space:'source',unit:'ratio',box:[.4,0,.3,1]}}]},text('note','裁成两片，空下一条留给以后。',70,170,80,12),decision('m1','crafted')]));
  for(const action of ['check','apply','preview','pack'])ok(action,...(['check','apply'].includes(action)?['work/commands.json']:[]));
  const saved=await read('scene.json');assert.equal(saved.page.layers.filter(n=>n.type==='material'&&!n.isParked).length,2);assert.ok(saved.page.layers.some(n=>n.type==='material'&&n.isParked));
  assert.equal(importEditableWork(await readFile(join(dir,'output/project.shiyeproject.json'),'utf8'),assets).drafts[0].items.length,saved.page.layers.filter(n=>n.type==='material').length);
 },{p});
});
test('transactions rollback failures, reject stale/conflicting writes and retain no-op receipts',async()=>{
 await withPackage([paper()],async({dir,run,ok,read,write,batch})=>{
  const bad=batch([material('p','m1',mm(40,50)),{op:'layer.update',target:'p',style:{sourceBlobId:'forged'}}]);await write('work/commands.json',bad);
  const before=await readFile(join(dir,'scene.json')),failed=run('apply','work/commands.json');assert.equal(failed.status,1);assert.match(failed.stderr,/operations[\[/]1/);assert.deepEqual(await readFile(join(dir,'scene.json')),before);
  const good={...bad,transactionId:'good',operations:bad.operations.slice(0,1)};await write('work/commands.json',good);ok('apply','work/commands.json');const after=await readFile(join(dir,'scene.json'));ok('apply','work/commands.json');assert.deepEqual(await readFile(join(dir,'scene.json')),after);
  const changed={...good,operations:[{op:'page.update',paperColor:'#eeeeee'}]};await write('work/commands.json',changed);assert.match(run('apply','work/commands.json').stderr,/TRANSACTION_CONFLICT/);
  await write('work/commands.json',{...changed,transactionId:'stale'});assert.match(run('apply','work/commands.json').stderr,/REVISION_CONFLICT/);
  const current=ok('info').sceneRevision,currentColor=(await read('scene.json')).page.paperColor;
  for(const transactionId of ['noop-one','noop-two']){await write('work/commands.json',{protocolVersion:2,transactionId,baseSceneRevision:current,operations:[{op:'page.update',paperColor:currentColor}]});ok('apply','work/commands.json');assert.equal(ok('info').sceneRevision,current);}
  const receipts=(await read('scene.json')).v3Transactions;assert.ok(receipts['noop-one']&&receipts['noop-two']);
  await write('work/commands.json',{...good,protocolVersion:1});assert.match(run('apply','work/commands.json').stderr,/COMMAND_PROTOCOL_INVALID/);
 });
});
test('unified commands keep partition offcut windows weave and editable text without raw plans',async()=>{
 const assets=[paper('paper',100,80),paper('frame',140,80),paper('strip',160,8)],p=project('工艺示例',{mode:'spread',ratio:'a5'});p.processing='自由拆解';
 await withPackage(assets,async({dir,ok,read,apply})=>{
  await apply([
   material('sheet','m1',mm(55,155)),
   {op:'material.split',target:'sheet',pieces:[{id:'left',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,.4,1]},place:mm(35,155)},{id:'right',region:{shape:'rect',space:'source',unit:'ratio',box:[.4,0,.4,1]},place:mm(82,155)}]},
   {op:'material.edge',target:'left',edge:{style:'torn',edges:['bottom'],depthMm:1,periodMm:8,seed:42}},
   material('frame','m2',mm(150,95)),material('strip','m3',mm(150,95)),
   {op:'material.window',target:'frame',windowId:'a',region:{shape:'rect',space:'local',unit:'ratio',box:[.1,.2,.15,.6]}},
   {op:'material.window',target:'frame',windowId:'b',region:{shape:'rect',space:'local',unit:'ratio',box:[.75,.2,.15,.6]}},
   {op:'material.weave',strip:'strip',through:[{target:'frame',window:'a',sideAfter:'front'},{target:'frame',window:'b',sideAfter:'back'}]},
   text('caption','几片纸之间，也有今天的小故事。',145,175,95,20),
   {op:'graphic.add',id:'highlight',geometry:{kind:'stroke',points:[{x:0,y:0},{x:68,y:0}],unit:'mm'},place:mm(141,188),style:{strokeWidthMm:3,stroke:'#e8d66b',penStyle:'marker'}},
   ...['m1','m2','m3'].map(alias=>decision(alias,'crafted'))]);
  assert.ok((await read('scene.json')).page.layers.some(node=>node.isParked));ok('preview');ok('pack');assert.ok(importEditableWork(await readFile(join(dir,'output/project.shiyeproject.json'),'utf8'),assets).drafts[0].items.length>=4);
 },{p});
});
test('fixed recipes contain valid operation snippets rather than task-specific transactions',async()=>{
 const a=unzipSync(new Uint8Array(await (await makeTask([paper()],'甲')).blob.arrayBuffer())),b=unzipSync(new Uint8Array(await (await makeTask([paper()],'乙')).blob.arrayBuffer()));
 for(const path of ['START_HERE.md','design/SKILL.md','design/PLAYBOOK.md','design/REVIEW.md','design/LETTERING.md','design/GRAPHICS.md','design/RECIPES.md','api/fixed-release.json'])assert.deepEqual(a[path],b[path],path);
 assert.equal(a['design/CRAFT_GUIDE.md'],undefined);
 for(const path of ['design/SKILL.md','design/PLAYBOOK.md','design/REVIEW.md','design/LETTERING.md']){
  const prose=new TextDecoder().decode(a[path]);assert.doesNotMatch(prose,/4849|4850|4851|4852|4853|教程视频/);
  assert.match(prose,/文字|正文/);
 }
 assert.match(new TextDecoder().decode(a['START_HERE.md']),/design\/SKILL\.md/);
 assert.notDeepEqual(a['TASK.json'],b['TASK.json']);const guide=new TextDecoder().decode(a['design/RECIPES.md']);assert.doesNotMatch(guide,/sha256:[a-f0-9]{64}/);
 const letters=new TextDecoder().decode(a['design/LETTERING.md']);
 assert.match(new TextDecoder().decode(a['design/SKILL.md']),/素材稀少/);assert.match(new TextDecoder().decode(a['design/REVIEW.md']),/大片|大块/);
 for(const match of letters.matchAll(/```json\n([\s\S]*?)\n```/g))validateCreationV2Commands({protocolVersion:2,transactionId:'letter-recipe',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[JSON.parse(match[1])]});
 const operations=[...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match=>JSON.parse(match[1]));assert.ok(operations.length>=20);
 for(const operation of operations)validateCreationV2Commands({protocolVersion:2,transactionId:'recipe',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[operation]});
});
test('forcing an unavailable node backend reports the current self-test command and never invents PNG',async()=>{
 await withPackage([paper()],async({dir,run})=>{
  const self=run('self-test');assert.equal(self.status,1);assert.match(self.stdout,/npm install/);assert.match(self.stdout,/node runtime\/shiye.cjs self-test/);
  const preview=run('preview');assert.equal(preview.status,1);assert.match(preview.stderr,/npm install/);await assert.rejects(readFile(join(dir,'output/preview.png')),{code:'ENOENT'});
 },{canvas:false});
});
test('check and proposal leave Scene unchanged; unified text update and review deliver exact units',async()=>{
 await withPackage([paper()],async({dir,run,ok,read,write})=>{
  const before=await readFile(join(dir,'scene.json'));assert.equal(ok('describe','material.split').name,'material.split');ok('begin','work/draft.json');assert.match(run('begin','work/draft.json').stderr,/DRAFT_EXISTS/);
  const commands=await read('work/draft.json');commands.operations=[material('piece','m1',mm(30,40)),text('caption','真实字号',55,20,40,12),{op:'layer.update',target:'caption',style:{fontSizePt:10},place:mm(60,25)},decision('m1')];await write('work/draft.json',commands);
  ok('check','work/draft.json');assert.deepEqual(await readFile(join(dir,'scene.json')),before);ok('preview','--commands','work/draft.json');assert.deepEqual(await readFile(join(dir,'scene.json')),before);await assert.rejects(readFile(join(dir,'output/preview.png')),{code:'ENOENT'});
  for(const args of [['--full','--commands','work/draft.json'],['--commands','work/draft.json','--full']]){assert.equal(ok('preview',...args).proposal,true);assert.deepEqual(await readFile(join(dir,'scene.json')),before);await assert.rejects(readFile(join(dir,'output/preview.png')),{code:'ENOENT'});}
  assert.match(run('preview','--full','--commands').stderr,/COMMAND_PATH_INVALID/);await assert.rejects(readFile(join(dir,'output/preview.png')),{code:'ENOENT'});
  ok('apply','work/draft.json');const scene=await read('scene.json'),caption=scene.page.layers.find(n=>n.agentKey==='caption'),scale=scene.page.canvas.height/scene.page.physicalPageHeightMM;
  assert.ok(Math.abs(caption.fontSize-10*25.4/72*scale)<1e-6);assert.ok(Math.abs(caption.x-60*scale)<1e-6);ok('preview');const review=ok('review','--result','pass');assert.ok(Array.isArray(review.geometryAdvisories));assert.equal(review.pixelReview.pages.length,1);assert.match(review.reminder,/创作者声明/);ok('pack');assert.deepEqual((await read('output/manifest.json')).visualReview,{result:'pass',source:'agent-declared'});
 });
});
test('review records agent judgement without imposing an aesthetic graphic quota',async()=>{
 const p=project('手绘完成态',{mode:'spread',ratio:'b6'});p.styles=['手作便签','丰富层叠'];
 await withPackage([paper()],async({run,ok,read,apply})=>{
  await apply([material('paper','m1',mm(42,72)),text('note','今天把这张纸留下。',32,105,68,12),decision('m1')]);
  assert.match(run('review','pass').stderr,/PREVIEW_STALE/);ok('preview');assert.equal(ok('review','pass').source,'agent-declared');
  await apply([{op:'graphic.add',id:'paper-edge',geometry:{kind:'sketch',motif:'corner',seed:23},place:{reference:'node:paper',at:[.05,.05],unit:'ratio'},size:{width:22,height:22,unit:'mm'},style:{fill:null,stroke:'#799897',strokeWidthMm:.55}}]);
  const scene=await read('scene.json'),mark=scene.page.layers.find(node=>node.id==='paper-edge');
  assert.equal(mark.kind,'vector');assert.ok(mark.svgPaths[0].d.startsWith('M'));
  ok('preview');assert.equal(ok('review','pass').result,'pass');assert.equal(ok('pack').visualReview.result,'pass');
 },{p});
});
test('eight required materials survive revisions grouping preview delivery and reopen',async()=>{
 const assets=Array.from({length:8},(_,i)=>paper('required-'+i,20,24)),p=project('八件素材双页',{mode:'spread',ratio:'b6'});p.requiredAssetIDs=assets.map(a=>a.id);
 await withPackage(assets,async({dir,ok,read,apply})=>{
  assert.ok((await read('TASK.json')).materials.every(m=>m.selection==='required'));
  await apply([...assets.map((a,i)=>material('piece-'+i,'m'+(i+1),mm(25+(i%4)*44,40+Math.floor(i/4)*43))),...assets.map((a,i)=>decision('m'+(i+1)))]);
  await apply([text('title','把今天留在纸上',80,16,95,18),text('note','八件小东西有各自的位置，也可以组成同一段记忆。',190,145,80,10),{op:'graphic.add',id:'accent',geometry:{kind:'ellipse'},place:mm(145,18),size:{width:7,height:7,unit:'mm'},style:{fill:'#d5e2d6'},order:{after:'title'}},{op:'group.create',id:'heading-group',targets:['title','accent']},{op:'layer.update',target:'heading-group',place:mm(115,20)}]);
  await apply([{op:'layer.update',target:'note',style:{fontSizePt:11},place:mm(185,142),content:'八件小东西有各自的位置。\n把它们放在一起，今天就有了形状。'}]);ok('preview');ok('pack');assert.equal((await read('scene.json')).materialDecisions.length,8);assert.equal(importEditableWork(await readFile(join(dir,'output/project.shiyeproject.json'),'utf8'),assets).drafts[0].items.length,8);
 },{p});
});
