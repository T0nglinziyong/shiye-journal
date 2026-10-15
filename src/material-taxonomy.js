// The same finite vocabulary is used by recognition and every material editor.
// Kind describes the physical form, role its job on the page, and material
// what it appears to be made of. Unclear evidence has an explicit answer.
export const materialKinds=Object.freeze([
  ['sticker','贴纸'],['paper','纸张'],['tape','胶带'],['photo','照片'],
  ['text','文字剪片'],['reference','参考图'],['card','卡片'],['label','标签'],
  ['tag','吊牌'],['ticket','票券'],['postcard','明信片'],['envelope','信封'],
  ['bookmark','书签'],['stamp','邮票'],['diecut','异形剪片'],
  ['ribbon','丝带'],['fabric','布片'],['packaging','包装片'],['other','其他']
]);
export const materialRoles=Object.freeze([
  ['focal','主角'],['support','陪衬'],['background','背景'],
  ['connector','连接'],['annotation','注释'],['frame','边框'],
  ['divider','分隔'],['accent','点缀'],['writing','书写区'],
  ['information','信息载体'],['overlay','叠加层'],['other','其他']
]);
export const materialTextures=Object.freeze([
  '纸张','手工纸','印刷纸','卡纸','牛皮纸','和纸','棉纸','宣纸','硫酸纸','珠光纸','相纸','照片',
  '贴纸纸','PET','PVC','透明塑料','普通塑料','布料','蕾丝','缎带',
  '金属','木质','皮革','泡棉','亚克力','玻璃','陶瓷','干花',
  '线绳','复合材质','其他','未确定','待记录'
]);
export const materialKindName=kind=>materialKinds.find(([id])=>id===kind)?.[1]||kind;
export const materialRoleName=role=>materialRoles.find(([id])=>id===role)?.[1]||role;
export const isMaterialKind=kind=>materialKinds.some(([id])=>id===kind);
export const isMaterialRole=role=>materialRoles.some(([id])=>id===role);
export const isMaterialTexture=texture=>materialTextures.includes(texture);
