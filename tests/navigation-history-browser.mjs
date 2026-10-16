import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const target=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192';
if(!['127.0.0.1','localhost'].includes(new URL(target).hostname))
  throw Error('导航测试只允许本机隔离站');
const browser=await browserHarness('shiye-navigation-history',target);
try{
  await browser.wait('.series-grid');
  await browser.click('[data-route="works"]','.works-grid');
  await browser.evaluate(`(()=>{
    const input=document.querySelector('#work-search');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'春天');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await browser.sleep(250);
  await browser.click('#top-settings');
  await browser.wait('[data-act="settings-back"]');
  await browser.command('Page.reload');
  await browser.wait('[data-act="settings-back"]');
  await browser.evaluate('history.back()');
  await browser.wait('#work-search');
  assert.equal(await browser.evaluate('document.querySelector("#work-search").value'),'春天');
  await browser.evaluate('history.back()');
  await browser.wait('.series-grid');
  await browser.evaluate('history.forward()');
  await browser.wait('#work-search');
  assert.equal(await browser.evaluate('document.querySelector("#work-search").value'),'春天');
  assert.deepEqual(browser.errors,[]);
  console.log('PASS: browser back/forward and refresh restore route and search state');
}finally{await browser.close();}
