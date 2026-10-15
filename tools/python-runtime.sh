#!/usr/bin/env bash
# Source this helper. Bash 3.2+, Python 3.10+, no PATH/profile changes.
# Select once and export the actual interpreter for every child launcher.
huatuo_try_python() {
  local selected
  selected="$("$@" -c 'import os,sys; sys.exit(1) if sys.version_info < (3,10) else None; print(os.path.abspath(sys.executable).replace(chr(92),"/"))' 2>/dev/null)" || return 1
  selected="${selected%$'\r'}"
  [[ "$selected" == /* || "$selected" =~ ^[A-Za-z]:[/\\] ]] || return 1
  [[ -x "$selected" ]] || return 1
  HT_PYTHON="$selected"
  export HT_PYTHON
}

huatuo_select_python() {
  local candidate prefix version
  local candidates=()
  if [[ -n "${HT_PYTHON:-}" ]]; then
    candidate="$HT_PYTHON"
    huatuo_try_python "$candidate" && return 0
    printf 'HT_PYTHON 無法執行或版本低於 Python 3.10：%s\n' "$candidate" >&2
    return 1
  fi
  if [[ -n "${CONDA_PREFIX:-}" ]]; then candidates+=("$CONDA_PREFIX/bin/python"); fi
  candidates+=(python3 python)
  # Stable absolute paths bypass an older Conda/MacPorts command of the same name.
  for prefix in /usr/local /opt/homebrew "${HOMEBREW_PREFIX:-/usr/local}"; do
    for version in 3.11 3.12 3.13 3.10 3.14 3.15; do
      candidates+=("$prefix/bin/python$version" "$prefix/opt/python@$version/bin/python$version")
    done
  done
  for version in 3.11 3.12 3.13 3.10 3.14 3.15; do
    candidates+=("python$version" "/opt/local/bin/python$version" "/Library/Frameworks/Python.framework/Versions/$version/bin/python$version")
  done
  for candidate in "${candidates[@]}"; do
    if command -v "$candidate" >/dev/null 2>&1 && huatuo_try_python "$candidate"; then return 0; fi
  done
  if command -v py >/dev/null 2>&1 && huatuo_try_python py -3; then return 0; fi
  printf '%s\n' '找不到可執行的 Python 3.10+。已略過舊版 Conda／PATH Python。' \
    '若已安裝 Homebrew Python 3.11，可執行：' \
    'HT_PYTHON=/usr/local/bin/python3.11 bash huatuo.sh start' >&2
  return 1
}

# Normal invocation permits setup scripts to continue after each Python command.
huatuo_python() {
  huatuo_select_python || return 1
  "$HT_PYTHON" "$@"
}

huatuo_exec_python() {
  huatuo_select_python || return 1
  exec "$HT_PYTHON" "$@"
}
