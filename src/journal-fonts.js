// One preset/default vocabulary for editor, online AI and offline commands.
// The hosted app loads its licensed dependency on demand. Exported task ZIPs
// contain font names only and must use fonts actually installed in the host.
export const DEFAULT_TEXT_PRESET='hand';
export const journalFontPresets=Object.freeze([
 ['hand','艺术手写'],['serif','文艺宋体'],['rounded','圆润字体'],['sans','清晰黑体']
]);
export const journalFontCandidates=Object.freeze({
 hand:['Ma Shan Zheng','Kaiti SC','STKaiti','KaiTi','AR PL KaitiM GB','AR PL UKai CN'],
 serif:['Songti SC','Noto Serif CJK SC','Source Han Serif SC'],
 rounded:['Arial Rounded MT Bold','Hiragino Maru Gothic ProN','Noto Sans CJK SC'],
 sans:['PingFang SC','Noto Sans CJK SC','Microsoft YaHei']
});
export function journalFontFamily(node){
 const preset=node.style||DEFAULT_TEXT_PRESET;
 const names=journalFontCandidates[preset]||journalFontCandidates.hand;
 const generic=preset==='serif'?'serif':preset==='hand'?'cursive':'sans-serif';
 return [...new Set([node.fontName,...names].filter(Boolean))].map(name=>JSON.stringify(name)).join(',')+','+generic;
}
let webFontLoader,webFontReady;
export function configureJournalFontLoader(loader){webFontLoader=loader;webFontReady=undefined;}
export async function prepareJournalFont(node){
 const usesHand=(!node.fontName&&(node.style||DEFAULT_TEXT_PRESET)==='hand')||node.fontName==='Ma Shan Zheng';
 let status='system-fonts';
 if(usesHand&&webFontLoader){
  webFontReady||=Promise.resolve().then(webFontLoader).catch(error=>{webFontReady=undefined;throw error;});
  try{await webFontReady;status='web-artistic-ready';}catch{status='web-artistic-unavailable';}
 }
 const fonts=globalThis.document?.fonts;
 if(fonts){const spec=`${node.italic?'italic ':''}${node.bold?'bold ':''}${node.fontSize||32}px ${journalFontFamily(node)}`;
  await fonts.load(spec,String(node.content||'手帐文字'));
 }
 return status;
}
