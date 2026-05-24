/**
 * Film-finishing effects applied after the LUT.
 * All functions mutate the pixel array in place.
 *
 *  applyHalation  — warm golden glow on bright highlights (film light bleed)
 *  applyVignette  — subtle dark-edge falloff (cinematic framing, not crushing)
 *  applyGrain     — luminance-weighted film grain
 */

// ---------------------------------------------------------------------------
// Halation (warm highlight glow) — applied BEFORE vignette so bright areas
// glow warmly even near edges
// ---------------------------------------------------------------------------

/**
 * Adds a warm orange-gold glow to bright highlights.
 * This is the "flashlight / glowing" effect from film emulsion light bleed.
 * strength 0.55 makes it clearly visible like the reference photos.
 */
export function applyHalation(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  strength = 0.55
): void {
  for (let i = 0; i < width * height; i++) {
    const r   = pixels[i * 4]     / 255;
    const g   = pixels[i * 4 + 1] / 255;
    const b   = pixels[i * 4 + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Glow starts at 60% brightness so it's visible in more of the image
    if (lum <= 0.60) continue;

    // Quadratic ramp: 0 at lum=0.60, 1 at lum=1.0
    const t    = ((lum - 0.60) / 0.40) ** 2;
    const glow = t * strength;

    // Warm golden-orange tint — matches the "glowing skin" look in references
    pixels[i * 4]     = Math.min(255, Math.round(pixels[i * 4]     + glow * 38));  // red
    pixels[i * 4 + 1] = Math.min(255, Math.round(pixels[i * 4 + 1] + glow * 18));  // green (golden)
    pixels[i * 4 + 2] = Math.min(255, Math.max(0,
                        Math.round(pixels[i * 4 + 2] - glow * 14)));              // pull blue
  }
}

// ---------------------------------------------------------------------------
// Vignette — subtle, does NOT crush the image
// ---------------------------------------------------------------------------

/**
 * Gently darkens edges.
 * strength 0.38 gives a soft cinematic frame without making the image dark.
 * (Previous 0.55 was too heavy — it was the main cause of "too dark" result.)
 */
export function applyVignette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  strength = 0.38
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x / width  - 0.5) * 2;
      const ny = (y / height - 0.5) * 2;

      // Slightly wider ellipse — portrait-friendly
      const dist = Math.sqrt(nx * nx * 0.80 + ny * ny * 1.20);

      // Smooth cubic — only kicks in near edges, very gentle in the centre
      const t   = Math.min(1, dist * 0.90);
      const vig = 1 - strength * t * t * (3 - 2 * t);

      const i = (y * width + x) * 4;
      pixels[i]     = Math.min(255, Math.max(0, Math.round(pixels[i]     * vig)));
      pixels[i + 1] = Math.min(255, Math.max(0, Math.round(pixels[i + 1] * vig)));
      pixels[i + 2] = Math.min(255, Math.max(0, Math.round(pixels[i + 2] * vig)));
    }
  }
}

// ---------------------------------------------------------------------------
// Film grain
// ---------------------------------------------------------------------------

/**
 * Luminance-weighted grain. Strongest in midtones, tapers in shadows/highlights.
 * amount 13 is clearly visible but not overwhelming.
 */
export function applyGrain(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 13
): void {
  for (let i = 0; i < width * height; i++) {
    const r   = pixels[i * 4]     / 255;
    const g   = pixels[i * 4 + 1] / 255;
    const b   = pixels[i * 4 + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Grain peaks around lum 0.38 — classic film grain behaviour
    const env = amount * (4.8 * lum * Math.pow(1 - lum, 1.3));

    const nR = (Math.random() - 0.5) * env;
    const nG = (Math.random() - 0.5) * env * 0.90;
    const nB = (Math.random() - 0.5) * env * 0.95;

    pixels[i * 4]     = Math.min(255, Math.max(0, Math.round(pixels[i * 4]     + nR)));
    pixels[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(pixels[i * 4 + 1] + nG)));
    pixels[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(pixels[i * 4 + 2] + nB)));
  }
}
