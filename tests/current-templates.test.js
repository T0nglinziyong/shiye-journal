import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {listCurrentTemplates,rankCurrentTemplates,materialTemplateProfile,
  currentTemplateMaterialScores,compileCurrentTemplate} from '../creative-agent/library/current-templates.js';

test('only the fourteen measured templates enter current matching',()=>{
 const templates=listCurrentTemplates();
 assert.equal(templates.length,14);
 assert.equal(templates.filter(t=>t.pageMode==='single').length,5);
 assert.equal(templates.filter(t=>t.pageMode==='spread').length,9);
 assert.ok(templates.every(t=>t.type==='new'&&t.elements.length&&
  t.elements.every(e=>e.must.length&&e.prefer.length)));
 assert.ok(templates.every(t=>t.title&&!t.title.startsWith('S0')&&t.structure.length>20));
 const policy=readFileSync(resolve(import.meta.dirname,'../deploy/cloudbase/012-template-cases.sql'),'utf8');
 const allowed=new RegExp(policy.match(/name ~ '([^']+)'/)?.[1]||'a^');
 assert.match(policy,/for select to authenticated/);
 assert.equal(new Set(templates.map(t=>t.examplePresetPath)).size,14);
 for(const template of templates){
  assert.match(template.examplePresetPath,/^journal-presets\/template-cases\/v1\/case-\d{2}\.jpg$/);
  assert.ok(allowed.test(template.examplePresetPath),`${template.id} 的案例路径应被登录后读取策略允许`);
  const bytes=readFileSync(resolve(import.meta.dirname,`../public${template.templateImagePath}`));
  assert.ok(bytes.length>1000&&bytes[0]===0xff&&bytes[1]===0xd8,
   `${template.id} 应有由无素材默认值渲染的封面`);
 }
 assert.equal(allowed.test('journal-presets/template-cases/v1/case-15.jpg'),false);
 const asset={id:'flower',title:'花朵贴纸',kind:'sticker',kindDetail:'sticker.subject',
  physicalWidthMM:20,physicalHeightMM:25,layoutFits:['point.free'],
  templateUseNotes:'完整主体轮廓应保留'};
 const ranked=rankCurrentTemplates({materials:[asset],pageMode:'single',limit:20});
 assert.equal(ranked.length,5);
 assert.ok(ranked.every(row=>templates.some(t=>t.id===row.id)));
 assert.ok(!ranked.some(row=>row.id==='center-1'));
 assert.equal(materialTemplateProfile(asset).preservation,'whole');
 assert.equal(materialTemplateProfile({id:'plain',kind:'paper',physicalWidthMM:70,physicalHeightMM:90}).preservation,'repeatable');
 assert.equal(materialTemplateProfile({id:'card',kind:'card',shape:'rect',physicalWidthMM:40,physicalHeightMM:30}).preservation,'repeatable');
 assert.equal(materialTemplateProfile({id:'irregular',kind:'paper',shape:'die-cut',physicalWidthMM:40,physicalHeightMM:30}).preservation,'whole');
 assert.equal(materialTemplateProfile({id:'irregular-override',kind:'paper',shape:'die-cut',preservation:'repeatable',
  physicalWidthMM:40,physicalHeightMM:30}).preservation,'whole');
 assert.equal(materialTemplateProfile({id:'cutout-cat',title:'小猫',kind:'photo',physicalWidthMM:30,
  physicalHeightMM:40,systemAttributes:{alphaCoverage:.42}}).preservation,'whole');
 assert.deepEqual(materialTemplateProfile({id:'alpha-paper',kind:'paper',physicalWidthMM:60,physicalHeightMM:40,
  systemAttributes:{visualBoundsRatio:[.04,.08,.95,.92]}}).visualBoundsRatio,[.04,.08,.95,.92]);
 assert.equal(materialTemplateProfile({id:'padded-paper',kind:'paper',physicalWidthMM:60,physicalHeightMM:40,
  systemAttributes:{alphaCoverage:.64,visualBoundsRatio:[.1,.1,.9,.9]}}).preservation,'repeatable');
 assert.equal(materialTemplateProfile({id:'cutout-paper',kind:'paper',physicalWidthMM:60,physicalHeightMM:40,
  systemAttributes:{alphaCoverage:.35,visualBoundsRatio:[.1,.1,.9,.9]}}).preservation,'whole');
 assert.equal(materialTemplateProfile({...asset,templateUseNotes:'印字完整保留，不可裁切'}).preservation,'whole');
 const cassette=materialTemplateProfile({id:'cassette',title:'蓝色磁带贴纸',kind:'sticker',kindDetail:'sticker.subject',
  physicalWidthMM:25,physicalHeightMM:18,description:'蓝色磁带造型，白色标签上印有固定文字',
  templateUseNotes:'磁带轮廓完整保留，白色标签区域含固定文字与条纹，不宜覆盖或裁切'});
 assert.equal(cassette.preservation,'whole');
 assert.equal(cassette.writableAreaRatio,0);
 assert.equal(cassette.canWriteOn,false);
 const person=materialTemplateProfile({...asset,id:'person',title:'散步女孩贴纸',kindDetail:'sticker.subject'});
 assert.ok(person.visualRoles.includes('figure'));
 const cat={id:'cat',title:'小猫异形贴纸',kind:'sticker',kindDetail:'sticker.subject',
  physicalWidthMM:28,physicalHeightMM:36};
 assert.equal(rankCurrentTemplates({materials:[cat],pageMode:'single',limit:5})[0].assignments[0].slotId,'bear-monday');
 assert.ok(rankCurrentTemplates({materials:[cat],pageMode:'spread',limit:9}).some(row=>row.plan.used.includes('cat')));
 assert.ok(!materialTemplateProfile({...asset,kindDetail:'sticker.decoration'}).visualRoles.includes('figure'));
 assert.ok(currentTemplateMaterialScores([asset]).get('flower').utility>0);
 const draft=compileCurrentTemplate({templateId:ranked[0].id,assets:[asset]});
 assert.ok(draft.operations.some(op=>op.op==='page.update'));
 assert.throws(()=>compileCurrentTemplate({templateId:'center-1',assets:[asset]}),/新模板/);
});

