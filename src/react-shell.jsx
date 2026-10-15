import React,{useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {iconMarkup} from './icons.js';

// The shell and every route are React roots. The canvas and image loader own
// only their resource nodes, not a fallback HTML page renderer.
const initialShellState={route:'series',basketCount:0,saveStatus:'本机存储',sync:null};
let currentShellState=initialShellState;
let shellSetter=null;
let shellActions={};

export function setShellActions(actions){shellActions=actions;}
export function updateShell(patch){
  currentShellState={...currentShellState,...patch};
  shellSetter?.(currentShellState);
}

function Icon({name}){
  return <span aria-hidden="true" dangerouslySetInnerHTML={{__html:iconMarkup(name)}}/>;
}

function AppShell(){
  const [shell,setShell]=useState(currentShellState);
  useLayoutEffect(()=>{shellSetter=setShell;return ()=>{shellSetter=null;};},[]);
  const active=route=>shell.route===route||(route==='library'&&['series','import'].includes(shell.route));
  return <>
    <header className="topbar"><div className="brand"><b dangerouslySetInnerHTML={{__html:iconMarkup('leaf')}}/><div><strong>拾页</strong><small>COLLECT. COMPOSE.</small></div></div><nav className="main-nav" aria-label="主导航">
      <button data-route="library" className={active('library')?'active':''} onClick={()=>shellActions.navigate?.('library')}><Icon name="folder"/> 素材</button><button data-route="matching" className={active('matching')?'active':''} onClick={()=>shellActions.navigate?.('matching')}><Icon name="sparkles"/> 搭配</button><button data-route="works" className={active('works')?'active':''} onClick={()=>shellActions.navigate?.('works')}><Icon name="book"/> 作品</button>
    </nav><div className="top-actions"><button type="button" id="top-basket" aria-label="本次创作" onClick={()=>shellActions.basket?.()}><span dangerouslySetInnerHTML={{__html:iconMarkup('archive')}}/>本次创作 <span id="basket-count">{shell.basketCount}</span></button><button type="button" id="top-settings" aria-label="设置" onClick={()=>shellActions.settings?.()} dangerouslySetInnerHTML={{__html:iconMarkup('settings')}}/><button type="button" id="sync-indicator" className="sync-indicator" hidden={!shell.sync} data-status={shell.sync?.status} title={shell.sync?.title} aria-label={shell.sync?.label} onClick={()=>shellActions.sync?.()}><span className="sync-indicator-symbol" aria-hidden="true"/><span className="sync-indicator-label" aria-live="polite">{shell.sync?.label||'正在核对'}</span></button><span id="save-state" className="save-state" onClick={()=>shellActions.save?.()}>{shell.saveStatus}</span></div></header>
    <main id="view" aria-live="polite"/>
    <div id="toast" role="status" aria-live="polite"/>
    <dialog id="modal"><div className="modal-shell"><button type="button" className="modal-close" aria-label="关闭">×</button><div id="modal-body"/></div></dialog>
    <input id="file-input" type="file" accept="image/*" multiple hidden/><input id="work-file-input" type="file" accept="image/*,.json,.zip" hidden/><input id="creation-result-input" type="file" hidden/><input id="snapshot-file-input" type="file" accept="image/png,image/jpeg,image/webp" hidden/><input id="backup-input" type="file" accept=".shiyepwa,.json" hidden/><input id="emergency-input" type="file" accept=".shiyerecovery,.json" hidden/>
  </>;
}

let root;
let routeRoot;
let routeRootKey=null;

export const unavailableRoute=()=>
  <section className="empty" role="alert"><strong>页面暂不可用</strong><p>请返回素材库后重试。</p></section>;

export function mountReactShell(){
  if(root)return;
  const host=document.querySelector('#app');
  if(!host)throw Error('缺少应用挂载位置');
  root=createRoot(host);
  flushSync(()=>root.render(<AppShell/>));
  routeRoot=createRoot(document.querySelector('#view'));
  flushSync(()=>routeRoot.render(<section className="empty">
    <strong>正在打开拾页…</strong><p>正在读取当前账号的本机缓存。</p>
  </section>));
}

export function renderReactPage(content,{preserveKey=null}={}){
  if(!root)mountReactShell();
  if(!React.isValidElement(content))throw Error('页面必须由 React 组件渲染');
  if(routeRoot&&(!preserveKey||routeRootKey!==preserveKey)){
    flushSync(()=>routeRoot.unmount());routeRoot=null;routeRootKey=null;
  }
  const view=document.querySelector('#view');
  if(!routeRoot){view.replaceChildren();routeRoot=createRoot(view);routeRootKey=preserveKey;}
  flushSync(()=>routeRoot.render(content));
}
