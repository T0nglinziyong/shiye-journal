import {agentTools, toolContracts, validateValue, directPageContract, directPageToTools} from './creative-contract.js';
import {verifiedModelCapabilities} from './ai-capabilities.js';

const craftPlanTools=parsed=>{validateValue(parsed,toolContracts.apply_craft_plan,'$.plan');return [{name:'apply_craft_plan',arguments:parsed}];};
const jsonTools=parsed=>parsed?.format==='shiye-craft-plan'?craftPlanTools(parsed):parsed.tools||[];
// Direct layout is intentionally a complete editable page, not a second
// hidden gateway into the agent's craft-plan protocol.
const directTools=parsed=>directPageToTools(parsed);
const parseJSON = content => JSON.parse((content || '{}').replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g, ''));
const callsFromJSON = (message, turn, tools) => tools(parseJSON(message.content)).map((entry, index) => ({
  id:`json-${turn}-${index}`,
  type:'function',
  function:{name:entry.name || entry.function?.name, arguments:JSON.stringify(entry.arguments || entry.function?.arguments || {})}
}));

// Provider wire formats are separate from the editable-page tool contract.
// Add a format here without changing the turn loop or the canvas executor.
const protocols = {
  nativeTools:{
    native:true,
    instruction:'调用本地工具搭建，满意后finish_design必须是本轮最后一个工具。',
    request:thinking => ({tools:agentTools, tool_choice:thinking?.type === 'enabled' ? 'auto' : 'required'}),
    calls:message => message.tool_calls || []
  },
  jsonTools:{
    native:false,
    instruction:`仅返回JSON {"tools":[{"name":"工具名","arguments":{}}]}。完整合同：${JSON.stringify(agentTools)}`,
    request:() => ({response_format:{type:'json_object'}}),
    calls:(message, turn) => callsFromJSON(message, turn, jsonTools)
  },
  plainTools:{
    native:false,
    instruction:`仅返回JSON {"tools":[{"name":"工具名","arguments":{}}]}，不要 Markdown。完整合同：${JSON.stringify(agentTools)}`,
    request:() => ({}),
    calls:(message, turn) => callsFromJSON(message, turn, jsonTools)
  },
  directPage:{
    native:false,
    instruction:`一次返回完整JSON页面数据（page v2：递归 layers 图层树），不返回 tools、craft-plan 或 Markdown。页面合同：${JSON.stringify(directPageContract)}`,
    request:() => ({response_format:{type:'json_object'}}),
    calls:(message, turn) => callsFromJSON(message, turn, directTools)
  },
  plainDirectPage:{
    native:false,
    instruction:`一次返回完整JSON页面数据（page v2：递归 layers 图层树），不要 Markdown、tools 或 craft-plan。页面合同：${JSON.stringify(directPageContract)}`,
    request:() => ({}),
    calls:(message, turn) => callsFromJSON(message, turn, directTools)
  }
};

export function creativeProtocol(options) {
  const transport=options.transport||'auto',capability=verifiedModelCapabilities(options);
  if(options.generationMode==='direct'){
    if(capability?.jsonObject||transport==='json')return protocols.directPage;
    if(capability?.vision)return protocols.plainDirectPage;
    const error=Error('完整页面需要 JSON 响应；当前模型能力未核对，请在设置中明确选择兼容 JSON 接口');error.code='capability-unverified';throw error;
  }
  if(transport==='native')return protocols.nativeTools;
  if(transport==='json')return protocols.jsonTools;
  if(capability?.nativeTools)return capability.toolChoiceRequired===false?
    {...protocols.nativeTools,request:()=>({tools:agentTools,tool_choice:'auto'})}:protocols.nativeTools;
  if(capability?.jsonObject)return protocols.jsonTools;
  if(capability?.vision)return protocols.plainTools;
  const error=Error('自动适配未核对当前 API 地址与模型的工具/JSON 能力；请在设置中明确选择接口类型');error.code='capability-unverified';throw error;
}
