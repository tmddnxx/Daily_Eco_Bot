#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.morning-briefing.bot"
PLIST_SRC="$PROJECT_DIR/launchd/$PLIST_NAME.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
NODE_PATH="$(which node)"

echo "📦 Morning Briefing 설치"
echo "  프로젝트: $PROJECT_DIR"
echo "  Node: $NODE_PATH"

# 빌드
echo "🔨 빌드 중..."
cd "$PROJECT_DIR" && npm run build

# logs 디렉토리 생성
mkdir -p "$PROJECT_DIR/logs"

# plist 생성 (경로 치환)
sed -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    -e "s|__NODE_PATH__|$NODE_PATH|g" \
    "$PLIST_SRC" > "$PLIST_DST"

# 등록
launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"

echo "✅ 설치 완료! 봇이 실행 중입니다."
echo "  상태 확인: ./scripts/status-launchd.sh"
