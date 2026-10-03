# 多模态工艺完整源码验收

Run: https://github.com/T0nglinziyong/shiye-journal/actions/runs/37094557193
Input commit: d6c2fe72afd06387a2fd0d189513face96cac318
Node: v24.21.0
All 50 source updates were checked against prior and resulting SHA-256 values, applied before the tests, and the three portable runtimes were rebuilt. Workflow changes are committed separately by the authorized connector, not this contents-only CI identity.

Passed: npm run build; npm test; npm run test:ui; Python converter tests; git diff --check.

✔ OpenCV contours preserve candidate bounds, fill printed detail and reject page-sized components (5.398364ms)
✔ OpenCV local light balance is effective without changing source or alpha (194.343294ms)
✔ OpenCV detects actual paper corners and refuses a featureless full photograph (53.826357ms)
✔ shadow-only components are excluded while a colored object remains intact (2.023294ms)
ℹ tests 427
ℹ suites 0
ℹ pass 427
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 22378.460073

Real-browser workflow must separately verify the final PR tree. These unit/mocked-provider/Happy DOM tests are not real paid-GPT aesthetic or physical Safari/iPad acceptance.
No production database, private library image, credentials, domain or deployment configuration changed.

## 最终源码与独立浏览器复验

产品源码已经提交为 `878f28c7a678ff1cf245c0871e099634bde8d746`。`8b6fff850c82099fcd45d7e8dfb37f5c9bc5d725` 仅收拢浏览器工作流并删除临时集成工作流；没有扩大 CI 令牌权限或修改产品源码。

正常 PR 验证将独立运行 `Verify Shiye` 与 `Craft browser regression`。后者顺序运行基础工艺、菜单/缓存、多模态选区/两孔穿插/素材加工面板/重开/便携 Canvas 预览像素与场景哈希对照。结果必须以该次工作流的真实退出状态和合成截图为准，此段不预先声明浏览器通过。
