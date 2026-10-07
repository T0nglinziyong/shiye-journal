import {recognitionModeAllowed,recognitionPixelsAllowed} from './recognition-profiles.js';
const KEY='shiye-ui-preferences-v1';
const defaults={
  paperSize:'a4',orientation:'auto',wholePaper:true,autoOrganize:true,
  recognition:'auto',recognitionPixels:900,
  // Real-case default: whole-page box discovery is most stable on the raw
  // rectified RGB. Optional raster preprocessing remains user-selectable for
  // boundary segmentation, but is disabled by default.
  balanceLight:false,
  recognitionDenoise:false,
  recognitionLocalContrast:false,
  recognitionChromaEdges:true,
  // Final automatic finishing is intentionally small: geometry cleanup plus
  // precision-first manufactured aperture recovery.
  recognitionShapeRegularization:true,
  recognitionApertures:true,
  customPaperWidth:210,customPaperHeight:297,display:'grid',backdrop:'auto',maxPageItems:0
};
const migrateRecognition=value=>{
  if(recognitionModeAllowed(value))return value;
  // Preserve old local preferences after removing obsolete engines.
  if(value==='traditional')return 'grabcut';
  if(value==='active')return 'morphgac';
  if(value==='slimsam')return 'auto';
  return 'auto';
};
export function normalizePreferences(value={}){
  return {...defaults,...value,
    recognition:migrateRecognition(value?.recognition),
    recognitionPixels:recognitionPixelsAllowed(value?.recognitionPixels)?Number(value.recognitionPixels):900,
    balanceLight:value?.balanceLight===true,
    recognitionDenoise:value?.recognitionDenoise===true,
    recognitionLocalContrast:value?.recognitionLocalContrast===true,
    recognitionChromaEdges:value?.recognitionChromaEdges!==false,
    recognitionShapeRegularization:value?.recognitionShapeRegularization!==false,
    recognitionApertures:value?.recognitionApertures!==false,
    autoOrganize:value?.autoOrganize!==false,
    maxPageItems:[20,40,80].includes(Number(value?.maxPageItems))?Number(value.maxPageItems):0
  };
}
export function loadPreferences(){try{return normalizePreferences(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{return normalizePreferences();}}
export function savePreferences(value){const next=normalizePreferences(value);localStorage.setItem(KEY,JSON.stringify(next));return next;}
