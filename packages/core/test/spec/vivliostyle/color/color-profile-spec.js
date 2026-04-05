import {
  resolveInkName,
  unitVector,
  computeFallback,
  srcComponentCount,
  srcToAlternateSpace,
} from "../../../../src/vivliostyle/color/color-profile";

describe("color/color-profile", function () {
  describe("resolveInkName", function () {
    it("device-cmyk positions", function () {
      var src = { kind: "device-cmyk" };
      expect(resolveInkName("c", 0, src)).toBe("Cyan");
      expect(resolveInkName("m", 1, src)).toBe("Magenta");
      expect(resolveInkName("y", 2, src)).toBe("Yellow");
      expect(resolveInkName("k", 3, src)).toBe("Black");
      expect(resolveInkName("blue", 4, src)).toBe("blue");
    });

    it("srgb uses ident", function () {
      var src = { kind: "srgb" };
      expect(resolveInkName("r", 0, src)).toBe("r");
    });
  });

  describe("unitVector", function () {
    it("generates correct vectors", function () {
      expect(unitVector(0, 4)).toEqual([1, 0, 0, 0]);
      expect(unitVector(2, 4)).toEqual([0, 0, 1, 0]);
      expect(unitVector(1, 3)).toEqual([0, 1, 0]);
    });

    it("out of range", function () {
      expect(unitVector(5, 4)).toEqual([0, 0, 0, 0]);
    });
  });

  describe("computeFallback", function () {
    it("single spot color", function () {
      var components = [
        {
          form: 2,
          inkName: "PANTONE Reflex Blue C",
          fallback: [1, 0.723, 0, 0.02],
        },
      ];
      var result = computeFallback(components, [0.5], 4);
      expect(result[0]).toBeCloseTo(0.5, 5);
      expect(result[1]).toBeCloseTo(0.3615, 5);
      expect(result[2]).toBeCloseTo(0, 5);
      expect(result[3]).toBeCloseTo(0.01, 5);
    });

    it("process color unit vectors", function () {
      var components = [
        { form: 1, ident: "c", inkName: "Cyan" },
        { form: 1, ident: "m", inkName: "Magenta" },
        { form: 1, ident: "y", inkName: "Yellow" },
        { form: 1, ident: "k", inkName: "Black" },
      ];
      var result = computeFallback(components, [0.5, 0, 0, 0.2], 4);
      expect(result[0]).toBeCloseTo(0.5, 5);
      expect(result[3]).toBeCloseTo(0.2, 5);
    });
  });

  describe("srcComponentCount", function () {
    it("returns correct counts", function () {
      expect(srcComponentCount({ kind: "device-cmyk" })).toBe(4);
      expect(srcComponentCount({ kind: "srgb" })).toBe(3);
      expect(srcComponentCount({ kind: "lab" })).toBe(3);
      expect(srcComponentCount({ kind: "url", url: "foo.icc" })).toBe(-1);
    });
  });

  describe("srcToAlternateSpace", function () {
    it("returns correct spaces", function () {
      expect(srcToAlternateSpace({ kind: "device-cmyk" })).toBe("DeviceCMYK");
      expect(srcToAlternateSpace({ kind: "srgb" })).toBe("DeviceRGB");
      expect(srcToAlternateSpace({ kind: "lab" })).toBe("Lab");
    });
  });
});
