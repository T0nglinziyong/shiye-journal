import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const target=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192';
if(!['127.0.0.1','localhost'].includes(new URL(target).hostname))
  throw Error('设置测试只允许本机隔离站');
const browser=await browserHarness('shiye-settings-offline',target);
try{
  await browser.wait('.series-grid');
  for(const width of [390,1024]){
    await browser.command('Emulation.setDeviceMetricsOverride',
      {width,height:844,deviceScaleFactor:2,mobile:width<600});
    await browser.click('#top-settings');
    await browser.click('[data-act="settings-open"][data-val="数据与诊断"]');
    await browser.wait('#offline-state');
    assert.match(await browser.evaluate('document.querySelector("#offline-state").textContent'),/应用页面/);
    assert.match(await browser.evaluate('document.querySelector("[data-react-page=settingsData]")?.textContent||document.body.textContent'),/本机站点已用空间/);
    assert.ok(await browser.evaluate('document.documentElement.scrollWidth-innerWidth')<=1);
    await browser.click('[data-act="settings-back"]');
    await browser.click('[data-act="settings-back"]');
  }
  assert.deepEqual(browser.errors,[]);
  console.log('PASS: settings offline and local storage status on phone and desktop');
}finally{await browser.close();}
