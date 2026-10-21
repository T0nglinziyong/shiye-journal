import {mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createCanvas} from 'canvas';
import {unzipSync} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {assetSourceRevision} from '../src/material-anatomy.js';
import {craftSceneHash} from '../src/craft-fingerprint.js';
const root=resolve(import.meta.dirname,'..'),out=resolve(process.argv[2]||'/tmp/shiye-v3-examples');
await mkdir(out,{recursive:true});
const assets=[
 {id:'sample-paper',title:'蓝色拼贴纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,blobId:'sample-paper-image',supply:{quantity:1}},
 {id:'sample-frame',title:'浅绿窗口纸',kind:'paper',physicalWidthMM:140,physicalHeightMM:80,blobId:'sample-frame-image',supply:{quantity:1}},
 {id:'sample-strip',title:'暖橙纸条',kind:'paper',physicalWidthMM:160,physicalHeightMM:8,blobId:'sample-strip-image',supply:{quantity:1}}
];
const palette=[['#7698ac','#dce7e9'],['#92ac89','#e8efe3'],['#df9e6c','#fae2ca']];
const previews=assets.map((a,index)=>{const c=createCanvas(600,480),g=c.getContext('2d');g.fillStyle=palette[index][1];g.fillRect(0,0,600,480);g.fillStyle=palette[index][0];
 if(index===0){for(let j=0;j<7;j++){g.beginPath();g.arc(90+j*75,220+(j%2)*36,28+j%3*6,0,Math.PI*2);g.fill();}g.font='bold 62px serif';g.fillText('SLOW DAYS',72,100);}
 else if(index===1){g.fillRect(18,18,564,10);g.fillRect(18,452,564,10);g.font='bold 72px serif';g.fillText('FIELD NOTES',54,150);}
 else {for(let j=0;j<8;j++)g.fillRect(18+j*75,100,35,280);}
 return {alias:'m'+(index+1),bytes:new Uint8Array(c.toBuffer('image/png')),filename:a.title+'.png'};});
const p=project('拾页 v3 工艺示例',{mode:'spread',ratio:'a5'});p.processing='自由拆解';
const task=await createOfflineHandoff({project:p,assets,aliases:{m1:assets[0].id,m2:assets[1].id,m3:assets[2].id},previews,settings:{includeThumbnails:true}});
const zipBytes=new Uint8Array(await task.blob.arrayBuffer());await writeFile(join(out,'拾页-GPT创作包-v3-示例.zip'),zipBytes);
const files=unzipSync(zipBytes);
async function make(name,ops,revisionOps=[]){
 const dir=join(out,name);await mkdir(dir,{recursive:true});
 for(const [path,bytes] of Object.entries(files)){const dest=join(dir,path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes);}
 try{await symlink(join(root,'node_modules'),join(dir,'node_modules'),'dir');}catch(error){if(error.code!=='EEXIST')throw error;}
 const run=(cmd,arg)=>{const r=spawnSync(process.execPath,['runtime/shiye.cjs',cmd,...(arg?[arg]:[])],{cwd:dir,encoding:'utf8',timeout:30000});if(r.status!==0)throw Error(cmd+': '+r.stderr);return JSON.parse(r.stdout);};
 const revision=run('info').sceneRevision,commands={protocolVersion:1,transactionId:name+'-initial',baseSceneRevision:revision,operations:ops};
 await writeFile(join(dir,'work/commands.json'),JSON.stringify(commands,null,2));await writeFile(join(dir,'work/commands-initial.json'),JSON.stringify(commands,null,2));run('apply','work/commands.json');run('preview');
 if(revisionOps.length){const revise={protocolVersion:1,transactionId:name+'-revision',baseSceneRevision:run('info').sceneRevision,operations:revisionOps};await writeFile(join(dir,'work/commands.json'),JSON.stringify(revise,null,2));await writeFile(join(dir,'work/commands-revise.json'),JSON.stringify(revise,null,2));run('apply','work/commands.json');run('preview');}
 run('pack');
 return {dir,revision:run('info').sceneRevision};
}
const choices=(used)=>assets.map((a,i)=>({op:'material.decision',asset:'m'+(i+1),choice:used.includes(i)?'crafted':'omitted',reason:used.includes(i)?'素材参与实际画面工艺组合':'本页主题暂不需要这一件素材'}));
await make('simple',[
 {op:'material.add',id:'hero',asset:'m1',placement:{xMm:75,yMm:105}},
 {op:'text.add',id:'heading',content:'把寻常日子，慢慢记下来。',xMm:75,yMm:35,widthMm:100,fontSizePt:24,color:'#304638'},
 {op:'shape.add',id:'accent',kind:'ellipse',xMm:128,yMm:58,widthMm:13,heightMm:13,fill:'#d5e2d6'},
 ...assets.map((a,i)=>({op:'material.decision',asset:'m'+(i+1),choice:i===0?'intact':'omitted',reason:i===0?'保留印刷内容完整轮廓':'本页主题暂不需要这一件素材'}))
],[
 {op:'layer.update',target:'heading',set:{content:'把寻常日子，慢慢记下来。\n从一张蓝纸开始。'}},
 {op:'text.add',id:'simple-note',content:'纸上的颜色像今天的天气。',xMm:130,yMm:134,widthMm:88,fontSizePt:17,color:'#304638'}
]);
const piece=(id,alias,asset,extraction,centerMM,treatments=[])=>({id,asset:alias,sourceRevision:assetSourceRevision(asset),unit:0,extraction,centerMM,treatments});
const plan={format:'shiye-craft-plan',version:2,commandId:'complex-art',baseSceneHash:craftSceneHash(task.source.baseDraft),
 pieces:[
  piece('left','m1',assets[0],{type:'rect_crop',boxMM:[0,0,40,80]},[35,155],[{op:'edge',style:'torn',edges:['bottom'],depth_mm:1,period_mm:8,seed:42}]),
  piece('right','m1',assets[0],{type:'rect_crop',boxMM:[40,0,40,80]},[82,155]),
  piece('frame','m2',assets[1],{type:'whole'},[150,95],[{op:'window',shape:'rectangle',box:[.1,.2,.15,.6]},{op:'window',shape:'rectangle',box:[.75,.2,.15,.6]}]),
  piece('strip','m3',assets[2],{type:'whole'},[150,95])
 ],sourcePartitions:[{asset:'m1'}],weaves:[{piece:'strip',target:'frame',holes:[0,1]}]};
await make('complex',[
 {op:'material.craft',plan},
 {op:'text.add',id:'caption',content:'把今天折成几片，留一点光从纸窗穿过。',xMm:148,yMm:175,widthMm:110,fontSizePt:23,color:'#304638'},
 {op:'ink.add',id:'highlight',points:[{xMm:100,yMm:188},{xMm:195,yMm:188}],widthMm:3,color:'#e8d66b',penStyle:'marker'},
 ...choices([0,1,2])
],[
 {op:'layer.update',target:'caption',set:{content:'把今天折成几片，留一点光从纸窗穿过。\n蓝色留在左页，暖橙从两道窗口间穿行。'}},
 {op:'shape.add',id:'round-accent',kind:'ellipse',xMm:240,yMm:28,widthMm:12,heightMm:12,fill:'#d5e2d6'},
 {op:'text.add',id:'side-note',content:'FIELD NOTES / 01',xMm:40,yMm:28,widthMm:68,fontSizePt:16,color:'#304638'},
 {op:'group.create',id:'caption-group',targets:['caption','highlight'],name:'书写与高亮'}
]);
console.log(out);
