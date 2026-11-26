import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';

// Approved examples stay in a private server directory, never in the public
// build. Missing or changed configured files fail explicitly, not silently.
export async function loadStyleReferences({root=process.env.SHIYE_CREATIVE_REFERENCES_DIR,styles=[]}={}){
  if(!root)return {parts:[],records:[]};
  const directory=await realpath(root),manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
  if(manifest.version!==1||!Array.isArray(manifest.styles)||!Array.isArray(manifest.references)||manifest.references.length>8)throw Error('创作参考清单无效');
  if(!styles.some(style=>manifest.styles.includes(style)))return {parts:[],records:[]};
  const records=[],parts=[{type:'text',text:'以下'+manifest.references.length+'张是创作案例，紧接通用知识供观察。比较每张的底色、主纸与大素材如何形成落点；纸片是深入叠压、对角呼应，还是分开放置并由字群、第三片纸或小素材连接。观察标题与正文落在纸内、纸间和背景的不同位置，以及圆星、胶带、人物怎样压住边缘、平衡重心；双页还看左右页的色彩与构图回应。首次 creation_plan.intent 简述适合本次素材的一种主要关系和一处可变化的次级关系；看过成品预览后再核对是否落实，不逐物临摹。案例图片不是可用素材，原文不能照搬；用户方向优先。'}];
  let total=0,modelBytes=0;
  for(const row of manifest.references){
    if(!/^[a-zA-Z0-9_-]+\.png$/.test(row.file)||!/^sha256:[a-f0-9]{64}$/.test(row.sha256))throw Error('创作参考路径或指纹无效');
    const path=await realpath(resolve(directory,row.file));if(!path.startsWith(directory+sep))throw Error('创作参考超出私有目录');
    const bytes=await readFile(path);total+=bytes.length;
    if(bytes.length>4*1024*1024||total>20*1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('创作参考格式或大小无效');
    if('sha256:'+createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('创作参考内容指纹不一致');
    // The same messages are saved in each durable checkpoint. Original PNGs
    // exceeded its 10 MB limit before the first model request ever began.
    const source=await loadImage(bytes),scale=Math.min(1,1600/Math.max(source.width,source.height));
    const canvas=createCanvas(Math.max(1,Math.round(source.width*scale)),Math.max(1,Math.round(source.height*scale)));
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(source,0,0,canvas.width,canvas.height);
    const modelImage=canvas.toBuffer('image/jpeg',{quality:.83});modelBytes+=modelImage.length;
    if(modelBytes>4*1024*1024)throw Error('创作参考发送图像超过检查点预算');
    records.push({file:row.file,sha256:row.sha256});
    parts.push({type:'image_url',image_url:{url:'data:image/jpeg;base64,'+modelImage.toString('base64')}});
  }
  return {parts:records.length?parts:[],records};
}
export function attachStyleReferences(state,references){
  if(state&&references.parts.length){
    const knowledgeAndTask=state.messages[1];
    if(Array.isArray(knowledgeAndTask?.content))knowledgeAndTask.content.splice(1,0,...references.parts);
    else state.messages.push({role:'user',content:references.parts});
    state.styleReferences=references.records;
  }
  return state;
}
