#!/bin/bash
# macOS：打印对话框自动确认。用法: ./auto-confirm-print.command [watch] [delay_ms]
set -euo pipefail
MODE="${1:-once}"
DELAY_MS="${2:-600}"
DELAY_SEC=$(echo "scale=3; $DELAY_MS/1000" | bc)

confirm_once() {
  sleep "$DELAY_SEC"
  osascript -e 'tell application "System Events" to key code 36' 2>/dev/null || true
}

if [[ "$MODE" == "watch" ]]; then
  echo "打印助手 Watch 模式。Ctrl+C 退出。需辅助功能权限。"
  while true; do
    if osascript -e 'tell application "System Events" to return (exists (window 1 of (first process whose frontmost is true)))' 2>/dev/null | grep -q true; then
      TITLE=$(osascript -e 'tell application "System Events" to get name of window 1 of (first process whose frontmost is true)' 2>/dev/null || echo "")
      if echo "$TITLE" | grep -qiE '打印|print'; then
        confirm_once
        sleep 0.8
      fi
    fi
    sleep 0.25
  done
else
  echo "单次确认，延迟 ${DELAY_MS}ms"
  confirm_once
  echo "完成"
fi
