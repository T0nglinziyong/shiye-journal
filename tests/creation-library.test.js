import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision,applyCreationTransaction} from '../src/creation-transaction.js';
import {templateCatalog,rankTemplates,scoreTemplate,templateMarginalScores,maximumAssignment,materialSlots} from '../src/creation-library/matcher.js';
import {compileTemplate} from '../src/creation-library/compiler.js';
import {templateFixture,isGraphicElement} from '../src/creation-library/template-elements.js';
import {techniqueCatalog,compileTechnique,describeTechnique} from '../src/creation-library/techniques.js';
import {exampleMaterials,techniqueExample} from '../src/creation-library/examples.js';
import {worldBox} from '../src/scene-spatial.js';
const document=assets=>createCreationDocument({draft:draft({ratio:'a5'}),assets,aliases:Object.fromEntries(assets.map(a=>[a.alias,a.id]))});
const apply=(doc,operations,assets)=>applyCreationTransaction(doc,{protocolVersion:2,transactionId:'library-test',baseSceneRevision:creationSceneRevision(doc),operations},assets);

test('at least fifty independently sourced, reviewed diagrams have usable typed elements',()=>{
 assert.ok(templateCatalog.templates.length>=50);const panels=new Set();
 for(const t of templateCatalog.templates){assert.equal(t.reviewed,true);assert.ok(templateCatalog.sources.some(s=>s.id===t.sourceId));assert.ok(t.elements.length>2);assert.ok(materialSlots(t).length);assert.ok(t.aspect>0);panels.add(t.sourcePanel.sha256);
  for(const e of t.elements){assert.equal(e.box.length,4);assert.ok(e.box.every(Number.isFinite));assert.ok(e.box[2]>0&&e.box[3]>0);assert.ok(isGraphicElement(e)?e.render.geometry.kind:e.accepts.length);if(e.render?.textBox)assert.ok(e.render.textBox.every(Number.isFinite)&&e.render.textBox[2]>0&&e.render.textBox[3]>0,t.id+'/'+e.id+' writing bounds');}}
 assert.equal(panels.size,templateCatalog.templates.length);
});
test('optimal assignment beats a greedy slot choice and permits omission',()=>{
 assert.deepEqual(maximumAssignment([[.9,.8,.34,.34],[.85,.2,.34,.34]]),[1,0]);
 assert.equal(maximumAssignment([[.2,.34]])[0],1);
});
test('matching distinguishes absolute paper ratios and material-to-material ratios',()=>{
 const t=templateCatalog.templates.find(t=>t.id==='single-04'),paper={width:148,height:210};
 const assets=materialSlots(t).map((s,i)=>({id:'m'+i,kind:s.accepts[0],role:s.role,physicalWidthMM:s.box[2]*148,physicalHeightMM:s.box[3]*210}));
 const exact=scoreTemplate(t,assets,paper),large=scoreTemplate(t,assets,{width:296,height:420});assert.ok(exact.score>large.score+10);assert.ok(Math.abs(exact.components.relationships-1)<1e-10);
 const uneven=assets.map((a,i)=>i?{...a,physicalWidthMM:a.physicalWidthMM*2}:a);assert.ok(scoreTemplate(t,uneven,paper).components.relationships<1);
});
test('adding a missing compatible material improves the same template, duplicate oversize does not',()=>{
 const t=templateCatalog.templates.find(t=>t.id==='single-04'),slots=materialSlots(t),paper={width:148,height:210};
 const make=(s,id)=>({id,kind:s.accepts[0],role:s.role,physicalWidthMM:s.box[2]*148,physicalHeightMM:s.box[3]*210});
 const selected=[make(slots[0],'m1')],good=make(slots[1],'good'),bad={...good,id:'bad',physicalWidthMM:1000};
 const scores=templateMarginalScores({selected,candidates:[good,bad],paper,templates:[t]});assert.ok(scores.get('good').utility>scores.get('bad').utility);assert.equal(scores.get('good').templateId,t.id);
});
test('correct type and style cannot force an oversized material into a small slot',()=>{
 const t={id:'size-first',title:'尺寸优先',family:'test',aspect:1,styles:['复古'],elements:[{id:'e1',role:'focal',box:[.4,.4,.2,.2],accepts:['sticker'],styles:['复古']}]};
 const material={id:'large',kind:'sticker',role:'focal',styleTags:['复古'],physicalWidthMM:80,physicalHeightMM:80};
 const result=scoreTemplate(t,[material],{width:100,height:100});
 assert.deepEqual(result.assignments,[]);assert.deepEqual(result.unused,['large']);
});
for(const template of templateCatalog.templates)test('template compiles through real transaction: '+template.id,async()=>{
 const assets=materialSlots(template).slice(0,5).map((s,i)=>({id:'test-'+i,alias:'m'+i,title:'模板验收素材',kind:'paper',physicalWidthMM:s.box[2]*148,physicalHeightMM:s.box[3]*210,supply:{quantity:1}}));
 const doc=await document(assets),result=compileTemplate({templateId:template.id,id:'layout',paper:{width:148,height:210},materials:assets,title:'今天的小记'});
 const done=apply(doc,result.operations,assets);assert.equal(done.changed,true);assert.ok(result.report.used.length);
 const mats=result.operations[0].children.filter(o=>o.op==='material.add');assert.ok(mats.every(m=>!('size' in m)));assert.equal(new Set(mats.map(m=>m.asset)).size,mats.length);
});
for(const method of techniqueCatalog.methods)test('technique transaction is executable: '+method.id,async()=>{
 const {parameters,before}=techniqueExample(method),doc=await document(exampleMaterials),compiled=compileTechnique({methodId:method.id,parameters,materials:exampleMaterials});
 const result=apply(doc,[...before,...compiled.operations],exampleMaterials);assert.equal(result.changed,true);assert.equal(describeTechnique(method.id).illustration?.id,method.illustration?.id);
 if(!compiled.report.groupId)return;
 const page=result.document.page,group=page.layers.find(node=>node.id===compiled.report.groupId),box=worldBox(page,group.id),angle=box.rotation*Math.PI/180;
 const pageHalfX=(Math.abs(Math.cos(angle))*box.w+Math.abs(Math.sin(angle))*box.h)/2;
 const pageHalfY=(Math.abs(Math.sin(angle))*box.w+Math.abs(Math.cos(angle))*box.h)/2;
 assert.ok(box.cx-pageHalfX>=-.25&&box.cx+pageHalfX<=page.canvas.width+.25,method.id+' page width');
 assert.ok(box.cy-pageHalfY>=-.25&&box.cy+pageHalfY<=page.canvas.height+.25,method.id+' page height');
 for(const child of group.children){
  const cb=worldBox(page,child.id),relative=(cb.rotation-box.rotation)*Math.PI/180;
  const x=(cb.cx-box.cx)*Math.cos(angle)+(cb.cy-box.cy)*Math.sin(angle);
  const y=-(cb.cx-box.cx)*Math.sin(angle)+(cb.cy-box.cy)*Math.cos(angle);
  const dx=(Math.abs(Math.cos(relative))*cb.w+Math.abs(Math.sin(relative))*cb.h)/2;
  const dy=(Math.abs(Math.sin(relative))*cb.w+Math.abs(Math.cos(relative))*cb.h)/2;
  assert.ok(x-dx>=-box.w/2-.5&&x+dx<=box.w/2+.5,method.id+'/'+child.id+' group width');
  assert.ok(y-dy>=-box.h/2-.5&&y+dy<=box.h/2+.5,method.id+'/'+child.id+' group height');
 }
});
test('basic tools keep executable examples without illustration assets',()=>{
 const basicRecipes=new Set(['graphic','relate','tear','window','split','weave','write']);
 const basicPatterns=new Set(['pattern-dots','pattern-stripes','pattern-grid','pattern-scallop']);
 for(const method of techniqueCatalog.methods.filter(method=>basicRecipes.has(method.recipe)||basicPatterns.has(method.id))){
  const detail=describeTechnique(method.id);
  assert.equal(detail.illustration,undefined,method.id);
  assert.ok(detail.tool.arguments.parameters.id,method.id);
  assert.ok(compileTechnique({methodId:method.id,parameters:detail.tool.arguments.parameters,materials:exampleMaterials}).operations.length,method.id);
 }
});
test('missing slots remain empty; unknown source and repeated material are rejected',()=>{
 const t=templateCatalog.templates[0],paper={width:148,height:210},s=materialSlots(t);
 const empty=compileTemplate({templateId:t.id,id:'g',paper,materials:[]});
 assert.deepEqual(empty.report.used,[]);
 assert.ok(empty.operations[0].children.every(n=>n.op==='graphic.add'));
 assert.throws(()=>compileTemplate({templateId:t.id,id:'g',paper,materials:[],omit:t.elements.filter(isGraphicElement).map(e=>e.id)}),/没有可放置/);
 assert.throws(()=>compileTemplate({templateId:t.id,id:'g',paper,materials:[],bindings:[{slotId:s[0].id,alias:'secret'}]}),/授权/);
 assert.throws(()=>compileTemplate({templateId:t.id,id:'g',paper,materials:[{alias:'m1'}],bindings:[{slotId:s[0].id,alias:'m1'},{slotId:s[1].id,alias:'m1'}]}),/重复/);
});
test('long titles retain their full content and unsupported parameters are explicit errors',async()=>{
 const text='很长的标题需要根据可用空间分行而不能丢掉后半段'.repeat(3),compiled=compileTechnique({methodId:'title-stack',parameters:{id:'long',text,widthMm:44}});
 assert.equal(compiled.operations[0].children.find(o=>o.op==='text.add').content,text);assert.ok(compiled.report.heightMm>38);
 const doc=await document([]);assert.equal(apply(doc,compiled.operations,[]).changed,true);
 assert.throws(()=>compileTechnique({methodId:'title-label',parameters:{id:'x',text:'你好',dangerous:1}}),/不支持/);
});
test('underline follows the final wrapped line and remains valid when the caption repeats the title',async()=>{
 const parameters={id:'under',text:'一二三四五六七八九十',caption:'一二三四五六七八九十',fontSizePt:20,widthMm:35};
 const compiled=compileTechnique({methodId:'title-underline',parameters});
 const children=compiled.operations[0].children,underline=children.find(o=>o.id==='under-underline');
 const text=children.find(o=>o.op==='text.add');
 assert.equal(text.content,parameters.text);
 assert.ok(underline.geometry.points.at(-1).x<15,'underline should use the short last line');
 assert.ok(underline.place.at.every(Number.isFinite));
 assert.equal(apply(await document([]),compiled.operations,[]).changed,true);
});
test('postmark lesson renders a circular editable label, with caption outside the ring',()=>{
 const result=compileTechnique({methodId:'vintage-postmark',parameters:{id:'seal',text:'旅途',caption:'小记'}});
 const children=result.operations[0].children,ring=children.find(op=>op.op==='graphic.add'),label=children.find(op=>op.op==='text.add'&&op.content==='旅途'),caption=children.find(op=>op.op==='text.add'&&op.content==='小记');
 assert.equal(ring.geometry.kind,'ellipse');assert.equal(ring.size.width,ring.size.height);
 assert.equal(label.style.textAlign,'center');assert.ok(label.place.at[1]>ring.size.height*.2);
 assert.ok(caption.place.at[1]>ring.size.height);
 assert.throws(()=>compileTechnique({methodId:'vintage-postmark',parameters:{id:'seal',text:'这一行长到放不进圆里',widthMm:18}}),/超出圆形范围/);
});
test('diagonal layer lesson forms a connected cluster without scaling real materials',()=>{
 const compiled=compileTechnique({methodId:'layered-diagonal',parameters:{id:'layers',aliases:['m1','m2','m3']},materials:exampleMaterials});
 const children=compiled.operations[0].children.filter(op=>op.op==='material.add');
 for(let i=1;i<children.length;i++){
  const a=exampleMaterials.find(asset=>asset.alias===children[i-1].asset),b=exampleMaterials.find(asset=>asset.alias===children[i].asset);
  const dx=Math.abs(children[i].place.at[0]-children[i-1].place.at[0]),dy=Math.abs(children[i].place.at[1]-children[i-1].place.at[1]);
  assert.ok(dx<(a.physicalWidthMM+b.physicalWidthMM)/2);
  assert.ok(dy<(a.physicalHeightMM+b.physicalHeightMM)/2);
  assert.equal(children[i].size,undefined);
 }
});
test('quiet pair stays spaced apart while layered diagonal is connected',()=>{
 const quiet=compileTechnique({methodId:'quiet-pair',parameters:{id:'quiet',aliases:['m1','m2']},materials:exampleMaterials}).operations[0].children;
 const a=exampleMaterials[0],b=exampleMaterials[1],dx=Math.abs(quiet[1].place.at[0]-quiet[0].place.at[0]);
 assert.ok(dx>=(a.physicalWidthMM+b.physicalWidthMM)/2);
});
test('graphic lesson examples show their focal objects and route requires real waypoints',()=>{
 const route=describeTechnique('graphic-route');
 assert.equal(route.parameters.waypoints.required,true);
 assert.equal(route.example.prepare.filter(op=>op.op==='material.add').length,2);
 assert.equal(route.tool.arguments.parameters.waypoints.length,2);
 assert.throws(()=>compileTechnique({methodId:'graphic-route',parameters:{id:'route'}}),/需要两个以上真实焦点/);
 assert.throws(()=>compileTechnique({methodId:'graphic-route',parameters:{id:'route',waypoints:[[.2,.2],[1.2,.8]]}}),/区域内比例坐标/);
 for(const id of ['graphic-loop','graphic-corner','graphic-rays'])assert.ok(describeTechnique(id).example.prepare.length,id+' missing focal example');
});
test('photo-story examples use photographs for every material slot',()=>{
 for(const method of techniqueCatalog.methods.filter(m=>m.skill==='photo-story'&&['materials','film'].includes(m.recipe))){
  const aliases=techniqueExample(method).parameters.aliases;
  assert.ok(aliases.length>=2,method.id);
  for(const alias of aliases)assert.equal(exampleMaterials.find(asset=>asset.alias===alias)?.kind,'photo',method.id+'/'+alias);
 }
});
test('real accent example uses small physical items around a protected focal photo',()=>{
 const method=techniqueCatalog.methods.find(m=>m.id==='accent-materials'),example=techniqueExample(method);
 assert.equal(example.before.find(op=>op.id==='photo')?.asset,'m1');
 assert.deepEqual(example.parameters.aliases.map(alias=>exampleMaterials.find(asset=>asset.alias===alias)?.kind),['sticker','ticket']);
 const compiled=compileTechnique({methodId:method.id,parameters:example.parameters,materials:exampleMaterials});
 assert.deepEqual(compiled.report.skipped,[]);
 assert.deepEqual(compiled.operations[0].children.map(op=>op.asset),example.parameters.aliases);
 assert.ok(example.parameters.aliases.every(alias=>exampleMaterials.find(asset=>asset.alias===alias).physicalWidthMM<exampleMaterials[0].physicalWidthMM));
});
test('bubble lesson creates editable text inside the frame and rejects overflow',()=>{
 const info=describeTechnique('graphic-bubble');
 assert.equal(info.parameters.text.required,true);
 assert.equal(info.example.prepare[0].asset,'m1');
 const compiled=compileTechnique({methodId:'graphic-bubble',parameters:{id:'bubble',text:'这里的光'}});
 assert.deepEqual(compiled.operations[0].children.map(op=>op.op),['graphic.add','text.add']);
 assert.equal(compiled.operations[0].children[1].content,'这里的光');
 assert.throws(()=>compileTechnique({methodId:'graphic-bubble',parameters:{id:'bubble'}}),/需要短文字/);
 assert.throws(()=>compileTechnique({methodId:'graphic-bubble',parameters:{id:'bubble',text:'这段批注长到不可能放进很小的气泡主体内',widthMm:20,heightMm:12}}),/超出框内可写区域/);
 for(const id of ['graphic-arch','graphic-scallop-frame','graphic-paperclip'])assert.ok(describeTechnique(id).example.prepare.some(op=>op.op==='material.add'),id+' missing context');
});
test('timeline connector ends at the first and last event, with no tail for a single event',()=>{
 const operations=compileTechnique({methodId:'record-timeline',parameters:{id:'time',items:['早晨','午后','夜晚']}}).operations[0].children;
 const circles=operations.filter(op=>op.op==='graphic.add'&&op.geometry.kind==='ellipse');
 const line=operations.find(op=>op.op==='graphic.add'&&op.geometry.kind==='rect'&&op.size.width===.25);
 assert.equal(circles.length,3);assert.ok(line);
 assert.equal(line.place.at[1]-line.size.height/2,circles[0].place.at[1]);
 assert.equal(line.place.at[1]+line.size.height/2,circles.at(-1).place.at[1]);
 const single=compileTechnique({methodId:'record-timeline',parameters:{id:'one',items:['唯一事件']}}).operations[0].children;
 assert.ok(!single.some(op=>op.op==='graphic.add'&&op.geometry.kind==='rect'&&op.size.width===.25));
});
test('template ranking is deterministic and does not mutate real material dimensions',()=>{
 const input=structuredClone(exampleMaterials),args={materials:input,paper:{width:148,height:210},limit:5};
 assert.deepEqual(rankTemplates(args),rankTemplates(args));assert.deepEqual(input,exampleMaterials);
});

