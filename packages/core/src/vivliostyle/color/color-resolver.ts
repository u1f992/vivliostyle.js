/**
 * Resolve dependent color values to concrete colors.
 * Runs after var() and calc() resolution, before ColorFilterVisitor.
 *
 * Handles: contrast-color(), light-dark(), color-mix()
 * Note: currentcolor resolution is handled separately.
 * Note: relative color syntax is deferred to a future implementation.
 */

import * as Css from "../css";
import { colorToSrgbFloat } from "./resolve";
import { interpolateColors, normalizeMixPercentages } from "./color-mix";
import type { ColorMixInput, InterpolationColorSpace } from "./color-mix";

/**
 * Calculate relative luminance of an sRGB color.
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(r: number, g: number, b: number): number {
  function linearize(c: number): number {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Resolve contrast-color(): returns white or black depending on
 * which provides maximum contrast against the input color.
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#funcdef-contrast-color
 */
function resolveContrastColor(func: Css.Func): Css.Val {
  // contrast-color(<color>) — single argument wrapped in SpaceList
  const vals =
    func.values.length === 1 && func.values[0] instanceof Css.SpaceList
      ? (func.values[0] as Css.SpaceList).values
      : func.values;

  if (vals.length === 0) return func;

  const bgColor = vals[0];
  const rgb = colorToSrgbFloat(bgColor as any);
  const lum = relativeLuminance(rgb[0], rgb[1], rgb[2]);

  // Contrast ratio with white (luminance 1.0)
  const contrastWhite = (1.0 + 0.05) / (lum + 0.05);
  // Contrast ratio with black (luminance 0.0)
  const contrastBlack = (lum + 0.05) / (0.0 + 0.05);

  // Return white if it produces equal or more contrast, per spec
  if (contrastWhite >= contrastBlack) {
    return Css.getName("white");
  } else {
    return Css.getName("black");
  }
}

/**
 * Resolve light-dark(): returns the first (light) color.
 * Vivliostyle uses light mode as the fixed default.
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#funcdef-light-dark
 */
function resolveLightDark(func: Css.Func): Css.Val {
  // light-dark(<color>, <color>) — two comma-separated arguments
  if (func.values.length >= 1) {
    return func.values[0];
  }
  return func;
}

/**
 * Parse interpolation color space from color-mix() arguments.
 */
function parseColorMixSpace(vals: Css.Val[]): {
  space: InterpolationColorSpace;
  startIndex: number;
} {
  // color-mix( [in <color-space>]? , <color> <percentage>? , <color> <percentage>? )
  let space: InterpolationColorSpace = "oklab"; // default
  let startIndex = 0;

  if (
    vals.length > 0 &&
    vals[0] instanceof Css.Ident &&
    vals[0].name === "in"
  ) {
    if (vals.length > 1 && vals[1] instanceof Css.Ident) {
      const spaceName = vals[1].name.toLowerCase();
      if (isInterpolationSpace(spaceName)) {
        space = spaceName as InterpolationColorSpace;
      }
      startIndex = 2;
    }
  }

  return { space, startIndex };
}

function isInterpolationSpace(name: string): boolean {
  return [
    "srgb",
    "srgb-linear",
    "display-p3",
    "a98-rgb",
    "prophoto-rgb",
    "rec2020",
    "xyz",
    "xyz-d50",
    "xyz-d65",
    "lab",
    "lch",
    "oklab",
    "oklch",
    "hsl",
    "hwb",
  ].includes(name);
}

/**
 * Resolve color-mix() to a concrete color value.
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#funcdef-color-mix
 */
function resolveColorMix(func: Css.Func): Css.Val {
  // color-mix() values are comma-separated: [in <space>], <color> <pct>?, <color> <pct>?
  const vals = func.values;
  if (vals.length < 2) return func;

  const { space, startIndex } = parseColorMixSpace(
    vals[0] instanceof Css.SpaceList
      ? (vals[0] as Css.SpaceList).values
      : [vals[0]],
  );

  // Extract two color+percentage pairs from remaining comma-separated items
  const colorItems = vals.slice(startIndex > 0 ? 1 : 0); // skip the "in <space>" item
  if (colorItems.length < 2) return func;

  const { color: color1, percentage: p1 } = parseColorMixItem(colorItems[0]);
  const { color: color2, percentage: p2 } = parseColorMixItem(colorItems[1]);

  if (!color1 || !color2) return func;

  const norm = normalizeMixPercentages(p1, p2);

  // Convert both colors to sRGB for now (full space conversion requires lcms)
  const rgb1 = colorToSrgbFloat(color1 as any);
  const rgb2 = colorToSrgbFloat(color2 as any);

  const input1: ColorMixInput = {
    components: [rgb1[0], rgb1[1], rgb1[2]],
    alpha: 1,
    percentage: norm.p1,
  };
  const input2: ColorMixInput = {
    components: [rgb2[0], rgb2[1], rgb2[2]],
    alpha: 1,
    percentage: norm.p2,
  };

  const result = interpolateColors(input1, input2, space);

  // Return as rgb() function
  return new Css.Func("rgb", [
    new Css.SpaceList([
      new Css.Num(Math.max(0, Math.min(1, result.components[0]))),
      new Css.Num(Math.max(0, Math.min(1, result.components[1]))),
      new Css.Num(Math.max(0, Math.min(1, result.components[2]))),
    ]),
  ]);
}

function parseColorMixItem(item: Css.Val): {
  color: Css.Val | null;
  percentage: number | null;
} {
  if (item instanceof Css.SpaceList) {
    const vals = (item as Css.SpaceList).values;
    let color: Css.Val | null = null;
    let percentage: number | null = null;

    for (const v of vals) {
      if (v instanceof Css.Numeric && v.unit === "%") {
        percentage = v.num / 100;
      } else {
        color = v;
      }
    }
    return { color, percentage };
  }
  // Single value, no percentage
  return { color: item, percentage: null };
}

/**
 * ColorResolverVisitor: resolves dependent color values.
 * Runs as a Css.FilterVisitor before ColorFilterVisitor.
 */
export class ColorResolverVisitor extends Css.FilterVisitor {
  override visitFunc(func: Css.Func): Css.Val {
    switch (func.name) {
      case "contrast-color":
        return resolveContrastColor(func);
      case "light-dark":
        return resolveLightDark(func);
      case "color-mix":
        return resolveColorMix(func);
      default:
        return super.visitFunc(func);
    }
  }
}
