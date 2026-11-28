import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildCloudBaseFunctions} from '../scripts/build-cloudbase-functions.mjs';

test('built CloudBase bundle keeps shared classification modules loadable as ESM',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'shiye-function-'));
 try{
  const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
  const {directory}=await buildCloudBaseFunctions({root,output:join(temporary,'build')});
  const pkg=JSON.parse(await readFile(join(directory,'functions/shiye-api/package.json'),'utf8'));
  const config=JSON.parse(await readFile(join(directory,'cloudbaserc.json'),'utf8'));
  assert.equal(config.functions[0].installDependency,true);
  assert.equal(pkg.dependencies.pngjs,undefined);
  const module=await import(pathToFileURL(join(directory,'functions/shiye-api/src/material-classification.js')));
  const result=module.initialMaterialClassification({kind:'other',role:'other'});
  assert.equal(module.validateMaterialClassification(result).role,'other');
 }finally{await rm(temporary,{recursive:true,force:true});}
});
