import { type CssAngle, type CssNumber, type CssPercentage } from "./css-color";

/**
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#typedef-color-alpha-value
 *
 * ```plaintext
 * <alpha-value> = <number> | <percentage>
 * ```
 */
export type AlphaValue = CssNumber | CssPercentage;

/**
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#typedef-hue
 *
 * ```plaintext
 * <hue> = <number> | <angle>
 * ```
 */
export type Hue = CssNumber | CssAngle;
