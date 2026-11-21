import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {journalReferenceCases,selectJournalReferenceCases,journalReferenceGuide} from '../src/journal-reference-catalog.js';
import {journalSourceAudit} from '../src/journal-source-audit.js';

test('creative reference families exclude the page-size chart without shipping screenshots',async()=>{
  const numbers=journalReferenceCases.flatMap(entry=>entry.sourceNumbers);
  assert.equal(numbers.length,69);
  assert.deepEqual([...numbers].sort((a,b)=>a-b),Array.from({length:70},(_,i)=>i+1).filter(number=>number!==47));
  assert.equal(journalSourceAudit[46].kind,'reference');
  for(const entry of journalReferenceCases){
    assert.match(entry.image,/^\/journal-cases\/[a-z-]+\.png$/);
    const file=fileURLToPath(new URL(`../public${entry.image}`,import.meta.url));
    const bytes=await readFile(file);
    assert.deepEqual([...bytes.subarray(0,4)],[137,80,78,71]);
    assert.ok(bytes.length>100_000);
  }
});

test('only two distinct relevant cases are selected by purpose, style and materials',()=>{
  const food=selectJournalReferenceCases({styles:['密集拼贴'],purposes:['图文收藏'],materials:[{title:'早餐碗贴纸',tags:['食物']} ]});
  assert.equal(food.length,2);
  assert.equal(food[0].id,'warm-food');
  const planner=selectJournalReferenceCases({styles:['清单手帐'],purposes:['清单计划'],materials:[{title:'可写便签'}]});
  assert.equal(planner[0].id,'gentle-planner');
  const travel=selectJournalReferenceCases({styles:['旅行票据'],purposes:['旅途记录'],materials:[{title:'地图票据'}]});
  assert.equal(travel[0].id,'travel-route');
  assert.notDeepEqual(food.map(item=>item.id),planner.map(item=>item.id));
  const guide=journalReferenceGuide(food);
  assert.match(guide,/不是可使用的素材/);
  assert.match(guide,/最终文字以本次内容策略为准/);
});
