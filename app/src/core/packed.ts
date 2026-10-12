/**
 * Binary data files, packed for the wire. Static hosts send .bin files uncompressed (Render compresses
 * text, not application/octet-stream), so the production build (vite.config.ts) gzips each one after a
 * reversible filter that makes smooth fields compress much better: per-element differences, split into
 * byte planes (all low bytes, then all high bytes). The tsunami grid goes from 4.1 MB to about 1 MB.
 *
 * Layout: "KTZ\x01", element size (1 | 2), delta (0 | 1), raw length (uint32 LE), gzip stream.
 * Files without the header (the dev server's, straight from public/data) pass through unchanged.
 */
const MAGIC = [0x4b, 0x54, 0x5a, 0x01];
const HEADER = 10;

export interface Packing { size: 1 | 2; delta: boolean }

/** Apply the filter: differences between consecutive elements, then byte planes. */
export function filter(src: Uint8Array, { size, delta }: Packing): Uint8Array {
  const out = new Uint8Array(src.length);
  if (size === 1) {
    for (let i = 0, prev = 0; i < src.length; i++) { out[i] = (src[i] - (delta ? prev : 0)) & 0xff; prev = src[i]; }
    return out;
  }
  const n = src.length >> 1;
  for (let i = 0, prev = 0; i < n; i++) {
    const v = src[2 * i] | (src[2 * i + 1] << 8);
    const d = (v - (delta ? prev : 0)) & 0xffff;
    prev = v;
    out[i] = d & 0xff;
    out[n + i] = d >> 8;
  }
  return out;
}

/** Undo filter(). */
export function unfilter(src: Uint8Array, { size, delta }: Packing): Uint8Array {
  const out = new Uint8Array(src.length);
  if (size === 1) {
    for (let i = 0, prev = 0; i < src.length; i++) { prev = delta ? (prev + src[i]) & 0xff : src[i]; out[i] = prev; }
    return out;
  }
  const n = src.length >> 1;
  for (let i = 0, prev = 0; i < n; i++) {
    const d = src[i] | (src[n + i] << 8);
    prev = delta ? (prev + d) & 0xffff : d;
    out[2 * i] = prev & 0xff;
    out[2 * i + 1] = prev >> 8;
  }
  return out;
}

/** Pack with whichever filter compresses best (build time; gzip is supplied by the caller, e.g. node:zlib). */
export function pack(src: Uint8Array, gzip: (b: Uint8Array) => Uint8Array): Uint8Array {
  const options: Packing[] = [{ size: 1, delta: false }, { size: 1, delta: true }];
  if (src.length % 2 === 0) options.push({ size: 2, delta: false }, { size: 2, delta: true });
  let best: { p: Packing; z: Uint8Array } | null = null;
  for (const p of options) {
    const z = gzip(filter(src, p));
    if (!best || z.length < best.z.length) best = { p, z };
  }
  const { p, z } = best!;
  const out = new Uint8Array(HEADER + z.length);
  out.set(MAGIC, 0);
  out[4] = p.size;
  out[5] = p.delta ? 1 : 0;
  new DataView(out.buffer).setUint32(6, src.length, true);
  out.set(z, HEADER);
  return out;
}

export function isPacked(b: Uint8Array): boolean {
  return b.length >= HEADER && MAGIC.every((m, i) => b[i] === m);
}

/** The original bytes of a packed file; anything else is returned as it is. */
export async function unpack(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(buf);
  if (!isPacked(b)) return buf;
  const p: Packing = { size: b[4] === 2 ? 2 : 1, delta: b[5] === 1 };
  const length = new DataView(buf).getUint32(6, true);
  const stream = new Blob([b.subarray(HEADER)]).stream().pipeThrough(new DecompressionStream('gzip'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (raw.length !== length) throw new Error(`packed data: expected ${length} bytes, got ${raw.length}`);
  return unfilter(raw, p).buffer as ArrayBuffer;
}

/** Fetch a binary data file, unpacking it if the build packed it. */
export async function fetchBinary(url: string): Promise<ArrayBuffer | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return unpack(await res.arrayBuffer());
}
