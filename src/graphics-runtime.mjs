import {spawnSync} from 'node:child_process';
import {existsSync,statSync,realpathSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {graphicsHelp,graphicsLimits} from './graphics-contract.js';
import {validateCreationV2Commands} from './creation-v2-commands.js';
export function runGraphics(arg,revision){
 if(!arg||arg==='help'){process.stdout.write(JSON.stringify({ok:true,...graphicsHelp})+'\n');return;}
 if(!/^work\/[A-Za-z0-9._-]+\.json$/.test(arg))throw Error('图形请求须位于 work 目录');
 if(!realpathSync(arg).startsWith(realpathSync('work')+'/'))throw Error('图形请求不能指向 work 以外');
 if(statSync(arg).size>graphicsLimits.requestBytes)throw Error('图形请求过大');const bytes=readFileSync(arg,'utf8'),input=JSON.parse(bytes),id=input.id||'graphic-result';
 if(!/^[A-Za-z][A-Za-z0-9._-]{0,47}$/.test(id))throw Error('图形 id 无效');
 const commandPath='work/'+id+'.commands.json',prefix='output/graphics/'+id;
 if(existsSync(commandPath)||existsSync(prefix+'.json'))throw Error('该图形结果已存在；请更换 id，避免覆盖未应用的草稿');
 const run=spawnSync(process.execPath,['--max-old-space-size=128','runtime/graphics.cjs'],{input:bytes,encoding:'utf8',timeout:graphicsLimits.timeoutMs,maxBuffer:3000000});
 if(run.error||run.status!==0)throw Object.assign(Error(run.error?.message||run.stderr||'图形计算失败'),{code:'GRAPHICS_FAILED'});
 const result=JSON.parse(run.stdout),transaction={protocolVersion:2,transactionId:'graphics-'+id+'-'+createHash('sha256').update(bytes+revision).digest('hex').slice(0,12),baseSceneRevision:revision,operations:result.operations};
 if(result.operations.length)validateCreationV2Commands(transaction);
 mkdirSync('output/graphics',{recursive:true});writeFileSync(prefix+'.json',JSON.stringify(result));if(result.svg)writeFileSync(prefix+'.svg',result.svg);
 if(result.operations.length)writeFileSync(commandPath,JSON.stringify(transaction));
 process.stdout.write(JSON.stringify({ok:true,readOnly:true,result:prefix+'.json',svg:result.svg?prefix+'.svg':null,commands:result.operations.length?commandPath:null,paths:result.paths.length,empty:result.empty??false})+'\n');
}
