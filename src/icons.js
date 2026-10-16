import {
  createElement, Leaf, Folder, Sparkles, Book, Archive, Settings, MousePointer2,
  SquareDashed, PenLine, Highlighter, Eraser, Lasso, Type, Shapes, Images, Layers,
  Grid3x3, Grid2x2, ListFilter, ArrowDownWideNarrow, ArrowUp, ArrowDown, ListOrdered,
  FileSearch, Search, Plus, Check, CircleCheck, SquareCheck, Square, X, ChevronLeft,
  ChevronRight, ArrowRight, Undo2, Redo2, RotateCcw, Share, Copy, Trash2,
  LockKeyhole, LockKeyholeOpen, Eye, EyeOff, Star, HardDrive, Scan, Camera, File,
  ShoppingBasket, CircleEllipsis, CircleHelp, FileDown, FileUp
} from 'lucide';

// Named imports keep the bundle limited to the SVGs actually used.
// The mapping follows Swift SF Symbols purposes; Lucide geometry is ISC licensed.
const iconNodes=Object.freeze({
  leaf:Leaf,folder:Folder,sparkles:Sparkles,book:Book,archive:Archive,settings:Settings,
  cursor:MousePointer2,marquee:SquareDashed,pen:PenLine,marker:Highlighter,
  eraser:Eraser,lasso:Lasso,text:Type,shape:Shapes,material:Images,layers:Layers,
  paper:Grid3x3,grid:Grid2x2,status:ListFilter,sort:ArrowDownWideNarrow,up:ArrowUp,
  down:ArrowDown,history:ListOrdered,context:FileSearch,search:Search,plus:Plus,
  check:Check,checkCircle:CircleCheck,checkSquare:SquareCheck,square:Square,close:X,
  back:ChevronLeft,next:ChevronRight,arrowRight:ArrowRight,undo:Undo2,redo:Redo2,
  rotate:RotateCcw,share:Share,copy:Copy,trash:Trash2,lock:LockKeyhole,
  unlock:LockKeyholeOpen,eye:Eye,eyeOff:EyeOff,star:Star,use:Copy,drive:HardDrive,
  viewfinder:Scan,camera:Camera,file:File,basket:ShoppingBasket,pencilCircle:PenLine,
  more:CircleEllipsis,help:CircleHelp,fileDown:FileDown,fileUp:FileUp
});

export function createIcon(name){
  if(!Object.hasOwn(iconNodes,name))return null;
  return createElement(iconNodes[name],{class:'shiye-icon','data-shiye-icon':name,
    width:24,height:24,stroke:'currentColor','stroke-width':1.7,
    'aria-hidden':'true',focusable:'false'});
}

export const swiftIconSymbols=Object.freeze({leaf:'leaf',folder:'folder',sparkles:'sparkles',book:'book.closed',archive:'archivebox',settings:'gearshape',cursor:'cursorarrow',marquee:'rectangle.dashed',marker:'highlighter',eraser:'eraser',lasso:'lasso',text:'textformat',shape:'square.on.circle',material:'photo.on.rectangle.angled',layers:'square.3.layers.3d',paper:'square.grid.3x3',grid:'square.grid.2x2',status:'line.3.horizontal.decrease.circle',history:'list.number',context:'doc.text.magnifyingglass',search:'magnifyingglass',undo:'arrow.uturn.backward',redo:'arrow.uturn.forward',share:'square.and.arrow.up',checkCircle:'checkmark.circle',checkSquare:'checkmark.square'});
export function iconMarkup(name){return createIcon(name)?.outerHTML||'';}

