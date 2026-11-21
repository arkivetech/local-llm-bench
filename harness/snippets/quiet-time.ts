
function applyQuietHours(s: Schedule, day: Date, t: number, candidate: Date): Date {
  if (!s.quietHours) return candidate;
  const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  const start = toMin(s.quietHours.start);
  const end = toMin(s.quietHours.end);
  if (start === end) return candidate;
  let addDays = -1;
  if (start < end) { if (t >= start && t < end) addDays = 0; }
  else if (t >= start) addDays = 1;
  else if (t < end) addDays = 0;
  if (addDays < 0) return candidate;
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + addDays));
  return zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), Math.floor(end / 60), end % 60, s.timeZone);
}
