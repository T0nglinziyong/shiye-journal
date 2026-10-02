// Image delivery is a separate, image-native API path. It never turns a
// chat-completion layout into a screenshot or a supposedly editable draft.
export const IMAGE_MODELS=['gpt-image-2.5-sunburst','gpt-image-2.5-flare'];
import {creativeContentBrief} from './creative-content-brief.js';
import {creativePageBrief} from './creative-page-brief.js';
import {visualStyleBrief} from './creative-style-brief.js';
import {purposeMethod} from './creative-design-guide.js';
import {classifyJournalMaterial} from './journal-case-study.js';
import {journalReferenceGuide,selectJournalReferenceCases} from './journal-reference-catalog.js';
import {journalAbstractTemplateGuide,selectJournalAbstractTemplates} from './journal-abstract-templates.js';

export function imagePrompt({project,draft,assets,ids,theme='',requireAll=true,includeImages=true,includeReferences=false,textMode='automatic',userTemplates=[]}){
  const widthMM=(draft.physicalPageHeightMM||297)*draft.canvas.width/draft.canvas.height;
  const materials=ids.map((id,index)=>{
    const asset=assets.find(item=>item.id===id);
    if(!asset)throw Error('有素材已不在素材库中，请重新选择');
    return `${includeImages?'参考图':'文字素材'} ${index+1}：${asset.title}；${asset.kind||'素材'}；图文职责 ${classifyJournalMaterial(asset).join('、')}；实物 ${asset.physicalWidthMM}×${asset.physicalHeightMM} mm；${asset.kind==='tape'?'胶带可连续截取':`库存 ${asset.supply?.quantity??1} 件`}；${(asset.tags||[]).join('、')}`;
  });
  const styles=project.styles||[],purposes=project.purposes?.length?project.purposes:[project.purpose||'日常记录'];
  const content=creativeContentBrief({policy:project.contentPolicy||'documentary',userText:project.userText||'',providedFacts:project.providedFacts||'',topic:theme||project.intent||'',purposes});
  const direction=creativePageBrief({styles,purposes,textMode,contentPolicy:project.contentPolicy,userText:project.userText,theme:theme||project.intent,delivery:'image',pageMode:draft.pageMode});
  const imageText=project.contentPolicy==='visual'||textMode==='none'?'':'这是最终图像中的印刷文字，不是给程序解析的排版指令。默认使用中文，保留用户提供的原文和外文；只绘制真正属于手帐内容的标题、段落和图注。文字要有清楚的字号、对比和自然换行，不把整段话或清单挤成一条横线，也不与素材相互遮挡。换行直接在画面上分行，不绘制反斜杠、转义序列、排版指令或占位编号；不用伪文字、乱码、无关英文口号或重复的微型标签填补空间。不要把配色分析、素材介绍或排版说明印成正文；若长文无法清晰绘制，就保留核心句意并精简，而不是缩小字。';
  const referenceContext={styles,purposes,materials:assets.filter(asset=>ids.includes(asset.id)),userTemplates};
  const cases=includeReferences?selectJournalReferenceCases(referenceContext):[];
  const references=cases.length?`${journalReferenceGuide(cases)}\n${journalAbstractTemplateGuide(selectJournalAbstractTemplates(cases,referenceContext))}\n`:'';
  return `请直接生成一张完整的手帐页面图像，不返回 JSON、代码或图层。纸张 ${widthMM.toFixed(1)}×${draft.physicalPageHeightMM||297} mm，${draft.pageMode==='spread'?'双页':'单页'}。风格方向：${styles.map(name=>`${name}（${visualStyleBrief(name)}）`).join('；')||'自由发挥'}；页面用途：${purposes.map(name=>`${name}（${purposeMethod(name)}）`).join('；')}；主题：${theme||project.intent||'根据素材自由创作'}。风格和用途只是创作方向，请自由决定视觉语言、文字、图形与排版。\n${content}\n${direction}${imageText}\n${materials.join('\n')}\n${references}${requireAll?'请使用以上全部候选素材。':'从以上素材中自由选择合适的组合。'}保留每件实物的相对尺寸，不凭空复制照片、纸张和贴纸；同一件裁切后的余料可以再使用，胶带可按真实宽度连续裁取。除此之外，不设素材数量、留白比例、文字结构或固定版式要求。${includeImages?'参考图是素材本身，不是最终页面。':'本次未附素材预览，不能猜测未描述的纹理或具体图案。'}`;
}

