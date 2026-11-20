import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout} from 'node:timers/promises';

const name='shiye-harness-test-'+randomUUID().slice(0,8);
const run=(args,input)=>{
  const result=spawnSync('docker',args,{input,encoding:'utf8',timeout:30000,maxBuffer:2_000_000});
  if(result.status!==0)throw Error(result.stderr||result.error?.message||'隔离 PostgreSQL 测试失败');return result.stdout;
};
run(['run','--detach','--rm','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine']);
try{
  let ready=false;
  for(let i=0;i<100;i++){
    const result=spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'ignore',timeout:2000});
    if(result.status===0){ready=true;break;}await setTimeout(100);
  }
  if(!ready)throw Error('隔离数据库未启动');
  for(const path of ['tests/sql/creative-jobs.fixture.sql','deploy/cloudbase/010-creative-jobs.sql','deploy/cloudbase/011-creative-retention.sql','deploy/cloudbase/010-creative-jobs.sql','tests/sql/creative-jobs.assert.sql']){
    run(['exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1'],await readFile(new URL('../'+path,import.meta.url),'utf8'));
    console.log('Passed:',path);
  }
}finally{run(['stop',name]);}
