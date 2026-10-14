// Stable import workspace updates. Photo/quad gesture DOM is never recreated
// on recognition progress and parameter changes. The legacy renderer remains
// the full-mount fallback on stage, layout or data-contract changes.
import {reconcileKeyedChildren} from './ui-keyed-dom.js';

const bySelector=(parent,selector)=>parent?.querySelector(selector);
const content=(node)=>node?.textContent||'';
function setText(node,wanted){
  if(node&&wanted&&node.textContent!==wanted.textContent)node.textContent=wanted.textContent;
}
function patchQueue(oldList,newList){
  return reconcileKeyedChildren(oldList,newList,el=>el.dataset.id,{
    update(oldNode,newNode){
      const oldImage=oldNode.querySelector('img'),nextImage=newNode.querySelector('img');
      if(!oldImage||!nextImage||oldImage.getAttribute('src')!==nextImage.getAttribute('src'))return false;
      oldNode.className=newNode.className;
      const oldLabel=oldNode.querySelector('span'),newLabel=newNode.querySelector('span');
      if(oldLabel&&newLabel&&oldLabel.innerHTML!==newLabel.innerHTML)oldLabel.innerHTML=newLabel.innerHTML;
      oldNode.disabled=newNode.disabled;
      return true;
    }
  });
}
function patchCandidates(oldGrid,newGrid){
  return reconcileKeyedChildren(oldGrid,newGrid,el=>el.querySelector('[data-act="import-toggle-candidate"]')?.dataset.id,{
    update(oldNode,newNode){
      const oldImage=oldNode.querySelector('img'),newImage=newNode.querySelector('img');
      if(!oldImage||!newImage||oldImage.getAttribute('src')!==newImage.getAttribute('src'))return false;
      const oldButton=oldNode.querySelector('[data-act="import-toggle-candidate"]');
      const nextButton=newNode.querySelector('[data-act="import-toggle-candidate"]');
      if(!oldButton||!nextButton)return false;
      oldButton.className=nextButton.className;
      oldButton.setAttribute('aria-pressed',String(nextButton.classList.contains('selected')));
      const oldLabels=oldButton.querySelectorAll('span'),newLabels=nextButton.querySelectorAll('span');
      // Preserve the thumbnail's decoded <img>. Update only badges and dimensions.
      if(oldLabels[1]&&newLabels[1])setText(oldLabels[1],newLabels[1]);
      setText(oldButton.querySelector('small'),nextButton.querySelector('small'));
      const checkOld=oldNode.querySelector('[data-import-check]'),checkNew=newNode.querySelector('[data-import-check]');
      if(checkOld&&checkNew)checkOld.disabled=checkNew.disabled;
      return true;
    }
  });
}
const sameButtons=(a,b)=>[...a.querySelectorAll('.import-photo-tools button')].map(x=>x.textContent).join('|')===
  [...b.querySelectorAll('.import-photo-tools button')].map(x=>x.textContent).join('|');

