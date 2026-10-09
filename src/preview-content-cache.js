import {cachedImageIdentity,onImageInvalidation} from './presentation-resources.js';

// Only presentation copies belong here, never the mutable editing document.
export class BoundedValueCache {
  constructor({maxEntries=48,maxWeight=8_000_000}={}) {
    if(!Number.isInteger(maxEntries)||maxEntries<1||!Number.isFinite(maxWeight)||maxWeight<1)throw Error('Invalid cache budget');
    this.maxEntries=maxEntries;this.maxWeight=maxWeight;this.weight=0;this.rows=new Map();this.hits=0;this.misses=0;
  }
  get(key,signature) {
    const row=this.rows.get(key);
    if(!row||row.signature!==signature){this.misses++;return undefined;}
    this.rows.delete(key);this.rows.set(key,row);this.hits++;return row.value;
  }
  set(key,signature,value,weight=1) {
    this.delete(key);
    if(!Number.isFinite(weight)||weight<0||weight>this.maxWeight)return value;
    this.rows.set(key,{signature,value,weight});this.weight+=weight;
    while(this.rows.size>this.maxEntries||this.weight>this.maxWeight)this.delete(this.rows.keys().next().value);
    return value;
  }
  delete(key) {const row=this.rows.get(key);if(row){this.weight-=row.weight;this.rows.delete(key);}}
  clear() {this.rows.clear();this.weight=0;}
}
const covers=new BoundedValueCache({maxEntries:60,maxWeight:6_000_000});
let scope=null;
const validRoutes=new Set(['series','library','works','matching','projectPreview']);
const dependencies=new WeakMap();
function signature(node) {
  const copy=node.cloneNode(true),ids=new Set();
  copy.removeAttribute('data-preview-cache-owned');
  for(const image of copy.querySelectorAll('img')){
    const source=image.getAttribute('src')||'',known=cachedImageIdentity(source);
    if(known){ids.add(known.id);image.setAttribute('src',`private:${known.id}@${known.version}:${source}`);}
    else if(source.includes('#shiye-image=')){const id=decodeURIComponent(source.split('#shiye-image=')[1]);ids.add(id);image.setAttribute('src',`private:${id}@unloaded`);}
    for(const name of ['data-private-image-id','data-private-image-loading','data-image-error'])image.removeAttribute(name);
  }
  return {key:copy.outerHTML,ids};
}
export function clearPreviewContentCache(){covers.clear();scope=null;}
export function reusePagePreviews({view,state}) {
  if(!view||!validRoutes.has(state.route))return;
  const account=state.accountId||'browser';
  if(scope!==account){covers.clear();scope=account;}
  for(const fresh of [...view.querySelectorAll('.series-cover,.thumb-inner,.works-grid .thumb-sheet')]){
    const holder=fresh.closest('[data-act="series-detail"],[data-act="open-project"],[data-variant]');
    if(!holder)continue;
    const id=holder.dataset.variant||holder.dataset.id;
    const kind=fresh.matches('.series-cover')?'series':holder.dataset.variant?'variant':'work';
    const {key:content,ids}=signature(fresh);
    const key=JSON.stringify([account,kind,id]);
    const saved=covers.get(key,content);
    if(saved&&!saved.isConnected){
      fresh.replaceWith(saved);saved.dataset.previewCacheOwned='';
    }else{
      fresh.dataset.previewCacheOwned='';dependencies.set(fresh,ids);
      covers.set(key,content,fresh,content.length*2+fresh.querySelectorAll('*').length*256);
    }
  }
}
export const previewCacheStats=()=>({entries:covers.rows.size,weight:covers.weight,hits:covers.hits,misses:covers.misses});
onImageInvalidation(ids=>{
  if(ids===null){clearPreviewContentCache();return;}
  for(const [key,row] of covers.rows)if([...dependencies.get(row.value)||[]].some(id=>ids.has(id)))covers.delete(key);
});
