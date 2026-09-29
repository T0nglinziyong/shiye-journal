# 4090 自托管（Ubuntu）

目标：`https://shiyejounery.top` → Caddy HTTPS → 本机 `127.0.0.1:4173` → PWA + API → `数据备份/实时数据`。这里使用的是用户给出的域名拼写；若注册记录实际不同，请同时修改 `Caddyfile` 和 `SHIYE_PUBLIC_ORIGIN`。

1. 确认机器能从公网被访问：有可用公网 IPv4/IPv6，域名的 A/AAAA 指向它，路由器将 TCP 80/443 转发至 Ubuntu，防火墙只开放 80/443。**不要**把 Node 的 4173 端口直接暴露到公网。若处于 CGNAT 或校园网无法映射端口，需另选可信的隧道或公网反向代理，届时访问路径与隐私边界会变化。
2. 安装 Node.js 20+、Git、Caddy。将项目放到实际桌面目录；如果目录名不是 `Desktop`，请修改服务模板中的绝对路径。运行 `npm ci && npm test && npm run build`。
3. `openssl rand -hex 32` 生成独立随机令牌。将 `shiye.env.example` 复制至 `/etc/shiye/shiye.env`，填入真实用户名、数据目录与令牌，并将文件权限设为 `0600`。令牌不要写进 Git、聊天记录或网页源码。
4. 按实际用户名和路径编辑 `shiye.service.example`，安装为 `/etc/systemd/system/shiye.service`，执行 `sudo systemctl daemon-reload && sudo systemctl enable --now shiye`。确保 `数据备份/实时数据` 由该用户可写。
5. 将 `Caddyfile` 安装到 Caddy 使用的位置，验证配置并重载 Caddy。Caddy 会在 DNS 和 80/443 正确可达时自动申请 HTTPS 证书。先用 `curl http://127.0.0.1:4173/api/health` 检查本机，再在手机蜂窝网络打开 `https://shiyejounery.top`，输入令牌；设置 → 数据与诊断应显示“唯一数据源 · 4090 服务器”。
6. 在旧 Vercel 网址先导出 `.shiyepwa` 完整备份，然后在新域名的设置中“从旧网址备份恢复”。**恢复会替换服务器中的当前数据**，先导出服务器备份。iPad Safari 的数据只能从那台 iPad 的旧网址导出，不能由服务器自动读取。
7. 更新：在已连接现有 Git 历史的源码目录运行 `bash deploy/self-host/update.sh`；脚本检测未提交更改、快进拉取、测试构建并重启服务，不删除数据目录。

服务器只监听 loopback；公开域名强制至少 32 字符令牌。前端来源与 API 同源，无需 CORS 配置。请定期备份整个 `数据备份/实时数据` 目录和可恢复的 `.shiyepwa`，并做好断电后自动启动与硬盘健康监测。当前实现面向个人使用，不应作为多用户公开服务。
