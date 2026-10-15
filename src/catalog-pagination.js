const pages=new Map();
export function pageSize(value){const size=Number(value);return [20,40,80].includes(size)?size:0;}
export function pageSlice(total,size,page){
  const count=size?Math.max(1,Math.ceil(total/size)):1;
  const current=Math.min(count,Math.max(1,Math.trunc(Number(page)||1)));
  return {current,count,start:size?(current-1)*size:0,end:size?current*size:total};
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
