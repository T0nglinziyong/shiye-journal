import {validateCreativeJobPackage,CREATIVE_JOB_FORMAT} from '../src/creative-job-package.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {runCloudCreativeJob} from '../compute-server/harness/cloud-job.mjs';
import {creativeObjectHash} from '../compute-server/harness/cloud-journal.mjs';
import {installedCreationResources} from '../compute-server/harness/resources.mjs';
import fontManifest from '../src/assets/fonts/manifest.json' with {type:'json'};

const call=(name,args)=>({id:name,type:'function',function:{name,arguments:JSON.stringify(args)}});
const reply=(...calls)=>({message:{role:'assistant',content:null,reasoning_content:'test-only',tool_calls:calls},usage:{prompt_tokens:120,completion_tokens:30}});
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
      if(++modelCalls===1)return reply(call('read_skill',{name:'journal-composition'}),call('creation_plan',{intent:'测试',steps:[{task:'添加可编辑文字并看图',status:'in_progress'}]}),
        call('creation_apply',{protocolVersion:2,transactionId:'text',baseSceneRevision:creationSceneRevision(document),operations:[{op:'text.add',id:'title',content:'一页新的想法',place:{reference:'page',at:[40,50],unit:'mm'},size:{width:60,unit:'mm'},style:{fontFamily:'Xiaolai'}}]}));
      const visual=messages.findLast(m=>Array.isArray(m.content)&&m.content[0]?.text?.startsWith('当前真实画面：'));
      assert.ok(visual.content.find(part=>part.type==='image_url').image_url.url.startsWith('data:image/jpeg;base64,'));
      const preview=JSON.parse(visual.content[0].text.split('\n')[0].slice('当前真实画面：'.length));
      return reply(call('creation_review',{pngHash:preview.pngHash,sceneRevision:preview.sceneRevision,approved:true,observations:'测试图像已渲染，非审美验收',issues:[]}),call('creation_finish',{}));
    }});
  assert.ok(entries.length>4);assert.ok(notifications>=2);assert.ok(updates.some(v=>v.p_progress?.stage==='preview'));
  const completed=updates.findLast(v=>v.p_progress?.stage==='completed').p_progress;
  assert.deepEqual({turns:completed.turns,inputTokens:completed.inputTokens,outputTokens:completed.outputTokens},{turns:2,inputTokens:240,outputTokens:60});
  const output=JSON.parse(objects.get(result.resultPath));assert.equal(output.page.layers[0].content,'一页新的想法');
  const evaluation=JSON.parse(objects.get(prefix+'reports/evaluation.json'));
  const trace=JSON.parse(objects.get(prefix+'reports/trace.json'));
  assert.equal(evaluation.comparison.revisions,1);
  assert.ok(trace.some(event=>event.kind==='model')&&trace.some(event=>event.kind==='tool')&&trace.some(event=>event.kind==='render'));
  assert.equal(creativeObjectHash(objects.get(result.resultPath)).slice(7)+'.json',result.resultPath.split('/').at(-1));
  const publicProgress=JSON.stringify(updates);assert.ok(!publicProgress.includes('test-only'));assert.equal(modelCalls,2);
});

test('creative job payload accepts task facts only, never fonts skills or executable resources',async()=>{
 const document=await createCreationDocument({draft:draft(),assets:[]});
  const input={format:CREATIVE_JOB_FORMAT,document,brief:{}};
 assert.equal(validateCreativeJobPackage(input,{userID:'owner',jobID:'job'}),input);
 assert.throws(()=>validateCreativeJobPackage({...input,images:[]}),/仅接收/);
 for(const key of ['fonts','skills','tools','runtime'])assert.throws(()=>validateCreativeJobPackage({...input,[key]:['payload']},{userID:'owner',jobID:'job'}),/服务器管理/);
});
