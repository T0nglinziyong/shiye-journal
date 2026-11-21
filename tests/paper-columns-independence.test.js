import test from 'node:test';
import assert from 'node:assert/strict';
import {drawPaper,paperColumnPositions} from '../src/paper-rendering.js';
import {draft as createDraft} from '../src/domain.js';
import {renderOfflinePreviewSVG} from '../src/offline-preview-svg.js';

test('column ruling and grid paper render together in canvas and offline preview',()=>{
  const draft=createDraft();
  Object.assign(draft,{canvas:{width:500,height:700},paperColor:'#ffffff',paperPattern:'grid',paperColumns:true});
  const segments=[];
  let start;
  const ctx={save(){},restore(){},fillRect(){},beginPath(){},moveTo(x,y){start=[x,y];},lineTo(x,y){segments.push([start,[x,y]]);},stroke(){}};
  drawPaper(ctx,draft);
  assert.ok(segments.some(([[x,y]])=>x===0&&y===40),'grid ruling should remain');
  assert.ok(segments.some(([[x,y]])=>x===40&&y===70),'column ruling should overlay the grid');
  const svg=renderOfflinePreviewSVG(draft,{materials:[]});
  assert.match(svg,/M0 40H500/);
  assert.match(svg,/M40 70V630/);
});
test('a spread has independent column guides on each page',()=>{
  assert.deepEqual(paperColumnPositions('spread'),[.04,.24,.26,.46,.54,.74,.76,.96]);
});
