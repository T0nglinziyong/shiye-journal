// Cloud data may arrive at any time. Only passive collection/detail screens
// can be replaced in place; editing, selection, dialogs and inputs win over a
// background repaint. The next safe idle point or navigation applies it.
const passiveRoutes=new Set(['series','library','works','assetDetail','projectPreview']);
export function canApplyBackgroundView({route,selectionMode,modalOpen,popoverOpen,inputFocused,gestureActive}){
  return passiveRoutes.has(route)&&!selectionMode&&!modalOpen&&!popoverOpen&&!inputFocused&&!gestureActive;
}
