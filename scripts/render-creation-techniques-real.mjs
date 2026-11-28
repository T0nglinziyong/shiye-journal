import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {loadOfflineCanvas,renderOfflinePNG} from '../src/offline-node-preview.mjs';
import {compileTechnique} from '../creative-agent/library/techniques.js';

const [configFile,outDir]=process.argv.slice(2);
if(!configFile||!outDir)throw Error('用法：node scripts/render-creation-techniques-real.mjs <私有配置.json> <输出目录>');
const config=JSON.parse(await readFile(configFile,'utf8'));
const packageRoot=resolve(dirname(configFile),config.packageRoot);
const manifest=JSON.parse(await readFile(join(packageRoot,'assets/manifest.json'),'utf8'));
if(!Array.isArray(manifest.assets)||!Array.isArray(config.cases)||!config.cases.length)throw Error('素材包或验收案例为空');
if(new Set(config.cases.map(item=>item.id)).size!==config.cases.length)throw Error('案例 ID 不可重复');
const assets=[],images={};
for(const entry of manifest.assets){
 if(!/^assets\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/i.test(entry.image))throw Error('素材路径不合规：'+entry.alias);
 const bytes=await readFile(join(packageRoot,entry.image));
 const hash='sha256:'+createHash('sha256').update(bytes).digest('hex');
 if(entry.sha256&&entry.sha256!==hash)throw Error('素材哈希不符：'+entry.alias);
 const width=Number(entry.physicalWidthMM),height=Number(entry.physicalHeightMM);
 if(!(width>0&&height>0))throw Error('素材尺寸缺失：'+entry.alias);
 assets.push({id:entry.assetID,alias:entry.alias,title:entry.originalFilename||entry.alias,kind:entry.kind,role:entry.role,physicalWidthMM:width,physicalHeightMM:height,supply:{quantity:1}});
 images[entry.alias]=bytes;
}
if(new Set(assets.map(asset=>asset.alias)).size!==assets.length)throw Error('素材别名不可重复');
await mkdir(outDir,{recursive:true});
const canvas=await loadOfflineCanvas(),results=[];
for(const item of config.cases){
 if(!/^[a-z0-9-]{1,64}$/.test(item.id))throw Error('案例 ID 不合规');
 const paper=item.paper||{width:297,height:210};
 if(!(paper.width>0&&paper.height>0))throw Error('纸张尺寸无效');
 const page=draft({ratio:'a5'});page.physicalPageHeightMM=paper.height;page.canvas.width=page.canvas.height*paper.width/paper.height;
 const doc=await createCreationDocument({draft:page,assets,aliases:Object.fromEntries(assets.map(asset=>[asset.alias,asset.id]))});
 const compiled=compileTechnique({methodId:item.methodId,parameters:item.parameters,materials:assets});
 const done=applyCreationTransaction(doc,{protocolVersion:2,transactionId:'real-method-'+item.id,baseSceneRevision:creationSceneRevision(doc),operations:[...(item.prepare||[]),...compiled.operations]},assets).document;
 const {png}=await renderOfflinePNG(done.page,done.source,images,canvas);
 await writeFile(join(outDir,item.id+'.png'),png);
 const used=[...new Set([...(item.prepare||[]),...compiled.operations.flatMap(op=>op.children||[])].filter(op=>op.op==='material.add').map(op=>op.asset))];
 results.push({id:item.id,methodId:item.methodId,paper,materials:used.map(alias=>{const asset=assets.find(a=>a.alias===alias);if(!asset)throw Error('未知素材：'+alias);return {alias,kind:asset.kind,widthMM:asset.physicalWidthMM,heightMM:asset.physicalHeightMM};}),report:compiled.report,imageSha256:createHash('sha256').update(png).digest('hex')});
}
await writeFile(join(outDir,'report.json'),JSON.stringify({packageRoot,cases:results},null,2)+'\n');
console.log(JSON.stringify({cases:results.length,output:resolve(outDir)}));
