export const recognitionOptions=[['auto','自动 · 按设备'],['fast','传统识别 · 快速'],['standard','传统识别 · 标准'],['detail','传统识别 · 精细']];
export function recognitionProfile(value='auto',{maxTouchPoints=globalThis.navigator?.maxTouchPoints||0,coarsePointer=globalThis.matchMedia?.('(pointer:coarse)').matches||false}={}){
  const mode=['fast','standard','detail'].includes(value)?value:maxTouchPoints>0&&coarsePointer?'fast':'standard';
  return {mode,analysisMaxDimension:{fast:600,standard:1000,detail:1600}[mode]};
}
