import {parseTags,usedAssetIDs,withUsageStatus} from './library-model.js';
import {isMaterialKind,isMaterialRole} from './material-taxonomy.js';
import {userMaterialClassification} from './material-classification.js';
import {normalizeTapeFlatCrop} from './tape-flat-crop.js';
import {wrapDisplayRotation} from './material-display-rotation.js';

export function assetEditorValue(old,values) {
  if(!values.title.trim())throw Error('请填写素材名称');
  if(!isMaterialKind(values.kind)||!isMaterialRole(values.role))
    throw Error('素材类型或画面作用不在预设范围内');
  const dimension=value=>{if(value==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Error('实物宽高必须是正数或留空');return n;};
  const width=dimension(values.width),height=dimension(values.height);
  const changes={kind:values.kind,kindDetail:values.kindDetail||null,role:values.role,
    secondaryRoles:values.secondaryRoles,contentCategories:values.contentCategories,layoutFits:values.layoutFits,
    tags:parseTags(values.tags),contentTags:parseTags(values.contentTags),themeTags:parseTags(values.themeTags),
    styleTags:parseTags(values.styleTags),colorTags:parseTags(values.colorTags),
    materialTags:parseTags(values.materialTags),moodTags:parseTags(values.moodTags)};
  const next={...userMaterialClassification(old,changes),title:values.title.trim(),
    titleEvidence:old.title!==values.title.trim()?{source:'user',confidence:1}:old.titleEvidence,
    physicalWidthMM:width,physicalHeightMM:height,
    seriesID:values.seriesID||null,reviewStatus:values.reviewStatus,updatedAt:new Date().toISOString()};
  const previousAngle=Number(old.processingRecord?.displayRotationDegrees)||0;
  const angle=values.rotation===undefined?previousAngle:values.rotation===''?NaN:Number(values.rotation);
  if(!Number.isFinite(angle)||Math.abs(angle)>180)throw Error('显示角度须在 -180° 到 180° 之间');
  const normalizedAngle=wrapDisplayRotation(angle);
  if(normalizedAngle!==wrapDisplayRotation(previousAngle))next.processingRecord={...old.processingRecord,
    sourceWidthMM:old.processingRecord?.sourceWidthMM||old.physicalWidthMM||null,
    sourceHeightMM:old.processingRecord?.sourceHeightMM||old.physicalHeightMM||null,
    displayRotationDegrees:normalizedAngle,autoStraighten:false,displayRotationSource:'user'};
  delete next.supply;
  if(values.usageStatus!=='used'&&values.usageStatus!=='unused')throw Error('使用状态无效');
  Object.assign(next,withUsageStatus(next,values.usageStatus==='used',next.updatedAt));
  if(width!==old.physicalWidthMM||height!==old.physicalHeightMM)next.dimensionSource=width&&height?'manual':null;
  if(values.kind==='tape') {
    next.tapeAxis=values.tapeAxis==='y'?'y':'x';
    if(values.flatCropMode==='manual')next.tapeFlatCrop=normalizeTapeFlatCrop({
      left:Number(values.flatLeft)/100,top:Number(values.flatTop)/100,
      right:Number(values.flatRight)/100,bottom:Number(values.flatBottom)/100});
    else if(values.flatCropMode==='auto'){
      if(Object.hasOwn(old,'tapeFlatCrop'))next.tapeFlatCrop=null;
      else delete next.tapeFlatCrop;
    }
    next.tapeRepeatMode=values.repeatable?'repeatablePattern':'singleStrip';
    if(values.repeatable){const start=Number(values.repeatStart??0),
      end=Number(values.repeatEnd??(start+Number(values.repeatPeriod))),
      length=next.tapeAxis==='x'?width:height;
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||!length||end>length)
        throw Error('重复纹样起点和终点必须位于胶带长度方向的实拍样段内');
      next.tapeRepeatStartMM=start;next.tapeRepeatEndMM=end;next.tapeRepeatPeriodMM=end-start;
    }else{next.tapeRepeatStartMM=null;next.tapeRepeatEndMM=null;next.tapeRepeatPeriodMM=null;}
  }
  // Saving an unchanged form must not create a new cloud revision or restart
  // image/works sync. The two timestamps are effects of a real edit only.
  const content=record=>{const {updatedAt,usageUpdatedAt,...fields}=record;return fields;};
  if(JSON.stringify(content(next))===JSON.stringify(content(old)))return old;
  return next;
}
