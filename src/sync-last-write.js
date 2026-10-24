// Compare actual user edit timestamps, not the order that uploads finish.
// The server's revision CAS still serializes commits. Equal/invalid timestamps
// choose the already-committed cloud copy to avoid accidental stale overwrite.
export function compareRecordEdits(local,remote,{localTimestamp=null}={}){
  const time=value=>{
    if(typeof value!=='string')return null;
    const n=Date.parse(value);
    return Number.isFinite(n)?n:null;
  };
  const localTime=time(localTimestamp||local?.updatedAt||local?.usageUpdatedAt||local?.date||local?.createdAt);
  const cloudTime=time(remote?.updatedAt||remote?.usageUpdatedAt||remote?.date||remote?.createdAt);
  if(!remote)return 'remote';
  if(localTime===null||cloudTime===null)return 'remote';
  return localTime>cloudTime?'local':'remote';
}
