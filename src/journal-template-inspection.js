import {currentTemplate,materialTemplateProfile} from '../creative-agent/library/current-templates.js';
import {describeTemplateObjects,describeSingleSlotMatch,scoreSingleTemplateSlot,compileMatchedTemplate} from '../creative-agent/library/adaptive-template-matcher.js';
import {describeSixSpreadTemplate,describeSixSlotMatch,scoreSixSpreadSlot,compileSixSpreadTemplate} from '../creative-agent/library/six-spread-templates.js';
import {describeThreeLayoutSpread,describeThreeSlotMatch,scoreThreeLayoutSlot,compileThreeLayoutSpread} from '../creative-agent/library/three-layout-template-matcher.js';

const singles=new Set(['D143','D146','D153','D158','D162']);
const six=new Set(['S01-苹果绿白','S02-青黄面包','S03-棕蓝爱心','S04-粉黑百合','S05-灰黄甜点','S06-白粉果实']);
function exampleMaterial(templateId,slotId,role,targetMm){
 const paper=/paper|card|vellum|translucent/.test(role),figure=role==='figure';
 const strip=role==='strip'||role==='tape';
 const stripLong=Math.max(Math.max(...targetMm),Math.min(...targetMm)*1.5);
 const stripShort=Math.min(Math.min(...targetMm)*1.2,stripLong/3.1);
 const width=slotId==='title-tape'?45:strip&&targetMm[1]>targetMm[0]?stripShort:strip?stripLong:targetMm[0];
 const height=slotId==='title-tape'?20:strip&&targetMm[1]>targetMm[0]?stripLong:strip?stripShort:targetMm[1];
 return {alias:`example:${slotId}`,id:`example:${slotId}`,title:/lace/.test(slotId)?'蕾丝胶带':
  /bread/.test(slotId)?'面包照片':/flower/.test(slotId)?'花朵主体':'示例素材',
  kind:role==='photo'?'photo':role==='sticker'?'sticker':paper||templateId==='D146'?'paper':'sticker',
  physicalWidthMM:width,physicalHeightMM:height,visualRoles:[role],preservation:slotId==='title-tape'?'splittable':paper?'repeatable':'whole',
  writableAreaRatio:1,canWriteOn:true,shape:figure?'die-cut':'rect',mainColor:'#20252A'};
}
const defaultSlotPrefixes={'D146/stamp-material':['stamp-'],'D146/top-clip':['clip-']};
const operationsFor=(operations,templateId,slotId)=>operations.filter(op=>op.id===slotId||op.target===slotId||op.id?.startsWith(`${slotId}-`)||
 defaultSlotPrefixes[`${templateId}/${slotId}`]?.some(prefix=>op.id?.startsWith(prefix)))
 .map(op=>structuredClone(op));

// Read the same candidate functions and compilers used by automatic matching.
// This view must not maintain its own replacement algorithm.
export function inspectJournalTemplateSlot(templateId,slotId,assets=[]){
 if(!currentTemplate(templateId))return null;
 const family=singles.has(templateId)?'single':six.has(templateId)?'six':'three';
 const source=family==='single'?describeTemplateObjects(templateId):family==='six'?describeSixSpreadTemplate(templateId):describeThreeLayoutSpread(templateId);
 const slot=family==='single'?source.objects.find(item=>item.id===slotId):source.slots.find(item=>item.id===slotId);
 if(!slot)return null;
 const rule=family==='single'?describeSingleSlotMatch(templateId,slotId):family==='six'?describeSixSlotMatch(templateId,slotId):describeThreeSlotMatch(templateId,slotId);
 const compile=(asset,match)=>{
  if(family==='single'){
   const assignments=source.materialSlots.map(name=>name===slotId&&asset?
    {slot:name,...match}:{slot:name,asset:null,method:'generated',score:.37});
   return compileMatchedTemplate({templateId,used:asset?[asset.alias]:[],assignments,score:match?.score||0},asset?[asset]:[]);
  }
  const plan=asset?{templateId,assignments:[{slot:slotId,...match}],used:[asset.alias]}:undefined;
  return family==='six'?compileSixSpreadTemplate({templateId,assets:asset?[asset]:[],plan}):
   compileThreeLayoutSpread({templateId,assets:asset?[asset]:[],plan});
 };
 const score=family==='single'?scoreSingleTemplateSlot:family==='six'?scoreSixSpreadSlot:scoreThreeLayoutSlot;
 const candidates=rule.acceptedRoles.length?assets.filter(asset=>!asset.isProjectInternal&&asset.usage!=='calibration-only')
  .map(asset=>materialTemplateProfile(asset)).filter(asset=>asset.alias&&asset.physicalWidthMM>0&&asset.physicalHeightMM>0)
  .map(asset=>({asset,match:score(templateId,slotId,asset)})).filter(item=>item.match)
  .sort((a,b)=>b.match.score-a.match.score):[];
 const defaultOperations=operationsFor(compile().operations,templateId,slotId);
 const first=candidates[0];
 const sample=!first&&rule.acceptedRoles.length?exampleMaterial(templateId,slotId,rule.acceptedRoles[0],rule.targetMm):null;
 const sampleMatch=sample?score(templateId,slotId,sample):null;
 const replacementAsset=first?.asset||sampleMatch&&sample;
 const replacementMatch=first?.match||sampleMatch;
 return {templateId,slotId,role:slot.role,page:slot.page||'single',purpose:slot.purpose||null,
  defaultInput:currentTemplate(templateId).elements.find(item=>item.id===slotId)?.defaultInput||'可编辑默认对象',
  targetMm:rule.targetMm,acceptedRoles:rule.acceptedRoles,gates:rule.gates,
  score:rule.score,slotWeight:rule.slotWeight??null,threshold:rule.score.minimum??null,
  fallback:rule.fallback,cropPolicy:rule.cropPolicy,automaticPaper:rule.automaticPaper||false,
  defaultOperations,candidates:candidates.slice(0,8).map(({asset,match})=>({asset:asset.alias,
   title:asset.title||asset.name||asset.alias,score:match.score,method:match.method||'complete',
   place:match.centerMm||match.at||null,sourceMm:match.sourcePhysicalSizeMm||match.sourceMm||null})),
  candidateCount:candidates.length,
  replacement:replacementAsset?{asset:replacementAsset.alias,example:!first,
   score:replacementMatch.score,operations:operationsFor(compile(replacementAsset,replacementMatch).operations,templateId,slotId)}:null};
}
