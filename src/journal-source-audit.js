// Visual inventory of the 70 user-supplied screenshots. "mixed" means the
// screenshot itself contains both an abstract diagram and a finished page.
// An unmatched diagram can still be used as a template, but is never
// presented as a proven template/case pair.
const mixed=[1,2,4,11,13,16,23,27,28,29,30,39,49,51,52,53,54,61,62,64,65,68];
const templateOnly=[6,7,14,17,20,21,33,36,38,41,42,43,44,45,46,47,48,50,56,58,60,67,69];
const caseOnly=[3,5,8,9,10,12,15,18,19,22,24,25,26,31,32,34,35,37,40,55,57,59,63,66,70];
const categories=new Map([...caseOnly.map(number=>[number,'case']),...mixed.map(number=>[number,'mixed']),...templateOnly.map(number=>[number,'template'])]);
export const journalSourceAudit=Object.freeze(Array.from({length:70},(_,index)=>{
  const number=index+1;
  return Object.freeze({number,kind:categories.get(number)});
}));

// Cross-image correspondence is stated only where the source images show the
// same diagram and finished page. Other diagrams require further source-level
// matching; family resemblance alone is insufficient evidence.
export const journalVerifiedPairs=Object.freeze([
  {templateNumbers:[36],caseNumbers:[35],evidenceNumbers:[35,36]},
  {templateNumbers:[7],caseNumbers:[8],evidenceNumbers:[29]}
]);
