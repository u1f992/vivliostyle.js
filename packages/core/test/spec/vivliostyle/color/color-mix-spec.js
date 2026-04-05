import {
  adjustHues,
  normalizeMixPercentages,
  interpolateColors,
} from "../../../../src/vivliostyle/color/color-mix";

describe("color/color-mix", function () {
  describe("adjustHues", function () {
    it("shorter: no adjustment needed", function () {
      var result = adjustHues(40, 60, "shorter");
      expect(result).toEqual([40, 60]);
    });

    it("shorter: wraps h1 up", function () {
      var result = adjustHues(10, 350, "shorter");
      expect(result).toEqual([370, 350]);
    });

    it("shorter: wraps h2 up", function () {
      var result = adjustHues(350, 10, "shorter");
      expect(result).toEqual([350, 370]);
    });

    it("longer: wraps h1 up when close", function () {
      var result = adjustHues(40, 60, "longer");
      expect(result).toEqual([400, 60]);
    });
  });

  describe("normalizeMixPercentages", function () {
    it("both null -> 50/50", function () {
      var r = normalizeMixPercentages(null, null);
      expect(r.p1).toBe(0.5);
      expect(r.p2).toBe(0.5);
      expect(r.alphaMultiplier).toBe(1);
    });

    it("p1 given, p2 null -> complement", function () {
      var r = normalizeMixPercentages(0.3, null);
      expect(r.p1).toBeCloseTo(0.3, 10);
      expect(r.p2).toBeCloseTo(0.7, 10);
    });
  });

  describe("interpolateColors", function () {
    it("50/50 mix in rectangular space", function () {
      var c1 = { components: [50, 30, -20], alpha: 1, percentage: 0.5 };
      var c2 = { components: [70, 10, 40], alpha: 1, percentage: 0.5 };
      var result = interpolateColors(c1, c2, "oklab");
      expect(result.components[0]).toBeCloseTo(60, 5);
      expect(result.components[1]).toBeCloseTo(20, 5);
      expect(result.components[2]).toBeCloseTo(10, 5);
      expect(result.alpha).toBeCloseTo(1, 5);
    });

    it("75/25 mix", function () {
      var c1 = { components: [0, 0, 0], alpha: 1, percentage: 0.75 };
      var c2 = { components: [100, 100, 100], alpha: 1, percentage: 0.25 };
      var result = interpolateColors(c1, c2, "srgb");
      expect(result.components[0]).toBeCloseTo(25, 5);
      expect(result.components[1]).toBeCloseTo(25, 5);
      expect(result.components[2]).toBeCloseTo(25, 5);
    });
  });
});
