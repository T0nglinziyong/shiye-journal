const round=value=>Math.round(value*1000)/1000;

export function templatePageFit(sourcePageMm,targetPageMm,pageMode){
 const [sourceWidth,sourceHeight]=sourcePageMm,[targetWidth,targetHeight]=targetPageMm;
 if(![sourceWidth,sourceHeight,targetWidth,targetHeight].every(value=>Number.isFinite(value)&&value>0))
  throw new RangeError('模板和目标页面都需要有效的毫米尺寸');
 const leaves=pageMode==='spread'?2:1;
 const sourceLeafWidth=sourceWidth/leaves,targetLeafWidth=targetWidth/leaves;
 const scale=Math.min(targetLeafWidth/sourceLeafWidth,targetHeight/sourceHeight);
 return {scale,offsetX:(targetLeafWidth-sourceLeafWidth*scale)/2,
  offsetY:(targetHeight-sourceHeight*scale)/2,sourcePageMm,targetPageMm,pageMode};
}

export function matchingProfileOnTemplatePage(asset,fit){
 if(Math.abs(fit.scale-1)<.00001)return asset;
 return {...asset,physicalWidthMM:asset.physicalWidthMM/fit.scale,
  physicalHeightMM:asset.physicalHeightMM/fit.scale};
}

function scalePhysicalStyle(value,scale){
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,
  typeof item==='number'&&/(?:Mm|Pt)$/.test(key)?round(item*scale):
  item&&typeof item==='object'&&!Array.isArray(item)?scalePhysicalStyle(item,scale):item]));
}

function fitPlace(place,fit){
 if(!place||place.unit!=='mm'||!['page','page.left','page.right'].includes(place.reference)||!Array.isArray(place.at))return place;
 return {...place,at:[round(fit.offsetX+place.at[0]*fit.scale),
  round(fit.offsetY+place.at[1]*fit.scale)]};
}

export function fitTemplateOperations(operations,fit){
 if(Math.abs(fit.scale-1)<.00001&&Math.abs(fit.offsetX)<.00001&&Math.abs(fit.offsetY)<.00001)return operations;
 return operations.map(source=>{
  const op=structuredClone(source);
  if(op.place)op.place=fitPlace(op.place,fit);
  if(op.pieces)op.pieces=op.pieces.map(piece=>({...piece,place:fitPlace(piece.place,fit)}));
  if(op.size&&op.size.unit==='mm'&&!op.op.startsWith('material.')){
   for(const key of ['width','height'])if(Number.isFinite(op.size[key]))op.size[key]=round(op.size[key]*fit.scale);
  }
  if(op.style)op.style=scalePhysicalStyle(op.style,fit.scale);
  if(op.edge)op.edge=scalePhysicalStyle(op.edge,fit.scale);
  if(op.fit)op.fit=scalePhysicalStyle(op.fit,fit.scale);
  return op;
 });
}
