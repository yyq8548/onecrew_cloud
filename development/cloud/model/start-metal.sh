#!/bin/sh
set -eu
test "$(uname -s)" = Darwin
test "$(uname -m)" = arm64
server=${1:?请提供已核验的 llama-server 绝对路径}
model=${2:?请提供已核验的 Qwen3 Q4_K_M 权重绝对路径}
size=${3:-4b}
case "$size" in
  4b) model_name=onecrew-qwen3-4b-q4; expected_file=Qwen3-4B-Q4_K_M.gguf ;;
  8b) model_name=onecrew-qwen3-8b-q4; expected_file=Qwen3-8B-Q4_K_M.gguf ;;
  *) exit 1 ;;
esac
case "$server" in /*) ;; *) exit 1 ;; esac
case "$model" in /*) ;; *) exit 1 ;; esac
test -x "$server"
test -f "$model"
test "$(basename "$model")" = "$expected_file"
exec "$server" --model "$model" --alias "$model_name" \
  --host 127.0.0.1 --port 8789 --ctx-size 8192 --parallel 1 --threads 6 \
  --device MTL0 --n-gpu-layers 99 --log-verbosity 4 --jinja \
  --chat-template-kwargs '{"enable_thinking":false}' --no-webui --no-slots
