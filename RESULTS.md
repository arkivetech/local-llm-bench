# Results: Inkling 2 Mini vs Qwen3.8-27B on one RTX 3090 (llama.cpp)

Run on 2026-11-21. Raw JSON for every number is in `results/` (see `results/README.md`). Everything below was measured on one machine with the harness
in this repo (`harness/`); numbers are small-N and should be read as a field report, not a
leaderboard.

## TL;DR

1. Inkling 2 Mini (26.4B looped MoE, 3.4B active) runs on a 24 GB RTX 3090 with
   mainline llama.cpp built from master after PR #32704 (`e50c254a2`, build 12621),
   the build needed for `inkling2_loop` support.
2. No NaN or garbage on the 3090 with all layers on the GPU: perplexity matches a
   CPU-only run, and 8K- and 21K-token prompts answer correctly. The open NaN bug
   (llama.cpp #32710) shows up in reports that offload experts to the CPU.
3. It is not faster than Qwen3.8-27B here in practice. Without speculative decoding
   Inkling decodes faster (llama-bench tg128 59.0 against 41.3 t/s), but Qwen with
   MTP reaches 86.7 tok/s in chat against 56.8 for Inkling. The UD quant keeps
   Inkling's experts in NVFP4, which Ampere has no FP4 hardware for, and mainline
   llama.cpp has no speculative decoding (DSpark) for Inkling yet.
4. With 32K tokens per answer, 16K per agent turn and 128K context, both models
   passed 3 of 4 tasks. Neither solved the JSON-repair spec task. Inkling used far
   fewer tokens on the refactor (8.4K against 23.8K) and fewer on the bug fix
   (24.2K against 30.9K); in the agent task it used a few more (23.7K against
   20.8K) and needed 23 turns against 10.
5. Both models met every check in the two multi-turn chat conversations, so this
   bench does not reproduce the vendor's caveat about multi-constraint chat.
6. DSpark on Unsloth's fork raises Inkling's chat speed by 19% (55.7 to 66.4 tok/s)
   with the same 3/4 result, but it needs 1.1 GB more VRAM, which cuts the context to 64K.

## Hardware and software

| item | value |
|---|---|
| GPU | NVIDIA GeForce RTX 3090 24 GB (sm_86), driver 580.178.04 |
| CPU / RAM | Intel i7-10700K (8C/16T), 64 GB DDR4 |
| OS | Ubuntu, CUDA toolkit 13.4 (nvcc), GNU 15.2 |
| Server | llama.cpp `llama-server`, one model on the GPU at a time, `--parallel 1`, flash attention on, `-ngl 99` |
| Mainline build | master `e50c254a2` (b12608 + 13 commits, build 12621), "version 1.0.0-dev". Needed for `inkling2_loop` support (PRs #32694 and #32704). No release tag contained #32704 at build time, and Unsloth's mainline files return gibberish without it. |
| DSpark build | Unsloth's fork `b12588-mix-c0c3de8` (see the DSpark section) |

## Configuration

| setting | Qwen3.8-27B | Inkling 2 Mini |
|---|---|---|
| quant | UD-Q4_K_XL | UD-Q4_K_XL (Mainline_Support layout, NVFP4 experts) |
| context | 128K | 128K |
| KV cache | q4_0 | q8_0, `-ub 128`, no vision projector |
| speculative decoding | MTP (`--spec-type draft-mtp --spec-draft-n-max 3`) | none on mainline |
| sampling (server-side, vendor recommendation) | temp 1.0, top-p 0.95, top-k 20 | temp 1.0, top-p 1.0, top-k 0, min-p 0 |
| thinking | on (default) | on (default) |

Token budgets: 32K tokens per single-shot answer, 16K per agent turn, 4K per chat
turn. 1 run per coding/agent task, 2 runs of the chat test. Exact flags:
`servers/serve.sh`.

## Speed

`llama-bench` uses pp512/tg128, `-fa 1`, the model's production KV type, 3 repetitions,
and no speculative decoding. The chat columns are three fixed prompts (temperature 0,
max 700 tokens) with the flags in `servers/serve.sh`, including MTP for Qwen. Peak
VRAM is the card total sampled every 250 ms, which includes about 0.7 GB used by the
desktop and an embedding server.

| model | pp512 t/s | tg128 t/s | chat P1 / P2 / P3 t/s | chat mean t/s | MTP accept | peak VRAM MiB |
|---|---|---|---|---|---|---|
| qwen3.8-27b (UD-Q4_K_XL, q4_0 KV, 128K, MTP) | 1515 | 41.3 | 90.7 / 79.3 / 90.2 | **86.7** | 71% | 21993 |
| inkling2-mini (UD-Q4_K_XL, 32K, f16 KV) | 1340 | 59.0 | 57.1 / 56.7 / 56.6 | 56.8 | - | 23263 |

Inkling's speed numbers were taken on the 32K server config (`CTX=32768`, f16 KV plus
vision projector); the 128K config decodes at about the same speed (see the table
below). Load time was about 6 s from the page cache for both models.

## Inkling 2 Mini: loading, correctness, VRAM

- **Files:** `unsloth/Inkling-2-Mini-GGUF` `Mainline_Support/Inkling-2-Mini-UD-Q4_K_XL.gguf_file`
  (17,629,760,736 bytes, renamed to .gguf) plus `mmproj-F16.gguf`. Both sha256 values match the
  Hugging Face LFS ids. The root-folder files use Unsloth's own looped layout and need
  Unsloth's llama.cpp fork. The Mainline_Support files load on mainline.
- **Quant layout:** expert FFNs are **NVFP4** and attention is Q8_0. The NVFP4 experts
  explain the speed: Ampere has no FP4 hardware path.
- **NaN check (#32710):** `llama-perplexity` on 8x512-token chunks with CUDA gave 4.40.
  The first four chunks with CUDA and CPU-only agree within 0.2%
  (2.8968/4.3298/4.4774/4.5439 against 2.8973/4.3354/4.4826/4.5505). A greedy
  "17 x 23" question after about 8.4K and 21K tokens of filler returned 391, and a
  short prompt asked afterwards was still correct. No repeated-token output was
  seen. All of this ran with every layer on the GPU; the issue reports involve
  `--cpu-moe` or `-ot ...exps=CPU`.

| config | loads? | VRAM after load / peak (MiB) | prompt t/s at ~8K / ~21K tokens | decode t/s (short / 8K / 21K) |
|---|---|---|---|---|
| 32K ctx, f16 KV, ub 512, + mmproj (`CTX=32768` in `servers/serve.sh`) | yes | 23177 / 23369 | 857 / 617 | 58.1 / 53.4 / 50.9 |
| 128K, f16 KV, ub 512 / 256 | **no** (compute buffer 12.9 / 6.4 GB OOM) | - | - | - |
| 128K, f16 KV, ub 128 | **no** (3.2 GB compute buffer OOM) | - | - | - |
| 128K, f16 KV, ub 64, no mmproj | yes, 0.3 GB headroom | 23749 / 23933 | 543 / 434 | 57.9 / 53.8 / 51.0 |
| 128K, **q8_0 KV, ub 128, no mmproj** (used for the coding and agent tasks) | yes | 23347 / 23533 | 624 / 483 | 56.3 / 52.4 / 49.4 |
| 64K, f16 KV, ub 512, + mmproj | no (6.5 GB compute OOM) | - | - | - |

## Quality tests

The test repo is a toy reminders/check-in service in TypeScript with `node:test`
and no dependencies, described in `README.md`. Hidden tests decide pass or fail.
Each reference solution passes every test and each start state fails its hidden
tests (`harness/check-refs.sh`). Both models got the same prompts and the same
max tokens, with the sampling and thinking settings above.

- **t1** single-shot bug fix: the next weekday was computed from the UTC date instead of the user's local date, including across a DST change
- **t2** single-shot feature: a five-point spec for a lenient JSON parser covering prose around the JSON, trailing commas, smart quotes, truncated output, and leaving strings untouched
- **t3** single-shot refactor: extract `validateReminder` to an exact contract while existing tests keep passing
- **agent** tool loop (read_file, write_file, run_tests, bash in the run directory only), max 30 turns: fix the one failing test, implement "quiet hours" from a spec across two files, add tests
- **chat** two scripted 3-turn conversations: a habit-coach persona with 6 rules and a bakery support persona with 6 rules, checked automatically

### Coding and agent tasks: 32K per answer, 16K per agent turn, 128K context, 1 run each

| task | model | pass | wall s | completion tokens | finish | hidden+visible tests passed |
|---|---|---|---|---|---|---|
| t1 | qwen3.8-27b | yes | 504 | 30924 | stop | 21/21 |
| t1 | inkling2-mini | yes | 496 | 24182 | stop | 21/21 |
| t2 | qwen3.8-27b | no | 561 | 32768 | length | 15/30 |
| t2 | inkling2-mini | no | 679 | 32768 | length | 15/30 |
| t3 | qwen3.8-27b | yes | 348 | 23773 | stop | 22/22 |
| t3 | inkling2-mini | yes | 175 | 8445 | stop | 22/22 |
| agent | qwen3.8-27b | yes | 262 | 20842 | done | 37/37 |
| agent | inkling2-mini | yes | 538 | 23679 | done | 39/39 |
| **total** | qwen3.8-27b | **3/4** | | | | |
| **total** | inkling2-mini | **3/4** | | | | |

Token usage per solved task, Qwen against Inkling: t1 30.9K vs 24.2K, t3 23.8K vs
8.4K, agent 20.8K vs 23.7K. Over the three solved tasks Qwen wrote 75.5K completion
tokens and Inkling 56.3K.

### Agent runs in detail

| model | turns | tool calls | bad tool args | wall s | completion tokens | last prompt tokens | stop |
|---|---|---|---|---|---|---|---|
| qwen3.8-27b | 10 | 15 | 0 | 262 | 20842 | 26609 | done |
| inkling2-mini | 23 | 22 | 0 | 538 | 23679 | 35401 | done |
| inkling2-mini + DSpark (fork, 64K) | 23 | 22 | 0 | 406 | 24624 | 32935 | done |

Neither model produced a malformed tool-call argument.

### Multi-turn chat (automatic constraint checks, 4K tokens per turn, 2 runs)

| model | coach (20 checks) | bakery (17 checks) |
|---|---|---|
| qwen3.8-27b | 20/20, 20/20 | 17/17, 17/17 |
| inkling2-mini | 20/20, 20/20 | 17/17, 17/17 |

Inkling's chat runs used the 32K server config (`CTX=32768`, f16 KV plus vision
projector); the conversations stay far below that. Both models stayed under the word
limits, kept to plain text, asked exactly one question, declined the melatonin
question and pointed the user to a professional, kept the order number, avoided
promising a refund, and kept the sign-off. These checks were too easy to tell the
models apart.

## Notable results

- **t2 (JSON repair) beat both models at 32K tokens.** Both used the whole budget
  on reasoning (about 130K characters for Qwen, 105K for Inkling) and wrote no
  file. Both kept re-deriving truncation edge cases. Inkling: *"...the comma was
  REMOVED by the comma-drop step. So re-scan: outer frame memberStart = 1..."*.
- **Qwen thinks longer on single-shot tasks.** On t3 it wrote 23.8K tokens in 348 s,
  Inkling 8.4K tokens in 175 s, for the same result. On t1 the gap was smaller
  (30.9K against 24.2K tokens, about the same wall time because Qwen decodes faster).
- **Inkling's agent run is longer:** 23 turns, 22 tool calls and 538 s against
  10 turns, 15 tool calls and 262 s for Qwen. Inkling takes more, smaller steps.
  Its summary of the failing test was correct: the
  `update` handler *"rebuilt the schedule but never recomputed nextAt"*.
- **Long agent sessions need more than 32K context.** Inkling's agent run ended at
  35.4K prompt tokens and Qwen's at 26.6K, which is why both models run at 128K.

## Caveats

- One machine and one quant per model: Inkling UD-Q4_K_XL with NVFP4 experts, Qwen
  UD-Q4_K_XL. On Blackwell, or with a non-NVFP4 quant, Inkling's speed could
  look very different.
- Small N: 1 run per task on a single RTX 3090 (2 runs of the chat test). One pass
  more or less changes the totals a lot.
- Thinking was on for both models and their sampling settings differ (each vendor's
  recommendation). Pass rates depend heavily on the token budget; both models hit
  the 32K limit on t2.
- KV cache types differ: Qwen q4_0, Inkling q8_0 (with `-ub 128` and no vision
  projector, the only way 128K fits in 24 GB). Inkling's chat test and speed prompts
  ran on its 32K config.
- Mainline llama.cpp has no DSpark speculative decoding for Inkling yet (PR #32218
  is open), while Qwen had MTP. Speed is compared as deployed today.
- The agent's `bash` tool was only fenced by a working directory, a timeout and a
  deny-list.
- llama.cpp master moves fast. The Inkling support is days old (#32694, #32704) and
  #32710 is still open.

## DSpark speculative decoding

Mainline llama.cpp still has no DSpark (PR #32218 is open), so this used Unsloth's
fork build `b12588-mix-c0c3de8`, the one their Inkling guide names.

**Build.** The fork's git tag `b12588-mix-c0c3de8` points at the fork's own CI tree
(commit `e85442867`, build 12343). Built as is, it fails with `unknown model
architecture: 'inkling2'`. The release binaries are built from a different tree:
upstream tag `b12588` with the 30 PRs from `scripts/unsloth/pr-set.json` merged on
top, including ggml-org#32218 (DSpark) and Unsloth's Inkling looped-layer PRs. The
hash of that PR set is the `c0c3de8` in the tag name; I checked it against the
workflow's formula. The release ships that merged tree as
`llama.cpp-source-b12588-mix-c0c3de8.tar.gz` (sha256 `92ee8439...3607`, matches the
release's `llama-prebuilt-sha256.json`; source commit `883286076`). I built that
tarball with CUDA 13.4, arch 86, Release, targets llama-server and llama-bench. It reports
`version: 1.0.0-dev (build 12588, commit 883286076)`.

**Files.** The fork loads the **root-layout** GGUF (`Inkling-2-Mini-UD-Q4_K_XL.gguf`,
17,629,759,456 bytes). The Mainline_Support file used above does not work for
DSpark: Unsloth says #32218 is untested with that layout, and the drafter taps
the looped layers in the root layout. I downloaded the root file plus
`dspark-Inkling-2-Mini-Q8_0.gguf` (402,278,560 bytes; a Q8_0 drafter exists, so
the BF16 one wasn't needed), about 17 GB on disk together.
Both sha256 values match the Hugging Face LFS ids.

**Flags** (`servers/serve.sh inkling2-mini-dspark`):
`--jinja --flash-attn on -ngl 99 --parallel 1 -t 6 -c 65536 -ub 256 --cache-type-k q8_0
--cache-type-v q8_0 --model-draft dspark-Inkling-2-Mini-Q8_0.gguf --spec-type draft-dspark
--spec-draft-n-max 3 --n-gpu-layers-draft 99 --temp 1.0 --top-p 1.0 --top-k 0 --min-p 0.0`,
with no mmproj. The control run (`servers/serve.sh inkling2-mini-fork`) is the same
command without the four drafter flags.

### Fit and speed (same fork build, same 64K config)

| config | loads? | VRAM after load / peak MiB | chat P1 / P2 / P3 t/s | chat mean t/s | draft accept P1 / P2 / P3 | decode at ~8K / ~21K prompt t/s |
|---|---|---|---|---|---|---|
| fork, no drafter (control) | yes | 22299 / 22481 | 55.8 / 55.8 / 55.7 | 55.7 | - | 53.5 / 51.6 |
| fork + DSpark, 64K, q8_0 KV, ub 256 | yes | 23391 / 23705 | 76.2 / 51.4 / 71.6 | **66.4** | 70% / 36% / 65% | 73.8 / 68.7 |
| fork + DSpark, 128K, q8_0 KV, ub 128 | **no**: KV cache allocation OOM (512 MiB) | - | - | - | - | - |

Chat prompts are the same three as above (temperature 0, max 700 tokens), as are
the long-prompt probes (17 x 23 returns 391 at 8K and 21K tokens, no garbage). The
drafter costs about 1.1 GB of VRAM. That leaves about 0.9 GB of headroom on the
24 GB card at 64K, and 128K does not fit. Mean speed rises 19% (55.7 to 66.4 tok/s),
but per prompt it ranges from +37% to -8%: the hash-table essay (P2) accepted only
36% of drafts and came out slower than without DSpark.

### Coding and agent tasks with DSpark (32K per answer, 16K per agent turn, 1 run, TAG=dspark)

DSpark ran at 64K context, because 128K doesn't fit with the drafter. The Inkling
run without DSpark used mainline at 128K. Qwen's run is repeated here for reference.

| task | Inkling + DSpark (fork, 64K) | Inkling, no DSpark (mainline, 128K) | Qwen3.8-27B + MTP (128K) |
|---|---|---|---|
| t1 | pass, 475 s, 25,134 tok, 53.2 t/s, accept 52% | pass, 496 s, 24,182 tok, 49.0 t/s | pass, 504 s, 30,924 tok, 62.2 t/s |
| t2 | fail (15/30, length), 677 s, 32,768 tok, 48.4 t/s, accept 45% | fail (15/30, length), 679 s, 32,768 tok, 48.4 t/s | fail (15/30, length), 561 s, 32,768 tok, 58.5 t/s |
| t3 | pass, 238 s, 14,395 tok, 61.7 t/s, accept 65% | pass, 175 s, 8,445 tok, 50.2 t/s | pass, 348 s, 23,773 tok, 69.0 t/s |
| agent | pass (41/41), 406 s, 23 turns, 24,624 tok, accept 76% | pass (39/39), 538 s, 23 turns, 23,679 tok | pass (37/37), 262 s, 10 turns, 20,842 tok |
| **total** | **3/4** | **3/4** | **3/4** |

Wall time over the four tasks was 1796 s with DSpark against 1888 s without (-5%).
Most of the gain came from the agent task (-24% at about the same token count).
t3 took longer only because this run wrote 70% more tokens; per token it was 23%
faster. On t2 (32K tokens of reasoning at temperature 1.0) DSpark made no
difference: 48.4 t/s both ways, with 45% of drafts accepted. Peak VRAM during the
run was 23,499 MiB.

### Verdict

- DSpark works on a 3090 with Unsloth's fork build. Output stayed correct and
  the pass/fail results matched the run without it (3/4, same failure on t2).
- The gain is modest: +19% on short greedy chat, 0 to +23% on long thinking
  answers at temperature 1.0, and -24% wall time on the agent task. Acceptance
  depends on the content (36% to 76%).
- With DSpark Inkling is still slower than Qwen3.8-27B with MTP (49 to 62 t/s
  against 58 to 69 t/s on the same tasks; 66 against 87 t/s in chat).
- The price is 1.1 GB of VRAM. That cuts the context from 128K to 64K, and it
  needs a second 17 GB root-layout GGUF plus a fork build. On this card it is
  not worth switching to yet. Re-test once #32218 lands in
  mainline and works with the Mainline_Support layout.

### Caveats (DSpark)

- One run per task, and the no-DSpark comparison for the coding/agent tasks is the
  mainline run at 128K context, not the fork at 64K. Chat speed has a same-build
  control; the long tasks do not.
- In the agent task, 64K context caps a turn at 64K minus the prompt. The run
  ended at 32.9K prompt tokens, so the cap was never hit, but a longer session
  would hit it before the 128K configuration would.
- The fork build is a moving pin set; `b12588-mix-c0c3de8` was published
  2026-11-20.
