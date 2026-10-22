// One vocabulary, three independent questions. Keep kind/role IDs stable;
// they are classifications, not licenses to crop or consume real materials.
const groups=rows=>Object.freeze(rows.map(([label,options])=>Object.freeze({label,options:Object.freeze(options.map(row=>Object.freeze(row)))})));
export const materialKindGroups=groups([
 ['常用载体',[['sticker','贴纸'],['paper','纸张'],['tape','胶带'],['photo','照片']]],
 ['信息纸品',[['text','文字剪片'],['card','卡片'],['label','标签'],['tag','吊牌'],['ticket','票券'],['postcard','明信片'],['envelope','信封'],['bookmark','书签'],['stamp','邮票']]],
 ['其他载体',[['diecut','异形剪片'],['ribbon','丝带'],['fabric','布片'],['packaging','包装片'],['reference','参考图'],['other','其他']]]
]);
export const materialRoleGroups=groups([
 ['视觉主次',[['focal','主角'],['support','陪衬'],['accent','点缀']]],
 ['承托与结构',[['background','背景'],['overlay','叠加层'],['frame','边框'],['divider','分隔'],['connector','连接']]],
 ['文字与信息',[['writing','书写区'],['information','信息载体'],['annotation','注释'],['other','其他']]]
]);
export const materialTextureGroups=groups([
 ['纸类',['纸张','手工纸','卡纸','牛皮纸','和纸','棉纸','宣纸','硫酸纸','珠光纸','相纸','贴纸纸'].map(value=>[value,value])],
 ['塑料与发泡',['PET','PVC','透明塑料','普通塑料','泡棉','亚克力'].map(value=>[value,value])],
 ['织物与纤维',['布料','蕾丝','缎带','线绳'].map(value=>[value,value])],
 ['其他实体材料',['金属','木质','皮革','玻璃','陶瓷','干花','复合材质'].map(value=>[value,value])],
 ['无法归类或判断',[['其他','其他'],['未确定','未确定']]]
]);
export const materialKinds=Object.freeze(materialKindGroups.flatMap(group=>group.options));
export const materialRoles=Object.freeze(materialRoleGroups.flatMap(group=>group.options));
export const materialTextures=Object.freeze(materialTextureGroups.flatMap(group=>group.options.map(([value])=>value)));
export const materialKindName=kind=>materialKinds.find(([id])=>id===kind)?.[1]||kind;
export const materialRoleName=role=>materialRoles.find(([id])=>id===role)?.[1]||role;
export const isMaterialKind=kind=>materialKinds.some(([id])=>id===kind);
export const isMaterialRole=role=>materialRoles.some(([id])=>id===role);
export const isMaterialTexture=texture=>materialTextures.includes(texture);
export const hasKnownMaterialTexture=texture=>isMaterialTexture(texture)&&!['其他','未确定'].includes(texture);
export const materialTaxonomyHelp=Object.freeze({
 kind:'是什么载体：优先选具体纸品；有独立印刷文字的剪片可选文字剪片，不按颜色或画面作用分类。',
 role:'通常怎样入画：记录主要作用，不限制实际创作；其他用途可写入标签。主角承载焦点，陪衬组成副组，点缀是小范围强调。',
 texture:'由什么制成：只记录有依据的材质。照片属于类型，相纸才是材质；印刷、烫金、亮面等写入材质标签。看不出成分时选未确定。'
});
export const materialClassificationGuide=[
 materialTaxonomyHelp.kind,materialTaxonomyHelp.role,materialTaxonomyHelp.texture,
 '类别有交叉时只选最具体且有证据的一项，例如明信片不再选普通卡片、邮票不只选纸张；贴纸要有背胶/商品信息证据，白边本身不是背胶证据。',
 '角色是主要建议用途：背景承托面积、叠加层提供透明或纹理层、边框围合、分隔划区、连接串联；书写区留给后续文字，信息载体保留已有票面/印刷内容，注释是说明旁注。',
 '具体材质不能仅凭颜色和图案猜测，尤其 PET/PVC/和纸等；确认是纸但分不清品种可选纸张，连基材也无法确定选未确定。待记录是缺少资料的状态，不是材质。'
].join('');
