import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadStudyReferences} from '../scripts/lib/study-references.mjs';

test('study sidecar preserves actual reference bytes and rejects hash/path mismatch before paid calls',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'study-refs-'));
  try{
    assert.deepEqual(await loadStudyReferences(dir),{parts:[],records:[]});
    await mkdir(join(dir,'references'));
    const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8o8AAAAASUVORK5CYII=','base64');
    await writeFile(join(dir,'references/final.png'),bytes);
    const entry={stage:'final',file:'references/final.png',sha256:'sha256:'+createHash('sha256').update(bytes).digest('hex')};
    const save=e=>writeFile(join(dir,'study.json'),JSON.stringify({references:[e]}));
    await save(entry);const loaded=await loadStudyReferences(dir);
    assert.deepEqual(loaded.records,[entry]);
    assert.equal(loaded.parts[1].image_url.url,'data:image/png;base64,'+bytes.toString('base64'));
    await save({...entry,sha256:'sha256:bad'});await assert.rejects(loadStudyReferences(dir),/指纹无效/);
    await save({...entry,file:'../final.png'});await assert.rejects(loadStudyReferences(dir),/路径/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('cross-case reference rejects same-case identity and known answer hashes before use',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'study-cross-'));
 try{
  await mkdir(join(dir,'references'));
  const bytes=Buffer.from('89504e470d0a1a0a','hex'),sha256='sha256:'+createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(dir,'references/style.png'),bytes);
  const sidecar={targetCase:'A',referenceCase:'B',forbiddenReferenceHashes:[],references:[{stage:'style',file:'references/style.png',sha256}]};
  const save=patch=>writeFile(join(dir,'study.json'),JSON.stringify({...sidecar,...patch}));
  await save({});assert.equal((await loadStudyReferences(dir)).records[0].referenceCase,'B');
  await save({referenceCase:'A'});await assert.rejects(loadStudyReferences(dir),/其他案例/);
  await save({forbiddenReferenceHashes:[sha256]});await assert.rejects(loadStudyReferences(dir),/当前答案/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
