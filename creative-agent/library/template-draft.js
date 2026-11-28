import {compileMeasuredD146} from './measured-d146.js';
import {compileMeasuredCase} from './measured-case-templates.js';
import {compileSixSpreadTemplate,listSixSpreadTemplates,matchSixSpreadMaterials} from './six-spread-templates.js';
import {compileThreeLayoutSpread,listThreeLayoutSpreads,matchThreeLayoutSpread} from './three-layout-template-matcher.js';
import {withoutSplitAssignments,applyTemplateSplitPlan} from './template-split-compiler.js';
export {refineMeasuredTemplate as refineTemplateDraft} from './refine-measured-template.js';

const compileSpread=({templateId,assets,bindings,texts,palette,plan})=>compileSixSpreadTemplate({templateId,assets,plan:plan||matchSixSpreadMaterials(templateId,assets,{overrides:bindings}),texts,palette});
const compileNewSpread=({templateId,assets,bindings,texts,palette,plan})=>compileThreeLayoutSpread({templateId,assets,plan:plan||matchThreeLayoutSpread(templateId,assets,{bindings}),texts,palette});
const templates=new Map([['D143',compileMeasuredCase],['D146',compileMeasuredD146],['D153',compileMeasuredCase],['D158',compileMeasuredCase],['D162',compileMeasuredCase],...listSixSpreadTemplates().map(id=>[id,compileSpread]),...listThreeLayoutSpreads().map(id=>[id,compileNewSpread])]);

/** Build an editable first draft from a measured layout and a material basket. */
export function compileTemplateDraft({templateId,assets=[],bindings={},texts={},palette={},layout={},slotValues={},plan}={}){
 const compile=templates.get(templateId);
 if(!compile)throw new RangeError(`尚无可用的量测模板：${templateId}`);
 const splitSlots=new Set((plan?.splitGroups||[]).flatMap(group=>group.slots));
 const baseBindings=Object.fromEntries(Object.entries(bindings).filter(([slot])=>!splitSlots.has(slot)));
 const baseValues=Object.fromEntries(Object.entries(slotValues).filter(([slot])=>!splitSlots.has(slot)));
 const basePlan=splitSlots.size?withoutSplitAssignments(plan):plan;
 const result=compile({templateId,assets,bindings:baseBindings,texts,palette,layout,slotValues:baseValues,plan:basePlan});
 return applyTemplateSplitPlan(result,plan);
}

export function listTemplateDrafts(){
 return [...templates.keys()];
}
