import { LUT_SIZE } from "./lut";
import { normalizeExposure } from "./normalize";
import { resizeImageData } from "./imageUtils";

/**
 * Derive a 3D LUT from before/after image pairs entirely in the browser.
 *
 * Algorithm:
 *  1. Normalize each original (same as inference pipeline).
 *  2. Bucket every pixel's normalized RGB into the nearest LUT grid cell.
 *  3. Accumulate corresponding processed RGB into that cell.
 *  4. Average. Empty cells start as identity (passthrough) so trilinear
 *     interpolation blends smoothly toward trained regions.
 */
export async function deriveLUT(
  pairs: Array<{ original: ImageData; processed: ImageData }>,
  size = LUT_SIZE,
  onProgress?: (pct: number) => void
): Promise<Float32Array> {
  const total = size * size * size;
  const accumR = new Float64Array(total);
  const accumG = new Float64Array(total);
  const accumB = new Float64Array(total);
  const counts = new Float64Array(total);

  for (let p = 0; p < pairs.length; p++) {
    let { original, processed } = pairs[p];

    // Ensure same dimensions
    if (original.width !== processed.width || original.height !== processed.height) {
      processed = resizeImageData(processed, original.width, original.height);
    }

    // Normalize original (same as inference)
    const origPx = new Uint8ClampedArray(original.data);
    normalizeExposure(origPx);

    const procPx = processed.data;
    const n = origPx.length / 4;
    const max = size - 1;
    const CHUNK = 200_000;

    for (let start = 0; start < n; start += CHUNK) {
      const end = Math.min(start + CHUNK, n);
      for (let i = start; i < end; i++) {
        const ri = Math.round((origPx[i * 4]     / 255) * max);
        const gi = Math.round((origPx[i * 4 + 1] / 255) * max);
        const bi = Math.round((origPx[i * 4 + 2] / 255) * max);
        const cell = ri * size * size + gi * size + bi;
        accumR[cell] += procPx[i * 4]     / 255;
        accumG[cell] += procPx[i * 4 + 1] / 255;
        accumB[cell] += procPx[i * 4 + 2] / 255;
        counts[cell]++;
      }
      onProgress?.(((p + (end / n)) / pairs.length) * 90);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  // Build LUT: identity for uncovered cells, averaged for covered ones
  const lut = new Float32Array(total * 3);
  const max = size - 1;

  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const cell = r * size * size + g * size + b;
        const base = cell * 3;
        if (counts[cell] > 0) {
          lut[base]     = Math.max(0, Math.min(1, accumR[cell] / counts[cell]));
          lut[base + 1] = Math.max(0, Math.min(1, accumG[cell] / counts[cell]));
          lut[base + 2] = Math.max(0, Math.min(1, accumB[cell] / counts[cell]));
        } else {
          // Identity passthrough for untrained regions
          lut[base]     = r / max;
          lut[base + 1] = g / max;
          lut[base + 2] = b / max;
        }
      }
    }
  }

  onProgress?.(100);
  return lut;
}
