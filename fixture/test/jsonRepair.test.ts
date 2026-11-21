import test from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJson, JsonRepairError } from '../src/jsonRepair.ts';

test('plain JSON', () => {
  assert.deepEqual(parseModelJson('{"a": 1, "b": [true, null]}'), { a: 1, b: [true, null] });
});

test('fenced JSON', () => {
  assert.deepEqual(parseModelJson('```json\n{"ok": true}\n```'), { ok: true });
});

test('garbage throws JsonRepairError', () => {
  assert.throws(() => parseModelJson('not json at all'), JsonRepairError);
});
