import {writeFile} from 'node:fs/promises';
// An original periodic height field, not a scan or a third-party texture.
// Keep the fixed tile embedded so Node and browsers use identical pixels.
const size=128;let state=1729;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
const grids=[4,12,32,64,96].map(n=>({n,values:Float32Array.from({length:n*n},()=>rand()*2-1)}));
function noise(grid,x,y){const{n,values}=grid,fx=((x/size*n)%n+n)%n,fy=((y/size*n)%n+n)%n,ix=Math.floor(fx),iy=Math.floor(fy),smooth=t=>t*t*(3-2*t),u=smooth(fx-ix),v=smooth(fy-iy),at=(a,b)=>values[(b%n)*n+a%n];return (at(ix,iy)*(1-u)+at(ix+1,iy)*u)*(1-v)+(at(ix,iy+1)*(1-u)+at(ix+1,iy+1)*u)*v;}
function height(x,y){return grids.reduce((s,g,i)=>s+noise(g,x,y)*[.16,.28,.32,.20,.08][i],0);}
const groups=new Map();
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const relief=height(x-1,y-1)-height(x+1,y+1),shade=relief*.4+height(x,y)*.6+(rand()-.5)*.32;
 const light=shade>0,level=Math.min(14,Math.round(Math.abs(shade)*165/8));if(!level)continue;const key=(light?'light':'dark')+level;let group=groups.get(key);if(!group){group={color:light?'#ffffff':'#202020',opacity:level*8/255,paths:[]};groups.set(key,group);}group.paths.push(`M${x} ${y}h1v1h-1Z`);
}
const vector=[...groups.values()].map(g=>`<path fill="${g.color}" opacity="${g.opacity.toFixed(4)}" d="${g.paths.join('')}"/>`).join('');
await writeFile(new URL('../src/paper-noise-tile.js',import.meta.url),'// Fixed procedural paper tooth; regenerate with scripts/generate-paper-noise-tile.mjs.\nexport const paperNoiseTileSize=128;\nexport const paperNoiseTile='+JSON.stringify(vector)+';\n');
