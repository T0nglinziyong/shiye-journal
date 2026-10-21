# CloudBase 测试站自动发布

`test` 分支的 `Verify Shiye` push 检查成功后，`Deploy CloudBase test` 读取 **同一提交** 的 SHA，只更新现有云应用 `shiye-journal-test`。发布脚本复用该应用最近成功版本的安装、构建、路径和前端变量；CloudBase 返回成功后仍要看到公网 `/version.json` 的准确提交号，工作流才成功。CloudBase 云函数和 SQL 迁移不在这条自动发布流程内。

## 凭证

在腾讯云 CAM 新建专用于测试站发布的子账号，关闭控制台登录，只开编程访问。用自定义策略授予以下两个 `tcb` 操作，资源限定到 `shiye-pg-test-d1gg723f7fb356ccc`；不要使用 CloudBase 环境 `api_key`，因为它拥有数据流管理员权限，也不要授予 `tcb:*`、数据库、存储、函数或其他环境权限。

```json
{
  "version": "2.0",
  "statement": [{
    "effect": "allow",
    "action": [
      "tcb:DescribeCloudAppVersion",
      "tcb:CreateCloudApp"
    ],
    "resource": ["qcs::tcb::uin/100053335354:env/shiye-pg-test-d1gg723f7fb356ccc"]
  }]
}
```

这个资源字符串是 CAM 控制台接受并已保存的测试环境策略。腾讯云的 [环境隔离示例](https://cloud.tencent.com/document/product/876/47057) 与 [接口资源表](https://cloud.tencent.com/document/product/598/98174) 对地域及主账号字段的写法不一致；因此以实际 API 鉴权和完整发布验证为准，不能只凭策略保存成功就认定权限可用。此策略限制环境和 API，但 CAM 的资源粒度只有环境，不能进一步限制到单个云应用；发布脚本还会固定服务名、仓库、分支和 `/` 路径。将子账号的 SecretId/SecretKey 仅写入 GitHub 环境 `cloudbase-test` 的 `TCB_DEPLOY_SECRET_ID`、`TCB_DEPLOY_SECRET_KEY` Secret，不写入仓库、CloudBase 前端变量或日志。建议为该环境设置只允许 `test` 分支的部署规则；轮换时先更新 Secret，再禁用旧密钥。

## 触发和失败处理

- 只接受本仓库 `test` 的 push 验证成功事件；PR、`main` 和手动运行的验证不会发布。
- 部署时重新检出 `test`，只有它仍等于已验证 SHA 才继续。多次合并的发布按顺序串行执行；过时提交直接跳过。
- 从 CloudBase 上个成功版本读取配置，若仓库、分支、环境、构建命令、构建变量或部署路径不符，立即失败，不覆盖现有站。
- 构建失败或公网提交号不匹配，工作流失败并留下 CloudBase 版本名供排查。不要把 GitHub Actions 的绿色验证结果当成已上线。
- 第一次启用前，先检查 CAM 策略和环境 Secret，再用一条无功能改动的 `test` 合并做端到端验证；任何一步失败时保留已验证的上一个版本。

CloudBase API 参考：[创建云应用](https://cloud.tencent.com/document/api/876/135281)、[查询云应用版本](https://cloud.tencent.com/document/api/876/135276)、[CAM 授权粒度](https://cloud.tencent.com/document/product/598/98174)。
