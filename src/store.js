import {openDB,unwrap} from 'idb';
const DB='shiye-pwa-full-v1';
const STORES=['assets','blobs','series','projects','meta','trash'];
let connection;
const CONFIG_KEY='shiye-data-server-v1';
let backend;
let sameOriginServer=false;
export function storageConfig(){try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||'null');}catch{return null;}}
export function setStorageConfig(config){if(config)localStorage.setItem(CONFIG_KEY,JSON.stringify(config));else localStorage.removeItem(CONFIG_KEY);backend=undefined;sameOriginServer=false;}
export function isSameOriginServer(){return sameOriginServer;}
export async function storageMode(){return (await resolveBackend())?.url?'server':'browser';}
async function resolveBackend(){
  if(backend)return backend;
  const config=storageConfig();
  if(config?.url){const url=new URL(config.url);if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('远程数据地址必须使用 HTTPS');if(document.querySelector('meta[name="shiye-server"]')&&url.origin!==location.origin)throw Error('自托管站点只允许使用同域名数据服务，请清除旧服务器配置');const candidate={url:url.origin,token:config.token||''},health=await serverRequest('/api/health',{backend:candidate});if(health.server!=='shiye-local')throw Error('该地址不是拾页数据服务');sameOriginServer=url.origin===location.origin;await serverRequest('/api/store/meta',{backend:candidate});return backend=candidate;}
  let r;try{r=await fetch('/api/health',{cache:'no-store'});}catch(error){if(document.querySelector('meta[name="shiye-server"]'))throw Error('拾页服务器暂时不可用，请检查 4090 电脑及网络；未切换到浏览器存储');return backend={};}
  if(r.ok){let health;try{health=await r.json();}catch{}if(health?.server==='shiye-local'){sameOriginServer=true;const candidate={url:location.origin,token:''};await serverRequest('/api/store/meta',{backend:candidate});return backend=candidate;}}
  if(document.querySelector('meta[name="shiye-server"]'))throw Error('拾页数据服务响应异常；未切换到浏览器存储');
  return backend={};
}
async function serverRequest(path,{backend:target,method='GET',data}={}){const b=target||await resolveBackend(),r=await fetch(b.url+path,{method,headers:{...(b.token?{Authorization:`Bearer ${b.token}`}:{ }),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store'});let result;try{result=await r.json();}catch{throw Error('数据服务没有返回有效 JSON');}if(!r.ok){const error=Error(result.error||`数据服务 HTTP ${r.status}`);error.status=r.status;throw error;}return result;}
async function localDatabase(){
  if(connection)return connection;
  connection=openDB(DB,1,{upgrade(db){for(const name of STORES)if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});}}).catch(e=>{connection=undefined;throw e;});return connection;
}
// Preserve the public raw-IDB contract for existing integrations.
export async function database(){return unwrap(await localDatabase());}
async function localAll(name){return (await localDatabase()).getAll(name);}
export async function all(name){if((await resolveBackend()).url)return Promise.all((await serverRequest(`/api/store/${name}`)).map(decodeItem.bind(null,name)));return localAll(name);}
export async function get(name,id){if((await resolveBackend()).url){try{return await decodeItem(name,await serverRequest(`/api/store/${name}/${encodeURIComponent(id)}`));}catch(e){if(e.message==='不存在')return undefined;throw e;}}return (await localDatabase()).get(name,id);}
export async function put(name,item){return transaction([name],tx=>tx.objectStore(name).put(item));}
export async function remove(name,id){return transaction([name],tx=>tx.objectStore(name).delete(id));}
export async function transaction(names,fn){if((await resolveBackend()).url){const operations=[],tx={objectStore(name){if(!names.includes(name))throw Error('此表未加入事务');return {put:item=>operations.push({action:'put',store:name,item}),delete:id=>operations.push({action:'delete',store:name,id}),clear:()=>operations.push({action:'clear',store:name})};}};const result=fn(tx);if(result?.then)throw Error('事务回调必须同步，网络及图像处理请在事务外完成');for(const op of operations)if(op.store==='blobs'&&op.action==='put')op.item={...op.item,data:await toBase64(op.item.data)};await serverRequest('/api/transaction',{method:'POST',data:{operations}});return;}const tx=(await localDatabase()).transaction(names,'readwrite');try{const result=fn(unwrap(tx));if(result?.then)throw Error('事务回调必须同步，网络及图像处理请在事务外完成');}catch(e){tx.abort();await tx.done.catch(()=>{});throw e;}await tx.done;}
const toBase64=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
function fromBase64(value){const [prefix,body]=value.split(',');const type=/data:([^;]+)/.exec(prefix)?.[1]||'application/octet-stream';const b=atob(body);const arr=new Uint8Array(b.length);for(let i=0;i<b.length;i++)arr[i]=b.charCodeAt(i);return new Blob([arr],{type});}
async function decodeItem(name,item){return name==='blobs'?{...item,data:fromBase64(item.data)}:item;}
export async function migrateBrowserData(){const target=await resolveBackend();if(!target.url)throw Error('请先连接数据服务');const stores={};for(const name of STORES)stores[name]=await localAll(name);stores.blobs=await Promise.all(stores.blobs.map(async x=>({...x,data:await toBase64(x.data)})));await serverRequest('/api/migrate',{method:'POST',data:{format:'shiye-pwa',version:1,stores}});return Object.fromEntries(STORES.map(name=>[name,stores[name].length]));}
export async function createBackup(){const data={format:'shiye-pwa',version:1,createdAt:new Date().toISOString(),stores:{}};if((await resolveBackend()).url){for(const name of STORES)data.stores[name]=await all(name);}else{const tx=(await localDatabase()).transaction(STORES);const values=await Promise.all(STORES.map(name=>tx.objectStore(name).getAll()));await tx.done;STORES.forEach((name,i)=>{data.stores[name]=values[i];});}data.stores.blobs=await Promise.all(data.stores.blobs.map(async x=>({...x,data:await toBase64(x.data)})));return new Blob([JSON.stringify(data)],{type:'application/json'});}
export async function restoreBackup(file){if(file.size>1024*1024*1024)throw Error('备份超过 1 GB，请在电脑端转换或分批导入');const data=JSON.parse(await file.text());if(data.format!=='shiye-pwa'||data.version!==1||!data.stores||STORES.some(x=>!Array.isArray(data.stores[x])))throw Error('不是拾页 PWA 完整备份');const values={...data.stores,blobs:data.stores.blobs.map(x=>({...x,data:fromBase64(x.data)}))};await transaction(STORES,tx=>{for(const name of STORES){tx.objectStore(name).clear();for(const item of values[name])tx.objectStore(name).put(item);}});}
