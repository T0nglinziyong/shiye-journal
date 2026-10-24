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
  {key:'leaf-sprig',title:'小枝叶贴纸',kind:'sticker',role:'accent',texture:'贴纸纸',width:31,height:38,tags:['叶片','植物','自然'],colors:['橄榄绿']},
  {key:'butterfly',title:'蓝灰蝴蝶贴纸',kind:'sticker',role:'focal',texture:'贴纸纸',width:37,height:28,tags:['蝴蝶','昆虫','蓝色'],colors:['蓝灰']},
  {key:'paper-star',title:'奶油星光贴纸',kind:'sticker',role:'accent',texture:'贴纸纸',width:31,height:31,tags:['星星','闪光','浅黄'],colors:['奶油黄']},
  {key:'day-postmark',title:'今日圆形印章',kind:'stamp',role:'annotation',texture:'印刷纸',width:32,height:32,tags:['印章','圆形','日期'],colors:['砖红']},
  {key:'archive-mark',title:'拾页档案印章',kind:'stamp',role:'information',texture:'印刷纸',width:41,height:24,tags:['印章','档案','文字'],colors:['深蓝']},
  {key:'flower-seal',title:'小花线描印章',kind:'stamp',role:'accent',texture:'印刷纸',width:30,height:30,tags:['印章','花朵','线描'],colors:['豆沙粉']}
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
