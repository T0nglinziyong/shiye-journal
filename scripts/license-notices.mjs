import {readFile,readdir,writeFile} from 'node:fs/promises';
import {journalBundledFonts} from '../src/journal-font-catalog.js';
import {join} from 'node:path';
const lock=JSON.parse(await readFile('package-lock.json','utf8')),sections=['Third-party software included in 拾页. Generated from pinned npm packages.\n'];
for(const [path,entry] of Object.entries(lock.packages)){
  if(!path.startsWith('node_modules/')||entry.dev)continue;
  let files;try{files=await readdir(path);}catch(e){if(entry.optional&&e.code==='ENOENT')continue;throw e;}
  const pkg=JSON.parse(await readFile(join(path,'package.json'),'utf8'));
  sections.push('\n===== '+pkg.name+' '+pkg.version+' ('+pkg.license+') =====\n');
  for(const name of files.filter(n=>/^(license|licence|notice|copying)(\.|$)/i.test(n)))sections.push(await readFile(join(path,name),'utf8'));
}
for(const font of journalBundledFonts)sections.push('\n===== '+font.family+' =====\n'+await readFile(join('src/assets/fonts',font.license),'utf8'));
await writeFile('dist/THIRD_PARTY_NOTICES.txt',sections.join('\n'));
