// Isolated synthetic Chromium regressions only; production uses CloudBase.
export const cloudEnabled=false;
export const cloudbaseEnabled=false;
export const cloudRealtimeEnabled=false;
export async function prepareCloudClient(){}
export function cloudClient(){throw Error('CloudBase is unavailable in browser regression mode');}
export function cloudStorage(){throw Error('CloudBase is unavailable in browser regression mode');}
export function cloudRealtime(){throw Error('Realtime is unavailable in browser regression mode');}
export async function requireCloudUser(){throw Error('CloudBase user is unavailable in browser regression mode');}
export async function invokeCloudFunction(){throw Error('CloudBase function is unavailable in browser regression mode');}
