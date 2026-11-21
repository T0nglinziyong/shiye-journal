import {journalBundledFonts} from './journal-font-catalog.js';
const urls=Object.fromEntries(journalBundledFonts.map(font=>[font.family,new URL(`./assets/fonts/${font.webFile}`,import.meta.url)]));
export async function loadJournalWebFont(family){
 if(!Object.hasOwn(urls,family))throw Error('未收录的手写字体');
 const font=new FontFace(family,`url(${JSON.stringify(String(urls[family]))})`,{weight:'400',style:'normal'});
 await font.load();document.fonts.add(font);
}
