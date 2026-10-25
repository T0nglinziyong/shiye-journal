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
const centeredText=(ctx,text,x,y,maxWidth,font)=>{ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=font;ctx.fillText(text,x,y,maxWidth);ctx.restore();};
const tapeOutline=(ctx,w,h)=>{ctx.beginPath();ctx.moveTo(0,1);for(let x=0;x<=w;x+=2)ctx.lineTo(x,0.6+Math.sin(x*2.7)*.42);
  ctx.lineTo(w,h-1);for(let x=w;x>=0;x-=2)ctx.lineTo(x,h-.6+Math.sin(x*2.3)*.42);ctx.closePath();};
function tape(ctx,kind){
  const w=60,h=12;tapeOutline(ctx,w,h);ctx.fillStyle={
    'sage-check-tape':'rgba(174,190,160,.80)','blue-rule-tape':'rgba(174,198,210,.78)',
    'coral-dot-tape':'rgba(227,178,164,.82)','rose-floral-tape':'rgba(244,220,217,.86)',
    'ochre-gingham-tape':'rgba(236,210,172,.84)','lavender-star-tape':'rgba(203,196,220,.84)',
    'forest-botanical-tape':'rgba(181,202,181,.85)','sky-cloud-tape':'rgba(189,218,230,.82)',
    'vintage-script-tape':'rgba(226,211,184,.83)'}[kind];ctx.fill();ctx.save();ctx.clip();
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
    }else if(kind==='coral-dot-tape'){
      ctx.fillStyle='rgba(141,65,68,.67)';for(let i=2;i<20;i+=4.7){
        for(const y of [3.5,8]){circle(ctx,x+i+(y===8?2.2:0),y,.75+(i%3)*.08);ctx.fill();}
      }
      ctx.strokeStyle='rgba(251,244,224,.85)';ctx.lineWidth=.24;
      line(ctx,[[x,6],[x+20,6]]);ctx.stroke();
    }else if(kind==='rose-floral-tape'){
      for(const [cx,cy,r] of [[x+3,4,1.25],[x+11,8,1.5],[x+18,3.2,.95]]){
        ctx.fillStyle='#be7884';for(let p=0;p<5;p++){const a=p*Math.PI*2/5;circle(ctx,cx+Math.cos(a)*r*.75,cy+Math.sin(a)*r*.75,r*.56);ctx.fill();}
        circle(ctx,cx,cy,r*.43);ctx.fillStyle='#eec9a7';ctx.fill();
        ctx.strokeStyle='#78947b';ctx.lineWidth=.32;line(ctx,[[cx+1,cy+1],[cx+3.2,cy+2.1]]);ctx.stroke();
      }
    }else if(kind==='ochre-gingham-tape'){
      ctx.fillStyle='rgba(177,113,64,.30)';for(let i=0;i<20;i+=5)ctx.fillRect(x+i,0,2.1,h);
      for(let y=1;y<h;y+=4)ctx.fillRect(x,y,20,1.8);
      ctx.strokeStyle='rgba(255,251,235,.85)';ctx.lineWidth=.25;
      for(let i=0;i<20;i+=5){line(ctx,[[x+i+2.4,0],[x+i+2.4,h]]);ctx.stroke();}
    }else if(kind==='lavender-star-tape'){
      ctx.fillStyle='#fff7df';for(const [sx,sy,r] of [[x+3,3,1.5],[x+10,8,1.05],[x+17,4,1.7]]){star(ctx,sx,sy,r,.42,4);ctx.fill();}
      ctx.fillStyle='#8b86a9';for(const [sx,sy] of [[x+6,9],[x+14,2]]){circle(ctx,sx,sy,.44);ctx.fill();}
    }else if(kind==='forest-botanical-tape'){
      ctx.strokeStyle='#4e775d';ctx.lineWidth=.42;line(ctx,[[x,9],[x+20,3]]);ctx.stroke();
      for(let i=1;i<20;i+=4){const cx=x+i,cy=9-i*.3;ctx.save();ctx.translate(cx,cy);ctx.rotate(i%2?-.6:.6);
        ctx.beginPath();ctx.ellipse(0,0,2.3,.8,0,0,Math.PI*2);ctx.fillStyle=i%3?'#71956d':'#9eab75';ctx.fill();ctx.restore();}
    }else if(kind==='sky-cloud-tape'){
      ctx.fillStyle='rgba(255,255,251,.84)';for(const cx of [x+3,x+11,x+19]){
        for(const [dx,dy,r] of [[-1,6,1.4],[1,4.8,2],[3.3,6,1.4]]){circle(ctx,cx+dx,dy,r);ctx.fill();}
      }
      ctx.strokeStyle='rgba(94,139,161,.5)';ctx.lineWidth=.25;line(ctx,[[x,9.5],[x+20,9.5]]);ctx.stroke();
    }else if(kind==='vintage-script-tape'){
      ctx.fillStyle='#7d6757';centeredText(ctx,'little moments',x+10,4.5,17.5,'italic 3px serif');
      centeredText(ctx,'collected notes',x+10,8.1,17.5,'italic 2.4px serif');
      ctx.strokeStyle='rgba(129,104,77,.5)';ctx.lineWidth=.25;line(ctx,[[x,1.8],[x+20,1.8]]);ctx.stroke();
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
  ctx.translate(18.5,14);ctx.rotate(-.12);ctx.lineJoin='round';
  const top=s=>{ctx.beginPath();ctx.moveTo(0,-2);ctx.bezierCurveTo(s*3,-11,s*10,-13,s*16,-11);
    ctx.bezierCurveTo(s*19,-7,s*15,0,s*8,1);ctx.bezierCurveTo(s*4,2,s*2,0,0,1);ctx.closePath();};
  const bottom=s=>{ctx.beginPath();ctx.moveTo(0,1);ctx.bezierCurveTo(s*5,0,s*13,2,s*13,5);
    ctx.bezierCurveTo(s*11,11,s*5,13,s*3,9);ctx.bezierCurveTo(s*1,7,s*1,4,0,1);ctx.closePath();};
  for(const s of [-1,1])for(const [draw,light,dark] of [[top,'#a7b9cd','#596f8f'],[bottom,'#c3abc9','#736887']]){
    draw(s);ctx.fillStyle='#fffdf7';ctx.strokeStyle='#fffdf7';ctx.lineWidth=2.7;ctx.fill();ctx.stroke();
    draw(s);ctx.fillStyle=light;ctx.strokeStyle=dark;ctx.lineWidth=.55;ctx.fill();ctx.stroke();
  }
  for(const s of [-1,1]){
    ctx.strokeStyle='#647a9a';ctx.lineWidth=.45;for(let i=0;i<5;i++){line(ctx,[[s*1,-1],[s*(7+i*1.4),-7+i*.7]]);ctx.stroke();}
    ctx.fillStyle='#e8d6ca';for(const [x,y,r] of [[8,-7,1],[12,-4,.8],[8,6,.9]]){circle(ctx,s*x,y,r);ctx.fill();}
    ctx.fillStyle='#f8f4e9';for(const [x,y] of [[15,-8],[12,0],[8,10]]){circle(ctx,s*x,y,.65);ctx.fill();}
  }
  ctx.strokeStyle='#495d71';ctx.lineWidth=.75;ctx.lineCap='round';line(ctx,[[0,-5],[0,9]]);ctx.stroke();
  for(const s of [-1,1]){ctx.beginPath();ctx.moveTo(0,-5);ctx.quadraticCurveTo(s*2,-9,s*4,-10);ctx.stroke();}
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
  centeredText(ctx,'TODAY',x,12.8,18,'bold 4.7px serif');
  centeredText(ctx,'DAILY NOTES',x,20.5,17,'3px sans-serif');
  for(const dx of [-7.4,7.4]){star(ctx,x+dx,y,.9,.38,4);ctx.fill();}
  ctx.lineWidth=.4;line(ctx,[[10.2,16.1],[21.8,16.1]]);ctx.stroke();
}
function archiveMark(ctx){
  ctx.strokeStyle='#556c80';ctx.fillStyle='#556c80';ctx.lineWidth=.75;ctx.strokeRect(1.4,1.4,38.2,21.2);
  ctx.lineWidth=.28;ctx.strokeRect(2.7,2.7,35.6,18.6);
  centeredText(ctx,'ARCHIVE',20.5,10.5,29,'bold 7.2px serif');
  centeredText(ctx,'SHIYE  ·  PAPER NOTES',20.5,17.1,30,'3.1px sans-serif');
  for(const x of [5,36]){star(ctx,x,10,.85,.4,4);ctx.fill();}
}
function flowerSeal(ctx){
  ctx.strokeStyle='#a87880';ctx.fillStyle='#a87880';ctx.lineCap='round';ctx.lineJoin='round';
  circle(ctx,15,15,12.2);ctx.lineWidth=.65;ctx.stroke();circle(ctx,15,15,10.6);ctx.lineWidth=.3;ctx.stroke();
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7,cx=15+Math.cos(a)*4.3,cy=15+Math.sin(a)*4.3;
    ctx.beginPath();ctx.ellipse(cx,cy,3.3,1.7,a,0,Math.PI*2);ctx.lineWidth=.65;ctx.stroke();}
  circle(ctx,15,15,1.9);ctx.fill();for(const a of [0,2.1,4.2]){circle(ctx,15+Math.cos(a)*8,15+Math.sin(a)*8,.38);ctx.fill();}
}
function stickerOutline(ctx,draw){ctx.save();ctx.shadowColor='rgba(54,51,46,.20)';ctx.shadowBlur=1.5;ctx.shadowOffsetY=.9;ctx.fillStyle='#fffdf7';ctx.strokeStyle='#fffdf7';ctx.lineWidth=3.2;draw();ctx.fill();ctx.stroke();ctx.restore();draw();}
function berryBranch(ctx){
  ctx.lineCap='round';const stem=()=>{ctx.beginPath();ctx.moveTo(5,34);ctx.bezierCurveTo(18,27,16,13,22,3);};
  stickerOutline(ctx,stem);ctx.strokeStyle='#668269';ctx.lineWidth=1.2;stem();ctx.stroke();
  for(const [x,y,rot] of [[10,27,-.5],[16,19,.6],[18,10,-.4]]){ctx.save();ctx.translate(x,y);ctx.rotate(rot);
    ctx.beginPath();ctx.ellipse(0,0,4,1.8,0,0,Math.PI*2);stickerOutline(ctx,()=>{ctx.beginPath();ctx.ellipse(0,0,4,1.8,0,0,Math.PI*2);});ctx.fillStyle='#86a183';ctx.fill();ctx.restore();}
  for(const [x,y] of [[7,15],[11,11],[23,18],[24,25],[15,29]]){stickerOutline(ctx,()=>circle(ctx,x,y,2.7));circle(ctx,x,y,2.45);ctx.fillStyle='#b65e62';ctx.fill();circle(ctx,x-.65,y-.65,.55);ctx.fillStyle='#fff4df';ctx.fill();}
}
function sleepyCat(ctx){
  const silhouette=()=>{ctx.beginPath();ctx.moveTo(4,16);ctx.quadraticCurveTo(3,8,9,7);ctx.lineTo(11,3);
    ctx.quadraticCurveTo(12,2,15,6);ctx.quadraticCurveTo(19,5,22,6);ctx.lineTo(26,3);
    ctx.quadraticCurveTo(28,3,28,8);ctx.quadraticCurveTo(34,12,31,20);
    ctx.quadraticCurveTo(27,27,18,27);ctx.quadraticCurveTo(7,27,4,20);ctx.closePath();};
  stickerOutline(ctx,silhouette);
  ctx.fillStyle='#b9aca5';ctx.fill();ctx.strokeStyle='#6f635d';ctx.lineWidth=.7;ctx.stroke();
  ctx.fillStyle='#d7c6bb';for(const x of [8.4,26.6]){circle(ctx,x,18,2.7);ctx.fill();}
  // Both eyes close downward; the previous right eye was drawn as an open arc.
  ctx.strokeStyle='#534d49';ctx.lineWidth=.85;ctx.lineCap='round';
  for(const x of [12,23]){ctx.beginPath();ctx.moveTo(x-2.7,14.5);ctx.quadraticCurveTo(x,17,x+2.7,14.5);ctx.stroke();}
  ctx.fillStyle='#9b696c';ctx.beginPath();ctx.moveTo(16.5,18);ctx.lineTo(19.5,18);ctx.lineTo(18,19.4);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(18,19.2);ctx.quadraticCurveTo(16.7,21,15.5,19.7);ctx.moveTo(18,19.2);ctx.quadraticCurveTo(19.3,21,20.5,19.7);ctx.stroke();
  ctx.strokeStyle='#8b7e74';ctx.lineWidth=.4;
  for(const side of [-1,1])for(const y of [18,20]){ctx.beginPath();ctx.moveTo(18+side*6,y);ctx.lineTo(18+side*11,y+(y===18?-.8:.8));ctx.stroke();}
}
function daisyBunch(ctx){
  ctx.lineCap='round';ctx.strokeStyle='#738b6b';ctx.lineWidth=.7;for(const [x,y] of [[13,11],[22,13],[17,20]]){line(ctx,[[17,36],[x,y]]);ctx.stroke();}
  for(const [x,y,r] of [[13,11,5],[22,13,5.3],[17,20,4.8]]){
    for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.ellipse(x+Math.cos(a)*r*.6,y+Math.sin(a)*r*.6,r*.55,r*.22,a,0,Math.PI*2);ctx.fillStyle='#fffdf7';ctx.fill();ctx.strokeStyle='#d5c3aa';ctx.lineWidth=.3;ctx.stroke();}
    circle(ctx,x,y,1.8);ctx.fillStyle='#d5ad63';ctx.fill();
  }
  ctx.fillStyle='#9cb094';ctx.beginPath();ctx.ellipse(12,28,4,1.5,-.6,0,Math.PI*2);ctx.fill();
}
function coffeeCup(ctx){
  const cup=()=>{ctx.beginPath();ctx.moveTo(5,9);ctx.quadraticCurveTo(5,7,7,7);ctx.lineTo(23,7);
    ctx.quadraticCurveTo(25,7,25,9);ctx.lineTo(24,22);ctx.quadraticCurveTo(23,27,16,27);
    ctx.lineTo(13,27);ctx.quadraticCurveTo(6,27,6,22);ctx.closePath();};
  stickerOutline(ctx,cup);ctx.fillStyle='#f2e7d7';ctx.fill();ctx.strokeStyle='#806656';ctx.lineWidth=.75;ctx.stroke();
  ctx.strokeStyle='#fffdf7';ctx.lineWidth=3.6;ctx.beginPath();ctx.arc(24,16,5,-1.2,1.2);ctx.stroke();
  ctx.strokeStyle='#806656';ctx.lineWidth=1.35;ctx.beginPath();ctx.arc(24,16,5,-1.2,1.2);ctx.stroke();
  ctx.beginPath();ctx.ellipse(15,9.3,9.2,3.1,0,0,Math.PI*2);ctx.fillStyle='#fffaf1';ctx.fill();ctx.lineWidth=.65;ctx.stroke();
  ctx.beginPath();ctx.ellipse(15,9.3,7.2,1.85,0,0,Math.PI*2);ctx.fillStyle='#9f6a50';ctx.fill();
  ctx.fillStyle='#e9cba9';ctx.beginPath();ctx.moveTo(15,9.7);ctx.bezierCurveTo(9,7.1,11,13.2,15,11.8);
  ctx.bezierCurveTo(19,13.2,21,7.1,15,9.7);ctx.fill();
  ctx.strokeStyle='#ad8e72';ctx.lineWidth=.48;for(const x of [12,18]){ctx.beginPath();ctx.moveTo(x,5);ctx.quadraticCurveTo(x-2.2,3.2,x,1.6);ctx.stroke();}
}
function crescent(ctx,x,y,scale=1){
  ctx.beginPath();ctx.moveTo(x+4*scale,y-11*scale);
  ctx.bezierCurveTo(x-12*scale,y-11*scale,x-15*scale,y+8*scale,x-2*scale,y+12*scale);
  ctx.bezierCurveTo(x+7*scale,y+15*scale,x+12*scale,y+9*scale,x+13*scale,y+4*scale);
  ctx.bezierCurveTo(x+5*scale,y+10*scale,x-3*scale,y+5*scale,x-3*scale,y-3*scale);
  ctx.bezierCurveTo(x-3*scale,y-7*scale,x*1+1*scale,y-10*scale,x+4*scale,y-11*scale);ctx.closePath();
}
function tinyMoon(ctx){
  stickerOutline(ctx,()=>crescent(ctx,15,15,.85));
  ctx.fillStyle='#d4d7e5';ctx.fill();ctx.strokeStyle='#7683aa';ctx.lineWidth=.75;ctx.stroke();
  ctx.fillStyle='#d8b878';for(const [x,y,r] of [[25,5,1.5],[5,7,1.15],[25,23,1]]){star(ctx,x,y,r,.35,4);ctx.fill();}
}
function paperclip(ctx){
  ctx.save();ctx.shadowColor='rgba(58,48,30,.25)';ctx.shadowBlur=1.2;ctx.shadowOffsetX=.6;
  ctx.strokeStyle='#fffdf7';ctx.lineWidth=4.2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(7,34);ctx.lineTo(7,8);ctx.arc(8,8,4,Math.PI,Math.PI*2);ctx.lineTo(12,30);ctx.arc(9,30,3,0,Math.PI);ctx.lineTo(6,14);ctx.stroke();ctx.restore();
  ctx.strokeStyle='#b9985f';ctx.lineWidth=2.1;ctx.lineCap='round';ctx.stroke();
  ctx.strokeStyle='#e4c78e';ctx.lineWidth=.55;ctx.stroke();
}
function stamp(ctx,kind){
  const colors={'travel-postmark':'#668c9c','coffee-seal':'#8a6d59','night-seal':'#79718e',
    'library-date':'#647a69','ticket-seal':'#ad6d62','field-note-seal':'#75856f'};
  const w={'travel-postmark':39,'coffee-seal':31,'night-seal':31,'library-date':39,'ticket-seal':40,'field-note-seal':39}[kind];
  const h={'travel-postmark':28,'coffee-seal':31,'night-seal':31,'library-date':24,'ticket-seal':25,'field-note-seal':26}[kind];
  ctx.strokeStyle=colors[kind];ctx.fillStyle=colors[kind];ctx.lineWidth=.65;
  if(['coffee-seal','night-seal'].includes(kind)){
    circle(ctx,w/2,h/2,12);ctx.stroke();circle(ctx,w/2,h/2,10.2);ctx.lineWidth=.3;ctx.stroke();
    if(kind==='night-seal'){crescent(ctx,15,12.5,.34);ctx.fill();star(ctx,22,8.8,1.3,.4,4);ctx.fill();}
    else{ctx.beginPath();ctx.moveTo(10,10.6);ctx.lineTo(21,10.6);ctx.lineTo(20,17.2);ctx.lineTo(11,17.2);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.arc(21,13.9,2.6,-1.1,1.1);ctx.stroke();
      ctx.beginPath();ctx.ellipse(15.5,10.6,5.6,1.3,0,0,Math.PI*2);ctx.stroke();}
    centeredText(ctx,kind==='night-seal'?'GOOD NIGHT':'SLOW COFFEE',w/2,21,15,'bold 2.5px sans-serif');
  }else{
    ctx.strokeRect(1.3,1.3,w-2.6,h-2.6);ctx.strokeRect(2.4,2.4,w-4.8,h-4.8);
    if(kind==='travel-postmark'){centeredText(ctx,'POSTCARD',w/2,11,w-9,'bold 5px serif');centeredText(ctx,'FROM THIS MOMENT',w/2,19,w-9,'2.7px sans-serif');}
    else if(kind==='library-date'){centeredText(ctx,'READ TODAY',w/2,9,w-9,'bold 5px serif');centeredText(ctx,'____ / ____ / ____',w/2,17,w-9,'3px monospace');}
    else if(kind==='ticket-seal'){centeredText(ctx,'ADMIT ONE',w/2,10,w-9,'bold 5px serif');centeredText(ctx,'A LITTLE JOY',w/2,17,w-9,'2.6px sans-serif');}
    else{centeredText(ctx,'FIELD NOTES',w/2,10,w-9,'bold 5px serif');centeredText(ctx,'COLLECTED OUTSIDE',w/2,18,w-9,'2.6px sans-serif');}
  }
}
const drawers={'sage-check-tape':tape,'blue-rule-tape':tape,'coral-dot-tape':tape,
  'leaf-sprig':leaf,butterfly,'paper-star':paperStar,'day-postmark':dayPostmark,
  'archive-mark':archiveMark,'flower-seal':flowerSeal,
  ...Object.fromEntries(['rose-floral-tape','ochre-gingham-tape','lavender-star-tape',
    'forest-botanical-tape','sky-cloud-tape','vintage-script-tape'].map(key=>[key,tape])),
  'berry-branch':berryBranch,'sleepy-cat':sleepyCat,'daisy-bunch':daisyBunch,
  'coffee-cup':coffeeCup,'tiny-moon':tinyMoon,paperclip,
  ...Object.fromEntries(['travel-postmark','coffee-seal','night-seal','library-date',
    'ticket-seal','field-note-seal'].map(key=>[key,stamp]))};
for(const asset of creativePresetAssets){
  const key=asset.id.split(':').at(-1),width=asset.physicalWidthMM,height=asset.physicalHeightMM;
  const canvas=createCanvas(width*12,height*12),ctx=canvas.getContext('2d');ctx.scale(12,12);
  drawers[key](ctx,key);
  await writeFile(join(root,key+'.png'),canvas.toBuffer('image/png'));
}
