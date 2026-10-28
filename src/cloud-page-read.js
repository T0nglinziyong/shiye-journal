// A JSON record collection can exceed the proxy's response limit even when
// its row count is well below the database page limit. Keep page offsets
// stable within an attempt; retry the whole snapshot with smaller pages on a
// gateway 502 so no records are skipped or duplicated.
export async function readCloudPages(pageAt,{initialSize=500}={}){
  let pageSize=Math.max(1,Math.floor(initialSize));
  for(;;){
    const rows=[];
    try{
      const first=await pageAt(0,pageSize);rows.push(...first);
      if(first.length<pageSize)return rows;
      for(let offset=pageSize;;offset+=pageSize*2){
        const [left,right]=await Promise.all([
          pageAt(offset,pageSize),pageAt(offset+pageSize,pageSize)
        ]);
        rows.push(...left);
        if(left.length<pageSize)return rows;
        rows.push(...right);
        if(right.length<pageSize)return rows;
      }
    }catch(error){
      if(error?.status!==502||pageSize===1)throw error;
      pageSize=Math.max(1,Math.floor(pageSize/2));
    }
  }
}
