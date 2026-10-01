import {openPopover,closePopover} from './swift-popover.js';
// The order control changes immediately; only the other values open menus.
export function mountFilterControl(select,bar,heading,glyph,{toggle=false}={}){
  select.hidden=true;
  const b=document.createElement('button');b.type='button';b.className='filter-control';b.dataset.filterHeading=heading;
  b.innerHTML='<i aria-hidden="true">'+glyph+'</i><span></span>';
  // Reserve the longest choice using the same font as the visible label.
  // An invisible grid cell participates in layout, so font/viewport changes
  // remain responsive without resizing the button when its value changes.
  const reserve=document.createElement('span');reserve.className='filter-width-reserve';reserve.setAttribute('aria-hidden','true');
  reserve.textContent=[...select.options].map(o=>o.textContent).sort((a,b)=>b.length-a.length)[0]||'';b.append(reserve);
  if(!toggle)b.setAttribute('aria-haspopup','menu');
  const sync=()=>{const value=select.options[select.selectedIndex]?.textContent||'';b.querySelector('span').textContent=value;b.title=heading+'：'+value;b.setAttribute('aria-label',toggle?b.title+'，点击切换':b.title);if(toggle)b.querySelector('i').textContent=select.value==='asc'?'↑':'↓';};
  sync();select.addEventListener('change',sync);
  b.onclick=()=>{
    if(toggle){select.value=select.value==='asc'?'desc':'asc';select.dispatchEvent(new Event('change',{bubbles:true}));return;}
    if(b.getAttribute('aria-expanded')==='true'){closePopover();return;}
    const {content,close,surface}=openPopover(b,{width:250,menu:true});surface.classList.add('library-filter-menu');
    for(const option of select.options){const choice=document.createElement('button');choice.type='button';choice.setAttribute('role','menuitemradio');choice.setAttribute('aria-checked',String(option.value===select.value));choice.textContent=option.textContent;choice.onclick=()=>{close(true);select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));};content.append(choice);}
  };
  bar.append(b);return b;
}
export function mountFourFilters(c){
  const {state,view,body,modal}=c;let container,type,status,sort,order,basis;
  if(state.route==='library'&&view.querySelector('.series-contents')){container=view.querySelector('.series-filter-menus');type=view.querySelector('#series-kind');status=view.querySelector('#series-status');basis=view.querySelector('#series-sort');const toggle=view.querySelector('#series-order');order=document.createElement('select');order.innerHTML='<option value="desc">降序</option><option value="asc">升序</option>';order.value=toggle.textContent.includes('升序')?'asc':'desc';order.onchange=()=>{if((order.value==='asc')!==toggle.textContent.includes('升序'))toggle.click();};toggle.hidden=true;container.append(order);}
  else if(state.route==='library'){container=view.querySelector('.filters');type=view.querySelector('#kind-filter');status=view.querySelector('#status-filter');sort=view.querySelector('#sort-filter');view.querySelector('#series-filter')?.remove();}
  else if(state.route==='works'){container=view.querySelector('.filters');type=view.querySelector('#work-kind');status=view.querySelector('#work-status');sort=view.querySelector('#work-sort');}
  else return;if(!container||!type||!status)return;
  if(sort){basis=document.createElement('select');order=document.createElement('select');const work=state.route==='works';basis.innerHTML=(work?[['access','最近访问'],['updated','最近修改'],['name','名称']]:[['time','最近添加'],['name','名称']]).map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('');order.innerHTML='<option value="desc">降序</option><option value="asc">升序</option>';basis.id=work?'work-sort-basis':'sort-basis';order.id=work?'work-sort-order':'sort-order';basis.value=work?sort.value.split('-')[0]:sort.value.startsWith('name')?'name':'time';order.value=sort.value.endsWith('asc')||sort.value==='name'||sort.value==='oldest'?'asc':'desc';
    const update=()=>{sort.value=work?basis.value+'-'+order.value:basis.value==='name'?order.value==='asc'?'name':'name-desc':order.value==='asc'?'oldest':'newest';sort.dispatchEvent(new Event('change',{bubbles:true}));};basis.onchange=order.onchange=update;sort.hidden=true;container.append(basis,order);}
  const bar=document.createElement('div');bar.className='four-filter-controls';container.append(bar);
  for(const [heading,select,glyph] of [['类型',type,'▦'],['状态',status,'☷'],['排序依据',basis,'≡'],['排序顺序',order,'↕']])mountFilterControl(select,bar,heading,glyph,{toggle:heading==='排序顺序'});
}
