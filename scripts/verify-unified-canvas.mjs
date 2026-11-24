import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {createHarnessRenderer} from '../creative-agent/runtime/renderer.mjs';
const output=resolve(process.argv[2]||'/tmp/shiye-unified-canvas');await mkdir(output,{recursive:true});
let document=await createCreationDocument({draft:draft(),assets:[]});let serial=0;
const apply=operations=>{document=applyCreationTransaction(document,{protocolVersion:2,transactionId:'visual-'+serial++,baseSceneRevision:creationSceneRevision(document),operations},[]).document;};
const place=(x,y,rotationDeg=0)=>({reference:'page',at:[x,y],unit:'mm',anchor:'top-left',rotationDeg});
apply([
 {op:'title.add',id:'title',content:'同一张纸，两处呼应',size:{width:170,unit:'mm'},style:{fontSizePt:24,color:'#344B62'},effect:'outline',place:place(18,18)},
 {op:'paper.add',id:'blue',size:{width:80,height:110,unit:'mm'},style:{fill:'#BCD5DF',stroke:'#809BAD'},texture:'rough',pattern:'ruled',edge:{style:'torn',seed:42}},
 {op:'layer.split',target:'blue',split:{through:[.5,.5],unit:'ratio',rotationDeg:20,edge:{style:'torn',seed:71}},pieces:[{id:'lower',place:place(18,60,-6)},{id:'upper',place:place(108,130,5)}]},
 {op:'text.add',id:'caption',content:'位置与角度独立设置\n纸纹与横线保留连续关系',size:{width:165,unit:'mm'},style:{fontSizePt:13,color:'#344B62'},place:place(18,245)}
]);
const renderer=await createHarnessRenderer({source:document.source,images:{},saveArtifact:async({png})=>{const path=resolve(output,'preview-'+serial+'.png');await writeFile(path,png);return path;}});
await renderer.render(document);
apply([{op:'layer.update',target:'title',effect:'offset-outline',accentColor:'#DDAA79',style:{fontSizePt:26},backdrop:{kind:'dots',color:'#E7CC9D'}}]);
await renderer.render(document);
await writeFile(resolve(output,'scene.json'),JSON.stringify(document,null,2));
console.log(JSON.stringify({output,sceneRevision:creationSceneRevision(document),previews:['preview-1.png','preview-2.png']}));
