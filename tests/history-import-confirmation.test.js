import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {confirmHistoryImport} from '../src/history-import-confirmation.js';
test('history file confirmation yields to the page and handles confirm/cancel without native blocking',async()=>{
  const window=new Window(),modal=window.document.createElement('dialog'),body=window.document.createElement('div');modal.append(body);window.document.body.append(modal);
  let resolved=false;const first=confirmHistoryImport(modal,body).then(ok=>{resolved=true;return ok;});assert.ok(modal.open);await Promise.resolve();assert.equal(resolved,false);body.querySelector('[data-history-confirm]').click();assert.equal(await first,true);
  const second=confirmHistoryImport(modal,body);body.querySelector('[data-history-cancel]').click();assert.equal(await second,false);window.happyDOM.abort();
});
