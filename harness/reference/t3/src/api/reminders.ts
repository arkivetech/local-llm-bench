import { nextOccurrence, type Schedule } from '../time.ts';
import { validateReminder } from './validate.ts';

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

const bad = (errors: string[]): Response => ({ status: 400, body: { error: errors[0], errors } });

export function createReminderApi(now: () => Date = () => new Date()) {
  const reminders = new Map<string, Reminder>();
  let seq = 0;

  async function create(req: Request): Promise<Response> {
    const v = validateReminder(req.body, { partial: false });
    if (!v.ok) return bad(v.errors);
    const { title, days, time, timeZone } = v.value;
    const schedule: Schedule = { days, time, timeZone };
    const next = nextOccurrence(schedule, now());
    const reminder: Reminder = { id: 'r' + ++seq, title, schedule, nextAt: next ? next.toISOString() : null };
    reminders.set(reminder.id, reminder);
    return { status: 201, body: reminder };
  }

  async function update(req: Request): Promise<Response> {
    const id = req.params?.id;
    const existing = id ? reminders.get(id) : undefined;
    if (!existing) return { status: 404, body: { error: 'reminder not found' } };
    const v = validateReminder(req.body, { partial: true });
    if (!v.ok) return bad(v.errors);
    const p = v.value;
    const schedule: Schedule = {
      days: p.days ?? existing.schedule.days,
      time: p.time ?? existing.schedule.time,
      timeZone: p.timeZone ?? existing.schedule.timeZone,
    };
    const next = nextOccurrence(schedule, now());
    const updated: Reminder = { ...existing, title: p.title ?? existing.title, schedule, nextAt: next ? next.toISOString() : null };
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
