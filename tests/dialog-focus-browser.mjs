import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const target=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192';
if(!['127.0.0.1','localhost'].includes(new URL(target).hostname))
  throw Error('弹窗测试只允许本机隔离站');
const browser=await browserHarness('shiye-dialog-focus',target);
try{
  await browser.wait('.series-grid');
  await browser.click('[data-route="works"]','.works-grid');
  await browser.click('#work-create','#blank-create-confirm');
  await browser.sleep(80);
  const opened=await browser.evaluate(`(()=>{
    const dialog=document.querySelector('[role="dialog"]');
    return {focused:dialog?.contains(document.activeElement),navInert:document.querySelector('.topbar').inert,
      active:document.activeElement?.outerHTML?.slice(0,180),dialog:dialog?.outerHTML?.slice(0,180)};
  })()`);
  assert.equal(opened.focused&&opened.navInert,true,
    '弹窗打开时焦点应在内部，背景导航不可操作：'+JSON.stringify(opened));
  await browser.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{
    key:'Escape',isComposing:true,bubbles:true,cancelable:true}))`);
  assert.equal(await browser.evaluate('!!document.querySelector("[role=dialog]")'),true,
    '中文输入法组合期间 Escape 不得关闭弹窗');
  await browser.command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await browser.sleep(50);
  assert.equal(await browser.evaluate('!!document.querySelector("[role=dialog]")'),false);
  assert.equal(await browser.evaluate('document.querySelector(".topbar").inert'),false);
  assert.deepEqual(browser.errors,[]);
  console.log('PASS: dialog focus, background isolation, IME Escape and restoration');
}finally{await browser.close();}
