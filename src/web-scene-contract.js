import {commonShapes,advancedShapes} from './editor-tools-model.js';
const n=(min=-100000,max=100000)=>({type:'number',minimum:min,maximum:max});
const str={type:'string',maxLength:500000},id={type:'string',minLength:1,maxLength:192};
const bool={type:'boolean'},obj={type:['object','null']},list={type:'array',maxItems:20000};
const fields=(names,schema)=>Object.fromEntries(names.split(' ').map(k=>[k,schema]));
const common={id,type:{type:'string'},...fields('x y width height rotation zIndex',n()),...fields('opacity',n(0,1)),blendMode:{enum:['normal','multiply']},vectorMask:obj,
 ...fields('hidden isHidden isParked parked locked isLocked visible',bool),...fields('key agentKey creativePieceID creativeGroupID creativeRole name role',{type:['string','null'],maxLength:500000}),aiManaged:obj,userOverrideFlags:list,lastTransform:obj};
const geometry=['x','y','width','height'];
const node=(type,properties,required=[])=>({type:'object',properties:{...common,type:{const:type},...properties},required:['id','type',...required],additionalProperties:false});
const material=node('material',{assetID:id,sourceBlobId:id,sourceStaticPath:str,...fields('cropZoom cropOffsetX cropOffsetY',n()),cropRect:obj,cropSteps:list,materialMask:obj,materialSteps:list,operation:obj,materialUnitIndex:{type:'integer',minimum:0,maximum:10000},generationBaseline:obj,craftProvenance:obj,craftDisplaySlices:list,materialRelation:obj,...fields('isFlippedHorizontally manualVisualResize manualVisualCopy',bool)},[...geometry,'assetID','generationBaseline']);
const text=node('text',{content:str,fontSize:n(1,1000),fontName:{type:['string','null'],maxLength:500},style:{enum:['serif','sans','rounded','hand']},color:str,alignment:{enum:['left','center','right']},...fields('bold italic underline strikethrough',bool),...fields('lineSpacing additionalLineSpacing lineHeight paragraphSpacing letterSpacing',n(-1000,1000)),curveHeight:n(-500,500),fixedLineHeight:{type:['number','null'],minimum:0,maximum:1000}},[...geometry,'content','fontSize','color']);
const shape=node('shape',{kind:{enum:[...commonShapes,...advancedShapes].map(([kind])=>kind)},fill:{type:['string','null']},stroke:{type:['string','null']},lineWidth:n(0,1000),fillOpacity:n(0,1),strokeOpacity:n(0,1),strokeDash:{enum:['solid','dash','dot']},cornerRadius:n(0,.5),vectorPaths:list,vectorLayers:list},[...geometry,'kind']);
const ink=node('ink',{agentGenerated:bool,points:{type:'array',minItems:1,maxItems:20000,items:{type:'object',properties:{x:n(),y:n(),p:n(0,1)},required:['x','y'],additionalProperties:false}},width:n(.1,1000),color:str,penStyle:{enum:['pressure','fountain','ballpoint','brush','marker']}},['points','width','color']);
const group=node('group',{children:{type:'array',maxItems:1000,items:{$ref:'#/$defs/node'}},autoInkGroup:bool},['children']);
// Geometry/source semantics are enforced by the shared native and physical
// validators after this published shape contract; no second rendering model.
export const webSceneContract={type:'object',additionalProperties:false,
 properties:{sceneVersion:{const:2},canvas:{type:'object',properties:{width:n(1,10000),height:n(1,10000)},required:['width','height'],additionalProperties:false},pageMode:{enum:['single','spread']},pageRatio:str,physicalPageHeightMM:n(.1,10000),style:str,paperColor:str,paperPattern:{enum:['plain','lines','grid','dots','columns']},paperColumns:bool,paperRuling:n(0,1000),drawCenterGutter:bool,layers:{type:'array',maxItems:5000,items:{$ref:'#/$defs/node'}},craftScraps:list},
 required:['sceneVersion','canvas','pageMode','pageRatio','physicalPageHeightMM','layers'],
 $defs:{node:{anyOf:[material,text,shape,ink,group]}}};
