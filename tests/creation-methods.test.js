import test from 'node:test';
import assert from 'node:assert/strict';
import {CREATION_METHODS,WEB_RESULT_METHODS,creationMethod,generationProfile,webResultPrompt,classifyCreationBytes,classifyCreationFile} from '../src/creation-methods.js';

test('creative method and web return method are independent choices',()=>{
  assert.deepEqual(CREATION_METHODS.map(([id])=>id),['tools','json','image']);
  assert.deepEqual(WEB_RESULT_METHODS.map(([id])=>id),['file','text']);
  assert.equal(creationMethod('bad'),'tools');
  assert.deepEqual(generationProfile('tools'),{creationMode:'tools',deliveryMode:'tools',generationMode:'agent',snapshot:false});
  assert.equal(generationProfile('json').generationMode,'direct');
  assert.equal(generationProfile('image').snapshot,'image/png');
});

test('editable delivery requires PNG plus JSON for both file and text outputs',()=>{
  for(const mode of ['tools','json']){
    const file=webResultPrompt(mode,'file');
    assert.match(file,/project.shiyeproject.json/);
    assert.match(file,/ZIP/);
    assert.match(file,/Canvas/);assert.match(file,/preview.png/);
    const text=webResultPrompt(mode,'text');
    assert.match(text,/json 代码块/);assert.match(text,/preview.png/);
    assert.match(text,/不省略字段/);assert.match(text,/单行/);assert.match(file,/单行/);
  }
  const png=webResultPrompt('image','file');
  assert.match(png,/PNG/);
  assert.throws(()=>webResultPrompt('image','text'),/不能用复制文本/);
});

const bytes=(...parts)=>Uint8Array.from(parts);
test('sniff result types by bytes, not file extension or browser MIME',async()=>{
  const png=bytes(137,80,78,71,13,10,26,10,0,0,0,1);
  const jpg=bytes(255,216,255,224,0,0,0,0);
  const webp=bytes(...'RIFF'.split('').map(x=>x.charCodeAt(0)),1,2,3,4,...'WEBP'.split('').map(x=>x.charCodeAt(0)));
  const zip=bytes(80,75,3,4,1,1,1,1);
  for(const [blob,mime] of [[png,'image/png'],[jpg,'image/jpeg'],[webp,'image/webp'],[zip,'application/zip']]){
    assert.equal(classifyCreationBytes(blob)?.mimeType,mime);
    assert.equal((await classifyCreationFile(new Blob([blob],{type:'text/plain'}))).mimeType,mime);
  }
  assert.equal((await classifyCreationFile(new Blob(['  {"format":"shiye-editable-project"}'],{type:'image/png'}))).kind,'json');
  assert.equal((await classifyCreationFile(new Blob(['```json\n{"format":"shiye-editable-project"}\n```']))).kind,'json');
  assert.equal(classifyCreationBytes(bytes(34,23,0)),null);
  await assert.rejects(classifyCreationFile(new Blob(['not recognized'])),/不支持/);
  await assert.rejects(classifyCreationFile(new Blob([])),/为空/);
});

test('size budget protects text and package imports even with false MIME extension',async()=>{
  await assert.rejects(classifyCreationFile(new Blob(['{',new Uint8Array(8_000_000)])),/8 MB/);
  const zip=new Blob([bytes(80,75,3,4),new Uint8Array(20_000_001)]);
  await assert.rejects(classifyCreationFile(zip),/20 MB/);
});

test('editable handoff prompts remain concise without a final-response gag',()=>{
 for(const output of ['file','text']){
   const prompt=webResultPrompt('tools',output);
   assert.ok(prompt.length<260);
   assert.doesNotMatch(prompt,/不要附加过程说明|无需另加解释|自评/);
 }
});
