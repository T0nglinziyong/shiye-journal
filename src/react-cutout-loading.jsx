import React from 'react';
export function CutoutLoadingPanel({pixels,phase,onCancel}){
  return <section role="status" aria-live="polite" className="cutout-loading"><strong>正在准备抠图编辑器…</strong>
    <p>{phase||`正在加载 ${pixels}px 候选框 RGB 与透明蒙版…`}</p>
    <button type="button" className="btn" id="cutout-load-cancel" onClick={onCancel}>取消</button>
  </section>;
}
export function CutoutLoadError({error,onClose}){
  return <section role="alert" className="cutout-loading"><strong>检查抠图未能打开</strong>
    <p>{error?.message||'候选框图片读取失败，请检查同步状态'}</p>
    <button type="button" className="btn" onClick={onClose}>关闭</button>
  </section>;
}
