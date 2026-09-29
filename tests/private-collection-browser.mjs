// Opt-in private input only. Never copy this file to public/ or upload it.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
if(!process.env.SHIYE_PRIVATE_COLLECTION)throw Error('Set an explicitly authorized private collection path');
const bytes=await readFile(process.env.SHIYE_PRIVATE_COLLECTION),directory=process.env.SHIYE_PRIVATE_SCREENSHOTS||'/tmp/shiye-private-collection-browser';await mkdir(directory,{recursive:true});
const b=await browserHarness('shiye-private-collection',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5180');
try{
  await b.wait('.series-grid');await b.evaluate('window.confirm=()=>true');
  await b.evaluate(`(()=>{const input=document.querySelector('#backup-input'),dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0))],'private.shiyecollection',{type:'application/json'}));input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
  try{await b.wait('.works-grid [data-id="cece-p1-project"]',60000);}catch(error){throw Error(error.message+' · '+await b.evaluate('document.querySelector("#toast")?.textContent')+' · '+b.errors.join('\n'));}
  for(let attempt=0;attempt<400;attempt++){if(await b.evaluate(`(async()=>{const db=await import('/src/store.js');return !!await db.get('meta','cece-native-goodnotes-v1');})()`))break;await b.sleep(30);}
  assert.ok(await b.evaluate(`(async()=>{const db=await import('/src/store.js');return !!await db.get('meta','cece-native-goodnotes-v1');})()`));
  const timings=[];
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,1000]]){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    for(let page=1;page<=4;page++){
      const selector=`[data-act="open-project"][data-id="cece-p${page}-project"]`;
      const start=Date.now();await b.click(selector,'#canvas-page');
      await b.evaluate(`Promise.all([...document.querySelectorAll('#canvas-page img')].map(async im=>{for(let i=0;i<150&&im.getAttribute('src')?.includes('#shiye-image=');i++)await new Promise(r=>setTimeout(r,20));await im.decode();}))`);
      const shapeFit=await b.evaluate(`(()=>{const bad=[];for(const o of document.querySelectorAll('#canvas-page .canvas-object.shape')){const im=o.querySelector('img'),a=o.getBoundingClientRect(),r=im?.getBoundingClientRect();if(r&&(Math.abs(a.width-r.width)>2||Math.abs(a.height-r.height)>2))bad.push({width:a.width,height:a.height,imageWidth:r.width,imageHeight:r.height});}return bad;})()`);assert.deepEqual(shapeFit,[],'Every vector preview must fit its own native object');
      assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      await b.sleep(100);const shot=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(`${directory}/${width}x${height}-p${page}.png`,Buffer.from(shot.data,'base64'));
      await b.click('[data-act="back-works"]','.works-grid');await b.sleep(20);
      const reopen=Date.now();await b.click(selector,'#canvas-page');timings.push({width,height,page,initial:reopen-start,reopen:Date.now()-reopen});await b.click('[data-act="back-works"]','.works-grid');
    }
  }
  assert.deepEqual(b.errors,[]);await writeFile(directory+'/timings.json',JSON.stringify(timings,null,2));console.log('Private native collection: scoped migration, four pages, 16 viewport screenshots and warm reopens verified',directory);
}finally{await b.close();}
