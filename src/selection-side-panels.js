// Sibling choices for the fixed "更多操作" popover. The parent is sized
// and positioned BEFORE it first appears. Opening/closing a child never
// changes the parent's width, shape, left or top.
// Both surfaces use the same popover lifecycle (outside click / Escape).
let nextSideID=0;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const MARGIN=12, GAP=8;

// On a 320px phone a 245px parent leaves no usable space for a child.
// Choose a compact but readable size FROM THE FIRST OPEN, not on expansion.
export function selectionMenuWidth(viewportWidth){
  return Math.min(245,Math.max(132,Math.floor((viewportWidth-32)*.46)));
}

const usableSideMinimum=(viewportWidth,parentWidth)=>
  Math.min(parentWidth,Math.max(0,viewportWidth-2*MARGIN-GAP-parentWidth));

// Called during the parent popover's normal initial placement and resizes,
// NEVER by a child click. Keep the natural left whenever the right or left
// has enough space, in precisely that order; otherwise reserve space by
// positioning the parent left from the beginning.
export function reserveSelectionMenuSpace({left,width,viewportWidth}){
  const right=viewportWidth-MARGIN-(left+width+GAP);
  const leftAvailable=left-MARGIN-GAP;
  const minimum=usableSideMinimum(viewportWidth,width);
  return {left:right>=minimum||leftAvailable>=minimum
    ?left:MARGIN,shifted:right<minimum&&leftAvailable<minimum};
}
export function selectionSideGeometry({viewportWidth,viewportHeight,menu,panelHeight=320}){
  const rightAvailable=Math.max(0,viewportWidth-MARGIN-menu.right-GAP);
  const leftAvailable=Math.max(0,menu.left-MARGIN-GAP);
  const minimum=usableSideMinimum(viewportWidth,menu.width);
  const desired=menu.width;
  // Right -> left, with no parent translation while the child opens.
  const side=rightAvailable>=minimum||leftAvailable<minimum?'right':'left';
  const space=side==='right'?rightAvailable:leftAvailable;
  const panelWidth=Math.min(desired,space);
  const panelLeft=side==='right'?menu.right+GAP:menu.left-GAP-panelWidth;
  // Only the child may move vertically if its content is taller than the
  // remaining viewport; the parent retains its original coordinates.
  const wanted=Math.min(360,Math.max(140,panelHeight));
  const top=clamp(menu.top,MARGIN,Math.max(MARGIN,viewportHeight-MARGIN-wanted));
  const maxHeight=Math.max(100,viewportHeight-MARGIN-top);
  return {parentLeft:menu.left,parentWidth:menu.width,
    panelLeft,panelWidth,top,maxHeight,side};
}
