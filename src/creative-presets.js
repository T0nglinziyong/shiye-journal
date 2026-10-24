// Bundled, original digital supplies. These are catalog records, not account
// data: stable IDs let works and GPT packages retain their source across devices.
const prefix='shiye-creative-preset-v1:';
const common={isCreativePreset:true,usageStatus:'preset',reviewStatus:'ready',
  sourceIdentifier:'shiye-creative-preset-v1',createdAt:'2026-10-24T00:00:00.000Z',
  updatedAt:'2026-10-24T00:00:00.000Z',isProjectInternal:false};
const definitions=[
  {key:'sage-check-tape',title:'鼠尾草格纹胶带',kind:'tape',role:'connector',texture:'和纸',width:60,height:12,tags:['格纹','胶带','绿色'],colors:['鼠尾草绿'],tape:true},
  {key:'blue-rule-tape',title:'浅蓝手写线胶带',kind:'tape',role:'divider',texture:'和纸',width:60,height:12,tags:['横线','胶带','蓝色'],colors:['浅蓝'],tape:true},
  {key:'coral-dot-tape',title:'珊瑚点点胶带',kind:'tape',role:'connector',texture:'和纸',width:60,height:12,tags:['圆点','胶带','暖色'],colors:['珊瑚红'],tape:true},
  {key:'rose-floral-tape',title:'玫瑰碎花胶带',kind:'tape',role:'connector',texture:'和纸',width:60,height:12,tags:['碎花','胶带','复古'],colors:['玫瑰粉'],tape:true},
  {key:'ochre-gingham-tape',title:'焦糖格子胶带',kind:'tape',role:'divider',texture:'和纸',width:60,height:12,tags:['格纹','胶带','暖色'],colors:['焦糖棕'],tape:true},
  {key:'lavender-star-tape',title:'雾紫星月胶带',kind:'tape',role:'connector',texture:'和纸',width:60,height:12,tags:['星月','胶带','紫色'],colors:['雾紫'],tape:true},
  {key:'forest-botanical-tape',title:'森林枝叶胶带',kind:'tape',role:'divider',texture:'和纸',width:60,height:12,tags:['植物','胶带','绿色'],colors:['森林绿'],tape:true},
  {key:'sky-cloud-tape',title:'晴空云朵胶带',kind:'tape',role:'connector',texture:'和纸',width:60,height:12,tags:['云朵','胶带','蓝色'],colors:['天空蓝'],tape:true},
  {key:'vintage-script-tape',title:'旧纸短句胶带',kind:'tape',role:'divider',texture:'和纸',width:60,height:12,tags:['文字','胶带','复古'],colors:['咖啡棕'],tape:true},
  {key:'leaf-sprig',title:'小枝叶贴纸',kind:'sticker',role:'accent',texture:'贴纸纸',width:31,height:38,tags:['叶片','植物','自然'],colors:['橄榄绿']},
  {key:'butterfly',title:'蓝灰蝴蝶贴纸',kind:'sticker',role:'focal',texture:'贴纸纸',width:37,height:28,tags:['蝴蝶','昆虫','蓝色'],colors:['蓝灰']},
  {key:'paper-star',title:'奶油星光贴纸',kind:'sticker',role:'accent',texture:'贴纸纸',width:31,height:31,tags:['星星','闪光','浅黄'],colors:['奶油黄']},
  {key:'berry-branch',title:'红莓枝贴纸',kind:'sticker',role:'accent',texture:'贴纸纸',width:29,height:37,tags:['红莓','植物','自然'],colors:['砖红']},
  {key:'sleepy-cat',title:'打盹小猫贴纸',kind:'sticker',role:'focal',texture:'贴纸纸',width:35,height:28,tags:['猫','动物','可爱'],colors:['暖灰']},
  {key:'daisy-bunch',title:'雏菊小束贴纸',kind:'sticker',role:'accent',texture:'贴纸纸',width:33,height:39,tags:['雏菊','花朵','自然'],colors:['奶油黄']},
  {key:'coffee-cup',title:'咖啡时刻贴纸',kind:'sticker',role:'annotation',texture:'贴纸纸',width:32,height:32,tags:['咖啡','日常','暖色'],colors:['咖啡棕']},
  {key:'tiny-moon',title:'弯月晚安贴纸',kind:'sticker',role:'accent',texture:'贴纸纸',width:30,height:31,tags:['月亮','夜晚','蓝色'],colors:['雾蓝']},
  {key:'paperclip',title:'黄铜回形针贴纸',kind:'sticker',role:'connector',texture:'贴纸纸',width:16,height:40,tags:['回形针','文具','金色'],colors:['黄铜金']},
  {key:'day-postmark',title:'今日圆形印章',kind:'stamp',role:'annotation',texture:'印刷纸',width:32,height:32,tags:['印章','圆形','日期'],colors:['砖红']},
  {key:'archive-mark',title:'拾页档案印章',kind:'stamp',role:'information',texture:'印刷纸',width:41,height:24,tags:['印章','档案','文字'],colors:['深蓝']},
  {key:'flower-seal',title:'小花线描印章',kind:'stamp',role:'accent',texture:'印刷纸',width:30,height:30,tags:['印章','花朵','线描'],colors:['豆沙粉']}
  ,{key:'travel-postmark',title:'旅途邮戳印章',kind:'stamp',role:'annotation',texture:'印刷纸',width:39,height:28,tags:['印章','邮戳','旅行'],colors:['湖蓝']}
  ,{key:'coffee-seal',title:'咖啡印章',kind:'stamp',role:'accent',texture:'印刷纸',width:31,height:31,tags:['印章','咖啡','日常'],colors:['咖啡棕']}
  ,{key:'night-seal',title:'晚安月相印章',kind:'stamp',role:'accent',texture:'印刷纸',width:31,height:31,tags:['印章','月亮','夜晚'],colors:['雾紫']}
  ,{key:'library-date',title:'阅读日期印章',kind:'stamp',role:'information',texture:'印刷纸',width:39,height:24,tags:['印章','日期','阅读'],colors:['墨绿']}
  ,{key:'ticket-seal',title:'今日入场印章',kind:'stamp',role:'annotation',texture:'印刷纸',width:40,height:25,tags:['印章','票根','活动'],colors:['砖红']}
  ,{key:'field-note-seal',title:'野外笔记印章',kind:'stamp',role:'information',texture:'印刷纸',width:39,height:26,tags:['印章','植物','观察'],colors:['橄榄绿']}
];
export const creativePresetAssets=Object.freeze(definitions.map(({key,width,height,colors,tags,tape,...rest})=>Object.freeze({
  ...common,...rest,id:prefix+key,blobId:prefix+key,
  staticPath:'/creative-presets/'+key+'.png',physicalWidthMM:width,
  physicalHeightMM:height,tags,contentTags:tags,styleTags:['手帐预设'],
  semanticColorNames:colors,placementHints:tape?['可裁成短段，跨接纸边或照片边缘']:
    ['可作为视觉重点或文字附近的局部呼应'],
  ...(tape?{tapeAxis:'x',tapeRepeatMode:'repeatablePattern',
    tapeRepeatStartMM:0,tapeRepeatEndMM:20,tapeRepeatPeriodMM:20}:{})
})));

export const isCreativePreset=asset=>asset?.isCreativePreset===true;
export function withCreativePresetAssets(assets=[]){
  const ids=new Set(assets.map(asset=>asset.id));
  return [...assets,...creativePresetAssets.filter(asset=>!ids.has(asset.id))];
}
