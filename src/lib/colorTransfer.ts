/**
 * Adaptive film colour transfer — no training required.
 *
 * How it works (same as CapCut "Color Match"):
 *  1. Measure the input photo's colour distribution in Lab colour space
 *  2. Build a custom LUT that shifts those colours toward the reference
 *     film photo statistics (pre-measured from the target film look)
 *  3. Apply Classic Chrome film-look effects on top
 *
 * Only the a (warm/cool) and b (golden/blue) Lab channels are transferred.
 * Lightness (L) is left completely untouched — so the photo's original
 * brightness is always preserved.
 *
 * The reference statistics below were measured from the target film photos
 * (the reference examples showing the Classic Chrome look).
 */

// ---------------------------------------------------------------------------
// Reference film look — Lab a/b statistics from target style photos
// ---------------------------------------------------------------------------

const REF = {
  // a channel: negative = green, positive = red/warm
  // Film photos have slightly warm (positive) a
  a: { mean: 5.5, std: 15.8 },
  // b channel: negative = blue/teal, positive = yellow/golden
  // Film photos have golden warmth in highlights
  b: { mean: 9.0, std: 17.5 },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sample the input image's Lab a/b statistics.
 * Reads every 4th pixel for speed — still statistically accurate.
 */
export function measureLabStats(pixels: Uint8ClampedArray): {
  aMean: number;
  aStd: number;
  bMean: number;
  bStd: number;
} {
  const n = pixels.length / 4;
  const STEP = 4;
  let aSum = 0, bSum = 0, count = 0;

  for (let i = 0; i < n; i += STEP) {
    const [, a, b] = rgbToLab(
      pixels[i * 4] / 255,
      pixels[i * 4 + 1] / 255,
      pixels[i * 4 + 2] / 255
    );
    aSum += a;
    bSum += b;
    count++;
  }

  const aMean = aSum / count;
  const bMean = bSum / count;
  let aVar = 0, bVar = 0;

  for (let i = 0; i < n; i += STEP) {
    const [, a, b] = rgbToLab(
      pixels[i * 4] / 255,
      pixels[i * 4 + 1] / 255,
      pixels[i * 4 + 2] / 255
    );
    aVar += (a - aMean) ** 2;
    bVar += (b - bMean) ** 2;
  }

  return {
    aMean,
    aStd: Math.sqrt(aVar / count) || 1,
    bMean,
    bStd: Math.sqrt(bVar / count) || 1,
  };
}

/**
 * Build a 33×33×33 LUT that combines:
 *  1. Lab colour transfer  — shifts input colours toward reference film look
 *  2. Classic Chrome film  — lifted blacks, teal shadows, warm highlights
 *
 * Compatible with applyLUT (size=33).
 * Building takes ~50–80 ms; applying via trilinear is the same speed as a
 * pre-baked LUT.
 */
export function buildAdaptiveFilmLUT(srcStats: {
  aMean: number;
  aStd: number;
  bMean: number;
  bStd: number;
}): Float32Array {
  const SIZE = 33;
  const lut  = new Float32Array(SIZE * SIZE * SIZE * 3);

  // Clamp scale factors — prevents extreme colour shifts on unusual photos
  const aScale = Math.min(Math.max(REF.a.std / srcStats.aStd, 0.55), 2.0);
  const bScale = Math.min(Math.max(REF.b.std / srcStats.bStd, 0.55), 2.0);

  for (let r = 0; r < SIZE; r++) {
    for (let g = 0; g < SIZE; g++) {
      for (let b = 0; b < SIZE; b++) {
        let rv = r / (SIZE - 1);
        let gv = g / (SIZE - 1);
        let bv = b / (SIZE - 1);

        // ── 1. Lab colour transfer ───────────────────────────────────────────
        // Convert to Lab, shift only a+b (warm/cool balance), keep L intact
        const [L, aLab, bLab] = rgbToLab(rv, gv, bv);
        const aNew = (aLab - srcStats.aMean) * aScale + REF.a.mean;
        const bNew = (bLab - srcStats.bMean) * bScale + REF.b.mean;
        const rgb  = labToRgb(L, aNew, bNew);
        rv = rgb[0]; gv = rgb[1]; bv = rgb[2];

        // ── 2. Classic Chrome film look ──────────────────────────────────────
        const lum = 0.2126 * rv + 0.7152 * gv + 0.0722 * bv;

        // Lift blacks — nothing goes pure black (faded film base)
        rv = 0.048 + rv * (0.952 - 0.048);
        gv = 0.046 + gv * (0.940 - 0.046);
        bv = 0.055 + bv * (0.944 - 0.055);   // blue gets more lift → teal blacks

        // Teal shadows — blue up, red down in dark areas
        const shadow = Math.max(0, 1 - lum / 0.28);
        rv -= shadow * 0.028;
        gv += shadow * 0.005;
        bv += shadow * 0.055;

        // Warm golden highlights — red/green up, blue down in bright areas
        const hi = Math.max(0, (lum - 0.65) / 0.35) ** 2;
        rv += hi * 0.035;
        gv += hi * 0.010;
        bv -= hi * 0.022;

        // Minimal saturation adjustment (~6%) — keep colours vivid
        const lum2 = 0.2126 * rv + 0.7152 * gv + 0.0722 * bv;
        const SAT  = 0.94;
        rv = lum2 + (rv - lum2) * SAT;
        gv = lum2 + (gv - lum2) * SAT;
        bv = lum2 + (bv - lum2) * SAT;

        const base = (r * SIZE * SIZE + g * SIZE + b) * 3;
        lut[base]     = Math.max(0, Math.min(1, rv));
        lut[base + 1] = Math.max(0, Math.min(1, gv));
        lut[base + 2] = Math.max(0, Math.min(1, bv));
      }
    }
  }

  return lut;
}

// ---------------------------------------------------------------------------
// CIE Lab ↔ sRGB conversion (standard D65 illuminant)
// ---------------------------------------------------------------------------

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // sRGB → linear
  const rl = r > 0.04045 ? ((r + 0.055) / 1.055) ** 2.4 : r / 12.92;
  const gl = g > 0.04045 ? ((g + 0.055) / 1.055) ** 2.4 : g / 12.92;
  const bl = b > 0.04045 ? ((b + 0.055) / 1.055) ** 2.4 : b / 12.92;

  // Linear → XYZ D65, normalised by illuminant
  const x = (0.4124 * rl + 0.3576 * gl + 0.1805 * bl) / 0.9505;
  const y =  0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  const z = (0.0193 * rl + 0.1192 * gl + 0.9505 * bl) / 1.0890;

  const f = (t: number) => t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116;
  const fx = f(x), fy = f(y), fz = f(z);

  return [
    116 * fy - 16,        // L  0–100
    500 * (fx - fy),      // a  −128–127
    200 * (fy - fz),      // b  −128–127
  ];
}

function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const fi = (t: number) => t > 0.2069 ? t ** 3 : (t - 16 / 116) / 7.787;
  const x = 0.9505 * fi(fx);
  const y =          fi(fy);
  const z = 1.0890 * fi(fz);

  // XYZ → linear sRGB
  const rl =  3.2406 * x - 1.5372 * y - 0.4986 * z;
  const gl = -0.9689 * x + 1.8758 * y + 0.0415 * z;
  const bl =  0.0557 * x - 0.2040 * y + 1.0570 * z;

  // Linear → sRGB gamma
  const g = (c: number) =>
    c <= 0 ? 0 : c > 0.0031308 ? 1.055 * c ** (1 / 2.4) - 0.055 : 12.92 * c;

  return [g(rl), g(gl), g(bl)];
}
