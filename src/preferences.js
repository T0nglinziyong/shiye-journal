const KEY='shiye-ui-preferences-v1';
const defaults={paperSize:'a4',orientation:'auto',balanceLight:true,wholePaper:true,customPaperWidth:210,customPaperHeight:297,display:'grid',backdrop:'auto'};
export function loadPreferences(){try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{return {...defaults};}}
export function savePreferences(value){const next={...defaults,...value};localStorage.setItem(KEY,JSON.stringify(next));return next;}
