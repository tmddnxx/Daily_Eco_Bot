#!/bin/bash
set -euo pipefail

PLIST_NAME="com.morning-briefing.bot"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

echo "🗑️ Morning Briefing 제거"

launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true
rm -f "$PLIST_DST"

echo "✅ 제거 완료"
