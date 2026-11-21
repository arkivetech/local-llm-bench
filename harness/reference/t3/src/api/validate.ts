import type { Weekday } from '../time.ts';

export interface ReminderInput {
  title: string;
  days: Weekday[];
  time: string;
  timeZone: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validateReminder(input: unknown, opts: { partial: false }): ValidationResult<ReminderInput>;
export function validateReminder(input: unknown, opts: { partial: boolean }): ValidationResult<Partial<ReminderInput>>;
export function validateReminder(input: unknown, opts: { partial: boolean }): ValidationResult<Partial<ReminderInput>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['body must be a JSON object'] };
  }
  const b = input as Record<string, unknown>;
  const errors: string[] = [];
  const value: Partial<ReminderInput> = {};
  const check = (k: string) => !opts.partial || k in b;
  if (check('title')) {
    if (typeof b.title !== 'string' || b.title.trim() === '') errors.push('title is required');
    else if (b.title.length > 120) errors.push('title must be at most 120 characters');
    else value.title = b.title.trim();
  }
  if (check('days')) {
    if (!Array.isArray(b.days) || b.days.length === 0) errors.push('days must be a non-empty array');
    else {
      const bad = b.days.filter((d) => !DAYS.includes(d));
      for (const d of bad) errors.push('invalid day: ' + String(d));
      if (bad.length === 0) value.days = [...new Set(b.days as Weekday[])];
    }
  }
  if (check('time')) {
    const t = b.time;
    if (typeof t !== 'string' || !/^\d{2}:\d{2}$/.test(t) || Number(t.slice(0, 2)) > 23 || Number(t.slice(3)) > 59) {
      errors.push('time must be HH:MM (24h)');
    } else value.time = t;
  }
  if (check('timeZone')) {
    if (typeof b.timeZone !== 'string' || !isValidTimeZone(b.timeZone)) errors.push('timeZone must be a valid IANA time zone');
    else value.timeZone = b.timeZone;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
