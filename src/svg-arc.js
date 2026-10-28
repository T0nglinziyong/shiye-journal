// SVG endpoint-to-center conversion, shared by paint, physical clipping and
// direct editing. https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes
export function svgArcCenter(a,b,rx,ry,angle,large,sweep){
 rx=Math.abs(rx);ry=Math.abs(ry);
 if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-12)return {kind:'point'};
 if(rx<1e-12||ry<1e-12)return {kind:'line'};
 const phi=angle*Math.PI/180,c=Math.cos(phi),s=Math.sin(phi),dx=(a[0]-b[0])/2,dy=(a[1]-b[1])/2,x=c*dx+s*dy,y=-s*dx+c*dy;
 const expand=Math.sqrt(Math.max(1,x*x/(rx*rx)+y*y/(ry*ry)));rx*=expand;ry*=expand;
 const denom=rx*rx*y*y+ry*ry*x*x,k=(large===sweep?-1:1)*Math.sqrt(Math.max(0,(rx*rx*ry*ry-denom)/denom));
 const xp=k*rx*y/ry,yp=-k*ry*x/rx,cx=c*xp-s*yp+(a[0]+b[0])/2,cy=s*xp+c*yp+(a[1]+b[1])/2;
 const u=[(x-xp)/rx,(y-yp)/ry],v=[(-x-xp)/rx,(-y-yp)/ry],start=Math.atan2(u[1],u[0]);let delta=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);
 if(!sweep&&delta>0)delta-=2*Math.PI;if(sweep&&delta<0)delta+=2*Math.PI;
 return {kind:'arc',rx,ry,c,s,cx,cy,start,delta};
}
export const svgArcPoint=(a,t)=>[a.cx+a.c*a.rx*Math.cos(t)-a.s*a.ry*Math.sin(t),a.cy+a.s*a.rx*Math.cos(t)+a.c*a.ry*Math.sin(t)];
export const svgArcDerivative=(a,t)=>[-a.c*a.rx*Math.sin(t)-a.s*a.ry*Math.cos(t),-a.s*a.rx*Math.sin(t)+a.c*a.ry*Math.cos(t)];
