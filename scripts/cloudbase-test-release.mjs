import {createHash, createHmac} from 'node:crypto';

export const TEST_ENV = 'shiye-pg-test-d1gg723f7fb356ccc';
export const TEST_APP = 'shiye-journal-test';
export const TEST_REPO = 'https://github.com/T0nglinziyong/shiye-journal.git';
export const TEST_URL = 'https://shiye-journal-test-shiye-pg-test-d1gg723f7fb356ccc.webapps.tcloudbase.com';
const HOST = 'tcb.tencentcloudapi.com';
const VERSION = '2018-06-08';
const RELEASE_KEYS = new Set(['Framework', 'NodeJsVersion', 'AppPath', 'BuildPath', 'StaticCmd', 'StaticEnv']);

const sha256 = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function signCloudbaseRequest(action, body, secretId, secretKey, timestamp = Math.floor(Date.now() / 1000)) {
  const payload = JSON.stringify(body);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const scope = `${date}/tcb/tc3_request`;
  const canonical = `POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:${HOST}\n\ncontent-type;host\n${sha256(payload)}`;
  const toSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${sha256(canonical)}`;
  const key = hmac(hmac(hmac(`TC3${secretKey}`, date), 'tcb'), 'tc3_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return {payload, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Host': HOST,
    'X-TC-Action': action,
    'X-TC-Version': VERSION,
    'X-TC-Timestamp': String(timestamp),
    'Authorization': `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`,
  }};
}

export function makeReleaseRequest(version, sha) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Expected the full test branch SHA.');
  if (version.Status !== 'SUCCESS' || !version.StaticConfig) throw new Error('Latest CloudBase version is not a successful static app.');
  const current = version.StaticConfig;
  if (current.AppPath !== '/' || current.CodeSource !== 'github' || current.CodeBranch !== 'test') {
    throw new Error('Existing app path or GitHub source differs from the reviewed test deployment.');
  }
  const repo = String(current.CodeRepo || '').replace(/^https:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  if (repo !== 'T0nglinziyong/shiye-journal') throw new Error('Unexpected source repository.');
  const config = Object.fromEntries(Object.entries(current).filter(([key]) => RELEASE_KEYS.has(key)));
  if (!['', '.', './', './dist', 'dist', undefined, null].includes(config.BuildPath)) throw new Error('Unexpected build path.');
  if (config.StaticCmd?.InstallCmd !== 'npm ci' || config.StaticCmd?.BuildCmd !== 'npm run build' ||
      config.StaticCmd?.DeployCmd !== 'tcb hosting deploy ./dist /') {
    throw new Error('Existing build commands differ from the reviewed deployment.');
  }
  const variables = config.StaticEnv?.Variables;
  if (!Array.isArray(variables)) throw new Error('Existing CloudBase build variables are unavailable.');
  const env = new Map(variables.map(item => [item.Key, item.Value]));
  for (const key of ['VITE_SHIYE_CLOUDBASE_ENV_ID', 'VITE_SHIYE_CLOUDBASE_PUBLISHABLE_KEY']) {
    if (!env.get(key)) throw new Error(`Required build variable ${key} is missing.`);
  }
  if (env.get('VITE_SHIYE_CLOUDBASE_ENV_ID') !== TEST_ENV) throw new Error('Build points at another CloudBase environment.');
  env.set('SHIYE_BUILD_SHA', sha);
  env.set('SHIYE_BUILD_BRANCH', 'test');
  config.StaticEnv = {Variables: [...env].map(([Key, Value]) => ({Key, Value}))};
  config.CodeSource = 'github';
  config.CodeRepo = current.CodeRepo;
  config.CodeBranch = 'test';
  return {
    EnvId: TEST_ENV, ServiceName: TEST_APP, DeployType: 'static-hosting', BuildType: 'GIT',
    StaticConfig: config,
    Source: {Type: 'git', Repo: TEST_REPO, Ref: sha, Channel: 'github', IsPrivate: true},
    ClientToken: `shiye-test-${sha}`,
  };
}

export async function releaseTest({sha, secretId, secretKey, fetchImpl = fetch, wait = sleep}) {
  secretId = secretId?.trim();
  secretKey = secretKey?.trim();
  if (!secretId || !secretKey) throw new Error('Missing scoped Tencent CAM deployment credentials.');
  if (/[^\x21-\x7e]/.test(secretId) || /[^\x21-\x7e]/.test(secretKey)) {
    throw new Error('Tencent CAM deployment credentials contain invalid characters.');
  }
  async function api(action, body) {
    const request = signCloudbaseRequest(action, body, secretId, secretKey);
    const response = await fetchImpl(`https://${HOST}/`, {method: 'POST', headers: request.headers, body: request.payload});
    const data = await response.json();
    if (!response.ok || data.Response?.Error) {
      const error = data.Response?.Error;
      throw new Error(`${action} failed: ${error?.Code || response.status} ${error?.Message || ''}`);
    }
    return data.Response;
  }
  const lookup = {EnvId: TEST_ENV, ServiceName: TEST_APP, DeployType: 'static-hosting'};
  const previous = await api('DescribeCloudAppVersion', lookup);
  const request = makeReleaseRequest(previous, sha);
  const created = await api('CreateCloudApp', request);
  if (!created.VersionName || !created.BuildId) throw new Error('CloudBase did not return a build identity.');
  console.log(`CloudBase build ${created.VersionName} started for ${sha}.`);
  for (let attempt = 0; attempt < 120; attempt++) {
    await wait(5000);
    const build = await api('DescribeCloudAppVersion', {...lookup, VersionName: created.VersionName});
    if (build.Status === 'FAILED' || build.Status === 'CANCELLED') throw new Error(`CloudBase build ${created.VersionName}: ${build.Status}`);
    if (build.Status !== 'SUCCESS') continue;
    for (let visible = 0; visible < 36; visible++) {
      const response = await fetchImpl(`${TEST_URL}/version.json?release=${sha}&attempt=${visible}`, {headers: {'Cache-Control': 'no-cache'}});
      if (response.ok) {
        const identity = await response.json();
        if (identity.commit === sha && identity.branch === 'test') {
          console.log(`CloudBase test site verified at ${sha}.`);
          return {versionName: created.VersionName, sha};
        }
      }
      await wait(5000);
    }
    throw new Error(`CloudBase build succeeded but the public test site did not serve ${sha}.`);
  }
  throw new Error(`CloudBase build ${created.VersionName} timed out.`);
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  releaseTest({sha: process.env.GITHUB_SHA, secretId: process.env.TCB_DEPLOY_SECRET_ID,
    secretKey: process.env.TCB_DEPLOY_SECRET_KEY}).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
