import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const paths=['START_HERE.md','design/CRAFT_GUIDE.md'];
const files=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await readFile(resolve(root,'creation-contract/release-v3',path==='design/CRAFT_GUIDE.md'?'design/GUIDE.md':path),'utf8')])));
const releaseId='v3-fixed-'+createHash('sha256').update(paths.map(path=>path+'\0'+files[path]).join('\0')).digest('hex').slice(0,16);
const output=`// Generated from creation-contract/release-v3 by scripts/build-creation-fixed.mjs.\nexport const creationFixedReleaseId=${JSON.stringify(releaseId)};\nexport const creationFixedFiles=${JSON.stringify(files)};\n`;
const target=resolve(root,'src/generated/creation-fixed-source.js');
let previous='';try{previous=await readFile(target,'utf8');}catch{}
if(previous!==output)await writeFile(target,output);
