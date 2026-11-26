import {visualDensityBrief} from '../../src/creative-style-brief.js';
export const creativePhases=['direction','layout','craft','accents','review'];

export const creativePhaseLabels={direction:'构思与计划',layout:'打底与构图',craft:'标题与内容',accents:'装饰与点缀',review:'最终检查'};

// Only an explicit model statement selects focus. Edits, failures, object
// counts and elapsed rounds never imply that a creative stage is complete.
export function declaredCreativePhase(content,previous='direction'){
  if(typeof content!=='string')return previous;
  const line=content.trim().split('\n')[0].trim();
  const match=line.match(/^阶段[：:]\s*(.+?)[。；;]?$/);
  return Object.entries(creativePhaseLabels).find(([key,label])=>match&&(match[1]===label||match[1]===key))?.[0]||previous;
}

export function toolsForCreativePhase(tools){
  // Phases describe the work, not the agent's permissions. Hiding editing or
  // reference tools made the same task use different tool contracts by turn.
  return tools;
}

// Offer relevant readings together; an unread paper skill must not starve titles or accents. The cue follows the actual Scene, not
// an enforced phase transition; a read may share a turn with other tools.
export function nextSkillCue({plan,turns=0,loadedSkills=[],materialCount=0,textMode='automatic',visibleMaterials=0,visibleText=0,remainingMs=Infinity}={}){
  if(remainingMs<65000||turns>=18)return '';
  const loaded=new Set(loadedSkills.map(item=>item.name));
  if(!plan&&!loaded.has('journal-color')&&turns<=2)return '方向：看素材总图后，先用 read_skill(name="journal-color",level="overview") 看配色判断，再记录计划；可与查看素材同轮调用。';
  if(!plan)return '';
  if(!loaded.has('journal-composition')&&visibleMaterials<2)return '构图：用 read_skill(name="journal-composition",level="overview") 核对承托、阅读路线与文字占位，再试摆；无需读取全部专题。';
  const cues=[];
  if(materialCount>=2&&!loaded.has('paper-layering')&&visibleMaterials>=1)cues.push('纸层：若正在处理底纸、露边或跨层连接，读 read_skill(name="paper-layering",level="overview")，组合适合当前写面与材料的关系。');
  if(textMode!=='none'&&!loaded.has('journal-lettering')&&(visibleMaterials>=1||materialCount===0))cues.push('标题：需要设计字群或字后背景时，读 read_skill(name="journal-lettering",level="overview")；单次阴影、描边直接用文字 style。');
  if(textMode!=='none'&&!loaded.has('journal-writing')&&visibleText>=1)cues.push('正文：若内容只有短句或段落都挤在一处，读 read_skill(name="journal-writing",level="overview") 后调整内容与写面。');
  if(!loaded.has('journal-accents')&&(visibleText>=2||visibleMaterials>=4))cues.push('细节：若层与层之间缺连接，读 read_skill(name="journal-accents",level="overview") 后选合适尺度；普通单点、星或线直接用基础图形。');
  if(materialCount===0&&!loaded.has('journal-graphics'))cues.push('无实体素材：若需要可编辑图形承托文字，读 read_skill(name="journal-graphics",level="overview")。');
  if(cues.length)return '可与本轮已确定的编辑同轮加载相关 Skill；不用按顺序逐轮阅读：\n'+cues.join('\n');
  return '';
}

