import {creationResources} from '../../scripts/creation-resources.mjs';
let installed;
export function installedCreationResources(){
 return installed||=creationResources().catch(error=>{installed=null;throw error;});
}
export function requireResourceVersion(expected,actual){
 if(expected!==actual)throw Object.assign(Error('创作资源正在更新，请更新拾页后重试；原稿已保留'),{code:'CREATIVE_RESOURCE_VERSION'});
}
