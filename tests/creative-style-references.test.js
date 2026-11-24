import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {tinyPNG} from './offline-canvas-test-support.mjs';
import {loadStyleReferences,attachStyleReferences} from '../creative-agent/runtime/style-references.mjs';

test('private style references are hash checked, direction scoped and attached only to new state',async()=>{
 const root=await mkdtemp(join(tmpdir(),'shiye-references-'));
 try{
  const row={file:'case.png',sha256:'sha256:'+createHash('sha256').update(tinyPNG).digest('hex')};
  await writeFile(join(root,'case.png'),tinyPNG);
  const manifest={version:1,styles:['丰富层叠'],references:[row]};
  await writeFile(join(root,'manifest.json'),JSON.stringify(manifest));
  const refs=await loadStyleReferences({root,styles:['丰富层叠']});
  assert.equal(refs.records.length,1);assert.match(refs.parts[1].image_url.url,/^data:image\/png;base64,/);
  assert.deepEqual(await loadStyleReferences({root,styles:['疏朗']}),{parts:[],records:[]});
  const state={messages:[{role:'system',content:'rules'},{role:'user',content:'task'}]};
  attachStyleReferences(state,refs);assert.equal(state.messages.length,3);assert.equal(state.messages[1].content,'task');
  assert.equal(attachStyleReferences(undefined,refs),undefined);
  await writeFile(join(root,'case.png'),Buffer.concat([tinyPNG,Buffer.from('changed')]));
  await assert.rejects(()=>loadStyleReferences({root,styles:['丰富层叠']}),/指纹/);
  manifest.references=[{...row,file:'../case.png'}];await writeFile(join(root,'manifest.json'),JSON.stringify(manifest));
  await assert.rejects(()=>loadStyleReferences({root,styles:['丰富层叠']}),/路径/);
 }finally{await rm(root,{recursive:true,force:true});}
});
