import * as defaultDB from './store.js';
import {textFont} from './editor-tools-model.js';

const MARKER='cece-samples-current';
function currentProjectRecord(project,index){
  const drafts=project.drafts.map(d=>structuredClone(d));
  const draftHistorySnapshots=Object.fromEntries(drafts.map(d=>[d.id,structuredClone(d)]));
  return {...project,drafts,activeDraftID:project.activeDraftID||drafts[0]?.id,editHistory:{undo:[],redo:[]},manualArchives:project.manualArchives||[],initialEditorSnapshot:{drafts:drafts.map(d=>structuredClone(d)),activeDraftID:project.activeDraftID||drafts[0]?.id},draftHistorySnapshots,coverStaticPath:`/cece/cece-reference-${index+1}.jpg`,coverBaselineUpdatedAt:project.updatedAt};
}

export async function seedBundledExamples({isProjectOpen=()=>false,db=defaultDB}={}){
  if(await db.get('meta',MARKER))return;
  // A slow overseas CDN must not hold the first usable screen indefinitely.
  // Failure leaves the seed marker unset so the next visit can retry safely.
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  let collection,deferred=false;
  try {
    const response=await fetch('/cece/collection.json',{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw Error('无法读取随 Swift 应用提供的样例清单');
    collection=await response.json();
  } finally {clearTimeout(timer);}
  if(collection.format!=='shiye-bundled-cece'||collection.version!==2)throw Error('样例版本不匹配');
  // Fit the actual artistic font, not an average glyph-width guess. Do not
  // reflow around stickers or change the source line's bounding rectangle.
  await document.fonts.load('12px "Ma Shan Zheng"');
  const measure=document.createElement('canvas').getContext('2d');
  for(const p of collection.projects)for(const d of p.drafts)for(const t of d.textBlocks){t.fontSize=t.height*.88;measure.font=textFont(t);const width=measure.measureText(t.content).width;if(width>t.width)t.fontSize*=t.width/width;}
  const existingAssets=new Set((await db.all('assets')).map(a=>a.id));
  const existingProjects=new Set((await db.all('projects')).map(p=>p.id));
  const assets=collection.assets.filter(a=>!existingAssets.has(a.id));
  const projects=collection.projects.filter(p=>!existingProjects.has(p.id)).map((p,i)=>currentProjectRecord(p,i));
  const series=await db.get('series',collection.series.id);
  await db.transaction(['assets','projects','series','meta'],tx=>{
    for(const asset of assets){const {sampleFile,...record}=asset;tx.objectStore('assets').put({...record,staticPath:'/cece/'+encodeURIComponent(sampleFile)});}
    for(const project of projects){if(isProjectOpen(project.id)){deferred=true;continue;}tx.objectStore('projects').put(project);}
    if(!series)tx.objectStore('series').put(collection.series);
    if(!deferred)tx.objectStore('meta').put({id:MARKER,createdAt:new Date().toISOString()});
  });
}
