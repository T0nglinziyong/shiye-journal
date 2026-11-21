import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

// Browser pixels and Blob handling matter here: an editable work must retain
// its candidate RGB frame for later mask edits without uploading the photo.
const browser=await browserHarness('shiye-import-work-source',
  process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
try{
  await browser.wait('.series-grid');
  const result=await browser.evaluate(`(async()=>{
    const {saveImportBatch}=await import('/src/import-save.js');
    const canvas=document.createElement('canvas');canvas.width=80;canvas.height=100;
    canvas.getContext('2d').fillRect(0,0,80,100);
    const frame=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const photo=new File([new Uint8Array(200000).fill(7)],'source.jpg',{type:'image/jpeg'});
    const state={importMode:'work',importStep:'review',importSaving:false,
      preferences:{recognitionPixels:900},assets:[],projects:[],importRecords:[{
        confirmed:true,file:photo,originalFile:photo,bitmap:{width:800,height:1000},
        paperSize:'a4',paperOrientation:'portrait',selectedCandidates:[{
          selected:true,blob:frame,candidateFrameBlob:frame,title:'piece',
          width:30,height:40,region:{x:.1,y:.2,w:.2,h:.3}}]}]};
    let saved;const urls=new Map();
    await saveImportBatch({state,db:{stageImport:async batch=>{saved=batch;return {pending:false};}},
      urls,render:()=>{}});
    for(const url of urls.values())URL.revokeObjectURL(url);
    const asset=saved.assets[0],ids=new Set(saved.blobs.map(blob=>blob.id));
    return {originalID:saved.projects[0].originalImportPhotoBlobID??null,
      photoID:asset.photoBlobId??null,frameID:asset.candidateFrameBlobId,
      frameSaved:ids.has(asset.candidateFrameBlobId),cutoutSaved:ids.has(asset.blobId),
      originalPhotoSaved:saved.blobs.some(blob=>blob.data===photo),
      items:saved.projects[0].drafts[0].items.length};
  })()`);
  assert.equal(result.originalID,null);
  assert.equal(result.photoID,null);
  assert.equal(result.originalPhotoSaved,false);
  assert.equal(result.frameSaved,true);
  assert.equal(result.cutoutSaved,true);
  assert.equal(result.items,1);
  assert.deepEqual(browser.errors,[]);
  console.log('PASS: editable work keeps candidate pixels without the source photo');
}finally{await browser.close();}
