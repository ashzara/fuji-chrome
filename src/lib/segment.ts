/**
 * Background segmentation using MediaPipe Selfie Segmentation.
 * Loaded from CDN at runtime — no npm package needed.
 *
 * Returns a Float32Array mask where 1 = foreground (keep sharp) and 0 = background (blur).
 * Falls back to a soft-ellipse centre mask if MediaPipe fails to load.
 */

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SelfieSegmentation: any;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let segmenter: any = null;
let loadPromise: Promise<void> | null = null;

export async function initSegmenter(): Promise<void> {
  if (segmenter) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/selfie_segmentation.js"
      );

      const instance = new window.SelfieSegmentation({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/${file}`,
      });

      instance.setOptions({ modelSelection: 1 });
      await instance.initialize();
      segmenter = instance;
    } catch (err) {
      console.warn("MediaPipe failed to load, will use fallback mask.", err);
      segmenter = null;
    }
  })();

  return loadPromise;
}

export async function segmentImage(imageData: ImageData): Promise<Float32Array> {
  if (!segmenter) return centerMask(imageData.width, imageData.height);

  const { width, height } = imageData;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve) => {
    segmenter.onResults((results: { segmentationMask: ImageBitmap }) => {
      try {
        const maskCanvas = new OffscreenCanvas(width, height);
        const mCtx = maskCanvas.getContext("2d")!;
        mCtx.drawImage(results.segmentationMask, 0, 0, width, height);
        const maskData = mCtx.getImageData(0, 0, width, height).data;

        const mask = new Float32Array(width * height);
        for (let i = 0; i < mask.length; i++) {
          // MediaPipe segmentation mask: red channel holds the confidence
          mask[i] = maskData[i * 4] / 255;
        }
        resolve(mask);
      } catch {
        resolve(centerMask(width, height));
      }
    });

    // Convert OffscreenCanvas to HTMLCanvasElement-compatible object
    const imgBitmap = canvas.transferToImageBitmap();
    segmenter.send({ image: imgBitmap }).catch(() => {
      resolve(centerMask(width, height));
    });
  });
}

// ---------------------------------------------------------------------------
// Fallback: smooth ellipse centred slightly above mid-frame (typical portrait)
// ---------------------------------------------------------------------------

function centerMask(w: number, h: number): Float32Array {
  const mask = new Float32Array(w * h);
  const cx = 0.5;
  const cy = 0.42;
  const rx = 0.38;
  const ry = 0.48;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / w - cx) / rx;
      const ny = (y / h - cy) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      // Smooth falloff between 0.7 and 1.0 of the ellipse radius
      mask[y * w + x] = 1 - Math.max(0, Math.min(1, (d - 0.7) / 0.3));
    }
  }

  return mask;
}

// ---------------------------------------------------------------------------
// Script loader helper
// ---------------------------------------------------------------------------

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.crossOrigin = "anonymous";
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}
