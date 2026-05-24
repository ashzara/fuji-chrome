export const LUT_SIZE = 33;

function idx(r: number, g: number, b: number, size: number): number {
  return (r * size * size + g * size + b) * 3;
}

// ---------------------------------------------------------------------------
// Classic Chrome LUT
//
// Tuned to match reference film photos:
//  • Lifted blacks       — ~0.05 floor, nothing goes fully black
//  • Strong teal shadows — blue pushed hard in dark areas, red pulled
//  • Warm golden highlights — skin and bright areas glow warm/orange
//  • Rich colour         — only ~8% desaturation (reds stay red, greens stay green)
//  • Gentle contrast     — S-curve reduced so midtones stay bright (not crushed)
// ---------------------------------------------------------------------------

export function createClassicChromeLUT(size = LUT_SIZE): Float32Array {
  const lut = new Float32Array(size * size * size * 3);

  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        let rv = r / (size - 1);
        let gv = g / (size - 1);
        let bv = b / (size - 1);

        // Input luminance — drives shadow/highlight colour effects
        const lum = 0.2126 * rv + 0.7152 * gv + 0.0722 * bv;

        // ── 1. Tone curves: lift blacks, soft white roll-off ─────────────────
        rv = curveCh(rv, 0.050, 0.952);
        gv = curveCh(gv, 0.048, 0.940);
        bv = curveCh(bv, 0.058, 0.944);   // blue gets extra shadow lift

        // ── 2. Shadow teal ───────────────────────────────────────────────────
        // Strong in very dark areas (lum < 0.30), fades to zero by lum 0.30
        const shadow = Math.max(0, 1 - lum / 0.30);
        rv -= shadow * 0.035;
        gv += shadow * 0.006;
        bv += shadow * 0.072;   // strong blue → teal cast

        // ── 3. Warm golden highlights ────────────────────────────────────────
        // Kicks in at lum 0.62, quadratic so it's subtle until very bright
        const hi  = Math.max(0, (lum - 0.62) / 0.38);
        const hiQ = hi * hi;
        rv += hiQ * 0.040;   // warm red
        gv += hiQ * 0.012;   // slight green (golden, not harsh orange)
        bv -= hiQ * 0.028;   // pull blue → warm

        // ── 4. Gentle S-curve (reduced from 0.10 to 0.05 — less crushing) ───
        rv = scurve(rv, 0.05);
        gv = scurve(gv, 0.05);
        bv = scurve(bv, 0.05);

        // ── 5. Minimal desaturation (~8%) — keep colours vivid ───────────────
        const lum2 = 0.2126 * rv + 0.7152 * gv + 0.0722 * bv;
        const SAT  = 0.92;
        rv = lum2 + (rv - lum2) * SAT;
        gv = lum2 + (gv - lum2) * SAT;
        bv = lum2 + (bv - lum2) * SAT;

        const base = idx(r, g, b, size);
        lut[base]     = Math.max(0, Math.min(1, rv));
        lut[base + 1] = Math.max(0, Math.min(1, gv));
        lut[base + 2] = Math.max(0, Math.min(1, bv));
      }
    }
  }

  return lut;
}

function curveCh(x: number, blackLift: number, whitePoint: number): number {
  return blackLift + x * (whitePoint - blackLift);
}

function scurve(x: number, strength: number): number {
  return x + strength * Math.sin(Math.PI * x) * (x - 0.5);
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
  const n      = input.length / 4;
  const max    = size - 1;
  const CHUNK  = 150_000;

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
      const nr = 1 - fr,  ng = 1 - fg,  nb = 1 - fb;

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
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  return result;
}
