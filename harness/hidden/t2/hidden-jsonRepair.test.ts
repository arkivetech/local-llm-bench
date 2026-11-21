import test from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJson, JsonRepairError } from '../src/jsonRepair.ts';

const cases: [string, string, unknown][] = [
  ['prose around object', 'Sure! Here it is: {"a": 1} Hope that helps.', { a: 1 }],
  ['prose around array', 'Result:\n[1, 2, 3]\nDone', [1, 2, 3]],
  ['trailing commas', '{"a": [1, 2,], "b": {"c": 3,},}', { a: [1, 2], b: { c: 3 } }],
  ['commas and brackets inside strings untouched', '{"s": "a,}b,]"}', { s: 'a,}b,]' }],
  ['smart quotes', '{\u201cname\u201d: \u201cAna\u201d, \u201cn\u201d: 2}', { name: 'Ana', n: 2 }],
  ['truncated inside string in array', '{"items": ["x", "y', { items: ['x', 'y'] }],
  ['truncated after comma', '{"a": 1, "b": 2,', { a: 1, b: 2 }],
  ['truncated after key and colon', '{"a": 1, "b":', { a: 1 }],
  ['truncated after bare key', '{"a": 1, "b"', { a: 1 }],
  ['nested truncation', '{"a": {"b": [1, {"c": 2', { a: { b: [1, { c: 2 }] } }],
  ['fence plus trailing comma', '```json\n{"a": 1,}\n```', { a: 1 }],
  ['escaped quotes inside string with prose', 'Answer: {"q": "she said \\"hi\\", ok"} thanks', { q: 'she said "hi", ok' }],
  ['braces inside string with prose', 'Note {"t": "use {x} here"} end', { t: 'use {x} here' }],
  ['first of several objects', 'A {"x": 1} B {"y": 2}', { x: 1 }],
  ['truncated number', '{"a": 12', { a: 12 }],
  ['truncated string value', '{"name": "An', { name: 'An' }],
];

for (const [name, input, expected] of cases) {
  test('hidden: ' + name, () => {
    assert.deepEqual(parseModelJson(input), expected);
  });
}

test('hidden: no JSON at all throws JsonRepairError', () => {
  assert.throws(() => parseModelJson('Sorry, I cannot do that.'), JsonRepairError);
});
