import fs from 'node:fs';
import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
import {paperPolygonIoU} from '../src/paper-quad-optimized.js';

const root=process.env.SHIYE_RESEARCH_ROOT;
if(!root)throw Error('请设置 SHIYE_RESEARCH_ROOT 为研究交接包的解压目录');
const rows=JSON.parse(fs.readFileSync(root+'/fixtures/real_golden_manifest.json','utf8')).cases
  .filter(row=>!process.env.SHIYE_CASE||String(row.case)===process.env.SHIYE_CASE);
const report=[];
for(const row of rows){
  const b=await browserHarness('shiye-research-import-ui-'+row.case,process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
  try{
    await b.wait('.series-grid');
    await b.click('.swift-tabs button:nth-child(2)','.asset-grid');
    await b.click('[data-act="import"]','.import-nav');
    const encoded=fs.readFileSync(root+'/'+row.raw).toString('base64');
    await b.evaluate(`(()=>{
      const bytes=Uint8Array.from(atob(${JSON.stringify(encoded)}),c=>c.charCodeAt(0));
      const input=document.querySelector('#file-input'),data=new DataTransfer();
      data.items.add(new File([bytes],'case${row.case}.jpg',{type:'image/jpeg'}));
      input.files=data.files;input.dispatchEvent(new Event('change'));
    })()`);
    await b.wait('.paper-handle',90000);
    const idleStarted=Date.now();
    while(Date.now()-idleStarted<90000){
      if(await b.evaluate('document.querySelector(".import-inspect")?.getAttribute("aria-busy")==="false"'))break;
      await b.sleep(50);
    }
    assert.equal(await b.evaluate('document.querySelector(".import-inspect")?.getAttribute("aria-busy")'),'false');
    const automatic=await b.evaluate(`(()=>{
      const overlay=document.querySelector('.paper-corner-overlay');
      return {count:document.querySelectorAll('.import-candidate-tile').length,
        corners:overlay?[...overlay.querySelectorAll('.paper-handle')].map(e=>({
          x:parseFloat(e.style.left)/overlay.clientWidth,
          y:parseFloat(e.style.top)/overlay.clientHeight
        })):[]};
    })()`);
    console.log(JSON.stringify({case:row.case,automatic}));
    const rawSize=await b.evaluate('({w:document.querySelector("#crop-preview img").naturalWidth,h:document.querySelector("#crop-preview img").naturalHeight})');
    const expectedCorners=row.corners_original_px.map(([x,y])=>({x:x/rawSize.w,y:y/rawSize.h}));
    assert.equal(automatic.corners.length,4,`案例 ${row.case} 自动纸角未找到`);
    assert.ok(paperPolygonIoU(automatic.corners,expectedCorners)>=.97,
      `案例 ${row.case} 自动纸角与研究确认纸角偏差过大`);
    assert.equal(automatic.count,row.count,`案例 ${row.case} 自动校正后的素材数`);
    await b.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const autoScreenshot=await b.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(`/tmp/shiye-research-auto-case${row.case}-mobile.png`,Buffer.from(autoScreenshot.data,'base64'));
    await b.command('Emulation.setDeviceMetricsOverride',{width:1440,height:1200,deviceScaleFactor:1,mobile:false});
    const image=await b.evaluate('({width:document.querySelector("#crop-preview img").naturalWidth,height:document.querySelector("#crop-preview img").naturalHeight})');
    const target=row.corners_original_px.map(([x,y])=>({x:x/image.width,y:y/image.height}));
    await b.evaluate('document.querySelector(".paper-corner-overlay").scrollIntoView({block:"center"})');
    for(let i=0;i<4;i++){
      await b.evaluate(`document.querySelector('.paper-handle[data-corner="${i}"]').scrollIntoView({block:'center'})`);
      const position=await b.evaluate(`(()=>{
        const overlay=document.querySelector('.paper-corner-overlay').getBoundingClientRect(),
          handle=document.querySelector('.paper-handle[data-corner="${i}"]').getBoundingClientRect();
        return {startX:handle.left+handle.width/2,startY:handle.top+handle.height/2,
          targetX:overlay.left+overlay.width*${target[i].x},targetY:overlay.top+overlay.height*${target[i].y}};
      })()`);
      await b.command('Input.dispatchMouseEvent',{type:'mousePressed',x:position.startX,y:position.startY,button:'left',clickCount:1});
      await b.sleep(80);
      await b.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:position.targetX,y:position.targetY,button:'left',buttons:1});
      await b.sleep(80);
      await b.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:position.targetX,y:position.targetY,button:'left',clickCount:1});
      const actual=await b.evaluate(`(()=>{const o=document.querySelector('.paper-corner-overlay'),e=document.querySelector('.paper-handle[data-corner="${i}"]');return {x:parseFloat(e.style.left)/o.clientWidth,y:parseFloat(e.style.top)/o.clientHeight};})()`);
      assert.ok(Math.abs(actual.x-target[i].x)<.012&&Math.abs(actual.y-target[i].y)<.012,
        `案例 ${row.case} 第 ${i+1} 角拖动未生效：${JSON.stringify(actual)} vs ${JSON.stringify(target[i])}`);
    }
    const displayed=await b.evaluate('[...document.querySelectorAll(".paper-handle")].map(e=>({x:e.style.left,y:e.style.top}))');
    await b.click('[data-act="preview-crop"]','[data-act="apply-paper-preview"]');
    await b.click('[data-act="apply-paper-preview"]');
    const started=Date.now();let count=-1;
    while(Date.now()-started<90000){
      const state=await b.evaluate('({busy:document.querySelector(".import-inspect")?.getAttribute("aria-busy"),count:document.querySelectorAll(".import-candidate-tile").length})');
      if(state.busy==='false'&&state.count>0){count=state.count;break;}
      await b.sleep(50);
    }
    assert.equal(count,row.count,`案例 ${row.case} 手动应用研究四角后的网页素材数`);
    await b.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const mobile=await b.evaluate('({overflow:document.documentElement.scrollWidth-innerWidth,count:document.querySelectorAll(".import-candidate-tile").length,brokenImages:[...document.querySelectorAll(".candidate-thumb img")].filter(e=>!e.complete||e.naturalWidth===0).length})');
    assert.ok(mobile.overflow<=1,`案例 ${row.case} 手机版横向溢出`);
    assert.equal(mobile.brokenImages,0,`案例 ${row.case} 素材预览损坏`);
    const screenshot=await b.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(`/tmp/shiye-research-import-case${row.case}-mobile.png`,Buffer.from(screenshot.data,'base64'));
    report.push({case:row.case,automatic,count,mobile,displayed});
    console.log(JSON.stringify(report.at(-1)));
    assert.deepEqual(b.errors,[],`案例 ${row.case} 浏览器运行错误`);
  }finally{await b.close();}
}
console.log('Five real import UI cases passed:',report.map(row=>row.count).join('/'));
