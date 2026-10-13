const pages=new Map();
export function pageSize(value){const size=Number(value);return [20,40,80].includes(size)?size:0;}
export function pageSlice(total,size,page){
  const count=size?Math.max(1,Math.ceil(total/size)):1;
  const current=Math.min(count,Math.max(1,Math.trunc(Number(page)||1)));
  return {current,count,start:size?(current-1)*size:0,end:size?current*size:total};
}
export function applyCatalogPage({view,key,cards,matched,countNode,size}){
  const visible=cards.filter(matched),total=visible.length,limit=pageSize(size),state=pages.get(key)||{current:1};
  const range=pageSlice(total,limit,state.current);state.current=range.current;pages.set(key,state);
  const shown=new Set(visible.slice(range.start,range.end));
  for(const card of cards)card.hidden=!shown.has(card);
  if(countNode){countNode.textContent=total+' 项';countNode.classList.add('catalog-total');}
  let controls=view.querySelector('.catalog-page-controls[data-page-key="'+key+'"]');
  if(!controls){const bar=view.querySelector('.series-filter-menus .four-filter-controls,.swift-series-controls .four-filter-controls,.filters .four-filter-controls');if(bar){controls=document.createElement('div');controls.className='catalog-page-controls';controls.dataset.pageKey=key;controls.innerHTML='<input type="number" min="1" aria-label="输入页码"><button type="button" aria-label="上一页">‹</button><button type="button" aria-label="下一页">›</button>';bar.append(controls);}}
  if(controls){if(countNode&&controls.parentElement&&countNode.parentElement!==controls.parentElement)controls.after(countNode);else if(countNode&&countNode.previousElementSibling!==controls)controls.after(countNode);const [input,previous,next]=controls.children;controls.dataset.disabled=String(!limit);input.value=String(range.current);input.max=String(range.count);input.disabled=!limit;previous.disabled=!limit||range.current===1;next.disabled=!limit||range.current===range.count;const change=n=>{state.current=n;applyCatalogPage({view,key,cards,matched,countNode,size});};input.onchange=()=>change(Number(input.value));previous.onclick=()=>change(state.current-1);next.onclick=()=>change(state.current+1);}
  return {total,...range};
}
export function resetCatalogPage(key){if(pages.has(key))pages.get(key).current=1;}
export function catalogDataPage(key,total,size){
  const state=pages.get(key)||{current:1};
  const range=pageSlice(total,pageSize(size)||40,state.current);
  state.current=range.current;pages.set(key,state);
  return range;
}
export function setCatalogDataPage(key,page){
  const state=pages.get(key)||{current:1};state.current=page;pages.set(key,state);
}
