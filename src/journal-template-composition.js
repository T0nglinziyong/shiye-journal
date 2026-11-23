import {templateCatalog,templateManualEnabled} from '../creative-agent/library/matcher.js';

const byId=new Map(templateCatalog.templates.map(template=>[template.id,template]));
export function executableJournalTemplates(){
  return templateCatalog.templates.map(template=>({
    id:template.id,title:template.title,origin:'preset',
    structure:template.reconstruction?.sourceObservation||template.reconstruction?.scope||'',
    tags:[...new Set([...template.styles,...template.content])],
    styles:template.styles,purposes:template.content,
    toolTemplateId:template.id,templateImagePath:`/template-illustrations/${template.id}.webp`,
    elements:template.elements,aspect:template.aspect,isCallable:templateManualEnabled(template)
  }));
}

export function journalTemplateComposition(item){
  const template=byId.get(item?.toolTemplateId||item?.id);
  return template?{toolTemplateId:template.id,title:template.title,
    aspect:template.aspect,elements:template.elements}:null;
}
