import {PNG} from 'pngjs';

// A compact pixel measurement for the rendered page. It measures ink/color
// against the paper at the upper corners, not occupied layer frames. It is a
// prompt for visual review, never a score or an automatic layout decision.
export function analyzeCreationVisualBalance(imageURL,pageMode='spread',visualSample=null){
  let png;
  if(imageURL?.startsWith('data:image/png;base64,')){
    try{png=PNG.sync.read(Buffer.from(imageURL.slice('data:image/png;base64,'.length),'base64'));}
    catch{return null;}
  }else if(visualSample){
    const sample=Buffer.from(visualSample,'base64');
    if(sample.length!==32*32*3)return null;
    const data=Buffer.alloc(32*32*4);
    for(let i=0,j=0;i<sample.length;i+=3){data[j++]=sample[i];data[j++]=sample[i+1];data[j++]=sample[i+2];data[j++]=255;}
    png={width:32,height:32,data};
  }else return null;
  const {width,height,data}=png,leafCount=pageMode==='spread'?2:1;
  if(width<24||height<24)return null;
  const corner=(x,y)=>{const i=(y*width+x)*4;return [data[i],data[i+1],data[i+2]];};
  const corners=[corner(2,2),corner(width-3,2),corner(2,height-3),corner(width-3,height-3)];
  const paper=[0,1,2].map(channel=>corners.map(color=>color[channel]).sort((a,b)=>a-b)[2]);
  const leaves=Array.from({length:leafCount},()=>({mass:0,xMass:0,yMass:0,bands:[0,0,0]}));
  const step=Math.max(1,Math.round(Math.min(width,height)/450));
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){
    const i=(y*width+x)*4,alpha=data[i+3]/255;
    const delta=Math.max(Math.abs(data[i]-paper[0]),Math.abs(data[i+1]-paper[1]),Math.abs(data[i+2]-paper[2]));
    const weight=Math.max(0,(delta-22)/233)*alpha;
    if(weight<=.03)continue;
    const leaf=Math.min(leafCount-1,Math.floor(x/(width/leafCount))),localX=(x-leaf*width/leafCount)/(width/leafCount);
    const row=leaves[leaf];row.mass+=weight;row.xMass+=weight*localX;row.yMass+=weight*y/height;row.bands[Math.min(2,Math.floor(y/height*3))]+=weight;
  }
  const total=leaves.reduce((sum,row)=>sum+row.mass,0);
  const round=n=>Number(n.toFixed(2));
  const result=leaves.map((row,index)=>({page:leafCount===1?'page':index?'page.right':'page.left',share:total?round(row.mass/total):0,verticalCenter:row.mass?round(row.yMass/row.mass):null,verticalBands:row.mass?row.bands.map(value=>round(value/row.mass)):[0,0,0],horizontalCenter:row.mass?round(row.xMass/row.mass):null}));
  const spreadCenter=total?round(leaves.reduce((sum,row,index)=>sum+(index+row.xMass/(row.mass||1))*row.mass/leafCount,0)/total):null;
  const notes=[];
  if(leafCount===2&&Math.min(...result.map(row=>row.share))<.38&&total>20)notes.push('两页可不对称，但当前有色视觉重量差较大；缩小看是否能用文字、叠层或局部色彩回应较轻的一页。');
  if(leafCount===2&&spreadCenter!=null&&Math.abs(spreadCenter-.5)>.1&&total>20)notes.push('全幅有色视觉重心偏向一侧；检查另一页是否需要更靠外的文字或素材簇来回应。');
  if(leafCount===2&&result.every(row=>row.verticalCenter!=null)&&Math.abs(result[0].verticalCenter-result[1].verticalCenter)>.22)notes.push('左右页的上下视觉落点相距较远；检查是否形成有意的对角节奏。');
  for(const row of result)if(row.verticalBands[2]<.1&&row.verticalBands[0]>.6)notes.push(row.page+'下方几乎没有可见图文而上方很重；检查是否是未完成的大空洞。');
  return {method:'rendered-pixel-paper-contrast',spreadCenter, pages:result,notes};
}
