import test from 'node:test';
import assert from 'node:assert/strict';
import {renderWorkCoverSnapshot} from '../src/work-cover-snapshot.js';

test('COS Works cover renders complete scene using only 480px material blobs',async()=>{
  const calls=[],closed=[],output=new Blob(['snapshot'],{type:'image/webp'});
  const project={id:'work-1',activeDraftID:'draft-1',drafts:[
    {id:'draft-1',canvas:{width:750,height:1000},items:[{assetID:'material-1'}],strokes:[{points:[{x:1,y:2}]}]}]};
  let scene;
  const cover=await renderWorkCoverSnapshot(project,{
    resolveAsset:async id=>{calls.push(['asset',id]);return {id,blobId:'blob-1'};},
    previewBlob:async(id,pixels)=>{calls.push(['preview',id,pixels]);return new Blob(['tiny']);},
    createBitmap:async()=>({width:480,height:480,close:()=>closed.push(1)}),
    renderScene:async(draft,options)=>{
      scene=draft;
      assert.equal(options.scale,.48);
      assert.equal(options.waitForFonts,false);
      const first=await options.loadMaterialImage('material-1');
      assert.equal(first,await options.loadMaterialImage('material-1'));
      return {canvas:{toBlob:callback=>callback(output)}};
    }
  });
  assert.equal(cover,output);
  assert.equal(scene,project.drafts[0]);
  assert.deepEqual(calls,[['asset','material-1'],['preview','blob-1',480]]);
  assert.equal(closed.length,1);
});

test('missing referenced image rejects cover without altering project document',async()=>{
  const project={id:'work-2',activeDraftID:'d',drafts:[{id:'d',canvas:{width:600,height:800},items:[{assetID:'missing'}]}]},
    initial=structuredClone(project);
  await assert.rejects(()=>renderWorkCoverSnapshot(project,{
    resolveAsset:async()=>null,
    renderScene:async(_draft,{loadMaterialImage})=>{await loadMaterialImage('missing');}
  }),/素材不存在/);
  assert.deepEqual(project,initial);
});

test('already existing flat snapshots need no scene render',async()=>{
  const raw=new Blob(['image']),p={isSnapshot:true,snapshotBlobId:'existing'};
  assert.equal(await renderWorkCoverSnapshot(p,{getSnapshot:async id=>id==='existing'?raw:null}),raw);
});
