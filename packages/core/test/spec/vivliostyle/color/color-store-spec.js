import { SRGBValue } from "../../../../src/vivliostyle/color/color-store/srgb-value";
import { ColorStore } from "../../../../src/vivliostyle/color/color-store/color-store";

var RGB = { type: "DeviceRGB" };
var LAB = { type: "Lab", L: 50, a: 30, b: -20 };
var CMYK = { type: "DeviceCMYK", c: 5000, m: 2000, y: 8000, k: 1000 };

describe("color/color-store", function () {
  describe("SRGBValue", function () {
    it("fromFloat clamps and rounds", function () {
      var v = SRGBValue.fromFloat(0.5, 1.2, -0.1);
      expect(v.r()).toBe(5000);
      expect(v.g()).toBe(10000);
      expect(v.b()).toBe(0);
    });

    it("toKey", function () {
      var v = SRGBValue.fromInt(1000, 2000, 3000);
      expect(v.toKey()).toBe("[1000,2000,3000]");
    });

    it("offset", function () {
      var v = SRGBValue.fromInt(5000, 5000, 5000);
      var o = v.offset(1, -1, 0);
      expect(o.r()).toBe(5001);
      expect(o.g()).toBe(4999);
      expect(o.b()).toBe(5000);
    });

    it("equals", function () {
      var a = SRGBValue.fromInt(1, 2, 3);
      var b = SRGBValue.fromInt(1, 2, 3);
      var c = SRGBValue.fromInt(1, 2, 4);
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });

    it("toColorFunc without alpha", function () {
      var v = SRGBValue.fromInt(5000, 3000, 8000);
      expect(v.toColorFunc(null).toString()).toBe("color(srgb 0.5 0.3 0.8)");
    });
  });

  describe("ColorStore", function () {
    it("registerRgbDirect locks key", function () {
      var store = new ColorStore();
      var srgb = SRGBValue.fromInt(1000, 2000, 3000);
      store.registerRgbDirect(srgb, RGB);
      expect(store.toJSON().colors[srgb.toKey()]).toEqual(RGB);
    });

    it("registerNonRgb assigns key", function () {
      var store = new ColorStore();
      var srgb = SRGBValue.fromInt(5000, 5000, 5000);
      var assigned = store.registerNonRgb(srgb, LAB);
      expect(assigned.equals(srgb)).toBe(true);
      expect(store.toJSON().colors[srgb.toKey()]).toEqual(LAB);
    });

    it("registerNonRgb avoids collision with locked key", function () {
      var store = new ColorStore();
      var srgb = SRGBValue.fromInt(5000, 5000, 5000);
      store.registerRgbDirect(srgb, RGB);
      var assigned = store.registerNonRgb(srgb, LAB);
      expect(assigned.equals(srgb)).toBe(false);
      expect(store.toJSON().colors[srgb.toKey()]).toEqual(RGB);
      expect(store.toJSON().colors[assigned.toKey()]).toEqual(LAB);
    });

    it("registerRgbDirect evicts non-RGB", function () {
      var store = new ColorStore();
      var srgb = SRGBValue.fromInt(5000, 5000, 5000);
      store.registerNonRgb(srgb, LAB);
      store.registerRgbDirect(srgb, RGB);
      var json = store.toJSON();
      expect(json.colors[srgb.toKey()]).toEqual(RGB);
      var entries = Object.values(json.colors);
      expect(
        entries.some(function (e) {
          return e.type === "Lab";
        }),
      ).toBe(true);
    });

    it("setCmykProfile appears in JSON", function () {
      var store = new ColorStore();
      store.setCmykProfile("https://example.com/fogra39.icc");
      expect(store.toJSON().cmykProfile).toBe(
        "https://example.com/fogra39.icc",
      );
    });

    it("cmykProfile defaults to null", function () {
      var store = new ColorStore();
      expect(store.toJSON().cmykProfile).toBeNull();
    });
  });
});
