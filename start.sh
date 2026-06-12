#!/usr/bin/env bash
set -euo pipefail

SCANNER="./mce-scanner"
CREDS="$HOME/.mce-scanner/creds.json"

# 每次都重新构建 scanner，确保代码变更生效
echo "⚙️  构建 mce-scanner..."
(cd scanner && go build -o "../mce-scanner" ./cmd/mce-scanner)

# 未登录则先交互登录（阻塞，直到登录成功）
if [ ! -f "$CREDS" ]; then
  echo "🔑 未检测到登录凭证，请先登录..."
  "$SCANNER" login
fi

# 确保 console 依赖已安装
if [ ! -d "console/node_modules" ]; then
  echo "📦 安装 console 依赖..."
  (cd console && bun install)
fi

# 后台启动持续扫描守护进程（启动即扫一次，之后按 MCE_SCAN_INTERVAL 周期增量扫描，默认 1 小时）
echo "🔍 启动 mce-scanner daemon..."
"$SCANNER" daemon &

# 若端口被占用，先终止旧进程
if lsof -ti:3001 &>/dev/null; then
  echo "⚠️  端口 3001 被占用，终止旧进程..."
  lsof -ti:3001 | xargs kill
  sleep 1
fi

# 前台启动 Console 开发服务器（Ctrl+C 退出）
echo "🌐 启动 Console → http://localhost:3001"
cd console && bun run dev
