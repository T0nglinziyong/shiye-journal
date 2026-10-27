import {creativeTypographyGuide} from './creative-typography.js';
import {visualStyleBrief} from './creative-style-brief.js';
import {creationGuidanceText} from './creation-guidance.js';
export function webArtDirection(source,materials=[]){return [
  '【本次视觉方向】',source.styles.map(s=>s+'：'+visualStyleBrief(s)).join('；'),
  creativeTypographyGuide(source.baseDraft,{publicCommands:true}),
  creationGuidanceText({...source,materials}),
  '本次风格只决定倾向，不套固定版式。文字、纸片和小图形共同决定主次；按 design/SKILL.md 创作，再看实际画面并依 design/REVIEW.md 修订。'
].join('\n\n');}
