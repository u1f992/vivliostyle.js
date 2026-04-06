/**
 * Comprehensive spec tests for CSS Color Level 4/5 conversion.
 * Tests the full pipeline: color value → ColorFilterVisitor → color(srgb ...) output.
 */

import * as Css from "../../../../src/vivliostyle/css";
import { ColorFilterVisitor } from "../../../../src/vivliostyle/color/color-filter-visitor";
import { ColorStore } from "../../../../src/vivliostyle/color/color-store/color-store";

function makeVisitor() {
  return new ColorFilterVisitor(new ColorStore());
}

function visitColor(val) {
  var visitor = makeVisitor();
  return val.visit(visitor);
}

function expectSrgb(result, r, g, b, epsilon) {
  epsilon = epsilon || 0.001;
  expect(result instanceof Css.Func).toBe(true);
  expect(result.name).toBe("color");
  var space = result.values[0];
  expect(space instanceof Css.SpaceList).toBe(true);
  var vals = space.values;
  expect(vals[0] instanceof Css.Ident).toBe(true);
  expect(vals[0].name).toBe("srgb");
  expect(Math.abs(vals[1].num - r)).toBeLessThan(epsilon);
  expect(Math.abs(vals[2].num - g)).toBeLessThan(epsilon);
  expect(Math.abs(vals[3].num - b)).toBeLessThan(epsilon);
}

function expectSrgbWithAlpha(result, r, g, b, a, epsilon) {
  epsilon = epsilon || 0.001;
  expect(result instanceof Css.Func).toBe(true);
  expect(result.name).toBe("color");
  var space = result.values[0];
  expect(space instanceof Css.SpaceList).toBe(true);
  var vals = space.values;
  expect(vals[0].name).toBe("srgb");
  expect(Math.abs(vals[1].num - r)).toBeLessThan(epsilon);
  expect(Math.abs(vals[2].num - g)).toBeLessThan(epsilon);
  expect(Math.abs(vals[3].num - b)).toBeLessThan(epsilon);
  // slash + alpha
  expect(vals[4] instanceof Css.Slash).toBe(true);
  expect(Math.abs(vals[5].num - a)).toBeLessThan(epsilon);
}

