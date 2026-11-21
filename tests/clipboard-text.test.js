import test from 'node:test';
import assert from 'node:assert/strict';
import {readClipboardText} from '../src/clipboard-text.js';

test('clipboard button accepts desktop text and mobile ClipboardItem text',async()=>{
  assert.equal(await readClipboardText({readText:async()=>'{"format":"shiye-editable-project"}'}),'{"format":"shiye-editable-project"}');
  const mobile={readText:async()=>{throw Error('readText blocked');},read:async()=>[{types:['text/plain'],getType:async()=>new Blob(['手机复制的 JSON'],{type:'text/plain'})}]};
  assert.equal(await readClipboardText(mobile),'手机复制的 JSON');
});

test('clipboard failure is explicit and cannot erase existing textarea text',async()=>{
  await assert.rejects(readClipboardText(undefined),/剪贴板/);
  await assert.rejects(readClipboardText({readText:async()=>''}),/剪贴板/);
});
