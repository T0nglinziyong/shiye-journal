import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('vision only prewarms on import intent; normal startup avoids heavy WASM',()=>{
  const runtime=readFileSync(new URL('../src/vision-runtime.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../src/workflow-ui.js',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(runtime,/export function prewarmVision\(\{parallel=false\}=\{\}\)/);
  assert.match(workflow,/pointerdown[^\n]+prewarmVision/);
  assert.match(workflow,/function mountImport\(c\)[\s\S]{0,350}state\.importMode!=='snapshot'\)void prewarmVision/);
  assert.doesNotMatch(app,/scheduleVisionPrewarm\(/);
  assert.doesNotMatch(html,/rel="preload" href="\/vendor\/opencv/);
});
test('vision worker timeout aborts the complete slot rather than leaving WASM running',()=>{
  const runtime=readFileSync(new URL('../src/vision-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/resetSlot\(index,Error\('本机图像处理超时/);
  assert.match(runtime,/slot\.worker\?\.terminate/);
  assert.match(runtime,/clearTimeout\(slot\.readyTimer\)/);
});
