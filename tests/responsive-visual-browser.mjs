// Synthetic visual contracts only; never mutates the user's cloud library.
// Run against an isolated Vite dev server: npm run test:responsive-browser.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';

const directory=process.env.SHIYE_RESPONSIVE_SCREENSHOTS||'/tmp/shiye-responsive-review';
await mkdir(directory,{recursive:true});
const {command,evaluate,click,wait,sleep}=await browserHarness(
  'shiye-responsive-review',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173'
);
const sizes=[[320,640],[390,844],[430,932],[700,1024],[768,1024],[1024,768],[1440,900],[2560,1440]];
const report=[];
const choose=(scope,label)=>evaluate(
  '(async()=>{const element=[...document.querySelectorAll('+JSON.stringify(scope+' button')+')]'+
  '.find(b=>b.textContent.trim()==='+JSON.stringify(label)+');'+
  'if(!element)throw Error("Missing action: '+label+'");element.click();})()'
);
const frames=()=>evaluate('document.documentElement.scrollWidth-innerWidth');
async function screenshot(name,width,height){
  await sleep(90);
  assert.ok((await frames())<=1,'Viewport has horizontal overflow: '+name);
  const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(directory+'/'+width+'x'+height+'-'+name+'.png',Buffer.from(shot.data,'base64'));
}
async function verifyTray(expected){
  const rects=await evaluate('(()=>{const tray=document.querySelector(".library-management-tray:not([hidden])");'+
    'if(!tray)return null;return [...tray.querySelectorAll(":scope > button")].map(b=>{'+
    'const r=b.getBoundingClientRect();return {label:b.textContent.trim(),width:r.width,height:r.height}})})()');
  assert.ok(rects,'selection tray not visible');
  assert.equal(rects.length,expected,'selection count');
  for(const rect of rects){
    assert.ok(Math.abs(rect.width-rects[0].width)<=1.1,JSON.stringify(rects));
    assert.ok(Math.abs(rect.height-36)<=1.1,JSON.stringify(rects));
  }
  assert.ok(rects.some(row=>row.label==='更多操作'));
  assert.ok(rects.some(row=>row.label.startsWith('删除')));
  assert.ok(rects.every(row=>row.height<=37),'The selection buttons must remain compact');
}
async function verifyImportGeometry(width){
  const metrics=await evaluate('(()=>{'+
    'const host=document.createElement("div");host.style.cssText="position:fixed;left:0;top:-5000px;visibility:hidden;pointer-events:none;width:'+Math.min(width-24,880)+'px";'+
    'host.innerHTML=' + JSON.stringify(
      '<section class="import-review"><div class="review-candidates">'+
      '<div class="review-candidate review-background-card">'+
      '<div class="review-thumbnail import-work-paper-preview plain">'+
      '<button type="button" class="review-paper-control" data-import-paper-options="0">页面背景</button>'+
      '</div></div>'+
      '<div class="review-candidate selected" data-index="0" data-candidate="0">'+
      '<button><div class="review-thumbnail"><img alt="素材" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="></div>'+
      '<strong>素材 1</strong><small>20 × 30 mm</small></button></div>'+
      '</div></section>'+
      '<section class="import-inspect import-snapshot-inspect"><div class="inspect-columns">'+
      '<section class="panel import-preparation" style="height:610px"></section>'+
      '<section class="panel import-inspector"><h2>页面与颜色校正</h2>'+
      '<div class="inspector-scroll"><div class="inspector-settings">'+
      '<label>页面规格<select><option>A4</option></select></label>'+
      '<label>页面方向<select><option>纵向</option></select></label>'+
      '<label class="toggle-row">校正白纸色偏<input type="checkbox"></label>'+
      '</div></div><button class="btn primary confirm-photo">→ 确认</button></section>'+
      '</div></section>'
    )+
    ';document.body.append(host);const background=host.querySelector(".review-background-card .review-thumbnail").getBoundingClientRect(),'+
    'material=host.querySelector("[data-candidate] .review-thumbnail").getBoundingClientRect(),'+
    'button=host.querySelector(".review-paper-control").getBoundingClientRect(),'+
    'inspector=host.querySelector(".import-snapshot-inspect .import-inspector").getBoundingClientRect();'+
    'host.remove();return {backgroundH:background.height,materialH:material.height,buttonCenter:Math.abs((button.top+button.bottom)/2-(background.top+background.bottom)/2),inspectorH:inspector.height};})()');
  assert.ok(Math.abs(metrics.backgroundH-metrics.materialH)<=1.1,JSON.stringify(metrics));
  assert.ok(metrics.backgroundH<=132,JSON.stringify(metrics));
  assert.ok(metrics.buttonCenter<=1.1,JSON.stringify(metrics));
  assert.ok(metrics.inspectorH<400,'Snapshot inspector must not reserve 580/610px: '+JSON.stringify(metrics));
}
async function verifyMobileNavigation(){
  const box=await evaluate('(()=>{const nav=document.querySelector(".main-nav").getBoundingClientRect(),'+
    'view=document.querySelector("#view"),space=parseFloat(getComputedStyle(view).paddingBottom);'+
    'return {navHeight:nav.height,navBottom:nav.bottom,viewport:innerHeight,space};})()');
  assert.ok(Math.abs(box.navBottom-box.viewport)<=1.1,JSON.stringify(box));
  assert.ok(box.space>=box.navHeight+25,'Catalog bottom content needs nav clearance: '+JSON.stringify(box));
}

try{
  await wait('.series-grid');
  for(const [width,height] of sizes){
    await command('Emulation.setDeviceMetricsOverride',{
      width,height,deviceScaleFactor:width===390||width===768?2:1,mobile:width<700
    });
    await click('[data-route="library"]','.series-grid');
    await choose('.view-head .actions','选择');
    await verifyTray(5);
    await screenshot('series-selection',width,height);
    await choose('.view-head .actions','完成');

    await click('.swift-tabs button:nth-child(2)','.asset-grid');
    await choose('.view-head .actions','选择');
    await verifyTray(6);
    await screenshot('material-selection',width,height);
    await choose('.view-head .actions','完成');

    await click('[data-route="works"]','.works-grid');
    await choose('.view-head .actions','选择');
    await verifyTray(5);
    await screenshot('works-selection',width,height);
    await choose('.view-head .actions','完成');

    await click('[data-route="matching"]','.matching-page');
    if(width<700)await verifyMobileNavigation();
    await screenshot('matching',width,height);
    await verifyImportGeometry(width);
    report.push({width,height,selection:true,import:true,navigation:true});
  }
  await writeFile(directory+'/report.json',JSON.stringify(report,null,2));
  console.log('Responsive visual regression: '+report.length+' viewports passed');
}catch(error){console.error('Responsive visual regression failed:',error);throw error;}
