import graphs from './six-spread-template-graphs.json' with {type:'json'};
import {describeSpreadSlot} from './six-spread-slot-catalog.js';
import {solveTemplateAssignments} from './unified-template-matcher.js';
import {withoutSplitAssignments,applyTemplateSplitPlan} from './template-split-compiler.js';
import {visibleCropRegion,visibleSourceBoundsMm} from './template-crop-region.js';

// A6per's photographed leaf is approximately 0.55 wide per unit height.
// Personal (95 × 171 mm) is the closest supported insert. The source video
// does not provide a ruler, so physical sizes remain a calibration assumption.
export const SPREAD_LEAF_MM=Object.freeze([95,171]);
const byId=new Map(graphs.templates.map(item=>[item.id,item]));
const ink='#263442';
const mm=([x0,y0,x1,y1])=>[(x1-x0)*.95,(y1-y0)*1.71];
const center=([x0,y0,x1,y1])=>[(x0+x1)*.475,(y0+y1)*.855];
const round=x=>Math.round(x*100)/100;
const alias=a=>a.alias||a.id;
const photoRoles=/^(?:large-scene-photo|small-scene-photo|large-irregular-photo|irregular-photo|scene-photo|small-scene-card|square-scene-card|large-irregular-flower|small-irregular-flower|irregular-subject)$/;
const SIX_SCORE=Object.freeze({size:.48,role:.4,minimum:.55,defaultScore:.22,wholeSubjectBonus:.09});
const accentRoles=/accent|stars|dots|starburst|medallion|oval/;
const paperRoles=/^(?:ruled-background|support-card|backing-paper|writing-card|light-writing-card|torn-writing-card|translucent-paper|translucent-backing-paper|light-paper|large-writing-card|small-heading-card|date-card|large-date-badge|micro-label|pattern-note|small-scene-card|square-scene-card|vertical-connector|horizontal-lace|support-paper)$/;
const defaultText={
 'S01-苹果绿白':{date:'2026.9.27\nSunday',heading:'Honest',body:'把一段普通的日子认真收藏起来。',byNode:{'L-writing':'今天走得很慢，一路上留意到许多以前错过的小事。风从树叶间经过，阳光落在手边的纸页上。把这些细小的感受记在这里，留给以后的自己。','L-photo-caption':'停下来看看周围，总有新的发现。','R-writing':'把看到的颜色和闻到的气味一起留在这里。不同的画面在两页之间相遇，普通的一天也有值得认真记录的细节。','R-paper-caption':'A little day.'}},
 'S02-青黄面包':{date:'05',heading:'A little moment',body:'把今天的暖意轻轻收进这一页。',byNode:{'L-writing':'风从窗边经过，带来一点新鲜的气味。面包还是温热的，手心也跟着暖起来。慢慢吃完早饭，再把今天想做的事写下来，这样开始就很好。','L-lower-writing':'留一点时间给平常的小事。','R-writing':'午后的光落在桌上，颜色变得明亮。我把喜欢的片刻收进一张小卡，留待以后翻看。','R-lower-writing':'边走边记下今天。喜欢的颜色和味道，正好在这一页相遇。'}},
 'S03-棕蓝爱心':{date:'10·11',heading:'A quiet day',body:'日子有甜味，也有值得记住的光。',byNode:{'L-upper-writing':'今天想记下的是几件微小的好事。回头看时，它们正好让这段日子发亮。','L-lower-writing':'夜里回看这一页，心情也慢了下来。原来平凡的日子里还有那么多值得珍惜的瞬间，想把它们好好收起来。','R-writing':'窗外的蓝和桌上的棕，恰好落在一起。把喜欢的画面贴好，再写一段今天的事。那些没有特别计划的小小片刻，也值得留给以后翻看。','R-lower-writing':'把这一刻收起来，以后再慢慢看，也许会想起今天的风。'}},
 'S04-粉黑百合':{date:'',heading:'花开的日子',body:'花开在两页之间，刚好接住今天。',byNode:{'L-upper-writing':'早上看到一朵花，忽然想把它留下。颜色很亮，花瓣慢慢打开，连今天也跟着轻快。把这份心情写下来，夹在两页之间，日后翻到时还会记得。','L-mid-writing':'把花的样子记下，也把今天忽然变好的心情记下。','R-upper-writing':'另一页留给今天的事。路过熟悉的街角，买了一杯热饮。回家时天还亮着，花的颜色落在纸上，像给这一页点了灯。平常的路也因此有了新的样子。','R-edge-writing':'花开了，今天也刚刚好。顺着花瓣的方向，把喜欢的话慢慢写下来。'}},
 'S05-灰黄甜点':{date:'10/21',heading:'今日小记',body:'一点甜，一点新的心情。',byNode:{'L-writing':'早晨的空气很轻，给自己留一点时间。路上看见小小的花，忍不住停下来多看一会儿。走走停停，记住眼前的颜色，也算认真生活。','R-upper-writing':'在忙碌之间，吃一口喜欢的甜点，让下午慢一点。','R-lower-writing':'细小的快乐总会突然出现。坐下来吃完这份甜点，把今天记在这里。那些看似普通的时间，也有温柔的味道。下次翻开时，或许还能想起当时的心情。'}},
 'S06-白粉果实':{date:'18',heading:'記録',body:'把喜欢的味道和今天一起记下。',byNode:{'L-upper-writing':'今天的颜色很温柔，想把眼前这一刻和喜欢的味道都留下。','L-medallion':'思念化作','L-lower-writing':'记住一点甜，也记住今天的风。许多平常的瞬间凑成了这一页，往后翻看时还会觉得温暖。','R-mid-writing':'下午坐在窗边，想起最近喜欢的事。慢慢写下几句，留给以后的自己。','R-lower-writing':'明天也许会忙，今晚先把心情安静地收好。'}}
};
Object.assign(defaultText['S04-粉黑百合'].byNode,{'L-small-note':'little note','R-bottom-writing':'把这一刻\n留在这里。'});
Object.assign(defaultText['S05-灰黄甜点'].byNode,{'L-vase-note':'对你·宇宙','L-elephant-note':'small things','R-green-sticker':'青来','R-top-card':'手作抹茶可可\n今天的甜点\n留一口给自己','R-label':'今日'});
Object.assign(defaultText['S06-白粉果实'].byNode,{'R-black-label':'Ancien','R-black-label-2':'Ancien','R-mid-number':'1746','R-order-label':'OUTSIDE OF ORDER'});
// A template describes visual roles, not a fixed list of photographed subjects.
// Subject agreement is a ranking bonus for replaceable photos/cards. Only
// silhouette-dependent cutouts require a compatible botanical/ornamental form.
const subjectForSlot=(templateId,id)=>({
 'S01-苹果绿白':{'L-apple-photo':/苹果|水果/, 'R-black-photo':/黑色.*照片|黑白.*照片|夜景/, 'R-fruit-basket':/水果|苹果|果篮/},
 'S02-青黄面包':{'L-bread-photo':/面包|吐司/, 'R-fruit-basket':/水果|葡萄|果篮/},
 'S03-棕蓝爱心':{'L-heart-photo':/爱心|心形|黑白.*照片/, 'R-cake-illustration':/蛋糕|甜点|甜品/},
 'S04-粉黑百合':{'L-flower-photo':/花朵|花卉|百合/, 'R-lily':/百合|粉色.*花|花朵剪片/},
 'S05-灰黄甜点':{'L-vase-card':/花瓶|插花/, 'L-elephant-card':/象|动物插画/, 'R-dessert-photo':/甜点|甜品|蛋糕/},
 'S06-白粉果实':{'L-fruit-photo':/苹果|水果|果实/, 'R-fig-card':/无花果|甜品|甜点/, 'L-flower':/花朵|百合/, 'R-flower':/花朵|百合/}
})[templateId]?.[id]||null;
const colorFor=(template,node)=>{
 const p=template.pages[node[1]],role=node[2],id=node[0];
 if(id.includes('cyan'))return '#7CD8D2';
 if(id.includes('lace'))return '#F7F4ED';
 if(id.includes('grid'))return '#D2D0B5';
 if(template.id==='S01-苹果绿白'&&id==='L-date')return '#184DA2';
 if(template.id==='S03-棕蓝爱心'&&id==='L-date')return '#F5F1E8';
 if(template.id==='S05-灰黄甜点'&&id==='R-label')return '#F8F4E7';
 if(id.includes('small-note'))return '#CEB8BD';
 if(id.includes('elephant-note'))return '#F5F0E4';
 if(id.includes('vase-note'))return '#EEE8D9';
 if(id.includes('top-card'))return '#F3D8E2';
 if(id.includes('vellum'))return '#EFEAE2';
 if(id.includes('translucent-card'))return '#BEADB0';
 if(id.includes('record-label'))return '#F5F2EA';
 if(id.includes('order-label'))return '#2D2828';
 if(id.includes('lime'))return '#D9E525';
 if(id.includes('blue'))return '#476D9B';
 if(id.includes('black')||id.includes('dark'))return '#313B43';
 if(id.includes('green'))return '#42AA65';
 if(id.includes('pink'))return '#F3AFC7';
 if(id.includes('white')||id.includes('pale')||id.includes('light')||role.includes('writing-card'))return '#F7F4EC';
 if(id.includes('brown'))return '#77513B';
 if(role.includes('translucent'))return '#B7C7D0';
 if(role.includes('support'))return '#F1E9D8';
 if(role.includes('backing'))return '#C1C4B2';
 return p;
};
const accentColor=template=>template.id==='S02-青黄面包'?'#DE5C2C':template.id==='S05-灰黄甜点'?'#FFFFFF':template.id==='S06-白粉果实'?'#AF2929':'#EB9D43';
// A photographed subject is a replaceable slot, not an optional part of the
// layout. Empty-input templates retain its measured footprint as editable
// paper; real materials still take precedence when they match the slot.
const defaultScenePaper={
 'S01-苹果绿白':{'L-apple-photo':['#647E41','plain'],'R-black-photo':['#29312A','plain'],'R-fruit-basket':['#F3E9CE','dots']},
 'S02-青黄面包':{'L-bread-photo':['#C5995E','plain'],'R-fruit-basket':['#E6BA83','dots']},
 'S03-棕蓝爱心':{'L-heart-photo':['#343136','plain'],'R-cake-illustration':['#F0E8D6','dots']},
 'S04-粉黑百合':{'L-flower-photo':['#39383B','plain'],'R-lily':['#C9849A','plain']},
 'S05-灰黄甜点':{'L-vase-card':['#F0EBDF','dots'],'L-elephant-card':['#EEEDE7','plain'],'R-dessert-photo':['#F2E5D5','dots']},
 'S06-白粉果实':{'L-fruit-photo':['#D6D4CE','plain'],'L-flower':['#C99DB1','plain'],
  'R-fig-card':['#F4EEE1','dots'],'R-flower':['#B33845','plain']}
};
function addDefaultScenePaper(operations,template,node,place,size,visual){
 const [id]=node,[fill,pattern]=defaultScenePaper[template.id]?.[id]||[visual.fill||'#E9E3D8','plain'];
 operations.push({op:'paper.add',id,place,size,style:{fill},texture:'subtle',pattern});
}
const lightness=hex=>{const n=parseInt(hex.slice(1),16);return ((((n>>16)&255)*.2126)+(((n>>8)&255)*.7152)+((n&255)*.0722))/255;};
const textContent=(template,node,override)=>{
 if(override!==undefined)return String(override);
 const [id,,role]=node,copy=defaultText[template.id];
 if(copy.byNode?.[id])return copy.byNode[id];
 if(/date|number/.test(role))return copy.date||'21';
 if(/heading|label/.test(role))return copy.heading;
 if(/micro-typography/.test(role))return 'COLLECT MOMENTS';
 if(/edge-writing/.test(role))return 'daily notes';
 if(/lower-writing|mid-writing|upper-writing/.test(id))return copy.body;
 return copy.body;
};
const fit=(asset,node,slot)=>{
 const [tw,th]=mm(node[3]),w=Number(asset.physicalWidthMM),h=Number(asset.physicalHeightMM);
 if(!(w>0&&h>0)||w>SPREAD_LEAF_MM[0]+4||h>SPREAD_LEAF_MM[1]+4)return null;
 const ratioW=w/tw,ratioH=h/th;
 const paper=/paper|card|note/.test(node[2])&&!photoRoles.test(node[2]);
 const canCrop=paper&&asset.preservation==='repeatable';
 const accent=slot.role==='edge-accent';
 const figure=asset.visualRoles?.includes('figure')&&!paper;
 if(ratioW<(paper ? .72 : figure ? .28 : accent ? .7 : .42)||ratioH<(paper ? .72 : figure ? .28 : accent ? .7 : .42)||
  ratioW>(paper?(canCrop?1.6:1.35):figure?2.1:accent?1.45:1.75)||
  ratioH>(paper?(canCrop?1.6:1.35):figure?2.1:accent?1.45:1.75))return null;
 // Large photographs establish a page's weight. A postage-sized original
 // cannot fill their structural slot without forbidden upscaling.
 if(/^(?:large-scene-photo|large-irregular-photo)$/.test(node[2])&&(ratioW<.65||ratioH<.6))return null;
 const [x,y]=center(node[3]);
 // The source image can have transparent padding. Align the visible subject to
 // the measured slot, and never silently shift an object just to keep its
 // (possibly transparent) outer rectangle inside the page.
 const bounds=asset.visualBoundsRatio||[0,0,1,1];
 const cx=x-(bounds[0]+bounds[2]-1)*w/2,cy=y-(bounds[1]+bounds[3]-1)*h/2;
 return {at:[round(cx),round(cy)],size:[w,h],sizeScore:Math.exp(-.5*(Math.abs(Math.log(ratioW))+Math.abs(Math.log(ratioH))))};
};
const isMaterialSlot=(template,node)=>describeSpreadSlot(template.id,node).acceptedMaterialRoles.length>0;
const isTextNode=node=>/^(?:body-|micro-typography|micro-heading|large-date-text)/.test(node[2]);
const hasCardText=node=>/^(?:small-heading-card|date-card|large-date-badge|micro-label|pattern-note)$/.test(node[2]);
const candidate=(asset,node,template)=>{
 const slot=describeSpreadSlot(template.id,node),f=fit(asset,node,slot);if(!f)return null;
 const paper=/paper|card|note/.test(node[2])&&!photoRoles.test(node[2]);
 const roles=slot.acceptedMaterialRoles,matched=roles.findIndex(r=>asset.visualRoles?.includes(r));
 if(matched<0)return null;
 // A card carrying its own headline is not an empty writing surface. User
 // profiles may explicitly mark a printed card as writable after inspection.
 // A card carrying template copy must remain writable after replacement;
 // otherwise its title/date silently disappears when a printed card wins.
 if((/writing-card/.test(node[2])||hasCardText(node))&&Number(asset.writableAreaRatio??0)<.6&&asset.canWriteOn!==true)return null;
 if(/(?:flower|subject)$/.test(node[2])&&!asset.visualRoles?.some(r=>['figure','photo'].includes(r)))return null;
 const title=String(asset.title||'');
 const key=node[0];
 const subject=subjectForSlot(template.id,key);
 if(/lace/.test(key)&&!/蕾丝|花边|镂空|网纱|胶带/.test(title))return null;
 const semantic=(subject?.test(title)?.24:0)+(/bread/.test(key)&&/面包|吐司/.test(title)?.12:0)+(/dessert|cake/.test(key)&&/甜品|蛋糕/.test(title)?.14:0)+(/flower|lily/.test(key)&&/花/.test(title)?.12:0)-(/irregular-subject/.test(node[2])&&asset.visualRoles?.includes('printed-card') ? .16 : 0);
 const whole=asset.preservation==='whole'&&/flower|subject/.test(node[2])?.09:0;
 const subjectBonus=asset.visualRoles?.includes('figure')&&/flower|subject|accent/.test(node[2]) ? .15 : 0;
 const [targetWidth,targetHeight]=mm(node[3]);
 const [vx0,vy0,vx1,vy1]=paper?visibleSourceBoundsMm(asset):[0,0,0,0];
 const cropRegion=paper&&asset.preservation==='repeatable'&&vx1-vx0>=targetWidth&&vy1-vy0>=targetHeight&&
  (vx1-vx0>targetWidth*1.08||vy1-vy0>targetHeight*1.08)
  ?visibleCropRegion(asset,targetWidth,targetHeight):null;
 return {asset:alias(asset),at:cropRegion?center(node[3]):f.at,sourceMm:f.size,
  score:round(SIX_SCORE.size*f.sizeScore+SIX_SCORE.role*(1-matched*.18)+semantic+whole+subjectBonus),
  method:cropRegion?'crop':'complete',...(cropRegion?{cropRegion}:{}),overlayText:hasCardText(node)};
};

