import type { AlphaValue, Hue } from "../../../common";
import {
  CssNumber,
  type CssPercentage,
  type CssIdentNone,
  isIdentNone,
} from "../../../css-color";
import * as Css from "../../../../css";
import { type Color } from "../../../types";

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#funcdef-lch
 *
 * ```plaintext
 * lch() = lch([from <color>]?
 *         [<percentage> | <number> | none]
 *         [<percentage> | <number> | none]
 *         [<hue> | none]
 *         [ / [<alpha-value> | none] ]? )
 * ```
 */
export class Lch extends Css.Func {
  constructor(
    lightness: CssPercentage | CssNumber | CssIdentNone,
    chroma: CssPercentage | CssNumber | CssIdentNone,
    hue: Hue | CssIdentNone,
    alpha?: AlphaValue | CssIdentNone,
  );
  constructor(
    from: Color,
    lightness: CssPercentage | CssNumber | CssIdentNone,
    chroma: CssPercentage | CssNumber | CssIdentNone,
    hue: Hue | CssIdentNone,
    alpha?: AlphaValue | CssIdentNone,
  );
  constructor(
    from__lightness: Color | (CssPercentage | CssNumber | CssIdentNone),
    lightness__chroma:
      | (CssPercentage | CssNumber | CssIdentNone)
      | (CssPercentage | CssNumber | CssIdentNone),
    chroma__hue:
      | (CssPercentage | CssNumber | CssIdentNone)
      | (Hue | CssIdentNone),
    hue__alpha?: (Hue | CssIdentNone) | (AlphaValue | CssIdentNone),
    alpha__?: AlphaValue | CssIdentNone,
  ) {
    const from =
      from__lightness instanceof Css.Numeric ||
      from__lightness instanceof CssNumber ||
      isIdentNone(from__lightness)
        ? undefined
        : from__lightness;
    const lightness = from !== undefined ? lightness__chroma : from__lightness;
    const chroma = from !== undefined ? chroma__hue : lightness__chroma;
    const hue = (from !== undefined ? hue__alpha : chroma__hue) as Css.Val;
    const alpha = from !== undefined ? alpha__ : hue__alpha;

    const vals: Css.Val[] = [];
    if (from !== undefined) vals.push(Css.getName("from"), from);
    vals.push(lightness, chroma, hue);
    if (alpha !== undefined) vals.push(Css.slash, alpha);
    super("lch", [new Css.SpaceList(vals)]);
  }
}
