import {writeFile} from 'node:fs/promises';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {loadOfflineCanvas,renderOfflinePNG} from '../src/offline-node-preview.mjs';
import {compileTechnique} from '../src/creation-library/techniques.js';

const cases=[
 ['title-cross-shadow','晴天散步计划',{caption:'SUNDAY WALK',fontFamily:'BaiLuBangBang'}],
 ['title-scattered-round','慢慢收集好心情',{runs:[{text:'慢慢',role:'primary'},{text:'收集',role:'secondary',breakBefore:true},{text:'好心情',role:'primary'}],fontFamily:'BaiLuBangBang'}],
 ['title-gap-shadow','去看春天的颜色',{fontFamily:'BaiLuBangBang',colors:['#244D47','#D39368','#FFFDF6']}],
 ['title-paper-lettering','写下今天的小小发现',{fontFamily:'BaiLuBangBang'}],
 ['title-gradient-outline','把日常收好',{fontFamily:'BaiLuBangBang'}],
 ['title-script-dots','Daily',{fontFamily:'WoAiWanWeiWei',fontSizePt:34,widthMm:80}],
 ['title-scattered-triangle','星光慢慢亮',{fontFamily:'BaiLuBangBang',runs:[{text:'星光',role:'primary'},{text:'慢慢亮',role:'secondary',breakBefore:true}]}],
 ['title-number-route','2026·秋日',{fontFamily:'BaiLuBangBang',runs:[{text:'2026',role:'primary',rotationDeg:-4},{text:'·秋日',role:'secondary',rotationDeg:2}]}],
 ['title-outline','这一刻的风景',{fontFamily:'BaiLuBangBang',colors:['#315D55','#D39368','#FFFDF6']}],
 ['title-offset-outline','日常的闪光',{fontFamily:'BaiLuBangBang',colors:['#315D55','#D39368','#FFFDF6']}],
 ['title-block-lettering','喜欢这样的日子',{fontFamily:'BaiLuBangBang',fontSizePt:26,widthMm:105,backdrop:{kind:'squares',densityMm:5,diameterMm:9,patternColor:'#E9AF76',opacity:.85}}],
 ['title-outline-block-ring','喜欢薄荷',{fontFamily:'BaiLuBangBang',fontSizePt:26,widthMm:74,colors:['#A7D9DE','#D08371','#20272B'],runs:[{text:'喜欢',role:'normal',backdrop:{kind:'squares',strokeOnly:true,strokeWidthMm:.85,diameterMm:11,patternColor:'#2869A5',opacity:1}},{text:'薄荷',role:'normal',breakBefore:true,offsetMm:[13,0],backdrop:{kind:'ring',diameterMm:17,strokeWidthMm:.7,patternColor:'#D08371',opacity:1}}]}],
 ['title-label','把风留在纸上',{fontFamily:'WoAiWanWeiWei',fontSizePt:29,widthMm:115,style:{color:'#FFF8EB'},backdrop:{kind:'band',color:'#42665F',paddingMm:7,opacity:1}}],
 ['title-label','一段闪闪发光的周末',{fontFamily:'BaiLuBangBang',fontSizePt:23,widthMm:105,backdrop:{kind:'mixed',densityMm:5,diameterMm:8,patternColor:'#E7BD75',opacity:.82}}],
 ['title-script-dots','ordinary day',{fontFamily:'WoAiWanWeiWei',fontSizePt:29,widthMm:105,backdrop:{kind:'dots',densityMm:4,diameterMm:7,patternColor:'#E8B943',opacity:.9}}]
];
const selectedCases=process.argv.includes('--backgrounds')?cases.filter((_,i)=>[3,5,10,11,12,13,14].includes(i)):cases;
const canvas=await loadOfflineCanvas(),sheet=canvas.createCanvas(1200,Math.ceil(selectedCases.length/2)*300),ctx=sheet.getContext('2d');
ctx.fillStyle='#E8E8E2';ctx.fillRect(0,0,sheet.width,sheet.height);
for(const [index,[methodId,title,extra]] of selectedCases.entries()){
 const page=draft({ratio:'a5'});if(methodId==='title-outline-block-ring')page.paperColor='#20272B';
 const document=await createCreationDocument({draft:page,assets:[]});
 const parameters={id:'accept-'+index,text:title,at:[72,88],widthMm:120,...extra};
 const compiled=compileTechnique({methodId,parameters,materials:[]});
 const done=applyCreationTransaction(document,{protocolVersion:2,transactionId:'accept-'+index,baseSceneRevision:creationSceneRevision(document),operations:compiled.operations},[]).document;
 const {png}=await renderOfflinePNG(done.page,done.source,{},canvas),image=await canvas.loadImage(png);
 const x=index%2*600,y=Math.floor(index/2)*300;
 ctx.fillStyle='#FFFDF6';ctx.fillRect(x+10,y+10,580,280);
 const probe=canvas.createCanvas(image.width,image.height),probeContext=probe.getContext('2d');probeContext.drawImage(image,0,0);
 const data=probeContext.getImageData(0,0,image.width,image.height).data,background=data.slice(0,3);
 let left=image.width,top=image.height,right=0,bottom=0;
 for(let py=0;py<image.height;py++)for(let px=0;px<image.width;px++){
  const offset=(py*image.width+px)*4;
  if(Math.abs(data[offset]-background[0])+Math.abs(data[offset+1]-background[1])+Math.abs(data[offset+2]-background[2])<70)continue;
  left=Math.min(left,px);top=Math.min(top,py);right=Math.max(right,px);bottom=Math.max(bottom,py);
 }
 if(right<=left||bottom<=top)throw Error('标题没有可见像素：'+methodId);
 const pad=25,cropX=Math.max(0,left-pad),cropY=Math.max(0,top-pad),cropW=Math.min(image.width,right+pad)-cropX,cropH=Math.min(image.height,bottom+pad)-cropY;
 const scale=Math.min(550/cropW,210/cropH),targetW=cropW*scale,targetH=cropH*scale;
 ctx.drawImage(image,cropX,cropY,cropW,cropH,x+300-targetW/2,y+166-targetH/2,targetW,targetH);
 ctx.fillStyle='#4A594B';ctx.font='18px sans-serif';ctx.fillText(methodId,x+28,y+32);
 console.log(methodId,compiled.report.widthMm,compiled.report.heightMm);
}
const path=process.argv[2]||'/tmp/shiye-title-tutorial-acceptance.png';
await writeFile(path,sheet.toBuffer('image/png'));
console.log(path);
