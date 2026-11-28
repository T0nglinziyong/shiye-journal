'use strict';
// Small deterministic affine/anchor kernel. No Scene I/O, layout graph, font
// measuring, crop ledger, renderer, or hierarchy migration is implemented here.
// All geometry and matrix translations in this kernel are in millimetres.
// The adapter converts native Scene units at the read/write boundary only.
// Do not pass Scene-unit values under a public unit="mm" label.
const IDENTITY=Object.freeze([1,0,0,1,0,0]);
function vector(v,n,name){if(!Array.isArray(v)||v.length!==n||!v.every(Number.isFinite))throw new TypeError(name+' must contain '+n+' finite numbers');return v;}
function matrix(m){return vector(m,6,'matrix');}
function multiply(a,b){matrix(a);matrix(b);return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function inverse(m){matrix(m);const d=m[0]*m[3]-m[1]*m[2];const s=Math.max(Math.abs(m[0]),Math.abs(m[1]),Math.abs(m[2]),Math.abs(m[3]));if(s===0||Math.abs(d)<=1e-12*s*s)throw Object.assign(new Error('Non-invertible or ill-conditioned transform'),{code:'NON_INVERTIBLE_TRANSFORM'});return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];}
function point(m,p){matrix(m);vector(p,2,'point');return [m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];}
function direction(m,p){matrix(m);vector(p,2,'vector');return [m[0]*p[0]+m[2]*p[1],m[1]*p[0]+m[3]*p[1]];}
const ANCHORS=Object.freeze({'top-left':[0,0],'top-center':[.5,0],'top-right':[1,0],'middle-left':[0,.5],center:[.5,.5],'middle-right':[1,.5],'bottom-left':[0,1],'bottom-center':[.5,1],'bottom-right':[1,1]});
function box(b){vector(b,4,'box');if(b[2]<=0||b[3]<=0)throw new RangeError('box width and height must be positive');return b;}
function anchor(b,a='center'){box(b);const u=ANCHORS[a];if(!u)throw new RangeError('Unknown anchor: '+a);return [b[0]+u[0]*b[2],b[1]+u[1]*b[3]];}
function reparent(world,parentWorld){return multiply(inverse(parentWorld),world);}
function worldBounds(b,m){box(b);matrix(m);const ps=[[b[0],b[1]],[b[0]+b[2],b[1]],[b[0],b[1]+b[3]],[b[0]+b[2],b[1]+b[3]]].map(p=>point(m,p));const xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]);const x=Math.min(...xs),y=Math.min(...ys);return [x,y,Math.max(...xs)-x,Math.max(...ys)-y];}
function resolvePlacement({place,referenceBox,referenceToWorld=IDENTITY,parentToWorld=IDENTITY,targetBox,targetLinear=[1,0,0,1]}){
 box(referenceBox);box(targetBox);matrix(referenceToWorld);matrix(parentToWorld);vector(targetLinear,4,'targetLinear');
 // Caller must resolve axes=page/reference and visible/layout boxes first.
 // This function intentionally does not guess a node's visual geometry.
 let q;
 if(Object.hasOwn(place,'at')){
  if(Object.hasOwn(place,'referenceAnchor'))throw new TypeError('at and referenceAnchor are mutually exclusive');
  vector(place.at,2,'at');if(!['mm','ratio'].includes(place.unit))throw new TypeError('unit must be mm or ratio');
  const k=place.unit==='ratio'?[referenceBox[2],referenceBox[3]]:[1,1];q=[referenceBox[0]+place.at[0]*k[0],referenceBox[1]+place.at[1]*k[1]];
 }else {if(!place.referenceAnchor||Object.hasOwn(place,'unit'))throw new TypeError('anchor branch needs referenceAnchor and no unit');q=anchor(referenceBox,place.referenceAnchor);}
 let desired=point(referenceToWorld,q);
 if(place.offset){
  const o=place.offset;vector(o.value,2,'offset.value');if(!['mm','ratio'].includes(o.unit))throw new TypeError('offset.unit must be mm or ratio');
  const space=o.space||'reference';if(!['reference','page','parent'].includes(space))throw new TypeError('offset.space invalid');
  // Ratio offsets always use referenceBox dimensions, regardless of vector axes.
  const s=o.unit==='ratio'?[referenceBox[2],referenceBox[3]]:[1,1];const d=[o.value[0]*s[0],o.value[1]*s[1]];
  const world=direction(space==='page'?IDENTITY:space==='parent'?parentToWorld:referenceToWorld,d);desired=[desired[0]+world[0],desired[1]+world[1]];
 }
 const parentPoint=point(inverse(parentToWorld),desired),a=anchor(targetBox,place.anchor||'center');
 const [aa,b,c,d]=targetLinear;return [aa,b,c,d,parentPoint[0]-aa*a[0]-c*a[1],parentPoint[1]-b*a[0]-d*a[1]];
}
module.exports={IDENTITY,multiply,inverse,point,direction,anchor,reparent,worldBounds,resolvePlacement};
