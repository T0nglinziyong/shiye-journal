import {paperPresets} from './paper-sizes.js';
const matchingPaperIDs=new Set(paperPresets.map(paper=>paper.id));
export const normalizeMatchingPaper=value=>matchingPaperIDs.has(value)?value:'a4';
export const styleGroups=[
  {id:'mood',label:'视觉风格',options:['随材而定','清新淡雅','美式拼贴','复古旧物','日系文具','童趣可爱','杂志排版']},
  {id:'layout',label:'画面疏密',options:['自动安排','疏朗留白','均衡编排','丰富层叠']}
];
export const purposeGroups=[{id:'page',label:'页面用途',options:['自由创作','清单计划','主题封面']}];
export const matchingContentOptions={original:'灵感随写',documentary:'日常记录',visual:'纯粹拼贴'};
export function selectedDirections(groups,values=[]){const selected=new Set(values);return groups.map(group=>group.options.find(name=>selected.has(name))||group.options[0]);}
export function normalizeMatchingDirection(state){
  state.matchRatio=normalizeMatchingPaper(state.matchRatio);
  state.matchStyles=selectedDirections(styleGroups,state.matchStyles||[state.matchStyle]);
  state.matchPurposes=selectedDirections(purposeGroups,state.matchPurposes||[state.matchPurpose]);
  state.matchStyle=state.matchStyles[0];state.matchPurpose=state.matchPurposes[0];
  if(!Object.hasOwn(matchingContentOptions,state.matchContentPolicy))state.matchContentPolicy='original';
  return state;
}
export function matchingIntentPlaceholder(policy,purpose){
  if(policy==='visual')return '有什么构图想法？不填也可以。';
  if(policy==='documentary')return '记下几件小事，几个词也可以。';
  if(purpose==='清单计划')return '想列什么清单？写个主题就可以。';
  if(purpose==='主题封面')return '这一页的主题是什么？不填也可以。';
  return '有什么想表达的？不填也可以。';
}
