import {Window} from 'happy-dom';
import {stubCanvas} from './dom-canvas-stub.mjs';
import {builtApp,waitFor} from './built-app.mjs';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

const root=new URL('../dist/',import.meta.url);
const html=await readFile(new URL('index.html',root),'utf8');
const win=new Window({url:'https://shiye.test/',settings:{enableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true}});
win.document.body.innerHTML=html.match(/<body>([\s\S]*)<\/body>/)[1];
stubCanvas(win);
Object.defineProperty(win.document,'fonts',{value:{load:async()=>[]},configurable:true});
win.indexedDB=indexedDB;win.IDBKeyRange=IDBKeyRange;
win.structuredClone=structuredClone;
win.fetch=async()=>({ok:true,blob:async()=>new Blob(['image'],{type:'image/png'}),json:async()=>JSON.parse(await readFile(new URL('cece/collection.json',root),'utf8'))});
win.URL.createObjectURL=()=>`blob:test-${Math.random()}`;win.URL.revokeObjectURL=()=>{};
win.eval(await builtApp(root,html,win));
await new Promise(resolve=>setTimeout(resolve,500));
const $=selector=>{const el=win.document.querySelector(selector);assert.ok(el,`missing ${selector}`);return el;};
const click=selector=>$(selector).click();

for(const [width,height] of [[320,640],[390,844],[700,1024],[768,1024],[1024,768],[1440,900],[2560,1440]]){
  win.innerWidth=width;win.innerHeight=height;win.dispatchEvent(new win.Event('resize'));
  assert.ok($('.main-nav [data-route="library"]'));
  assert.ok($('.main-nav [data-route="matching"]'));
  assert.ok($('.main-nav [data-route="works"]'));
  assert.ok($('#top-settings'));
  click('[data-route="library"]');assert.ok($('.series-grid'));
  click('.swift-tabs button:nth-child(2)');assert.ok($('.asset-grid .action-card'));
  click('[data-act="detail"]');assert.ok($('.detail-columns'));
  click('[data-act="detail-edit"]');assert.ok($('#modal').open);
  click('#modal .modal-close');if($('#modal').open)$('#modal').close();
  click('[data-act="detail-back"]');
  click('[data-route="matching"]');assert.ok($('.matching-page'));
  click('[data-route="works"]');assert.ok($('.works-grid'));
  assert.equal($('#work-kind').options.length,3);
  assert.equal($('#work-status').options.length,5);
  assert.equal($('#work-sort').options.length,6);
  $('.card[data-act="open-project"]').dispatchEvent(new win.MouseEvent('contextmenu',{bubbles:true}));click('#project-meta-preview');assert.ok($('.project-preview-cover'));
  click('[data-act="project-meta"]');assert.ok($('#project-meta-template'));
  $('#project-meta-used').value='used';click('#project-meta-save');
  assert.ok($('.project-preview-actions'));
  click('[data-act="preview-back"]');
  click('.work-entry');assert.ok($('.import-nav'));
  assert.ok($('.import-source-actions'));
  click('[data-act="import-exit"]');
  click('[data-act="open-project"]');await waitFor(()=>win.document.body.classList.contains('editing'));assert.ok($('.swift-editor-workspace'));
  const canvas=$('#canvas-page');
  assert.ok(Number.isFinite(parseFloat(canvas.style.width))&&parseFloat(canvas.style.width)>0);
  assert.ok(Number.isFinite(parseFloat(canvas.style.height))&&parseFloat(canvas.style.height)>0);
  assert.ok($('.swift-editor-toolbar'));
  click('.swift-editor-head [data-act="back-works"]');
  click('#top-settings');assert.ok($('.settings-list'));
  for(const label of ['AI 与创作','导入与识别','界面与素材库','数据与诊断']){
    [...win.document.querySelectorAll('[data-act="settings-open"]')].find(el=>el.dataset.val===label).click();
    assert.ok($('.settings-detail'));
    click('[data-act="settings-back"]');
  }
  click('[data-act="settings-back"]');
}
await win.happyDOM.abort();
console.log('Route parity smoke: 7 viewports, collection, detail, matching, works, import, editor and 4 settings sections');
