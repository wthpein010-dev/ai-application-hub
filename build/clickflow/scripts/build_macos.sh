#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/auto_clicker.py" ]; then
  PROJECT_ROOT="$SCRIPT_DIR"
else
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

if [ ! -f "$PROJECT_ROOT/auto_clicker.py" ]; then
  echo "无法确认 ClickFlow 项目根目录：$PROJECT_ROOT" >&2
  exit 1
fi

cd "$PROJECT_ROOT"
PYTHON_BIN="${PYTHON:-python3}"
VENV_PATH="$PROJECT_ROOT/.venv-build-macos"

if [ ! -x "$VENV_PATH/bin/python" ]; then
  "$PYTHON_BIN" -m venv "$VENV_PATH"
fi

BUILD_PYTHON="$VENV_PATH/bin/python"
"$BUILD_PYTHON" -m pip install --disable-pip-version-check -r requirements-build.txt
"$BUILD_PYTHON" -m py_compile \
  auto_clicker.py clickflow_input.py clickflow_core.py clickflow_theme.py
"$BUILD_PYTHON" -m unittest discover -s tests -v

rm -rf "$PROJECT_ROOT/build" "$PROJECT_ROOT/dist"
"$BUILD_PYTHON" -m PyInstaller --clean --noconfirm ClickFlow.spec

if [ ! -d "$PROJECT_ROOT/dist/ClickFlow.app" ]; then
  echo "构建结束但没有找到 dist/ClickFlow.app。" >&2
  exit 1
fi

echo "macOS 构建完成：$PROJECT_ROOT/dist/ClickFlow.app"
