// summarize-speed.mjs [labels...]: markdown table from results/llamabench-*.json and results/speed-*.json.
import fs from 'node:fs';
import path from 'node:path';
const D = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../results') + '/';
const labels = process.argv.slice(2).length ? process.argv.slice(2) : ['mainline'];
const files = fs.readdirSync(D);
const models = [...new Set(labels.flatMap((l) => files.map((f) => {
  for (const k of ['speed-', 'llamabench-']) if (f.startsWith(k + l + '-') && f.endsWith('.json')) return f.slice((k + l + '-').length, -5);
  return null;
}).filter(Boolean)))].sort();
const rows = [];
for (const m of models) for (const l of labels) {
  let lb = {}, sp = null;
  try { for (const x of JSON.parse(fs.readFileSync(D + 'llamabench-' + l + '-' + m + '.json'))) { if (x.n_prompt) lb.pp = x.avg_ts.toFixed(0); if (x.n_gen) lb.tg = x.avg_ts.toFixed(1); } } catch {}
  try { sp = JSON.parse(fs.readFileSync(D + 'speed-' + l + '-' + m + '.json')); } catch {}
  if (!sp && !lb.pp) continue;
  const acc = sp ? sp.runs.filter((r) => r.draft_n).map((r) => r.draft_n_accepted / r.draft_n) : [];
  rows.push([m, l, lb.pp || '-', lb.tg || '-', sp ? sp.runs.map((r) => r.predicted_per_second?.toFixed(1)).join(' / ') : '-', sp?.mean_tps ?? '-',
    acc.length ? (100 * acc.reduce((a, b) => a + b, 0) / acc.length).toFixed(0) + '%' : '-', sp?.peak_vram_mib ?? '-', sp ? (sp.load_ms / 1000).toFixed(1) : '-']);
}
console.log('| model | label | llama-bench pp512 t/s | llama-bench tg128 t/s | chat P1 / P2 / P3 t/s | chat mean t/s | draft accept | peak VRAM MiB | first request s |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log('| ' + r.join(' | ') + ' |');
