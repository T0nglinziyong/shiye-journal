import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';

const observations={
  'D143.png':'视觉结构：浅蓝底分成顶部小图字群与下方深蓝大纸，Q1/Q2/Q3 既分段又形成阅读路线。完成稿变化：保留两块面积关系，补上手写正文、黄色小图和底部胶带，中段有了内容。可迁移方法：大色块稳定后，用不同尺度的字和局部色彩填补信息层次，不必重排全部素材。',
  'D146.png':'视觉结构：上下黑色底纸夹住白色手绘纸，黄色从后露出，数字 1 与 4 落在不同高度。完成稿变化：保留大数字和灰纸、蓝卡的交错落点，加入问答文字与星形。可迁移方法：数字可成为主要图形；在已有主次上补充正文，保持中段与下段的阅读联系。',
  'D153.png':'视觉结构：浅蓝背景与深灰主纸形成主色块，人物、小卡和纸条在不同边缘组成连续簇。完成稿变化：加入手写大标题、多处正文、日期与标签，让原先空的深灰区域承载内容。可迁移方法：骨架成立后，标题和中尺度信息能完成画面；一张纸可同时承图、承字和局部点缀。',
  'D158.png':'视觉结构：灰白底上有上下两组内容，深灰标题块与人物构成上组，日期卡和图像卡构成下组，黑白间穿插红橙。完成稿变化：仅提供成品，不推测制作顺序。可迁移方法：分置的两组可用同色小点、日期和文字阅读路线相连，中间背景也能直接承字。',
  'D162.png':'视觉结构：灰底上两片蓝纸上下分置，白色横条与格纹胶带压住边缘，保留中间灰底间隔。完成稿变化：上片加入标题和插画，下片加入日期、正文、红点和小卡。可迁移方法：分置纸片不必硬叠；让中间空间承字，并用重复的颜色和小元素让两段互相呼应。',
  'yellow-blue.png':'视觉结构：左黄右深蓝构成对比，两页交换蓝黄主辅色；左页大蓝纸与点纹纸错位，右页黄纸与写面交叠。完成稿变化：仅提供成品，不推测制作顺序。可迁移方法：双页照应可来自颜色交换和面积差，数字、短字与小圆在两页重复形成节奏。',
  'purple-gray.png':'视觉结构：左页米白底上的灰心纹纸、紫写面和黄卡深入叠压；右页紫底由浅绿主纸和两侧白纸形成另一重心。完成稿变化：仅提供成品，不推测制作顺序。可迁移方法：双页可有不同密度和标题形式；颜色跨页回应，比复制同一构图更重要。',
  'white-pink.png':'视觉结构：左页大号 18、果物照片、半透明纸和手写字交错；右页粉红底上图像与两段文字上下分布。完成稿变化：仅提供成品，不推测制作顺序。可迁移方法：照片与字可以跨区域重叠；正文在纸面与有足够对比的背景之间切换，减少孤立写面。'
};

// Approved examples stay in a private server directory, never in the public
// build. Missing or changed configured files fail explicitly, not silently.
export async function loadStyleReferences({root=process.env.SHIYE_CREATIVE_REFERENCES_DIR,styles=[],variant=process.env.SHIYE_CREATIVE_CONTEXT_VARIANT||'live_p',referenceSet=process.env.SHIYE_CREATIVE_REFERENCE_SET||'all'}={}){
  if(!root)return {parts:[],records:[]};
  const directory=await realpath(root),manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
  if(manifest.version!==1||!Array.isArray(manifest.styles)||!Array.isArray(manifest.references)||manifest.references.length>8)throw Error('创作参考清单无效');
  if(!styles.some(style=>manifest.styles.includes(style)))return {parts:[],records:[]};
  if(!['all','five_single'].includes(referenceSet))throw Error('创作参考选择无效');
  const selectedRows=referenceSet==='five_single'?manifest.references.filter(row=>/^D(?:143|146|153|158|162)\.png$/.test(row.file)):manifest.references;
  const records=[],parts=[{type:'text',text:variant==='live_p'?'以下是跨案例风格参考，只学习纸层、图文落点、色彩和点缀关系；不能将参考图当作可用素材，也不复制其中的文字或逐物位置。用户本次方向优先，按当前素材灵活组织。':'以下案例属于 Colorful Scrapbook Style Skill，仅供学习构图、配色、图文和层次关系；不是本次可用素材。观察其可迁移的关系，并按本次素材和用户目标重新创作。'}];
  let total=0,modelBytes=0;
  for(const row of selectedRows){
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
    if(variant==='p1'&&observations[row.file])parts.push({type:'text',text:'风格参考图 '+row.file+'：'+observations[row.file]});
    parts.push({type:'image_url',image_url:{url:'data:image/jpeg;base64,'+modelImage.toString('base64'),...(variant==='live_p'?{}:{detail:'high'})}});
  }
  return {parts:records.length?parts:[],records};
}
export function attachStyleReferences(state,references){
  if(state&&references.parts.length){
    if(state.contextVariant==='live_p')state.messages.push({role:'user',content:references.parts});
    else {
      const knowledgeAndTask=state.messages[1];
      if(Array.isArray(knowledgeAndTask?.content))knowledgeAndTask.content.splice(1,0,...references.parts);
      else state.messages.push({role:'user',content:references.parts});
    }
    state.styleReferences=references.records;
  }
  return state;
}
