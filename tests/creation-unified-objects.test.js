import test from 'node:test';
import assert from 'node:assert/strict';
import {createCreationAgentSession} from '../src/creation-agent-session.js';
import {draft} from '../src/domain.js';
import {worldBox} from '../src/scene-spatial.js';
import {itemSourceGeometry} from '../src/craft-region-ops.js';
import {geometryArea,geometryIntersection} from '../src/craft-topology.js';
import {splitLineGeometry} from '../src/creation-split-geometry.js';
const position={reference:'page',at:[55,65],unit:'mm',rotationDeg:17};
async function fixture(){
 const asset={id:'paper-source',title:'纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}};
 const session=await createCreationAgentSession({draft:draft(),assets:[asset],aliases:{m1:asset.id}});let serial=0;
 const apply=async(operations,ok=true)=>{const r=await session.execute([{name:'creation_apply',arguments:{protocolVersion:2,transactionId:'objects-'+serial++,baseSceneRevision:session.revision,operations}}]);assert.equal(r.results[0].ok,ok,JSON.stringify(r));return r;};
 const nodes=()=>{const visit=ns=>ns.flatMap(n=>[n,...visit(n.children||[])]);return visit(session.draft.layers);};
 const node=id=>nodes().find(n=>n.id===id||n.agentKey===id||n.creativePieceID===id);
 return {session,apply,node,asset};
}
test('new objects park by default; titles and paper update using their creation fields',async()=>{
 const {session,apply,node}=await fixture();
 await apply([{op:'paper.add',id:'p',size:{width:65,height:90,unit:'mm'},style:{fill:'#CADCE5'},texture:'rough'}, {op:'title.add',id:'t',content:'出门',size:{width:60,unit:'mm'},style:{fontSizePt:26,color:'#354C60'},effect:'outline'}]);
 assert.equal(node('p').isParked,true);assert.equal(node('t').isParked,true);
 await apply([{op:'layer.update',target:'p',place:position,pattern:'grid'},{op:'layer.update',target:'t',place:position,content:'今天出门',style:{fontSizePt:30},effect:'offset-outline'}]);
 assert.equal(node('p').fill,'#CADCE5');assert.equal(node('p').shapeOptions.paperPattern,'grid');
 assert.equal(node('t').creationObject.parameters.style.color,'#354C60');assert.equal(node('t').creationObject.parameters.style.fontSizePt,30);
 const before=worldBox(session.draft,node('t').id);
 await apply([{op:'layer.update',target:'t',style:{color:'#FF4422'}}]);
 const after=worldBox(session.draft,node('t').id);assert.equal(after.rotation,before.rotation);assert.equal(after.cx,before.cx);assert.equal(after.cy,before.cy);
});
test('ungroup outputs retain positions unless individually placed',async()=>{
 const {session,apply,node}=await fixture();
 await apply([{op:'graphic.add',id:'a',geometry:{kind:'ellipse'},size:{width:10,height:10,unit:'mm'},place:position},{op:'text.add',id:'b',content:'记',size:{width:20,unit:'mm'},place:{...position,at:[80,90]}},{op:'group.create',id:'g',targets:['a','b']}]);
 const before=worldBox(session.draft,node('b').id);
 await apply([{op:'group.ungroup',target:'g',pieces:[{id:node('a').id,place:{...position,at:[20,30]}}]}]);
 assert.deepEqual(worldBox(session.draft,node('b').id),before);assert.equal(node('g'),undefined);
});
test('angled split creates complementary physical pieces, independently places both, and rejects duplicate IDs atomically',async()=>{
 const {session,apply,node,asset}=await fixture();
 await apply([{op:'material.add',id:'p',asset:'m1',place:position}]);
 const revision=session.revision;
 await apply([{op:'layer.split',target:'p',split:{through:[.5,.45],unit:'ratio',rotationDeg:30},pieces:[{id:'a'},{id:'a'}]}],false);assert.equal(session.revision,revision);
 await apply([{op:'layer.split',target:'p',split:{through:[.5,.45],unit:'ratio',rotationDeg:30,edge:{style:'torn',seed:42}},pieces:[{id:'a',place:{...position,at:[30,40]}},{id:'b',place:{...position,at:[90,120]}}]}]);
 const a=itemSourceGeometry(node('a'),asset),b=itemSourceGeometry(node('b'),asset);
 assert.ok(Math.abs(geometryArea(a)+geometryArea(b)-8000)<1e-5);assert.equal(geometryArea(geometryIntersection(a,b)),0);
 assert.equal(node('p'),undefined);assert.notEqual(worldBox(session.draft,node('a').id).cx,worldBox(session.draft,node('b').id).cx);
});
test('generated paper splits and remains independently editable after serialization',async()=>{
 const {session,apply,node}=await fixture();
 await apply([{op:'paper.add',id:'p',size:{width:80,height:100,unit:'mm'},style:{fill:'#CADCE5'},edge:{style:'torn',edges:['bottom'],seed:42},place:position}]);
 await apply([{op:'layer.split',target:'p',split:{through:[.5,.5],unit:'ratio',rotationDeg:20,edge:{style:'torn',seed:2}},pieces:[{id:'a'},{id:'b'}]}]);
 assert.ok(node('a').vectorMask);assert.ok(node('b').vectorMask);assert.equal(node('a').fill,node('b').fill);
 const mask=structuredClone(node('a').vectorMask);
 await apply([{op:'layer.update',target:'a',style:{fill:'#FFF2D0'},texture:'rough'}]);
 assert.deepEqual(node('a').vectorMask,mask);assert.equal(node('b').fill,'#CADCE5');
 assert.deepEqual(JSON.parse(JSON.stringify(session.draft.layers)),session.draft.layers);
});
test('paper and material torn edges accept omitted seeds through the same command schema',async()=>{
 const {apply,node}=await fixture();
 await apply([
  {op:'paper.add',id:'generated',size:{width:40,height:50,unit:'mm'},style:{fill:'#EDEBE4'},edge:{style:'torn',edges:['bottom']},place:position},
  {op:'material.add',id:'source',asset:'m1',place:position},
  {op:'material.edge',target:'source',edge:{style:'torn',edges:['top']}}
 ]);
 assert.ok(node('generated'));
 assert.ok(node('source').materialSteps.some(step=>step.op==='edge'));
});
test('split angle and position are deterministic in local millimetres',()=>{
 for(const angle of [0,30,90,-45,180]){
  const [a,b]=splitLineGeometry({through:[.5,.5],unit:'ratio',rotationDeg:angle,edge:{style:'torn',seed:5}},80,100);
  assert.ok(Math.abs(geometryArea(a)+geometryArea(b)-8000)<1e-6);assert.equal(geometryArea(geometryIntersection(a,b)),0);
 }
});

test('sparse title effects, paper edges and physical material edges retain other parameters',async()=>{
 const {apply,node}=await fixture();
 await apply([{op:'title.add',id:'t',content:'日常',size:{width:50,unit:'mm'},style:{fontSizePt:24,color:'#344455'},effect:'outline',backdrop:{kind:'band',color:'#EEDDCC'}},{op:'paper.add',id:'p',size:{width:65,height:90,unit:'mm'},style:{fill:'#CADCE5'},edge:{style:'torn',edges:['bottom'],seed:17}},{op:'material.add',id:'m',asset:'m1'}]);
 await apply([{op:'layer.update',target:'t',style:{outline:{widthMm:.8}},backdrop:{color:'#CCDDEE'}},{op:'layer.update',target:'p',edge:{roughness:.6}},{op:'layer.update',target:'m',edge:{style:'torn',edges:['bottom'],seed:17}}]);
 assert.equal(node('t').creationObject.parameters.backdrop.kind,'band');assert.equal(node('p').creationObject.parameters.edge.seed,17);
 await apply([{op:'layer.update',target:'m',edge:{roughness:.5}}]);
 assert.deepEqual(node('m').materialSteps.at(-1).edges,['bottom']);
});

test('rotated rectangle cropping and fresh split default placement use the shared contract',async()=>{
 const {apply,node,session,asset}=await fixture();
 await apply([{op:'paper.add',id:'p',size:{width:80,height:100,unit:'mm'},style:{fill:'#CADCE5'},place:position},{op:'layer.cut',target:'p',mode:'keep',region:{shape:'rect',space:'local',unit:'ratio',box:[.25,.3,.5,.4],rotationDeg:20}}]);
 assert.ok(node('p').vectorMask);const mask=structuredClone(node('p').vectorMask);
 await apply([{op:'layer.update',target:'p',edge:{style:'clean'}}]);assert.deepEqual(node('p').vectorMask,mask);
 await apply([{op:'material.split',asset:'m1',pieces:[{id:'top',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,1,.5]}},{id:'bottom',region:{shape:'rect',space:'source',unit:'ratio',box:[0,.5,1,.5]},place:position}]}]);
 assert.equal(node('top').isParked,true);assert.equal(node('bottom').isParked,false);
 assert.ok(Math.abs(worldBox(session.draft,node('bottom').id).cx/session.draft.canvas.height*session.draft.physicalPageHeightMM-55)<1e-6);
});

