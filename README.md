# local-llm-bench

A small, self-contained benchmark for coding models that you run yourself behind
an OpenAI-compatible endpoint (llama.cpp `llama-server`, vLLM, LM Studio, Ollama's
`/v1`, or a hosted API). It was built to answer one practical question: on a
single 24 GB consumer GPU, which local model gets real coding work done, and how
fast?

The first results compare **Inkling 2 Mini** (26.4B looped MoE) with
**Qwen3.8-27B** on one RTX 3090. The full write-up is in [RESULTS.md](RESULTS.md).

## What it measures

| id | type | what the model has to do | graded by |
|---|---|---|---|
| t1 | single-shot bug fix | a weekday is computed from the UTC date instead of the user's local date; the fix must also hold across a DST change | hidden tests (DST, Americas evening cases) + visible suite |
| t2 | single-shot feature | extend a lenient JSON parser per a 5-point spec: prose around the JSON, trailing commas, smart quotes, truncated output, strings left untouched | hidden tests per spec point + visible suite |
| t3 | single-shot refactor | extract `validateReminder` to an exact contract while the existing tests keep passing | hidden contract tests + visible suite |
| agent | multi-step tool use | fix one failing test, implement "quiet hours" from a spec across two files, add tests; tools: `read_file`, `write_file`, `run_tests`, `bash` (max 30 turns) | hidden quiet-hours tests + the visible suite must be green |
| chat | multi-turn instruction following | two scripted 3-turn conversations (habit-coach persona, bakery support persona), 6 rules each | 37 automatic checks |
| speed | decode / prefill | three fixed prompts at temperature 0 (tok/s, draft acceptance, peak VRAM), `llama-bench` pp512/tg128, long-prompt (8K/21K) garbage probe | numbers |

The test project is a toy reminders service in TypeScript (`fixture/`), with
`node:test` and no dependencies. Pass means every visible and hidden test is
green. `harness/check-refs.sh` verifies that each start state fails its hidden
tests and that each reference solution (`harness/reference/`) passes them.

Every model gets the same prompts and the same `max_tokens`. Sampling is set on
the server, using each vendor's recommendation; the harness sends none, except
temperature 0 for the speed prompts.

## Configuration of the published run

- NVIDIA RTX 3090 24 GB (sm_86), driver 580; Intel i7-10700K, 64 GB DDR4; Ubuntu; CUDA 13.4
- llama.cpp `llama-server`, one model on the GPU at a time, `--parallel 1`, flash attention, all layers on the GPU
- Builds: mainline llama.cpp `e50c254a2` (needed for `inkling2_loop` support); Unsloth's fork `b12588-mix-c0c3de8` for DSpark
- Token budgets: 32K tokens per single-shot answer, 16K per agent turn, 4K per chat turn
- Context: 128K for both models. Qwen with q4_0 KV and MTP; Inkling with q8_0 KV, `-ub 128` and no vision projector. Inkling with DSpark runs at 64K (128K does not fit with the drafter)
- Thinking on for both models (their default); 1 run per coding/agent task, 2 runs of the chat test
- Exact server flags per model: [`servers/serve.sh`](servers/serve.sh)

## Results (summary)

Quality, one RTX 3090:

| task | Qwen3.8-27B (UD-Q4_K_XL, MTP) | Inkling 2 Mini (UD-Q4_K_XL) | Inkling 2 Mini + DSpark (fork, 64K) |
|---|---|---|---|
| t1 bug fix | pass | pass | pass |
| t2 JSON repair | fail (token limit) | fail (token limit) | fail (token limit) |
| t3 refactor | pass | pass | pass |
| agent | pass (10 turns) | pass (23 turns) | pass (23 turns) |
| **total** | **3/4** | **3/4** | **3/4** |
| chat checks (2 runs) | 74/74 | 74/74 | - |

Neither model solved t2 (JSON repair) within 32K tokens.

Token usage differs more than pass rates. Completion tokens per solved task,
Qwen against Inkling: t1 30.9K vs 24.2K, t3 (refactor) 23.8K vs 8.4K, agent
20.8K vs 23.7K.

Speed:

| model / setup | decode tok/s | notes |
|---|---|---|
| Qwen3.8-27B, without speculative decoding | 41.3 | llama-bench tg128; pp512 1515 |
| Inkling 2 Mini, without speculative decoding | 59.0 | llama-bench tg128; pp512 1340 |
| Qwen3.8-27B + MTP, mainline | **86.7** | mean of three chat prompts; MTP acceptance 71% |
| Inkling 2 Mini, mainline | 56.8 | mean of three chat prompts; NVFP4 experts, Ampere has no FP4 hardware path |
| Inkling 2 Mini, Unsloth fork, no drafter | 55.7 | chat prompts, 64K context |
| Inkling 2 Mini, Unsloth fork + DSpark | 66.4 | chat prompts, 64K context; acceptance 36-70%; 128K no longer fits in 24 GB |

