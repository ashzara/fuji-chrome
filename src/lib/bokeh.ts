/**
 * Background bokeh blur using the browser's built-in canvas filter.
 *
 * Previous approach (directional line blurs at 28% resolution) caused:
 *  - Pixelation from aggressive downscaling + nearest-neighbour upscale
 *  - Directional smear artefacts from line blurs
 *
 * This version uses OffscreenCanvas `filter: blur(Xpx)` which is:
 *  - Hardware-accelerated (GPU Gaussian blur)
 *  - Smooth, no pixelation
 *  - Full resolution — no downscale/upscale step
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function applyBokehBlur(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  foregroundMask: Float32Array,
  strength = 16,
  onProgress?: (pct: number) => void
): Promise<Uint8ClampedArray> {

  // 1. Feather mask edges for smooth subject/background transition
  const feathered = featherMask(foregroundMask, width, height);
  onProgress?.(20);

  // 2. GPU Gaussian blur via canvas filter — clean, no pixelation
  const src = new OffscreenCanvas(width, height);
  src.getContext("2d")!.putImageData(
    new ImageData(new Uint8ClampedArray(pixels), width, height),
    0, 0
  );

  const blurred = new OffscreenCanvas(width, height);
  const bCtx = blurred.getContext("2d")!;
  bCtx.filter = `blur(${Math.round(strength)}px)`;
  bCtx.drawImage(src, 0, 0);

  const blurData = bCtx.getImageData(0, 0, width, height).data;
  onProgress?.(80);

  // 3. Composite: sharp × mask  +  blurred × (1 − mask)
  const result = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < width * height; i++) {
    const m   = feathered[i];     // 1 = keep sharp, 0 = use blur
    const inv = 1 - m;
    result[i * 4]     = Math.round(pixels[i * 4]     * m + blurData[i * 4]     * inv);
    result[i * 4 + 1] = Math.round(pixels[i * 4 + 1] * m + blurData[i * 4 + 1] * inv);
    result[i * 4 + 2] = Math.round(pixels[i * 4 + 2] * m + blurData[i * 4 + 2] * inv);
    result[i * 4 + 3] = pixels[i * 4 + 3];
  }
  onProgress?.(100);

  return result;
}

// ---------------------------------------------------------------------------
// Mask feathering — smooth the hard segmentation edge at 40% resolution
// ---------------------------------------------------------------------------

function featherMask(mask: Float32Array, w: number, h: number): Float32Array {
  const SCALE  = 0.40;   // higher than before → less blockiness
  const sw = Math.max(1, Math.round(w * SCALE));
  const sh = Math.max(1, Math.round(h * SCALE));

  // Downscale
  const small = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(w - 1, Math.round(x / SCALE));
      const sy = Math.min(h - 1, Math.round(y / SCALE));
      small[y * sw + x] = mask[sy * w + sx];
    }
  }

  // Two-pass separable box blur
  const RADIUS = 8;
  const tmp     = boxBlur1D(small, sw, sh, RADIUS, true);
  const blurred = boxBlur1D(tmp,   sw, sh, RADIUS, false);

  // Upscale back to full resolution
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
  w: number,
  h: number,
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
        sum -= src[y * w + Math.max(0,     x - radius - 1)];
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
        sum -= src[Math.max(0,     y - radius - 1) * w + x];
        dst[y * w + x] = sum / span;
      }
    }
  }
  return dst;
}
