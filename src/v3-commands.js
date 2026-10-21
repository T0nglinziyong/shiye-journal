import Ajv2020 from 'ajv/dist/2020.js';
import {offlineContract,directPageContract,operationContract} from './creative-contract.js';
import {craftSceneHash} from './craft-fingerprint.js';
import {applyWebSceneCommands,compileWebSceneInput,validateWebScene} from './web-scene-workbench.js';
const str={type:'string',minLength:1,maxLength:192};
const n=(minimum=-10000,maximum=10000)=>({type:'number',minimum,maximum});
const obj=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
const op=(name,properties,required=[])=>obj({op:{const:name},...properties},['op',...required]);
const tools=offlineContract('agent',{cropPx:false});
const position=obj({xMm:n(),yMm:n(),rotationDeg:n(-180,180)},['xMm','yMm']);
const color={type:'string',pattern:'^#[0-9a-fA-F]{6}$'};
const operations=[
 op('material.add',{id:str,asset:str,placement:position},['id','asset','placement']),
 op('material.process',{target:str,mode:{enum:['append','replace']},steps:{type:'array',minItems:1,maxItems:12,items:operationContract}},['target','steps']),
 op('material.craft',{plan:tools.apply_craft_plan},['plan']),
 op('material.tape',{arguments:tools.draw_tape_strips},['arguments']),
 op('text.add',{id:str,content:{type:'string',minLength:1,maxLength:1500},xMm:n(),yMm:n(),widthMm:n(.1,1000),fontSizePt:n(5,400),color},['id','content','xMm','yMm','widthMm']),
 op('shape.add',{id:str,kind:tools.upsert_primitives.properties.items.items.properties.kind,xMm:n(),yMm:n(),widthMm:n(.1,1000),heightMm:n(.1,1000),fill:{type:['string','null']}},['id','kind','xMm','yMm','widthMm','heightMm']),
 op('ink.add',{id:str,points:{type:'array',minItems:1,maxItems:512,items:obj({xMm:n(),yMm:n(),pressure:n(0,1)},['xMm','yMm'])},widthMm:n(.01,50),color,penStyle:{enum:['pressure','fountain','ballpoint','brush','marker']}},['id','points','widthMm','color','penStyle']),
 op('page.update',{paperColor:color,paperPattern:{enum:['plain','lines','grid','dots','columns']},centerGutter:{type:'boolean'}}),
 op('layer.update',{target:str,set:{type:'object',minProperties:1,maxProperties:24}},['target','set']),
 op('layer.delete',{target:str},['target']),
 op('layer.move',{target:str,parent:str,before:str},['target']),
 op('layer.insert',{node:{type:'object'},parent:str},['node']),
 op('layer.replaceMaterial',{target:str,asset:str},['target','asset']),
 op('layer.repeatStamp',{target:str,placements:{type:'array',minItems:1,maxItems:48,items:{type:'object'}}},['target','placements']),
 op('layer.reuseLayout',{layout:{type:'object'},materialMap:{type:'object',additionalProperties:str},prefix:str},['layout']),
 op('material.glyphKnockout',{target:str,geometryMM:{type:'array',minItems:1},originMM:{type:'array',minItems:2,maxItems:2,items:n()}},['target','geometryMM','originMM']),
 op('group.transform',{target:str,transform:{type:'object'}},['target','transform']),
 op('group.create',{id:str,targets:{type:'array',minItems:2,maxItems:24,items:str},name:str},['id','targets']),
 op('group.ungroup',{target:str},['target']),
 op('material.decision',{asset:str,choice:{enum:['intact','crafted','omitted']},reason:{type:'string',minLength:1,maxLength:400}},['asset','choice','reason']),
 op('scene.compose',{page:directPageContract},['page']),
 ...Object.entries(tools).map(([name,args])=>op('tool.'+name,{arguments:args},['arguments']))
];
export const executableCommandNames=Object.freeze(operations.map(schema=>schema.properties.op.const));
export function describeExecutableCommand(name){
 const schema=operations.find(row=>row.properties.op.const===name);
 if(!schema)throw Object.assign(Error('未知操作：'+name),{code:'UNKNOWN_HELP_TOPIC'});
 return {name,protocolVersion:1,available:true,required:schema.required.filter(field=>field!=='op'),schema};
}
export const commandsSchema={$schema:'https://json-schema.org/draft/2020-12/schema',$defs:directPageContract.$defs,type:'object',additionalProperties:false,
 properties:{protocolVersion:{const:1},transactionId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,96}$'},baseSceneRevision:{type:'string',pattern:'^sha256:[a-f0-9]{64}$'},operations:{type:'array',minItems:1,maxItems:200,items:{oneOf:operations}}},required:['protocolVersion','transactionId','baseSceneRevision','operations']};
const validator=new Ajv2020({strict:false,allErrors:true});
const check=validator.compile(commandsSchema);
const opChecks=new Map(operations.map(schema=>[schema.properties.op.const,validator.compile({$schema:commandsSchema.$schema,$defs:commandsSchema.$defs,...schema})]));
export function validateCommands(input){
 if(check(input))return input;
 if(Array.isArray(input?.operations))for(const [index,operation] of input.operations.entries()){
  const opCheck=opChecks.get(operation?.op);
  if(!opCheck)throw Object.assign(Error('commands/operations/'+index+'/op 未知操作：'+String(operation?.op)),{code:'COMMAND_SCHEMA_INVALID',path:'/operations/'+index+'/op',operationIndex:index});
  if(!opCheck(operation)){
   const error=opCheck.errors[0],field=error.params.missingProperty||error.params.additionalProperty||'',path='/operations/'+index+error.instancePath+(field?'/'+field:'');
   throw Object.assign(Error('commands'+path+' '+error.message),{code:'COMMAND_SCHEMA_INVALID',path,operationIndex:index});
  }
 }
 const error=check.errors[0],field=error.params.missingProperty||error.params.additionalProperty||'',path=error.instancePath+(field?'/'+field:'');
 throw Object.assign(Error('commands'+path+' '+error.message),{code:'COMMAND_SCHEMA_INVALID',path});
}
const allowed={
 material:'x y rotation zIndex opacity blendMode shadow hidden isHidden isLocked vectorMask materialRelation craftDisplaySlices',
 text:'x y width height xMm yMm widthMm rotation zIndex opacity blendMode shadow hidden isHidden isLocked content fontSize fontSizePt fontName style color alignment bold italic underline strikethrough lineSpacing fixedLineHeight paragraphSpacing letterSpacing curveHeight vectorMask',
 shape:'x y width height rotation zIndex opacity blendMode shadow hidden isHidden isLocked kind fill stroke lineWidth fillOpacity strokeOpacity strokeDash cornerRadius vectorPaths vectorLayers vectorMask',
 ink:'rotation zIndex opacity blendMode shadow hidden isHidden isLocked points width color penStyle vectorMask',
 group:'rotation zIndex opacity blendMode shadow hidden isHidden isLocked name vectorMask'};
const nodeByID=(nodes,id)=>{for(const node of nodes){if([node.id,node.creativePieceID,node.agentKey,node.key].includes(id))return node;const child=node.children&&nodeByID(node.children,id);if(child)return child;}return null;};
const edit=(doc,change,assets)=>applyWebSceneCommands(doc,{baseSceneHash:craftSceneHash(doc.page),edits:[change]},assets);
const tool=(doc,name,args,assets)=>applyWebSceneCommands(doc,{baseSceneHash:craftSceneHash(doc.page),tools:[{name,arguments:args}]},assets);
export function applyCommandBatch(document,input,assets){
 validateCommands(input);let doc=structuredClone(document);const scale=doc.page.canvas.height/doc.page.physicalPageHeightMM;
 for(const [index,item] of input.operations.entries())try{
  if(item.op==='material.add')doc=tool(doc,'place_materials',{items:[{asset:item.asset,piece:item.id,x:item.placement.xMm,y:item.placement.yMm,coordinate_unit:'mm',rotation:item.placement.rotationDeg||0}]},assets);
  else if(item.op==='material.process')doc=tool(doc,'edit_materials',{items:[{piece:item.target,mode:item.mode||'append',operations:item.steps}]},assets);
  else if(item.op==='material.craft')doc=tool(doc,'apply_craft_plan',item.plan,assets);
  else if(item.op==='material.tape')doc=tool(doc,'draw_tape_strips',item.arguments,assets);
  else if(item.op==='text.add')doc=tool(doc,'upsert_text',{items:[{key:item.id,content:item.content,x:item.xMm,y:item.yMm,width:item.widthMm,coordinate_unit:'mm',size_unit:'mm',font_size:(item.fontSizePt??12)*(25.4/72)*scale,font_style:'hand',color:item.color||'#334d4a'}]},assets);
  else if(item.op==='shape.add')doc=tool(doc,'upsert_primitives',{items:[{key:item.id,kind:item.kind,x:item.xMm,y:item.yMm,width:item.widthMm,height:item.heightMm,coordinate_unit:'mm',size_unit:'mm',fill:item.fill??'#d5e2d6'}]},assets);
  else if(item.op==='ink.add')doc=edit(doc,{op:'insert',node:{id:item.id,type:'ink',points:item.points.map(p=>({x:p.xMm*scale,y:p.yMm*scale,p:p.pressure??.5})),width:item.widthMm*scale,color:item.color,penStyle:item.penStyle}},assets);
  else if(item.op==='page.update'){doc.page={...doc.page,...(item.paperColor?{paperColor:item.paperColor}:{}),...(item.paperPattern?{paperPattern:item.paperPattern}:{}),...(item.centerGutter!==undefined?{drawCenterGutter:item.centerGutter}:{})};validateWebScene(doc.page,doc.source,assets,{final:false});}
  else if(item.op==='layer.update'){
   const node=nodeByID(doc.page.layers,item.target);if(!node)throw Error('图层不存在：'+item.target);
   const permitted=new Set((allowed[node.type]||'').split(' ')),bad=Object.keys(item.set).find(k=>!permitted.has(k));if(bad)throw Error('受保护或不支持的字段：'+bad);
   if(node.type==='text'&&[['x','xMm'],['y','yMm'],['width','widthMm'],['fontSize','fontSizePt']].some(pair=>pair.every(key=>Object.hasOwn(item.set,key))))throw Error('文字图层不能混用毫米/pt 与场景像素字段');
   const values={...item.set};
   if(node.type==='text')for(const key of ['xMm','yMm','widthMm','fontSizePt'])if(Object.hasOwn(values,key)&&(!Number.isFinite(values[key])||(['widthMm','fontSizePt'].includes(key)&&values[key]<=0)))throw Error(key+' 必须是有效的正数或坐标');
   if(node.type==='text')for(const [input,output,factor] of [['xMm','x',scale],['yMm','y',scale],['widthMm','width',scale],['fontSizePt','fontSize',25.4/72*scale]])if(Object.hasOwn(values,input)){values[output]=values[input]*factor;delete values[input];}
   doc=edit(doc,{op:'patch',id:node.id,values},assets);
  }
  else if(item.op==='layer.insert')doc=edit(doc,{op:'insert',node:item.node,parent:item.parent},assets);
  else if(item.op==='layer.replaceMaterial')doc=edit(doc,{op:'replace-material',id:nodeByID(doc.page.layers,item.target)?.id||item.target,assetID:doc.source.materials.find(m=>m.alias===item.asset)?.assetID||item.asset},assets);
  else if(item.op==='layer.repeatStamp')doc=edit(doc,{op:'repeat-stamp',id:nodeByID(doc.page.layers,item.target)?.id||item.target,placements:item.placements},assets);
  else if(item.op==='layer.reuseLayout')doc=edit(doc,{op:'reuse-layout',layout:item.layout,materialMap:Object.fromEntries(Object.entries(item.materialMap||{}).map(([a,b])=>[a,doc.source.materials.find(m=>m.alias===b)?.assetID||b])),prefix:item.prefix},assets);
  else if(item.op==='material.glyphKnockout')doc=edit(doc,{op:'glyph-knockout',id:nodeByID(doc.page.layers,item.target)?.id||item.target,geometryMM:item.geometryMM,originMM:item.originMM},assets);
  else if(item.op==='group.transform')doc=edit(doc,{op:'transform-group',id:nodeByID(doc.page.layers,item.target)?.id||item.target,transform:item.transform},assets);
  else if(item.op==='layer.delete')doc=edit(doc,{op:'delete',id:nodeByID(doc.page.layers,item.target)?.id||item.target},assets);
  else if(item.op==='layer.move')doc=edit(doc,{op:'move',id:nodeByID(doc.page.layers,item.target)?.id||item.target,parent:item.parent?nodeByID(doc.page.layers,item.parent)?.id||item.parent:undefined,before:item.before?nodeByID(doc.page.layers,item.before)?.id||item.before:undefined},assets);
  else if(item.op==='group.create')doc=edit(doc,{op:'group',id:item.id,ids:item.targets.map(id=>nodeByID(doc.page.layers,id)?.id||id),name:item.name},assets);
  else if(item.op==='group.ungroup')doc=edit(doc,{op:'ungroup',id:nodeByID(doc.page.layers,item.target)?.id||item.target},assets);
  else if(item.op==='material.decision'){doc.materialDecisions=doc.materialDecisions.filter(d=>d.asset!==item.asset);doc.materialDecisions.push({asset:item.asset,choice:item.choice,reason:item.reason});}
  else if(item.op==='scene.compose')doc=compileWebSceneInput(doc,{page:item.page},assets);
  else if(item.op.startsWith('tool.'))doc=tool(doc,item.op.slice(5),item.arguments,assets);
  else throw Error('未知操作：'+item.op);
 }catch(error){throw Object.assign(Error('operations['+index+'] '+item.op+': '+error.message),{code:error.code||'OPERATION_FAILED',operationIndex:index,path:'/operations/'+index});}
 validateWebScene(doc.page,doc.source,assets,{final:false});return doc;
}
