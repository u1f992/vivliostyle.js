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
import { isValidColorFunction, isValidColorIdent } from "./color-parser";

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

    // Named color
    const named = NAMED_COLORS[lower];
    if (named !== undefined) {
      return this.#registerColor(named, { type: "DeviceRGB" }, true);
    }

    // transparent
    if (lower === "transparent") {
      return this.#registerColor([0, 0, 0], { type: "DeviceRGB" }, true);
    }

    // System color
    const sys = SYSTEM_COLOR_VALUES[lower];
    if (sys !== undefined) {
      return this.#registerColor(sys, { type: "DeviceRGB" }, true);
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

    return this.#registerColor([r, g, b], { type: "DeviceRGB" }, true);
  }

  override visitFunc(func: Css.Func): Css.Val {
    if (!isValidColorFunction(func.name)) {
      return super.visitFunc(func);
    }

    // Use resolve.ts to convert to sRGB and get ColorEntry
    const rgb = colorToSrgbFloat(func as any);
    const entry = colorToColorEntry(func as any);
    const direct = isRgbDirect(func as any);

    return this.#registerColor(rgb, entry, direct);
  }

  #registerColor(
    rgb: [number, number, number],
    entry: ColorEntry,
    direct: boolean,
  ): Css.Val {
    const srgb = SRGBValue.fromFloat(rgb[0], rgb[1], rgb[2]);

    if (direct) {
      this.#store.registerRgbDirect(srgb, entry);
      return srgb.toColorFunc(null);
    } else {
      const assigned = this.#store.registerNonRgb(srgb, entry);
      return assigned.toColorFunc(null);
    }
  }
}
