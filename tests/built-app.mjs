import {readFile} from 'node:fs/promises';
import * as fake from 'fake-indexeddb';
export async function waitFor(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('DOM state did not settle within 2 seconds');}
export async function builtApp(root,html,window){
  const entry=html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)[1];
  const code=await readFile(new URL('.'+entry,root),'utf8');
  for(const [name,value] of Object.entries(fake))if(name==='indexedDB'||name.startsWith('IDB'))window[name]=value;
  // Happy DOM uses a classic eval here; supply only the module's own URL.
  // This does not stub the worker, PDF encoder, storage or creative execution.
  return code.replaceAll('import.meta.url',JSON.stringify(new URL(entry,'https://shiye.test').href)).replace(/\bexport\s*\{[^}]*\};?\s*$/,'');
}
