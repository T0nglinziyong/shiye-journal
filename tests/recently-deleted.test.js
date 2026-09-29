import test from 'node:test';
import assert from 'node:assert/strict';
import {deletedCardHTML} from '../src/recently-deleted-ui.js';

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
