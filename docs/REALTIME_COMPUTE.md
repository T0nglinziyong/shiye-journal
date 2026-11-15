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

1. PWA 完成 A4 透视矫正，保留横竖方向。SAM 只上传长边 1024 像素的无损 PNG 至 `shiye-private/<user-id>/compute/<job-id>/input.png`；原始照片留在本机，确认保存所选素材时重新矫正并高清提取。
2. `shiye_enqueue_compute_job_v1` 校验 CloudBase 身份、路径和输入对象，原子创建 `queued` 任务。同一用户的 `request_id` 是幂等键。
3. `/api/job-submit` 核验任务归属，只经 EMQX 发布 `jobId`。GPU 的 `shiye-compute-01` 订阅任务主题，断线重连和每 30 秒扫描队列。
4. GPU 通过受限服务端密钥调用 `shiye_claim_compute_job_v1` 原子领取，下载已矫正整页。默认无预处理时由常驻 Python 服务运行 SAM 2.1 和候选合并，把透明 Mask 按位打包进单个 `result.json`；启用可选预处理时继续使用独立流水线和 PNG Mask。
5. `shiye_finish_compute_job_v1` 原子确认结果后，GPU 调用 `/api/worker-notify`。云函数只向数据库记录的任务所属用户主题发布完成消息。客户端读取任务状态和结果对象；重复或丢失的通知不会改变数据库状态。

任务失败最多重试三次，间隔 30/90 秒；进程崩溃后的租约 15 分钟到期后重领。第三次租约到期会标记失败。客户端等待通知；前 15 秒每 2 秒补查一次任务状态，之后对排队/运行任务分别以 10/15 秒补查，这是丢消息兜底。

## 速度与多图导入

导入一批照片时，当前照片提交 SAM 后，App 会在后台连续预识别其余照片，最多同时准备两张。后台用低清矫正图生成候选 Mask 和检查用缩略图；用户切到该张时可直接查看。批内所有结果暂存于对应照片，切换不会重新运行 SAM。确认整批保存时，仅从原始照片高清提取已选中的素材。修改纸张四角或识别参数后重新计算该张。手动补框优先通过 CloudBase 私有存储的账号隔离复制复用已上传的矫正图；SAM 不提供旋转框。常驻 SAM 进程处理可选的亮度均衡、去噪、局部对比增强，并缓存最近两张手动框图像的编码特征；旧独立进程是异常时的兜底。旧 PNG 结果的传输仍使用最多四路并行；新的按位打包结果只需一次上传和一次下载。合并候选时优先用 SAM 找到的共同底纸 Mask，包含图案之间的背景；未检测到底纸时采用围住所选区域的背景框。

在 RTX 4090 上，1024 × 724 的黑卡样张、Small、均衡合并的常驻模型热运行：24 点／一层约 2.2–2.5 秒、35 件，并找到两张共同底纸；16 点／一层约 1.2 秒、31 件；24 点／零层约 0.9 秒、28 件。手动框模型计算约 58 毫秒。两份 24 点任务同时在两个 GPU 进程运行用了 4.66 秒，没有比顺序运行更快，所以服务仍采用一个常驻进程。把 1024 PNG 改为 JPEG 虽可减少约 60–86% 字节，但候选从 35 件降至 30–34 件，因此保留无损输入。CloudBase 往返和客户端处理另计；手机端每张 2–3 秒仍无保证。

另将用户提供的五张照片按可见纸张四角近似校正到长边 1024 像素，Small 24 点／一层的本机热运行依次为 2.49、1.98、2.22、1.92、1.76 秒；候选数为 35、24、20、11、8。此组校正角点为人工近似，仅用于检验不同画面内容下的速度，不能据此宣称素材召回率或 App 矫正质量。

检查照片时可切换“候选框”和“彩色区域”。点选两个以上区域后，客户端在透明 Mask 上逐像素求并集；空洞与区域之间的空白保留，合并无需重新运行 SAM。素材提取继续使用原矫正图像的颜色。

## 部署顺序

1. 备份并核验数据库，再应用 `deploy/cloudbase/009-compute-jobs.sql`。
2. 在 EMQX 配置上述账号和授权，先核验 `#` 拒绝兜底及跨账号订阅被拒绝。
3. 云函数环境设置 `SHIYE_CLOUDBASE_SERVICE_KEY`、`SHIYE_GPU_WORKER_TOKEN`、`SHIYE_EMQX_USER_CREDENTIALS_B64`，保留既有 EMQX HTTP API 变量。`SHIYE_EMQX_USER_CREDENTIALS_B64` 是 JSON 映射 `{userId:{username,password}}` 的 UTF-8 Base64。
4. 构建并部署 `shiye-api`，核对 `/api/realtime-notify` 仍可用。发布 PWA 的 `test` Git 构建并核对 `/version.json` 的准确提交。
5. 在计算机上将 `compute-server/shiye-compute.service` 安装为用户级 systemd 服务；机密配置放在 `~/.config/shiye-compute/worker.env`，权限 `0600`。SAM 代码和权重在 `SHIYE_SAM_ROOT`，不加入前端构建。
6. 用两个账号在不同设备分别验证任务完成、多端变更、跨账号 MQTT 订阅拒绝，以及断线重连补同步。实际 iOS Safari/Pencil 仍需真机验收。

`compute-server/run-rectified.mjs` 只接收已矫正 A4 图，按输入宽高验证横竖方向，不再识别纸角或运行传统 CV 候选发现。可选的亮度均衡、去噪和局部对比增强在 SAM 前作用于整页模型输入；透明素材仍从未处理的矫正图提取。SAM 提供候选和透明 Mask，`postprocess_results.py` 合并碎片；用户改框时转为 SAM 框提示分割。
