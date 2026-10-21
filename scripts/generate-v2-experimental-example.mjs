import {mkdir,writeFile,readFile,symlink,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {createCanvas} from 'canvas';
import {unzipSync,zipSync,strToU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';

const root=resolve(import.meta.dirname,'..');
const out=resolve(process.argv[2]||join(root,'examples/v2-experimental'));
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
const work=await mkdtemp(join(tmpdir(),'shiye-v2-experimental-'));
for(const [path,bytes] of Object.entries(original)){const dest=join(work,path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes);}
try{await symlink(join(root,'node_modules'),join(work,'node_modules'),'dir');}catch(error){if(error.code!=='EEXIST')throw error;}
const run=(command,arg)=>{
 const result=spawnSync(process.execPath,['runtime/shiye.cjs',command,...(arg?[arg]:[])],{cwd:work,encoding:'utf8',timeout:30000});
 if(result.status!==0)throw Error(command+': '+result.stderr);
 return JSON.parse(result.stdout);
};
const revision=run('info').sceneRevision;
const commands={protocolVersion:2,transactionId:'v2-experimental-example',baseSceneRevision:revision,operations:[
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
 {op:'shape.add',id:'dot',kind:'ellipse',place:{reference:'page.left',at:[.84,.15],unit:'ratio'},size:{width:8,height:8,unit:'mm'},style:{fill:'#b8d0c4'}},
 {op:'group.compose',id:'note-card',layoutBox:{width:65,height:30,unit:'mm'},place:{reference:'page.left',at:[.48,.25],unit:'ratio',rotationDeg:-4},children:[
  {op:'shape.add',id:'note-marker',kind:'rect',place:{reference:'parent',at:[.5,.35],unit:'ratio'},size:{width:47,height:6,unit:'mm'},style:{fill:'#f4dda2'}},
  {op:'text.add',id:'note-caption',content:'窗边的小光，慢慢走。',place:{reference:'node:note-marker',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,2],unit:'mm'},behavior:'linked'},size:{width:54,unit:'mm'},style:{fontSizePt:10,color:'#304638'}}
 ]},
 {op:'ink.add',id:'marker',points:[{x:0,y:0},{x:55,y:0}],unit:'mm',place:{reference:'page',at:[.5,.16],unit:'ratio'},style:{strokeWidthMm:2,color:'#e8d66b',penStyle:'marker'}},
 ...['m1','m2','m3'].map((asset,index)=>({op:'material.decision',asset,choice:'crafted',reason:['真实分成两片并保留余料','两道实体开窗构成穿插通道','穿过两个开窗而保持纸条实体'][index]}))
]};
await writeFile(join(work,'work/commands.json'),JSON.stringify(commands,null,2)+'\n');
const intro=`# 协议 2 创作包实验示例\n\n本包是同一 Scene/Canvas 链路的可运行实验包，尚不是正式默认发行版。先运行 \`node runtime/shiye.cjs self-test\` 和 \`node runtime/shiye.cjs info\`。\n\n\`work/commands.json\` 已包含一份协议 2 示例，可依次运行 \`check work/commands.json\`、\`apply work/commands.json\`、\`preview\`、\`pack\`。交付文件位于 \`output/\`。后续事务可运行 \`begin work/next.json --protocol=2\` 建立草稿。\n\n简洁操作见 \`help\`、\`describe v2:group.compose\` 和 \`api/commands.v2-experimental.schema.json\`；\`advanced.v1.*\` 是在同一事务里保留旧原生能力的高级入口。示例中的 note-card 使用真实组局部坐标与 linked 文字定位。结构校验和本示例不等于人工视觉审阅已通过。\n`;
await writeFile(join(work,'START_HERE.md'),intro);
const taskJson=JSON.parse(new TextDecoder().decode(original['TASK.json']));
const guide=new TextDecoder().decode(original['design/CRAFT_GUIDE.md']);
const releaseId='v2-experimental-'+createHash('sha256').update(intro+'\0'+guide).digest('hex').slice(0,16);
taskJson.protocolVersion=2;taskJson.fixedReleaseId=releaseId;
const fixedRelease={releaseId,protocolVersion:2,files:['START_HERE.md','design/CRAFT_GUIDE.md']};
await writeFile(join(work,'TASK.json'),JSON.stringify(taskJson,null,2)+'\n');
await writeFile(join(work,'api/fixed-release.json'),JSON.stringify(fixedRelease,null,2)+'\n');
const zipFiles={...original,'START_HERE.md':strToU8(intro),'TASK.json':strToU8(JSON.stringify(taskJson,null,2)+'\n'),
 'api/fixed-release.json':strToU8(JSON.stringify(fixedRelease,null,2)+'\n'),'work/commands.json':strToU8(JSON.stringify(commands,null,2)+'\n')};
await writeFile(join(out,'拾页-协议2创作包-实验示例.zip'),zipSync(zipFiles,{level:6}));
for(const name of ['check','apply','preview','pack'])run(name,name==='check'||name==='apply'?'work/commands.json':null);
const delivered=JSON.parse(await readFile(join(work,'output/manifest.json'),'utf8'));
await copyFile(join(work,'output/preview.png'),join(out,'preview.png'));
await copyFile(join(work,'output/project.shiyeproject.json'),join(out,'project.shiyeproject.json'));
await copyFile(join(work,'output/manifest.json'),join(out,'manifest.json'));
await rm(work,{recursive:true,force:true});
console.log(JSON.stringify({zip:join(out,'拾页-协议2创作包-实验示例.zip'),preview:join(out,'preview.png'),project:join(out,'project.shiyeproject.json'),sceneRevision:delivered.sceneRevision,physical:delivered.physical,visualReview:delivered.visualReview}));
