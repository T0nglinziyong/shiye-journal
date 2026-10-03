// Self-contained trusted renderer plus escaped validated scene. No network,
// no cloud credentials, no executable model code or packaged system fonts.
export function offlineBrowserPage(draft,source,previews,browserSource){
 const images=Object.fromEntries(source.materials.flatMap(m=>previews[m.alias]?.length?[[m.assetID,'data:image/png;base64,'+Buffer.from(previews[m.alias]).toString('base64')]]:[]));
 const payload=JSON.stringify({draft,images,scale:1}).replace(/</g,'\\u003c');
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><title>拾页共用画面渲染</title><style>body{margin:20px;background:#eee;font-family:sans-serif}#page canvas{display:block;width:100%;max-width:1100px;height:auto}button{padding:12px;margin-bottom:12px}#status{padding:12px 0}</style><button id="save" disabled>保存 PNG</button><div id="status">正在渲染…</div><div id="page"></div><script>${browserSource.replace(/<\/script/gi,'<\\/script')}</script><script>ShiyeScene.render(${payload}).catch(e=>{document.querySelector('#status').textContent='渲染失败：'+e.message;window.SHIYE_RENDER_ERROR=e.message;});</script></html>`;
}
