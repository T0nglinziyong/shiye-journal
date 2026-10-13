import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const sha=process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
  branch=process.env.VERCEL_GIT_COMMIT_REF||null;
await writeFile(join(root,'version.json'),JSON.stringify({
  app:'shiyejournal',commit:sha&&/^[a-f0-9]{40}$/.test(sha)?sha:null,
  branch,buildAt:new Date().toISOString()
}));

// Cache only the HTML entry and the files it references directly. Import,
// editor, AI, PDF and font chunks are fetched when their feature opens.
const html=await readFile(join(root,'index.html'),'utf8');
const entryAssets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match=>match[1]);
const list=[...new Set(['/index.html','/manifest.webmanifest','/icon-192.png','/icon-512.png','/version.json',...entryAssets])];
const hasher=createHash('sha256');
for(const asset of list){hasher.update(asset);hasher.update(await readFile(join(root,asset.slice(1))));}
const hash=hasher.digest('hex').slice(0,12);
const source=await readFile(join(root,'sw.js'),'utf8');
await writeFile(join(root,'sw.js'),source.replace('__BUILD_ID__',hash).replace('__ASSETS__',JSON.stringify(['/',...list])));
