// Bundled into a standalone Node tool placed inside an exported task ZIP.
// It intentionally reads only fixed files in the current task directory and
// writes only output/validation-report.json. No account or network access.
import {readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {zipSync,strToU8} from 'fflate';
import {importEditableWork,inspectEditableSource} from './offline-creation.js';
import {sceneFingerprint} from './offline-result-review.js';

async function main(){
  const report={version:1,validator:'shiye-current-contract',structure:'failed',physical:'not-run',visual:'unavailable',reading:'pending'};
  if(process.argv[2]==='pack')rmSync('output/作品.shiyeproject.zip',{force:true});
  try{
    const context=JSON.parse(readFileSync('context.json','utf8'));
    const sceneText=readFileSync('project.shiyeproject.json','utf8');
    const scene=inspectEditableSource(sceneText);
    const assets=context.materials.map(item=>({id:item.assetID,title:item.title,kind:item.kind,physicalWidthMM:item.physicalWidthMM,physicalHeightMM:item.physicalHeightMM,supply:{quantity:item.quantity??1}}));
    importEditableWork(sceneText,assets,{trustedSource:context.source});
    Object.assign(report,{structure:'passed',physical:'current-rules-passed',taskId:context.source.bundleId,taskHash:context.source.taskHash??null,sceneHash:await sceneFingerprint(scene)});
    if(process.argv[2]==='pack'){
      const manifest={version:1,taskId:context.source.bundleId,taskHash:context.source.taskHash??null,schemaHash:context.source.schemaHash??null,sceneHash:report.sceneHash,previewHash:null,rendererVersion:null,fontSetVersion:null,outputProfile:'editable-no-preview',visualReview:false};
      const contents={
        'project.shiyeproject.json':strToU8(sceneText),
        'manifest.json':strToU8(JSON.stringify(manifest,null,2)+'\n'),
        'validation-report.json':strToU8(JSON.stringify(report,null,2)+'\n')
      };
      mkdirSync('output',{recursive:true});
      writeFileSync('output/作品.shiyeproject.zip',zipSync(contents,{level:6}));
    }
  }catch(error){report.issue=String(error?.message||error).slice(0,500);process.exitCode=1;}
  mkdirSync('output',{recursive:true});
  writeFileSync('output/validation-report.json',JSON.stringify(report,null,2)+'\n');
  process.stdout.write(`拾页验证：${report.structure==='passed'?'结构与现行物理规则通过；视觉、字体和阅读仍未核对':'失败：'+report.issue}\n`);
}
main().catch(error=>{process.stderr.write('无法写出验证报告：'+String(error?.message||error)+'\n');process.exitCode=1;});
