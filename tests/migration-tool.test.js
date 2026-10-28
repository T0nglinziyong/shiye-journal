import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrateLegacyDraft,migrateRecoveryExport,migrateBackupFile} from '../scripts/migrate-project-data.mjs';

const legacy=(id='old-page')=>({id,canvas:{width:707,height:1000},pageMode:'single',physicalPageHeightMM:297,
  paperColor:'#ffffff',items:[{id:'sticker',assetID:'asset-real',x:100,y:100,width:100,height:100,zIndex:10,creativeGroupID:'collage'}],
  primitives:[{id:'star',kind:'star',x:200,y:200,width:20,height:20,zIndex:20,creativeGroupID:'collage'}],
  textBlocks:[{id:'note',x:250,y:240,width:200,height:90,color:'#445566',fontSize:26,content:'可编辑的文字',zIndex:50}],
  strokes:[{points:[{x:1,y:1,p:.2},{x:7,y:9,p:.8}],width:2,color:'#334455',zIndex:80}],
  layerGroups:[{id:'collage',name:'拼贴'}]});

test('standalone migration converts all leaves and grouping, with stable original input',()=>{
 const before=legacy(),frozen=JSON.stringify(before);
 const v2=migrateLegacyDraft(before,{projectID:'work'});
 assert.equal(JSON.stringify(before),frozen);
 assert.equal(v2.sceneVersion,2);
 assert.equal(v2.layers.length,3);
 const g=v2.layers.find(node=>node.type==='group');
 assert.deepEqual(g.children.map(node=>node.type),['material','shape']);
 assert.equal(v2.layers.find(n=>n.type==='ink').points[0].p,.2);
 assert.equal(Object.keys(v2).some(key=>['items','textBlocks','primitives','strokes','layerGroups'].includes(key)),false);
 const second=migrateLegacyDraft(before,{projectID:'work'});
 assert.deepEqual(second,v2,'missing ink ids must be stable on retries');
});

test('reject incomplete and inconsistent legacy drafts instead of fabricating empty scenes',()=>{
 const incomplete=legacy();delete incomplete.strokes;
 assert.throws(()=>migrateLegacyDraft(incomplete),/字段不完整/);
 const duplicate=legacy();duplicate.textBlocks[0].id='sticker';
 assert.throws(()=>migrateLegacyDraft(duplicate),/ID 重复/);
 const mixed=legacy();mixed.layers=[];
 assert.throws(()=>migrateLegacyDraft(mixed),/同时包含/);
});

test('migration outputs separate portable Scene v2 JSON and keeps source backup unchanged',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'shiye-migrate-'));
 try{
  const source={format:'shiye-legacy-project-recovery',version:1,projects:[{id:'cece-old',title:'旧作品',drafts:[legacy()]}]};
  const input=join(tmp,'original.json'),output=join(tmp,'results');
  await writeFile(input,JSON.stringify(source));
  const report=await migrateBackupFile(input,output);
  assert.equal(report.accepted,1);assert.equal(report.rejected.length,0);
  assert.equal(report.files.length,1);
  const doc=JSON.parse(await readFile(join(output,report.files[0].file),'utf8'));
  assert.equal(doc.format,'shiye-scene');assert.equal(doc.version,2);
  assert.equal(doc.scene.layers.flatMap(x=>x.type==='group'?x.children:[x]).length,4);
  assert.deepEqual(JSON.parse(await readFile(input,'utf8')),source);
  await assert.rejects(migrateBackupFile(input,output),/EEXIST/);
 }finally{await rm(tmp,{recursive:true,force:true});}
});
