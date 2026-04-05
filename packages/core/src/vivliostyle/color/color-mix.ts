/**
 * color-mix() interpolation calculation.
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#color-mix
 */

export type HueInterpolationMethod =
  | "shorter"
  | "longer"
  | "increasing"
  | "decreasing";

/**
 * Adjust two hue angles for interpolation.
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#hue-interpolation
 *
 * @returns adjusted [h1, h2] pair
 */
export function adjustHues(
  h1: number,
  h2: number,
  method: HueInterpolationMethod,
): [number, number] {
  // Normalize to [0, 360)
  h1 = ((h1 % 360) + 360) % 360;
  h2 = ((h2 % 360) + 360) % 360;

  const diff = h2 - h1;

  switch (method) {
    case "shorter":
      if (diff > 180) {
        h1 += 360;
      } else if (diff < -180) {
        h2 += 360;
      }
      break;
    case "longer":
      if (diff > 0 && diff < 180) {
        h1 += 360;
      } else if (diff > -180 && diff <= 0) {
        h2 += 360;
      }
      break;
    case "increasing":
      if (diff < 0) {
        h2 += 360;
      }
      break;
    case "decreasing":
      if (diff > 0) {
        h1 += 360;
      }
      break;
  }

  return [h1, h2];
}

/**
 * Whether a color space uses polar coordinates (hue as last or first component).
 */
export type InterpolationColorSpace =
  | "srgb"
  | "srgb-linear"
  | "display-p3"
  | "a98-rgb"
  | "prophoto-rgb"
  | "rec2020"
  | "xyz"
  | "xyz-d50"
  | "xyz-d65"
  | "lab"
  | "lch"
  | "oklab"
  | "oklch"
  | "hsl"
  | "hwb";

const POLAR_SPACES = new Set(["lch", "oklch", "hsl", "hwb"]);

/**
 * Index of the hue component in polar spaces.
 * lch/oklch: index 2 (L, C, H)
 * hsl: index 0 (H, S, L)
 * hwb: index 0 (H, W, B)
 */
function hueIndex(space: InterpolationColorSpace): number | null {
  if (space === "lch" || space === "oklch") return 2;
  if (space === "hsl" || space === "hwb") return 0;
  return null;
}

export interface ColorMixInput {
  /** Color components in the interpolation space (3 values) */
  components: [number, number, number];
  /** Alpha value (0..1) */
  alpha: number;
  /** Mix percentage (0..1, after normalization) */
  percentage: number;
}

/**
 * Normalize mix percentages.
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#color-mix-percent-norm
 */
export function normalizeMixPercentages(
  p1: number | null,
  p2: number | null,
): { p1: number; p2: number; alphaMultiplier: number } {
  if (p1 === null && p2 === null) {
    return { p1: 0.5, p2: 0.5, alphaMultiplier: 1 };
  }
  if (p1 !== null && p2 === null) {
    p2 = 1 - p1;
  } else if (p1 === null && p2 !== null) {
    p1 = 1 - p2;
  }

  const sum = p1! + p2!;
  if (sum === 0) {
    return { p1: 0, p2: 0, alphaMultiplier: 0 };
  }

  const alphaMultiplier = Math.min(sum, 1);
  return {
    p1: p1! / sum,
    p2: p2! / sum,
    alphaMultiplier,
  };
}

/**
 * Interpolate two colors in a given color space.
 * Both colors must already be converted to the interpolation space.
 *
 * @returns interpolated components and alpha
 */
export function interpolateColors(
  color1: ColorMixInput,
  color2: ColorMixInput,
  space: InterpolationColorSpace,
  hueMethod: HueInterpolationMethod = "shorter",
): { components: [number, number, number]; alpha: number } {
  const p1 = color1.percentage;
  const p2 = color2.percentage;

  // Premultiply alpha
  const alpha1 = color1.alpha;
  const alpha2 = color2.alpha;

  const c1 = color1.components.map((v) => v * alpha1) as [
    number,
    number,
    number,
  ];
  const c2 = color2.components.map((v) => v * alpha2) as [
    number,
    number,
    number,
  ];

  // Handle hue interpolation for polar spaces
  const hi = hueIndex(space);
  if (hi !== null && POLAR_SPACES.has(space)) {
    // Hue is NOT premultiplied — undo premultiplication for hue
    c1[hi] = color1.components[hi]!;
    c2[hi] = color2.components[hi]!;

    const [ah1, ah2] = adjustHues(c1[hi]!, c2[hi]!, hueMethod);
    c1[hi] = ah1;
    c2[hi] = ah2;
  }

  // Interpolate
  const result: [number, number, number] = [
    c1[0]! * p1 + c2[0]! * p2,
    c1[1]! * p1 + c2[1]! * p2,
    c1[2]! * p1 + c2[2]! * p2,
  ];
  const resultAlpha = alpha1 * p1 + alpha2 * p2;

  // Un-premultiply alpha
  if (resultAlpha > 0) {
    for (let i = 0; i < 3; i++) {
      if (i !== hi) {
        result[i] = result[i]! / resultAlpha;
      }
    }
  }

  return { components: result, alpha: resultAlpha };
}
