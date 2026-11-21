import {freezeCraftTask} from './craft-task.js';
import {taskFingerprint} from './task-fingerprint.js';
import {schemaFingerprint} from './creative-contract.js';
import {webSceneContract,webSceneDocument,validateWebScene} from './web-scene-workbench.js';
import {attachSceneV2} from './scene-v2.js';

export function creationSourceForProject(p,aliases){
 const d=p.drafts[0],priority=p.materialPriority||{required:p.requiredAssetIDs||[],preferred:Object.values(aliases).filter(id=>!(p.requiredAssetIDs||[]).includes(id)),available:[]};
 return structuredClone({bundleId:crypto.randomUUID(),title:p.title,mode:d.pageMode,ratio:d.pageRatio,styles:p.styles||[d.style],purposes:p.purposes||[p.purpose||'自由创作'],intent:p.intent||'',contentPolicy:p.contentPolicy||'original',textPresentation:p.textPresentation||'mixed',userText:p.userText||'',providedFacts:p.providedFacts||'',processing:p.processing||'自由拆解',requiredAssetIDs:p.requiredAssetIDs||[],materialPriority:{required:priority.required||[],preferred:priority.preferred||[],available:priority.available||[]},materials:Object.entries(aliases).map(([alias,assetID])=>({alias,assetID}))});
}

export async function createCreationDocument({draft,assets,aliases={},title='新的手帐',prompt='',pagePurposes,styles,contentPolicy='original',textPresentation='mixed',userText='',providedFacts='',processing='自由拆解',requiredAssetIDs=[],materialPriority,textMode='automatic'}){
 const base=attachSceneV2(structuredClone(draft));
 const source=creationSourceForProject({title,drafts:[base],intent:prompt,purposes:pagePurposes,styles,contentPolicy,textPresentation,userText,providedFacts,processing,requiredAssetIDs,materialPriority},aliases);
 Object.assign(source,{creationMode:'edit',taskBinding:'local',packageLayout:'v3',textMode:contentPolicy==='visual'?'none':textMode,capabilities:{sceneWorkbench:true},schemaHash:schemaFingerprint(webSceneContract)});
 freezeCraftTask(source,base,assets);source.taskHash=await taskFingerprint(source);
 const document=webSceneDocument(source,base,title);validateWebScene(document.page,source,assets,{final:false});return document;
}
