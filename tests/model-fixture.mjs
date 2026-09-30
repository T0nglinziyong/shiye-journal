import {draft} from '../src/domain.js';
import {normalizeAISettings} from '../src/ai-settings.js';
export function modelFixture(mode='agent'){
  const assets=[['focal','蓝色星月纸','paper','background',70,108,['蓝色','星月']],['memo','浅绿便签','paper','writing',72,70,['浅绿','便签']],['ticket','暖橙小票','sticker','accent',38,40,['暖橙','票据']],['illustration','篮球人物剪影','sticker','focal',44,64,['运动','人物']]].map(([id,title,kind,role,physicalWidthMM,physicalHeightMM,tags])=>({id,title,kind,role,physicalWidthMM,physicalHeightMM,tags,supply:{quantity:1},reviewStatus:'ready'}));
  return {...normalizeAISettings(),key:'test-only',draft:draft({ratio:'a5',style:'留白叙事'}),assets,aliases:Object.fromEntries(assets.map((a,i)=>['m'+(i+1),a.id])),generationMode:mode,transport:'auto',images:[],prompt:'以蓝色星月和篮球人物为主题，做一页可编辑手帐。正文只写客观视觉观察，至少两段有内容的短文，不编造我的经历、日期或地点。保持所有实物原尺寸、完整使用篮球人物，标题正文不能遮挡，也不需要空白相框。',styles:['留白叙事','胶片日记'],pagePurposes:['日常记录','图文收藏'],processing:'保留完整',requiredAssetIDs:['illustration'],textMode:'automatic',maxTurns:5,includeStructureReference:true,referencePage:1,sendPresetReferences:false};
}
