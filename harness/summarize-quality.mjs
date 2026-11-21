// Prints markdown tables from results/quality/<model>/*.json
import fs from 'node:fs';
import path from 'node:path';
const D = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../results/quality');
const models = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(D);
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
const load = (m, pre) => fs.existsSync(path.join(D, m)) ? fs.readdirSync(path.join(D, m)).filter((f) => f.startsWith(pre) && f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(D, m, f)))) : [];
console.log('### Coding and agent tasks\n');
console.log('| task | model | pass | median wall s | median completion tokens | finish / stop reasons | hidden tests passed per run |');
console.log('|---|---|---|---|---|---|---|');
for (const t of ['t1', 't2', 't3', 'agent']) for (const m of models) {
  const rs = load(m, t + '-run').sort((a, b) => a.run - b.run);
  if (!rs.length) continue;
  const reasons = rs.map((r) => r.finish || r.stop || '?').join(', ');
  console.log('| ' + t + ' | ' + m + ' | ' + rs.filter((r) => r.pass).length + '/' + rs.length + ' | ' + Math.round(med(rs.map((r) => r.wall_ms)) / 1000) + ' | ' + med(rs.map((r) => r.completion_tokens)) + ' | ' + reasons + ' | ' + rs.map((r) => r.tests_pass + '/' + ((r.tests_pass || 0) + (r.tests_fail || 0))).join(', ') + ' |');
}
console.log('\n### Agent runs (detail)\n');
console.log('| model | run | pass | visible tests green | turns | tool calls | bad tool args | wall s | completion tokens | final prompt tokens | stop |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const m of models) for (const r of load(m, 'agent-run').sort((a, b) => a.run - b.run)) {
  console.log('| ' + [m, r.run, r.pass ? 'yes' : 'no', r.visible_pass ? 'yes' : 'no', r.turns, r.tool_calls, r.bad_args, Math.round(r.wall_ms / 1000), r.completion_tokens, r.last_prompt_tokens, r.stop + (r.errors?.length ? ' (' + r.errors[0].slice(0, 80) + ')' : '')].join(' | ') + ' |');
}
console.log('\n### Multi-turn chat constraint checks\n');
console.log('| model | conversation | checks met per run | mean | most-missed checks |');
console.log('|---|---|---|---|---|');
for (const m of models) {
  const rs = load(m, 'chat-run');
  for (const id of ['coach', 'bakery']) {
    const cs = rs.map((r) => r.convs.find((c) => c.id === id)).filter(Boolean);
    if (!cs.length) continue;
    const miss = {};
    for (const c of cs) for (const t of c.turns) for (const [k, v] of Object.entries(t.checks)) if (!v) miss[k] = (miss[k] || 0) + 1;
    const top = Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' x' + v).join(', ') || '-';
    console.log('| ' + m + ' | ' + id + ' | ' + cs.map((c) => c.score).join(', ') + ' | ' + (100 * cs.reduce((a, c) => a + c.frac, 0) / cs.length).toFixed(0) + '% | ' + top + ' |');
  }
}
