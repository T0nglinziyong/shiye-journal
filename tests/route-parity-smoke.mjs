import {Window} from 'happy-dom';
import {stubCanvas} from './dom-canvas-stub.mjs';
import {builtApp,waitFor} from './built-app.mjs';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {installUiCloudBase} from './fixtures/ui-cloudbase-harness.mjs';

const root=new URL('../dist/',import.meta.url);
const html=await readFile(new URL('index.html',root),'utf8');
const win=new Window({url:'https://shiye.test/',settings:{enableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true}});
win.document.body.innerHTML=html.match(/<body>([\s\S]*)<\/body>/)[1];
stubCanvas(win);
Object.defineProperty(win.document,'fonts',{value:{load:async()=>[]},configurable:true});
win.indexedDB=indexedDB;win.IDBKeyRange=IDBKeyRange;
win.structuredClone=structuredClone;
installUiCloudBase(win);
win.URL.createObjectURL=()=>`blob:test-${Math.random()}`;win.URL.revokeObjectURL=()=>{};
win.eval(await builtApp(root,html,win));
await new Promise(resolve=>setTimeout(resolve,500));
const $=selector=>{const el=win.document.querySelector(selector);assert.ok(el,`missing ${selector}`);return el;};
const click=selector=>$(selector).click();
click('[data-route="works"]');
click('#work-create');
await waitFor(()=>!!win.document.querySelector('#blank-create-confirm'));
click('#blank-create-confirm');
await waitFor(()=>win.document.body.classList.contains('editing'));
click('.swift-editor-head [data-act="back-works"]');
await waitFor(()=>win.document.querySelector('#view').dataset.renderedRoute==='works');
assert.ok($('.card[data-act="open-project"]'));


for(const [width,height] of [[320,640],[390,844],[700,1024],[768,1024],[1024,768],[1440,900],[2560,1440]]){
  win.innerWidth=width;win.innerHeight=height;win.dispatchEvent(new win.Event('resize'));
  assert.ok($('.main-nav [data-route="library"]'));
  assert.ok($('.main-nav [data-route="matching"]'));
  assert.ok($('.main-nav [data-route="works"]'));
  assert.ok($('#top-settings'));
  click('[data-route="library"]');
  // Materials remembers its last tab when returning from Works/Matching.
  if(!win.document.querySelector('.series-grid'))click('.swift-tabs button:nth-child(1)');
  assert.ok($('.series-grid'));
  click('.swift-tabs button:nth-child(2)');assert.ok($('.asset-grid .action-card'));
  click('[data-route="matching"]');click('[data-route="works"]');click('[data-route="library"]');
  assert.ok($('.asset-grid .action-card'),'Returning to Materials preserves All Materials');

  assert.equal(win.document.querySelectorAll('[data-act="detail"]').length,27);
  click('[data-route="matching"]');assert.ok($('.matching-page'));
  click('[data-route="works"]');assert.ok($('.works-grid'));
  assert.equal($('#work-kind').options.length,3);
  assert.equal($('#work-status').options.length,4);
  assert.equal($('#work-sort').options.length,6);
  $('.card[data-act="open-project"]').dispatchEvent(new win.MouseEvent('contextmenu',{bubbles:true}));await waitFor(()=>!!win.document.querySelector('#project-meta-preview'));click('#project-meta-preview');assert.ok($('.project-preview-cover'));
  click('[data-act="project-meta"]');await waitFor(()=>!!win.document.querySelector('#project-meta-save'));assert.equal(win.document.querySelector('#project-meta-template'),null);
  $('#project-meta-used').value='used';click('#project-meta-save');
  assert.ok($('.project-preview-actions'));
  click('[data-act="preview-back"]');
  click('.swift-tabs button:nth-child(4)');assert.ok($('.journal-template-grid'));
  click('.journal-template-card');await waitFor(()=>!!win.document.querySelector('.journal-template-detail-card'));
  click('[data-template-back]');await waitFor(()=>!!win.document.querySelector('.journal-template-card'));
  click('.swift-tabs button:nth-child(2)');
  click('#work-import');assert.ok($('.import-nav'));
  assert.ok($('.import-source-actions'));
  click('[data-act="import-exit"]');
  click('.swift-tabs button:nth-child(3)');
  click('[data-act="open-project"]');await waitFor(()=>win.document.body.classList.contains('editing'));assert.ok($('.swift-editor-workspace'));
  const canvas=$('#canvas-page');
  assert.ok(Number.isFinite(parseFloat(canvas.style.width))&&parseFloat(canvas.style.width)>0);
  assert.ok(Number.isFinite(parseFloat(canvas.style.height))&&parseFloat(canvas.style.height)>0);
  assert.ok($('.swift-editor-toolbar'));
  click('.swift-editor-head [data-act="back-works"]');
  await waitFor(()=>win.document.querySelector('#view').dataset.renderedRoute==='works');
  click('#top-settings');assert.ok($('.settings-list'));
  for(const label of ['AI 与创作','导入与识别','界面与素材库','数据与诊断']){
    [...win.document.querySelectorAll('[data-act="settings-open"]')].find(el=>el.dataset.val===label).click();
    await waitFor(()=>!!win.document.querySelector('.settings-detail'));
    click('[data-act="settings-back"]');
    await waitFor(()=>!!win.document.querySelector('.settings-list'));
  }
  click('[data-act="settings-back"]');
}
await win.happyDOM.abort();
console.log('Route parity smoke: 7 viewports, empty collection, matching, works, import, editor and 4 settings sections');
