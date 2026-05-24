/**
 * Hex-aperture bokeh blur for background separation.
 *
 * Pipeline:
 *  1. Feather the segmentation mask to get smooth subject edges
 *  2. Downscale image to 28% for fast bokeh computation
 *  3. Three directional line-blurs at 0°, 60°, 120° (hex aperture shape)
 *  4. Highlight bloom: brighten blurred highlights for lens realism
 *  5. Chromatic aberration: slight R/B channel offset
 *  6. Upscale blurred result back to original size
 *  7. Composite: sharp × mask + blurred × (1 − mask)
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function applyBokehBlur(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  foregroundMask: Float32Array,
  strength = 22,
  onProgress?: (pct: number) => void
): Promise<Uint8ClampedArray> {
  // 1. Feather mask
  const feathered = featherMask(foregroundMask, width, height);
  onProgress?.(15);

  // 2. Downscale for bokeh (28% resolution)
  const SCALE = 0.28;
  const bw = Math.max(1, Math.round(width * SCALE));
  const bh = Math.max(1, Math.round(height * SCALE));
  const small = downscale(pixels, width, height, bw, bh);
  onProgress?.(30);

  // 3. Hex bokeh on downscaled image
  const bokehRadius = Math.max(2, Math.round(strength * SCALE));
  let blurred = hexBokeh(small, bw, bh, bokehRadius);
  onProgress?.(70);

  // 4. Chromatic aberration on blurred version
  const caShift = Math.max(1, Math.round(strength * SCALE * 0.15));
  blurred = addCA(blurred, bw, bh, caShift);
  onProgress?.(80);

  // 5. Upscale blurred back to full size
  const blurredFull = upscale(blurred, bw, bh, width, height);
  onProgress?.(90);

  // 6. Composite
  const result = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < width * height; i++) {
    const m = feathered[i];          // 1 = sharp subject, 0 = blurred background
    const inv = 1 - m;
    result[i * 4]     = Math.round(pixels[i * 4]     * m + blurredFull[i * 4]     * inv);
    result[i * 4 + 1] = Math.round(pixels[i * 4 + 1] * m + blurredFull[i * 4 + 1] * inv);
    result[i * 4 + 2] = Math.round(pixels[i * 4 + 2] * m + blurredFull[i * 4 + 2] * inv);
    result[i * 4 + 3] = pixels[i * 4 + 3];
  }
  onProgress?.(100);

  return result;
}

// ---------------------------------------------------------------------------
// Mask feathering — smooth the hard segmentation edge
// ---------------------------------------------------------------------------

function featherMask(mask: Float32Array, w: number, h: number): Float32Array {
  // Work at 18% resolution for speed
  const SCALE = 0.18;
  const sw = Math.max(1, Math.round(w * SCALE));
  const sh = Math.max(1, Math.round(h * SCALE));

  // Downscale mask
  const small = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const sx = Math.round(x / SCALE);
      const sy = Math.round(y / SCALE);
      small[y * sw + x] = mask[Math.min(sy, h - 1) * w + Math.min(sx, w - 1)];
    }
  }

  // Separable box blur (radius 10 iterations × 2 passes)
  const RADIUS = 10;
  const tmp = boxBlur1D(small, sw, sh, RADIUS, true);
  const blurred = boxBlur1D(tmp, sw, sh, RADIUS, false);

  // Upscale back
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
  const dst = new Float32Array(src.length);
  const span = 2 * radius + 1;

  if (horizontal) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -radius; x < radius; x++) {
        sum += src[y * w + Math.max(0, Math.min(w - 1, x))];
      }
      for (let x = 0; x < w; x++) {
        sum += src[y * w + Math.min(w - 1, x + radius)];
        sum -= src[y * w + Math.max(0, x - radius - 1)];
        dst[y * w + x] = sum / span;
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -radius; y < radius; y++) {
        sum += src[Math.max(0, Math.min(h - 1, y)) * w + x];
      }
      for (let y = 0; y < h; y++) {
        sum += src[Math.min(h - 1, y + radius) * w + x];
        sum -= src[Math.max(0, y - radius - 1) * w + x];
        dst[y * w + x] = sum / span;
      }
    }
  }
  return dst;
}

// ---------------------------------------------------------------------------
// Hex aperture bokeh — three directional line blurs
// ---------------------------------------------------------------------------

function hexBokeh(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
): Uint8ClampedArray {
  // Three passes at 0°, 60°, 120° — averaged together
  const p0   = lineBlur(pixels, w, h, radius, 0);
  const p60  = lineBlur(pixels, w, h, radius, 60);
  const p120 = lineBlur(pixels, w, h, radius, 120);

  const result = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const avg = (p0[i + c] + p60[i + c] + p120[i + c]) / 3;
      const peak = Math.max(p0[i + c], p60[i + c], p120[i + c]);
      const brightness = avg / 255;
      // Highlight bloom: brighter pixels get more glow
      result[i + c] = Math.min(255, Math.round(avg + (peak - avg) * brightness * 0.55));
    }
    result[i + 3] = pixels[i + 3];
  }
  return result;
}

function lineBlur(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
  angleDeg: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(pixels.length);
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let s = -radius; s <= radius; s++) {
        const sx = Math.round(x + dx * s);
        const sy = Math.round(y + dy * s);
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
        const idx = (sy * w + sx) * 4;
        rSum += pixels[idx];
        gSum += pixels[idx + 1];
        bSum += pixels[idx + 2];
        count++;
      }
      const out = (y * w + x) * 4;
      if (count > 0) {
        result[out]     = rSum / count;
        result[out + 1] = gSum / count;
        result[out + 2] = bSum / count;
      }
      result[out + 3] = pixels[out + 3];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Chromatic aberration — subtle R/B channel lateral shift
// ---------------------------------------------------------------------------

function addCA(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  shift: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(pixels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const out = (y * w + x) * 4;
      // Red channel: shift left
      const rSrc = Math.max(0, x - shift);
      result[out] = pixels[(y * w + rSrc) * 4];
      // Blue channel: shift right
      const bSrc = Math.min(w - 1, x + shift);
      result[out + 2] = pixels[(y * w + bSrc) * 4 + 2];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Nearest-neighbour scale helpers
// ---------------------------------------------------------------------------

function downscale(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.round((x / dstW) * srcW));
      const sy = Math.min(srcH - 1, Math.round((y / dstH) * srcH));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      dst[di]     = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return dst;
}

function upscale(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.round((x / dstW) * srcW));
      const sy = Math.min(srcH - 1, Math.round((y / dstH) * srcH));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      dst[di]     = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return dst;
}
