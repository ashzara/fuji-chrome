/**
 * Multiply every pixel by a single scale factor so the 97th-percentile
 * luminance maps to 0.92.  Pure multiplication → hue & saturation unchanged.
 * Mutates the pixel array in-place.
 */
export function normalizeExposure(pixels: Uint8ClampedArray): void {
  const n = pixels.length / 4;
  const lums = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    lums[i] =
      0.2126 * (pixels[i * 4] / 255) +
      0.7152 * (pixels[i * 4 + 1] / 255) +
      0.0722 * (pixels[i * 4 + 2] / 255);
  }

  // 97th percentile (sort a copy)
  const sorted = lums.slice().sort();
  const hi = sorted[Math.floor(0.97 * n)];

  if (hi < 0.05) return; // too dark to correct

  const scale = Math.min(Math.max(0.92 / hi, 0.25), 4.0);

  for (let i = 0; i < n; i++) {
    pixels[i * 4]     = Math.min(255, pixels[i * 4]     * scale);
    pixels[i * 4 + 1] = Math.min(255, pixels[i * 4 + 1] * scale);
    pixels[i * 4 + 2] = Math.min(255, pixels[i * 4 + 2] * scale);
    // alpha unchanged
  }
}
