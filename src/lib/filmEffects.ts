/**
 * Film-finishing effects applied after the LUT.
 * All functions mutate the pixel array in place.
 *
 * Tuned to match the reference "film photography" aesthetic:
 *  applyVignette  — noticeable dark-corner falloff (pulls eye to subject)
 *  applyHalation  — warm orange glow on bright highlights (film light bleed)
 *  applyGrain     — visible film grain, strongest in midtones
 */

// ---------------------------------------------------------------------------
// Vignette
// ---------------------------------------------------------------------------

/**
 * Darkens edges with a smooth elliptical falloff.
 * strength 0.55 matches the noticeable vignette in the reference photos.
 */
export function applyVignette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  strength = 0.55
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Normalised distance from centre (-1 to 1 in each axis)
      const nx = (x / width  - 0.5) * 2;
      const ny = (y / height - 0.5) * 2;

      // Elliptical falloff — slightly wider than tall (portrait-friendly)
      const dist = Math.sqrt(nx * nx * 0.82 + ny * ny * 1.18);

      // Smooth cubic: gentle in the middle, dark at corners
      const t = Math.min(1, dist * 0.88);
      const vig = 1 - strength * t * t * (3 - 2 * t);

      const i = (y * width + x) * 4;
      pixels[i]     = Math.min(255, Math.max(0, Math.round(pixels[i]     * vig)));
      pixels[i + 1] = Math.min(255, Math.max(0, Math.round(pixels[i + 1] * vig)));
      pixels[i + 2] = Math.min(255, Math.max(0, Math.round(pixels[i + 2] * vig)));
    }
  }
}

// ---------------------------------------------------------------------------
// Halation (warm highlight bloom)
// ---------------------------------------------------------------------------

/**
 * Adds a warm orange-red glow to the brightest highlights.
 * Mimics light bleeding through film emulsion layers.
 * Reference photos show clear warm glow on skin and bright areas.
 */
export function applyHalation(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  strength = 0.35
): void {
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4]     / 255;
    const g = pixels[i * 4 + 1] / 255;
    const b = pixels[i * 4 + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Only affects pixels above 68% brightness
    if (lum <= 0.68) continue;

    // Quadratic ramp: smooth onset at 0.68, full at 1.0
    const t = ((lum - 0.68) / 0.32) ** 2;
    const glow = t * strength;

    // Warm orange-red tint (matches reference photo highlight warmth)
    pixels[i * 4]     = Math.min(255, Math.round(pixels[i * 4]     + glow * 32));
    pixels[i * 4 + 1] = Math.min(255, Math.round(pixels[i * 4 + 1] + glow * 12));
    pixels[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(pixels[i * 4 + 2] - glow * 12)));
  }
}

// ---------------------------------------------------------------------------
// Film grain
// ---------------------------------------------------------------------------

/**
 * Adds luminance-weighted noise that mimics real film grain.
 * amount 15 gives clearly visible grain matching the reference photos.
 * Grain is strongest in midtones, tapering off in deep shadows and highlights.
 */
export function applyGrain(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 15
): void {
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4]     / 255;
    const g = pixels[i * 4 + 1] / 255;
    const b = pixels[i * 4 + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Grain envelope peaks at lum ~0.38 — mimics real film grain distribution
    const envelope = amount * (4.8 * lum * Math.pow(1 - lum, 1.3));

    // Per-channel variation for slight colour grain (more film-authentic)
    const noiseR = (Math.random() - 0.5) * envelope;
    const noiseG = (Math.random() - 0.5) * envelope * 0.90;
    const noiseB = (Math.random() - 0.5) * envelope * 0.95;

    pixels[i * 4]     = Math.min(255, Math.max(0, Math.round(pixels[i * 4]     + noiseR)));
    pixels[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(pixels[i * 4 + 1] + noiseG)));
    pixels[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(pixels[i * 4 + 2] + noiseB)));
  }
}
