'use strict';
// Build-time developer tool. It never reads or writes a creative scene.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const common = read('static/api/common.schema.json');
const registry = read('static/api/operations.json');
const check = process.argv.includes('--check');
let changed = [];
function emit(p,s) {
  const dest=path.join(root,p);
  if(check) {if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==s) changed.push(p);return;}
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,s);
}
const json=x=>JSON.stringify(x,null,2)+'\n';
const defs=structuredClone(common.$defs);
const names=new Set();
for(const op of registry.operations) {
 if(names.has(op.name))throw Error('Duplicate operation: '+op.name);
 names.add(op.name);defs['Op_'+op.name.replaceAll('.','_')]=op.schema;
}
defs.Operation={oneOf:registry.operations.map(op=>({$ref:'#/$defs/Op_'+op.name.replaceAll('.','_')}))};
const schema={
 $schema:common.$schema,$id:'urn:shiye:commands:2',
 title:'Unified Commands protocol v2 candidate; runtime capability gating required',
 type:'object',additionalProperties:false,
 required:['protocolVersion','transactionId','baseSceneRevision','operations'],
 properties:{protocolVersion:{const:2},transactionId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,96}$'},
 baseSceneRevision:{type:'string',pattern:'^sha256:[a-f0-9]{64}$'},
 operations:{type:'array',minItems:1,maxItems:200,items:{$ref:'#/$defs/Operation'}}},$defs:defs
};
emit('static/api/commands.schema.json',json(schema));
let catalog='# 操作索引（自动生成）\n\n来自 api/operations.json。协议定义不等于运行时已实现。发布时必须与 capabilities 取交集。\n\n';
let recipes='# 常用局部配方（自动生成）\n\n这些是 operations 中的单条操作，不是完整任务，不承诺满足本次全部必用素材要求。\n`m1`、`m2`、`photo` 等为角色示例；先通过 TASK/inspect 确认真实别名与图层 ID。\n不得把配方当成事实来源，也不要省略任务硬约束。事务外壳由 begin 创建，禁止复制旧 Scene 哈希。\n\n';
for(const op of registry.operations) {
 catalog+=`- \`${op.name}\`：${op.summary} 详情：\`describe ${op.name}\`。\n`;
 recipes+=`## ${op.name}\n\n${op.summary}\n\n`+'```json\n'+JSON.stringify(op.examples[0],null,2)+'\n```\n\n'+op.semantics.map(x=>'- '+x).join('\n')+'\n\n';
 const fixture={protocolVersion:2,transactionId:'fixture-'+op.name.replaceAll('.','-'),baseSceneRevision:'sha256:'+'1'.repeat(64),operations:[op.examples[0]]};
 emit('tests/fixtures/'+op.name+'.commands.json',json(fixture));
}
emit('static/api/CATALOG.md',catalog);
emit('static/design/RECIPES.md',recipes);
if(changed.length){console.error(JSON.stringify({ok:false,stale:changed}));process.exitCode=1;}
else console.log(JSON.stringify({ok:true,check,operations:registry.operations.length}));
