// Only non-secret UI, printing and recognition preferences are shared.
// Explicit allowlist: never serialize provider credentials or unknown keys.
export const CLOUD_PREFERENCES_ID='app-ui-preferences';
const safeFields=new Set([
  'paperSize','orientation','wholePaper','autoOrganize','autoOrganizeWorks',
  'recognition','recognitionPixels','materialColorMode','balanceLight',
  'recognitionDenoise','recognitionLocalContrast','recognitionChromaEdges',
  'recognitionShapeRegularization','recognitionApertures',
  'customPaperWidth','customPaperHeight','display','backdrop','maxPageItems',
  'recognitionDefaultsVersion'
]);
export const cloudPreferencesRecord=(preferences,updatedAt=new Date().toISOString())=>({
  id:CLOUD_PREFERENCES_ID,
  preferences:Object.fromEntries(Object.entries(preferences||{})
    .filter(([name,value])=>safeFields.has(name)&&
      (typeof value==='string'||typeof value==='number'&&Number.isFinite(value)||
       typeof value==='boolean'))),
  updatedAt
});
export function cloudPreferencesFromMeta(rows){
  const row=rows?.find(record=>record?.id===CLOUD_PREFERENCES_ID);
  return row&&row.preferences&&typeof row.preferences==='object'&&!Array.isArray(row.preferences)
    ?row.preferences:null;
}
