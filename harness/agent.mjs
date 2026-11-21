// agent.mjs <model> <run>: multi-step tool-use task in a sandbox copy of fixture-agent.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, chat, freshDir, gradeDir, save } from './lib.mjs';
const [model, run] = process.argv.slice(2);
const MAX_TURNS = 30, MAX_TOKENS = +(process.env.AGENT_MAX || 16384), OUT_CAP = 6000;
const LABEL = model + (process.env.TAG ? '-' + process.env.TAG : '');
const dir = path.join(ROOT, 'runs', LABEL, 'agent', 'run' + run);
freshDir(path.join(ROOT, 'fixture-agent'), dir);
const cap = (s) => (s.length > OUT_CAP ? s.slice(0, 1500) + '\n...[' + (s.length - OUT_CAP) + ' chars cut]...\n' + s.slice(-4500) : s);
const inside = (p) => { const a = path.resolve(dir, String(p || '')); if (a !== dir && !a.startsWith(dir + '/')) throw new Error('path outside the repository'); return a; };
const tools = [
  { type: 'function', function: { name: 'read_file', description: 'Read a UTF-8 text file from the repository.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Path relative to the repository root' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Create or overwrite a file with the complete new content.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'run_tests', description: 'Run the test suite (npm test) and return its output.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'bash', description: 'Run a shell command in the repository root (30 s timeout). Use for ls, cat, grep and similar.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
];
function runTool(name, args) {
  if (name === 'read_file') return fs.readFileSync(inside(args.path), 'utf8');
  if (name === 'write_file') {
    const a = inside(args.path);
    if (path.relative(dir, a).startsWith('docs')) return 'error: docs/ is read-only';
    fs.mkdirSync(path.dirname(a), { recursive: true }); fs.writeFileSync(a, String(args.content ?? ''));
    return 'wrote ' + String(args.content ?? '').length + ' chars to ' + path.relative(dir, a);
  }
  if (name === 'run_tests') {
    const r = spawnSync('npm', ['test', '--silent'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
    return 'exit code ' + r.status + '\n' + (r.stdout || '') + (r.stderr || '');
  }
  if (name === 'bash') {
    const c = String(args.command || '');
    if (/\b(sudo|curl|wget|ssh|scp|nc|git\s+push|npm\s+(i|install|publish))\b/.test(c) || /(^|[\s'"=])\/(?!dev\/null)/.test(c) || /\.\.\//.test(c) || /~/.test(c)) return 'error: command not allowed in this sandbox (stay inside the repository, no network)';
    const r = spawnSync('timeout', ['30', 'bash', '-c', c], { cwd: dir, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: dir, LANG: 'C.UTF-8' } });
    return 'exit code ' + r.status + '\n' + (r.stdout || '') + (r.stderr || '');
  }
  return 'error: unknown tool ' + name;
}
const messages = [
  { role: 'system', content: 'You are a coding agent working in a small TypeScript/Node.js repository (Node 22+, TypeScript runs directly via type stripping, tests use node:test). Use the tools to inspect files, edit them and run the tests. Work step by step and verify your changes with run_tests. When you are completely done, reply with a short summary and no tool calls.' },
  { role: 'user', content: 'In this repository:\n1. One existing test currently fails. Find the cause and fix it.\n2. Implement the quiet hours feature described in docs/quiet-hours.md, in src/time.ts and src/api/reminders.ts.\n3. Add tests of your own for quiet hours under test/.\nYou are done when npm test passes. Do not modify docs/.' },
];
const log = [];
const st = { turns: 0, tool_calls: 0, bad_args: 0, prompt_tokens: 0, completion_tokens: 0, last_prompt_tokens: 0, errors: [], stop: 'turn_cap' };
const t0 = Date.now();
for (let turn = 1; turn <= MAX_TURNS; turn++) {
  st.turns = turn;
  const { j, ms } = await chat({ model, messages, tools, tool_choice: 'auto', max_tokens: MAX_TOKENS });
  if (j.error || !j.choices) { st.errors.push(j.error?.message || 'no choices'); st.stop = 'api_error'; log.push({ turn, ms, error: j.error }); break; }
  const u = j.usage || {}; st.prompt_tokens += u.prompt_tokens || 0; st.completion_tokens += u.completion_tokens || 0; st.last_prompt_tokens = u.prompt_tokens || 0;
  const msg = j.choices[0].message || {};
  const calls = msg.tool_calls || [];
  const am = { role: 'assistant', content: msg.content || '' };
  if (msg.reasoning_content) am.reasoning_content = msg.reasoning_content;
  if (calls.length) am.tool_calls = calls;
  messages.push(am);
  log.push({ turn, ms, finish: j.choices[0].finish_reason, tps: j.timings?.predicted_per_second, content: (msg.content || '').slice(0, 400), calls: calls.map((c) => ({ name: c.function?.name, args: (c.function?.arguments || '').slice(0, 200) })) });
  if (!calls.length) { st.stop = j.choices[0].finish_reason === 'length' ? 'length_no_tool' : 'done'; st.final = (msg.content || '').slice(0, 1500); break; }
  for (const c of calls) {
    st.tool_calls++;
    let out;
    try {
      let args = {};
      try { args = c.function.arguments ? JSON.parse(c.function.arguments) : {}; } catch { st.bad_args++; throw new Error('tool arguments were not valid JSON'); }
      out = runTool(c.function.name, args);
    } catch (e) { out = 'error: ' + e.message; }
    messages.push({ role: 'tool', tool_call_id: c.id, content: cap(String(out)) });
  }
}
st.wall_ms = Date.now() - t0;
const visible = spawnSync('npm', ['test', '--silent'], { cwd: dir, encoding: 'utf8', timeout: 120000 }).status === 0;
const grade = gradeDir(dir, 'agent');
const res = { model, label: LABEL, max_tokens: MAX_TOKENS, task: 'agent', run: +run, pass: grade.pass, visible_pass: visible, ...st, tests_pass: grade.tests_pass, tests_fail: grade.tests_fail, failed: grade.failed };
save(path.join(ROOT, 'results/quality', LABEL, 'agent-run' + run + '.json'), res);
save(dir + '.transcript.json', { log, messages: messages.map((m) => ({ ...m, reasoning_content: m.reasoning_content ? m.reasoning_content.slice(0, 2000) : undefined })) });
console.log(JSON.stringify({ model, task: 'agent', run, pass: res.pass, visible, turns: st.turns, stop: st.stop, wall_s: Math.round(st.wall_ms / 1000), tok: st.completion_tokens, ctx: st.last_prompt_tokens, tests: grade.tests_pass + '/' + (grade.tests_pass + grade.tests_fail) }));