test('an existing editable title group can occupy a template slot without rasterization',async()=>{
 const assets=exampleMaterials.slice(0,2);let doc=await document(assets);
 doc=apply(doc,compileTechnique({methodId:'title-outline',parameters:{id:'heading',text:'好天气'}}).operations,assets).document;
 const template=templateCatalog.templates.find(t=>t.id==='center-1'),slot=materialSlots(template)[0],heading=template.elements.find(e=>e.role==='title');
 const compiled=compileTemplate({templateId:template.id,id:'page-group',paper:{width:148,height:210},materials:assets,bindings:[{slotId:slot.id,alias:'m1'},{slotId:heading.id,node:'heading'}],nodes:[{id:'heading'}]});
 const result=applyCreationTransaction(doc,{protocolVersion:2,transactionId:'compose-title',baseSceneRevision:creationSceneRevision(doc),operations:compiled.operations},assets).document;
 const group=result.page.layers.find(n=>n.id==='page-group');assert.ok(group.children.some(n=>n.id==='heading'&&n.type==='group'));
});
test('taxonomy and open semantic tags remain available in frozen matching sources',async()=>{
 const asset={...exampleMaterials[0],styleTags:['手绘'],contentTags:['咖啡杯'],contentCategories:['food']};
 const doc=await document([asset]);assert.deepEqual(doc.source.sourceSnapshots[0].styleTags,['手绘']);
});

