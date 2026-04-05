/**
 * CSS-specific color conversions that don't require lcms.
 * These are defined directly in sRGB by the CSS specification.
 */

/**
 * HSL to sRGB conversion.
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#hsl-to-rgb
 *
 * @param h - Hue in degrees (0..360)
 * @param s - Saturation (0..100)
 * @param l - Lightness (0..100)
 * @returns [r, g, b] in 0..1
 */
export function hslToSrgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = s / 100;
  l = l / 100;

  const a = s * Math.min(l, 1 - l);
  function f(n: number): number {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  }
  return [f(0), f(8), f(4)];
}

/**
 * HWB to sRGB conversion.
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#hwb-to-rgb
 *
 * @param h - Hue in degrees (0..360)
 * @param w - Whiteness (0..100)
 * @param b - Blackness (0..100)
 * @returns [r, g, b] in 0..1
 */
export function hwbToSrgb(
  h: number,
  w: number,
  b: number,
): [number, number, number] {
  w = w / 100;
  b = b / 100;

  if (w + b >= 1) {
    const gray = w / (w + b);
    return [gray, gray, gray];
  }

  const [r, g, bl] = hslToSrgb(h, 100, 50);
  return [r * (1 - w - b) + w, g * (1 - w - b) + w, bl * (1 - w - b) + w];
}

/**
 * sRGB to HSL conversion.
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#rgb-to-hsl
 *
 * @param r - Red (0..1)
 * @param g - Green (0..1)
 * @param b - Blue (0..1)
 * @returns [h, s, l] with h in degrees (0..360), s and l in 0..100
 */
export function srgbToHsl(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) {
    return [0, 0, l * 100];
  }

  const s = l <= 0.5 ? d / (max + min) : d / (2 - max - min);

  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  } else if (max === g) {
    h = ((b - r) / d + 2) * 60;
  } else {
    h = ((r - g) / d + 4) * 60;
  }

  return [h, s * 100, l * 100];
}

/**
 * sRGB to HWB conversion.
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#rgb-to-hwb
 *
 * @param r - Red (0..1)
 * @param g - Green (0..1)
 * @param b - Blue (0..1)
 * @returns [h, w, b] with h in degrees (0..360), w and b in 0..100
 */
export function srgbToHwb(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const [h] = srgbToHsl(r, g, b);
  const w = Math.min(r, g, b);
  const bl = 1 - Math.max(r, g, b);
  return [h, w * 100, bl * 100];
}

/**
 * device-cmyk() naive conversion to sRGB.
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#cmyk-rgb
 *
 * @param c - Cyan (0..1)
 * @param m - Magenta (0..1)
 * @param y - Yellow (0..1)
 * @param k - Black (0..1)
 * @returns [r, g, b] in 0..1
 */
export function deviceCmykToSrgbNaive(
  c: number,
  m: number,
  y: number,
  k: number,
): [number, number, number] {
  return [
    1 - Math.min(1, c * (1 - k) + k),
    1 - Math.min(1, m * (1 - k) + k),
    1 - Math.min(1, y * (1 - k) + k),
  ];
}
