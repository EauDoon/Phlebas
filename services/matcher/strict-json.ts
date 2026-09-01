import type { JournalValue } from "./journal.ts";

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function parseStrictJson(
  input: string,
  limits: Readonly<{ maximumDepth?: number; maximumNodes?: number }> = {},
): JournalValue {
  const maximumDepth = limits.maximumDepth ?? 32;
  const maximumNodes = limits.maximumNodes ?? 10_000;
  if (!Number.isSafeInteger(maximumDepth) || maximumDepth <= 0 || maximumDepth > 256) throw new RangeError("Maximum JSON depth is invalid");
  if (!Number.isSafeInteger(maximumNodes) || maximumNodes <= 0 || maximumNodes > 1_000_000) throw new RangeError("Maximum JSON nodes is invalid");
  let offset = 0;
  let nodes = 0;

  function fail(message: string): never {
    throw new SyntaxError(`${message} at JSON offset ${offset}`);
  }

  function whitespace(): void {
    while (offset < input.length && /[\u0009\u000a\u000d\u0020]/.test(input[offset] ?? "")) offset += 1;
  }

  function stringValue(): string {
    if (input[offset] !== '"') fail("Expected string");
    const start = offset;
    offset += 1;
    while (offset < input.length) {
      const character = input[offset];
      if (character === '"') {
        offset += 1;
        return JSON.parse(input.slice(start, offset)) as string;
      }
      if (character === "\\") {
        offset += 1;
        const escape = input[offset];
        if (escape === "u") {
          const digits = input.slice(offset + 1, offset + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) fail("Invalid Unicode escape");
          offset += 5;
          continue;
        }
        if (!escape || !'"\\/bfnrt'.includes(escape)) fail("Invalid string escape");
        offset += 1;
        continue;
      }
      if (!character || character.charCodeAt(0) < 0x20) fail("Invalid string control character");
      offset += 1;
    }
    fail("Unterminated string");
  }

  function value(depth: number): JournalValue {
    nodes += 1;
    if (nodes > maximumNodes) fail("JSON node limit exceeded");
    if (depth > maximumDepth) fail("JSON depth limit exceeded");
    whitespace();
    const character = input[offset];
    if (character === '"') return stringValue();
    if (character === "{") return objectValue(depth + 1);
    if (character === "[") return arrayValue(depth + 1);
    if (input.startsWith("true", offset)) {
      offset += 4;
      return true;
    }
    if (input.startsWith("false", offset)) {
      offset += 5;
      return false;
    }
    if (input.startsWith("null", offset)) {
      offset += 4;
      return null;
    }
    const matched = input.slice(offset).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!matched) fail("Invalid JSON value");
    offset += matched[0].length;
    const parsed = Number(matched[0]);
    if (!Number.isSafeInteger(parsed)) fail("JSON numbers must be safe integers");
    return parsed;
  }

  function objectValue(depth: number): { [key: string]: JournalValue } {
    offset += 1;
    whitespace();
    const result = Object.create(null) as { [key: string]: JournalValue };
    const keys = new Set<string>();
    if (input[offset] === "}") {
      offset += 1;
      return result;
    }
    while (true) {
      whitespace();
      const key = stringValue();
      if (FORBIDDEN_KEYS.has(key)) fail("Forbidden JSON object key");
      if (keys.has(key)) fail("Duplicate JSON object key");
      keys.add(key);
      whitespace();
      if (input[offset] !== ":") fail("Expected object colon");
      offset += 1;
      result[key] = value(depth);
      whitespace();
      if (input[offset] === "}") {
        offset += 1;
        return result;
      }
      if (input[offset] !== ",") fail("Expected object comma");
      offset += 1;
    }
  }

  function arrayValue(depth: number): JournalValue[] {
    offset += 1;
    whitespace();
    const result: JournalValue[] = [];
    if (input[offset] === "]") {
      offset += 1;
      return result;
    }
    while (true) {
      result.push(value(depth));
      whitespace();
      if (input[offset] === "]") {
        offset += 1;
        return result;
      }
      if (input[offset] !== ",") fail("Expected array comma");
      offset += 1;
    }
  }

  whitespace();
  const parsed = value(0);
  whitespace();
  if (offset !== input.length) fail("Unexpected trailing JSON data");
  return parsed;
}
