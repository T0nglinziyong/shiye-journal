import test from 'node:test';
import assert from 'node:assert/strict';
import {applyToolCalls} from '../src/creative.js';
import {draft} from '../src/domain.js';

const stroke={points:[{x:.2,y:.3},{x:.4,y:.4}],width:3,color:'#123456',pen_style:'brush'};
const text=content=>({content,font_style:'sans',x:.5,y:.4,width:.4,height:.1,font_size:24,color:'#123456'});
const sceneText=content=>({type:'text',id:'title',...text(content)});
const sceneInk={type:'ink',id:'ink-ai',...stroke};
const page=overrides=>({version:2,style:'自由构图',intent:null,layers:[sceneInk,sceneText('初版')],paper:{color:'#ffffff',pattern:'plain'},...overrides});
const execute=(input,base)=>applyToolCalls(input,base,[],{});
test('A-01/A-02: direct page replaces prior AI layers and replay does not duplicate ink',()=>{
 const initial=draft(),first=execute(page(),initial);assert.equal(first.results[0].ok,true);
 first.draft.textBlocks.push({id:'manual',content:'用户文字',x:30,y:40,width:200,height:50});
 first.draft.strokes.push({id:'manual-ink',points:[{x:1,y:2}],width:2,color:'#000000'});
 const next=page({layers:[sceneText('新版')]});
 const second=execute(next,first.draft);assert.equal(second.results[0].ok,true);
 assert.deepEqual(second.draft.textBlocks.map(x=>x.content),['用户文字','新版']);
 assert.deepEqual(second.draft.strokes.map(x=>x.id),['manual-ink']);
 const repeated=execute(next,second.draft);assert.equal(repeated.results[0].ok,true);
 assert.equal(repeated.draft.textBlocks.length,2);assert.equal(repeated.draft.strokes.length,1);
});
test('A-01/A-02: locked generated text remains; invalid replacement is atomic',()=>{
 const first=execute(page(),draft()).draft;first.textBlocks[0].isLocked=true;
 const withoutText=execute(page({layers:[]}),first);
 assert.equal(withoutText.results[0].ok,true);assert.equal(withoutText.draft.textBlocks[0].content,'初版');
 const before=structuredClone(withoutText.draft);
 const conflict=execute(page({layers:[sceneText('试图改锁定正文')]}),withoutText.draft);
 assert.equal(conflict.results[0].ok,false);assert.match(conflict.results[0].detail,/已锁定/);
 assert.deepEqual(JSON.parse(JSON.stringify(conflict.draft)).layers,JSON.parse(JSON.stringify(before)).layers);
 assert.equal(conflict.draft.agentRun.status,'editing');
});
