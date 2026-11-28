// Decoded nodes survive route changes; bounded by both count and pixel area.
// Only detached nodes are retained, never private image bytes in storage.
export class ImageNodeCache{
  constructor(maxNodes=180,maxPixels=18_000_000){this.nodes=new Map();this.maxNodes=maxNodes;this.maxPixels=maxPixels;this.pixels=0;}
  remember(images){for(const img of images){if(img.closest?.('[data-preview-cache-owned]')||!img.complete||!img.naturalWidth)continue;const key=img.getAttribute('src')+'\n'+img.alt,list=this.nodes.get(key)||[];if(list.includes(img))continue;list.push(img);this.nodes.delete(key);this.nodes.set(key,list);this.pixels+=img.naturalWidth*img.naturalHeight;}this.trim();}
  trim(){let count=[...this.nodes.values()].reduce((n,list)=>n+list.length,0);while(this.nodes.size&&(count>this.maxNodes||this.pixels>this.maxPixels)){const [key,list]=this.nodes.entries().next().value,img=list.shift();this.pixels-=img.naturalWidth*img.naturalHeight;count--;if(!list.length)this.nodes.delete(key);}}
  take(fresh){if(fresh.closest?.('[data-preview-cache-owned]'))return null;const key=fresh.getAttribute('src')+'\n'+fresh.alt,list=this.nodes.get(key);if(!list)return null;const img=list.shift();this.pixels-=img.naturalWidth*img.naturalHeight;if(!list.length)this.nodes.delete(key);for(const attr of [...img.attributes])if(!fresh.hasAttribute(attr.name))img.removeAttribute(attr.name);for(const attr of fresh.attributes)img.setAttribute(attr.name,attr.value);return img;}
  dispose(){this.nodes.clear();this.pixels=0;}
}
