#!/usr/bin/env bash
# run-arm.sh <model> [reps]: run the quality tasks against an OpenAI-compatible endpoint.
#
# Environment:
#   BASE        server root, default http://127.0.0.1:8080 (the harness appends /v1/chat/completions)
#   API_KEY     optional bearer token
#   TAG         suffix for the result folder: results/quality/<model>-<TAG>/
#   CODING_MAX  max_tokens per single-shot answer (default 32768)
#   AGENT_MAX   max_tokens per agent turn (default 16384)
#   TASKS       default "t1 t2 t3 agent chat"
#   PRE_HOOK    optional shell command run once before the first request (e.g. free GPU memory)
#
# Commands used for the published results (defaults for CODING_MAX and AGENT_MAX):
#   coding + agent: TASKS="t1 t2 t3 agent" run-arm.sh <model> 1
#   chat:           TASKS=chat run-arm.sh <model> 2
#   DSpark:         TAG=dspark TASKS="t1 t2 t3 agent" run-arm.sh inkling2-mini 1   (server: serve.sh inkling2-mini-dspark)
set -u
M=${1:?usage: run-arm.sh <model> [reps]}; REPS=${2:-1}
cd "$(dirname "$0")"
TASKS=${TASKS:-t1 t2 t3 agent chat}
[ -n "${PRE_HOOK:-}" ] && bash -c "$PRE_HOOK"
echo "== $(date) start $M reps=$REPS tasks=[$TASKS] tag=${TAG:-} base=${BASE:-http://127.0.0.1:8080}"
for i in $(seq 1 "$REPS"); do
  for t in $TASKS; do
    case $t in
      t1|t2|t3) node coding.mjs "$M" "$t" "$i" ;;
      agent) node agent.mjs "$M" "$i" ;;
      chat) node chatconv.mjs "$M" "$i" ;;
      *) echo "unknown task $t" >&2 ;;
    esac
  done
done
echo "== $(date) done $M"
