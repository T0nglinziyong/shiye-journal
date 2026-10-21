import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeReleaseRequest, releaseTest, TEST_ENV} from '../scripts/cloudbase-test-release.mjs';

const sha = 'a'.repeat(40);
const current = {Status: 'SUCCESS', StaticConfig: {
  Framework: 'other', NodeJsVersion: '22', AppPath: '/', BuildPath: '',
  CodeSource: 'github', CodeRepo: 'T0nglinziyong/shiye-journal', CodeBranch: 'test',
  StaticCmd: {InstallCmd: 'npm ci', BuildCmd: 'npm run build', DeployCmd: 'tcb hosting deploy ./dist /'},
  StaticEnv: {Variables: [
    {Key: 'VITE_SHIYE_CLOUDBASE_ENV_ID', Value: TEST_ENV},
    {Key: 'VITE_SHIYE_CLOUDBASE_PUBLISHABLE_KEY', Value: 'public-key'},
    {Key: 'SHIYE_BUILD_SHA', Value: 'old'},
  ]},
  ZipFileUrl: 'should-not-copy',
}};

test('release reuses reviewed static config and pins exact source SHA', () => {
  const request = makeReleaseRequest(current, sha);
  assert.equal(request.Source.Ref, sha);
  assert.equal(request.Source.IsPrivate, true);
  assert.equal(request.StaticConfig.AppPath, '/');
  assert.equal(request.StaticConfig.StaticEnv.Variables.find(x => x.Key === 'SHIYE_BUILD_SHA').Value, sha);
  assert.equal(request.StaticConfig.ZipFileUrl, undefined);
  assert.equal(current.StaticConfig.StaticEnv.Variables[2].Value, 'old');
});

test('release stops when target or build config differs', () => {
  assert.throws(() => makeReleaseRequest({...current, StaticConfig: {...current.StaticConfig, AppPath: '/other'}}, sha));
  assert.throws(() => makeReleaseRequest({...current, StaticConfig: {...current.StaticConfig, CodeBranch: 'main'}}, sha));
  assert.throws(() => makeReleaseRequest({...current, StaticConfig: {...current.StaticConfig, CodeRepo: 'attacker/shiye-journal'}}, sha));
  assert.throws(() => makeReleaseRequest(current, 'short'));
});

test('release verifies live identity before reporting success', async () => {
  const actions = [];
  const fetchImpl = async (url, options) => {
    if (url.includes('version.json')) return {ok: true, json: async () => ({commit: sha, branch: 'test'})};
    const action = options.headers['X-TC-Action'];
    actions.push(action);
    if (action === 'CreateCloudApp') {
      const body = JSON.parse(options.body);
      assert.equal(body.Source.Ref, sha);
      return {ok: true, json: async () => ({Response: {VersionName: 'shiye-journal-test-025', BuildId: '25'}})};
    }
    return {ok: true, json: async () => ({Response: current})};
  };
  const result = await releaseTest({sha, secretId: 'test-id', secretKey: 'test-key', fetchImpl, wait: async () => {}});
  assert.equal(result.sha, sha);
  assert.deepEqual(actions, ['DescribeCloudAppVersion', 'CreateCloudApp', 'DescribeCloudAppVersion']);
});
