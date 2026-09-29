import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
const names=['gpt-agent-quality-v3','gpt-direct-quality-v3','deepseek-agent-native-v5','deepseek-direct-reasoning-v6'],fixtures=[];
for(const name of names)fixtures.push({name,draft:JSON.parse(await readFile('/tmp/shiye-model-live/'+name+'/draft.json','utf8')),fixture:JSON.parse(await readFile('/tmp/shiye-model-live/'+name+'/fixture.json','utf8'))});
const directory='/tmp/shiye-model-visual-final';await mkdir(directory,{recursive:true});
const b=await browserHarness('shiye-model-render',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
try{
  await b.wait('.series-grid');
  await b.evaluate(`(async()=>{const fixtures=${JSON.stringify(fixtures)},db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result);}),assets=fixtures[0].fixture.assets,blobs=[];for(const a of assets){const c=document.createElement('canvas');c.width=Math.round(a.physicalWidthMM*8);c.height=Math.round(a.physicalHeightMM*8);const x=c.getContext('2d');x.fillStyle={focal:'#82b8d4',memo:'#d8e8c4',ticket:'#d39772',illustration:'#444848'}[a.id];x.fillRect(0,0,c.width,c.height);x.fillStyle=a.id==='focal'?'#f4efd4':'#f8f3e7';x.font=Math.min(c.width/6,48)+'px serif';x.textAlign='center';if(a.id==='focal'){for(let row=0;row<6;row++)for(let col=0;col<4;col++)x.fillText('✦',c.width*(col+.5)/4,c.height*(row+.5)/6);}else{x.fillText(a.id==='memo'?'视觉观察':a.id==='ticket'?'暖橙色':'人物剪影',c.width/2,c.height/2);}const data=await new Promise(r=>c.toBlob(r,'image/png'));a.blobId='model-'+a.id;a.originalBlobId=a.blobId;a.createdAt=new Date().toISOString();blobs.push({id:a.blobId,data});}await new Promise((r,j)=>{const t=db.transaction(['assets','blobs','projects','meta'],'readwrite');for(const a of assets)t.objectStore('assets').put(a);for(const blob of blobs)t.objectStore('blobs').put(blob);for(const f of fixtures)t.objectStore('projects').put({id:f.name,title:f.name,drafts:[f.draft],activeDraftID:f.draft.id,source:'created',isDraft:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});t.objectStore('meta').put({id:'cece-samples-v2'});t.oncomplete=r;t.onerror=()=>j(t.error);});db.close();})()`);
  await b.command('Page.reload');await b.wait('.series-grid');
  for(const [w,h] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await b.command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});
    for(const name of names){
      await b.click('[data-route="works"]','.works-grid');await b.click('[data-id="'+name+'"] .work-card-detail','.preview-paper');await b.sleep(100);
      const screenshot=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(directory+'/'+w+'-'+name+'.png',Buffer.from(screenshot.data,'base64'));
      assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      await b.click('[data-act="preview-continue"]','#canvas-page');
      const counts=await b.evaluate('({materials:document.querySelectorAll("#canvas-page [data-object][data-kind=material]").length,texts:document.querySelectorAll("#canvas-page [data-object][data-kind=text]").length})'),expected=fixtures.find(f=>f.name===name).draft;
      assert.equal(counts.materials,expected.items.length);assert.equal(counts.texts,expected.textBlocks.length);
      const typeScale=await b.evaluate('(()=>{const page=document.querySelector("#canvas-page"),t=page.querySelector("[data-kind=text]");return parseFloat(getComputedStyle(t).fontSize)/page.getBoundingClientRect().width;})()');
      assert.ok(Math.abs(typeScale-expected.textBlocks[0].fontSize/expected.canvas.width)<.00001,'Text must scale with the page, not remain fixed screen pixels');
      await b.sleep(100);const editor=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(directory+'/'+w+'-'+name+'-editable.png',Buffer.from(editor.data,'base64'));
    }
  }
  assert.deepEqual(b.errors,[]);console.log('Actual provider results rendered in app: 32 preview/editor screenshots',directory);
}finally{await b.close();}
