// Versioned *data* format, independent of ZIP container version. A migration
// is a pure transform of a detached snapshot, never a mutation of live stores.
export const CURRENT_DATA_SCHEMA=1;
export function supportedSchema(version){
  if(!Number.isSafeInteger(version)||version<1||version>CURRENT_DATA_SCHEMA)
    throw Error('备份数据结构版本不兼容；现有资料未被修改');
  return version;
}
export async function migrateDetachedSnapshot(snapshot,{from=1,to=CURRENT_DATA_SCHEMA,migrations={}}={}){
  supportedSchema(to);
  if(!Number.isSafeInteger(from)||from<1||from>to)throw Error('迁移起始版本无效');
  let output=structuredClone(snapshot);
  for(let version=from;version<to;version++){
    const migrate=migrations[version];
    if(typeof migrate!=='function')throw Error('缺少数据结构迁移 '+version+' → '+(version+1));
    output=await migrate(structuredClone(output));
    if(!output||typeof output!=='object')throw Error('迁移结果无效，未提交现有数据');
  }
  return output;
}
