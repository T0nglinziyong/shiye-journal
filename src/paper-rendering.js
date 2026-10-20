export const bundledExampleRuling={rowPositions:[49.3016,67.037,84.7724,102.5087,120.244,137.9794,155.7148,173.4511,191.1864,208.9218,226.6581,244.3935,262.1288,279.8642,297.6005,315.3358,333.0712,350.8075,368.5429,386.2782,404.0136,421.7499,439.4853,457.2206,474.9569,492.6923,510.4276,528.163,545.8993].map(y=>y/595.2760009765625),spans:[{from:29.15999984741211/841.8900146484375,to:414.78302001953125/841.8900146484375},{from:426.39898681640625/841.8900146484375,to:812.72998046875/841.8900146484375}],color:'#d0d2d3',relativeLineWidth:.353/595.2760009765625};
export function paperColumnPositions(pageMode='single'){
  const perPage=[.08,.48,.52,.92];
  return pageMode==='spread'?[0,.5].flatMap(offset=>perPage.map(x=>offset+x*.5)):perPage;
}
export function drawPaper(ctx,d){const {width:w,height:h}=d.canvas;ctx.save();ctx.fillStyle=d.paperColor||'#fcfaf0';ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(0,0,0,.12)';ctx.lineWidth=1;const segment=(x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
  if(d.paperPattern==='lines'&&d.paperRuling?.rowPositions){const r=d.paperRuling;ctx.strokeStyle=r.color;ctx.lineWidth=r.relativeLineWidth*h;for(const y of r.rowPositions)for(const s of r.spans)segment(s.from*w,y*h,s.to*w,y*h);}
  else if(d.paperPattern==='dots'){ctx.fillStyle='rgba(0,0,0,.13)';for(let y=42;y<h-42;y+=42)for(let x=42;x<w-42;x+=42){ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill();}}
  else if(['lines','grid'].includes(d.paperPattern)){for(let row=1;row<Math.floor(h/40);row++)segment(0,row*40,w,row*40);if(d.paperPattern==='grid')for(let col=1;col<Math.floor(w/40);col++)segment(col*40,0,col*40,h);}
  if(d.paperColumns===true||d.paperPattern==='columns')for(const x of paperColumnPositions(d.pageMode))segment(w*x,h*.1,w*x,h*.9);
  if(d.pageMode==='spread'&&d.drawCenterGutter!==false){ctx.fillStyle='rgba(0,0,0,.1)';ctx.fillRect(w/2-1,0,2,h);}ctx.restore();
}
