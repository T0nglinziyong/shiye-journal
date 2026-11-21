import {matchingContentOptions} from './matching-directions.js';
export const contentPolicies=matchingContentOptions;
export function creativeContentBrief({policy='original',userText='',providedFacts='',topic='',purposes=[]}={}){
  const selected=Object.hasOwn(contentPolicies,policy)?policy:'original';
  const boundaries={
    documentary:'整理用户给出的零碎记录，保留事实、专名与本来的口气；没有真实经历时只写可确认的小观察或待回答的问题，可以很短，不补造日期、地点、人物关系和事件。',
    original:'允许轻松的自言自语、俏皮态度、尚未完成的想法、小愿望、疑问或图文间的小对话。第一人称可以表达此刻的态度与想象，不冒充用户曾发生的经历。语气从本次素材的细节和印刷文字生长：可以犹豫、好笑、嘴硬、懒散或认真，不强行温柔治愈或积极升华。不必解释自己在创作，也不用把每一件素材都介绍一遍。轻松不等于只写金句：选一个与素材有关的念头，把犹豫、理由、转折或小细节接着写下去，形成可以顺着读的内容；短句可以插话，不要让整页都停在一句口号。材料上的开学、旅行等字样不是用户已经经历的事实，可写成设想、疑问或愿望。',
    visual:'不生成新增的正文、标题、图注或手写文字；允许保留素材本来印有的文字，用真实素材和可编辑数字图形组织表达。'
  };
  const purpose=purposes.includes('主题封面')?'主题封面以明确主题与短标题为主，必要时才加副题，不强塞段落。':purposes.includes('清单计划')?'清单计划写可执行的条目、愿望或问题；没有真实日程时保持为设想，不标成已经完成。':'自由创作让素材间的关联和这页想说的话共同决定内容，不套固定日记结构。';
  return [`内容策略：${contentPolicies[selected]}。${boundaries[selected]}`,
    topic?`用户的补充想法：${String(topic).trim()}。明确要求写入画面的句子优先保留，构图指令不是正文。`:'没有补充想法；从已知素材寻找一个值得表达的小切口，无须用户填写长记录。',
    userText?`用户原文（保留事实、专名；明确要求原文时逐字保留，可分段）：${String(userText).trim()}`:'没有额外原文。',
    providedFacts?`用户提供的事实：${String(providedFacts).trim()}`:'没有可核实的个人事实；不得把素材里的地点、日期或人物自动当成用户经历。',
    selected==='visual'?'纯粹拼贴优先于用途配文，不添加标题或清单文字。':purpose,
    '文案自检：删去可换到任何作品的套话、逐项报颜色的图像说明、重复同一意思的图注、无关英文小标题和强行总结。从素材里选一个确实看得见的细节，让它引出态度、联想、反问或转折，并把这个念头写完。若整页只在说“先写、未命名、下次再说、未来留白”，仍缺少内容；回到具体物件或印刷字重写，而不是凭空编用户经历。案例图里的句子不抄用。制作计划与最终正文分开，不把“在左侧放”“颜色呼应”等设计说明写到纸上。'
  ].join('\n');
}
