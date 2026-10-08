// Read-only release provenance check. Never deploys, promotes or mutates data.
export function matchDeployment(row,{sha,branch}){
  return row?.state==='READY'
    &&row.meta?.githubCommitSha===sha
    &&row.meta?.githubCommitRef===branch
    &&row.meta?.githubOrg==='T0nglinziyong'
    &&row.meta?.githubRepo==='shiye-journal';
}
export async function verifyDeployment({token,projectId,branch,sha,fetcher=fetch}){
  if(!token||!projectId||!['main','test'].includes(branch)||!/^[0-9a-f]{40}$/.test(sha))throw Error('部署验证参数无效');
  const url=new URL('https://api.vercel.com/v6/deployments');
  url.searchParams.set('projectId',projectId);
  url.searchParams.set('limit','30');
  url.searchParams.set('branch',branch);
  const response=await fetcher(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('无法读取 Vercel 部署状态：HTTP '+response.status);
  const result=await response.json();
  const found=result.deployments?.find(d=>matchDeployment(d,{sha,branch}));
  if(!found||!found.url)throw Error('Vercel 没有此分支最新 SHA 的 READY 部署，不应宣布发布成功');
  return {sha,branch,url:'https://'+found.url,id:found.uid||found.id};
}
