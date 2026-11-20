import manifest from './assets/fonts/manifest.json' with {type:'json'};
export const journalBundledFonts=Object.freeze(manifest.fonts.map(font=>Object.freeze(font)));
export const journalFontChoices=Object.freeze([['','跟随字体风格'],...journalBundledFonts.map(f=>[f.family,f.label])]);
export function journalFontDependencies(node){
 const family=node.fontName||((node.style||'hand')==='hand'?'Ma Shan Zheng':null);
 const chosen=journalBundledFonts.find(f=>f.family===family);
 return chosen?[chosen,...(chosen.fallbacks||[]).map(name=>journalBundledFonts.find(f=>f.family===name)).filter(Boolean)]:[];
}
