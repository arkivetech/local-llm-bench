import test from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence } from '../src/time.ts';
import { createReminderApi } from '../src/api/reminders.ts';

const iso = (d: Date | null) => d?.toISOString();

test('hidden: wrapping window, early morning moved to end', () => {
  const s: any = { days: ['mon'], time: '06:30', timeZone: 'Europe/Berlin', quietHours: { start: '22:00', end: '07:00' } };
  assert.equal(iso(nextOccurrence(s, new Date('2026-11-22T12:00:00Z'))), '2026-11-23T06:00:00.000Z');
});

test('hidden: non-wrapping window', () => {
  const s: any = { days: ['tue'], time: '13:15', timeZone: 'America/Chicago', quietHours: { start: '12:00', end: '14:00' } };
  assert.equal(iso(nextOccurrence(s, new Date('2026-11-23T12:00:00Z'))), '2026-11-24T20:00:00.000Z');
});

test('hidden: wrapping window, late evening moved to next morning', () => {
  const s: any = { days: ['fri'], time: '23:00', timeZone: 'America/New_York', quietHours: { start: '22:00', end: '07:00' } };
  assert.equal(iso(nextOccurrence(s, new Date('2026-11-26T12:00:00Z'))), '2026-11-28T12:00:00.000Z');
});

test('hidden: outside the window unchanged; start is inclusive, end exclusive', () => {
  const q = { start: '22:00', end: '07:00' };
  const base = { days: ['fri'], timeZone: 'America/New_York', quietHours: q };
  const now = new Date('2026-11-26T12:00:00Z');
  assert.equal(iso(nextOccurrence({ ...base, time: '21:00' } as any, now)), '2026-11-28T02:00:00.000Z');
  assert.equal(iso(nextOccurrence({ ...base, time: '07:00' } as any, now)), '2026-11-27T12:00:00.000Z');
  assert.equal(iso(nextOccurrence({ ...base, time: '22:00' } as any, now)), '2026-11-28T12:00:00.000Z');
});

test('hidden: equal start and end means no quiet window', () => {
  const s: any = { days: ['fri'], time: '23:00', timeZone: 'America/New_York', quietHours: { start: '08:00', end: '08:00' } };
  assert.equal(iso(nextOccurrence(s, new Date('2026-11-26T12:00:00Z'))), '2026-11-28T04:00:00.000Z');
});

const NOW = new Date('2026-11-26T12:00:00Z'); // Thursday
const valid = { title: 'Wind down', days: ['fri'], time: '23:00', timeZone: 'America/New_York' };

test('hidden: POST accepts quietHours and applies it', async () => {
  const api = createReminderApi(() => NOW);
  const res = await api.handle({ method: 'POST', body: { ...valid, quietHours: '22:00-07:00' } });
  assert.equal(res.status, 201);
  const b = res.body as any;
  assert.deepEqual(b.schedule.quietHours, { start: '22:00', end: '07:00' });
  assert.equal(b.nextAt, '2026-11-28T12:00:00.000Z');
});

test('hidden: POST rejects malformed quietHours', async () => {
  const api = createReminderApi(() => NOW);
  for (const q of ['25:00-07:00', 'abc', '22:00', '22:00-7:00', 5]) {
    const res = await api.handle({ method: 'POST', body: { ...valid, quietHours: q } });
    assert.equal(res.status, 400, String(q));
    assert.equal((res.body as any).error, 'quietHours must be HH:MM-HH:MM');
  }
});

test('hidden: POST without quietHours still works', async () => {
  const api = createReminderApi(() => NOW);
  const res = await api.handle({ method: 'POST', body: valid });
  assert.equal(res.status, 201);
  assert.equal((res.body as any).schedule.quietHours, undefined);
  assert.equal((res.body as any).nextAt, '2026-11-28T04:00:00.000Z');
});

test('hidden: PATCH sets and removes quietHours', async () => {
  const api = createReminderApi(() => NOW);
  const created = (await api.handle({ method: 'POST', body: valid })).body as any;
  const set = await api.handle({ method: 'PATCH', params: { id: created.id }, body: { quietHours: '22:00-07:00' } });
  assert.equal(set.status, 200);
  assert.equal((set.body as any).nextAt, '2026-11-28T12:00:00.000Z');
  const bad = await api.handle({ method: 'PATCH', params: { id: created.id }, body: { quietHours: '7-9' } });
  assert.equal(bad.status, 400);
  const off = await api.handle({ method: 'PATCH', params: { id: created.id }, body: { quietHours: null } });
  assert.equal(off.status, 200);
  assert.equal((off.body as any).schedule.quietHours, undefined);
  assert.equal((off.body as any).nextAt, '2026-11-28T04:00:00.000Z');
});
