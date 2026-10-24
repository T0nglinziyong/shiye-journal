import {runV3} from './v3-runtime.mjs';
import {readFileSync,statSync} from 'node:fs';
async function main(){
 if(statSync('TASK.json').size>8_000_000)throw Error('任务文件超过 8 MB');
 const task=JSON.parse(readFileSync('TASK.json','utf8'));
 if(task?.format!=='shiye-gpt-creation-package'||task.version!==3||task.sourceContext?.packageLayout!=='v3')throw Error('不是拾页 v3 创作包');
 const command=process.argv[2];
 if(process.argv.includes('--help')){
  const usage={
   help:'help [topic]',describe:'describe <operation|topic> [...] [--full]',graphics:'graphics help',info:'info',fonts:'fonts',
   'design-check':'design-check', 'self-test':'self-test',begin:'begin work/<name>.json',
   check:'check work/<name>.json',apply:'apply work/<name>.json',
   preview:'preview [--commands work/<name>.json] [--full]（默认只返回图像路径，详细诊断保存到文件）',
   inspect:'inspect',review:'review pass|fail',pack:'pack'
  };
  if(!usage[command])throw Object.assign(Error('未知工作台命令'),{code:'UNKNOWN_COMMAND'});
  process.stdout.write(JSON.stringify({ok:true,command,usage:usage[command],readOnly:true})+'\n');
  return;
 }
 const args=process.argv.slice(3).filter(value=>value!=='--full');
 if(command==='preview'&&args[0]==='--commands'&&(!args[1]||args[1].startsWith('--')))
  throw Object.assign(Error('preview --commands 需要 work 目录中的命令文件路径'),{code:'COMMAND_PATH_INVALID'});
 const arg=command==='describe'?args:command==='preview'&&args[0]==='--commands'?args[1]:command==='review'&&args[0]==='--result'?args[1]:args[0];
 if(command==='begin'&&process.argv.slice(4).some(value=>value.startsWith('--protocol=')&&value!=='--protocol=2'))throw Object.assign(Error('只接受统一协议 2'),{code:'COMMAND_PROTOCOL_INVALID'});
 await runV3(task,command,arg,{full:process.argv.includes('--full')});
}
main().catch(error=>{process.stderr.write(JSON.stringify({ok:false,code:error.code||'RUNTIME_ERROR',issue:error.message,...(error.currentSceneRevision?{currentSceneRevision:error.currentSceneRevision}:{}),...(error.path?{path:error.path}:{}),...(error.operationIndex!==undefined?{operationIndex:error.operationIndex}:{})})+'\n');process.exitCode=1;});
