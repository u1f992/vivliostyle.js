/**
 * ColorFilterVisitor: replaces CmykFilterVisitor.
 * Converts ALL color values to color(srgb ...) and registers them in ColorStore.
 */

import * as Css from "../css";
import { ColorStore } from "./color-store/color-store";
import { SRGBValue } from "./color-store/srgb-value";
import type { ColorEntry } from "./color-store/color-entry";
import { colorToSrgbFloat, colorToColorEntry, isRgbDirect } from "./resolve";
import { NAMED_COLORS } from "./named-colors-table";
import { isValidColorFunction } from "./color-parser";

/**
 * System color UA fixed values (sRGB 0..1).
 * Vivliostyle provides fixed values regardless of the user's system settings.
 */
const SYSTEM_COLOR_VALUES: Record<string, [number, number, number]> = {
  accentcolor: [0, 0.47, 0.84],
  accentcolortext: [1, 1, 1],
  activetext: [1, 0, 0],
  buttonborder: [0.46, 0.46, 0.46],
  buttonface: [0.94, 0.94, 0.94],
  buttontext: [0, 0, 0],
  canvas: [1, 1, 1],
  canvastext: [0, 0, 0],
  field: [1, 1, 1],
  fieldtext: [0, 0, 0],
  graytext: [0.46, 0.46, 0.46],
  highlight: [0, 0.47, 0.84],
  highlighttext: [1, 1, 1],
  linktext: [0, 0, 0.93],
  mark: [1, 1, 0],
  marktext: [0, 0, 0],
  selecteditem: [0, 0.47, 0.84],
  selecteditemtext: [1, 1, 1],
  visitedtext: [0.33, 0, 0.53],
};

/**
 * Extract alpha value from a color function's values.
 * Looks for slash separator followed by a number.
 */
function extractAlpha(func: Css.Func): number | null {
  const vals =
    func.values.length === 1 && func.values[0] instanceof Css.SpaceList
      ? (func.values[0] as Css.SpaceList).values
      : func.values;

  for (let i = 0; i < vals.length; i++) {
    if (vals[i] instanceof Css.Slash && i + 1 < vals.length) {
      const alphaVal = vals[i + 1];
      if (alphaVal instanceof Css.Num) {
        return alphaVal.num;
      }
      if (alphaVal instanceof Css.Numeric && alphaVal.unit === "%") {
        return alphaVal.num / 100;
      }
    }
  }
  return null;
}

/**
 * Extract alpha from hex color (8-digit or 4-digit hex).
 */
function extractHexAlpha(hex: string): number | null {
  if (hex.length === 4) {
    return parseInt(hex[3] + hex[3], 16) / 255;
  }
  if (hex.length === 8) {
    return parseInt(hex.substring(6, 8), 16) / 255;
  }
  return null;
}

export class ColorFilterVisitor extends Css.FilterVisitor {
  readonly #store: ColorStore;
  readonly #conversions = new Map<string, string>();
  #currentProperty: string = "";

  constructor(store: ColorStore) {
    super();
    this.#store = store;
  }

  get store(): ColorStore {
    return this.#store;
  }

  reset(propertyName: string): void {
    this.#currentProperty = propertyName;
  }

  recordConversion(propertyName: string, originalValue: string): void {
    this.#conversions.set(propertyName, originalValue);
  }

  getConversions(): Record<string, string> | null {
    if (this.#conversions.size === 0) return null;
    const result: Record<string, string> = {};
    this.#conversions.forEach((v, k) => {
      result[k] = v;
    });
    return result;
  }

  override visitIdent(ident: Css.Ident): Css.Val {
    const lower = ident.name.toLowerCase();

    // Named color (always opaque)
    const named = NAMED_COLORS[lower];
    if (named !== undefined) {
      return this.#registerColor(named, { type: "DeviceRGB" }, true, null);
    }

    // transparent = rgba(0,0,0,0)
    if (lower === "transparent") {
      return this.#registerColor([0, 0, 0], { type: "DeviceRGB" }, true, 0);
    }

    // System color (always opaque)
    const sys = SYSTEM_COLOR_VALUES[lower];
    if (sys !== undefined) {
      return this.#registerColor(sys, { type: "DeviceRGB" }, true, null);
    }

    // currentcolor — pass through (resolved separately)
    if (lower === "currentcolor") {
      return ident;
    }

    return ident;
  }

  override visitHexColor(color: Css.HexColor): Css.Val {
    const hex = color.hex;
    let r: number, g: number, b: number;

    if (hex.length === 3 || hex.length === 4) {
      r = parseInt(hex[0] + hex[0], 16) / 255;
      g = parseInt(hex[1] + hex[1], 16) / 255;
      b = parseInt(hex[2] + hex[2], 16) / 255;
    } else {
      r = parseInt(hex.substring(0, 2), 16) / 255;
      g = parseInt(hex.substring(2, 4), 16) / 255;
      b = parseInt(hex.substring(4, 6), 16) / 255;
    }

    const alpha = extractHexAlpha(hex);
    return this.#registerColor([r, g, b], { type: "DeviceRGB" }, true, alpha);
  }

  override visitFunc(func: Css.Func): Css.Val {
    if (!isValidColorFunction(func.name)) {
      // Do NOT recurse into non-color functions (e.g. gradients, images).
      return func;
    }

    const rgb = colorToSrgbFloat(func as any);
    const entry = colorToColorEntry(func as any);
    const direct = isRgbDirect(func as any);
    const alpha = extractAlpha(func);

    return this.#registerColor(rgb, entry, direct, alpha);
  }

  #registerColor(
    rgb: [number, number, number],
    entry: ColorEntry,
    direct: boolean,
    alpha: number | null,
  ): Css.Val {
    const srgb = SRGBValue.fromFloat(rgb[0], rgb[1], rgb[2]);

    if (direct) {
      this.#store.registerRgbDirect(srgb, entry);
      return srgb.toColorFunc(alpha);
    } else {
      const assigned = this.#store.registerNonRgb(srgb, entry);
      return assigned.toColorFunc(alpha);
    }
  }
}
