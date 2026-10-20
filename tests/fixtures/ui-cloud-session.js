// Included only by `vite build --mode ui-test`; production resolves the real
// CloudBase SDK module. The fixture must be installed before evaluating App.
export const cloudEnabled=true;
export const cloudbaseEnabled=true;
const backend=()=>{
  if(!globalThis.__SHIYE_UI_CLOUD__)
    throw Error('UI CloudBase fixture was not installed');
  return globalThis.__SHIYE_UI_CLOUD__;
};
export async function prepareCloudClient(){backend();}
export function cloudClient(){return backend().client;}
export async function requireCloudUser({withAccount=false}={}){
  const {user,account}=backend();
  return withAccount?{user,account}:user;
}
export async function invokeCloudFunction(options){return backend().invoke(options);}
