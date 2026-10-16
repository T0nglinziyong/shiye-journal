import {browserHarness} from '../tests/browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost'].includes(new URL(url).hostname))
  throw Error('页面性能基线只在本机隔离站运行');
const viewport=/^(\d{3,4})x(\d{3,4})$/.exec(process.env.SHIYE_VIEWPORT||'');
const b=await browserHarness('shiye-page-performance',url,async({command})=>{
  if(viewport)await command('Emulation.setDeviceMetricsOverride',{
    width:Number(viewport[1]),height:Number(viewport[2]),deviceScaleFactor:2,mobile:true});
});
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
const percentile=(values,p)=>values.sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
const results=[];
try{
  await b.wait('.series-grid');
  await b.command('Performance.enable');
  let previousCount=0;
  for(const count of [1000,5000,10000]){
    await b.evaluate(`(async()=>{
      const request=indexedDB.open('shiye-pwa-full-v1');
      const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
      if(${previousCount}===0){
        const existing=await new Promise((resolve,reject)=>{
          const query=db.transaction('assets').objectStore('assets').count();
          query.onsuccess=()=>resolve(query.result);query.onerror=()=>reject(query.error);
        });
        if(existing!==0)throw Error('性能测试要求全新隔离浏览器资料，不会覆盖已有素材');
      }
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('assets','readwrite'),store=tx.objectStore('assets');
        for(let i=${previousCount};i<${count};i++)store.put({id:'perf-'+i,title:i===${count}-1?'尾页关键词${count}':'合成素材 '+i,
          kind:'paper',role:'support',staticPath:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E',physicalWidthMM:30,physicalHeightMM:40,
          tags:['基线'],reviewStatus:'ready',createdAt:'2026-10-16T00:00:00Z'});
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });db.close();
    })()`);
    previousCount=count;
    const coldAt=Date.now();await b.command('Page.reload');await b.wait('.swift-tabs');
    if(!await b.evaluate('!!document.querySelector(".asset-grid")')){
      await b.click('[data-route="library"]');
      if(!await b.evaluate('!!document.querySelector(".asset-grid")'))
        await b.click('.swift-tabs button:nth-child(2)');
      try{await b.wait('.asset-grid',10000);}catch(error){
        throw Error(error.message+' / '+JSON.stringify(await b.evaluate('({route:location.pathname,view:document.querySelector("#view")?.textContent.slice(0,500),errors:document.body.textContent.slice(0,1000)})')));
      }
    }
    const coldMs=Date.now()-coldAt;
    const query=await b.evaluate(`(async()=>{
      const input=document.querySelector('#search');
      if(!input)throw Error('素材搜索框缺失');
      const t=performance.now();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'尾页关键词${count}');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      for(let i=0;i<100;i++){
        await new Promise(requestAnimationFrame);
        if(document.body.textContent.includes('尾页关键词${count}')&&
          [...document.querySelectorAll('.asset-grid .card')].some(card=>card.textContent.includes('尾页关键词${count}')))
          return performance.now()-t;
      }
      throw Error('跨页搜索未显示尾页素材');
    })()`);
    await b.command('HeapProfiler.collectGarbage');
    const before=await b.command('Performance.getMetrics');
    const heapBefore=before.metrics.find(row=>row.name==='JSHeapUsedSize')?.value??null;
    const warm=[];let heapAfter50=null;
    for(let i=0;i<100;i++){
      warm.push(await b.evaluate(`(async()=>{
      const t=performance.now();document.querySelector('[data-route="works"]').click();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(!document.querySelector('.works-grid'))throw Error('作品页面未完成呈现');
      document.querySelector('[data-route="library"]').click();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(!document.querySelector('.asset-grid'))throw Error('素材页面未完成呈现');
      return performance.now()-t;
    })()`));
      if(i===49){await b.command('HeapProfiler.collectGarbage');
        const middle=await b.command('Performance.getMetrics');
        heapAfter50=middle.metrics.find(row=>row.name==='JSHeapUsedSize')?.value??null;}
    }
    await b.command('HeapProfiler.collectGarbage');
    const metrics=await b.command('Performance.getMetrics');
    const heap=metrics.metrics.find(row=>row.name==='JSHeapUsedSize')?.value??null;
    results.push({assets:count,coldMs,searchMs:Math.round(query),warmRoundTripMedianMs:Math.round(median(warm)),
      warmRoundTripP95Ms:Math.round(percentile(warm,.95)),heapBytesBefore:heapBefore,
      heapBytesAfter50:heapAfter50,heapBytesAfter100:heap,
      heapDeltaFirst50:heapAfter50-heapBefore,heapDeltaSecond50:heap-heapAfter50});
  }
  if(b.errors.length)throw Error('浏览器脚本错误：'+JSON.stringify(b.errors));
  console.log(JSON.stringify({engine:'Chromium',viewport:viewport?`${viewport[1]}x${viewport[2]}`:'default',
    build:process.env.SHIYE_BUILD||'local',results},null,2));
}finally{await b.close();}
