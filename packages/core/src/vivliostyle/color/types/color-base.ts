import type { CssIdentTransparent } from "../css-color";
import * as Css from "../../css";
import {
  type ColorFunction,
  Alpha,
  type ColorspaceParams,
  CustomParams,
  type PredefinedRgb,
  PredefinedRgbParams,
  type XyzSpace,
  XyzParams,
  Color,
  type Hsl,
  LegacyHslSyntax,
  ModernHslSyntax,
  type Hsla,
  LegacyHslaSyntax,
  ModernHslaSyntax,
  Hwb,
  Lab,
  Lch,
  Oklab,
  Oklch,
  type Rgb,
  LegacyRgbSyntax,
  ModernRgbSyntax,
  type Rgba,
  LegacyRgbaSyntax,
  ModernRgbaSyntax,
} from "./color-base/color-function";
import type { NamedColor } from "./color-base/named-color";

/**
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#hex-notation
 */
export const HexColor = Css.HexColor;
export type HexColor = Css.HexColor;

export {
  type ColorFunction,
  Alpha,
  type ColorspaceParams,
  CustomParams,
  type PredefinedRgb,
  PredefinedRgbParams,
  type XyzSpace,
  XyzParams,
  Color,
  type Hsl,
  LegacyHslSyntax,
  ModernHslSyntax,
  type Hsla,
  LegacyHslaSyntax,
  ModernHslaSyntax,
  Hwb,
  Lab,
  Lch,
  Oklab,
  Oklch,
  type Rgb,
  LegacyRgbSyntax,
  ModernRgbSyntax,
  type Rgba,
  LegacyRgbaSyntax,
  ModernRgbaSyntax,
  type NamedColor,
};

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#funcdef-color-mix
 *
 * ```plaintext
 * color-mix() = color-mix( <color-interpolation-method>? , [ <color> && <percentage>? ]# )
 * ```
 *
 * Resolved to a concrete color value before ColorFilterVisitor runs.
 * This class holds the unresolved structure for deferred computation.
 */
export class ColorMix extends Css.Func {
  constructor() {
    super("color-mix", []);
  }
}

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#typedef-color-base
 *
 * ```plaintext
 * <color-base> = <hex-color> | <color-function> | <named-color> | <color-mix()> | transparent
 * ```
 */
export type ColorBase =
  | HexColor
  | ColorFunction
  | NamedColor
  | ColorMix
  | CssIdentTransparent;
