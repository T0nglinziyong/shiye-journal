export const contentPolicies={
  documentary:'真实记录',
  original:'原创主题短文',
  collection:'素材收藏短评',
  visual:'纯视觉拼贴'
};

export function creativeContentBrief({policy='documentary',userText='',providedFacts='',topic=''}={}){
  const selected=Object.hasOwn(contentPolicies,policy)?policy:'documentary';
  const original=String(userText||'').trim();
  const facts=String(providedFacts||'').trim();
  const subject=String(topic||'').trim();
  const boundaries={
    documentary:'仅根据用户原文、已提供事实及能从素材确认的信息写真实记录；没有个人事实时，可围绕可见素材和主题写非第一人称的具体观察，不用空话代替正文；没有可确认内容时可以少字，绝不编造日期、地点、人物和事件。',
    original:'允许围绕主题写原创短文或想象性叙述，但应标明它是创意表达，不把虚构经历写成用户真实日记。',
    collection:'根据已知素材名称、标签、材质和画面写具体短评；未知来源、年代、地点和个人经历不得猜测。',
    visual:'不生成正文、标题或图注；用真实素材和数字图形完成视觉拼贴。'
  };
  return [`内容策略：${contentPolicies[selected]}。${boundaries[selected]}`,
    subject?`本次主题：${subject}`:'本次未提供主题。',
    original?`用户原文（默认逐字保留事实和专名，不擅自删改；可分段排版）：${original}`:'用户未提供原文。',
    facts?`用户已提供事实：${facts}`:'用户未提供可核实的个人事实。',
    '制作计划与最终正文分开；“在这里写”“可放到旁边”等排版说明不能成为最终文字。'
  ].join('\n');
}
