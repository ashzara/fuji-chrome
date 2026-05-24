/**
 * Full input normalisation pipeline — mutates the pixel array in-place.
 */
export function normalizeExposure(pixels: Uint8ClampedArray): void {
  const n = pixels.length / 4;
  if (n === 0) return;

  // 1. White balance — neutralises warm/cool/orange casts
  const step = 3;
  const rArr: number[] = [];
  const gArr: number[] = [];
  const bArr: number[] = [];

  for (let i = 0; i < n; i += step) {
    rArr.push(pixels[i * 4]);
    gArr.push(pixels[i * 4 + 1]);
    bArr.push(pixels[i * 4 + 2]);
  }

  rArr.sort((a, b) => a - b);
  gArr.sort((a, b) => a - b);
  bArr.sort((a, b) => a - b);

  const pIdx = Math.floor(0.95 * rArr.length);
  const r95 = rArr[pIdx] || 1;
  const g95 = gArr[pIdx] || 1;
  const b95 = bArr[pIdx] || 1;
  const wb_target = (r95 + g95 + b95) / 3;

  const wbR = Math.min(wb_target / r95, 1.8);
  const wbG = Math.min(wb_target / g95, 1.8);
  const wbB = Math.min(wb_target / b95, 1.8);

  for (let i = 0; i < n; i++) {
    pixels[i * 4]     = Math.min(255, pixels[i * 4]     * wbR);
    pixels[i * 4 + 1] = Math.min(255, pixels[i * 4 + 1] * wbG);
    pixels[i * 4 + 2] = Math.min(255, pixels[i * 4 + 2] * wbB);
  }

  // 2. Exposure — scales brightness to a consistent level
  const lums = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lums[i] =
      0.2126 * (pixels[i * 4] / 255) +
      0.7152 * (pixels[i * 4 + 1] / 255) +
      0.0722 * (pixels[i * 4 + 2] / 255);
  }

  const lumSorted = lums.slice().sort();
  const hi = lumSorted[Math.floor(0.97 * n)];

  if (hi > 0.05) {
    const expScale = Math.min(Math.max(0.92 / hi, 0.25), 4.0);
    for (let i = 0; i < n; i++) {
      pixels[i * 4]     = Math.min(255, pixels[i * 4]     * expScale);
      pixels[i * 4 + 1] = Math.min(255, pixels[i * 4 + 1] * expScale);
      pixels[i * 4 + 2] = Math.min(255, pixels[i * 4 + 2] * expScale);
    }
  }

  // 3. Saturation — pulls vivid or flat images to a neutral level
  const TARGET_SAT = 0.32;
  let totalSat = 0;

  for (let i = 0; i < n; i++) {
    const r = pixels[i * 4] / 255;
    const g = pixels[i * 4 + 1] / 255;
    const b = pixels[i * 4 + 2] / 255;
    const vMax = Math.max(r, g, b);
    const vMin = Math.min(r, g, b);
    totalSat += vMax > 0 ? (vMax - vMin) / vMax : 0;
  }

  const meanSat = totalSat / n;
  if (meanSat > 0.01) {
    const satScale = Math.min(Math.max(TARGET_SAT / meanSat, 0.2), 3.0);
    for (let i = 0; i < n; i++) {
      const r = pixels[i * 4] / 255;
      const g = pixels[i * 4 + 1] / 255;
      const b = pixels[i * 4 + 2] / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      pixels[i * 4]     = Math.min(255, Math.max(0, (lum + (r - lum) * satScale) * 255));
      pixels[i * 4 + 1] = Math.min(255, Math.max(0, (lum + (g - lum) * satScale) * 255));
      pixels[i * 4 + 2] = Math.min(255, Math.max(0, (lum + (b - lum) * satScale) * 255));
    }
  }
}
