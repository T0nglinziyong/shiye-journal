// One catalog supplies settings, preference validation and the image pipeline.
// The browser engines refine the same traditional proposals; they do not
// replace A4 rectification, candidate discovery, or physical-size recovery.
const lazyRefiner=name=>async context=>{
  const mod=await import('./recognition-refiners.js');
  return mod[name](context);
};

export const recognitionStrategies = Object.freeze([
  {id:'auto', label:'自动 · 混合识别', analysisMaxDimension:1200, refineCandidates:lazyRefiner('refineCandidatesWithHybrid')},
  {id:'fast', label:'传统识别 · 快速', analysisMaxDimension:900},
  {id:'standard', label:'传统识别 · 标准', analysisMaxDimension:1200},
  {id:'detail', label:'高质量 · Active Contour', analysisMaxDimension:1600, refineCandidates:lazyRefiner('refineCandidatesWithActiveContour')},
  {id:'active-contour', label:'Active Contour · 浏览器', analysisMaxDimension:1400, refineCandidates:lazyRefiner('refineCandidatesWithActiveContour')},
  {id:'morphgac', label:'MorphGAC · 浏览器', analysisMaxDimension:1200, refineCandidates:lazyRefiner('refineCandidatesWithMorphGAC')},
  {id:'grabcut', label:'GrabCut · 浏览器', analysisMaxDimension:1200, refineCandidates:lazyRefiner('refineCandidatesWithGrabCut')},
  {id:'slimsam', label:'SlimSAM · 浏览器模型', analysisMaxDimension:1000, refineCandidates:lazyRefiner('refineCandidatesWithSlimSAM')}
]);
const strategiesByID = new Map(recognitionStrategies.map(strategy => [strategy.id, strategy]));
export const recognitionOptions = recognitionStrategies.map(({id, label}) => [id, label]);
export const recognitionModeAllowed = value => strategiesByID.has(value);

export function recognitionProfile(value='auto') {
  const strategy=strategiesByID.get(strategiesByID.has(value)?value:'auto');
  return {mode:strategy.id,analysisMaxDimension:strategy.analysisMaxDimension,refineCandidates:strategy.refineCandidates};
}
