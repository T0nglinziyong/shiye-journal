import {previewImageFormat} from './offline-preview.js';
// This standalone page uses the same Scene renderer as the editor and export.
export function offlineBrowserPage(draft,source,previews,browserSource){
 const images=Object.fromEntries(source.materials.flatMap(m=>previews[m.alias]?.length?[[m.assetID,'data:'+previewImageFormat(previews[m.alias]).mimeType+';base64,'+Buffer.from(previews[m.alias]).toString('base64')]]:[]));
 const payload=JSON.stringify({draft,images,scale:1}).replace(/</g,'\\u003c');
 return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data: blob:; style-src &#39;unsafe-inline&#39;; script-src &#39;unsafe-inline&#39;;">'+
  '<title>拾页共用 Canvas 画面预览</title><style>body{margin:20px;background:#eaece7;color:#394c41;font-family:Noto Sans CJK SC,PingFang SC,Microsoft YaHei,sans-serif;line-height:1.6}main{max-width:1160px;margin:auto}#page{background:#fff}#page canvas{display:block;width:100%;height:auto}button{padding:10px 18px;margin:8px 0 14px}#status{padding:10px 0}aside{background:#f7f9f5;padding:12px 18px;margin-top:18px}</style>'+
  '<main><h2>拾页 · 可编辑图层的同源 Canvas 预览</h2><p>本预览使用任务包中的真实素材快照；字体仍需与拾页应用核对。</p><button id="save" disabled>保存这次 Canvas 渲染的 PNG</button><div id="status" role="status">正在渲染…</div><div id="page"></div><aside><strong>自动检查提示（不能代替肉眼核对）</strong><p id="audit">等待渲染…</p><p>请检查素材轮廓、透明边缘、裁片、字号、换行和图层顺序。更改作品后运行 node runtime/shiye.cjs preview 重新渲染。“已渲染”不代表已完成审美验收。</p></aside></main>'+
  '<script>'+browserSource.replace(/<\/script/gi,'<\\/script')+'</script>'+
  '<script>ShiyeScene.render('+payload+').catch(e=>{document.body.dataset.renderState="error";document.querySelector("#status").textContent="渲染失败："+e.message;window.SHIYE_RENDER_READY=false;window.SHIYE_RENDER_ERROR=e.message;});</script></html>';
}
