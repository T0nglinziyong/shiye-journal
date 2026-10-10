// Conservative last-resort discovery when the ordinary A4 foreground model
// returns NO boxes. Uses strong chromatic separation from paper border; does
// not invent an all-page material, does not alter the usual recognition flow.
// The confirmed manual box editor remains authoritative.
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const median=a=>{a.sort((x,y)=>x-y);return a[a.length>>1]||0;};

export function colorFallbackEvidence(pixels,w,h){
 if(!pixels||w<40||h<40||pixels.length!==w*h*4)return null;
 const samples=[[],[],[]],sx=Math.max(2,Math.floor(w/36)),sy=Math.max(2,Math.floor(h/36));
 for(let y=0;y<h;y+=sy)for(let x=0;x<w;x+=sx){
   if(x>w*.065&&x<w*.935&&y>h*.065&&y<h*.935)continue;
   const at=(y*w+x)*4;
   if(pixels[at+3]<240)continue;
   for(let c=0;c<3;c++)samples[c].push(pixels[at+c]);
 }
 if(samples[0].length<12)return null;
 const paper=samples.map(median),paperL=paper[0]*.2126+paper[1]*.7152+paper[2]*.0722;
 const mask=new Uint8Array(w*h),margin=Math.max(4,Math.round(Math.min(w,h)*.018));
 let count=0;
 for(let y=margin;y<h-margin;y++)for(let x=margin;x<w-margin;x++){
   const i=y*w+x,k=i*4,r=pixels[k],g=pixels[k+1],b=pixels[k+2];
   if(pixels[k+3]<180)continue;
   const dr=(r-g)-(paper[0]-paper[1]),db=(g-b)-(paper[1]-paper[2]);
   const chroma=Math.hypot(dr,db);
   const deltaL=Math.abs(r*.2126+g*.7152+b*.0722-paperL);
   // Reject neutral shadows while keeping strongly coloured blue/green/photo
   // regions against a slightly tinted or shadowed A4 board.
   if(chroma>=19||(chroma>=13&&deltaL>=18)){
     mask[i]=1;count++;
   }
 }
 const fraction=count/(w*h);
 if(count<Math.max(32,w*h*.0015)||fraction>.43)return null;
 return {mask,foregroundSeeds:mask,evidence:mask,count,backgroundRGB:paper,
   fraction:clamp(fraction,0,1)};
}
