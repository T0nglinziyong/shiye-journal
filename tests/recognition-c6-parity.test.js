import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

// Git blob SHA-1 values verified against c6e5432d59ef752c3762a3c21af4678811e32677
// via the GitHub contents API. This guarantees the requested Oct 10 pipeline,
// not a similarly named but different pre-Oct 7 detector.
const known={
 'image.js':'88d244bf813213c40d2baf8b24e7914d9e594882',
 'paper-analysis.js':'6c1d0e41dbf6794a2db6b9a09ca48ed8da519d1d',
 'opencv-worker.js':'1f46cfe14d22171dd11f72b02e06c37a5bfc3c87',
 'recognition-profiles.js':'86bea3a187c096121e5f551abc851f9f461f8c2d',
 'recognition-refiners.js':'e4bd77e4e373e6a3d6ea5d28aa08bdba5e8f2652',
 'vision-runtime.js':'0e232cafd76e5278da5a5dd6706214cbbdb9c880'
};
for(const [name,expected] of Object.entries(known)){
 test('October 10 c6e5432d recognition core is byte-for-byte unchanged: '+name,async()=>{
   const bytes=await readFile(new URL('../src/'+name,import.meta.url));
   const blob=createHash('sha1')
     .update('blob '+bytes.length+'\0')
     .update(bytes).digest('hex');
   assert.equal(blob,expected,
     'Any future recognition algorithm change needs an explicit review and regression-suite update');
 });
}
