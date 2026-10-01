// Shared art direction for API and web handoffs. These are choices to consider,
// not quotas or layout validation rules.
export function creativePageBrief({purposes=[],styles=[],textMode='automatic',contentPolicy='documentary',userText='',theme='',delivery='editable',pageMode='single'}={}){
  const visual=contentPolicy==='visual'||textMode==='none';
  const requested=textMode==='requested'&&!String(userText||'').trim()&&!/写|文字|正文|标题|清单|记录/.test(String(theme||''));
  const cover=purposes.includes('主题封面');
  const minimal=styles.includes('极简留白');
  const text=visual?'本次是纯视觉页面，不生成标题、正文或图注；用素材和数字图形组织阅读。':requested?'只在本次明确要求文字时配文；其余用素材和图形建立主题。':cover?'标题和必要副题应与主视觉相互回应；封面不强塞长正文。':delivery==='image'?'文字以有内容且易读为先：可用标题、自然换行的短段与贴近图像的图注；有足够空间时可以写更完整的段落，但不要把长文压成细小的一行。无法清楚绘制的内容宁可精简，不用伪文字填空。':textMode==='minimal'?'用精炼但有内容的标题、短段或图注回应素材；不要只留一句空洞口号，也不要为了字数虚构经历。':textMode==='rich'?'围绕主题、用户原文或可确认素材细节充分展开连贯的多行正文，并让标题、图注或清单自然分工；不重复口号、不虚构经历。':'写与本次主题、用户原文或可确认素材细节有关的具体内容，让标题、连贯的多行正文、图注或清单按用途自然分工；不要只给一句大标题，也不要用占位句、重复口号或虚构经历凑字。';
  const space=cover||minimal?'可以保留显著留白，但主视觉、文字或图形须形成清楚焦点与关联；避免内容无意缩在一角。':'让主件、辅助素材、文字和图形沿可追踪的阅读路线互相回应；避免所有内容挤在一角，留下与主题无关的大片空区。';
  const spread=pageMode==='spread'?'双页先当作左右两张相互呼应的独立页面来排：每页都有自己的视觉焦点和可辨识内容，主件、便签、适用时的文字块与装饰在各自页内形成上中下的节奏。装订中缝尽量留出清楚的分界；不要让标题、段落、主体素材、便签或边框无意跨页，也不要用横跨中缝的大空框把两页连成一张。只有主题确实需要且跨页后仍完整可读时，才让次要装饰有意越过中缝。最后分别缩看左页、右页和整幅双页：若某页有一整块无意空洞，优先把相关素材、适用时的具体文字或有作用的可编辑图形移入该页，并复查另一页的平衡。':'缩看整页的上中下和边角：若出现没有叙事或呼吸作用的大块空洞，优先调整已有图文关系，再用相关内容或有作用的可编辑图形回应。';
  return `构图与内容（审美引导，不是填充率或元素数量指标）：先根据纸张比例、用途以及素材的真实形状和尺寸确定视觉入口，再安排主次、局部叠压与阅读顺序。素材不必排成等大独立方块；让相关文字靠近对应图像，也可放在真实可写纸片或可编辑数字容器上，段落可以绕图、错列或与细线形成联系。${text}线条、荧光笔色带、手绘笔触或小图形可用于连接内容、强调信息与平衡色彩，只有合适时才添加。${space}${spread}交付前以整页视角检查：文字是否有实际内容且可读，素材是否形成自然组合，图形是否帮助阅读，留白是否有意；不为填满纸张而堆砌。`;
}
