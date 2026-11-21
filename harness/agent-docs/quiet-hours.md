# Quiet hours (spec)

Users can set quiet hours: a daily window, in the reminder's own time zone, during
which no reminder should fire.

## Schedule

`Schedule` gets an optional field `quietHours?: { start: string; end: string }`
(both "HH:MM", 24h, local to `schedule.timeZone`).

`nextOccurrence` first finds the next occurrence exactly as today. If the local
wall-clock time of that occurrence falls inside the quiet window, it returns the
end of that window instead:

- `start < end` (e.g. 12:00-14:00): the window is [start, end) on the same local
  day; an occurrence inside it moves to `end` on the same local day.
- `start > end` (wraps midnight, e.g. 22:00-07:00): the window is [start, 24:00)
  plus [00:00, end). An occurrence at or after `start` moves to `end` on the next
  local day; one before `end` moves to `end` on the same local day.
- `start === end`: no quiet window.

`start` is inclusive and `end` is exclusive. The moved reminder fires at `end`
even if that day is not one of the schedule's weekdays.

## API

POST and PATCH accept an optional `quietHours` string "HH:MM-HH:MM" (both parts
valid 24h times with two-digit hours and minutes). Anything else is rejected with
status 400 and `{ "error": "quietHours must be HH:MM-HH:MM" }`.

The parsed value is stored on the reminder as `schedule.quietHours`
(`{ start, end }`) and returned in the response, and `nextAt` takes it into
account. On PATCH, `quietHours: null` removes the quiet window (the field is
then absent from `schedule`). Reminders created without quiet hours have no
`quietHours` field.
