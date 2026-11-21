import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateReminder } from '../src/api/validate.ts';
import { createReminderApi } from '../src/api/reminders.ts';

const NOW = new Date('2026-11-23T10:00:00Z');

test('hidden: collects all errors in field order', () => {
  const r = validateReminder({ title: '', days: [], time: '25:00', timeZone: 'Mars/Base' }, { partial: false });
  assert.deepEqual(r, { ok: false, errors: [
    'title is required', 'days must be a non-empty array', 'time must be HH:MM (24h)', 'timeZone must be a valid IANA time zone',
  ] });
});

test('hidden: one error per invalid day', () => {
  const r = validateReminder({ title: 'x', days: ['mon', 'funday', 'tue', 7], time: '09:00', timeZone: 'UTC' }, { partial: false });
  assert.deepEqual(r, { ok: false, errors: ['invalid day: funday', 'invalid day: 7'] });
});

test('hidden: missing fields on full validation', () => {
  const r = validateReminder({}, { partial: false });
  assert.equal(r.ok, false);
  assert.equal((r as any).errors.length, 4);
});

test('hidden: non-object body', () => {
  for (const b of [null, 'x', [1], 3]) {
    assert.deepEqual(validateReminder(b, { partial: true }), { ok: false, errors: ['body must be a JSON object'] });
  }
});

test('hidden: ok value is normalised', () => {
  const r = validateReminder({ title: '  Walk ', days: ['mon', 'mon', 'fri'], time: '07:05', timeZone: 'Europe/Paris', extra: 1 }, { partial: false });
  assert.deepEqual(r, { ok: true, value: { title: 'Walk', days: ['mon', 'fri'], time: '07:05', timeZone: 'Europe/Paris' } });
});

test('hidden: partial validation only checks present fields', () => {
  assert.deepEqual(validateReminder({}, { partial: true }), { ok: true, value: {} });
  assert.deepEqual(validateReminder({ time: '06:30' }, { partial: true }), { ok: true, value: { time: '06:30' } });
  assert.deepEqual(validateReminder({ time: '6:30', title: 'a'.repeat(121) }, { partial: true }), { ok: false, errors: ['title must be at most 120 characters', 'time must be HH:MM (24h)'] });
});

test('hidden: POST returns error + errors', async () => {
  const api = createReminderApi(() => NOW);
  const res = await api.handle({ method: 'POST', body: { title: '', days: ['mon'], time: 'noon', timeZone: 'UTC' } });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'title is required', errors: ['title is required', 'time must be HH:MM (24h)'] });
});

test('hidden: PATCH returns error + errors', async () => {
  const api = createReminderApi(() => NOW);
  const created = (await api.handle({ method: 'POST', body: { title: 'A', days: ['mon'], time: '18:00', timeZone: 'UTC' } })).body as any;
  const res = await api.handle({ method: 'PATCH', params: { id: created.id }, body: { days: ['xyz'], timeZone: 'Nope/Nope' } });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'invalid day: xyz', errors: ['invalid day: xyz', 'timeZone must be a valid IANA time zone'] });
  const ok = await api.handle({ method: 'PATCH', params: { id: created.id }, body: { title: ' B ' } });
  assert.equal((ok.body as any).title, 'B');
  assert.equal((ok.body as any).nextAt, '2026-11-23T18:00:00.000Z');
});

test('hidden: handlers no longer duplicate validation', () => {
  const src = readFileSync(new URL('../src/api/reminders.ts', import.meta.url), 'utf8');
  assert.match(src, /validateReminder/);
  assert.doesNotMatch(src, /must be HH:MM/);
  assert.doesNotMatch(src, /invalid day/);
});
