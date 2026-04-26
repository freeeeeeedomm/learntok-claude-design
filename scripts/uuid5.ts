// Tiny UUIDv5 implementation (RFC 4122) using node:crypto's SHA-1.
// Avoids adding the `uuid` package as a dependency for one function.

import { createHash } from 'node:crypto';

function parseNs(ns: string): Uint8Array {
  const hex = ns.replace(/-/g, '');
  if (hex.length !== 32) throw new Error('invalid namespace UUID');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function format(bytes: Buffer): string {
  // Set version (5) and variant (RFC 4122) bits
  const b = Buffer.from(bytes.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // variant RFC 4122
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function uuidv5(name: string, namespace: string): string {
  const ns = parseNs(namespace);
  const hash = createHash('sha1');
  hash.update(ns);
  hash.update(name, 'utf8');
  return format(hash.digest());
}
