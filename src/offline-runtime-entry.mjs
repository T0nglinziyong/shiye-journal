import {runV3} from './v3-runtime.mjs';
import {readFileSync,statSync} from 'node:fs';
async function main(){
 if(statSync('TASK.json').size>8_000_000)throw Error('任务文件超过 8 MB');
 const task=JSON.parse(readFileSync('TASK.json','utf8'));
 if(task?.format!=='shiye-gpt-creation-package'||task.version!==3||task.sourceContext?.packageLayout!=='v3')throw Error('不是拾页 v3 创作包');
 const command=process.argv[2];
 const arg=command==='preview'&&process.argv[3]==='--commands'?process.argv[4]:command==='review'&&process.argv[3]==='--result'?process.argv[4]:process.argv[3];
 if(command==='begin'&&process.argv.slice(4).some(value=>value.startsWith('--protocol=')&&value!=='--protocol=2'))throw Object.assign(Error('只接受统一协议 2'),{code:'COMMAND_PROTOCOL_INVALID'});
 await runV3(task,command,arg,{full:process.argv.includes('--full')});
}
main().catch(error=>{process.stderr.write(JSON.stringify({ok:false,code:error.code||'RUNTIME_ERROR',issue:error.message,...(error.currentSceneRevision?{currentSceneRevision:error.currentSceneRevision}:{}),...(error.path?{path:error.path}:{}),...(error.operationIndex!==undefined?{operationIndex:error.operationIndex}:{})})+'\n');process.exitCode=1;});
