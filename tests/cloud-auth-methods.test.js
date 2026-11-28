import test from 'node:test';
import assert from 'node:assert/strict';
import {passwordIdentifier,otpIdentifier,configuredOAuthProviders,
  requestLoginOtp,verifyLoginOtp,requestIdentityBinding,
  confirmIdentityBinding} from '../src/cloud-auth-methods.js';

test('password login preserves username case and classifies bound identifiers',()=>{
  assert.deepEqual(passwordIdentifier(' Xlfsth601802 '),{username:'Xlfsth601802'});
  assert.deepEqual(passwordIdentifier(' A@Example.com '),{email:'A@Example.com'});
  assert.deepEqual(passwordIdentifier('13800138000'),{phone:'+8613800138000'});
});

test('OTP login refuses account creation and uses the returned challenge',async()=>{
  let request,verified;
  const auth={signInWithOtp:async value=>{
    request=value;
    return {data:{verifyOtp:async code=>{verified=code;return {data:{user:{id:'invited'}}};}}};
  }};
  const challenge=await requestLoginOtp(auth,'email',' invited@example.com ');
  assert.deepEqual(request,{email:'invited@example.com',options:{shouldCreateUser:false}});
  await verifyLoginOtp(challenge,'123456');
  assert.deepEqual(verified,{token:'123456'});
  assert.deepEqual(otpIdentifier('phone','13800138000'),{phone:'+8613800138000'});
  assert.throws(()=>otpIdentifier('phone','abc'),/手机号/);
});

test('only configured OAuth providers are displayed',()=>{
  assert.deepEqual(configuredOAuthProviders('wechat,github,custom-id,wechat,!invalid'),[
    {id:'wechat',label:'微信'},{id:'github',label:'GitHub'},
    {id:'custom-id',label:'custom-id'}]);
});

test('binding keeps the invited session and verifies the exact identity',async()=>{
  let request,verified;
  const auth={updateUser:async value=>{
    request=value;
    return {data:{verifyOtp:async params=>{verified=params;return {data:{user:{id:'invited'}}};}}};
  }};
  const challenge=await requestIdentityBinding(auth,'phone','13800138000');
  assert.deepEqual(request,{phone:'+8613800138000'});
  await confirmIdentityBinding(challenge,'123456');
  assert.deepEqual(verified,{phone:'+8613800138000',token:'123456'});
  await assert.rejects(()=>confirmIdentityBinding(challenge,'abc'),/验证码/);
  await assert.rejects(()=>requestIdentityBinding(auth,'email','invalid'),/邮箱/);
});
