/**
 * Subject/background separation — creates the "flash photography" look.
 *
 * Effect:
 *  • Background: darkened to ~35% brightness + subtle blur (recedes into dark)
 *  • Subject:    brightness-boosted + slight warm flash tint (pops forward)
 *
 * This is what makes a photo look like it was taken with a point-and-shoot
 * flash camera or a disposable film camera in low/mixed light.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function applySubjectFlash(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  foregroundMask: Float32Array,
  options: {
    blurStrength?: number;   // background blur radius in px (default 10)
    bgDarken?: number;       // background multiplier  — 0.35 = 65% darker (default)
    subjectBoost?: number;   // subject brightness multiplier (default 1.10)
  } = {},
  onProgress?: (pct: number) => void
): Promise<Uint8ClampedArray> {
  const {
    blurStrength  = 10,
    bgDarken      = 0.35,
    subjectBoost  = 1.10,
  } = options;

  // 1. Feather mask for smooth subject/background edge
  const mask = featherMask(foregroundMask, width, height);
  onProgress?.(20);

  // 2. GPU Gaussian blur for background (no pixelation)
  const src = new OffscreenCanvas(width, height);
  src.getContext("2d")!.putImageData(
    new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0
  );
  const blurred = new OffscreenCanvas(width, height);
  const bCtx    = blurred.getContext("2d")!;
  bCtx.filter   = `blur(${blurStrength}px)`;
  bCtx.drawImage(src, 0, 0);
  const blurData = bCtx.getImageData(0, 0, width, height).data;
  onProgress?.(65);

  // 3. Composite: subject (boosted+warm) × mask  +  background (darkened+blurred) × (1−mask)
  const result = new Uint8ClampedArray(pixels.length);

  for (let i = 0; i < width * height; i++) {
    const m   = mask[i];
    const inv = 1 - m;

    // Subject layer — boost brightness, add subtle flash warmth on highlights
    const lum = (pixels[i * 4] * 0.2126 + pixels[i * 4 + 1] * 0.7152 + pixels[i * 4 + 2] * 0.0722) / 255;
    const flashWarm = lum * lum * 0.07;   // warm only the brighter areas (quadratic)

    const sR = Math.min(255, pixels[i * 4]     * subjectBoost + flashWarm * 255 * 0.55);
    const sG = Math.min(255, pixels[i * 4 + 1] * subjectBoost + flashWarm * 255 * 0.20);
    const sB = Math.max(0,   pixels[i * 4 + 2] * subjectBoost - flashWarm * 255 * 0.25);

    // Background layer — darkened and blurred
    const bR = blurData[i * 4]     * bgDarken;
    const bG = blurData[i * 4 + 1] * bgDarken;
    const bB = blurData[i * 4 + 2] * bgDarken;

    result[i * 4]     = Math.min(255, Math.max(0, Math.round(sR * m + bR * inv)));
    result[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(sG * m + bG * inv)));
    result[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(sB * m + bB * inv)));
    result[i * 4 + 3] = pixels[i * 4 + 3];
  }

  onProgress?.(100);
  return result;
}

// ---------------------------------------------------------------------------
// Mask feathering — smooth the segmentation edge at 40% resolution
// ---------------------------------------------------------------------------

function featherMask(mask: Float32Array, w: number, h: number): Float32Array {
  const SCALE = 0.40;
  const sw    = Math.max(1, Math.round(w * SCALE));
  const sh    = Math.max(1, Math.round(h * SCALE));

  const small = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(w - 1, Math.round(x / SCALE));
      const sy = Math.min(h - 1, Math.round(y / SCALE));
      small[y * sw + x] = mask[sy * w + sx];
    }
  }

  const RADIUS = 8;
  const tmp     = boxBlur1D(small, sw, sh, RADIUS, true);
  const blurred = boxBlur1D(tmp,   sw, sh, RADIUS, false);

  const result = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(sw - 1, Math.round(x * SCALE));
      const sy = Math.min(sh - 1, Math.round(y * SCALE));
      result[y * w + x] = blurred[sy * sw + sx];
    }
  }
  return result;
}

function boxBlur1D(
  src: Float32Array,
  w: number, h: number,
  radius: number,
  horizontal: boolean
): Float32Array {
  const dst  = new Float32Array(src.length);
  const span = 2 * radius + 1;

  if (horizontal) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -radius; x < radius; x++)
        sum += src[y * w + Math.max(0, Math.min(w - 1, x))];
      for (let x = 0; x < w; x++) {
        sum += src[y * w + Math.min(w - 1, x + radius)];
        sum -= src[y * w + Math.max(0, x - radius - 1)];
        dst[y * w + x] = sum / span;
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -radius; y < radius; y++)
        sum += src[Math.max(0, Math.min(h - 1, y)) * w + x];
      for (let y = 0; y < h; y++) {
        sum += src[Math.min(h - 1, y + radius) * w + x];
        sum -= src[Math.max(0, y - radius - 1) * w + x];
        dst[y * w + x] = sum / span;
      }
    }
  }
  return dst;
}
