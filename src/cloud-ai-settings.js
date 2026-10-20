import {normalizeAISettings} from './ai-settings.js';

// Authenticated account-owned "meta" record. Never copy these settings into
// public pages, client analytics, GPT task ZIPs or other users' records.
export const CLOUD_AI_SETTINGS_ID='app-ai-settings';
export function cloudAISettingsRecord(settings,updatedAt=new Date().toISOString()){
  const normalized=normalizeAISettings(settings);
  const {snapshot,creationMode,generationMode,deliveryMode,...rest}=normalized;
  return {id:CLOUD_AI_SETTINGS_ID,settings:structuredClone(rest),updatedAt};
}
export function cloudAISettingsFromMeta(rows){
  const row=rows?.find(record=>record?.id===CLOUD_AI_SETTINGS_ID);
  if(!row||!row.settings||typeof row.settings!=='object'||Array.isArray(row.settings))return null;
  // Accept only fields recognized by the application, including provider
  // key and provider-scoped keys. The database enforces auth.uid() RLS.
  return normalizeAISettings(row.settings);
}
