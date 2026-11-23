import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
const b=await browserHarness('shiye-editor-return-regression',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
try{
await b.wait('.series-grid');
console.log(await b.evaluate(`(async()=>{
 const db=await import('/src/store.js');const {project}=await import('/src/domain.js');const {localDeviceRecords}=await import('/src/local-device-records.js');const {matchingSnapshot}=await import('/src/matching-session.js');
 const p=project('返回保存验收',{ratio:'b6',mode:'single'});p.id='return-check';p.isDraft=true;const d=p.drafts[0];d.layers=[{id:'paper',type:'shape',kind:'rectangle',width:400,height:600,x:300,y:400,fill:'#efe8d6',paperSurface:{kind:'torn',intensity:.7,seed:17,unitScale:4}}];
 await db.stageProject(p);await localDeviceRecords.put('browser',matchingSnapshot({matchIntent:'保持原界面'},[{id:'return-variant',status:'completed',project:p,linkedProjectID:p.id,title:p.title}]));return p.id;
})()`));
await b.command('Page.reload');await b.wait('.series-grid');await b.click('[data-route="matching"]','.match-result');await b.click('[data-act="match-open-result"]','#canvas-page');await b.wait('.upper-canvas');
await b.click('[data-act="editor-done"]','.match-previews');
const saved=await b.evaluate(`(async()=>{const db=await import('/src/store.js');return await db.get('projects','return-check')})()`);assert.equal(saved.isDraft,false);
await b.click('[data-act="match-open-result"]','#canvas-page');await b.click('[data-act="back-works"]','.match-previews');
const again=await b.evaluate(`(async()=>{const db=await import('/src/store.js');return (await db.all('projects')).filter(p=>p.title==='返回保存验收').map(p=>({id:p.id,isDraft:p.isDraft}))})()`);assert.deepEqual(again,[{id:'return-check',isDraft:false}]);assert.deepEqual(b.errors,[]);console.log('PASS: complete persists published work, both exits return to matching, reopen preserves id without duplicate draft');
await b.evaluate(`(async()=>{
 const {default:React}=await import('/node_modules/.vite/deps/react.js');const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');const {createRoot}=ReactDOM;const {MatchingSessionPanel}=await import('/src/react-routes.jsx');
 const state={projects:[],assets:[]},variant={id:'live',status:'running',title:'正在创作',progress:'第4轮',project:{id:'live-work',drafts:[]}},listeners=new Set();
 const session={subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn)},variants:()=>[variant],progress:v=>v.progress,coverURL:async()=>null,previewURL:()=> 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="blue"/%3E%3C/svg%3E',closePreview:()=>{state.creativePreviewVariantID=null;for(const fn of listeners)fn()}};
 const root=document.createElement('div');document.body.replaceChildren(root);createRoot(root).render(React.createElement(MatchingSessionPanel,{state,session,source:()=>'',onAction:()=>{state.creativePreviewVariantID='live';for(const fn of listeners)fn()}}));
})()`);
await b.click('.match-result','.creative-live-view');assert.equal(await b.evaluate("document.querySelectorAll('.creative-live-view footer button:disabled').length"),4);assert.equal(await b.evaluate("document.querySelectorAll('.creative-live-view button:not(:disabled)').length"),1);await b.click('.creative-live-view header button');assert.equal(await b.evaluate("!!document.querySelector('.creative-live-view')"),false);console.log('PASS: running variant opens actual preview with only return enabled');
}finally{await b.close()}