test('a title group replaces a template writing guide and retains editable text and foreground order',async()=>{
 let doc=await document([]);
 doc=apply(doc,compileTechnique({methodId:'title-shadow',parameters:{id:'heading',text:'留住片刻'}}).operations,[]).document;
 const t=templateCatalog.templates.find(t=>t.id==='cream6-08');
 const compiled=compileTemplate({templateId:t.id,id:'spread',paper:{width:240,height:149},bindings:[{slotId:'headline',node:'heading'}],nodes:[{id:'heading'}],texts:{'middle-writing':'留一点时间，慢慢看。'}});
 const result=applyCreationTransaction(doc,{protocolVersion:2,transactionId:'place-heading',baseSceneRevision:creationSceneRevision(doc),operations:compiled.operations},[]).document;
 const group=result.page.layers.find(n=>n.id==='spread');
 assert.deepEqual(group.children.map(n=>n.id),['heading','spread-middle-writing']);
 const heading=group.children.find(n=>n.id==='heading');
 assert.equal(heading.children.find(n=>n.type==='text').content,'留住片刻');
 assert.ok(!group.children.some(n=>n.id==='spread-headline'));
 assert.ok(compiled.report.renderedElements.includes('headline'));
});

test('every method exposes a complete example and distinct construction/review guidance',async()=>{
 for(const method of techniqueCatalog.methods){
  const info=describeTechnique(method.id);
  assert.ok(info.lesson.principle.length>12,method.id);assert.ok(info.lesson.steps.length>=2,method.id);assert.ok(info.lesson.check.length>=2,method.id);
  const materials=info.example.materials,doc=await document(materials);
  const compiled=compileTechnique({methodId:method.id,parameters:info.tool.arguments.parameters,materials});
  assert.equal(apply(doc,[...info.example.prepare,...compiled.operations],materials).changed,true,method.id);
 }
});
test('phrase composition preserves the supplied text, meaningful grouping and physical font sizes',async()=>{
 const compiled=compileTechnique({methodId:'title-phrases',parameters:{id:'phrase',text:'把日常收好',fontSizePt:20,widthMm:36,runs:[{text:'把',role:'secondary'},{text:'日常',role:'primary'},{text:'收好',breakBefore:true}]}});
 const texts=compiled.operations[0].children.filter(o=>o.op==='text.add');assert.equal(texts.map(t=>t.content).join(''),'把日常收好');
 assert.ok(texts[1].style.fontSizePt>texts[0].style.fontSizePt);assert.equal(texts[2].style.fontSizePt,20);
 assert.ok(texts[2].place.at[1]>texts[1].place.at[1]);assert.ok(texts.every(t=>!t.place.rotationDeg));
 assert.equal(apply(await document([]),compiled.operations,[]).changed,true);
 assert.throws(()=>compileTechnique({methodId:'title-phrases',parameters:{id:'bad',text:'完整标题',runs:[{text:'标题'}]}}),/拼接/);
});
test('keyword highlight is local, behind text, and transparent hollow titles do not paint paper color',()=>{
 const marked=compileTechnique({methodId:'title-highlight',parameters:{id:'h',text:'留住今天的小美好',emphasis:'小美好',widthMm:100}}).operations[0].children;
 const bg=marked.find(o=>o.op==='graphic.add'),texts=marked.filter(o=>o.op==='text.add');
 assert.ok(bg.size.width<70);assert.ok(bg.style.fillOpacity<1);assert.equal(marked[0],bg);
 assert.equal(texts.map(o=>o.content).join(''),'留住今天的小美好');assert.equal(texts.at(-1).content,'小美好');
 const hollow=compileTechnique({methodId:'title-outline',parameters:{id:'o',text:'空心'}}).operations[0].children;
 assert.equal(hollow.length,1);assert.equal(hollow[0].style.fillOpacity,0);assert.ok(hollow[0].style.outline);
 assert.throws(()=>compileTechnique({methodId:'title-highlight',parameters:{id:'h',text:'留住日常',emphasis:'旅行'}}),/原|标题/);
});
test('wrapped emphasis marks each occupied line without spanning the empty line gap',async()=>{
 const parameters={id:'long-mark',text:'春日去海边散步',emphasis:'春日去海边散步',widthMm:36,fontSizePt:20};
 for(const methodId of ['title-highlight','title-circle']){
  const compiled=compileTechnique({methodId,parameters}),children=compiled.operations[0].children;
  const marks=children.filter(o=>o.op==='graphic.add'),written=children.filter(o=>o.op==='text.add');
  assert.ok(marks.length>=3,methodId);
  assert.equal(written.map(o=>o.content).join(''),parameters.text);
  assert.ok(marks.every((mark,i)=>i===0||mark.place.at[1]>marks[i-1].place.at[1]),methodId);
  assert.ok(marks.every(mark=>mark.size.height<14),methodId);
  assert.equal(apply(await document([]),compiled.operations,[]).changed,true);
 }
});
test('long captions and record entries stay inside their reported editable groups',async()=>{
 const cases=[
  {methodId:'photo-caption',parameters:{id:'caption',aliases:['m1'],caption:'Today we found a little place by the sea. '.repeat(4),fontSizePt:14,gapMm:2}},
  ...['record-checklist','record-timeline','record-columns'].map(methodId=>({methodId,parameters:{id:methodId,items:['今天收集了很多文字，需要按实际宽度换行。'.repeat(3),'A long note about the photos saved this afternoon. '.repeat(2)],fontSizePt:14,gapMm:2}}))
 ];
 for(const {methodId,parameters} of cases){
  const compiled=compileTechnique({methodId,parameters,materials:exampleMaterials});
  const doc=await document(exampleMaterials),done=apply(doc,compiled.operations,exampleMaterials).document;
  const group=done.page.layers.find(n=>n.id===parameters.id),scale=done.page.canvas.height/done.page.physicalPageHeightMM;
  const ends=[];
  for(const command of compiled.operations[0].children.filter(n=>n.op==='text.add')){
   const node=group.children.find(n=>n.id===command.id);
   const end=command.place.at[1]+node.height/scale;ends.push(end);
   assert.ok(end<=compiled.report.heightMm+.01,methodId+'/'+command.id);
  }
  assert.ok(compiled.report.heightMm-Math.max(...ends)<=parameters.gapMm+.01,methodId+' should not reserve unused rows');
 }
});
test('tape recipes show physical attachment and keep rotated strips inside the selectable group',async()=>{
 const method=techniqueCatalog.methods.find(m=>m.id==='tape-corners'),example=techniqueExample(method);
 assert.ok(example.before.some(op=>op.asset==='m3'));
 assert.ok(describeTechnique(method.id).parameters.segments.description.includes('局部摆放'));
 for(const parameters of [{id:'tapes',aliases:['m4']},{...example.parameters,id:'tapes'},{...example.parameters,id:'tapes',rotationDeg:30}]){
  const compiled=compileTechnique({methodId:method.id,parameters,materials:exampleMaterials});
  const done=apply(await document(exampleMaterials),compiled.operations,exampleMaterials).document,group=worldBox(done.page,'tapes');
  const strips=compiled.operations[0].children.filter(op=>op.op==='material.tape');assert.equal(strips.length,2);
  for(const strip of strips){
   const box=worldBox(done.page,strip.id),angle=(box.rotation-group.rotation)*Math.PI/180,groupAngle=group.rotation*Math.PI/180;
   const offsetX=box.cx-group.cx,offsetY=box.cy-group.cy;
   const localX=offsetX*Math.cos(groupAngle)+offsetY*Math.sin(groupAngle);
   const localY=-offsetX*Math.sin(groupAngle)+offsetY*Math.cos(groupAngle);
   const dx=(Math.abs(Math.cos(angle))*box.w+Math.abs(Math.sin(angle))*box.h)/2;
   const dy=(Math.abs(Math.sin(angle))*box.w+Math.abs(Math.cos(angle))*box.h)/2;
   assert.ok(localX-dx>=-group.w/2-.01&&localX+dx<=group.w/2+.01);
   assert.ok(localY-dy>=-group.h/2-.01&&localY+dy<=group.h/2+.01);
  }
 }
 const moved=compileTechnique({methodId:method.id,parameters:{id:'moved',aliases:['m4'],segments:[{at:[5,5]},{at:[60,32]}]},materials:exampleMaterials});
 assert.deepEqual(moved.operations[0].children.map(op=>op.place.rotationDeg),[-35,145]);
 assert.throws(()=>compileTechnique({methodId:method.id,parameters:{id:'bad',aliases:['m4'],segments:[{at:[5,5]}]},materials:exampleMaterials}),/段数/);
 assert.throws(()=>compileTechnique({methodId:method.id,parameters:{id:'bad',aliases:['m4'],segments:[{at:[5,5]},{at:[80,5]}]},materials:exampleMaterials}),/位置/);
 assert.throws(()=>compileTechnique({methodId:method.id,parameters:{id:'bad',aliases:['m4'],lengthMm:1},materials:exampleMaterials}),/至少/);
});
test('magazine columns differ from a photo row and keep the main caption under its own image',async()=>{
 const parameters={id:'magazine',aliases:['m1','m2','m5'],caption:'示意图注'};
 const compiled=compileTechnique({methodId:'magazine-offset',parameters,materials:exampleMaterials});
 const children=compiled.operations[0].children,photos=children.filter(op=>op.op==='material.add'),caption=children.find(op=>op.op==='text.add');
 assert.equal(photos.length,3);
 assert.ok(photos[1].place.at[0]>photos[0].place.at[0]);
 assert.equal(photos[1].place.at[0],photos[2].place.at[0]);
 assert.ok(photos[2].place.at[1]>photos[1].place.at[1]);
 assert.equal(caption.place.at[1],exampleMaterials[0].physicalHeightMM+6);
 assert.ok(caption.place.at[0]+caption.size.width<photos[1].place.at[0]-exampleMaterials[1].physicalWidthMM/2);
 const stagger=compileTechnique({methodId:'photo-stagger',parameters:{id:'stagger',aliases:parameters.aliases},materials:exampleMaterials}).operations[0].children.filter(op=>op.op==='material.add');
 assert.ok(stagger[2].place.at[0]>stagger[1].place.at[0]);
 const doc=await document(exampleMaterials),done=apply(doc,compiled.operations,exampleMaterials).document;
 for(let i=0;i<photos.length;i++)assert.ok(Math.abs(worldBox(done.page,photos[i].id).w*done.page.physicalPageHeightMM/done.page.canvas.height-exampleMaterials.find(a=>a.alias===parameters.aliases[i]).physicalWidthMM)<1e-6);
 assert.ok(describeTechnique('magazine-offset').parameters.caption.description.includes('首项'));
});
test('three-point color echo has three distinct visible default colors',()=>{
 const children=compileTechnique({methodId:'color-echo',parameters:{id:'echo'}}).operations[0].children;
 assert.equal(children.length,3);
 assert.equal(new Set(children.map(op=>op.style.fill)).size,3);
 assert.ok(children.every(op=>op.style.fill!=='#F1E8D5'));
});
test('title effects compose in one editable text, while curve and grapheme constraints are explicit',async()=>{
 const gradient={angleDeg:45,stops:[{offset:0,color:'#112233'},{offset:1,color:'#445566'}]};
 const compiled=compileTechnique({methodId:'title-shadow',parameters:{id:'fx',text:'标题',style:{gradient,outline:{color:'#FFFFFF',widthMm:.3}}}});
 const child=compiled.operations[0].children.find(o=>o.op==='text.add');assert.ok(child.style.shadow);assert.deepEqual(child.style.gradient,gradient);
 assert.equal(apply(await document([]),compiled.operations,[]).changed,true);
 const vertical=compileTechnique({methodId:'title-vertical',parameters:{id:'v',text:'e\u0301好'}});assert.equal(vertical.operations[0].children[0].content,'e\u0301\n好');
 assert.throws(()=>compileTechnique({methodId:'title-curve',parameters:{id:'c',text:'过长的标题必须加宽不能截断',widthMm:20}}),/宽度/);
 assert.throws(()=>compileTechnique({methodId:'title-curve',parameters:{id:'c',text:'两行\n标题'}}),/单行/);
});
test('geometry remains parametric and irrelevant parameters are rejected instead of ignored',async()=>{
 const flower=compileTechnique({methodId:'graphic-flower',parameters:{id:'flower',options:{petals:9}}});
 const cmd=flower.operations[0].children[0];assert.equal(cmd.geometry.kind,'flower');assert.equal(cmd.geometry.options.petals,9);assert.equal(cmd.geometry.options.showCenter,true);
 const made=apply(await document([]),flower.operations,[]).document;assert.equal(made.page.layers[0].children[0].shapeOptions.petals,9);
 const dots=compileTechnique({methodId:'pattern-dots',parameters:{id:'dots',options:{rows:3,columns:5}}});assert.equal(dots.operations[0].children.length,1);assert.equal(dots.operations[0].children[0].geometry.options.columns,5);
 assert.throws(()=>compileTechnique({methodId:'paper-peek',parameters:{id:'p',target:'a',referenceTarget:'b',at:[1,2]}}),/不支持/);
 assert.throws(()=>compileTechnique({methodId:'graphic-loop',parameters:{id:'p',options:{petals:5}}}),/不支持/);
});


