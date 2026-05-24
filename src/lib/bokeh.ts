/**
 * Hex-aperture bokeh blur.
 *
 * Simulates a camera's hexagonal aperture by applying three 1-D line blurs
 * at 0°, 60° and 120°, then combining them with a highlight-bloom blend.
 * Adds subtle chromatic aberration for a real-lens feel.
 * All heavy work is done at 28 % resolution then upscaled — fast enough in JS.
 */

const SCALE = 0.28 // downscale factor for blur pass

export async function applyBokehBlur(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  foregroundMask: Float32Array, // 1 = keep sharp, 0 = blur
  strength = 24,
  onProgress?: (n: number) => void
): Promise<Uint8ClampedArray> {

  // 1. Feather mask edges for a smooth transition
  const mask = featherMask(foregroundMask, width, height)
  onProgress?.(15)

  // 2. Hex bokeh on a downscaled copy
  const sw = Math.round(width * SCALE)
  const sh = Math.round(height * SCALE)
  const radius = Math.max(3, Math.round(strength * SCALE))
  const small = downscale(pixels, width, height, sw, sh)

  // Pre-compute direction offsets (0°, 60°, 120°)
  const dirs = [0, Math.PI / 3, 2 * Math.PI / 3].map(a => {
    const offsets: [number, number][] = []
    for (let r = -radius; r <= radius; r++)
      offsets.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)])
    return offsets
  })

  const b0   = lineBlur(small, sw, sh, dirs[0])
  onProgress?.(35)
  const b60  = lineBlur(small, sw, sh, dirs[1])
  onProgress?.(50)
  const b120 = lineBlur(small, sw, sh, dirs[2])
  onProgress?.(62)

  // Combine: average + highlight bloom (bright = hex bokeh balls)
  const combined = new Uint8ClampedArray(small.length)
  for (let i = 0; i < combined.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const avg  = (b0[i+c] + b60[i+c] + b120[i+c]) / 3
      const peak = Math.max(b0[i+c], b60[i+c], b120[i+c])
      const bright = avg / 255
      combined[i+c] = Math.min(255, Math.round(avg + (peak - avg) * bright * 0.55))
    }
    combined[i+3] = 255
  }
  onProgress?.(70)

  // Upscale blurred image back
  const blurred = upscale(combined, sw, sh, width, height)
  onProgress?.(78)

  // 3. Chromatic aberration on blurred regions only
  addCA(blurred, width, height, 3)
  onProgress?.(84)

  // 4. Composite: sharp × mask + blurred × (1-mask)
  const result = new Uint8ClampedArray(pixels.length)
  for (let i = 0; i < width * height; i++) {
    const m = mask[i]
    result[i*4]   = Math.round(pixels[i*4]   * m + blurred[i*4]   * (1-m))
    result[i*4+1] = Math.round(pixels[i*4+1] * m + blurred[i*4+1] * (1-m))
    result[i*4+2] = Math.round(pixels[i*4+2] * m + blurred[i*4+2] * (1-m))
    result[i*4+3] = 255
  }
  onProgress?.(100)
  return result
}

// ─────────────────────────────────────────────────────────────────────────────

function lineBlur(
  pixels: Uint8ClampedArray, w: number, h: number,
  offsets: [number, number][]
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length)
  const n = offsets.length
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sR = 0, sG = 0, sB = 0
      for (const [dx, dy] of offsets) {
        const nx = Math.min(w-1, Math.max(0, x+dx))
        const ny = Math.min(h-1, Math.max(0, y+dy))
        const si = (ny*w + nx) * 4
        sR += pixels[si]; sG += pixels[si+1]; sB += pixels[si+2]
      }
      const di = (y*w + x) * 4
      out[di]   = sR/n; out[di+1] = sG/n; out[di+2] = sB/n; out[di+3] = 255
    }
  }
  return out
}

function addCA(pixels: Uint8ClampedArray, w: number, h: number, shift: number): void {
  const orig = pixels.slice()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i  = (y*w + x) * 4
      const rI = (y*w + Math.max(0, x-shift)) * 4
      const bI = (y*w + Math.min(w-1, x+shift)) * 4
      pixels[i]   = orig[rI]     // R: shift left
      pixels[i+2] = orig[bI+2]   // B: shift right
    }
  }
}

function featherMask(mask: Float32Array, w: number, h: number): Float32Array {
  // Blur at 18% res for performance, then upscale
  const sw = Math.round(w * 0.18), sh = Math.round(h * 0.18)
  const small = new Float32Array(sw * sh)
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++)
      small[y*sw+x] = mask[Math.round(y*h/sh)*w + Math.round(x*w/sw)]

  const r = 10
  const tmp = new Float32Array(sw * sh)
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      let s = 0
      for (let d = -r; d <= r; d++) s += small[y*sw + Math.min(sw-1, Math.max(0, x+d))]
      tmp[y*sw+x] = s / (r*2+1)
    }
  const blurred = new Float32Array(sw * sh)
  for (let x = 0; x < sw; x++)
    for (let y = 0; y < sh; y++) {
      let s = 0
      for (let d = -r; d <= r; d++) s += tmp[Math.min(sh-1, Math.max(0, y+d))*sw+x]
      blurred[y*sw+x] = s / (r*2+1)
    }

  const result = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      result[y*w+x] = blurred[Math.min(sh-1, Math.round(y*sh/h))*sw + Math.min(sw-1, Math.round(x*sw/w))]
  return result
}

function downscale(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number) {
  const out = new Uint8ClampedArray(dw*dh*4)
  const xr = sw/dw, yr = sh/dh
  for (let y = 0; y < dh; y++)
    for (let x = 0; x < dw; x++) {
      const si = (Math.min(sh-1, Math.floor(y*yr))*sw + Math.min(sw-1, Math.floor(x*xr))) * 4
      const di = (y*dw+x)*4
      out[di]=src[si]; out[di+1]=src[si+1]; out[di+2]=src[si+2]; out[di+3]=255
    }
  return out
}

function upscale(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number) {
  const out = new Uint8ClampedArray(dw*dh*4)
  const xr = sw/dw, yr = sh/dh
  for (let y = 0; y < dh; y++)
    for (let x = 0; x < dw; x++) {
      const si = (Math.min(sh-1, Math.floor(y*yr))*sw + Math.min(sw-1, Math.floor(x*xr))) * 4
      const di = (y*dw+x)*4
      out[di]=src[si]; out[di+1]=src[si+1]; out[di+2]=src[si+2]; out[di+3]=255
    }
  return out
}