describe("color/color-conversion", function () {
  // ---- Named colors ----

  describe("named colors", function () {
    it("red → color(srgb 1 0 0)", function () {
      expectSrgb(visitColor(Css.getName("red")), 1, 0, 0);
    });

    it("blue → color(srgb 0 0 1)", function () {
      expectSrgb(visitColor(Css.getName("blue")), 0, 0, 1);
    });

    it("rebeccapurple → color(srgb 0.4 0.2 0.6)", function () {
      expectSrgb(visitColor(Css.getName("rebeccapurple")), 0.4, 0.2, 0.6);
    });
  });

  // ---- transparent ----

  describe("transparent", function () {
    it("transparent → color(srgb 0 0 0 / 0)", function () {
      expectSrgbWithAlpha(visitColor(Css.getName("transparent")), 0, 0, 0, 0);
    });
  });

  // ---- Hex colors ----

  describe("hex colors", function () {
    it("#ff0000 → color(srgb 1 0 0)", function () {
      expectSrgb(visitColor(new Css.HexColor("ff0000")), 1, 0, 0);
    });

    it("#004400 → color(srgb 0 0.2667 0)", function () {
      expectSrgb(visitColor(new Css.HexColor("004400")), 0, 0.2667, 0);
    });

    it("#f00 (3-digit) → color(srgb 1 0 0)", function () {
      expectSrgb(visitColor(new Css.HexColor("f00")), 1, 0, 0);
    });

    it("#ff000080 (8-digit with alpha) → color(srgb 1 0 0 / 0.502)", function () {
      expectSrgbWithAlpha(
        visitColor(new Css.HexColor("ff000080")),
        1,
        0,
        0,
        0.502,
      );
    });

    it("#f008 (4-digit with alpha) → color(srgb 1 0 0 / 0.533)", function () {
      expectSrgbWithAlpha(
        visitColor(new Css.HexColor("f008")),
        1,
        0,
        0,
        0.533,
        0.01,
      );
    });
  });

  // ---- Legacy rgb/rgba ----

  describe("legacy rgb/rgba", function () {
    it("rgb(255, 0, 0) → color(srgb 1 0 0)", function () {
      var func = new Css.Func("rgb", [
        new Css.Num(255),
        new Css.Num(0),
        new Css.Num(0),
      ]);
      expectSrgb(visitColor(func), 1, 0, 0);
    });

    it("rgb(127, 127, 127) → color(srgb ~0.498 ~0.498 ~0.498)", function () {
      var func = new Css.Func("rgb", [
        new Css.Num(127),
        new Css.Num(127),
        new Css.Num(127),
      ]);
      expectSrgb(visitColor(func), 127 / 255, 127 / 255, 127 / 255, 0.01);
    });

    it("rgba(255, 0, 0, 0.5) preserves alpha", function () {
      var func = new Css.Func("rgba", [
        new Css.Num(255),
        new Css.Num(0),
        new Css.Num(0),
        new Css.Num(0.5),
      ]);
      expectSrgbWithAlpha(visitColor(func), 1, 0, 0, 0.5);
    });

    it("rgb(50%, 0%, 0%) with percentages", function () {
      var func = new Css.Func("rgb", [
        new Css.Numeric(50, "%"),
        new Css.Numeric(0, "%"),
        new Css.Numeric(0, "%"),
      ]);
      expectSrgb(visitColor(func), 0.5, 0, 0);
    });
  });

  // ---- Modern rgb/rgba ----

  describe("modern rgb/rgba", function () {
    it("rgb(1 0 0) → color(srgb 1 0 0)", function () {
      var func = new Css.Func("rgb", [
        new Css.SpaceList([new Css.Num(1), new Css.Num(0), new Css.Num(0)]),
      ]);
      expectSrgb(visitColor(func), 1, 0, 0);
    });

    it("rgb(0.5 0.3 0.8 / 0.5) preserves alpha", function () {
      var func = new Css.Func("rgb", [
        new Css.SpaceList([
          new Css.Num(0.5),
          new Css.Num(0.3),
          new Css.Num(0.8),
          Css.slash,
          new Css.Num(0.5),
        ]),
      ]);
      expectSrgbWithAlpha(visitColor(func), 0.5, 0.3, 0.8, 0.5);
    });

    it("legacy and modern rgb produce same result", function () {
      var legacy = new Css.Func("rgb", [
        new Css.Num(255),
        new Css.Num(0),
        new Css.Num(0),
      ]);
      var modern = new Css.Func("rgb", [
        new Css.SpaceList([new Css.Num(1), new Css.Num(0), new Css.Num(0)]),
      ]);
      expect(visitColor(legacy).toString()).toBe(visitColor(modern).toString());
    });
  });

  // ---- Legacy hsl/hsla ----

  describe("legacy hsl/hsla", function () {
    it("hsl(0, 100%, 50%) → red", function () {
      var func = new Css.Func("hsl", [
        new Css.Num(0),
        new Css.Numeric(100, "%"),
        new Css.Numeric(50, "%"),
      ]);
      expectSrgb(visitColor(func), 1, 0, 0);
    });

    it("hsla(120, 100%, 50%, 0.5) → green with alpha", function () {
      var func = new Css.Func("hsla", [
        new Css.Num(120),
        new Css.Numeric(100, "%"),
        new Css.Numeric(50, "%"),
        new Css.Num(0.5),
      ]);
      expectSrgbWithAlpha(visitColor(func), 0, 1, 0, 0.5);
    });
  });

  // ---- Modern hsl ----

  describe("modern hsl", function () {
    it("hsl(240 100% 50%) → blue", function () {
      var func = new Css.Func("hsl", [
        new Css.SpaceList([
          new Css.Num(240),
          new Css.Numeric(100, "%"),
          new Css.Numeric(50, "%"),
        ]),
      ]);
      expectSrgb(visitColor(func), 0, 0, 1);
    });
  });

  // ---- HWB ----

  describe("hwb", function () {
    it("hwb(0 0% 0%) → red", function () {
      var func = new Css.Func("hwb", [
        new Css.SpaceList([
          new Css.Num(0),
          new Css.Numeric(0, "%"),
          new Css.Numeric(0, "%"),
        ]),
      ]);
      expectSrgb(visitColor(func), 1, 0, 0);
    });
  });

  // ---- device-cmyk ----

  describe("device-cmyk", function () {
    it("device-cmyk(1 0 0 0) → cyan", function () {
      var func = new Css.Func("device-cmyk", [
        new Css.SpaceList([
          new Css.Num(1),
          new Css.Num(0),
          new Css.Num(0),
          new Css.Num(0),
        ]),
      ]);
      expectSrgb(visitColor(func), 0, 1, 1);
    });

    it("legacy device-cmyk(1, 0, 0, 0) → cyan", function () {
      var func = new Css.Func("device-cmyk", [
        new Css.Num(1),
        new Css.Num(0),
        new Css.Num(0),
        new Css.Num(0),
      ]);
      expectSrgb(visitColor(func), 0, 1, 1);
    });

    it("modern and legacy device-cmyk produce same result", function () {
      var modern = new Css.Func("device-cmyk", [
        new Css.SpaceList([
          new Css.Num(1),
          new Css.Num(0),
          new Css.Num(0),
          new Css.Num(0),
        ]),
      ]);
      var legacy = new Css.Func("device-cmyk", [
        new Css.Num(1),
        new Css.Num(0),
        new Css.Num(0),
        new Css.Num(0),
      ]);
      expect(visitColor(modern).toString()).toBe(visitColor(legacy).toString());
    });

    it("legacy device-cmyk(c, m, y, k, alpha) preserves alpha", function () {
      var func = new Css.Func("device-cmyk", [
        new Css.Num(1),
        new Css.Num(0),
        new Css.Num(0),
        new Css.Num(0),
        new Css.Num(0.5),
      ]);
      expectSrgbWithAlpha(visitColor(func), 0, 1, 1, 0.5);
    });

    it("modern device-cmyk(c m y k / alpha) preserves alpha", function () {
      var func = new Css.Func("device-cmyk", [
        new Css.SpaceList([
          new Css.Num(1),
          new Css.Num(0),
          new Css.Num(0),
          new Css.Num(0),
          Css.slash,
          new Css.Num(0.5),
        ]),
      ]);
      expectSrgbWithAlpha(visitColor(func), 0, 1, 1, 0.5);
    });

    it("device-cmyk(0 0 0 1) → black", function () {
      var func = new Css.Func("device-cmyk", [
        new Css.SpaceList([
          new Css.Num(0),
          new Css.Num(0),
          new Css.Num(0),
          new Css.Num(1),
        ]),
      ]);
      expectSrgb(visitColor(func), 0, 0, 0);
    });
  });

  // ---- color(srgb ...) ----

  describe("color(srgb)", function () {
    it("color(srgb 1 0 0) → color(srgb 1 0 0)", function () {
      var func = new Css.Func("color", [
        new Css.SpaceList([
          Css.getName("srgb"),
          new Css.Num(1),
          new Css.Num(0),
          new Css.Num(0),
        ]),
      ]);
      expectSrgb(visitColor(func), 1, 0, 0);
    });
  });

  // ---- System colors ----

  describe("system colors", function () {
    it("Canvas → white", function () {
      expectSrgb(visitColor(Css.getName("Canvas")), 1, 1, 1);
    });

    it("CanvasText → black", function () {
      expectSrgb(visitColor(Css.getName("CanvasText")), 0, 0, 0);
    });
  });

  // ---- Gradient non-interference ----

  describe("gradients", function () {
    it("sRGB colors in gradients pass through unchanged", function () {
      var gradient = new Css.Func("linear-gradient", [
        new Css.CommaList([Css.getName("red"), Css.getName("blue")]),
      ]);
      var result = visitColor(gradient);
      // The gradient itself should be returned (possibly with new CommaList if visited)
      expect(result instanceof Css.Func).toBe(true);
      expect(result.name).toBe("linear-gradient");
      // Named colors inside should NOT be converted
      var inner = result.values[0];
      if (inner instanceof Css.CommaList) {
        expect(inner.values[0] instanceof Css.Ident).toBe(true);
        expect(inner.values[0].name).toBe("red");
        expect(inner.values[1] instanceof Css.Ident).toBe(true);
        expect(inner.values[1].name).toBe("blue");
      }
    });

    it("device-cmyk in gradient IS converted (browser cannot render it)", function () {
      var cmykFunc = new Css.Func("device-cmyk", [
        new Css.SpaceList([
          new Css.Num(1),
          new Css.Num(0),
          new Css.Num(0),
          new Css.Num(0),
        ]),
      ]);
      var gradient = new Css.Func("linear-gradient", [
        new Css.CommaList([cmykFunc, Css.getName("red")]),
      ]);
      var result = visitColor(gradient);
      expect(result instanceof Css.Func).toBe(true);
      expect(result.name).toBe("linear-gradient");
      var inner = result.values[0];
      if (inner instanceof Css.CommaList) {
        // First color should be converted from device-cmyk to color(srgb)
        expect(inner.values[0] instanceof Css.Func).toBe(true);
        expect(inner.values[0].name).toBe("color");
        // Second color (red) should pass through
        expect(inner.values[1] instanceof Css.Ident).toBe(true);
        expect(inner.values[1].name).toBe("red");
      }
    });
  });
});
