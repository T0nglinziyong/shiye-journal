// Task envelope adapter. Both AI and manual edits use the same Scene kernel.
import {editScene,creationNode,creationLocation} from './creation-scene-core.js';
import {changedNodeProperties} from './scene-node-properties.js';
export {dimension,dimensions,changedNodeProperties,styleFor} from './scene-node-properties.js';
export function updateCreationNode(document,id,change,assets){
 const node=creationNode(document,id),parent=creationLocation(document.page.layers,id)?.parent?.id;
 if(!Object.keys(changedNodeProperties(document.page,node,change,parent)).length&&!change.place)return document;
 return editScene(document,[{op:'properties',id:creationNode(document,id).id,change}],assets);
}
