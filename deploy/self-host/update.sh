#!/usr/bin/env bash
# 在 4090 上从仓库快进更新。数据目录不在仓库内，不参与更新。
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ -n "$(git status --porcelain)" ]]; then
  printf '源码目录有未提交更改，请先检查 git status；本脚本不会覆盖。\n' >&2
  exit 1
fi
git pull --ff-only origin main
npm ci
npm test
npm run build
sudo systemctl restart shiye
printf '拾页已更新；请检查 systemctl status shiye 和 https://shiyejournal.vip/api/health\n'
