// One-time, guarded codemod for the isolated implementation branch. This is not
// shipped as a runtime patch: after tests the resulting source is committed.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const changes=[];
const legacy=await import('../src/creative-contract.js');
mkdirSync('tests/fixtures',{recursive:true});
writeFileSync('tests/fixtures/craft-v2-legacy-schema-hashes.json',JSON.stringify({agent:legacy.schemaFingerprint(legacy.offlineContract('agent')),direct:legacy.schemaFingerprint(legacy.offlineContract('direct'))},null,2)+'\n');
function edit(path,transform,expectedSHA){
  const before=readFileSync(path,'utf8');
  if(expectedSHA){const bytes=Buffer.from(before);const sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');if(sha!==expectedSHA)throw Error(`${path}: baseline changed (${sha}); refusing to overwrite`);}
  const after=transform(before);if(after===before)throw Error(`${path}: patch made no change`);
  writeFileSync(path,after);changes.push(path);console.log('Patched',path);
}
function once(text,from,to){
  const index=text.indexOf(from);if(index<0||text.indexOf(from,index+from.length)>=0)throw Error('Patch anchor is absent or ambiguous: '+from.slice(0,100));
  return text.slice(0,index)+to+text.slice(index+from.length);
}
const extension=`// Preserve the exact legacy schema for already exported task snapshots.
// New tasks opt in with capabilities.craftV2; old fingerprints remain stable.
const legacyToolContracts=structuredClone(toolContracts);
const legacyDirectPageContract=structuredClone(directPageContract);
const craftEdgeContract=object({op:enums(['edge']),style:enums(['torn','ticket_notch','postage','fringe','partial_tear']),edges:array(enums(['top','right','bottom','left']),1,4),depth_mm:num(.1,100),period_mm:num(.5,1000),seed:integer(0,4294967295),position:num(0,1)},['op','style']);
operationContract.anyOf.push(craftEdgeContract);
const oldRelation=material.properties.relation.anyOf[0];
material.properties.relation.anyOf[0]={anyOf:[oldRelation,
  object({kind:enums(['peek']),target:key,edge:enums(['left','right','top','bottom']),exposed_mm:num(0,1000),along_mm:num(-1000,1000),rotation_offset:num(-180,180)},['kind','target','edge','exposed_mm']),
  object({kind:enums(['underlay']),target:key,offset_mm:array(num(-1000,1000),2,2),rotation_offset:num(-180,180)},['kind','target']),
  object({kind:enums(['bridge']),target:key,target2:key,anchor_from:array(num(0,1),2,2),anchor_to:array(num(0,1),2,2),contact_mm:num(0,100)},['kind','target','target2'])
]};
for(const tool of agentTools){
  if(tool.function.name==='edit_materials')tool.function.description+=' edge 提供 torn/ticket_notch/postage/fringe/partial_tear 参数化裁边，使用 edges、depth_mm、period_mm、seed，先取裁片后加工边缘。';
  if(tool.function.name==='upsert_materials')tool.function.description+=' relation 可用目标局部坐标下的 peek、underlay 或双目标 bridge；不能缩放实物。';
}
`;
edit('src/creative-contract.js',text=>{
  text=once(text,'// A task exports exactly the schema used to validate its return.',extension+'// A task exports exactly the schema used to validate its return.');
  text=once(text,"export function offlineContract(mode,{cropPx=false}={}){\n  if(mode==='direct')return directPageContract;\n  const contracts=Object.fromEntries(Object.entries(toolContracts)","export function offlineContract(mode,{cropPx=false,craftV2=false}={}){\n  if(mode==='direct')return craftV2?directPageContract:legacyDirectPageContract;\n  const contracts=Object.fromEntries(Object.entries(craftV2?toolContracts:legacyToolContracts)");
  return text;
},'d40dbf897eaed943b69004c726a0647493d6a795');
edit('src/creative.js',text=>{
  text="import {buildCraftEdge,craftPermission,sourceFootprint,sourceIntersectionArea} from './craft-geometry.js';\nimport {solveCraftRelations} from './craft-relations.js';\n"+text;
  text=once(text,'import {materialMaskPoints,materialMaskArea,cutMaterialDiagonal,addMaterialWindow}', 'import {materialMaskPoints,materialMaskArea,materialMaskGeometry,cutMaterialDiagonal,addMaterialWindow}');
  text=once(text,"if(a.kind!=='tape'){const group=a.id+':'+unit,used=usage.get(group)||[];if(used.some(r=>overlap(r,crop)))throw Error(a.title+' 同一实物单位的裁片重叠或重复使用');used.push(crop);usage.set(group,used);}","if(a.kind!=='tape'){const group=a.id+':'+unit,used=usage.get(group)||[],region=sourceFootprint(i,a,materialMaskGeometry(i.materialMask));if(used.some(previous=>sourceIntersectionArea(previous,region)>1e-6))throw Error(a.title+' 同一实物单位的裁片重叠或重复使用');used.push(region);usage.set(group,used);} // Intersection tolerance is in source mm².");
  text=once(text,'function permission(options,asset){return options.assetProcessing?.[asset.id]||options.processing;}', 'function permission(options,asset){return craftPermission(options,asset);}');
  text=once(text,"    if(op.op==='mask'){",`    if(op.op==='edge'){
      if(mask)throw Error('参数化边缘应先于开窗；修改边缘请 replace 重放完整工序');
      mask=buildCraftEdge(op,current.width*asset.physicalWidthMM,current.height*asset.physicalHeightMM);
      if(permission(options,asset)==='少量裁剪'&&current.width*current.height*materialMaskArea(mask)<.6-EPS)throw Error(asset.title+' 仅允许少量裁剪，须保留至少60%面积');
      steps.push(structuredClone(op));continue;
    }
    if(op.op==='mask'){`);
  const begin=text.indexOf('function relations(d,list){'),end=text.indexOf('function upsertMaterials(',begin);
  if(begin<0||end<0)throw Error('Missing relation function boundary');
  text=text.slice(0,begin)+`function relations(d,list){
  const updates=solveCraftRelations(entries(d),list,scale(d));
  for(const [key,update] of updates){const item=find(d,key);locked(item);const {materialRelation,...position}=update;Object.assign(item,position);if(materialRelation)item.materialRelation=materialRelation;else delete item.materialRelation;baseline(item);}
}
`+text.slice(end);
  return text;
},'945010f9c74d2f94107edb06a371111206c7d1d3');
edit('src/offline-creation.js',text=>once(text,'source.capabilities={cropPx:false,validateOffline:true,renderOffline:false,previewOffline:', 'source.capabilities={cropPx:false,craftV2:true,validateOffline:true,renderOffline:false,previewOffline:'));
edit('src/creative-layering-guide.js',text=>"import {materialCraftGuide} from './material-craft-guide.js';\n"+once(text,'export const creativeLayeringGuide=',"export const creativeLayeringGuide=materialCraftGuide+'\\n'+"));
edit('src/creative-quality.js',text=>{
  text="import {craftUsage} from './craft-geometry.js';\n"+text;
  return once(text,'warnings:[...new Set(warnings)]};','warnings:[...new Set(warnings)],craft:craftUsage(d)};');
},'ed69d8a6994898fd50011ea416a654fccd5fcf90');
for(const path of ['src/matching-view.js','src/app.js'])edit(path,text=>{
  const from="['保留完整','少量裁剪','自由拆解']";
  if(!text.includes(from))throw Error('Processing selector not found: '+path);
  // Existing selected/default values are untouched; this only adds opt-in UI.
  return text.replaceAll(from,"['AI 自主加工','保留完整','少量裁剪','自由拆解']");
});
console.log('SOURCE_CHANGES',JSON.stringify(changes));
