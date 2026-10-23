import {project} from './domain.js';
import {assetSourceRevision} from './material-anatomy.js';
export const HYBRID_REBUILD_GUIDANCE='这张完整图是生成式视觉参考，不是新增实体素材，也不是用户经历或已验证文字。用本次真实素材、可编辑文字与图形重建图文关系；原素材像素与毫米尺寸优先于图里的变形。不要将整张图放进画布冒充分层还原，不虚构来源。无法对应的对象/纹理明确保留为待核对项，结果是独立候选，不保证无损复原。';
export function imageReferenceContext(p,assets,ids){
 const d=p.drafts.find(d=>d.id===p.activeDraftID)||p.drafts[0];
 return {version:1,title:p.title,page:{mode:d.pageMode,ratio:d.pageRatio,heightMM:d.physicalPageHeightMM,canvas:structuredClone(d.canvas)},
  styles:p.styles||[],purposes:p.purposes||[],intent:p.intent||'',contentPolicy:p.contentPolicy||'original',textPresentation:p.textPresentation||'mixed',userText:p.userText||'',providedFacts:p.providedFacts||'',processing:p.processing||'自由拆解',requiredAssetIDs:p.requiredAssetIDs||[],materialPriority:p.materialPriority||null,
  materials:ids.map(id=>{const a=assets.find(a=>a.id===id);if(!a)throw Error('参考素材已不存在');return {id,revision:assetSourceRevision(a)};})};
}
export function projectForImageRebuild(snapshot,assets){
 const c=snapshot?.imageSourceContext;
 if(!snapshot?.isSnapshot||c?.version!==1||!Array.isArray(c.materials)||!c.materials.length)throw Error('此快照缺少原始素材关联；请从素材搭配重新导出混合任务');
 for(const m of c.materials){const a=assets.find(a=>a.id===m.id);if(!a||assetSourceRevision(a)!==m.revision)throw Error('快照所用素材已变更或删除；请重新选择并生成任务，不会猜测或替换来源');}
 const p=project(c.title+' · 可编辑候选',{mode:c.page.mode,ratio:c.page.ratio});
 for(const key of ['styles','purposes','intent','contentPolicy','textPresentation','userText','providedFacts','processing','requiredAssetIDs','materialPriority'])p[key]=structuredClone(c[key]);
 if(c.page.canvas&&Number.isFinite(c.page.heightMM)&&c.page.heightMM>0){p.drafts[0].canvas=structuredClone(c.page.canvas);p.drafts[0].physicalPageHeightMM=c.page.heightMM;}
 p.candidateAssetIDs=c.materials.map(m=>m.id);p.creationMode='hybrid';p.isDraft=true;p.sourceSnapshotID=snapshot.id;
 return p;
}
export function validateRebuildNotes(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version','unresolved','notes'].includes(k))||value.version!==1)throw Error('重建说明格式无效');
 if(!Array.isArray(value.unresolved)||value.unresolved.length>100||!Array.isArray(value.notes)||value.notes.length>20)throw Error('重建说明需要 unresolved 和 notes 数组');
 for(const row of value.unresolved){if(!row||Object.keys(row).some(k=>!['region','reason'].includes(k))||typeof row.reason!=='string'||!row.reason.trim()||row.reason.length>500)throw Error('待核对区域需要明确原因');
  if(row.region&&(!Array.isArray(row.region)||row.region.length!==4||!row.region.every(n=>Number.isFinite(n)&&n>=0&&n<=1)||row.region[2]<=0||row.region[3]<=0||row.region[0]+row.region[2]>1.000001||row.region[1]+row.region[3]>1.000001))throw Error('region 使用画面内的比例 [x,y,width,height]');}
 if(value.notes.some(s=>typeof s!=='string'||s.length>1000))throw Error('notes 内容无效');return value;
}
export function validateImageReconstruction(value,source){
 if(!value||value.version!==1||value.status!=='candidate'||value.method!=='gpt-reference-rebuild'||!/^sha256:[a-f0-9]{64}$/.test(value.referenceHash||'')||Object.keys(value).some(k=>!['version','status','method','referenceHash','unresolved','notes'].includes(k)))throw Error('混合作品缺少有效的候选重建记录');
 validateRebuildNotes({version:1,unresolved:value.unresolved,notes:value.notes});
 if(source?.visualReference?.sha256&&source.visualReference.sha256!==value.referenceHash)throw Error('重建参考与原任务不符');return value;
}
export async function blobDataURL(blob){
 if(!(blob instanceof Blob)||blob.size>40_000_000)throw Error('参考图片无效或过大');
 const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return `data:${blob.type};base64,${btoa(binary)}`;
}
