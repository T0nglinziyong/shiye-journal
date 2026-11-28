import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {shapeSVG} from '../src/editor-tools-model.js';
import {validatePaperSurface} from '../src/paper-surface.js';
import {createCreationDocument} from '../src/creation-document.js';
import {inspectCreationDocument} from '../src/creation-inspection.js';
import {draft} from '../src/domain.js';
import {applyCreationV2Batch} from '../src/creation-v2-commands.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
const shape={id:'paper',type:'shape',kind:'ellipse',width:160,height:100,fill:'#D9E3D6',stroke:null,paperSurface:{kind:'fiber',intensity:.7,seed:9,unitScale:4}};
async function pixels(node){const c=createCanvas(160,100);c.getContext('2d').drawImage(await loadImage(Buffer.from(shapeSVG(node).replace('<svg ','<svg width="160" height="100" '))),0,0,160,100);return c.getContext('2d').getImageData(0,0,160,100).data;}
test('paper finish renders real texture deterministically without painting outside the paper silhouette',async()=>{
 const a=await pixels(shape),b=await pixels(structuredClone(shape)),plain=await pixels({...shape,paperSurface:null});
 assert.deepEqual(a,b);assert.notDeepEqual(a,plain);
 assert.equal(a[3],0);assert.equal(a[(99*160+159)*4+3],0);
 assert.deepEqual(await pixels({...shape,fill:null}),await pixels({...shape,fill:null,paperSurface:null}));
 assert.notDeepEqual(a,await pixels({...shape,paperSurface:{...shape.paperSurface,seed:10}}));
});
test('paper finish survives canonical editing and JSON persistence, can be cleared, rejects invalid values',async()=>{
 const doc=await createCreationDocument({draft:draft(),assets:[],prompt:'纸感测试'});
 const apply=(d,operations,id)=>applyCreationV2Batch(d,{protocolVersion:2,transactionId:id,baseSceneRevision:creationSceneRevision(d),operations},[]);
 const next=apply(doc,[{op:'graphic.add',id:'paper',geometry:{kind:'rect'},place:{reference:'page',at:[40,40],unit:'mm'},size:{width:50,height:40,unit:'mm'},style:{fill:'#D9E3D6',paperSurface:{kind:'torn'}}}],'add');
 const saved=JSON.parse(JSON.stringify(next));assert.equal(saved.page.layers[0].paperSurface.seed,17);assert.equal(saved.page.layers[0].paperSurface.intensity,.45);validatePaperSurface(saved.page.layers[0]);
 for(const full of [false,true]){const exposed=inspectCreationDocument(saved,{full}).layers[0].paperSurface;assert.deepEqual(exposed,{kind:'torn',intensity:.45,seed:17});apply(saved,[{op:'layer.update',target:'paper',style:{paperSurface:exposed}}],'reuse-'+full);}
 assert.equal(apply(saved,[{op:'layer.update',target:'paper',style:{paperSurface:null}}],'clear').page.layers[0].paperSurface,null);
 assert.throws(()=>apply(saved,[{op:'layer.update',target:'paper',style:{paperSurface:{kind:'fiber',intensity:2,seed:1}}}],'invalid'));
 assert.throws(()=>validatePaperSurface({...shape,type:'text'}));
});
test('paper finish remains editable in Fabric and composes with gradient and outline without outlining grain',async()=>{
 const fabric=await import('fabric/node');
 const {createFabricSceneBridge}=await import('../src/fabric-scene-bridge.js');
 const node={...shape,x:100,y:80,rotation:7,graphicGradient:{angleDeg:0,stops:[{offset:0,color:'#DDE8D1'},{offset:1,color:'#B9C4CF'}]},graphicOutline:{color:'#53645B',width:2,offsetX:1,offsetY:2}};
 const svg=shapeSVG(node);assert.equal((svg.match(/mask id=/g)||[]).length,1);assert.ok(svg.indexOf('paper-surface-mask')>0);
 const bridge=createFabricSceneBridge(fabric),object=await bridge.fromNode(node);assert.equal(object.type,'image');assert.equal(object.sceneID,node.id);
 assert.ok(object.getElement().width>0);assert.equal(node.paperSurface.seed,9);
});
test('torn preset cuts transparent irregular edges even at zero texture intensity',async()=>{
 const node={...shape,kind:'rectangle',paperSurface:{...shape.paperSurface,kind:'torn',intensity:0}},p=await pixels(node);
 assert.equal(p[(50*160+80)*4+3],255);
 assert.equal(p[3],0);
 const topEdges=[];for(let x=10;x<150;x++){let y=0;while(y<10&&p[(y*160+x)*4+3]<240)y++;topEdges.push(y);}
 const edgeAlpha=Array.from({length:140},(_,i)=>p[(2*160+10+i)*4+3]);assert.ok(new Set(edgeAlpha).size>10,'subpixel edge must vary instead of making a rectangular inset');
 assert.deepEqual(p,await pixels(JSON.parse(JSON.stringify(node))));
});
test('advanced paper combines editable ruling, visible grain and real translucency in one node',async()=>{
 const doc=await createCreationDocument({draft:draft({mode:'spread',ratio:'custom:110x157'}),assets:[],prompt:'双页纸张'});
 const apply=(d,operations,id)=>applyCreationV2Batch(d,{protocolVersion:2,transactionId:id,baseSceneRevision:creationSceneRevision(d),operations},[]);
 const next=apply(doc,[{op:'graphic.add',id:'sheet',geometry:{kind:'paper',options:{paperPattern:'ruled',grain:.8,torn:true,rows:10,translucency:.45}},place:{reference:'page',at:[45,60],unit:'mm'},size:{width:60,height:85,unit:'mm'}}],'paper');
 const saved=JSON.parse(JSON.stringify(next)),node=saved.page.layers[0];
 assert.equal(node.kind,'paper');assert.equal(node.shadow,undefined);assert.equal(node.shapeOptions.paperPattern,'ruled');
 const a=await pixels(node),plain=await pixels({...node,shapeOptions:{...node.shapeOptions,paperPattern:'plain',grain:0}});
 assert.notDeepEqual(a,plain);const alpha=a[(50*160+80)*4+3];assert.ok(alpha>125&&alpha<160,alpha);
 const opaque=await pixels({...node,shapeOptions:{...node.shapeOptions,translucency:0}});assert.equal(opaque[(50*160+80)*4+3],255);
 const changed=apply(saved,[{op:'layer.update',target:'sheet',geometry:{kind:'paper',options:{paperPattern:'grid'}}}],'grid').page.layers[0];
 assert.equal(changed.shapeOptions.translucency,.45);assert.equal(changed.shapeOptions.rows,10);
 assert.notDeepEqual(a,await pixels(changed));assert.throws(()=>apply(saved,[{op:'layer.update',target:'sheet',geometry:{kind:'paper',options:{paperPattern:'unknown'}}}],'bad'));
 const fabric=await import('fabric/node'),{createFabricSceneBridge}=await import('../src/fabric-scene-bridge.js');
 const object=await createFabricSceneBridge(fabric).fromNode(node);assert.equal(object.type,'image');assert.equal(object.sceneID,'sheet');
});

