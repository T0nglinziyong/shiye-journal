import {recognitionModeAllowed,recognitionPixelsAllowed} from './recognition-profiles.js';
const KEY='shiye-ui-preferences-v1';
const defaults={paperSize:'a4',orientation:'auto',balanceLight:true,wholePaper:true,autoOrganize:true,recognition:'auto',recognitionPixels:1200,customPaperWidth:210,customPaperHeight:297,display:'grid',backdrop:'auto',maxPageItems:0};
export function normalizePreferences(value={}){
  return {...defaults,...value,
    recognition:recognitionModeAllowed(value?.recognition)?value.recognition:'auto',
    recognitionPixels:recognitionPixelsAllowed(value?.recognitionPixels)?Number(value.recognitionPixels):1200,
    autoOrganize:value?.autoOrganize!==false,
    maxPageItems:[20,40,80].includes(Number(value?.maxPageItems))?Number(value.maxPageItems):0
  };
}
export function loadPreferences(){try{return normalizePreferences(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{return normalizePreferences();}}
export function savePreferences(value){const next=normalizePreferences(value);localStorage.setItem(KEY,JSON.stringify(next));return next;}
