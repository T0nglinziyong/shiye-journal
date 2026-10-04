import * as defaultDB from './store.js';
import {textFont} from './editor-tools-model.js';

export const CURRENT_EXAMPLE_SOURCE='shiye-current-example-cece';
export const CURRENT_EXAMPLE_PROJECT_IDS=new Set(['cece-p1-project','cece-p2-project','cece-p3-project','cece-p4-project']);
export const CURRENT_EXAMPLE_SHAPES_URL='/builtin-examples/cece/shapes.json';
const COLLECTION_URL='/builtin-examples/cece/collection.json';
const MARKER='current-example-cece-v1';
export const isCurrentExampleProject=project=>CURRENT_EXAMPLE_PROJECT_IDS.has(project?.id);

function currentProjectRecord(project,index){
  const drafts=project.drafts.map(d=>structuredClone(d));
  const draftHistorySnapshots=Object.fromEntries(drafts.map(d=>[d.id,structuredClone(d)]));
  return {...project,sourceIdentifier:CURRENT_EXAMPLE_SOURCE,examplePresetID:'cece',drafts,activeDraftID:project.activeDraftID||drafts[0]?.id,editHistory:{undo:[],redo:[]},manualArchives:project.manualArchives||[],initialEditorSnapshot:{drafts:drafts.map(d=>structuredClone(d)),activeDraftID:project.activeDraftID||drafts[0]?.id},draftHistorySnapshots,coverStaticPath:`/builtin-examples/cece/cece-reference-${index+1}.jpg`,coverBaselineUpdatedAt:project.updatedAt};
}

export async function syncCurrentExamples({isProjectOpen=()=>false,database=defaultDB}={}){
  if(await database.get('meta',MARKER))return {changed:false};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  let collection,deferred=false;
  try{
    const response=await fetch(COLLECTION_URL,{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw Error('无法读取内置示例');
    collection=await response.json();
  }finally{clearTimeout(timer);}
  if(!collection||!Array.isArray(collection.assets)||!Array.isArray(collection.projects)||!collection.series)throw Error('内置示例数据无效');
  await document.fonts.load('12px "Ma Shan Zheng"');
  const measure=document.createElement('canvas').getContext('2d');
  for(const p of collection.projects)for(const d of p.drafts||[])for(const t of d.textBlocks||[]){t.fontSize=t.height*.88;measure.font=textFont(t);const width=measure.measureText(t.content).width;if(width>t.width)t.fontSize*=t.width/width;}
  const existingAssets=new Map((await database.all('assets')).map(asset=>[asset.id,asset]));
  const existingProjects=new Set((await database.all('projects')).map(project=>project.id));
  const assets=[];
  for(const source of collection.assets){
    const existing=existingAssets.get(source.id),{sampleFile,...base}=source;
    const canonical={...base,usageStatus:existing?.usageStatus==='used'?'used':'unused',sourceIdentifier:CURRENT_EXAMPLE_SOURCE,staticPath:'/builtin-examples/cece/'+encodeURIComponent(sampleFile)};
    if(!existing)assets.push(canonical);
    else if(existing.sourceIdentifier!==CURRENT_EXAMPLE_SOURCE||existing.staticPath!==canonical.staticPath||!['used','unused'].includes(existing.usageStatus))assets.push({...existing,sourceIdentifier:CURRENT_EXAMPLE_SOURCE,staticPath:canonical.staticPath,usageStatus:canonical.usageStatus});
  }
  const projects=collection.projects.map((project,index)=>[project,index]).filter(([project])=>!existingProjects.has(project.id)).map(([project,index])=>currentProjectRecord(project,index));
  const series=await database.get('series',collection.series.id);
  await database.transaction(['assets','projects','series','meta'],tx=>{
    for(const asset of assets)tx.objectStore('assets').put(asset);
    for(const project of projects){if(isProjectOpen(project.id)){deferred=true;continue;}tx.objectStore('projects').put(project);}
    if(!series)tx.objectStore('series').put(collection.series);
    if(!deferred)tx.objectStore('meta').put({id:MARKER,createdAt:new Date().toISOString()});
  });
  return {changed:!!(assets.length||projects.length||!series),assets:assets.length,projects:projects.length};
}
