import test from 'node:test';
import assert from 'node:assert/strict';
import {paperPresets,paperDimensions,paperSizeOptions} from '../src/paper-sizes.js';
import {canvasSize,draft,itemFromAsset,setDraftPaperSize} from '../src/domain.js';
import {importPaperDimensions} from '../src/import-save.js';
import {renderMatchingPage} from '../src/matching-view.js';

test('size chart presets have distinct ids and physical canvas ratios',()=>{
  assert.equal(new Set(paperPresets.map(x=>x.id)).size,paperPresets.length);
  assert.ok(paperPresets.length>=25);
  for(const size of paperPresets){
    assert.deepEqual(paperDimensions(size.id),{width:size.width,height:size.height});
    const d=draft({ratio:size.id});
    assert.equal(d.physicalPageHeightMM,size.height);
    assert.ok(Math.abs(d.canvas.width/d.canvas.height-size.width/size.height)<1e-9);
    assert.ok(Math.abs(canvasSize('spread',size.id).width/1000-2*size.width/size.height)<1e-9);
  }
  assert.deepEqual(paperDimensions('b5'),{width:176,height:250});
  assert.deepEqual(paperDimensions('b5-jis'),{width:182,height:257});
  assert.deepEqual(paperDimensions('m2-5'),{width:42,height:105});
});

test('import calibration and selectors use the same named dimensions',()=>{
  assert.deepEqual(importPaperDimensions({paperSize:'weeks',paperOrientation:'portrait'}),[95,188]);
  assert.deepEqual(importPaperDimensions({paperSize:'weeks',paperOrientation:'landscape'}),[188,95]);
  const options=paperSizeOptions('weeks',{includeNone:true});
  assert.match(options,/<option value="weeks" selected>Weeks · 95 × 188 mm<\/option>/);
  assert.match(options,/<option value="none"/);
  assert.equal((options.match(/selected/g)||[]).length,1);
  assert.equal(paperDimensions('unknown'),null);
  assert.equal(paperDimensions('custom:20x30'),null);
});

test('matching direction includes size-chart choices',()=>{
  const state={assets:[],basket:[],coreIDs:[],excludedAssetIDs:[],matchStyles:[],matchPurposes:[],matchMode:'single',matchRatio:'b5-half',matchProcessing:'保留完整',matchIntent:'',matchContentPolicy:'documentary',matchUserText:'',matchFacts:'',recommendFilter:'全部',customPaperWidth:210,customPaperHeight:297,aiSettings:{autoIncludeRecommendations:false,requireAllCandidates:false},materialUseHints:{},materialUseRequired:{}};
  const html=renderMatchingPage({state,head:()=>'',imgTag:()=>'',esc:x=>x,kindName:x=>x,session:{render:()=>''}});
  assert.match(html,/<option value="b5-half" selected>B5 Half · 91 × 257 mm<\/option>/);
});

test('changing paper format does not silently change a placed material’s millimetres',()=>{
  const d=draft({ratio:'a4'}),item=itemFromAsset({id:'sticker',physicalWidthMM:28,physicalHeightMM:35},d,d.canvas.width*.6,d.canvas.height*.4);
  d.items.push(item);
  const oldPhysicalX=(item.x-d.canvas.width/2)*d.physicalPageHeightMM/d.canvas.height;
  setDraftPaperSize(d,'weeks');
  assert.equal(d.pageRatio,'weeks');
  assert.ok(Math.abs(item.width*d.physicalPageHeightMM/d.canvas.height-28)<1e-9);
  assert.ok(Math.abs(item.height*d.physicalPageHeightMM/d.canvas.height-35)<1e-9);
  assert.ok(Math.abs((item.x-d.canvas.width/2)*d.physicalPageHeightMM/d.canvas.height-oldPhysicalX)<1e-9);
  assert.equal(item.generationBaseline.width,item.width);
});
