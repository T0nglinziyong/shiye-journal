// Planning metadata never modifies the task's authoritative physical source.
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
  suppliedRole:item.role??null,tags:item.tags||[],
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
      physicalSource:'不新增、复制或放大实体素材；数字文字、线条和图形可以自由创作',
      note:'视觉问题未确认时标记不确定，不把素材标题当作图像识别证据'
    }
  };
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
  '[ ] 用真实浏览器打开 output/画面预览.html，确认状态为“已按拾页共用 Canvas 渲染”；提取同一 Canvas 的 PNG 并在聊天中展示（如果用户允许）',
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
