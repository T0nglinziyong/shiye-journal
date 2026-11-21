// Product modes are independent from provider transport and manual drawing tools.
export const CREATION_METHODS=Object.freeze([
 ['edit','纯编辑 · 可编辑图层'],
 ['draw','纯绘画 · 成品图片'],
 ['hybrid','两者结合 · 先生图再重建']
]);
export const WEB_RESULT_METHODS=Object.freeze([['file','作品文件'],['text','复制文本']]);
export function creationMethod(mode){return CREATION_METHODS.some(([id])=>id===mode)?mode:'edit';}
export function canStartCreation(mode,materialCount){return materialCount>0||creationMethod(mode)==='edit';}
export function generationProfile(mode){
 const id=creationMethod(mode);return {creationMode:id,deliveryMode:id==='draw'?'image':'tools',generationMode:'agent',snapshot:id==='draw'?'image/png':false};
}
export function creationModeDescription(mode){return {edit:'真实素材、文字、图形直接组成可编辑作品；手写和 graphics 均可用。',draw:'把真实素材作为参考生成成品图，保存为不可逐层编辑的快照；模型可能重绘素材。',hybrid:'先生图，再由 GPT 参照图像、使用原素材重建独立可编辑候选；不是无损拆图。'}[creationMethod(mode)];}
export function webResultPrompt(mode,output){
 const id=creationMethod(mode);if(!['file','text'].includes(output))throw Error('交付形式不受支持');
 if(id==='draw'){
  if(output==='text')throw Error('纯绘画必须交付 PNG 图片，不能用复制文本表示完整像素');
  return '读 ZIP/START_HERE.md、TASK.json 与 image-request.json，逐件查看真实素材。直接生图并展示、提供 PNG；这是图像快照，不返回虚构可编辑 JSON。';
 }
 const instructions=(id==='hybrid'?'按 ZIP/design/IMAGE_MODE.md 先生成或查看参考成图，再按原素材重建可编辑图层；不可把整图冒充可编辑作品。':'')+'请读 ZIP/START_HERE.md，用 node runtime/shiye.cjs brief 读取 TASK.json 摘要，查看 assets/overview.jpg 与必要原图。用 work/commands.json 经 node runtime/shiye.cjs apply，再 preview 看真实 PNG；局部修订后 pack。';
 return instructions+(output==='file'?'交付 output/preview.png 与单行完整 output/project.shiyeproject.json；混合模式另交付原始参考 PNG。':'展示 preview.png，最终完整 JSON 放在一个单行 json 代码块中，不省略字段，字符串换行保留转义。');
}

const utf8Start=(bytes)=>new TextDecoder('utf-8',{fatal:false}).decode(bytes);
export function classifyCreationBytes(header){
  const b=header instanceof Uint8Array?header:new Uint8Array(header||[]);
  if(b.length>=4&&b[0]===0x50&&b[1]===0x4b&&[3,5,7].includes(b[2])&&[4,6,8].includes(b[3]))return {kind:'zip',mimeType:'application/zip'};
  if(b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return {kind:'image',mimeType:'image/png'};
  if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return {kind:'image',mimeType:'image/jpeg'};
  if(b.length>=12&&utf8Start(b.slice(0,4))==='RIFF'&&utf8Start(b.slice(8,12))==='WEBP')return {kind:'image',mimeType:'image/webp'};
  const text=utf8Start(b).replace(/^\uFEFF/,'').trimStart();
  if(text.startsWith('{')||/^```(?:json)?\s*\{/.test(text))return {kind:'json',mimeType:'application/json'};
  return null;
}
export async function classifyCreationFile(file){
  if(!(file instanceof Blob)||file.size<1)throw Error('作品文件为空');
  // Inspect bytes rather than name/MIME; forged extensions must not bypass
  // the JSON, image and ZIP size checks downstream.
  const type=classifyCreationBytes(new Uint8Array(await file.slice(0,96).arrayBuffer()));
  if(!type)throw Error('不支持此作品文件：请选择 JSON、PNG、JPEG 或 WebP');
  const max=type.kind==='json'?8_000_000:type.kind==='zip'?20_000_000:40_000_000;
  if(file.size>max)throw Error(type.kind==='json'?'可编辑 JSON 不能超过 8 MB':type.kind==='zip'?'作品 ZIP 不能超过 20 MB':'画面图片不能超过 40 MB');
  return type;
}
