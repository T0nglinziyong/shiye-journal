// Never combine a long-lived key pair with an unrelated temporary session token.
export function cosCredentials(env){
  const explicit=!!(env.SHIYE_COS_SECRET_ID||env.SHIYE_COS_SECRET_KEY);
  const SecretId=explicit?env.SHIYE_COS_SECRET_ID:env.TENCENTCLOUD_SECRETID;
  const SecretKey=explicit?env.SHIYE_COS_SECRET_KEY:env.TENCENTCLOUD_SECRETKEY;
  const SecurityToken=explicit?env.SHIYE_COS_SESSION_TOKEN:env.TENCENTCLOUD_SESSIONTOKEN;
  if(!SecretId||!SecretKey)return null;
  return {SecretId,SecretKey,...(SecurityToken?{SecurityToken}:{})};
}
