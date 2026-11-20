import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import manifest from '../../src/creation-library/illustrations/manifest.json' with {type:'json'};
import {templateCatalog,rankTemplates,templateEnabled} from '../../src/creation-library/matcher.js';
import {compileTemplate} from '../../src/creation-library/compiler.js';
import {templateFixture,isTextSlot,isGraphicElement} from '../../src/creation-library/template-elements.js';
import {compileTechnique,techniqueCatalog} from '../../src/creation-library/techniques.js';
import {assetFromSourceSnapshot} from '../../src/material-anatomy.js';
import {inspectCreationDocument} from '../../src/creation-inspection.js';
const imageCache=new Map();
export const libraryVersion=createHash('sha256').update(JSON.stringify([manifest,templateCatalog,techniqueCatalog])).digest('hex');
export async function recipeImages(ids){
 const result=[];
 for(const id of ids){
  const record=manifest.images.find(i=>i.id===id);if(!record)throw Error('教程示意图未安装：'+id);
  if(!imageCache.has(id)){
   const bytes=await readFile(new URL('../../src/creation-library/illustrations/'+record.file,import.meta.url));
   if(bytes.length>512000||createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw Error('教程示意图校验失败');
   imageCache.set(id,'data:image/png;base64,'+bytes.toString('base64'));
  }
  result.push({type:'text',text:'可执行结构示意 '+id+'（由配方生成，色块代表构成关系；不是本次作品或素材）'},{type:'image_url',image_url:{url:imageCache.get(id)}});
 }return result;
}
export function libraryContext(document,reference='page'){
 if(!['page','page.left','page.right'].includes(reference))throw Error('模板仅支持页面或单页区域');
 const height=document.page.physicalPageHeightMM,width=document.page.canvas.width/document.page.canvas.height*height;
 const leaf=reference!=='page'&&document.page.pageMode==='spread';
 const nodes=inspectCreationDocument(document).layers;
 const placed=new Set(nodes.filter(n=>n.asset).map(n=>n.asset));
 const materials=document.source.materials.filter(m=>!placed.has(m.alias)).map(m=>({alias:m.alias,...assetFromSourceSnapshot(document.source.sourceSnapshots.find(s=>s.assetID===m.assetID),{frozenRevision:true})}));
 return {paper:{width:leaf?width/2:width,height},materials,nodes,reference,styles:document.source.styles||[]};
}
export function matchLibraryTemplates(document,{aliases,reference='page',limit=5}={}){
 const context=libraryContext(document,reference);
 if(aliases){if(new Set(aliases).size!==aliases.length||aliases.some(a=>!context.materials.some(m=>m.alias===a)))throw Error('素材已放置或不在本次授权范围');context.materials=context.materials.filter(m=>aliases.includes(m.alias));}
 return rankTemplates({...context,limit}).map(row=>({...row,reference,paper:context.paper}));
}
export function templateDetails(id){
 const template=templateCatalog.templates.find(t=>t.id===id);if(!template)throw Error('未知模板');
 if(!templateEnabled(template))return {id:template.id,title:template.title,available:false,reason:template.usage.reason};
 return {...template,available:true,source:templateCatalog.sources.find(s=>s.id===template.sourceId),
  example:templateFixture(template),
  slots:template.elements.map(e=>({id:e.id,role:e.role,box:e.box,rotation:e.rotation||0,input:isTextSlot(e)?'text-or-material-or-group':isGraphicElement(e)?'digital-graphic':'material-or-group',whenUnassigned:e.contentFor?'only-with-content:'+e.contentFor:isGraphicElement(e)?isTextSlot(e)?'writing-guide':'keep-digital-graphic':'blank',omitWith:'omit',...(e.render?.textBox?{textBox:e.render.textBox}:{})})),
  parameters:{textStyles:'可选 {位置ID:{fontSizePt,fontFamily,textAlign,lineHeight}}；字号为当前纸张实际 pt，不再随纸张重复缩放，仍受区域大小限制',colors:'可选模板 palette 名称到 HEX 的覆盖，只改变数字图形和文字',omit:'可选省略的元素 ID 数组；可删除数字底卡、书写线或指定位置',id:'新组合 ID',reference:'page/page.left/page.right',aliases:'自动匹配的素材范围，或显式绑定的授权子集',bindings:'省略此参数才自动匹配；提供数组时只放指定位置，未绑定素材位置留空；[] 表示不放任何素材。格式 [{slotId,alias}] 或 [{slotId,node}]；node 可复用已有标题组，实体保持原尺寸，不裁切成示意图形状',title:'可选标题，只放 primaryTitle 指定位置；该位置已占用或省略时报告未放置，不挤进编号、引号或日期。其他标题用 texts 指定',texts:'可选 {文字位置ID:完整文字}；正文替换书写引导线。文字随纸张比例调整，有限缩字号；report.textLayout/warnings 返回溢出。不要把 example.texts 当用户内容'},
  tool:{name:'creation_recipe',arguments:{kind:'template',recipeId:id,transactionId:'unique-id',baseSceneRevision:'当前版本',parameters:{id:'layout',reference:'page'}}}};
}
export function compileLibraryRecipe(document,{kind,recipeId,parameters}){
 if(kind==='technique'){
  const materials=document.source.materials.map(m=>({alias:m.alias,...assetFromSourceSnapshot(document.source.sourceSnapshots.find(s=>s.assetID===m.assetID),{frozenRevision:true})}));
  return compileTechnique({methodId:recipeId,parameters,materials});
 }
 if(kind!=='template')throw Error('未知配方类型');
 const template=templateCatalog.templates.find(t=>t.id===recipeId);
 if(template&&!templateEnabled(template))throw Error('模板暂未启用：'+template.usage.reason);
 for(const key of Object.keys(parameters))if(!['id','reference','aliases','bindings','title','texts','textStyles','colors','omit'].includes(key))throw Error('模板不支持参数：'+key);
 const context=libraryContext(document,parameters.reference);
 if(parameters.aliases){if(!Array.isArray(parameters.aliases)||new Set(parameters.aliases).size!==parameters.aliases.length||parameters.aliases.some(a=>!context.materials.some(m=>m.alias===a)))throw Error('素材已放置或不在本次授权范围');context.materials=context.materials.filter(m=>parameters.aliases.includes(m.alias));}
 if(parameters.bindings!==undefined){if(!Array.isArray(parameters.bindings)||parameters.bindings.length>50)throw Error('绑定格式无效');for(const b of parameters.bindings)if(!b||Object.keys(b).some(k=>!['slotId','alias','node'].includes(k)))throw Error('绑定参数无效');}
 if(parameters.title!==undefined&&(typeof parameters.title!=='string'||parameters.title.length>500))throw Error('标题格式无效');
 if(parameters.texts!==undefined&&(!parameters.texts||Array.isArray(parameters.texts)||typeof parameters.texts!=='object'||Object.values(parameters.texts).some(t=>typeof t!=='string'||t.length>1500)))throw Error('文字位置格式无效');
 return compileTemplate({...context,...parameters,templateId:recipeId});
}