for(const t of templateCatalog.templates.filter(t=>t.reconstruction))test('fully specified template reconstructs every analyzed element in declared stacking order: '+t.id,async()=>{
 const fixture=templateFixture(t);
 const page=draft({ratio:'a5'});page.physicalPageHeightMM=fixture.paper.height;page.canvas.width=page.canvas.height*fixture.paper.width/fixture.paper.height;
 const doc=await createCreationDocument({draft:page,assets:fixture.materials,aliases:Object.fromEntries(fixture.materials.map(a=>[a.alias,a.id]))});
 const compiled=compileTemplate({...fixture,templateId:t.id,id:'full'}),done=apply(doc,compiled.operations,fixture.materials).document;
 assert.deepEqual(compiled.report.missingElements,[]);
 assert.deepEqual(done.page.layers[0].children.map(n=>n.creativePieceID||n.id),t.elements.map(e=>'full-'+e.id));
 assert.equal(done.page.layers[0].children.length,t.reconstruction.sourceElementCount);
 assert.deepEqual(compiled.operations[0].children.filter(o=>o.op==='material.add').map(o=>o.asset),fixture.bindings.map(b=>b.alias));
 assert.ok(compiled.operations[0].children.filter(o=>o.op==='material.add').every(o=>o.size===undefined));
 if(t.elements.find(e=>e.id==='e7')?.render?.style.fillOpacity===0)assert.equal(done.page.layers[0].children.find(n=>n.id==='full-e7').fillOpacity,0);
});
test('template palette and omissions are explicit, preserve input assets, and cannot create fake material placeholders',async()=>{
 const t=templateCatalog.templates.find(t=>t.id==='center-1'),fixture=templateFixture(t),before=structuredClone(fixture.materials);
 const compiled=compileTemplate({templateId:t.id,id:'partial',paper:fixture.paper,materials:fixture.materials.slice(0,1),colors:{orange:'#123456'},omit:['dot-top','e2']});
 assert.ok(compiled.report.missingElements.includes('e2'));assert.ok(compiled.report.missingElements.includes('dot-top'));
 assert.equal(compiled.operations[0].children.find(n=>n.id==='partial-date-card'),undefined);
 assert.equal(compiled.report.slots.find(s=>s.slotId==='date-card').reason,'content-missing');
 assert.equal(compiled.operations[0].children.find(n=>n.id==='partial-small-tab').style.fill,'#123456');
 assert.deepEqual(fixture.materials,before);assert.equal(compiled.operations[0].children.filter(n=>n.op==='material.add').length,1);
 assert.equal(apply(await document(fixture.materials),compiled.operations,fixture.materials).changed,true);
 assert.throws(()=>compileTemplate({...fixture,templateId:t.id,id:'bad',colors:{orange:'red'}}),/配色/);
 assert.throws(()=>compileTemplate({...fixture,templateId:t.id,id:'bad',omit:['unknown']}),/省略/);
 assert.throws(()=>compileTemplate({...fixture,templateId:t.id,id:'bad',bindings:[{slotId:'dot-top',alias:'m1'}]}),/位置/);
});
test('an existing title keeps the template stacking position rather than always becoming the top layer',async()=>{
 const t=templateCatalog.templates.find(t=>t.id==='center-1'),fixture=templateFixture(t);let doc=await document(fixture.materials);
 doc=apply(doc,compileTechnique({methodId:'title-outline',parameters:{id:'heading',text:'日常'}}).operations,fixture.materials).document;
 delete fixture.texts.e7;
 const compiled=compileTemplate({...fixture,templateId:t.id,id:'joined',bindings:[...fixture.bindings,{slotId:'e7',node:'heading'}],nodes:[{id:'heading'}]});
 const done=applyCreationTransaction(doc,{protocolVersion:2,transactionId:'join-template',baseSceneRevision:creationSceneRevision(doc),operations:compiled.operations},fixture.materials).document;
 assert.deepEqual(done.page.layers.find(n=>n.id==='joined').children.map(n=>n.creativePieceID||n.id),t.elements.map(e=>e.id==='e7'?'heading':'joined-'+e.id));
});

