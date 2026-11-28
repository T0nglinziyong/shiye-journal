import assert from 'node:assert/strict';
import test from 'node:test';
import {templatePageFit,matchingProfileOnTemplatePage,fitTemplateOperations} from '../creative-agent/library/template-page-fit.js';
import {currentTemplate,compileCurrentTemplate} from '../creative-agent/library/current-templates.js';

test('template page fit scales editable layout uniformly and retains physical sources',()=>{
 const fit=templatePageFit([190,171],[420,297],'spread');
 assert.equal(fit.scale,297/171);
 assert.ok(fit.offsetX>0);
 assert.equal(fit.offsetY,0);
 const source={id:'source',physicalWidthMM:40,physicalHeightMM:20};
 assert.equal(matchingProfileOnTemplatePage(source,fit).physicalWidthMM,40/fit.scale);
 assert.equal(source.physicalWidthMM,40);
 const operations=fitTemplateOperations([
  {op:'paper.add',id:'paper',place:{reference:'page.right',at:[20,30],unit:'mm'},size:{width:30,height:10,unit:'mm'},style:{fill:'#FFFFFF'}},
  {op:'text.add',id:'title',place:{reference:'page.left',at:[10,20],unit:'mm'},size:{width:30,unit:'mm'},style:{fontSizePt:12}},
  {op:'material.add',id:'photo',asset:'source',place:{reference:'page.left',at:[20,30],unit:'mm'}},
  {op:'material.split',asset:'source',pieces:[{id:'part',region:{shape:'rect',space:'source',unit:'mm',box:[0,0,20,20]},place:{reference:'page.right',at:[20,30],unit:'mm'}}]},
  {op:'material.add',id:'tray',asset:'source',place:{reference:'page',at:[.5,.5],unit:'ratio',surface:'tray'}}
 ],fit);
 assert.equal(operations[0].size.width,Math.round(30*fit.scale*1000)/1000);
 assert.equal(operations[1].style.fontSizePt,Math.round(12*fit.scale*1000)/1000);
 assert.deepEqual(operations[2].place.at,operations[0].place.at);
 assert.deepEqual(operations[3].pieces[0].region.box,[0,0,20,20]);
 assert.deepEqual(operations[4].place.at,[.5,.5]);
});

test('every current template fits the requested sheet without changing its page color commands',()=>{
 for(const id of ['D153','S04-粉黑百合','XHS-海岛排版']){
  const template=currentTemplate(id),target=id==='D153'?[210,297]:[420,297];
  const original=compileCurrentTemplate({templateId:id}).operations;
  const fitted=compileCurrentTemplate({templateId:id,pageMm:target}).operations;
  assert.deepEqual(fitted.filter(op=>op.op==='page.update'),original.filter(op=>op.op==='page.update'));
  const first=original.find(op=>op.op==='paper.add'&&op.place?.unit==='mm');
  const adapted=fitted.find(op=>op.id===first.id);
  const scale=templatePageFit(template.pageMm,target,template.pageMode).scale;
  assert.ok(Math.abs(adapted.size.width-first.size.width*scale)<.002,id);
  assert.ok(Math.abs(adapted.size.height-first.size.height*scale)<.002,id);
 }
});
