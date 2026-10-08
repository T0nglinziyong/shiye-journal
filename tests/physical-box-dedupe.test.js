import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicatePhysicalBox,duplicateSparseCutout,likelyNeutralPageArtifact} from '../src/material-box-discovery.js';
test('near-contained overlapping components are one instance even if similar in area',()=>{
 assert.equal(duplicatePhysicalBox({x:100,y:150,w:90,h:170},{x:105,y:160,w:80,h:140}),true);
});
test('neighboring and partially overlapping physical materials stay separate',()=>{
 assert.equal(duplicatePhysicalBox({x:0,y:0,w:90,h:160},{x:60,y:0,w:95,h:160}),false);
 assert.equal(duplicatePhysicalBox({x:0,y:0,w:100,h:100},{x:90,y:90,w:100,h:100}),false);
});
test('near-neutral paper residue without seeds is not a material',()=>{
 assert.equal(likelyNeutralPageArtifact({seedDensity:.001,evidenceDensity:.01,fillRatio:.3}),true);
});
test('pale patterned carriers and grayscale printed stickers remain eligible',()=>{
 assert.equal(likelyNeutralPageArtifact({seedDensity:.001,evidenceDensity:.22,fillRatio:.2}),false);
 assert.equal(likelyNeutralPageArtifact({seedDensity:.05,evidenceDensity:.08,fillRatio:.18}),false);
});

test('neutral frame shadow is rejected even if it occupies over half its bounding box',()=>{
 assert.equal(likelyNeutralPageArtifact({seedDensity:0,evidenceDensity:.01,fillRatio:.65,touchesProtectedFrame:true}),true);
});
test('neutrally colored but full rectangular interior card is not auto-deleted',()=>{
 assert.equal(likelyNeutralPageArtifact({seedDensity:0,evidenceDensity:.01,fillRatio:.95,touchesProtectedFrame:false}),false);
});
test('partially contained sports cutout component at 82% box overlap is absorbed',()=>{
 assert.equal(duplicatePhysicalBox({x:387,y:622,w:117,h:199},{x:415,y:730,w:91,h:110}),true);
});

test('basketball figure partial bbox overlap still coalesces after corner jitter',()=>{
 const figure={x:387,y:622,w:117,h:199,pixels:3955,fillRatio:.17};
 const arm={x:446,y:735,w:92,h:109,pixels:1200,fillRatio:.13};
 assert.equal(duplicatePhysicalBox(figure,arm),false);
 assert.equal(duplicateSparseCutout(figure,arm,3),true);
});
test('separate adjacent or solid paper objects never become one figure',()=>{
 const figure={x:387,y:622,w:117,h:199,pixels:3955,fillRatio:.17};
 assert.equal(duplicateSparseCutout(figure,{x:509,y:730,w:91,h:110,pixels:1100,fillRatio:.14},3),false);
 assert.equal(duplicateSparseCutout(figure,{x:440,y:735,w:90,h:105,pixels:1100,fillRatio:.96},3),false);
});