test('writing regions replace the guide paths with supplied text in the same editable layer',async()=>{
 const t=templateCatalog.templates.find(t=>t.id==='moon-03'),fixture=templateFixture(t),slot=t.elements.find(e=>e.role==='text'&&isGraphicElement(e));
 const guide=compileTemplate({...fixture,templateId:t.id,id:'guide'});
 assert.equal(guide.operations[0].children.find(c=>c.id==='guide-'+slot.id).op,'graphic.add');
 const content='在这里写下今天的两件小事。',result=compileTemplate({...fixture,templateId:t.id,id:'written',texts:{...fixture.texts,[slot.id]:content}});
 const items=result.operations[0].children.filter(c=>c.id==='written-'+slot.id);assert.equal(items.length,1);assert.equal(items[0].op,'text.add');assert.equal(items[0].content,content);assert.equal(items[0].style.fontFamily,'Xiaolai');assert.equal('stroke' in items[0].style,false);
 assert.deepEqual(items[0].place.at,[slot.render.textBox[0]*fixture.paper.width,slot.render.textBox[1]*fixture.paper.height]);
 assert.notDeepEqual(items[0].place.at,[slot.box[0]*fixture.paper.width,slot.box[1]*fixture.paper.height]);
 assert.equal(items[0].place.rotationDeg,32);assert.equal(items[0].size.width,slot.render.textBox[2]*fixture.paper.width);
 const page=draft({ratio:'a5'});page.physicalPageHeightMM=fixture.paper.height;page.canvas.width=page.canvas.height*fixture.paper.width/fixture.paper.height;
 const doc=await createCreationDocument({draft:page,assets:fixture.materials,aliases:Object.fromEntries(fixture.materials.map(a=>[a.alias,a.id]))});
 const done=apply(doc,result.operations,fixture.materials).document;assert.equal(done.page.layers[0].children.find(n=>n.id==='written-'+slot.id).content,content);
});

