// Run independent work with a small fixed resource budget while preserving
// input order. Wait for every started job on failure so callers can dispose
// canvases and object URLs without a late task recreating them afterward.
export async function boundedMap(items,limit,run){
  if(!Number.isInteger(limit)||limit<1)throw Error('并行任务数必须为正整数');
  const results=new Array(items.length);
  let cursor=0,failure;
  const workers=Array.from({length:Math.min(limit,items.length)},async()=>{
    while(cursor<items.length&&!failure){
      const index=cursor++;
      try{results[index]=await run(items[index],index);}
      catch(error){failure??=error;}
    }
  });
  await Promise.all(workers);
  if(failure)throw failure;
  return results;
}
