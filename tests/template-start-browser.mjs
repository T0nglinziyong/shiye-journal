import assert from 'node:assert/strict';
import {installUiCloudBase} from './fixtures/ui-cloudbase-harness.mjs';
import {browserHarness} from './browser-harness.mjs';

const assets=[['photo','照片','photo',45,60],['paper','纸片','paper',65,45]].map(([id,title,kind,width,height])=>({
  id,blobId:id,title,kind,physicalWidthMM:width,physicalHeightMM:height,
  staticPath:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="50"%3E%3Crect width="40" height="50" fill="%2388a897"/%3E%3C/svg%3E',
  reviewStatus:'ready',seriesID:null,tags:[],supply:{quantity:1}
}));
const b=await browserHarness('shiye-template-start',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5193',async({command})=>{
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`(${installUiCloudBase.toString()})(window,{assets:${JSON.stringify(assets)}});`});
});
try{
  await b.wait('.series-grid');
  await b.click('[data-route="matching"]','.match-stage-section');
  await b.click('.match-shelf-tabs [role="tab"]:nth-child(2)');
  const shelf=await b.evaluate('[...document.querySelectorAll(".match-rec")].map(node=>node.dataset.matchAsset)');
  assert.ok(shelf.includes('photo')&&shelf.includes('paper'),JSON.stringify({shelf,records:await b.evaluate('[...window.__SHIYE_UI_CLOUD__.state.records.keys()].slice(0,8)'),errors:b.errors}));
  for(const id of ['photo','paper']){
    await b.click(`.match-rec[data-match-asset="${id}"] [data-act="basket"]`);
    await b.wait(`.match-stage-item[data-match-asset="${id}"]`);
  }
  for(const section of ['match-stage-section','match-recommendations']){
    const summary=`.${section} > summary`;
    const before=await b.evaluate(`document.querySelector('.${section}').getBoundingClientRect().height`);
    await b.click(summary);
    assert.equal(await b.evaluate(`document.querySelector('.${section}').open`),false);
    assert.ok(await b.evaluate(`document.querySelector('.${section}').getBoundingClientRect().height`)<before);
    await b.click(summary);
    assert.equal(await b.evaluate(`document.querySelector('.${section}').open`),true);
  }
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`${width}px 出现横向溢出`);
  }
  await b.click('[data-act="create-from-basket"]','.manual-layout-dialog');
  const choice=await b.evaluate(`(()=>{const node=[...document.querySelectorAll('[data-manual-template]')].find(item=>item.dataset.manualTemplate&&!['stage'].includes(item.dataset.manualTemplate));return node&&{id:node.dataset.manualTemplate,slots:node.querySelectorAll('.manual-template-slot').length,graphics:node.querySelectorAll('.manual-template-slot.graphic').length,text:node.textContent}})()`);
  assert.ok(choice?.slots>0&&/^(D14|D15|D16|S0|XHS-)/.test(choice.id),JSON.stringify(choice));
  assert.match(choice.text,/匹配.*空位/);
  try{await b.click(`[data-manual-template="${choice.id}"]`,'#canvas-page');}
  catch(error){throw Error(error.message+' '+JSON.stringify({dialog:await b.evaluate('document.querySelector(".manual-layout-dialog")?.textContent'),errors:b.errors}));}
  assert.ok(await b.evaluate('!!document.querySelector("#canvas-page canvas")'));
  assert.deepEqual(b.errors,[]);
  console.log('Collapsible matching sections and ranked manual template preview passed');
}finally{await b.close();}
