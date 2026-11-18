import {readFile,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const bundle=join(root,'.cloudbase-build');
const functionDir=join(bundle,'functions','shiye-api');
const config=JSON.parse(await readFile(join(bundle,'cloudbaserc.json'),'utf8'));
if(config.functions?.[0]?.installDependency!==false)throw Error('云函数必须使用随包部署的原生依赖');
await stat(join(functionDir,'package.json'));
await promisify(execFile)('npm',['install','--prefix',functionDir,'--omit=dev','--omit=optional',
  '--no-package-lock','--ignore-scripts','--silent'],{cwd:root});
await import(pathToFileURL(join(functionDir,'server/cloudbase/classification.mjs')));
console.log('CloudBase function dependencies ready');
