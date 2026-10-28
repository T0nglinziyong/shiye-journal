import test from 'node:test';
import assert from 'node:assert/strict';
import {computeGraphics} from '../src/graphics-engine.js';
import {validateCreationV2Commands} from '../src/creation-v2-commands.js';
const query=over=>({version:1,operation:'rough',...over});
const tx=operations=>({protocolVersion:2,transactionId:'budget',baseSceneRevision:'sha256:'+'0'.repeat(64),operations});

test('normal-size hatched strips and flower outlines fit canonical path budgets without rasterization',()=>{
 const requests=[query({id:'strip',geometry:{kind:'rect'},size:{width:45,height:5,unit:'mm'},style:{fill:'#DFCA97',stroke:null,strokeWidthMm:.3,opacity:.4},seed:77,options:{roughness:.7,fillStyle:'hachure',hachureAngle:60,hachureGapMm:.7,fillWeightMm:.4}}),query({id:'flower',geometry:{kind:'flower'},size:{width:12,height:12,unit:'mm'},style:{fill:'#D1B1BA',stroke:'#8E7D91',strokeWidthMm:.3,opacity:.8},seed:15,options:{roughness:.65,fillStyle:'solid'}})];
 for(const q of requests){const result=computeGraphics(q);assert.ok(result.paths.length>=1);assert.ok(result.paths.every(p=>p.d.length<=8192));assert.doesNotThrow(()=>validateCreationV2Commands(tx(result.operations)));assert.deepEqual(result,computeGraphics(q));assert.doesNotMatch(result.svg,/<image|href=/);}
});