test('writing on a material follows translation and rotation, and does not alter the source or drop long text',async()=>{
 const method=techniqueCatalog.methods.find(m=>m.id==='record-on-material'),example=techniqueExample(method),materials=exampleMaterials;
 const text='完整正文不能为了塞进便签而裁掉。'.repeat(4);
 const recipe=compileTechnique({methodId:method.id,parameters:{...example.parameters,text},materials});
 let doc=apply(await document(materials),[...example.before,...recipe.operations],materials).document;
 let revision=0;const edit=operations=>applyCreationTransaction(doc,{protocolVersion:2,transactionId:'writing-'+(++revision),baseSceneRevision:creationSceneRevision(doc),operations},materials).document;
 const originalSource=structuredClone(doc.source),before=worldBox(doc.page,'demo'),paperBefore=worldBox(doc.page,'note');
 doc=edit([{op:'layer.update',target:'note',place:{reference:'page',at:[90,100],unit:'mm',rotationDeg:-8}}]);
 const after=worldBox(doc.page,'demo'),paperAfter=worldBox(doc.page,'note');
 assert.ok(Math.abs((after.cx-before.cx)-(paperAfter.cx-paperBefore.cx))<1e-6);
 assert.ok(Math.abs((after.cy-before.cy)-(paperAfter.cy-paperBefore.cy))<1e-6);
 assert.equal(doc.page.layers.find(n=>n.id==='demo').content,text);assert.deepEqual(doc.source,originalSource);
 doc=edit([{op:'layer.update',target:'note',place:{reference:'page',at:[90,100],unit:'mm',rotationDeg:28}}]);
 assert.equal(doc.page.layers.find(n=>n.id==='demo').rotation,28);
 assert.throws(()=>compileTechnique({methodId:method.id,parameters:{...example.parameters,box:[.8,.1,.4,.5]},materials}),/可写区域/);
});

