// Geometry-only sanity check; the rule knows nothing about the photo's
// contents (no "blue", "crab", or per-image tuned coordinates).
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const intersects=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<-1e-8&&
  cross(c,d,a)*cross(c,d,b)<-1e-8;
export function physicalPolygonQuality(points,w=900,h=636){
 if(!Array.isArray(points)||points.length<3)
   return {crossings:0,sharpIndentations:0,invalid:true};
 const p=points.map(([x,y])=>[x*w,y*h]),n=p.length;
 let signed=0;
 for(let i=0;i<n;i++){
   const a=p[i],b=p[(i+1)%n];
   signed+=a[0]*b[1]-b[0]*a[1];
 }
 let crossings=0,sharpIndentations=0;
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
   if(j===i+1||(i===0&&j===n-1))continue;
   if(intersects(p[i],p[(i+1)%n],p[j],p[(j+1)%n]))crossings++;
 }
 const sign=Math.sign(signed);
 for(let i=0;i<n;i++){
   const prev=p[(i+n-1)%n],at=p[i],next=p[(i+1)%n],
     first=[at[0]-prev[0],at[1]-prev[1]],
     second=[next[0]-at[0],next[1]-at[1]],
     a=Math.hypot(...first),b=Math.hypot(...second);
   if(a<1||b<1||sign*(first[0]*second[1]-first[1]*second[0])>=0)continue;
   const dot=((-first[0])*second[0]+(-first[1])*second[1])/(a*b),
     angle=Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
   // A 30-50° inward spike supported by two long straight segments is
   // characteristic of a Canny line tracing printing INSIDE the material.
   // Small fabric zigzags remain unmodified.
   if(angle<60&&Math.min(a,b)>Math.min(w,h)*.045)sharpIndentations++;
 }
 return {crossings,sharpIndentations,invalid:Math.abs(signed)<1e-7};
}
export function shouldRepairPhysicalPolygon(box,quality,solidity){
 if(box?.boundarySource!=='irregular-closed'||!quality||quality.invalid)
   return false;
 return quality.crossings>0||
   quality.sharpIndentations>=1&&solidity<.80&&
   Array.isArray(box.physicalBoundary)&&box.physicalBoundary.length<=20;
}
