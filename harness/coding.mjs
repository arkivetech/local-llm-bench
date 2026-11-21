// coding.mjs <model> <task t1|t2|t3> <run>: single-shot coding task, graded with hidden tests.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, chat, freshDir, gradeDir, save } from './lib.mjs';
const [model, task, run] = process.argv.slice(2);
const MAX_TOKENS = +(process.env.CODING_MAX || 32768);
const LABEL = model + (process.env.TAG ? '-' + process.env.TAG : '');
const SYSTEM = 'You are an expert TypeScript engineer working in a small Node.js project (Node 22+, TypeScript run directly via type stripping, tests use node:test). Answer with complete file contents in the requested format.';
const FORMAT = [
  'Reply with the complete new contents of every file you create or change, each in exactly this format:',
  '=== FILE: <path> ===', '<entire file content>', '=== END FILE ===',
  'Do not use diffs or placeholders. Do not change test files. You may add a short explanation before the files.',
].join('\n');
const TASKS = {
  t1: { files: ['src/time.ts', 'test/time.test.ts'], text: [
    'Bug report from users: "My Monday 8pm reminder showed up on Wednesday instead." It happens mostly to users in the Americas, in the evening. All the existing (UTC/London based) tests pass.',
    'Find and fix the bug in nextOccurrence in src/time.ts. Keep the exported API the same. Reminders must fire on the user\'s local weekday at the user\'s local time, including across daylight-saving changes.' ] },
  t2: { files: ['src/jsonRepair.ts', 'test/jsonRepair.test.ts'], text: [
    'Extend parseModelJson in src/jsonRepair.ts so it accepts the messy JSON that language models produce. Keep throwing JsonRepairError when no JSON can be recovered. No new dependencies.',
    '1. If there is no code fence, ignore any prose before the first { or [ and after its matching closing bracket. If the text contains several JSON values, return the first one.',
    '2. Remove trailing commas before } or ].',
    '3. Treat typographic double quotes (\u201c and \u201d) as plain double quotes.',
    '4. Repair output that was cut off: close an unterminated string, drop a dangling trailing comma, drop an incomplete trailing object member (a key with no value, with or without its colon), then close all open brackets in the right order.',
    '5. Never change characters inside string literals: commas, brackets and escaped quotes inside strings stay exactly as they are.' ] },
  t3: { files: ['src/api/reminders.ts', 'src/time.ts', 'test/reminders.test.ts'], text: [
    'Refactor src/api/reminders.ts: the POST and PATCH handlers duplicate their validation. Move all request validation into a new module src/api/validate.ts that exports:',
    '',
    '  validateReminder(input: unknown, opts: { partial: boolean }):',
    '    | { ok: true; value: Partial<{ title: string; days: Weekday[]; time: string; timeZone: string }> }',
    '    | { ok: false; errors: string[] }',
    '',
    'Rules:',
    "- Non-object input (null, arrays, primitives) gives { ok: false, errors: ['body must be a JSON object'] }.",
    '- Check fields in this order: title, days, time, timeZone, and collect ALL errors, not just the first. Use exactly the existing error messages. For days, report one "invalid day: <value>" error per invalid entry, in array order (an empty or non-array days gives only "days must be a non-empty array").',
    '- partial: false means all four fields are required. partial: true means only fields present in the input are checked.',
    '- value contains only the validated fields, normalised: title trimmed, days de-duplicated (keeping first occurrence order). Unknown fields are dropped.',
    '- The handlers must call validateReminder and contain no validation logic of their own. On failure they respond 400 with { error: errors[0], errors }.',
    '- Everything else about the handlers stays the same; the existing tests must keep passing.',
    'src/time.ts is included for its types only; do not change it.' ] },
};
const T = TASKS[task];
const dir = path.join(ROOT, 'runs', LABEL, task, 'run' + run);
freshDir(path.join(ROOT, 'fixture'), dir);
const filesText = T.files.map((f) => '=== FILE: ' + f + ' ===\n' + fs.readFileSync(path.join(dir, f), 'utf8') + '=== END FILE ===').join('\n\n');
const user = T.text.join('\n') + '\n\nCurrent files:\n\n' + filesText + '\n\n' + FORMAT;
const { j, ms } = await chat({ model, max_tokens: MAX_TOKENS, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] });
const msg = j.choices?.[0]?.message || {};
const content = msg.content || '';
fs.writeFileSync(dir + '.reasoning.txt', msg.reasoning_content || '');
fs.writeFileSync(dir + '.response.md', '<!-- reasoning ' + (msg.reasoning_content || '').length + ' chars -->\n' + content + (j.error ? '\nERROR: ' + JSON.stringify(j.error) : ''));
const written = [];
const re = /=== FILE: *(.+?) *===\r?\n([\s\S]*?)\r?\n?=== END FILE ===/g;
let m;
while ((m = re.exec(content))) {
  let p = m[1].trim().replace(/^\.\//, '');
  let body = m[2];
  const fence = body.match(/^\s*```[a-z]*\r?\n([\s\S]*?)\r?\n```\s*$/);
  if (fence) body = fence[1];
  const abs = path.resolve(dir, p);
  if (!abs.startsWith(dir + '/') || p.startsWith('test/')) continue;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body.endsWith('\n') ? body : body + '\n');
  written.push(p);
}
const grade = gradeDir(dir, task);
const t = j.timings || {}; const u = j.usage || {};
const res = { model, label: LABEL, max_tokens: MAX_TOKENS, task, run: +run, pass: grade.pass && written.length > 0, written, wall_ms: ms,
  prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, reasoning_chars: (msg.reasoning_content || '').length,
  predicted_per_second: t.predicted_per_second, finish: j.choices?.[0]?.finish_reason, error: j.error?.message,
  tests_pass: grade.tests_pass, tests_fail: grade.tests_fail, failed: grade.failed, tail: grade.pass ? undefined : grade.tail };
save(path.join(ROOT, 'results/quality', LABEL, task + '-run' + run + '.json'), res);
console.log(JSON.stringify({ model, task, run, pass: res.pass, tests: grade.tests_pass + '/' + (grade.tests_pass + grade.tests_fail), wall_s: Math.round(ms / 1000), tok: u.completion_tokens, finish: res.finish, err: res.error }));
