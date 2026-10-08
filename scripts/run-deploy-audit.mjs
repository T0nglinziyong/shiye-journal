import {verifyDeployment} from './verify-vercel-deployment.mjs';
const branch=process.env.DEPLOY_BRANCH,sha=process.env.DEPLOY_SHA,
 projectId=branch==='test'?process.env.SHIYE_VERCEL_TEST_PROJECT_ID:process.env.SHIYE_VERCEL_MAIN_PROJECT_ID;
const result=await verifyDeployment({token:process.env.VERCEL_TOKEN,projectId,branch,sha});
console.log(JSON.stringify(result));
