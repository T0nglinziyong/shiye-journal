// One semantic font choice for manual text and every AI creation path. Existing
// explicit choices are never migrated. No font bytes are stored in Scene/ZIP.
export const DEFAULT_TEXT_PRESET='hand';
export const textFontPresets=Object.freeze([
 {id:'hand',label:'艺术手写',families:['Ma Shan Zheng','Kaiti SC','STKaiti','KaiTi','Noto Serif CJK SC'],fallback:'cursive'},
 {id:'serif',label:'宋体',families:['Songti SC','Noto Serif CJK SC','SimSun'],fallback:'serif'},
 {id:'sans',label:'黑体',families:['PingFang SC','Microsoft YaHei','Noto Sans CJK SC'],fallback:'sans-serif'},
 {id:'rounded',label:'圆体',families:['Arial Rounded MT Bold','Yuanti SC','YouYuan'],fallback:'sans-serif'}
]);
export function resolvedTextFontFamily(node){
 const preset=textFontPresets.find(p=>p.id===(node.style||DEFAULT_TEXT_PRESET))||textFontPresets[0];
 const names=[...new Set([node.fontName,...preset.families].filter(Boolean))];
 return names.map(name=>JSON.stringify(name)).join(',')+','+preset.fallback;
}
