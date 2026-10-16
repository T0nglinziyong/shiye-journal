import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRestoredRecords} from '../src/backup-integrity.js';
import {archivePayload,readArchivePayload} from '../src/scene-archive.js';

const fixture=()=>({
  assets:[{id:'asset',blobId:'image',seriesID:'series'}],
  blobs:[{id:'image',data:new Blob(['synthetic image'])}],
  series:[{id:'series',title:'合成系列'}],
  projects:[{id:'work',title:'合成作品',activeDraftID:'draft',drafts:[{id:'draft',sceneVersion:2,
    canvas:{width:700,height:1000},pageMode:'single',layers:[{id:'layer',type:'material',
      assetID:'asset',x:50,y:60,width:100,height:120}]}]}],
  meta:[],trash:[]
});

test('current ZIP records pass complete reference and Scene preflight',()=>{
  assert.equal(validateRestoredRecords(fixture()),true);
});
test('missing image, series, material and complete work are rejected before replacement',()=>{
  const cases=[
    [data=>data.blobs.length=0,/缺少必要图片/],
    [data=>data.series.length=0,/不存在的系列/],
    [data=>data.projects[0].drafts[0].layers[0].assetID='missing',/不存在的素材/],
    [data=>data.projects[0].projectDocumentPath='private/work.json',/缺少可编辑正文/],
    [data=>data.projects[0].drafts[0].canvas=null,/画布尺寸|图层数据/]
  ];
  for(const [damage,expected] of cases){const data=fixture();damage(data);assert.throws(()=>validateRestoredRecords(data),expected);}
});
test('trash and snapshots require the backed-up bytes',()=>{
  const data=fixture();
  data.projects.push({id:'snapshot',title:'合成快照',isSnapshot:true,snapshotBlobId:'missing'});
  assert.throws(()=>validateRestoredRecords(data),/快照缺少图片/);
  data.projects.pop();data.trash.push({id:'deleted',kind:'asset',item:{id:'hidden',blobId:'missing'}});
  assert.throws(()=>validateRestoredRecords(data),/缺少必要图片/);
});
test('private derived covers are repaired in current draft and compressed archive',()=>{
  const data=fixture(),project=data.projects[0];
  project.drafts[0].coverImageID='project-cover:cos:another-account/private.webp';
  project.drafts[0].coverSceneHash='old';
  const saved=archivePayload(structuredClone(project.drafts));
  project.manualArchives=[{id:'archive',ref:saved.hash,activeDraftID:'draft'}];
  project.manualArchiveStore={[saved.hash]:saved.payload};
  const repairs=[];
  assert.equal(validateRestoredRecords(data,{repairs}),true);
  assert.equal(repairs.length,2);
  assert.equal(project.drafts[0].coverImageID,undefined);
  const archived=project.manualArchives[0];
  assert.notEqual(archived.ref,saved.hash);
  assert.equal(readArchivePayload(project.manualArchiveStore[archived.ref],archived.ref)[0].coverImageID,undefined);
});
