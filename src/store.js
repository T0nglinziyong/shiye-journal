const DB='shiye-pwa-full-v1';
const STORES=['assets','blobs','series','projects','meta','trash'];
let connection;
export async function database(){
  if(connection)return connection;
  connection=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{for(const name of STORES)if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });return connection;
}
export async function all(name){const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function get(name,id){const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function put(name,item){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).put(item);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
export async function remove(name,id){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
export async function transaction(names,fn){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(names,'readwrite');try{fn(tx);}catch(e){tx.abort();reject(e);return;}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
const toBase64=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
function fromBase64(value){const [prefix,body]=value.split(',');const type=/data:([^;]+)/.exec(prefix)?.[1]||'application/octet-stream';const b=atob(body);const arr=new Uint8Array(b.length);for(let i=0;i<b.length;i++)arr[i]=b.charCodeAt(i);return new Blob([arr],{type});}
export async function createBackup(){const data={format:'shiye-pwa',version:1,createdAt:new Date().toISOString(),stores:{}};for(const name of STORES)data.stores[name]=await all(name);data.stores.blobs=await Promise.all(data.stores.blobs.map(async x=>({...x,data:await toBase64(x.data)})));return new Blob([JSON.stringify(data)],{type:'application/json'});}
export async function restoreBackup(file){if(file.size>1024*1024*1024)throw Error('备份超过 1 GB，请在电脑端转换或分批导入');const data=JSON.parse(await file.text());if(data.format!=='shiye-pwa'||data.version!==1||!data.stores||STORES.some(x=>!Array.isArray(data.stores[x])))throw Error('不是拾页 PWA 完整备份');const values={...data.stores,blobs:data.stores.blobs.map(x=>({...x,data:fromBase64(x.data)}))};await transaction(STORES,tx=>{for(const name of STORES){tx.objectStore(name).clear();for(const item of values[name])tx.objectStore(name).put(item);}});}
