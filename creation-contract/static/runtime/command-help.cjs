'use strict';
// Pure read-only module, intended to be imported by runtime/shiye.cjs.
// It does not implement apply, preview, pack, or capability verification.
const fs=require('node:fs');const path=require('node:path');
const api=path.resolve(__dirname,'../api');
const registry=JSON.parse(fs.readFileSync(path.join(api,'operations.json'),'utf8'));
const common=JSON.parse(fs.readFileSync(path.join(api,'common.schema.json'),'utf8'));
function getDescription(name,{full=false,capabilities=null}={}) {
 const commonName=Object.keys(common.$defs).find(k=>k.toLowerCase()===String(name).toLowerCase());
 if(commonName)return {kind:'common',name:commonName,schema:common.$defs[commonName],...(full?{$defs:common.$defs}:{})};
 const op=registry.operations.find(o=>o.name===name);
 if(!op)throw Object.assign(new Error('Unknown command or common type: '+name),{code:'UNKNOWN_HELP_TOPIC'});
 const available=capabilities===null?null:op.requiresCapabilities.every(c=>capabilities.includes(c));
 const base={name:op.name,summary:op.summary,available,availabilityMeaning:available===null?'contract-only; runtime not checked':'verified capability intersection',requires:op.requiresCapabilities,required:op.schema.required.filter(k=>k!=='op'),parameters:op.schema.properties,semantics:op.semantics,examples:op.examples};
 if(full){const schema=JSON.parse(fs.readFileSync(path.join(api,'commands.schema.json'),'utf8'));base.schema={$schema:schema.$schema,$defs:schema.$defs,$ref:'#/$defs/Op_'+name.replaceAll('.','_')};}
 return base;
}
function listOperations({capabilities=null}={}){return registry.operations.map(o=>({name:o.name,summary:o.summary,available:capabilities===null?null:o.requiresCapabilities.every(c=>capabilities.includes(c))}));}
function main(args){
 const mode=args[0]||'help';
 if(mode==='help')return listOperations();
 if(mode==='describe'&&args[1])return getDescription(args[1],{full:args.includes('--full')});
 throw Object.assign(new Error('Usage: command-help.cjs help | describe <operation|place|size|style|region> [--full]'),{code:'USAGE'});
}
module.exports={getDescription,listOperations};
if(require.main===module){try{console.log(JSON.stringify(main(process.argv.slice(2)),null,2));}catch(e){console.error(JSON.stringify({ok:false,code:e.code||'ERROR',message:e.message}));process.exitCode=1;}}
