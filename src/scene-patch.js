import {craftSceneState,craftSceneHash} from './craft-fingerprint.js';
import {attachSceneV2} from './scene-v2.js';
import {applyToolCalls,normalizeCalls} from './creative.js';
import {sceneFingerprint} from './offline-result-review.js';

// Only editable scene data belongs to the patch baseline. Sync revisions,
// diagnostics and AI run status may change without changing the page.
export const patchSceneState=craftSceneState;
export const patchSceneHash=async draft=>craftSceneHash(draft);

// applyPatch deliberately does not accept a complete-page generator. A stale
// patch is rejected before any tool can mutate the cloned scene; independent
// tools within a valid patch still retain the existing committed-prefix rule.
export async function applyScenePatch(patch,base,assets,aliases={},options={}){
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||patch.mode!=='applyPatch'||
    Object.keys(patch).some(key=>!['mode','baseSceneHash','tools'].includes(key))||
    !/^sha256:[a-f0-9]{64}$/.test(patch.baseSceneHash||'')||
    !Array.isArray(patch.tools)||patch.tools.length<1){
    throw Error('增量修订格式或画布基线无效');
  }
  const calls=normalizeCalls({tools:patch.tools});
  if(calls.some(call=>['compose_direct_page','compose_story_page','compose_page'].includes(call.name))){
    throw Error('整页生成不能作为增量修订；请使用完整场景替换');
  }
  const currentHash=await patchSceneHash(base);
  if(currentHash!==patch.baseSceneHash){
    return {draft:attachSceneV2(structuredClone(base)),results:[{name:'applyPatch',ok:false,code:'stale-base',detail:'画布已变化；增量修订未应用，请基于最新画布重做'}],committed:false,sceneHash:currentHash};
  }
  const result=applyToolCalls({tools:calls},base,assets,aliases,options);
  return {...result,sceneHash:await patchSceneHash(result.draft)};
}
