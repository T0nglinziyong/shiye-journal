import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeFontCatalog} from '../src/offline-font-catalog.mjs';
import {describeCreationCommand} from '../src/creation-v2-contract.js';
test('font summary selects from the entire catalog, with full discovery on demand',()=>{
 const names=[...Array.from({length:300},(_,i)=>`A-font-${i}`),'Noto Sans CJK SC','Noto Serif CJK SC','KaiTi','Noto Sans CJK SC'];
 const brief=summarizeFontCatalog(names),full=summarizeFontCatalog(names,{full:true});
 assert.equal(brief.recommended.serif,'Noto Serif CJK SC');assert.equal(brief.recommended.sans,'Noto Sans CJK SC');
 assert.equal(brief.totalFamilies,303);assert.equal(full.families.length,303);assert.ok(brief.families.length<=4);
 assert.match(brief.fullHelp,/--full/);assert.ok(JSON.stringify(brief).length<1000);
 for(const name of brief.families)assert.ok(full.families.includes(name));
});
test('bundled font remains available without fontconfig, absent fonts are not advertised',()=>{
 const bundled=summarizeFontCatalog([],{bundledHandFont:true,discovery:'unavailable'});
 assert.equal(bundled.recommended.hand,'Ma Shan Zheng');assert.deepEqual(bundled.families,['Ma Shan Zheng']);
 const absent=summarizeFontCatalog([],{discovery:'unavailable'});assert.equal(absent.artisticFontAvailable,false);assert.deepEqual(absent.families,[]);assert.match(absent.note,/未发现/);
});
test('compact geometry help retains sketch fields and conditional constraints',()=>{
 const help=describeCreationCommand('geometry'),sketch=help.variants.find(v=>v.fields?.kind?.const==='sketch');
 assert.ok(sketch);assert.deepEqual(sketch.required,['kind','motif']);assert.ok(sketch.fields.motif.enum.includes('loop'));assert.equal(sketch.fields.seed.minimum,1);
 assert.deepEqual(sketch.constraints[0].if.required,['waypoints']);assert.equal(sketch.constraints[0].then.fields.motif.const,'trail');
 assert.ok(JSON.stringify(help).length<5000);
});
