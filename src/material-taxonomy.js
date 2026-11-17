export const MATERIAL_TAXONOMY_VERSION=2;
export const materialTypes=Object.freeze([
  ['sticker','贴纸',[['subject','主体贴纸'],['decoration','装饰贴纸'],['text','文字贴纸'],['label','标签贴纸'],['functional','功能贴纸']]],
  ['note','便签',[['sticky','便利贴'],['paper','便签纸'],['strip','便签条'],['card','便签卡']]],
  ['tape','胶带',[['washi','和纸胶带'],['transparent','透明胶带'],['fabric','布胶带'],['decoration','装饰胶带'],['border','边框胶带']]],
  ['paper','纸张',[['solid','纯色纸'],['patterned','花纹纸'],['letter','信纸'],['grid','方格纸'],['lined','横线纸'],['dot','点阵纸'],['textured','纹理纸']]],
  ['card','卡片',[['postcard','明信片'],['greeting','贺卡'],['photo','照片卡'],['title','标题卡'],['information','信息卡']]],
  ['ticket','票据',[['train','车票'],['flight','机票'],['admission','门票'],['receipt','收据'],['boarding','登机牌'],['stub','票根']]],
  ['photo','照片',[['ordinary','普通照片'],['instant','拍立得'],['strip','照片条'],['screenshot','截图'],['scan','扫描照片']]],
  ['stamp','邮票与印章',[['postage','邮票'],['postmark','邮戳'],['seal','印章'],['imprint','印章图案']]],
  ['frame','相框与边框',[['photo','照片框'],['decoration','装饰边框'],['corner','角框'],['album','相册框']]],
  ['text','文字素材',[['title','标题字'],['letter','字母'],['number','数字'],['phrase','短语'],['art','艺术字']]],
  ['ornament','装饰小物',[['paperclip','回形针'],['clip','夹子'],['ribbon','丝带'],['dried_flower','干花'],['badge','徽章'],['button','纽扣']]],
  ['background','背景与模板',[['page','页面背景'],['single','单页模板'],['spread','双页模板'],['layout','布局模板']]],
  ['pattern','纹理与图案',[['paper_texture','纸张纹理'],['fabric_texture','布料纹理'],['repeat','连续图案'],['ornamental','装饰纹样']]],
  ['other','其他',[['unclassified','暂未归类']]]
]);
export const materialKinds=Object.freeze(materialTypes.map(([id,label])=>[id,label]));
export const materialKindDetails=Object.freeze(materialTypes.flatMap(([kind,,details])=>details.map(([id,label])=>[`${kind}.${id}`,label,kind])));
export const materialRoles=Object.freeze([
  ['focal','主视觉'],['support','次级视觉'],['background','背景'],['information','信息承载'],
  ['marker','信息标记'],['connector','连接与分隔'],['accent','装饰点缀'],
  ['emphasis','强调突出'],['structure','结构组织']
]);
export const contentCategories=Object.freeze([
  ['people','人物'],['animals','动物'],['plants','植物'],['nature','自然'],
  ['places','地点建筑'],['food','食物饮品'],['objects','日常物品'],['transport','交通工具'],
  ['culture','文化艺术'],['written','文字信息'],['abstract','抽象图形'],['none','无具体内容']
]);
export const layoutFits=Object.freeze([
  ['page.full','全页铺底'],['page.spread','跨页铺底'],
  ['local.background','局部背景'],['local.text','文字区域背景'],['local.photo','照片区域背景'],
  ['strip.horizontal','横向条带'],['strip.vertical','纵向条带'],['strip.edge','边缘延展'],
  ['point.center','中心摆放'],['point.corner','角落摆放'],['point.free','自由摆放'],
  ['frame.photo','照片承载'],['frame.text','文字承载'],['frame.content','内容框选'],
  ['repeat.tile','可重复'],['repeat.join','连续拼接'],['repeat.regular','规律排列'],
  ['overlay.stack','可叠放'],['overlay.transparent','半透明覆盖'],['overlay.subject','主体覆盖'],
  ['combine.split','可拆分'],['combine.join','可组合'],['combine.set','多件搭配']
]);
export const tagGroups=Object.freeze([
  ['contentTags','内容标签'],['themeTags','主题与场景'],['styleTags','风格表现'],
  ['colorTags','色彩标签'],['materialTags','材质与质感'],['moodTags','情绪与氛围'],['tags','其他标签']
]);
export const materialKindName=id=>materialKinds.find(([value])=>value===id)?.[1]||id;
export const materialRoleName=id=>materialRoles.find(([value])=>value===id)?.[1]||id;
export const isMaterialKind=id=>materialKinds.some(([value])=>value===id);
export const isMaterialKindDetail=(id,kind)=>materialKindDetails.some(([value,,parent])=>value===id&&(!kind||parent===kind));
export const isMaterialRole=id=>materialRoles.some(([value])=>value===id);
export const isContentCategory=id=>contentCategories.some(([value])=>value===id);
export const isLayoutFit=id=>layoutFits.some(([value])=>value===id);
export const materialKindGroups=Object.freeze(materialTypes.map(([id,label])=>({label,options:[[id,label]]})));
export const materialRoleGroups=Object.freeze([{label:'画面作用',options:materialRoles}]);
export const materialFieldGuide=Object.freeze({
  kind:'按实际使用的物件形态分类；画面中表现的内容写入内容类别和标签。',
  role:'主要作用必选，其他可能承担的作用可另选为次要作用。',
  contentCategories:'只选画面明确表现的内容，具体对象写入开放标签。',
  layoutFits:'描述如何放置或组合，不等同于画面作用。'
});
