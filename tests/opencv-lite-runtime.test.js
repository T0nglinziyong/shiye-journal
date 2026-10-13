import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {existsSync} from 'node:fs';

test('browser recognition loads the vendored minimal OpenCV runtime',()=>{
  const runtime=readFileSync(new URL('../src/vision-runtime.js',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../src/opencv-worker-browser.js',import.meta.url),'utf8');
  assert.match(runtime,/\/vendor\/opencv-shiye\/opencv\.js/);
  assert.match(runtime,/opencvScriptURL:minimalOpenCVScriptURL/);
  assert.match(worker,/const cv=await loadRuntime\(opencvScriptURL\)/);
  assert.doesNotMatch(runtime+worker,/@techstark\/opencv-js\/dist\/opencv\.js/);
  assert.match(readFileSync(new URL('../scripts/precache.mjs',import.meta.url),'utf8'),/assets\/opencv_js\.wasm/);
  assert.ok(existsSync(new URL('../public/vendor/opencv-shiye/opencv_js.wasm',import.meta.url)));
});

test('legacy minimal OpenCV build remains restricted to Shiye modules and split WASM',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/build-opencv-shiye.yml',import.meta.url),'utf8');
  assert.match(workflow,/--disable_single_file/);
  assert.match(workflow,/-DBUILD_LIST=core,imgproc,photo,js/);
  assert.doesNotMatch(workflow,/-DBUILD_opencv_dnn=ON/);
  assert.match(workflow,/opencv_js\.wasm/);
});

