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
import {validateSceneExtensions} from '../src/scene-v2.js';
import {validateScenePhysical} from '../src/creative.js';

const digest=x=>createHash('sha256').update(x).digest('hex');
const sourceFields={items:'material',textBlocks:'text',primitives:'shape',strokes:'ink'};
const sourceNames=Object.keys(sourceFields);
const uniqueID=(id,seed)=>typeof id==='string'&&id.length?id:'migrated-'+digest(seed).slice(0,20);
const isRecord=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const requireValid=(cond,why)=>{if(!cond)throw Error(why);};

export function migrateLegacyDraft(input,{projectID='unknown',assets=null}={}){
 requireValid(isRecord(input)&&isRecord(input.canvas),'旧版 Draft 画布数据缺失');
 if(input.sceneVersion===2){
  requireValid(Array.isArray(input.layers),'Scene v2 缺少 layers');
  const clone=structuredClone(input);validateSceneExtensions(clone);return clone;
 }
 requireValid(!Object.hasOwn(input,'layers'),'旧版 Draft 同时包含无法判定的 layers');
 requireValid(sourceNames.every(f=>Array.isArray(input[f])),'旧版 Draft 四类叶图层字段不完整，拒绝自动猜测');
 const out=structuredClone(input),draftID=out.id||'draft';
 const leaves=[],ids=new Set();
 for(const field of sourceNames){
  for(const [index,value] of input[field].entries()){
   requireValid(isRecord(value),'旧图层记录格式不合法');
   const node={...structuredClone(value),type:sourceFields[field],id:uniqueID(value.id,JSON.stringify([projectID,draftID,field,index,value]))};
   requireValid(!ids.has(node.id),'旧版图层 ID 重复，无法无损迁移：'+node.id);
   ids.add(node.id);
   if(field==='items'){
    requireValid(typeof node.assetID==='string'&&node.assetID,'实体素材缺少 assetID，拒绝迁移');
    // This is positional editor metadata, not a substitute for true source mm;
    // validation against the supplied real asset catalogue happens below.
    if(!node.generationBaseline)node.generationBaseline={x:node.x,y:node.y,width:node.width,height:node.height,rotation:node.rotation??0,zIndex:node.zIndex??0};
   }
   leaves.push(node);
  }
 }
 const metadata=Array.isArray(input.layerGroups)?input.layerGroups:[];
 const groups=new Map();
 for(const row of metadata){
  requireValid(isRecord(row)&&typeof row.id==='string'&&row.id,'旧版图层组合 ID 无效');
  requireValid(!ids.has(row.id)&&!groups.has(row.id),'旧版图层组 ID 重复');
  groups.set(row.id,{id:row.id,type:'group',name:typeof row.name==='string'?row.name:'手帐组合',opacity:1,blendMode:'normal',zIndex:0,children:[]});
 }
 // Do not manufacture a physical group for an orphaned legacy tag. The
 // invisible stale tag is dropped; the actual leaf and its geometry remain.
 const output=[];
 for(const node of leaves){
  const parent=groups.get(node.creativeGroupID);
  if(parent)parent.children.push(node);else{delete node.creativeGroupID;output.push(node);}
 }
 for(const group of groups.values())if(group.children.length){
  group.children.sort((a,b)=>(a.zIndex??0)-(b.zIndex??0));
  group.zIndex=group.children[0].zIndex??0;
  output.push(group);
 }
 output.sort((a,b)=>(a.zIndex??0)-(b.zIndex??0));
 for(const field of [...sourceNames,'layerGroups'])delete out[field];
 out.sceneVersion=2;out.layers=output;
 validateSceneExtensions(out);
 if(Array.isArray(assets))validateScenePhysical(out,assets);
 return out;
}

export function migrateLegacyProject(p,{assets=null}={}){
 requireValid(isRecord(p)&&typeof p.id==='string'&&p.id&&Array.isArray(p.drafts)&&p.drafts.length,'旧版作品主体无效');
 requireValid(!p.isSnapshot,'图片快照不是可编辑作品，不应转成空白 Scene');
 const copy=structuredClone(p);
 copy.drafts=copy.drafts.map(d=>migrateLegacyDraft(d,{projectID:p.id,assets}));
 if(Array.isArray(copy.initialEditorSnapshot?.drafts))copy.initialEditorSnapshot.drafts=copy.initialEditorSnapshot.drafts.map(d=>migrateLegacyDraft(d,{projectID:p.id,assets}));
 if(isRecord(copy.draftHistorySnapshots))for(const [id,d] of Object.entries(copy.draftHistorySnapshots))copy.draftHistorySnapshots[id]=migrateLegacyDraft(d,{projectID:p.id,assets});
 if(Array.isArray(copy.manualArchives))for(const archive of copy.manualArchives)if(Array.isArray(archive.drafts))archive.drafts=archive.drafts.map(d=>migrateLegacyDraft(d,{projectID:p.id,assets}));
 for(const f of ['projectDocumentPath','projectDocumentEncoding','projectDocumentProvider','__cloudBaseRevision','__cloudSessionId'])delete copy[f];
 return copy;
}

export function migrateRecoveryExport(parsed,{assets=null}={}){
 const projects=parsed?.format==='shiye-legacy-project-recovery'&&Array.isArray(parsed.projects)?parsed.projects:
   Array.isArray(parsed)?parsed:[parsed];
 const migrated=[],rejected=[];
 for(const p of projects){
  try{migrated.push(migrateLegacyProject(p,{assets}));}
  catch(error){rejected.push({id:typeof p?.id==='string'?p.id:null,reason:String(error.message)});}
 }
 return {migrated,rejected};
}

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
