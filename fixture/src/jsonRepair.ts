export class JsonRepairError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonRepairError';
  }
}

/**
 * Parses JSON that came back from a language model.
 *
 * Currently supported: surrounding whitespace and a json code fence.
 * Throws JsonRepairError when the text cannot be parsed.
 */
export function parseModelJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch (err) {
    throw new JsonRepairError('invalid JSON: ' + (err as Error).message);
  }
}
