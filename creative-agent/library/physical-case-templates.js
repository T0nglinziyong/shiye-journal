import {matchCaseStructures,planSlotProcessing} from './case-slot-matcher.js';

const REFERENCE=[630,900],PAGE=[110,157];
const point=([x,y])=>[x*PAGE[0]/REFERENCE[0],y*PAGE[1]/REFERENCE[1]];
const box=([x0,y0,x1,y1])=>({center:point([(x0+x1)/2,(y0+y1)/2]),width:(x1-x0)*PAGE[0]/REFERENCE[0],height:(y1-y0)*PAGE[1]/REFERENCE[1]});
const place=(b,rotationDeg=0)=>({reference:'page',at:box(b).center,unit:'mm',rotationDeg});
const size=b=>({width:box(b).width,height:box(b).height,unit:'mm'});
const paper=(id,b,fill,extra={})=>({op:'paper.add',id,place:place(b,extra.rotation||0),size:size(b),style:{fill},texture:extra.texture||'subtle',...(extra.edge?{edge:extra.edge}:{})});
const text=(id,content,xy,widthPx,fontSizePt,color,fontFamily='Ma Shan Zheng',extra={})=>({op:'text.add',id,content,place:{reference:'page',at:point(xy),unit:'mm',anchor:'top-left'},size:{width:widthPx*PAGE[0]/REFERENCE[0],unit:'mm'},style:{fontFamily,fontSizePt,color,lineHeight:1.12,...extra}});
const graphic=(id,kind,b,fill,stroke=null,strokeWidthMm=.4)=>({op:'graphic.add',id,geometry:{kind},place:place(b),size:size(b),style:{fill,stroke,strokeWidthMm}});

export function placeVisibleCenter(asset,b,rotationDeg=0){
 const base=place(b,rotationDeg),bounds=asset.opaqueBoundsRatio;
 if(!Array.isArray(bounds)||bounds.length!==4||bounds.some(v=>!Number.isFinite(v)||v<0||v>1)||bounds[2]<=bounds[0]||bounds[3]<=bounds[1])return base;
 const dx=((bounds[0]+bounds[2])/2-.5)*asset.physicalWidthMM;
 const dy=((bounds[1]+bounds[3])/2-.5)*asset.physicalHeightMM;
 const angle=rotationDeg*Math.PI/180;
 return {...base,at:[base.at[0]-dx*Math.cos(angle)+dy*Math.sin(angle),base.at[1]-dx*Math.sin(angle)-dy*Math.cos(angle)]};
}

function matching(assets,role,preferredAlias){
 if(preferredAlias)return assets.find(a=>(a.alias||a.id)===preferredAlias)||null;
 const ranked=matchCaseStructures(assets).find(x=>x.id==='D146');
 return assets.find(a=>(a.alias||a.id)===ranked?.bindings?.[role])||null;
}
function numberAsset(assets,value,used){
 return assets.find(a=>!used.has(a.alias||a.id)&&String(a.numberValue??a.digit??'')===value)
  ||assets.find(a=>!used.has(a.alias||a.id)&&new RegExp(`(?:^|[^0-9])${value}(?:[^0-9]|$)`).test(a.originalFilename||a.title||'')&&/digit|number|numeral|数字/i.test(a.originalFilename||a.title||''));
}

/** Deterministic D146 layout. It uses only the selected materials and editable
 * canvas operations; no reference pixels, model output or prompt is required. */
