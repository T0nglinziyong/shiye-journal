// One catalog supplies settings, preference validation and the image pipeline.
// Browser contour engines are parity-tested ports of scikit-image. OpenCV
// algorithms use the same OpenCV.js WASM core as the existing recognition path.
const refineSlimSAM=async context=>{
  const {refineCandidatesWithSlimSAM}=await import('./recognition-refiners.js');
  return refineCandidatesWithSlimSAM(context);
};
const refineHybrid=async context=>{
  const {refineCandidatesHybrid}=await import('./recognition-refiners.js');
  return refineCandidatesHybrid(context);
};
const refineMorphGAC=async context=>{
  const {refineCandidatesWithMorphGAC}=await import('./recognition-refiners.js');
  return refineCandidatesWithMorphGAC(context);
};
const refineActive=async context=>{
  const {refineCandidatesWithActiveContour}=await import('./recognition-refiners.js');
  return refineCandidatesWithActiveContour(context);
};
const refineGrabCut=async context=>{
  const {refineCandidatesWithGrabCut}=await import('./recognition-refiners.js');
  return refineCandidatesWithGrabCut(context);
};

export const recognitionStrategies=Object.freeze([
  {id:'auto',label:'自动混合 · Active + GrabCut + MorphGAC',analysisMaxDimension:1200,refineCandidates:refineHybrid},
  {id:'fast',label:'传统识别 · 快速',analysisMaxDimension:900},
  {id:'standard',label:'传统识别 · 标准',analysisMaxDimension:1200},
  {id:'detail',label:'传统识别 · 精细',analysisMaxDimension:1600},
  {id:'hybrid',label:'组合识别 · Active + GrabCut + MorphGAC',analysisMaxDimension:1200,refineCandidates:refineHybrid},
  {id:'active',label:'浏览器轮廓 · Active Contour（快速高质量）',analysisMaxDimension:1200,refineCandidates:refineActive},
  {id:'grabcut',label:'OpenCV · GrabCut',analysisMaxDimension:1200,refineCandidates:refineGrabCut},
  {id:'morphgac',label:'浏览器轮廓 · MorphGAC（高质量）',analysisMaxDimension:1200,refineCandidates:refineMorphGAC},
  {id:'slimsam',label:'浏览器模型 · SlimSAM（试用）',analysisMaxDimension:1000,refineCandidates:refineSlimSAM}
]);
const strategiesByID=new Map(recognitionStrategies.map(strategy=>[strategy.id,strategy]));
export const recognitionOptions=recognitionStrategies.map(({id,label})=>[id,label]);
export const recognitionModeAllowed=value=>strategiesByID.has(value);

export function recognitionProfile(value='auto'){
  const mode=strategiesByID.has(value)?value:'auto';
  const {analysisMaxDimension,refineCandidates}=strategiesByID.get(mode);
  return {mode,analysisMaxDimension,refineCandidates};
}
