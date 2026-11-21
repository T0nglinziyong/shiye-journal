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
 {op:'graphic.add',id:'backdrop',geometry:{kind:'ellipse'},place:place(74,49),size:{width:98,height:75,unit:'mm'},style:{fill:'#E8DABF',opacity:.55}},
 {op:'text.add',id:'small-label',content:'FIELD NOTES / 01',place:place(47,17),size:{width:70,unit:'mm'},style:{fontSizePt:10,fontPreset:'sans',color:'#5B7379'}},
 {op:'text.add',id:'draft-title',content:'先试试',place:place(75,43),size:{width:103,unit:'mm'},style:{...titleStyle,textAlign:'center'}},
 {op:'text.add',id:'body',content:'有些答案，要走近一点才看得见。\n先画一笔，写下一句，再把今天\n的小小念头，放到纸上。',place:place(76,99),size:{width:110,unit:'mm'},style:{fontSizePt:13,fontPreset:'serif',color:'#3B535F',lineHeight:1.55}},
 {op:'material.add',id:'paper',asset:'m1',place:place(42,151,-4)},
 {op:'text.add',id:'note',content:'只带上好奇心。\n其他的，慢慢来。',place:{reference:'node:paper',at:[.5,.5],unit:'ratio',rotationSpace:'reference',rotationDeg:0},size:{width:35,unit:'mm'},style:{fontSizePt:10,fontPreset:'serif',color:'#35576A',textAlign:'center'}},
 {op:'graphic.add',id:'main-leaf',geometry:{kind:'leaf'},place:place(104,147,26),size:{width:38,height:50,unit:'mm'},style:{fill:'#7E9A89',stroke:'#526E65',strokeWidthMm:.4}},
 {op:'text.add',id:'closing',content:'不必每一笔都正确。',place:place(87,185),size:{width:100,unit:'mm'},style:{fontSizePt:13,fontPreset:'serif',color:'#35576A',textAlign:'center'}}
];
const detail=[
 {op:'layer.delete',target:'draft-title'},
 {op:'text.lettering',id:'title',content:'先试试',place:place(74,45,-2),style:{...titleStyle,outline:{color:'#F8F4EA',widthMm:.7}},letters:[{index:0,style:{fontPreset:'sans',fontWeight:'bold'}},{index:1,style:{gradient:{angleDeg:90,stops:[{offset:0,color:'#C78354'},{offset:1,color:'#687A9E'}]}},rotationDeg:3,offsetMm:[0,1]},{index:2,style:{fontPreset:'hand'},rotationDeg:-3}]},
 {op:'text.add',id:'keyword',content:'留一点勇气',place:place(74,70),size:{width:58,unit:'mm'},style:{fontSizePt:16,fontPreset:'serif',color:'#35576A',textAlign:'center'}},
 {op:'graphic.add',id:'keyword-mark',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0},{x:1,y:0}]},size:{reference:'node:keyword',width:.85,unit:'ratio'},place:{reference:'node:keyword',at:[.5,.45],unit:'ratio',anchor:'center',rotationSpace:'reference',rotationDeg:0,behavior:'linked'},style:{stroke:'#E7C57F',strokeWidthMm:5,penStyle:'marker',opacity:.45,blendMode:'multiply'},order:{before:'keyword'}},
 {op:'graphic.add',id:'closing-mark',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0},{x:1,y:0}]},size:{reference:'node:closing',width:.85,unit:'ratio'},place:{reference:'node:closing',at:[.5,1],unit:'ratio',anchor:'center',rotationSpace:'reference',rotationDeg:0,behavior:'linked',offset:{value:[0,1.5],unit:'mm'}},style:{stroke:'#B98C60',strokeWidthMm:.65,penStyle:'ballpoint'},order:{after:'closing'}},
 {op:'graphic.add',id:'dot-1',geometry:{kind:'ellipse'},place:place(24,80),size:{width:6,height:6,unit:'mm'},style:{fill:'#7E9A89'}},
 {op:'graphic.add',id:'dot-2',geometry:{kind:'ellipse'},place:place(126,125),size:{width:4,height:4,unit:'mm'},style:{fill:'#C78354'}},
 {op:'graphic.add',id:'leaf-vein',geometry:{kind:'stroke',points:[{x:0,y:0},{x:8,y:-15},{x:15,y:-31}],unit:'mm'},place:place(104,147,26),style:{stroke:'#E9EEE3',strokeWidthMm:.6,penStyle:'ballpoint'}},
 {op:'layer.update',target:'backdrop',size:{width:108,height:70,unit:'mm'},style:{stroke:null,gradient:{angleDeg:20,stops:[{offset:0,color:'#DFDBC5'},{offset:1,color:'#EEE4D4'}]}}},
 {op:'layer.update',target:'small-label',content:'灵感练习  /  01',style:{fontPreset:'hand'}},
 {op:'text.reflow',target:'title',content:'大胆试试',gapMm:1.3,style:{fontSizePt:32},letters:[{index:0,style:{fontPreset:'hand'}},{index:2,style:{fontPreset:'hand',gradient:{angleDeg:90,stops:[{offset:0,color:'#C78354'},{offset:1,color:'#687A9E'}]}},rotationDeg:3},{index:3,style:{fontPreset:'serif'},rotationDeg:-4}]},
 {op:'layer.update',target:'body',place:place(76,94),style:{fontSizePt:13,fontPreset:'hand',lineHeight:1.4}},
 {op:'layer.update',target:'keyword-mark',size:{reference:'node:keyword',width:.85,unit:'ratio',behavior:'linked'}},
 {op:'layer.update',target:'main-leaf',style:{gradient:{angleDeg:45,stops:[{offset:0,color:'#C2CF9F'},{offset:1,color:'#477A70'}]},outline:{color:'#FFF9E7',widthMm:1,offsetMm:[1,1]},stroke:'#526E65'}},
 {op:'graphic.add',id:'star-top',geometry:{kind:'star'},place:place(123,34,17),size:{width:11,height:11,unit:'mm'},style:{fill:'#D9AE73',stroke:'#AA7958',strokeWidthMm:.3}},
 {op:'layer.duplicate',target:'star-top',id:'star-echo',place:place(24,53,-15)},
 {op:'layer.update',target:'star-echo',size:{width:6,height:6,unit:'mm'},style:{fill:null,stroke:'#8DA695',strokeWidthMm:.55}},
 {op:'graphic.add',id:'sparkles',geometry:{kind:'sparkle'},place:place(119,58),size:{width:7,height:10,unit:'mm'},style:{fill:'#8DA695',stroke:null}},
 {op:'graphic.add',id:'title-marks',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:4},{x:3,y:0},{x:5,y:4}]},place:place(29,39,-25),style:{stroke:'#B98C60',strokeWidthMm:.7,penStyle:'pressure'}},
 {op:'text.add',id:'mid-title',content:'先留下，再慢慢改',place:place(68,122,-3),size:{width:100,unit:'mm'},style:{fontSizePt:17,fontPreset:'hand',color:'#AA7958',textAlign:'center',outline:{color:'#F8F4EA',widthMm:.3}}},
 {op:'graphic.add',id:'mid-line',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0},{x:12,y:.8},{x:25,y:-.4},{x:55,y:0}]},place:{reference:'node:mid-title',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,1],unit:'mm'},behavior:'linked'},style:{stroke:'#8DA695',strokeWidthMm:.55,penStyle:'pressure'}},
 {op:'material.cut',target:'paper',mode:'remove',region:{shape:'edge',edge:'left',amount:2,space:'source',unit:'mm'}},
 {op:'text.add',id:'paper-number',content:'02',place:place(22,139,-6),size:{width:10,unit:'mm'},style:{fontSizePt:15,fontPreset:'serif',fontWeight:'bold',color:'#B98C60'}},
 {op:'graphic.add',id:'paper-circle',geometry:{kind:'ellipse'},place:{reference:'node:paper-number',referenceAnchor:'center',behavior:'linked'},size:{reference:'node:paper-number',width:1.2,height:1.05,unit:'ratio',behavior:'linked'},style:{fill:null,stroke:'#B98C60',strokeWidthMm:.4}},
 {op:'layer.duplicate',target:'main-leaf',id:'leaf-small',place:place(72,167,-30)},
 {op:'layer.update',target:'leaf-small',size:{width:13,height:20,unit:'mm'},style:{outline:null,opacity:.8}},
 {op:'graphic.add',id:'leaf-veins',geometry:{kind:'path',viewBox:[0,0,30,40],paths:[{d:'M5 32 L15 25 L13 12 M15 25 L25 24 M10 30 L7 20',style:{fill:null,stroke:'#E9EEE3'}}]},place:place(103,150,26),size:{width:23,height:32,unit:'mm'},style:{fill:null,stroke:'#E9EEE3',strokeWidthMm:.5}},
 {op:'graphic.add',id:'leaf-dots',geometry:{kind:'dots'},place:place(119,170),size:{width:17,height:10,unit:'mm'},style:{fill:'#B98C60',stroke:'#B98C60',strokeWidthMm:.4,opacity:.7}},
 {op:'layer.update',target:'dot-1',style:{stroke:null}},
 {op:'layer.update',target:'dot-2',place:place(132,110),style:{stroke:null}},
 {op:'text.add',id:'closing-note',content:'把好奇留在纸上，把答案交给明天。',place:place(74,197),size:{width:126,unit:'mm'},style:{fontSizePt:9.5,fontPreset:'hand',color:'#6D827C',textAlign:'center'}},
 {op:'material.decision',asset:'m1',choice:'crafted',reason:'裁去窄边后承托随写，纸角编号与圈线连接正文；文字、图形、主叶与细节共同完成整页。'}
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
