import candidateSchema from '../creation-contract/static/api/commands.schema.json' with {type:'json'};
import {commandsSchema,executableCommandNames,describeExecutableCommand} from './v3-commands.js';

// The candidate's concise operations are the public default. Until every
// native craft action has a concise equivalent, keep each existing operation
// reachable through the *same* v2 transaction file under an explicit advanced
// name. The schema is generated from the runtime's real v1 registry; it cannot
// drift into a second hand-maintained capability list.
export const advancedCreationV2Names=Object.freeze(executableCommandNames.map(name=>'advanced.v1.'+name));
const legacyPrefix='advanced.v1.';
function adaptReferences(value){
 if(Array.isArray(value))return value.map(adaptReferences);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,key==='$ref'&&typeof entry==='string'?entry.replace('#/$defs/','#/$defs/legacy/$defs/'):adaptReferences(entry)]));
 return value;
}
export const creationV2RuntimeSchema=(()=>{
 const schema=structuredClone(candidateSchema);
 delete schema.$id;
 schema.title='ShiYe executable creation commands v2';
 schema.$defs.Operation.oneOf=schema.$defs.Operation.oneOf.filter(entry=>entry.$ref!=='#/$defs/Op_layout_arrange');
 schema.$defs.Place.properties.referenceBounds.enum=['layout'];
 schema.$defs.Place.properties.targetBounds.enum=['layout'];
 // The task fixes the paper geometry. Exposing candidate page resizing would
 // claim a capability that the authoritative Scene/source contract forbids.
 const pageUpdate=schema.$defs.Op_page_update;
 delete pageUpdate.properties.physicalSizeMm;
 delete pageUpdate.properties.mode;
 pageUpdate.required=['op','paperColor'];
 delete pageUpdate.anyOf;
 schema.$defs.legacy={$defs:adaptReferences(commandsSchema.$defs)};
 for(const [index,original] of commandsSchema.properties.operations.items.oneOf.entries()){
  const name=executableCommandNames[index];
  const adapted=adaptReferences(original);
  adapted.properties.op={const:legacyPrefix+name};
  schema.$defs['Advanced_'+index]=adapted;
  schema.$defs.Operation.oneOf.push({$ref:'#/$defs/Advanced_'+index});
 }
 return schema;
})();
export function describeAdvancedCreationV2Command(name){
 if(!name.startsWith(legacyPrefix))return null;
 const original=name.slice(legacyPrefix.length);
 if(!executableCommandNames.includes(original))return null;
 return {...describeExecutableCommand(original),name,protocolVersion:2,advanced:true,originalOperation:original,
  note:'此高级命令沿用原生操作的参数；仍在同一 commands.json 事务中修改唯一 Scene。'};
}
