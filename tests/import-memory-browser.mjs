import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

// A full import batch used to retain a decoded photo and a corrected 4096 px
// canvas for every confirmed item. On iPad this exhausted the renderer before
// the review screen appeared. Exercise the actual browser pipeline at size.
const b=await browserHarness('shiye-import-memory','http://127.0.0.1:5173');
const {evaluate,click,wait,sleep}=b;
try{
  await wait('.series-grid');
  await click('.swift-tabs button:nth-child(2)','.asset-grid');
  await click('[data-act="import"]','.import-nav');
  await evaluate(`(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=2400;
    const c=canvas.getContext('2d');c.fillStyle='#eeeae0';c.fillRect(0,0,1800,2400);
    c.fillStyle='#fff';c.fillRect(90,100,1620,2200);
    c.fillStyle='#214a36';c.fillRect(500,700,800,850);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));
    const transfer=new DataTransfer();
    for(let i=0;i<12;i++)transfer.items.add(new File([blob],'photo-'+i+'.jpg',{type:'image/jpeg'}));
    const input=document.querySelector('#file-input');input.files=transfer.files;
    input.dispatchEvent(new Event('change'));
  })()`);
  const started=Date.now();
  for(let i=0;i<12;i++){
    while(true){
      assert.ok(Date.now()-started<180000,'Batch recognition stalled at photo '+(i+1));
      const current=await evaluate(`({review:!!document.querySelector('.review-candidates'),
        confirmed:[...document.querySelectorAll('.queue-item')].filter(e=>e.textContent.includes('已确认')).length,
        ready:!!document.querySelector('.import-inspect[aria-busy="false"] .import-candidate-tile'),
        button:!!document.querySelector('button.confirm-photo:not([disabled])')})`);
      if(current.review||current.confirmed>i)break;
      if(current.ready&&current.button){await click('button.confirm-photo');break;}
      await sleep(100);
    }
  }
  await wait('.review-candidates',60000);
  assert.match(await evaluate('document.body.innerText'),/保存 12 个素材/);
  await click('[data-act="import-back"]','.import-inspect');
  await click('[data-act="import-switch"][data-id="0"]');
  await wait('.import-inspect[aria-busy="false"] .import-candidate-tile',60000);
  assert.ok(await evaluate('document.querySelectorAll(".import-candidate-tile").length>0'));
  assert.deepEqual(b.errors,[]);
  console.log('Twelve 1800×2400 photos reached review and reopened the first photo');
}finally{await b.close();}
