import {
  type CssAngle,
  CssNumber,
  type CssIdentNone,
  isIdentNone,
  type CssPercentage,
} from "../../../css-color";
import * as Css from "../../../../css";
import { type Color } from "../../../types";
import type { AlphaValue, Hue } from "../../../common";

/**
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#funcdef-hsla
 *
 * ```plaintext
 * hsla() = [ <legacy-hsla-syntax> | <modern-hsla-syntax> ]
 * ```
 */
export type Hsla = LegacyHslaSyntax | ModernHslaSyntax;

/**
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#typedef-legacy-hsla-syntax
 *
 * ```plaintext
 * <legacy-hsla-syntax> = hsla( <hue>, <percentage>, <percentage>, <alpha-value>? )
 * ```
 */
export class LegacyHslaSyntax extends Css.Func {
  constructor(
    hue: Hue,
    saturation: CssPercentage,
    lightness: CssPercentage,
    alpha?: AlphaValue,
  ) {
    super(
      "hsla",
      alpha !== undefined
        ? [hue, saturation, lightness, alpha]
        : [hue, saturation, lightness],
    );
  }
}

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#typedef-modern-hsla-syntax
 *
 * ```plaintext
 * <modern-hsla-syntax> = hsla([from <color>]?
 *         [<hue> | none]
 *         [<percentage> | <number> | none]
 *         [<percentage> | <number> | none]
 *         [ / [<alpha-value> | none] ]? )
 * ```
 */
export class ModernHslaSyntax extends Css.Func {
  constructor(
    hue: Hue | CssIdentNone,
    saturation: CssPercentage | CssNumber | CssIdentNone,
    lightness: CssPercentage | CssNumber | CssIdentNone,
    alpha?: AlphaValue | CssIdentNone,
  );
  constructor(
    from: Color,
    hue: Hue | CssIdentNone,
    saturation: CssPercentage | CssNumber | CssIdentNone,
    lightness: CssPercentage | CssNumber | CssIdentNone,
    alpha?: AlphaValue | CssIdentNone,
  );
  constructor(
    from__hue: Color | (Hue | CssIdentNone),
    hue__saturation:
      | (Hue | CssIdentNone)
      | (CssPercentage | CssNumber | CssIdentNone),
    saturation__lightness:
      | (CssPercentage | CssNumber | CssIdentNone)
      | (CssPercentage | CssNumber | CssIdentNone),
    lightness__alpha?:
      | (CssPercentage | CssNumber | CssIdentNone)
      | (AlphaValue | CssIdentNone),
    alpha__?: AlphaValue | CssIdentNone,
  ) {
    const from =
      from__hue instanceof CssNumber ||
      from__hue instanceof Css.Numeric ||
      isIdentNone(from__hue)
        ? undefined
        : from__hue;
    const hue = from !== undefined ? hue__saturation : from__hue;
    const saturation =
      from !== undefined ? saturation__lightness : hue__saturation;
    const lightness = (
      from !== undefined ? lightness__alpha : saturation__lightness
    ) as Css.Val;
    const alpha = from !== undefined ? alpha__ : lightness__alpha;

    const vals: Css.Val[] = [];
    if (from !== undefined) vals.push(Css.getName("from"), from);
    vals.push(hue, saturation, lightness);
    if (alpha !== undefined) vals.push(Css.slash, alpha);
    super("hsla", [new Css.SpaceList(vals)]);
  }
}
