import type { AlphaValue } from "../../../common";
import type { CssIdentNone } from "../../../css-color";
import * as Css from "../../../../css";
import { type Color } from "../../../types";

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#funcdef-alpha
 *
 * ```plaintext
 * alpha() = alpha([from <color>]
 *           [ / [<alpha-value> | none] ]? )
 * ```
 */
export class Alpha extends Css.Func {
  constructor(from: Color, alpha?: AlphaValue | CssIdentNone) {
    const vals: Css.Val[] = [from];
    if (alpha !== undefined) vals.push(Css.slash, alpha);
    super("alpha", [new Css.SpaceList(vals)]);
  }
}
