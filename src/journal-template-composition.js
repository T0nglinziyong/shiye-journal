import {templateCatalog,templateManualEnabled} from '../creative-agent/library/matcher.js';
import {listCurrentTemplates,currentTemplate} from '../creative-agent/library/current-templates.js';

const byId=new Map(templateCatalog.templates.map(template=>[template.id,template]));
export function executableJournalTemplates(){
  return [...listCurrentTemplates().map(template=>({...template,origin:'preset',
    isCallable:true,toolTemplateId:template.id})),...templateCatalog.templates.map(template=>({
    id:template.id,title:template.title,origin:'preset',
    type:'old',
    structure:template.reconstruction?.sourceObservation||template.reconstruction?.scope||'',
    tags:[...new Set([...template.styles,...template.content])],
    styles:template.styles,purposes:template.content,
    toolTemplateId:template.id,templateImagePath:`/template-illustrations/${template.id}.webp`,
    elements:template.elements,aspect:template.aspect,isCallable:false,
    wasCallable:templateManualEnabled(template)
  }))];
}

export function journalTemplateComposition(item){
  const active=currentTemplate(item?.toolTemplateId||item?.id);
  if(active)return {toolTemplateId:active.id,title:active.title,aspect:active.aspect,
    elements:active.elements,type:'new'};
  const template=byId.get(item?.toolTemplateId||item?.id);
  return template?{toolTemplateId:template.id,title:template.title,
    aspect:template.aspect,elements:template.elements,type:'old'}:null;
}
