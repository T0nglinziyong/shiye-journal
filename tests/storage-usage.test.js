import test from 'node:test';
import assert from 'node:assert/strict';
import {collectCOSReferencePaths,cosObjectKind,summarizeCOSInventory} from '../server/storage-usage.mjs';

const owner='78550825-ce3c-4542-95df-434f39937503';
const hash='a'.repeat(64),otherHash='b'.repeat(64),orphanHash='c'.repeat(64);
const origin=owner+'/'+hash,second=owner+'/'+otherHash;

test('COS object classification includes immutable derivatives and project documents',()=>{
 assert.equal(cosObjectKind(origin),'original');
 assert.equal(cosObjectKind(origin+'-preview480.webp'),'derivative');
 assert.equal(cosObjectKind(origin+'-project.json.gz'),'document');
 assert.equal(cosObjectKind(origin+'-project.json.gz-preview480.webp'),'derivative');
 assert.equal(cosObjectKind('journal-presets/source/1.jpg'),'other');
});

test('reference discovery reaches nested historical drafts and recently deleted projects',()=>{
 const records=[{store:'blobs',record:{id:'blob',storagePath:origin,storageProvider:'cos'}},
   {store:'projects',record:{id:'work',projectDocumentPath:second+'-project.json',
     drafts:[{coverImageID:'project-cover:cos:'+second+'-preview480.webp'}],
     manualArchives:[{drafts:[{coverImageID:'project-cover:cos:'+second+'-project.json.gz-preview480.webp'}]}]}},
   {store:'trash',record:{item:{projectDocumentPath:second+'-project.json.gz'}}}];
 const paths=collectCOSReferencePaths(records);
 assert.deepEqual([...paths].sort(),[
  origin,origin+'-preview480.webp',second+'-project.json',
  second+'-project.json.gz',second+'-preview480.webp',
  second+'-project.json.gz-preview480.webp'
 ].sort());
});

test('incomplete COS listing or reference check never advertises orphan candidates',()=>{
 const old='2026-01-01T00:00:00Z',objs=[{Key:owner+'/'+orphanHash,Size:'120',LastModified:old}];
 for(const partial of [{inventoryComplete:false,referencesComplete:true},
   {inventoryComplete:true,referencesComplete:false}]){
   const stats=summarizeCOSInventory(objs,{...partial,now:Date.parse('2026-10-10T00:00:00Z')});
   assert.equal(stats.oldUnreferencedCandidates,null);
   assert.equal(stats.safelyDeletableBytes,0);
   assert.match(stats.warning,/不完整/);
 }
});

test('complete read-only inventory distinguishes refs, age, and bytes without permitting deletion',()=>{
 const old='2026-01-01T00:00:00Z',newer='2026-10-09T00:00:00Z';
 const objects=[
   {Key:origin,Size:'100',LastModified:old},
   {Key:owner+'/'+orphanHash,Size:'160',LastModified:old},
   {Key:second+'-preview480.webp',Size:'20',LastModified:newer},
   {Key:'journal-presets/source/1.jpg',Size:'40',LastModified:old}
 ];
 const result=summarizeCOSInventory(objects,{
   inventoryComplete:true,referencesComplete:true,
   referencePaths:new Set([origin]),
   now:Date.parse('2026-10-10T00:00:00Z')
 });
 assert.equal(result.totalBytes,320);
 assert.equal(result.groups.original.bytes,260);
 assert.equal(result.groups.derivative.bytes,20);
 assert.equal(result.groups.other.bytes,40);
 assert.equal(result.oldUnreferencedCandidates,1);
 assert.equal(result.oldUnreferencedCandidateBytes,160);
 assert.equal(result.safelyDeletableBytes,0);
});
