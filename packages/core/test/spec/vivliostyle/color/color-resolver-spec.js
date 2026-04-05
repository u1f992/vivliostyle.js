import { ColorResolverVisitor } from "../../../../src/vivliostyle/color/color-resolver";
import * as Css from "../../../../src/vivliostyle/css";

function assertClose(actual, expected, epsilon) {
  expect(Math.abs(actual - expected)).toBeLessThan(epsilon);
}

describe("color/color-resolver", function () {
  var resolver;

  beforeEach(function () {
    resolver = new ColorResolverVisitor();
  });

  describe("contrast-color", function () {
    it("returns white for dark background", function () {
      // contrast-color(black) → white
      var func = new Css.Func("contrast-color", [
        new Css.SpaceList([Css.getName("black")]),
      ]);
      var result = func.visit(resolver);
      expect(result instanceof Css.Ident).toBe(true);
      expect(result.name).toBe("white");
    });

    it("returns black for light background", function () {
      // contrast-color(white) → black
      var func = new Css.Func("contrast-color", [
        new Css.SpaceList([Css.getName("white")]),
      ]);
      var result = func.visit(resolver);
      expect(result instanceof Css.Ident).toBe(true);
      expect(result.name).toBe("black");
    });
  });

  describe("light-dark", function () {
    it("returns first (light) color", function () {
      var light = Css.getName("red");
      var dark = Css.getName("blue");
      var func = new Css.Func("light-dark", [light, dark]);
      var result = func.visit(resolver);
      expect(result).toBe(light);
    });
  });

  describe("relative color syntax", function () {
    it("resolves rgb(from red r g b) to identity", function () {
      // rgb(from red r g b) → rgb(1 0 0) effectively
      var func = new Css.Func("rgb", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("red"),
          Css.getName("r"),
          Css.getName("g"),
          Css.getName("b"),
        ]),
      ]);
      var result = func.visit(resolver);
      expect(result instanceof Css.Func).toBe(true);
      expect(result.name).toBe("rgb");
      // Should have resolved idents to numbers
      var vals = result.values[0].values;
      expect(vals[0] instanceof Css.Num).toBe(true);
      assertClose(vals[0].num, 1, 0.01); // red = 1
      assertClose(vals[1].num, 0, 0.01); // green = 0
      assertClose(vals[2].num, 0, 0.01); // blue = 0
    });

    it("resolves rgb(from blue g b r) swapping channels", function () {
      // rgb(from blue g b r) → rgb(0 1 0) since blue's g=0, b=1, r=0
      var func = new Css.Func("rgb", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("blue"),
          Css.getName("g"),
          Css.getName("b"),
          Css.getName("r"),
        ]),
      ]);
      var result = func.visit(resolver);
      var vals = result.values[0].values;
      assertClose(vals[0].num, 0, 0.01); // blue's g = 0
      assertClose(vals[1].num, 1, 0.01); // blue's b = 1
      assertClose(vals[2].num, 0, 0.01); // blue's r = 0
    });

    it("preserves none keyword", function () {
      var func = new Css.Func("rgb", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("red"),
          Css.getName("r"),
          Css.getName("none"),
          Css.getName("b"),
        ]),
      ]);
      var result = func.visit(resolver);
      var vals = result.values[0].values;
      expect(vals[0] instanceof Css.Num).toBe(true);
      expect(vals[1] instanceof Css.Ident).toBe(true);
      expect(vals[1].name).toBe("none");
      expect(vals[2] instanceof Css.Num).toBe(true);
    });

    it("resolves hsl relative syntax", function () {
      // hsl(from red h s l) → hsl(0 100 50) (red in HSL)
      var func = new Css.Func("hsl", [
        new Css.SpaceList([
          Css.getName("from"),
          Css.getName("red"),
          Css.getName("h"),
          Css.getName("s"),
          Css.getName("l"),
        ]),
      ]);
      var result = func.visit(resolver);
      var vals = result.values[0].values;
      assertClose(vals[0].num, 0, 0.1); // hue = 0
      assertClose(vals[1].num, 100, 0.1); // saturation = 100
      assertClose(vals[2].num, 50, 0.1); // lightness = 50
    });

    it("passes through non-relative functions unchanged", function () {
      var func = new Css.Func("rgb", [
        new Css.SpaceList([new Css.Num(1), new Css.Num(0), new Css.Num(0)]),
      ]);
      var result = func.visit(resolver);
      expect(result).toBe(func);
    });
  });
});
