import type { AlphaValue } from "../../../common";
import {
  type CssIdentNone,
  type CssIdentSrgb,
  type CssIdentSrgbLinear,
  type CssIdentDisplayP3,
  type CssIdentA98Rgb,
  type CssIdentProphotoRgb,
  type CssIdentRec2020,
  type CssIdentXyz,
  type CssIdentXyzD50,
  type CssIdentXyzD65,
  type CssNumber,
  type CssPercentage,
  type DashedIdent,
} from "../../../css-color";
import * as Css from "../../../../css";
import { type Color as ColorType } from "../../../types";

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#typedef-colorspace-params
 *
 * ```plaintext
 * <colorspace-params> = [<custom-params> | <predefined-rgb-params> | <xyz-params>]
 * ```
 */
export type ColorspaceParams = CustomParams | PredefinedRgbParams | XyzParams;

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#typedef-custom-params
 *
 * ```plaintext
 * <custom-params> = <dashed-ident> [ <number> | <percentage> | none ]+
 * ```
 */
export class CustomParams extends Css.Val {
  #ident: DashedIdent;
  #params: [
    CssNumber | CssPercentage | CssIdentNone,
    ...(CssNumber | CssPercentage | CssIdentNone)[],
  ];

  constructor(
    ident: DashedIdent,
    params: [
      CssNumber | CssPercentage | CssIdentNone,
      ...(CssNumber | CssPercentage | CssIdentNone)[],
    ],
  ) {
    super();
    this.#ident = ident;
    this.#params = params;
  }
}

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#typedef-predefined-rgb
 *
 * ```plaintext
 * <predefined-rgb> = srgb | srgb-linear | display-p3 | a98-rgb | prophoto-rgb | rec2020
 * ```
 */
export type PredefinedRgb =
  | CssIdentSrgb
  | CssIdentSrgbLinear
  | CssIdentDisplayP3
  | CssIdentA98Rgb
  | CssIdentProphotoRgb
  | CssIdentRec2020;

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#typedef-predefined-rgb-params
 *
 * ```plaintext
 * <predefined-rgb-params> = <predefined-rgb> [ <number> | <percentage> | none ]{3}
 * ```
 */
export class PredefinedRgbParams extends Css.Val {
  #rgb: PredefinedRgb;
  #red: CssNumber | CssPercentage | CssIdentNone;
  #green: CssNumber | CssPercentage | CssIdentNone;
  #blue: CssNumber | CssPercentage | CssIdentNone;

  constructor(
    rgb: PredefinedRgb,
    red: CssNumber | CssPercentage | CssIdentNone,
    green: CssNumber | CssPercentage | CssIdentNone,
    blue: CssNumber | CssPercentage | CssIdentNone,
  ) {
    super();
    this.#rgb = rgb;
    this.#red = red;
    this.#blue = blue;
    this.#green = green;
  }
}

export type XyzSpace = CssIdentXyz | CssIdentXyzD50 | CssIdentXyzD65;

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#typedef-xyz-params
 *
 * ```plaintext
 * <xyz-params> = <xyz-space> [ <number> | <percentage> | none ]{3}
 * ```
 */
export class XyzParams extends Css.Val {
  #xyz: XyzSpace;
  #x: CssNumber | CssPercentage | CssIdentNone;
  #y: CssNumber | CssPercentage | CssIdentNone;
  #z: CssNumber | CssPercentage | CssIdentNone;

  constructor(
    xyz: XyzSpace,
    x: CssNumber | CssPercentage | CssIdentNone,
    y: CssNumber | CssPercentage | CssIdentNone,
    z: CssNumber | CssPercentage | CssIdentNone,
  ) {
    super();
    this.#xyz = xyz;
    this.#x = x;
    this.#y = y;
    this.#z = z;
  }
}

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#funcdef-color
 *
 * ```plaintext
 * color() = color( [from <color>]? <colorspace-params> [ / [ <alpha-value> | none ] ]? )
 * ```
 */
export class Color extends Css.Func {
  constructor(params: ColorspaceParams, alpha?: AlphaValue | CssIdentNone);
  constructor(
    from: ColorType,
    params: ColorspaceParams,
    alpha?: AlphaValue | CssIdentNone,
  );
  constructor(
    from__params: ColorType | ColorspaceParams,
    params__alpha?: ColorspaceParams | (AlphaValue | CssIdentNone),
    alpha__?: AlphaValue | CssIdentNone,
  ) {
    const from =
      from__params instanceof CustomParams ||
      from__params instanceof PredefinedRgbParams ||
      from__params instanceof XyzParams
        ? undefined
        : from__params;
    const params = from !== undefined ? params__alpha : from__params;
    const alpha = (from !== undefined ? alpha__ : params__alpha) as
      | AlphaValue
      | CssIdentNone
      | undefined;

    const vals: Css.Val[] = [];
    if (from !== undefined) vals.push(Css.getName("from"), from);
    // ColorspaceParams is a Css.Val subtype, push directly
    if (params !== undefined) vals.push(params as Css.Val);
    if (alpha !== undefined) vals.push(Css.slash, alpha);
    super("color", [new Css.SpaceList(vals)]);
  }
}
