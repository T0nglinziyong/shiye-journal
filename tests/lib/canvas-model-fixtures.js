// Existing engine scenarios expressed through the current model interface.
// This is test data conversion, not a runtime compatibility path.
import {canvasCapabilityRegistry} from '../../creative-agent/runtime/canvas-capabilities.mjs';
const common=new Set(['id','parent','place','size','style','order']);
const createProps=(kind,raw)=>Object.fromEntries(Object.entries(raw).filter(([key])=>!common.has(key)&&key!=='edge'&&key!=='op'&&key!=='kind'&&key!=='target'&&key in canvasCapabilityRegistry[kind].createProps.properties));
const updateKeys=new Set(Object.values(canvasCapabilityRegistry).flatMap(cap=>Object.keys(cap.updateProps.properties||{})));
export function canvasFixtureOperation(item){
 const {op,...p}=item;const kinds={'text.add':'text','paper.add':'paper','title.add':'text','material.add':'material','graphic.add':'graphic','material.tape':'tape'};
 if(kinds[op]){const kind=kinds[op],props=createProps(kind,p);return {op:'create',kind,...Object.fromEntries(Object.entries(p).filter(([key])=>common.has(key))),props};}
 if(op==='text.fit')return {op:'update',target:p.target,...Object.fromEntries(Object.entries(p).filter(([key])=>['place','size','style','order'].includes(key))),props:{fit:p.fit}};
 if(op==='page.update')return {op:'page',target:p.page,props:{...(p.paperColor?{color:p.paperColor}:{}),...(p.paperPattern?{pattern:p.paperPattern}:{}),...(p.rulingMm!==undefined?{rulingMm:p.rulingMm}:{}),...(p.centerGutter!==undefined?{centerGutter:p.centerGutter}:{})}};
 if(op==='group.compose')return {op:'group',...p,children:p.children.flatMap(canvasFixtureOperations)};
 if(op==='layer.update')return {op:'update',target:p.target,...Object.fromEntries(Object.entries(p).filter(([key])=>['parent','place','size','style','order','hidden','locked','name'].includes(key))),props:Object.fromEntries(Object.entries(p).filter(([key])=>updateKeys.has(key)&&key!=='edge')),...(p.edge?{edge:p.edge}:{})};
 if(['layer.cut','material.cut','layer.split','material.split'].includes(op))return {op:'shape',method:op.endsWith('split')?'split':'crop',...p};
 return {op:({'layer.update':'update','layer.duplicate':'copy','layer.delete':'delete','group.create':'group','group.ungroup':'ungroup'})[op]||op,...p};
}
function canvasFixtureOperations(item){
 const operation=canvasFixtureOperation(item);
 if(operation.edge&&(operation.op==='update'||(operation.op==='create'&&operation.kind==='paper'))){
  const {edge,...rest}=operation;
  return [...(Object.keys(rest).some(k=>!['op','target'].includes(k))?[rest]:[]),{op:'shape',method:'edge',target:operation.target||operation.id,edge}];
 }
 return [operation];
}
export function canvasFixtureCall(name,args){
 const routes={read_skill:'skill',search_references:'search',read_case:'case',read_template:'template',search_writing_topics:'topics',creation_help:'help'};
 if(routes[name])return {name:'knowledge',args:{action:routes[name],...args}};
 if(name.startsWith('workspace_'))return {name:'workspace',args:{action:name.slice(10),...args}};
 if(name==='creation_paper'||name==='creation_title'){const {papers,titles,...rest}=args;return {name:'creation_apply',args:{...rest,operations:(papers||titles).flatMap(p=>canvasFixtureOperations({op:papers?'paper.add':'title.add',...p}))}};}
 if(name==='creation_recipe')return {name:'creation_apply',args:{transactionId:args.transactionId,baseSceneRevision:args.baseSceneRevision,operations:[{op:'recipe',methodId:args.methodId,params:args.parameters},...(args.with||[]).map(item=>({op:'recipe',methodId:item.methodId,params:item.parameters}))]}};
 if(name==='creation_apply')return {name,args:{...args,operations:args.operations.flatMap(canvasFixtureOperations)}};
 if(name==='creation_finish')return {name,args:{summary:args.summary}};
 return {name,args};
}
