import test from 'node:test';
import assert from 'node:assert/strict';
import {createStorageRouter} from '../src/storage-router.js';

test('storage router resolves the active backend for every operation', async () => {
  let mode = 'browser';
  const calls = [];
  const adapter = name => ({
    all:store => { calls.push([name, 'all', store]); return [name]; },
    get:(store, id) => { calls.push([name, 'get', store, id]); return id; },
    transaction:(stores, callback) => { calls.push([name, 'transaction', stores]); return callback(name); }
  });
  const router = createStorageRouter(() => mode, {browser:adapter('browser'), cloud:adapter('cloud')});
  assert.equal(await router.mode(), 'browser');
  assert.deepEqual(await router.all('assets'), ['browser']);
  mode = 'cloud';
  assert.equal(await router.get('projects', 'p1'), 'p1');
  assert.equal(await router.transaction(['projects'], backend => backend), 'cloud');
  assert.deepEqual(calls, [
    ['browser', 'all', 'assets'],
    ['cloud', 'get', 'projects', 'p1'],
    ['cloud', 'transaction', ['projects']]
  ]);
});

test('failed or incomplete backend never writes to another source', async () => {
  let browserCalls = 0;
  const router = createStorageRouter(async () => 'cloud', {
    cloud:{all:async () => { throw Error('云端不可用'); }},
    browser:{all:() => { browserCalls++; return []; }, get:() => null, transaction:() => null}
  });
  await assert.rejects(router.all('assets'), /云端不可用/);
  await assert.rejects(router.transaction(['assets'], () => {}), /不支持 transaction/);
  assert.equal(browserCalls, 0);
});
