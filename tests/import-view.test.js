import test from 'node:test';
import assert from 'node:assert/strict';
import {renderImportHTML} from '../src/page-controllers/import-view.js';

test('completed import renders with visual-organization settings',()=>{
  const html=renderImportHTML({state:{importStep:'done',importMode:'material',
    importRecords:[],importIndex:0,importSavedCount:1,preferences:{autoOrganize:true},
    aiSettings:{key:'',includeThumbnails:true}},importSteps:()=>'',
    importSourceButtons:()=>'',renderImportReview:()=>'',renderImportInspection:()=>''});
  assert.match(html,/导入完成/);
  assert.match(html,/视觉自动整理尚未启用/);
});