export function scoreSixSpreadSlot(templateId,slotId,asset){
 const template=byId.get(templateId);
 if(!template)throw new RangeError(`未知双页模板：${templateId}`);
 const node=template.nodes.find(item=>item[0]===slotId);
 if(!node||!isMaterialSlot(template,node))return null;
 const result=candidate(asset,node,template);
 return result&&result.score>=SIX_SCORE.minimum?result:null;
}

export function describeSixSlotMatch(templateId,slotId){
 const template=byId.get(templateId);
 if(!template)throw new RangeError(`未知双页模板：${templateId}`);
 const node=template.nodes.find(item=>item[0]===slotId);
 if(!node)throw new RangeError(`未知槽位：${slotId}`);
 const slot=describeSpreadSlot(templateId,node),[w,h]=mm(node[3]);
 const paper=/paper|card|note/.test(node[2])&&!photoRoles.test(node[2]);
 const accent=slot.role==='edge-accent';
 const irregular=/flower|subject|accent/.test(node[2]);
 const min=paper?.72:accent?.7:.42,max=paper?1.6:accent?1.45:1.75;
 const gates=slot.acceptedMaterialRoles.length?[{field:'visualRoles',rule:'containsOneOf',value:slot.acceptedMaterialRoles},
  {field:'physicalSizeMm',rule:'nativeSizeWithinPage',value:[SPREAD_LEAF_MM[0]+4,SPREAD_LEAF_MM[1]+4]},
  {field:'sizeRatio',rule:'range',value:[min,max],...(paper?{when:'preservation is repeatable'}:irregular?{when:'visualRoles excludes figure'}:{})}]:[];
 if(paper)gates.push({field:'sizeRatio',rule:'range',value:[min,1.35],when:'preservation is not repeatable'});
 if(irregular)gates.push({field:'sizeRatio',rule:'range',value:[.28,2.1],when:'visualRoles includes figure'});
 if(/^(?:large-scene-photo|large-irregular-photo)$/.test(node[2]))gates.push({field:'sizeRatio',rule:'minimum',value:[.65,.6]});
 if(/writing-card|date-card|small-heading-card|pattern-note/.test(node[2]))gates.push({field:'writableAreaRatio',rule:'atLeast',value:.6,exception:'canWriteOn=true'});
 if(/lace/.test(slotId))gates.push({field:'title',rule:'matches',value:'蕾丝|花边|镂空|网纱|胶带'});
 if(/(?:flower|subject)$/.test(node[2]))gates.push({field:'visualRoles',rule:'containsOneOf',value:['figure','photo']});
 return {targetMm:[round(w),round(h)],acceptedRoles:slot.acceptedMaterialRoles,gates,
  score:{...SIX_SCORE,rolePriority:'1 - roleIndex × 0.18',sizeFit:'exp(-0.5 × (|ln(widthRatio)| + |ln(heightRatio)|))',semanticBonus:'0–0.62'},
  fallback:{method:'generated',score:SIX_SCORE.defaultScore},cropPolicy:paper?'repeatable-only':'never'};
}

