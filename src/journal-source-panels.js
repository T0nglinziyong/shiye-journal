// Normalized, source-backed panels. A panel is one independently readable
// diagram or finished page, never the full multi-panel tutorial screenshot.
const rects={
  tl:[.025,.015,.455,.465],tr:[.515,.015,.455,.465],
  bl:[.025,.515,.455,.465],br:[.515,.515,.455,.465],
  left:[.02,.02,.46,.96],right:[.52,.02,.46,.96],
  top:[.02,.02,.96,.46],bottom:[.02,.52,.96,.46],
  t1:[.02,.015,.30,.465],t2:[.35,.015,.30,.465],t3:[.68,.015,.30,.465],
  b1:[.02,.515,.30,.465],b2:[.35,.515,.30,.465],b3:[.68,.515,.30,.465],
  c1:[.01,.02,.315,.96],c2:[.342,.02,.315,.96],c3:[.675,.02,.315,.96],
  r1c1:[.10,.055,.245,.22],r1c2:[.41,.055,.245,.22],r1c3:[.68,.055,.245,.22],
  r2c1:[.10,.275,.245,.235],r2c2:[.41,.275,.245,.235],r2c3:[.68,.275,.245,.235],
  r3c1:[.10,.515,.245,.235],r3c2:[.41,.515,.245,.235],r3c3:[.68,.515,.245,.235],
  r4c1:[.10,.755,.245,.22],r4c2:[.41,.755,.245,.22],r4c3:[.68,.755,.245,.22],
  full:[0,0,1,1]
};
const panel=(number,region='full',rotate=0)=>({number,rect:rects[region],rotate});
const P=(number,template,example,rotation=0)=>({template:panel(number,template),...(example?{case:panel(number,example,rotation)}:{})});

export const journalTemplatePanels=Object.freeze({
  'centered-writing-sheet':P(1,'tl','tr',4),
  'four-corner-notes':P(1,'bl','br',1),
  'top-bottom-writing':P(11,'tl','tr'),
  's-writing':P(11,'bl','br'),
  'diary-left-right-columns':P(28,'tl','tr'),
  'diary-diagonal-blocks':P(28,'bl','br'),
  'diary-small-card-grid':P(39,'bottom','top'),
  'diary-blue-notes':P(64,'bottom','top'),
  'diary-blue-notes-variant':P(65,'bottom','top'),
  'food-main-and-details':P(2,'tl','tr'),
  'food-main-and-details-variant':P(2,'bl','br'),
  'food-green-blocks':P(51,'tl','tr'),
  'food-brown-blocks':P(51,'bl','br'),
  'red-market-two-column-timeline':{template:panel(36),case:panel(35)},
  'editorial-main-column':P(4,'b1','t1'),
  'editorial-main-column-b':P(4,'b2','t2'),
  'editorial-main-column-c':P(4,'b3','t3'),
  'editorial-paper-blocks':P(23,'b1','t1'),
  'editorial-paper-blocks-b':P(23,'b2','t2'),
  'editorial-paper-blocks-c':P(23,'b3','t3'),
  'editorial-offset-cards':P(13,'b1','t1'),
  'editorial-offset-cards-b':P(13,'b2','t2'),
  'editorial-offset-cards-c':P(13,'b3','t3'),
  'editorial-asymmetric-blocks':P(49,'br','bl'),
  'editorial-asymmetric-blocks-b':P(49,'tr','tl'),
  'editorial-neutral-palette':P(16,'tl','tr'),
  'editorial-neutral-palette-b':P(16,'bl','br'),
  'editorial-adjacent-palette':P(27,'tl','tr'),
  'editorial-adjacent-palette-b':P(27,'bl','br'),
  'editorial-triptych-variants':P(52,'r2c1','r1c1'),
  'editorial-triptych-variants-b':P(52,'r2c2','r1c2'),
  'editorial-triptych-variants-c':P(52,'r2c3','r1c3'),
  'editorial-triptych-variants-g':P(52,'r4c1','r3c1'),
  'editorial-triptych-variants-h':P(52,'r4c2','r3c2'),
  'editorial-triptych-variants-i':P(52,'r4c3','r3c3'),
  'editorial-triptych-variants-d':P(53,'tr','tl'),
  'editorial-triptych-variants-j':P(53,'br','bl'),
  'editorial-triptych-variants-e':P(54,'tr','tl'),
  'editorial-triptych-variants-f':P(54,'br','bl'),
  'dark-numbered-stops':{template:panel(7),case:panel(8)},
  'dark-s-spine':P(29,'bl','br'),
  'dark-five-stops':P(29,'tl','tr'),
  'planner-text-and-photo':P(61,'bottom','top'),
  'planner-staggered-notes':P(62,'bottom','top'),
  'planner-layered-cards':P(68,'bottom','top'),
  'quiet-diagonal-photo-groups':P(30,'tl','tr'),
  'quiet-offset-photo-groups':P(30,'bl','br'),
  'travel-s-layout':{template:panel(58,'c1')},
  'travel-s-layout-derived':{template:panel(58,'c2')},
  'travel-s-layout-rich':{template:panel(58,'c3')},
  'travel-s-layout-grid-a':{template:panel(69,'tl')},
  'travel-s-layout-grid-b':{template:panel(69,'tr')},
  'travel-s-layout-grid-c':{template:panel(69,'bl')},
  'travel-s-layout-grid-d':{template:panel(69,'br')}
});

export function journalTemplatePanel(item,kind){
  const explicit=journalTemplatePanels[item.id]?.[kind];
  if(explicit)return explicit;
  const number=(kind==='case'?item.exampleSourceNumbers:item.sourceNumbers)?.[0];
  return Number.isInteger(number)?panel(number):null;
}

export function validateJournalPanel({number,rect,rotate=0}){
  if(!Number.isInteger(number)||number<1||number>70||!Array.isArray(rect)||rect.length!==4||rect.some(value=>!Number.isFinite(value))||rect[0]<0||rect[1]<0||rect[2]<=0||rect[3]<=0||rect[0]+rect[2]>1.00001||rect[1]+rect[3]>1.00001||!Number.isFinite(rotate)||Math.abs(rotate)>15)throw Error('模板画面区域无效');
  return {number,rect,rotate};
}
