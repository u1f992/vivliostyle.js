/**
 * Resolve dependent color values to concrete colors.
 * Runs after var() and calc() resolution, before ColorFilterVisitor.
 *
 * Handles: contrast-color(), light-dark(), relative color syntax, color-mix()
 * Note: currentcolor resolution is handled separately.
 */

import * as Css from "../css";
import { colorToSrgbFloat } from "./resolve";
import { interpolateColors, normalizeMixPercentages } from "./color-mix";
import type { ColorMixInput, InterpolationColorSpace } from "./color-mix";
import { srgbToHsl, srgbToHwb } from "./convert";
import { isLcmsInitialized, srgbToLab, srgbToOklab, srgbToXyz } from "./lcms";

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
 * Resolve contrast-color(): returns white or black.
 */
function resolveContrastColor(func: Css.Func): Css.Val {
  const vals =
    func.values.length === 1 && func.values[0] instanceof Css.SpaceList
      ? (func.values[0] as Css.SpaceList).values
      : func.values;

  if (vals.length === 0) return func;

  const bgColor = vals[0];
  const rgb = colorToSrgbFloat(bgColor as any);
  const lum = relativeLuminance(rgb[0], rgb[1], rgb[2]);
  const contrastWhite = (1.0 + 0.05) / (lum + 0.05);
  const contrastBlack = (lum + 0.05) / (0.0 + 0.05);

  return contrastWhite >= contrastBlack
    ? Css.getName("white")
    : Css.getName("black");
}

/**
 * Resolve light-dark(): returns the first (light) color.
 */
function resolveLightDark(func: Css.Func): Css.Val {
  if (func.values.length >= 1) {
    return func.values[0];
  }
  return func;
}

// ---- Relative color syntax ----

/**
 * Component keyword names for each color function space.
 */
const COMPONENT_KEYWORDS: Record<string, string[]> = {
  rgb: ["r", "g", "b"],
  rgba: ["r", "g", "b"],
  hsl: ["h", "s", "l"],
  hsla: ["h", "s", "l"],
  hwb: ["h", "w", "b"],
  lab: ["l", "a", "b"],
  lch: ["l", "c", "h"],
  oklab: ["l", "a", "b"],
  oklch: ["l", "c", "h"],
};

/**
 * Convert origin color (sRGB) to the target function's component values.
 * Returns [c1, c2, c3] in the target space's native units.
 */
function convertOriginToSpace(
  originRgb: [number, number, number],
  funcName: string,
): [number, number, number] | null {
  const name = funcName.toLowerCase();

  switch (name) {
    case "rgb":
    case "rgba":
      return originRgb;

    case "hsl":
    case "hsla": {
      const [h, s, l] = srgbToHsl(originRgb[0], originRgb[1], originRgb[2]);
      return [h, s, l];
    }

    case "hwb": {
      const [h, w, b] = srgbToHwb(originRgb[0], originRgb[1], originRgb[2]);
      return [h, w, b];
    }

    case "lab": {
      if (!isLcmsInitialized()) return null;
      const lab = srgbToLab(originRgb[0], originRgb[1], originRgb[2]);
      return [lab[0], lab[1], lab[2]];
    }

    case "lch": {
      if (!isLcmsInitialized()) return null;
      const lab = srgbToLab(originRgb[0], originRgb[1], originRgb[2]);
      const C = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
      const H = ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360;
      return [lab[0], C, H];
    }

    case "oklab": {
      if (!isLcmsInitialized()) return null;
      const oklab = srgbToOklab(originRgb[0], originRgb[1], originRgb[2]);
      return [oklab[0], oklab[1], oklab[2]];
    }

    case "oklch": {
      if (!isLcmsInitialized()) return null;
      const oklab = srgbToOklab(originRgb[0], originRgb[1], originRgb[2]);
      const C = Math.sqrt(oklab[1] * oklab[1] + oklab[2] * oklab[2]);
      const H = ((Math.atan2(oklab[2], oklab[1]) * 180) / Math.PI + 360) % 360;
      return [oklab[0], C, H];
    }

    default:
      return null;
  }
}

/**
 * Resolve a relative color syntax function.
 *
 * @example rgb(from lab(50 30 -20) r g b)
 * The SpaceList values are: [Ident("from"), <origin-color>, <c1>, <c2>, <c3>, ...]
 * where <c1> etc. may be Idents (component keywords), Nums, or Css.Func("calc", ...).
 */
