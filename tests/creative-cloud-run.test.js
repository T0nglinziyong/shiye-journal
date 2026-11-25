import {validateCreativeJobPackage,CREATIVE_JOB_FORMAT} from '../src/creative-job-package.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {runCloudCreativeJob} from '../creative-agent/runtime/cloud-job.mjs';
import {creativeObjectHash} from '../creative-agent/runtime/cloud-journal.mjs';
import {installedCreationResources} from '../creative-agent/runtime/resources.mjs';
import fontManifest from '../src/assets/fonts/manifest.json' with {type:'json'};

const call=(name,args)=>({id:name,type:'function',function:{name,arguments:JSON.stringify(args)}});
const reply=(...calls)=>({message:{role:'assistant',content:calls.filter(c=>c.function.name==='creation_phase').map(c=>'阶段：'+JSON.parse(c.function.arguments).phase).join('\n')||null,reasoning_content:'test-only',tool_calls:calls.filter(c=>c.function.name!=='creation_phase')},usage:{prompt_tokens:120,completion_tokens:30}});
test('cloud worker commits hash-verified editable output after real rendering and a durable journal',async()=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',user='10000000001',prefix=`${user}/creative/${id}/`;
  const document=await createCreationDocument({draft:draft(),assets:[]});
  const bytes=Buffer.from(JSON.stringify({format:CREATIVE_JOB_FORMAT,document,brief:{style:'test',resourceVersion:(await installedCreationResources()).version}}));
  const started=Date.now(),job={id,user_id:user,input_path:prefix+'input.json',input_hash:creativeObjectHash(bytes),lease_token:'lease',checkpoint_seq:0,created_at:new Date(started).toISOString(),deadline_at:new Date(started+600000).toISOString()};
  const objects=new Map([[job.input_path,bytes]]),entries=[],updates=[];let modelCalls=0,notifications=0;
  const result=await runCloudCreativeJob(job,{store:{download:async path=>objects.get(path),upload:async(path,body)=>objects.set(path,body)},listCheckpoints:async()=>entries,
    notify:async()=>notifications++,rpc:async(name,args)=>{
      assert.equal(args.p_id,id);assert.equal(args.p_lease,'lease');
      if(name==='shiye_append_creative_checkpoint_v1'){
        assert.equal(args.p_seq,entries.length+1);assert.equal(creativeObjectHash(objects.get(args.p_path)),args.p_hash);
        entries.push({job_id:id,seq:args.p_seq,object_path:args.p_path,object_hash:args.p_hash});return {seq:args.p_seq};
      }
      assert.equal(name,'shiye_update_creative_job_v1');updates.push(args);return {id,status:args.p_result_path?'completed':'running'};
    },model:async({messages})=>{
      if(modelCalls===0){assert.match(messages[0].content,/Xiaolai/);assert.ok(messages[0].content.includes(fontManifest.version));}
      if(++modelCalls===1)return reply(call('creation_plan',{intent:'测试',themeEvidence:{supportedBy:['用户要求'],conflicts:[],response:'用一句话记录想法'},palette:{source:'纸面',main:'#445566',secondary:'#EEEEDD',relationship:'echo',distribution:'浅底深字'},composition:{visualAnchors:'标题和正文共同构成焦点',layout:'左上标题，右下正文',connector:'颜色呼应'},writingZones:[{role:'title',surface:'page',anchor:'左上',capacity:'short',legibility:'深字浅底'},{role:'body',surface:'page',anchor:'右下',capacity:'short',legibility:'浅底'}],steps:[{task:'添加可编辑文字并看图',status:'in_progress'}]}),call('creation_phase',{phase:'layout',reason:'方向已确定',assessment:{observations:'主题、配色和双焦点布局已确定',issues:[]}}));
      if(modelCalls===2)return reply(call('creation_apply',{protocolVersion:2,transactionId:'text',baseSceneRevision:creationSceneRevision(document),operations:[{op:'create',kind:'text',id:'title',content:'一页新的想法',place:{reference:'page',at:[40,50],unit:'mm'},size:{width:60,unit:'mm'},style:{fontFamily:'Xiaolai'}}]}));
      const visual=messages.findLast(m=>Array.isArray(m.content)&&/^(当前真实画面：|本轮最先核对的画面问题)/.test(m.content[0]?.text||''));
      // Unchanged previews may be represented by the checkpoint hash rather
      // than sending the same image bytes into another model call.
      const summary=messages.findLast(m=>m.role==='user'&&typeof m.content==='string'&&m.content.startsWith('当前创作状态'));
      const currentVisual=visual?.content[0]?.text?.startsWith('当前真实画面：')?visual:null;
      const preview=currentVisual?JSON.parse(currentVisual.content[0].text.split('\n')[0].slice('当前真实画面：'.length)):JSON.parse(summary.content.slice(summary.content.indexOf('：')+1)).preview;
      if(modelCalls===3)return reply(call('creation_phase',{phase:'craft',reason:'构图已确定',assessment:{observations:'左上标题清晰，右下仍有正文位置',issues:[]}}));
      if(modelCalls===4)return reply(call('creation_apply',{protocolVersion:2,transactionId:'body',baseSceneRevision:preview.sceneRevision,operations:[{op:'create',kind:'text',id:'body',content:'把今天的新想法写下来。',place:{reference:'page',at:[55,85],unit:'mm'},size:{width:60,unit:'mm'},style:{fontFamily:'Xiaolai'}}]}));
      if(modelCalls===5)return reply(call('creation_phase',{phase:'review',reason:'书写已完成',assessment:{observations:'左上标题与下方正文形成清楚的文字层级',issues:[]}}));
      return reply(call('creation_finish',{review:{observations:'标题与正文均清楚，页面有完整的文字层级',issues:[]}}));
    }});
  assert.ok(entries.length>4);assert.ok(notifications>=2);assert.ok(updates.some(v=>v.p_progress?.stage==='preview'));
  const liveUsage=updates.filter(v=>v.p_progress?.stage!=='completed'&&v.p_progress?.inputTokens>0).map(v=>v.p_progress);
  assert.ok(liveUsage.length>=6,'usage must be durable before completion');
  assert.ok(liveUsage.some(v=>v.inputTokens===120&&v.outputTokens===30));
  assert.ok(liveUsage.every((v,i)=>!i||v.inputTokens>=liveUsage[i-1].inputTokens));
  const completed=updates.findLast(v=>v.p_progress?.stage==='completed').p_progress;
  assert.deepEqual({turns:completed.turns,inputTokens:completed.inputTokens,outputTokens:completed.outputTokens},{turns:6,inputTokens:720,outputTokens:180});
  const output=JSON.parse(objects.get(result.resultPath));assert.equal(output.page.layers[0].content,'一页新的想法');
  const evaluation=JSON.parse(objects.get(prefix+'reports/evaluation.json'));
  const trace=JSON.parse(objects.get(prefix+'reports/trace.json'));
  assert.equal(evaluation.comparison.revisions,2);
  assert.ok(trace.some(event=>event.kind==='model')&&trace.some(event=>event.kind==='tool')&&trace.some(event=>event.kind==='render'));
  assert.equal(creativeObjectHash(objects.get(result.resultPath)).slice(7)+'.json',result.resultPath.split('/').at(-1));
  const publicProgress=JSON.stringify(updates);assert.ok(!publicProgress.includes('test-only'));assert.equal(modelCalls,6);
});

test('creative job payload accepts task facts only, never fonts skills or executable resources',async()=>{
 const document=await createCreationDocument({draft:draft(),assets:[]});
  const input={format:CREATIVE_JOB_FORMAT,document,brief:{}};
 assert.equal(validateCreativeJobPackage(input,{userID:'owner',jobID:'job'}),input);
 assert.throws(()=>validateCreativeJobPackage({...input,images:[]}),/仅接收/);
 for(const key of ['fonts','skills','tools','runtime'])assert.throws(()=>validateCreativeJobPackage({...input,[key]:['payload']},{userID:'owner',jobID:'job'}),/服务器管理/);
});
