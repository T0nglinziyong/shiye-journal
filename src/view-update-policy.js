// Cloud downloads are distinct from repaint. Matching and Import keep their
// deliberately session-local workspaces intact, but saving a finished import
// still stages its records for background upload.
const noBackgroundPullRoutes=new Set(['matching','import']);
export const shouldPullCloudForRoute=route=>!noBackgroundPullRoutes.has(route);

// Uploads remain independent. Defer collection pulls while drawing, typing or
// immediately after input so bulk cache hydration cannot steal an input frame.
export const canPollDuringEditing=({route,gestureActive,inputFocused,idleMS})=>
  route!=='editor'||!gestureActive&&!inputFocused&&idleMS>=1200;

// Passive collection/detail pages may repaint while in selection mode. This is
// essential for remote delete/restore to remove stale cards on another device.
// Selection IDs are reconciled against fresh cloud data before each repaint.
// Focused inputs, dialogs, popovers and gestures still defer DOM changes.
const passiveRoutes=new Set(['series','library','works','assetDetail','projectPreview']);
export function canApplyBackgroundView({route,selectionMode,modalOpen,popoverOpen,inputFocused,gestureActive}){
  return passiveRoutes.has(route)&&!modalOpen&&!popoverOpen&&!inputFocused&&!gestureActive;
}
