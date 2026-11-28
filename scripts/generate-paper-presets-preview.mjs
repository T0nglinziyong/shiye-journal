import{createCanvas,loadImage}from'canvas';import{writeFile}from'node:fs/promises';
import{shapeThumbnailSVG}from'../src/editor-tools-model.js';
const dest=process.argv[2];if(!dest)throw Error('需要输出 PNG 路径');
const samples=[['本白纤维纸','#F7F5EF','plain',false,0],['米白撕边纸','#F3EBDD','plain',true,0],['牛皮纸','#BA946B','plain',false,0],['灰蓝横线纸','#DDE8EB','ruled',true,0],['淡粉方格纸','#F2E2E1','grid',false,0],['米白点阵纸','#F5F1E7','dots',true,0],['半透明薄纸','#F8F5ED','plain',false,.5],['半透明横线纸','#F8F5ED','ruled',true,.5]];
const canvas=createCanvas(1120,700),ctx=canvas.getContext('2d');ctx.fillStyle='#ECEBE6';ctx.fillRect(0,0,1120,700);
for(let i=0;i<samples.length;i++){
 const[label,fill,pattern,torn,translucency]=samples[i],x=20+(i%4)*280,y=20+Math.floor(i/4)*330;
 ctx.fillStyle='#D1B18D';ctx.fillRect(x+12,y+35,120,250);ctx.fillStyle='#8FA8B2';ctx.fillRect(x+132,y+35,120,250);
 ctx.fillStyle='#46616A';ctx.font='18px sans-serif';ctx.fillText('UNDER / 下层色块',x+26,y+175);
 const node={type:'shape',id:'paper-'+i,kind:'paper',width:230,height:245,fill,stroke:'#7D929D',lineWidth:.6,shapeOptions:{paperPattern:pattern,grain:.8,torn,rows:12,columns:10,translucency}};
 ctx.drawImage(await loadImage(Buffer.from(shapeThumbnailSVG(node))),x+15,y+36,230,245);
 ctx.fillStyle='#344747';ctx.font='19px sans-serif';ctx.fillText(label,x+15,y+310);
}
await writeFile(dest,canvas.toBuffer('image/png'));console.log(dest);
