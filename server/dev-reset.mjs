// Administrator-initiated development reset. Object paths are scoped to the
// authenticated owner's UUID prefix; built-in shared presets are never touched.
export function createDevReset({enabled=false,authenticate,cos,listLimit=80,resetRecords}){
  return async({method,authorization,confirm})=>{
    if(method!=='POST'||confirm!=='RESET_DEV_DATA')return {status:400,error:'需明确确认开发数据清理'};
    if(!enabled)return {status:403,error:'未在预览环境启用开发清理'};
    const token=/^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(authorization||'')?.[1];
    if(!token)return {status:401,error:'请先登录'};
    const user=await authenticate(token);
    if(!user?.id||!user.isAdmin)return {status:403,error:'仅测试管理员可清理开发数据'};
    const prefix=user.id+'/';
    // Always list the first slice and delete it. This avoids skipping files
    // because deletion invalidates pagination markers.
    const names=await cos.list(prefix,listLimit);
    if(!Array.isArray(names)||names.some(name=>typeof name!=='string'||!name.startsWith(prefix)))
      throw Error('COS 列举包含非本人对象；已停止清理');
    if(names.length){
      await cos.remove(names);
      return {status:200,deleted:names.length,more:true};
    }
    await resetRecords(token);
    return {status:200,deleted:0,more:false,reset:true};
  };
}
