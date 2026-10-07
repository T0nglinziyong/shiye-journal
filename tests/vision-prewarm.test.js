import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('import flow prewarms the OpenCV worker before the first recognition task',()=>{
  const runtime=readFileSync(new URL('../src/vision-runtime.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../src/workflow-ui.js',import.meta.url),'utf8');
  assert.match(runtime,/export function prewarmVision\(\{parallel=false\}=\{\}\)/);
  assert.match(runtime,/data\?\.type==='ready'/);
  assert.match(runtime,/hardwareConcurrency\|\|0\)>=8\?2:1/);
  assert.match(runtime,/prewarmVision\(\{parallel:true\}\)/);
  assert.match(workflow,/pointerdown[^\n]+prewarmVision/);
  assert.match(workflow,/function mountImport[\s\S]{0,220}prewarmVision/);
});


test('material library idle time starts OpenCV prewarm before import',()=>{
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/function scheduleVisionPrewarm\(\)/);
  assert.match(app,/requestIdleCallback\(start,\{timeout:1200\}\)/);
  assert.match(app,/state\.accountId=accountId;scheduleVisionPrewarm\(\)/);
  assert.match(app,/name==='import'[\s\S]{0,100}prewarmVision\(\)/);
  assert.doesNotMatch(app,/name==='import'[\s\S]{0,140}visionTask\('warmup'/);
});
