/**
 * Deterministic registration glyph, v1.
 *
 * Contract (frozen): pure function of the content hash — same input,
 * byte-identical SVG. No randomness, no Date, no external fetches, no node
 * imports (safe to render client-side). Monochrome via currentColor so it
 * inherits context styling and prints cleanly in a paper program.
 *
 * The visual language is expected to iterate; determinism and this signature
 * are what's frozen. Glyphs are re-derivable from stored hashes, so a future
 * visual v2 can re-render history — v1 hardcodes glyph_version 1.
 */

export const GLYPH_VERSION = 1;

const SIZE = 240;
const CX = SIZE / 2;
const CY = SIZE / 2;

function hexToBytes(hex: string): number[] {
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error('glyph requires a full 64-char lowercase hex SHA-256');
  }
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

/** Fixed 2-decimal formatting keeps output byte-stable and diff-friendly. */
const n = (v: number): string => {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
};

function polar(angleDeg: number, radius: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [CX + radius * Math.sin(rad), CY - radius * Math.cos(rad)];
}

export function glyph(contentHashHex: string): string {
  const b = hexToBytes(contentHashHex);

  // Byte 0: ring of 8..12 radial spokes. Byte 1: rotational symmetry 2..4.
  const spokes = 8 + (b[0] % 5);
  const symmetry = 2 + (b[1] % 3);
  const strokeW = 1.5 + (b[14] % 4) * 0.5; // 1.5..3.0
  const outerR = 96;
  const innerR = 22 + (b[15] % 12); // hub radius

  const parts: string[] = [];

  // Spokes: length from bytes 2..13, one byte per spoke (cycled).
  const spokeLines: string[] = [];
  for (let i = 0; i < spokes; i++) {
    const angle = (360 / spokes) * i;
    const len = innerR + 18 + (b[2 + (i % 12)] % (outerR - innerR - 14));
    const [x1, y1] = polar(angle, innerR);
    const [x2, y2] = polar(angle, len);
    spokeLines.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/>`);
    // Terminal dot where a spoke reaches past the midline — reads as a cast list's asterisk.
    if (b[2 + (i % 12)] % 3 === 0) {
      spokeLines.push(`<circle cx="${n(x2)}" cy="${n(y2)}" r="${n(strokeW * 1.1)}" fill="currentColor" stroke="none"/>`);
    }
  }
  parts.push(`<g>${spokeLines.join('')}</g>`);

  // Chord connections between spokes: bytes 20..31 pick (from, skip) pairs,
  // repeated at each rotational symmetry step.
  const chords: string[] = [];
  const chordCount = 2 + (b[20] % 3);
  for (let c = 0; c < chordCount; c++) {
    const from = b[21 + c * 2] % spokes;
    const skip = 1 + (b[22 + c * 2] % Math.max(1, Math.floor(spokes / 2)));
    const r = innerR + 24 + (b[26 + c] % 40);
    for (let s = 0; s < symmetry; s++) {
      const offset = Math.round((spokes / symmetry) * s);
      const a1 = (360 / spokes) * ((from + offset) % spokes);
      const a2 = (360 / spokes) * ((from + skip + offset) % spokes);
      const [x1, y1] = polar(a1, r);
      const [x2, y2] = polar(a2, r);
      const largeArc = 0;
      const sweep = 1;
      chords.push(
        `<path d="M ${n(x1)} ${n(y1)} A ${n(r)} ${n(r)} 0 ${largeArc} ${sweep} ${n(x2)} ${n(y2)}"/>`,
      );
    }
  }
  parts.push(`<g fill="none">${chords.join('')}</g>`);

  // Two concentric arcs whose sweep angles derive from bytes 16..19.
  const arcSpecs: Array<[number, number, number]> = [
    [outerR, (b[16] / 255) * 300 + 30, b[17]],
    [outerR - 10, (b[18] / 255) * 300 + 30, b[19]],
  ];
  const arcs = arcSpecs.map(([r, sweepDeg, startByte]) => {
    const start = (startByte / 255) * 360;
    const end = start + sweepDeg;
    const [x1, y1] = polar(start, r);
    const [x2, y2] = polar(end, r);
    const largeArc = sweepDeg > 180 ? 1 : 0;
    return `<path d="M ${n(x1)} ${n(y1)} A ${n(r)} ${n(r)} 0 ${largeArc} 1 ${n(x2)} ${n(y2)}"/>`;
  });
  parts.push(`<g fill="none">${arcs.join('')}</g>`);

  // Hub: a small circle plus a tick per symmetry order.
  const hub: string[] = [`<circle cx="${CX}" cy="${CY}" r="${n(innerR)}" fill="none"/>`];
  for (let s = 0; s < symmetry; s++) {
    const angle = (360 / symmetry) * s + (b[13] % 90);
    const [x1, y1] = polar(angle, innerR - 8);
    const [x2, y2] = polar(angle, innerR - 2);
    hub.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/>`);
  }
  parts.push(`<g>${hub.join('')}</g>`);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" ` +
    `role="img" aria-label="Bindle registration glyph" data-glyph-version="${GLYPH_VERSION}" ` +
    `stroke="currentColor" stroke-width="${n(strokeW)}" stroke-linecap="round" fill="none">` +
    parts.join('') +
    `</svg>`
  );
}
