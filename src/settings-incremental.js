// The model connection panel is the only component replaced on provider
// changes. Keep settings page, typed creative preferences, scroll and the
// native <details> identity intact.
export function patchAISettingsModel(view,html){
  const existing=view.querySelector('.settings-page #ai-model-group');
  if(!existing)return false;
  const template=document.createElement('template');template.innerHTML=html;
  const desired=template.content.querySelector('.settings-page #ai-model-group');
  if(!desired)return false;
  const oldContent=existing.querySelector(':scope > div'),
    newContent=desired.querySelector(':scope > div');
  if(!oldContent||!newContent)return false;
  const scroller=existing.closest('.settings-detail'),position=scroller?.scrollTop||0;
  const expanded=existing.open;
  oldContent.replaceWith(newContent);
  existing.open=expanded;
  if(scroller)scroller.scrollTop=position;
  return true;
}
