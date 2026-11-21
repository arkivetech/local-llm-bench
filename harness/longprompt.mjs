// longprompt.mjs <label>: NaN/garbage probe. Short, ~8K and ~21K token prompts, then short again (greedy).
// Each prompt asks 17 x 23; the answer must contain 391 and no long runs of one repeated character.
import path from 'node:path';
import { ROOT, chat, save } from './lib.mjs';
const [label] = process.argv.slice(2);
const filler = 'The quick brown fox jumps over the lazy dog while the river keeps flowing past the old mill. ';
const sizes = [0, 400, 1000, 0];
const out = [];
for (const n of sizes) {
  const content = filler.repeat(n) + "What's 17 times 23? Answer with the number and one short sentence.";
  const { j, ms } = await chat({ messages: [{ role: 'user', content }], max_tokens: 1024, temperature: 0 });
  const m = j.choices?.[0]?.message || {};
  const text = (m.content || '');
  out.push({ filler_reps: n, prompt_tokens: j.usage?.prompt_tokens, completion_tokens: j.usage?.completion_tokens, ms,
    pp_tps: j.timings?.prompt_per_second, tg_tps: j.timings?.predicted_per_second, has391: /391/.test(text + (m.reasoning_content || '')),
    garbage: /(.)\1{15,}/.test(text) || /(.)\1{15,}/.test(m.reasoning_content || ''), content: text.slice(0, 200), reasoning_head: (m.reasoning_content || '').slice(0, 120), error: j.error?.message });
}
save(path.join(ROOT, 'results', 'longprompt-' + label + '.json'), out);
console.log(JSON.stringify(out.map((o) => ({ reps: o.filler_reps, pt: o.prompt_tokens, ct: o.completion_tokens, pp: o.pp_tps?.toFixed(0), tg: o.tg_tps?.toFixed(1), ok391: o.has391, garbage: o.garbage, c: o.content.slice(0, 80), err: o.error }))));
