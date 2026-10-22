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

// Group current values without changing saved IDs or silently rewriting records.
// Form, preferred page job and physical substrate are separate dimensions.
const grouped=(definitions,groups)=>groups.map(([label,ids])=>({label,options:ids.map(id=>definitions.find(([value])=>value===id))}));
export const materialKindGroups=grouped(materialKinds,[
 ['粘贴与标记',['sticker','tape','label','stamp']],
 ['纸品与印刷件',['paper','card','photo','text','tag','ticket','postcard','envelope','bookmark','packaging','diecut']],
 ['其他形态',['ribbon','fabric','reference','other']]
]);
export const materialRoleGroups=grouped(materialRoles,[
 ['内容与重心',['focal','writing','information','annotation']],
 ['结构与连接',['background','frame','divider','connector']],
 ['层次与细节',['support','overlay','accent','other']]
]);
export const materialTextureGroups=grouped(materialTextures.map(value=>[value,value]),[
 ['纸基与纸面',['纸张','手工纸','卡纸','牛皮纸','和纸','棉纸','宣纸','硫酸纸','珠光纸','相纸','贴纸纸']],
 ['塑料与透明片',['PET','PVC','透明塑料','普通塑料','亚克力']],
 ['织物与线材',['布料','蕾丝','缎带','线绳']],
 ['其他实物材质',['金属','木质','皮革','泡棉','玻璃','陶瓷','干花','复合材质']],
 ['可进一步细分的描述',['印刷纸','照片']],
 ['尚未确定',['其他','未确定','待记录']]
]);
export const materialFieldGuide=Object.freeze({
 kind:'类型回答“它是什么物件”：贴纸、纸张、票券等；花朵、文字内容和颜色放入标签，不重复作为材质。',
 role:'主要画面作用是建议而非限制。书写区承载正文，信息载体已有印刷信息，注释用于短旁注；点缀小而突出，陪衬支持主角，叠加层强调前后关系。',
 texture:'材质回答“由什么制成”：相纸、和纸、PET、布料等。类型为照片不代表材质也应选照片，已知时优先选相纸；印刷/烫金等工艺写入材质标签。待记录表示未整理，未确定表示看过但无法判断。'
});