test('optional title backing follows actual supplied content and explicit omission',async()=>{
 const base={templateId:'ac-01',id:'optional',paper:{width:148,height:190},texts:{'heading-one':'片刻'}};
 const present=compileTemplate(base).operations[0].children;
 assert.ok(present.some(n=>n.id==='optional-heading-one-ground'));
 assert.ok(!present.some(n=>n.id==='optional-middle-caption-ground'));
 const omitted=compileTemplate({...base,omit:['heading-one']}).operations[0].children;
 assert.ok(!omitted.some(n=>n.id==='optional-heading-one-ground'));
 const defaultTitle=compileTemplate({templateId:'ac-01',id:'default-title',paper:base.paper,title:'沿途'}).operations[0].children;
 assert.ok(defaultTitle.some(n=>n.id==='default-title-heading-one-ground'));
 const bound=compileTemplate({templateId:'ac-01',id:'bound-title',paper:base.paper,nodes:[{id:'existing-title'}],bindings:[{slotId:'heading-one',node:'existing-title'}]});
 assert.ok(bound.operations[0].children.some(n=>n.id==='bound-title-heading-one-ground'));
});

test('text replacing a rotated writing guide stays inside its backing at both paper sizes',async()=>{
 const t=templateCatalog.templates.find(t=>t.id==='ac-11');
 for(const width of [148,210]){
  const paper={width,height:width/t.aspect};
  const page=draft({ratio:'a5'});page.physicalPageHeightMM=paper.height;page.canvas.width=page.canvas.height*paper.width/paper.height;
  const doc=await createCreationDocument({draft:page,assets:[],aliases:{}});
  const compiled=compileTemplate({templateId:t.id,id:'rotated-writing',paper,texts:{'slanted-writing':'留住片刻\n慢慢记下'}});
  const done=apply(doc,compiled.operations,[]).document;
  const text=worldBox(done.page,'rotated-writing-slanted-writing'),backing=worldBox(done.page,'rotated-writing-slanted-writing-ground');
  assert.equal(text.rotation,backing.rotation);
  const a=-backing.rotation*Math.PI/180,dx=text.cx-backing.cx,dy=text.cy-backing.cy;
  const localX=dx*Math.cos(a)-dy*Math.sin(a),localY=dx*Math.sin(a)+dy*Math.cos(a);
  assert.ok(localX-text.w/2>=-backing.w/2-1e-6,'left text inset survives rotation');
  assert.ok(localX+text.w/2<=backing.w/2+1e-6,'right text inset survives rotation');
  assert.ok(localY-text.h/2>=-backing.h/2-1e-6,'top text inset survives rotation');
  assert.ok(localY+text.h/2<=backing.h/2+1e-6,'short paragraph fits the backing');
 }
});

