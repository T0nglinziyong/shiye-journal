import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import manifest from '../../creative-agent/library/illustrations/manifest.json' with {type:'json'};
import {templateCatalog} from '../../creative-agent/library/matcher.js';
import {listCurrentTemplates,currentTemplate,rankCurrentTemplates,compileCurrentTemplate} from '../../creative-agent/library/current-templates.js';
import {compileTechnique,techniqueCatalog} from '../../creative-agent/library/techniques.js';
import digitalCaseCatalog from '../../creative-agent/library/digital-cases.json' with {type:'json'};
import xhsCaseCatalog from '../../creative-agent/library/xhs-cases.json' with {type:'json'};
import {assetFromSourceSnapshot} from '../../src/material-anatomy.js';
import {inspectCreationDocument} from '../../src/creation-inspection.js';
const imageCache=new Map();
const digitalJournalCases=[...xhsCaseCatalog.cases,...digitalCaseCatalog.cases];
export const libraryVersion=createHash('sha256').update(JSON.stringify([manifest,templateCatalog,
 listCurrentTemplates().map(({id,elements})=>[id,elements.length]),techniqueCatalog,digitalCaseCatalog,xhsCaseCatalog])).digest('hex');
export async function recipeImages(ids){
 const result=[];
 for(const id of ids){
  const record=manifest.images.find(i=>i.id===id);if(!record)throw Error('教程示意图未安装：'+id);
  if(!imageCache.has(id)){
   const bytes=await readFile(new URL('../../creative-agent/library/illustrations/'+record.file,import.meta.url));
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
function requiredAliases(document,materials){
 const required=new Set(document.source.requiredAssetIDs||[]);
 const available=new Set(materials.map(material=>material.alias));
 return (document.source.materials||[]).filter(material=>required.has(material.assetID)&&available.has(material.alias))
  .map(material=>material.alias);
}
export function matchLibraryTemplates(document,{aliases,reference='page',limit=5}={}){
 const context=libraryContext(document,reference);
 if(aliases){if(new Set(aliases).size!==aliases.length||aliases.some(a=>!context.materials.some(m=>m.alias===a)))throw Error('素材已放置或不在本次授权范围');context.materials=context.materials.filter(m=>aliases.includes(m.alias));}
 return rankCurrentTemplates({materials:context.materials,pageMode:document.page.pageMode,
  paper:context.paper,limit,mustUse:requiredAliases(document,context.materials)})
  .map(({template,plan,...row})=>({...row,reference,paper:context.paper}));
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
export function searchLibraryReferences(document,{query='',kind='all',styles=[],content=[],reference='page',limit=6,includeTemplates=true}={}){
 const context=libraryContext(document,reference),results=[];
 if(!['all','templates','techniques','cases'].includes(kind))throw Error('未知参考类型');
 const rankedCurrent=includeTemplates&&['all','templates'].includes(kind)?
  rankCurrentTemplates({materials:context.materials,pageMode:document.page.pageMode,limit:14,
   mustUse:requiredAliases(document,context.materials)}):[];
 if(includeTemplates&&['all','templates'].includes(kind))for(const template of listCurrentTemplates().filter(t=>t.pageMode===document.page.pageMode)){
  if(styles.length&&!styles.some(style=>template.styles.some(value=>normalized(value).includes(normalized(style))||normalized(style).includes(normalized(value)))))continue;
  if(content.length&&!content.some(term=>template.purposes.some(value=>normalized(value).includes(normalized(term))||normalized(term).includes(normalized(value)))))continue;
  const match=relevance(query,[['title',[template.title],35],['style',template.styles,25],['content',template.purposes,20],['structure',[template.structure],10]]);
  if(query&&!match.hits.length&&match.overlap<.25)continue;
  const fit=rankedCurrent.find(row=>row.id===template.id);
  const score=Math.round(match.score+(fit?.score||0)*.25);
  results.push({kind:'template',id:template.id,title:template.title,score,
    why:{matched:match.hits,materialFit:Math.round(fit?.score||0)},styles:template.styles,
    content:template.purposes,source:{id:template.id,title:'量测模板'},
    readWith:{tool:'read_template',id:template.id}});
 }
 if(['all','techniques'].includes(kind))for(const method of techniqueCatalog.methods){
  if(styles.length||content.length)continue;
  const matches=[{title:method.title,when:method.when,lesson:method.lesson},...(method.variants||[])].map(option=>({option,match:relevance(query,[['title',[option.title],35],['purpose',[option.when],20],['method',[option.lesson?.principle],12],['skill',[method.skill],8]])}));
  const {option,match}=matches.sort((a,b)=>b.match.score-a.match.score)[0];
  if(query&&!match.hits.length&&match.overlap<.25)continue;
  results.push({kind:'technique',id:method.id,title:option.title,score:match.score,why:{matched:match.hits},...(option.key?{variant:option.key}:{}),skill:method.skill,source:option.lesson?.source||null,readWith:{tool:'read_skill',name:method.skill,level:'detail',methodId:method.id,...(option.key?{variant:option.key}:{})}});
 }
 if(['all','cases'].includes(kind))for(const study of digitalJournalCases){
  if(study.archived)continue;
  if(study.pageMode!==document.page.pageMode)continue;
  if(styles.length&&!styles.some(style=>study.styles.some(value=>similar(value,style))))continue;
  if(content.length&&!content.some(term=>study.content.some(value=>similar(value,term))))continue;
  const match=relevance(query,[['title',[study.title],35],['style',study.styles,25],['content',study.content,20],['role',study.roles,12],['composition',[study.composition],8]]);
  if(query&&!match.hits.length&&match.overlap<.25)continue;
  const styleFit=context.styles.length?study.styles.some(style=>context.styles.some(value=>similar(style,value)))?42:-18:0;
  const rich=context.styles.some(style=>/丰富|层叠|拼贴|杂志/.test(style));
  const layeringFit=rich?(/[叠压盖交错]/.test(study.composition+' '+study.objects)?18:0)+(/[底纸纸片]/.test(study.composition+' '+study.objects)?8:0)-(/留白|疏排/.test(study.composition+' '+study.objects)?14:0):0;
  results.push({kind:'case',id:study.id,title:study.title,score:match.score+styleFit+layeringFit+(study.id.startsWith('xhs-')?8:0),why:{matched:match.hits,styleFit,layeringFit,pageMode:study.pageMode},styles:study.styles,content:study.content,source:study.source,summary:study.composition,readWith:{tool:'read_case',id:study.id}});
 }
 const remaining=results.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)),selected=[];
 const sources=new Map(),skills=new Map();
 while(remaining.length&&selected.length<limit){
  let bestIndex=-1,bestValue=-Infinity;
  for(let i=0;i<remaining.length;i++){
   const item=remaining[i],group=item.kind==='technique'?item.skill:item.source?.url||item.source?.id;
   const count=(item.kind==='technique'?skills:sources).get(group)||0;
   const value=item.score-count*(item.kind==='case'?5:12);
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
 const active=currentTemplate(id);
 if(active)return {id:active.id,title:active.title,available:true,styles:active.styles,
  source:null,slots:active.elements.map(({id,role,box,must,prefer,accepts,sizeMm})=>({
   id,role,box,must,prefer,accepts,sizeMm})),parameters:{},palette:null};
 const template=templateCatalog.templates.find(t=>t.id===id);if(!template)throw Error('未知模板');
 return {id:template.id,title:template.title,available:false,reason:'旧模板已下线匹配，仍可在模板库查看'};
}
export function compileLibraryRecipe(document,{kind,recipeId,parameters}){
 if(kind==='technique'){
  const materials=document.source.materials.map(m=>({alias:m.alias,...assetFromSourceSnapshot(document.source.sourceSnapshots.find(s=>s.assetID===m.assetID),{frozenRevision:true})}));
  return compileTechnique({methodId:recipeId,parameters,materials});
 }
 if(kind!=='template')throw Error('未知配方类型');
 if(currentTemplate(recipeId)){
  const context=libraryContext(document,parameters.reference||'page');
  if(currentTemplate(recipeId).pageMode!==document.page.pageMode)throw Error('模板与单页／双页模式不一致');
  return compileCurrentTemplate({templateId:recipeId,assets:context.materials,
   mustUse:requiredAliases(document,context.materials),
   bindings:Object.fromEntries((parameters.bindings||[]).map(({slotId,alias})=>[slotId,alias])),
   slotValues:Object.fromEntries((parameters.bindings||[]).map(({slotId})=>[slotId,{fit:'none'}])),
   texts:parameters.texts||{},palette:parameters.colors||{}});
 }
 const template=templateCatalog.templates.find(t=>t.id===recipeId);
 if(template)throw Error('旧模板已下线匹配，仍可在模板库查看');
 throw Error('未知模板');
}
