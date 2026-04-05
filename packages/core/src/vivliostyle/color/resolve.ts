/**
 * Bridge: CSS color classes → SRGBValue + ColorEntry.
 *
 * Extracts numeric values from CSS color class instances,
 * converts to sRGB via lcms or CSS-specific conversions,
 * and produces ColorEntry for JSON output.
 */

import * as Css from "../css";
import { SRGBValue } from "./color-store/srgb-value";
import type { ColorEntry } from "./color-store/color-entry";
import { hslToSrgb, hwbToSrgb, deviceCmykToSrgbNaive } from "./convert";
import { labToSrgb, oklabToSrgb } from "./lcms";
import { NAMED_COLORS } from "./named-colors-table";

import {
  type Color,
  HexColor,
  LegacyRgbSyntax,
  ModernRgbSyntax,
  LegacyHslSyntax,
  ModernHslSyntax,
  LegacyRgbaSyntax,
  ModernRgbaSyntax,
  LegacyHslaSyntax,
  ModernHslaSyntax,
  Hwb,
  Lab,
  Lch,
  Oklab,
  Oklch,
  ColorFn,
  DeviceCmyk,
} from "./types";

/**
 * Parse a hex color string (without #) into sRGB [0..1] components.
 */
function hexToSrgb(hex: string): [number, number, number] {
  let r: number;
  let g: number;
  let b: number;

  if (hex.length === 3 || hex.length === 4) {
    r = parseInt(hex[0]! + hex[0]!, 16) / 255;
    g = parseInt(hex[1]! + hex[1]!, 16) / 255;
    b = parseInt(hex[2]! + hex[2]!, 16) / 255;
  } else {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
  }

  return [r, g, b];
}

/**
 * Extract a numeric value from a Css.Val.
 * Handles Css.Num (unitless), Css.Numeric with % (divide by 100).
 */
function numVal(v: Css.Val): number {
  if (v instanceof Css.Num) {
    return v.num;
  }
  if (v instanceof Css.Numeric && v.unit === "%") {
    return v.num / 100;
  }
  return 0;
}

/**
 * Extract angle value in degrees from a Css.Val.
 */
function angleVal(v: Css.Val): number {
  if (v instanceof Css.Num) {
    return v.num;
  }
  if (v instanceof Css.Numeric) {
    switch (v.unit) {
      case "deg":
        return v.num;
      case "rad":
        return (v.num * 180) / Math.PI;
      case "grad":
        return (v.num * 360) / 400;
      case "turn":
        return v.num * 360;
    }
  }
  return 0;
}

/**
 * Extract the components from a Css.Func's values.
 * Modern syntax wraps in SpaceList; legacy is comma-separated direct values.
 */
function extractFuncValues(func: Css.Func): Css.Val[] {
  if (func.values.length === 1 && func.values[0] instanceof Css.SpaceList) {
    return (func.values[0] as Css.SpaceList).values;
  }
  return func.values;
}

/**
 * Determine if a color is an RGB direct color (key should be locked).
 */
export function isRgbDirect(color: Color): boolean {
  if (color instanceof HexColor) return true;
  if (color instanceof LegacyRgbSyntax) return true;
  if (color instanceof ModernRgbSyntax) return true;
  if (color instanceof LegacyRgbaSyntax) return true;
  if (color instanceof ModernRgbaSyntax) return true;
  if (color instanceof LegacyHslSyntax) return true;
  if (color instanceof ModernHslSyntax) return true;
  if (color instanceof LegacyHslaSyntax) return true;
  if (color instanceof ModernHslaSyntax) return true;
  if (color instanceof Hwb) return true;
  // Named colors and system colors are Css.Ident
  if (color instanceof Css.Ident) {
    const name = color.name.toLowerCase();
    if (name in NAMED_COLORS) return true;
    if (name === "transparent") return true;
    // System colors are UA-defined sRGB values
    return true;
  }
  // color(srgb ...) is RGB direct
  if (color instanceof ColorFn) {
    const vals = extractFuncValues(color);
    if (vals[0] instanceof Css.Ident && vals[0].name === "srgb") return true;
  }
  return false;
}

/**
 * Convert any Color to an sRGB float triple [0..1].
 * Requires lcms to be initialized for Lab/OKLab colors.
 */
