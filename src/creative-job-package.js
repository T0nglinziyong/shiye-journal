import {validateV3SceneDocument} from './v3-scene-schema.js';

export const CREATIVE_JOB_FORMAT='shiye-creative-job-v1';
export function validateCreativeJobPackage(input,{userID,jobID}){
  if(!input||input.format!==CREATIVE_JOB_FORMAT||!input.document||!Array.isArray(input.images)||input.images.length>80)
    throw Error('创作输入格式无效');
  if(Object.keys(input).some(key=>!['format','document','images','brief'].includes(key)))throw Error('创作任务仅接收页面、素材图像引用和设置；字体与 Skill 由服务器管理');
  validateV3SceneDocument(input.document);
  const materials=input.document.source.materials;
  if(input.images.length!==materials.length||new Set(input.images.map(v=>v.alias)).size!==materials.length)throw Error('创作素材图像清单不完整');
  const prefix=`${userID}/creative/${jobID}/assets/`;
  for(const item of input.images){
    if(!materials.some(m=>m.alias===item.alias)||!/^sha256:[a-f0-9]{64}$/.test(item.sha256)||
      item.path!==prefix+item.sha256.slice(7)+'.png')throw Error('创作素材路径或指纹无效');
  }
  if(input.brief===null||typeof input.brief!=='object'||Array.isArray(input.brief)||JSON.stringify(input.brief).length>20000)throw Error('创作方向格式无效');
  return input;
}
