import test from 'node:test';
import assert from 'node:assert/strict';
import {creativeProtocol} from '../src/creative-delivery.js';
import {agentTools} from '../src/creative-contract.js';

test('creative provider formats are selected independently of the turn loop', () => {
  const native = creativeProtocol({generationMode:'agent', transport:'auto'});
  assert.equal(native.native, true);
  assert.equal(native.request().tool_choice, 'required');
  assert.equal(native.request({type:'enabled'}).tool_choice, 'auto');
  assert.equal(native.request().tools, agentTools);
  const original = [{id:'one', type:'function', function:{name:'finish_design', arguments:'{}'}}];
  assert.equal(native.calls({tool_calls:original}, 1), original);

  const json = creativeProtocol({generationMode:'agent', transport:'json'});
  assert.equal(json.native, false);
  assert.deepEqual(json.request(), {response_format:{type:'json_object'}});
  assert.deepEqual(json.calls({content:'```json\n{"tools":[{"name":"set_paper","arguments":{"color":"#ffffff"}}]}\n```'}, 3), [
    {id:'json-3-0', type:'function', function:{name:'set_paper', arguments:'{"color":"#ffffff"}'}}
  ]);
  assert.throws(() => json.calls({content:'not JSON'}, 1), SyntaxError);
});

test('direct editable page remains a single atomic compose call', () => {
  const direct = creativeProtocol({generationMode:'direct', transport:'native'});
  const page = {version:3, style:'留白叙事', intent:null,
    items:[{asset:'m1',piece:'p1',unit:0,role:null,operations:[{op:'whole'}],placement:{x:.5,y:.5,rotation:0,z:0},relation:null}],
    text_blocks:[],paper:{color:'#ffffff',pattern:'plain'}};
  const calls = direct.calls({content:JSON.stringify(page)}, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].function.name, 'compose_direct_page');
  // Invalid output is rejected before any canvas mutation is possible.
  assert.throws(() => direct.calls({content:JSON.stringify({...page, style:'unsupported-style'})}, 1), /未知值/);
  assert.equal(direct.native, false);
  assert.match(direct.instruction, /完整JSON页面数据/);
});
