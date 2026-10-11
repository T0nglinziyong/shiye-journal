import test from 'node:test';import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';import {snapshotDraft} from '../src/draft-snapshot.js';
test('Scene v2 history makes a deep tree snapshot of all kinds, not a second array layout',()=>{
 const d=draft();d.primitives.push({id:'shape',kind:'vector',vectorPaths:[[[0,0],[1,0],[1,1]]],x:10,y:10,width:100,height:100});
 d.strokes.push({id:'ink',points:[{x:1,y:2}],width:3,color:'#334455'});
 const copy=snapshotDraft(d);d.primitives[0].x=20;d.strokes[0].points[0].x=4;
 assert.equal(copy.primitives[0].x,10);assert.equal(copy.strokes[0].points[0].x,1);
 assert.deepEqual(JSON.parse(JSON.stringify(copy)).layers.length,2);
 assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(copy)),'primitives'),false);
});
