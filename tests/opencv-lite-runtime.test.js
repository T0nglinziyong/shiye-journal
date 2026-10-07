import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('browser vision prefers the vendored minimal OpenCV runtime with a pinned fallback',()=>{
  const runtime=readFileSync(new URL('../src/vision-runtime.js',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../src/opencv-worker-browser.js',import.meta.url),'utf8');
  assert.match(runtime,/liteOpenCVScriptURL='\/vendor\/opencv-shiye\/opencv\.js'/);
  assert.match(runtime,/fallbackOpenCVScriptURL/);
  assert.match(worker,/loadRuntime\(opencvScriptURL\)/);
  assert.match(worker,/loadRuntime\(fallbackOpenCVScriptURL\)/);
});

test('minimal OpenCV build is restricted to Shiye modules and split WASM',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/build-opencv-shiye.yml',import.meta.url),'utf8');
  assert.match(workflow,/--disable_single_file/);
  assert.match(workflow,/-DBUILD_LIST=core,imgproc,photo,js/);
  assert.doesNotMatch(workflow,/-DBUILD_opencv_dnn=ON/);
  assert.match(workflow,/opencv_js\.wasm/);
});


test('full runtime is the safe default and lite is an explicit comparison mode',()=>{
  const runtime=readFileSync(new URL('../src/vision-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/requestedOpenCV==='lite'/);
  assert.match(runtime,/preferLiteOpenCV\?liteOpenCVScriptURL:fallbackOpenCVScriptURL/);
});
