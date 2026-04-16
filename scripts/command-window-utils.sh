#!/usr/bin/env bash

schedule_terminal_close() {
  if [[ "${TERM_PROGRAM:-}" == "Apple_Terminal" ]]; then
    nohup /bin/sh -c 'sleep 0.2; osascript -e '\''tell application "Terminal" to close front window'\'' >/dev/null 2>&1' >/dev/null 2>&1 &
  elif [[ "${TERM_PROGRAM:-}" == "iTerm.app" ]]; then
    nohup /bin/sh -c 'sleep 0.2; osascript -e '\''tell application "iTerm" to tell current window to close'\'' >/dev/null 2>&1' >/dev/null 2>&1 &
  fi
}

wait_for_key_and_close() {
  local message="${1:-流程已结束。按任意键关闭窗口。}"

  echo
  printf '%s' "$message"

  if [[ -t 0 ]]; then
    IFS= read -r -n 1 -s
  fi

  echo
  schedule_terminal_close
}
