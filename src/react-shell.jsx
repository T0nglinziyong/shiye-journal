import React,{Component,useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync,createPortal} from 'react-dom';
import {observeShellViewport} from './shell-viewport.js';
import './shell-viewport.css';
import {iconMarkup} from './icons.js';
import {CloudAccountMenu} from './react-cloud-auth.jsx';
import {recordRuntimeIssue} from './runtime-diagnostics.js';

// The shell and every route are React roots. The canvas and image loader own
// only their resource nodes, not a fallback HTML page renderer.
const initialShellState={route:'series',basketCount:0,saveStatus:'本机存储',sync:null,account:null,resetNotice:null,updateReady:false,updateStatus:''};
let currentShellState=initialShellState;
let shellSetter=null;
let overlaySetter=null;
let shellActions={};
let currentOverlay=null;
export function openOverlay(content){currentOverlay=content;overlaySetter?.(content);}
export function closeOverlay(){currentOverlay=null;overlaySetter?.(null);}

class RegionBoundary extends Component{
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error){recordRuntimeIssue('handled',error,this.props.route,{phase:'action'});}
  render(){if(!this.state.error)return this.props.children;
    return <section className="empty region-recovery" role="alert"><strong>这部分页面暂时无法显示</strong>
      <p>已保存的资料仍在。可以重试当前区域或返回素材库。</p>
      <div className="actions"><button type="button" className="btn primary" onClick={()=>this.setState({error:null})}>重试区域</button>
        <button type="button" className="btn" onClick={()=>{this.setState({error:null});this.props.onBack?.();}}>返回</button>
        <button type="button" className="btn" onClick={()=>shellActions.diagnostics?.()}>导出诊断</button></div></section>;
  }
}

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
  const [overlay,setOverlay]=useState(currentOverlay);
  const [mobile,setMobile]=useState(false);
  useLayoutEffect(()=>{
    const media=window.matchMedia('(max-width:699px)');
    const changed=()=>setMobile(media.matches);changed();
    media.addEventListener('change',changed);
    const dispose=observeShellViewport(window,document.documentElement);
    return ()=>{media.removeEventListener('change',changed);dispose();};
  },[]);
  useLayoutEffect(()=>{shellSetter=setShell;overlaySetter=setOverlay;
    return ()=>{shellSetter=null;overlaySetter=null;};},[]);
  const active=route=>shell.route===route||(route==='library'&&['series','import'].includes(shell.route));
  const navigation=<nav className="main-nav" aria-label="主导航">
      <button data-route="library" className={active('library')?'active':''} onClick={()=>shellActions.navigate?.('library')}><Icon name="folder"/> 素材</button><button data-route="matching" className={active('matching')?'active':''} onClick={()=>shellActions.navigate?.('matching')}><Icon name="sparkles"/> 搭配</button><button data-route="works" className={active('works')?'active':''} onClick={()=>shellActions.navigate?.('works')}><Icon name="book"/> 作品</button>
    </nav>;
  return <>
    <header className="topbar"><div className="brand"><b dangerouslySetInnerHTML={{__html:iconMarkup('leaf')}}/><div><strong>拾页</strong><small>COLLECT. COMPOSE.</small></div></div>{mobile?createPortal(navigation,document.body):navigation}<div className="top-actions">{shell.updateReady?<button type="button" className="btn mini shiye-update-ready" onClick={()=>shellActions.update?.()}>{shell.updateStatus||"更新拾页"}</button>:null}<button type="button" id="top-basket" aria-label="本次创作" onClick={()=>shellActions.basket?.()}><span dangerouslySetInnerHTML={{__html:iconMarkup('archive')}}/>本次创作 <span id="basket-count">{shell.basketCount}</span></button><button type="button" id="top-settings" aria-label="设置" onClick={()=>shellActions.settings?.()} dangerouslySetInnerHTML={{__html:iconMarkup('settings')}}/><button type="button" id="sync-indicator" className="sync-indicator" hidden={!shell.sync} data-status={shell.sync?.status} title={shell.sync?.title} aria-label={shell.sync?.label} onClick={()=>shellActions.sync?.()}><span className="sync-indicator-symbol" aria-hidden="true"/><span className="sync-indicator-label" aria-live="polite">{shell.sync?.label||'正在核对'}</span></button><span id="save-state" className="save-state" onClick={()=>shellActions.save?.()}>{shell.saveStatus}</span>{shell.account?<CloudAccountMenu account={shell.account}/>:null}</div></header>
    {shell.resetNotice?<aside role="status" className="cloud-reset-notice" style={{position:'fixed',bottom:78,left:12,right:12,maxWidth:600,margin:'auto',background:'#284234',color:'white',zIndex:2147483500,padding:14,borderRadius:14,boxShadow:'0 6px 25px #0003',fontSize:14,display:'flex',alignItems:'center',gap:12}}>
      <span>{shell.resetNotice.message}</span><button type="button" aria-label="关闭旧图片清理提示"
        style={{flexShrink:0,border:'1px solid #ffffff88',borderRadius:8,background:'transparent',color:'white',padding:'6px 9px'}}
        onClick={()=>updateShell({resetNotice:null})}>关闭</button>
    </aside>:null}
    <main id="view" aria-live="polite"/>
    {overlay?<RegionBoundary key={overlay.type?.name||'overlay'} route={shell.route}
      onBack={closeOverlay}>{overlay}</RegionBoundary>:null}
    <div id="toast" role="status" aria-live="polite"/>
    <dialog id="modal"><div className="modal-shell"><button type="button" className="modal-close" aria-label="关闭">×</button><div id="modal-body"/></div></dialog>
    <input id="file-input" type="file" accept="image/*" multiple hidden/><input id="work-file-input" type="file" accept="image/*,.json,.zip" hidden/><input id="creation-result-input" type="file" hidden/><input id="snapshot-file-input" type="file" accept="image/png,image/jpeg,image/webp" hidden/><input id="backup-input" type="file" accept=".shiyepwa" hidden/><input id="emergency-input" type="file" accept=".shiyerecovery,.json" hidden/>
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
  flushSync(()=>routeRoot.render(<RegionBoundary key={preserveKey||content.type?.name||'page'}
    route={currentShellState.route} onBack={()=>shellActions.navigate?.('library')}>{content}</RegionBoundary>));
}
