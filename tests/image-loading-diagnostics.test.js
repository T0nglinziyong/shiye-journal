import test from 'node:test';
import assert from 'node:assert/strict';
import {recordImageLoading,imageLoadingSnapshot,clearImageLoadingDiagnostics} from '../src/image-loading-diagnostics.js';

test('image report categorizes failures without retaining IDs, URLs or raw messages',()=>{
  clearImageLoadingDiagnostics();
  recordImageLoading({phase:'failed',tier:'display',context:'detail',waitMs:251.6,
    id:'private-image-id',url:'https://secret.invalid/token',error:Error('failed to fetch https://secret.invalid/token')});
  const report=imageLoadingSnapshot(),text=JSON.stringify(report);
  assert.equal(report.counts.failed,1);
  assert.equal(report.events[0].reason,'network');
  assert.equal(report.events[0].waitMs,252);
  assert.doesNotMatch(text,/private-image-id|secret\.invalid|token/);
  clearImageLoadingDiagnostics();
});
