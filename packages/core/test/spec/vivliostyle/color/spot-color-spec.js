/**
 * Spec tests for @color-profile spot color notation.
 * Based on the proposal in vivliostyle/vivliostyle.js#1836 comment 4189988257.
 *
 * Tests the 4 component forms, their expansion rules, mixing, and fallback computation.
 */

import {
  resolveInkName,
  unitVector,
  computeFallback,
  srcComponentCount,
  srcToAlternateSpace,
} from "../../../../src/vivliostyle/color/color-profile";

var DEVICE_CMYK = { kind: "device-cmyk" };
var SRGB = { kind: "srgb" };
var URL_SRC = { kind: "url", url: "fogra51.icc" };

describe("color/spot-color (@color-profile components)", function () {
  // ---- Form 1: <custom-ident> only ----

  describe("form 1: <custom-ident>", function () {
    it("generates unit vectors for ICC profile (url src)", function () {
      // @color-profile --fogra51 { src: url(...); components: c, m, y, k; }
      // c → "c" 1 0 0 0
      expect(unitVector(0, 4)).toEqual([1, 0, 0, 0]);
      expect(unitVector(1, 4)).toEqual([0, 1, 0, 0]);
      expect(unitVector(2, 4)).toEqual([0, 0, 1, 0]);
      expect(unitVector(3, 4)).toEqual([0, 0, 0, 1]);
    });

    it("uses ident as ink name for non-device-cmyk src", function () {
      // src: url(...) → ident string as-is
      expect(resolveInkName("c", 0, URL_SRC)).toBe("c");
      expect(resolveInkName("m", 1, URL_SRC)).toBe("m");
    });

    it("uses PDF reserved names for device-cmyk src", function () {
      // src: device-cmyk → Cyan, Magenta, Yellow, Black
      expect(resolveInkName("c", 0, DEVICE_CMYK)).toBe("Cyan");
      expect(resolveInkName("m", 1, DEVICE_CMYK)).toBe("Magenta");
      expect(resolveInkName("y", 2, DEVICE_CMYK)).toBe("Yellow");
      expect(resolveInkName("k", 3, DEVICE_CMYK)).toBe("Black");
    });

    it("uses ident for positions beyond 4 in device-cmyk", function () {
      expect(resolveInkName("blue", 4, DEVICE_CMYK)).toBe("blue");
    });

    it("fallback with unit vectors acts as identity", function () {
      // c,m,y,k as process colors: input (0.5, 0, 0, 0.2) → same output
      var components = [
        { form: 1, ident: "c", inkName: "Cyan" },
        { form: 1, ident: "m", inkName: "Magenta" },
        { form: 1, ident: "y", inkName: "Yellow" },
        { form: 1, ident: "k", inkName: "Black" },
      ];
      var result = computeFallback(components, [0.5, 0, 0, 0.2], 4);
      expect(result[0]).toBeCloseTo(0.5, 5);
      expect(result[1]).toBeCloseTo(0, 5);
      expect(result[2]).toBeCloseTo(0, 5);
      expect(result[3]).toBeCloseTo(0.2, 5);
    });
  });

  // ---- Form 1b: <custom-ident> <string> ----

  describe("form 1b: <custom-ident> <string>", function () {
    it("uses explicit ink name while retaining ident", function () {
      // @color-profile --fogra51 { components: c "MyCyan", ... }
      var component = {
        form: "1b",
        ident: "c",
        inkName: "MyCyan",
      };
      expect(component.ident).toBe("c");
      expect(component.inkName).toBe("MyCyan");
    });

    it("fallback is same unit vector as form 1", function () {
      // Form 1b has no explicit fallback → auto-generated unit vector
      var components = [
        { form: "1b", ident: "c", inkName: "MyCyan" },
        { form: "1b", ident: "m", inkName: "MyMagenta" },
        { form: "1b", ident: "y", inkName: "MyYellow" },
        { form: "1b", ident: "k", inkName: "MyBlack" },
      ];
      var result = computeFallback(components, [1, 0, 0, 0], 4);
      expect(result[0]).toBeCloseTo(1, 5);
      expect(result[1]).toBeCloseTo(0, 5);
      expect(result[2]).toBeCloseTo(0, 5);
      expect(result[3]).toBeCloseTo(0, 5);
    });
  });

  // ---- Form 2: <string> <number>+ ----

  describe("form 2: <string> <number>+ (spot color)", function () {
    it("single spot color at 100% tint", function () {
      // "PANTONE Reflex Blue C" 1 0.723 0 0.02, tint=1.0
      var components = [
        {
          form: 2,
          inkName: "PANTONE Reflex Blue C",
          fallback: [1, 0.723, 0, 0.02],
        },
      ];
      var result = computeFallback(components, [1.0], 4);
      expect(result[0]).toBeCloseTo(1, 5);
      expect(result[1]).toBeCloseTo(0.723, 5);
      expect(result[2]).toBeCloseTo(0, 5);
      expect(result[3]).toBeCloseTo(0.02, 5);
    });

    it("single spot color at 50% tint", function () {
      var components = [
        {
          form: 2,
          inkName: "PANTONE Reflex Blue C",
          fallback: [1, 0.723, 0, 0.02],
        },
      ];
      var result = computeFallback(components, [0.5], 4);
      // X_i = 1 - (1 - 0.5 * N_i)
      expect(result[0]).toBeCloseTo(0.5, 5);
      expect(result[1]).toBeCloseTo(0.3615, 5);
      expect(result[2]).toBeCloseTo(0, 5);
      expect(result[3]).toBeCloseTo(0.01, 5);
    });

    it("single spot color at 0% tint yields all zeros", function () {
      var components = [
        {
          form: 2,
          inkName: "PANTONE Reflex Blue C",
          fallback: [1, 0.723, 0, 0.02],
        },
      ];
      var result = computeFallback(components, [0], 4);
      expect(result[0]).toBeCloseTo(0, 5);
      expect(result[1]).toBeCloseTo(0, 5);
      expect(result[2]).toBeCloseTo(0, 5);
      expect(result[3]).toBeCloseTo(0, 5);
    });

    it("duotone blend (faceless2 example: 75% blue, 25% red)", function () {
      // @color-profile --duotone { src: device-cmyk;
      //   components: "PANTONE Reflex Blue C" 1 0.723 0 0.02,
      //               "PANTONE Warm Red C" 0 0.75 0.9 0; }
      // color(--duotone 0.75 0.25)
      var components = [
        {
          form: 2,
          inkName: "PANTONE Reflex Blue C",
          fallback: [1, 0.723, 0, 0.02],
        },
        {
          form: 2,
          inkName: "PANTONE Warm Red C",
          fallback: [0, 0.75, 0.9, 0],
        },
      ];
      var result = computeFallback(components, [0.75, 0.25], 4);
      // C: 1 - (1-0.75*1) * (1-0.25*0) = 0.75
      expect(result[0]).toBeCloseTo(0.75, 5);
      // M: 1 - (1-0.75*0.723) * (1-0.25*0.75)
      var expectedM = 1 - (1 - 0.75 * 0.723) * (1 - 0.25 * 0.75);
      expect(result[1]).toBeCloseTo(expectedM, 5);
      // Y: 1 - (1-0.75*0) * (1-0.25*0.9)
      var expectedY = 1 - (1 - 0.75 * 0) * (1 - 0.25 * 0.9);
      expect(result[2]).toBeCloseTo(expectedY, 5);
      // K: 1 - (1-0.75*0.02) * (1-0.25*0)
      var expectedK = 1 - (1 - 0.75 * 0.02) * (1 - 0.25 * 0);
      expect(result[3]).toBeCloseTo(expectedK, 5);
    });

    it("has no ident (no relative color syntax)", function () {
      var component = {
        form: 2,
        inkName: "PANTONE Reflex Blue C",
        fallback: [1, 0.723, 0, 0.02],
      };
      expect(component.ident).toBeUndefined();
    });
  });

  // ---- Form 3: <custom-ident> <string> <number>+ ----

  describe("form 3: <custom-ident> <string> <number>+ (spot color with ident)", function () {
    it("has ident for relative color syntax", function () {
      var component = {
        form: 3,
        ident: "blue",
        inkName: "PANTONE Reflex Blue C",
        fallback: [1, 0.723, 0, 0.02],
      };
      expect(component.ident).toBe("blue");
      expect(component.inkName).toBe("PANTONE Reflex Blue C");
      expect(component.fallback).toEqual([1, 0.723, 0, 0.02]);
    });

    it("duotone with idents computes same fallback as form 2", function () {
      var form2 = [
        {
          form: 2,
          inkName: "PANTONE Reflex Blue C",
          fallback: [1, 0.723, 0, 0.02],
        },
        {
          form: 2,
          inkName: "PANTONE Warm Red C",
          fallback: [0, 0.75, 0.9, 0],
        },
      ];
      var form3 = [
        {
          form: 3,
          ident: "blue",
          inkName: "PANTONE Reflex Blue C",
          fallback: [1, 0.723, 0, 0.02],
        },
        {
          form: 3,
          ident: "red",
          inkName: "PANTONE Warm Red C",
          fallback: [0, 0.75, 0.9, 0],
        },
      ];
      var result2 = computeFallback(form2, [0.75, 0.25], 4);
      var result3 = computeFallback(form3, [0.75, 0.25], 4);
      for (var i = 0; i < 4; i++) {
        expect(result3[i]).toBeCloseTo(result2[i], 10);
      }
    });
  });

  // ---- Mixed forms ----

  describe("mixed process + spot colors", function () {
    it("CMYK + spot color (form 1 + form 2 mixed)", function () {
      // @color-profile --cmyk-blue { src: device-cmyk;
      //   components: c, m, y, k, "PANTONE Reflex Blue C" 1 0.723 0 0.02; }
      // color(--cmyk-blue 0 0 0 1 0.5) = black + 50% blue
      var components = [
        { form: 1, ident: "c", inkName: "Cyan" },
        { form: 1, ident: "m", inkName: "Magenta" },
        { form: 1, ident: "y", inkName: "Yellow" },
        { form: 1, ident: "k", inkName: "Black" },
        {
          form: 2,
          inkName: "PANTONE Reflex Blue C",
          fallback: [1, 0.723, 0, 0.02],
        },
      ];
      var result = computeFallback(components, [0, 0, 0, 1, 0.5], 4);
      // K=1 from process black, plus 50% blue contribution
      // C: 1 - (1-0)(1-0)(1-0)(1-1)(1-0.5*1) = 1 - 0*0.5 → but (1-1)=0, so product=0, X=1
      expect(result[3]).toBeCloseTo(1, 5); // K channel dominated by black=1
      // C: 1 - (1-0)*(1-0)*(1-0)*(1-0)*(1-0.5*1) = 1 - 0.5 = 0.5
      expect(result[0]).toBeCloseTo(0.5, 5);
    });

    it("CMYK + spot with idents (form 1 + form 3)", function () {
      // @color-profile --cmyk-blue { src: device-cmyk;
      //   components: c, m, y, k, b "PANTONE Reflex Blue C" 1 0.723 0 0.02; }
      var components = [
        { form: 1, ident: "c", inkName: "Cyan" },
        { form: 1, ident: "m", inkName: "Magenta" },
        { form: 1, ident: "y", inkName: "Yellow" },
        { form: 1, ident: "k", inkName: "Black" },
        {
          form: 3,
          ident: "b",
          inkName: "PANTONE Reflex Blue C",
          fallback: [1, 0.723, 0, 0.02],
        },
      ];
      // Same computation as above
      var result = computeFallback(components, [0, 0, 0, 1, 0.5], 4);
      expect(result[0]).toBeCloseTo(0.5, 5);
      expect(result[3]).toBeCloseTo(1, 5);
    });

    it("spot replaces Cyan channel (process color reassignment)", function () {
      // @color-profile --blue-myk { src: device-cmyk;
      //   components: "PANTONE Reflex Blue C" 1 0.723 0 0.02, m, y, k; }
      var components = [
        {
          form: 2,
          inkName: "PANTONE Reflex Blue C",
          fallback: [1, 0.723, 0, 0.02],
        },
        { form: 1, ident: "m", inkName: "Magenta" },
        { form: 1, ident: "y", inkName: "Yellow" },
        { form: 1, ident: "k", inkName: "Black" },
      ];
      // Unit vectors for m,y,k are at positions 1,2,3 in device-cmyk
      // color(--blue-myk 1 0 0 0) = 100% PANTONE Reflex Blue
      var result = computeFallback(components, [1, 0, 0, 0], 4);
      expect(result[0]).toBeCloseTo(1, 5);
      expect(result[1]).toBeCloseTo(0.723, 5);
      expect(result[2]).toBeCloseTo(0, 5);
      expect(result[3]).toBeCloseTo(0.02, 5);
    });

    it("spot replaces Cyan with ident (form 3 + form 1)", function () {
      // @color-profile --blue-myk { src: device-cmyk;
      //   components: b "PANTONE Reflex Blue C" 1 0.723 0 0.02, m, y, k; }
      var components = [
        {
          form: 3,
          ident: "b",
          inkName: "PANTONE Reflex Blue C",
          fallback: [1, 0.723, 0, 0.02],
        },
        { form: 1, ident: "m", inkName: "Magenta" },
        { form: 1, ident: "y", inkName: "Yellow" },
        { form: 1, ident: "k", inkName: "Black" },
      ];
      var result = computeFallback(components, [1, 0, 0, 0], 4);
      expect(result[0]).toBeCloseTo(1, 5);
      expect(result[1]).toBeCloseTo(0.723, 5);
      expect(result[2]).toBeCloseTo(0, 5);
      expect(result[3]).toBeCloseTo(0.02, 5);
    });
  });

  // ---- src descriptor ----

  describe("src descriptor", function () {
    it("device-cmyk has 4 components", function () {
      expect(srcComponentCount(DEVICE_CMYK)).toBe(4);
    });

    it("srgb has 3 components", function () {
      expect(srcComponentCount(SRGB)).toBe(3);
    });

    it("lab has 3 components", function () {
      expect(srcComponentCount({ kind: "lab" })).toBe(3);
    });

    it("url requires ICC profile to determine count", function () {
      expect(srcComponentCount(URL_SRC)).toBe(-1);
    });

    it("device-cmyk → DeviceCMYK alternate space", function () {
      expect(srcToAlternateSpace(DEVICE_CMYK)).toBe("DeviceCMYK");
    });

    it("srgb → DeviceRGB alternate space", function () {
      expect(srcToAlternateSpace(SRGB)).toBe("DeviceRGB");
    });

    it("lab → Lab alternate space", function () {
      expect(srcToAlternateSpace({ kind: "lab" })).toBe("Lab");
    });
  });

  // ---- Spot color with Lab src ----

  describe("spot color with lab src", function () {
    it("spot color defined against Lab", function () {
      // @color-profile --orange-021c { src: lab;
      //   components: "PANTONE Orange 021C" 60 65.7 85.1; }
      var components = [
        {
          form: 2,
          inkName: "PANTONE Orange 021C",
          fallback: [60, 65.7, 85.1],
        },
      ];
      var result = computeFallback(components, [1.0], 3);
      // At 100% tint, output should be the fallback values themselves
      // X_i = 1 - (1 - 1.0 * N_i) = N_i
      expect(result[0]).toBeCloseTo(60, 5);
      expect(result[1]).toBeCloseTo(65.7, 5);
      expect(result[2]).toBeCloseTo(85.1, 5);
    });
  });

  // ---- Edge cases ----

  describe("edge cases", function () {
    it("all zero tint values yield all zeros", function () {
      var components = [
        { form: 1, ident: "c", inkName: "Cyan" },
        { form: 1, ident: "m", inkName: "Magenta" },
        { form: 1, ident: "y", inkName: "Yellow" },
        { form: 1, ident: "k", inkName: "Black" },
      ];
      var result = computeFallback(components, [0, 0, 0, 0], 4);
      expect(result).toEqual([0, 0, 0, 0]);
    });

    it("3-component sRGB unit vectors", function () {
      expect(unitVector(0, 3)).toEqual([1, 0, 0]);
      expect(unitVector(1, 3)).toEqual([0, 1, 0]);
      expect(unitVector(2, 3)).toEqual([0, 0, 1]);
    });

    it("5-component space (CMYK + spot)", function () {
      // Unit vector for the 5th component in a 4-component src space
      // should produce all zeros (position beyond src space)
      expect(unitVector(4, 4)).toEqual([0, 0, 0, 0]);
    });
  });
});
