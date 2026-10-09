import {openDB} from 'idb';

// Per-device application state. Never routed through Supabase/COS and never
// counted as a cloud pending mutation. Account-qualified keys prevent one
// login's basket or diagnostic messages leaking into another login.
const DATABASE='shiye-device-session-v1';
let connection;
const localDB=()=>connection??=openDB(DATABASE,1,{upgrade(db){
  if(!db.objectStoreNames.contains('records'))db.createObjectStore('records',{keyPath:'key'});
}}).catch(error=>{connection=null;throw error;});
const scoped=(account,id)=>JSON.stringify([String(account||'browser'),String(id)]);
export const localDeviceRecords={
  async get(account,id){
    const value=await (await localDB()).get('records',scoped(account,id));
    return value?.record===undefined?null:structuredClone(value.record);
  },
  async put(account,record){
    if(typeof record?.id!=='string'||!record.id)throw Error('本地状态缺少编号');
    await (await localDB()).put('records',{key:scoped(account,record.id),record:structuredClone(record)});
    return record;
  },
  async delete(account,id){await (await localDB()).delete('records',scoped(account,id));},
  async list(account,prefix=''){
    const db=await localDB(),start=scoped(account,'');
    // String-key scans are safe even for accounts containing quotes.
    const rows=await db.getAll('records');
    const scope=String(account||'browser');
    return rows.filter(row=>{
      let tuple;try{tuple=JSON.parse(row.key);}catch{return false;}
      return tuple[0]===scope&&String(tuple[1]).startsWith(prefix);
    }).map(row=>structuredClone(row.record));
  }
};
