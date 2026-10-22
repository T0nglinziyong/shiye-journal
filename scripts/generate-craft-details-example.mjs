// Synthetic example only. No user's materials, video frames or font binaries.
import {mkdir,writeFile,readFile,symlink,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createCanvas} from 'canvas';
import {unzipSync,zipSync,strToU8} from 'fflate';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
const root=resolve(import.meta.dirname,'..'),out=resolve(process.argv[2]||join(root,'test-results/craft-details'));
await mkdir(out,{recursive:true});
const asset={id:'synthetic-note',title:'单张蓝纸示例',kind:'paper',physicalWidthMM:40,physicalHeightMM:30,blobId:'synthetic-note-image',supply:{quantity:1}};
const image=createCanvas(400,300),x=image.getContext('2d');x.fillStyle='#DCE8E9';x.fillRect(0,0,400,300);x.strokeStyle='#B8CFD2';x.lineWidth=2;for(let y=50;y<290;y+=50){x.beginPath();x.moveTo(20,y);x.lineTo(380,y);x.stroke();}
const p=project('文字与图形共同构图 · 合成验收',{mode:'single',ratio:'a5'});p.processing='自由拆解';
const task=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:new Uint8Array(image.toBuffer('image/png'))}],settings:{includeThumbnails:true}});
const initial=unzipSync(new Uint8Array(await task.blob.arrayBuffer())),work=await mkdtemp(join(tmpdir(),'shiye-details-'));
for(const [path,data] of Object.entries(initial)){const dest=join(work,path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,data);}
await symlink(join(root,'node_modules'),join(work,'node_modules'),'dir');
const run=(command,arg)=>{const result=spawnSync(process.execPath,['runtime/shiye.cjs',command,...(arg?[arg]:[])],{cwd:work,encoding:'utf8',timeout:60000});if(result.status!==0)throw Error(command+': '+result.stderr);return JSON.parse(result.stdout);};
const place=(x,y,rotationDeg=0)=>({reference:'page',at:[x,y],unit:'mm',rotationDeg});
const titleStyle={fontSizePt:36,fontPreset:'serif',color:'#35576A'};
const structure=[
 {op:'page.update',paperColor:'#F8F4EA'},
 {op:'shape.add',id:'backdrop',kind:'ellipse',place:place(74,49),size:{width:98,height:75,unit:'mm'},style:{fill:'#E8DABF',opacity:.55}},
 {op:'text.add',id:'small-label',content:'FIELD NOTES / 01',place:place(47,17),size:{width:70,unit:'mm'},style:{fontSizePt:10,fontPreset:'sans',color:'#5B7379'}},
 {op:'text.add',id:'draft-title',content:'先试试',place:place(75,43),size:{width:103,unit:'mm'},style:{...titleStyle,textAlign:'center'}},
 {op:'text.add',id:'body',content:'有些答案，要走近一点才看得见。\n先画一笔，写下一句，再把今天\n的小小念头，放到纸上。',place:place(76,99),size:{width:110,unit:'mm'},style:{fontSizePt:13,fontPreset:'serif',color:'#3B535F',lineHeight:1.55}},
 {op:'material.add',id:'paper',asset:'m1',place:place(42,151,-4)},
 {op:'text.add',id:'note',content:'只带上好奇心。\n其他的，慢慢来。',place:{reference:'node:paper',at:[.5,.5],unit:'ratio',rotationSpace:'reference',rotationDeg:0},size:{width:35,unit:'mm'},style:{fontSizePt:10,fontPreset:'serif',color:'#35576A',textAlign:'center'}},
 {op:'shape.add',id:'main-leaf',kind:'leaf',place:place(104,147,26),size:{width:38,height:50,unit:'mm'},style:{fill:'#7E9A89',stroke:'#526E65',strokeWidthMm:.4}},
 {op:'text.add',id:'closing',content:'不必每一笔都正确。',place:place(87,185),size:{width:100,unit:'mm'},style:{fontSizePt:13,fontPreset:'serif',color:'#35576A',textAlign:'center'}}
];
const detail=[
 {op:'layer.delete',target:'draft-title'},
 {op:'text.lettering',id:'title',content:'先试试',place:place(74,45,-2),style:{...titleStyle,outline:{color:'#F8F4EA',widthMm:.7}},letters:[{index:0,style:{fontPreset:'sans',fontWeight:'bold'}},{index:1,style:{gradient:{angleDeg:90,stops:[{offset:0,color:'#C78354'},{offset:1,color:'#687A9E'}]}},rotationDeg:3,offsetMm:[0,1]},{index:2,style:{fontPreset:'hand'},rotationDeg:-3}]},
 {op:'text.add',id:'keyword',content:'留一点勇气',place:place(74,70),size:{width:58,unit:'mm'},style:{fontSizePt:16,fontPreset:'serif',color:'#35576A',textAlign:'center'}},
 {op:'draw.decorate',id:'keyword-mark',target:'keyword',kind:'highlight',style:{color:'#E7C57F',strokeWidthMm:5,opacity:.45},seed:17},
 {op:'draw.decorate',id:'closing-mark',target:'closing',kind:'underline',style:{color:'#B98C60',strokeWidthMm:.65},seed:7},
 {op:'shape.add',id:'dot-1',kind:'ellipse',place:place(24,80),size:{width:6,height:6,unit:'mm'},style:{fill:'#7E9A89'}},
 {op:'shape.add',id:'dot-2',kind:'ellipse',place:place(126,125),size:{width:4,height:4,unit:'mm'},style:{fill:'#C78354'}},
 {op:'ink.add',id:'leaf-vein',points:[{x:0,y:0},{x:8,y:-15},{x:15,y:-31}],unit:'mm',place:place(104,147,26),style:{color:'#E9EEE3',strokeWidthMm:.6,penStyle:'ballpoint'}},
 {op:'material.decision',asset:'m1',choice:'intact',reason:'单张蓝纸承托小段随写，其余版式由文字与数字图形组织。'}
];
const firstRevision=run('info').sceneRevision;
for(const [phase,operations] of [['structure',structure],['detail',detail]]){
 const transaction={protocolVersion:2,transactionId:'details-'+phase,baseSceneRevision:run('info').sceneRevision,operations};
 await writeFile(join(work,'work/'+phase+'.json'),JSON.stringify(transaction));run('check','work/'+phase+'.json');run('apply','work/'+phase+'.json');run('preview');await copyFile(join(work,'output/preview.png'),join(out,phase+'.png'));
}
const advisory=run('design-check');run('pack');
for(const name of ['preview.png','project.shiyeproject.json','manifest.json'])await copyFile(join(work,'output',name),join(out,name));
await writeFile(join(out,'design-advisory.json'),JSON.stringify(advisory,null,2));
await writeFile(join(out,'synthetic-creation-task.zip'),zipSync({...initial,'work/commands.json':strToU8(JSON.stringify({protocolVersion:2,transactionId:'details-all',baseSceneRevision:firstRevision,operations:[...structure,...detail]}))},{level:6}));
await rm(work,{recursive:true,force:true});console.log(JSON.stringify({out,synthetic:true,stages:2,visualReview:'not-automatically-approved'}));
