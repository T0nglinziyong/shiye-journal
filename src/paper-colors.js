// A spread may override its shared paperColor without creating canvas objects.
export function validatePaperColors(colors){
 if(colors===undefined)return;
 if(!colors||typeof colors!=='object'||Array.isArray(colors)||Object.keys(colors).length!==2||!['left','right'].every(side=>/^#[0-9a-fA-F]{6}$/.test(colors[side])))throw Error('双页底色需要 left/right 两个六位 HEX 颜色');
}
export function paperColorFor(page,side='left'){
 return page.pageMode==='spread'&&page.paperColors?page.paperColors[side]:page.paperColor||'#fcfaf0';
}
export function paperBackgroundCSS(page){
 return page.pageMode==='spread'&&page.paperColors?`linear-gradient(to right, ${page.paperColors.left} 50%, ${page.paperColors.right} 50%)`:page.paperColor||'#fcfaf0';
}
