/**
 * Exposure normalisation — mutates the pixel array in-place.
 *
 * IMPORTANT: We deliberately do NOT touch white balance or saturation.
 * Stripping those before the LUT was causing a "cold/blue" result because
 * warm photos were neutralised, then the LUT added teal shadows on top.
 *
 * Instead we only correct clear under/over-exposure so the LUT receives
 * pixels at a consistent brightness level. Color character is left intact.
 */
export function normalizeExposure(pixels: Uint8ClampedArray): void {
  const n = pixels.length / 4;
  if (n === 0) return;

  // Sample luminance at every 4th pixel for speed
  const lums: number[] = [];
  for (let i = 0; i < n; i += 4) {
    lums.push(
      0.2126 * (pixels[i * 4]     / 255) +
      0.7152 * (pixels[i * 4 + 1] / 255) +
      0.0722 * (pixels[i * 4 + 2] / 255)
    );
  }
  lums.sort((a, b) => a - b);

  const hi = lums[Math.floor(0.97 * lums.length)];

  // Only act on clearly under- or over-exposed photos.
  // Well-exposed shots (hi between 0.60 – 0.97) are left completely untouched.
  let scale = 1.0;
  if (hi < 0.60 && hi > 0.05) {
    // Underexposed — boost gently
    scale = Math.min(0.88 / hi, 2.0);
  } else if (hi > 0.97) {
    // Overexposed — pull back gently
    scale = Math.max(0.92 / hi, 0.6);
  }

  if (scale !== 1.0) {
    for (let i = 0; i < n; i++) {
      pixels[i * 4]     = Math.min(255, pixels[i * 4]     * scale);
      pixels[i * 4 + 1] = Math.min(255, pixels[i * 4 + 1] * scale);
      pixels[i * 4 + 2] = Math.min(255, pixels[i * 4 + 2] * scale);
    }
  }
}
