// Existing engine scenarios expressed through the current model interface.
// This is test data conversion, not a runtime compatibility path.
export function canvasFixtureOperation(item){
 const {op,...p}=item;const kinds={'text.add':'text','paper.add':'paper','title.add':'text','material.add':'material','graphic.add':'graphic','material.tape':'tape'};
 if(kinds[op])return {op:'create',kind:kinds[op],...p};
 if(op==='text.fit')return {op:'update',...p};
 if(op==='group.compose')return {op:'group',...p,children:p.children.flatMap(canvasFixtureOperations)};
 return {op:({'layer.update':'update','layer.duplicate':'copy','layer.delete':'delete','group.create':'group','group.ungroup':'ungroup','layer.cut':'cut','material.cut':'cut','layer.split':'split','material.split':'split'})[op]||op,...p};
}
function canvasFixtureOperations(item){
 const operation=canvasFixtureOperation(item);
 if(operation.edge&&(operation.op==='update'||(operation.op==='create'&&operation.kind==='paper'))){
  const {edge,...rest}=operation;
  return [...(Object.keys(rest).some(k=>!['op','target'].includes(k))?[rest]:[]),{op:'cut',method:'edge',target:operation.target||operation.id,edge}];
 }
 return [operation];
}
export function canvasFixtureCall(name,args){
 const routes={read_skill:'skill',search_references:'search',read_case:'case',read_template:'template',search_writing_topics:'topics',creation_help:'help'};
 if(routes[name])return {name:'knowledge',args:{action:routes[name],...args}};
 if(name.startsWith('workspace_'))return {name:'workspace',args:{action:name.slice(10),...args}};
 if(name==='creation_paper'||name==='creation_title'){const {papers,titles,...rest}=args;return {name:'creation_apply',args:{...rest,operations:(papers||titles).flatMap(p=>canvasFixtureOperations({op:papers?'paper.add':'title.add',...p}))}};}
 if(name==='creation_apply')return {name,args:{...args,operations:args.operations.flatMap(canvasFixtureOperations)}};
 return {name,args};
}
