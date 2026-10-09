const leaf=/^[a-f0-9]{64}(?:-preview360\.webp|-project\.json(?:\.gz)?(?:-preview\.webp)?)?$/;
export function createTicketHandler({ready,origin,origins,authenticate,sign}){
  const allowed=origins||[origin].filter(Boolean);
  return async req=>{
    const fail=(status,error)=>({status,body:{error}});
    if(req.method!=='POST')return fail(405,'仅支持 POST');
    if(req.origin&&!allowed.includes(req.origin))return fail(403,'来源不允许');
    if(!ready)return fail(503,'COS 服务端授权尚未配置，原数据未迁移');
    const match=/^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(req.authorization||'');if(!match)return fail(401,'请先登录');
    try{
      const identity=await authenticate(match[1]);if(!identity)return fail(403,'账号无权访问');
      const owner=typeof identity==='string'?identity:identity.userID;
      const admin=typeof identity==='object'&&identity.isAdmin===true;
      if(typeof owner!=='string'||!owner)return fail(403,'账号无权访问');
      let body=req.body;if(typeof body==='string'){if(body.length>32768)return fail(413,'请求过大');try{body=JSON.parse(body);}catch{return fail(400,'请求无效');}}
      const rows=body?.objects;if(!Array.isArray(rows)||!rows.length||rows.length>24)return fail(400,'每批最多24个对象');
      const valid=rows.every(row=>{
        if(!row||!['GET','PUT'].includes(row.method)||typeof row.path!=='string')return false;
        // Shared source images are readable by authenticated accounts. Only
        // the administrator can publish an exact numbered JPEG source.
        if(/^journal-presets\/source\/(?:[1-9]|[1-6][0-9]|70)\.jpg$/.test(row.path))return row.variant===undefined&&(row.method==='GET'||admin&&row.method==='PUT'&&row.type==='image/jpeg');
        const slash=row.path.indexOf('/'),target=slash<0?'':row.path.slice(0,slash),name=row.path.slice(slash+1);
        if(!leaf.test(name)||!(target===owner||admin&&row.method==='GET'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target)))return false;
        return (row.variant===undefined||['preview360','preview720','preview1440','preview2160'].includes(row.variant)&&row.method==='GET'&&/^[a-f0-9]{64}$/.test(name))&&(row.method!=='PUT'||target===owner&&typeof row.type==='string'&&/^(image\/(png|jpeg|webp)|application\/(json|gzip|octet-stream))$/.test(row.type));
      });
      if(!valid)return fail(403,'对象路径或操作不允许');
      const tickets=await Promise.all(rows.map(async row=>{
        const headers=row.method==='PUT'?{'content-type':row.type,'x-cos-forbid-overwrite':'true'}:{};
        return {path:row.path,method:row.method,variant:row.variant,url:await sign({...row,headers}),headers};
      }));return {status:200,body:{tickets,expiresIn:60}};
    }catch{return fail(502,'COS 授权服务暂不可用；未切换数据源');}
  };
}