/** Returns null when a full re-mount is required, otherwise a change report. */
export function patchImportInspection(view,html){
  const direct=(parent,selector)=>[...parent.children].find(child=>child.matches(selector));
  const oldRoot=direct(view,'.import-inspect');
  const template=document.createElement('template');template.innerHTML=html;
  const nextRoot=direct(template.content,'.import-inspect');
  if(!oldRoot||!nextRoot||
     oldRoot.classList.contains('import-snapshot-inspect')!==nextRoot.classList.contains('import-snapshot-inspect'))return null;
  const oldNav=direct(view,'.import-nav'),
    nextNav=direct(template.content,'.import-nav');
  const oldQueue=bySelector(oldRoot,'.queue-strip'),nextQueue=bySelector(nextRoot,'.queue-strip'),
    oldPrep=bySelector(oldRoot,'.import-preparation'),nextPrep=bySelector(nextRoot,'.import-preparation'),
    oldInspector=bySelector(oldRoot,'.import-inspector'),nextInspector=bySelector(nextRoot,'.import-inspector');
  if(!oldNav||!nextNav||!oldQueue||!nextQueue||!oldPrep||!nextPrep||!oldInspector||!nextInspector)return null;
  const report={patched:true,photoReplaced:false,candidatesChanged:false,newQueueButtons:false};
  // The step stays "inspect" for an incremental patch. React owns the nav
  // buttons, so keep that top-level node and its click handlers intact.
  oldRoot.setAttribute('aria-busy',nextRoot.getAttribute('aria-busy')||'false');
  setText(bySelector(oldRoot,'.import-processing'),bySelector(nextRoot,'.import-processing'));
  const oldSummary=bySelector(oldRoot,'.import-queue>div'),nextSummary=bySelector(nextRoot,'.import-queue>div');
  if(oldSummary&&nextSummary&&oldSummary.innerHTML!==nextSummary.innerHTML)oldSummary.innerHTML=nextSummary.innerHTML;
  const oldAdd=bySelector(oldRoot,'.import-queue>[data-act="select-file"]'),
    nextAdd=bySelector(nextRoot,'.import-queue>[data-act="select-file"]');
  if(oldAdd&&nextAdd)oldAdd.disabled=nextAdd.disabled;
  const scroll=oldQueue.scrollLeft;
  const queueStats=patchQueue(oldQueue,nextQueue);
  oldQueue.scrollLeft=scroll;
  report.newQueueButtons=queueStats.inserted>0;
  // Background recognition must not reinitialize an unchanged paper-corner
  // overlay, pointer capture, source image decoder or ResizeObserver.
  const oldSource=bySelector(oldPrep,'.photo-preview img'),
    nextSource=bySelector(nextPrep,'.photo-preview img');
  const prepSame=!!oldSource&&!!nextSource&&
    oldSource.getAttribute('src')===nextSource.getAttribute('src')&&
    sameButtons(oldPrep,nextPrep)&&
    content(bySelector(oldPrep,'.photo-preparation-content>h3'))===content(bySelector(nextPrep,'.photo-preparation-content>h3'));
  if(!prepSame){oldPrep.replaceWith(nextPrep);report.photoReplaced=true;}
  else{
    setText(bySelector(oldPrep,'h2'),bySelector(nextPrep,'h2'));
    setText(bySelector(oldPrep,'.photo-preparation-content>p'),bySelector(nextPrep,'.photo-preparation-content>p'));
  }
  // The settings panel is an independent component. Preserve the scroller and
  // focused controls when its option structure is unchanged.
  const oldSettings=bySelector(oldInspector,'.inspector-settings'),nextSettings=bySelector(nextInspector,'.inspector-settings');
  if(!oldRoot.hasAttribute('data-react-page')&&oldSettings&&nextSettings&&oldSettings.innerHTML!==nextSettings.innerHTML){
    const focused=oldSettings.contains(document.activeElement)
      ?document.activeElement?.id:null;
    const scrollHost=oldSettings.closest('.inspector-scroll'),scrollTop=scrollHost?.scrollTop||0;
    oldSettings.replaceWith(nextSettings);
    if(scrollHost)scrollHost.scrollTop=scrollTop;
    if(focused){
      const restore=[...nextSettings.querySelectorAll('[id]')].find(el=>el.id===focused);
      restore?.focus({preventScroll:true});
    }
  }
  const oldCandidates=bySelector(oldInspector,'.import-candidate-grid'),
    nextCandidates=bySelector(nextInspector,'.import-candidate-grid');
  if(oldCandidates&&nextCandidates){
    const stats=patchCandidates(oldCandidates,nextCandidates);
    report.candidatesChanged=stats.inserted>0||stats.removed>0||stats.changed>0;
  }
  setText(bySelector(oldInspector,'h2'),bySelector(nextInspector,'h2'));
  setText(bySelector(oldInspector,'.inspector-scroll h3'),bySelector(nextInspector,'.inspector-scroll h3'));
  const submit=bySelector(oldInspector,'.confirm-photo'),expected=bySelector(nextInspector,'.confirm-photo');
  if(submit&&expected){submit.disabled=expected.disabled;setText(submit,expected);}
  return report;
}
