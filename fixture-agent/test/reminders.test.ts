import test from 'node:test';
import assert from 'node:assert/strict';
import { createReminderApi } from '../src/api/reminders.ts';

const NOW = new Date('2026-11-23T10:00:00Z'); // Monday
const valid = { title: ' Stretch ', days: ['mon', 'wed'], time: '18:00', timeZone: 'Europe/London' };

test('POST creates a reminder with nextAt', async () => {
  const api = createReminderApi(() => NOW);
  const res = await api.handle({ method: 'POST', body: valid });
  assert.equal(res.status, 201);
  const body = res.body as any;
  assert.equal(body.title, 'Stretch');
  assert.equal(body.nextAt, '2026-11-23T18:00:00.000Z');
});

test('POST rejects a missing title', async () => {
  const api = createReminderApi(() => NOW);
  const res = await api.handle({ method: 'POST', body: { ...valid, title: '  ' } });
  assert.equal(res.status, 400);
  assert.equal((res.body as any).error, 'title is required');
});

test('POST rejects a bad time', async () => {
  const api = createReminderApi(() => NOW);
  const res = await api.handle({ method: 'POST', body: { ...valid, time: '24:10' } });
  assert.equal(res.status, 400);
  assert.equal((res.body as any).error, 'time must be HH:MM (24h)');
});

test('POST rejects an unknown time zone', async () => {
  const api = createReminderApi(() => NOW);
  const res = await api.handle({ method: 'POST', body: { ...valid, timeZone: 'Mars/Olympus' } });
  assert.equal(res.status, 400);
  assert.equal((res.body as any).error, 'timeZone must be a valid IANA time zone');
});

test('PATCH time recomputes nextAt', async () => {
  const api = createReminderApi(() => NOW);
  const created = (await api.handle({ method: 'POST', body: valid })).body as any;
  const res = await api.handle({ method: 'PATCH', params: { id: created.id }, body: { time: '20:15' } });
  assert.equal(res.status, 200);
  assert.equal((res.body as any).nextAt, '2026-11-23T20:15:00.000Z');
});

test('PATCH unknown id is 404', async () => {
  const api = createReminderApi(() => NOW);
  const res = await api.handle({ method: 'PATCH', params: { id: 'nope' }, body: {} });
  assert.equal(res.status, 404);
});
