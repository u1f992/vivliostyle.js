/**
 * Copyright 2026 Vivliostyle Foundation
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

import * as adapt_constants from "../../../src/vivliostyle/constants";
import * as adapt_ops from "../../../src/vivliostyle/ops";

describe("ops", function () {
  describe("StyleInstance", function () {
    function createInstance(breakBefore, versoFirstPageByDefault, rtl) {
      var instance = Object.create(adapt_ops.StyleInstance.prototype);
      instance.pageProgression = rtl
        ? adapt_constants.PageProgression.RTL
        : adapt_constants.PageProgression.LTR;
      instance.versoFirstPageByDefault = versoFirstPageByDefault;
      instance.isVersoFirstPage = versoFirstPageByDefault;
      instance.styler = { breakBeforeValues: [breakBefore] };
      return instance;
    }

    it("recomputes a leading spread blank after the page offset changes", function () {
      var instance = createInstance("right", false);

      instance.applyPageNumberOffset(3);
      expect(instance.blankPageAtStart).toBe(true);

      instance.applyPageNumberOffset(2);
      expect(instance.blankPageAtStart).toBe(false);
    });

    it("derives the verso start from a left break and the page offset", function () {
      var instance = createInstance("left", false);

      instance.applyPageNumberOffset(0);
      expect(instance.isVersoFirstPage).toBe(true);
      expect(instance.blankPageAtStart).toBe(false);

      instance.applyPageNumberOffset(1);
      expect(instance.isVersoFirstPage).toBe(false);
      expect(instance.blankPageAtStart).toBe(false);
    });

    it("resolves recto and verso breaks independently of the page progression", function () {
      var instance = createInstance("recto", false);

      instance.applyPageNumberOffset(3);
      expect(instance.blankPageAtStart).toBe(true);

      instance = createInstance("verso", false);
      instance.applyPageNumberOffset(0);
      expect(instance.isVersoFirstPage).toBe(true);
      expect(instance.blankPageAtStart).toBe(false);

      instance = createInstance("recto", false, true);
      instance.applyPageNumberOffset(3);
      expect(instance.blankPageAtStart).toBe(true);

      instance = createInstance("right", false, true);
      instance.applyPageNumberOffset(3);
      expect(instance.blankPageAtStart).toBe(false);
    });

    it("mirrors the start side in right-to-left progression", function () {
      var instance = createInstance("left", false, true);

      instance.applyPageNumberOffset(0);
      expect(instance.isVersoFirstPage).toBe(false);
      expect(instance.blankPageAtStart).toBe(false);

      instance = createInstance("right", false, true);
      instance.applyPageNumberOffset(0);
      expect(instance.isVersoFirstPage).toBe(true);
      expect(instance.blankPageAtStart).toBe(false);
    });

    it("keeps the default start side without a forced break", function () {
      var instance = createInstance(undefined, false);

      instance.applyPageNumberOffset(3);
      expect(instance.blankPageAtStart).toBe(false);
      expect(instance.isVersoFirstPage).toBe(false);

      instance = createInstance(undefined, true);
      instance.applyPageNumberOffset(0);
      expect(instance.blankPageAtStart).toBe(false);
      expect(instance.isVersoFirstPage).toBe(true);
    });

    it("redefines the page progression when the verso start changes", function () {
      var instance = createInstance("left", false);
      instance.pageManager = {
        definePageProgression: jasmine.createSpy("definePageProgression"),
      };

      instance.applyPageNumberOffset(3);
      expect(instance.isVersoFirstPage).toBe(false);
      expect(instance.pageManager.definePageProgression).not.toHaveBeenCalled();

      instance.applyPageNumberOffset(0);
      expect(instance.isVersoFirstPage).toBe(true);
      expect(instance.pageManager.definePageProgression).toHaveBeenCalledTimes(
        1,
      );

      instance.applyPageNumberOffset(2);
      expect(instance.isVersoFirstPage).toBe(false);
      expect(instance.pageManager.definePageProgression).toHaveBeenCalledTimes(
        2,
      );
    });
  });
});
