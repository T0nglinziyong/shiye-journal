import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
import {candidateDiscoveryAllowed,recognitionProfile} from '../src/recognition-profiles.js';
import {normalizePreferences} from '../src/preferences.js';

const source=(w=360,h=300)=>{
 const pixels=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<w*h;i++)pixels.set([236,236,235,255],4*i);
 // One complete pale carrier with three DISCONNECTED dark printed regions.
 for(let y=45;y<193;y++)for(let x=36;x<166;x++){
   const at=(y*w+x)*4;pixels.set([196,201,216,255],at);
 }
 for(let line=0;line<3;line++)for(let y=62+line*35;y<75+line*35;y++)
   for(let x=55;x<146;x++){const at=(y*w+x)*4;pixels.set([45,53,66,255],at);}
 return {pixels,width:w,height:h,smallestMM:6,
   paperWidthMM:210,paperHeightMM:297,mergeSharedCarrier:true};
};

test('settings keep discovery and segmentation independent and explicitly restore old route',()=>{
 assert.deepEqual(['legacy','physical','unified'].map(candidateDiscoveryAllowed),[true,true,true]);
 const old=normalizePreferences({candidateDiscovery:'legacy',recognition:'morphgac'});
 const newPipeline=normalizePreferences({candidateDiscovery:'physical',recognition:'physical'});
 const mixed=normalizePreferences({candidateDiscovery:'physical',recognition:'hybrid'});
 assert.deepEqual([old.candidateDiscovery,old.recognition],['legacy','morphgac']);
 assert.deepEqual([newPipeline.candidateDiscovery,newPipeline.recognition],['physical','physical']);
 assert.deepEqual([mixed.candidateDiscovery,mixed.recognition],['physical','hybrid']);
 for(const mode of ['morphgac','physical','hybrid'])
   assert.equal(typeof recognitionProfile(mode,1200).refineCandidates,'function');
 assert.equal(normalizePreferences({candidateDiscovery:'invalid'}).candidateDiscovery,'unified');
});

test('real OpenCV worker finds intact carrier and physical mode generates alpha without MorphGAC',async()=>{
 const cv=await cvModule,p=source();
 const boxes=await processVision(cv,'boxes-physical',{...p,legacyBoxes:[]});
 const carrier=boxes.find(row=>row.x<.15&&row.y<.25&&row.w>.27&&row.h>.35);
 assert.ok(carrier,'whole carrier must be found rather than just interior ink');
 assert.equal(carrier.instanceMethod,'physical-boundary');
 assert.ok(carrier.physicalBoundary?.length>=3);
 const [physical]=await processVision(cv,'process-material-boxes',{
   ...p,boxes:[carrier],method:'physical',
   shapeRegularization:false,apertures:false
 });
 assert.equal(physical.segmentationMethod,'physical');
 assert.ok(physical.mask?.alpha?.some(v=>v===255));
 assert.equal(physical.mask.alpha.length,physical.mask.width*physical.mask.height);
 assert.ok(Number.isFinite(physical.boundaryConfidence));
 assert.ok(physical.boundaryConfidence>=0&&physical.boundaryConfidence<=1);
});

test('legacy detector and explicit old MorphGAC algorithm remain callable',async()=>{
 const cv=await cvModule,p=source();
 const n=p.width*p.height;
 const evidence=new Uint8Array(n),seeds=new Uint8Array(n);
 for(let y=40;y<200;y++)for(let x=32;x<170;x++)evidence[y*p.width+x]=seeds[y*p.width+x]=1;
 const old=await processVision(cv,'boxes-simple',{...p,mask:evidence,evidence,foregroundSeeds:seeds});
 assert.ok(old.length>0);
 const mor=await processVision(cv,'process-material-boxes',{
   ...p,boxes:[old[0]],method:'morphgac',shapeRegularization:false,apertures:false
 });
 assert.equal(mor.length,1);
 assert.ok(mor[0].mask?.alpha?.length>0);
 assert.equal(mor[0].segmentationMethod,'morphgac');
});
