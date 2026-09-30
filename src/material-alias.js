// A material reference is derived from its persistent library ID, never its
// position in the basket. Base64url keeps it safe in JSON and ZIP paths.
export function materialAlias(assetID){
  const bytes=new TextEncoder().encode(String(assetID));
  if(!bytes.length||bytes.length>120)throw Error('素材唯一标识长度无效');
  return 'asset_'+btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function materialAliases(ids){return Object.fromEntries([...new Set(ids)].map(id=>[materialAlias(id),id]));}
export function validMaterialAlias(alias){return /^asset_[A-Za-z0-9_-]+$/.test(alias)||/^m[1-9]\d*$/.test(alias);}
