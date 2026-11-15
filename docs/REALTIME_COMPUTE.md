# 实时通知与本机计算

CloudBase 是身份、任务状态、图片和业务修订的唯一可信来源。EMQX 只传 `jobId` 或修订通知，不传图片、素材和账号数据。PWA 收到通知后仍从 CloudBase 读取增量；登录、MQTT 重连、网络恢复和返回前台时主动补同步。可见页面每五分钟做一次失联兜底核对。

## 主题与权限

EMQX Serverless 使用内置账号。`全部用户` 的 `#` 发布与订阅拒绝规则必须存在；用户规则优先于全局规则。

| 客户端账号 | 唯一允许的操作 |
| --- | --- |
| `shiye-gpu-4090` | 订阅 `shiye-job` |
| `shiye-user-<CloudBase user id>` | 仅订阅 `shiye/users/<CloudBase user id>/sync` |

云函数使用已配置的 HTTPS API Key 发布，PWA 不能发布 MQTT 主题。每个 PWA 用户使用独立随机 MQTT 密码，CloudBase 函数只向已登录账号返回其自己的凭据。切勿把这些凭据放在前端构建或仓库。Serverless 不支持通过 HTTP/JWT 动态认证，因此新增 CloudBase 用户时需同时新增一个 MQTT 账号及精确主题授权。

## 任务流程

1. PWA 完成 A4 透视矫正，保留横竖方向，将整页 PNG 上传至 `shiye-private/<user-id>/compute/<job-id>/input.png`。
2. `shiye_enqueue_compute_job_v1` 校验 CloudBase 身份、路径和输入对象，原子创建 `queued` 任务。同一用户的 `request_id` 是幂等键。
3. `/api/job-submit` 核验任务归属，只经 EMQX 发布 `jobId`。GPU 的 `shiye-compute-01` 订阅任务主题，断线重连和每 30 秒扫描队列。
4. GPU 通过受限服务端密钥调用 `shiye_claim_compute_job_v1` 原子领取，下载已矫正整页，运行预处理、SAM 2.1、候选合并，上传透明 PNG 与 `result.json`。
5. `shiye_finish_compute_job_v1` 原子确认结果后，GPU 调用 `/api/worker-notify`。云函数只向数据库记录的任务所属用户主题发布完成消息。客户端读取任务状态和结果对象；重复或丢失的通知不会改变数据库状态。

任务失败最多重试三次，间隔 30/90 秒；进程崩溃后的租约 15 分钟到期后重领。第三次租约到期会标记失败。客户端等待通知，同时以 30/60 秒退避查询任务状态；这是丢消息兜底。

## 速度与多图导入

导入一批照片时，当前照片完成矫正并提交 SAM 后，App 会在后台预识别下一张照片，保留其矫正图、候选 Mask 和素材预览；切换照片时先使用已完成的结果。只预取一张，避免手机同时持有整批高清 Mask。修改纸张四角或识别参数后重新计算该张。手动补框优先通过 CloudBase 私有存储的账号隔离复制复用已上传的矫正图，不再从手机重复上传整页。计算服务器和客户端都以最多四路并行传输独立结果 Mask。

在 RTX 4090 上，用一张 4096 × 2897 的矫正页测试 Small、均衡合并：24 点／一层裁剪的本机模型流程约 15.8 秒，得到 22 件；16 点／一层约 10.5 秒，得到 18 件；12 点／零层约 6.6 秒，得到 13 件。24 点／一层通过 CloudBase 排队、模型和并行结果上传，到数据库完成约 18.6 秒。手动框的本机模型流程约 3.6 秒。上述只是一张测试图的实测，件数和手机网络耗时随照片改变；降低采样和裁剪层数会增加漏检风险。

## 部署顺序

1. 备份并核验数据库，再应用 `deploy/cloudbase/009-compute-jobs.sql`。
2. 在 EMQX 配置上述账号和授权，先核验 `#` 拒绝兜底及跨账号订阅被拒绝。
3. 云函数环境设置 `SHIYE_CLOUDBASE_SERVICE_KEY`、`SHIYE_GPU_WORKER_TOKEN`、`SHIYE_EMQX_USER_CREDENTIALS_B64`，保留既有 EMQX HTTP API 变量。`SHIYE_EMQX_USER_CREDENTIALS_B64` 是 JSON 映射 `{userId:{username,password}}` 的 UTF-8 Base64。
4. 构建并部署 `shiye-api`，核对 `/api/realtime-notify` 仍可用。发布 PWA 的 `test` Git 构建并核对 `/version.json` 的准确提交。
5. 在计算机上将 `compute-server/shiye-compute.service` 安装为用户级 systemd 服务；机密配置放在 `~/.config/shiye-compute/worker.env`，权限 `0600`。SAM 代码和权重在 `SHIYE_SAM_ROOT`，不加入前端构建。
6. 用两个账号在不同设备分别验证任务完成、多端变更、跨账号 MQTT 订阅拒绝，以及断线重连补同步。实际 iOS Safari/Pencil 仍需真机验收。

`compute-server/run-rectified.mjs` 只接收已矫正 A4 图，按输入宽高验证横竖方向，不再识别纸角或运行传统 CV 候选发现。可选的亮度均衡、去噪和局部对比增强在 SAM 前作用于整页模型输入；透明素材仍从未处理的矫正图提取。SAM 提供候选和透明 Mask，`postprocess_results.py` 合并碎片；用户改框时转为 SAM 框提示分割。
