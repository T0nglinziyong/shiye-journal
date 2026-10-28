// Synthetic visual contracts only; never mutates the user's cloud library.
// Run against an isolated Vite dev server: npm run test:responsive-browser.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';

const directory=process.env.SHIYE_RESPONSIVE_SCREENSHOTS||'/tmp/shiye-responsive-review';
await mkdir(directory,{recursive:true});
const browser=await browserHarness(
  'shiye-responsive-review',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173'
);
const {command,evaluate,click,wait,sleep}=browser;
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
    'const r=b.getBoundingClientRect(),icon=b.querySelector(":scope > svg.shiye-icon"),'+
    'label=b.querySelector(":scope > .selection-action-label"),i=icon?.getBoundingClientRect(),'+
    't=label?.getBoundingClientRect();return {label:b.textContent.trim(),width:r.width,height:r.height,'+
    'icon:!!i,iconWidth:i?.width,iconInside:!i||(i.left>=r.left-1&&i.right<=r.right+1&&i.top>=r.top-1&&i.bottom<=r.bottom+1),'+
    'textInside:!!t&&t.left>=r.left-1&&t.right<=r.right+1,'+
    'noCollision:!i||!t||i.right<=t.left+1,overflow:b.scrollWidth-b.clientWidth}})})()');
  assert.ok(rects,'selection tray not visible');
  assert.equal(rects.length,expected,'selection count');
  for(const rect of rects){
    assert.ok(Math.abs(rect.width-rects[0].width)<=1.1,JSON.stringify(rects));
    assert.ok(Math.abs(rect.height-36)<=1.1,JSON.stringify(rects));
    assert.ok(rect.icon,'All batch controls must have a visible icon: '+JSON.stringify(rects));
    assert.ok(rect.iconWidth<=18,'Batch icon too large: '+JSON.stringify(rects));
    assert.ok(rect.iconInside&&rect.textInside&&rect.noCollision,
      'Batch icon or text is outside its button or overlapping: '+JSON.stringify(rects));
    assert.ok(rect.overflow<=1,'Batch button content overflows: '+JSON.stringify(rects));
  }
  assert.ok(rects.some(row=>row.label==='更多操作'));
  assert.ok(rects.some(row=>row.label.startsWith('删除')));
  assert.ok(rects.every(row=>row.height<=37),'The selection buttons must remain compact');
  return rects;
}
async function verifyDeletedTray(width,referenceWidth){
  const result=await evaluate('(()=>{const tray=document.querySelector(".deleted-selection-tray:not([hidden])");'+
    'const nav=document.querySelector(".main-nav"),r=tray?.getBoundingClientRect();'+
    'if(!r)return null;return {top:r.top,bottom:r.bottom,buttons:[...tray.querySelectorAll(":scope > button")].map(b=>{'+
    'const x=b.getBoundingClientRect(),icon=b.querySelector("svg.shiye-icon")?.getBoundingClientRect(),'+
    'label=b.querySelector(".selection-action-label")?.getBoundingClientRect();'+
    'return {height:x.height,width:x.width,iconInside:!!icon&&icon.left>=x.left-1&&icon.right<=x.right+1,'+
    'labelInside:!!label&&label.left>=x.left-1&&label.right<=x.right+1}}),'+
    'navTop:getComputedStyle(nav).position==="fixed"?nav.getBoundingClientRect().top:innerHeight,viewBottom:innerHeight};})()');
  assert.ok(result,'Recently deleted selection tray missing');
  assert.equal(result.buttons.length,4);
  assert.ok(result.buttons.every(x=>Math.abs(x.height-36)<=1.1&&x.iconInside&&x.labelInside),JSON.stringify(result));
  for(const button of result.buttons.slice(0,3))
    assert.ok(Math.abs(button.width-referenceWidth)<=1.1,
      'Only permanently delete may be wider than regular selection buttons: '+JSON.stringify({width,referenceWidth,result}));
  assert.ok(result.buttons[3].width>referenceWidth+10,
    'The irreversible delete button should be the only longer action: '+JSON.stringify({width,referenceWidth,result}));
  assert.ok(result.bottom<=result.navTop+1&&result.top>=0,
    'Deleted tray must not overlap mobile navigation or run off screen: '+JSON.stringify({width,result}));
}
async function verifyImportGeometry(width){
  const metrics=await evaluate('(()=>{'+
    'const host=document.createElement("div");host.style.cssText="position:fixed;left:0;top:-5000px;visibility:hidden;pointer-events:none;width:'+Math.min(width-24,880)+'px";'+
    'host.innerHTML=' + JSON.stringify(
      '<section class="import-review"><div class="review-candidates">'+
      '<div class="review-candidate review-background-card">'+
      '<div class="review-thumbnail import-work-paper-preview plain"></div>'+
      '<div class="review-paper-controls"><select><option>纯色</option></select><button>单栏</button><input type="color" value="#fcfaf0"></div></div>'+
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
    'controls=host.querySelector(".review-paper-controls").getBoundingClientRect(),'+
    'inspector=host.querySelector(".import-snapshot-inspect .import-inspector").getBoundingClientRect();'+
    'host.remove();return {backgroundH:background.height,materialH:material.height,controlsBelow:controls.top>=background.bottom-1&&controls.left>=background.left-1&&controls.right<=background.right+1,inspectorH:inspector.height};})()');
  assert.ok(Math.abs(metrics.backgroundH-metrics.materialH)<=1.1,JSON.stringify(metrics));
  assert.ok(metrics.backgroundH<=132,JSON.stringify(metrics));
  assert.equal(metrics.controlsBelow,true,JSON.stringify(metrics));
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
    await click('[data-route="library"]');
    if(!(await evaluate('!!document.querySelector(".series-grid")')))await click('.swift-tabs button:nth-child(1)','.series-grid');
    await choose('.view-head .actions','选择');
    const regularTray=await verifyTray(5);
    const regularWidth=regularTray[0].width;
    await screenshot('series-selection',width,height);
    await choose('.view-head .actions','完成');

    await click('.swift-tabs button:nth-child(2)','.asset-grid');
    await choose('.view-head .actions','选择');
    await verifyTray(6);
    await screenshot('material-selection',width,height);
    await choose('.view-head .actions','完成');

    await click('[data-route="works"]','#view[data-rendered-route="works"]');
    if(!(await evaluate('!!document.querySelector(".works-grid")')))await click('.swift-tabs button:nth-child(1)','.works-grid');
    await choose('.view-head .actions','选择');
    await verifyTray(5);
    await screenshot('works-selection',width,height);
    await choose('.view-head .actions','完成');

    await click('[data-route="library"]');
    if(!(await evaluate('!!document.querySelector(".series-grid")')))await click('.swift-tabs button:nth-child(1)','.series-grid');
    await click('.swift-tabs button:nth-child(4)','.recently-deleted-grid');
    await choose('.view-head .actions','选择');
    await verifyDeletedTray(width,regularWidth);
    await screenshot('asset-trash-selection',width,height);
    await click('[data-route="works"]','#view[data-rendered-route="works"]');
    await click('.swift-tabs button:nth-child(5)','.recently-deleted-grid');
    await choose('.view-head .actions','选择');
    await verifyDeletedTray(width,regularWidth);
    await screenshot('work-trash-selection',width,height);

    await click('[data-route="matching"]','.matching-page');
    if(width<700)await verifyMobileNavigation();
    await screenshot('matching',width,height);
    await verifyImportGeometry(width);
    report.push({width,height,selection:true,import:true,navigation:true});
  }
  // A restored matching route must publish its saved controls without a tab switch.
  await click('.match-preset-toggle input');
  await wait('.match-preset-toggle input:checked');
  await sleep(200);
  await command('Page.reload');
  await wait('.match-preset-toggle input:checked');
  assert.equal(await evaluate('document.querySelector(".match-preset-toggle input").checked'),true);
  await writeFile(directory+'/report.json',JSON.stringify(report,null,2));
  console.log('Responsive visual regression: '+report.length+' viewports passed');
}catch(error){
  console.error('Responsive visual regression failed:',error);
  console.error('Page state:',await evaluate('({route:document.querySelector("#view")?.dataset.renderedRoute,head:document.querySelector(".view-head")?.textContent?.slice(0,200),body:document.body.textContent.slice(0,300),errors:document.querySelector("#toast")?.textContent})').catch(()=>null));
  throw error;
}finally{
  await browser.close();
}
