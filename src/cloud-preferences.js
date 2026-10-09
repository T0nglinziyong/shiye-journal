// Only UI and recognition preferences are synced. API credentials, access
// tokens and private keys never enter the shared meta collection.
export const CLOUD_PREFERENCES_ID='app-ui-preferences';
export const cloudPreferencesRecord=(preferences,updatedAt=new Date().toISOString())=>({
  id:CLOUD_PREFERENCES_ID,
  preferences:structuredClone(preferences),
  updatedAt
});
export function cloudPreferencesFromMeta(rows){
  const row=rows?.find(record=>record?.id===CLOUD_PREFERENCES_ID);
  return row&&row.preferences&&typeof row.preferences==='object'&&!Array.isArray(row.preferences)
    ?row.preferences:null;
}
