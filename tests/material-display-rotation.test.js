import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapDisplayRotation,rotatedPhysicalSize,acceptedOrientationDelta} from '../src/material-display-rotation.js';
import {assetEditorValue} from '../src/asset-editor.js';
import {initialMaterialClassification} from '../src/material-classification.js';

test('additional AI rotation adds to existing automatic angle without guessing the original',()=>{
  const automatic=23.5;
  assert.equal(wrapDisplayRotation(automatic+acceptedOrientationDelta({deltaDegrees:90,confidence:.91})),113.5);
  assert.equal(wrapDisplayRotation(automatic+180),-156.5);
  assert.deepEqual(rotatedPhysicalSize(20,40,90),{width:40,height:20});
  assert.equal(acceptedOrientationDelta({deltaDegrees:45,confidence:.99}),null);
  assert.equal(acceptedOrientationDelta({deltaDegrees:-90,confidence:.84}),null);
});

test('manual material angle uses the cutout angle and is marked as user choice',()=>{
  const old={id:'material',title:'纸片',...initialMaterialClassification({kind:'sticker',role:'accent'}),
    physicalWidthMM:20,physicalHeightMM:40,reviewStatus:'ready',usageStatus:'unused',
    processingRecord:{displayRotationDegrees:90,sourceWidthMM:40,sourceHeightMM:20,
      autoStraighten:false,displayRotationSource:'ai'}};
  const fields={title:'纸片',kind:'sticker',role:'accent',width:'20',height:'40',rotation:'180',
    tags:'',contentTags:'',themeTags:'',styleTags:'',colorTags:'',materialTags:'',moodTags:'',
    seriesID:'',reviewStatus:'ready',usageStatus:'unused'};
  const changed=assetEditorValue(old,fields);
  assert.equal(changed.processingRecord.displayRotationDegrees,-180);
  assert.equal(changed.processingRecord.displayRotationSource,'user');
  assert.equal(changed.processingRecord.autoStraighten,false);
  assert.equal(changed.processingRecord.sourceWidthMM,40);
  assert.throws(()=>assetEditorValue(old,{...fields,rotation:'181'}),/显示角度/);
});
