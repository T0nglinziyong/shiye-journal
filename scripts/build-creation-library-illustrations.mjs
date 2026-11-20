import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadOfflineCanvas,renderOfflinePNG} from '../src/offline-node-preview.mjs';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {templateCatalog} from '../src/creation-library/matcher.js';
import {techniqueCatalog,compileTechnique} from '../src/creation-library/techniques.js';
import {exampleMaterials,techniqueExample} from '../src/creation-library/examples.js';
const root=resolve(import.meta.dirname,'../src/creation-library/illustrations');await mkdir(root,{recursive:true});
const canvas=await loadOfflineCanvas(),manifest={version:1,images:[]};
async function save(id,image,kind){const bytes=image.toBuffer('image/png');await writeFile(resolve(root,id+'.png'),bytes);manifest.images.push({id,file:id+'.png',kind,sha256:createHash('sha256').update(bytes).digest('hex'),width:image.width,height:image.height});}
const palette=['#72A8B7','#E5B456','#96BAB6','#D59076'];
for(const t of templateCatalog.templates){
 const c=canvas.createCanvas(240,Math.round(240/t.aspect)),x=c.getContext('2d');x.fillStyle='#FFFEF8';x.fillRect(0,0,c.width,c.height);
 t.elements.forEach((e,i)=>{const [a,b,w,h]=e.box,xx=a*c.width,yy=b*c.height,ww=w*c.width,hh=h*c.height;x.save();x.translate(xx+ww/2,yy+hh/2);x.rotate((e.rotation||0)*Math.PI/180);x.translate(-ww/2,-hh/2);
  if(['text','title'].includes(e.role)){x.strokeStyle='#536653';x.lineWidth=e.role==='title'?2:1;for(let y=4;y<hh;y+=e.role==='title'?8:6){x.beginPath();x.moveTo(0,y);x.lineTo(ww*(y+8>hh?.65:1),y);x.stroke();}}
  else {x.fillStyle=palette[i%palette.length];x.globalAlpha=e.role==='background'?.5:.86;x.beginPath();if(e.shape==='ellipse')x.ellipse(ww/2,hh/2,ww/2,hh/2,0,0,2*Math.PI);else x.rect(0,0,ww,hh);x.fill();x.globalAlpha=1;x.fillStyle='#273D42';x.font='10px sans-serif';x.fillText(e.id,3,12);}x.restore();
 });await save(t.id,c,'template-interpretation');
}
const images={};
for(const [i,a] of exampleMaterials.entries()){
 const c=canvas.createCanvas(400,Math.round(400*a.physicalHeightMM/a.physicalWidthMM)),x=c.getContext('2d');x.fillStyle=palette[i];x.fillRect(0,0,c.width,c.height);x.fillStyle='#FFF9E3';
 if(i===0){x.beginPath();x.arc(240,130,75,0,2*Math.PI);x.fill();x.fillStyle='#3D6871';x.beginPath();x.moveTo(0,c.height);x.lineTo(180,210);x.lineTo(400,c.height);x.fill();}
 else if(i===1){x.strokeStyle='#FFF9E3';x.lineWidth=4;for(let y=45;y<c.height-20;y+=45){x.beginPath();x.moveTo(20,y);x.lineTo(360,y);x.stroke();}}
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
