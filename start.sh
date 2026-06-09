#!/usr/bin/env bash
set -euo pipefail

SCANNER="./mce-scanner"
CREDS="$HOME/.mce-scanner/creds.json"

# 确保 scanner 二进制存在，否则先构建
if [ ! -f "$SCANNER" ]; then
  echo "⚙️  构建 mce-scanner..."
  (cd scanner && go build -o "../mce-scanner" ./cmd/mce-scanner)
fi

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

# 后台执行一次扫描（拾取已有会话）
echo "🔍 启动 mce-scanner 扫描..."
"$SCANNER" &

# 若端口被占用，先终止旧进程
if lsof -ti:3001 &>/dev/null; then
  echo "⚠️  端口 3001 被占用，终止旧进程..."
  lsof -ti:3001 | xargs kill
  sleep 1
fi

# 前台启动 Console 开发服务器（Ctrl+C 退出）
echo "🌐 启动 Console → http://localhost:3001"
cd console && bun run dev
