import {createHash} from 'node:crypto';

// Observe acceptance requests without adding messages, filtering tools, or
// changing the provider's compaction/critique behavior.
export function redactAuditImages(value){
 if(typeof value==='string'&&value.startsWith('data:image/')){
  const comma=value.indexOf(','),bytes=Buffer.from(value.slice(comma+1),'base64');
  return {imageSHA256:'sha256:'+createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
 }
 if(Array.isArray(value))return value.map(redactAuditImages);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='signal').map(([key,item])=>[key,redactAuditImages(item)]));
 return value;
}
export function auditAcceptanceModel(provider,save){
 const wrap=(kind,fn)=>async options=>{await save({kind,input:redactAuditImages(options)});return fn.call(provider,options);};
 const model=wrap('main',provider);
 for(const key of ['compact','critique'])if(typeof provider[key]==='function')model[key]=wrap(key,provider[key]);
 return model;
}
