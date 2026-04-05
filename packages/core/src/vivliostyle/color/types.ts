import type { CssIdentCurrentcolor } from "./css-color";
import * as Css from "../css";
import {
  type ColorBase,
  HexColor,
  type ColorFunction,
  Alpha,
  type ColorspaceParams,
  CustomParams,
  type PredefinedRgb,
  PredefinedRgbParams,
  type XyzSpace,
  XyzParams,
  Color as ColorFn,
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
  ColorMix,
} from "./types/color-base";
import type { SystemColor } from "./types/system-color";

export {
  type ColorBase,
  HexColor,
  type ColorFunction,
  Alpha,
  type ColorspaceParams,
  CustomParams,
  type PredefinedRgb,
  PredefinedRgbParams,
  type XyzSpace,
  XyzParams,
  ColorFn,
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
  ColorMix,
  type SystemColor,
};

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#funcdef-contrast-color
 *
 * Resolves to white or black. Held unresolved for deferred computation.
 */
export class ContrastColor extends Css.Func {
  constructor(color: Color) {
    super("contrast-color", [new Css.SpaceList([color])]);
  }
}

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#funcdef-device-cmyk
 *
 * ```plaintext
 * device-cmyk() = <legacy-device-cmyk-syntax> | <modern-device-cmyk-syntax>
 * ```
 */
export class DeviceCmyk extends Css.Func {
  constructor(c: Css.Num, m: Css.Num, y: Css.Num, k: Css.Num, alpha?: Css.Num) {
    const vals: Css.Val[] = [c, m, y, k];
    if (alpha !== undefined) {
      vals.push(Css.slash, alpha);
    }
    super("device-cmyk", [new Css.SpaceList(vals)]);
  }
}

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#funcdef-light-dark
 *
 * Resolves to the first color (light mode, Vivliostyle fixed).
 */
export class LightDarkColor extends Css.Func {
  constructor(light: Color, dark: Color) {
    super("light-dark", [light, dark]);
  }
}

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#typedef-color
 *
 * ```plaintext
 * <color> = <color-base> | currentColor | <system-color> |
 *       <contrast-color()> | <device-cmyk()>  | <light-dark-color>
 * ```
 */
export type Color =
  | ColorBase
  | CssIdentCurrentcolor
  | SystemColor
  | ContrastColor
  | DeviceCmyk
  | LightDarkColor;
