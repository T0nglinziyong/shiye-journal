import {matchingContentOptions} from './matching-directions.js';
export const contentPolicies=matchingContentOptions;
export function creativeContentBrief({policy='original',userText='',providedFacts='',topic='',purposes=[]}={}){
  const selected=Object.hasOwn(contentPolicies,policy)?policy:'original';
  const boundaries={
    documentary:'整理用户给出的零碎记录，保留事实、专名与本来的口气；没有真实经历时只写可确认的小观察或待回答的问题，可以很短，不补造日期、地点、人物关系和事件。',
    original:'可以围绕一个话题写观察、清单、信、对话、回忆片段或想象中的日记。允许编造具体天气、动作、声音、地点和小事件作为创作灵感；第一人称是作品叙述者，不代表用户真实经历。用户提供的事实与原文优先准确保留，不能把素材上的印刷字或虚构片段说成已核实的用户事实。语气可犹豫、好笑、俏皮、嘴硬、懒散或认真，不强行温柔治愈或积极升华。轻松不等于只写金句：从一件具体物品或一个动作写起，接上细节、变化或转折，写成能顺着读的内容。短句可以插话，不要让整页只剩一句口号。',
    visual:'不生成新增的正文、标题、图注或手写文字；允许保留素材本来印有的文字，用真实素材和可编辑数字图形组织表达。'
  };
  const purpose=purposes.includes('主题封面')?'主题封面以明确主题与短标题为主，必要时才加副题，不强塞段落。':purposes.includes('清单计划')?'清单计划写可执行的条目、愿望或问题；没有真实日程时保持为设想，不标成已经完成。':'自由创作让素材间的关联和这页想说的话共同决定内容，不套固定日记结构。';
  return [`内容策略：${contentPolicies[selected]}。${boundaries[selected]}`,
    topic?`用户的补充想法：${String(topic).trim()}。明确要求写入画面的句子优先保留，构图指令不是正文。`:'没有补充想法；从已知素材寻找一个值得表达的小切口，无须用户填写长记录。',
    userText?`用户原文（保留事实、专名；明确要求原文时逐字保留，可分段）：${String(userText).trim()}`:'没有额外原文。',
    providedFacts?`用户提供的事实：${String(providedFacts).trim()}`:'没有可核实的个人事实；原创模式仍可写明确属于创作叙述的虚构片段，不能冒称用户亲历。',
    selected==='visual'?'纯粹拼贴优先于用途配文，不添加标题或清单文字。':purpose,
    '文案自检：删去可换到任何作品的套话、逐项报颜色的图像说明、重复同一意思的图注、无关英文小标题和强行总结。选一个可见细节或选题，把观察、动作、想象、态度或转折写完整。正文长度服从实际可写空间：密页用具体短记或清单，疏页允许展开成多段；不要靠缩小字号塞字，也不要用一句金句敷衍大片留白。案例图里的句子不抄用。制作计划与最终正文分开，不把“在左侧放”“颜色呼应”等设计说明写到纸上。'
  ].join('\n');
}
