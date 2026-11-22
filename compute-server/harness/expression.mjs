import {describeTechnique} from '../../src/creation-library/techniques.js';
import {inspectCreationDocument} from '../../src/creation-inspection.js';

// A visible treatment, rather than merely a method mentioned in the plan.
const expressiveIDs=new Set([
  'title-outline','title-highlight','title-stack','title-vertical','title-stagger',
  'title-tape','title-label','title-curve','title-shadow','title-gap-shadow','title-offset-outline',
  'title-gradient','title-gradient-outline','title-phrases','title-circle',
  'title-cross-shadow','title-scattered-round','title-scattered-triangle',
  'title-number-route','title-script-dots','title-paper-lettering',
  'color-echo','color-bands','graphic-flower','graphic-arch',
  'graphic-scallop-frame','graphic-bubble','pattern-scallop',
  'accent-sprig','accent-stitch','accent-rings'
]);
const colorIDs=new Set(['color-echo','color-bands']);

// Keep the choice set visible after conversation compaction without loading
// every long lettering lesson or its image into the first model request.
export function letteringEffectMenu(){
  return [
    {id:'title-shadow',effect:'同侧阴影',when:'字形需要轻微立体感；阴影方向统一'},
    {id:'title-gap-shadow',effect:'留白间隔阴影',when:'大标题需要硬边错位投影；colors[2] 设为标题所在纸面色'},
    {id:'title-outline',effect:'透明空心字',when:'底色或照片需要透过字心；检查细线可读性'},
    {id:'title-offset-outline',effect:'偏移轮廓',when:'需要清晰的错位线条而非模糊投影'},
    {id:'title-gradient-outline',effect:'渐变描边',when:'需要取自素材的两色字形与背景分离'},
    {id:'title-tape',effect:'局部纸带承字',when:'标题需要与附近纸片或照片连接'},
    {id:'title-cross-shadow',effect:'中部横带穿字',when:'大字与小字形成一组，保留统一阴影'},
    {id:'title-scattered-round',effect:'错落字群与圆点',when:'词组有主次层级；用 runs 明确位置'},
    {id:'title-scattered-triangle',effect:'错落字群与三角',when:'标题需要轻快的几何节奏'},
    {id:'title-number-route',effect:'倾斜数字与外围线',when:'真实年份或日期做成局部焦点'},
    {id:'title-script-dots',effect:'连写字与圆点底纹',when:'短英文标题要有可调间距的背景点'},
    {id:'title-paper-lettering',effect:'有色纸片承浅字',when:'字行长度变化时纸片自动跟随'},
    {id:'title-phrases',effect:'主次词组',when:'标题要有词组层级；可与上述文字 style 组合'}
  ];
}

export const expressiveTask=brief=>Boolean(typeof brief?.intent==='string'&&brief.intent.trim());
export const isExpressiveTechnique=id=>expressiveIDs.has(id);
export function missingExpressionDirections(ids=[]){
  const selected=new Set(ids);
  return [...(![...selected].some(id=>expressiveIDs.has(id)&&!colorIDs.has(id))?['标题或图形']:[]),...(![...selected].some(id=>colorIDs.has(id))?['配色']:[])];
}

export function expressionCards(document,brief){
  const style=[brief.style,...(Array.isArray(brief.styles)?brief.styles:[]),...(document.source.styles||[])].filter(Boolean).join(' ');
  const rich=/丰富|层叠|拼贴|童趣|复古|杂志/.test(style);
  const quiet=/留白|极简|清新|淡雅|安静|疏朗/.test(style);
  const title=document.source.textMode==='none'?[rich?'graphic-flower':'graphic-arch']:rich?['title-paper-lettering','title-cross-shadow']:quiet?['title-phrases']:['title-offset-outline','title-highlight'];
  const color=rich?'color-bands':'color-echo';
  const accents=rich?['accent-sprig','accent-stitch']:['accent-rings'];
  if(document.source.materials.length&&document.source.textMode!=='none')title.push('graphic-route');
  // A small physical illustration can stay small: offer an editable paper
  // carrier as an actual method card, without prescribing a fixed layout.
  const hasPaperSource=document.source.sourceSnapshots?.some(snapshot=>snapshot.kind==='paper');
  const foundation=document.source.materials.length&&!hasPaperSource?['paper-color-card']:[];
  return [...title,color,...accents,...foundation].map(id=>{
    const method=describeTechnique(id,{includeFontSuggestions:false});
    return {id,skill:method.skill,title:method.title,when:method.when,
      principle:method.lesson.principle,check:method.lesson.check,
      example:method.tool.arguments.parameters,
      use:'creation_recipe kind=technique；recipeId='+id+'；另传唯一 transactionId 与最新 baseSceneRevision。示例文字、位置和颜色须替换成本页内容。'};
  });
}

export function visibleExpressiveRecipes(document,receipts={}){
  const layers=new Map(inspectCreationDocument(document).layers.map(layer=>[layer.id,layer]));
  const visible=layer=>Boolean(layer&&layer.surface==='page'&&!layer.hidden&&layer.opacity!==0&&(!layer.parent||visible(layers.get(layer.parent))));
  return Object.values(receipts).flatMap(receipt=>(receipt?.data?.recipes||[receipt?.data?.recipe]).flatMap(recipe=>{
    const layer=layers.get(recipe?.groupId);
    return expressiveIDs.has(recipe?.methodId)&&visible(layer)
      ?[{id:recipe.methodId,groupId:recipe.groupId}]:[];
  }));
}
