import {creationAgentTools as agentTools} from './creation-agent-session.js';
import {verifiedModelCapabilities} from './ai-capabilities.js';

const jsonTools=parsed=>{
 if(!parsed||!Array.isArray(parsed.tools)||Object.keys(parsed).some(key=>key!=='tools'))throw Error('仅接受 {tools:[{name,arguments}]}；作品修改使用 creation_apply');
 return parsed.tools;
};
const parseJSON = content => JSON.parse((content || '{}').replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g, ''));
const callsFromJSON = (message, turn, tools) => tools(parseJSON(message.content)).map((entry, index) => ({
  id:`json-${turn}-${index}`,
  type:'function',
  function:{name:entry.name || entry.function?.name, arguments:JSON.stringify(entry.arguments || entry.function?.arguments || {})}
}));

const validCalls=calls=>{
 if(!Array.isArray(calls)||calls.length>12||calls.some(c=>!c||typeof c.id!=='string'||!c.id||!c.function||typeof c.function.name!=='string'||typeof c.function.arguments!=='string')||new Set(calls.map(c=>c.id)).size!==calls.length)throw Error('每轮最多12个有效工具调用，调用编号必须唯一');
 return calls;
};

// Provider wire formats are separate from the editable-page tool contract.
// Add a format here without changing the turn loop or the canvas executor.
const protocols = {
  nativeTools:{
    native:true,
    instruction:'用 creation_apply 提交统一 Command；先按需 creation_help 获取参数。满意后 creation_finish 必须是本轮最后工具，携带最新 sceneRevision。',
    request:thinking => ({tools:agentTools, tool_choice:thinking?.type === 'enabled' ? 'auto' : 'required'}),
    calls:message => validCalls(message.tool_calls || [])
  },
  jsonTools:{
    native:false,
    instruction:`仅返回JSON {"tools":[{"name":"工具名","arguments":{}}]}。完整合同：${JSON.stringify(agentTools)}`,
    request:() => ({response_format:{type:'json_object'}}),
    calls:(message, turn) => validCalls(callsFromJSON(message, turn, jsonTools))
  },
  plainTools:{
    native:false,
    instruction:`仅返回JSON {"tools":[{"name":"工具名","arguments":{}}]}，不要 Markdown。完整合同：${JSON.stringify(agentTools)}`,
    request:() => ({}),
    calls:(message, turn) => validCalls(callsFromJSON(message, turn, jsonTools))
  }
};

export function creativeProtocol(options) {
  const transport=options.transport||'auto',capability=verifiedModelCapabilities(options);
  if(transport==='native')return protocols.nativeTools;
  if(transport==='json')return protocols.jsonTools;
  if(capability?.nativeTools)return capability.toolChoiceRequired===false?
    {...protocols.nativeTools,request:()=>({tools:agentTools,tool_choice:'auto'})}:protocols.nativeTools;
  if(capability?.jsonObject)return protocols.jsonTools;
  if(capability?.vision)return protocols.plainTools;
  const error=Error('自动适配未核对当前 API 地址与模型的工具/JSON 能力；请在设置中明确选择接口类型');error.code='capability-unverified';throw error;
}
