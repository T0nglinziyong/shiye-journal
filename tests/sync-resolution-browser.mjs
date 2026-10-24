import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-sync-resolution',url+'/');
const {command,evaluate,wait,click}=browser;
try{
  await wait('body');
  for(const width of [320,390,768,1024]){
    await command('Emulation.setDeviceMetricsOverride',
      {width,height:844,deviceScaleFactor:2,mobile:width<600});
    await evaluate(`(async()=>{
      const [{SyncMigrationDialog,SyncDetailsDialog,SyncErrorDialog},React,ReactDOM]=await Promise.all([
        import('/src/react-sync-dialogs.jsx'),
        import('/node_modules/.vite/deps/react.js'),
        import('/node_modules/.vite/deps/react-dom_client.js')
      ]);
      window.__syncTest={SyncMigrationDialog,SyncDetailsDialog,SyncErrorDialog,React:React.default||React,
        root:(ReactDOM.default||ReactDOM).createRoot(document.body.appendChild(document.createElement('div'))),choices:[]};
      window.__syncTest.showMigration=()=>{
        const {React,root,SyncMigrationDialog,choices}=window.__syncTest;
        root.render(React.createElement(SyncMigrationDialog,{
          plan:{changes:[{}],review:[],totals:{scanned:1,migratable:1,needsReview:0},
            scans:[{store:'projects',total:1,migratable:1,needsReview:0}]},
          onClose:()=>{},onApply:async()=>{choices.push('migrate');return {updated:1};}
        }));
      };
      window.__syncTest.showDetails=()=>{
        const {React,root,SyncDetailsDialog,choices}=window.__syncTest;
        root.render(React.createElement(SyncDetailsDialog,{details:{error:null},
          error:'[预上传图片] CloudBase 云存储上传失败：The resource already exists For more information, please refer to https://docs.cloudbase.net/error-code/service/STORAGE_KEY_ALREADY_EXISTS',projects:[],batches:[],local:[],
          quarantined:0,legacyCount:0,status:'待同步',onClose:()=>{},onDiagnostics:()=>{},
          onMigrate:()=>{},onBackupLegacy:()=>{},onWipe:()=>{},onPause:()=>{},onEmergency:()=>{},
          onRetry:async()=>{choices.push('sync');return {remaining:0,conflicts:0};},
          onRebuild:async()=>{choices.push('rebuild');return {remaining:0,conflicts:0};},
          onRefresh:async()=>{choices.push('list');return {details:{error:null},projects:[],batches:[],local:[],quarantined:0,status:'已同步'};}}));
      };
      window.__syncTest.showError=()=>{
        const {React,root,SyncErrorDialog}=window.__syncTest;
        root.render(React.createElement(SyncErrorDialog,{
          error:'CloudBase 云存储上传失败：https://docs.cloudbase.net/error-code/service/STORAGE_KEY_ALREADY_EXISTS',
          onClose:()=>{},onBack:()=>{},onDiagnostics:()=>{},kind:'sync'}));
      };
      window.__syncTest.showMigration();
    })()`);
    await wait('#migration-apply');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    assert.equal(await evaluate(`document.querySelector('#migration-apply').disabled`),false);
    assert.equal(await evaluate(`!!document.querySelector('#migration-download')`),false);
    await click('#migration-apply');
    assert.deepEqual(await evaluate(`window.__syncTest.choices`),['migrate']);
    await evaluate(`window.__syncTest.showDetails()`);
    await wait('#sync-retry-now');
    await evaluate(`(()=>{const toast=document.querySelector('#toast')||document.body.appendChild(document.createElement('div'));toast.id='toast';toast.textContent='CloudBase 云存储上传失败：https://docs.cloudbase.net/error-code/service/STORAGE_KEY_ALREADY_EXISTS';toast.classList.add('show');})()`);
    const geometry=await evaluate(`(()=>{const panel=document.querySelector('.utility-dialog'),error=document.querySelector('.sync-error'),r=panel.getBoundingClientRect();return {page:document.documentElement.scrollWidth-innerWidth,panel:r.right-innerWidth,error:error.scrollWidth-error.clientWidth}})()`);
    assert.ok(geometry.page<=1&&geometry.panel<=1&&geometry.error<=1,JSON.stringify({width,...geometry}));
    await evaluate(`document.querySelector('#toast').classList.remove('show')`);
    assert.equal(await evaluate(`document.querySelector('#sync-retry-now').textContent`),'立即同步');
    assert.equal(await evaluate(`document.body.textContent.includes('比较版本')`),false);
    assert.deepEqual(await evaluate(`window.__syncTest.choices`),['migrate'],
      'Opening sync status must not enumerate the outbox');
    await click('#sync-retry-now');
    assert.deepEqual(await evaluate(`window.__syncTest.choices`),['migrate','sync']);
    await click('#sync-show-pending','#sync-refresh-pending');
    assert.deepEqual(await evaluate(`window.__syncTest.choices`),['migrate','sync','list']);
    await click('#sync-rebuild-queue');
    assert.deepEqual(await evaluate(`window.__syncTest.choices`),['migrate','sync','list','rebuild','list']);
    await evaluate('window.__syncTest.showError()');
    await wait('#conflict-back');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await evaluate(`window.__syncTest.root.unmount();window.__syncTest=undefined`);
  }
  assert.deepEqual(browser.errors,[]);
  console.log('Sync status and migration dialogs work without manual conflict choices at phone and desktop widths');
}finally{await browser.close();}
