import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {draft} from '../src/domain.js';
import {creativePresetAssets} from '../src/creative-presets.js';
import {materialAliases} from '../src/material-alias.js';
import {createCreationDocument} from '../src/creation-document.js';
import {creationSceneRevision,applyCreationTransaction} from '../src/creation-transaction.js';
import {inspectCreationDocument} from '../src/creation-inspection.js';
import {createHarnessRenderer} from '../compute-server/harness/renderer.mjs';
import {initialHarnessState} from '../compute-server/harness/agent.mjs';
import {loadCreationSkills} from '../compute-server/harness/skills.mjs';

async function fixture(){
 const assets=creativePresetAssets.slice(0,2),aliases=materialAliases(assets.map(asset=>asset.id));
 const document=await createCreationDocument({draft:draft(),assets,aliases});
 const images=Object.fromEntries(await Promise.all(Object.entries(aliases).map(async([alias,id])=>{
  const asset=assets.find(row=>row.id===id);return [alias,await readFile(new URL('../public'+asset.staticPath,import.meta.url))];
 })));
 const renderer=await createHarnessRenderer({source:document.source,images,saveArtifact:async()=>null});
 return {assets,aliases,document,renderer};
}
const apply=(document,assets,transactionId,operations)=>applyCreationTransaction(document,{protocolVersion:2,transactionId,baseSceneRevision:creationSceneRevision(document),operations},assets).document;
const place=(x,y,surface='tray')=>({reference:'page',at:[x,y],unit:'mm',surface});

test('one tray image represents unplaced sources, while a detailed material image remains on demand',async()=>{
 const {document,renderer}=await fixture(),tray=await renderer.tray(document);
 assert.equal(tray.items.length,2);assert.match(tray.imageURL,/^data:image\/jpeg;base64,/);
 const state=initialHarnessState({document,skills:await loadCreationSkills(),brief:{},tray});
 const images=state.messages[1].content.filter(part=>part.type==='image_url');
 assert.equal(images.length,1);assert.equal((await renderer.inspectMaterials([tray.items[0].alias])).length,1);
});

test('material and group can move between tray and page with the same place contract',async()=>{
 const {assets,aliases,renderer,document:base}=await fixture();let document=base;
 const [first,second]=Object.keys(aliases);
 document=apply(document,assets,'add-tray',[
  {op:'material.add',id:'first',asset:first,place:place(35,55)},
  {op:'material.add',id:'second',asset:second,place:place(73,55)}
 ]);
 assert.deepEqual(inspectCreationDocument(document).layers.map(row=>row.surface),['tray','tray']);
 document=apply(document,assets,'group-tray',[{op:'group.create',id:'pair',targets:['first','second']}]);
 assert.equal(inspectCreationDocument(document).layers[0].surface,'tray');
 assert.deepEqual((await renderer.tray(document)).parkedIDs,['pair']);
 document=apply(document,assets,'move-page',[{op:'layer.update',target:'pair',place:place(85,95,'page')}]);
 assert.equal(inspectCreationDocument(document).layers[0].surface,'page');
 assert.equal(await renderer.tray(document),null);
 const preview=await renderer.render(document);
 assert.match(preview.imageURL,/^data:image\/jpeg;base64,/);assert.equal(preview.spaceViews.find(view=>view.id==='tray').imageURL,null);
 document=apply(document,assets,'return-tray',[{op:'layer.update',target:'pair',place:place(45,60,'tray')}]);
 assert.deepEqual((await renderer.tray(document)).parkedIDs,['pair']);
 document=apply(document,assets,'ungroup-tray',[{op:'group.ungroup',target:'pair'}]);
 assert.deepEqual(inspectCreationDocument(document).layers.map(row=>row.surface),['tray','tray']);
});

test('independent workspaces render only their own parked objects and retain source index',async()=>{
 const {assets,aliases,renderer,document:base}=await fixture();let document=base;
 const [first,second]=Object.keys(aliases);
 document=apply(document,assets,'study-sources',[
  {op:'material.add',id:'study-first',asset:first,place:place(35,55,'study')},
  {op:'material.add',id:'tray-second',asset:second,place:place(75,55,'tray')}
 ]);
 assert.deepEqual(inspectCreationDocument(document).layers.map(row=>row.surface),['study','tray']);
 const preview=await renderer.render(document,null,[{id:'page'},{id:'tray'},{id:'study'}]);
 const rows=inspectCreationDocument(document).layers;
 assert.deepEqual(preview.spaceViews.find(view=>view.id==='study').parkedIDs,[rows[0].id]);
 assert.deepEqual(preview.spaceViews.find(view=>view.id==='tray').parkedIDs,[rows[1].id]);
 assert.equal((await renderer.index(document)).items.length,2);
 document=apply(document,assets,'move-study',[{op:'layer.update',target:'tray-second',place:place(60,65,'study')}]);
 document=apply(document,assets,'group-study',[{op:'group.create',id:'study-pair',targets:['study-first','tray-second']}]);
 assert.deepEqual((await renderer.tray(document,null,{space:'study'})).parkedIDs,[inspectCreationDocument(document).layers[0].id]);
 document=apply(document,assets,'return-group',[{op:'layer.update',target:'study-pair',place:place(80,80,'page')}]);
 assert.equal((await renderer.tray(document,null,{space:'study'})),null);
});
