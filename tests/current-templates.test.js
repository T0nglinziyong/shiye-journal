import test from 'node:test';
import assert from 'node:assert/strict';
import {listCurrentTemplates,rankCurrentTemplates,materialTemplateProfile,
  currentTemplateMaterialScores,compileCurrentTemplate} from '../creative-agent/library/current-templates.js';

test('only the fourteen measured templates enter current matching',()=>{
 const templates=listCurrentTemplates();
 assert.equal(templates.length,14);
 assert.equal(templates.filter(t=>t.pageMode==='single').length,5);
 assert.equal(templates.filter(t=>t.pageMode==='spread').length,9);
 assert.ok(templates.every(t=>t.type==='new'&&t.elements.length&&
  t.elements.every(e=>e.must.length&&e.prefer.length)));
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
