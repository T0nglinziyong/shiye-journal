// Creation adapter only; the title layout model lives in the shared Scene.
import {insertSceneNode} from './creation-scene-core.js';
import {createLetteringGroup} from './scene-lettering.js';
export function addLettering(doc,item,assets,{finishNode}){
 doc=insertSceneNode(doc,createLetteringGroup(doc.page,item),assets,item.parent);
 return finishNode(doc,item.id,{place:item.place,order:item.order},assets,{created:true});
}
