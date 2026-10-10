import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderImportInspection} from '../src/import-workspace-ui.js';
import {normalizePreferences,migrateStoredPreferences} from '../src/preferences.js';
import {recognitionProfile} from '../src/recognition-profiles.js';

const read=name=>readFile(new URL('../src/'+name,import.meta.url),'utf8');

test('stable recognizer is the default for every device and previous box-only settings migrate',()=>{
 const preferences=normalizePreferences({});
 assert.equal(preferences.recognition,'auto');
 assert.equal(preferences.recognitionPixels,1200);
 assert.equal(recognitionProfile('auto').analysisMaxDimension,1200);
 const old=migrateStoredPreferences({recognitionDefaultsVersion:2,
   paperSize:'letter',recognition:'hybrid',recognitionPixels:900});
 assert.equal(old.recognitionDefaultsVersion,3);
 assert.equal(old.recognition,'auto');
 assert.equal(old.recognitionPixels,1200);
 assert.equal(old.paperSize,'letter');
});

test('auto A4 detection dispatches to the pinned historical multi-stage worker',async()=>{
 const image=await read('image.js');
 const worker=await read('opencv-worker.js');
 const stable=await read('stable-recognition/paper-analysis.js');
 const legacy=await read('stable-recognition/opencv-worker.js');
 assert.match(image,/profile\.mode==='auto'/);
 assert.match(image,/await stablePaperMaterials\(/);
 for(const op of ['materials-fast','instances','enclosures','boundary-reconstruction','complete-boundaries']){
   assert.match(stable,new RegExp("'"+op+"'"));
   assert.match(worker,new RegExp("'"+op+"'"));
 }
 assert.match(worker,/processStableVision\(cv,operation,p\)/);
 assert.match(legacy,/export async function processStableVision/);
 assert.match(stable,/fuseRecognitionCandidates/);
});

test('valid candidate thumbnails stay visible even while postprocessing reports busy',()=>{
 const record={url:'blob:raw',confirmed:false,candidates:[],
   candidateData:[{url:'blob:valid-a',width:20,height:35}],
   candidateURLs:['blob:valid-a'],prefetchStatus:'ready'};
 const state={
   importMode:'material',importStep:'inspect',importRecords:[record],
   importIndex:0,importProcessing:'正在优化素材边缘',
   importCandidates:[],importCandidateData:record.candidateData,
   importCandidateURLs:record.candidateURLs,
   importCandidateSelection:new Set([0]),importBitmap:{width:100,height:150},
   importURL:'blob:raw',importBox:{x:0,y:0,w:1,h:1},
   showCorrectionPreview:false,showManualBox:false,
   paperSize:'a4',paperOrientation:'portrait',
   preferences:{recognitionPixels:1200},importRecognition:'auto'
 };
 const html=renderImportInspection({state,esc:String,fmt:String});
 assert.match(html,/候选素材 · 1/);
 assert.match(html,/blob:valid-a/);
 assert.match(html,/素材 1 ✓/);
 assert.doesNotMatch(html,/src=""/);
});

test('stable recognizer does not affect explicit experimental per-box methods',async()=>{
 const image=await read('image.js');
 assert.match(image,/if\(profile\.mode==='auto'\)/);
 assert.match(image,/segmentPaperMaterials\(discoveryFrame/);
 assert.match(image,/profile\.refineCandidates/);
});
