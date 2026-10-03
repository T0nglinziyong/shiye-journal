import {cachedImageIdentity,onImageInvalidation} from './presentation-resources.js';
// Decoded nodes survive route changes; bounded by both count and pixel area.
// Cover-cache-owned subtrees stay intact instead of donating their image nodes.
export class ImageNodeCache {
  constructor(maxNodes=96,maxPixels=8_000_000) {
    this.nodes=new Map();this.maxNodes=maxNodes;this.maxPixels=maxPixels;this.pixels=0;this.weights=new WeakMap();this.identities=new WeakMap();
    this.unsubscribe=onImageInvalidation(ids=>this.invalidate(ids));
  }
  remember(images) {
    for(const img of images){
      if(!img.complete||!img.naturalWidth||img.closest?.('[data-preview-cache-owned]'))continue;
      const key=img.getAttribute('src')+'\n'+img.alt,list=this.nodes.get(key)||[];
      if(list.includes(img))continue;
      const weight=img.naturalWidth*img.naturalHeight;
      list.push(img);this.nodes.delete(key);this.nodes.set(key,list);this.weights.set(img,weight);this.identities.set(img,cachedImageIdentity(img.getAttribute('src'))?.id);this.pixels+=weight;
    }
    this.trim();
  }
  trim() {
    let count=[...this.nodes.values()].reduce((n,list)=>n+list.length,0);
    while(this.nodes.size&&(count>this.maxNodes||this.pixels>this.maxPixels)){
      const [key,list]=this.nodes.entries().next().value,img=list.shift();
      this.pixels-=this.weights.get(img)||0;count--;if(!list.length)this.nodes.delete(key);
    }
  }
  take(fresh) {
    const key=fresh.getAttribute('src')+'\n'+fresh.alt,list=this.nodes.get(key);if(!list)return null;
    const img=list.shift();this.pixels-=this.weights.get(img)||0;if(!list.length)this.nodes.delete(key);
    for(const attr of [...img.attributes])if(!fresh.hasAttribute(attr.name))img.removeAttribute(attr.name);
    for(const attr of fresh.attributes)if(img.getAttribute(attr.name)!==attr.value)img.setAttribute(attr.name,attr.value);
    return img;
  }
  invalidate(ids=null) {
    if(ids===null){this.clear();return;}
    const affected=new Set(ids);
    for(const [key,list] of this.nodes){const keep=list.filter(img=>{
      if(!affected.has(this.identities.get(img)))return true;
      this.pixels-=this.weights.get(img)||0;return false;
    });if(keep.length)this.nodes.set(key,keep);else this.nodes.delete(key);}
  }
  clear(){this.nodes.clear();this.pixels=0;}
  dispose(){this.unsubscribe();this.clear();}
}
