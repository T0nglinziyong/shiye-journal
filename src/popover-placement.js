// Viewport-safe popup placement shared by editor, picker and catalog actions.
// Never choose a negative "above" position just because full popup does not
// fit below: scroll within the available space beneath the toolbar instead.
export function popupPlacement({anchor,viewportWidth,viewportHeight,popupWidth,popupHeight,picker=false}){
  const margin=12,gap=8;
  const width=Math.max(1,Math.min(popupWidth,viewportWidth-2*margin));
  const below=Math.max(0,viewportHeight-anchor.bottom-gap-margin);
  const above=Math.max(0,anchor.top-gap-margin);
  const preferred=Math.max(80,Math.min(viewportHeight-2*margin,viewportHeight*(picker?.70:.78)));
  // An editor's near-top toolbar must open downward even if the menu needs
  // to scroll. Only use above when below is genuinely too short.
  const side=below>=Math.min(preferred,180)||below>=above?'below':'above';
  const room=side==='below'?below:above;
  const maxHeight=Math.max(1,Math.floor(Math.min(preferred,room)));
  const height=Math.max(1,Math.min(popupHeight,maxHeight));
  const left=Math.max(margin,Math.min(anchor.left,viewportWidth-width-margin));
  const rawTop=side==='below'?anchor.bottom+gap:anchor.top-gap-height;
  const top=Math.max(margin,Math.min(rawTop,viewportHeight-height-margin));
  return {left,top,width,maxHeight,side};
}
