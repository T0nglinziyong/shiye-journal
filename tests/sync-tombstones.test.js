import test from 'node:test';
import assert from 'node:assert/strict';
import {recordTombstones,tombstoneID} from '../src/sync-tombstones.js';

test('staged deletion carries an immutable logical tombstone',()=>{
 const time='2026-10-10T00:01:00.000Z';
 const rows=recordTombstones([
  {action:'delete',store:'assets',id:'asset-a',modifiedAt:time},
  {action:'put',store:'trash',item:{id:'trash-a'}},
  {action:'delete',store:'projects',id:'work-a',modifiedAt:time},
  {action:'delete',store:'series',id:'series-a',modifiedAt:time},
  {action:'delete',store:'trash',id:'expired'},
  {action:'delete',store:'meta',id:'unrelated'}
 ]);
 assert.deepEqual(rows.filter(row=>row.store==='meta'&&row.action==='put').map(row=>row.item.id),[
  tombstoneID('assets','asset-a'),tombstoneID('projects','work-a'),tombstoneID('series','series-a')
 ]);
 assert.equal(rows[6].item.deletedAt,time);
 assert.equal(rows.filter(row=>row.action==='delete').length,5);
});

test('double processing the same durable batch is idempotent',()=>{
 const originals=[{action:'delete',store:'projects',id:'draft',modifiedAt:'2026-10-10T00:00:00Z'}];
 const once=recordTombstones(originals),twice=recordTombstones(once);
 assert.deepEqual(twice,once);
 assert.equal(twice.filter(row=>row.store==='meta').length,1);
});

test('explicit restores do not mint fresh tombstones',()=>{
 const ops=[
  {action:'delete',store:'meta',id:tombstoneID('projects','draft')},
  {action:'put',store:'projects',item:{id:'draft',title:'恢复'}},
  {action:'delete',store:'trash',id:'trash'}
 ];
 assert.deepEqual(recordTombstones(ops),ops);
});
