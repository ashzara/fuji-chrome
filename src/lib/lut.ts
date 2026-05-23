export const LUT_SIZE = 33;

// LUT memory layout: flat Float32Array
// index = (r * SIZE * SIZE + g * SIZE + b) * 3 + channel

function idx(r: number, g: number, b: number, size: number): number {
  return (r * size * size + g * size + b) * 3;
}

// ---------------------------------------------------------------------------
// Built-in Classic Chrome approximation
// ---------------------------------------------------------------------------

export function createClassicChromeLUT(size = LUT_SIZE): Float32Array {
  const lut = new Float32Array(size * size * size * 3);

  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        let rv = r / (size - 1);
        let gv = g / (size - 1);
        let bv = b / (size - 1);

        // 1. Tone curve: lift blacks to 0.038, compress whites to 0.94
        rv = 0.038 + rv * (0.94 - 0.038);
        gv = 0.038 + gv * (0.94 - 0.038);
        bv = 0.038 + bv * (0.94 - 0.038);

        // 2. Color matrix: orange/red warmth, olive greens, muted blues
        const ro = 0.96 * rv + 0.04 * gv + 0.00 * bv;
        const go = 0.01 * rv + 0.91 * gv + 0.08 * bv;
        const bo = 0.01 * rv + 0.04 * gv + 0.95 * bv;
        rv = ro; gv = go; bv = bo;

        // 3. Desaturate ~22%
        const lum = 0.2126 * rv + 0.7152 * gv + 0.0722 * bv;
        rv = lum * 0.22 + rv * 0.78;
        gv = lum * 0.22 + gv * 0.78;
        bv = lum * 0.22 + bv * 0.78;

        const base = idx(r, g, b, size);
        lut[base]     = Math.max(0, Math.min(1, rv));
        lut[base + 1] = Math.max(0, Math.min(1, gv));
        lut[base + 2] = Math.max(0, Math.min(1, bv));
      }
    }
  }

  return lut;
}

// ---------------------------------------------------------------------------
// Trilinear LUT application (chunked to keep UI responsive)
// ---------------------------------------------------------------------------

export async function applyLUT(
  input: Uint8ClampedArray,
  lut: Float32Array,
  size = LUT_SIZE,
  onProgress?: (pct: number) => void
): Promise<Uint8ClampedArray> {
  const result = new Uint8ClampedArray(input.length);
  const n = input.length / 4;
  const max = size - 1;
  const CHUNK = 150_000;

  for (let start = 0; start < n; start += CHUNK) {
    const end = Math.min(start + CHUNK, n);

    for (let i = start; i < end; i++) {
      const rf = (input[i * 4]     / 255) * max;
      const gf = (input[i * 4 + 1] / 255) * max;
      const bf = (input[i * 4 + 2] / 255) * max;

      const r0 = rf | 0, r1 = Math.min(r0 + 1, max);
      const g0 = gf | 0, g1 = Math.min(g0 + 1, max);
      const b0 = bf | 0, b1 = Math.min(b0 + 1, max);
      const fr = rf - r0, fg = gf - g0, fb = bf - b0;
      const nr = 1 - fr, ng = 1 - fg, nb = 1 - fb;

      const i000 = idx(r0, g0, b0, size);
      const i001 = idx(r0, g0, b1, size);
      const i010 = idx(r0, g1, b0, size);
      const i011 = idx(r0, g1, b1, size);
      const i100 = idx(r1, g0, b0, size);
      const i101 = idx(r1, g0, b1, size);
      const i110 = idx(r1, g1, b0, size);
      const i111 = idx(r1, g1, b1, size);

      for (let c = 0; c < 3; c++) {
        result[i * 4 + c] = Math.round(
          255 * (
            lut[i000 + c] * nr * ng * nb +
            lut[i001 + c] * nr * ng * fb +
            lut[i010 + c] * nr * fg * nb +
            lut[i011 + c] * nr * fg * fb +
            lut[i100 + c] * fr * ng * nb +
            lut[i101 + c] * fr * ng * fb +
            lut[i110 + c] * fr * fg * nb +
            lut[i111 + c] * fr * fg * fb
          )
        );
      }
      result[i * 4 + 3] = input[i * 4 + 3];
    }

    onProgress?.((end / n) * 100);
    // Yield to UI thread between chunks
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  return result;
}
