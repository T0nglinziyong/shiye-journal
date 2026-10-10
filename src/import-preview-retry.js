// Image URLs may be revoked by a interrupted import, especially on iOS
// when a photo batch is switched during decoding. A failed <img> is not
// evidence that its underlying Blob has vanished. Retry from the retained
// material Blob exactly once, then display a visible recovery hint.
export function bindImportCandidatePreviews({
  root,candidates=()=>[],createURL=blob=>URL.createObjectURL(blob),
  onRepair=()=>{},active=()=>true
}={}){
  if(!root)return;
  for(const image of root.querySelectorAll('img[data-import-preview-index]')){
    image.onerror=()=>{
      if(!active()||!image.isConnected)return;
      const index=Number(image.dataset.importPreviewIndex);
      const item=candidates()[index];
      if(image.dataset.importPreviewRetry!=='1'&&
         item?.blob instanceof Blob&&item.blob.size){
        image.dataset.importPreviewRetry='1';
        try{
          const url=createURL(item.blob);
          item.url=url;onRepair(index,item);
          image.src=url;return;
        }catch(error){
          console.warn('素材预览对象 URL 无法恢复',error);
        }
      }
      image.onerror=null;
      image.alt='素材 '+(index+1)+' 预览未能读取';
      const host=image.closest('.candidate-thumb');
      if(host&&!host.querySelector('.candidate-preview-error')){
        const label=document.createElement('span');
        label.className='candidate-preview-error';
        label.textContent='预览失败，请检查边缘';
        host.append(label);
      }
    };
  }
}
