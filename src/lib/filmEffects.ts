/**
 * Film-finishing effects applied after the LUT.
 * Tuned for the "flash/disposable camera" look:
 *  — Strong vignette pulls edges dark to match the reference photos
 *  — Halation adds warm glow on bright highlights (flash reflections)
 *  — Grain adds visible film texture
 */

// ---------------------------------------------------------------------------
// Vignette — strong to match the reference "flash in dark" photos
// ---------------------------------------------------------------------------

export function applyVignette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  strength = 0.60   // strong vignette — reference photos have very dark corners
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x / width  - 0.5) * 2;
      const ny = (y / height - 0.5) * 2;
      const dist = Math.sqrt(nx * nx * 0.78 + ny * ny * 1.22);  // portrait ellipse

      const t   = Math.min(1, dist * 0.92);
      const vig = 1 - strength * t * t * (3 - 2 * t);

      const i = (y * width + x) * 4;
      pixels[i]     = Math.min(255, Math.max(0, Math.round(pixels[i]     * vig)));
      pixels[i + 1] = Math.min(255, Math.max(0, Math.round(pixels[i + 1] * vig)));
      pixels[i + 2] = Math.min(255, Math.max(0, Math.round(pixels[i + 2] * vig)));
    }
  }
}

// ---------------------------------------------------------------------------
// Halation — warm flash glow on bright highlights
// ---------------------------------------------------------------------------

export function applyHalation(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  strength = 0.50
): void {
  for (let i = 0; i < width * height; i++) {
    const r   = pixels[i * 4]     / 255;
    const g   = pixels[i * 4 + 1] / 255;
    const b   = pixels[i * 4 + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (lum <= 0.62) continue;

    const t    = ((lum - 0.62) / 0.38) ** 2;
    const glow = t * strength;

    pixels[i * 4]     = Math.min(255, Math.round(pixels[i * 4]     + glow * 36));
    pixels[i * 4 + 1] = Math.min(255, Math.round(pixels[i * 4 + 1] + glow * 14));
    pixels[i * 4 + 2] = Math.min(255, Math.max(0,
                        Math.round(pixels[i * 4 + 2] - glow * 12)));
  }
}

// ---------------------------------------------------------------------------
// Film grain — visible, matches reference photo texture
// ---------------------------------------------------------------------------

export function applyGrain(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 14
): void {
  for (let i = 0; i < width * height; i++) {
    const r   = pixels[i * 4]     / 255;
    const g   = pixels[i * 4 + 1] / 255;
    const b   = pixels[i * 4 + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    const env = amount * (4.8 * lum * Math.pow(1 - lum, 1.3));

    const nR = (Math.random() - 0.5) * env;
    const nG = (Math.random() - 0.5) * env * 0.90;
    const nB = (Math.random() - 0.5) * env * 0.95;

    pixels[i * 4]     = Math.min(255, Math.max(0, Math.round(pixels[i * 4]     + nR)));
    pixels[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(pixels[i * 4 + 1] + nG)));
    pixels[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(pixels[i * 4 + 2] + nB)));
  }
}
