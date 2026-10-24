import React from 'react';
export function AccountResetProgress({phase}){
  return <div role="status" aria-live="polite" className="account-reset-progress" style={{position:'fixed',inset:0,background:'rgba(12,16,24,.85)',display:'grid',placeItems:'center',zIndex:2147483647,padding:24,color:'#fff'}}>
    <div style={{maxWidth:480,background:'#222a36',borderRadius:16,padding:28}}><h2>正在重置账号</h2>
      <p data-phase>{phase}</p><small>云端资料清空后会进入新的存储目录；旧图片在后台逐批回收。</small>
      {phase.includes('请重新打开页面')?<p><button type="button" className="btn" onClick={()=>location.reload()}>重新打开并核对</button></p>:null}</div>
  </div>;
}
