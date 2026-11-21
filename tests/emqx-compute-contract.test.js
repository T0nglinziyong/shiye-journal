import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudBaseService} from '../server/cloudbase/service.mjs';
import {realtimeUserCredential} from '../server/cloudbase/app.mjs';

const id='946571b4-9484-4aee-a5de-1f0f190a132e';
const user='2111845279800434690',other='2112467532841558018';
const bearer='Bearer '+'x'.repeat(40);
const event=(route,method,body={},authorization=bearer)=>({version:1,route,method,body,authorization});

test('MQTT credentials are selected only by verified CloudBase identity',async()=>{
  const accounts={[user]:{username:'shiye-user-'+user,password:'a'.repeat(32)},
    [other]:{username:'shiye-user-'+other,password:'b'.repeat(32)}};
  assert.deepEqual(realtimeUserCredential(user,{SHIYE_EMQX_USER_CREDENTIALS_B64:
    Buffer.from(JSON.stringify(accounts)).toString('base64')}),accounts[user]);
  const published=[];
  const handler=createCloudBaseService({verifyUser:async()=>({userID:user}),
    realtimeCredentials:id=>realtimeUserCredential(id,{SHIYE_EMQX_USER_CREDENTIALS:JSON.stringify(accounts)}),
    realtimePublish:async(topic,payload)=>{published.push({topic,payload});return {accepted:true};},
    realtimeReady:true});
  const response=await handler(event('/api/realtime-session','GET',{userID:other}));
  assert.equal(response.status,200);
  assert.equal(response.body.username,'shiye-user-'+user);
  assert.equal(response.body.topic,'shiye/users/'+user+'/sync');
  assert.equal(response.body.password,'a'.repeat(32));
  const notice=await handler(event('/api/realtime-notify','POST',{type:'sync_changed',scope:'all',userID:other}));
  assert.equal(notice.status,400);
  assert.equal(published.length,0);
});

test('a user cannot wake a job owned by another account',async()=>{
  const calls=[];
  const handler=createCloudBaseService({verifyUser:async()=>({userID:user}),
    jobLookup:async(jobId,token,owner)=>{calls.push({jobId,token,owner});return null;},
    realtimePublish:async()=>{throw Error('must not publish');}});
  const response=await handler(event('/api/job-submit','POST',{jobId:id}));
  assert.equal(response.status,404);
  assert.deepEqual(calls,[{jobId:id,token:'x'.repeat(40),owner:user}]);
});

test('worker completion notice uses the database owner and requires worker token',async()=>{
  const published=[];
  const handler=createCloudBaseService({verifyUser:async()=>{throw Error('worker path must not use user auth');},
    workerToken:'w'.repeat(40),jobLookup:async()=>({user_id:other,status:'completed'}),
    realtimePublish:async(topic,payload)=>{published.push({topic,payload});return {accepted:true};}});
  const denied=await handler(event('/api/worker-notify','POST',{jobId:id},bearer));
  assert.equal(denied.status,403);
  const accepted=await handler(event('/api/worker-notify','POST',{jobId:id},'Bearer '+'w'.repeat(40)));
  assert.equal(accepted.status,200);
  assert.equal(published[0].topic,'shiye/users/'+other+'/sync');
  assert.equal(published[0].payload.jobId,id);
});
