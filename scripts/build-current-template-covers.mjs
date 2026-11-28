import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {loadOfflineCanvas,renderOfflinePNG} from '../src/offline-node-preview.mjs';
import {compileCurrentTemplate,listCurrentTemplates} from '../creative-agent/library/current-templates.js';

// The library cover is the executable template with its own defaults and an
// empty material basket. No reference artwork or user material enters it.
const output=resolve(import.meta.dirname,'../public/template-defaults');
await mkdir(output,{recursive:true});
const canvas=await loadOfflineCanvas();
for(const [index,template] of listCurrentTemplates().entries()){
  const [width,height]=template.pageMm;
  const leafWidth=template.pageMode==='spread'?width/2:width;
  const page=draft({mode:template.pageMode,ratio:`custom:${leafWidth}x${height}`});
  let document=await createCreationDocument({draft:page,assets:[],title:template.title});
  const {operations}=compileCurrentTemplate({templateId:template.id});
  if(operations.some(operation=>String(operation.op).startsWith('material.')))
    throw Error(`${template.id} 的空素材默认封面仍引用了素材`);
  for(let start=0;start<operations.length;start+=10){
    document=applyCreationTransaction(document,{protocolVersion:2,
      transactionId:`template-default-${index}-${start}`,
      baseSceneRevision:creationSceneRevision(document),
      operations:operations.slice(start,start+10)},[]).document;
  }
  const {png}=await renderOfflinePNG(document.page,document.source,{},canvas);
  const image=await canvas.loadImage(png);
  const maxWidth=template.pageMode==='spread'?900:600;
  const scale=Math.min(1,maxWidth/image.width);
  const cover=canvas.createCanvas(Math.round(image.width*scale),Math.round(image.height*scale));
  cover.getContext('2d').drawImage(image,0,0,cover.width,cover.height);
  await writeFile(resolve(output,`${template.id}.jpg`),cover.toBuffer('image/jpeg',{quality:.9}));
  console.log(`${template.id}: ${cover.width}×${cover.height}`);
}
