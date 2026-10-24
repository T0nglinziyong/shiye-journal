import test from 'node:test';
import assert from 'node:assert/strict';
import {isCurrentBuiltinMaterial,isCurrentExampleProject,isUntouchedLegacyExample} from '../src/legacy-builtins.js';

test('old sample records remain recognizable without seeding new accounts',()=>{
  assert.equal(isCurrentBuiltinMaterial({sourceIdentifier:'shiye-current-builtin'}),true);
  assert.equal(isCurrentBuiltinMaterial({isBuiltinMaterial:true}),true);
  assert.equal(isCurrentBuiltinMaterial({id:'personal'}),false);
  const old={id:'cece-p1-project',sourceIdentifier:'shiye-current-example-cece',updatedAt:'a',coverBaselineUpdatedAt:'a'};
  assert.equal(isCurrentExampleProject(old),true);
  assert.equal(isUntouchedLegacyExample(old),true);
  assert.equal(isUntouchedLegacyExample({...old,updatedAt:'b'}),false);
});
