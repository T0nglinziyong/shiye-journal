// Immutable account objects use CloudBase PostgreSQL cloud storage.
export const SHIYE_STORAGE_BUCKET='shiye-private';

export function createCloudBaseStorage({storage,bucketId=SHIYE_STORAGE_BUCKET,enabled=true}){
  const bucket=()=>storage().from(bucketId);
  let report=()=>{};
  const run=async(action,work)=>{
    const started=Date.now();
    try{const result=await work();report({action,kind:'image',durationMs:Date.now()-started});return result;}
    catch(error){report({action:action+'-failed',kind:'image',durationMs:Date.now()-started,error});throw error;}
  };
  const unwrap=(result,operation)=>{
    if(result?.error)throw Object.assign(Error('CloudBase 云存储'+operation+'失败：'+result.error.message),{
      status:Number(result.error.statusCode||result.error.status||0)||undefined,
      code:result.error.code,cause:result.error
    });
    return result?.data;
  };
  const exists=async path=>Boolean(unwrap(await bucket().exists(path),'核对'));
  return {enabled,provider:'cloudbase',defaultProvider:'cloudbase',setDiagnosticReporter:callback=>{report=typeof callback==='function'?callback:()=>{};},
    probe:path=>run('storage-probe',()=>exists(path)),
    download:path=>run('storage-get',async()=>{
      const data=unwrap(await bucket().download(path),'下载');
      if(!(data instanceof Blob)||!data.size)throw Error('CloudBase 云存储图片为空');
      return data;
    }),
    preview:(path,variant='preview480')=>run('storage-preview',async()=>{
      // PG Storage has no image transform. The committed 480px derivative is
      // used for cards; editing can request the immutable original.
      const target=variant==='preview480'?path+'-preview480.webp':path;
      let data;
      try{data=unwrap(await bucket().download(target),'预览');}
      catch(error){
        if(target===path||![404,400].includes(Number(error.status)))throw error;
        // An original can still be shown if an older client committed before
        // its optional derivative completed. The caller caches this result.
        data=unwrap(await bucket().download(path),'预览');
      }
      if(!(data instanceof Blob)||!data.size)throw Error('CloudBase 云存储预览为空');
      return data;
    }),
    upload:(path,blob,type=blob.type||'application/octet-stream')=>run('storage-put',async()=>{
      const result=await bucket().upload(path,blob,{contentType:type,upsert:false});
      if(result?.error){
        const status=Number(result.error.statusCode||result.error.status||0);
        // Immutable hash keys may already exist after a lost response. Verify
        // existence before treating a duplicate as a completed upload.
        if(status===409&&await exists(path))return;
        unwrap(result,'上传');
      }
    })
  };
}
