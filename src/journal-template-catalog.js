import {journalAbstractTemplates} from './journal-abstract-templates.js';
import {journalReferenceCases} from './journal-reference-catalog.js';

export const USER_TEMPLATE_PREFIX='journal-template:';
const families=new Map(journalReferenceCases.map(item=>[item.id,item]));
const unique=values=>[...new Set(values.map(value=>String(value||'').trim()).filter(Boolean))];
const words=text=>String(text||'').toLocaleLowerCase().match(/[\p{Script=Han}]{2,}|[a-z0-9]+/gu)||[];

export function presetJournalTemplates(){
  return journalAbstractTemplates.map(item=>{
    const family=families.get(item.caseId);
    return {...item,origin:'preset',styles:[...family.styles],purposes:[...family.purposes],
      tags:unique([family.title,...family.styles,...family.purposes,...family.materialWords,...words(item.title),...words(item.structure).filter(word=>word.length<=6)]),
      exampleImage:family.image,exampleTitle:family.title};
  });
}

export function normalizeUserTemplate(value){
  if(!value||typeof value!=='object'||!String(value.id||'').startsWith(USER_TEMPLATE_PREFIX))throw Error('模板标识无效');
  const title=String(value.title||'').trim().slice(0,80),structure=String(value.structure||'').trim().slice(0,2000);
  if(!title||!structure)throw Error('请填写模板名称和结构说明');
  const tags=unique(Array.isArray(value.tags)?value.tags:[]).slice(0,24),styles=unique(Array.isArray(value.styles)?value.styles:[]).slice(0,8),purposes=unique(Array.isArray(value.purposes)?value.purposes:[]).slice(0,8);
  if(!tags.length)throw Error('请至少填写一个检索标签');
  return {id:value.id,origin:'user',title,structure,tags,styles,purposes,caseId:null,
    templateBlobId:value.templateBlobId||null,exampleBlobId:value.exampleBlobId||null,
    createdAt:value.createdAt||new Date().toISOString(),updatedAt:value.updatedAt||new Date().toISOString()};
}

export function templateIndexText(item){return unique([item.title,item.structure,...item.tags,...item.styles,...item.purposes]).join(' ').toLocaleLowerCase();}

export function rankJournalTemplates(context={},custom=[],limit=3){
  const all=[...presetJournalTemplates(),...custom.map(normalizeUserTemplate)];
  const styles=unique(context.styles||[]),purposes=unique(context.purposes||[]);
  const materialWords=unique((context.materials||[]).flatMap(item=>[item.title,...(item.tags||[]),item.kind]));
  const scored=all.map((item,index)=>{
    const text=templateIndexText(item);
    const exact=(values,selected,weight)=>selected.reduce((sum,key,rank)=>sum+(values.includes(key)?weight/(rank+1):0),0);
    const material=materialWords.reduce((sum,word)=>sum+(word.length>=2&&text.includes(word.toLocaleLowerCase())?1:0),0);
    const score=exact(item.styles,styles,8)+exact(item.purposes,purposes,10)+Math.min(material,6)*2+
      (item.exampleBlobId||item.exampleSourceNumbers?.length?0.25:0);
    return {item,index,score};
  }).sort((a,b)=>b.score-a.score||a.index-b.index);
  return scored.slice(0,Math.max(0,limit)).map(({item})=>item);
}
