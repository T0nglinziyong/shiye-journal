import {templateCatalog,templateManualEnabled} from './creation-library/matcher.js';

const byId=new Map(templateCatalog.templates.map(template=>[template.id,template]));
const caseByFamily={
  'photo-editorial':'photo-editorial','photo-cluster':'quiet-day',route:'travel-route',
  'shape-composition':'photo-editorial',center:'handwritten-observation',
  's-route':'travel-route','photo-thirds':'photo-editorial',
  'writing-alternate':'handwritten-observation','writing-top-anchor':'handwritten-observation',
  'writing-bottom-anchor':'handwritten-observation'
};
const caseImage=family=>`/journal-cases/${caseByFamily[family]||
  (family.startsWith('frame-')?'gentle-planner':'photo-editorial')}.png`;

export function executableJournalTemplates(){
  return templateCatalog.templates.map(template=>({
    id:template.id,title:template.title,origin:'preset',
    structure:template.reconstruction?.sourceObservation||template.reconstruction?.scope||'',
    tags:[...new Set([...template.styles,...template.content])],
    styles:template.styles,purposes:template.content,
    toolTemplateId:template.id,templateImagePath:`/template-illustrations/${template.id}.webp`,
    elements:template.elements,aspect:template.aspect,isCallable:templateManualEnabled(template),
    exampleImagePath:caseImage(template.family),exampleIsReference:true
  }));
}

export function journalTemplateComposition(item){
  const template=byId.get(item?.toolTemplateId||item?.id);
  return template?{toolTemplateId:template.id,title:template.title,
    aspect:template.aspect,elements:template.elements}:null;
}
