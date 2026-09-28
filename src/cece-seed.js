import * as db from './store.js';

const MARKER='cece-samples-v2';

export async function seedBundledExamples(){
  if(await db.get('meta',MARKER))return;
  const response=await fetch('/cece/collection.json');
  if(!response.ok)throw Error('无法读取随 Swift 应用提供的样例清单');
  const collection=await response.json();
  if(collection.format!=='shiye-bundled-cece'||collection.version!==2)throw Error('样例版本不匹配');
  const existingAssets=new Set((await db.all('assets')).map(a=>a.id));
  const existingProjects=new Set((await db.all('projects')).map(p=>p.id));
  const assets=collection.assets.filter(a=>!existingAssets.has(a.id));
  const projects=collection.projects.filter(p=>!existingProjects.has(p.id)).map(({sampleParagraphUpgrades,...p},i)=>({...p,coverStaticPath:`/cece/cece-reference-${i+1}.jpg`,coverBaselineUpdatedAt:p.updatedAt}));
  const upgraded=[];
  for(const sample of collection.projects.filter(p=>existingProjects.has(p.id))){
    const saved=await db.get('projects',sample.id);
    const blocks=saved?.drafts?.[0]?.textBlocks;
    if(!blocks)continue;
    let changed=false;
    for(const {sources,replacement} of sample.sampleParagraphUpgrades||[]){
      if(!sources.every(original=>blocks.some(block=>block.id===original.id&&block.content===original.content&&Math.abs(block.x-original.x)<.01&&Math.abs(block.y-original.y)<.01)))continue;
      const ids=new Set(sources.map(source=>source.id));
      saved.drafts[0].textBlocks= saved.drafts[0].textBlocks.filter(block=>!ids.has(block.id));
      saved.drafts[0].textBlocks.push(replacement);
      changed=true;
    }
    if(changed)upgraded.push(saved);
  }
  const series=await db.get('series',collection.series.id);
  await db.transaction(['assets','projects','series','meta'],tx=>{
    for(const asset of assets){const {sampleFile,...record}=asset;tx.objectStore('assets').put({...record,staticPath:'/cece/'+encodeURIComponent(sampleFile)});}
    for(const project of [...projects,...upgraded])tx.objectStore('projects').put(project);
    if(!series)tx.objectStore('series').put(collection.series);
    tx.objectStore('meta').put({id:MARKER,createdAt:new Date().toISOString()});
  });
}
