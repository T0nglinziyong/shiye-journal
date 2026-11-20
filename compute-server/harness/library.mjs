import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import manifest from '../../src/creation-library/illustrations/manifest.json' with {type:'json'};
import {templateCatalog,rankTemplates,templateEnabled} from '../../src/creation-library/matcher.js';
import {compileTemplate} from '../../src/creation-library/compiler.js';
import {templateFixture} from '../../src/creation-library/template-elements.js';
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
  parameters:{colors:'可选模板 palette 名称到 HEX 的覆盖，只改变数字图形和文字',omit:'可选省略的元素 ID 数组',id:'新组合 ID',reference:'page/page.left/page.right',aliases:'可选素材别名列表，省略时匹配未放置素材',bindings:'可选 [{slotId,alias}] 或 [{slotId,node}]；node 可引用已生成的标题组',title:'可选标题，未提供不生成',texts:'可选 {文字位置ID:完整文字}；书写区输入正文后替换示意引导线，按内部文字区域排版，长文需要检查预览'},
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
 for(const key of Object.keys(parameters))if(!['id','reference','aliases','bindings','title','texts','colors','omit'].includes(key))throw Error('模板不支持参数：'+key);
 const context=libraryContext(document,parameters.reference);
 if(parameters.aliases){if(!Array.isArray(parameters.aliases)||new Set(parameters.aliases).size!==parameters.aliases.length||parameters.aliases.some(a=>!context.materials.some(m=>m.alias===a)))throw Error('素材已放置或不在本次授权范围');context.materials=context.materials.filter(m=>parameters.aliases.includes(m.alias));}
 if(parameters.bindings){if(!Array.isArray(parameters.bindings)||parameters.bindings.length>50)throw Error('绑定格式无效');for(const b of parameters.bindings)if(!b||Object.keys(b).some(k=>!['slotId','alias','node'].includes(k)))throw Error('绑定参数无效');}
 if(parameters.title!==undefined&&(typeof parameters.title!=='string'||parameters.title.length>500))throw Error('标题格式无效');
 if(parameters.texts!==undefined&&(!parameters.texts||Array.isArray(parameters.texts)||typeof parameters.texts!=='object'||Object.values(parameters.texts).some(t=>typeof t!=='string'||t.length>1500)))throw Error('文字位置格式无效');
 return compileTemplate({...context,...parameters,templateId:recipeId});
}
