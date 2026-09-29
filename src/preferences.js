const KEY='shiye-ui-preferences-v1';
const defaults={paperSize:'a4',orientation:'auto',balanceLight:true,wholePaper:true,autoOrganize:true,customPaperWidth:210,customPaperHeight:297,display:'grid',backdrop:'auto'};
export function normalizePreferences(value={}){return {...defaults,...value,autoOrganize:value?.autoOrganize!==false};}
export function loadPreferences(){try{return normalizePreferences(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{return normalizePreferences();}}
export function savePreferences(value){const next=normalizePreferences(value);localStorage.setItem(KEY,JSON.stringify(next));return next;}
