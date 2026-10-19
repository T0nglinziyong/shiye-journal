// CloudBase event function entry; the build script copies the explicit server
// dependency allowlist beside this file. There is no HTTP or hosting proxy.
const {randomUUID}=require('node:crypto');
exports.main=async(event,context)=>{
  try{return await (await import('./server/cloudbase/app.mjs')).main(event,context);}
  catch{
    const requestId=randomUUID();
    console.error(JSON.stringify({type:'shiye_api',requestId,route:'initialization',status:503,code:'INITIALIZATION_FAILED'}));
    return {version:1,status:503,requestId,body:{code:'INITIALIZATION_FAILED',error:'CloudBase 云函数初始化失败，请凭请求编号检查环境配置'}};
  }
};
