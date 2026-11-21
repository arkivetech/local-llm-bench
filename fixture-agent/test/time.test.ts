import test from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence, zonedParts } from '../src/time.ts';

test('zonedParts reads wall clock in a zone', () => {
  const p = zonedParts(new Date('2026-11-23T10:00:00Z'), 'Asia/Tokyo');
  assert.deepEqual(p, { year: 2026, month: 11, day: 23, hour: 19, minute: 0, weekday: 'mon' });
});

test('next occurrence later in the week (London, winter)', () => {
  const next = nextOccurrence(
    { days: ['mon', 'wed', 'fri'], time: '09:00', timeZone: 'Europe/London' },
    new Date('2026-11-23T10:00:00Z'), // Monday 10:00 local
  );
  assert.equal(next?.toISOString(), '2026-11-25T09:00:00.000Z');
});

test('same day when the time is still ahead (UTC)', () => {
  const next = nextOccurrence(
    { days: ['mon'], time: '18:30', timeZone: 'UTC' },
    new Date('2026-11-23T08:00:00Z'),
  );
  assert.equal(next?.toISOString(), '2026-11-23T18:30:00.000Z');
});

test('no days means no reminder', () => {
  assert.equal(nextOccurrence({ days: [], time: '09:00', timeZone: 'UTC' }, new Date()), null);
});
