import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyImageReference} from '../src/image-reference-runtime.mjs';
import {tinyPNG} from './offline-canvas-test-support.mjs';
test('hybrid delivery requires a separate bounded and hash-bound reference; edit is unaffected',()=>{
 const old=process.cwd(),root=mkdtempSync(join(tmpdir(),'shiye-reference-'));
 try{process.chdir(root);mkdirSync('reference');mkdirSync('output');assert.equal(verifyImageReference({creationMode:'edit'}),null);assert.throws(()=>verifyImageReference({creationMode:'hybrid'}),/缺少/);
 writeFileSync('output/image-draft.png',tinyPNG);assert.equal(verifyImageReference({creationMode:'hybrid'}).image,'output/image-draft.png');
 writeFileSync('reference/draft.png',tinyPNG);const sha256='sha256:'+createHash('sha256').update(tinyPNG).digest('hex'),source={creationMode:'hybrid',referenceImage:{image:'reference/draft.png',sha256}};assert.equal(verifyImageReference(source).sha256,sha256);
 writeFileSync('reference/draft.png',Buffer.from('tampered'));assert.throws(()=>verifyImageReference(source),/格式|改变/);assert.throws(()=>verifyImageReference({...source,referenceImage:{image:'../other.png'}}),/路径/);
 }finally{process.chdir(old);rmSync(root,{recursive:true,force:true});}
});
