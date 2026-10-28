import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {reviewCreativeDraft} from '../src/creative-quality.js';

test('two-page physical material crossing fold warns but is never rejected or forcibly moved',()=>{
 const d=draft({mode:'spread'});
 const item={id:'center',type:'material',assetID:'paper',x:d.canvas.width/2,y:420,width:220,height:150,rotation:0,zIndex:1};
 d.items.push(item);
 const before=JSON.stringify(d);
 const report=reviewCreativeDraft(d);
 assert.ok(report.warnings.some(w=>w.includes('中缝穿过实体素材')));
 assert.equal(JSON.stringify(d),before);
 item.x=d.canvas.width*.25;
 const away=reviewCreativeDraft(d);
 assert.ok(!away.warnings.some(w=>w.includes('中缝穿过实体素材')));
 d.pageMode='single';item.x=d.canvas.width/2;
 assert.ok(!reviewCreativeDraft(d).warnings.some(w=>w.includes('中缝穿过实体素材')));
});
