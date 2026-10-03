import {renderSceneCanvas,decodeSceneImage} from './scene-renderer.js';
export async function render(payload){
 const {canvas,report}=await renderSceneCanvas(payload.draft,{scale:payload.scale||1,loadMaterialImage:async id=>{
  const url=payload.images[id];if(!url||!/^data:image\/png;base64,/.test(url))throw Error('缺少本次素材图像：'+id);return decodeSceneImage(url);
 }});
 document.querySelector('#page').replaceChildren(canvas);
 document.querySelector('#status').textContent='已按拾页共用 Canvas 渲染。图片来自任务预览；最终高清与设备字体请在应用内核对。';
 const button=document.querySelector('#save');button.disabled=false;
 button.onclick=()=>canvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='preview.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);},'image/png');
 window.SHIYE_RENDER_REPORT=report;window.SHIYE_RENDER_READY=true;return report;
}
