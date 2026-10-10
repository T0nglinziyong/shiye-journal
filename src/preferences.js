import {recognitionModeAllowed,recognitionPixelsAllowed} from './recognition-profiles.js';
const KEY='shiye-ui-preferences-v1',RECOGNITION_DEFAULTS_VERSION=2;
const defaults={
  paperSize:'a4',orientation:'auto',wholePaper:true,autoOrganize:true,autoOrganizeWorks:true,
  recognition:'auto',recognitionPixels:900,materialColorMode:'auto',
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
  const {recognitionEdgePolish:_oldEdgePolish,recognitionCurveSmooth:_oldCurveSmooth,...current}=value||{};
  return {...defaults,...current,
    recognition:migrateRecognition(value?.recognition),
    materialColorMode:value?.materialColorMode==='original'?'original':'auto',
    recognitionPixels:recognitionPixelsAllowed(value?.recognitionPixels)?Number(value.recognitionPixels):900,
    balanceLight:value?.balanceLight===true,
    recognitionDenoise:value?.recognitionDenoise===true,
    recognitionLocalContrast:value?.recognitionLocalContrast===true,
    recognitionChromaEdges:value?.recognitionChromaEdges!==false,
    recognitionShapeRegularization:value?.recognitionShapeRegularization!==false,
    recognitionApertures:value?.recognitionApertures!==false,
    autoOrganize:value?.autoOrganize!==false,autoOrganizeWorks:value?.autoOrganizeWorks!==false,
    maxPageItems:[20,40,80].includes(Number(value?.maxPageItems))?Number(value.maxPageItems):0
  };
}
export function migrateStoredPreferences(value={}){
  if(value?.recognitionDefaultsVersion===RECOGNITION_DEFAULTS_VERSION)return value;
  // Recognition semantics changed substantially (new whole-page boxes +
  // MorphGAC defaults). Reset only recognition-related legacy values once so
  // old defaults such as 1200 px, preprocessing-on or chroma-off cannot leak
  // into the new pipeline. Unrelated UI/paper preferences are preserved.
  return {...value,
    recognition:'auto',recognitionPixels:900,
    balanceLight:false,recognitionDenoise:false,recognitionLocalContrast:false,recognitionChromaEdges:true,
    recognitionShapeRegularization:true,recognitionApertures:true,
    recognitionDefaultsVersion:RECOGNITION_DEFAULTS_VERSION
  };
}
export function loadPreferences(){
  try{return normalizePreferences(migrateStoredPreferences(JSON.parse(localStorage.getItem(KEY)||'{}')));}
  catch{return normalizePreferences(migrateStoredPreferences({}));}
}
export function savePreferences(value){
  const next={...normalizePreferences(value),recognitionDefaultsVersion:RECOGNITION_DEFAULTS_VERSION};
  localStorage.setItem(KEY,JSON.stringify(next));return next;
}
