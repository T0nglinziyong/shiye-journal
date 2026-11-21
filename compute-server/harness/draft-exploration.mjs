import {applyCreationTransaction,creationSceneRevision} from '../../src/creation-transaction.js';
import {inspectCreationDocument} from '../../src/creation-inspection.js';
import {validateWebScene} from '../../src/web-scene-workbench.js';

export async function exploreCreativeDrafts({model,document,goals,sourceMessage,tool,renderDraft,assets,capabilities,signal,remainingMs,round}){
  const baseSceneRevision=creationSceneRevision(document);
  const basePreview=await renderDraft(document,signal);
  if(basePreview.sceneRevision!==baseSceneRevision||!/^sha256:[a-f0-9]{64}$/.test(basePreview.pngHash)||!/^data:image\/(png|jpeg|webp);base64,/.test(basePreview.imageURL))throw Error('草稿基线画面与 Scene 不一致');
  const candidates=await Promise.all(goals.map(async(goal,index)=>{
    const id=`draft_${round}_${index+1}`;
    try{
      signal?.throwIfAborted();
      const reply=await model({messages:[
        {role:'system',content:'你是拾页的独立构图草稿子 Agent。只完成一个与目标明确不同的可编辑 Scene 草稿。只调用一次 creation_apply，传入给定的最新 baseSceneRevision，用一个原子事务完成构图；不得调用其他工具。保留真实素材来源、毫米尺寸和用量，不虚构素材与用户经历。新建图层 ID 使用 '+id+'_ 前缀；已有图层用 layer.update。当前 Scene 是唯一位置真相。不要输出完工声明。'},
        sourceMessage,
        {role:'user',content:[{type:'text',text:'独立草稿方向：'+goal+'\n当前权威 Scene：'+JSON.stringify(inspectCreationDocument(document))+'\n当前纸面画面版本：'+basePreview.pngHash+'\nbaseSceneRevision：'+baseSceneRevision+'\ntransactionId：'+id+'\n只返回 creation_apply 工具调用。'},{type:'image_url',image_url:{url:basePreview.imageURL}}]}
      ],tools:[tool],signal,remainingMs});
      signal?.throwIfAborted();
      const calls=reply.message?.tool_calls||[];
      if(calls.length!==1||calls[0].function?.name!=='creation_apply')throw Error('子 Agent 未返回单个编辑事务');
      const parsed=JSON.parse(calls[0].function.arguments||'{}');
      const {decision,...transaction}=parsed;
      if(transaction.baseSceneRevision!==baseSceneRevision)throw Error('草稿的 Scene 基线已过期');
      const applied=applyCreationTransaction(document,transaction,assets,capabilities);
      if(!applied.changed)throw Error('草稿没有可见修改');
      validateWebScene(applied.document.page,applied.document.source,assets,{final:false});
      const preview=await renderDraft(applied.document,signal);
      if(preview.sceneRevision!==creationSceneRevision(applied.document)||!/^sha256:[a-f0-9]{64}$/.test(preview.pngHash)||!/^data:image\/(png|jpeg|webp);base64,/.test(preview.imageURL))throw Error('草稿预览与 Scene 不一致');
      return {id,goal,document:applied.document,preview:{pngHash:preview.pngHash,sceneRevision:preview.sceneRevision,imageURL:preview.imageURL},decision:decision||null,usage:reply.usage||null};
    }catch(error){if(signal?.aborted)throw error;return {id,goal,error:error.message};}
  }));
  return {baseSceneRevision,candidates};
}
