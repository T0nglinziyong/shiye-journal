import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/domain.js';
import {presetJournalTemplates,normalizeUserTemplate,rankJournalTemplates,USER_TEMPLATE_PREFIX} from '../src/journal-template-catalog.js';
import {journalTemplateRecords,saveJournalUserTemplate,validateJournalImage} from '../src/journal-template-ui.js';
import {selectJournalAbstractTemplates,journalAbstractTemplateGuide} from '../src/journal-abstract-templates.js';
import {selectJournalReferenceCases} from '../src/journal-reference-catalog.js';
import {workInTab} from '../src/work-collections.js';
import {loadJournalTemplateReferences} from '../src/journal-template-references.js';

test('all sourced preset templates have multiple searchable indexes and remain separate from projects',()=>{
  const templates=presetJournalTemplates();
  assert.equal(templates.length,70);
  assert.ok(templates.every(item=>item.tags.length>=3&&item.styles.length&&item.purposes.length));
  assert.equal(templates.find(item=>item.id==='red-market-two-column-timeline').exampleSourceNumbers[0],35);
  assert.equal('isTemplate' in project('作品'),false);
  assert.equal(workInTab(project('作品'),'templates'),false);
});

test('style, purpose and material tags rank the closest preset and paired case',()=>{
  const context={styles:['密集拼贴'],purposes:['图文收藏'],materials:[{title:'食物照片',tags:['时间轴']} ]};
  const top=rankJournalTemplates(context);
  assert.equal(top[0].id,'red-market-two-column-timeline');
  const selected=selectJournalAbstractTemplates(selectJournalReferenceCases(context),context);
  assert.ok(selected.some(item=>item.id===top[0].id));
});

test('manual template and its paired case are account records, not material or project records',async()=>{
  const operations=[];
  const db={transaction:async(names,fn)=>{assert.deepEqual(names,['meta','blobs']);fn({objectStore:name=>({put:item=>operations.push({name,item})})});}};
  const templateImage=new Blob(['template'],{type:'image/png'}),caseImage=new Blob(['case'],{type:'image/jpeg'});
  const record=await saveJournalUserTemplate(db,{title:'复古两列',structure:'以纵向时间轴贯穿双页，主图与文字交错。',tags:['时间轴','食物','复古'],styles:['密集拼贴'],purposes:['日常记录']},{templateImage,caseImage});
  assert.ok(record.id.startsWith(USER_TEMPLATE_PREFIX));
  assert.deepEqual(operations.map(op=>op.name),['blobs','blobs','meta']);
  assert.equal(operations[0].item.data,templateImage);
  assert.equal(operations[1].item.data,caseImage);
  assert.deepEqual(journalTemplateRecords([{id:'other'},record]).map(item=>item.id),[record.id]);
  assert.throws(()=>validateJournalImage(new Blob(['bad'],{type:'image/svg+xml'})),/PNG/);
  assert.throws(()=>normalizeUserTemplate({...record,tags:[]}),/标签/);
});

test('manual template indexes participate in AI selection and guide without pretending to be a preset image',()=>{
  const custom=normalizeUserTemplate({id:USER_TEMPLATE_PREFIX+'test',title:'茶饮票根轴',structure:'茶饮主图沿票根阅读轴与文字交错。',tags:['茶饮','票根','路线'],styles:['旅行票据'],purposes:['旅途记录'],templateBlobId:'template-image',exampleBlobId:'case-image'});
  const context={styles:['旅行票据'],purposes:['旅途记录'],materials:[{title:'茶饮票根',tags:['路线']}],userTemplates:[custom]};
  const chosen=selectJournalAbstractTemplates(selectJournalReferenceCases(context),context);
  assert.ok(chosen.some(item=>item.id===custom.id));
  assert.match(journalAbstractTemplateGuide(chosen),/用户导入模板，有配对案例/);
});

test('AI reference bundle includes both uploaded template and paired case, separate from physical materials',async()=>{
  const custom=normalizeUserTemplate({id:USER_TEMPLATE_PREFIX+'paired',title:'茶饮票根轴',structure:'主图、票根与文字沿阅读轴错列。',tags:['茶饮','票根','路线'],styles:['旅行票据'],purposes:['旅途记录'],templateBlobId:'diagram',exampleBlobId:'finished'});
  const originalFetch=globalThis.fetch,originalReader=globalThis.FileReader;
  globalThis.fetch=async()=>({ok:true,blob:async()=>new Blob([new Uint8Array([137,80,78,71,1])],{type:'image/png'})});
  globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload?.();});}};
  try{
    const db={get:async(store,id)=>({data:new Blob([id],{type:id==='finished'?'image/jpeg':'image/png'})})};
    const result=await loadJournalTemplateReferences({context:{styles:['旅行票据'],purposes:['旅途记录'],materials:[{title:'茶饮票根',tags:['路线']}]},userTemplates:[custom],db});
    assert.ok(result.selectedTemplates.some(entry=>entry.id===custom.id));
    assert.deepEqual(result.referenceImages.filter(entry=>entry.id.startsWith(custom.id)).map(entry=>entry.kind),['template','case']);
    assert.ok(result.referenceImages.every(entry=>entry.bytes.length>0&&entry.url.startsWith('data:image/')));
  }finally{globalThis.fetch=originalFetch;globalThis.FileReader=originalReader;}
});
