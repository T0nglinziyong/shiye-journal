import test from 'node:test';
import assert from 'node:assert/strict';
import {solveTemplateAssignments,MATCHING_VERSION} from '../creative-agent/library/unified-template-matcher.js';
import {rankCurrentTemplates,currentTemplate,compileCurrentTemplate} from '../creative-agent/library/current-templates.js';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {compileThreeLayoutSpread} from '../creative-agent/library/three-layout-template-matcher.js';

const slot=(id,x)=>({id,role:'paper',page:'single',box:[x,0,.3,.3],sizeMm:[40,40],weight:1,splitKind:'paper'});
const paper=(id,w,h,preservation='splittable')=>({id,alias:id,kind:'paper',visualRoles:['plain-paper'],
 physicalWidthMM:w,physicalHeightMM:h,preservation,mainColor:'#E6D9B8'});
const scoreCandidate=(asset,target)=>{
 const ratio=Math.min(asset.physicalWidthMM/target.sizeMm[0],asset.physicalHeightMM/target.sizeMm[1]);
 if(ratio<.95||ratio>1.1)return null;
 return {score:1,at:[20,20]};
};
const solve=assets=>solveTemplateAssignments({templateId:'two-paper-slots',slots:[slot('a',0),slot('b',.65)],
 assets,scoreCandidate,defaultScore:.3});

test('同源切两片只是候选；独立纸张更合适时分别使用',()=>{
 const sheet=paper('sheet',80,40),a=paper('a-paper',40,40),b=paper('b-paper',40,40);
 const split=solve([sheet]);
 assert.equal(split.matchingVersion,MATCHING_VERSION);
 assert.equal(split.splitGroups.length,1);
 assert.deepEqual(split.assignments.map(choice=>choice.asset),['sheet','sheet']);
 assert.deepEqual(split.used,['sheet']);
 const independent=solve([sheet,a,b]);
 assert.equal(independent.splitGroups.length,0);
 assert.deepEqual(new Set(independent.assignments.map(choice=>choice.asset)),new Set(['a-paper','b-paper']));
});

test('裁片必须在源纸内真实排得下；不可裁的主体不会切分',()=>{
 assert.equal(solve([paper('small',70,70)]).splitGroups.length,0,
  '两片 40×40 面积总和虽小于 70×70，仍无法几何装入');
 assert.equal(solve([paper('printed',80,40,'whole')]).splitGroups.length,0);
});

test('必用素材在初稿提高优先级，但不强塞不合适的来源',()=>{
 const good=paper('good',40,40),wrong=paper('wrong',12,12);
 const plan=solveTemplateAssignments({templateId:'required',slots:[slot('a',0)],assets:[good,wrong],
  scoreCandidate,defaultScore:.3,mustUse:['good']});
 assert.equal(plan.mustUseSatisfied,true);
 assert.deepEqual(plan.used,['good']);
 assert.deepEqual(plan.unused,['wrong']);
 const preferred=solveTemplateAssignments({templateId:'required',slots:[slot('a',0)],
  assets:[paper('ordinary',40,40),paper('priority',40,40)],
  scoreCandidate:(asset,target)=>({score:asset.alias==='priority'?.75:.8,at:[20,20]}),
  mustUse:['priority']});
 assert.deepEqual(preferred.used,['priority']);
 const impossible=solveTemplateAssignments({templateId:'required',slots:[slot('a',0)],assets:[good,wrong],
  scoreCandidate,defaultScore:.3,mustUse:['wrong']});
 assert.equal(impossible.mustUseSatisfied,false);
 assert.deepEqual(impossible.missingRequired,['wrong']);
 assert.deepEqual(impossible.used,['good']);
});

test('真实模板同源分片可执行，未用素材进入待放区',async()=>{
 const asset=paper('sheet',120,160),unused=paper('unused',10,10),optional=paper('optional',8,8),
  assets=[asset,unused,optional];
 const rows=rankCurrentTemplates({materials:assets,pageMode:'spread',limit:14});
 const row=rows.find(item=>item.id==='XHS-排版第四弹');
 assert.ok(row.plan.splitGroups.length);
 const template=currentTemplate(row.id),page=draft({mode:'spread',ratio:'a4'});
 page.physicalPageHeightMM=template.pageMm[1];page.canvas.width=page.canvas.height*template.aspect;
 page.pageRatio='custom:125x176';
 const document=await createCreationDocument({draft:page,assets,
  aliases:{sheet:'sheet',unused:'unused',optional:'optional'},
  requiredAssetIDs:['unused']});
 const compiled=compileCurrentTemplate({templateId:row.id,assets,plan:row.plan});
 assert.equal(compileThreeLayoutSpread({templateId:row.id,assets:[asset],plan:row.plan}).operations
  .filter(op=>op.op==='material.split').length,1);
 const split=compiled.operations.filter(op=>op.op==='material.split');
 assert.equal(split.length,1);assert.equal(split[0].pieces.length,2);
 assert.equal(new Set(split[0].pieces.map(part=>part.id)).size,2);
 assert.deepEqual(compiled.operations.filter(op=>op.op==='material.add').map(op=>[op.asset,op.place.surface]),
  [['unused','tray'],['optional','tray']]);
 const result=applyCreationTransaction(document,{protocolVersion:2,transactionId:'unified-split-test',
  baseSceneRevision:creationSceneRevision(document),operations:compiled.operations},assets);
 assert.ok(result.changed);
 for(const part of split[0].pieces)assert.ok(result.document.page.layers.some(layer=>layer.creativePieceID===part.id));
 assert.ok(result.document.page.layers.some(layer=>layer.assetID==='unused'&&layer.isParked));
 assert.ok(result.document.page.layers.some(layer=>layer.assetID==='optional'&&layer.isParked));
});
