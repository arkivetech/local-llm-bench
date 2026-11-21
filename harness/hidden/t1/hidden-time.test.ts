import test from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence } from '../src/time.ts';

const iso = (d: Date | null) => d?.toISOString();

test('hidden: LA evening, same local Monday', () => {
  // Monday 2026-11-23 18:00 PST
  const n = nextOccurrence({ days: ['mon', 'wed'], time: '20:00', timeZone: 'America/Los_Angeles' }, new Date('2026-11-24T02:00:00Z'));
  assert.equal(iso(n), '2026-11-24T04:00:00.000Z');
});

test('hidden: LA next morning', () => {
  const n = nextOccurrence({ days: ['tue'], time: '07:00', timeZone: 'America/Los_Angeles' }, new Date('2026-11-24T02:00:00Z'));
  assert.equal(iso(n), '2026-11-24T15:00:00.000Z');
});

test('hidden: New York Friday night', () => {
  // Friday 2026-11-27 21:30 EST
  const n = nextOccurrence({ days: ['fri', 'sat'], time: '22:00', timeZone: 'America/New_York' }, new Date('2026-11-28T02:30:00Z'));
  assert.equal(iso(n), '2026-11-28T03:00:00.000Z');
});

test('hidden: Honolulu Sunday afternoon', () => {
  // Sunday 2026-11-22 15:00 HST
  const n = nextOccurrence({ days: ['sun'], time: '18:00', timeZone: 'Pacific/Honolulu' }, new Date('2026-11-23T01:00:00Z'));
  assert.equal(iso(n), '2026-11-23T04:00:00.000Z');
});

test('hidden: DST end weekend in New York', () => {
  // Saturday 2026-10-31 20:00 EDT; DST ends Sunday 2026-11-01 02:00
  const n = nextOccurrence({ days: ['sat'], time: '21:00', timeZone: 'America/New_York' }, new Date('2026-11-01T00:00:00Z'));
  assert.equal(iso(n), '2026-11-01T01:00:00.000Z');
  const sun = nextOccurrence({ days: ['sat', 'sun'], time: '09:00', timeZone: 'America/New_York' }, new Date('2026-11-01T00:00:00Z'));
  assert.equal(iso(sun), '2026-11-01T14:00:00.000Z');
});

test('hidden: a week after DST change keeps local time', () => {
  // Saturday 2026-10-31 22:00 EDT -> next Saturday 21:00 EST
  const n = nextOccurrence({ days: ['sat'], time: '21:00', timeZone: 'America/New_York' }, new Date('2026-11-01T02:00:00Z'));
  assert.equal(iso(n), '2026-11-08T02:00:00.000Z');
});

test('hidden: exactly now rolls to next week', () => {
  // Wednesday 2026-11-25 09:00 PST
  const n = nextOccurrence({ days: ['wed'], time: '09:00', timeZone: 'America/Los_Angeles' }, new Date('2026-11-25T17:00:00Z'));
  assert.equal(iso(n), '2026-12-02T17:00:00.000Z');
});

test('hidden: Tokyo ahead of UTC still works', () => {
  // Tuesday 2026-11-24 08:00 JST
  const n = nextOccurrence({ days: ['tue'], time: '09:00', timeZone: 'Asia/Tokyo' }, new Date('2026-11-23T23:00:00Z'));
  assert.equal(iso(n), '2026-11-24T00:00:00.000Z');
  const m = nextOccurrence({ days: ['mon'], time: '23:00', timeZone: 'Asia/Tokyo' }, new Date('2026-11-23T23:00:00Z'));
  assert.equal(iso(m), '2026-11-30T14:00:00.000Z');
});
