// chatconv.mjs <model> <run>: two scripted multi-turn conversations with many constraints, auto-checked.
import path from 'node:path';
import { ROOT, chat, save } from './lib.mjs';
const [model, run] = process.argv.slice(2);
const MAX_TOKENS = 4096;
const LABEL = model + (process.env.TAG ? '-' + process.env.TAG : '');
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const CONVS = [
  { id: 'coach',
    system: 'You are Juniper, a warm, encouraging habit coach inside a journaling app. Rules for every reply: (1) at most 70 words; (2) plain text only: no lists, no markdown, no emoji; (3) end with exactly one question, and use no other question marks; (4) address the user by their first name exactly once; (5) never give medical, diet or medication advice; if asked, say kindly that you can\'t help with that and suggest a professional; (6) never mention that you are an AI.',
    turns: [
      "Hi, I'm Priya. I want to start journaling but I always quit after three days.",
      'Honestly mornings are chaos with my twins. Should I take melatonin so I can wake up earlier to write?',
      'Okay. Can you give me a 5-step plan with bullet points for this week?',
    ],
    checks: (r, i) => ({
      max_70_words: words(r) <= 70,
      no_lists_markdown: !/^\s*([-*\u2022]|\d+[.)])\s/m.test(r) && !/\*\*|^#/m.test(r),
      no_emoji: !/\p{Extended_Pictographic}/u.test(r),
      one_question_at_end: (r.match(/\?/g) || []).length === 1 && r.trim().endsWith('?'),
      name_once: (r.match(/Priya/g) || []).length === 1,
      no_ai_mention: !/\b(as an ai|language model|i am an ai|i'm an ai)\b/i.test(r),
      ...(i === 1 ? { refers_to_professional: /(doctor|physician|pharmacist|professional|healthcare|GP)/i.test(r), no_dosage: !/\b\d+(\.\d+)?\s?mg\b/i.test(r) } : {}),
    }) },
  { id: 'bakery',
    system: "You answer customer messages for a small bakery. Rules: write in British English; at most 3 sentences per reply, not counting the sign-off; whenever the customer has given an order number, include it in every reply in the form #12345; never promise or confirm a refund, offer to pass the request to the manager instead; end every reply with the sign-off '\u2014 The Crumb Team' on its own final line; never use exclamation marks.",
    turns: [
      'hi, my order 48213 arrived with the wrong cake, it was meant to be lemon not chocolate',
      'I want my money back today. Can you just confirm the refund?',
      'Fine. Also what colour icing does the lemon cake have, and can I pick it up tomorrow at 9am?',
    ],
    checks: (r, i) => {
      const lines = r.trim().split('\n');
      const body = lines.slice(0, -1).join(' ');
      return {
        signoff_last_line: lines[lines.length - 1].trim() === '\u2014 The Crumb Team',
        max_3_sentences: (body.match(/[.?!](\s|$)/g) || []).length <= 3,
        order_number: r.includes('#48213'),
        no_exclamation: !r.includes('!'),
        british_spelling: !/\b(color|favor|apologize|realize|organize)\b/i.test(r),
        ...(i === 1 ? { no_refund_promise: !/(refund (has been|is|will be) (confirmed|processed|approved|issued)|i (can|will) (confirm|process|issue) (the|your|a) refund|we('| wi)ll refund)/i.test(r), mentions_manager: /manager/i.test(r) } : {}),
      };
    } },
];
const out = { model, run: +run, convs: [] };
for (const c of CONVS) {
  const messages = [{ role: 'system', content: c.system }];
  const turns = [];
  for (const [i, u] of c.turns.entries()) {
    messages.push({ role: 'user', content: u });
    const { j, ms } = await chat({ model, messages, max_tokens: MAX_TOKENS });
    const r = (j.choices?.[0]?.message?.content || '').trim();
    messages.push({ role: 'assistant', content: r });
    const checks = c.checks(r, i);
    turns.push({ user: u, reply: r, ms, finish: j.choices?.[0]?.finish_reason, checks, error: j.error?.message });
  }
  const all = turns.flatMap((t) => Object.values(t.checks));
  out.convs.push({ id: c.id, score: all.filter(Boolean).length + '/' + all.length, frac: all.filter(Boolean).length / all.length, turns });
}
save(path.join(ROOT, 'results/quality', LABEL, 'chat-run' + run + '.json'), out);
console.log(JSON.stringify({ model, run, scores: out.convs.map((c) => c.id + ' ' + c.score) }));
