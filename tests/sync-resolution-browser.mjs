import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-sync-resolution',url+'/');
const {command,evaluate,wait,click}=browser;
try{
  await wait('body');
  for(const width of [390,1024]){
    await command('Emulation.setDeviceMetricsOverride',
      {width,height:844,deviceScaleFactor:2,mobile:width<600});
    await evaluate(`(async()=>{
      const [{SyncConflictDialog,SyncMigrationDialog,SyncDetailsDialog},React,ReactDOM]=await Promise.all([
        import('/src/react-sync-dialogs.jsx'),
        import('/node_modules/.vite/deps/react.js'),
        import('/node_modules/.vite/deps/react-dom_client.js')
      ]);
      window.__syncTest={SyncConflictDialog,SyncMigrationDialog,SyncDetailsDialog,React:React.default||React,
        root:(ReactDOM.default||ReactDOM).createRoot(document.body.appendChild(document.createElement('div'))),choices:[]};
      window.__syncTest.showConflict=()=>{
        const {React,root,SyncConflictDialog,choices}=window.__syncTest;
        root.render(React.createElement(SyncConflictDialog,{
          review:{mode:'batch',kind:'batch',id:'pending-1',serial:1,revision:2,localAllowed:true,
            overview:{local:{title:'2 条待同步变更',kind:'assets·put、blobs·put'},
              remote:{title:'对应云端记录 1 条'},items:[
                {store:'assets',action:'put',id:'a',localTitle:'本机标题',remoteTitle:'云端标题'},
                {store:'blobs',action:'put',id:'b'}]}},
          onClose:()=>{},onBack:()=>{},onResolve:async choice=>{choices.push(choice);}
        }));
      };
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
        root.render(React.createElement(SyncDetailsDialog,{details:{error:null},projects:[],batches:[],local:[],
          quarantined:0,legacyCount:0,status:'待同步',onClose:()=>{},onDiagnostics:()=>{},onConflict:()=>{},
          onMigrate:()=>{},onBackupLegacy:()=>{},onWipe:()=>{},onPause:()=>{},onEmergency:()=>{},
          onRetry:async()=>{choices.push('rebuild');return {remaining:0,conflicts:0};}}));
      };
      window.__syncTest.showConflict();
    })()`);
    await wait('#conflict-cloud');
    assert.equal(await evaluate(`!!document.querySelector('#conflict-backup')`),false);
    assert.equal(await evaluate(`document.querySelector('#conflict-local').disabled`),false);
    assert.ok((await evaluate(`document.documentElement.scrollWidth-innerWidth`))<=1);
    await click('#conflict-local');
    assert.deepEqual(await evaluate(`window.__syncTest.choices`),['local']);
    await evaluate(`window.__syncTest.showMigration()`);
    await wait('#migration-apply');
    assert.equal(await evaluate(`document.querySelector('#migration-apply').disabled`),false);
    assert.equal(await evaluate(`!!document.querySelector('#migration-download')`),false);
    await click('#migration-apply');
    assert.deepEqual(await evaluate(`window.__syncTest.choices`),['local','migrate']);
    await evaluate(`window.__syncTest.showDetails()`);
    await wait('#sync-retry-now');
    assert.equal(await evaluate(`document.querySelector('#sync-retry-now').textContent`),'重建队列并同步');
    await click('#sync-retry-now');
    assert.deepEqual(await evaluate(`window.__syncTest.choices`),['local','migrate','rebuild']);
    await evaluate(`window.__syncTest.root.unmount();window.__syncTest=undefined`);
  }
  assert.deepEqual(browser.errors,[]);
  console.log('Sync conflict and migration dialogs work without a backup gate at phone and desktop widths');
}finally{await browser.close();}
