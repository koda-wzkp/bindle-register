import { createHash } from 'node:crypto';

/** Lowercase hex SHA-256 of the UTF-8 bytes of `input`. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
