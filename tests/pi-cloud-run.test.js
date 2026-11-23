import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {runCloudCreativeJob,creativeRuntimeForCheckpoints} from '../creative-agent/runtime/cloud-job.mjs';
import {creativeObjectHash} from '../creative-agent/runtime/cloud-journal.mjs';
import {installedCreationResources} from '../creative-agent/runtime/resources.mjs';
import {CREATIVE_JOB_FORMAT} from '../src/creative-job-package.js';

const call=(name,args)=>({id:'pi-'+name,type:'function',function:{name,arguments:JSON.stringify(args)}});
test('new cloud jobs use LangGraph even when the old Pi environment flag is set',async()=>{
  const old=process.env.SHIYE_CREATIVE_RUNTIME;process.env.SHIYE_CREATIVE_RUNTIME='pi';
  try{
    const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',user='10000000002',prefix=`${user}/creative/${id}/`;
    const document=await createCreationDocument({draft:draft(),assets:[],prompt:'记录周末'});
    const bytes=Buffer.from(JSON.stringify({format:CREATIVE_JOB_FORMAT,document,brief:{style:'清新淡雅',resourceVersion:(await installedCreationResources()).version}}));
    const started=Date.now(),job={id,user_id:user,input_path:prefix+'input.json',input_hash:creativeObjectHash(bytes),lease_token:'lease',checkpoint_seq:0,created_at:new Date(started).toISOString(),deadline_at:new Date(started+600000).toISOString()};
    const objects=new Map([[job.input_path,bytes]]),entries=[],updates=[];let turn=0;
    const result=await runCloudCreativeJob(job,{store:{download:async path=>objects.get(path),upload:async(path,body)=>objects.set(path,body)},listCheckpoints:async()=>entries,notify:async()=>{},rpc:async(name,args)=>{
      if(name==='shiye_append_creative_checkpoint_v1'){entries.push({job_id:id,seq:args.p_seq,object_path:args.p_path,object_hash:args.p_hash});return {seq:args.p_seq};}
      if(name==='shiye_update_creative_job_v1'){updates.push(args);return {status:args.p_result_path?'completed':'running'};}
      throw Error('unexpected rpc '+name);
    },model:async()=>{
      turn++;let next;
      if(turn===1)next=call('creation_plan',{intent:'周末小记',themeEvidence:{supportedBy:['用户要求'],conflicts:[],response:'记录普通周末'},palette:{source:'纸面',main:'#465D54',secondary:'#E8DFC2',relationship:'echo',distribution:'浅底深字'},composition:{visualAnchors:'标题和短文',layout:'上方标题，下方短文',connector:'一条线'},writingZones:[{role:'title',surface:'page',anchor:'左上',capacity:'short',legibility:'浅底深字'},{role:'body',surface:'page',anchor:'中下',capacity:'medium',legibility:'浅底深字'}],steps:[{task:'排版',status:'in_progress'}]});
      else if(turn===2)next=call('creation_apply',{protocolVersion:2,transactionId:'pi-cloud-text',baseSceneRevision:creationSceneRevision(document),operations:[
        {op:'text.add',id:'title',content:'周末小记',size:{width:55,unit:'mm'},place:{reference:'page',at:[35,30],unit:'mm'},style:{fontSizePt:20}},
        {op:'text.add',id:'body',content:'午后的风从窗边吹进来。',size:{width:70,unit:'mm'},place:{reference:'page',at:[45,85],unit:'mm'},style:{fontSizePt:11}}
      ]});
      else if(turn===3)next=call('creation_finish',{review:{observations:'标题在上，正文在下，纸面可读',issues:[]}});
      else throw Error('extra turn');
      return {message:{role:'assistant',content:null,tool_calls:[next]},usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}};
    }});
    assert.ok(entries.length>=3);
    const methods=entries.map(entry=>JSON.parse(gunzipSync(objects.get(entry.object_path)).toString('utf8')).method);
    assert.ok(methods.every(method=>method==='put'||method==='putWrites'));
    assert.ok(updates.some(update=>update.p_progress?.stage==='completed'));
    assert.ok(objects.has(result.resultPath));
    const saved=JSON.parse(objects.get(result.resultPath));
    assert.ok(saved.page.layers.some(layer=>layer.id==='title'));
  }finally{if(old===undefined)delete process.env.SHIYE_CREATIVE_RUNTIME;else process.env.SHIYE_CREATIVE_RUNTIME=old;}
});

test('only an existing Pi checkpoint can select the Pi recovery runtime',()=>{
  assert.equal(creativeRuntimeForCheckpoints([]),'langgraph');
  assert.equal(creativeRuntimeForCheckpoints([{method:'put'}]),'langgraph');
  assert.equal(creativeRuntimeForCheckpoints([{method:'pi-snapshot'}]),'pi');
  assert.throws(()=>creativeRuntimeForCheckpoints([{method:'put'},{method:'pi-snapshot'}]),/混用/);
});
