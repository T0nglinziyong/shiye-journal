import {renderSceneCanvas,decodeSceneImage} from './scene-renderer.js';

const validImage=url=>typeof url==='string'&&/^data:image\/(?:png|webp);base64,[a-zA-Z0-9+/]+=*$/.test(url);

export async function render(payload){
  window.SHIYE_RENDER_READY=false;
  window.SHIYE_RENDER_REPORT=null;
  const status=document.querySelector('#status'),button=document.querySelector('#save');
  const sourceIDs=[...new Set((payload.draft.items||[])
    .filter(item=>!item.hidden&&!item.isHidden&&!item.isParked)
    .map(item=>item.assetID).filter(Boolean))];
  const seen=new Set();
  const {canvas,report}=await renderSceneCanvas(payload.draft,{
    scale:payload.scale||1,
    loadMaterialImage:async id=>{
      const url=payload.images[id];
      if(!validImage(url))throw Error('缺少本次素材 PNG/WebP 预览：'+id);
      const image=await decodeSceneImage(url);
      seen.add(id);
      return image;
    }
  });
  const missing=sourceIDs.filter(id=>!seen.has(id));
  if(missing.length)throw Error('这些素材未真正渲染：'+missing.join('、'));
  document.querySelector('#page').replaceChildren(canvas);
  const fullReport={...report,visibleSourceCount:sourceIDs.length,decodedSourceCount:seen.size,
    visualReview:'manual-required',reading:'pending',
    note:'Canvas 使用任务包图片与当前设备字体；不是对实体原图、字体和阅读的自动验收'};
  status.textContent='已按拾页共用 Canvas 渲染（'+seen.size+' 件素材）。请对照验收清单检查文字、抠图和图层，再决定是否交付。';
  document.body.dataset.renderState='ready';
  button.disabled=false;
  button.onclick=()=>canvas.toBlob(blob=>{
    if(!blob)return;
    const a=document.createElement('a'),url=URL.createObjectURL(blob);
    a.href=url;a.download='preview.png';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  },'image/png');
  window.SHIYE_RENDER_REPORT=fullReport;
  window.SHIYE_RENDER_READY=true;
  return fullReport;
}