function addVectorLace(operations,id,page,box){
 const [width,height]=mm(box),[x,y]=center(box),reference=`page.${page}`;
 operations.push({op:'paper.add',id,place:{reference,at:[round(x),round(y)],unit:'mm'},size:{width:round(width),height:round(height),unit:'mm'},style:{fill:'#F8F5ED'},translucency:.8,texture:'subtle'});
 const count=Math.max(9,Math.round(width/3.8));
 for(let i=0;i<count;i++)operations.push({op:'graphic.add',id:`${id}-loop-${i}`,geometry:{kind:'ellipse'},place:{reference,at:[round(box[0]*.95+(i+.5)*width/count),round(y)],unit:'mm'},size:{width:round(width/count*.78),height:round(height*.58),unit:'mm'},style:{fill:null,stroke:'#B7AAA6',strokeWidthMm:.18}});
}
function addCardText(operations,template,node,texts,fill){
 const [id,page,role,box]=node,[width]=mm(box),inset=Math.min(2.5,width*.08),content=textContent(template,node,texts[id]);
 operations.push({op:'text.add',id:`${id}-text`,content,
  place:{reference:`page.${page}`,at:[round(box[0]*.95+inset),round(box[1]*1.71+(template.id==='S01-苹果绿白'&&id==='L-date'?4:inset))],anchor:'top-left',unit:'mm'},
  size:{width:round(Math.max(9,width-inset*2)),unit:'mm'},
  style:{fontSizePt:template.id==='S01-苹果绿白'&&id==='L-blue-heading'?20:template.id==='S01-苹果绿白'&&id==='L-date'?13:template.id==='S03-棕蓝爱心'&&id==='L-date'?26:template.id==='S06-白粉果实'&&id==='R-record-label'?16:template.id==='S06-白粉果实'&&id==='R-order-label'?6.5:/date|badge/.test(role)?22:role==='pattern-note'?9:11,color:['L-blue-heading','R-blue-label'].includes(id)?'#FFFFFF':lightness(fill)<.35?'#FFFFFF':ink,fontFamily:template.id==='S01-苹果绿白'&&id==='L-blue-heading'?'Georgia':/date|badge/.test(role)?'Ma Shan Zheng':'Xiaolai',...(template.id==='S01-苹果绿白'&&['L-blue-heading','L-date'].includes(id)?{textAlign:'center',fontWeight:'bold'}:{})}});
}

