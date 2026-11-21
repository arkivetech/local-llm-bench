export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface Schedule {
  /** Weekdays on which the reminder fires, in the user's time zone. */
  days: Weekday[];
  /** Local wall-clock time, "HH:MM" 24h. */
  time: string;
  /** IANA time zone of the user, e.g. "America/Los_Angeles". */
  timeZone: string;
}

const ORDER: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: Weekday;
}

/** Wall-clock parts of an instant as seen in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: p.weekday.toLowerCase().slice(0, 3) as Weekday,
  };
}

/** Converts a wall-clock time in `timeZone` to the matching UTC instant. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  // Two correction passes handle offsets that change around DST transitions.
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += target - seen;
  }
  return new Date(guess);
}

/**
 * Next instant strictly after `now` at which the schedule fires, or null when the
 * schedule has no days.
 */
export function nextOccurrence(schedule: Schedule, now: Date): Date | null {
  if (schedule.days.length === 0) return null;
  const [hh, mm] = schedule.time.split(':').map(Number);
  const local = zonedParts(now, schedule.timeZone);
  for (let offset = 0; offset < 8; offset++) {
    const d = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
    const weekday = ORDER[d.getUTCDay()];
    if (!schedule.days.includes(weekday)) continue;
    const candidate = zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hh, mm, schedule.timeZone);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  return null;
}
