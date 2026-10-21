# 创作包生成物的唯一来源

`src/generated/` 是构建缓存，不再提交仓库。四个模块由 scripts/build-offline-runtime.mjs（包含固定文档构建器）从真实源码生成；npm run dev、npm test、npm run build 的标准入口都会先执行构建。单独运行 node tests/某测试.js 前先运行 npm run pretest。

这样不会再出现：源码修复了，而网页创作包仍嵌入旧预编译脚本。创作 ZIP 仍然携带完整、独立可运行的 runtime/shiye.cjs，不要求最终创作者构建项目。

CI 继续执行原有真实浏览器回归，并通过 scripts/verify-offline-build.mjs 删除缓存、独立构建两次、比较全部生成物 SHA-256，缺文件或不确定输出会失败。它不是跳过生成一致性检查，而是以唯一源码的可复现构建代替手工维护第二份代码。

Craft browser regression 每次还从当前源码生成 examples/v3-unified 的 ZIP、真实 PNG、项目 JSON 与 manifest，作为该次提交的 CI artifact。仓库中的历史示例不可视为当前版本发布物，运行生成脚本或使用对应提交的 artifact。不会自动写回仓库，不需要 CI 写权限。
