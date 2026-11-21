# checkin-service

A tiny reminders / check-in service: users pick weekdays and a local time, and the
service computes when the next reminder fires in the user's own time zone. It also
contains a small parser that repairs JSON produced by language models.

No dependencies. Node 22.18+ runs the TypeScript directly (type stripping).

```
npm test
```

- `src/time.ts` - schedule types and next-occurrence logic (time zones via Intl)
- `src/jsonRepair.ts` - lenient JSON parsing for model output
- `src/api/reminders.ts` - framework-free POST/PATCH handlers with validation
