import {cloudClient,invokeCloudFunction} from './cloud-session.js';
import {CLOUD_API_ROUTES,createCloudFunctionTransport} from './cloud-function-transport.js';

// These are business route identifiers, not HTTP paths hosted with static files.
// Every first-party caller uses the same CloudBase function transport.
export function cloudApiUrl(path){
  if(!Object.hasOwn(CLOUD_API_ROUTES,path))throw Error('未登记的 CloudBase 接口');
  return path;
}
const request=createCloudFunctionTransport({invoke:invokeCloudFunction,
  getSession:()=>cloudClient().auth.getSession()});
export const cloudApiRequest=(...args)=>request(...args);
