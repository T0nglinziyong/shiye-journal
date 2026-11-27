import {compileMeasuredD146} from './measured-d146.js';
import {compileMeasuredCase} from './measured-case-templates.js';
import {compileSixSpreadTemplate,listSixSpreadTemplates,matchSixSpreadMaterials} from './six-spread-templates.js';
import {compileThreeLayoutSpread,listThreeLayoutSpreads,matchThreeLayoutSpread} from './three-layout-template-matcher.js';
export {refineMeasuredTemplate as refineTemplateDraft} from './refine-measured-template.js';

const compileSpread=({templateId,assets,bindings,texts,palette})=>compileSixSpreadTemplate({templateId,assets,plan:matchSixSpreadMaterials(templateId,assets,{overrides:bindings}),texts,palette});
const compileNewSpread=({templateId,assets,bindings,texts,palette})=>compileThreeLayoutSpread({templateId,assets,plan:matchThreeLayoutSpread(templateId,assets,{bindings}),texts,palette});
const templates=new Map([['D143',compileMeasuredCase],['D146',compileMeasuredD146],['D153',compileMeasuredCase],['D158',compileMeasuredCase],['D162',compileMeasuredCase],...listSixSpreadTemplates().map(id=>[id,compileSpread]),...listThreeLayoutSpreads().map(id=>[id,compileNewSpread])]);

/** Build an editable first draft from a measured layout and a material basket. */
export function compileTemplateDraft({templateId,assets=[],bindings={},texts={},palette={},layout={},slotValues={}}={}){
 const compile=templates.get(templateId);
 if(!compile)throw new RangeError(`尚无可用的量测模板：${templateId}`);
 return compile({templateId,assets,bindings,texts,palette,layout,slotValues});
}

export function listTemplateDrafts(){
 return [...templates.keys()];
}