const tools={select:['cursor','选择'],marquee:['marquee','矩形框选'],pen:['pen','钢笔'],highlighter:['marker','荧光笔'],eraser:['eraser','橡皮擦'],lasso:['lasso','套索对象'],text:['text','文字'],shape:['shape','添加图形'],material:['material','添加素材']};
const actions={'match-library':'folder','match-context':'context','reset-match':'rotate','match-use':'use','match-generate':'sparkles','match-export-gpt':'fileDown','match-import-gpt':'fileUp','create-from-basket':'pen',undo:'undo',redo:'redo','back-works':'back','settings-back':'back','detail-back':'back','import-back':'back','detail-series':'folder','detail-similar':'search','similar':'search','detail-match':'sparkles','edit-asset':'pen','delete-object':'trash',duplicate:'copy','export-png':'share',print:'share','paper-menu':'paper','new-draft':'plus','new-project':'plus','new-series':'plus'};
const labels={'设置':'settings','关闭':'close','返回':'back','历史记录':'history','使用 Apple Pencil':'pencilCircle','导出作品':'share','图层':'layers','画布背景':'paper','底纸':'paper','制作步骤与迭代记录':'history','复制对象':'copy','删除对象':'trash','编辑对象':'pen','复制套选对象':'copy','删除套选对象':'trash','合并套选图层':'layers','旋转对象':'rotate','锁定图层':'lock','解锁图层':'unlock','隐藏图层':'eye','显示图层':'eyeOff','调整图层顺序':'sort','已加入搭配素材篮':'check','设为必用':'star','取消必用':'star','移出素材篮':'close','作品详情':'more'};
const categories={'AI 与创作':'sparkles','导入与识别':'viewfinder','界面与素材库':'grid','数据与诊断':'drive'};
const glyphPrefix=/^[\s]*[♧♙♜▣▤▱▦▧▢☷≡✦✣⚙↶↷↥➤◇◌◉◷⊞⊗⊙★☆☑□✓＋+‹›→↑↓↕⟳×✕✖⋯]+[\s　]*/u;
const iconOnly=/^[\s♧♙♜▣▤▱▦▧▢☷≡✦✣⚙↶↷↥➤◇◌◉◷⊞⧉✎⊗⊙★☆☑□✓＋+‹›→↑↓↕⟳×✕✖⋯]*$/u;
const selector='button[data-act],button[data-route],button[aria-label],button[data-filter-heading],#top-settings,#top-basket,.brand>b,.settings-icon,.batch-check,.basket-card-check,.card[data-act="series-detail"] h3>span[aria-hidden],input[type="search"],.series-entry-cover,.action-card>.card-image,.work-entry>.card-image,.library-select-toggle,.series-back,.library-management-tray>button,.selection-more-menu button,.selection-submenu>button,.matching-page .basket>h3,.matching-page .match-panel-head>h3,.canvas-context-tools>button';
const mounts=new WeakMap();

function putIcon(host,name,only=false){
  const current=[...host.children].find(child=>child.matches('svg.shiye-icon'));
  if(current?.dataset.shiyeIcon===name)return;
  const svg=createIcon(name);if(!svg)return;
  if(only)host.replaceChildren(svg);
  else{
    current?.remove();
    const firstText=[...host.childNodes].find(node=>node.nodeType===3&&node.textContent.trim());
    if(firstText)firstText.textContent=firstText.textContent.replace(glyphPrefix,'');
    host.prepend(svg);
  }
  host.classList.add('shiye-icon-host');
}

