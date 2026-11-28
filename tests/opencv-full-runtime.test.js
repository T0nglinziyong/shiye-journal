import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync,existsSync} from 'node:fs';

test('browser recognition lazily loads the pinned full OpenCV package',()=>{
  const runtime=readFileSync(new URL('../src/vision-runtime.js',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../src/opencv-worker-browser.js',import.meta.url),'utf8');
  assert.match(runtime,/@techstark\/opencv-js\/dist\/opencv\.js\?url/);
  assert.match(runtime,/opencvScriptURL:fullOpenCVScriptURL/);
  assert.match(worker,/const cv=await loadRuntime\(opencvScriptURL\)/);
  assert.match(runtime,/new Worker\(new URL/);
  assert.doesNotMatch(readFileSync(new URL('../scripts/precache.mjs',import.meta.url),'utf8'),/opencv_js\.wasm/);
  assert.ok(statSync(new URL('../node_modules/@techstark/opencv-js/dist/opencv.js',import.meta.url)).size>10_000_000);
});

test('obsolete slim runtime is not shipped from public assets',()=>{
  assert.equal(existsSync(new URL('../public/vendor/opencv-shiye/opencv.js',import.meta.url)),false);
  assert.equal(existsSync(new URL('../public/vendor/opencv-shiye/opencv_js.wasm',import.meta.url)),false);
});
