import {agentTools, directPageContract, directPageToTools} from './creative-contract.js';

const jsonTools = parsed => parsed.tools || parsed.tool_calls || [];
const directTools = parsed => directPageToTools(parsed);
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
  directPage:{
    native:false,
    instruction:`一次返回完整JSON页面数据，不返回tools或Markdown。合同：${JSON.stringify(directPageContract)}`,
    request:() => ({response_format:{type:'json_object'}}),
    calls:(message, turn) => callsFromJSON(message, turn, directTools)
  }
};

export function creativeProtocol(options) {
  if (options.generationMode === 'direct') return protocols.directPage;
  return ['native', 'auto'].includes(options.transport || 'native')
    ? protocols.nativeTools : protocols.jsonTools;
}
