import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

// The unaffected material-identity detector and strategy/runtime modules
// must stay byte-for-byte identical to the known-good ca0f/c6 implementation.
// The separate paper 'quad' operation has deliberately changed; image.js
// and recognition-refiners.js have separately reviewed raster-only speed edits.
const known={
  'paper-analysis.js':'6c1d0e41dbf6794a2db6b9a09ca48ed8da519d1d',
  'recognition-profiles.js':'86bea3a187c096121e5f551abc851f9f461f8c2d',
  'vision-runtime.js':'0e232cafd76e5278da5a5dd6706214cbbdb9c880'
};
for(const [name,expected] of Object.entries(known)){
  test('unchanged material recognition module matches ca0f/c6: '+name,async()=>{
    const bytes=await readFile(new URL('../src/'+name,import.meta.url));
    const actual=createHash('sha1')
      .update('blob '+bytes.length+'\0')
      .update(bytes).digest('hex');
    assert.equal(actual,expected,
      'Changing material recognition modules requires an explicit review');
  });
}
test('only the paper quad finder is intentionally redesigned, not material box discovery',async()=>{
  const [worker,image,paper]=await Promise.all(
    ['opencv-worker.js','image.js','paper-analysis.js'].map(file=>
      readFile(new URL('../src/'+file,import.meta.url),'utf8'))
  );
  assert.match(worker,/if\(operation==='quad'\)/);
  assert.match(worker,/detectWhitePaperQuad\(/);
  assert.match(worker,/if\(operation==='boxes-simple'\)return discoverMaterialBoxes/);
  assert.match(image,/segmentPaperMaterials\(discoveryFrame/);
  assert.match(paper,/visionTask\('boxes-simple'/);
});
