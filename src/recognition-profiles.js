// Recognition method and analysis resolution are intentionally independent.
// Browser contour engines are parity-tested ports of scikit-image. OpenCV
// algorithms use the same OpenCV.js WASM core as the existing recognition path.
const refineSlimSAM=async context=>{
  const {refineCandidatesWithSlimSAM}=await import('./recognition-refiners.js');
  return refineCandidatesWithSlimSAM(context);
};
const refineTraditional=async context=>{
  const {refineCandidatesPostprocess}=await import('./recognition-refiners.js');
  return refineCandidatesPostprocess(context);
};
const refineAuto=async context=>{
  const {refineCandidatesAuto}=await import('./recognition-refiners.js');
  return refineCandidatesAuto(context);
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
  {id:'auto',label:'自动 · 传统识别 + 高质量补边',description:'默认推荐。先用传统 OpenCV 找素材，只对不确定边界调用高质量轮廓算法；速度与稳定性较均衡。',refineCandidates:refineAuto},
  {id:'traditional',label:'传统识别 · OpenCV',description:'速度最快、资源占用低，规则纸片通常很好；对白纸载体、弱边缘和复杂自由轮廓更依赖拍摄质量。',refineCandidates:refineTraditional},
  {id:'hybrid',label:'组合识别 · MorphGAC + GrabCut',description:'先用 MorphGAC 找整体轮廓，再用原分辨率 GrabCut 精修。当前真实样例中整体最稳，但比传统识别更耗时。',refineCandidates:refineHybrid},
  {id:'active',label:'轮廓识别 · Active Contour',description:'对已有较好初始边界时速度较快、轮廓连续；对强内部纹理较敏感，需要可靠 rough mask。',refineCandidates:refineActive},
  {id:'grabcut',label:'OpenCV · GrabCut',description:'有较好前景/背景种子时非常精确，边缘细；如果初始 mask 太粗，可能粘到背景或内部印刷。',refineCandidates:refineGrabCut},
  {id:'morphgac',label:'轮廓识别 · MorphGAC',description:'弱边缘和复杂载体上最稳，当前 180 px / 80 次附近已基本收敛；计算量高于传统方法。',refineCandidates:refineMorphGAC},
  {id:'slimsam',label:'浏览器模型 · SlimSAM（试用）',description:'适合传统视觉困难的语义边界；首次需要下载模型，耗内存更高，且模型结果仍需本地几何校验。',refineCandidates:refineSlimSAM}
]);
export const recognitionPixelOptions=Object.freeze([
  [900,'900 px'],
  [1200,'1200 px'],
  [1600,'1600 px']
]);
const strategiesByID=new Map(recognitionStrategies.map(strategy=>[strategy.id,strategy]));
const pixelValues=new Set(recognitionPixelOptions.map(([value])=>value));
export const recognitionOptions=recognitionStrategies.map(({id,label})=>[id,label]);
export const recognitionMethodDetails=recognitionStrategies.map(({id,label,description})=>({id,label,description}));
export const recognitionModeAllowed=value=>strategiesByID.has(value);
export const recognitionPixelsAllowed=value=>pixelValues.has(Number(value));

export function recognitionProfile(value='auto',analysisMaxDimension=1200){
  const mode=strategiesByID.has(value)?value:'auto';
  const pixels=recognitionPixelsAllowed(analysisMaxDimension)?Number(analysisMaxDimension):1200;
  const {refineCandidates}=strategiesByID.get(mode);
  return {mode,analysisMaxDimension:mode==='auto'?900:pixels,refineCandidates};
}
