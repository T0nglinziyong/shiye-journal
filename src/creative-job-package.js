import {validateV3SceneDocument} from './v3-scene-schema.js';

export const CREATIVE_JOB_FORMAT='shiye-creative-job-v2';
export function validateCreativeJobPackage(input){
  if(!input||input.format!==CREATIVE_JOB_FORMAT||!input.document)
    throw Error('创作输入格式无效');
  if(Object.keys(input).some(key=>!['format','document','brief'].includes(key)))throw Error('创作任务仅接收页面、素材 ID 和设置；图像、字体与 Skill 由服务器管理');
  validateV3SceneDocument(input.document);
  const materials=input.document.source.materials;
  if(materials.length>80||new Set(materials.map(v=>v.alias)).size!==materials.length)throw Error('创作素材清单无效');
  if(input.brief===null||typeof input.brief!=='object'||Array.isArray(input.brief)||JSON.stringify(input.brief).length>20000)throw Error('创作方向格式无效');
  return input;
}
