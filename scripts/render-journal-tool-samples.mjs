import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadOfflineCanvas} from '../src/offline-node-preview.mjs';
import {journalBundledFonts} from '../src/journal-font-catalog.js';
import {journalFontFamily} from '../src/journal-fonts.js';
import {tearRegionGeometry} from '../src/creation-tear.js';
import {geometryDifference,rectangleGeometry} from '../src/craft-topology.js';
const output=resolve(process.argv[2]||'test-results/journal-tools');await mkdir(output,{recursive:true});
const {createCanvas}=await loadOfflineCanvas(),offset=(journalBundledFonts.length-4)*168,canvas=createCanvas(1400,1450+offset),ctx=canvas.getContext('2d');
ctx.fillStyle='#f6f5ed';ctx.fillRect(0,0,1400,1450+offset);ctx.fillStyle='#34463b';ctx.font='bold 38px sans-serif';ctx.fillText('拾页 · 手写字体与轨迹撕纸',65,70);
for(const [i,font] of journalBundledFonts.entries()){
 const y=120+i*168;ctx.fillStyle='#fffef9';ctx.fillRect(45,y,1310,148);
 ctx.fillStyle='#69716a';ctx.font='21px sans-serif';ctx.fillText(font.label,65,y+32);
 ctx.font='44px '+journalFontFamily({fontName:font.family});ctx.fillStyle='#34463b';ctx.fillText('留住今天的小片刻  春日手帐',65,y+92);
 ctx.font='30px '+journalFontFamily({fontName:font.family});ctx.fillText('Journal · 2026',760,y+92);
}
ctx.font='bold 30px sans-serif';ctx.fillStyle='#34463b';ctx.fillText('同一轨迹 · 可调整撕口起伏与疏密',65,850+offset);
const path={points:[[0,.35],[.25,.46],[.55,.3],[.8,.48],[1,.4]],unit:'ratio'};
function draw(geometry,x,y,scale,color){
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.beginPath();
 for(const polygon of geometry)for(const ring of polygon){ring.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();}
 ctx.fillStyle=color;ctx.fill('evenodd');ctx.clip('evenodd');
 ctx.strokeStyle='#66746444';ctx.lineWidth=.25;for(let y=8;y<80;y+=8){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(100,y);ctx.stroke();}ctx.restore();
}
for(const [i,depth] of [.25,.7,1.3].entries()){
 const x=65+i*450,geometry=tearRegionGeometry(path,{width:100,height:80,keep:'left',depthMm:depth,periodMm:3,seed:42});
 draw(geometryDifference(rectangleGeometry(0,0,100,80),geometry),x,900+offset,4,'#e6c99c');
 draw(geometry,x,925+offset,4,'#abc4af');ctx.font='21px sans-serif';ctx.fillStyle='#34463b';ctx.fillText(`起伏 ${depth} mm · 间距 3 mm`,x,1290+offset);
}
ctx.font='20px sans-serif';ctx.fillStyle='#69716a';ctx.fillText('上、下两片共用撕口；只为展示移开间距，裁片总面积保持不变。',65,1380+offset);
await writeFile(resolve(output,'字体与轨迹撕纸.png'),canvas.toBuffer('image/png'));console.log(output);
