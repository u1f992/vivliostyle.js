import {
  hslToSrgb,
  hwbToSrgb,
  deviceCmykToSrgbNaive,
} from "../../../../src/vivliostyle/color/convert";

function assertClose(actual, expected, epsilon) {
  for (var i = 0; i < 3; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThan(epsilon);
  }
}

describe("color/convert", function () {
  describe("hslToSrgb", function () {
    it("red", function () {
      assertClose(hslToSrgb(0, 100, 50), [1, 0, 0], 1e-10);
    });
    it("green", function () {
      assertClose(hslToSrgb(120, 100, 50), [0, 1, 0], 1e-10);
    });
    it("blue", function () {
      assertClose(hslToSrgb(240, 100, 50), [0, 0, 1], 1e-10);
    });
    it("white", function () {
      assertClose(hslToSrgb(0, 0, 100), [1, 1, 1], 1e-10);
    });
    it("black", function () {
      assertClose(hslToSrgb(0, 0, 0), [0, 0, 0], 1e-10);
    });
    it("negative hue wraps", function () {
      assertClose(hslToSrgb(-120, 100, 50), hslToSrgb(240, 100, 50), 1e-10);
    });
  });

  describe("hwbToSrgb", function () {
    it("red", function () {
      assertClose(hwbToSrgb(0, 0, 0), [1, 0, 0], 1e-10);
    });
    it("white", function () {
      assertClose(hwbToSrgb(0, 100, 0), [1, 1, 1], 1e-10);
    });
    it("black", function () {
      assertClose(hwbToSrgb(0, 0, 100), [0, 0, 0], 1e-10);
    });
    it("gray normalization", function () {
      assertClose(hwbToSrgb(0, 50, 50), [0.5, 0.5, 0.5], 1e-10);
    });
  });

  describe("deviceCmykToSrgbNaive", function () {
    it("white", function () {
      assertClose(deviceCmykToSrgbNaive(0, 0, 0, 0), [1, 1, 1], 1e-10);
    });
    it("cyan", function () {
      assertClose(deviceCmykToSrgbNaive(1, 0, 0, 0), [0, 1, 1], 1e-10);
    });
    it("black", function () {
      assertClose(deviceCmykToSrgbNaive(0, 0, 0, 1), [0, 0, 0], 1e-10);
    });
    it("firebrick equivalent", function () {
      var rgb = deviceCmykToSrgbNaive(0, 0.81, 0.81, 0.3);
      assertClose(rgb, [178 / 255, 34 / 255, 34 / 255], 0.01);
    });
  });
});
