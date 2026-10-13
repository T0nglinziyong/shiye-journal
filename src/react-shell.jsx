import React,{useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';

// The shell is the single React root. Route templates are kept byte-for-byte
// while their controllers move to components; editors and the image loader
// continue to own their imperative canvas/Blob resources.
function AppShell(){
  return <>
    <header className="topbar"><div className="brand"><b>♧</b><div><strong>拾页</strong><small>COLLECT. COMPOSE.</small></div></div><nav className="main-nav" aria-label="主导航">
      <button data-route="library"><span aria-hidden="true">▣</span> 素材</button><button data-route="matching"><span aria-hidden="true">✦</span> 搭配</button><button data-route="works"><span aria-hidden="true">▤</span> 作品</button>
    </nav><div className="top-actions"><button type="button" id="top-basket" aria-label="本次创作">本次创作 <span id="basket-count">0</span></button><button type="button" id="top-settings" aria-label="设置">⚙</button><button type="button" id="sync-indicator" className="sync-indicator" hidden><span className="sync-indicator-symbol" aria-hidden="true"/><span className="sync-indicator-label" aria-live="polite">正在核对</span></button><span id="save-state" className="save-state">本机存储</span></div></header>
    <main id="view" aria-live="polite"/>
    <div id="toast" role="status" aria-live="polite"/>
    <dialog id="modal"><div className="modal-shell"><button type="button" className="modal-close" aria-label="关闭">×</button><div id="modal-body"/></div></dialog>
    <input id="file-input" type="file" accept="image/*" multiple hidden/><input id="work-file-input" type="file" accept="image/*,.json,.zip" hidden/><input id="creation-result-input" type="file" hidden/><input id="snapshot-file-input" type="file" accept="image/png,image/jpeg,image/webp" hidden/><input id="backup-input" type="file" accept=".shiyepwa,.json" hidden/><input id="emergency-input" type="file" accept=".shiyerecovery,.json" hidden/>
  </>;
}

let root;
let routeRoot;

// The recognition workspace, Matching controls and canvas engine still own
// gesture-heavy DOM lifetimes. They mount as React route islands so a route
// switch has one lifecycle, while their existing incremental patchers can
// keep the exact photo/canvas nodes currently under a pointer.
function ImperativeRoute({html}){
  useLayoutEffect(()=>{
    document.querySelector('#view').innerHTML=html;
  },[html]);
  return null;
}
export const imperativeRoute=html=><ImperativeRoute html={html}/>;

export function mountReactShell(){
  if(root)return;
  const host=document.querySelector('#app');
  if(!host)throw Error('缺少应用挂载位置');
  root=createRoot(host);
  flushSync(()=>root.render(<AppShell/>));
  document.querySelector('#view').innerHTML='<section class="empty"><strong>正在打开拾页…</strong><p>正在读取当前账号的本机缓存。</p></section>';
}

export function renderReactPage(content){
  if(!root)mountReactShell();
  if(routeRoot){flushSync(()=>routeRoot.unmount());routeRoot=null;}
  const view=document.querySelector('#view');
  if(React.isValidElement(content)){
    view.replaceChildren();
    routeRoot=createRoot(view);
    flushSync(()=>routeRoot.render(content));
  }else view.innerHTML=content;
}
