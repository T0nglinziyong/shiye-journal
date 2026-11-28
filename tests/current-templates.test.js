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
 assert.equal(materialTemplateProfile({...asset,templateUseNotes:'印字完整保留，不可裁切'}).preservation,'whole');
 assert.ok(!materialTemplateProfile({...asset,kindDetail:'sticker.decoration'}).visualRoles.includes('figure'));
 assert.ok(currentTemplateMaterialScores([asset]).get('flower').utility>0);
 const draft=compileCurrentTemplate({templateId:ranked[0].id,assets:[asset]});
 assert.ok(draft.operations.some(op=>op.op==='page.update'));
 assert.throws(()=>compileCurrentTemplate({templateId:'center-1',assets:[asset]}),/新模板/);
});
