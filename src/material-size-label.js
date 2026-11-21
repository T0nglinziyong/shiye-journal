export function materialSizeLabel(asset,item){
  const crop=item?.cropRect;
  const width=Number(asset?.physicalWidthMM)*(crop?.width??1);
  const height=Number(asset?.physicalHeightMM)*(crop?.height??1);
  if(!(width>0&&height>0&&Number.isFinite(width)&&Number.isFinite(height)))return '';
  const mm=value=>Number(value.toFixed(1)).toString();
  return `${mm(width)} × ${mm(height)} mm`;
}
