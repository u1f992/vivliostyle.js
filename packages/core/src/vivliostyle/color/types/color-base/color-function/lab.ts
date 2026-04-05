import type { AlphaValue } from "../../../common";
import {
  CssNumber,
  type CssPercentage,
  type CssIdentNone,
  isIdentNone,
} from "../../../css-color";
import * as Css from "../../../../css";
import { type Color } from "../../../types";

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#funcdef-lab
 *
 * ```plaintext
 * lab() = lab([from <color>]?
 *         [<percentage> | <number> | none]
 *         [<percentage> | <number> | none]
 *         [<percentage> | <number> | none]
 *         [ / [<alpha-value> | none] ]? )
 * ```
 */
export class Lab extends Css.Func {
  constructor(
    lightness: CssPercentage | CssNumber | CssIdentNone,
    a: CssPercentage | CssNumber | CssIdentNone,
    b: CssPercentage | CssNumber | CssIdentNone,
    alpha?: AlphaValue | CssIdentNone,
  );
  constructor(
    from: Color,
    lightness: CssPercentage | CssNumber | CssIdentNone,
    a: CssPercentage | CssNumber | CssIdentNone,
    b: CssPercentage | CssNumber | CssIdentNone,
    alpha?: AlphaValue | CssIdentNone,
  );
  constructor(
    from__lightness: Color | (CssPercentage | CssNumber | CssIdentNone),
    lightness__a:
      | (CssPercentage | CssNumber | CssIdentNone)
      | (CssPercentage | CssNumber | CssIdentNone),
    a__b:
      | (CssPercentage | CssNumber | CssIdentNone)
      | (CssPercentage | CssNumber | CssIdentNone),
    b__alpha?:
      | (CssPercentage | CssNumber | CssIdentNone)
      | (AlphaValue | CssIdentNone),
    alpha__?: AlphaValue | CssIdentNone,
  ) {
    const from =
      from__lightness instanceof Css.Numeric ||
      from__lightness instanceof CssNumber ||
      isIdentNone(from__lightness)
        ? undefined
        : from__lightness;
    const lightness = from !== undefined ? lightness__a : from__lightness;
    const a = from !== undefined ? a__b : lightness__a;
    const b = (from !== undefined ? b__alpha : a__b) as Css.Val;
    const alpha = from !== undefined ? alpha__ : b__alpha;

    const vals: Css.Val[] = [];
    if (from !== undefined) vals.push(Css.getName("from"), from);
    vals.push(lightness, a, b);
    if (alpha !== undefined) vals.push(Css.slash, alpha);
    super("lab", [new Css.SpaceList(vals)]);
  }
}
