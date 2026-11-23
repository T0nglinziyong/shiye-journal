import test from 'node:test';
import assert from 'node:assert/strict';
import {creationOperationSpecs} from '../src/creation-command-spec.js';
import {validateCreationV2Commands} from '../src/creation-v2-commands.js';
import {techniqueCatalog,describeTechnique} from '../creative-agent/library/techniques.js';
import {harnessTools} from '../creative-agent/runtime/agent.mjs';
import {validateValue} from '../src/creative-contract.js';

const revision='sha256:'+'a'.repeat(64);

test('every public command example validates against the executable Command contract',()=>{
  let checked=0;
  for(const spec of creationOperationSpecs)for(const operation of spec.examples){
    assert.doesNotThrow(()=>validateCreationV2Commands({protocolVersion:2,transactionId:'example-'+checked,baseSceneRevision:revision,operations:[operation]}),spec.name);
    checked++;
  }
  assert.ok(checked>=creationOperationSpecs.length);
});

test('every Skill method example uses the executable creation_recipe tool fields',()=>{
  const tool=harnessTools.find(entry=>entry.function.name==='creation_recipe');
  assert.ok(tool);
  for(const method of techniqueCatalog.methods){
    const invocation=structuredClone(describeTechnique(method.id).tool.arguments);
    invocation.baseSceneRevision=revision;
    assert.equal(invocation.methodId,method.id);
    assert.doesNotThrow(()=>validateValue(invocation,tool.function.parameters),method.id);
  }
});

test('graphic.add distinguishes ink styles from dashed digital shapes',()=>{
  const base={protocolVersion:2,transactionId:'ink-style-contract',baseSceneRevision:revision};
  const place={reference:'page',at:[50,60],unit:'mm'};
  const ink={op:'graphic.add',id:'dotted-ink',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0},{x:10,y:0}]},place,style:{stroke:'#344455',strokeWidthMm:.5,strokeDash:'dot'}};
  assert.throws(()=>validateCreationV2Commands({...base,operations:[ink]}),/strokeDash/);
  const shape={op:'graphic.add',id:'dotted-shape',geometry:{kind:'rect'},place,size:{width:10,height:1,unit:'mm'},style:{fill:null,stroke:'#344455',strokeWidthMm:.5,strokeDash:'dot'}};
  assert.doesNotThrow(()=>validateCreationV2Commands({...base,operations:[shape]}));
});
