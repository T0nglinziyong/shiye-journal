// Agent-only restriction: keep existing/manual Scene rendering untouched.
export function withoutShadowSchema(value){
 if(Array.isArray(value))return value.map(withoutShadowSchema);
 if(!value||typeof value!=='object')return value;
 const out={};for(const [key,item] of Object.entries(value)){
  if(key==='properties'){out[key]=Object.fromEntries(Object.entries(item).filter(([name])=>name!=='shadow').map(([name,schema])=>[name,withoutShadowSchema(schema)]));continue;}
  if(key==='enum'){out[key]=item.filter(v=>v!=='shadow');continue;}
  out[key]=withoutShadowSchema(item);
 }return out;
}
export function assertNoShadowInput(value){
 if(!value||typeof value!=='object')return;
 for(const [key,item] of Object.entries(value)){
  if((key==='shadow'&&item!=null)||(['effect','treatment','variant'].includes(key)&&typeof item==='string'&&/(^|-)shadow($|-)/.test(item)))throw Error('创作工具已关闭阴影；请使用纸纹、露边、透明度或文字描边，不设置 shadow 或阴影字效。');
  if(typeof item==='object')assertNoShadowInput(item);
 }
}
export function assertNoNewSceneShadows(before,after){
 const all=nodes=>(nodes||[]).flatMap(n=>[n,...all(n.children)]);
 const prior=new Map(all(before.page.layers).map(n=>[n.id,n.shadow]));
 for(const node of all(after.page.layers))if(node.shadow&&JSON.stringify(node.shadow)!==JSON.stringify(prior.get(node.id)))throw Error('创作工具已关闭阴影；此操作会生成阴影，整批未执行。请改用无阴影效果。');
}
export function withoutShadowExamples(value){
 if(Array.isArray(value))return value.map(withoutShadowExamples);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='shadow').map(([k,v])=>[k,k==='variants'&&Array.isArray(v)?v.filter(x=>!/(^|-)shadow($|-)/.test(x.key||'')).map(withoutShadowExamples):withoutShadowExamples(v)]));
}
