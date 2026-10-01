import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const out='/tmp/shiye-organization-status';await mkdir(out,{recursive:true});
const b=await browserHarness('shiye-organization-status',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5191',async({command})=>{
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.setItem('shiye-ui-preferences-v1',JSON.stringify({recognition:'standard',autoOrganize:true}));
    localStorage.setItem('shiye-ai-settings-v1',JSON.stringify({provider:'custom',endpoint:'https://mock.invalid/organization',model:'synthetic',key:'synthetic-only',includeThumbnails:true,customVision:true}));
    window.__organizationReplies=[];const original=fetch;window.fetch=(url,options)=>url==='https://mock.invalid/organization'?new Promise(resolve=>window.__organizationReplies.push(resolve)):original(url,options);
  `});
});
const {command,evaluate,wait,click,sleep}=b;
const shot=async(name,w,h)=>{await sleep(50);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));const image=await command('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+w+'x'+h+'-'+name+'.png',Buffer.from(image.data,'base64'));};
try{
  await wait('.series-grid');await sleep(500);await click('.swift-tabs button:nth-child(2)','.asset-grid');await click('[data-act=import]','.import-nav');
  await evaluate(`(async()=>{const c=document.createElement('canvas');c.width=500;c.height=700;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,500,700);ctx.fillStyle='#467dac';ctx.fillRect(150,170,120,260);const blob=await new Promise(r=>c.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([blob],'synthetic.png',{type:'image/png'}));const input=document.querySelector('#file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
  await wait('.import-inspect[aria-busy="false"]',180000);await wait('.import-candidate-tile');await click('[data-act=import-confirm-photo]','.review-candidates');
  const seriesID=await evaluate(`(()=>{const select=document.querySelector('#batch-series');const option=[...select.options].find(o=>o.value&&o.value!=='__none__');select.value=option.value;select.dispatchEvent(new Event('change'));return option.value;})()`);
  await click('[data-act=confirm-import]','.import-done');await click('[data-act=import-exit]','.asset-grid');
  await wait('.asset-organization-badge[data-organization-status=running]');
  const id=await evaluate('document.querySelector(".asset-organization-badge").closest(".card").dataset.id');
  const card='.card[data-id="'+id+'"]';
  for(const [w,h] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});
    assert.equal(await evaluate(`document.querySelector('${card} .asset-organization-badge').textContent`),'正在整理');await shot('library',w,h);
    await click(card,'.detail-picture');await wait('.detail-picture .asset-organization-badge');await shot('detail',w,h);await click('[data-act=detail-back]','.asset-grid');
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false});
  await click('.swift-tabs button:first-child','.series-grid');await click('.card[data-id="'+seriesID+'"]','.series-contents');await wait(card+' .asset-organization-badge');await shot('series',1024,768);
  await click(card,'.detail-picture');await click('[data-act=detail-match]','.matching-page');await wait('.match-basket-item .asset-organization-badge');await shot('matching',1024,768);await click('[data-act=match-library]','.asset-grid');
  await click('.library-select-toggle');await click(card);assert.ok(await evaluate(`document.querySelector('${card}').classList.contains('batch-selected')`));
  await evaluate(`window.__organizationImage=document.querySelector('${card} img');window.__organizationScroll=scrollY;window.__organizationReplies.shift()(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({title:'蓝色长方形纸片',kind:'paper',role:'support',texture:'纸张',tags:['蓝色']})}}]}),{headers:{'Content-Type':'application/json'}}));`);
  for(let i=0;i<100;i++){if(await evaluate(`!document.querySelector('${card} .asset-organization-badge')`))break;await sleep(30);}
  assert.ok(await evaluate(`!document.querySelector('${card} .asset-organization-badge')&&document.querySelector('${card} img')===window.__organizationImage&&document.querySelector('${card}').classList.contains('batch-selected')&&scrollY===window.__organizationScroll`));
  assert.match(await evaluate(`document.querySelector('${card} h3').textContent`),/蓝色长方形纸片/);
  await click('.library-select-toggle');await click('.main-nav [data-route=library]','.series-grid');await click('.card[data-id="'+seriesID+'"]','.series-contents');
  assert.ok(await evaluate(`!!document.querySelector('${card}')`));assert.equal(await evaluate(`document.querySelector('${card} .asset-organization-badge')`),null);
  await click('.main-nav [data-route=library]','.series-grid');await click('.swift-tabs button:nth-child(2)','.asset-grid');await click('.library-select-toggle');
  const batchIDs=await evaluate("[...document.querySelectorAll('.asset-grid .card[data-act=detail]:not([hidden])')].slice(0,2).map(card=>card.dataset.id)");assert.equal(batchIDs.length,2);
  for(const id of batchIDs)await click('.card[data-id="'+id+'"]');
  const firstName=await evaluate(`document.querySelector('.card[data-id=${JSON.stringify(batchIDs[0])}] h3').textContent`);
  await evaluate("[...document.querySelectorAll('.library-management-tray button')].find(button=>button.textContent==='更多操作').click()");await wait('.selection-more-menu');
  await evaluate("[...document.querySelectorAll('.selection-more-menu button')].find(button=>button.textContent==='重新识别').click()");
  for(let i=0;i<100;i++){if(await evaluate('window.__organizationReplies.length===2'))break;await sleep(30);}
  assert.equal(await evaluate('window.__organizationReplies.length'),2,'two model requests should be in flight together');
  const reply=async(index,title)=>evaluate(`window.__organizationReplies.splice(${index},1)[0](new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({title:${JSON.stringify(title)},kind:'paper',role:'support',texture:'纸张',tags:['并行']})}}]}),{headers:{'Content-Type':'application/json'}}))`);
  await reply(1,'并行整理二');
  for(let i=0;i<100;i++){if(await evaluate(`document.querySelector('.card[data-id=${JSON.stringify(batchIDs[1])}] h3')?.textContent.includes('并行整理二')`))break;await sleep(30);}
  assert.equal(await evaluate(`document.querySelector('.card[data-id=${JSON.stringify(batchIDs[0])}] h3').textContent`),firstName,'unfinished asset must retain its old title');
  assert.ok(await evaluate(`document.querySelector('.card[data-id=${JSON.stringify(batchIDs[1])}] h3').textContent.includes('并行整理二')`));
  await shot('manual-partial',1024,768);await reply(0,'并行整理一');
  for(let i=0;i<100;i++){if(await evaluate(`!document.querySelector('.card[data-id=${JSON.stringify(batchIDs[0])}] .asset-organization-badge')`))break;await sleep(30);}
  assert.ok(await evaluate(`document.querySelector('.card[data-id=${JSON.stringify(batchIDs[0])}] h3').textContent.includes('并行整理一')`));
  assert.deepEqual(b.errors,[]);console.log('Organization status: 11 screenshots, parallel manual calls and per-item updates, import/model queue, route continuity, selection/scroll/image identity preserved. Synthetic model only.',out);
}finally{await b.close();}