const guides={
    direction:'看素材总图，确定主题、配色、素材关系与可写位置；creation_plan 用一两句 intent 简记即可，不展开多套方案或逐件坐标推演，已确定的试摆可同轮执行。先得到真实画面，再据图调整。',
    layout:'重点看局部打底承托、叠压露边、阅读路线与疏密。整页背景只统一气氛；要围绕具体标题、正文或素材簇决定底纸的尺寸与露出轮廓，一张近满版底纸不能替代这些局部关系。先判断纸块是深入穿插、清楚分置，还是由其他内容跨越衔接；别以一点点碰边代替构图关系。标题正文提前占位；可以裁切或移出不合适素材，不必全部贴满。',
    craft:'重点安排标题与正文，让文字参与构图并依托实际写面。检查主次、字号、字色和遮挡；标题可按需要使用错位、变形、描边或字后背景，不强制特效。',
    accents:'收尾时先缩看最新预览，沿主簇、次簇和双页之间的视觉路线找仍显突兀的纸边、两件素材的接缝、标题端部或重心偏轻处；这些位置可以各用不同尺度的现有小素材、胶带、实心圆点、星形或短线连接与呼应，不预设点缀个数。圆星可让中心靠纸边，一部分压纸、一部分探出；通过 order.before/after 放入对应层间或压住边缘，保护文字和人物。A6 页面可先试约 5–12mm 的主点缀并按画面调整，别把所有圆星缩成 1–2mm 微点，也别只在空角悬空撒星。以手机整页能看出接合、节奏与色彩呼应为准，数量服从疏密；用户只用真实素材时遵守限制。确定落点后同轮合批完成点缀和局部修正，再看图判断各处是否真的起作用。',
    review:'缩看整体构图与配色，近看文字、层序、遮挡和页边；逐页核对主簇之外的转折与次级内容是否也有合适的纸边连接或色彩呼应。点缀若只像孤立散点就移动或撤掉；若仍有明显断开的关系，可继续补入有作用的细节，不因已有一两颗圆点就提前收尾。将影响阅读、遮挡和纸边连接的问题集中在一个批次修正，再看新图并 creation_finish。不要为 1mm 位移、略浅的颜色等可选细节逐轮返工；已成立的构图与文字层级保持稳定，不开启新的美化循环。'
  };

export function creativeMethodGuide(options={}){
  return creativePhases.map(phase=>creativePhaseLabels[phase]+'：'+guides[phase]).join('\n')+'\n这些方法可交错使用，由你判断工作重点。'+visualDensityBrief(options.styles||[])+(options.textMode==='none'?'本次不写文字。':'标题和正文应可读。')+(options.pageMode==='spread'?'两页配色相互呼应，各有重点；各页分别判断纸块该叠放还是分置，注意中缝。':'');
}

export function phaseGuide(phase,{styles=[],textMode='automatic',pageMode}={}){
  return '当前关注：'+creativePhaseLabels[phase]+'。'+(guides[phase]||guides.layout)+
    '五个阶段可交错、可回到任意图层调整；由你根据最新画面选择工作重点，不代表上一阶段已验收，不必调用工具汇报进度。'+
    visualDensityBrief(styles)+(textMode==='none'?'本次不写文字。':'标题和正文应可读。')+
    (pageMode==='spread'?'两页配色相互呼应，各有重点；各页分别判断纸块该叠放还是分置，注意中缝。':'');
}

export function phaseObservation(phase,{capture,spaceStatus,scene,feedback,advisory,previousReview,remainingSeconds}){
  const base={phase,remainingSeconds};
  // Shape/type thresholds in foundation are useful offline diagnostics, but
  // they misclassify printed cards and illustrated paper as absent backing.
  const sceneFeedback={...feedback};delete sceneFeedback.foundation;
  if(phase!=='direction'){
    // The full typed Scene remains available through creation_inspect. The
    // automatic image observation needs only enough structure for the next
    // placement/order decision; repeating every style field costs tokens.
    const compact={sceneRevision:scene.sceneRevision,page:scene.page,stacking:scene.stacking,layerTree:scene.layerTree,
      layers:scene.layers.map(({id,alias,type,parent,stackIndex,surface,world,asset,content,kind,fill,stroke,hidden,fontSizePt,cropRect,materialMask,vectorMask})=>({id,alias,type,parent,stackIndex,surface,world,asset,fontSizePt,...(cropRect||materialMask||vectorMask?{cropped:true}:{}),
        ...(typeof content==='string'?{content:content.slice(0,90)}:{}),kind,fill,stroke,hidden}))};
    return {...base,scene:compact,feedback:sceneFeedback,
      advisory:{limitations:advisory.limitations,observations:advisory.observations,
        textCoverCandidates:advisory.textCoverCandidates?.slice(0,8),gutterIntersections:advisory.gutterIntersections?.slice(0,8)},previousReview};
  }
  return {...base,scene:{sceneRevision:scene.sceneRevision,layers:scene.layers.filter(layer=>layer.surface==='page')},feedback:sceneFeedback,advisory:{observations:advisory.observations},previousReview};
}
