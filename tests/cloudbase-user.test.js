import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCloudBaseUser} from '../server/cloudbase-user.mjs';

test('CloudBase COS authorization checks the live user, account and reset generation',async()=>{
  const calls=[];
  const fetcher=async(url,init)=>{
    calls.push({url:String(url),authorization:init.headers.Authorization});
    if(String(url).endsWith('/auth/v1/user/me'))return Response.json({
      sub:'1234567890123456789',username:'lzy',status:'ACTIVE'});
    if(String(url).includes('/shiye_accounts'))return Response.json([{
      user_id:'1234567890123456789',is_admin:true}]);
    if(String(url).includes('/shiye_records'))return Response.json([{
      record:{id:'shiye-reset-barrier',resetId:'new-generation'}}]);
    throw Error('Unexpected request');
  };
  const identity=await verifyCloudBaseUser('test-token',{
    envId:'shiye-pg-test-d1gg723f7fb356ccc',fetcher});
  assert.deepEqual(identity,{userID:'1234567890123456789',isAdmin:true,
    resetId:'new-generation'});
  assert.equal(calls.length,3);
  assert.ok(calls.every(call=>call.authorization==='Bearer test-token'));
  assert.ok(calls.every(call=>call.url.startsWith(
    'https://shiye-pg-test-d1gg723f7fb356ccc.api.tcloudbasegateway.com/')));
});

test('CloudBase COS authorization rejects an inactive or unlisted user',async()=>{
  const inactive=await verifyCloudBaseUser('token',{envId:'test-env',fetcher:async()=>
    Response.json({sub:'123',status:'BLOCKED'})});
  assert.equal(inactive,null);
  const unlisted=await verifyCloudBaseUser('token',{envId:'test-env',fetcher:async url=>
    String(url).endsWith('/auth/v1/user/me')?
      Response.json({sub:'123',status:'ACTIVE'}):Response.json([])});
  assert.equal(unlisted,null);
});

test('CloudBase account and reset checks start together after identity verification',async()=>{
  const started=[];let releaseAccount,releaseMarker;
  const fetcher=url=>{
    const path=String(url);
    if(path.endsWith('/auth/v1/user/me'))return Promise.resolve(Response.json({sub:'123',status:'ACTIVE'}));
    if(path.includes('/shiye_accounts'))return new Promise(resolve=>{
      started.push('account');releaseAccount=()=>resolve(Response.json([{user_id:'123',is_admin:false}]));
    });
    if(path.includes('/shiye_records'))return new Promise(resolve=>{
      started.push('marker');releaseMarker=()=>resolve(Response.json([]));
    });
    throw Error('Unexpected request');
  };
  const result=verifyCloudBaseUser('token',{envId:'test-env',fetcher});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(started,['account','marker']);
  releaseAccount();releaseMarker();
  assert.deepEqual(await result,{userID:'123',isAdmin:false,resetId:null});
});