test('standalone angled titles keep their authored page anchor outside the circle',()=>{
 const t=templateCatalog.templates.find(t=>t.id==='moon-04'),fixture=templateFixture(t),slot=t.elements.find(e=>e.id==='heading');
 const result=compileTemplate({...fixture,templateId:t.id,id:'circle-heading'});
 const title=result.operations[0].children.find(e=>e.id==='circle-heading-heading');
 assert.deepEqual(title.place.at,[slot.box[0]*fixture.paper.width,slot.box[1]*fixture.paper.height]);
 assert.equal(title.place.rotationDeg,-28);
});

test('explicit empty and partial bindings never silently auto-fill other material positions',async()=>{
 const t=templateCatalog.templates.find(t=>t.id==='center-1'),f=templateFixture(t),slot=materialSlots(t)[0];
 const empty=compileTemplate({...f,templateId:t.id,id:'empty',bindings:[],texts:{}});
 assert.equal(empty.report.assignmentMode,'explicit');assert.deepEqual(empty.report.used,[]);
 assert.ok(empty.report.slots.filter(s=>s.status==='material').length===0);
 const single=compileTemplate({...f,templateId:t.id,id:'chosen',bindings:[{slotId:slot.id,alias:f.materials[0].alias}],texts:{}});
 const doc=apply(await document(f.materials),single.operations,f.materials).document;
 const group=doc.page.layers.find(n=>n.id==='chosen');
 assert.equal(group.children.filter(n=>n.assetID).length,1);
 assert.equal(single.report.slots.find(s=>s.slotId===slot.id).source,f.materials[0].alias);
 const blank=single.report.slots.find(s=>s.slotId===materialSlots(t)[1].id);assert.equal(blank.status,'blank');assert.equal(blank.reason,'unassigned');
 assert.throws(()=>compileTemplate({...f,templateId:t.id,id:'conflict',bindings:[{slotId:'e7',alias:f.materials[0].alias}]}),/同时/);
});

test('digital writing regions can keep guides, accept text, or be omitted without substitute cards',()=>{
 const t=templateCatalog.templates.find(t=>t.id==='ac-04'),f=templateFixture(t),slot=t.elements.find(e=>e.role==='text'&&isGraphicElement(e));
 const args={...f,templateId:t.id,id:'choices',bindings:[],texts:{}};
 assert.equal(compileTemplate(args).report.slots.find(s=>s.slotId===slot.id).status,'writing-guide');
 assert.equal(compileTemplate({...args,texts:{[slot.id]:'一段短记'}}).report.slots.find(s=>s.slotId===slot.id).status,'text');
 assert.equal(compileTemplate({...args,omit:[slot.id]}).report.slots.find(s=>s.slotId===slot.id).reason,'omitted');
});

test('all authored sample text fits its declared region and typography scales with paper',()=>{
 for(const t of templateCatalog.templates){
  const f=templateFixture(t),normal=compileTemplate({...f,templateId:t.id,id:'fit'});
  assert.deepEqual(normal.report.warnings,[],t.id+' text overflows');
 }
 const t=templateCatalog.templates.find(t=>t.id==='ac-04'),f=templateFixture(t);
 const small=compileTemplate({...f,templateId:t.id,id:'small'}),large=compileTemplate({...f,templateId:t.id,id:'large',paper:{width:f.paper.width*1.5,height:f.paper.height*1.5}});
 const a=small.operations[0].children.find(x=>x.op==='text.add'),b=large.operations[0].children.find(x=>x.id===a.id.replace('small-','large-'));
 assert.ok(Math.abs(b.style.fontSizePt/a.style.fontSizePt-1.5)<.001);
});

test('overlong text is preserved and reported instead of silently clipped or shrunk into unreadable type',()=>{
 const t=templateCatalog.templates.find(t=>t.id==='ac-04'),slot=t.elements.find(e=>e.role==='title'),text='这段文字需要重新安排区域。'.repeat(80);
 const r=compileTemplate({templateId:t.id,id:'overflow',paper:{width:148,height:210},bindings:[],texts:{[slot.id]:text}});
 assert.equal(r.operations[0].children.find(o=>o.id==='overflow-'+slot.id).content,text);
 assert.ok(r.report.warnings.some(w=>w.slotId===slot.id));
 assert.ok(r.report.textLayout.find(w=>w.slotId===slot.id).fontSizePt>=6);
});

test('the generic title uses the declared main heading, never punctuation, numbers or dates',()=>{
 for(const [templateId,slotId] of [['ac-04','page-heading'],['ac-33','heading'],['moon-02','heading'],['center-3','card-title']]){
  const result=compileTemplate({templateId,id:'main',paper:{width:148,height:210},bindings:[],title:'春日小记'});
  const texts=result.operations[0].children.filter(n=>n.op==='text.add');
  assert.deepEqual(texts.map(n=>[n.id,n.content]),[['main-'+slotId,'春日小记']]);
 }
 const r=compileTemplate({templateId:'ac-04',id:'occupied',paper:{width:148,height:210},bindings:[],title:'不要挤进引号',texts:{'page-heading':'已有标题'}});
 assert.equal(r.operations[0].children.filter(n=>n.op==='text.add').length,1);
 assert.ok(r.report.warnings.some(w=>w.reason.includes('title 未放置')));
});

test('per-position typography is explicit physical type and validates unknown slots and style values',()=>{
 const args={templateId:'ac-04',id:'style',paper:{width:210,height:297},bindings:[],texts:{'upper-writing':'两行文字\n清楚可读'},textStyles:{'upper-writing':{fontSizePt:12,textAlign:'center',lineHeight:1.5}}};
 const r=compileTemplate(args),text=r.operations[0].children.find(x=>x.id==='style-upper-writing');
 assert.equal(text.style.fontSizePt,12);assert.equal(text.style.textAlign,'center');
 assert.throws(()=>compileTemplate({...args,textStyles:{missing:{fontSizePt:12}}}),/位置/);
 assert.throws(()=>compileTemplate({...args,textStyles:{'upper-writing':{fontSizePt:0}}}),/样式值/);
 assert.throws(()=>compileTemplate({...args,textStyles:{'upper-writing':{fill:'red'}}}),/样式参数/);
});
