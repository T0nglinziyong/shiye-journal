// Standalone Node workbench: local task files only, no account or network access.
import {runWebWorkbench} from './web-workbench-runtime.mjs';
import {readFileSync,statSync} from 'node:fs';
async function main(){
  if(statSync('task/context.json').size>8_000_000)throw Error('任务数据超过 8 MB');
  const context=JSON.parse(readFileSync('task/context.json','utf8'));
  if(context?.format!=='shiye-gpt-creation-package'||context.version!==2||!context.source?.capabilities?.sceneWorkbench)throw Error('请使用当前网页版 Scene 创作包');
  await runWebWorkbench(context,process.argv[2]);
}
main().catch(error=>{process.stderr.write(JSON.stringify({ok:false,issue:error.message})+'\n');process.exitCode=1;});