export function listSixSpreadTemplates(){return [...byId.keys()];}
export function describeSixSpreadTemplate(templateId){
 const template=byId.get(templateId);if(!template)throw new RangeError(`未知双页模板：${templateId}`);
 return structuredClone({...template,leafMm:SPREAD_LEAF_MM,source:graphs.source,slots:template.nodes.map(node=>({
  ...describeSpreadSlot(templateId,node),
  above:template.occlusion.filter(([front])=>front===node[0]).map(([,back])=>back),
  below:template.occlusion.filter(([,back])=>back===node[0]).map(([front])=>front)
 }))});
}
export function matchSixSpreadMaterials(templateId,profiles,{overrides={},calibrationMode=false,mustUse=[],pages}={}){
 const template=byId.get(templateId);if(!template)throw new RangeError(`未知双页模板：${templateId}`);
 // Reference/case art belongs to offline template calibration only. It cannot
 // silently enter a user's draft through automatic matching or a binding.
 const available=profiles.filter(p=>calibrationMode||p.usage!=='calibration-only');
 const nodes=template.nodes.filter(node=>isMaterialSlot(template,node)&&(!pages||pages.includes(node[1])));
 const slots=nodes.map(node=>{const [id,page,role,box]=node,[w,h]=mm(box);
  return {id,role,page,box:[box[0]/100,box[1]/100,(box[2]-box[0])/100,(box[3]-box[1])/100],
   sizeMm:[round(w),round(h)],weight:photoRoles.test(role)?1.4:/backing|support/.test(role)?1.2:1,
   preferredColor:template.nodeStyles?.[id]?.fill||colorFor(template,node),
   splitKind:/paper|card|note/.test(role)&&!photoRoles.test(role)&&!/(?:date|label|heading|lace|translucent)/.test(role)&&!/sticker|label|badge/.test(id)?'paper':null,node};});
 const result=solveTemplateAssignments({templateId,slots,assets:available,bindings:overrides,mustUse,
  defaultScore:.35,normalizeScore:value=>Math.max(0,Math.min(1,value/1.25)),scoreCandidate:(asset,slot)=>{
   const fit=candidate(asset,slot.node,template);return fit&&fit.score>=SIX_SCORE.minimum?fit:null;
  }});
 const critical=nodes.filter(node=>photoRoles.test(node[2])&&
  node[2]!=='small-irregular-flower'&&!(templateId==='S06-白粉果实'&&['L-flower','R-flower'].includes(node[0]))),
  missingCritical=critical.filter(node=>!result.assignments.find(a=>a.slot===node[0])?.asset).map(node=>node[0]);
 return {...result,unused:profiles.map(alias).filter(id=>!result.used.includes(id)),compatible:missingCritical.length===0,missingCritical};
}
export function selectSixSpreadTemplate(profiles){
 const plans=listSixSpreadTemplates().map(templateId=>matchSixSpreadMaterials(templateId,profiles));
 // Favor a composition that can actually use more of the user's pieces. A
 // two-photo match should not beat a three-piece match on a tiny mean-score
 // difference when both preserve physical size and clear every focal slot.
 const eligible=plans.filter(plan=>plan.compatible).sort((a,b)=>b.score*Math.sqrt(b.used.length)-a.score*Math.sqrt(a.used.length));
 return {selected:eligible[0]||null,plans};
}
export function compileSixSpreadTemplate({templateId,assets=[],plan,texts={},palette={},calibrationMode=false}={}){
 const template=byId.get(templateId);if(!template)throw new RangeError(`未知双页模板：${templateId}`);
 if(plan?.splitGroups?.length)return applyTemplateSplitPlan(compileSixSpreadTemplate({templateId,assets,
  plan:withoutSplitAssignments(plan),texts,palette,calibrationMode}),plan);
 const matched=plan||matchSixSpreadMaterials(templateId,assets,{calibrationMode}),choices=new Map(matched.assignments.map(a=>[a.slot,a]));
 if(!calibrationMode&&matched.used.some(id=>assets.find(a=>alias(a)===id)?.usage==='calibration-only'))throw new Error('校准案例素材不能用于用户作品');
 const operations=[{op:'page.update',page:'page.left',paperColor:palette.left||template.pages.left},{op:'page.update',page:'page.right',paperColor:palette.right||template.pages.right}],warnings=[];
 for(const node of [...template.nodes].sort((a,b)=>a[4]-b[4])){
  const [id,page,role,box]=node;
  const [width,height]=mm(box),[x,y]=center(box),visual=template.nodeStyles?.[id]||{},place={reference:`page.${page}`,at:[round(x),round(y)],unit:'mm',...(visual.rotationDeg===undefined?{}:{rotationDeg:visual.rotationDeg})};
  if(role==='ruled-background'){
   operations.push({op:'paper.add',id,place:{reference:`page.${page}`,at:[SPREAD_LEAF_MM[0]/2,SPREAD_LEAF_MM[1]/2],unit:'mm'},size:{width:SPREAD_LEAF_MM[0],height:SPREAD_LEAF_MM[1],unit:'mm'},style:{fill:template.pages[page]},texture:'subtle',pattern:'ruled'});continue;
  }
  const choice=choices.get(id),selected=choice?.asset&&assets.find(a=>alias(a)===choice.asset);
  if(role==='large-date-text'&&selected){operations.push({op:'material.add',id,asset:choice.asset,place:{...place,at:choice.at}});continue;}
  if(isTextNode(node)){
   const content=textContent(template,node,texts[id]),fontSizePt=/large-date/.test(role)?template.id==='S06-白粉果实'?(id==='L-number'?76:50):template.id==='S05-灰黄甜点'?44:58:/date/.test(role)?23:/heading/.test(role)?15:/micro/.test(role)?9:width<23?9.5:10.5;
   // Source boxes are visible glyph bounds. The text engine fits a line box,
   // which includes leading; these two measured numerals need more fit room
   // and an earlier line-box origin to land on the photographed glyph bounds.
   const numeral=id==='L-number'&&template.id==='S06-白粉果实'?{topPct:12.5,fitWidthMm:39,fitHeightMm:34}:id==='R-mid-number'&&template.id==='S06-白粉果实'?{topPct:44,fitWidthMm:41,fitHeightMm:24}:id==='L-date'&&template.id==='S05-灰黄甜点'?{topPct:20.5,fitWidthMm:38,fitHeightMm:23}:null;
   const textTop=round((numeral?.topPct??box[1])*1.71);
   const onDark=lightness(template.pages[page])<.35;
   const writingSource=role==='body-on-photo'&&matched.assignments.find(a=>a.slot===(template.id==='S01-苹果绿白'?'L-apple-photo':'L-bread-photo'))?.asset;
   const writingAsset=writingSource&&assets.find(a=>alias(a)===writingSource);
   const writingOnPaper=writingAsset?.visualRoles?.some(r=>['writing-card','plain-paper'].includes(r));
   const color=id==='R-mid-number'&&template.id==='S06-白粉果实'?'#FFFFFF':writingOnPaper?ink:template.id==='S01-苹果绿白'&&(role==='body-on-photo'||id==='R-writing')?'#FFFFFF':role==='body-on-card'?ink:onDark?'#FFFFFF':ink;
   const fontFamily=/large-date/.test(role)&&['S05-灰黄甜点','S06-白粉果实'].includes(template.id)?'Georgia':/date|heading/.test(role)?'Ma Shan Zheng':/micro/.test(role)?'Sophora':'Xiaolai';
   operations.push({op:'text.add',id,content,place:{reference:`page.${page}`,at:[round(box[0]*.95),textTop],anchor:'top-left',unit:'mm'},size:{width:round(Math.max(12,numeral?.fitWidthMm??width)),unit:'mm'},style:{fontSizePt,color,fontFamily,lineHeight:1.12,...(/large-date/.test(role)?{fontWeight:'bold'}:{}),...(template.id==='S01-苹果绿白'&&['L-writing','L-photo-caption'].includes(id)?{outline:{color:'#3F5535',widthMm:.16}}:{}),...(template.id==='S01-苹果绿白'&&id==='R-writing'||template.id==='S03-棕蓝爱心'&&['L-upper-writing','L-lower-writing'].includes(id)?{textAlign:'center'}:{})}});
   if(/large-date/.test(role))operations.push({op:'text.fit',target:id,place:{reference:`page.${page}`,at:[round(box[0]*.95),textTop],anchor:'top-left',unit:'mm'},size:{width:round(numeral?.fitWidthMm??width),height:round(numeral?.fitHeightMm??height),unit:'mm'},fit:{minFontSizePt:19,maxFontSizePt:fontSizePt,maxLines:1}});
   continue;
  }
  if(selected){
   if(choice.method==='crop'&&choice.cropRegion)operations.push({op:'material.split',asset:choice.asset,
    pieces:[{id,region:choice.cropRegion,place:{...place,at:choice.at}}],keepRemainder:true});
   else operations.push({op:'material.add',id,asset:choice.asset,place:{...place,at:choice.at}});
   // A photographed heart or dessert is not a crop instruction. Keep the
   // user's source intact unless a future slot explicitly asks for a mask.
   if(choice.overlayText)addCardText(operations,template,node,texts,visual.fill||colorFor(template,node));
   continue;
  }
  if(isMaterialSlot(template,node)&&photoRoles.test(role)){
   addDefaultScenePaper(operations,template,node,place,{width:round(width),height:round(height),unit:'mm'},visual);
   warnings.push(`${id} 缺少语义、尺寸都合适的输入素材，使用可编辑纸卡保留构图`);
   continue;
  }
  if(/lace/.test(role)){addVectorLace(operations,id,page,box);continue;}
  if(/irregular-flower/.test(role)){
   operations.push({op:'graphic.add',id,geometry:{kind:'flower',options:{petals:6,petalDepth:.25}},place,size:{width:round(width),height:round(height),unit:'mm'},style:{fill:visual.fill||'#F3B8C6',stroke:'#D7879E',strokeWidthMm:.35}});continue;
  }
  if(role==='irregular-label'){
   operations.push({op:'graphic.add',id,geometry:{kind:'ellipse'},place,size:{width:round(width),height:round(height),unit:'mm'},style:{fill:'#303338',stroke:'#F7F2E9',strokeWidthMm:.8}});
   operations.push({op:'text.add',id:`${id}-text`,content:textContent(template,node,texts[id]),place:{reference:`page.${page}`,at:[round(box[0]*.95+2),round(box[1]*1.71+height*.43)],anchor:'top-left',unit:'mm'},size:{width:round(Math.max(10,width-4)),unit:'mm'},style:{fontSizePt:10,color:'#FFFFFF',fontFamily:'Ma Shan Zheng',textAlign:'center'}});continue;
  }
  if(template.id==='S02-青黄面包'&&id==='L-date'){
   operations.push({op:'graphic.add',id,geometry:{kind:'bubble'},place,size:{width:round(width),height:round(height),unit:'mm'},style:{fill:'#C7E9E8',stroke:'#304453',strokeWidthMm:.7}});
   operations.push({op:'text.add',id:`${id}-text`,content:textContent(template,node,texts[id]),place:{reference:`page.${page}`,at:[round(box[0]*.95+3),round(box[1]*1.71+height*.12)],anchor:'top-left',unit:'mm'},size:{width:round(width-6),unit:'mm'},style:{fontSizePt:64,color:ink,fontFamily:'Ma Shan Zheng',textAlign:'center'}});continue;
  }
  if(template.id==='S05-灰黄甜点'&&id==='R-label'){
   operations.push({op:'graphic.add',id,geometry:{kind:'ticketFrame'},place,size:{width:round(width),height:round(height),unit:'mm'},style:{fill:null,stroke:ink,strokeWidthMm:.6}});
   operations.push({op:'text.add',id:`${id}-text`,content:textContent(template,node,texts[id]),place:{reference:`page.${page}`,at:[round(box[0]*.95+2),round(box[1]*1.71+5)],anchor:'top-left',unit:'mm'},size:{width:round(width-4),unit:'mm'},style:{fontSizePt:8,color:ink,textAlign:'center'}});continue;
  }
  if(accentRoles.test(role)){
   const kind=visual.kind||(/star/.test(id)?'star':'ellipse');
   // The measured box indicates where a small accent lives, not permission to
   // stretch its silhouette. Keep stars and dots round; only a named oval is oval.
   const short=Math.min(width,height,14)*(template.id==='S05-灰黄甜点'&&kind==='star'?1.4:1),oval=/oval/.test(id)&&kind==='ellipse';
   operations.push({op:'graphic.add',id,geometry:{kind},place,size:{width:round(oval?Math.min(width,short*1.8):short),height:round(short),unit:'mm'},style:{fill:visual.fill||accentColor(template)}});continue;
  }
  if(paperRoles.test(role)||isMaterialSlot(node)){
   const fill=visual.fill||colorFor(template,node),props={op:'paper.add',id,place,size:{width:round(width),height:round(height),unit:'mm'},style:{fill},texture:'subtle'};
   if(/translucent/.test(role))props.translucency=visual.translucency??(id.includes('vellum')?.64:id.includes('cyan')?.3:.42);
   if(/lace/.test(role))props.translucency=visual.translucency??.28;
   if(/torn/.test(role))props.edge={style:'torn',edges:['top','bottom'],roughness:.15,depthMm:.7};
   if(/lace|grid/.test(id))props.pattern='grid';
   if(role==='pattern-note'||id==='R-top-card'||template.id==='S03-棕蓝爱心'&&id==='L-date')props.pattern='dots';
   if(template.id==='S06-白粉果实'&&id==='R-lower-paper')props.pattern='ruled';
   operations.push(props);
   if(hasCardText(node))addCardText(operations,template,node,texts,fill);
   continue;
  }
 }
 const nodes=new Set(operations.map(op=>op.id).filter(Boolean));
 for(const [front,back] of template.occlusion)if(nodes.has(front)&&nodes.has(back))operations.push({op:'layer.stack',target:front,reference:back,side:'after'});
 // A caption belongs above its own card even if a later occlusion relation
 // moves the card above another object (for example S04's blue label/lily).
 for(const op of operations.filter(item=>['paper.add','material.add'].includes(item.op)&&nodes.has(`${item.id}-text`)))operations.push({op:'layer.stack',target:`${op.id}-text`,reference:op.id,side:'after'});
 return {templateId,operations,matching:matched,report:{pageMm:[SPREAD_LEAF_MM[0]*2,SPREAD_LEAF_MM[1]],used:matched.used,compatible:matched.compatible,missingCritical:matched.missingCritical,warnings,source:'six-spread-graph',modelCalls:0}};
}
