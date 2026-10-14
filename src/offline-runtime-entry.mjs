import {offlineBrowserSource} from './generated/offline-browser-source.js';
import {offlineBrowserPage} from './offline-browser-page.js';
import {craftSceneHash} from './craft-fingerprint.js';
import {buildMaterialLedger} from './material-ledger.js';
import {craftDiagnostic} from './craft-errors.js';
import {assetFromSourceSnapshot} from './material-anatomy.js';
// Bundled into a standalone Node tool placed inside an exported task ZIP.
// It intentionally reads only fixed files in the current task directory and
// writes only output/validation-report.json. No account or network access.
import {readFileSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {importEditableWork,inspectEditableSource} from './offline-creation.js';
import {sceneFingerprint} from './offline-result-review.js';
import {renderOfflinePreviewSVG} from './offline-preview-svg.js';

async function main(){
  const report={version:1,validator:'shiye-current-contract',structure:'failed',physical:'not-run',visual:'unavailable',reading:'pending'};
  const mode=process.argv[2];
  if(mode==='preview'){rmSync('output/构图预览.svg',{force:true});rmSync('output/画面预览.html',{force:true});}
  try{
    const context=JSON.parse(readFileSync('task/context.json','utf8'));
    const sceneText=readFileSync('project.shiyeproject.json','utf8');
    const scene=inspectEditableSource(sceneText);
    if(context?.format!=='shiye-gpt-creation-package'||context.version!==2||context.source?.taskBinding!=='local'||context.source?.packageLayout!=='compact')throw Error('任务包不是当前 compact 格式');
    const assets=context.source.sourceSnapshots.map(assetFromSourceSnapshot);
    const imported=importEditableWork(sceneText,assets,{trustedSource:context.source});
    Object.assign(report,{structure:'passed',physical:'current-rules-passed',taskId:context.source.bundleId,taskHash:context.source.taskHash??null,sceneHash:await sceneFingerprint(scene)});
    if(mode==='preview'){
      const previews=Object.fromEntries(context.materials.map(item=>{
        const file=item.preview;
        return [item.alias,file&&/^materials\/(?:asset_[A-Za-z0-9_-]+|m[1-9]\d*)\.(?:webp|png)$/.test(file)&&existsSync(file)?readFileSync(file):null];
      }));
      const preview=Buffer.from(renderOfflinePreviewSVG(imported.drafts[0],context.source,previews),'utf8');
      if(preview.byteLength>16_000_000)throw Error('构图预览超过 16 MB；请缩小任务包中的素材预览图后重新导出，不要修改作品实物尺寸');
      Object.assign(report,{visual:'approximate-preview',reading:'pending',previewNote:'中文字形保存在可编辑 JSON 中；SVG 预览依赖本机中文字体（Noto/PingFang/微软雅黑），若显示方框请安装中文字体后渲染；最终排版仍以拾页为准'});
      mkdirSync('output',{recursive:true});
      writeFileSync('output/构图预览.svg',preview);
      const browserPage=offlineBrowserPage(imported.drafts[0],context.source,previews,offlineBrowserSource);
      writeFileSync('output/画面预览.html',browserPage);
      report.compiledSceneHash=craftSceneHash(imported.drafts[0]);report.browserRenderer='shiye-canvas-v2';
      writeFileSync('output/material-ledger.json',JSON.stringify(buildMaterialLedger(imported.drafts[0],assets),null,2)+'\n');
    }
  }catch(error){report.structure='failed';report.issue=String(error?.message||error).slice(0,500);report.diagnostic=craftDiagnostic(error);process.exitCode=1;}
  mkdirSync('output',{recursive:true});
  writeFileSync('output/validation-report.json',JSON.stringify(report,null,2)+'\n');
  process.stdout.write(`拾页验证：${report.structure==='passed'?'结构与现行物理规则通过；'+(report.visual==='approximate-preview'?'已生成构图预览，最终字体与阅读待拾页复核':'视觉、字体和阅读仍未核对'):'失败：'+report.issue}\n`);
}
main().catch(error=>{process.stderr.write('无法写出验证报告：'+String(error?.message||error)+'\n');process.exitCode=1;});
