import {layoutSpreads,LAYOUT_LEAF_MM} from './three-layout-spreads.js';
import {solveTemplateAssignments} from './unified-template-matcher.js';
import {withoutSplitAssignments,applyTemplateSplitPlan} from './template-split-compiler.js';
import {visibleCropRegion} from './template-crop-region.js';
export {LAYOUT_LEAF_MM} from './three-layout-spreads.js';

const templates=new Map(layoutSpreads.map(t=>[t.id,t]));
const round=n=>Math.round(n*100)/100;
const rectMm=([x0,y0,x1,y1])=>[(x1-x0)*1.25,(y1-y0)*1.76];
const centerMm=([x0,y0,x1,y1])=>[(x0+x1)*.625,(y0+y1)*.88];
const materialKinds={photo:['photo'],paper:['writing-card','plain-paper','pattern-paper'],strip:['strip','tape'],sticker:['figure','accent','sticker','tape']};
const copy={
 'XHS-满满当当':{title:'Childhood',body:'把今天的细节记在纸上。',micro:'A LITTLE DAY',bySlot:{'L-upper-title-second':'neglect','L-upper-writing':'午后翻开旧书，\n偶然看到有趣的一页。\n那时的想法和现在\n已经有点不一样。\n我把它认真记下来，\n也记住今天的光。\n窗边的声音很轻，\n杯子还留着温度。\n这一段小小的时间，\n后来也会被想起。','L-lower-writing':'走进熟悉的小店，\n桌边的杯子还温热。\n窗外有人经过，\n我突然想起那段路。\n许多不起眼的片刻，\n后来都变成故事。\n回家的路上想起\n刚刚说过的几句话，\n于是翻开本子，\n把它们一起留下。','R-upper-writing':'在照片里看见\n一张熟悉的桌子，\n还有停在窗边的光。\n想把这份心情\n留在今天的纸上。\n也许过一阵再看，\n仍会想起当时的风，\n与那天轻松的笑。','R-lower-writing':'路过街角的时候，\n风带来一点甜味。\n平常的小事也很好。\n把它慢慢写下来，\n这一页便有了重量。\n黄昏落在窗边，\n我想再走一段路。\n有些故事不必很大，\n小小一格就足够。','L-bottom-caption':'Don’t look back, that time has passed.\nEvery moment is the starting point.','R-bottom-caption':'people are no more\nwhat they used to be','L-mid-strip-text':'QUICK BROWN FOX','R-top-strip-text':'JUMPS OVER THE LAZY DOG','R-middle-word':'Using dismissive body language','R-photo-label':'SWEET DAYS'}},
 'XHS-排版第四弹':{title:'Happiness',body:'把今天见过的光收在纸上。',micro:'APRIL · LITTLE NOTES',bySlot:{'L-upper-writing':'带着喜欢的东西\n走出家门。\n早上的空气清爽。\n路过咖啡店，\n停下来喝一杯。\n几句闲话，\n一些普通声音，\n都值得记下。\n回家时天还亮。','L-lower-writing':'翻到这张照片时，\n才发现午后的颜色\n原来这么温柔。\n远处的屋檐安静，\n近处的花也好看。\n想把那一刻留久一点，\n下次经过还要看看。','R-upper-writing':'在街角遇见一束花。\n坐下来，喝口热饮。\n人们忙着经过，\n我们慢慢说话。\n再平常的一天，\n也有值得留下的光。\n记住鲜亮的颜色，\n也记住那时的心情。','R-lower-writing':'傍晚出门散步，\n走过熟悉的街道，\n买到一点喜欢的东西。\n照片里那一刻\n仿佛还带着温度。\n回到家里翻开本子，\n把今天重新写一遍。\n留给明天的自己\n一段轻松的记忆。','L-upper-title':'Happiness','L-middle-date':'April','L-middle-arrow':'↗','L-lower-card-title':'HOW TO DO\nAPRIL NOTES','L-lower-label-text':'MILK','R-mid-title':'G O   T O   K  S O G','R-mid-strip-text':'Copy','R-upper-label':'Put two more spoonfuls of sugar','R-lower-label':'Love is boundless'}},
 'XHS-海岛排版':{title:'action',body:'风从海边吹来，今天也有新的发现。',micro:'WITH YOU',bySlot:{'L-circle-writing':'阳光落在纸上，\n也落在我们身边。\n想把这一刻留下。','L-mid-writing':'一路走来，遇见\n喜欢的风景。\n停一会儿，再继续。\n街角的店门开着，\n风也慢慢吹过来。','L-lower-writing':'回头再看照片，\n温柔的颜色还在。\n这一页的事情\n都想好好记住。\n下一次经过这里，\n希望能认出那束光。','R-top-writing':'把今天的小事\n一件件写下来。\n有趣的画面、声音，\n还有在路上的心情。\n我们在路上停留，\n看看远处的景色，\n又想起早晨的话。','R-middle-writing':'午后的光很慢，\n风吹过窗边。\n心也安静下来。\n想把这段时间留下。','R-bottom-writing':'傍晚时再翻看，\n片刻仍然清晰。\n愿下次也有新发现。','R-photo-caption':'The trees are lush\nand the flowers bloom.','R-bottom-left-writing':'花和树长好了。\n路上的风很轻。\n这一刻也值得记住。','L-upper-title':'action','L-photo-label':'with you','L-bottom-caption':'Summer brings small discoveries.\nThe road and light stay with us.\nKeep this day close.','R-top-label':'H\nO\nL\nI\nD\nA\nY','R-photo-word':'Bread.','R-middle-date':'0825','R-middle-arrow-one':'➜','R-middle-arrow-two':'➜','R-bottom-label':'keep this day'}}
};
const rolesFor=slot=>materialKinds[slot[2]]||[];
copy['XHS-排版第四弹'].bySlot['L-upper-writing-top']='今日记事\n从这里开始';
copy['XHS-排版第四弹'].bySlot['L-upper-writing']='路过咖啡店，停下来。\n几句闲话，一些声音，\n都值得认真记下。\n回家时天还亮。';
copy['XHS-海岛排版'].bySlot['R-bottom-writing']='傍晚再翻看，\n片刻仍然清晰。\n愿下次也有新发现。';
const sourceId=a=>a.alias||a.id;
const defaultSurfaces={
 'XHS-满满当当':{'L-upper-photo':'#B7A390','L-lower-photo':'#B2A093','R-upper-photo':'#BBA995','R-lower-photo':'#A9B5AF',
  'L-upper-sticker':'#F2EBDD','R-lower-sticker':'#F4F0E7','R-milk-bottle':'#D7ACB4'},
 'XHS-排版第四弹':{'L-upper-photo':'#D4BFA8','L-lower-photo':'#B7A59A','R-upper-photo':'#B8C49C','R-lower-photo':'#B0BE9B',
  'L-upper-sticker':'#D9B5AA','L-lower-sticker':'#90A7BF'},
 'XHS-海岛排版':{'L-upper-photo':'#B7A89B','L-lower-photo':'#988477','R-top-photo':'#AFC3B7',
  'R-middle-photo':'#9DB5A9','R-bottom-sticker':'#C8D8D5'}
};
function addDefaultSurface(operations,templateId,slot,place,width,height){
 const [id,,role]=slot,fill=defaultSurfaces[templateId]?.[id]||'#DED7CA';
 operations.push({op:'paper.add',id,place,size:{width:round(width),height:round(height),unit:'mm'},
  style:{fill},texture:'subtle',pattern:role==='photo'&&/upper|top/.test(id)?'dots':'plain'});
}
function assetSubjects(asset){
 if(Array.isArray(asset.subjectTags))return asset.subjectTags;
 const title=String(asset.title||'');
 const result=[];
 if(/甜品|面包|吐司|蛋糕|咖啡|奶|餐|饮/.test(title))result.push('food-drink');
 if(/建筑|街|楼|房|城市/.test(title))result.push('architecture');
 if(/花|植物|盆栽/.test(title))result.push('flowers');
 if(/草地|户外|自行车|旅行|风景/.test(title))result.push('outdoors');
 if(/拼贴|文具|纸品|胶片/.test(title))result.push('stationery');
 return result;
}
const THREE_SCORE=Object.freeze({size:.55,role:.2,photoRole:.1,subject:.3,motif:.28,minimum:.48});
function candidate(asset,slot){
 const accepted=rolesFor(slot),match=accepted.findIndex(r=>asset.visualRoles?.includes(r));
 if(match<0)return null;
 if(slot[2]==='sticker'&&asset.kind!=='sticker'&&!(asset.kind==='photo'&&asset.shape==='die-cut'))return null;
 const [w,h]=rectMm(slot[3]),aw=Number(asset.physicalWidthMM),ah=Number(asset.physicalHeightMM);
 if(!(aw>0&&ah>0)||aw>LAYOUT_LEAF_MM[0]||ah>LAYOUT_LEAF_MM[1])return null;
 const rw=aw/w,rh=ah/h,kind=slot[2];
 const canCrop=kind==='paper'&&asset.preservation==='repeatable';
 if(kind==='paper'&&Number(asset.writableAreaRatio??0)<.45&&!asset.visualRoles?.includes('pattern-paper'))return null;
 if(kind==='paper'&&(rw<.75||rw>(canCrop?1.6:1.25)||rh<.75||rh>(canCrop?1.6:1.25)))return null;
 if(kind==='strip'){
  // A tape-like asset can be turned across an edge while preserving native size.
  const long=Math.max(aw,ah),short=Math.min(aw,ah);
  const targetLong=Math.max(w,h),targetShort=Math.min(w,h);
  if(long/short<3||long/targetLong<.45||long/targetLong>1.6||short/targetShort<.45||short/targetShort>2)return null;
 }else if(kind==='photo'){
  // The source material keeps its native millimetre dimensions. A larger
  // photograph can fill a measured picture slot through a centred display
  // mask; a smaller photograph must not be enlarged to fake a match.
  if(rw<.98||rh<.98||rw>2.15||rh>2.15)return null;
 }else if(kind==='sticker'){
  if(rw<.35||rw>2.1||rh<.35||rh>2.1)return null;
 }else if(rw<.72||rw>1.3||rh<.72||rh>1.3)return null;
 const [x,y]=centerMm(slot[3]),bounds=asset.visualBoundsRatio||[0,0,1,1];
 const possibleRegion=canCrop?visibleCropRegion(asset,w,h):null;
 const paperRegion=possibleRegion&&possibleRegion.box[2]>=w-.001&&possibleRegion.box[3]>=h-.001&&
  (aw*(bounds[2]-bounds[0])>w*1.08||ah*(bounds[3]-bounds[1])>h*1.08)?possibleRegion:null;
 const at=kind==='photo'||paperRegion?[round(x),round(y)]:[round(x-(bounds[0]+bounds[2]-1)*aw/2),round(y-(bounds[1]+bounds[3]-1)*ah/2)];
 const visibleWidth=kind==='photo'?w:paperRegion?paperRegion.box[2]:aw,
  visibleHeight=kind==='photo'?h:paperRegion?paperRegion.box[3]:ah;
 if(at[0]-visibleWidth/2 < -2||at[0]+visibleWidth/2>LAYOUT_LEAF_MM[0]+2||at[1]-visibleHeight/2 < -2||at[1]+visibleHeight/2>LAYOUT_LEAF_MM[1]+2)return null;
 const fit=Math.exp(-.5*(Math.abs(Math.log(rw))+Math.abs(Math.log(rh))));
 const crop=kind==='photo'?[round(Math.max(0,(1-w/aw)/2)),round(Math.max(0,(1-h/ah)/2)),round(Math.min(1,w/aw)),round(Math.min(1,h/ah))]:null;
 const subject=slot[5]?.subject,subjectMatch=subject?assetSubjects(asset).includes(subject):null;
 const motif=slot[5]?.motif,title=String(asset.title||'');
 const motifFit=motif==='coffee-cup'&&/咖啡|杯|饮|圆形/.test(title)?1:motif==='doodle-animal'&&/猫|熊|动物|蝴蝶|人物/.test(title)?1:motif==='teddy-bear'&&/熊|猫|动物|玩偶/.test(title)?1:motif==='milk-bottle'&&/奶|瓶|饮/.test(title)?1:motif==='doodle-ghost-pair'&&/猫|熊|动物|人物/.test(title)?1:0;
 const motifSubjectMatch=!motif?null:motif==='coffee-cup'?/咖啡|杯|饮/.test(title):motif==='doodle-animal'||motif==='teddy-bear'||motif==='doodle-ghost-pair'?/猫|熊|动物|人物/.test(title):motif==='milk-bottle'?/奶|瓶|饮/.test(title):false;
 return {asset:sourceId(asset),at,rotationDeg:kind==='strip'&&(ah>aw)!==(h>w)?90:0,
  ...(paperRegion?{method:'crop',cropRegion:paperRegion}:{}),...(crop?{crop,visibleMm:[round(w),round(h)]}:{}),
  subjectMatch,motifFit,motifSubjectMatch,score:round(THREE_SCORE.size*fit+THREE_SCORE.role*(1-match*.2)+THREE_SCORE.photoRole*(kind==='photo'&&asset.visualRoles?.includes('photo')?1:0)+THREE_SCORE.subject*(subjectMatch?1:0)+THREE_SCORE.motif*motifFit+(kind==='sticker'&&asset.visualRoles?.includes('figure') ? .15 : 0))};
}
export function scoreThreeLayoutSlot(templateId,slotId,asset){
 const template=templates.get(templateId);
 if(!template)throw new RangeError(templateId);
 const slot=template.slots.find(item=>item[0]===slotId);
 if(!slot||!rolesFor(slot).length)return null;
 const result=candidate(asset,slot);
 return result&&result.score>=THREE_SCORE.minimum?result:null;
}
export function describeThreeSlotMatch(templateId,slotId){
 const template=templates.get(templateId);if(!template)throw new RangeError(templateId);
 const slot=template.slots.find(item=>item[0]===slotId);if(!slot)throw new RangeError(`未知槽位：${slotId}`);
 const kind=slot[2],acceptedRoles=rolesFor(slot),[w,h]=rectMm(slot[3]);
 const range=kind==='photo'?[.98,2.15]:kind==='paper'?[.75,1.6]:kind==='sticker'?[.35,2.1]:[.72,1.3];
 const gates=acceptedRoles.length?[{field:'visualRoles',rule:'containsOneOf',value:acceptedRoles},
  {field:'physicalSizeMm',rule:'nativeSizeWithinPage',value:LAYOUT_LEAF_MM}]:[];
 if(kind==='strip')gates.push({field:'longSideRatio',rule:'range',value:[.45,1.6]},
  {field:'shortSideRatio',rule:'range',value:[.45,2]});
 else if(acceptedRoles.length)gates.push({field:'sizeRatio',rule:'range',value:range,...(kind==='paper'?{when:'preservation is repeatable'}:{})});
 if(kind==='paper')gates.push({field:'sizeRatio',rule:'range',value:[.75,1.25],when:'preservation is not repeatable'});
 if(kind==='paper')gates.push({field:'writableAreaRatio',rule:'atLeast',value:.45,exception:'pattern-paper'});
 if(kind==='strip')gates.push({field:'lengthToWidthRatio',rule:'atLeast',value:3});
 return {targetMm:[round(w),round(h)],acceptedRoles,gates,
  score:{...THREE_SCORE,rolePriority:'1 - roleIndex × 0.2',sizeFit:'exp(-0.5 × (|ln(widthRatio)| + |ln(heightRatio)|))'},
  fallback:{method:'generated'},cropPolicy:kind==='photo'?'centered-mask':kind==='paper'?'repeatable-only':'never',
  automaticPaper:kind==='paper'};
}
export function listThreeLayoutSpreads(){return [...templates.keys()];}
export function describeThreeLayoutSpread(id){const t=templates.get(id);if(!t)throw new RangeError(id);return structuredClone({...t,leafMm:LAYOUT_LEAF_MM,slots:t.slots.map(s=>({id:s[0],page:s[1],role:s[2],box:s[3],targetMm:rectMm(s[3]).map(round),z:s[4],style:s[5]||{},acceptedMaterialRoles:rolesFor(s),cropPolicy:s[2]==='paper'?'repeatable-only':s[2]==='photo'?'centered-mask':'never',defaultInput:['photo','sticker','paper','strip'].includes(s[2])?'generated':s[2]==='body'||s[2]==='title'||s[2]==='micro'||s[2]==='date'||s[2]==='word'?'editable-text':'generated-graphic'}))});}
export function matchThreeLayoutSpread(id,assets,{bindings={},mustUse=[],pages}={}){
 const t=templates.get(id);if(!t)throw new RangeError(id);
 const slots=t.slots.filter(s=>rolesFor(s).length&&(!pages||pages.includes(s[1]))).map(node=>{const [slotId,page,role,box]=node;
  return {id:slotId,page,role,box:[box[0]/100,box[1]/100,(box[2]-box[0])/100,(box[3]-box[1])/100],
   sizeMm:rectMm(box).map(round),weight:role==='photo'?1.4:role==='paper'?1.1:1,
   preferredColor:node[5]?.fill||null,
   splitKind:role==='paper'?'paper':null,node};});
 const result=solveTemplateAssignments({templateId:id,slots,assets:assets.filter(a=>a.usage!=='calibration-only'),bindings,mustUse,
  defaultScore:.38,normalizeScore:value=>Math.max(0,Math.min(1,value/1.25)),scoreCandidate:(asset,slot)=>{
   const fit=candidate(asset,slot.node);return fit&&fit.score>=THREE_SCORE.minimum?fit:null;
  }});
 return {...result,missingPhotos:t.slots.filter(s=>s[2]==='photo'&&(!pages||pages.includes(s[1]))&&!result.assignments.find(a=>a.slot===s[0])?.asset).map(s=>s[0]),
  missingStickers:t.slots.filter(s=>s[2]==='sticker'&&(!pages||pages.includes(s[1]))&&s[5]?.motif&&!result.assignments.find(a=>a.slot===s[0])?.asset).map(s=>s[0])};
}
function addText(operations,t,slot,content){
 const [id,page,role,box,,special={}]=slot,[w,h]=rectMm(box);
 const pt=special.fontSizePt??(role==='title'?17:role==='date'?19:role==='word'?14:role==='micro'?7.5:10.5);
 const fontFamily=special.fontFamily??(role==='body'?'Xiaolai':'Arial');
 const requestedWeight=special.fontWeight??(role==='title'||role==='micro'?'bold':'normal');
 const fontWeight=typeof requestedWeight==='number'?(requestedWeight>=600?'bold':'normal'):requestedWeight;
 operations.push({op:'text.add',id,content,place:{reference:`page.${page}`,at:[round(box[0]*1.25),round(box[1]*1.76)],anchor:'top-left',unit:'mm'},size:{width:round(w),unit:'mm'},style:{fontSizePt:pt,color:special.color||'#2D3541',fontFamily,fontWeight,lineHeight:1.12,...(special.outline?{outline:special.outline}:{}),...(special.fillOpacity!==undefined?{fillOpacity:special.fillOpacity}:{})}});
}
export function compileThreeLayoutSpread({templateId,assets=[],plan,texts={},palette={}}={}){
 const t=templates.get(templateId);if(!t)throw new RangeError(templateId);
 if(plan?.splitGroups?.length)return applyTemplateSplitPlan(compileThreeLayoutSpread({templateId,assets,
  plan:withoutSplitAssignments(plan),texts,palette}),plan);
 const matched=plan||matchThreeLayoutSpread(templateId,assets),choices=new Map(matched.assignments.map(a=>[a.slot,a]));
 const operations=[{op:'page.update',page:'page.left',paperColor:palette.left||t.pages.left},{op:'page.update',page:'page.right',paperColor:palette.right||t.pages.right}];
 const warnings=[],base=copy[templateId];
 for(const slot of [...t.slots].sort((a,b)=>a[4]-b[4])){
  const [id,page,role,box,,special={}]=slot,[w,h]=rectMm(box),[x,y]=centerMm(box);
  const place={reference:`page.${page}`,at:[round(x),round(y)],unit:'mm'};
  const choice=choices.get(id),asset=choice?.asset&&assets.find(a=>sourceId(a)===choice.asset);
  if(asset){
   if(role==='photo'&&choice.subjectMatch===false)warnings.push(`${id}: ${asset.title||choice.asset} 的内容与参考图的${special.subject}照片不匹配`);
   if(role==='sticker'&&special.motif&&choice.motifSubjectMatch===false)warnings.push(`${id}: ${asset.title||choice.asset} 只是尺寸或形状代位，与参考贴纸的${special.motif}主题不匹配`);
   if(choice.method==='crop'&&choice.cropRegion)operations.push({op:'material.split',asset:sourceId(asset),
    pieces:[{id,region:choice.cropRegion,place:{...place,at:choice.at}}],keepRemainder:true});
   else operations.push({op:'material.add',id,asset:sourceId(asset),place:{...place,at:choice.at,...(choice.rotationDeg?{rotationDeg:choice.rotationDeg}:{})}});
   if(choice.crop&&choice.crop.some((v,i)=>Math.abs(v-[0,0,1,1][i])>.005))operations.push({op:'layer.mask',target:id,mode:'replace',region:{shape:'rect',space:'local',unit:'ratio',box:choice.crop}});
   continue;
  }
  if(role==='photo'){
   addDefaultSurface(operations,templateId,slot,place,w,h);
   warnings.push(`${id}: 缺少尺寸与角色合适的真实素材，使用可编辑纸卡保留构图`);
   continue;
  }
  if(role==='body'||role==='title'||role==='micro'||role==='date'||role==='word'){
   const fallback=base.bySlot?.[id]??(role==='title'?base.title:role==='micro'?base.micro:role==='date'?'08 / 25':base.body);
   addText(operations,t,slot,texts[id]??fallback);continue;
  }
  if(role==='paper'||role==='strip'){
   operations.push({op:'paper.add',id,place,size:{width:round(w),height:round(h),unit:'mm'},style:{fill:special.fill||'#E8E5DD',...(special.opacity!==undefined?{opacity:special.opacity}:{})},texture:'subtle',pattern:['grid','ruled','dots'].includes(special.pattern)?special.pattern:'plain'});
   if(special.pattern==='stripes')for(let k=1;k<=6;k++)operations.push({op:'graphic.add',id:`${id}-stripe-${k}`,geometry:{kind:'rect'},place:{reference:`page.${page}`,at:[round(box[0]*1.25+w*k/7),round(y)],unit:'mm'},size:{width:round(w/17),height:round(h),unit:'mm'},style:{fill:k%2?'#D6E7A7':'#BFD896',opacity:.72}});
   continue;
  }
  if(role==='sticker'){
   if(special.motif){
    addDefaultSurface(operations,templateId,slot,place,w,h);
    warnings.push(`${id}: 没有尺寸合适的真实贴纸，使用可编辑纸卡代位`);
   }
   else {addText(operations,t,slot,special.glyph||'✿');operations.at(-1).style.color=special.color||'#526B69';operations.at(-1).style.fontSizePt=special.fontSizePt||16;}
   continue;
  }
  if(role==='mark'){operations.push({op:'graphic.add',id,geometry:{kind:'line'},place,size:{width:round(w),height:round(h),unit:'mm'},style:{stroke:special.fill||'#D9B682',strokeWidthMm:1}});continue;}
  if(role==='circle'||role==='accent')operations.push({op:'graphic.add',id,geometry:{kind:special.kind||'ellipse'},place,size:{width:round(w),height:round(h),unit:'mm'},style:{fill:special.fill||'#D6E7DB'}});
 }
 return {templateId,operations,matching:matched,report:{pageMm:[250,176],warnings,source:t.source,modelCalls:0}};
}
