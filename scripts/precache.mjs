import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const sha=process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
  branch=process.env.VERCEL_GIT_COMMIT_REF||null;
await writeFile(join(root,'version.json'),JSON.stringify({
  app:'shiyejournal',commit:sha&&/^[a-f0-9]{40}$/.test(sha)?sha:null,
  branch,buildAt:new Date().toISOString()
}));

async function files(dir){let out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())out.push(...await files(path));else out.push(path);}return out;}
const list=(await files(root)).filter(x=>!x.endsWith('/sw.js')&&!/\.(woff2?|ttf)$/.test(x)&&!x.endsWith('.wasm')&&!/\/assets\/(?:opencv-|offline-(?:validate|glyph)-source-)/.test(x)&&!/\/(builtin-materials|builtin-examples|sample|journal-cases)\//.test(x)).map(x=>'/'+relative(root,x).replaceAll('\\','/'));
const hasher=createHash('sha256');
for(const asset of list){hasher.update(asset);hasher.update(await readFile(join(root,asset.slice(1))));}
const hash=hasher.digest('hex').slice(0,12);
const source=await readFile(join(root,'sw.js'),'utf8');
await writeFile(join(root,'sw.js'),source.replace('__BUILD_ID__',hash).replace('__ASSETS__',JSON.stringify(['/',...list])));
