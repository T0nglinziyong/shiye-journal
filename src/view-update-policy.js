// Cloud downloads are distinct from repaint. Matching and Import keep their
// deliberately session-local workspaces intact, but saving a finished import
// still stages its records for background upload.
const noBackgroundPullRoutes=new Set(['matching','import']);
export const shouldPullCloudForRoute=route=>!noBackgroundPullRoutes.has(route);

// Uploads remain independent. Defer collection pulls while navigating,
// scrolling, drawing or typing so cache hydration cannot steal an input frame.
export const canPollDuringEditing=({route,gestureActive,inputFocused,idleMS})=>
  !gestureActive&&!inputFocused&&idleMS>=(route==='editor'?1800:1000);

// A background commit for an unrelated collection must not repaint the page
// the user is scrolling. Navigation still reads the updated shared state.
const visibleCollections={
  series:['assets','series','trash','meta'],
  library:['assets','series','trash','meta'],
  assetDetail:['assets','series','meta'],
  // Imported asset metadata does not change the Works cards. Their cover
  // images hydrate independently through the image loader.
  works:['projects','trash','meta'],
  projectPreview:['projects','assets','meta']
};
export const shouldRepaintForCollections=(route,stores,changedKeys)=>{
  const used=visibleCollections[route];
  if(!used)return true;
  if(stores.some(store=>store!=='meta'&&used.includes(store)))return true;
  if(!stores.includes('meta')||!used.includes('meta'))return false;
  // Matching and AI settings are account data, but changing them cannot
  // alter a visible catalog card. Unknown metadata stays conservative.
  if(!Array.isArray(changedKeys))return true;
  return changedKeys.some(key=>key.store==='meta'&&
    !['app-matching-defaults','app-ai-settings'].includes(key.id));
};

// Passive collection/detail pages may repaint while in selection mode. This is
// essential for remote delete/restore to remove stale cards on another device.
// Selection IDs are reconciled against fresh cloud data before each repaint.
// Focused inputs, dialogs, popovers and gestures still defer DOM changes.
const passiveRoutes=new Set(['series','library','works','assetDetail','projectPreview']);
export function canApplyBackgroundView({route,selectionMode,modalOpen,popoverOpen,inputFocused,gestureActive,idleMS=Infinity}){
  return passiveRoutes.has(route)&&!modalOpen&&!popoverOpen&&!inputFocused&&!gestureActive&&idleMS>=900;
}
