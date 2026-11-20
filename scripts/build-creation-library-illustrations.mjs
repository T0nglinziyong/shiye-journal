import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadOfflineCanvas,renderOfflinePNG} from '../src/offline-node-preview.mjs';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {templateCatalog} from '../src/creation-library/matcher.js';
import {techniqueCatalog,compileTechnique} from '../src/creation-library/techniques.js';
import {compileTemplate} from '../src/creation-library/compiler.js';
import {templateFixture,resolveTemplateStyle} from '../src/creation-library/template-elements.js';
import {exampleMaterials,techniqueExample} from '../src/creation-library/examples.js';
const root=resolve(import.meta.dirname,'../src/creation-library/illustrations');await mkdir(root,{recursive:true});
const canvas=await loadOfflineCanvas(),manifest={version:1,images:[]};
async function save(id,image,kind){const bytes=image.toBuffer('image/png');await writeFile(resolve(root,id+'.png'),bytes);manifest.images.push({id,file:id+'.png',kind,sha256:createHash('sha256').update(bytes).digest('hex'),width:image.width,height:image.height});}
const palette=['#72A8B7','#E5B456','#96BAB6','#D59076'];
for(const t of templateCatalog.templates){
 const fixture=templateFixture(t),images={};
 for(const [i,asset] of fixture.materials.entries()){
  const slot=t.elements.find(e=>e.id===fixture.bindings[i].slotId),style=resolveTemplateStyle(slot.example||{},t.palette||{});
  const c=canvas.createCanvas(400,Math.round(400*asset.physicalHeightMM/asset.physicalWidthMM)),ctx=c.getContext('2d');
  ctx.fillStyle=style.fill||palette[i%palette.length];
  if(style.stroke&&!/^#[0-9a-f]{6}$/i.test(style.stroke))throw Error('合成素材描边无效：'+slot.id);
  ctx.strokeStyle=style.stroke||'transparent';ctx.lineWidth=c.width*.007;
  if(style.shape==='path'){
   if(typeof style.path!=='string'||!/^[MmLlHhVvCcSsQqTtAaZz0-9+eE.,\s-]+$/.test(style.path)||!/^#[0-9a-f]{6}$/i.test(style.fill))throw Error('合成素材轮廓无效：'+slot.id);
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${style.path}" fill="${style.fill}" stroke="${style.stroke||'none'}" stroke-width="0.7"/></svg>`;
   ctx.drawImage(await canvas.loadImage(Buffer.from(svg)),0,0,c.width,c.height);
  }else if((style.shape||slot.shape)==='ellipse'){ctx.beginPath();ctx.ellipse(c.width/2,c.height/2,c.width/2,c.height/2,0,0,Math.PI*2);ctx.fill();if(style.stroke)ctx.stroke();}
  else if(style.shape==='star'){
   ctx.beginPath();const count=style.points||5;
   for(let k=0;k<count*2;k++){const angle=k*Math.PI/count-Math.PI/2,r=k%2?style.innerRatio||.5:1;const x=c.width/2*(1+r*Math.cos(angle)),y=c.height/2*(1+r*Math.sin(angle));k?ctx.lineTo(x,y):ctx.moveTo(x,y);}
   ctx.closePath();ctx.fill();
  }else {ctx.fillRect(0,0,c.width,c.height);if(style.stroke)ctx.strokeRect(0,0,c.width,c.height);}
  images[asset.alias]=c.toBuffer('image/png');
 }
 const page=draft({ratio:'a5'});page.physicalPageHeightMM=fixture.paper.height;page.canvas.width=page.canvas.height*fixture.paper.width/fixture.paper.height;
 const doc=await createCreationDocument({draft:page,assets:fixture.materials,aliases:Object.fromEntries(fixture.materials.map(a=>[a.alias,a.id]))});
 const compiled=compileTemplate({...fixture,templateId:t.id,id:'template'});
 const done=applyCreationTransaction(doc,{protocolVersion:2,transactionId:'illustration-'+t.id,baseSceneRevision:creationSceneRevision(doc),operations:compiled.operations},fixture.materials).document;
 const {png}=await renderOfflinePNG(done.page,done.source,images,canvas),im=await canvas.loadImage(png);
 const out=canvas.createCanvas(240,Math.round(240*fixture.paper.height/fixture.paper.width));out.getContext('2d').drawImage(im,0,0,out.width,out.height);
 await save(t.id,out,'rendered-template-commands');
}
const images={};
for(const [i,a] of exampleMaterials.entries()){
 const c=canvas.createCanvas(400,Math.round(400*a.physicalHeightMM/a.physicalWidthMM)),x=c.getContext('2d');x.fillStyle=a.id==='example-strip'?'#C66236':palette[i%palette.length];x.fillRect(0,0,c.width,c.height);x.fillStyle='#FFF9E3';
 if(i===0){x.beginPath();x.arc(240,130,75,0,2*Math.PI);x.fill();x.fillStyle='#3D6871';x.beginPath();x.moveTo(0,c.height);x.lineTo(180,210);x.lineTo(400,c.height);x.fill();}
 else if(a.id==='example-photo-two'){
  x.fillStyle='#E9DBC3';x.fillRect(26,28,c.width-52,c.height-56);x.fillStyle='#A6C6C7';x.fillRect(55,58,c.width-110,c.height*.47);x.fillStyle='#F6E8C4';x.beginPath();x.arc(255,135,43,0,2*Math.PI);x.fill();x.fillStyle='#51786B';x.fillRect(55,c.height*.48,c.width-110,c.height*.16);x.fillStyle='#9A6F4C';x.fillRect(45,c.height*.7,c.width-90,20);
 }
 else if(a.id==='example-photo-three'){
  x.fillStyle='#D6DDD2';x.fillRect(0,0,c.width,c.height);x.fillStyle='#F6E8C4';x.beginPath();x.arc(285,104,50,0,2*Math.PI);x.fill();x.fillStyle='#6F8C80';x.beginPath();x.moveTo(0,c.height*.67);x.lineTo(150,c.height*.24);x.lineTo(400,c.height*.72);x.fill();x.fillStyle='#3D6871';x.beginPath();x.moveTo(0,c.height*.83);x.lineTo(245,c.height*.49);x.lineTo(400,c.height*.86);x.fill();x.fillStyle='#B1C7C2';x.fillRect(0,c.height*.83,c.width,c.height*.17);
 }
 else if(i===1){x.strokeStyle='#FFF9E3';x.lineWidth=4;for(let y=45;y<c.height-20;y+=45){x.beginPath();x.moveTo(20,y);x.lineTo(360,y);x.stroke();}}
 else if(i===4){x.fillRect(22,22,356,c.height-44);x.fillStyle='#3D6871';x.font='32px sans-serif';x.fillText('SAMPLE',120,105);x.fillText('0001',150,c.height-60);for(let y=160;y<c.height-140;y+=65)x.fillRect(55,y,290,3);}
 else if(a.kind==='note'){x.fillStyle='#EEE5D0';x.fillRect(0,0,c.width,c.height);x.strokeStyle='#CEB995';x.lineWidth=2;x.strokeRect(10,10,c.width-20,c.height-20);}
 else for(let y=12;y<c.height;y+=35)for(let xx=12;xx<400;xx+=35){x.beginPath();x.arc(xx,y,4,0,2*Math.PI);x.fill();}
 images[a.alias]=c.toBuffer('image/png');
}
for(const method of techniqueCatalog.methods){
 const {before,parameters}=techniqueExample(method),compiled=compileTechnique({methodId:method.id,parameters,materials:exampleMaterials});
 const doc=await createCreationDocument({draft:draft({ratio:'a5'}),assets:exampleMaterials,aliases:Object.fromEntries(exampleMaterials.map(a=>[a.alias,a.id]))});
 const done=applyCreationTransaction(doc,{protocolVersion:2,transactionId:'illustration-'+method.id,baseSceneRevision:creationSceneRevision(doc),operations:[...before,...compiled.operations]},exampleMaterials).document;
 const {png}=await renderOfflinePNG(done.page,done.source,images,canvas),im=await canvas.loadImage(png),full=canvas.createCanvas(im.width,im.height),ctx=full.getContext('2d');ctx.drawImage(im,0,0);
 const pixels=ctx.getImageData(0,0,im.width,im.height).data,bg=pixels.slice(0,3);let left=im.width,top=im.height,right=0,bottom=0;
 for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){const o=(y*im.width+x)*4;if(Math.abs(pixels[o]-bg[0])+Math.abs(pixels[o+1]-bg[1])+Math.abs(pixels[o+2]-bg[2])>60){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}}
 if(right<=left||bottom<=top)throw Error('示意图为空：'+method.id);
 const pad=18;left=Math.max(0,left-pad);top=Math.max(0,top-pad);right=Math.min(im.width,right+pad);bottom=Math.min(im.height,bottom+pad);
 const scale=Math.min(360/(right-left),300/(bottom-top)),out=canvas.createCanvas(Math.round((right-left)*scale),Math.round((bottom-top)*scale));out.getContext('2d').drawImage(im,left,top,right-left,bottom-top,0,0,out.width,out.height);
 await save(method.id,out,'rendered-editable-commands');
}
await writeFile(resolve(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({templates:templateCatalog.templates.length,techniques:techniqueCatalog.methods.length,images:manifest.images.length}));
