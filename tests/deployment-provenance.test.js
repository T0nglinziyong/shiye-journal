import test from 'node:test';
import assert from 'node:assert/strict';
import {matchDeployment,verifyDeployment} from '../scripts/verify-vercel-deployment.mjs';
const sha='a'.repeat(40);
const good={state:'READY',url:'test.vercel.app',id:'deployment',
 meta:{githubCommitSha:sha,githubCommitRef:'test',githubOrg:'T0nglinziyong',githubRepo:'shiye-journal'}};
test('ready preview must match exactly the latest repository SHA',async()=>{
 assert.equal(matchDeployment(good,{sha,branch:'test'}),true);
 for(const row of [{...good,state:'QUEUED'},{...good,meta:{...good.meta,githubCommitSha:'b'.repeat(40)}},
 {...good,meta:{...good.meta,githubCommitRef:'main'}}]){
   assert.equal(matchDeployment(row,{sha,branch:'test'}),false);
 }
 const fetcher=async()=>({ok:true,json:async()=>({deployments:[{...good,state:'ERROR'},good]})});
 assert.equal((await verifyDeployment({token:'token',projectId:'id',branch:'test',sha,fetcher})).url,'https://test.vercel.app');
 const outdated=async()=>({ok:true,json:async()=>({deployments:[{...good,meta:{...good.meta,githubCommitSha:'b'.repeat(40)}}]})});
 await assert.rejects(verifyDeployment({token:'token',projectId:'id',branch:'test',sha,fetcher:outdated}),/没有此分支最新 SHA/);
});
