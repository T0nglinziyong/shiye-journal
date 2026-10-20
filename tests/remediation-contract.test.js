import {compileAndImport} from './web-scene-fixture.mjs';
import {webSceneContract} from '../src/web-scene-contract.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {schemaFingerprint,validateValue} from '../src/creative-contract.js';
import {textParagraphMarkup} from '../src/canvas-text-content.js';
import {Window} from 'happy-dom';

const asset={id:'contract-asset',title:'蓝纸',kind:'sticker',physicalWidthMM:40,physicalHeightMM:50,supply:{quantity:1}};
const make=()=>createOfflineHandoff({project:project('合同验证'),assets:[asset],aliases:{m1:asset.id},settings:{generationMode:'agent',includeThumbnails:false}});

test('O-07: published schema and runtime agree on normal punctuation and rejected fields',async()=>{
  const handoff=await make();
  const files=unzipSync(new Uint8Array(await handoff.blob.arrayBuffer()));
  const schema=JSON.parse(strFromU8(files['schema/output.json']));
  const context=JSON.parse(strFromU8(files['task/context.json']));
  const example=JSON.parse(strFromU8(files['examples/project.shiyeproject.json']));
  const ajv=new Ajv({strict:false});
  assert.equal(context.source.schemaHash,schemaFingerprint(schema));
  assert.equal(schemaFingerprint(webSceneContract),context.source.schemaHash);
  example.page.layers.find(n=>n.type==='text').content='A < B 与 <3';
  const valid=example.page;
  assert.equal(ajv.validate(schema,valid),true);
  assert.doesNotThrow(()=>validateValue(valid,schema));
  assert.equal(importEditableWork(JSON.stringify(example),[asset],{trustedSource:handoff.source}).drafts[0].textBlocks[0].content,'A < B 与 <3');
  valid.unexpected=true;
  assert.equal(ajv.validate(schema,valid),false);
  assert.throws(()=>validateValue(valid,schema),/未知字段/);
});

test('O-08: preview-only task omits source-pixel crop and rejects it during compilation',async()=>{
  const handoff=await make();
  const files=unzipSync(new Uint8Array(await handoff.blob.arrayBuffer()));
  const schema=JSON.parse(strFromU8(files['schema/tools.json']));
  assert.equal(handoff.source.capabilities.cropPx,false);
  assert.equal(schema.compose_page.properties.materials.items.properties.crop_px,undefined);
  const directSchema=JSON.parse(strFromU8(files['schema/convenient-page.json']));
  assert.equal(JSON.stringify(directSchema).includes('crop_px'),false);
  const response=JSON.parse(strFromU8(files['examples/instructions.json']));
  response.page.layers.find(layer=>layer.type==='material').crop_px=[0,0,100,100];
  assert.throws(()=>compileAndImport(JSON.stringify({...response,source:handoff.source}),[asset],{trustedSource:handoff.source}),/crop_px|未知字段/);
});

test('I-01: markup-like text stays inert while legitimate angle brackets survive',()=>{
  const content='A < B、<3、<script>alert(1)</script>';
  const markup=textParagraphMarkup({content,paragraphSpacing:0},'0px');
  const document=new Window().document,host=document.createElement('div');
  host.innerHTML=markup;
  assert.equal(host.textContent,content);
  assert.equal(host.querySelector('script'),null);
  assert.match(markup,/&lt;script&gt;/);
});
