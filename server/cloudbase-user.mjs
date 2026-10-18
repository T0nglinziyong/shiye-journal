const idPattern=/^[A-Za-z0-9_-]{1,64}$/;

export async function verifyCloudBaseUser(token,{envId,fetcher=fetch}={}){
  if(!envId||!idPattern.test(envId)||!token)return null;
  const origin=`https://${envId}.api.tcloudbasegateway.com`;
  const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
  const profile=await fetcher(`${origin}/auth/v1/user/me`,{
    headers,signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(profile.status===401||profile.status===403)return null;
  if(!profile.ok)throw Error('CloudBase authentication unavailable');
  const person=await profile.json();
  const userID=person?.sub||person?.user_id;
  if(!idPattern.test(userID||'')||person.status!=='ACTIVE')return null;
  const query=new URL(`${origin}/v1/rdb/rest/shiye_accounts`);
  query.searchParams.set('select','user_id,is_admin');
  query.searchParams.set('user_id',`eq.${userID}`);
  const account=await fetcher(query,{headers,signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(!account.ok)throw Error('CloudBase account lookup unavailable');
  const rows=await account.json();
  const row=Array.isArray(rows)?rows.find(item=>item.user_id===userID):null;
  if(!row)return null;
  const markerQuery=new URL(`${origin}/v1/rdb/rest/shiye_records`);
  markerQuery.searchParams.set('select','record');
  markerQuery.searchParams.set('user_id',`eq.${userID}`);
  markerQuery.searchParams.set('store','eq.meta');
  markerQuery.searchParams.set('id','eq.shiye-reset-barrier');
  const markerResponse=await fetcher(markerQuery,{headers,signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(!markerResponse.ok)throw Error('CloudBase reset marker unavailable');
  const markers=await markerResponse.json();
  return {userID,isAdmin:row.is_admin===true,resetId:markers?.[0]?.record?.resetId||null};
}
