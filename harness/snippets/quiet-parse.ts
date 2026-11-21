const QUIET = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
function parseQuiet(q: unknown): { start: string; end: string } | 'bad' {
  if (typeof q !== 'string' || !QUIET.test(q)) return 'bad';
  return { start: q.slice(0, 5), end: q.slice(6) };
}

