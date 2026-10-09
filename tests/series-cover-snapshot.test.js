import test from 'node:test';
import assert from 'node:assert/strict';
import {seriesCoverSignature} from '../src/series-cover-snapshot.js';

test('series snapshot identity changes with its selected picture, not its title',()=>{
  const series={id:'s',title:'old',coverAssetIDs:['a']},assets=[{id:'a',seriesID:'s',blobId:'image-1',updatedAt:'t1'}];
  const first=seriesCoverSignature(series,assets);
  assert.equal(seriesCoverSignature({...series,title:'new'},assets),first);
  assert.notEqual(seriesCoverSignature(series,[{...assets[0],blobId:'image-2'}]),first);
  assert.notEqual(seriesCoverSignature({...series,coverAssetIDs:['b']},[...assets,{id:'b',seriesID:'s',blobId:'other'}]),first);
});
