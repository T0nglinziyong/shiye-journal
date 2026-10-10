import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverImportCandidate} from '../src/import-candidate-recovery.js';

const region=(alpha=[255,0,255])=>({
 x:.1,y:.2,w:.2,h:.3,mask:{width:3,height:1,alpha:Uint8Array.from(alpha)}
});
const blob=new Blob(['sample'],{type:'image/png'});
const common={
 makeURL:()=> 'blob:recovered',
 calibrated:true,paperWidthMM:210,paperHeightMM:297,onError:()=>{}
};
test('a valid extracted candidate stays untouched without unnecessary fallback',async()=>{
 let raw=0;
 const object={blob,url:'blob:normal',region:region(),selected:true};
 const result=await recoverImportCandidate({
   ...common,region:object.region,index:0,
   extract:async()=>object,rawCrop:async()=>{raw++;return blob;}
 });
 assert.equal(result.candidate,object);
 assert.equal(result.recovered,false);
 assert.equal(raw,0);
});
test('empty alpha does not produce an invisible thumbnail: raw crop is shown and marked for review',async()=>{
 let extracted=0;
 const result=await recoverImportCandidate({
  ...common,region:region([0,0,0]),index:2,
  extract:async()=>{extracted++;return {blob,url:'blob:blank'};},
  rawCrop:async()=>blob
 });
 assert.equal(extracted,0);
 assert.equal(result.recovered,true);
 assert.equal(result.candidate.url,'blob:recovered');
 assert.equal(result.candidate.title,'素材 3');
 assert.equal(result.candidate.width,42);
 assert.equal(result.candidate.height,89.1);
 assert.equal(result.candidate.reviewStatus,'pendingReview');
 assert.equal(result.candidate.previewFallback,true);
});
test('one candidate alignment failure does not prevent recovering other candidates',async()=>{
 const rows=[region(),region(),region()],out=[];
 for(let i=0;i<rows.length;i++){
   const result=await recoverImportCandidate({
     ...common,region:rows[i],index:i,
     extract:async()=>{if(i===1)throw Error('rotated alignment failure');
       return {url:'blob:valid-'+i,blob,selected:true,region:rows[i]};},
     rawCrop:async()=>blob
   });
   if(result.candidate)out.push(result.candidate);
 }
 assert.equal(out.length,3);
 assert.equal(out[1].url,'blob:recovered');
 assert.equal(out[2].url,'blob:valid-2');
});
test('uncroppable region is isolated, reported, and cannot abort subsequent items',async()=>{
 const errors=[];
 const first=await recoverImportCandidate({
   ...common,region:region([0]),index:0,extract:async()=>null,
   rawCrop:async()=>{throw Error('bad region');},
   onError:(...args)=>errors.push(args)
 });
 const second=await recoverImportCandidate({
   ...common,region:region(),index:1,
   extract:async()=>({blob,url:'blob:valid',selected:true}),
   rawCrop:async()=>blob
 });
 assert.equal(first.candidate,null);
 assert.match(first.error.message,/bad region/);
 assert.equal(errors.length,2);
 assert.equal(second.candidate.url,'blob:valid');
});
