import test from 'node:test';
import assert from 'node:assert/strict';
import {draft,itemFromAsset,setDraftPaperSize} from '../src/domain.js';
import {sceneLayerEntries,groupSceneLayers,validateSceneExtensions} from '../src/scene-model.js';

test('changing page size preserves physical coordinates for every nested Scene v2 layer',()=>{
 const d=draft({ratio:'a4'});
 const material=itemFromAsset({id:'real',physicalWidthMM:28,physicalHeightMM:35},d,180,220);
 d.items.push(material);
 d.primitives.push({id:'shape',kind:'rectangle',x:120,y:250,width:80,height:50,lineWidth:3,zIndex:2});
 d.textBlocks.push({id:'text',content:'手帐',x:200,y:440,width:110,height:70,fontSize:28,color:'#203040',zIndex:3});
 d.strokes.push({id:'ink',color:'#556677',width:3,zIndex:4,points:[{x:100,y:170,p:.2},{x:170,y:250,p:.8}]});
 groupSceneLayers(d,['shape','text'],{id:'group'});
 const beforeWidth=d.canvas.width,beforeHeight=d.canvas.height,beforeMM=d.physicalPageHeightMM;
 const originals=sceneLayerEntries(d).map(({value:n})=>({id:n.id,type:n.type,x:n.x,y:n.y,w:n.width,h:n.height,points:n.points?.map(p=>({...p})),font:n.fontSize}));
 const oldMM=({x,y})=>({x:(x-beforeWidth/2)*beforeMM/beforeHeight,y:(y-beforeHeight/2)*beforeMM/beforeHeight});
 const realMM=originals.map(n=>({id:n.id,point:n.type==='ink'?n.points.map(oldMM):oldMM(n),w:n.type==='ink'?null:n.w*beforeMM/beforeHeight,h:n.type==='ink'?null:n.h*beforeMM/beforeHeight}));
 setDraftPaperSize(d,'weeks');
 for(const {id,point,w,h} of realMM){
  const value=sceneLayerEntries(d).find(e=>e.value.id===id).value,after=n=>({x:(n.x-d.canvas.width/2)*d.physicalPageHeightMM/d.canvas.height,y:(n.y-d.canvas.height/2)*d.physicalPageHeightMM/d.canvas.height});
  const updated=value.type==='ink'?value.points.map(after):after(value);
  if(Array.isArray(point)){point.forEach((p,i)=>{assert.ok(Math.abs(p.x-updated[i].x)<1e-7);assert.ok(Math.abs(p.y-updated[i].y)<1e-7);});}
  else{assert.ok(Math.abs(point.x-updated.x)<1e-7);assert.ok(Math.abs(point.y-updated.y)<1e-7);assert.ok(Math.abs(value.width*d.physicalPageHeightMM/d.canvas.height-w)<1e-7);assert.ok(Math.abs(value.height*d.physicalPageHeightMM/d.canvas.height-h)<1e-7);}
 }
 assert.equal(validateSceneExtensions(d),true);
 assert.equal(d.layers.some(node=>node.type==='group'),true);
});
