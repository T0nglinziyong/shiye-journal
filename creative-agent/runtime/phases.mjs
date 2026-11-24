import {visualDensityBrief} from '../../src/creative-style-brief.js';
export const creativePhases=['direction','layout','craft','review'];

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
  if(phase==='direction')return '看素材总图后用 creation_plan 简记主题、配色、素材关系与可写位置。标签只供辨认和话题参考，不限制素材用途。底纸、印字卡、图案纸、照片、数字图形都可承托内容；主角可不止一个。计划可随预览修改。';
  return '试摆、写字、点缀、看预览并调整可交错进行。合批放置有关对象；底纸或大素材承托一组，小对象可跨接边缘，保留有意遮挡。标题与正文提前占位，文字可分段写在纸面或清晰可读的素材内。缩看检查重心、阅读路线、空洞和可见装饰；近看检查层序、字色与遮挡。只对少数对象有意旋转，至少让一组边线呼应。'+(pageMode==='spread'?'对象不跨中缝；':'')+'重要内容距外缘留可见纸边。'+visualDensityBrief(styles)+(textMode==='none'?'本次不写文字。':'正文与标题应可读。')+'先修真实画面的问题；阶段不是关卡。';
}

export function phaseObservation(phase,{capture,spaceStatus,scene,feedback,advisory,previousReview,remainingSeconds,previousScene}){
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
    const prior=new Map((previousScene?.layers||[]).map(layer=>[layer.id,layer]));
    const delta=previousScene?{sceneRevision:compact.sceneRevision,baseSceneRevision:previousScene.sceneRevision,mode:'delta',
      layers:compact.layers.filter(layer=>JSON.stringify(layer)!==JSON.stringify(prior.get(layer.id))),
      removed:previousScene.layers.filter(layer=>!compact.layers.some(now=>now.id===layer.id)).map(layer=>layer.id),
      ...(JSON.stringify(compact.layerTree)!==JSON.stringify(previousScene.layerTree)?{layerTree:compact.layerTree}:{}),
      ...(JSON.stringify(compact.page)!==JSON.stringify(previousScene.page)?{page:compact.page}:{}),
      ...(JSON.stringify(compact.stacking)!==JSON.stringify(previousScene.stacking)?{stacking:compact.stacking}:{}),
      inspection:'只列新增/变化对象与删除ID；其余沿用上一版本。完整图层可 creation_inspect。'}:compact;
    return {...base,scene:delta,feedback:sceneFeedback,
      advisory:{limitations:advisory.limitations,observations:advisory.observations,
        textCoverCandidates:advisory.textCoverCandidates?.slice(0,8),gutterIntersections:advisory.gutterIntersections?.slice(0,8)},previousReview};
  }
  return {...base,scene:{sceneRevision:scene.sceneRevision,layers:scene.layers.filter(layer=>layer.surface==='page')},feedback:sceneFeedback,advisory:{observations:advisory.observations},previousReview};
}
