import { nextOccurrence, type Schedule, type Weekday } from '../time.ts';

export interface Request {
  method: string;
  params?: { id?: string };
  body: unknown;
}

export interface Response {
  status: number;
  body: unknown;
}

export interface Reminder {
  id: string;
  title: string;
  schedule: Schedule;
  nextAt: string | null;
}

const DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** In-memory reminders API. `now` is injectable for tests. */
export function createReminderApi(now: () => Date = () => new Date()) {
  const reminders = new Map<string, Reminder>();
  let seq = 0;

  async function create(req: Request): Promise<Response> {
    const b = req.body as Record<string, unknown> | null;
    if (b === null || typeof b !== 'object' || Array.isArray(b)) {
      return { status: 400, body: { error: 'body must be a JSON object' } };
    }
    if (typeof b.title !== 'string' || b.title.trim() === '') {
      return { status: 400, body: { error: 'title is required' } };
    }
    if (b.title.length > 120) {
      return { status: 400, body: { error: 'title must be at most 120 characters' } };
    }
    if (!Array.isArray(b.days) || b.days.length === 0) {
      return { status: 400, body: { error: 'days must be a non-empty array' } };
    }
    for (const d of b.days) {
      if (!DAYS.includes(d)) return { status: 400, body: { error: `invalid day: ${String(d)}` } };
    }
    if (
      typeof b.time !== 'string' ||
      !/^\d{2}:\d{2}$/.test(b.time) ||
      Number(b.time.slice(0, 2)) > 23 ||
      Number(b.time.slice(3)) > 59
    ) {
      return { status: 400, body: { error: 'time must be HH:MM (24h)' } };
    }
    if (typeof b.timeZone !== 'string' || !isValidTimeZone(b.timeZone)) {
      return { status: 400, body: { error: 'timeZone must be a valid IANA time zone' } };
    }
    const schedule: Schedule = {
      days: [...new Set(b.days as Weekday[])],
      time: b.time,
      timeZone: b.timeZone,
    };
    const next = nextOccurrence(schedule, now());
    const reminder: Reminder = {
      id: `r${++seq}`,
      title: b.title.trim(),
      schedule,
      nextAt: next ? next.toISOString() : null,
    };
    reminders.set(reminder.id, reminder);
    return { status: 201, body: reminder };
  }

  async function update(req: Request): Promise<Response> {
    const id = req.params?.id;
    const existing = id ? reminders.get(id) : undefined;
    if (!existing) return { status: 404, body: { error: 'reminder not found' } };
    const b = req.body as Record<string, unknown> | null;
    if (b === null || typeof b !== 'object' || Array.isArray(b)) {
      return { status: 400, body: { error: 'body must be a JSON object' } };
    }
    if ('title' in b) {
      if (typeof b.title !== 'string' || b.title.trim() === '') {
        return { status: 400, body: { error: 'title is required' } };
      }
      if (b.title.length > 120) {
        return { status: 400, body: { error: 'title must be at most 120 characters' } };
      }
    }
    if ('days' in b) {
      if (!Array.isArray(b.days) || b.days.length === 0) {
        return { status: 400, body: { error: 'days must be a non-empty array' } };
      }
      for (const d of b.days) {
        if (!DAYS.includes(d)) return { status: 400, body: { error: `invalid day: ${String(d)}` } };
      }
    }
    if ('time' in b) {
      if (
        typeof b.time !== 'string' ||
        !/^\d{2}:\d{2}$/.test(b.time) ||
        Number(b.time.slice(0, 2)) > 23 ||
        Number(b.time.slice(3)) > 59
      ) {
        return { status: 400, body: { error: 'time must be HH:MM (24h)' } };
      }
    }
    if ('timeZone' in b) {
      if (typeof b.timeZone !== 'string' || !isValidTimeZone(b.timeZone)) {
        return { status: 400, body: { error: 'timeZone must be a valid IANA time zone' } };
      }
    }
    const schedule: Schedule = {
      days: 'days' in b ? [...new Set(b.days as Weekday[])] : existing.schedule.days,
      time: 'time' in b ? (b.time as string) : existing.schedule.time,
      timeZone: 'timeZone' in b ? (b.timeZone as string) : existing.schedule.timeZone,
    };
    const next = nextOccurrence(schedule, now());
    const updated: Reminder = {
      ...existing,
      title: 'title' in b ? (b.title as string).trim() : existing.title,
      schedule,
      nextAt: next ? next.toISOString() : null,
    };
    reminders.set(existing.id, updated);
    return { status: 200, body: updated };
  }

  async function handle(req: Request): Promise<Response> {
    if (req.method === 'POST') return create(req);
    if (req.method === 'PATCH') return update(req);
    return { status: 405, body: { error: 'method not allowed' } };
  }

  return { handle };
}
