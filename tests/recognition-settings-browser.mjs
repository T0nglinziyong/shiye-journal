import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const browser=await browserHarness('shiye-recognition-settings','http://127.0.0.1:5183');
try{
  await browser.wait('.series-grid');
  await browser.click('#top-settings','.settings-list');
  await browser.click('[data-act="settings-open"][data-val="导入与识别"]','#setting-candidate-discovery');
  assert.deepEqual(await browser.evaluate('([document.querySelector("#setting-candidate-discovery").value,document.querySelector("#setting-recognition").value])'),['unified','auto']);
  await browser.evaluate('(()=>{for(const [id,value] of [["setting-candidate-discovery","legacy"],["setting-recognition","morphgac"]]){const node=document.getElementById(id);node.value=value;node.dispatchEvent(new Event("change",{bubbles:true}));}})()');
  await browser.click('[data-act="settings-save"]','.series-grid');
  assert.deepEqual(await browser.evaluate('(()=>{const p=JSON.parse(localStorage.getItem("shiye-ui-preferences-v1"));return [p.candidateDiscovery,p.recognition]})()'),['legacy','morphgac']);
  await browser.click('#top-settings','.settings-list');
  await browser.click('[data-act="settings-open"][data-val="导入与识别"]','#setting-candidate-discovery');
  assert.deepEqual(await browser.evaluate('([document.querySelector("#setting-candidate-discovery").value,document.querySelector("#setting-recognition").value])'),['legacy','morphgac']);
  assert.deepEqual(browser.errors,[]);
  console.log('Recognition settings browser: new default and old algorithm rollback persist across route changes');
}finally{await browser.close();}
