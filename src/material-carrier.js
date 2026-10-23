// Explicit import setting: separate printed pieces from a pale shared carrier.
// Automatic discovery stays identical when the setting is left enabled.
export function separateSharedCarrier(regions,pixels,pageW,pageH){
  return regions.flatMap(region=>{
    const mask=region.mask;
    if(!mask?.alpha?.length||region.shapeModel||region.seedDensity>=.3)return [region];
    const x0=Math.round(region.x*pageW),y0=Math.round(region.y*pageH),w=mask.width,h=mask.height;
    if(w<8||h<8)return [region];
    const histogram=new Uint32Array(256);let total=0,min=255,max=0;
    const luminance=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;if(mask.alpha[i]<128)continue;
      const at=((y0+y)*pageW+x0+x)*4;
      if(at<0||at+2>=pixels.length)continue;
      const light=Math.round(.2126*pixels[at]+.7152*pixels[at+1]+.0722*pixels[at+2]);
      luminance[i]=light;histogram[light]++;total++;min=Math.min(min,light);max=Math.max(max,light);
    }
    // A shared card can be cream, blue or grey. Compare its lightest pixels
    // with its own ink instead of requiring camera RGB to exceed 205.
    let bright=0;for(let i=Math.max(0,max-20);i<=max;i++)bright+=histogram[i];
    if(total<100||max-min<35||bright/total<.12)return [region];
    let sum=0,between=-1,threshold=180;
    for(let i=0;i<256;i++)sum+=i*histogram[i];
    let lowSum=0,lowCount=0;
    for(let i=0;i<256;i++){
      lowCount+=histogram[i];lowSum+=i*histogram[i];
      if(!lowCount||lowCount===total)continue;
      const difference=lowSum/lowCount-(sum-lowSum)/(total-lowCount);
      const score=lowCount*(total-lowCount)*difference*difference;
      if(score>between){between=score;threshold=i;}
    }
    threshold=Math.min(190,threshold+10);
    const foreground=new Uint8Array(w*h);
    for(let i=0;i<foreground.length;i++)foreground[i]=mask.alpha[i]>=128&&luminance[i]<threshold?1:0;
    const labels=new Int32Array(w*h),components=[],queue=new Int32Array(w*h);
    for(let i=0;i<labels.length;i++){
      if(!foreground[i]||labels[i])continue;
      const id=components.length+1;let head=0,tail=0,sx=0,sy=0;
      queue[tail++]=i;labels[i]=id;
      while(head<tail){const at=queue[head++],x=at%w,y=Math.floor(at/w);sx+=x;sy+=y;
        for(const next of [x>0?at-1:-1,x+1<w?at+1:-1,y>0?at-w:-1,y+1<h?at+w:-1]){
          if(next<0||!foreground[next]||labels[next])continue;labels[next]=id;queue[tail++]=next;
        }
      }
      components.push({id,area:tail,cx:sx/tail,cy:sy/tail});
    }
    const dark=components.reduce((n,c)=>n+c.area,0),major=components.filter(c=>c.area>=Math.max(24,dark*.08));
    if(!major.length)return [region];
    const groups=new Map(major.map(c=>[c.id,[]]));
    for(let i=0;i<labels.length;i++){
      const label=labels[i];if(!label)continue;const component=components[label-1];if(component.area<8)continue;
      const owner=major.find(c=>c.id===label)||major.reduce((best,c)=>
        (c.cx-component.cx)**2+(c.cy-component.cy)**2<(best.cx-component.cx)**2+(best.cy-component.cy)**2?c:best);
      groups.get(owner.id).push(i);
    }
    return major.map(c=>{
      const indices=groups.get(c.id);if(!indices.length)return null;
      let left=w,top=h,right=0,bottom=0;
      for(const i of indices){const x=i%w,y=Math.floor(i/w);left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
      const rw=right-left,rh=bottom-top,alpha=new Uint8Array(rw*rh);
      for(const i of indices)alpha[(Math.floor(i/w)-top)*rw+i%w-left]=mask.alpha[i];
      // Pixel thresholding can make pinholes inside a ball or printed body.
      // Restore only pixels surrounded by the same printed component.
      const repaired=new Uint8Array(alpha);
      for(let yy=1;yy<rh-1;yy++)for(let xx=1;xx<rw-1;xx++){
        const at=yy*rw+xx;if(alpha[at])continue;
        let neighbours=0;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(alpha[at+dy*rw+dx])neighbours++;
        if(neighbours>=6)repaired[at]=mask.alpha[(top+yy)*w+left+xx];
      }
      return {...region,x:(x0+left)/pageW,y:(y0+top)/pageH,w:rw/pageW,h:rh/pageH,
        orientedBox:null,shapeModel:null,carrierMode:'separate',pixels:indices.length,
        mask:{width:rw,height:rh,alpha:repaired,polygons:[],topologyPreserved:true}};
    }).filter(Boolean);
  });
}