test('cut paper anchors and linked placement use surviving visible bounds',async()=>{
 const {creationPlacementBox}=await import('../src/creation-placement.js');
 const {session,apply,node}=await fixture();
 await apply([{op:'paper.add',id:'p',size:{width:80,height:100,unit:'mm'},style:{fill:'#CADCE5'},place:position},{op:'layer.split',target:'p',split:{through:[.5,.5],unit:'ratio',rotationDeg:0},pieces:[{id:'bottom',place:{reference:'page',at:[20,30],anchor:'top-left',rotationDeg:0,unit:'mm'}},{id:'top',place:{reference:'node:bottom',referenceAnchor:'bottom-right',anchor:'bottom-right',rotationDeg:0,behavior:'linked'}}]}]);
 const s=session.draft.canvas.height/session.draft.physicalPageHeightMM;
 const b=creationPlacementBox(session.draft,node('bottom').id);
 assert.ok(Math.abs((b.cx-b.w/2)/s-20)<1e-6);assert.ok(Math.abs((b.cy-b.h/2)/s-30)<1e-6);
 await apply([{op:'layer.update',target:'bottom',place:{at:[40,60],unit:'mm',anchor:'top-left',reference:'page'}}]);
 const lower=creationPlacementBox(session.draft,node('bottom').id),upper=creationPlacementBox(session.draft,node('top').id);
 assert.ok(Math.abs(lower.cx+lower.w/2-upper.cx-upper.w/2)<1e-6);assert.ok(Math.abs(lower.cy+lower.h/2-upper.cy-upper.h/2)<1e-6);
});

