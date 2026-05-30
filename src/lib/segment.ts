/**
 * Background segmentation using MediaPipe Selfie Segmentation.
 * Loaded from CDN at runtime — no npm package needed.
 *
 * Returns a Float32Array mask where 1 = foreground (subject) and 0 = background.
 * Falls back to a wide soft-ellipse centre mask if MediaPipe fails to load.
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
      console.warn("MediaPipe failed to load, using fallback mask.", err);
      segmenter = null;
    }
  })();

  return loadPromise;
}

export async function segmentImage(imageData: ImageData): Promise<Float32Array> {
  if (!segmenter) return centerMask(imageData.width, imageData.height);

  const { width, height } = imageData;
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")!.putImageData(imageData, 0, 0);

  return new Promise((resolve) => {
    segmenter.onResults((results: { segmentationMask: ImageBitmap }) => {
      try {
        const maskCanvas = new OffscreenCanvas(width, height);
        const mCtx = maskCanvas.getContext("2d")!;
        mCtx.drawImage(results.segmentationMask, 0, 0, width, height);
        const maskData = mCtx.getImageData(0, 0, width, height).data;

        const mask = new Float32Array(width * height);
        for (let i = 0; i < mask.length; i++) {
          mask[i] = maskData[i * 4] / 255;
        }
        resolve(mask);
      } catch {
        resolve(centerMask(width, height));
      }
    });

    const imgBitmap = canvas.transferToImageBitmap();
    segmenter.send({ image: imgBitmap }).catch(() => {
      resolve(centerMask(width, height));
    });
  });
}

// ---------------------------------------------------------------------------
// Fallback: wide soft ellipse — covers most portrait/selfie compositions
// Subject is assumed to be roughly centred, slightly above the midpoint.
// The very gradual falloff means the transition looks natural even without
// a precise segmentation mask.
// ---------------------------------------------------------------------------

function centerMask(w: number, h: number): Float32Array {
  const mask = new Float32Array(w * h);
  const cx = 0.50;   // horizontal centre
  const cy = 0.42;   // slightly above vertical centre (typical portrait)
  const rx = 0.48;   // wide — covers most of the horizontal frame
  const ry = 0.56;   // tall

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / w - cx) / rx;
      const ny = (y / h - cy) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      // Gradual falloff: full opacity inside 0.55, fades to 0 by 1.05
      mask[y * w + x] = 1 - Math.max(0, Math.min(1, (d - 0.55) / 0.50));
    }
  }
  return mask;
}

// ---------------------------------------------------------------------------
// Script loader
// ---------------------------------------------------------------------------

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const el = document.createElement("script");
    el.src = src;
    el.crossOrigin = "anonymous";
    el.onload  = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}
