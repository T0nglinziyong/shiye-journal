// Planning metadata never modifies the task's authoritative physical/stock source.
const possibleRoles=item=>{
  const kind=String(item.kind||'');
  if(kind==='tape')return ['连接','压角','包边','路径引导'];
  if(kind==='paper'||kind==='background')return ['垫底','书写载体','局部裁片'];
  if(kind==='photo')return ['场景主图','视觉证据','局部细节'];
  return ['场景角色','视觉焦点','边角点缀','局部加工'];
};
const compactItem=item=>({
  alias:item.alias,assetID:item.assetID,title:item.title,kind:item.kind,
  physicalMM:[item.physicalWidthMM??null,item.physicalHeightMM??null],
  suppliedRole:item.role??null,tags:item.tags||[],quantity:item.quantity,
  inspect:['画面主体与轮廓','透明边缘及可裁区域','有无可读字句/空白','方向与光色'],
  possibleUses:possibleRoles(item),note:'用途仅是候选；图案内容必须由 materials/ 图片观察确认'
});

export function offlineCreationPlanningData(source,selected,{mode='agent',hasImages=true}={}){
  const cards=selected.map(compactItem),pairings=[];
  // Do not invent semantic pairings from names such as 素材 3.
  for(let i=0;i<cards.length&&pairings.length<12;i++){
    for(let j=i+1;j<cards.length&&pairings.length<12;j++){
      const a=cards[i],b=cards[j];
      pairings.push({aliases:[a.alias,b.alias],
        investigate:a.kind===b.kind?'是否具有主次、形状或内容上的呼应？':'能否形成前景/背景、垫底/主图或固定/被固定关系？',
        status:'unverified-visual-hypothesis'});
    }
  }
  return {
    version:1,mode,source:'material-metadata-plus-visual-questions',imageEvidence:hasImages,
    cards,pairings,
    alternatives:[
      {name:'场景叙事',evaluate:'是否有素材能共享同一场景的远近层次，前景与背景是否可信？'},
      {name:'生活记录',evaluate:'主视觉能否与有内容的文字、手写和小物件形成阅读节奏？'},
      {name:'自由拼贴',evaluate:'能否用局部裁切、半藏、跨页、错层和形状对比产生联系？'}
    ],
    constraints:{
      use:'required 必须出现；preferred 优先考虑但可以舍弃；available 可选；excluded 不发送',
      stock:'不新增、复制或放大实体素材；数字文字、线条和图形可以自由创作',
      note:'视觉问题未确认时标记不确定，不把素材标题当作图像识别证据'
    }
  };
}

export function offlineCreationWorkflowText({mode='agent',hasImages=true}={}){
  const target=mode==='direct'
    ?'输出只能是一个含 page 的可编辑 JSON；不输出 tools/plan；高级 plan.observations 与 weaves 不属于 direct 合同。page.items.operations 可用 schema/output.json 列出的 crop、cut_shape 等操作。'
    :'输出只能是一个含 tools 的可编辑 JSON；可使用 apply_craft_plan（含 observations/pieces/relations/ink）或 compose_page 等工具，须按 schema/output.json 逐项校验。不输出 page 或额外顶层 plan。';
  return [
    '拾页创作方法 · 先设计，再落地（一次任务内部完成，不要求用户多次交互）',
    '',
    '【创作步骤】',
    '1. 观察：'+(hasImages?'逐张查看 materials/，识别主体、背景、纹理、轮廓、印刷文字和负空间；不确定就保留未知。':'本包未提供素材图片，只能根据文字元数据谨慎判断，不得猜测图案。')+' task/material-planning.json 是问题清单，不是已证实的视觉识别。',
    '2. 关系：探索至少两种明显不同的内部方案，例如场景叙事／记录拼贴／自由错层；比较前景背景、主次、色彩、主题和阅读路径，只选最适合的一种，不输出多个成品。',
    '3. 取舍与加工：逐件决定 whole / crop / cut_shape / 叠压 / 半藏 / 不使用；依据视觉关系、物理尺寸和库存，而不是强制使用高级工具。可以少用 preferred，不可漏 required。',
    '4. 图文一体：文字承担记录内容，而非解释制作方法。优先使用用户事实；没有事实时写标明原创的观察文字，不编造私人行程、身份或日期。数字线条、笔迹、字级和小装饰服务阅读。',
    '5. 构图与执行：先定素材之间的联系、大小层级和遮挡，再细化坐标、旋转、字体与图形。数字层保持可编辑，实体尺寸和数量不变。数字点缀可用雨滴、爱心、云朵、花叶、闪光、票根、胶带、波浪线等 schema/output.json 允许的图形，支持分别指定填充颜色/透明度和描边颜色/粗细/透明度/虚线；按表达需要使用，不为填满页面而装饰。',
    '6. 校验与复核：先运行 Node 结构/物理校验，再打开 output/画面预览.html，用拾页共用 Canvas 渲染；检查素材、透明边缘、遮挡、字形、溢出和阅读顺序。发现问题修改同一 JSON 并重新渲染，不以 SVG 冒充验收。',
    '',
    '【本次唯一输出协议】',
    target,
    '最终可编辑作品以 project.shiyeproject.json 为权威，source 原样不变；只交付一个最佳画面。可将其作为独立 .shiyeproject.json 作品文件交付，ZIP 是可选包装形式；复制文本交付同一 JSON。若无法运行 Canvas 或缺少中文字库，明确写“真实视觉/字体未验收”。'
  ].join('\n');
}

export const offlineVisualReviewChecklist=[
  '拾页 · 最终预览验收清单',
  '',
  '结构与物理：',
  '[ ] runtime/validate.cjs 通过；任务 source 与资产身份不变',
  '[ ] required 全部落实；preferred 可以取舍；没有凭空新增/放大/复制实体',
  '[ ] 裁切和负形边缘正确，未误裁主要图案与可读印刷文字',
  '',
  '实际画面（不能只看 output/构图预览.svg）：',
  '[ ] 打开 output/画面预览.html，确认状态为“已按拾页共用 Canvas 渲染”',
  '[ ] 使用的素材都真正解码显示，透明处无意外白边，层次和旋转合乎预期',
  '[ ] 文字无重叠、裁断、不可读或方框；字体缺失时明确记为未验收',
  '[ ] 检查双页节奏、主体关系、正文是否像真实记录而非装饰图注',
  '[ ] 不机械排方格，也不为复杂而强制加工',
  '[ ] 预览与最终 JSON 同一版，改动后重新预览',
  '',
  '证据等级：',
  'Node 校验：仅表明结构与物理规则合法',
  '构图预览.svg：近似辅助参考，不构成 Canvas 视觉验收',
  '画面预览.html 已渲染：仅说明本环境可展示，仍需检查画面与文字',
  '截图经检查：才能称当前预览环境完成视觉复核；最终高清与设备字体仍以拾页应用为准',
  '不得伪造已审核截图、验证状态或“同源渲染通过”的断言'
].join('\n');
