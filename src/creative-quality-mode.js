// User-facing quality intent, independent of provider protocol or export type.
// A concept pass is an extra *internal* model request, never a user turn.
export const CREATIVE_QUALITY_OPTIONS=Object.freeze([
 ['quick','快速创作','模型自行构思后直接生成；不强制增加请求。'],
 ['balanced','精细创作','先比较三种设计方向，再生成可编辑作品并复核画面。'],
 ['studio','高质量创作','更发散的构思与额外的视觉修订机会；耗时和费用更高。']
]);
export function creativeQualityProfile(value='balanced'){
 const mode=CREATIVE_QUALITY_OPTIONS.some(([id])=>id===value)?value:'balanced';
 return {
  mode,
  conceptCount:mode==='quick'?0:mode==='studio'?4:3,
  // Keep at least this many calls for final visual inspection if the provider
  // supports images, rather than allowing JSON-repair retries to consume all.
  reservedVisualRequests:mode==='quick'?0:mode==='studio'?2:1,
  plan:mode!=='quick'
 };
}
