/**
 * Background segmentation using MediaPipe Selfie Segmentation.
 * Loaded from CDN — no npm package needed, no bundler issues.
 * Returns a Float32Array mask: 1 = foreground (keep sharp), 0 = background (blur).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { SelfieSegmentation: any }
}

let segInstance: any = null

async function loadScript(src: string): Promise<void> {
  if (document.querySelector(`script[src="${src}"]`)) return
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

export async function initSegmenter(): Promise<void> {
  if (segInstance) return
  await loadScript(
    'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js'
  )
  segInstance = new window.SelfieSegmentation({
    locateFile: (f: string) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`,
  })
  segInstance.setOptions({ modelSelection: 1, selfieMode: false })

  // Warm up so first real photo is fast
  await new Promise<void>((resolve) => {
    segInstance.onResults(() => resolve())
    const dummy = document.createElement('canvas')
    dummy.width = 64; dummy.height = 64
    segInstance.send({ image: dummy })
  })
}

export async function segmentImage(imageData: ImageData): Promise<Float32Array> {
  try {
    if (!segInstance) await initSegmenter()
    const canvas = document.createElement('canvas')
    canvas.width = imageData.width
    canvas.height = imageData.height
    canvas.getContext('2d')!.putImageData(imageData, 0, 0)

    return await new Promise<Float32Array>((resolve) => {
      segInstance.onResults((results: any) => {
        try {
          const maskCanvas = results.segmentationMask as HTMLCanvasElement
          const data = maskCanvas.getContext('2d')!
            .getImageData(0, 0, maskCanvas.width, maskCanvas.height).data
          const mask = new Float32Array(imageData.width * imageData.height)
          for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4] / 255
          resolve(mask)
        } catch {
          resolve(centerMask(imageData.width, imageData.height))
        }
      })
      segInstance.send({ image: canvas })
    })
  } catch {
    // Fallback: soft elliptical center mask
    return centerMask(imageData.width, imageData.height)
  }
}

/** Fallback when segmentation is unavailable — soft ellipse centred on the frame */
function centerMask(w: number, h: number): Float32Array {
  const mask = new Float32Array(w * h)
  const cx = w * 0.5, cy = h * 0.42
  const rx = w * 0.32, ry = h * 0.42
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry
      mask[y * w + x] = Math.max(0, Math.min(1, 1 - Math.sqrt(dx * dx + dy * dy)))
    }
  }
  return mask
}
