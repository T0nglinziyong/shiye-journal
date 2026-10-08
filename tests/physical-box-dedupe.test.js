import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicatePhysicalBox,likelyNeutralPageArtifact} from '../src/material-box-discovery.js';
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
