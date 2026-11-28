import test from 'node:test';
import assert from 'node:assert/strict';
import {standbyMaterialRows} from '../src/material-standby.js';

test('deleted required material returns to standby as an insertable source',()=>{
 const assets=[{id:'required',title:'必用照片'},{id:'other',title:'其他'}];
 const draft={items:[{id:'parked',assetID:'other',isParked:true}]};
 assert.deepEqual(standbyMaterialRows(draft,assets,['required']).map(row=>[row.asset.id,row.item?.id||null]),
  [['other','parked'],['required',null]]);
 draft.items.push({id:'readded',assetID:'required',isParked:false});
 assert.deepEqual(standbyMaterialRows(draft,assets,['required']).map(row=>row.asset.id),['other']);
});
