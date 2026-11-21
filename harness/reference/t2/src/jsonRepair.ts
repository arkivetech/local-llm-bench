export class JsonRepairError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonRepairError';
  }
}

function stripTrailingCommas(s: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === ',') {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (j >= s.length || s[j] === '}' || s[j] === ']') continue;
    }
    out += c;
  }
  return out;
}

/** Index of the opening quote of the string literal that ends at s.length - 1. */
function stringStart(s: string): number {
  for (let i = s.length - 2; i >= 0; i--) {
    if (s[i] !== '"') continue;
    let bs = 0;
    for (let k = i - 1; k >= 0 && s[k] === '\\'; k--) bs++;
    if (bs % 2 === 0) return i;
  }
  return -1;
}

export function parseModelJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
  if (fence) t = fence[1].trim();
  t = t.replace(/[\u201c\u201d]/g, '"');
  const start = t.search(/[[{]/);
  if (start < 0) throw new JsonRepairError('no JSON found');
  let out = '';
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    out += c;
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      stack.pop();
      if (stack.length === 0) break;
    }
  }
  if (stack.length > 0) {
    if (inStr) { if (esc) out = out.slice(0, -1); out += '"'; }
    for (let pass = 0; pass < 3; pass++) {
      out = out.replace(/\s+$/, '');
      if (out.endsWith(',')) { out = out.slice(0, -1); continue; }
      if (out.endsWith(':')) {
        out = out.slice(0, -1).replace(/\s+$/, '');
        const k = stringStart(out);
        if (k >= 0) out = out.slice(0, k);
        continue;
      }
      if (out.endsWith('"') && stack[stack.length - 1] === '}') {
        const k = stringStart(out);
        const before = out.slice(0, k).replace(/\s+$/, '');
        if (before.endsWith('{') || before.endsWith(',')) { out = before; continue; }
      }
      break;
    }
    out += stack.reverse().join('');
  }
  try {
    return JSON.parse(stripTrailingCommas(out));
  } catch (err) {
    throw new JsonRepairError('invalid JSON: ' + (err as Error).message);
  }
}
