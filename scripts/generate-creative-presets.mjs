// Original, deterministic raster supplies. Run with `node scripts/generate-creative-presets.mjs`.
import {createCanvas} from 'canvas';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {creativePresetAssets} from '../src/creative-presets.js';

const root=join(dirname(fileURLToPath(import.meta.url)),'../public/creative-presets');
await mkdir(root,{recursive:true});
const circle=(ctx,x,y,r)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);};
const line=(ctx,points)=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));};
const star=(ctx,cx,cy,r,inner=.48,points=5)=>{ctx.beginPath();for(let i=0;i<points*2;i++){
  const a=-Math.PI/2+i*Math.PI/points,rad=i%2?r*inner:r,x=cx+Math.cos(a)*rad,y=cy+Math.sin(a)*rad;
  i?ctx.lineTo(x,y):ctx.moveTo(x,y);
}ctx.closePath();};
const tapeOutline=(ctx,w,h)=>{ctx.beginPath();ctx.moveTo(0,1);for(let x=0;x<=w;x+=2)ctx.lineTo(x,0.6+Math.sin(x*2.7)*.42);
  ctx.lineTo(w,h-1);for(let x=w;x>=0;x-=2)ctx.lineTo(x,h-.6+Math.sin(x*2.3)*.42);ctx.closePath();};
