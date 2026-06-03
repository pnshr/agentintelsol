import { createHash } from "node:crypto";
export function stableHash(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

export function mockId(prefix: string, input: unknown, length = 16): string {
  return `${prefix}_${stableHash(input).slice(0, length)}`;
}

export function numberFromHash(input: unknown, min: number, max: number): number {
  const hash = stableHash(input).slice(0, 8);
  const value = Number.parseInt(hash, 16);
  return min + (value % (max - min + 1));
}

export function mockSolanaSignature(input: unknown): string {
  const alphabet =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const hash = stableHash(input);
  let signature = "";

  for (let index = 0; index < 88; index += 1) {
    const hexPair = hash.slice((index * 2) % hash.length, ((index * 2) % hash.length) + 2);
    const value = Number.parseInt(hexPair.padEnd(2, "0"), 16);
    signature += alphabet[value % alphabet.length] ?? "1";
  }

  return signature;
}

export function nowIso(): string {
  return new Date().toISOString();
}
