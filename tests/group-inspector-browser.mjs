import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
const b=await browserHarness('shiye-group-inspector',(process.env.SHIYE_TEST_URL||'http://127.0.0.1:5193')+'/');
const button=async(text,scope='document')=>{await b.evaluate(`(()=>{const root=${scope};const el=[...root.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing button '+${JSON.stringify(text)});el.click();})()`);await b.sleep(60);};
const set=async(selector,value)=>{await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await b.sleep(60);};
const saved=()=>b.evaluate(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('shiye-pwa-full-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const rows=await new Promise((res,rej)=>{const r=db.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();return rows[0]?.drafts[0].layers.find(n=>n.type==='group');})()`);
try{
 await b.wait('.series-grid');await b.click('[data-route="works"]','.works-grid');await b.click('#work-create','#blank-create-confirm');await b.click('#blank-create-confirm','.upper-canvas');
 await b.click('[data-val="shape"]','[data-shape-kind="rectangle"]');await b.click('[data-shape-kind="rectangle"]');
 await b.click('[data-val="shape"]','[data-shape-kind="ellipse"]');await b.click('[data-shape-kind="ellipse"]');
 await b.click('[data-val="layers"]','[data-layer-pick]');await button('多选');await button('◇rectangle');await button('组合所选');await b.click('[data-val="layers"]');
 await b.click('[aria-label="编辑组合"]','#inspector-group-name');
 for(let i=0;i<40&&!await saved();i++)await b.sleep(100);const before=await saved();assert.ok(before?.children.length===2);
 await set('#inspector-group-name','标题与圈注');await set('#inspector-opacity','.65');await b.click('#inspector-group-shadow-enabled');await set('#inspector-group-shadow-color','#745539');await set('#inspector-group-shadow-blur','2');
 await button('1. 圆形／椭圆');await b.wait('#inspector-fill');await set('#inspector-fill','#d2a46c');await button('返回组合 · 标题与圈注');
 assert.deepEqual(await saved(),before,'group and child edits remain staged');await b.click('.floating-scene-panel-actions .primary');
 for(let i=0;i<40&&(await saved())?.name!=='标题与圈注';i++)await b.sleep(100);const after=await saved();assert.equal(after.opacity,.65);assert.equal(after.shadow.color,'#745539');assert.equal(after.children.find(c=>c.kind==='ellipse').fill,'#d2a46c');
 for(const child of before.children){const next=after.children.find(c=>c.id===child.id);for(const key of ['x','y','width','height','rotation'])assert.equal(next[key],child[key]);}
 await b.click('[aria-label="编辑组合"]','#inspector-group-name');await set('#inspector-group-name','放弃这次修改');await b.click('.floating-scene-panel-actions button:not(.primary)');
 assert.deepEqual(await saved(),after);assert.deepEqual(b.errors,[]);console.log('GROUP_INSPECTOR_BROWSER_PASS: group and child edit, isolated save/discard, original geometry retained');
}finally{await b.close();}