export function compilePhysicalCase({templateId='D146',assets=[],bindings={},texts={},palette={}}={}){
 if(templateId!=='D146')throw new Error(`未实现的确定性案例函数：${templateId}`);
 if(!Array.isArray(assets))throw new TypeError('assets must be an array');
 const colors={page:'#F3F0E8',dark:'#24334A',warm:'#EAC65E',cream:'#F5F2E7',blue:'#D7DAE4',ink:'#25313D',...palette};
 const chosen={backing:matching(assets,'backing',bindings.backing),label:matching(assets,'label',bindings.label),accent:matching(assets,'accent',bindings.accent)};
 const operations=[{op:'page.update',paperColor:colors.page},
  paper('dark-underlay',[87,43,529,854],colors.dark,{texture:'medium',rotation:-1}),
  paper('warm-corner',[357,91,574,247],colors.warm,{texture:'medium',rotation:4})];
 const used=new Set(),warnings=[];
 if(chosen.backing){
  const asset=chosen.backing,alias=asset.alias||asset.id;
  const fit=planSlotProcessing(asset,{widthMm:75,heightMm:113},'backing');
  if(fit.method==='crop')operations.push({op:'material.split',asset:alias,pieces:[{id:'case-backing',region:fit.region,place:place([103,140,506,761],-3)}]});
  else operations.push({op:'material.add',id:'case-backing',asset:alias,place:placeVisibleCenter(asset,[103,140,506,761],-3)});
  used.add(alias);
 }else operations.push(paper('case-backing',[103,140,506,761],colors.blue,{texture:'medium',rotation:-3}));
 operations.push(paper('cream-center',[145,242,460,621],colors.cream,{texture:'medium',rotation:2,edge:{style:'torn',edges:['bottom'],depthMm:.45}}));
 operations.push(paper('lower-speckle',[81,620,336,765],colors.blue,{texture:'subtle',rotation:-8}));
 if(chosen.label){const a=chosen.label,alias=a.alias||a.id;
  if(a.physicalWidthMM<=29&&a.physicalHeightMM<=31){operations.push({op:'material.add',id:'case-label',asset:alias,place:placeVisibleCenter(a,[441,646,578,799],4)});used.add(alias);}
  else warnings.push(`标签 ${alias} 尺寸大于槽位，已留空`);
 }
 if(chosen.accent){const a=chosen.accent,alias=a.alias||a.id;
  if(a.physicalWidthMM<=50&&a.physicalHeightMM<=20){operations.push({op:'material.add',id:'case-accent',asset:alias,place:placeVisibleCenter(a,[84,749,324,836],-2)});used.add(alias);}
  else warnings.push(`连接素材 ${alias} 尺寸大于槽位，已留空`);
 }
 operations.push(text('case-heading',texts.title??'散步日记',[151,266],245,20,colors.dark));
 const numerals=[['1',[405,167,490,300],[405,167],85],['4',[133,633,228,773],[133,633],95]];
 for(const [digit,b,xy,width] of numerals){
  const a=numberAsset(assets,digit,used);
  if(a){const alias=a.alias||a.id;const max=box(b);
   if(a.physicalWidthMM<=max.width*1.2&&a.physicalHeightMM<=max.height*1.2){operations.push({op:'material.add',id:`case-number-${digit}`,asset:alias,place:placeVisibleCenter(a,b)});used.add(alias);continue;}
   warnings.push(`数字素材 ${alias} 尺寸大于数字槽，改用可编辑文字`);
  }
  operations.push(text(`case-number-${digit}`,digit,xy,width,digit==='1'?58:57,digit==='1'?colors.warm:colors.cream,'Otsutome',{outline:{color:colors.dark,widthMm:.65},widthScale:digit==='1'?.72:.78}));
 }
 operations.push(text('case-body',texts.body??'今天想把脚步放慢一点。\n绕过熟悉的街角，\n看见小店门前新开的花。\n\n收集一片好天气，\n也收集一点好心情。',[171,328],260,11,colors.ink));
 operations.push(text('case-date',texts.date??'NOV  /  27',[104,786],203,10,colors.dark,'sans-serif'));
 for(const [id,x,y,r,fill] of [['a',111,192,11,colors.warm],['b',486,448,8,'#EAA351'],['c',347,694,9,colors.warm]])operations.push(graphic(`case-dot-${id}`,'ellipse',[x-r,y-r,x+r,y+r],fill));
 operations.push(graphic('case-top-star','star',[89,113,123,147],colors.cream,colors.dark));
 operations.push(graphic('case-bottom-star','star',[356,724,392,760],colors.warm,colors.dark));
 return {templateId,operations,report:{used:[...used],unused:assets.map(a=>a.alias||a.id).filter(x=>!used.has(x)),warnings,editable:true,modelCalls:0,referenceImagesUsed:0}};
}
