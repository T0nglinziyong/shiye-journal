import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectSync} from '../src/project-sync.js';

test('a merged project stays in outbox until server acknowledges it',async()=>{
 let revision=7,rows=[{serial:1,baseRevision:6,operationID:'old',
   record:{id:'project:work',kind:'project',payload:{id:'work',title:'offline'}}}];
 const committed=[];
 const q=createProjectSync({load:async()=>structuredClone(rows),
   reload:async()=>structuredClone(rows),
   write:async next=>{rows=structuredClone(next);},
   revision:()=>revision,
   reconcile:async()=>({kind:'replace',record:{
     id:'project:work',kind:'project',payload:{id:'work',title:'merged'}
   }}),
   commit:async item=>{committed.push(item.payload.title);revision++;}
 });
 await q.flush();
 assert.deepEqual(committed,['merged']);
 assert.deepEqual(rows,[]);
});
