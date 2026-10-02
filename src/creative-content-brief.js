export const contentPolicies={
  documentary:'真实记录',
  original:'原创主题短文',
  collection:'素材收藏短评',
  visual:'纯视觉拼贴'
};

const purposeCopy={
  日常记录:'正文记录主题中的具体一刻、可见细节、感受或问题与回应；若没有用户经历，只写非第一人称的观察，不编「今天我」的故事。标题应点出记录对象。',
  旅途记录:'有用户提供的地点、时间、路线才写行程；否则写照片中可确认的沿途景物、物件或一份待填写的旅途备忘，不编造到访经历。',
  图文收藏:'围绕收藏对象写名称、可见特征、类别关系和选择理由；不同图注各说一个细节，不把素材尺寸、颜色方案或排版方法当收藏短评。',
  清单计划:'写与主题相关、可以执行或核对的条目与必要备注；未知的个人日程保持为计划或问题，不写成已经完成的记录。',
  影像故事:'按可见照片之间的关联写开端、细节和收束；图注说明画面中确实能看见的东西，不猜人物身份、拍摄地点或先后时间。',
  主题封面:'只写明确的主题标题和有意义的简短副题；封面可以少字，不添加讲解性段落。'
};

export function creativeContentBrief({policy='documentary',userText='',providedFacts='',topic='',purposes=[]}={}){
  const selected=Object.hasOwn(contentPolicies,policy)?policy:'documentary';
  const original=String(userText||'').trim();
  const facts=String(providedFacts||'').trim();
  const subject=String(topic||'').trim();
  const chosen=purposes.filter(purpose=>purposeCopy[purpose]);
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
    selected==='visual'?'纯视觉模式不需要用途配文。':`页面用途决定写什么：${chosen.length?chosen.map((purpose,index)=>`${index===0?'主要':'辅助'}用途「${purpose}」：${purposeCopy[purpose]}`).join(' '):purposeCopy.日常记录}`,
    '制作计划与最终正文分开；“在这里写”“可放到旁边”等排版说明不能成为最终文字。',
    '最终文案应像这页真正想记录的内容，而不是对设计方案的讲解；除非用户明确要求设计分析，不把“这一页用了什么颜色、纸张、素材、留白、排版”写成正文，也不写「在左侧放」「这张便签承载」「颜色呼应」等制作过程。优先使用用户原文、已知事实和与主题有关的具体观察；没有足够内容时简洁表达，不重复改写同一件事，也不编造个人经历。案例图里的字只是示意，不可抄为正文。'
  ].join('\n');
}
