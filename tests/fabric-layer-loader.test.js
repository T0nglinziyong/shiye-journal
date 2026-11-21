import assert from 'node:assert/strict';
import test from 'node:test';
import {projectFabricLayers} from '../src/fabric-layer-loader.js';

test('a slow or failed material does not hold finished shapes and text',async()=>{
  const loaded=[],issues=[];
  const canvas={getObjects:()=>[...loaded],insertAt:(index,object)=>loaded.splice(index,0,object),
    requestRenderAll:()=>{}};
  let releaseImage;
  const delayed=new Promise(resolve=>releaseImage=resolve);
  const nodes=[{id:'image',zIndex:0},{id:'shape',zIndex:1},{id:'text',zIndex:2},
    {id:'broken',zIndex:3}];
  const bridge={fromNode:async node=>{
    if(node.id==='image')await delayed;
    if(node.id==='broken')throw Error('图片失效');
    return {sceneID:node.id,set(values){Object.assign(this,values);}};
  }};
  const done=projectFabricLayers(canvas,nodes,bridge,{onIssue:error=>issues.push(error.message)});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(loaded.map(object=>object.sceneID),['shape','text']);
  assert.deepEqual(issues,['图片失效']);
  releaseImage();
  const result=await done;
  assert.deepEqual(loaded.map(object=>object.sceneID),['image','shape','text']);
  assert.equal(result.filter(item=>item.status==='rejected').length,1);
});

test('disposed canvas receives no late decoded image',async()=>{
  const loaded=[],canvas={getObjects:()=>loaded,insertAt:(index,object)=>loaded.splice(index,0,object),
    requestRenderAll:()=>{}};
  let release,active=true;
  const bridge={fromNode:()=>new Promise(resolve=>release=()=>resolve({sceneID:'late'}))};
  const done=projectFabricLayers(canvas,[{id:'late'}],bridge,{isCurrent:()=>active});
  await new Promise(resolve=>setImmediate(resolve));
  active=false;release();await done;
  assert.equal(loaded.length,0);
});
