import {initialMaterialClassification,validateMaterialClassification} from '../material-classification.js';

const kindMap={sticker:'sticker',paper:'paper',tape:'tape',photo:'photo',text:'text',
  card:'card',ticket:'ticket',postcard:'card',stamp:'stamp',ribbon:'ornament',
  label:'other',reference:'other',tag:'other',envelope:'other',bookmark:'other',
  diecut:'other',fabric:'other',packaging:'other',other:'other'};
const roleMap={focal:'focal',support:'support',background:'background',connector:'connector',
  annotation:'marker',frame:'structure',divider:'connector',accent:'accent',
  writing:'information',information:'information',overlay:'support'};
const list=value=>Array.isArray(value)?[...new Set(value.filter(item=>typeof item==='string'&&item.trim()).map(item=>item.trim()))]:[];
export function migrateMaterialV1(record){
  if(record?.classificationVersion===2)return validateMaterialClassification(record);
  if(!record||typeof record.id!=='string'||!record.id||typeof record.kind!=='string'||
    typeof record.role!=='string'||!Array.isArray(record.tags))throw Error('旧素材缺少可验证的类型、作用或标签');
  const kind=kindMap[record.kind];
  if(!kind)throw Error('旧素材类型未登记转换：'+record.kind);
  const role=roleMap[record.role];
  if(!role)throw Error('旧素材画面作用未登记转换：'+record.role);
  const converted={...record,...initialMaterialClassification({kind,role,tags:list(record.tags)}),
    contentTags:list(record.contentTags),themeTags:list(record.themeTags),
    styleTags:list(record.styleTags),moodTags:list(record.moodTags),
    materialTags:list([...(record.materialTags||[]),
      ...(!record.texture||['待记录','未确定','其他'].includes(record.texture)?[]:[record.texture])]),
    colorTags:list([...(record.colorTags||[]),...(record.semanticColorNames||[])]),
    tags:list([...(record.tags||[]),...(record.placementHints||[]),...(record.semanticTags||[])]),
    categoryEvidence:{kind:{source:'migration',originalId:record.kind},
      kindDetail:{source:'migration'},role:{source:'migration',originalId:record.role}},
    tagEvidence:{},titleEvidence:{source:'user',confidence:1}};
  for(const key of ['texture','semanticColorNames','placementHints','semanticTags'])delete converted[key];
  return validateMaterialClassification(converted);
}
