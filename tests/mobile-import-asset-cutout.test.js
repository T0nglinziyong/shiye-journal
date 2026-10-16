import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateMetadata} from '../src/import-save.js';
import {assetEditorValue} from '../src/asset-editor.js';
import {decodeImageBlob} from '../src/image-blob-decoder.js';
import {validatePhysicalDraft} from '../src/domain.js';

const material=(kind,quantity)=>candidateMetadata({
  id:'c',title:'胶带测试',kind,width:40,height:80,quantity,selected:true
},{seriesID:null},null);
test('candidate metadata never creates stock counts for tape or ordinary material',()=>{
 assert.equal(material('tape',1).supply,undefined);
 assert.equal(material('sticker',1).supply,undefined);
});
test('old quantity input is ignored when importing current material metadata',()=>{
 const a=candidateMetadata({kind:'tape',quantity:3,quantityManuallySet:true,
   width:40,height:80}, {},null);
 assert.equal(a.supply,undefined);
});
test('material editor removes stock metadata and no-op stays stable',()=>{
 const old={id:'a',title:'胶带',kind:'tape',supply:{kind:'single',quantity:1}};
 const values={title:'胶带',kind:'tape',role:'support',texture:'',
   width:'40',height:'80',quantity:'999',tags:'',contentTags:'',
   styleTags:'',materialTags:'',seriesID:'',reviewStatus:'ready',
   usageStatus:'used',tapeRoll:false,repeatable:false};
 const edited=assetEditorValue(old,values);
 assert.equal(edited.supply,undefined);
 assert.equal(edited.usageStatus,'used');
 assert.equal(assetEditorValue(edited,values),edited,'an unchanged save must not create another cloud write');
});
test('unlimited materials are not rejected by finite-count draft validation',()=>{
 const asset={id:'a',title:'可重复素材',kind:'tape',physicalWidthMM:20,
   physicalHeightMM:30,supply:{kind:'unlimited',quantity:999}};
 const items=Array.from({length:1001},()=>({id:crypto.randomUUID(),
   assetID:'a',generationBaseline:{}}));
 assert.deepEqual(validatePhysicalDraft({items},[asset]),[]);
});
test('a persisted valid PNG Blob can recover from WebKit createImageBitmap SyntaxError',async()=>{
 let calls=0,urls=[];
 class ImageMock{
   constructor(){this.width=this.naturalWidth=72;this.height=this.naturalHeight=88;}
   async decode(){calls++;}
 }
 const canvas={getContext:()=>({drawImage(){calls++}}),width:0,height:0};
 const fakeURL={createObjectURL:()=>{urls.push('created');return 'blob:test';},
   revokeObjectURL:url=>urls.push('revoked:'+url)};
 const image=await decodeImageBlob(new Blob(['valid-image-dummy'],{type:'image/png'}),{
   createBitmap:async()=>{throw new DOMException('The string did not match the expected pattern.','SyntaxError');},
   ImageElement:ImageMock,objectURL:fakeURL,canvasFactory:()=>canvas
 });
 assert.equal(image.width,72);
 assert.equal(image.height,88);
 assert.equal(calls,2);
 assert.deepEqual(urls,['created','revoked:blob:test']);
 image.close();
});
test('broken or empty remote Blob cannot silently overwrite an existing cutout',async()=>{
 await assert.rejects(()=>decodeImageBlob({data:'image'}),/原始字节/);
 await assert.rejects(()=>decodeImageBlob(new Blob([])),/原始字节/);
 let revoked=false;
 class ImageBroken{async decode(){throw Error('bad');}}
 await assert.rejects(()=>decodeImageBlob(new Blob(['garbage-garbage']),{
   createBitmap:async()=>{throw Error('bad')},
   ImageElement:ImageBroken,
   objectURL:{createObjectURL:()=> 'blob:bad',revokeObjectURL:()=>{revoked=true;}}
 }),/不可解码/);
 assert.equal(revoked,true);
});
