// Creation is independent from delivery: file vs copy text is selected only
// when handing the task to ChatGPT. Avoid presenting ZIP as a separate mode.
export const CREATION_METHODS=Object.freeze([
  ['tools','调用工具 · 返回工具调用'],
  ['json','直接排版 · 返回可编辑图层'],
  ['image','自由绘画 · 生成快照图片']
]);
export const WEB_RESULT_METHODS=Object.freeze([
  ['file','作品文件'],
  ['text','复制文本']
]);
export function creationMethod(mode){
  return CREATION_METHODS.some(([id])=>id===mode)?mode:'tools';
}
export function generationProfile(mode){
  const id=creationMethod(mode);
  return {creationMode:id,deliveryMode:id,generationMode:id==='tools'?'agent':'direct',
    snapshot:id==='image'?'image/png':false};
}
export function webResultPrompt(mode,output){
  const id=creationMethod(mode);
  if(output!=='file'&&output!=='text')throw Error('交付形式不受支持');
  if(id==='image'){
    if(output==='text')throw Error('自由绘画必须交付 PNG 图片，不能用复制文本表示完整像素');
    return '请读 ZIP 的 START_HERE.txt 和任务说明，观察素材并生成完整手帐画面；直接展示画面并提供单个可下载的 PNG 作品文件，不要返回 JSON、ZIP 或说明性图注。';
  }
  const instructions='请先读 ZIP 的 START_HERE.txt 与 task/WORKFLOW.txt；观察素材、比较构图，完成唯一一份可编辑手帐。运行校验并展示同一场景的 HTML Canvas 预览，发现问题后修订，不能用另一张画作冒充预览。';
  return output==='file'
    ?instructions+'最终交付一个可下载的「作品.shiyeproject.json」UTF-8 单文件（含原样 source、title 与 page 或 tools）。不要求输出 ZIP；如果确实需要，也可以交付原有的「作品.shiyeproject.zip」。'
    :instructions+'随后只用一个完整的 ```json 代码块返回紧凑单行 JSON，不能分成多个块、不能省略字段、不要生成作品文件。';
}

const utf8Start=(bytes)=>new TextDecoder('utf-8',{fatal:false}).decode(bytes);
export function classifyCreationBytes(header){
  const b=header instanceof Uint8Array?header:new Uint8Array(header||[]);
  if(b.length>=4&&b[0]===0x50&&b[1]===0x4b&&[3,5,7].includes(b[2])&&[4,6,8].includes(b[3]))return {kind:'zip',mimeType:'application/zip'};
  if(b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return {kind:'image',mimeType:'image/png'};
  if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return {kind:'image',mimeType:'image/jpeg'};
  if(b.length>=12&&utf8Start(b.slice(0,4))==='RIFF'&&utf8Start(b.slice(8,12))==='WEBP')return {kind:'image',mimeType:'image/webp'};
  if(b.length&&utf8Start(b).replace(/^\uFEFF/,'').trimStart().startsWith('{'))return {kind:'json',mimeType:'application/json'};
  return null;
}
export async function classifyCreationFile(file){
  if(!(file instanceof Blob)||file.size<1)throw Error('作品文件为空');
  // Inspect bytes rather than name/MIME; forged extensions must not bypass
  // the JSON, image and ZIP size checks downstream.
  const type=classifyCreationBytes(new Uint8Array(await file.slice(0,96).arrayBuffer()));
  if(!type)throw Error('不支持此作品文件：请选择 JSON、ZIP、PNG、JPEG 或 WebP');
  const max=type.kind==='json'?2_000_000:type.kind==='zip'?20_000_000:40_000_000;
  if(file.size>max)throw Error(type.kind==='json'?'可编辑 JSON 不能超过 2 MB':type.kind==='zip'?'作品 ZIP 不能超过 20 MB':'画面图片不能超过 40 MB');
  return type;
}