test('all fourteen empty-input templates keep their measured objects as editable defaults',()=>{
 const composites={'D146':{'stamp-material':['stamp-word'],'top-clip':['clip-ring','clip-body']}};
 for(const template of listCurrentTemplates()){
  const {operations}=compileCurrentTemplate({templateId:template.id});
  const rendered=new Set(operations.flatMap(op=>[op.id,...(op.pieces||[]).map(piece=>piece.id)].filter(Boolean)));
  for(const element of template.elements){
   assert.ok(element.defaultInput,`${template.id}/${element.id} must describe its empty-input default`);
   const parts=composites[template.id]?.[element.id]||[element.id];
   assert.ok(parts.every(id=>rendered.has(id)),`${template.id}/${element.id} vanished from the empty-input cover`);
  }
  assert.equal(operations.some(op=>op.op==='material.add'),false,`${template.id} default must not need private art`);
 }
 const fruit=compileCurrentTemplate({templateId:'S06-白粉果实'}).operations;
 for(const id of ['L-fruit-photo','L-flower','R-fig-card','R-flower'])
  assert.equal(fruit.find(op=>op.id===id)?.op,'paper.add',`${id} should be an editable card without user art`);
 assert.ok(!fruit.some(op=>op.op==='graphic.add'&&op.geometry?.kind==='flower'),
  'the original flower photographs must not become synthetic flower stickers');
});

test('a planned source replaced by a generated default remains in the candidate tray',()=>{
 const source={id:'paper-source',title:'深蓝素色纸',kind:'paper',physicalWidthMM:66,physicalHeightMM:70,mainColor:'#171D2A'};
 const [match]=rankCurrentTemplates({materials:[source],pageMode:'single',templateIds:['D146'],limit:1});
 assert.ok(match.assignments.length);
 const slot=match.assignments[0].slotId;
 const compiled=compileCurrentTemplate({templateId:'D146',assets:[source],plan:match.plan,
  slotValues:{[slot]:{generated:true}}});
 assert.equal(compiled.operations.some(op=>op.op==='material.add'&&op.asset===source.id&&op.place?.surface!=='tray'),false);
 assert.equal(compiled.operations.some(op=>op.op==='material.add'&&op.asset===source.id&&op.place?.surface==='tray'),true);
 assert.deepEqual(compiled.report.used,[]);
});

test('a whole rectangular source aligns its visible content when transparent padding is asymmetric',()=>{
 const source={id:'offset-paper',title:'深蓝素色纸',kind:'paper',physicalWidthMM:53,physicalHeightMM:43,
  mainColor:'#171D2A',systemAttributes:{visualBoundsRatio:[.1,.1,.8,.9]}};
 const [match]=rankCurrentTemplates({materials:[source],pageMode:'single',templateIds:['D146'],limit:1});
 const choice=match.plan.assignments.find(assignment=>assignment.asset===source.id);
 assert.equal(choice.method,'complete');
 assert.ok(Math.abs(choice.shiftMm[0])>1);
 const draft=compileCurrentTemplate({templateId:'D146',assets:[source],plan:match.plan});
 const placed=draft.operations.find(op=>op.op==='material.add'&&op.asset===source.id&&op.place?.surface!=='tray');
 assert.ok(placed);
 assert.ok(Math.abs(placed.place.at[0]-choice.centerMm[0])<.01);
 assert.ok(Math.abs(placed.place.at[1]-choice.centerMm[1])<.01);
});
