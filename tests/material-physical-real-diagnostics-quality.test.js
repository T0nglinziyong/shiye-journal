import test from 'node:test';
import assert from 'node:assert/strict';
import {physicalPolygonQuality,shouldRepairPhysicalPolygon}
 from '../src/material-physical-polygon-quality.js';
import {shouldSplitChromaCarrier}
 from '../src/material-chroma-carrier-split.js';
import {chromaRecoveryCandidateFits}
 from '../src/material-chroma-recovery.js';

// Geometry copied from the three real on-device diagnostics; no photos, keys,
// account data or original JPEG bytes are included in this public test.
const blue=[[.24947,.43675],[.43923,.51506],[.39659,.56627],[.52239,.54819],
 [.36887,.63253],[.42217,.68373],[.29638,.63253],[.29424,.76355],[.09382,.63102]];
const figure=[[.86444,.5739],[.79556,.59748],[.71111,.7956],[.75889,.83648],
 [.75222,.92296],[.78889,.92138],[.78222,.87421],[.86556,.87736],
 [.84,.75],[.87889,.61321]];
const plate=[[.20778,.05503],[.35889,.13679],[.30778,.2783],[.20111,.32075],
 [.14778,.15881],[.05889,.34434],[.19556,.33805],[.34778,.47327],
 [.31889,.53459],[.36778,.47642],[.26333,.58805],[.11556,.53931],
 [.03778,.36006],[.08111,.14151]];
test('actual blue star paper zigzag is rejected while genuine diecut remains unaltered',()=>{
 const bad=physicalPolygonQuality(blue,469,664),
   good=physicalPolygonQuality(figure,900,636);
 assert.ok(bad.sharpIndentations>=1);
 assert.equal(shouldRepairPhysicalPolygon({boundarySource:'irregular-closed',physicalBoundary:blue},bad,.7724),true);
 assert.equal(shouldRepairPhysicalPolygon({boundarySource:'irregular-closed',physicalBoundary:figure},good,.792),false);
});
test('actual self-crossing plate contour cannot be saved as pathological alpha',()=>{
 const quality=physicalPolygonQuality(plate,900,636);
 assert.ok(quality.crossings>=1);
 assert.equal(shouldRepairPhysicalPolygon({
   boundarySource:'irregular-closed',physicalBoundary:plate},quality,.713),true);
});
test('a mixed crab and red drink is split only when large isolated colour islands exist',()=>{
 const joint=[{x:0,y:8,w:277,h:195,area:36886},
   {x:287,y:74,w:108,h:103,area:8732}];
 assert.equal(shouldSplitChromaCarrier(joint,396*203,3),true);
 assert.equal(shouldSplitChromaCarrier([{x:0,y:2,w:205,h:216,area:27556}],205*216,3),false);
 const checker=Array.from({length:16},(_,i)=>({
   x:(i%4)*38,y:Math.floor(i/4)*38,w:18,h:18,area:300
 }));
 assert.equal(shouldSplitChromaCarrier(checker,200*200,3),false);
 assert.equal(shouldSplitChromaCarrier([
   {x:0,y:0,w:100,h:100,area:9000},
   {x:102,y:0,w:100,h:100,area:9000}],205*100,3),false);
});
test('recover original coloured paper beyond bad short Canny box without stealing neighbour',()=>{
 const wrongBlue={x:44,y:290,w:202,h:218};
 assert.equal(chromaRecoveryCandidateFits(wrongBlue,
   {x:5,y:292,w:239,h:275,area:33178}),true);
 assert.equal(chromaRecoveryCandidateFits(wrongBlue,
   {x:193,y:68,w:249,h:267,area:23009}),false);
 assert.equal(chromaRecoveryCandidateFits(wrongBlue,
   {x:730,y:135,w:108,h:103,area:8732}),false);
});
