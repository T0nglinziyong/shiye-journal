// Pure guards for desktop file drag-and-drop: no hijacking text/URL drags,
// canvas gestures, or mobile touch/Pencil interaction.
const IMAGE_EXTENSION=/\.(?:png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i;
export function isImageImportFile(file){
  return !!file&&(String(file.type||'').startsWith('image/')||
    IMAGE_EXTENSION.test(String(file.name||'')));
}
export function imageFilesFromDrop(transfer,limit=12){
  const count=Math.max(0,Math.min(12,limit));
  return Array.from(transfer?.files||[]).filter(isImageImportFile).slice(0,count);
}
export function acceptsDesktopFileDrag({pointerFine=false,types=[],route=''}={}){
  return !!pointerFine&&route!=='editor'&&
    [...types].includes('Files');
}
export function imageImportDestination({route,importMode='material'}={}){
  if(route==='import')return importMode;
  return route==='works'||route==='projectPreview'?'work':'material';
}
