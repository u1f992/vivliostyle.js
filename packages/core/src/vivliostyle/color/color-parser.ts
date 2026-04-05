/**
 * Self-contained color validation.
 * Replaces CSS.supports() delegation for all color values.
 */

import { NAMED_COLORS } from "./named-colors-table";

/**
 * CSS color function names that are recognized.
 */
const COLOR_FUNCTIONS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "color-mix",
  "device-cmyk",
  "cmyk",
  "contrast-color",
  "light-dark",
  "alpha",
]);

/**
 * CSS system color keywords.
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#typedef-system-color
 */
const SYSTEM_COLORS = new Set([
  "accentcolor",
  "accentcolortext",
  "activetext",
  "buttonborder",
  "buttonface",
  "buttontext",
  "canvas",
  "canvastext",
  "field",
  "fieldtext",
  "graytext",
  "highlight",
  "highlighttext",
  "linktext",
  "mark",
  "marktext",
  "selecteditem",
  "selecteditemtext",
  "visitedtext",
]);

/**
 * Special color keywords beyond named colors.
 */
const SPECIAL_COLOR_KEYWORDS = new Set(["transparent", "currentcolor"]);

/**
 * Validate whether an ident is a valid CSS color keyword.
 * Replaces CSS.supports("color", ident.name).
 */
export function isValidColorIdent(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower in NAMED_COLORS) return true;
  if (SYSTEM_COLORS.has(lower)) return true;
  if (SPECIAL_COLOR_KEYWORDS.has(lower)) return true;
  return false;
}

/**
 * Validate whether a function name is a recognized CSS color function.
 * Replaces CSS.supports("color", func.toString()).
 */
export function isValidColorFunction(funcName: string): boolean {
  return COLOR_FUNCTIONS.has(funcName.toLowerCase());
}
