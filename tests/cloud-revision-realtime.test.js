import test from 'node:test';
import assert from 'node:assert/strict';
import {startCloudRevisionRealtime} from '../src/cloud-revision-realtime.js';

test('one account revision signal wakes incremental sync without accepting another account',()=>{
  let handler,statusHandler,removed=0,ready=0,changes=[];
  const channel={
    on(type,filter,callback){
      assert.equal(type,'postgres_changes');
      assert.deepEqual(filter,{event:'UPDATE',schema:'public',table:'shiye_revisions',
        filter:'user_id=eq.user-1',select:['user_id','revision']});
      handler=callback;return this;
    },
    subscribe(callback){statusHandler=callback;return this;}
  };
  const realtime={channel:(name,options)=>{
    assert.equal(name,'shiye-account-revision-user-1');
    assert.equal(options.config.postgres_changes_options.wait,true);
    return channel;
  },removeChannel(value){assert.equal(value,channel);removed++;return Promise.resolve();}};
  const stop=startCloudRevisionRealtime({realtime,userID:'user-1',
    onChange:revision=>changes.push(revision),onReady:()=>ready++});
  statusHandler('SUBSCRIBED');
  handler({new:{user_id:'other',revision:2}});
  handler({new:{user_id:'user-1',revision:'4'}});
  handler({new:{user_id:'user-1',revision:'invalid'}});
  assert.equal(ready,1);assert.deepEqual(changes,[4]);
  stop();stop();statusHandler('SUBSCRIBED');handler({new:{user_id:'user-1',revision:5}});
  assert.equal(removed,1);assert.equal(ready,1);assert.deepEqual(changes,[4]);
});
