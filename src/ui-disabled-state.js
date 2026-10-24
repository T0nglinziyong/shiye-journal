// Keep the reason for disabling a control explicit. A long-running task
// may temporarily disable a form without permanently overwriting business
// constraints such as 'already applied' or 'cannot confirm yet'.
export function syncBusyControls(root,selector,busy){
  let modified=0;
  for(const element of root.querySelectorAll(selector)){
    if(busy){
      if(!element.disabled){element.dataset.uiBusyDisabled='true';element.disabled=true;modified++;}
    }else if(element.dataset.uiBusyDisabled==='true'){
      element.disabled=false;delete element.dataset.uiBusyDisabled;modified++;
    }
  }
  return modified;
}