function resolveRelativeColor(func: Css.Func): Css.Val {
  const vals =
    func.values.length === 1 && func.values[0] instanceof Css.SpaceList
      ? (func.values[0] as Css.SpaceList).values
      : func.values;

  // Check for "from" keyword at position 0
  if (
    vals.length < 4 ||
    !(vals[0] instanceof Css.Ident) ||
    vals[0].name !== "from"
  ) {
    return func; // Not relative syntax
  }

  const originColor = vals[1];
  const keywords = COMPONENT_KEYWORDS[func.name.toLowerCase()];
  if (!keywords) return func;

  // Convert origin to sRGB, then to target space
  const originRgb = colorToSrgbFloat(originColor as any);
  const targetComponents = convertOriginToSpace(originRgb, func.name);
  if (!targetComponents) return func; // Cannot convert (lcms not initialized)

  // Also compute alpha from origin (default 1)
  const originAlpha = 1; // TODO: extract alpha from origin color

  // Build binding map: keyword -> value
  const bindings = new Map<string, number>();
  for (let i = 0; i < keywords.length; i++) {
    bindings.set(keywords[i], targetComponents[i]);
  }
  bindings.set("alpha", originAlpha);

  // Resolve component values (positions 2, 3, 4 in vals, skipping slash+alpha)
  const resolved: Css.Val[] = [];
  let i = 2;
  while (i < vals.length) {
    const v = vals[i];

    // Slash separator for alpha
    if (v instanceof Css.Slash) {
      resolved.push(v);
      i++;
      continue;
    }

    // Component keyword → substitute with value
    if (v instanceof Css.Ident && v.name !== "none") {
      const bound = bindings.get(v.name.toLowerCase());
      if (bound !== undefined) {
        resolved.push(new Css.Num(bound));
        i++;
        continue;
      }
    }

    // calc() with keyword references → evaluate
    if (v instanceof Css.Func && v.name === "calc") {
      const evaluated = evaluateCalcWithBindings(v, bindings);
      if (evaluated !== null) {
        resolved.push(new Css.Num(evaluated));
        i++;
        continue;
      }
    }

    // Pass through as-is (none, numeric literals, etc.)
    resolved.push(v);
    i++;
  }

  // Reconstruct the function without the "from <origin>" prefix
  return new Css.Func(func.name, [new Css.SpaceList(resolved)]);
}

/**
 * Evaluate a calc() expression with bound component keyword values.
 * Handles simple arithmetic: +, -, *, / with numeric and keyword operands.
 * Returns null if evaluation fails.
 */
function evaluateCalcWithBindings(
  calcFunc: Css.Func,
  bindings: Map<string, number>,
): number | null {
  // calc() values are a flat list of tokens in a SpaceList
  const vals =
    calcFunc.values.length === 1 && calcFunc.values[0] instanceof Css.SpaceList
      ? (calcFunc.values[0] as Css.SpaceList).values
      : calcFunc.values;

  return evaluateExpr(vals, bindings);
}

/**
 * Simple recursive expression evaluator for calc() contents.
 * Supports: +, -, *, /, parentheses (via nested calc), keywords, numbers, percentages.
 */
function evaluateExpr(
  vals: Css.Val[],
  bindings: Map<string, number>,
): number | null {
  if (vals.length === 0) return null;
  if (vals.length === 1) return evaluateTerm(vals[0], bindings);

  // Left-to-right evaluation respecting * and / precedence
  // First pass: evaluate all terms
  const terms: number[] = [];
  const ops: string[] = [];

  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (
      v instanceof Css.Ident &&
      (v.name === "+" || v.name === "-" || v.name === "*" || v.name === "/")
    ) {
      ops.push(v.name);
    } else {
      const val = evaluateTerm(v, bindings);
      if (val === null) return null;
      terms.push(val);
    }
  }

  if (terms.length === 0) return null;

  // Apply * and / first
  let i = 0;
  while (i < ops.length) {
    if (ops[i] === "*" || ops[i] === "/") {
      const result =
        ops[i] === "*" ? terms[i] * terms[i + 1] : terms[i] / terms[i + 1];
      terms.splice(i, 2, result);
      ops.splice(i, 1);
    } else {
      i++;
    }
  }

  // Apply + and -
  let result = terms[0];
  for (i = 0; i < ops.length; i++) {
    result = ops[i] === "+" ? result + terms[i + 1] : result - terms[i + 1];
  }

  return result;
}

function evaluateTerm(
  v: Css.Val,
  bindings: Map<string, number>,
): number | null {
  if (v instanceof Css.Num) return v.num;
  if (v instanceof Css.Numeric) {
    if (v.unit === "%") return v.num / 100;
    return v.num;
  }
  if (v instanceof Css.Ident) {
    const bound = bindings.get(v.name.toLowerCase());
    if (bound !== undefined) return bound;
    return null;
  }
  if (v instanceof Css.Func && v.name === "calc") {
    return evaluateCalcWithBindings(v, bindings);
  }
  return null;
}

// ---- color-mix() ----

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

function parseColorMixSpace(vals: Css.Val[]): {
  space: InterpolationColorSpace;
  startIndex: number;
} {
  let space: InterpolationColorSpace = "oklab";
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

function resolveColorMix(func: Css.Func): Css.Val {
  const vals = func.values;
  if (vals.length < 2) return func;

  const { space, startIndex } = parseColorMixSpace(
    vals[0] instanceof Css.SpaceList
      ? (vals[0] as Css.SpaceList).values
      : [vals[0]],
  );

  const colorItems = vals.slice(startIndex > 0 ? 1 : 0);
  if (colorItems.length < 2) return func;

  const { color: color1, percentage: p1 } = parseColorMixItem(colorItems[0]);
  const { color: color2, percentage: p2 } = parseColorMixItem(colorItems[1]);

  if (!color1 || !color2) return func;

  const norm = normalizeMixPercentages(p1, p2);

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
  return { color: item, percentage: null };
}

// ---- Visitor ----

/**
 * Check if a color function uses relative color syntax (has "from" keyword).
 */
function hasRelativeSyntax(func: Css.Func): boolean {
  const vals =
    func.values.length === 1 && func.values[0] instanceof Css.SpaceList
      ? (func.values[0] as Css.SpaceList).values
      : func.values;

  return (
    vals.length >= 2 && vals[0] instanceof Css.Ident && vals[0].name === "from"
  );
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
        // Check for relative color syntax in any color function
        if (hasRelativeSyntax(func) && func.name in COMPONENT_KEYWORDS) {
          return resolveRelativeColor(func);
        }
        // Do not recurse into non-color functions (gradients, images, etc.)
        return func;
    }
  }
}
