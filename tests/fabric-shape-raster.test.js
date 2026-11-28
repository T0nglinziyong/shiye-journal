import test from 'node:test';
import assert from 'node:assert/strict';
import * as fabric from 'fabric/node';
import {fabricShapeRaster} from '../src/fabric-shape-raster.js';
import {shapeThumbnailSVG} from '../src/editor-tools-model.js';
const paper={id:'paper-raster',type:'shape',kind:'rectangle',x:100,y:100,width:120,height:160,fill:'#eee5d3',paperSurface:{kind:'fiber',intensity:.8,seed:117,unitScale:3}};
test('paper raster preserves SVG pixels and reuses them for selection and movement',async()=>{
 const actual=await fabricShapeRaster(paper,fabric);
 const image=await fabric.util.loadImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(shapeThumbnailSVG(paper)));
 const expected=fabric.getEnv().document.createElement('canvas');expected.width=120;expected.height=160;expected.getContext('2d').drawImage(image,0,0);
 assert.deepEqual(actual.getContext('2d').getImageData(0,0,120,160).data,expected.getContext('2d').getImageData(0,0,120,160).data);
 assert.equal(await fabricShapeRaster({...paper,id:'moved',x:300,y:400,rotation:15,opacity:.5},fabric),actual);
 assert.notEqual(await fabricShapeRaster({...paper,fill:'#aabbcc'},fabric),actual);
 assert.notEqual(await fabricShapeRaster({...paper,width:140},fabric),actual);
});
