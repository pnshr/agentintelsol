import { createHash } from "node:crypto";

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const key of Object.keys(input).sort()) {
      const item = input[key];
      output[key] = item === undefined ? null : normalize(item);
    }

    return output;
  }

  return value;
}
