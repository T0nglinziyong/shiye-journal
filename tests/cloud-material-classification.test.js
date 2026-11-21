import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {createCloudMaterialClassifier,materialClassificationPrompt} from '../server/cloudbase/classification.mjs';
import {initialMaterialClassification} from '../src/material-classification.js';

test('classification prompt uses physical form, current multi-select roles and leaf layout IDs',()=>{
 const prompt=materialClassificationPrompt({physicalWidthMM:30,physicalHeightMM:40,
  sourceIdentifier:'sample',finalMaskBlobId:'mask-1'});
 assert.match(prompt,/只分类这件素材，不分类它画着的物品/);
 assert.match(prompt,/不判断方向，不输出旋转角度/);
 assert.match(prompt,/有留白、横线、格子或填写区供书写记录的是便签/);
 assert.match(prompt,/已有完整标题、信息或独立版式且主要供阅读展示的是卡片/);
 assert.match(prompt,/只有独立文字或字形而没有承载卡面的是文字素材/);
 assert.match(prompt,/role，其他确实适用的放 secondaryRoles/);
 assert.match(prompt,/paper\.patterned=花纹纸/);
 assert.match(prompt,/point\.free=自由摆放/);
 assert.match(prompt,/整片以纯色、纹理或重复花纹为主且无明确书写功能的是纸张/);
 assert.match(prompt,/descriptionConfidence/);
 assert.match(prompt,/浅粉色花朵居中/);
 assert.doesNotMatch(prompt,/orientation\.deltaDegrees/);
 assert.doesNotMatch(prompt,/版面适配.*page=页面铺底/);
});

test('cloud classification reads account-owned images and commits a user-safe result',async()=>{
 const source=new PNG({width:24,height:16});source.data.fill(255);
 const samplePNG=PNG.sync.write(source);
 const userID='owner-1',asset={id:'asset-1',title:'我的布纹贴纸',blobId:'blob-1',
  candidateFrameBlobId:'frame-1',physicalWidthMM:30,physicalHeightMM:40,
  ...initialMaterialClassification({kind:'sticker',role:'accent'}),
  categoryEvidence:{kind:{source:'user',confidence:1}},titleEvidence:{source:'user',confidence:1}};
 const seen=[],fetcher=async(url,options)=>{
  const address=new URL(String(url));seen.push(address.href);
  if(address.hostname==='api.deepseek.com'){
   const payload=JSON.parse(options.body);
   assert.deepEqual(payload.thinking,{type:'disabled'});
   assert.equal(payload.max_tokens,1400);
   assert.deepEqual(payload.messages[0].content.filter(part=>part.type==='image_url').map(part=>part.image_url.detail),['low','low']);
   assert.match(payload.messages[0].content[0].text,/paper\.patterned=花纹纸/);
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
    title:'布片',titleConfidence:.99,description:'画面中有一张方形纸片，纸片上有浅色格纹。',descriptionConfidence:.91,kind:{id:'paper',confidence:.99},
    kindDetail:{id:'paper.textured',confidence:.99},role:{id:'accent',confidence:.95},
    contentTags:[{value:'布纹',confidence:.96}],materialTags:[{value:'布料',confidence:.4}],
    orientation:{deltaDegrees:90,confidence:.9}
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
   return new Response(samplePNG,{headers:{'content-type':'image/png'}});
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
 assert.equal(committed.reviewStatus,'ready');
 assert.equal(committed.description,'一张方形纸片，纸片上有浅色格纹。');
 assert.equal(committed.descriptionEvidence.source,'ai');
 assert.deepEqual(committed.contentTags,['布纹']);assert.deepEqual(committed.materialTags,[]);
 assert.equal(Object.hasOwn(result,'orientation'),false);
 assert.equal(committed.processingRecord?.displayRotationDegrees,undefined);
 assert.ok(seen.some(url=>url.includes('/v1/storages/object/')));
 assert.equal(seen.filter(url=>url.startsWith('https://api.deepseek.com/')).length,1);
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
