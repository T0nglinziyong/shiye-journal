import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const directory=process.env.SHIYE_CRAFT_SCREENSHOTS||'/tmp/shiye-craft-browser';await mkdir(directory,{recursive:true});
const report={synthetic:true,viewports:[],providerCalls:0,physicalDevice:false};
const b=await browserHarness('shiye-presentation',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192',async({command})=>{
 await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.__cacheBlobReads=0;const get=IDBObjectStore.prototype.get;IDBObjectStore.prototype.get=function(key){if(this.name==='blobs'&&String(key).startsWith('cache-test-image'))window.__cacheBlobReads++;return get.apply(this,arguments);};`});
});
const named=async(selector,label)=>{
 await b.wait(selector);const found=await b.evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)return false;b.click();return true;})()`);assert.equal(found,true,'missing '+label);
};
const series='[data-act="series-detail"][data-id="cache-test-series"]';
const work='[data-act="open-project"][data-id="cache-test-project"]';
const variant='[data-variant="cache-test-variant"]';
async function decoded(selector){await b.wait(selector);await b.evaluate(`(async()=>{for(let i=0;i<400;i++){const images=[...document.querySelectorAll(${JSON.stringify(selector+' img')})];if(images.length&&images.every(im=>im.complete&&im.naturalWidth>0&&!im.src.includes('#shiye-image=')))return;await new Promise(r=>setTimeout(r,25));}const images=[...document.querySelectorAll(${JSON.stringify(selector+' img')})];throw Error('Cache fixture images did not decode: '+JSON.stringify({selector:${JSON.stringify(selector)},images:images.map(im=>({complete:im.complete,width:im.naturalWidth,src:im.src.slice(0,100)}))}));})()`);}
async function trip(){
 await b.click('[data-route="library"]','.series-grid');await b.evaluate(`document.querySelector(${JSON.stringify(series)}).scrollIntoView({block:'center'})`);await decoded(series);
 await b.click('[data-route="works"]','.works-grid');await b.evaluate(`document.querySelector(${JSON.stringify(work)}).scrollIntoView({block:'center'})`);await decoded(work);
 await b.click('[data-route="matching"]','.matching-page');await b.evaluate(`document.querySelector(${JSON.stringify(variant)}).scrollIntoView({block:'center'})`);await b.wait(variant+' .match-raster-preview');await decoded(variant+' .match-cover-preview');
}
try{
 await b.wait('.series-grid');
 await b.evaluate(`(async()=>{
  const {project}=await import('/src/domain.js'),{applyToolCalls}=await import('/src/creative.js');
  const now=new Date().toISOString(),a={id:'cache-test-asset',title:'缓存测试素材',kind:'paper',role:'support',tags:['缓存测试'],seriesID:'cache-test-series',reviewStatus:'ready',physicalWidthMM:50,physicalHeightMM:40,supply:{quantity:1},blobId:'cache-test-image',createdAt:now,updatedAt:now};
  const c=document.createElement('canvas');c.width=200;c.height=160;const x=c.getContext('2d');x.fillStyle='#8db09a';x.fillRect(0,0,200,160);x.fillStyle='#1d3f30';x.font='24px sans-serif';x.fillText('CACHE',35,85);const data=await new Promise(r=>c.toBlob(r,'image/png'));
  const p=project('缓存测试作品',{ratio:'a5'});p.id='cache-test-project';p.isDraft=false;
  const result=applyToolCalls({tools:[{name:'compose_page',arguments:{materials:[{asset:'m1',piece:'main',x:.5,y:.5}],texts:[{key:'caption',content:'缓存测试',width:.7,x:.5,y:.8,font_size:30}]}},{name:'finish_design',arguments:{summary:'synthetic'}}]},p.drafts[0],[a],{m1:a.id},{processing:'保留完整'});
  if(result.results.some(r=>!r.ok))throw Error(JSON.stringify(result.results));p.drafts=[result.draft];p.activeDraftID=result.draft.id;
  const session={id:'matching-session-v1',context:{basket:[a.id],coreIDs:[],excludedAssetIDs:[]},variants:[{id:'cache-test-variant',title:'缓存测试方案',status:'completed',progress:'已暂存',project:structuredClone(p),linkedProjectID:p.id}]};
  const db=await new Promise((r,j)=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
  await new Promise((r,j)=>{const tx=db.transaction(['assets','blobs','series','projects'],'readwrite');tx.objectStore('assets').put(a);tx.objectStore('blobs').put({id:a.blobId,data});tx.objectStore('series').put({id:a.seriesID,title:'缓存测试系列',introduction:'synthetic',createdAt:now,updatedAt:now});tx.objectStore('projects').put(p);tx.oncomplete=r;tx.onerror=()=>j(tx.error);});db.close();const local=await new Promise((resolve,reject)=>{const q=indexedDB.open('shiye-device-session-v1',1);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains('records'))q.result.createObjectStore('records',{keyPath:'key'});};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});await new Promise((resolve,reject)=>{const tx=local.transaction('records','readwrite');tx.objectStore('records').put({key:JSON.stringify(['browser','matching-session-v1']),record:session});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});local.close();
 })()`);
 await b.command('Page.reload');await b.wait('.series-grid');
 for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
  await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
  await trip();await trip();
  const before=await b.evaluate('window.__cacheBlobReads');
  await b.evaluate(`window.__warmVariantSrc=document.querySelector(${JSON.stringify(variant+' .match-raster-preview')}).src`);
  await trip();
  const after=await b.evaluate('window.__cacheBlobReads');assert.equal(after,before,'warm route revisit read image again');
  assert.equal(await b.evaluate(`window.__warmVariantSrc===document.querySelector(${JSON.stringify(variant+' .match-raster-preview')}).src`),true,'matching raster preview changed without scene changes');
  await b.click('[data-route="library"]','.series-grid');await b.click(series,'.series-contents');
  await named('#series-actions button,.view-head .actions button','选择');
  await b.click('[data-act="detail"][data-id="cache-test-asset"]');
  await b.click('[data-selection-more]','.selection-more-menu');
  const rows=await b.evaluate(`[...document.querySelectorAll('.selection-more-menu .popover-content>button')].map(b=>{const r=b.querySelector('.selection-action-label').getBoundingClientRect();return {x:r.x,height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width};})`);
  assert.ok(rows.length>=3);for(const row of rows){assert.ok(Math.abs(row.x-rows[0].x)<1);assert.ok(row.height>=43.9);assert.ok(Math.abs(row.width-rows[0].width)<1);}
  const shot=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(`${directory}/${width}x${height}-selection.png`,Buffer.from(shot.data,'base64'));
  await named('.selection-more-menu button','加入系列 ›');await b.wait('.selection-submenu');
  await b.click('[data-selection-more]');assert.equal(await b.evaluate('!!document.querySelector(".selection-more-menu,.selection-submenu")'),false);
  assert.equal(await b.evaluate('document.querySelector("[data-selection-more]").getAttribute("aria-expanded")'),'false');
  assert.equal(await b.evaluate('document.querySelector("[data-act=detail][data-id=cache-test-asset]").getAttribute("aria-pressed")'),'true');
  await b.click('[data-selection-more]','.selection-more-menu');await b.evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  assert.equal(await b.evaluate('!!document.querySelector(".selection-more-menu")'),false);
  await named('#series-actions button,.view-head .actions button','完成');
  report.viewports.push({width,height,menuAligned:true,toggleClosedChildren:true,selectionPreserved:true,escapeClosed:true,warmImageReads:after-before,rasterPreviewStable:true});
  await b.click('#series-return','.series-grid');
 }
 assert.deepEqual(b.errors,[]);report.passed=true;report.consoleErrors=[];
 await writeFile(directory+'/presentation-report.json',JSON.stringify(report,null,2));console.log('PRESENTATION_BROWSER_PASS',JSON.stringify(report));
}catch(error){report.passed=false;report.error=error.message;await writeFile(directory+'/presentation-report.json',JSON.stringify(report,null,2));throw error;}finally{await b.close();}
