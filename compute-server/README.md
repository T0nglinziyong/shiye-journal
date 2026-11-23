# 计算服务

`worker.mjs` 是计算进程入口，负责接收任务；`job-lane-pool.mjs` 控制并发。纸张方向与分割服务及其策略、守护进程留在本目录。创作任务交给 [`creative-agent/runtime/`](../creative-agent/README.md)，不在这里维护第二份 Agent 流程。

`shiye-compute*.service` 和 `.timer` 是服务部署单元。部署及资源版本核对以根目录 `DEPLOYMENT.md` 和 `docs/CREATION_RESOURCES.md` 为准。
