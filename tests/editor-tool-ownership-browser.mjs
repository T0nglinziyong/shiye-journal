import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const browser=await browserHarness('shiye-editor-tool-ownership',
  process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {click,wait,evaluate}=browser;
try{
  await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await click('[data-val="text"]');
  assert.equal(await evaluate('document.querySelectorAll(".canvas-object.text").length'),0);
  await click('[data-val="shape"]','[data-shape-kind]');
  assert.equal(await evaluate('document.querySelectorAll(".canvas-object.shape").length'),0);
  await click('[data-val="material"]','.swift-material-picker');
  assert.equal(await evaluate('document.querySelector("#modal").open'),false);
  assert.deepEqual(browser.errors,[]);
  console.log('Editor tools open without inserting a default object or a legacy modal');
}finally{await browser.close();}
