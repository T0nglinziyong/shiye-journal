import test from 'node:test';
import assert from 'node:assert/strict';
import {deletedCardHTML,mountRecentlyDeleted} from '../src/recently-deleted-ui.js';
import {Window} from 'happy-dom';

const helpers = {
  esc:value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
  imgTag:() => '<img alt="素材封面">',
  workCover:() => '<span class="work-material">作品封面</span>'
};
test('deleted work keeps its cover and places recovery actions in the text area', () => {
  const item = {id:'p1', title:'旧作品', drafts:[{id:'d1',canvas:{width:800,height:600},paperColor:'#ffffff'}], activeDraftID:'d1'};
  const html = deletedCardHTML({id:'trash-1',kind:'project',item,date:'2026-09-30T00:00:00Z'}, 'project', helpers);
  assert.match(html, /作品封面/);
  assert.ok(html.indexOf('class="card-image"') < html.indexOf('class="card-body"'));
  assert.ok(html.indexOf('class="card-body"') < html.indexOf('class="deleted-actions"'));
  assert.match(html, /data-recover="trash-1"/);
  assert.match(html, /data-remove="trash-1"/);
});

test('deleted asset keeps its original thumbnail and escapes the title', () => {
  const html = deletedCardHTML({id:'t',kind:'asset',item:{title:'A < B'},date:'2026-09-30T00:00:00Z'}, 'asset', helpers);
  assert.match(html, /素材封面/);
  assert.match(html, /A &lt; B/);
  assert.ok(html.indexOf('class="deleted-actions"') > html.indexOf('class="card-body"'));
});

test('material and work recently deleted share the fixed compact bottom selection tray',()=>{
  const previousDocument=globalThis.document;
  const win=new Window({url:'https://example.test'});
  globalThis.document=win.document;
  try{
    for(const kind of ['asset','project']){
      const view=win.document.createElement('main');
      view.innerHTML='<div class="view-head"><div class="actions"></div></div><div class="swift-tabs"></div><div class="grid"></div><div class="filters"></div>';
      win.document.body.append(view);
      mountRecentlyDeleted({
        view,state:{trash:[],preferences:{maxPageItems:20}},
        db:{},render:()=>{},toast:()=>{},esc:String,imgTag:()=>'',workCover:()=>''
      },kind);
      const tray=view.querySelector('.deleted-selection-tray');
      assert.ok(tray);
      assert.equal(tray.classList.contains('library-management-tray'),true);
      assert.equal(tray.hidden,true);
      const buttons=[...tray.querySelectorAll(':scope > button')];
      assert.deepEqual(buttons.map(b=>b.textContent),['全选页面','清空选择','恢复所选','彻底删除所选']);
      assert.ok(buttons.every(b=>b.querySelector('.selection-action-label')));
      view.querySelector('[data-trash-select]').click();
      assert.equal(tray.hidden,false);
      assert.ok(tray.querySelector('[data-trash-remove]').disabled);
      view.querySelector('[data-trash-select]').click();
      assert.equal(tray.hidden,true);
      view.remove();
    }
  }finally{globalThis.document=previousDocument;win.close();}
});