test('advanced paper outline follows the sheet rather than tracing every fibre and ruling',()=>{
 const node={...shape,kind:'paper',shapeOptions:{paperPattern:'grid'},graphicOutline:{color:'#FA00FA',width:2,offsetX:0,offsetY:0}};
 const svg=shapeSVG(node);assert.equal((svg.match(/stroke="#FA00FA"/g)||[]).length,1);
});
test('paper noise paints visible tonal variation in the Node renderer, not an ignored SVG resource',async()=>{
 const node={...shape,kind:'rectangle',paperSurface:{...shape.paperSurface,intensity:.8}};
 const render=async svg=>{const c=createCanvas(160,100),ctx=c.getContext('2d');ctx.drawImage(await loadImage(Buffer.from(svg.replace('<svg ','<svg width="160" height="100" '))),0,0,160,100);return ctx.getImageData(0,0,160,100).data;};
 const svg=shapeSVG(node),a=await render(svg),b=await render(svg.replace(/fill="url\(#paper-grain-noise\)" opacity="[^"]+"/,'fill="url(#paper-grain-noise)" opacity="0"'));
 let diff=0,count=0;for(let y=10;y<90;y++)for(let x=10;x<150;x++){const i=(y*160+x)*4;diff+=Math.abs(a[i]-b[i]);count++;}
 assert.ok(diff/count>1,`noise must actually paint: ${diff/count}`);
});
