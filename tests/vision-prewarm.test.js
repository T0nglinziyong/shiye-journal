import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('import flow prewarms the OpenCV worker before the first recognition task',()=>{
  const runtime=readFileSync(new URL('../src/vision-runtime.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../src/workflow-ui.js',import.meta.url),'utf8');
  assert.match(runtime,/export function prewarmVision\(\)/);
  assert.match(runtime,/data\?\.type==='ready'/);
  assert.match(workflow,/pointerdown[^\n]+prewarmVision/);
  assert.match(workflow,/function mountImport[\s\S]{0,220}prewarmVision/);
});
