#!/usr/bin/env bash
# llama-bench.sh <label> <model-name> <gguf> [extra llama-bench flags]
# pp512 / tg128, flash attention, all layers on the GPU, 3 repetitions -> results/llamabench-<label>-<model-name>.json
# Flags used for the published numbers (pass the model's production KV type):
#   qwen3.8-27b    -ctk q4_0 -ctv q4_0 -ub 512
#   inkling2-mini  (none)
set -u
LABEL=${1:?label}; NAME=${2:?model name}; F=${3:?gguf}; shift 3
B=${LLAMA_BENCH:-llama-bench}; OUT="$(cd "$(dirname "$0")/.." && pwd)/results"; mkdir -p "$OUT"
"$B" -m "$F" -ngl 99 -fa 1 -t 6 "$@" -p 512 -n 128 -r 3 -o json > "$OUT/llamabench-$LABEL-$NAME.json"
echo "llama-bench exit $?"
