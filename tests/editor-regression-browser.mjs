// Synthetic isolated browser context. Never reads the signed-in private library.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const dir='/tmp/shiye-editor-regression';await mkdir(dir,{recursive:true});
const b=await browserHarness('shiye-editor-regression',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5190');
try{
  await b.wait('.series-grid');
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await b.click('[data-route="works"]','.works-grid');await b.click('#work-create','#canvas-page');
    await b.click('[data-val="shape"]','[data-shape-kind="heart"]');await b.click('[data-shape-kind="heart"]','.selected-object-overlay');
    const initial=await b.evaluate('(()=>{const o=document.querySelector(".canvas-object.shape");return {id:o.dataset.object,left:o.style.left,top:o.style.top};})()');
    const point=await b.evaluate('(()=>{const r=document.querySelector(".canvas-object.shape").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
    await b.command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
    const end={x:point.x+35,y:point.y+25};await b.command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,...end});
    assert.ok(await b.evaluate('(()=>{const o=document.querySelector(".canvas-object.shape"),s=document.querySelector(".selected-object-overlay");return !!s&&["left","top","width","height","transform"].every(k=>o.style[k]===s.style[k]);})()'),'Frame must follow while pointer is held');
    const held=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(`${dir}/${width}x${height}-held.png`,Buffer.from(held.data,'base64'));
    await b.command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...end});await b.sleep(200);
    const moved=await b.evaluate('document.querySelector(".canvas-object.shape").style.left');assert.notEqual(moved,initial.left);
    await b.click('[aria-label="历史记录"]','.canvas-history-row');
    // First snapshot of a new blank work must restore blank, not the edited draft.
    const before=await b.evaluate('document.querySelectorAll(".canvas-object.shape").length');
    const cancelTrigger=b.evaluate('document.querySelector(".canvas-history-row button").click()');await b.sleep(100);await b.command('Page.handleJavaScriptDialog',{accept:false});await cancelTrigger;
    assert.equal(await b.evaluate('document.querySelectorAll(".canvas-object.shape").length'),before);
    await b.click('[aria-label="历史记录"]','.canvas-history-row');const restoreTrigger=b.evaluate('document.querySelector(".canvas-history-row button").click()');await b.sleep(100);await b.command('Page.handleJavaScriptDialog',{accept:true});await restoreTrigger;
    assert.equal(await b.evaluate('document.querySelectorAll(".canvas-object.shape").length'),0);
    await b.click('[data-act="undo"]');assert.equal(await b.evaluate('document.querySelectorAll(".canvas-object.shape").length'),1);
    await b.click('[data-act="redo"]');assert.equal(await b.evaluate('document.querySelectorAll(".canvas-object.shape").length'),0);
    assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    const shot=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(`${dir}/${width}x${height}.png`,Buffer.from(shot.data,'base64'));
    await b.click('[data-act="back-works"]','.works-grid');
  }
  const staged=await b.evaluate(`(async()=>{
    const {createCloudStore}=await import('/src/cloud-store.js'),{createPrivateCache}=await import('/src/private-cache.js'),{saveImportBatch}=await import('/src/import-save.js');
    const cache=createPrivateCache({name:'synthetic-import-regression'});let release,revision=0,commits=0;
    const gate=new Promise(r=>release=r),client={from(){const q={select(){return q;},eq(){return q;},order(){return q;},single:async()=>({data:{revision}}),range:async()=>({data:[]})};return q;},storage:{from(){return {upload:async()=>{await gate;return {error:null};}};}},rpc:async()=>({data:++revision})};
    const cloud=createCloudStore({cache,cloudClient:()=>client,requireCloudUser:async()=>({id:'synthetic-owner'})});
    const canvas=document.createElement('canvas');canvas.width=80;canvas.height=90;canvas.getContext('2d').fillRect(0,0,80,90);const blob=await new Promise(r=>canvas.toBlob(r));
    const state={assets:[],projects:[],importStep:'review',importMode:'material',importRecords:[{confirmed:true,file:blob,selectedCandidates:[{selected:true,title:'synthetic',region:{x:0,y:0,w:1,h:1},blob}]}]};let rendered,organized=false;
    const start=performance.now();await saveImportBatch({state,urls:new Map(),db:{stageImport:cloud.cloudStageImport,flushProjects:cloud.cloudFlushProjects},render:()=>{rendered=state.importStep;},onSaved:()=>{organized=true;}});
    const milliseconds=performance.now()-start;if(rendered!=='done'||organized)throw Error('Completion waited on cloud or organization');
    const rows=await cache.get('cloud:synthetic-owner','import-outbox');if(rows.length!==1)throw Error('Missing durable batch');
    const reopen=createCloudStore({cache,cloudClient:()=>client,requireCloudUser:async()=>({id:'synthetic-owner'})}),id=state.assets[0].blobId;
    const recovered=await reopen.cloudGet('blobs',id);if(recovered.data.size!==blob.size)throw Error('Reload lost original');
    release();await cloud.cloudFlushProjects();if((await cache.get('cloud:synthetic-owner','import-outbox')).length)throw Error('Acknowledged batch not cleared');await cache.clear('cloud:synthetic-owner');return {milliseconds,bytes:recovered.data.size};
  })()`);
  assert.ok(staged.milliseconds<1500,JSON.stringify(staged));assert.deepEqual(b.errors,[]);console.log('PASS: held-pointer frame, history cancel/restore/undo/redo at four viewports; durable import completion with blocked uploads:',staged,dir);
}finally{await b.close();}
