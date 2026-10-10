import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {unpackHoughSegments} from '../src/hough-segments.js';

// A real mobile diagnostic reported Mat shape [1,407] and 1628 int32s:
// 407 x/y endpoint quartets, NOT a single Hough line.
const diagnosticShape={rows:1,cols:407};
function makeMat(rows,cols){
  const data32S=new Int32Array(rows*cols*4);
  for(let i=0;i<rows*cols;i++){
    data32S.set([i+11,i+22,i+33,i+44],i*4);
  }
  return {rows,cols,data32S};
}
test('one-row 407-column CV_32SC4 Hough matrix contains 407 lines, not 1',()=>{
  const lines=unpackHoughSegments(makeMat(diagnosticShape.rows,diagnosticShape.cols));
  assert.equal(lines.length,407);
  assert.deepEqual(lines[0],[11,22,33,44]);
  assert.deepEqual(lines[406],[417,428,439,450]);
});
test('407-row one-column matrix encodes the identical set of lines',()=>{
  assert.deepEqual(unpackHoughSegments(makeMat(1,407)),
    unpackHoughSegments(makeMat(407,1)));
});
test('empty and malformed CV matrices are handled explicitly',()=>{
  assert.deepEqual(unpackHoughSegments({rows:0,cols:0,data32S:new Int32Array()}),[]);
  assert.throws(()=>unpackHoughSegments({rows:1,cols:1,data32S:new Int32Array([1,2,3])}),/groups of 4/);
  assert.throws(()=>unpackHoughSegments({rows:1,cols:1}),/groups of 4/);
});
test('quad worker uses the decoded CV vectors and reports the actual segment count',async()=>{
  const source=await readFile(new URL('../src/opencv-worker.js',import.meta.url),'utf8');
  assert.match(source,/const lines=unpackHoughSegments\(segments\);/);
  assert.match(source,/unpackedSegments:lines\.length/);
  assert.doesNotMatch(source,/length:segments\.rows/);
  assert.match(source,/detectWhitePaperQuad\(lines,blurred\.data,support\.data/);
});
