import test from 'node:test';
import assert from 'node:assert/strict';
import {COVER_EDGE,DISPLAY_TIERS,imagePixelSize,imageTier,imageVariant,cachedTierChoice} from '../src/image-variants.js';

test('fixed gallery/cover edge becomes 480; dynamic pixels scale by 2/3 and round UP to discrete tiers',()=>{
 assert.equal(COVER_EDGE,480);
 assert.deepEqual(DISPLAY_TIERS,[256,360,480,600,720,960,1200,1440]);
 assert.equal(imagePixelSize(160,2),256);
 assert.equal(imagePixelSize(310,2),480);
 assert.equal(imagePixelSize(560,2),960);
 assert.equal(imagePixelSize(900.2,2),1440);
 assert.equal(imagePixelSize(6000,4),1440);
 assert.equal(imagePixelSize(0,1),480);
 assert.equal(imageVariant(721),'preview960');
 assert.equal(imageVariant(410),'preview480');
 assert.equal(imageVariant(3),'preview256');
 assert.equal(imageVariant(),'preview480');
 for(const n of [1,256,300,360,359.999,480,481,600,720,960,1100,1200,1440,1920,2300,2560,3200,3840,4000,5120,9000]){
   const tier=imageTier(n);
   assert.ok(DISPLAY_TIERS.includes(tier));
   assert.ok(tier>=n||tier===1440);
 }
});
test('a cached sufficiently large version prevents requests; otherwise show best smaller cached size immediately',()=>{
 assert.deepEqual(cachedTierChoice([960,480],720),{target:720,sufficient:960,temporary:null});
 assert.deepEqual(cachedTierChoice([256,360],600),{target:600,sufficient:null,temporary:360});
 assert.deepEqual(cachedTierChoice([480,720],256),{target:256,sufficient:480,temporary:null});
 assert.deepEqual(cachedTierChoice([],480),{target:480,sufficient:null,temporary:null});
});
