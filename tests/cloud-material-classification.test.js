import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudMaterialClassifier} from '../server/cloudbase/classification.mjs';
import {initialMaterialClassification} from '../src/material-classification.js';

test('cloud classification reads account-owned images and commits a user-safe result',async()=>{
 const userID='owner-1',asset={id:'asset-1',title:'我的布纹贴纸',blobId:'blob-1',
  candidateFrameBlobId:'frame-1',physicalWidthMM:30,physicalHeightMM:40,
  ...initialMaterialClassification({kind:'sticker',role:'accent'}),
  categoryEvidence:{kind:{source:'user',confidence:1}},titleEvidence:{source:'user',confidence:1}};
 const seen=[],fetcher=async(url,options)=>{
  const address=new URL(String(url));seen.push(address.href);
  if(address.hostname==='api.deepseek.com'){
   const payload=JSON.parse(options.body);
   assert.deepEqual(payload.thinking,{type:'disabled'});
   assert.equal(payload.max_tokens,1000);
   assert.deepEqual(payload.messages[0].content.filter(part=>part.type==='image_url').map(part=>part.image_url.detail),['low','low']);
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
    title:'布片',titleConfidence:.99,kind:{id:'paper',confidence:.99},
    kindDetail:{id:'paper.textured',confidence:.99},role:{id:'accent',confidence:.95},
    contentTags:[{value:'布纹',confidence:.96}],materialTags:[{value:'布料',confidence:.4}]
   })}}]}),{headers:{'content-type':'application/json'}});
  }
  assert.equal(options.headers.Authorization,'Bearer test-token');
  if(address.pathname.endsWith('/shiye_revisions'))return Response.json([{revision:12,account_epoch:'epoch-1'}]);
  if(address.pathname.endsWith('/shiye_records')){
   assert.equal(address.searchParams.get('user_id'),'eq.'+userID);
   const id=address.searchParams.get('id')?.slice(3);
   return Response.json([{record:id==='asset-1'?asset:{id,storageProvider:'cloudbase',
     storagePath:userID+'/'+id}}]);
  }
  if(address.pathname.includes('/v1/storages/object/')){
   if(address.pathname.endsWith('-preview480.webp'))return new Response(null,{status:404});
   return new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}});
  }
  throw Error('unexpected URL');
 };
 let committed;
 const classify=createCloudMaterialClassifier({envId:'test-env',env:{
  SHIYE_CLASSIFICATION_API_KEY:'server-only',SHIYE_CLASSIFICATION_MODEL:'deepseek-flash'},
  fetcher,commit:async(name,token,args)=>{assert.equal(name,'shiye_commit_v3_guarded');
    assert.equal(token,'test-token');committed=args.operations[0].item;
    return {revision:13};}});
 const result=await classify('test-token',userID,asset.id);
 assert.equal(classify.configured,true);assert.equal(result.revision,13);
 assert.equal(committed.kind,'sticker');assert.equal(committed.title,'我的布纹贴纸');
 assert.deepEqual(committed.contentTags,['布纹']);assert.deepEqual(committed.materialTags,[]);
 assert.ok(seen.some(url=>url.includes('/v1/storages/object/')));
 assert.equal(seen.some(url=>url.includes('frame-1-preview480.webp')),false);
});
test('cloud classification rejects a cross-account image path before download or model call',async()=>{
 const asset={id:'asset-2',blobId:'blob-2',title:'测试',...initialMaterialClassification({kind:'sticker'})};
 let downloaded=false,committed=false;
 const classify=createCloudMaterialClassifier({envId:'test-env',env:{SHIYE_CLASSIFICATION_API_KEY:'key'},
  fetcher:async url=>{
   const address=new URL(String(url));
   if(address.pathname.endsWith('/shiye_records'))return Response.json([{record:
     address.searchParams.get('id')==='eq.asset-2'?asset:{storageProvider:'cloudbase',storagePath:'other-user/private.png'}}]);
   downloaded=true;return new Response(null,{status:500});
  },commit:async()=>{committed=true;}});
 await assert.rejects(()=>classify('test-token','owner-1','asset-2'),/素材图片尚未同步/);
 assert.equal(downloaded,false);assert.equal(committed,false);
});
test('cloud project organization uses the server model without rewriting its stored document',async()=>{
 const project={id:'project-1',title:'新作品',candidateAssetIDs:['asset-1'],projectDocumentPath:'owner-1/document.json'};
 let committed=false,modelCalled=false;
 const classify=createCloudMaterialClassifier({envId:'test-env',env:{SHIYE_CLASSIFICATION_API_KEY:'server-only'},
  fetcher:async(url,options)=>{
   const address=new URL(String(url));
   if(address.hostname==='api.deepseek.com'){
    modelCalled=true;
    assert.equal(options.headers.Authorization,'Bearer server-only');
    return Response.json({choices:[{message:{content:JSON.stringify({title:'春日手帐',tags:['春日','植物']})}}]});
   }
   assert.equal(address.searchParams.get('user_id'),'eq.owner-1');
   return Response.json([{record:address.searchParams.get('store')==='eq.projects'?project:
     {id:'asset-1',title:'花朵贴纸',contentTags:['花朵']}}]);
  },commit:async()=>{committed=true;}});
 const result=await classify.project('test-token','owner-1','project-1');
 assert.deepEqual(result,{title:'春日手帐',tags:['春日','植物']});
 assert.equal(modelCalled,true);assert.equal(committed,false);
});
