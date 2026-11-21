// Builds task variants from ../fixture: reference solutions and the agent start repo.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fx = (p) => rd('fixture/' + p);
const put = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const must = (s, a, b) => { if (!s.includes(a)) throw new Error('pattern not found: ' + a.slice(0, 60)); return s.replace(a, b); };

const time = fx('src/time.ts');
const t1 = must(time,
  "  for (let offset = 0; offset < 8; offset++) {\n    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));",
  "  const local = zonedParts(now, schedule.timeZone);\n  for (let offset = 0; offset < 8; offset++) {\n    const d = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));");
put(path.join(ROOT, 'harness/reference/t1/src/time.ts'), t1);

const A = path.join(ROOT, 'fixture-agent');
fs.rmSync(A, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'fixture'), A, { recursive: true, filter: (s) => !s.includes('node_modules') && !s.endsWith('.git') });
put(path.join(A, 'src/time.ts'), t1);
let rem = fx('src/api/reminders.ts');
rem = must(rem, "      schedule,\n      nextAt: next ? next.toISOString() : null,\n    };\n    reminders.set(existing.id, updated);",
  "      schedule,\n    };\n    reminders.set(existing.id, updated);");
rem = must(rem, "    const next = nextOccurrence(schedule, now());\n    const updated: Reminder", "    const updated: Reminder");
put(path.join(A, 'src/api/reminders.ts'), rem);
put(path.join(A, 'docs/quiet-hours.md'), rd('harness/agent-docs/quiet-hours.md'));

let at = must(t1, "  timeZone: string;\n}\n", "  timeZone: string;\n  /** Optional daily quiet window, local to timeZone. */\n  quietHours?: { start: string; end: string };\n}\n");
at = must(at, "    if (candidate.getTime() > now.getTime()) return candidate;",
  "    if (candidate.getTime() > now.getTime()) return applyQuietHours(schedule, d, hh * 60 + mm, candidate);");
at += rd('harness/snippets/quiet-time.ts');
put(path.join(ROOT, 'harness/reference/agent/src/time.ts'), at);
let ar = fx('src/api/reminders.ts');
ar = must(ar, "function isValidTimeZone", rd('harness/snippets/quiet-parse.ts') + "function isValidTimeZone");
ar = must(ar, "    const schedule: Schedule = {\n      days: [...new Set(b.days as Weekday[])],\n      time: b.time,\n      timeZone: b.timeZone,\n    };",
  "    let quiet: { start: string; end: string } | undefined;\n    if (b.quietHours !== undefined) {\n      const q = parseQuiet(b.quietHours);\n      if (q === 'bad') return { status: 400, body: { error: 'quietHours must be HH:MM-HH:MM' } };\n      quiet = q;\n    }\n    const schedule: Schedule = {\n      days: [...new Set(b.days as Weekday[])],\n      time: b.time,\n      timeZone: b.timeZone,\n      ...(quiet ? { quietHours: quiet } : {}),\n    };");
ar = must(ar, "    const schedule: Schedule = {\n      days: 'days' in b",
  "    let quiet = existing.schedule.quietHours;\n    if ('quietHours' in b) {\n      if (b.quietHours === null) quiet = undefined;\n      else {\n        const q = parseQuiet(b.quietHours);\n        if (q === 'bad') return { status: 400, body: { error: 'quietHours must be HH:MM-HH:MM' } };\n        quiet = q;\n      }\n    }\n    const schedule: Schedule = {\n      ...(quiet ? { quietHours: quiet } : {}),\n      days: 'days' in b");
put(path.join(ROOT, 'harness/reference/agent/src/api/reminders.ts'), ar);
console.log('variants ok');
