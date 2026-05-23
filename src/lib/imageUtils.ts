/** Load a File into an ImageData object, respecting EXIF orientation. */
export async function fileToImageData(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Resize an ImageData to new dimensions using a hidden canvas. */
export function resizeImageData(
  src: ImageData,
  targetW: number,
  targetH: number
): ImageData {
  const srcCanvas = new OffscreenCanvas(src.width, src.height);
  srcCanvas.getContext("2d")!.putImageData(src, 0, 0);
  const dstCanvas = new OffscreenCanvas(targetW, targetH);
  const dstCtx = dstCanvas.getContext("2d")!;
  dstCtx.drawImage(srcCanvas, 0, 0, targetW, targetH);
  return dstCtx.getImageData(0, 0, targetW, targetH);
}

/** Export an ImageData as a JPEG Blob. */
export function imageDataToBlob(data: ImageData): Promise<Blob> {
  const canvas = new OffscreenCanvas(data.width, data.height);
  canvas.getContext("2d")!.putImageData(data, 0, 0);
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
}

// ---------------------------------------------------------------------------
// LUT persistence (localStorage)
// ---------------------------------------------------------------------------
const LUT_KEY = "fuji_lut_v1";

export function saveLUT(lut: Float32Array): void {
  const bytes = new Uint8Array(lut.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  localStorage.setItem(LUT_KEY, btoa(binary));
}

export function loadSavedLUT(): Float32Array | null {
  const stored = localStorage.getItem(LUT_KEY);
  if (!stored) return null;
  try {
    const binary = atob(stored);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  } catch {
    return null;
  }
}

export function clearSavedLUT(): void {
  localStorage.removeItem(LUT_KEY);
}
