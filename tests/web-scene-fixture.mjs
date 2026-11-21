import {compileWebSceneInput,webSceneDocument} from '../src/web-scene-workbench.js';
import {importEditableWork} from '../src/offline-creation.js';
// Test the command -> native snapshot -> app import boundary, not a legacy
// tools/plan import. Production imports deliberately reject command payloads.
export function compileAndImport(text,assets,options){
 const input=JSON.parse(text);
 const doc=compileWebSceneInput(webSceneDocument(input.source,input.source.baseDraft,input.title),input,assets);
 return importEditableWork(JSON.stringify(doc),assets,options);
}