test('semantic objects survive reopening; unsupported changes and locked children roll back',async()=>{
 const {apply,node,session,asset}=await fixture();
 await apply([{op:'title.add',id:'t',content:'再出发',size:{width:60,unit:'mm'},style:{fontSizePt:24,color:'#344455'},effect:'outline'},{op:'paper.add',id:'p',size:{width:60,height:80,unit:'mm'},style:{fill:'#CCDDEE'}}]);
 const {applyCreationTransaction,creationSceneRevision}=await import('../src/creation-transaction.js');
 const reopened=JSON.parse(JSON.stringify(session.document));
 const restored=applyCreationTransaction(reopened,{protocolVersion:2,transactionId:'reopened',baseSceneRevision:creationSceneRevision(reopened),operations:[{op:'layer.update',target:'t',effect:'hollow'},{op:'layer.update',target:'p',texture:'rough'}]},[asset]);
 assert.equal(restored.document.page.layers.find(n=>n.id==='t').creationObject.parameters.effect,'hollow');
 let revision=session.revision;
 await apply([{op:'layer.update',target:'t',size:{unit:'ratio',width:.5}}],false);assert.equal(session.revision,revision);
 await apply([{op:'layer.update',target:'p',geometry:{kind:'ellipse'}}],false);assert.equal(session.revision,revision);
 const child=node('t').children.find(n=>n.type==='text');await apply([{op:'layer.update',target:child.id,locked:true}]);revision=session.revision;
 await apply([{op:'layer.update',target:'t',content:'不能覆盖'}],false);assert.equal(session.revision,revision);
});

test('nested title and paper outputs preserve workspace and independent placement',async()=>{
 const {apply,node,session}=await fixture();
 await apply([{op:'group.compose',id:'g',layoutBox:{width:100,height:120,unit:'mm'},place:position,children:[
  {op:'paper.add',id:'p',size:{width:70,height:90,unit:'mm'},style:{fill:'#CADCE5'}},
  {op:'title.add',id:'t',content:'日常',size:{width:50,unit:'mm'},style:{color:'#344455',fontSizePt:24},effect:'outline'}
 ]}]);
 assert.ok(node('g').children.some(n=>n.id==='t'));assert.ok(node('g').children.some(n=>n.id==='p'));
 await apply([{op:'layer.update',target:'t',style:{color:'#AA4433'}},{op:'layer.split',target:'p',split:{through:[.5,.5],unit:'ratio',rotationDeg:0},pieces:[{id:'a'},{id:'b',place:{surface:'tray',reference:'page',at:[30,40],unit:'mm'}}]}]);
 assert.ok(node('g').children.some(n=>n.id==='a'));assert.ok(!node('g').children.some(n=>n.id==='b'));assert.equal(node('b').isParked,true);
 const before=worldBox(session.draft,node('a').id);
 await apply([{op:'group.ungroup',target:'g',pieces:[{id:'t',place:{surface:'tray',reference:'page',at:[30,70],unit:'mm'}}]}]);
 assert.deepEqual(worldBox(session.draft,node('a').id),before);assert.equal(node('t').isParked,true);
});

test('lettering error identifies the actual valid indices and rolls back its batch',async()=>{
 const {apply,session,node}=await fixture();const revision=session.revision;
 const result=await apply([{op:'paper.add',id:'p',size:{width:60,height:80,unit:'mm'},style:{fill:'#CCDDEE'}},{op:'text.lettering',id:'t',content:'把冬天抱进手里',letters:[{index:7,rotationDeg:5}]}],false);
 assert.match(JSON.stringify(result),/共 7 个字素/);assert.match(JSON.stringify(result),/0–6/);
 assert.equal(session.revision,revision);assert.equal(node('p'),undefined);
});
