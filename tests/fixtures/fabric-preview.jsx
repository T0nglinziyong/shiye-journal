export * as fabric from 'fabric';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ActiveSelection} from 'fabric';
import {FabricSceneStage} from '../../src/fabric-scene-stage.jsx';

const image=document.createElement('canvas');image.width=200;image.height=120;
const ctx=image.getContext('2d');ctx.fillStyle='#83af81';ctx.fillRect(0,0,200,120);
ctx.fillStyle='#d97769';ctx.fillRect(20,20,160,80);
const assetURL=image.toDataURL();
const draft={id:'fabric-preview',sceneVersion:2,canvas:{width:600,height:800},paperColor:'#fffdf5',
  paperPattern:'grid',layers:[
    {id:'paper-group',type:'group',zIndex:1,
      vectorMask:{outer:[[0,0],[.45,0],[.45,1],[0,1]],holes:[]},children:[
      {id:'paper-shape',type:'shape',kind:'roundedRectangle',x:190,y:160,width:240,
        height:110,fill:'#d6e8dd',stroke:'#416c59',lineWidth:3}]},
    {id:'paper-material',type:'material',assetID:'fabric-sample',x:340,y:380,width:320,
      height:192,cropRect:{x:.1,y:0,width:.8,height:1},
      materialMask:{shape:'compound',outer:{shape:'rounded',radius:.1},
        holes:[{shape:'ellipse',box:[.38,.3,.24,.4]}]},
      vectorMask:{outer:[[0,0],[.9,0],[.9,1],[0,1]],holes:[]},zIndex:2},
    {id:'paper-text',type:'text',content:'拾页画布\n中文输入',x:270,y:590,width:390,
      height:145,fontSize:54,style:'serif',color:'#30463d',
      vectorMask:{outer:[[0,0],[.7,0],[.7,1],[0,1]],holes:[]},zIndex:3},
    {id:'paper-ink',type:'ink',points:[{x:90,y:710},{x:210,y:680},{x:330,y:720}],
      width:7,color:'#aa6655',zIndex:4}
  ]};
window.__fabricFixture={draft,image};
window.__fabricActiveSelection=ActiveSelection;
const events=document.querySelector('#events');
function Preview(){
  const [tool,setTool]=React.useState('select');
  const [sceneRevision,setSceneRevision]=React.useState(0);
  const [selectedIDs,setSelectedIDs]=React.useState([]);
  window.__fabricFixture.refresh=()=>setSceneRevision(value=>value+1);
  window.__fabricFixture.select=ids=>setSelectedIDs(ids);
  return <><nav id="fabric-tools">{['select','pen','eraser','lasso'].map(name=><button key={name}
    type="button" data-tool={name} onClick={()=>setTool(name)}>{name}</button>)}</nav>
    <FabricSceneStage draft={draft} sceneRevision={sceneRevision} tool={tool}
      selectedID={selectedIDs.length===1?selectedIDs[0]:null} selectedIDs={selectedIDs}
      assetURL={id=>id==='fabric-delayed'?new Promise(resolve=>setTimeout(()=>resolve(assetURL),350)):assetURL}
      onReady={canvas=>window.__fabricCanvas=canvas}
      onSelection={ids=>{setSelectedIDs(ids);events.textContent='选中：'+ids.join(', ')}}
      onIssue={error=>events.textContent='错误：'+error.message}/></>;
}
createRoot(document.querySelector('#root')).render(<Preview/>);
