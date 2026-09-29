import {onDialogClosed} from './dialog-lifecycle.js';
// File input change handlers must return to the browser while awaiting a user
// choice. A page dialog avoids a synchronous native confirm during file upload.
export function confirmHistoryImport(modal,body){
  return new Promise(resolve=>{
    body.innerHTML='<h2>补回最初方案</h2><p>仅补回四页 CeCe 的原始历史快照，保留当前编辑内容和所有其他资料。</p><div class="actions"><button type="button" class="btn" data-history-cancel>取消</button><button type="button" class="btn primary" data-history-confirm>确认补回</button></div>';
    const remove=onDialogClosed(modal,()=>resolve(false));
    body.querySelector('[data-history-cancel]').onclick=()=>modal.close();
    body.querySelector('[data-history-confirm]').onclick=()=>{remove();modal.close();resolve(true);};
    modal.showModal();
  });
}
