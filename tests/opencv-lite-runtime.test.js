import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('browser recognition always loads one pinned OpenCV package',()=>{
  const runtime=readFileSync(new URL('../src/vision-runtime.js',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../src/opencv-worker-browser.js',import.meta.url),'utf8');
  assert.match(runtime,/@techstark\/opencv-js\/dist\/opencv\.js\?url/);
  assert.match(runtime,/opencvScriptURL:pinnedOpenCVScriptURL/);
  assert.match(worker,/const cv=await loadRuntime\(opencvScriptURL\)/);
  assert.doesNotMatch(runtime+worker,/fallbackOpenCVScriptURL|liteOpenCVScriptURL/);
});

test('legacy minimal OpenCV build remains restricted to Shiye modules and split WASM',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/build-opencv-shiye.yml',import.meta.url),'utf8');
  assert.match(workflow,/--disable_single_file/);
  assert.match(workflow,/-DBUILD_LIST=core,imgproc,photo,js/);
  assert.doesNotMatch(workflow,/-DBUILD_opencv_dnn=ON/);
  assert.match(workflow,/opencv_js\.wasm/);
});

