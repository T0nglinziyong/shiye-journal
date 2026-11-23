import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {loadOfflineCanvas} from '../src/offline-node-preview.mjs';
import {exampleMaterials} from '../creative-agent/library/examples.js';
import {createCreativeHarness,initialHarnessState} from '../creative-agent/runtime/agent.mjs';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';
import {createHarnessRenderer} from '../creative-agent/runtime/renderer.mjs';
import {JournalCheckpointSaver,fileCheckpointJournal} from '../creative-agent/runtime/checkpoints.mjs';
import {createDeepSeekCreativeModel} from '../creative-agent/runtime/deepseek.mjs';
import {createCreativeNetwork} from '../creative-agent/runtime/network.mjs';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:true,mode:0o700});
const canvas=await loadOfflineCanvas(),images={},assets=exampleMaterials.slice(0,3);
for(const [i,a] of assets.entries()){
 const c=canvas.createCanvas(300,Math.round(300*a.physicalHeightMM/a.physicalWidthMM)),x=c.getContext('2d');x.fillStyle=['#6B9DA8','#E7BC67','#ABC2AA'][i];x.fillRect(0,0,c.width,c.height);x.fillStyle='#FAF1D2';
 if(i===0){x.beginPath();x.arc(190,95,45,0,Math.PI*2);x.fill();x.fillStyle='#3B6572';x.beginPath();x.moveTo(0,c.height);x.lineTo(130,160);x.lineTo(300,c.height);x.fill();}
 else for(let y=15;y<c.height;y+=30)for(let xx=15;xx<300;xx+=30){x.beginPath();x.arc(xx,y,3,0,Math.PI*2);x.fill();}
 images[a.alias]=c.toBuffer('image/png');
}
const document=await createCreationDocument({draft:draft({ratio:'a6'}),assets,aliases:Object.fromEntries(assets.map(a=>[a.alias,a.id])),title:'模板工具验收',styles:['丰富层叠'],requiredAssetIDs:assets.map(a=>a.id),prompt:'使用这三件程序生成的示意素材创作一页《收集小美好》。先查看一个匹配模板并通过 creation_recipe 使用它，再查阅一个教程方法通过 creation_recipe 创建标题组或其他技巧。保持真实尺寸，不生成新的实物素材。观察自动预览后调整位置与层级，做到三件材料各自可见、标题可读。允许数字笔迹与少量图形。'});
const skills=await loadCreationSkills(),renderer=await createHarnessRenderer({source:document.source,images,saveArtifact:async({png,pngHash,document})=>{
 const name='preview-'+pngHash.slice(7,20)+'.png';await writeFile(join(output,name),png);await writeFile(join(output,'latest-document.json'),JSON.stringify(document));return name;
}}),network=createCreativeNetwork({dns:process.env.SHIYE_CREATIVE_DNS||'system'}),start=Date.now();
const harness=createCreativeHarness({skills,...renderer,checkpointer:await new JournalCheckpointSaver(fileCheckpointJournal(join(output,'checkpoint.jsonl'))).restore(),model:createDeepSeekCreativeModel({key:process.env.SHIYE_CREATIVE_API_KEY,effort:'high',fetcher:network.fetcher}),onProgress:event=>console.log(JSON.stringify(event))});
try{
 const state=initialHarnessState({document,skills,brief:{intent:document.source.intent},tray:await renderer.index(document)});
 const result=await harness.run({id:'library-synthetic',state});
 const calls=result.messages.filter(m=>m.role==='assistant').flatMap(m=>(m.tool_calls||[]).map(c=>({name:c.function.name,args:JSON.parse(c.function.arguments)})));
 const report={status:result.status,synthetic:true,liveApp:false,totalMs:Date.now()-start,turns:result.turns,usage:result.usage,preview:result.preview,review:result.review,calls};await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,turns:report.turns,totalMs:report.totalMs}));
}catch(error){await writeFile(join(output,'failure.json'),JSON.stringify({message:error.message,code:error.code,totalMs:Date.now()-start}));console.log(JSON.stringify({failed:true,code:error.code||'ERROR',message:error.message}));process.exitCode=1;}finally{await network.close();}
