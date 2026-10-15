import {parseTags,usedAssetIDs,withUsageStatus} from './library-model.js';

export function assetEditorValue(old,values) {
  if(!values.title.trim())throw Error('请填写素材名称');
  const dimension=value=>{if(value==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Error('实物宽高必须是正数或留空');return n;};
  const quantity=Number(values.quantity);if(!Number.isInteger(quantity)||quantity<0||quantity>999)throw Error('数量需要是 0–999 的整数');
  const width=dimension(values.width),height=dimension(values.height);
  const next={...old,title:values.title.trim(),kind:values.kind,role:values.role,texture:values.texture.trim(),physicalWidthMM:width,physicalHeightMM:height,
    tags:parseTags(values.tags),contentTags:parseTags(values.contentTags),styleTags:parseTags(values.styleTags),materialTags:parseTags(values.materialTags),
    seriesID:values.seriesID||null,reviewStatus:values.reviewStatus,supply:{...old.supply,kind:quantity===999?'unlimited':quantity===1?'single':'quantity',quantity},updatedAt:new Date().toISOString()};
  next.tags=[...new Set([...next.tags,...next.contentTags,...next.styleTags,...next.materialTags])];
  if(values.usageStatus!=='used'&&values.usageStatus!=='unused')throw Error('使用状态无效');
  Object.assign(next,withUsageStatus(next,values.usageStatus==='used',next.updatedAt));
  if(width!==old.physicalWidthMM||height!==old.physicalHeightMM)next.dimensionSource=width&&height?'manual':null;
  if(values.kind==='tape') {
    if(values.tapeRoll&&quantity!==999){const length=Number(values.supplyLength);if(!Number.isFinite(length)||length<=0)throw Error('整卷胶带需要填写实际剩余长度');next.supply={...next.supply,kind:'tapeRoll',availableLengthMM:length};}
    next.tapeRepeatMode=values.repeatable?'repeatablePattern':'singleStrip';
    if(values.repeatable){const period=Number(values.repeatPeriod);if(!Number.isFinite(period)||period<=0||!width||!height||period>Math.max(width,height))throw Error('重复周期需为正数，且不得超过已校准样段长度');next.tapeRepeatPeriodMM=period;}
    else next.tapeRepeatPeriodMM=null;
  }
  // Saving an unchanged form must not create a new cloud revision or restart
  // image/works sync. The two timestamps are effects of a real edit only.
  const content=record=>{const {updatedAt,usageUpdatedAt,...fields}=record;return fields;};
  if(JSON.stringify(content(next))===JSON.stringify(content(old)))return old;
  return next;
}
