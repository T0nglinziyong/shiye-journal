import {attachSceneV2} from './scene-v2.js';
// Scene v2 is a single recursive tree. Keep its order and identities intact
// in undo/redo; never reconstruct legacy leaf arrays from a spread object.
export function snapshotDraft(draft){
  attachSceneV2(draft);
  return attachSceneV2(structuredClone(draft));
}
