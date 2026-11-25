// The model has one opacity control; stored paper texture metadata stays private.
export function uniformOpacitySchema(value){
 if(Array.isArray(value))return value.map(uniformOpacitySchema);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='translucency').map(([k,v])=>[k,uniformOpacitySchema(v)]));
}
export function assertUniformOpacity(value){
 if(!value||typeof value!=='object')return;
 for(const [key,item] of Object.entries(value)){
  if(key==='translucency')throw Error('透明度统一使用 style.opacity：0 完全透明，1 完全不透明；创建和修改相同。');
  if(typeof item==='object')assertUniformOpacity(item);
 }
}
// Setting opacity is absolute even when an existing paper has internal surface alpha.
// Other sparse updates preserve its existing appearance.
export function resetPaperSurfaceOpacity(change,node){
 if(change.style?.opacity===undefined||node?.kind!=='paper')return change;
 if(node.creationObject?.kind==='paper')return {...change,translucency:0};
 return {...change,geometry:{...change.geometry,kind:'paper',options:{...change.geometry?.options,translucency:0}}};
}
