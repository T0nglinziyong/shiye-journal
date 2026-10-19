// The SQL database stores structured metadata only; actual image pixels are
// immutable COS objects. This boundary also repairs *wire copies* of legacy
// IndexedDB imports without mutating or deleting their durable local rows.
const forbiddenPixelKeys=new Set(['sourcePixels','rawPixels','pixelData','rgbaPixels','imageData','maskPixels','originalPixels','base64Image','base64Pixels']);
function reject(message){const error=Error(message);error.status=413;error.code='SHIYE_METADATA_INVALID';return error;}
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
function checkNoImageData(record){
 const stack=[{node:record,path:'record'}],visited=new WeakSet();
 while(stack.length){
  const {node,path}=stack.pop();
  if(node==null)continue;
  if(typeof node==='string'){
   if(node.startsWith('data:image/')||node.startsWith('data:application/octet-stream;base64,'))
    throw reject('图片 Data URL 应通过 COS Blob 引用保存：'+path);
   continue;
  }
  if(typeof node!=='object')continue;
  if(node instanceof Blob||node instanceof ArrayBuffer||ArrayBuffer.isView(node))
   throw reject('CloudBase 元数据不能包含二进制图片或 Mask：'+path);
  if(visited.has(node))continue;visited.add(node);
  if(Array.isArray(node)){
   for(let index=0;index<node.length;index++)stack.push({node:node[index],path:path+'['+index+']'});
  }else for(const [key,value] of Object.entries(node)){
   if(forbiddenPixelKeys.has(key))throw reject('CloudBase 元数据不能包含像素字段：'+path+'.'+key);
   stack.push({node:value,path:path+'.'+key});
  }
 }
}
export function cloudMetadataRecord(store,record){
 if(store==='blobs')return record;
 if(!record||typeof record!=='object')throw reject('CloudBase 元数据格式无效');
 const safe=store==='assets'?(()=>{const {sourceRegion,sourcePixels,...rest}=record;return rest;})():record;
 checkNoImageData(safe);
 const limit=store==='assets'?96_000:store==='projects'?Infinity:512_000;
 if(bytes(safe)>limit)throw reject('单条 '+store+' 元数据超限；本地待同步记录已保留');
 return safe;
}
export function assertCloudCommitSize(operations,{limit=3_200_000}={}){
 const length=bytes({operations,base_revision:999999999,operation_id:'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',expected_epoch:'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',sync_protocol_version:3});
 if(length>limit)throw reject('CloudBase RPC 提交为 '+length+' 字节，超过 '+limit+' 字节上限；请核查本机异常记录（原稿未丢失）');
 return length;
}
