#!/bin/bash

PLIST_NAME="com.morning-briefing.bot"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "📊 Morning Briefing 상태"
echo "━━━━━━━━━━━━━━━━━━━━━"

# launchctl 상태
if launchctl print "gui/$(id -u)/$PLIST_NAME" &>/dev/null; then
    echo "✅ 서비스: 등록됨"
    PID=$(launchctl print "gui/$(id -u)/$PLIST_NAME" 2>/dev/null | grep "pid =" | awk '{print $3}')
    if [ -n "$PID" ] && [ "$PID" != "0" ]; then
        echo "🟢 프로세스: 실행 중 (PID: $PID)"
    else
        echo "🔴 프로세스: 중지됨"
    fi
else
    echo "❌ 서비스: 미등록"
fi

# 최근 로그
echo ""
echo "📋 최근 로그 (마지막 5줄):"
if [ -f "$PROJECT_DIR/logs/bot-stdout.log" ]; then
    tail -10 "$PROJECT_DIR/logs/bot-stdout.log"
else
    echo "  (로그 없음)"
fi
