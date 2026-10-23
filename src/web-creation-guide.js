import {visualStyleBrief} from './creative-style-brief.js';
export function webArtDirection(source){
 const textDirection=source.contentPolicy==='visual'||source.textMode==='none'?'本次不新增标题、正文或图注，只保留素材印字。':source.textMode==='requested'&&!String(source.userText||'').trim()&&!/写|文字|正文|标题|清单|记录/.test(source.intent||'')?'没有明确文字要求时不主动配文。':source.textMode==='rich'?'有表达与可读空间时展开连贯的多行正文，不重复凑字。':source.textMode==='minimal'?'正文以精炼表达为主，不为填满而扩写。':'';
 return [
  '本次视觉方向：'+source.styles.map(s=>s+'：'+visualStyleBrief(s)).join('；'),
  source.mode==='spread'?'本次双页各自有焦点；不让标题、正文、主体素材无意跨页，有意跨页须仍完整可读。':'本次单页：检查整页与边角的重心。',
  textDirection,
  '加工许可：'+source.processing+'；实际纸张和尺寸读取 TASK.page。不要把图片像素当毫米，不缩放实物。',
  '文字使用 style.fontSizePt（实际 pt），默认艺术手写；fonts 查询当前环境真实字体。素材较少时文字/图形承担主体，原有印刷标题也计入视觉重量。',
  '创作方法只读 design/SKILL.md；画面诊断按需读 PLAYBOOK.md；打开真实 preview 的实际画面后按 REVIEW.md 决定修订。字体/描边/渐变用 LETTERING.md，绘画用 GRAPHICS.md；不要先读全部 Schema。'
].filter(Boolean).join('\n\n');}
