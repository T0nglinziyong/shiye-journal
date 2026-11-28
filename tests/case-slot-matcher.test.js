import test from 'node:test';
import assert from 'node:assert/strict';
import {matchCaseStructures,resolveSlot,planSlotProcessing} from '../creative-agent/library/case-slot-matcher.js';
const a=(alias,name,kind,w,h)=>({alias,originalFilename:name,kind,physicalWidthMM:w,physicalHeightMM:h});
const basket=[a('m1','Back to School card','paper',62.7,98.1),a('m2','LifeWear text card','paper',84.5,65.7),a('m3','Chinese typographic sticker','sticker',24,27),a('m4','rabbit text','sticker',43,15),a('m5','JOURNEY writing card','paper',59,87),a('m6','star pattern paper','paper',70,108),a('m7','person sticker','sticker',50,77),a('m8','blue paper strip','paper',42,15)];
test('matches the own basket to a layered structure and preserves every source identity',()=>{
 const ranked=matchCaseStructures(basket);
 assert.equal(ranked[0].id,'D153');
 assert.equal(ranked[0].bindings.backing,'m6');
 assert.equal(ranked[0].bindings['vertical-card'],'m5');
 assert.equal(ranked[0].bindings.figure,'m7');
 assert.equal(resolveSlot('number',ranked[0].bindings,basket).type,'generated');
});
test('only generic backing may be cropped to a measured slot',()=>{
 const backing=planSlotProcessing(basket[5],{widthMm:60,heightMm:90},'backing');
 assert.equal(backing.method,'crop');
 assert.deepEqual(backing.region.box,[5,9,60,90]);
 assert.equal(planSlotProcessing(basket[4],{widthMm:50,heightMm:60},'vertical-card').method,'reflow');
 assert.equal(planSlotProcessing(basket[6],{widthMm:40,heightMm:50},'figure').method,'reflow');
});
test('a supplied numeral or card replaces its generated or less fitting counterpart',()=>{
 const withNumber=[...basket,a('n1','large blue number 14','sticker',22,48)];
 const d146=matchCaseStructures(withNumber).find(x=>x.id==='D146');
 assert.equal(d146.bindings.number,'n1');
 assert.equal(resolveSlot('number',d146.bindings,withNumber).type,'material');
 const withCard=[...basket,a('c1','blue horizontal card','paper',89,61)];
 const d158=matchCaseStructures(withCard).find(x=>x.id==='D158');
 assert.equal(d158.bindings['horizontal-card'],'c1');
});
