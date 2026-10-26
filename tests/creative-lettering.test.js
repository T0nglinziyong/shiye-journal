import test from 'node:test';
import assert from 'node:assert/strict';
import {creativePageBrief} from '../src/creative-page-brief.js';
import {creativeContentBrief} from '../src/creative-content-brief.js';

test('lettering mode remains a creative direction, not a numerical art quota',()=>{
 const handwritten=creativePageBrief({textPresentation:'handwritten',purposes:['日常记录']});
 const typed=creativePageBrief({textPresentation:'type'});
 const mixed=creativePageBrief({textPresentation:'mixed'});
 assert.match(handwritten,/可编辑笔画 graphic\.add 的 stroke/);
 assert.match(typed,/可编辑 text\.add/);
 assert.match(mixed,/默认混合编排/);
 assert.doesNotMatch(creativePageBrief({contentPolicy:'visual',textPresentation:'handwritten'}),/可编辑笔画 graphic\.add 的 stroke/);
});
test('single combined creative input is respected without a secondary facts field',()=>{
 const brief=creativeContentBrief({topic:'主题是秋天，请在画面里写「慢慢来」；标题在左侧'});
 assert.match(brief,/秋天/);
 assert.match(brief,/明确要求写入画面的句子优先保留/);
 assert.match(brief,/构图指令不是正文/);
 assert.match(brief,/没有额外原文/);
});
