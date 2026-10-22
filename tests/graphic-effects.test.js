import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import * as fabric from 'fabric/node';
import {shapeSVG} from '../src/editor-tools-model.js';
import {inkEffectSVG,graphicPaintFrame} from '../src/graphic-effects.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {createFabricSceneBridge} from '../src/fabric-scene-bridge.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
const gradient={angleDeg:0,stops:[{offset:0,color:'#FF0000'},{offset:1,color:'#0000FF'}]};
const outline={color:'#00FF00',width:8,offsetX:5,offsetY:3};
const base={id:'graphic',type:'shape',kind:'ellipse',x:130,y:100,width:120,height:80,rotation:0,fill:'#FFFFFF',stroke:null,lineWidth:0,opacity:1};
const svgImage=(svg,w,h)=>loadImage(Buffer.from(svg.replace('<svg ',`<svg width="${Math.ceil(w)}" height="${Math.ceil(h)}" `)));
async function pixels(node){const frame=graphicPaintFrame(node),svg=shapeSVG(node),c=createCanvas(Math.ceil(frame.width),Math.ceil(frame.height)),ctx=c.getContext('2d');ctx.drawImage(await svgImage(svg,frame.width,frame.height),0,0,frame.width,frame.height);return ctx.getImageData(0,0,c.width,c.height).data;}
function counts(data){const n={red:0,blue:0,green:0,painted:0};for(let i=0;i<data.length;i+=4)if(data[i+3]>150){n.painted++;if(data[i]>data[i+2]+50)n.red++;if(data[i+2]>data[i]+50)n.blue++;if(data[i+1]>data[i]+80&&data[i+1]>data[i+2]+80)n.green++;}return n;}
test('graphic effects paint true multicolor fill and expanded offset outline without changing geometry',async()=>{
 const node={...base,graphicGradient:gradient,graphicOutline:outline},before=JSON.stringify(node),p=counts(await pixels(node));assert.ok(p.red>100&&p.blue>100&&p.green>50,JSON.stringify(p));assert.equal(JSON.stringify(node),before);
 const border=await pixels({...node,graphicOutline:{...outline,offsetX:0,offsetY:0}});assert.notDeepEqual(border,await pixels(node));
});
test('editable SVG local fills remain explicit while unpainted paths use shared gradient',async()=>{
 const node={...base,kind:'vector',svgViewBox:[0,0,100,100],svgPaths:[{d:'M0 0 L50 0 L50 100 L0 100 Z',fill:'#00FF00'},{d:'M50 0 L100 0 L100 100 L50 100 Z'}],graphicGradient:gradient};
 const p=counts(await pixels(node));assert.ok(p.green>500&&p.blue>500,JSON.stringify(p));
});
for(const penStyle of ['ballpoint','marker','brush','pressure'])test(`editable ${penStyle} SVG preserves real outline and gradient`,async()=>{
 const node={id:'ink',type:'ink',points:[{x:20,y:20,p:.3},{x:60,y:40,p:.8},{x:120,y:25,p:.5}],width:14,color:'#333333',penStyle,graphicGradient:gradient,graphicOutline:outline};
 const {svg,frame}=inkEffectSVG(node),image=await svgImage(svg,frame.width,frame.height),c=createCanvas(Math.ceil(frame.width),Math.ceil(frame.height));c.getContext('2d').drawImage(image,0,0);const p=counts(c.getContext('2d').getImageData(0,0,c.width,c.height).data);assert.ok(p.red>10&&p.blue>10&&p.green>10,JSON.stringify(p));
});
test('shared Canvas export and Fabric projection retain advanced native vector and pressure data',async()=>{
 const shape={...base,graphicOutline:outline,graphicGradient:gradient},ink={id:'ink',type:'ink',points:[{x:20,y:180,p:.2},{x:150,y:210,p:.8}],width:12,color:'#222222',penStyle:'pressure',graphicOutline:outline,graphicGradient:gradient};
 const page={sceneVersion:2,canvas:{width:300,height:300},physicalPageHeightMM:150,paperColor:'#FFFFFF',paperPattern:'plain',layers:[shape,ink]};
 const rendered=await renderSceneCanvas(page,{createCanvas:()=>createCanvas(1,1),waitForFonts:false,loadShapeImage:async(url,frame)=>svgImage(decodeURIComponent(url.split(',').slice(1).join(',')),frame.width,frame.height)});assert.ok(rendered.canvas.toBuffer('image/png').length>500);
 const bridge=createFabricSceneBridge(fabric),object=await bridge.fromNode(shape),stroke=await bridge.fromNode(ink);assert.ok(object&&stroke);const before={x:shape.x,y:shape.y,width:shape.width,height:shape.height};bridge.applyObject(page,object,{policy:USER_SCENE_POLICY});for(const k of Object.keys(before))assert.ok(Math.abs(shape[k]-before[k])<1e-6,k);
 assert.deepEqual(ink.points.map(p=>p.p),[.2,.8]);assert.deepEqual(shape.graphicGradient,gradient);assert.deepEqual(ink.graphicOutline,outline);
});
test('gradient on an explicitly hollow graphic remains a hollow stroke',async()=>{
 const node={...base,fill:null,stroke:'#333333',lineWidth:8,graphicGradient:gradient,graphicOutline:outline};
 const frame=graphicPaintFrame(node),c=createCanvas(Math.ceil(frame.width),Math.ceil(frame.height));c.getContext('2d').drawImage(await svgImage(shapeSVG(node),frame.width,frame.height),0,0);const paint=counts(c.getContext('2d').getImageData(0,0,c.width,c.height).data);assert.ok(paint.red>20&&paint.blue>20,JSON.stringify(paint));
 const center=c.getContext('2d').getImageData(Math.floor(frame.left+node.width/2),Math.floor(frame.top+node.height/2),1,1).data;assert.equal(center[3],0);
});

