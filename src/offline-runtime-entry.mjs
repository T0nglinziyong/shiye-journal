// Bundled into a standalone Node tool placed inside an exported task ZIP.
// It intentionally reads only fixed files in the current task directory and
// writes only output/validation-report.json. No account or network access.
import {readFileSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {zipSync,strToU8} from 'fflate';
import {importEditableWork,inspectEditableSource} from './offline-creation.js';
import {sceneFingerprint} from './offline-result-review.js';
import {renderOfflinePreviewSVG} from './offline-preview-svg.js';
import {sha256Hex} from './task-fingerprint.js';

async function main(){
  const report={version:1,validator:'shiye-current-contract',structure:'failed',physical:'not-run',visual:'unavailable',reading:'pending'};
  const mode=process.argv[2];
  if(mode==='pack')rmSync('output/作品.shiyeproject.zip',{force:true});
  if(mode==='pack'||mode==='preview')rmSync('output/构图预览.svg',{force:true});
  try{
    const context=JSON.parse(readFileSync('context.json','utf8'));
    const sceneText=readFileSync('project.shiyeproject.json','utf8');
    const scene=inspectEditableSource(sceneText);
    const assets=context.materials.map(item=>({id:item.assetID,title:item.title,kind:item.kind,physicalWidthMM:item.physicalWidthMM,physicalHeightMM:item.physicalHeightMM,supply:{quantity:item.quantity??1}}));
    const imported=importEditableWork(sceneText,assets,{trustedSource:context.source});
    Object.assign(report,{structure:'passed',physical:'current-rules-passed',taskId:context.source.bundleId,taskHash:context.source.taskHash??null,sceneHash:await sceneFingerprint(scene)});
    if(mode==='pack'||mode==='preview'){
      const previews=Object.fromEntries(context.materials.map(item=>{
        const file=item.preview;
        return [item.alias,file&&/^materials\/asset_[A-Za-z0-9_-]+\.png$|^materials\/m[1-9]\d*\.png$/.test(file)&&existsSync(file)?readFileSync(file):null];
      }));
      const preview=Buffer.from(renderOfflinePreviewSVG(imported.drafts[0],context.source,previews),'utf8');
      if(preview.byteLength>16_000_000)throw Error('构图预览超过 16 MB；请缩小任务包中的素材预览图后重新导出，不要修改作品实物尺寸');
      Object.assign(report,{visual:'approximate-preview',reading:'pending',previewNote:'构图预览并非拾页最终渲染；字体、文字换行和抠图细节待应用复核'});
      mkdirSync('output',{recursive:true});
      writeFileSync('output/构图预览.svg',preview);
      if(mode==='pack'){
      const manifest={version:1,taskId:context.source.bundleId,taskHash:context.source.taskHash??null,schemaHash:context.source.schemaHash??null,sceneHash:report.sceneHash,previewHash:`sha256:${await sha256Hex(preview)}`,rendererVersion:'shiye-composition-preview-v1',fontSetVersion:null,outputProfile:'editable-approximate-svg',visualReview:false};
      const contents={
        'project.shiyeproject.json':strToU8(sceneText),
        'preview.svg':preview,
        'manifest.json':strToU8(JSON.stringify(manifest,null,2)+'\n'),
        'validation-report.json':strToU8(JSON.stringify(report,null,2)+'\n')
      };
      writeFileSync('output/作品.shiyeproject.zip',zipSync(contents,{level:6}));
      }
    }
  }catch(error){report.issue=String(error?.message||error).slice(0,500);process.exitCode=1;}
  mkdirSync('output',{recursive:true});
  writeFileSync('output/validation-report.json',JSON.stringify(report,null,2)+'\n');
  process.stdout.write(`拾页验证：${report.structure==='passed'?'结构与现行物理规则通过；'+(report.visual==='approximate-preview'?'已生成构图预览，最终字体与阅读待拾页复核':'视觉、字体和阅读仍未核对'):'失败：'+report.issue}\n`);
}
main().catch(error=>{process.stderr.write('无法写出验证报告：'+String(error?.message||error)+'\n');process.exitCode=1;});
