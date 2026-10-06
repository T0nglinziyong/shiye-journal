// Recognition method and analysis resolution are intentionally independent.
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
  {id:'auto',label:'自动混合 · Active + GrabCut + MorphGAC',refineCandidates:refineHybrid},
  {id:'traditional',label:'传统识别 · OpenCV 基础'},
  {id:'hybrid',label:'组合识别 · Active + GrabCut + MorphGAC',refineCandidates:refineHybrid},
  {id:'active',label:'浏览器轮廓 · Active Contour',refineCandidates:refineActive},
  {id:'grabcut',label:'OpenCV · GrabCut',refineCandidates:refineGrabCut},
  {id:'morphgac',label:'浏览器轮廓 · MorphGAC',refineCandidates:refineMorphGAC},
  {id:'slimsam',label:'浏览器模型 · SlimSAM（试用）',refineCandidates:refineSlimSAM}
]);
export const recognitionPixelOptions=Object.freeze([
  [900,'900 px'],
  [1200,'1200 px'],
  [1600,'1600 px']
]);
const strategiesByID=new Map(recognitionStrategies.map(strategy=>[strategy.id,strategy]));
const pixelValues=new Set(recognitionPixelOptions.map(([value])=>value));
export const recognitionOptions=recognitionStrategies.map(({id,label})=>[id,label]);
export const recognitionModeAllowed=value=>strategiesByID.has(value);
export const recognitionPixelsAllowed=value=>pixelValues.has(Number(value));

export function recognitionProfile(value='auto',analysisMaxDimension=1200){
  const mode=strategiesByID.has(value)?value:'auto';
  const pixels=recognitionPixelsAllowed(analysisMaxDimension)?Number(analysisMaxDimension):1200;
  const {refineCandidates}=strategiesByID.get(mode);
  return {mode,analysisMaxDimension:pixels,refineCandidates};
}