function tape(ctx,kind){
  const w=60,h=12;tapeOutline(ctx,w,h);ctx.fillStyle={
    'sage-check-tape':'rgba(174,190,160,.80)','blue-rule-tape':'rgba(174,198,210,.78)',
    'coral-dot-tape':'rgba(227,178,164,.82)'}[kind];ctx.fill();ctx.save();ctx.clip();
  ctx.globalAlpha=.55;ctx.fillStyle='#fffaf1';ctx.fillRect(0,1.3,w,1.2);ctx.fillRect(0,h-2.5,w,.7);ctx.globalAlpha=1;
  for(let x=0;x<w;x+=20){
    if(kind==='sage-check-tape'){
      ctx.strokeStyle='rgba(70,100,77,.60)';ctx.lineWidth=.28;
      for(let i=2;i<20;i+=4){line(ctx,[[x+i,0],[x+i,h]]);ctx.stroke();}
      for(let y=2.5;y<h;y+=3.8){line(ctx,[[x,y],[x+20,y]]);ctx.stroke();}
      ctx.strokeStyle='rgba(255,255,247,.85)';ctx.lineWidth=.45;
      for(let i=3;i<20;i+=8){line(ctx,[[x+i,0],[x+i,h]]);ctx.stroke();}
    }else if(kind==='blue-rule-tape'){
      ctx.strokeStyle='rgba(54,100,129,.64)';ctx.lineWidth=.36;
      for(let y=2.6;y<h;y+=3.2){line(ctx,[[x,y],[x+20,y]]);ctx.stroke();}
      ctx.strokeStyle='rgba(255,255,249,.92)';ctx.lineWidth=.65;
      line(ctx,[[x,5.7],[x+20,5.7]]);ctx.stroke();
      ctx.fillStyle='rgba(49,88,116,.62)';for(let i=2;i<20;i+=5){circle(ctx,x+i,1.5,.28);ctx.fill();}
    }else{
      ctx.fillStyle='rgba(141,65,68,.67)';for(let i=2;i<20;i+=4.7){
        for(const y of [3.5,8]){circle(ctx,x+i+(y===8?2.2:0),y,.75+(i%3)*.08);ctx.fill();}
      }
      ctx.strokeStyle='rgba(251,244,224,.85)';ctx.lineWidth=.24;
      line(ctx,[[x,6],[x+20,6]]);ctx.stroke();
    }
  }
  ctx.restore();
}
function leaf(ctx){
  ctx.translate(15.5,19);ctx.rotate(-.17);ctx.translate(-15.5,-19);
  ctx.strokeStyle='#fffdf5';ctx.lineWidth=2.3;ctx.lineCap='round';
  const stem=()=>{ctx.beginPath();ctx.moveTo(11,34);ctx.bezierCurveTo(13,23,17,14,20,4);};
  stem();ctx.stroke();ctx.strokeStyle='#53715b';ctx.lineWidth=.7;stem();ctx.stroke();
  for(const [x,y,rot,rx,ry] of [[15,27,-.75,5,2.6],[18,21,.65,5.4,2.8],[16,15,-.8,5,2.3],[21,10,.6,4.5,2.4],[20,5,-.1,3.6,2.1]]){
    ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);
    ctx.fillStyle='#fffdf5';ctx.strokeStyle='#fffdf5';ctx.lineWidth=1.3;ctx.fill();ctx.stroke();
    ctx.fillStyle=y<15?'#7b9b74':'#8da47a';ctx.fill();ctx.strokeStyle='#55745e';ctx.lineWidth=.27;ctx.stroke();ctx.restore();
  }
  for(const [x,y,r] of [[7,10,.45],[25,24,.34],[8,27,.30]]){circle(ctx,x,y,r);ctx.fillStyle='#be986e';ctx.fill();}
}
function butterfly(ctx){
  ctx.translate(18.5,14);ctx.strokeStyle='#fffdf6';ctx.lineWidth=2.2;
  const wing=(s)=>{ctx.beginPath();ctx.moveTo(0,-2);ctx.bezierCurveTo(s*5,-13,s*17,-13,s*16,-3);
    ctx.bezierCurveTo(s*17,2,s*8,5,s*2,3);ctx.bezierCurveTo(s*13,3,s*12,13,s*5,11);
    ctx.bezierCurveTo(s*2,10,s*1,5,0,3);ctx.closePath();};
  for(const s of [-1,1]){wing(s);ctx.fillStyle='#fffdf6';ctx.fill();ctx.stroke();wing(s);
    ctx.fillStyle='#9caec4';ctx.fill();ctx.strokeStyle='#5f7598';ctx.lineWidth=.35;ctx.stroke();
    for(const [x,y] of [[7,-6],[11,-1],[6,7]]){circle(ctx,s*x,y,.55);ctx.fillStyle='#d8d5e2';ctx.fill();}
  }
  ctx.strokeStyle='#536784';ctx.lineWidth=.75;ctx.lineCap='round';line(ctx,[[0,-4],[0,8]]);ctx.stroke();
  line(ctx,[[0,-4],[-3,-9]]);ctx.stroke();line(ctx,[[0,-4],[3,-9]]);ctx.stroke();
}
function paperStar(ctx){
  ctx.translate(15.5,15.5);ctx.rotate(-.12);ctx.translate(-15.5,-15.5);
  ctx.lineJoin='round';star(ctx,15.5,15.5,11.7,.56,5);ctx.fillStyle='#fffdf8';ctx.strokeStyle='#fffdf8';ctx.lineWidth=3.8;ctx.fill();ctx.stroke();
  star(ctx,15.5,15.5,10.6,.56,5);ctx.fillStyle='#eedba1';ctx.strokeStyle='#bfaa77';ctx.lineWidth=.55;ctx.fill();ctx.stroke();
  star(ctx,15.5,15.5,6,.55,5);ctx.strokeStyle='#fff8da';ctx.lineWidth=.45;ctx.stroke();
  for(const [x,y,r] of [[2.6,5.5,.8],[26,7,.9],[5,27,.7],[26,24,.6]]){star(ctx,x,y,r,.28,4);ctx.fillStyle='#b79d6d';ctx.fill();}
}
function dayPostmark(ctx){
  const x=16,y=16;ctx.strokeStyle='#a35e58';ctx.fillStyle='#a35e58';ctx.lineWidth=.9;
  circle(ctx,x,y,12.5);ctx.stroke();circle(ctx,x,y,10.7);ctx.lineWidth=.4;ctx.stroke();
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 4.7px serif';ctx.fillText('TODAY',x,12.8);
  ctx.font='3px sans-serif';ctx.fillText('DAILY NOTES',x,20.5);
  for(const dx of [-7.4,7.4]){star(ctx,x+dx,y,.9,.38,4);ctx.fill();}
  ctx.lineWidth=.4;line(ctx,[[10.2,16.1],[21.8,16.1]]);ctx.stroke();
}
function archiveMark(ctx){
  ctx.strokeStyle='#556c80';ctx.fillStyle='#556c80';ctx.lineWidth=.75;ctx.strokeRect(1.4,1.4,38.2,21.2);
  ctx.lineWidth=.28;ctx.strokeRect(2.7,2.7,35.6,18.6);ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold 7.2px serif';ctx.fillText('ARCHIVE',20.5,10.5);
  ctx.font='3.1px sans-serif';ctx.fillText('SHIYE  ·  PAPER NOTES',20.5,17.1);
  for(const x of [5,36]){star(ctx,x,10,.85,.4,4);ctx.fill();}
}
function flowerSeal(ctx){
  ctx.strokeStyle='#a87880';ctx.fillStyle='#a87880';ctx.lineCap='round';ctx.lineJoin='round';
  circle(ctx,15,15,12.2);ctx.lineWidth=.65;ctx.stroke();circle(ctx,15,15,10.6);ctx.lineWidth=.3;ctx.stroke();
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7,cx=15+Math.cos(a)*4.3,cy=15+Math.sin(a)*4.3;
    ctx.beginPath();ctx.ellipse(cx,cy,3.3,1.7,a,0,Math.PI*2);ctx.lineWidth=.65;ctx.stroke();}
  circle(ctx,15,15,1.9);ctx.fill();for(const a of [0,2.1,4.2]){circle(ctx,15+Math.cos(a)*8,15+Math.sin(a)*8,.38);ctx.fill();}
}
const drawers={'sage-check-tape':tape,'blue-rule-tape':tape,'coral-dot-tape':tape,
  'leaf-sprig':leaf,butterfly,'paper-star':paperStar,'day-postmark':dayPostmark,
  'archive-mark':archiveMark,'flower-seal':flowerSeal};
for(const asset of creativePresetAssets){
  const key=asset.id.split(':').at(-1),width=asset.physicalWidthMM,height=asset.physicalHeightMM;
  const canvas=createCanvas(width*12,height*12),ctx=canvas.getContext('2d');ctx.scale(12,12);
  drawers[key](ctx,key);
  await writeFile(join(root,key+'.png'),canvas.toBuffer('image/png'));
}
