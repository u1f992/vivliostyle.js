/**
 * Copyright 2025 Vivliostyle Foundation
 *
 * Vivliostyle.js is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Vivliostyle.js is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Vivliostyle.js.  If not, see <http://www.gnu.org/licenses/>.
 */

import * as adapt_cssvalid from "../../../src/vivliostyle/css-validator";
import * as adapt_ops from "../../../src/vivliostyle/ops";
import * as adapt_cssparse from "../../../src/vivliostyle/css-parser";
import * as adapt_task from "../../../src/vivliostyle/task";

describe("css-counter-style", function () {
  function parseStylesheet(done, css, fn) {
    var validatorSet = adapt_cssvalid.baseValidatorSet();
    var handler = new adapt_ops.StyleParserHandler(validatorSet);
    adapt_task.start(function () {
      adapt_cssparse
        .parseStylesheetFromText(css, handler, null, null, null)
        .then(function (result) {
          fn(result, handler.counterStyles);
          done();
        });
      return adapt_task.newResult(true);
    });
  }

  describe("system descriptor", function () {
    it("should accept system: cyclic", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { system: cyclic; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.system).toBeDefined();
          expect(counterStyles["test"].properties.system.value.name).toBe(
            "cyclic",
          );
        },
      );
    });

    it("should accept system: numeric", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { system: numeric; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.system.value.name).toBe(
            "numeric",
          );
        },
      );
    });

    it("should accept system: alphabetic", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { system: alphabetic; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.system.value.name).toBe(
            "alphabetic",
          );
        },
      );
    });

    it("should accept system: symbolic", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { system: symbolic; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.system.value.name).toBe(
            "symbolic",
          );
        },
      );
    });

    it("should accept system: additive", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { system: additive; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.system.value.name).toBe(
            "additive",
          );
        },
      );
    });

    it("should accept system: fixed", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { system: fixed; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.system.value.name).toBe(
            "fixed",
          );
        },
      );
    });

    it("should accept system: fixed 3", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { system: fixed 3; }",
        function (result, counterStyles) {
          var system = counterStyles["test"].properties.system.value;
          expect(system.values[0].name).toBe("fixed");
          expect(system.values[1].num).toBe(3);
        },
      );
    });

    it("should accept system: extends decimal", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { system: extends decimal; }",
        function (result, counterStyles) {
          var system = counterStyles["test"].properties.system.value;
          expect(system.values[0].name).toBe("extends");
          expect(system.values[1].name).toBe("decimal");
        },
      );
    });

    it("should reject system: invalid-keyword", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { system: invalid-keyword; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.system).toBeUndefined();
        },
      );
    });

    it("should reject system: extends none", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { system: extends none; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.system).toBeUndefined();
        },
      );
    });

    it("should reject system: extends None (case-insensitive)", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { system: extends None; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.system).toBeUndefined();
        },
      );
    });
  });

  describe("negative descriptor validation", function () {
    it('should accept negative: "-"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { negative: "-"; }',
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.negative).toBeDefined();
          expect(counterStyles["test"].properties.negative.value.str).toBe("-");
        },
      );
    });

    it('should accept negative: "(" ")"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { negative: "(" ")"; }',
        function (result, counterStyles) {
          var neg = counterStyles["test"].properties.negative.value;
          expect(neg.values[0].str).toBe("(");
          expect(neg.values[1].str).toBe(")");
        },
      );
    });

    it("should accept negative: custom-ident", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { negative: custom-ident; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.negative.value.name).toBe(
            "custom-ident",
          );
        },
      );
    });

    it('should accept negative: "-" custom-ident', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { negative: "-" custom-ident; }',
        function (result, counterStyles) {
          var neg = counterStyles["test"].properties.negative.value;
          expect(neg.values[0].str).toBe("-");
          expect(neg.values[1].name).toBe("custom-ident");
        },
      );
    });

    it("should reject negative: 123", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { negative: 123; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.negative).toBeUndefined();
        },
      );
    });
  });

  describe("prefix descriptor", function () {
    it('should accept prefix: "["', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { prefix: "["; }',
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.prefix.value.str).toBe("[");
        },
      );
    });

    it("should accept prefix: custom-ident", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { prefix: custom-ident; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.prefix.value.name).toBe(
            "custom-ident",
          );
        },
      );
    });

    it("should reject prefix: 456", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { prefix: 456; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.prefix).toBeUndefined();
        },
      );
    });
  });

  describe("suffix descriptor", function () {
    it('should accept suffix: "] "', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { suffix: "] "; }',
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.suffix.value.str).toBe("] ");
        },
      );
    });

    it("should accept suffix: custom-ident", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { suffix: custom-ident; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.suffix.value.name).toBe(
            "custom-ident",
          );
        },
      );
    });

    it("should reject suffix: 789", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { suffix: 789; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.suffix).toBeUndefined();
        },
      );
    });
  });

  describe("range descriptor", function () {
    it("should accept range: auto", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { range: auto; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.range.value.name).toBe(
            "auto",
          );
        },
      );
    });

    it("should accept range: 0 100", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { range: 0 100; }",
        function (result, counterStyles) {
          var range = counterStyles["test"].properties.range.value;
          expect(range.values[0].num).toBe(0);
          expect(range.values[1].num).toBe(100);
        },
      );
    });

    it("should accept range: -9999 9999, -10 10", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { range: -9999 9999, -10 10; }",
        function (result, counterStyles) {
          var range = counterStyles["test"].properties.range.value;
          expect(range.values.length).toBe(2);
        },
      );
    });

    it("should accept range: infinite 100, 0 infinite", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { range: infinite 100, 0 infinite; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.range).toBeDefined();
        },
      );
    });

    it("should reject range: 100 50", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { range: 100 50; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.range).toBeUndefined();
        },
      );
    });

    it('should reject range: "a" "b"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { range: "a" "b"; }',
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.range).toBeUndefined();
        },
      );
    });
  });

  describe("pad descriptor", function () {
    it('should accept pad: 3 "0"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { pad: 3 "0"; }',
        function (result, counterStyles) {
          var pad = counterStyles["test"].properties.pad.value;
          expect(pad.values[0].num).toBe(3);
          expect(pad.values[1].str).toBe("0");
        },
      );
    });

    it('should accept pad: "0" 3', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { pad: "0" 3; }',
        function (result, counterStyles) {
          var pad = counterStyles["test"].properties.pad.value;
          expect(pad.values[0].str).toBe("0");
          expect(pad.values[1].num).toBe(3);
        },
      );
    });

    it('should accept pad: 0 "*"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { pad: 0 "*"; }',
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.pad).toBeDefined();
        },
      );
    });

    it('should reject pad: -1 "0"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { pad: -1 "0"; }',
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.pad).toBeUndefined();
        },
      );
    });

    it("should reject pad: 3", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { pad: 3; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.pad).toBeUndefined();
        },
      );
    });
  });

  describe("fallback descriptor", function () {
    it("should accept fallback: decimal", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { fallback: decimal; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.fallback.value.name).toBe(
            "decimal",
          );
        },
      );
    });

    it("should accept fallback: lower-roman", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { fallback: lower-roman; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.fallback.value.name).toBe(
            "lower-roman",
          );
        },
      );
    });

    it("should reject fallback: none", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { fallback: none; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.fallback).toBeUndefined();
        },
      );
    });

    it('should reject fallback: "decimal"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { fallback: "decimal"; }',
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.fallback).toBeUndefined();
        },
      );
    });
  });

  describe("symbols descriptor", function () {
    it('should accept symbols: "*"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { symbols: "*"; }',
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.symbols.value.str).toBe("*");
        },
      );
    });

    it('should accept symbols: "○" "●" "◇" "◆"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { symbols: "○" "●" "◇" "◆"; }',
        function (result, counterStyles) {
          var symbols = counterStyles["test"].properties.symbols.value;
          expect(symbols.values.length).toBe(4);
        },
      );
    });

    it("should accept symbols: bullet circle square", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { symbols: bullet circle square; }",
        function (result, counterStyles) {
          var symbols = counterStyles["test"].properties.symbols.value;
          expect(symbols.values.length).toBe(3);
          expect(symbols.values[0].name).toBe("bullet");
          expect(symbols.values[1].name).toBe("circle");
          expect(symbols.values[2].name).toBe("square");
        },
      );
    });

    it('should accept symbols: "★" star "☆"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { symbols: "★" star "☆"; }',
        function (result, counterStyles) {
          var symbols = counterStyles["test"].properties.symbols.value;
          expect(symbols.values.length).toBe(3);
          expect(symbols.values[0].str).toBe("★");
          expect(symbols.values[1].name).toBe("star");
          expect(symbols.values[2].str).toBe("☆");
        },
      );
    });

    it("should reject symbols: 123", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { symbols: 123; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties.symbols).toBeUndefined();
        },
      );
    });
  });

  describe("additive-symbols descriptor validation", function () {
    it('should accept additive-symbols: 10 "X"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { additive-symbols: 10 "X"; }',
        function (result, counterStyles) {
          var as = counterStyles["test"].properties["additive-symbols"].value;
          expect(as.values[0].num).toBe(10);
          expect(as.values[1].str).toBe("X");
        },
      );
    });

    it('should accept additive-symbols: "X" 10', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { additive-symbols: "X" 10; }',
        function (result, counterStyles) {
          var as = counterStyles["test"].properties["additive-symbols"].value;
          expect(as.values[0].str).toBe("X");
          expect(as.values[1].num).toBe(10);
        },
      );
    });

    it("should accept additive-symbols: 1000 M, 500 D, 100 C", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { additive-symbols: 1000 M, 500 D, 100 C; }",
        function (result, counterStyles) {
          var as = counterStyles["test"].properties["additive-symbols"].value;
          expect(as.values.length).toBe(3);
        },
      );
    });

    it('should accept additive-symbols: 0 "zero"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { additive-symbols: 0 "zero"; }',
        function (result, counterStyles) {
          expect(
            counterStyles["test"].properties["additive-symbols"],
          ).toBeDefined();
        },
      );
    });

    it('should reject additive-symbols: -1 "X"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { additive-symbols: -1 "X"; }',
        function (result, counterStyles) {
          expect(
            counterStyles["test"].properties["additive-symbols"],
          ).toBeUndefined();
        },
      );
    });

    it("should reject additive-symbols: 10", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { additive-symbols: 10; }",
        function (result, counterStyles) {
          expect(
            counterStyles["test"].properties["additive-symbols"],
          ).toBeUndefined();
        },
      );
    });

    it('should reject additive-symbols: "X"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { additive-symbols: "X"; }',
        function (result, counterStyles) {
          expect(
            counterStyles["test"].properties["additive-symbols"],
          ).toBeUndefined();
        },
      );
    });
  });

  describe("speak-as descriptor", function () {
    it("should accept speak-as: auto", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { speak-as: auto; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties["speak-as"].value.name).toBe(
            "auto",
          );
        },
      );
    });

    it("should accept speak-as: bullets", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { speak-as: bullets; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties["speak-as"].value.name).toBe(
            "bullets",
          );
        },
      );
    });

    it("should accept speak-as: numbers", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { speak-as: numbers; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties["speak-as"].value.name).toBe(
            "numbers",
          );
        },
      );
    });

    it("should accept speak-as: words", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { speak-as: words; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties["speak-as"].value.name).toBe(
            "words",
          );
        },
      );
    });

    it("should accept speak-as: spell-out", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { speak-as: spell-out; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties["speak-as"].value.name).toBe(
            "spell-out",
          );
        },
      );
    });

    it("should accept speak-as: decimal", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { speak-as: decimal; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties["speak-as"].value.name).toBe(
            "decimal",
          );
        },
      );
    });

    it("should reject speak-as: none", function (done) {
      parseStylesheet(
        done,
        "@counter-style test { speak-as: none; }",
        function (result, counterStyles) {
          expect(counterStyles["test"].properties["speak-as"]).toBeUndefined();
        },
      );
    });

    it('should reject speak-as: "auto"', function (done) {
      parseStylesheet(
        done,
        '@counter-style test { speak-as: "auto"; }',
        function (result, counterStyles) {
          expect(counterStyles["test"].properties["speak-as"]).toBeUndefined();
        },
      );
    });
  });

  describe("non-overridable counter-style names", function () {
    it("should reject @counter-style none", function (done) {
      parseStylesheet(
        done,
        "@counter-style none { system: cyclic; }",
        function (result, counterStyles) {
          expect(result).toBe(true);
          expect(counterStyles["none"]).toBeUndefined();
        },
      );
    });

    it("should reject @counter-style None", function (done) {
      parseStylesheet(
        done,
        "@counter-style None { system: cyclic; }",
        function (result, counterStyles) {
          expect(result).toBe(true);
          expect(counterStyles["None"]).toBeUndefined();
        },
      );
    });

    it("should reject @counter-style decimal", function (done) {
      parseStylesheet(
        done,
        "@counter-style decimal { system: cyclic; }",
        function (result, counterStyles) {
          expect(result).toBe(true);
          // decimal is non-overridable, but built-in should still exist
          expect(counterStyles["decimal"]).toBeDefined();
          // Check it's still the built-in (numeric system)
          expect(counterStyles["decimal"].properties.system.value.name).toBe(
            "numeric",
          );
        },
      );
    });

    it("should allow @counter-style Decimal", function (done) {
      parseStylesheet(
        done,
        '@counter-style Decimal { system: cyclic; symbols: "*"; }',
        function (result, counterStyles) {
          expect(result).toBe(true);
          expect(counterStyles["Decimal"]).toBeDefined();
          expect(counterStyles["Decimal"].properties.system.value.name).toBe(
            "cyclic",
          );
        },
      );
    });
  });
});
