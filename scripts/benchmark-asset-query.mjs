import {performance} from 'node:perf_hooks';
import {queryAssets} from '../src/asset-query.js';

// Repeatable synthetic CPU-only baseline. It excludes DOM, image decoding
// and network, so it is not a page-load or phone latency claim.
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const measure=(fn,assets)=>{
  const samples=[];
  for(let i=0;i<15;i++){
    const start=performance.now(),result=fn(assets,'纸片');
    if(!result.length)throw Error('合成查询无结果');
    samples.push(performance.now()-start);
  }
  return Math.round(median(samples.slice(3))*100)/100;
};
for(const count of [1000,5000,10000]){
  const assets=Array.from({length:count},(_,index)=>({id:String(index).padStart(6,'0'),
    title:`第 ${index} 张纸片`,tags:['日常','绿色'],styleTags:['手账'],contentTags:['花'],
    semanticTags:['春天'],palette:['#aabbcc'],kind:'sticker',role:'support',texture:'纸',
    createdAt:'2026-10-15T12:00:00Z'}));
  const medianMs=measure((rows,query)=>queryAssets(rows,{query}),assets);
  console.log(JSON.stringify({assets:count,medianMs}));
}
