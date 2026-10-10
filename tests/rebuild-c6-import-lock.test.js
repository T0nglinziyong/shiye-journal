import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

// SHA-1 of Git blobs in the user-verified c6e5432d baseline. Protect the
// complete import/recognition/save workflow, not just the first 6 CV files.
const baseline={
  "image.js": "88d244bf813213c40d2baf8b24e7914d9e594882",
  "paper-analysis.js": "6c1d0e41dbf6794a2db6b9a09ca48ed8da519d1d",
  "opencv-worker.js": "1f46cfe14d22171dd11f72b02e06c37a5bfc3c87",
  "opencv-worker-browser.js": "1ba6ac4aef5260cc2d51045c83ca44fb9d0658a1",
  "vision-runtime.js": "0e232cafd76e5278da5a5dd6706214cbbdb9c880",
  "recognition-profiles.js": "86bea3a187c096121e5f551abc851f9f461f8c2d",
  "recognition-refiners.js": "e4bd77e4e373e6a3d6ea5d28aa08bdba5e8f2652",
  "recognition-raster.js": "4e88878477689fa3c973576c5ce51c419145343a",
  "perspective.js": "af21f19bead1d03a58626248dd905e8d81f30e59",
  "paper-ui.js": "d1ebb53e61c7753c869850528eb43fe1bc7f062a",
  "paper-chroma-preprocess.js": "715966f0640259fcc95ae5e053fd38d84e6b6aab",
  "paper-sizes.js": "4ef13e8663408783031b443accd23b9610c56bb6",
  "material-box-discovery.js": "59d44ad24ef94c0ad782654512ddc5f0dcded194",
  "material-boundary-refiners.js": "1acfc35911137b839d8c1466586013bdd80f35b2",
  "material-color-restoration.js": "4be602eab1a8d3d1281ba6c455c1ad80055da1c3",
  "material-segmentation.js": "75f22a5a4dfe255a6eb44160e1b0e8fc5f20b95e",
  "material-carrier.js": "7f3360490466a0b599b660b7c31b1efdf02f5d41",
  "material-mask.js": "850d7de9eaf8f68cb7924693cfb26dd3fbd0c14f",
  "foreground-evidence.js": "427c17257d2c182366c08e66d13e77ec27ff8e22",
  "repeated-apertures.js": "b2932324805cc13be804e04e81dca13a42d870ba",
  "manual-import-recognition.js": "7f843bae5c81fb8f2046ae176ff4b0855446f0b8",
  "import-box-editor.js": "05fa34fa0f09ad350db256350113705b0aee8e01",
  "import-coordinate.js": "7e86e5a5f84729f3f431f9bef530cb3f26e8c393",
  "import-save.js": "503d252ecfb47a9310f099cb4605c538346198c5",
  "import-outbox-recovery.js": "e3455ce212621b2cf2ef55efa7c1e0725f4c2488",
  "image-node-cache.js": "acb18ecb4405e6bb2e6dc175d34061cb683bbf31",
  "preferences.js": "65941b8ee3325c4cb35c7dc83eee311977c71fa2",
  "store.js": "5ee5952bf2a17015b8672e52d717d621374ad1a0"
};

for(const [name,expected] of Object.entries(baseline)){
  test('c6 import pipeline unchanged: '+name,async()=>{
    const bytes=await readFile(new URL('../src/'+name,import.meta.url));
    const actual=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
    assert.equal(actual,expected,'Import/recognition changes require explicit review');
  });
}

test('c6 extraction stages remain direct, without post-PR87 safety/resize wrappers',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  const ui=await readFile(new URL('../src/import-workspace-ui.js',import.meta.url),'utf8');
  assert.match(app,/detectPaperCandidates\(source,box,6/);
  assert.match(app,/refreshImportCandidates\(regions/);
  assert.doesNotMatch(app,/detectImportRegions|fixedWorkingSize|importPhotoDisplayURL/);
  assert.match(ui,/const visibleCandidates=state\.importProcessing\?\[\]:state\.importCandidates\|\|\[\]/);
});
