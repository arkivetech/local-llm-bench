import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { spawnSync } from 'node:child_process';

/** Repository root (override with BENCH_ROOT). */
export const ROOT = process.env.BENCH_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
/** OpenAI-compatible server root, without /v1 (override with BASE). */
export const BASE = (process.env.BASE || 'http://127.0.0.1:8080').replace(/\/+$/, '').replace(/\/v1$/, '');
/** Optional bearer token for hosted endpoints (API_KEY). */
export const API_KEY = process.env.API_KEY || '';

/**
 * POST /v1/chat/completions with node:http(s). Avoids fetch's 300 s header timeout,
 * which long thinking answers exceed. Default client timeout: 30 min per request.
 */
export function chat(body, timeoutMs = +(process.env.REQUEST_TIMEOUT_MS || 30 * 60 * 1000)) {
  const t0 = Date.now();
  const u = new URL(BASE + '/v1/chat/completions');
  const data = JSON.stringify(body);
  const mod = u.protocol === 'https:' ? https : http;
  const headers = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) };
  if (API_KEY) headers.authorization = 'Bearer ' + API_KEY;
  return new Promise((resolve) => {
    const req = mod.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        let j; try { j = JSON.parse(text); } catch { j = { error: { message: text.slice(0, 500) } }; }
        if (res.statusCode >= 400 && !j.error) j.error = { message: 'HTTP ' + res.statusCode };
        resolve({ j, ms: Date.now() - t0, status: res.statusCode });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('client timeout')));
    req.on('error', (e) => resolve({ j: { error: { message: String(e) } }, ms: Date.now() - t0, status: 0 }));
    req.end(data);
  });
}

export function freshDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

/** Copies hidden tests in and runs the full suite with the TAP reporter. */
export function gradeDir(dir, hidden) {
  for (const f of fs.readdirSync(path.join(ROOT, 'harness/hidden', hidden))) {
    fs.copyFileSync(path.join(ROOT, 'harness/hidden', hidden, f), path.join(dir, 'test', f));
  }
  const r = spawnSync('node', ['--test', '--test-reporter=tap', 'test/*.test.ts'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const num = (k) => { const m = out.match(new RegExp('^# ' + k + ' (\\d+)', 'm')); return m ? +m[1] : null; };
  const failed = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]).slice(0, 20);
  return { pass: r.status === 0 && num('fail') === 0, tests_pass: num('pass'), tests_fail: num('fail'), failed, tail: out.slice(-1500) };
}

export function save(file, obj) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }
