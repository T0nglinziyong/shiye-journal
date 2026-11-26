import {creationOperationSpecs,creationCommonDefinitions} from '../../src/creation-command-spec.js';

const specs=Object.fromEntries(creationOperationSpecs.map(entry=>[entry.name,entry]));
const clone=value=>structuredClone(value);
const fields=name=>{const properties=clone(specs[name].schema.properties);delete properties.op;return properties;};
const pick=(source,names)=>Object.fromEntries(names.filter(name=>source[name]).map(name=>[name,source[name]]));
const omit=(source,names)=>Object.fromEntries(Object.entries(source).filter(([name])=>!names.includes(name)));
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const common=['id','parent','place','size','style','order'];
const text=fields('text.add'),title=fields('title.add'),paper=fields('paper.add');
const baseUpdate=fields('layer.update');
const textExtras=['effect','accentColor','layout','curveHeightMm','backdrop','runs','gapMm'];
const textDescriptions={
 effect:'字形效果：none、outline、hollow、offset-outline 或 gradient-outline；正文保持易读。',
 accentColor:'描边、错位轮廓或渐变使用的第二颜色。',
 layout:'字群排列：plain、stagger 或 curve。',
 curveHeightMm:'仅 curve 布局使用；正负值改变弯曲方向。',
 backdrop:'文字背后的可编辑衬形，不必另外创建纸张。',
 runs:'短标题的词组拆分、局部样式及错位；完整拼接须等于 content。',
 gapMm:'词组间距。'
};
const textProps={content:text.content,...pick(title,textExtras)};
for(const [name,description] of Object.entries(textDescriptions))textProps[name]={...textProps[name],description};
const materialProps={asset:fields('material.add').asset,mask:object({region:creationCommonDefinitions.Region,mode:fields('layer.mask').mode},['mode']),relation:{$ref:'#/$defs/Relation'}};
const commonPatch={};

// This is the model's single capability catalog. Its schemas drive validation,
// prompt descriptions, and lowering into the current editable Scene commands.
export const canvasCapabilityRegistry=Object.freeze({
 material:{title:'真实素材',createCommand:'material.add',createStyle:fields('material.add').style,createProps:object({asset:materialProps.asset},['asset']),updateProps:object({...commonPatch,...materialProps})},
 text:{title:'正文、标题和数字文字',createCommand:'text.add',createStyle:{$ref:'#/$defs/TitleStyle'},createProps:object(textProps,['content']),updateProps:object({...commonPatch,...textProps,fit:fields('text.fit').fit})},
 paper:{title:'数字纸张',createCommand:'paper.add',createStyle:paper.style,createProps:object(pick(paper,['texture','pattern','rows','columns'])),updateProps:object({...commonPatch,...pick(paper,['texture','pattern','rows','columns'])})},
 graphic:{title:'图形和笔迹',createCommand:'graphic.add',createStyle:fields('graphic.add').style,createProps:object({geometry:fields('graphic.add').geometry},['geometry']),updateProps:object({...commonPatch,geometry:baseUpdate.geometry})},
 tape:{title:'真实胶带',createCommand:'material.tape',createStyle:fields('material.tape').style,createProps:{...object(omit(fields('material.tape'),common),['asset']),oneOf:clone(specs['material.tape'].schema.oneOf)},updateProps:object({...commonPatch})},
 group:{title:'对象组合',createCommand:'group.create',createProps:null,updateProps:object({...commonPatch,layoutBox:baseUpdate.layoutBox})},
 page:{title:'页面底色和纸型',createCommand:'page.update',createProps:null,updateProps:object({color:creationCommonDefinitions.Color,pattern:fields('page.update').paperPattern,rulingMm:fields('page.update').rulingMm,centerGutter:{type:'boolean'}})}
});
export const canvasCommonFields=Object.freeze({
 create:pick(text,['id','parent','place','size','style','order']),
 update:pick(baseUpdate,['place','size','style','order','hidden','locked','name']),
 definitions:creationCommonDefinitions
});
export const canvasCapabilityKinds=Object.freeze(Object.keys(canvasCapabilityRegistry));
export function canvasKindOfNode(node){
 if(!node)return null;
 if(node.creationObject?.kind==='paper')return 'paper';
 if(node.type==='material')return node.kind==='tape'?'tape':'material';
 if(node.creationObject?.kind==='title')return 'text';
 if(node.type==='group')return 'group';
 if(node.type==='text')return 'text';
 if(node.type==='shape')return 'graphic';
 return null;
}
