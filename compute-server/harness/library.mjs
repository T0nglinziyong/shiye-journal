import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import manifest from '../../src/creation-library/illustrations/manifest.json' with {type:'json'};
import {templateCatalog,rankTemplates,scoreTemplate,templateEnabled} from '../../src/creation-library/matcher.js';
import {compileTemplate} from '../../src/creation-library/compiler.js';
import {templateFixture,isTextSlot,isGraphicElement} from '../../src/creation-library/template-elements.js';
import {compileTechnique,techniqueCatalog} from '../../src/creation-library/techniques.js';
import digitalCaseCatalog from '../../src/creation-library/digital-cases.json' with {type:'json'};
import xhsCaseCatalog from '../../src/creation-library/xhs-cases.json' with {type:'json'};
import {assetFromSourceSnapshot} from '../../src/material-anatomy.js';
import {inspectCreationDocument} from '../../src/creation-inspection.js';
const imageCache=new Map();
const digitalJournalCases=[...xhsCaseCatalog.cases,...digitalCaseCatalog.cases];
export const libraryVersion=createHash('sha256').update(JSON.stringify([manifest,templateCatalog,techniqueCatalog,digitalCaseCatalog,xhsCaseCatalog])).digest('hex');
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
const normalized=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
const similar=(a,b)=>normalized(a).includes(normalized(b))||normalized(b).includes(normalized(a));
const bigrams=value=>{const text=normalized(value),result=new Set();for(let i=0;i<text.length-1;i++)result.add(text.slice(i,i+2));return result;};
function relevance(query,fields){
 const q=normalized(query);if(!q)return {score:0,hits:[]};
 let direct=0;const hits=[];
 for(const [kind,values,weight] of fields)for(const value of values||[]){const term=normalized(value);if(term.length<2)continue;if(q.includes(term)){direct+=weight;hits.push({field:kind,value});}}
 const queryPairs=bigrams(q),documentPairs=bigrams(fields.flatMap(([,values])=>values||[]).join(' '));
 const common=[...queryPairs].filter(pair=>documentPairs.has(pair)).length;
 const overlap=queryPairs.size?common/queryPairs.size:0;
 return {score:Math.min(100,direct+Math.round(overlap*30)),hits,overlap};
}
export function searchLibraryReferences(document,{query='',kind='all',styles=[],content=[],reference='page',limit=6}={}){
 const context=libraryContext(document,reference),results=[];
 if(!['all','templates','techniques','cases'].includes(kind))throw Error('未知参考类型');
 if(['all','templates'].includes(kind))for(const template of templateCatalog.templates.filter(templateEnabled)){
  if(styles.length&&!styles.some(style=>template.styles.some(value=>normalized(value).includes(normalized(style))||normalized(style).includes(normalized(value)))))continue;
  if(content.length&&!content.some(term=>template.content.some(value=>normalized(value).includes(normalized(term))||normalized(term).includes(normalized(value)))))continue;
  const source=templateCatalog.sources.find(source=>source.id===template.sourceId);
  const match=relevance(query,[['title',[template.title],35],['style',template.styles,25],['content',template.content,20],['family',[template.family],10],['source',[source?.title,source?.author],7]]);
  if(query&&!match.hits.length&&match.overlap<.25)continue;
  const fit=scoreTemplate(template,context.materials,context.paper,{styles:context.styles,content}),score=Math.round(match.score+fit.score*.25);
  results.push({kind:'template',id:template.id,title:template.title,score,why:{matched:match.hits,materialFit:Math.round(fit.score),paperAspect:Math.round(fit.components.aspect*100)},styles:template.styles,content:template.content,source:{id:source?.id,title:source?.title,author:source?.author,url:source?.url},readWith:{tool:'read_template',id:template.id}});
 }
 if(['all','techniques'].includes(kind))for(const method of techniqueCatalog.methods){
  if(styles.length||content.length)continue;
  const match=relevance(query,[['title',[method.title],35],['purpose',[method.when],20],['method',[method.lesson?.principle],12],['skill',[method.skill],8]]);
  if(query&&!match.hits.length&&match.overlap<.25)continue;
  results.push({kind:'technique',id:method.id,title:method.title,score:match.score,why:{matched:match.hits},skill:method.skill,source:method.lesson?.source||null,readWith:{tool:'read_skill',name:method.skill,level:'detail',methodId:method.id}});
 }
 if(['all','cases'].includes(kind))for(const study of digitalJournalCases){
  if(study.archived)continue;
  if(study.pageMode!==document.page.pageMode)continue;
  if(styles.length&&!styles.some(style=>study.styles.some(value=>similar(value,style))))continue;
  if(content.length&&!content.some(term=>study.content.some(value=>similar(value,term))))continue;
  const match=relevance(query,[['title',[study.title],35],['style',study.styles,25],['content',study.content,20],['role',study.roles,12],['composition',[study.composition],8]]);
  if(query&&!match.hits.length&&match.overlap<.25)continue;
  const materialKinds=new Set(context.materials.map(material=>normalized(material.kind)));
  const roleFit=study.roles.filter(role=>materialKinds.has(normalized(role))).length;
  const styleFit=study.styles.some(style=>context.styles.some(value=>similar(style,value)))?15:0;
  results.push({kind:'case',id:study.id,title:study.title,score:match.score+roleFit*6+styleFit+(study.id.startsWith('xhs-')?16:0),why:{matched:match.hits,materialRoles:roleFit,pageMode:study.pageMode},styles:study.styles,content:study.content,source:study.source,summary:study.composition,readWith:{tool:'read_case',id:study.id}});
 }
 const remaining=results.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)),selected=[];
 const sources=new Map(),skills=new Map();
 while(remaining.length&&selected.length<limit){
  let bestIndex=0,bestValue=-Infinity;
  for(let i=0;i<remaining.length;i++){
   const item=remaining[i],group=item.kind==='technique'?item.skill:item.source?.url||item.source?.id;
   const count=(item.kind==='technique'?skills:sources).get(group)||0;
   const value=item.score-count*12;
   if(value>bestValue){bestValue=value;bestIndex=i;}
  }
  const [item]=remaining.splice(bestIndex,1),group=item.kind==='technique'?item.skill:item.source?.url||item.source?.id;
  const counts=item.kind==='technique'?skills:sources;
  counts.set(group,(counts.get(group)||0)+1);selected.push(item);
 }
 return {version:libraryVersion,query,reference,results:selected};
}
export function caseDetails(id,document){
 const study=digitalJournalCases.find(item=>item.id===id);if(!study)throw Error('未知案例');
 if(document&&study.pageMode!==document.page.pageMode)throw Error('案例页面模式与当前创作不一致');
 return {...study,usage:'仅借鉴构图、配色与对象关系；来源图片和案例文字不是本次授权素材，不得直接放入作品。'};
}
export function matchJournalCases(document,{limit=3}={}){
 return searchLibraryReferences(document,{kind:'cases',limit}).results;
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
