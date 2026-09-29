// Real requests; private credentials are accepted only on stdin, never recorded.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {runCreativeAgent} from '../src/creative-runner.js';
import {modelFixture} from './model-fixture.mjs';
const mode=process.argv.includes('--direct')?'direct':'agent',gpt=process.argv.includes('--gpt'),provider=gpt?'gpt':'deepseek';
const label=(process.env.SHIYE_MODEL_LABEL||'').replace(/[^a-z0-9-]/gi,'');const directory='/tmp/shiye-model-live/'+provider+'-'+mode+(label?'-'+label:'');await mkdir(directory,{recursive:true});
let key='test-only';
if(!gpt){const lines=createInterface({input:process.stdin,terminal:false});key=await new Promise(resolve=>lines.once('line',line=>{lines.close();resolve(line.trim());}));if(!key)throw Error('Missing credential');}
const options=modelFixture(mode);options.key=key;if(process.argv.includes('--reasoning-low'))Object.assign(options,{reasoningMode:'low',disableThinking:false,maxTokens:12000});if(gpt){options.endpoint='https://api.openai.com/v1/chat/completions';options.transport='native';options.model='codex-subagent';}
let round=0;const turns=[];
options.request=async(url,init)=>{
  const payload=JSON.parse(init.body),number=++round,body=JSON.stringify(payload),hash=createHash('sha256').update(body).digest('hex');
  await writeFile(directory+'/request-'+number+'.json',body);await writeFile(directory+'/request-'+number+'.sha256',hash+'\n');console.log(provider,mode,'round',number,'application payload',hash);
  if(!gpt)return fetch(url,init);
  const started=Date.now();let response;
  while(Date.now()-started<300000){try{response=JSON.parse(await readFile(directory+'/response-'+number+'.json','utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;await new Promise(resolve=>setTimeout(resolve,250));}}
  if(!response)throw Error('GPT responder timeout');return {ok:true,json:async()=>response};
};
options.onTurn=async({turn,results,draft,review})=>{turns.push({turn,results,review});await writeFile(directory+'/draft.json',JSON.stringify(draft));console.log('executed',turn,results.map(r=>r.name+':'+r.ok).join(', '));};
try{const result=await runCreativeAgent(options);await writeFile(directory+'/draft.json',JSON.stringify(result.draft));await writeFile(directory+'/fixture.json',JSON.stringify({assets:options.assets,aliases:options.aliases}));await writeFile(directory+'/report.json',JSON.stringify({provider,mode,finished:result.finished,turns,review:result.review,context:'Exact application payload; Codex responder platform context is not identical to a provider hidden context.'},null,2));console.log('FINISHED',directory,JSON.stringify(result.review));}
catch(e){await writeFile(directory+'/report.json',JSON.stringify({provider,mode,finished:false,error:e.message,turns},null,2));console.error('FAILED',e.message);process.exitCode=1;}
