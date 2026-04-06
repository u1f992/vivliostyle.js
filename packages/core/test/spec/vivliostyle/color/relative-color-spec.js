/**
 * Comprehensive spec tests for CSS relative color syntax.
 */

import { ColorResolverVisitor } from "../../../../src/vivliostyle/color/color-resolver";
import * as Css from "../../../../src/vivliostyle/css";

function resolve(func) {
  var resolver = new ColorResolverVisitor();
  return func.visit(resolver);
}

function getResolvedValues(result) {
  expect(result instanceof Css.Func).toBe(true);
  var space = result.values[0];
  expect(space instanceof Css.SpaceList).toBe(true);
  return space.values;
}

function assertClose(actual, expected, epsilon) {
  epsilon = epsilon || 0.01;
  expect(Math.abs(actual - expected)).toBeLessThan(epsilon);
}

describe("color/relative-color-syntax", function () {
  describe("rgb identity transforms", function () {
    it("rgb(from red r g b) → rgb(1 0 0)", function () {
      var func = new Css.Func("rgb", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("red"),
          Css.getName("r"),
          Css.getName("g"),
          Css.getName("b"),
        ]),
      ]);
      var result = resolve(func);
      var vals = getResolvedValues(result);
      assertClose(vals[0].num, 1);
      assertClose(vals[1].num, 0);
      assertClose(vals[2].num, 0);
    });

    it("rgb(from #00ff00 r g b) → rgb(0 1 0)", function () {
      var func = new Css.Func("rgb", [
        new Css.SpaceList([
          Css.getName("from"),
          new Css.HexColor("00ff00"),
          Css.getName("r"),
          Css.getName("g"),
          Css.getName("b"),
        ]),
      ]);
      var result = resolve(func);
      var vals = getResolvedValues(result);
      assertClose(vals[0].num, 0);
      assertClose(vals[1].num, 1);
      assertClose(vals[2].num, 0);
    });
  });

  describe("channel swapping", function () {
    it("rgb(from blue g b r) swaps channels", function () {
      var func = new Css.Func("rgb", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("blue"),
          Css.getName("g"),
          Css.getName("b"),
          Css.getName("r"),
        ]),
      ]);
      var result = resolve(func);
      var vals = getResolvedValues(result);
      // blue = rgb(0, 0, 1), so g=0, b=1, r=0
      assertClose(vals[0].num, 0);
      assertClose(vals[1].num, 1);
      assertClose(vals[2].num, 0);
    });
  });

  describe("none keyword", function () {
    it("rgb(from red r none b) preserves none", function () {
      var func = new Css.Func("rgb", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("red"),
          Css.getName("r"),
          Css.getName("none"),
          Css.getName("b"),
        ]),
      ]);
      var result = resolve(func);
      var vals = getResolvedValues(result);
      expect(vals[0] instanceof Css.Num).toBe(true);
      expect(vals[1] instanceof Css.Ident).toBe(true);
      expect(vals[1].name).toBe("none");
      expect(vals[2] instanceof Css.Num).toBe(true);
    });
  });

  describe("calc() with component keywords", function () {
    it("rgb(from red calc(r / 2) g b) halves red", function () {
      // calc() wraps values in a SpaceList: calc(r / 2) = Func("calc", [SpaceList([Ident("r"), Ident("/"), Num(2)])])
      var calcFunc = new Css.Func("calc", [
        new Css.SpaceList([Css.getName("r"), Css.getName("/"), new Css.Num(2)]),
      ]);
      var func = new Css.Func("rgb", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("red"),
          calcFunc,
          Css.getName("g"),
          Css.getName("b"),
        ]),
      ]);
      var result = resolve(func);
      var vals = getResolvedValues(result);
      // r=1, so calc(r/2) = 0.5
      assertClose(vals[0].num, 0.5);
      assertClose(vals[1].num, 0);
      assertClose(vals[2].num, 0);
    });

    it("rgb(from white calc(r * 0.5) calc(g * 0.5) calc(b * 0.5)) darkens", function () {
      var func = new Css.Func("rgb", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("white"),
          new Css.Func("calc", [
            new Css.SpaceList([
              Css.getName("r"),
              Css.getName("*"),
              new Css.Num(0.5),
            ]),
          ]),
          new Css.Func("calc", [
            new Css.SpaceList([
              Css.getName("g"),
              Css.getName("*"),
              new Css.Num(0.5),
            ]),
          ]),
          new Css.Func("calc", [
            new Css.SpaceList([
              Css.getName("b"),
              Css.getName("*"),
              new Css.Num(0.5),
            ]),
          ]),
        ]),
      ]);
      var result = resolve(func);
      var vals = getResolvedValues(result);
      assertClose(vals[0].num, 0.5);
      assertClose(vals[1].num, 0.5);
      assertClose(vals[2].num, 0.5);
    });
  });

  describe("HSL relative color", function () {
    it("hsl(from red h s l) → hsl(0 100 50)", function () {
      var func = new Css.Func("hsl", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("red"),
          Css.getName("h"),
          Css.getName("s"),
          Css.getName("l"),
        ]),
      ]);
      var result = resolve(func);
      var vals = getResolvedValues(result);
      assertClose(vals[0].num, 0, 0.1); // hue = 0
      assertClose(vals[1].num, 100, 0.1); // saturation = 100
      assertClose(vals[2].num, 50, 0.1); // lightness = 50
    });

    it("hsl(from green h s l) → hsl(120 100 ~25)", function () {
      var func = new Css.Func("hsl", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("green"),
          Css.getName("h"),
          Css.getName("s"),
          Css.getName("l"),
        ]),
      ]);
      var result = resolve(func);
      var vals = getResolvedValues(result);
      assertClose(vals[0].num, 120, 0.1);
      assertClose(vals[1].num, 100, 0.1);
      // green = #008000 = rgb(0, 128/255, 0), lightness ≈ 25.1%
      assertClose(vals[2].num, 25.1, 0.5);
    });
  });

  describe("HWB relative color", function () {
    it("hwb(from red h w b) → hwb(0 0 0)", function () {
      var func = new Css.Func("hwb", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("red"),
          Css.getName("h"),
          Css.getName("w"),
          Css.getName("b"),
        ]),
      ]);
      var result = resolve(func);
      var vals = getResolvedValues(result);
      assertClose(vals[0].num, 0, 0.1); // hue = 0
      assertClose(vals[1].num, 0, 0.1); // whiteness = 0
      assertClose(vals[2].num, 0, 0.1); // blackness = 0
    });
  });

  describe("cross-space conversion", function () {
    it("hsl(from #004400 h s l) converts hex to HSL", function () {
      var func = new Css.Func("hsl", [
        new Css.SpaceList([
          Css.getName("from"),
          new Css.HexColor("004400"),
          Css.getName("h"),
          Css.getName("s"),
          Css.getName("l"),
        ]),
      ]);
      var result = resolve(func);
      var vals = getResolvedValues(result);
      assertClose(vals[0].num, 120, 0.1); // hue = 120 (green)
      assertClose(vals[1].num, 100, 0.1); // saturation = 100%
      // #004400 = rgb(0, 68/255, 0), lightness ≈ 13.3%
      assertClose(vals[2].num, 13.3, 0.5);
    });
  });

  describe("non-relative passthrough", function () {
    it("rgb(1 0 0) without from passes through unchanged", function () {
      var func = new Css.Func("rgb", [
        new Css.SpaceList([new Css.Num(1), new Css.Num(0), new Css.Num(0)]),
      ]);
      var result = resolve(func);
      expect(result).toBe(func);
    });

    it("non-color function passes through", function () {
      var func = new Css.Func("calc", [new Css.Num(42)]);
      var result = resolve(func);
      expect(result).toBe(func);
    });
  });

  describe("alpha in relative color", function () {
    it("rgb(from red r g b / 0.5) preserves explicit alpha", function () {
      var func = new Css.Func("rgb", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("red"),
          Css.getName("r"),
          Css.getName("g"),
          Css.getName("b"),
          Css.slash,
          new Css.Num(0.5),
        ]),
      ]);
      var result = resolve(func);
      var vals = getResolvedValues(result);
      assertClose(vals[0].num, 1);
      assertClose(vals[1].num, 0);
      assertClose(vals[2].num, 0);
      expect(vals[3] instanceof Css.Slash).toBe(true);
      assertClose(vals[4].num, 0.5);
    });
  });
});
