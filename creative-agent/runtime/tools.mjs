import {paperTool} from './paper-tool.mjs';
import {creationAgentTools} from '../../src/creation-agent-session.js';
import {creativePhases} from './phases.mjs';

const object=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
const string={type:'string',minLength:1,maxLength:2000};
const custom=(name,description,parameters)=>({type:'function',function:{name,description,parameters}});
const sceneRevision={type:'string',pattern:'^sha256:[a-f0-9]{64}$'};
const decisionField={type:'string',minLength:1,maxLength:400};
export const harnessTools=[...creationAgentTools.filter(t=>!['inspect_materials','creation_finish'].includes(t.function.name)).map(tool=>tool.function.name==='creation_apply'?{
  ...tool,function:{...tool.function,parameters:{...tool.function.parameters,properties:{...tool.function.parameters.properties,decision:decisionField}}}
}:tool.function.name==='creation_help'?{...tool,function:{...tool.function,description:'查询操作/公共参数合同或工具。topics 为空返回目录；topics:[工具名] 读取准确参数并在下一轮展开该工具。工具一经展开持续可用，不受阶段限制。'}}:tool),
  paperTool,
  custom('segment_material','在真实素材上给出 0–1 比例 xyxy 框，调用 SAM 查看候选裁片。只提议，不修改作品；先看彩色轮廓，再用 creation_apply_crops 裁切。',object({alias:{type:'string'},box:{type:'array',minItems:4,maxItems:4,items:{type:'number',minimum:0,maximum:1}}},['alias','box'])),
  custom('creation_apply_crops','把已查看的分割提议批量应用到对应来源的已放置素材。与普通编辑一样原子校验、保留真实来源。',object({transactionId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,96}$'},baseSceneRevision:sceneRevision,cuts:{type:'array',minItems:1,maxItems:12,items:object({proposalId:string,target:string,mode:{enum:['keep','remove']},resultId:string,keepRemainder:{type:'boolean'}},['proposalId','target','mode'])},decision:decisionField},['transactionId','baseSceneRevision','cuts'])),
  custom('read_skill','分层读取教程：overview 是专题判断与目录；methods 每次给最多 8 个简要用法；detail 给方法参数和示意图，detail 必须带 methodId，可直接跳到 detail；variant 只在 detail 使用。重复读取会恢复准确参数与当前版本示例。',object({name:{type:'string',pattern:'^[a-z0-9-]{1,64}$'},level:{enum:['overview','methods','detail']},methodId:{type:'string',maxLength:80},variant:{type:'string',maxLength:40},page:{type:'integer',minimum:0,maximum:20}},['name'])),
  custom('search_references','检索模板、技巧和电子手帐案例；仅借鉴构图、配色和对象关系。',object({query:{type:'string',maxLength:160},kind:{enum:['all','templates','techniques','cases']},styles:{type:'array',maxItems:6,items:string},content:{type:'array',maxItems:6,items:string},reference:{enum:['page','page.left','page.right']},limit:{type:'integer',minimum:1,maximum:8}})),
  custom('read_template','读取一个匹配模板的元素位置和角色，仅用于构图参考；不要机械套用或引入示例图片。',object({id:string},['id'])),
  custom('search_writing_topics','按素材或指定词从 365 个手帐话题中找可写切口；仅返回少量题目，不把题库塞进上下文。',object({query:{type:'string',maxLength:100},limit:{type:'integer',minimum:1,maximum:8},exclude:{type:'array',maxItems:20,items:{type:'integer',minimum:1,maximum:365}}})),
  custom('read_case','查看创作者案例的构图、配色、对象关系与制作顺序；仅借鉴方法，不把案例图像当作素材。',object({id:{type:'string',maxLength:80}},['id'])),
  custom('creation_recipe','按 read_skill 返回的 methodId 执行技巧，创建可编辑组合；with 可合批执行另一个技巧。parameters 按该方法详情填写，kind 可省略，修改后自动预览。',object({kind:{enum:['technique']},methodId:{type:'string',maxLength:80},transactionId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,96}$'},baseSceneRevision:sceneRevision,parameters:{type:'object',maxProperties:24,additionalProperties:true},with:{type:'array',minItems:1,maxItems:2,items:object({methodId:{type:'string',maxLength:80},parameters:{type:'object',maxProperties:24,additionalProperties:true}},['methodId','parameters'])},decision:decisionField},['methodId','transactionId','baseSceneRevision','parameters'])),
  custom('creation_plan','记录落实用户方向的可修改构思，不改写用户的主题、风格、疏密或文字要求。首次编辑前必须记录；通常只填 intent 一段话，说明纸层/主体关系与可写位置，即可同轮合批试摆。其他字段及子字段均可选，仅需长期保留时才填，避免在各字段重复同一段计划。methods.id 是构思名称，执行配方才需要 read_skill 返回的准确 methodId。',object({intent:string,methods:{type:'array',maxItems:3,items:object({id:string,purpose:string},['id'])},themeEvidence:object({supportedBy:{type:'array',maxItems:8,items:string},conflicts:{type:'array',maxItems:8,items:string},response:string}),palette:object({source:string,main:string,secondary:string,accent:string,relationship:{enum:['echo','contrast','tonal']},distribution:string}),composition:object({visualAnchors:string,layout:string,connector:string,layering:string,writingSpace:string}),writingZones:{type:'array',maxItems:16,items:object({role:{enum:['title','body','heading','annotation']},surface:{...string,description:'写面说明，例如原页、素材内部、数字纸，或跨原页与纸边；这是构思，不是图层 surface 参数。'},anchor:string,capacity:{enum:['short','medium','long']},legibility:string,flowGroup:string,sequence:{type:'integer',minimum:1,maximum:16}})},steps:{type:'array',minItems:1,maxItems:8,items:object({task:string,status:{enum:['pending','in_progress','completed']}})}},['intent'])),
  custom('creation_phase','可选的过程检查记录，不是交付前置条件；创作动作可随时交错。',object({phase:{enum:creativePhases},reason:decisionField,assessment:object({observations:string,issues:{type:'array',maxItems:8,items:string},adjustments:string},['observations','issues'])},['phase','reason','assessment'])),
  custom('explore_drafts','需要比较明显不同的布局方向或连续修订仍不满意时，后台并行生成 2–3 个独立可编辑草稿并返回真实截图；只探索，不修改主作品。',object({goals:{type:'array',minItems:2,maxItems:3,items:{type:'string',minLength:8,maxLength:180}}},['goals'])),
  custom('select_draft','看过所有草稿截图后，选择一个方案作为主 Scene；必须说明选它的理由，随后自动渲染并重新审查。',object({id:{type:'string',pattern:'^draft_[0-9]+_[1-3]$'},decision:decisionField},['id','decision'])),
  custom('inspect_materials','按需查看总图中看不清的真实素材；每次最多返回 3 张，避免重复发送整批图像。',object({keys:{type:'array',minItems:1,maxItems:8,items:{type:'string'}}},['keys'])),
  custom('workspace_create','开启一个独立试摆空间；之后所有创作 Command 都用 place.surface 指定该空间 ID。',object({id:{type:'string',pattern:'^[a-z][a-z0-9_-]{0,31}$'},title:{type:'string',minLength:1,maxLength:40}},['id','title'])),
  custom('workspace_close','关闭已清空的试摆空间。',object({id:{type:'string',pattern:'^[a-z][a-z0-9_-]{0,31}$'}},['id'])),
  custom('workspace_view','按需重看工作空间；id=source 可重看全部授权素材编号总图。未变化空间不会自动重复发送。',object({id:{type:'string',pattern:'^[a-z][a-z0-9_-]{0,31}$'}},['id'])),
  custom('creation_undo','撤回最近一次成功的编辑批次，恢复之前的可编辑 Scene；随后自动重绘纸面和暂放区。',object({})),
  custom('creation_finish','看过最新自动预览且没有待修缺陷后提交成品，后台绑定该预览并独立审查。填写 review:{observations,issues:[]} 即可，summary 可选；不必抄写 pngHash 或 sceneRevision，顶层不接收这两个字段。必须是本轮最后调用。有待修问题先修改，不调用完成。可选美化建议写 review.observations 或 review.nextStep，不写 issues。',object({summary:{type:'string',maxLength:1200},review:object({observations:{...string,description:'基于当前图像的观察，可包含不影响交付的建议。'},strengths:{type:'array',maxItems:6,items:string},issues:{type:'array',maxItems:0,items:string,description:'完成时必须为空；存在待修缺陷应先修改并查看新预览。'},nextStep:{...string,description:'可选后续建议，不表示交付前仍有问题。'},pngHash:{...string,description:'通常省略，后台绑定最新预览；显式提供时必须与当前预览一致。'},sceneRevision:{...string,description:'通常省略，后台绑定最新 Scene；显式提供时必须与当前预览一致。'}},['observations','issues'])})),
  custom('creation_preview','渲染当前可编辑 Scene，返回真实预览和版本，用于检查构图。',object({})),
  custom('creation_review','看过当前真实预览后先评价构图、素材关系、文字可读性和任务方向；有问题时同轮可继续修改。',object({pngHash:string,sceneRevision:string,approved:{type:'boolean'},observations:string,strengths:{type:'array',maxItems:6,items:string},issues:{type:'array',maxItems:12,items:string},nextStep:string},['pngHash','sceneRevision','approved','observations','issues']))
];

// Discovery changes the model's reading surface, never its permissions or the
// executable contract. A learned tool stays visible across phases/checkpoints.
const core=new Set(['creation_plan','creation_help','creation_inspect','creation_apply','creation_paper','read_skill','creation_recipe','search_references','inspect_materials','creation_preview','creation_undo','creation_finish']);
const groups=[
  {purpose:'参考案例、模板与写作选题',names:['read_case','read_template','search_writing_topics']},
  {purpose:'重看素材总图、管理独立试摆空间',names:['workspace_view','workspace_create','workspace_close']},
  {purpose:'分割真实素材并查看裁片提议',names:['segment_material','creation_apply_crops']},
  {purpose:'额外记录阶段检查或画面意见',names:['creation_phase','creation_review']},
];

export function availableHarnessTools({segmentMaterial}={}){
  return harnessTools.filter(tool=>!['creation_guide','explore_drafts','select_draft'].includes(tool.function.name)&&
    (segmentMaterial||!['segment_material','creation_apply_crops'].includes(tool.function.name)));
}

export function selectHarnessTools(available,state={}){
  const learned=new Set(state.discoveredTools||[]);
  return available.filter(tool=>core.has(tool.function.name)||learned.has(tool.function.name));
}

export function harnessToolCatalog(available=harnessTools){
  const names=new Set(available.map(tool=>tool.function.name));
  return groups.map(({purpose,names:members})=>({purpose,tools:members.filter(name=>names.has(name))}))
    .filter(group=>group.tools.length);
}

export function discoverHarnessTools(available,previous=[],requested=[],data){
  const allowed=new Set(available.map(tool=>tool.function.name));
  const learned=new Set(previous.filter(name=>allowed.has(name)));
  for(const name of requested)if(allowed.has(name)&&!core.has(name))learned.add(name);
  // Reference results carry exact readWith routes. Expose those tools on the
  // next turn without requiring a separate discovery call for each result.
  const visit=value=>{
    if(!value||typeof value!=='object')return;
    const name=value.readWith?.tool;
    if(allowed.has(name)&&!core.has(name))learned.add(name);
    for(const child of Object.values(value))if(child&&typeof child==='object')visit(child);
  };
  visit(data);
  return [...learned];
}
