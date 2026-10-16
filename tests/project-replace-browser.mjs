import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-project-replace',url+'/');
const {click,evaluate,wait,sleep}=browser;
try{
  await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  const result=await evaluate(`(async()=>{
    const db=await new Promise((resolve,reject)=>{const open=indexedDB.open('shiye-pwa-full-v1');
      open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error)});
    const projects=await new Promise((resolve,reject)=>{const tx=db.transaction('projects');
      const request=tx.objectStore('projects').getAll();request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error)});
    db.close();
    const project=projects.find(item=>Array.isArray(item.drafts));
    const {projectSemanticFingerprint}=await import('/src/project-semantic.js');
    const target=structuredClone(project);
    target.title='云端合并后的作品';
    target.drafts[0].layers.push({id:'remote-shape',type:'shape',kind:'rectangle',
      x:100,y:100,width:40,height:40,rotation:0,zIndex:50,fill:'#aabbcc',stroke:'#334455',lineWidth:1});
    window.dispatchEvent(new CustomEvent('shiye-sync-project-replaced',{detail:{
      sourceID:project.id,sourceSessionID:project.__cloudSessionId,
      sourceFingerprint:projectSemanticFingerprint(project),target}}));
    return {id:project.id,shapeID:'remote-shape'};
  })()`);
  await sleep(200);
  assert.equal(await evaluate('document.querySelector("#project-title")?.textContent'),'云端合并后的作品');
  await click('[data-val="layers"]','.scene-layer-tree');
  assert.equal(await evaluate('!!document.querySelector(".scene-layer-tree [data-scene-node=remote-shape]")'),true,
    'the live editor must use the remote scene instead of its stale opened draft');
  assert.deepEqual(browser.errors,[]);
  console.log('Project replacement updates the active editor scene:',result.id);
}finally{await browser.close();}
