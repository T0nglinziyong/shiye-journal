import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const lock=JSON.parse(await readFile('package-lock.json','utf8')),sections=['Third-party software included in 拾页. Generated from pinned npm packages.\n'];
sections.push('Optional downloaded model: Xenova/slimsam-77-uniform, Apache-2.0.\\nRevision: 5850ab45f587c112167512ffef949107115e26a0\\nSource: https://huggingface.co/Xenova/slimsam-77-uniform\\nWeights are fetched by the browser on explicit selection; they are not bundled here.\\n');\nsections.push('\\n===== scikit-image translated recognition algorithms (BSD-3-Clause) =====\\n');\nsections.push(await readFile('THIRD_PARTY_SCITKIT_IMAGE_BSD.txt','utf8'));
for(const [path,entry] of Object.entries(lock.packages)){
  if(!path.startsWith('node_modules/')||entry.dev)continue;
  let files;try{files=await readdir(path);}catch(e){if(entry.optional&&e.code==='ENOENT')continue;throw e;}
  const pkg=JSON.parse(await readFile(join(path,'package.json'),'utf8'));
  sections.push('\n===== '+pkg.name+' '+pkg.version+' ('+pkg.license+') =====\n');
  for(const name of files.filter(n=>/^(license|licence|notice|copying)(\.|$)/i.test(n)))sections.push(await readFile(join(path,name),'utf8'));
}
await writeFile('dist/THIRD_PARTY_NOTICES.txt',sections.join('\n'));
