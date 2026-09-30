const leaf=/^[a-f0-9]{64}(?:-preview360\.webp|-project\.json(?:\.gz)?(?:-preview\.webp)?)?$/;
export function createTicketHandler({ready,origin,authenticate,sign}){
  return async req=>{
    const fail=(status,error)=>({status,body:{error}});
    if(req.method!=='POST')return fail(405,'仅支持 POST');
    if(req.origin&&req.origin!==origin)return fail(403,'来源不允许');
    if(!ready)return fail(503,'COS 服务端授权尚未配置，原数据未迁移');
    const match=/^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(req.authorization||'');if(!match)return fail(401,'请先登录');
    try{
      const owner=await authenticate(match[1]);if(!owner)return fail(403,'账号无权访问');
      let body=req.body;if(typeof body==='string'){if(body.length>32768)return fail(413,'请求过大');try{body=JSON.parse(body);}catch{return fail(400,'请求无效');}}
      const rows=body?.objects;if(!Array.isArray(rows)||!rows.length||rows.length>24)return fail(400,'每批最多24个对象');
      const valid=rows.every(row=>row&&['GET','PUT'].includes(row.method)&&typeof row.path==='string'&&row.path.startsWith(owner+'/')&&leaf.test(row.path.slice(owner.length+1))&&(row.variant===undefined||row.variant==='preview360'&&row.method==='GET'&&/^[a-f0-9]{64}$/.test(row.path.slice(owner.length+1)))&&(row.method!=='PUT'||typeof row.type==='string'&&/^(image\/(png|jpeg|webp)|application\/(json|gzip|octet-stream))$/.test(row.type)));
      if(!valid)return fail(403,'对象路径或操作不允许');
      const tickets=await Promise.all(rows.map(async row=>{
        const headers=row.method==='PUT'?{'content-type':row.type,'x-cos-forbid-overwrite':'true'}:{};
        return {path:row.path,method:row.method,variant:row.variant,url:await sign({...row,headers}),headers};
      }));return {status:200,body:{tickets,expiresIn:60}};
    }catch{return fail(502,'COS 授权服务暂不可用；未切换数据源');}
  };
}
