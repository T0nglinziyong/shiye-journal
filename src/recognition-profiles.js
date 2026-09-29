// One catalog supplies settings, preference validation and the image pipeline.
// New recognizers declare their analysis budget and optional refinement here;
// the original full-resolution image is still used for the accepted cutout.
const refineSlimSAM = async context => {
  const {refineCandidatesWithSlimSAM} = await import('./recognition-refiners.js');
  return refineCandidatesWithSlimSAM(context);
};

export const recognitionStrategies = Object.freeze([
  {id:'auto', label:'自动 · 按设备'},
  {id:'fast', label:'传统识别 · 快速', analysisMaxDimension:600},
  {id:'standard', label:'传统识别 · 标准', analysisMaxDimension:1000},
  {id:'detail', label:'传统识别 · 精细', analysisMaxDimension:1600},
  {id:'slimsam', label:'浏览器模型 · SlimSAM（试用）', analysisMaxDimension:1000, refineCandidates:refineSlimSAM}
]);
const strategiesByID = new Map(recognitionStrategies.map(strategy => [strategy.id, strategy]));
export const recognitionOptions = recognitionStrategies.map(({id, label}) => [id, label]);
export const recognitionModeAllowed = value => strategiesByID.has(value);

export function recognitionProfile(value='auto', {maxTouchPoints=globalThis.navigator?.maxTouchPoints||0, coarsePointer=globalThis.matchMedia?.('(pointer:coarse)').matches||false}={}) {
  const mode = value !== 'auto' && strategiesByID.has(value)
    ? value : maxTouchPoints > 0 && coarsePointer ? 'fast' : 'standard';
  const {analysisMaxDimension, refineCandidates} = strategiesByID.get(mode);
  return {mode, analysisMaxDimension, refineCandidates};
}
