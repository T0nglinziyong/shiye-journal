import {inspectCreationDocument} from '../../src/creation-inspection.js';
import {applyCreationTransaction,creationSceneRevision} from '../../src/creation-transaction.js';

const mmBox=box=>[box[0]*110/630,box[1]*157/900,box[2]*110/630,box[3]*157/900];
const center=box=>[(box[0]+box[2])/2,(box[1]+box[3])/2];

/** Align template relationships to the actual rendered glyphs, without a model call. */
export function refineMeasuredTemplate(document,compiled,assets,canvas){
 if(compiled.templateId!=='D146')throw new RangeError(`没有量测精修规则：${compiled.templateId}`);
 if(!canvas?.createCanvas)throw new TypeError('精修需要可测量字体的 canvas');
 const opts={textLines:true,textContext:canvas.createCanvas(1,1).getContext('2d'),textCanvasFactory:canvas.createCanvas};
 const inspect=ids=>inspectCreationDocument(document,{ids,...opts}).layers;
 const apply=(suffix,operations)=>{
  if(!operations.length)return;
  document=applyCreationTransaction(document,{protocolVersion:2,transactionId:`${compiled.templateId}-refine-${suffix}`,baseSceneRevision:creationSceneRevision(document),operations},assets).document;
 };
 const slots=compiled.refinement.digitInkBoxes;
 const digits=inspect(Object.keys(slots)).filter(row=>row.type==='text'&&row.textLines?.lines?.[0]);
 apply('digit-size',digits.map(row=>{
  const ink=row.textLines.lines[0].inkBoundsMm,desired=mmBox(slots[row.id]);
  const scale=Math.min((desired[3]-desired[1])/(ink[3]-ink[1]),(desired[2]-desired[0])/(ink[2]-ink[0]));
  return {op:'layer.update',target:row.id,style:{fontSizePt:row.fontSizePt*scale}};
 }));
 apply('digit-place',inspect(digits.map(row=>row.id)).map(row=>{
  const actual=center(row.textLines.lines[0].inkBoundsMm),desired=center(mmBox(slots[row.id]));
  return {op:'layer.update',target:row.id,place:{reference:'page',at:[row.world.centerMm[0]+desired[0]-actual[0],row.world.centerMm[1]+desired[1]-actual[1]],unit:'mm',rotationDeg:row.id==='bottom-one'?-4:8}};
 }));
 const bodyIds=Object.keys(compiled.refinement.textRegions||{});
 const orphan=row=>row.textLines?.lines?.length>1&&row.textLines.lines.at(-1).text.trim().length<=2;
 const widen=inspect(bodyIds).filter(orphan).map(row=>({op:'layer.update',target:row.id,size:{width:compiled.refinement.textRegions[row.id].maxWidthMm,unit:'mm'}}));
 apply('text-width',widen);
 const reduce=inspect(bodyIds).filter(orphan).map(row=>({op:'layer.update',target:row.id,style:{fontSizePt:row.fontSizePt*.93}}));
 apply('text-fit',reduce);
 const marker=[];
 for(const row of inspect(compiled.refinement.highlightTextIds)){
  if(row.type!=='text'||row.textLines?.status==='canvas-measurement-unavailable')continue;
  for(const [index,line] of row.textLines.lines.entries()){
   const [x0,y0,x1,y1]=line.inkBoundsMm,width=x1-x0;
   if(width<2)continue;
   marker.push({op:'graphic.add',id:`${row.id}-highlight-${index}`,geometry:{kind:'rect'},place:{reference:'page',at:[(x0+x1)/2,y1-.35],unit:'mm'},size:{width:width*.96,height:.9,unit:'mm'},style:{fill:'#E7CC32',opacity:.68},order:{before:row.id}});
  }
 }
 apply('marker',marker);
 return {document,refinement:{digits:digits.map(row=>row.id),markers:marker.map(op=>op.id),modelCalls:0}};
}
