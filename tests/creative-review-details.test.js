import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationV2Batch} from '../src/creation-v2-commands.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {createHarnessRenderer} from '../creative-agent/runtime/renderer.mjs';
import {createDeepSeekCreativeModel} from '../creative-agent/runtime/deepseek.mjs';

test('review details use the current rendered pixels around possibly covered text without editing the document',async()=>{
 const base=await createCreationDocument({draft:draft(),assets:[],prompt:'纸片与文字'});
 const doc=applyCreationV2Batch(base,{protocolVersion:2,transactionId:'cover',baseSceneRevision:creationSceneRevision(base),operations:[
  {op:'text.add',id:'body',content:'一段需要完整可读的文字内容',place:{reference:'page',at:[50,50],unit:'mm'},size:{width:70,height:20,unit:'mm'},style:{fontSizePt:18}},
  {op:'graphic.add',id:'cover',geometry:{kind:'rect'},place:{reference:'page',at:[60,50],unit:'mm'},size:{width:30,height:25,unit:'mm'},style:{fill:'#FF0000'}}
 ]},[]);
 const before=JSON.stringify(doc),renderer=await createHarnessRenderer({source:doc.source,images:{},saveArtifact:async()=> 'preview.png'});
 const capture=await renderer.render(doc),details=await renderer.reviewDetails(doc);
 assert.equal(details.length,1);assert.equal(details[0].textId,'body');assert.deepEqual(details[0].coverIds,['cover']);
 assert.equal(details[0].pngHash,capture.pngHash);assert.equal(details[0].sceneRevision,capture.sceneRevision);
 assert.match(details[0].imageURL,/^data:image\/jpeg;base64,/);assert.equal(JSON.stringify(doc),before);
 const {loadOfflineCanvas}=await import('../src/offline-node-preview.mjs');const canvas=await loadOfflineCanvas();
 const img=await canvas.loadImage(Buffer.from(details[0].imageURL.split(',')[1],'base64')),surface=canvas.createCanvas(img.width,img.height),ctx=surface.getContext('2d');ctx.drawImage(img,0,0);
 const pixels=ctx.getImageData(0,0,img.width,img.height).data;let red=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>220&&pixels[i+1]<40&&pixels[i+2]<40)red++;
 assert.ok(red>100,'crop must retain the actual red cover, not reconstruct clean text');
 assert.deepEqual(await renderer.reviewDetails(base),[]);
});

test('independent review sends true detail crops alongside the whole page and expected text',async()=>{
 let sent;
 const model=createDeepSeekCreativeModel({key:'test',fetcher:async(url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:'{"blockingIssues":[],"notes":[]}'}}]}),{status:200});}});
 await model.critique({imageURL:'data:image/png;base64,full',details:[{textId:'body',text:'完整文字',coverIds:['paper'],regionPx:{x:1,y:2,width:3,height:4},imageURL:'data:image/png;base64,crop'}],phase:'review',style:'丰富层叠',remainingMs:30000});
 const content=sent.messages[1].content;assert.equal(content.filter(p=>p.type==='image_url').length,2);
 assert.ok(content.some(p=>p.type==='text'&&p.text.includes('完整文字')));assert.match(sent.messages[0].content,/不能靠上下文猜出/);
});


test('text crops also inspect printed backgrounds without a covering foreground object',async()=>{
 const base=await createCreationDocument({draft:draft(),assets:[]});
 const doc=applyCreationV2Batch(base,{protocolVersion:2,transactionId:'printed-background',baseSceneRevision:creationSceneRevision(base),operations:[
  {op:'graphic.add',id:'background-star',geometry:{kind:'star'},place:{reference:'page',at:[50,50],unit:'mm'},size:{width:20,height:20,unit:'mm'},style:{fill:'#111111'}},
  {op:'text.add',id:'body',content:'正文在印花之上仍可能难以辨读',place:{reference:'page',at:[50,50],unit:'mm'},size:{width:70,height:20,unit:'mm'}}
 ]},[]);
 const renderer=await createHarnessRenderer({source:doc.source,images:{},saveArtifact:async()=> 'preview.png'});
 const details=await renderer.reviewDetails(doc);assert.equal(details.length,1);assert.equal(details[0].textId,'body');assert.deepEqual(details[0].coverIds,[]);
});
