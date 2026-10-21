import {attachSceneV2,sceneLayerEntries} from './scene-v2.js';
import {renderSceneCanvas,decodeSceneImage} from './scene-renderer.js';
import {auditOfflineCanvasDraft} from './offline-canvas-audit.js';
const validImage=url=>typeof url==='string'&&/^data:image\/(?:png|webp|jpeg);base64,[a-zA-Z0-9+/]+=*$/.test(url);
export async function render(payload){
 window.SHIYE_RENDER_READY=false;window.SHIYE_EXPORT_PREVIEW=null;window.SHIYE_RENDER_REPORT=null;
 document.body.dataset.renderState='rendering';
 const status=document.querySelector('#status'),button=document.querySelector('#save');
 attachSceneV2(payload.draft);
 const sourceIDs=[...new Set(sceneLayerEntries(payload.draft).filter(e=>e.kind==='material'&&!e.value.isParked).map(e=>e.value.assetID))],seen=new Set();
 const {canvas,report}=await renderSceneCanvas(payload.draft,{scale:payload.scale||1,loadMaterialImage:async id=>{
  const url=payload.images[id];if(!validImage(url))throw Error('缺少本次素材图片：'+id);
  const image=await decodeSceneImage(url);seen.add(id);return image;
 }});
 const missing=sourceIDs.filter(id=>!seen.has(id));if(missing.length)throw Error('这些素材未真正渲染：'+missing.join('、'));
 document.querySelector('#page').replaceChildren(canvas);
 const geometryAudit=auditOfflineCanvasDraft(payload.draft);
 const fullReport={...report,...geometryAudit,visibleSourceCount:sourceIDs.length,decodedSourceCount:seen.size,visualReview:'manual-required',reading:'pending',note:'Canvas 使用任务包图片与当前设备字体；不是对字体和阅读的自动验收'};
 status.textContent='已按拾页共用 Canvas 渲染（'+seen.size+' 件素材）。'+(geometryAudit.warnings.length?'发现 '+geometryAudit.warnings.length+' 项待检查问题；':'')+'请对照验收清单检查文字、抠图和图层。';
 const review=document.querySelector('#audit');if(review)review.textContent=geometryAudit.warnings.length?geometryAudit.warnings.join('；'):'基础几何检查未发现明显溢出，仍需人工检查实际画面';
 document.body.dataset.renderState='ready';button.disabled=false;
 button.onclick=()=>canvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='preview.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);},'image/png');
 window.SHIYE_EXPORT_PREVIEW=()=>({sceneHash:fullReport.sceneHash,width:canvas.width,height:canvas.height,png:canvas.toDataURL('image/png')});
 window.SHIYE_RENDER_REPORT=fullReport;window.SHIYE_RENDER_READY=true;return fullReport;
}
