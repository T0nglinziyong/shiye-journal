import * as db from './store.js';

const MARKER='cece-samples-v3';

export async function seedBundledExamples({isProjectOpen=()=>false}={}){
  if(await db.get('meta',MARKER))return;
  // A slow overseas CDN must not hold the first usable screen indefinitely.
  // Failure leaves the seed marker unset so the next visit can retry safely.
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  let collection;
  try {
    const response=await fetch('/cece/collection.json',{signal:controller.signal});
    if(!response.ok)throw Error('无法读取随 Swift 应用提供的样例清单');
    collection=await response.json();
  } finally {clearTimeout(timer);}
  if(collection.format!=='shiye-bundled-cece'||collection.version!==2)throw Error('样例版本不匹配');
  const existingAssets=new Set((await db.all('assets')).map(a=>a.id));
  const existingProjects=new Set((await db.all('projects')).map(p=>p.id));
  const assets=collection.assets.filter(a=>!existingAssets.has(a.id));
  const projects=collection.projects.filter(p=>!existingProjects.has(p.id)).map(({sampleParagraphUpgrades,...p},i)=>({...p,coverStaticPath:`/cece/cece-reference-${i+1}.jpg`,coverBaselineUpdatedAt:p.updatedAt}));
  const upgraded=[];
  for(const sample of collection.projects.filter(p=>existingProjects.has(p.id))){
    if(isProjectOpen(sample.id))continue;
    const saved=await db.get('projects',sample.id);
    // Only refresh untouched bundled examples, never an edited user copy.
    if(saved?.updatedAt===sample.updatedAt&&saved?.createdAt===sample.createdAt&&saved?.drafts?.length===1&&!saved.manualArchives?.length&&!saved.editHistory?.undo?.length){
      const {sampleParagraphUpgrades,...replacement}=sample;upgraded.push(replacement);continue;
    }
    // Any edited copy belongs to the user; do not migrate individual paragraphs.
  }
  const series=await db.get('series',collection.series.id);
  await db.transaction(['assets','projects','series','meta'],tx=>{
    for(const asset of assets){const {sampleFile,...record}=asset;tx.objectStore('assets').put({...record,staticPath:'/cece/'+encodeURIComponent(sampleFile)});}
    for(const project of [...projects,...upgraded])if(!isProjectOpen(project.id))tx.objectStore('projects').put(project);
    if(!series)tx.objectStore('series').put(collection.series);
    tx.objectStore('meta').put({id:MARKER,createdAt:new Date().toISOString()});
  });
}