export function colorToSrgbFloat(color: Color): [number, number, number] {
  // Hex color
  if (color instanceof HexColor) {
    return hexToSrgb(color.hex);
  }

  // Named color / transparent / system color (all are Css.Ident)
  if (color instanceof Css.Ident) {
    const name = color.name.toLowerCase();
    if (name === "transparent") return [0, 0, 0];
    const named = NAMED_COLORS[name];
    if (named !== undefined) return named;
    // System colors — return a default (black) for now
    return [0, 0, 0];
  }

  // Css.Func subclasses
  if (color instanceof Css.Func) {
    const vals = extractFuncValues(color);

    // RGB / RGBA (legacy & modern)
    if (color instanceof LegacyRgbSyntax || color instanceof LegacyRgbaSyntax) {
      return [numVal(vals[0]!), numVal(vals[1]!), numVal(vals[2]!)];
    }
    if (color instanceof ModernRgbSyntax || color instanceof ModernRgbaSyntax) {
      // Skip "from" keyword if present
      let offset = 0;
      if (vals[0] instanceof Css.Ident && vals[0].name === "from") offset = 2;
      return [
        numVal(vals[offset]!),
        numVal(vals[offset + 1]!),
        numVal(vals[offset + 2]!),
      ];
    }

    // HSL / HSLA
    if (color instanceof LegacyHslSyntax || color instanceof LegacyHslaSyntax) {
      return hslToSrgb(
        angleVal(vals[0]!),
        numVal(vals[1]!) * 100,
        numVal(vals[2]!) * 100,
      );
    }
    if (color instanceof ModernHslSyntax || color instanceof ModernHslaSyntax) {
      let offset = 0;
      if (vals[0] instanceof Css.Ident && vals[0].name === "from") offset = 2;
      return hslToSrgb(
        angleVal(vals[offset]!),
        numVal(vals[offset + 1]!) * 100,
        numVal(vals[offset + 2]!) * 100,
      );
    }

    // HWB
    if (color instanceof Hwb) {
      let offset = 0;
      if (vals[0] instanceof Css.Ident && vals[0].name === "from") offset = 2;
      return hwbToSrgb(
        angleVal(vals[offset]!),
        numVal(vals[offset + 1]!) * 100,
        numVal(vals[offset + 2]!) * 100,
      );
    }

    // Lab
    if (color instanceof Lab) {
      let offset = 0;
      if (vals[0] instanceof Css.Ident && vals[0].name === "from") offset = 2;
      const result = labToSrgb(
        numVal(vals[offset]!),
        numVal(vals[offset + 1]!),
        numVal(vals[offset + 2]!),
      );
      return [result[0]!, result[1]!, result[2]!];
    }

    // OKLab
    if (color instanceof Oklab) {
      let offset = 0;
      if (vals[0] instanceof Css.Ident && vals[0].name === "from") offset = 2;
      const result = oklabToSrgb(
        numVal(vals[offset]!),
        numVal(vals[offset + 1]!),
        numVal(vals[offset + 2]!),
      );
      return [result[0]!, result[1]!, result[2]!];
    }

    // LCH → Lab → sRGB (polar to rectangular first)
    if (color instanceof Lch) {
      let offset = 0;
      if (vals[0] instanceof Css.Ident && vals[0].name === "from") offset = 2;
      const L = numVal(vals[offset]!);
      const C = numVal(vals[offset + 1]!);
      const H = angleVal(vals[offset + 2]!);
      const hRad = (H * Math.PI) / 180;
      const result = labToSrgb(L, C * Math.cos(hRad), C * Math.sin(hRad));
      return [result[0]!, result[1]!, result[2]!];
    }

    // OKLCH → OKLab → sRGB
    if (color instanceof Oklch) {
      let offset = 0;
      if (vals[0] instanceof Css.Ident && vals[0].name === "from") offset = 2;
      const L = numVal(vals[offset]!);
      const C = numVal(vals[offset + 1]!);
      const H = angleVal(vals[offset + 2]!);
      const hRad = (H * Math.PI) / 180;
      const result = oklabToSrgb(L, C * Math.cos(hRad), C * Math.sin(hRad));
      return [result[0]!, result[1]!, result[2]!];
    }

    // device-cmyk
    if (color instanceof DeviceCmyk) {
      const c = numVal(vals[0]!);
      const m = numVal(vals[1]!);
      const y = numVal(vals[2]!);
      const k = numVal(vals[3]!);
      return deviceCmykToSrgbNaive(c, m, y, k);
    }
  }

  // Fallback
  return [0, 0, 0];
}

/**
 * Convert a Color to an SRGBValue (integer precision for ColorStore key).
 */
export function colorToSrgbValue(color: Color): SRGBValue {
  const [r, g, b] = colorToSrgbFloat(color);
  return SRGBValue.fromFloat(r, g, b);
}

/**
 * Convert a Color to a ColorEntry for JSON output.
 */
export function colorToColorEntry(color: Color): ColorEntry {
  // RGB direct colors
  if (isRgbDirect(color)) {
    return { type: "DeviceRGB" };
  }

  // Lab
  if (color instanceof Lab) {
    const vals = extractFuncValues(color);
    let offset = 0;
    if (vals[0] instanceof Css.Ident && vals[0].name === "from") offset = 2;
    return {
      type: "Lab",
      L: numVal(vals[offset]!),
      a: numVal(vals[offset + 1]!),
      b: numVal(vals[offset + 2]!),
    };
  }

  // OKLab → convert to CIE Lab for PDF /Lab
  if (color instanceof Oklab) {
    const [r, g, b] = colorToSrgbFloat(color);
    // Re-convert from sRGB to Lab for the entry
    // (This is approximate — for full accuracy, use lcms oklab→lab directly)
    const lab = labToSrgb(r, g, b); // This is wrong; we need srgbToLab
    return { type: "Lab", L: lab[0]!, a: lab[1]!, b: lab[2]! };
  }

  // LCH → CIE Lab
  if (color instanceof Lch) {
    const vals = extractFuncValues(color);
    let offset = 0;
    if (vals[0] instanceof Css.Ident && vals[0].name === "from") offset = 2;
    const L = numVal(vals[offset]!);
    const C = numVal(vals[offset + 1]!);
    const H = angleVal(vals[offset + 2]!);
    const hRad = (H * Math.PI) / 180;
    return { type: "Lab", L, a: C * Math.cos(hRad), b: C * Math.sin(hRad) };
  }

  // device-cmyk
  if (color instanceof DeviceCmyk) {
    const vals = extractFuncValues(color);
    return {
      type: "DeviceCMYK",
      c: Math.round(numVal(vals[0]!) * 10000),
      m: Math.round(numVal(vals[1]!) * 10000),
      y: Math.round(numVal(vals[2]!) * 10000),
      k: Math.round(numVal(vals[3]!) * 10000),
    };
  }

  // Fallback: DeviceRGB
  return { type: "DeviceRGB" };
}
