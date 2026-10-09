// Recognition method and analysis resolution are independent.
//
// All user-facing methods share the same validated whole-page box discovery.
// The method only controls per-box boundary segmentation; no segmenter may
// create/delete/merge material identities.
// Final release contract: auto/MorphGAC/GrabCut/hybrid share one box-discovery stage.
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
    description:'推荐：逐件 MorphGAC 贴边，随后规整形状并恢复规则打孔。',
    refineCandidates:refineAuto
  },
  {
    id:'morphgac',
    label:'MorphGAC · 高质量',
    description:'与自动模式相同，显式固定 MorphGAC。',
    refineCandidates:refineMorphGAC
  },
  {
    id:'grabcut',
    label:'OpenCV · GrabCut',
    description:'按候选框用 GrabCut 分割；适合颜色差明显的素材。',
    refineCandidates:refineGrabCut
  },
  {
    id:'hybrid',
    label:'混合 · MorphGAC + GrabCut',
    description:'MorphGAC 后再尝试 GrabCut；较慢，用于对照。',
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
  const pixels=recognitionPixelsAllowed(analysisMaxDimension)?Number(analysisMaxDimension):900;
  const {refineCandidates}=strategiesByID.get(mode);
  return {mode,analysisMaxDimension:pixels,refineCandidates};
}
