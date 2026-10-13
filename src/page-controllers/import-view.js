// Pure import page projection. No global route, DOM mutation or storage writes.
// Context is injected so React/Vue can substitute a renderer later.
import {supportsVision} from '../ai-settings.js';
export function renderImportHTML({state,esc,fmt,importSteps,importSourceButtons,renderImportReview,renderImportInspection}){const b=state.importBox,rec=state.importRecords[state.importIndex];let content='';
  if(state.importStep==='done'){
    const kind=state.importMode==='work'?'作品':state.importMode==='snapshot'?'快照':'素材';
    const destination=state.importMode==='work'||state.importMode==='snapshot'?'作品':'素材库';
    const needsManualCheck=state.importMode==='material'&&state.preferences.autoOrganize
      &&!(state.aiSettings?.key&&state.aiSettings.includeThumbnails&&supportsVision(state.aiSettings));
    const note=state.importPending
      ?'内容已安全暂存。云端同步将在后台完成，可以放心返回继续使用。'
      :'内容已经保存。你可以返回查看，也可以继续添加下一批照片。';
    const extra=needsManualCheck
      ?'<p class="import-done-helper">视觉自动整理尚未启用，素材已保留待检查。稍后可在设置中开启。</p>':'';

    content=`<section class="import-done" aria-labelledby="import-done-title"><div class="import-done-card"><div class="import-done-icon" aria-hidden="true">✓</div><h1 id="import-done-title">导入完成</h1><p class="import-done-count">已导入 <strong>${state.importSavedCount||0}</strong> 个${kind}</p><p class="import-done-message">${note}</p>${extra}<div class="review-actions import-done-actions"><button class="btn" data-act="import-exit">返回${destination}</button><button class="btn primary" data-act="import-continue">继续导入</button></div></div></section>`;
  }
  else if(state.importStep==='review')content=renderImportReview({state,esc,fmt});
  else if(!rec)content=`<section class="import-intro"><div class="eyebrow">FROM YOUR DESK TO YOUR PAGES</div><h1>${state.importMode==='work'?'收进完成的作品':'先认出纸，再留住喜欢的'}</h1><p>从相册多选，逐张确认纸张和${state.importMode==='work'?'页面':'素材'}。</p><div class="import-empty"><div class="photo-symbol">▧</div><h2>添加照片</h2><p>从相册多选，或拍摄一张白纸上的素材。</p>${importSourceButtons()}<small>每批最多 12 张；使用较小图像识别，从原始工作图提取素材</small></div></section>`;
  else content=renderImportInspection({state,esc,fmt});
  return importSteps()+content;
}