function decorate(node){
  if(node.matches('input[type="search"]')){
    // Leave the actual input node, attributes, focus and handlers intact.
    if(!node.closest('.filters,.swift-series-controls,.series-filter-menus')||node.parentElement.classList.contains('shiye-search'))return;
    const wrapper=node.ownerDocument.createElement('span');wrapper.className='shiye-search';node.before(wrapper);wrapper.append(node);putIcon(wrapper,'search');return;
  }
  if(node.matches('.brand>b')){putIcon(node,'leaf',true);return;}
  if(node.matches('.series-entry-cover,.action-card>.card-image,.work-entry>.card-image')){if(iconOnly.test(node.textContent))putIcon(node,'plus',true);return;}
  if(node.matches('.matching-page .basket>h3')){putIcon(node,'basket');return;}
  if(node.matches('.matching-page .match-panel-head>h3')){putIcon(node,'sparkles');return;}
  if(node.matches('.library-select-toggle')){putIcon(node,'checkCircle');return;}
  if(node.matches('.series-back')){putIcon(node,'back');return;}
  if(node.matches('.library-management-tray>button,.selection-more-menu button,.selection-submenu>button')){
    if(node.matches('.selection-submenu>button')&&['‹ 更多操作','更多操作'].includes(node.textContent.trim())){putIcon(node,'back');return;}
    const name={'全选页面':'checkCircle','全选当前结果':'checkCircle','清空选择':'close','查看所选':'eye','返回筛选':'back','加入搭配':'sparkles','更多操作':'more','删除素材':'trash','删除系列':'trash','删除作品':'trash','删除快照':'trash','恢复所选':'history','彻底删除所选':'trash','加入系列 ›':'layers','重新识别':'sparkles','导出图像 ›':'share','导出素材 ›':'share','导出系列 ›':'share','导出作品 ›':'share','导出快照 ›':'share','设置状态 ›':'status','编辑系列信息':'pen','‹ 更多操作':'back','新建系列…':'plus'}[node.textContent.trim()];if(name)putIcon(node,name);return;
  }
  if(node.matches('.canvas-context-tools>button')){
    if(node.textContent==='☷'){node.setAttribute('aria-label','段落设置');putIcon(node,'history',true);return;}
    if(node.textContent==='Aa'){node.setAttribute('aria-label','文字样式');putIcon(node,'text',true);return;}
    if(node.textContent.startsWith('＋ 添加图形')){putIcon(node,'plus');return;}
  }
  if(node.matches('.settings-icon')){const name=categories[node.closest('[data-val]')?.dataset.val];if(name)putIcon(node,name,true);return;}
  if(node.matches('.batch-check')){const text=node.textContent.trim(),pressed=node.closest('[aria-pressed]')?.getAttribute('aria-pressed');putIcon(node,pressed==='true'||text==='☑'?'checkSquare':'square',true);return;}
  if(node.matches('.basket-card-check')){putIcon(node,'check',true);return;}
  if(node.matches('.card[data-act="series-detail"] h3>span[aria-hidden]')){putIcon(node,'arrowRight',true);return;}
  const heading=node.dataset.filterHeading;
  if(heading){const slot=node.querySelector('i');if(slot){const order=node.getAttribute('aria-label')||node.textContent;putIcon(slot,heading==='类型'?'grid':heading==='状态'?'status':heading==='排序依据'?'sort':order.includes('升序')?'up':'down',true);}return;}
  if(node.dataset.act==='tool'&&tools[node.dataset.val]){const [name,label]=tools[node.dataset.val];if(!node.getAttribute('aria-label'))node.setAttribute('aria-label',label);putIcon(node,name,iconOnly.test(node.textContent)||node.textContent==='Aa');return;}
  const nav={library:'folder',matching:'sparkles',works:'book'}[node.dataset.route];
  if(nav){const slot=node.querySelector('span[aria-hidden]');if(slot)putIcon(slot,nav,true);else putIcon(node,nav);return;}
  if(node.id==='top-basket'){
    if(!node.querySelector('svg[data-shiye-icon="archive"]'))putIcon(node,'archive');
    return;
  }
  if(node.id==='top-settings'){putIcon(node,'settings',true);return;}
  if(node.dataset.act==='select-file'){const name={gallery:'material',camera:'camera',files:'file'}[node.dataset.val];if(name)putIcon(node,name);return;}
  if(node.querySelector('.detail-link-icon svg'))return;
  const label=node.getAttribute('aria-label'),name=labels[label]||actions[node.dataset.act];
  if(name){const only=iconOnly.test(node.textContent);if(only&&!label)node.setAttribute('aria-label',node.title||{'new-project':'新建作品','new-series':'新建系列','new-draft':'新建方案',undo:'撤销',redo:'重做'}[node.dataset.act]||node.dataset.act);putIcon(node,name,only);if(name==='star')node.querySelector('svg.shiye-icon')?.setAttribute('fill',label==='取消必用'?'currentColor':'none');}
}

export function mountIcons(root=globalThis.document){
  if(!root?.querySelectorAll)return()=>{};
  if(mounts.has(root))return mounts.get(root);
  const scan=scope=>{if(scope.nodeType===1&&scope.matches(selector))decorate(scope);scope.querySelectorAll?.(selector).forEach(decorate);};
  scan(root);
  const Observer=root.ownerDocument?.defaultView?.MutationObserver||root.defaultView?.MutationObserver||globalThis.MutationObserver;
  let observer;
  if(Observer){observer=new Observer(records=>{
    const scopes=new Set();
    for(const record of records){const target=record.target.nodeType===1?record.target:record.target.parentElement;if(!target||target.closest('svg.shiye-icon'))continue;scopes.add(target);}
    for(const scope of scopes)scan(scope);
  });observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-pressed','aria-checked','aria-label','data-val','data-route','data-act','data-filter-heading']});}
  const disconnect=()=>{observer?.disconnect();mounts.delete(root);};mounts.set(root,disconnect);return disconnect;
}
