const origin=import.meta.env?.VITE_SHIYE_API_ORIGIN||'';
export const cloudApiUrl=path=>origin+path;
