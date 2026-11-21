# results/

Raw output behind every number in RESULTS.md. Nothing here was edited by hand, except that
absolute model paths in the llama-bench JSON were shortened to `models/...` and the `label`
field matches the file or folder name.

| path | what |
|---|---|
| `quality/qwen3.8-27b/`, `quality/inkling2-mini/` | t1-t3 and agent: 32K per answer, 16K per agent turn, 1 run; both models at 128K context (Qwen q4_0 KV, Inkling q8_0 KV, ub 128). Chat: 4K per turn, 2 runs |
| `quality/inkling2-mini-dspark/` | t1-t3 and agent with DSpark on Unsloth's fork, same budgets, 64K context, q8_0 KV, ub 256 |
| `speed-mainline-<model>.json` | three chat prompts on mainline llama.cpp e50c254a2 |
| `speed-dspark-c64k-q8-ub256-inkling2-mini.json`, `speed-nodspark-...` | the same prompts on the fork, with and without the drafter |
| `llamabench-mainline-<model>.json` | llama-bench pp512 / tg128, 3 repetitions, no speculative decoding |
| `longprompt-*.json` | 17 x 23 asked after 0 / 8K / 21K tokens of filler (NaN/garbage probe) |
| `inkling-vram-*.json`, `probe-*.json` | VRAM after load and peak for the Inkling context/KV configurations |
| `ppl-cuda.txt`, `ppl-cpu.txt` | llama-perplexity, 512-token chunks, CUDA vs CPU-only |
| `version-mainline.txt` | llama-server --version of the mainline build |

Each quality JSON has `pass`, `tests_pass`/`tests_fail`, `wall_ms`, `completion_tokens`,
`finish` (or `stop` for the agent), and for single-shot tasks `predicted_per_second`.
