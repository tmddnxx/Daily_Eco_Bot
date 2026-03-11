#!/bin/bash
set -euo pipefail

PLIST_NAME="com.morning-briefing.bot"

echo "🔄 Morning Briefing 재시작"

launchctl kickstart -k "gui/$(id -u)/$PLIST_NAME"

echo "✅ 재시작 완료"