Full tables (per task, VRAM, context limits, NaN checks, DSpark details) are in
[RESULTS.md](RESULTS.md). Raw JSON is in [results/](results/README.md).

## Caveats

- **One GPU, one quant per model.** All numbers come from a single RTX 3090.
  Inkling's UD quant keeps its experts in NVFP4, which Ampere cannot accelerate;
  Blackwell or a non-NVFP4 quant could change its speed a lot.
- **Small N.** 1 run per coding/agent task (2 for chat). One pass more or less
  moves the totals a lot. Treat this as a field report, not a leaderboard.
- **Token budgets drive pass rates.** Both models think by default, and both used
  the full 32K on t2. Report the budget whenever you quote a pass rate.
- **The chat test is too easy.** Both models met all 74 checks, so it does not
  separate them. It needs harder multi-constraint conversations.
- **Configurations differ where the hardware forced it.** KV cache type differs
  per model (Qwen q4_0, Inkling q8_0), DSpark runs at 64K instead of 128K, and
  sampling follows each vendor's recommendation. See RESULTS.md.
- **The agent's `bash` tool is only fenced** by a working directory, a 30 s
  timeout and a small deny-list. Run the agent task in a throwaway VM or container.
- llama.cpp moves fast. Inkling support was days old when this ran.

## How to run it against any OpenAI-compatible endpoint

Requirements: Node.js 22.18 or newer (TypeScript runs through type stripping) and
nothing else; there is no `npm install`.

```bash
git clone <this repo> && cd local-llm-bench
bash harness/check-refs.sh                     # sanity check of fixtures and hidden tests

# 1. Start a server. For llama.cpp, with the published flags:
LLAMA_SERVER=/path/to/llama-server MODEL_DIR=/path/to/models PORT=8080 servers/serve.sh qwen3.8-27b
#    Or use any other OpenAI-compatible server or hosted API.

# 2. Point the harness at it. BASE is the server root (a trailing /v1 is fine).
export BASE=http://127.0.0.1:8080             # API_KEY=... for hosted endpoints

# 3. Quality. <model> is the model id the server expects; it also names the result folder.
#    The defaults are the published budgets (32K per answer, 16K per agent turn).
TASKS="t1 t2 t3 agent" harness/run-arm.sh qwen3.8-27b 1
TASKS=chat harness/run-arm.sh qwen3.8-27b 2

# 4. Speed (uses llama-server's .timings; other servers report wall time only)
node harness/speed.mjs qwen3.8-27b mylabel
node harness/longprompt.mjs mylabel
harness/llama-bench.sh mylabel qwen3.8-27b /path/to/model.gguf -ctk q4_0 -ctv q4_0 -ub 512

# 5. Tables
node harness/summarize-quality.mjs
node harness/summarize-speed.mjs mylabel
```

Published Inkling runs: `servers/serve.sh inkling2-mini` (128K) for t1-t3 and
the agent task; `CTX=32768 servers/serve.sh inkling2-mini` (f16 KV plus vision
projector) for the chat test and the speed prompts. DSpark: start
`servers/serve.sh inkling2-mini-dspark` on Unsloth's fork, then run
`TAG=dspark TASKS="t1 t2 t3 agent" harness/run-arm.sh inkling2-mini 1`.

Single tasks: `node harness/coding.mjs <model> t1 1`, `node harness/agent.mjs <model> 1`,
`node harness/chatconv.mjs <model> 1`. Results go to `results/quality/<model>[-TAG]/`;
model outputs and agent transcripts go to `runs/` (git-ignored).

Environment variables: `BASE`, `API_KEY`, `TAG`, `CODING_MAX` (default 32768),
`AGENT_MAX` (default 16384), `TASKS`, `PRE_HOOK` (a command run before the run,
e.g. to free GPU memory), `REQUEST_TIMEOUT_MS` (default 30 min), `NO_SMI=1`
(skip nvidia-smi sampling), `BENCH_ROOT`.

Notes:

- Long thinking answers take minutes. The client uses node:http with a 30 min
  timeout per request, because `fetch` gives up after 300 s without response headers.
- Run one request at a time against a single-slot server. The speed numbers assume
  nothing else is using the GPU.
- To add a model: add a case to `servers/serve.sh` (or start your server any
  way you like), then run the tasks with its model id.

## Layout

- `fixture/`: start repo for t1-t3. `fixture-agent/`: start repo for the agent task (generated by `harness/make-variants.mjs`).
- `harness/hidden/`: hidden tests, copied in only for grading. `harness/reference/`: reference solutions.
- `harness/*.mjs`: task runners, speed probes and summarizers. `harness/run-arm.sh`, `harness/llama-bench.sh`, `harness/check-refs.sh`.
- `servers/serve.sh`: llama-server flags for every published configuration.
- `results/`: raw JSON for every published number (see `results/README.md`).

## License

MIT, see [LICENSE](LICENSE). Model weights are not included and keep their own licenses.
