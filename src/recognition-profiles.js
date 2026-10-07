// Recognition method and analysis resolution are independent.
//
// All user-facing methods share the same validated whole-page box discovery.
// The method only controls per-box boundary segmentation; no segmenter may
// create/delete/merge material identities.
const refineAuto=async context=>{
  const {refineCandidatesAuto}=await import('./recognition-refiners.js');
  return refineCandidatesAuto(context);
};
const refineMorphGAC=async context=>{
  const {refineCandidatesAuto}=await import('./recognition-refiners.js');
  return refineCandidatesAuto(context);
};
const refineGrabCut=async context=>{
  const {refineCandidatesWithGrabCut}=await import('./recognition-refiners.js');
  return refineCandidatesWithGrabCut(context);
};
const refineHybrid=async context=>{
  const {refineCandidatesHybrid}=await import('./recognition-refiners.js');
  return refineCandidatesHybrid(context);
};

export const recognitionStrategies=Object.freeze([
  {
    id:'auto',
    label:'自动 · 推荐',
    description:'使用当前验证最佳流程：自动框选后，以 MorphGAC 从外向内贴合真实边缘，并进行形状规整与保守打孔恢复。',
    refineCandidates:refineAuto
  },
  {
    id:'morphgac',
    label:'MorphGAC · 高质量',
    description:'固定使用当前最佳 MorphGAC 参数；适合白色载体、弱边缘和自由轮廓。结果与“自动”一致，便于显式锁定算法。',
    refineCandidates:refineMorphGAC
  },
  {
    id:'grabcut',
    label:'OpenCV · GrabCut',
    description:'使用 OpenCV GrabCut 从自动候选框细化边缘。速度和表现受前景/背景颜色可分性影响，保留用于对比和特殊照片。',
    refineCandidates:refineGrabCut
  },
  {
    id:'hybrid',
    label:'混合 · MorphGAC + GrabCut',
    description:'先用 MorphGAC 找整体轮廓，再用 GrabCut 做一次边缘精修。真实案例收益很小且更慢，因此不作为默认。',
    refineCandidates:refineHybrid
  }
]);

export const recognitionPixelOptions=Object.freeze([
  [900,'900 px（推荐）'],
  [1200,'1200 px'],
  [1600,'1600 px']
]);
const strategiesByID=new Map(recognitionStrategies.map(strategy=>[strategy.id,strategy]));
const pixelValues=new Set(recognitionPixelOptions.map(([value])=>value));
export const recognitionOptions=recognitionStrategies.map(({id,label})=>[id,label]);
export const recognitionMethodDetails=recognitionStrategies.map(({id,label,description})=>({id,label,description}));
export const recognitionModeAllowed=value=>strategiesByID.has(value);
export const recognitionPixelsAllowed=value=>pixelValues.has(Number(value));

export function recognitionProfile(value='auto',analysisMaxDimension=900){
  const mode=strategiesByID.has(value)?value:'auto';
  const requested=recognitionPixelsAllowed(analysisMaxDimension)?Number(analysisMaxDimension):900,
    pixels=mode==='auto'||mode==='morphgac'?900:requested;
  const {refineCandidates}=strategiesByID.get(mode);
  return {mode,analysisMaxDimension:pixels,refineCandidates};
}
