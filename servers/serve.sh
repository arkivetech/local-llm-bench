#!/usr/bin/env bash
# serve.sh <config> : start llama-server with the exact flags used for the published results.
#
# Environment (all optional):
#   LLAMA_SERVER  llama-server binary          (default: llama-server on PATH)
#   MODEL_DIR     directory holding the GGUFs  (default: ./models)
#   PORT          listen port                  (default: 8080)
#   HOST          listen address               (default: 127.0.0.1)
#   CTX           context size override for inkling2-mini configs (CTX=32768: f16 KV plus vision projector)
#
# Model files (Hugging Face repo -> file expected under MODEL_DIR):
#   qwen3.8-27b          unsloth/Qwen3.8-27B-GGUF          *UD-Q4_K_XL*.gguf
#   inkling2-mini        unsloth/Inkling-2-Mini-GGUF       Mainline_Support/Inkling-2-Mini-UD-Q4_K_XL.gguf_file
#                        (rename to .gguf; needs mainline llama.cpp e50c254a2 or newer for inkling2_loop)
#   inkling2-mini-dspark unsloth/Inkling-2-Mini-GGUF       root Inkling-2-Mini-UD-Q4_K_XL.gguf + dspark-Inkling-2-Mini-Q8_0.gguf
#                        (root "looped" layout; needs Unsloth's llama.cpp build b12588-mix-c0c3de8, see README)
#
# Every config: one slot, flash attention, all layers on the GPU, the model's
# recommended sampling set server-side (the harness does not send sampling params
# except temperature 0 in speed.mjs / longprompt.mjs).
set -euo pipefail
CFG=${1:?usage: serve.sh <qwen3.8-27b|inkling2-mini|inkling2-mini-dspark|inkling2-mini-fork>}
S=${LLAMA_SERVER:-llama-server}; L=${MODEL_DIR:-./models}
pick() { local f; f=$(ls $1 2>/dev/null | head -1); [ -n "$f" ] || { echo "no file matches $1" >&2; exit 1; }; echo "$f"; }
COMMON=(--host "${HOST:-127.0.0.1}" --port "${PORT:-8080}" --jinja --flash-attn on -ngl 99 --parallel 1 -t 6)
case "$CFG" in
  qwen3.8-27b)
    # 128K context, symmetric q4_0 KV (mixed/q8 KV fell back to CPU kernels on this hybrid), MTP speculative decoding.
    exec "$S" "${COMMON[@]}" -m "$(pick "$L/qwen3.8-27b/*UD-Q4_K_XL*.gguf")" --alias qwen3.8-27b \
      -c 131072 --cache-type-k q4_0 --cache-type-v q4_0 -ub 512 \
      --spec-type draft-mtp --spec-draft-n-max 3 \
      --temp 1.0 --top-p 0.95 --top-k 20 --min-p 0.0 ;;
  inkling2-mini)
    # Mainline llama.cpp, Mainline_Support layout. On 24 GB: 128K fits only with -ub 128, q8_0 KV and
    # no vision projector; CTX=32768 keeps f16 KV and adds the projector.
    C=${CTX:-131072}
    if [ "$C" -gt 32768 ]; then X=(-ub 128 --cache-type-k q8_0 --cache-type-v q8_0)
    else X=(--mmproj "$(pick "$L/inkling2-mini/mmproj*.gguf")"); fi
    exec "$S" "${COMMON[@]}" -m "$(pick "$L/inkling2-mini/*UD-Q4_K_XL*.gguf")" "${X[@]}" --alias inkling2-mini -c "$C" \
      --temp 1.0 --top-p 1.0 --top-k 0 --min-p 0.0 ;;
  inkling2-mini-dspark|inkling2-mini-fork)
    # Unsloth fork, root-layout GGUF. With the DSpark drafter 64K (q8_0 KV, ub 256, no vision) is the
    # largest context that fits 24 GB; 128K OOMs. inkling2-mini-fork = same server without the drafter (control).
    SPEC=()
    [ "$CFG" = inkling2-mini-dspark ] && SPEC=(--model-draft "$(pick "$L/inkling2-mini-root/dspark-Inkling-2-Mini-Q8_0.gguf")" \
      --spec-type draft-dspark --spec-draft-n-max 3 --n-gpu-layers-draft 99)
    exec "$S" "${COMMON[@]}" -m "$(pick "$L/inkling2-mini-root/Inkling-2-Mini-UD-Q4_K_XL.gguf")" "${SPEC[@]}" \
      --alias inkling2-mini -c "${CTX:-65536}" -ub 256 --cache-type-k q8_0 --cache-type-v q8_0 \
      --temp 1.0 --top-p 1.0 --top-k 0 --min-p 0.0 ;;
  *) echo "unknown config $CFG" >&2; exit 1 ;;
esac
