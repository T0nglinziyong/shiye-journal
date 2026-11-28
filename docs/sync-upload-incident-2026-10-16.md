# 导入后同步积压排查与修复

## 已确认的瓶颈

- 本机诊断在 09:04–09:15 UTC 显示待传从 73 项降到 62 项。正常元数据提交约 1–6 秒，多次提交等待 30 秒后超时；浏览器同步锁等待仅 2–3 毫秒。
- 对应 09:04–09:16 UTC 的云端日志有 71,892 条“此记录已由另一设备修改”，PostgREST 同时报告连接池获取超时。并非发生了同样数量的用户修改。
- v3 两个 RPC 把业务冲突抛为 `40001`，触发 PostgREST 14 的内部事务重试。客户端退避无法停止已经进入服务器的重试循环。
- 私有缓存的 outbox 比较签名未包含 attempt、nextAttemptAt、lastFailureClass，失败状态更新被当成无变化，重新读盘后退避与冲突状态丢失。

## 修改

- 两个 RPC 的业务冲突统一返回 `PT409`（HTTP 409）。保留鉴权、账号隔离、记录基线校验及原子提交，不覆盖冲突数据。
- 本机保存并比较完整重试状态，普通失败保留数据，独立记录继续提交。
- 客户端和安全诊断识别 `PT409`，回归测试禁止部署 SQL 再用 `40001` 表达业务冲突。
- 云端已应用同名迁移；真实数据库回滚事务验证冲突返回 `PT409`。修复后检查无活动同步请求，09:32:30–09:34 UTC 日志窗口无上述数据库错误。不能由此推断所有设备待传已清空。

## 后台传输边界

App 内切页不会停止同步。iOS 切后台或锁屏可能挂起 PWA，不能承诺关闭后持续上传；现有队列保存在 IndexedDB，重新打开、回前台、网络恢复时唤醒续传。诊断中一次隐藏页面后的请求直到约 5 分钟后回前台才报告超时，不能把这段时间全算为服务端处理耗时。

真正的系统级后台文件上传需原生应用的 background URLSession；service worker 不能绕过 iOS 的调度限制。此次不新增原生壳或伪后台保活。

参考：
- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
- https://developer.apple.com/documentation/foundation/downloading-files-in-the-background
- https://bugs.webkit.org/show_bug.cgi?id=182565
