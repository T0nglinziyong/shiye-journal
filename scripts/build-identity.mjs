import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
function gitValue(...args){
  try{return execFileSync('git',args,{cwd:projectRoot,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
  catch{return null;}
}

export const buildSha=process.env.SHIYE_BUILD_SHA||process.env.GITHUB_SHA||gitValue('rev-parse','HEAD');
export const buildBranch=process.env.SHIYE_BUILD_BRANCH||process.env.GITHUB_REF_NAME||gitValue('branch','--show-current');