export function imageSize(draft){
  const ratio=draft.canvas.width/draft.canvas.height;
  if(!Number.isFinite(ratio)||ratio<=0)throw Error('纸张比例无效');
  if(ratio>3||ratio<1/3)throw Error('图像模型只支持 1:3 至 3:1 的纸张比例；请调整纸张或改用可编辑模式');
  const long=1536,short=Math.round(long/Math.max(ratio,1/ratio)/16)*16;
  return ratio>=1?`${long}x${Math.max(512,short)}`:`${Math.max(512,short)}x${long}`;
}

export async function generatePageImage({settings,project,draft,assets,ids,theme,createImage,signal,onProgress=()=>{},request=fetch,referenceImages=[],userTemplates=[]}){
  const key=settings.keys?.openai||(settings.provider==='openai'?settings.key:'');
  if(!key)throw Error('真正的图像生成需要 OpenAI API 密钥；请在设置的 OpenAI 服务商下保存密钥。ChatGPT 订阅不能代替 API 密钥。');
  const model=IMAGE_MODELS.includes(settings.imageModel)?settings.imageModel:IMAGE_MODELS[0];
  const prompt=imagePrompt({project,draft,assets,ids,theme,requireAll:settings.requireAllCandidates!==false,includeImages:settings.includeThumbnails!==false,includeReferences:settings.sendPresetReferences===true||referenceImages.length>0,textMode:settings.textMode||'automatic',userTemplates})+(referenceImages.length?`\n输入图片的最后 ${referenceImages.length} 张是匹配的抽象模板与真实案例，不是可使用素材；只借鉴图文关系，不要复制参考图内的照片、文字、贴纸。`:``);
  const form=new FormData();form.set('model',model);form.set('prompt',prompt);form.set('size',imageSize(draft));form.set('quality','high');form.set('output_format','png');
  if(settings.includeThumbnails!==false){
    for(const [index,id] of ids.entries()){
      if(signal?.aborted)throw signal.reason||Error('创作已停止');
      onProgress(`准备参考素材 ${index+1}/${ids.length}…`);
      const url=await createImage(assets.find(item=>item.id===id),null,768,true);
      if(!url)throw Error(`参考素材 ${index+1} 的图片未能读取；没有跳过它。`);
      const blob=await (await request(url,{signal})).blob();
      form.append('image[]',blob,`material-${index+1}.png`);
    }
  }
  for(const [index,entry] of referenceImages.entries())form.append('image[]',new Blob([entry.bytes],{type:entry.mimeType||'image/png'}),`layout-case-${index+1}.${entry.extension||'png'}`);
  onProgress('正在由 GPT 图像模型绘制页面…');
  const endpoint=form.has('image[]')?'https://api.openai.com/v1/images/edits':'https://api.openai.com/v1/images/generations';
  const timeout=AbortSignal.timeout(Math.max(180,Number(settings.requestTimeout)||75)*1000);
  const response=await request(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:signal?AbortSignal.any([signal,timeout]):timeout});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(`图像模型 HTTP ${response.status}：${String(data.error?.message||'服务返回错误').slice(0,180)}`);
  const encoded=data.data?.[0]?.b64_json;
  if(typeof encoded!=='string'||!encoded)throw Error('图像模型未返回图像；没有创建空快照');
  const raw=atob(encoded),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  if(bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw Error('图像模型返回的不是有效 PNG');
  return new Blob([bytes],{type:'image/png'});
}
