import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MatchingPage} from '../../src/react-routes.jsx';
import {project} from '../../src/domain.js';
import {createOfflineHandoff,inspectOfflinePackage,verifyOfflineTaskPackage} from '../../src/offline-creation.js';
import '../../src/styles.css';
import '../../src/overrides.css';
import '../../src/parity.css';
import '../../src/mobile-ai.css';
import '../../src/responsive.css';
import '../../src/swift-controls.css';
import '../../src/icons.css';
import '../../src/asset-organization.css';
import '../../src/sync-indicator.css';
import '../../src/offline-handoff.css';
import '../../src/matching-view.css';
import '../../src/page-heading.css';
import '../../src/layout-refinements.css';
import '../../src/canvas-editor-fixes.css';
import '../../src/tape-ui.css';
import '../../src/mobile-material-ui.css';
import '../../src/ui-consistency.css';
import '../../src/material-polish.css';
const session={subscribe:()=>()=>{},variants:()=>[]};
function Fixture(){
 const [state,setState]=useState({assets:[],basket:[],coreIDs:[],excludedAssetIDs:[],projects:[],matchCreationMode:'edit',matchStyles:['随材而定'],matchPurposes:['自由创作'],matchContentPolicy:'original',matchIntent:'写一页给慢下来的自己',matchMode:'single',matchRatio:'b6',recommendFilter:'全部',aiSettings:{autoIncludeRecommendations:false,requireAllCandidates:false}});
 const [status,setStatus]=useState('等待导出；本页使用真实搭配组件，无账号数据或 AI 请求。');
 const action=async name=>{
  if(name==='match-export-gpt')try{
   const p=project('没有素材也能创作',{mode:state.matchMode,ratio:state.matchRatio});p.creationMode=state.matchCreationMode;p.intent=state.matchIntent;
   const task=await createOfflineHandoff({project:p,assets:[],aliases:{}}),bytes=new Uint8Array(await task.blob.arrayBuffer());
   await verifyOfflineTaskPackage(bytes,task.source);
   setStatus(JSON.stringify({ok:true,materialCount:inspectOfflinePackage(bytes).source.materials.length,bytes:bytes.length,format:task.source.packageLayout}));
  }catch(error){setStatus('失败：'+error.message);}
 };
 return <main id="view"><pre id="result" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{status}</pre><MatchingPage state={state} source={()=>null} kindName={x=>x} session={session} onAction={action} onMatchingChange={(key,value)=>setState(s=>({...s,[key]:value}))}/></main>;
}
createRoot(document.querySelector('#root')).render(<Fixture/>);
