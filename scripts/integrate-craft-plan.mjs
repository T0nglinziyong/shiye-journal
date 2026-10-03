// One-time integration on this development branch. The generated source
// changes, not this script, are tested and committed. No user data is accessed.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const prior=await import('../src/creative-contract.js');
mkdirSync('tests/fixtures',{recursive:true});
writeFileSync('tests/fixtures/craft-plan-prior-schema-hashes.json',JSON.stringify(Object.fromEntries(['agent','direct'].flatMap(mode=>[[mode,prior.schemaFingerprint(prior.offlineContract(mode))],['craftV2-'+mode,prior.schemaFingerprint(prior.offlineContract(mode,{craftV2:true}))]])),null,2)+'\n');
function once(text,from,to){const index=text.indexOf(from);if(index<0||text.indexOf(from,index+from.length)>=0)throw Error('Absent or ambiguous integration anchor: '+from.slice(0,120));return text.slice(0,index)+to+text.slice(index+from.length);}
function edit(path,fn,expected){const before=readFileSync(path,'utf8'),bytes=Buffer.from(before),hash=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');if(expected&&hash!==expected)throw Error(path+' changed since review; refusing overwrite: '+hash);const after=fn(before);if(after===before)throw Error('No change '+path);writeFileSync(path,after);console.log('Integrated',path);}
edit('src/creative-contract.js',text=>{
 text="import {regionOperationSchemas,craftPlanContract,craftPlanDescription} from './craft-plan-contract.js';\n"+text;
 text=once(text,'// A task exports exactly the schema used to validate its return.',`// Keep both generations of exported tasks byte-compatible. New capabilities
// are selected explicitly; adding a runtime tool never widens an old task.
const phaseOneToolContracts=structuredClone(toolContracts);
const phaseOneDirectPageContract=structuredClone(directPageContract);
operationContract.anyOf.push(...regionOperationSchemas);
toolContracts.apply_craft_plan=craftPlanContract({operation:operationContract,relation:material.properties.relation,paper,text,primitive,ink:inkStroke});
agentTools.push({type:'function',function:{name:'apply_craft_plan',description:craftPlanDescription,parameters:toolContracts.apply_craft_plan}});
// A task exports exactly the schema used to validate its return.`);
 text=once(text,"export function offlineContract(mode,{cropPx=false,craftV2=false}={}){\n  if(mode==='direct')return craftV2?directPageContract:legacyDirectPageContract;\n  const contracts=Object.fromEntries(Object.entries(craftV2?toolContracts:legacyToolContracts)","export function offlineContract(mode,{cropPx=false,craftV2=false,craftPlanV2=false}={}){\n  if(mode==='direct')return craftPlanV2?directPageContract:craftV2?phaseOneDirectPageContract:legacyDirectPageContract;\n  const contracts=Object.fromEntries(Object.entries(craftPlanV2?toolContracts:craftV2?phaseOneToolContracts:legacyToolContracts)");
 return text;
},'7b29491895e030f043340699ed9523abfe84e74b');
edit('src/material-mask.js',text=>{
 text="import {normalizeGeometry} from './craft-topology.js';\n"+text;
 return once(text,"export function materialMaskGeometry(mask){\n  if(!mask)return null;",`export function materialMaskGeometry(mask){
  if(!mask)return null;
  if(mask.shape==='region'){
    const rings=[mask.outer,...(mask.holes||[])];
    if(!Array.isArray(mask.holes)||rings.some(r=>!Array.isArray(r)||r.some(p=>!validPoint(p))))throw Error('复合材料轮廓必须在源裁片内部');
    const geometry=normalizeGeometry([rings]);if(geometry.length!==1)throw Error('一个实体片段必须连通');
    const open=r=>r.length>3&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]?r.slice(0,-1):r;
    return {outer:open(geometry[0][0]),holes:geometry[0].slice(1).map(open)};
  }`);
},'b31253c24e68996b39dc5324e1a705546234f16b');
edit('src/creative.js',text=>{
 text="import {applyCraftPlan} from './craft-plan.js';\nimport {applyRegionOperation,itemSourceGeometry} from './craft-region-ops.js';\nimport {normalizeGeometry,geometryIntersection,geometryArea} from './craft-topology.js';\nimport {assertProtectedRegions} from './material-anatomy.js';\nimport {isManagedUnchanged,recordManagedChanges,layerFingerprint} from './craft-fingerprint.js';\nimport {craftDiagnostic,craftAssert} from './craft-errors.js';\n"+text;
 text=once(text,'sourceIntersectionArea(previous,region)>1e-6','geometryArea(geometryIntersection(normalizeGeometry([[previous.outer,...previous.holes]]),normalizeGeometry([[region.outer,...region.holes]])))>1e-6');
 text=once(text,"    if(op.op==='edge'){",`    if(op.op==='extract_region'||op.op==='cut_shape'){
      const next=applyRegionOperation({operation:op,current,mask,asset,permission:permission(options,asset)});
      current=next.current;mask=next.mask;steps.push(structuredClone(op));continue;
    }
    if(op.op==='edge'){`);
 text=once(text,'item.materialSteps=steps;item.operation=steps.at(-1)||{op:\'whole\'};baseline(item);',"item.materialSteps=steps;item.operation=steps.at(-1)||{op:'whole'};assertProtectedRegions(asset,itemSourceGeometry(item,asset));baseline(item);");
 text=once(text,"  d.items=d.items.filter(i=>!i.creativePieceID||i.isLocked||i.locked);\n  d.textBlocks=d.textBlocks.filter(i=>!i.agentKey||i.isLocked||i.locked);\n  d.primitives=d.primitives.filter(i=>!i.key||i.isLocked||i.locked);\n  d.strokes=(d.strokes||[]).filter(i=>!i.agentGenerated||i.isLocked||i.locked);", "  d.items=d.items.filter(i=>!i.creativePieceID||!isManagedUnchanged(i));\n  d.textBlocks=d.textBlocks.filter(i=>!i.agentKey||!isManagedUnchanged(i));\n  d.primitives=d.primitives.filter(i=>!i.key||!isManagedUnchanged(i));\n  d.strokes=(d.strokes||[]).filter(i=>!i.agentGenerated||!isManagedUnchanged(i));");
 text=once(text,"  switch(name){\n    case 'compose_story_page':",`  switch(name){
    case 'apply_craft_plan':return applyCraftPlan({draft:d,plan:a,assets,aliases,options,api:{
      upsert:args=>upsertMaterials(d,assets,aliases,args,options),paper:args=>setPaper(d,args),
      texts:args=>putTexts(d,args,options),graphics:args=>putGraphics(d,args),ink:args=>putInk(d,args),
      validate:()=>checkDraft(d,assets),finish:args=>finish(d,assets,args,options)
    }});
    case 'compose_story_page':`);
 text=once(text,"const input=typeof raw==='string'?JSON.parse(raw):raw;if(input?.version===3)","const input=typeof raw==='string'?JSON.parse(raw):raw;if(input?.format==='shiye-craft-plan'&&input.version===2)return [{name:'apply_craft_plan',arguments:input,id:input.commandId}];if(input?.version===3)");
 text=once(text,'      const outcome=execute(draft,assets,aliases,call.name,args,options);mutated||=outcome.mutation;',`      if(call.name==='apply_craft_plan'&&args.finish!==false&&(n!==calls.length-1||results.some(r=>!r.ok)))throw Error('完成工艺计划必须是本轮最后操作且前面全部成功');
      const outcome=execute(draft,assets,aliases,call.name,args,options);
      for(const field of ['items','textBlocks','primitives','strokes'])for(const old of snapshot[field]||[]){
        if(old.aiManaged&&!isManagedUnchanged(old)){
          const current=(draft[field]||[]).find(item=>item.id===old.id);
          craftAssert(current&&layerFingerprint(current)===layerFingerprint(old),'MANUAL_EDIT_PROTECTED','该图层已被用户接管；未覆盖已有手改',{pieceId:keyOf(old)});
        }
      }
      if(outcome.mutation)recordManagedChanges(snapshot,draft);mutated||=outcome.mutation;`);
 text=once(text,"results.push({id:call.id,name:call.name,ok:false,detail:error.message});", "results.push({id:call.id,name:call.name,ok:false,detail:error.message,...craftDiagnostic(error)});");
 return text;
},'ff8268d0eaeca397582ed8fdbc8007320cf67071');
edit('src/asset-editor.js',text=>{
 text="import {mountMaterialAnatomy} from './material-anatomy-ui.js';\n"+text;
 text=once(text,'  const a=c.state.assets.find(a=>a.id===id);if(!a)return;','  const a=c.state.assets.find(a=>a.id===id);if(!a)return;let anatomyEditor;');
 text=once(text,"      await c.db.put('assets',next);", "      const anatomy=anatomyEditor?.commit(next);if(anatomy!==undefined)next.anatomy=anatomy;\n      await c.db.put('assets',next);");
 text=once(text,'  while(stack.firstChild)controls.append(stack.firstChild);stack.replaceWith(controls);','  anatomyEditor=mountMaterialAnatomy(c,a,controls,tabs);\n  while(stack.firstChild)controls.append(stack.firstChild);stack.replaceWith(controls);');
 return once(text,"onDialogClosed(c.modal,()=>c.modal.classList.remove('material-editor-dialog'));", "onDialogClosed(c.modal,()=>{anatomyEditor?.dispose();c.modal.classList.remove('material-editor-dialog');});");
},'c89437c87fa52ef489a415cb372862349d1567b0');
edit('src/native-project-package.js',text=>{
 text=once(text,'const {__cloudBaseRevision,__cloudSessionId,...portableProject}=project;', 'const {__cloudBaseRevision,__cloudSessionId,editHistory:_temporaryHistory,...portableProject}=project;');
 text=once(text,"  if(source.editHistory?.undo?.length||source.editHistory?.redo?.length)throw Error('工程包含无法安全映射的旧撤销记录');", "  // Undo stacks are session-local. Retain the actual current scene and all\n  // immutable archives, but do not resurrect a foreign session's undo state.");
 text=text.replaceAll('validateDraft(', 'validateNativeDraft(');
 text=once(text,'function validateNativeDraft(draft,known){','export function validateNativeDraft(draft,known){');
 text=once(text,'    d.id=mapped(draftMap,d.id);',"    d.id=mapped(draftMap,d.id);delete d.craftReceipts;\n    for(const field of ['items','primitives','textBlocks','strokes'])for(const item of d[field]||[])delete item.aiManaged;");
 text=once(text,'  project.id=uid();delete project.__cloudBaseRevision;',`  const reviseReferences=d=>{for(const item of d.items||[])for(const key of ['target','target2'])if(item.materialRelation?.[key]&&objectMap.has(item.materialRelation[key]))item.materialRelation[key]=objectMap.get(item.materialRelation[key]);};
  for(const draft of project.drafts)reviseReferences(draft);
  for(const draft of project.initialEditorSnapshot?.drafts||[])reviseReferences(draft);
  for(const draft of Object.values(project.draftHistorySnapshots||{}))reviseReferences(draft);
  for(const archive of project.manualArchives||[])for(const draft of archive.drafts||[])reviseReferences(draft);
  project.id=uid();delete project.__cloudBaseRevision;`);
 text=once(text,"  for(const item of draft.items)if(item.materialRelation?.target&&!semanticKeys.has(item.materialRelation.target))throw Error('工程包图层关系引用无效');", "  for(const item of draft.items)for(const key of ['target','target2'])if(item.materialRelation?.[key]&&!semanticKeys.has(item.materialRelation[key]))throw Error('工程包图层关系引用无效');");
 return text;
},'e43745c1ce463d765eb540291fbe74dcad3b6cc5');
edit('src/offline-creation.js',text=>{
 text="import {freezeCraftTask,validateCraftTask,inheritCreationBrief,craftTaskInstructions} from './craft-task.js';\nimport {validateNativeDraft} from './native-project-package.js';\n"+text;
 text=once(text,"const allowedTools=new Set(['compose_page'", "const allowedTools=new Set(['apply_craft_plan','compose_page'");
 text=once(text,"source.capabilities={cropPx:false,craftV2:true,validateOffline:true", "source.capabilities={cropPx:false,craftV2:true,craftPlanV2:true,validateOffline:true");
 text=once(text,'  source.schemaHash=schemaFingerprint(exportedContract);',"  source.schemaHash=schemaFingerprint(exportedContract);source.planSchemaHash=schemaFingerprint(toolContracts.apply_craft_plan);\n  freezeCraftTask(source,p.drafts[0],assets);");
 text=once(text,"'START_HERE.txt':strToU8(handoffInstructions)","'START_HERE.txt':strToU8(handoffInstructions+'\\n\\n'+craftTaskInstructions),'CRAFT_PLAN.schema.json':strToU8(JSON.stringify(toolContracts.apply_craft_plan,null,2)),'regions.json':strToU8(JSON.stringify(source.sourceSnapshots.map(s=>({assetID:s.assetID,sourceRevision:s.sourceRevision,anatomy:s.anatomy})),null,2))");
 text=once(text,"  const direct=input.page!==undefined;\n  const tools=direct?directPageToTools(input.page):input.tools;\n  if(!Array.isArray(tools)||!tools.length||tools.length>12||(direct?tools.length!==1||tools[0].name!=='compose_direct_page':tools.at(-1)?.name!=='finish_design'||!tools.some(t=>t.name==='compose_page')))throw Error('作品需要 compose_page 与最后的 finish_design，或完整可编辑页面');",`  const direct=input.page!==undefined,planned=input.plan!==undefined;
  if([input.page,input.plan,input.tools].filter(value=>value!==undefined).length!==1)throw Error('作品只能包含 page、plan、tools 中的一种入口');
  const tools=planned?[{name:'apply_craft_plan',arguments:input.plan}]:direct?directPageToTools(input.page):input.tools;
  const standalonePlan=Array.isArray(tools)&&tools.length===1&&tools[0]?.name==='apply_craft_plan';
  if(!Array.isArray(tools)||!tools.length||tools.length>12||(direct?tools.length!==1||tools[0].name!=='compose_direct_page':!standalonePlan&&(tools.at(-1)?.name!=='finish_design'||!tools.some(t=>t.name==='compose_page'||t.name==='apply_craft_plan'))))throw Error('作品需要完整页面、完整工艺计划，或以 finish_design 结束的有效工具数组');
  if((planned||tools.some(t=>t.name==='apply_craft_plan'))&&!source.capabilities?.craftPlanV2)throw Error('原始任务未声明工艺计划能力');
  const baseDraft=validateCraftTask(source,assets,{trusted:!!trustedSource});`);
 text=once(text,"  if(source.schemaHash){\n    const contract=offlineContract(direct?'direct':'agent',source.capabilities);",`  if(planned){
    if(schemaFingerprint(toolContracts.apply_craft_plan)!==source.planSchemaHash)throw Error('工艺计划合同版本不匹配');
    validateValue(input.plan,toolContracts.apply_craft_plan,'$.plan');
  }else if(source.schemaHash){
    const contract=offlineContract(direct?'direct':'agent',source.capabilities);`);
 text=once(text,'  const selectedAssets=assets.filter(a=>Object.values(aliases).includes(a.id));',"  const selectedAssets=assets.filter(a=>Object.values(aliases).includes(a.id));\n  if(baseDraft){validateNativeDraft(baseDraft,new Set(selectedAssets.map(a=>a.id)));p.drafts[0]=baseDraft;p.activeDraftID=baseDraft.id;}");
 text=once(text,"p.styles=source.styles;p.purposes=source.purposes;p.processing=source.processing;p.offlineBundleId=source.bundleId;", "p.styles=source.styles;p.purposes=source.purposes;p.processing=source.processing;p.offlineBundleId=source.bundleId;inheritCreationBrief(p,source);");
 return text;
},'bbd8cfcf4f6fc97559e8187d73b08867f940ebc9');
edit('src/offline-runtime-entry.mjs',text=>{
 text="import {assetFromSourceSnapshot} from './material-anatomy.js';\n"+text;
 return once(text,'const assets=context.materials.map(item=>(', 'const assets=context.source.capabilities?.craftPlanV2?context.source.sourceSnapshots.map(assetFromSourceSnapshot):context.materials.map(item=>(');
},'68df51d5d7a0a72c1b3ef77d04b7671afc633966');
edit('src/creative-runner.js',text=>{
 text="import {craftSceneHash} from './craft-fingerprint.js';\nimport {describeCraftSources} from './craft-task.js';\n"+text;
 text=once(text,' images.forEach((input,i)=>'," first[0].text+='\\n【工艺场景基线】'+craftSceneHash(draft)+'\\n【可用来源版本与已确认区域】'+JSON.stringify(describeCraftSources(assets,aliases));\n images.forEach((input,i)=>");
 return once(text,'const sceneHash=await sceneFingerprint(creativeScene(working,aliases));','const sceneHash=craftSceneHash(working);');
});
edit('src/scene-patch.js',text=>{
 const start=text.indexOf('export function patchSceneState('),end=text.indexOf('// applyPatch',start);if(start<0||end<0)throw Error('Scene patch boundary changed');
 return "import {craftSceneState,craftSceneHash} from './craft-fingerprint.js';\n"+text.slice(0,start)+"export const patchSceneState=craftSceneState;\nexport const patchSceneHash=async draft=>craftSceneHash(draft);\n\n"+text.slice(end);
});
edit('src/material-anatomy-ui.js',text=>once(text,"selected=r.id;points=r.outlineRatio?structuredClone(r.outlineRatio):[];", "selected=r.id;mode=r.outlineRatio?'polygon':'rectangle';points=r.outlineRatio?structuredClone(r.outlineRatio):[];"));
edit('src/craft-plan.js',text=>{
 text=once(text,"return {detail:'该工艺计划已执行，未重复添加实体',mutation:false,data:prior};", "if(plan.finish!==false)api.finish({summary:plan.summary||'已执行的工艺计划'});\n  return {detail:'该工艺计划已执行，未重复添加实体',mutation:false,data:{...prior,replayed:true}};");
 text=once(text,' const {crop,mask}=geometryMaterialRecipe(geometry,asset);\n return [', ' const {crop,mask,box}=geometryMaterialRecipe(geometry,asset);\n if(!mask.holes.length&&Math.abs(geometryArea(geometry)-box.width*box.height)<=AREA_EPSILON)return [{op:\'crop\',box:{unit:\'ratio\',mode:\'keep\',values:[crop.x,crop.y,crop.width,crop.height]}}];\n return [');
 return text;
});
console.log('Core source integration complete; run the actual suite before committing.');
