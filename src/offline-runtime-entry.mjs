import {runV3} from './v3-runtime.mjs';
import {readFileSync,statSync} from 'node:fs';
async function main(){
  if(statSync('TASK.json').size>8_000_000)throw Error('任务文件超过 8 MB');
  const task=JSON.parse(readFileSync('TASK.json','utf8'));
  if(task?.format!=='shiye-gpt-creation-package'||task.version!==3||task.sourceContext?.packageLayout!=='v3')throw Error('不是拾页 v3 创作包');
  await runV3(task,process.argv[2],process.argv[3]);
}
main().catch(error=>{process.stderr.write(JSON.stringify({ok:false,code:error.code||'RUNTIME_ERROR',issue:error.message,...(error.currentSceneRevision?{currentSceneRevision:error.currentSceneRevision}:{}),...(error.operationIndex!==undefined?{operationIndex:error.operationIndex,path:error.path}:{})})+'\n');process.exitCode=1;});
