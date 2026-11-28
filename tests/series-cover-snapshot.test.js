import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {seriesCoverSignature,waitForCoverImage} from '../src/series-cover-snapshot.js';

test('series snapshot identity changes with its selected picture, not its title',()=>{
  const series={id:'s',title:'old',coverAssetIDs:['a']},assets=[{id:'a',seriesID:'s',blobId:'image-1',updatedAt:'t1'}];
  const first=seriesCoverSignature(series,assets);
  assert.equal(seriesCoverSignature({...series,title:'new'},assets),first);
  assert.notEqual(seriesCoverSignature(series,[{...assets[0],blobId:'image-2'}]),first);
  assert.notEqual(seriesCoverSignature({...series,coverAssetIDs:['b']},[...assets,{id:'b',seriesID:'s',blobId:'other'}]),first);
});

test('a one-pixel placeholder cannot become the saved series snapshot',async()=>{
  const win=new Window({url:'https://example.test'}),previous=globalThis.MutationObserver;
  globalThis.MutationObserver=win.MutationObserver;
  try{
    const img=win.document.createElement('img');win.document.body.append(img);
    let width=1;Object.defineProperties(img,{complete:{configurable:true,get:()=>true},naturalWidth:{configurable:true,get:()=>width}});
    img.src='data:image/svg+xml,%3Csvg/%3E#shiye-image=asset';
    let settled=false;const pending=waitForCoverImage(img).then(value=>{settled=true;return value;});
    await Promise.resolve();assert.equal(settled,false);
    width=180;img.src='blob:https://example.test/asset';img.dispatchEvent(new win.Event('load'));
    assert.equal(await pending,img);
  }finally{if(previous)globalThis.MutationObserver=previous;else delete globalThis.MutationObserver;win.close();}
});
