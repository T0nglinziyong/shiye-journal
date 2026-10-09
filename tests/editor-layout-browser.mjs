// Isolated non-cloud visual acceptance for desktop, tablet and mobile editor.
// Run manually if GitHub Actions minutes are exhausted.
// SHIYE_TEST_URL=http://127.0.0.1:5173 node tests/editor-layout-browser.mjs
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';

const output=process.env.SHIYE_EDITOR_LAYOUT_SCREENSHOTS||'/tmp/shiye-editor-layout';
await mkdir(output,{recursive:true});
const b=await browserHarness('shiye-editor-layout',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {command,evaluate,click,wait,sleep}=b;
const sizes=[[320,640],[390,844],[430,932],[700,1024],[768,1024],
  [1024,768],[1440,900],[1920,1080],[2560,1440]];
const reports=[];
async function screenshot(name,width,height){
  const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(output+'/'+width+'x'+height+'-'+name+'.png',Buffer.from(shot.data,'base64'));
}
async function closePopup(){
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await wait('.swift-popover',1000).catch(()=>{});
}
try{
  await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  for(const [width,height] of sizes){
    await command('Emulation.setDeviceMetricsOverride',{width,height,
      deviceScaleFactor:width===390||width===768?2:1,mobile:width<700});
    await sleep(80);
    const header=await evaluate('(()=>({actions:[...document.querySelectorAll(".swift-editor-head .actions > button:not([hidden])")].map(b=>b.textContent.trim()),saved:document.querySelectorAll(".swift-editor-head .swift-auto-saved").length,tools:document.querySelectorAll(".canvas-editor-utilities > button").length,canvas:!!document.querySelector("#canvas-page"),overflow:document.documentElement.scrollWidth-innerWidth}))()');
    assert.deepEqual(header.actions,['完成','导出'],JSON.stringify({width,header}));
    assert.equal(header.saved,0);
    assert.equal(header.tools,3);
    assert.equal(header.canvas,true);
    assert.ok(header.overflow<=1,JSON.stringify({width,header}));
    await click('[data-val="material"]','.swift-material-picker');
    const material=await evaluate('(()=>{const p=document.querySelector(".swift-material-picker"),g=p.querySelector(".canvas-picker-grid"),r=p.getBoundingClientRect(),a=document.querySelector("[data-val=material]").getBoundingClientRect(),cols=getComputedStyle(g).gridTemplateColumns.split(" ").filter(Boolean);return {cols:cols.length,x:r.left,y:r.top,right:r.right,bottom:r.bottom,anchorBottom:a.bottom,scrollable:getComputedStyle(g).overflowY}})()');
    assert.equal(material.cols,width>=900?3:2,JSON.stringify({width,material}));
    assert.ok(material.x>=10&&material.y>=material.anchorBottom-1&&material.right<=width+1&&material.bottom<=height+1,JSON.stringify({width,material}));
    assert.ok(material.right-material.x<=444,'Picker exceeds compact width: '+JSON.stringify({width,material}));
    assert.ok(material.bottom-material.y<=Math.min(500,height*.75),'Picker too tall: '+JSON.stringify({height,material}));
    assert.ok(['auto','scroll'].includes(material.scrollable),JSON.stringify(material));
    await screenshot('material-responsive',width,height);
    await closePopup();
    await click('[data-val="shape"]','.swift-shape-picker');
    const shape=await evaluate('(()=>{const p=document.querySelector(".swift-shape-picker"),g=p.querySelector(".canvas-picker-grid"),r=p.getBoundingClientRect(),c=getComputedStyle(g).gridTemplateColumns.split(" ").filter(Boolean),buttons=[...g.querySelectorAll("button")];return {cols:c.length,x:r.left,right:r.right,top:r.top,bottom:r.bottom,first:buttons[0]?.getBoundingClientRect().width,tile:buttons[0]?getComputedStyle(buttons[0]).overflow:null};})()');
    assert.equal(shape.cols,width>=900?3:2,JSON.stringify({width,shape}));
    assert.ok(shape.x>=10&&shape.right<=width+1&&shape.bottom<=height+1,JSON.stringify({width,shape}));
    assert.ok(shape.right-shape.x<=444&&shape.bottom-shape.top<=Math.min(550,height*.8),JSON.stringify({width,shape}));
    assert.ok(shape.first>=92&&shape.first<=150,'Thumbnail size outside useful bounds: '+JSON.stringify({width,shape}));
    await screenshot('shape-responsive',width,height);
    await closePopup();
    await click('[data-val="paper"]','.swift-popover');
    const paper=await evaluate('(()=>{const r=document.querySelector(".swift-popover").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()');
    assert.ok(paper.left>=10&&paper.right<=width+1&&paper.top>=10&&paper.bottom<=height+1,JSON.stringify({width,paper}));
    await screenshot('paper-menu',width,height);
    await closePopup();
    reports.push({width,height,header,material,shape,paper});
  }
  assert.deepEqual(b.errors,[],'Runtime browser console errors');
  await writeFile(output+'/report.json',JSON.stringify(reports,null,2));
  console.log('Editor desktop, phone and tablet visual parity PASSED:',reports.length,'screens',output);
}finally{await b.close();}
