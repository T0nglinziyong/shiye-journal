import test from 'node:test';
import assert from 'node:assert/strict';
import {libraryPageData} from '../src/library-page-data.js';
import {setCatalogDataPage,resetCatalogPage} from '../src/catalog-pagination.js';

test('library creates data for one page and filters before slicing',()=>{
  const assets=Array.from({length:200},(_,i)=>({id:String(i),title:i%2?'other '+i:'wanted '+i,kind:'paper',createdAt:new Date(2026,0,i+1).toISOString()}));
  const state={assets,query:'wanted',kind:'all',status:'all',seriesID:'all',sort:'newest',preferences:{maxPageItems:20}};
  resetCatalogPage('library');
  const first=libraryPageData(state);
  assert.equal(first.total,100);assert.equal(first.items.length,20);
  assert.ok(first.items.every(item=>item.title.startsWith('wanted')));
  setCatalogDataPage('library',3);
  const third=libraryPageData(state);
  assert.equal(third.items.length,20);assert.notEqual(third.items[0].id,first.items[0].id);
  resetCatalogPage('library');
});


test('each selected catalog page size changes the number of rendered material cards',()=>{
  const assets=Array.from({length:25},(_,index)=>({id:String(index),title:'素材 '+index,kind:'paper',createdAt:new Date(2026,0,index+1).toISOString()}));
  const state={assets,query:'',kind:'all',status:'all',seriesID:'all',sort:'newest',preferences:{maxPageItems:10}};
  resetCatalogPage('library');
  assert.equal(libraryPageData(state).items.length,10);
  state.preferences.maxPageItems=20;resetCatalogPage('library');
  assert.equal(libraryPageData(state).items.length,20);
  state.preferences.maxPageItems=40;resetCatalogPage('library');
  assert.equal(libraryPageData(state).items.length,25);
});
