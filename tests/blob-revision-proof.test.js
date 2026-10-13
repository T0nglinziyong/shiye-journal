import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlobRevisionProof} from '../src/blob-revision-proof.js';

test('verified unrelated edits preserve cached blob metadata across sessions',()=>{
  const proof=createBlobRevisionProof();
  proof.accept(7,9,{blobIDs:['changed']});
  proof.accept(9,10,{blobIDs:[]});
  assert.equal(proof.valid('unchanged',7,10),true);
  assert.equal(proof.valid('changed',7,10),false);
  assert.equal(proof.valid('unchanged',6,10),false,'a missing revision step is not proof');
  assert.equal(proof.valid('unchanged',7,11),false,'an unverified future revision is not proof');
});
test('clear and limited history never reuse an unverified image record',()=>{
  const proof=createBlobRevisionProof({limit:1});
  proof.accept(1,2,{allBlobs:true});
  assert.equal(proof.valid('image',1,2),false);
  proof.accept(2,3);
  assert.equal(proof.valid('image',1,3),false);
  assert.equal(proof.valid('image',2,3),true);
  proof.clear();
  assert.equal(proof.valid('image',2,3),false);
});
