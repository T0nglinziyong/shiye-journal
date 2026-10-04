// Synthetic images only, in an isolated browser context. No login or provider.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const directory=process.env.SHIYE_CRAFT_SCREENSHOTS||'/tmp/shiye-craft-browser';
await mkdir(directory,{recursive:true});
const b=await browserHarness('shiye-craft-v2',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192');
const report={viewports:[],synthetic:true,physicalDevice:false,providerCalls:0};
try{
  await b.wait('.series-grid');
  const fixture=await b.evaluate(`(async()=>{
    const {project}=await import('/src/domain.js'),{applyToolCalls}=await import('/src/creative.js');
    const styles=['torn','ticket_notch','postage','fringe','partial_tear'];
    const assets=Array.from({length:6},(_,i)=>({id:'craft-test-asset-'+i,title:'Synthetic craft '+i,kind:'paper',role:'support',tags:[],reviewStatus:'ready',physicalWidthMM:i===5?60:50,physicalHeightMM:i===5?50:36,supply:{quantity:1},blobId:'craft-test-image-'+i,originalBlobId:'craft-test-image-'+i,createdAt:new Date().toISOString()}));
    const aliases=Object.fromEntries(assets.map((a,i)=>['m'+(i+1),a.id]));
    const positions=[[.2,.18],[.5,.18],[.8,.18],[.28,.4],[.68,.4]];
    const items=styles.map((style,i)=>({asset:'m'+(i+1),piece:style,unit:0,operations:[{op:'edge',style,edges:['bottom'],depth_mm:2,period_mm:8,seed:42}],placement:{x:positions[i][0],y:positions[i][1],rotation:i===0?-12:0,z:10+i}}));
    items.push({asset:'m6',piece:'frame',unit:0,operations:[{op:'window',shape:'rectangle',box:[.25,.25,.5,.5]}],placement:{x:.35,y:.7,rotation:8,z:20}});
    items.push({asset:'m6',piece:'offcut',unit:0,operations:[{op:'crop',box:{unit:'ratio',mode:'keep',values:[.25,.25,.5,.5]}}],placement:{x:.75,y:.7,rotation:-8,z:21}});
    const p=project('Synthetic craft v2',{ratio:'a4'});
    const result=applyToolCalls({version:3,style:'自由构图',intent:null,paper:{color:'#f7f2e8',pattern:'plain'},items,graphics:[],text_blocks:[]},p.drafts[0],assets,aliases,{processing:'自由拆解',allowNoText:true});
    if(!result.committed||result.results.some(r=>!r.ok))throw Error(JSON.stringify(result.results));
    p.id='craft-v2-browser-project';p.drafts=[result.draft];p.activeDraftID=result.draft.id;p.isDraft=false;
    const blobs=[];
    for(const [i,a] of assets.entries()){
      const c=document.createElement('canvas');c.width=a.physicalWidthMM*8;c.height=a.physicalHeightMM*8;
      const x=c.getContext('2d');x.fillStyle=['#9baed0','#e7aa7a','#92bd9a','#d7a0ad','#b5a0ca','#e3c283'][i];x.fillRect(0,0,c.width,c.height);
      x.strokeStyle='#465c66';x.lineWidth=2;for(let k=20;k<c.width;k+=35){x.beginPath();x.moveTo(k,0);x.lineTo(k,c.height);x.stroke();}
      x.fillStyle='#233f48';x.font='26px sans-serif';x.fillText(i===5?'FRAME / OFFCUT':styles[i].toUpperCase(),15,45);
      blobs.push({id:a.blobId,data:await new Promise(r=>c.toBlob(r,'image/png'))});
    }
    const db=await new Promise((r,j)=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
    await new Promise((r,j)=>{const tx=db.transaction(['assets','blobs','projects'],'readwrite');assets.forEach(a=>tx.objectStore('assets').put(a));blobs.forEach(x=>tx.objectStore('blobs').put(x));tx.objectStore('projects').put(p);tx.oncomplete=r;tx.onerror=()=>j(tx.error);});db.close();
    return {id:p.id,count:result.draft.items.length,frame:result.draft.items.find(i=>i.creativePieceID==='frame').id,first:result.draft.items[0].id};
  })()`);
  assert.equal(fixture.count,7);
  await b.command('Page.reload');await b.wait('.series-grid');
  await b.click('[data-route="matching"]','.matching-page');
  assert.ok(await b.evaluate('[...document.querySelector("#match-processing").options].some(o=>o.value==="AI 自主加工")'));
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await b.click('[data-route="works"]','.works-grid');
    await b.click('[data-act="open-project"][data-id="'+fixture.id+'"]','#canvas-page');
    await b.evaluate(`(async()=>{for(let attempt=0;attempt<200;attempt++){const images=[...document.querySelectorAll('#canvas-page .canvas-object.material img')];if(images.length===7&&images.every(im=>im.complete&&im.naturalWidth>0&&!im.src.includes('#shiye-image=')))return;await new Promise(r=>setTimeout(r,25));}throw Error('Synthetic images did not decode');})()`);
    const geometry=await b.evaluate(`(()=>{const nodes=[...document.querySelectorAll('#canvas-page .canvas-object.material')];const frame=nodes.find(n=>n.dataset.object===${JSON.stringify(fixture.frame)});return {count:nodes.length,polygons:nodes.filter(n=>getComputedStyle(n).clipPath.startsWith('polygon')).length,windowMask:getComputedStyle(frame).maskImage!=='none',overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
    assert.equal(geometry.count,7);assert.ok(geometry.polygons>=5);assert.equal(geometry.windowMask,true);assert.equal(geometry.overflow,false);
    await b.click('[data-object="'+fixture.first+'"]');
    assert.equal(await b.evaluate('document.querySelectorAll("#canvas-page .canvas-object.material").length'),7);
    const clip=await b.evaluate('(()=>{const r=document.querySelector("#canvas-page").getBoundingClientRect();return {x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(r.width,innerWidth-Math.max(0,r.x)),height:Math.min(r.height,innerHeight-Math.max(0,r.y)),scale:1};})()');
    const shot=await b.command('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false});
    await writeFile(`${directory}/${width}x${height}-craft.png`,Buffer.from(shot.data,'base64'));
    report.viewports.push({width,height,...geometry});
    await b.click('[data-act="back-works"]','.works-grid');
  }
  await b.command('Page.reload');await b.wait('.series-grid');
  const persisted=await b.evaluate(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result);});const p=await new Promise(r=>{const q=db.transaction('projects').objectStore('projects').get(${JSON.stringify(fixture.id)});q.onsuccess=()=>r(q.result);});db.close();return p.drafts[0].items.map(i=>({piece:i.creativePieceID,steps:i.materialSteps}));})()`);
  assert.equal(persisted.length,7);assert.equal(persisted[0].steps[0].op,'edge');
  assert.deepEqual(b.errors,[]);report.reopenPreserved=true;report.consoleErrors=[];report.passed=true;
  await writeFile(directory+'/report.json',JSON.stringify(report,null,2));
  console.log('CRAFT_BROWSER_PASS',JSON.stringify(report));
}catch(error){report.passed=false;report.error=error.message;await writeFile(directory+'/report.json',JSON.stringify(report,null,2));throw error;}
finally{await b.close();}
