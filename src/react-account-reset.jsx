import React from 'react';
export function AccountResetProgress({phase}){
  return <div role="status" aria-live="polite" className="account-reset-progress" style={{position:'fixed',inset:0,background:'rgba(12,16,24,.85)',display:'grid',placeItems:'center',zIndex:2147483647,padding:24,color:'#fff'}}>
    <div style={{maxWidth:480,background:'#222a36',borderRadius:16,padding:28}}><h2>正在重置账号</h2>
      <p data-phase>{phase}</p><small>云端索引清空后即可进入新账户；旧 COS 图片由服务器独立清理。</small></div>
  </div>;
}
