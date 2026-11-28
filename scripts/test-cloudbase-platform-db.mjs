// Destructive TEST FIXTURE setup is restricted to an empty loopback test DB.
// Never pass a production CloudBase connection here. This script does not deploy.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const connection=process.env.SHIYE_TEST_DATABASE_URL;
let url;try{url=new URL(connection);}catch{}
if(process.env.SHIYE_DB_TEST_DISPOSABLE!=='true'||!url||
   !['postgres:','postgresql:'].includes(url.protocol)||
   !['localhost','127.0.0.1','[::1]'].includes(url.hostname)||
   !/^\/shiye_cloudbase_test(?:_[a-z0-9]+)?$/.test(url.pathname)||url.search||url.hash){
 console.error('Database tests NOT RUN: require SHIYE_DB_TEST_DISPOSABLE=true and SHIYE_TEST_DATABASE_URL pointing to an empty loopback shiye_cloudbase_test database.');
 process.exit(2);
}
const probe=spawnSync('psql',['--version'],{encoding:'utf8'});
if(probe.status!==0){console.error('Database tests NOT RUN: psql is not installed.');process.exit(2);}
for(const path of ['tests/fixtures/cloudbase-platform-base.sql','deploy/cloudbase/001-platform-search.sql',
 'deploy/cloudbase/001-platform-search.sql','deploy/cloudbase/002-platform-vector.sql',
 'deploy/cloudbase/002-platform-vector.sql','tests/cloudbase-platform-db.sql']){
 console.log('Testing '+path);
 // Only caller-provided local disposable credentials are used. They are never printed.
 const result=spawnSync('psql',['-X','-v','ON_ERROR_STOP=1','-d',connection,'-f',join(root,path)],
   {encoding:'utf8',timeout:180000,maxBuffer:2_000_000});
 if(result.status!==0){console.error(result.stderr||'psql failed');process.exit(result.status||1);}
 console.log(result.stdout);console.log(result.stderr);
}
console.log('CloudBase PG integration tests PASSED on the local disposable database. No live CloudBase request was made.');
