import test from 'node:test';
import assert from 'node:assert/strict';
import {queryAssets} from '../src/asset-query.js';
import {seriesMembers} from '../src/library-model.js';
import {seriesContentsModel,clearSeriesContentFilters,snapshotSeriesContentFilters,
  restoreSeriesContentFilters} from '../src/series-contents.js';

test('whole-library and series search use the same structured fields and status rule',()=>{
  const assets=[
    {id:'a',title:'纸片',seriesID:'s',styleTags:['韩系'],contentTags:['蝴蝶'],semanticTags:['春天'],usageStatus:'unused',createdAt:'2026-01-02'},
    {id:'b',title:'纸片',seriesID:'s',styleTags:['韩系'],usageStatus:'used',createdAt:'2026-01-02'},
    {id:'c',title:'别的',seriesID:'other',styleTags:['韩系'],usageStatus:'unused',createdAt:'2026-01-02'}
  ];
  assert.deepEqual(queryAssets(assets,{seriesID:'s',query:'蝴蝶'}).map(x=>x.id),
    seriesMembers('s',assets,{query:'蝴蝶'}).map(x=>x.id));
  assert.deepEqual(queryAssets(assets,{seriesID:'s',query:'韩系',status:'unused'}).map(x=>x.id),['a']);
  assert.deepEqual(seriesMembers('s',assets,{query:'韩系',status:'unused'}).map(x=>x.id),['a']);
});

test('same name, missing dates and page boundaries have deterministic ID order',()=>{
  const rows=Array.from({length:90},(_,i)=>({id:String(90-i).padStart(3,'0'),title:'相同',createdAt:''}));
  const first=queryAssets(rows,{sort:'name'}).map(x=>x.id);
  assert.deepEqual(first,[...first].sort());
  assert.equal(new Set([...first.slice(0,40),...first.slice(40,80)]).size,80);
});

test('search index invalidates for an in-place edit without a timestamp change',()=>{
  const asset={id:'a',title:'蓝色',tags:['纸'],createdAt:'2026-01-02'};
  assert.equal(queryAssets([asset],{query:'蓝色'}).length,1);
  asset.title='绿色';asset.tags.push('春天');
  assert.equal(queryAssets([asset],{query:'蓝色'}).length,0);
  assert.equal(queryAssets([asset],{query:'春天'}).length,1);
});

test('series query state can restore a visit but is cleared for a different account',()=>{
  const state={seriesID:'s',series:[{id:'s',title:'系列'}],assets:[]};
  seriesContentsModel(state).filter.query='春天';
  const saved=snapshotSeriesContentFilters();
  clearSeriesContentFilters();
  assert.equal(seriesContentsModel(state).filter.query,'');
  restoreSeriesContentFilters(saved);
  assert.equal(seriesContentsModel(state).filter.query,'春天');
  clearSeriesContentFilters();
});
