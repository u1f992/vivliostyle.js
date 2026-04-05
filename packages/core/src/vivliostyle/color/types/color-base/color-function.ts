import { Alpha } from "./color-function/alpha";
import {
  type ColorspaceParams,
  CustomParams,
  type PredefinedRgb,
  PredefinedRgbParams,
  type XyzSpace,
  XyzParams,
  Color,
} from "./color-function/color";
import {
  type Hsl,
  LegacyHslSyntax,
  ModernHslSyntax,
} from "./color-function/hsl";
import {
  type Hsla,
  LegacyHslaSyntax,
  ModernHslaSyntax,
} from "./color-function/hsla";
import { Hwb } from "./color-function/hwb";
import { Lab } from "./color-function/lab";
import { Lch } from "./color-function/lch";
import { Oklab } from "./color-function/oklab";
import { Oklch } from "./color-function/oklch";
import {
  type Rgb,
  LegacyRgbSyntax,
  ModernRgbSyntax,
} from "./color-function/rgb";
import {
  type Rgba,
  LegacyRgbaSyntax,
  ModernRgbaSyntax,
} from "./color-function/rgba";

export {
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
};

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#typedef-color-function
 *
 * ```plaintext
 * <color-function> = <rgb()> | <rgba()> |
 *               <hsl()> | <hsla()> | <hwb()> |
 *               <lab()> | <lch()> | <oklab()> | <oklch()> |
 *               <alpha()> |
 *               <color()>
 * ```
 */
export type ColorFunction =
  | Rgb
  | Rgba
  | Hsl
  | Hsla
  | Hwb
  | Lab
  | Lch
  | Oklab
  | Oklch
  | Alpha
  | Color;
