import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('offline shell excludes large OpenCV and offline packer bundles',()=>{
 const file=readFileSync(new URL('../scripts/precache.mjs',import.meta.url),'utf8');
 assert.match(file,/offline-/);
 assert.match(file,/opencv-/);
 assert.match(file,/!x\.endsWith\('\.wasm'\)/);
});
