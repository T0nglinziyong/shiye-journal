// Recognition method and analysis resolution are independent.
//
// Candidate discovery (legacy, physical or unified) and mask segmentation are
// independent user choices. Legacy+MorphGAC restores the historical flow;
// physical+physical restores the no-MorphGAC contour flow. 'hybrid' performs
// confidence-based selection and does not use the old MorphGAC+GrabCut hybrid.
const refineAuto=async context=>{
  const {refineCandidatesAuto}=await import('./recognition-refiners.js');
  return refineCandidatesAuto(context);
};
const refineMorphGAC=async context=>{
  const {refineCandidatesWithMorphGAC}=await import('./recognition-refiners.js');
  return refineCandidatesWithMorphGAC(context);
};
const refinePhysical=async context=>{
  const {refineCandidatesPhysical}=await import('./recognition-refiners.js');
  return refineCandidatesPhysical(context);
};
const refineAdaptive=async context=>{
  const {refineCandidatesAdaptive}=await import('./recognition-refiners.js');
  return refineCandidatesAdaptive(context);
};
const refineGrabCut=async context=>{
  const {refineCandidatesWithGrabCut}=await import('./recognition-refiners.js');
  return refineCandidatesWithGrabCut(context);
};
export const recognitionStrategies=Object.freeze([
  {
    id:'auto',
    label:'自动 · 推荐',
    description:'默认使用统一候选与轮廓判断；选择传统候选方式时使用对应的边缘细化方法。',
    refineCandidates:refineAuto
  },
  {
    id:'morphgac',
    label:'MorphGAC · 原始分割',
    description:'严格使用旧版 MorphGAC 分割，不运行物理轮廓优先选择。',
    refineCandidates:refineMorphGAC
  },
  {
    id:'physical',
    label:'物理轮廓 · 不使用 MorphGAC',
    description:'优先保留完整载体的实际外边界，无法获得可信边界时标记待检查。',
    refineCandidates:refinePhysical
  },
  {
    id:'grabcut',
    label:'OpenCV · GrabCut',
    description:'按候选框用 GrabCut 分割；适合颜色差明显的素材。',
    refineCandidates:refineGrabCut
  },
  {
    id:'hybrid',
    label:'混合 · Mask 可信度自适应',
    description:'物理轮廓优先，可信度不足才尝试 MorphGAC，并检查明显收缩。',
    refineCandidates:refineAdaptive
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
export const candidateDiscoveryOptions=Object.freeze([['legacy','原版 · 前景连通区域'],['physical','物理载体 · 多尺度边缘与颜色'],['unified','统一候选 · 物理载体与漏检补全']]);
export const candidateDiscoveryAllowed=value=>candidateDiscoveryOptions.some(([id])=>id===value);
export const recognitionMethodDetails=recognitionStrategies.map(({id,label,description})=>({id,label,description}));
export const recognitionModeAllowed=value=>strategiesByID.has(value);
export const recognitionPixelsAllowed=value=>pixelValues.has(Number(value));

export function recognitionProfile(value='auto',analysisMaxDimension=900){
  const mode=strategiesByID.has(value)?value:'auto';
  const pixels=recognitionPixelsAllowed(analysisMaxDimension)?Number(analysisMaxDimension):900;
  const {refineCandidates}=strategiesByID.get(mode);
  return {mode,analysisMaxDimension:pixels,refineCandidates};
}
