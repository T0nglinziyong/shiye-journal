import {PNG} from 'pngjs';

const letters={
  A:['01110','10001','10001','11111','10001','10001','10001'],
  B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'],
  D:['11110','10001','10001','10001','10001','10001','11110']
};
function pixel(image,x,y,rgb){
  const at=(y*image.width+x)*4;
  image.data[at]=rgb[0];image.data[at+1]=rgb[1];image.data[at+2]=rgb[2];image.data[at+3]=255;
}
function color(image,x,y){
  const left=Math.max(0,Math.min(image.width-1,Math.floor(x))),top=Math.max(0,Math.min(image.height-1,Math.floor(y))),
    right=Math.min(image.width-1,left+1),bottom=Math.min(image.height-1,top+1),
    fx=Math.max(0,Math.min(1,x-left)),fy=Math.max(0,Math.min(1,y-top));
  const channel=(px,py,index)=>{
    const at=(py*image.width+px)*4,alpha=image.data[at+3]/255;
    return image.data[at+index]*alpha+255*(1-alpha);
  };
  return [0,1,2].map(index=>Math.round(
    (channel(left,top,index)*(1-fx)+channel(right,top,index)*fx)*(1-fy)+
    (channel(left,bottom,index)*(1-fx)+channel(right,bottom,index)*fx)*fy));
}
function panel(source,target,x,y,rotation){
  const swapped=rotation===90||rotation===270,
    width=swapped?source.height:source.width,height=swapped?source.width:source.height,
    scale=Math.min(352/width,352/height),drawWidth=Math.round(width*scale),drawHeight=Math.round(height*scale),
    left=x+Math.floor((352-drawWidth)/2),top=y+Math.floor((352-drawHeight)/2);
  for(let row=0;row<drawHeight;row++)for(let col=0;col<drawWidth;col++){
    const rx=(col+.5)/scale-.5,ry=(row+.5)/scale-.5;
    const sx=rotation===270?source.width-1-ry:rotation===90?ry:rotation===180?source.width-1-rx:rx,
      sy=rotation===270?rx:rotation===90?source.height-1-rx:rotation===180?source.height-1-ry:ry;
    pixel(target,left+col,top+row,color(source,sx,sy));
  }
}
function letter(image,value,x,y){
  letters[value].forEach((row,dy)=>[...row].forEach((dot,dx)=>{
    if(dot==='1')for(let yy=0;yy<4;yy++)for(let xx=0;xx<4;xx++)
      pixel(image,x+dx*4+xx,y+dy*4+yy,[30,40,30]);
  }));
}
export async function orientationSheet(imageURL){
  const match=/^data:image\/png;base64,(.+)$/s.exec(imageURL||'');
  if(!match)return null;
  const bytes=Buffer.from(match[1],'base64');
  if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
    bytes.toString('ascii',12,16)!=='IHDR')return null;
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(!width||!height||width*height>16_000_000)return null;
  const source=PNG.sync.read(bytes);
  const sheet=new PNG({width:760,height:800});sheet.data.fill(255);
  for(const [index,rotation] of [0,270,90,180].entries()){
    const x=14+(index%2)*380,y=44+Math.floor(index/2)*400;
    panel(source,sheet,x,y,rotation);
    letter(sheet,'ABCD'[index],x+4,y-36);
  }
  return 'data:image/png;base64,'+PNG.sync.write(sheet).toString('base64');
}
