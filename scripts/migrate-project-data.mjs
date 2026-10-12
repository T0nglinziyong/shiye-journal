#!/usr/bin/env node
/**
 * One-time, OFFLINE data conversion. Never imported by the web app.
 * Reads a backed-up pre-v2 project export and writes new editable Scene v2
 * documents; it does not contact Supabase/COS, delete records or overwrite a
 * destination. The app remains strict current-only Scene v2.
 */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {migrateLegacyDraft,migrateLegacyProject,migrateRecoveryExport} from '../src/data-migrations/scene-v1-to-v2.js';
export {migrateLegacyDraft,migrateLegacyProject,migrateRecoveryExport};

const digest=x=>createHash('sha256').update(x).digest('hex');
const requireValid=(valid,why)=>{if(!valid)throw Error(why);};

export async function migrateBackupFile(inputPath,outputDir,{assetsPath=null}={}){
 const source=await readFile(inputPath),parsed=JSON.parse(source.toString('utf8'));
 const assets=assetsPath?JSON.parse(await readFile(assetsPath,'utf8')):null;
 requireValid(assets===null||Array.isArray(assets),'--assets 必须是资产数组');
 const {migrated,rejected}=migrateRecoveryExport(parsed,{assets});
 await mkdir(outputDir,{recursive:true});
 const files=[];
 for(const project of migrated)for(const d of project.drafts){
  const doc={format:'shiye-scene',version:2,title:project.title||'旧版手帐迁移',scene:d};
  const content=JSON.stringify(doc)+'\n',filename=`${project.id.replace(/[^A-Za-z0-9_-]/g,'_')}-${d.id.replace(/[^A-Za-z0-9_-]/g,'_')}.shiye-scene.json`;
  const path=join(outputDir,filename);
  await writeFile(path,content,{flag:'wx'}); // never silently replace a previous migration
  files.push({projectID:project.id,draftID:d.id,file:filename,sha256:digest(content)});
 }
 const report={format:'shiye-v2-migration-report',version:1,sourceSha256:digest(source),createdAt:new Date().toISOString(),accepted:migrated.length,rejected,files,originalsRetained:true,
  caveat:assets===null?'未提供素材目录；实体尺寸和库存将在拾页导入时验证':'素材来源尺寸与库存已验证'};
 await writeFile(join(outputDir,'migration-report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 return report;
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 const args=process.argv.slice(2),value=flag=>{const p=args.indexOf(flag);return p>=0?args[p+1]:null;};
 const input=value('--input'),out=value('--output'),assets=value('--assets');
 if(!input||!out){console.error('Usage: node scripts/migrate-project-data.mjs --input legacy-backup.json --output new-folder [--assets asset-catalog.json]');process.exitCode=2;}
 else migrateBackupFile(resolve(input),resolve(out),{assetsPath:assets?resolve(assets):null}).then(report=>{
  console.log('迁移完成：'+report.accepted+' 件作品；失败 '+report.rejected.length+' 件。旧云端作品未修改。');
  if(report.rejected.length)process.exitCode=1;
 }).catch(error=>{console.error('迁移失败：'+error.message);process.exitCode=1;});
}
