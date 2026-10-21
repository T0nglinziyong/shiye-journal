import {compileAndImport} from './web-scene-fixture.mjs';
import {webSceneContract} from '../src/web-scene-contract.js';
import {validateV3SceneDocument} from '../src/v3-scene-schema.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv/dist/2020.js';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from './v3-test-handoff.mjs';
import {schemaFingerprint,validateValue} from '../src/creative-contract.js';
import {textParagraphMarkup} from '../src/canvas-text-content.js';
import {Window} from 'happy-dom';

const asset={id:'contract-asset',title:'蓝纸',kind:'sticker',physicalWidthMM:40,physicalHeightMM:50,supply:{quantity:1}};
const make=()=>createOfflineHandoff({project:project('合同验证'),assets:[asset],aliases:{m1:asset.id},settings:{generationMode:'agent',includeThumbnails:false}});

test('O-07: published Scene v2 schema and import agree on text and unknown fields',async()=>{
 const handoff=await make(),files=unzipSync(new Uint8Array(await handoff.blob.arrayBuffer()));
 const schema=JSON.parse(strFromU8(files['api/scene.schema.json']));
 const context=JSON.parse(strFromU8(files['TASK.json']));
 const scene=JSON.parse(strFromU8(files['scene.json']));
 const ajv=new Ajv({strict:false});
 assert.equal(context.sourceContext.schemaHash,schemaFingerprint(webSceneContract));
 assert.equal(ajv.validate(schema,scene),true);
 assert.doesNotThrow(()=>validateValue(scene.page,webSceneContract));
 assert.equal(importEditableWork(JSON.stringify(scene),[asset],{trustedSource:handoff.source}).isDraft,true);
 scene.unexpected=true;
 assert.equal(ajv.validate(schema,scene),false);
 assert.throws(()=>validateV3SceneDocument(scene),/scene\/unexpected/);
});

test('O-08: v3 command schema rejects unsupported source-pixel crop fields',async()=>{
 const handoff=await make(),files=unzipSync(new Uint8Array(await handoff.blob.arrayBuffer()));
 const schema=JSON.parse(strFromU8(files['api/commands.schema.json']));
 assert.equal(handoff.source.capabilities.cropPx,false);
 assert.ok(JSON.stringify(schema).includes('material.process'));
 const {validateCommands}=await import('../src/v3-commands.js');
 assert.throws(()=>validateCommands({protocolVersion:1,transactionId:'crop',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[{op:'material.add',id:'m',asset:'m1',placement:{xMm:10,yMm:20},crop_px:[0,0,10,10]}]}),/commands/);
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
