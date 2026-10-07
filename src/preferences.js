import {recognitionModeAllowed,recognitionPixelsAllowed} from './recognition-profiles.js';
const KEY='shiye-ui-preferences-v1';
const defaults={
  paperSize:'a4',orientation:'auto',wholePaper:true,autoOrganize:true,
  recognition:'auto',recognitionPixels:1200,
  balanceLight:true,
  recognitionDenoise:true,
  recognitionLocalContrast:true,
  recognitionChromaEdges:true,
  recognitionEdgePolish:true,
  recognitionStraightEdges:true,
  recognitionCurveSmooth:true,
  recognitionEllipseRegularization:true,
  recognitionApertures:true,
  customPaperWidth:210,customPaperHeight:297,display:'grid',backdrop:'auto',maxPageItems:0
};
export function normalizePreferences(value={}){
  return {...defaults,...value,
    recognition:recognitionModeAllowed(value?.recognition)?value.recognition:'auto',
    recognitionPixels:recognitionPixelsAllowed(value?.recognitionPixels)?Number(value.recognitionPixels):1200,
    balanceLight:value?.balanceLight!==false,
    recognitionDenoise:value?.recognitionDenoise!==false,
    recognitionLocalContrast:value?.recognitionLocalContrast!==false,
    recognitionChromaEdges:value?.recognitionChromaEdges!==false,
    recognitionEdgePolish:value?.recognitionEdgePolish!==false,
    recognitionStraightEdges:value?.recognitionStraightEdges!==false,
    recognitionCurveSmooth:value?.recognitionCurveSmooth!==false,
    recognitionEllipseRegularization:value?.recognitionEllipseRegularization!==false,
    recognitionApertures:value?.recognitionApertures!==false,
    autoOrganize:value?.autoOrganize!==false,
    maxPageItems:[20,40,80].includes(Number(value?.maxPageItems))?Number(value.maxPageItems):0
  };
}
export function loadPreferences(){try{return normalizePreferences(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{return normalizePreferences();}}
export function savePreferences(value){const next=normalizePreferences(value);localStorage.setItem(KEY,JSON.stringify(next));return next;}
