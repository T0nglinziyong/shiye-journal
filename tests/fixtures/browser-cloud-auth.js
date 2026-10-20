// This module is resolved only by Vite's browser-test mode. It starts the local
// app for legacy editor/browser regressions without changing production auth.
export async function startCloudSession(onReady){
  await onReady();
}
