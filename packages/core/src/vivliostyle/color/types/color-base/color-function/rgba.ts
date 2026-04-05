import {
  type CssPercentage,
  CssNumber,
  type CssIdentNone,
  isIdentNone,
} from "../../../css-color";
import * as Css from "../../../../css";
import { type AlphaValue } from "../../../common";
import { type Color } from "../../../types";

/**
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#funcdef-rgba
 *
 * ```plaintext
 * rgba() = [ <legacy-rgba-syntax> | <modern-rgba-syntax> ]
 * ```
 */
export type Rgba = LegacyRgbaSyntax | ModernRgbaSyntax;

/**
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#typedef-legacy-rgba-syntax
 *
 * ```plaintext
 * <legacy-rgba-syntax> = rgba( <percentage>#{3} , <alpha-value>? ) |
 *                   rgba( <number>#{3} , <alpha-value>? )
 * ```
 */
export class LegacyRgbaSyntax extends Css.Func {
  constructor(
    red: CssPercentage,
    green: CssPercentage,
    blue: CssPercentage,
    alpha?: AlphaValue,
  );
  constructor(
    red: CssNumber,
    green: CssNumber,
    blue: CssNumber,
    alpha?: AlphaValue,
  );
  constructor(
    red: CssPercentage | CssNumber,
    green: CssPercentage | CssNumber,
    blue: CssPercentage | CssNumber,
    alpha?: AlphaValue,
  ) {
    super(
      "rgba",
      alpha !== undefined ? [red, green, blue, alpha] : [red, green, blue],
    );
  }
}

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#typedef-modern-rgba-syntax
 *
 * ```plaintext
 * <modern-rgba-syntax> = rgba( [ from <color> ]?
 *         [ <number> | <percentage> | none]{3}
 *         [ / [<alpha-value> | none] ]?  )
 * ```
 */
export class ModernRgbaSyntax extends Css.Func {
  constructor(
    red: CssPercentage | CssNumber | CssIdentNone,
    green: CssPercentage | CssNumber | CssIdentNone,
    blue: CssPercentage | CssNumber | CssIdentNone,
    alpha?: AlphaValue | CssIdentNone,
  );
  constructor(
    from: Color,
    red: CssPercentage | CssNumber | CssIdentNone,
    green: CssPercentage | CssNumber | CssIdentNone,
    blue: CssPercentage | CssNumber | CssIdentNone,
    alpha?: AlphaValue | CssIdentNone,
  );
  constructor(
    from__red: Color | (CssPercentage | CssNumber | CssIdentNone),
    red__green:
      | (CssPercentage | CssNumber | CssIdentNone)
      | (CssPercentage | CssNumber | CssIdentNone),
    green__blue:
      | (CssPercentage | CssNumber | CssIdentNone)
      | (CssPercentage | CssNumber | CssIdentNone),
    blue__alpha?:
      | (CssPercentage | CssNumber | CssIdentNone)
      | (AlphaValue | CssIdentNone),
    alpha__?: AlphaValue | CssIdentNone,
  ) {
    const from =
      from__red instanceof Css.Numeric ||
      from__red instanceof CssNumber ||
      isIdentNone(from__red)
        ? undefined
        : from__red;
    const red = from !== undefined ? red__green : from__red;
    const green = from !== undefined ? green__blue : red__green;
    const blue = (from !== undefined ? blue__alpha : green__blue) as Css.Val;
    const alpha = from !== undefined ? alpha__ : blue__alpha;

    const vals: Css.Val[] = [];
    if (from !== undefined) vals.push(Css.getName("from"), from);
    vals.push(red, green, blue);
    if (alpha !== undefined) vals.push(Css.slash, alpha);
    super("rgba", [new Css.SpaceList(vals)]);
  }
}
