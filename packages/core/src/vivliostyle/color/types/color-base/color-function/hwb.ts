import type { AlphaValue, Hue } from "../../../common";
import {
  type CssAngle,
  CssNumber,
  type CssIdentNone,
  isIdentNone,
  type CssPercentage,
} from "../../../css-color";
import * as Css from "../../../../css";
import { type Color } from "../../../types";

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#funcdef-hwb
 *
 * ```plaintext
 * hwb() = hwb([from <color>]?
 *         [<hue> | none]
 *         [<percentage> | <number> | none]
 *         [<percentage> | <number> | none]
 *         [ / [<alpha-value> | none] ]? )
 * ```
 */
export class Hwb extends Css.Func {
  constructor(
    hue: Hue | CssIdentNone,
    whiteness: CssPercentage | CssNumber | CssIdentNone,
    blackness: CssPercentage | CssNumber | CssIdentNone,
    alpha?: AlphaValue | CssIdentNone,
  );
  constructor(
    from: Color,
    hue: Hue | CssIdentNone,
    whiteness: CssPercentage | CssNumber | CssIdentNone,
    blackness: CssPercentage | CssNumber | CssIdentNone,
    alpha?: AlphaValue | CssIdentNone,
  );
  constructor(
    from__hue: Color | (Hue | CssIdentNone),
    hue__whiteness:
      | (Hue | CssIdentNone)
      | (CssPercentage | CssNumber | CssIdentNone),
    whiteness__blackness:
      | (CssPercentage | CssNumber | CssIdentNone)
      | (CssPercentage | CssNumber | CssIdentNone),
    blackness__alpha?:
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
    const hue = from !== undefined ? hue__whiteness : from__hue;
    const whiteness =
      from !== undefined ? whiteness__blackness : hue__whiteness;
    const blackness = (
      from !== undefined ? blackness__alpha : whiteness__blackness
    ) as Css.Val;
    const alpha = from !== undefined ? alpha__ : blackness__alpha;

    const vals: Css.Val[] = [];
    if (from !== undefined) vals.push(Css.getName("from"), from);
    vals.push(hue, whiteness, blackness);
    if (alpha !== undefined) vals.push(Css.slash, alpha);
    super("hwb", [new Css.SpaceList(vals)]);
  }
}
