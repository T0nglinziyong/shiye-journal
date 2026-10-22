import {mkdir,writeFile,readFile,symlink,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createCanvas} from 'canvas';
import {unzipSync,zipSync,strToU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';

const root=resolve(import.meta.dirname,'..');
const out=resolve(process.argv[2]||join(root,'examples/v3-unified'));
await mkdir(out,{recursive:true});
const assets=[
 {id:'demo-pattern-paper',title:'蓝色图案纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,blobId:'demo-pattern-image',supply:{quantity:1}},
 {id:'demo-frame-paper',title:'浅绿窗口纸',kind:'paper',physicalWidthMM:140,physicalHeightMM:80,blobId:'demo-frame-image',supply:{quantity:1}},
 {id:'demo-paper-strip',title:'暖橙穿插纸条',kind:'paper',physicalWidthMM:160,physicalHeightMM:8,blobId:'demo-strip-image',supply:{quantity:1}}
];
const colors=[['#dce8ec','#628999'],['#e4efdb','#8da878'],['#f6d9bb','#d38a57']];
const previews=assets.map((asset,index)=>{
 const canvas=createCanvas(600,480),ctx=canvas.getContext('2d');ctx.fillStyle=colors[index][0];ctx.fillRect(0,0,600,480);
 ctx.fillStyle=colors[index][1];
 if(index===0){for(let i=0;i<12;i++){ctx.beginPath();ctx.arc(60+(i%6)*96,130+Math.floor(i/6)*155,28,0,Math.PI*2);ctx.fill();}}
 else if(index===1){ctx.fillRect(12,12,576,14);ctx.fillRect(12,454,576,14);ctx.font='bold 65px serif';ctx.fillText('FIELD NOTES',35,160);}
 else for(let i=0;i<8;i++)ctx.fillRect(22+i*74,60,32,360);
 return {alias:'m'+(index+1),bytes:new Uint8Array(canvas.toBuffer('image/png')),filename:asset.title+'.png'};
});
const p=project('统一命令与实体工艺示例',{mode:'spread',ratio:'a5'});p.processing='自由拆解';
const task=await createOfflineHandoff({project:p,assets,aliases:Object.fromEntries(assets.map((asset,index)=>['m'+(index+1),asset.id])),previews,settings:{includeThumbnails:true}});
const original=unzipSync(new Uint8Array(await task.blob.arrayBuffer()));
const work=await mkdtemp(join(tmpdir(),'shiye-v3-unified-'));
for(const [path,bytes] of Object.entries(original)){const dest=join(work,path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes);}
try{await symlink(join(root,'node_modules'),join(work,'node_modules'),'dir');}catch(error){if(error.code!=='EEXIST')throw error;}
const run=(command,arg)=>{
 const result=spawnSync(process.execPath,['runtime/shiye.cjs',command,...(arg?[arg]:[])],{cwd:work,encoding:'utf8',timeout:30000});
 if(result.status!==0)throw Error(command+': '+result.stderr);
 return JSON.parse(result.stdout);
};
const revision=run('info').sceneRevision;
const commands={protocolVersion:2,transactionId:'v3-unified-example',baseSceneRevision:revision,operations:[
 {op:'material.add',id:'pattern',asset:'m1',place:{reference:'page.left',at:[.5,.58],unit:'ratio'}},
 {op:'material.split',target:'pattern',pieces:[
  {id:'pattern-left',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,.32,1]}},
  {id:'pattern-right',region:{shape:'rect',space:'source',unit:'ratio',box:[.45,0,.32,1]}}
 ]},
 {op:'material.add',id:'frame',asset:'m2',place:{reference:'page.right',at:[.5,.42],unit:'ratio'}},
 {op:'material.add',id:'strip',asset:'m3',place:{reference:'page.right',at:[.5,.42],unit:'ratio'}},
 {op:'material.window',target:'frame',windowId:'left-hole',region:{shape:'rect',space:'local',unit:'ratio',box:[.1,.2,.15,.6]}},
 {op:'material.window',target:'frame',windowId:'right-hole',region:{shape:'rect',space:'local',unit:'ratio',box:[.75,.2,.15,.6]}},
 {op:'material.weave',strip:'strip',through:[{target:'frame',window:'left-hole',sideAfter:'front'},{target:'frame',window:'right-hole',sideAfter:'back'}]},
 {op:'text.add',id:'title',content:'把今天折成几片',place:{reference:'page',at:[.5,.11],unit:'ratio'},size:{width:135,unit:'mm'},style:{fontSizePt:22,color:'#304638',textAlign:'center'}},
 {op:'text.add',id:'note',content:'蓝色散成两片，浅绿留出两道窗口。暖橙从纸间穿过，像今天稍稍绕了一段路。',place:{reference:'page',at:[.5,.84],unit:'ratio'},size:{width:195,unit:'mm'},style:{fontSizePt:13,color:'#304638'}},
 {op:'graphic.add',id:'dot',geometry:{kind:'ellipse'},place:{reference:'page.left',at:[.84,.15],unit:'ratio'},size:{width:8,height:8,unit:'mm'},style:{fill:'#b8d0c4'}},
 {op:'group.compose',id:'note-card',layoutBox:{width:65,height:30,unit:'mm'},place:{reference:'page.left',at:[.48,.25],unit:'ratio',rotationDeg:-4},children:[
  {op:'graphic.add',id:'note-marker',geometry:{kind:'rect'},place:{reference:'parent',at:[.5,.35],unit:'ratio'},size:{width:47,height:6,unit:'mm'},style:{fill:'#f4dda2'}},
  {op:'text.add',id:'note-caption',content:'窗边的小光，慢慢走。',place:{reference:'node:note-marker',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,2],unit:'mm'},behavior:'linked'},size:{width:54,unit:'mm'},style:{fontSizePt:10,color:'#304638'}}
 ]},
 {op:'graphic.add',id:'marker',geometry:{kind:'stroke',points:[{x:0,y:0},{x:55,y:0}],unit:'mm'},place:{reference:'page',at:[.5,.16],unit:'ratio'},style:{strokeWidthMm:2,stroke:'#e8d66b',penStyle:'marker'}},
 ...['m1','m2','m3'].map((asset,index)=>({op:'material.decision',asset,choice:'crafted',reason:['真实分成两片并保留余料','两道实体开窗构成穿插通道','穿过两个开窗而保持纸条实体'][index]}))
]};
await writeFile(join(work,'work/commands.json'),JSON.stringify(commands,null,2)+'\n');
await writeFile(join(out,'拾页-统一命令创作包-示例.zip'),zipSync({...original,'work/commands.json':strToU8(JSON.stringify(commands,null,2)+'\n')},{level:6}));
for(const name of ['check','apply','preview','pack'])run(name,name==='check'||name==='apply'?'work/commands.json':null);
const delivered=JSON.parse(await readFile(join(work,'output/manifest.json'),'utf8'));
await copyFile(join(work,'output/preview.png'),join(out,'preview.png'));
await copyFile(join(work,'output/project.shiyeproject.json'),join(out,'project.shiyeproject.json'));
await copyFile(join(work,'output/manifest.json'),join(out,'manifest.json'));
await rm(work,{recursive:true,force:true});
console.log(JSON.stringify({zip:join(out,'拾页-统一命令创作包-示例.zip'),preview:join(out,'preview.png'),project:join(out,'project.shiyeproject.json'),sceneRevision:delivered.sceneRevision,physical:delivered.physical,visualReview:delivered.visualReview}));
