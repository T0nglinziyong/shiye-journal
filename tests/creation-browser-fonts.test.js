import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBrowserCommandCapabilities} from '../src/creation-browser-fonts.js';
import {createCreationAgentSession} from '../src/creation-agent-session.js';
import {draft} from '../src/domain.js';
import {geometryArea} from '../src/craft-topology.js';
test('glyph capability lazily loads only the bundled font, reuses it, and refuses unknown families',async()=>{
 let requests=0;const prepare=createBrowserCommandCapabilities({request:async url=>{requests++;assert.match(String(url),/MaShanZheng-Regular.ttf$/);return new Response(await readFile(new URL('../src/assets/fonts/MaShanZheng-Regular.ttf',import.meta.url)));}});
 assert.deepEqual(await prepare({operations:[{op:'text.add'}]}),{});assert.equal(requests,0);
 const input=family=>({operations:[{op:'material.glyphKnockout',text:'DAY',style:{fontFamily:family,fontSizePt:20}}]});
 await assert.rejects(prepare(input('https://example.test/unsafe.ttf')),e=>e.code==='FONT_UNAVAILABLE');assert.equal(requests,0);
 const capability=await prepare(input('Ma Shan Zheng'));
 assert.ok(geometryArea(capability.glyphOutline('DAY',{fontFamily:'Ma Shan Zheng',fontSizePt:20}))>0);
 await prepare(input('Ma Shan Zheng'));assert.equal(requests,1);
 assert.throws(()=>capability.glyphOutline('DAY',{fontFamily:'other',fontSizePt:20}),/未授权/);
});
test('font-load cancellation cannot mutate or receipt a command',async()=>{
 const controller=new AbortController(),asset={id:'paper',title:'纸',physicalWidthMM:60,physicalHeightMM:40};
 const session=await createCreationAgentSession({draft:draft(),assets:[asset],aliases:{m1:'paper'},signal:controller.signal,prepareCommandCapabilities:async()=>{controller.abort(Error('stop'));return {};}});
 const revision=session.revision,result=await session.execute([{name:'creation_apply',arguments:{protocolVersion:2,transactionId:'cancel',baseSceneRevision:revision,operations:[{op:'material.add',id:'p',asset:'m1',place:{reference:'page',at:[50,50],unit:'mm'}}]}}]);
 assert.equal(result.results[0].ok,false);assert.equal(session.revision,revision);assert.equal(session.draft.layers.length,0);
});
test('font knockout inside a real local group keeps the authoritative material and physical mask',async()=>{
 const prepare=createBrowserCommandCapabilities({request:async()=>new Response(await readFile(new URL('../src/assets/fonts/MaShanZheng-Regular.ttf',import.meta.url)))});
 const asset={id:'paper',title:'纸',physicalWidthMM:60,physicalHeightMM:40},session=await createCreationAgentSession({draft:draft(),assets:[asset],aliases:{m1:'paper'},prepareCommandCapabilities:prepare});
 const response=await session.execute([{name:'creation_apply',arguments:{protocolVersion:2,transactionId:'glyph',baseSceneRevision:session.revision,operations:[
  {op:'group.compose',id:'g',place:{reference:'page',at:[60,60],unit:'mm',rotationDeg:12},layoutBox:{width:80,height:80,unit:'mm'},children:[{op:'material.add',id:'paper',asset:'m1',place:{reference:'parent',at:[.5,.5],unit:'ratio'}}]},
  {op:'material.glyphKnockout',target:'paper',text:'HI',style:{fontFamily:'Ma Shan Zheng',fontSizePt:24},place:{reference:'node:paper',at:[.5,.5],unit:'ratio',rotationSpace:'reference',rotationDeg:0}}
 ]}}]);
 assert.equal(response.results[0].ok,true,JSON.stringify(response.results));assert.equal(session.draft.items[0].materialMask.shape,'region');assert.ok(session.draft.items[0].materialMask.holes.length>0);
});
