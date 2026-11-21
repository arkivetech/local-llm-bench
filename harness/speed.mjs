// speed.mjs <model> <label>: one warm-up request, then 3 fixed prompts (temperature 0, max 700 tokens).
// Reads llama-server's .timings (decode tok/s, draft acceptance) and samples total GPU memory with
// nvidia-smi if it is available. Writes results/speed-<label>-<model>.json.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT, chat, save } from './lib.mjs';
const [model, label] = process.argv.slice(2);
const prompts = [
  'Write a TypeScript function mergeIntervals(intervals: [number, number][]) that merges overlapping intervals. Include a short explanation and three example calls with their outputs.',
  'Explain in about 300 words how a hash table handles collisions, comparing separate chaining and open addressing, and when resizing happens.',
  'Turn this into a JSON array of objects with keys name, day, time: "Ana stretches Monday at 7:30, Ben journals Wednesday at 21:00, Chloe walks Friday at 18:15, Dev reads Sunday at 10:00." Then write two sentences about the data.',
];
let peak = 0; let smi = null;
if (process.env.NO_SMI !== '1') {
  smi = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits', '-lms', '250']);
  smi.on('error', () => { smi = null; });
  smi.stdout.on('data', (d) => { for (const l of String(d).split('\n')) { const v = parseInt(l); if (v > peak) peak = v; } });
}
const ask = (content, max_tokens) => chat({ model, messages: [{ role: 'user', content }], max_tokens, temperature: 0, seed: 42 });
const out = { model, label, at: new Date().toISOString(), runs: [] };
const w = await ask('Say hi in five words.', 32); out.load_ms = w.ms;
for (const [i, p] of prompts.entries()) {
  const { j, ms } = await ask(p, 700);
  const t = j.timings || {}; const m = j.choices?.[0]?.message || {};
  out.runs.push({ prompt: i + 1, wall_ms: ms, prompt_n: t.prompt_n, predicted_n: t.predicted_n,
    prompt_per_second: t.prompt_per_second, predicted_per_second: t.predicted_per_second,
    draft_n: t.draft_n, draft_n_accepted: t.draft_n_accepted,
    accept: t.draft_n ? +(t.draft_n_accepted / t.draft_n).toFixed(3) : null,
    finish: j.choices?.[0]?.finish_reason, sample: ((m.reasoning_content || '') ? '[think ' + m.reasoning_content.length + 'ch] ' : '') + (m.content || JSON.stringify(j.error || '')).slice(0, 160) });
}
if (smi) smi.kill();
out.peak_vram_mib = peak || null;
const tps = out.runs.map((r) => r.predicted_per_second).filter(Boolean);
out.mean_tps = tps.length ? +(tps.reduce((a, b) => a + b, 0) / tps.length).toFixed(1) : null;
save(path.join(ROOT, 'results', 'speed-' + label + '-' + model + '.json'), out);
console.log(JSON.stringify(out));
