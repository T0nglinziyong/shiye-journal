import {visualDensityBrief} from '../../src/creative-style-brief.js';
export const creativePhases=['direction','layout','craft','accents','review'];

export const creativePhaseLabels={direction:'构思与计划',layout:'打底与构图',craft:'标题与内容',accents:'装饰与点缀',review:'最终检查'};

// These are attention cues inferred from actual work, not quality approvals.
// No progress bookkeeping call, extra model request or phase permission gate.
export function automaticCreativePhase(state){
  if(!state.plan)return 'direction';
  if((state.results||[]).some(result=>result.name==='creation_finish'))return 'review';
  if(!state.firstLayoutTurn)return 'layout';
  const phase=state.phase||'layout';
  if(phase==='review')return phase;
  if(phase==='direction'||phase==='layout')return state.document.source.textMode==='none'?'accents':'craft';
  const scene=state.currentPhaseScene;
  const hasText=scene?.layers.some(layer=>layer.surface==='page'&&!layer.hidden&&layer.opacity>0&&layer.type==='text');
  const edited=(state.results||[]).some(result=>result.ok&&['creation_apply','creation_paper','creation_title','creation_recipe','creation_undo','creation_apply_crops'].includes(result.name));
  if(phase==='craft'&&state.lastGuidedPhase==='craft'&&hasText&&edited)return 'accents';
  if(phase==='accents'&&state.lastGuidedPhase==='accents'&&edited)return 'review';
  return phase;
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

export function phaseGuide(phase,{styles=[],textMode='automatic',pageMode}={}){
  const guides={
    direction:'看素材总图，构思主题、配色、素材关系与可写位置，用 creation_plan 简记后开始试摆；构思可随预览调整，用户要求不变。',
    layout:'重点看打底承托、叠压露边、阅读路线与疏密。大纸与小纸建立连接，标题正文提前占位；可以裁切或移出不合适素材，不必全部贴满。',
    craft:'重点安排标题与正文，让文字参与构图并依托实际写面。检查主次、字号、字色和遮挡；标题可按需要使用错位、变形、描边或字后背景，不强制特效。',
    accents:'专门看点缀是否清楚可见，并连接纸边、强调重点或呼应配色。按画面需要使用实心圆点、星形、线条、胶带或已有纹样；避免尺寸过小而不起作用，不追求固定数量。可同轮读 journal-accents 并执行已确定的编辑。',
    review:'缩看整体构图与配色，近看文字、层序、遮挡和页边；确认点缀起作用，修改后再看新图。没有待修缺陷就 creation_finish，不为凑步骤增加对象。'
  };
  return '当前关注：'+creativePhaseLabels[phase]+'。'+(guides[phase]||guides.layout)+
    '五个阶段可交错、可回到任意图层调整；这是工作重点提示，不代表上一阶段已验收，不必调用工具汇报进度。'+
    visualDensityBrief(styles)+(textMode==='none'?'本次不写文字。':'标题和正文应可读。')+
    (pageMode==='spread'?'两页配色相互呼应，各有重点；小纸与底纸保持有意连接，注意中缝。':'');
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
