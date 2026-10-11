import {project} from './domain.js';
import {validateNativeDraft} from './native-project-package.js';
import {validateScenePhysical} from './creative.js';
import {canonicalScene,SCENE_FORMAT,SCENE_VERSION} from './scene-model.js';

// One portable editable scene is a Draft, not a second JSON layer language.
// The surrounding title is metadata; original images stay in the account's
// asset library and are resolved via assetID.
export function exportSceneDocument(projectRecord,{draftID}={}){
  if(!projectRecord||projectRecord.isSnapshot)throw Error('画面快照不能导出成可编辑 Scene');
  const draft=projectRecord.drafts?.find(d=>d.id===(draftID||projectRecord.activeDraftID))||projectRecord.drafts?.[0];
  if(!draft)throw Error('没有可编辑的画布');
  return {...canonicalScene(draft),title:projectRecord.title};
}
export function importSceneDocument(input,assets){
  if(typeof input==='string'){
    if(input.length>8_000_000)throw Error('Scene JSON 超出 8 MB');
    try{input=JSON.parse(input.replace(/^\uFEFF/,'').trim());}catch{throw Error('Scene 文件不是有效 JSON');}
  }
  if(!input||input.format!==SCENE_FORMAT||input.version!==SCENE_VERSION||!input.scene)throw Error('不是拾页标准 Scene v1');
  const d=structuredClone(input.scene),known=new Set(assets.map(a=>a.id));
  if(typeof d.id!=='string'||!d.id||!['single','spread'].includes(d.pageMode))throw Error('Scene 方案基本信息无效');
  if(!Number.isFinite(d.physicalPageHeightMM)||d.physicalPageHeightMM<=0)throw Error('Scene 缺少纸张真实高度');
  validateNativeDraft(d,known);
  validateScenePhysical(d,assets);
  const p=project(String(input.title||'导入的可编辑场景').slice(0,80),
    {mode:d.pageMode,ratio:d.pageRatio||'a4',style:d.style||'free'});
  p.drafts=[d];p.activeDraftID=d.id;p.isDraft=true;
  p.initialEditorSnapshot={drafts:[structuredClone(d)],activeDraftID:d.id};
  p.draftHistorySnapshots={[d.id]:structuredClone(d)};
  p.manualArchives=[];p.editHistory={undo:[],redo:[]};
  return p;
}
