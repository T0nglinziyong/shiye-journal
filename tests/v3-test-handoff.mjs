import {createOfflineHandoff as createActualHandoff} from '../src/offline-creation.js';
import {tinyPNG} from './offline-canvas-test-support.mjs';
export * from '../src/offline-creation.js';
// Fixture images are explicit in v3: production exports always carry the
// source pixels. Older contract tests without images get a real PNG fixture.
export function createOfflineHandoff(options){
  if(options.settings?.deliveryMode==='image')return createActualHandoff(options);
  const previews=options.previews?.length?options.previews:Object.keys(options.aliases||{}).map(alias=>({alias,bytes:tinyPNG}));
  return createActualHandoff({...options,previews,settings:{...options.settings,includeThumbnails:true}});
}
