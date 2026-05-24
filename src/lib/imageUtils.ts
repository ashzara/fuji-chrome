export async function fileToImageData(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function resizeImageData(src: ImageData, targetW: number, targetH: number): ImageData {
  const srcCanvas = new OffscreenCanvas(src.width, src.height);
  srcCanvas.getContext("2d")!.putImageData(src, 0, 0);
  const dstCanvas = new OffscreenCanvas(targetW, targetH);
  const dstCtx = dstCanvas.getContext("2d")!;
  dstCtx.drawImage(srcCanvas, 0, 0, targetW, targetH);
  return dstCtx.getImageData(0, 0, targetW, targetH);
}

export function imageDataToBlob(data: ImageData): Promise<Blob> {
  const canvas = new OffscreenCanvas(data.width, data.height);
  canvas.getContext("2d")!.putImageData(data, 0, 0);
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
}

function lutToBase64(lut: Float32Array): string {
  const bytes = new Uint8Array(lut.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToLut(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export async function fetchDeployedLUT(): Promise<Float32Array | null> {
  try {
    const res = await fetch("/lut.json", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.lut) return null;
    return base64ToLut(data.lut);
  } catch {
    return null;
  }
}

const LUT_KEY = "fuji_lut_v1";

export function saveLUT(lut: Float32Array): void {
  localStorage.setItem(LUT_KEY, lutToBase64(lut));
}

export function loadSavedLUT(): Float32Array | null {
  const stored = localStorage.getItem(LUT_KEY);
  if (!stored) return null;
  try {
    return base64ToLut(stored);
  } catch {
    return null;
  }
}

export function clearSavedLUT(): void {
  localStorage.removeItem(LUT_KEY);
}

export function downloadLUTFile(lut: Float32Array): void {
  const json = JSON.stringify({ lut: lutToBase64(lut) });
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lut.json";
  a.click();
  URL.revokeObjectURL(url);
}
