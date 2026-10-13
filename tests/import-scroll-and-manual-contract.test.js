import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const get=path=>readFile(new URL('../src/'+path,import.meta.url),'utf8');
test('manual confirmation passes physicalBoundary, not an unrotated rectangle',async()=>{
 const app=await get('app.js'),geometry=await get('manual-import-geometry.js');
 assert.match(app,/manualPhysicalRegion\(box,aw,ah\)/);
 assert.match(app,/boxes:\[manualRegion\],method:'physical'/);
 assert.match(app,/shapeRegularization:false,apertures:false/);
 assert.match(app,/orientedBox:manualRegion\.orientedBox/);
 assert.match(geometry,/cosine=Math\.cos\(radians\),sine=Math\.sin\(radians\)/);
});
test('switching batch photos keeps horizontal photo queue scroll position',async()=>{
 const app=await get('app.js');
 assert.match(app,/view\.querySelector\('\.queue-strip'\)/);
 assert.match(app,/const importQueueScroll=priorImportQueue\?\.scrollLeft\?\?null/);
 assert.match(app,/replacement\.scrollLeft=importQueueScroll/);
});
