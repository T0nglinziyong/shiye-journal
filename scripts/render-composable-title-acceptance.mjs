import {writeFile} from 'node:fs/promises';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {loadOfflineCanvas,renderOfflinePNG} from '../src/offline-node-preview.mjs';
import {compileTechnique} from '../src/creation-library/techniques.js';

const cases=[
 ['拆字夹小字','人生的意义',{fontFamily:'BaiLuBangBang',fontSizePt:34,colors:['#C63B85','#ED7A82','#FFFDF6'],glyph:{split:{middleText:'RENSHENG DE YIYI',middleColor:'#273B34',gapMm:5,waveMm:1.1}},style:{shadow:{color:'#F2A470',offsetMm:[.65,.75],blurMm:0}}}],
 ['热狗笔画与音符','听歌',{fontFamily:'BaiLuBangBang',fontSizePt:37,colors:['#1D3B70','#3F9CAA','#FFFDF6'],glyph:{strokes:[{index:0,kind:'hotdog',box:[.38,.13,.18,.7]}]},accents:[{kind:'notes',placement:'upper-right',color:'#3F9CAA',count:3,sizeMm:2.6}]}],
 ['倒三角笔画','心动',{fontFamily:'BaiLuBangBang',fontSizePt:37,colors:['#203B70','#E0B358','#FFFDF6'],glyph:{strokes:[{index:0,kind:'triangle',box:[.38,.17,.19,.68]}]},backgrounds:[{kind:'squares',color:'#E7C86E',diameterMm:2.4,gapMm:3.5}]}],
 ['数字半圆影与包围线','2026.10.14',{fontFamily:'WoAiWanWeiWei',fontSizePt:31,colors:['#9A665E','#E2C54E','#FFFDF6'],glyph:{numberShadow:{color:'#E2C54E',diameterMm:2.4}},backgrounds:[{kind:'enclosure',color:'#E2C54E',paddingMm:3}],accents:[{kind:'spark',placement:'corners',color:'#E2C54E',sizeMm:2.2,count:4}]}],
 ['连写字与分离圆点','Daily',{fontFamily:'WoAiWanWeiWei',fontSizePt:39,colors:['#1C2437','#E2AC42','#FFFDF6'],backgrounds:[{kind:'dots',color:'#E2AC42',diameterMm:3,gapMm:4}]}],
 ['反白色块与角落星芒','心理时间',{fontFamily:'BaiLuBangBang',fontSizePt:31,colors:['#F7F4DD','#2E5734','#FFFDF6'],backgrounds:[{kind:'reverse',color:'#2E5734',paddingMm:3}],accents:[{kind:'spark',placement:'corners',color:'#E7C65E',sizeMm:2.2,count:4}]}],
 ['圆与方块散点','慢慢发生',{fontFamily:'BaiLuBangBang',fontSizePt:35,colors:['#214C55','#E6B84A','#FFFDF6'],backgrounds:[{kind:'mixed',diameterMm:3.2,gapMm:2.8,colors:['#E6B84A','#8CB9AB','#E59A72']}]}],
 ['整片横线背景','记录生活',{fontFamily:'BaiLuBangBang',fontSizePt:35,colors:['#2C5062','#D6928C','#FFFDF6'],backgrounds:[{kind:'lines',count:6,color:'#D6928C',strokeWidthMm:.65,paddingMm:2}]}],
 ['整片井字背景','四月的风',{fontFamily:'BaiLuBangBang',fontSizePt:35,colors:['#42517A','#D8B989','#FFFDF6'],backgrounds:[{kind:'hashes',count:4,color:'#D8B989',strokeWidthMm:.46,paddingMm:2}]}]
];
const canvas=await loadOfflineCanvas(),sheet=canvas.createCanvas(1200,1500),ctx=sheet.getContext('2d');
ctx.fillStyle='#E7E7E1';ctx.fillRect(0,0,1200,1500);
for(const [index,[label,title,extra]] of cases.entries()){
 const page=draft({ratio:'a5'}),doc=await createCreationDocument({draft:page,assets:[]});
 const compiled=compileTechnique({methodId:'title-composed',parameters:{id:'compose-'+index,text:title,at:[72,88],widthMm:110,...extra}});
 const done=applyCreationTransaction(doc,{protocolVersion:2,transactionId:'compose-'+index,baseSceneRevision:creationSceneRevision(doc),operations:compiled.operations},[]).document;
 const {png}=await renderOfflinePNG(done.page,done.source,{},canvas),image=await canvas.loadImage(png);
 const x=index%2*600,y=Math.floor(index/2)*300;
 ctx.fillStyle='#FFFDF6';ctx.fillRect(x+10,y+10,580,280);
 const probe=canvas.createCanvas(image.width,image.height),pc=probe.getContext('2d');pc.drawImage(image,0,0);
 const pixels=pc.getImageData(0,0,image.width,image.height).data,bg=pixels.slice(0,3);let left=image.width,top=image.height,right=0,bottom=0;
 for(let py=0;py<image.height;py++)for(let px=0;px<image.width;px++){
  const off=(py*image.width+px)*4;
  if(Math.abs(pixels[off]-bg[0])+Math.abs(pixels[off+1]-bg[1])+Math.abs(pixels[off+2]-bg[2])<70)continue;
  left=Math.min(left,px);top=Math.min(top,py);right=Math.max(right,px);bottom=Math.max(bottom,py);
 }
 if(right<=left||bottom<=top)throw Error('标题没有可见内容：'+label);
 const pad=25,cropX=Math.max(0,left-pad),cropY=Math.max(0,top-pad),cropW=Math.min(image.width,right+pad)-cropX,cropH=Math.min(image.height,bottom+pad)-cropY;
 const scale=Math.min(532/cropW,190/cropH),tw=cropW*scale,th=cropH*scale;
 ctx.drawImage(image,cropX,cropY,cropW,cropH,x+300-tw/2,y+162-th/2,tw,th);
 ctx.fillStyle='#425448';ctx.font='18px sans-serif';ctx.fillText(label,x+28,y+35);
 console.log(label,compiled.report.widthMm,compiled.report.heightMm,compiled.operations[0].children.length);
}
const out=process.argv[2]||'/tmp/shiye-composable-title-acceptance.png';
await writeFile(out,sheet.toBuffer('image/png'));console.log(out);
