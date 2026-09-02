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

import * as adapt_adaptive_viewer from "../../../src/vivliostyle/adaptive-viewer";
import * as adapt_base from "../../../src/vivliostyle/base";
import * as adapt_epub from "../../../src/vivliostyle/epub";
import * as adapt_logging from "../../../src/vivliostyle/logging";
import * as adapt_task from "../../../src/vivliostyle/task";

describe("AdaptiveViewer", function () {
  function createReplacementViewer() {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    viewer.pageReplacedListener = viewer.pageReplacedListener.bind(viewer);
    viewer.hyperlinkListener = function () {};
    viewer.needReshow = false;
    viewer.reportPositionAfterReshow = false;
    viewer.kick = jasmine.createSpy("kick");
    viewer.showCurrent = jasmine.createSpy("showCurrent");
    viewer.showPage = jasmine
      .createSpy("showPage")
      .and.callFake(function (page) {
        viewer.currentPage = page;
        viewer.currentSpread = null;
      });
    viewer.showSpread = jasmine
      .createSpy("showSpread")
      .and.callFake(function (spread) {
        viewer.currentSpread = spread;
      });
    viewer.setPageZoom = jasmine.createSpy("setPageZoom");
    viewer.setSpreadZoom = jasmine.createSpy("setSpreadZoom");
    return viewer;
  }

  function createListenerPage() {
    var page = new adapt_base.SimpleEventTarget();
    page.container = document.createElement("div");
    spyOn(page, "addEventListener").and.callThrough();
    spyOn(page, "removeEventListener").and.callThrough();
    return page;
  }

  it("keeps receiving replacements through the page it shows", function () {
    var viewer = createReplacementViewer();
    viewer.showPage = adapt_adaptive_viewer.AdaptiveViewer.prototype.showPage;
    var position = { spineIndex: 0, pageIndex: 0, offsetInItem: 0 };
    var page = createListenerPage();
    var first = createListenerPage();
    var second = createListenerPage();
    viewer.currentPage = page;
    viewer.currentSpread = null;
    page.addEventListener("replaced", viewer.pageReplacedListener, false);

    page.dispatchEvent({
      type: "replaced",
      target: page,
      newPage: first,
      newPosition: position,
    });
    expect(viewer.currentPage).toBe(first);
    expect(first.addEventListener).toHaveBeenCalledWith(
      "replaced",
      viewer.pageReplacedListener,
      false,
    );

    first.dispatchEvent({
      type: "replaced",
      target: first,
      newPage: second,
      newPosition: position,
    });
    expect(viewer.currentPage).toBe(second);
    expect(first.removeEventListener).toHaveBeenCalledWith(
      "replaced",
      viewer.pageReplacedListener,
      false,
    );
    expect(second.container.style.display).toBe("block");
    expect(first.container.style.display).toBe("none");
  });

  it("keeps receiving replacements through the spread it shows", function () {
    var viewer = createReplacementViewer();
    viewer.showSpread =
      adapt_adaptive_viewer.AdaptiveViewer.prototype.showSpread;
    var position = { spineIndex: 0, pageIndex: 0, offsetInItem: 0 };
    var left = createListenerPage();
    var right = createListenerPage();
    var replacement = createListenerPage();
    var again = createListenerPage();
    viewer.currentPage = left;
    viewer.currentSpread = { left: left, right: right };
    left.addEventListener("replaced", viewer.pageReplacedListener, false);

    left.dispatchEvent({
      type: "replaced",
      target: left,
      newPage: replacement,
      newPosition: position,
    });
    expect(viewer.currentSpread.left).toBe(replacement);
    expect(replacement.addEventListener).toHaveBeenCalledWith(
      "replaced",
      viewer.pageReplacedListener,
      false,
    );

    right.container.setAttribute("data-vivliostyle-unpaired-page", "true");
    replacement.dispatchEvent({
      type: "replaced",
      target: replacement,
      newPage: again,
      newPosition: position,
    });
    expect(viewer.currentSpread.left).toBe(again);
    expect(viewer.currentPage).toBe(again);
    expect(replacement.removeEventListener).toHaveBeenCalledWith(
      "replaced",
      viewer.pageReplacedListener,
      false,
    );
    expect(again.container.style.display).toBe("block");
    expect(right.container.hasAttribute("data-vivliostyle-unpaired-page")).toBe(
      false,
    );
  });

  function dispatchReplaced(viewer, page, newPage, newPosition) {
    page.addEventListener("replaced", viewer.pageReplacedListener, false);
    page.dispatchEvent({
      type: "replaced",
      newPage: newPage,
      newPosition: newPosition,
    });
  }

  it("logs a canceled action at debug level and other failures as errors", function (done) {
    spyOn(adapt_logging.logger, "debug");
    spyOn(adapt_logging.logger, "error");
    adapt_task.start(function () {
      var viewer = Object.create(
        adapt_adaptive_viewer.AdaptiveViewer.prototype,
      );
      viewer.actions = {
        cancel: function () {
          throw new adapt_epub.RenderingCanceledError();
        },
        fail: function () {
          throw new Error("action failed");
        },
        ok: function () {
          return adapt_task.newResult(true);
        },
      };
      viewer.callback = jasmine.createSpy("callback");

      viewer.runCommand({ a: "cancel" }).then(function () {
        expect(adapt_logging.logger.debug).toHaveBeenCalledWith(
          jasmine.any(adapt_epub.RenderingCanceledError),
          "Action canceled:",
          "cancel",
        );
        expect(adapt_logging.logger.error).not.toHaveBeenCalled();
        viewer.runCommand({ a: "fail" }).then(function () {
          expect(adapt_logging.logger.error).toHaveBeenCalled();
          expect(viewer.callback).not.toHaveBeenCalled();
          viewer.runCommand({ a: "ok" }).then(function () {
            expect(viewer.callback).toHaveBeenCalledWith({
              t: "done",
              a: "ok",
            });
            done();
          });
        });
      });
      return adapt_task.newResult(true);
    });
  });

  it("drops a reshow when the displayed pages are gone", function (done) {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    viewer.window = window;
    viewer.needResize = false;
    viewer.needRefresh = false;
    viewer.needReshow = true;
    viewer.reportPositionAfterReshow = false;
    viewer.currentPage = null;
    viewer.currentSpread = null;
    viewer.opfView = null;
    viewer.renderAllPages = true;
    viewer.packageURL = [];
    viewer.callback = function () {};
    viewer.actions = {
      probe: function () {
        expect(viewer.needReshow).toBe(false);
        delete window.adapt_command;
        done();
        return adapt_task.newResult(true);
      },
    };

    viewer.initEmbed({ a: "probe" });
  }, 2000);

  it("shows the replacement of the displayed page immediately", function () {
    var viewer = createReplacementViewer();
    var oldPage = createListenerPage();
    var newPage = createListenerPage();
    var position = { spineIndex: 0, pageIndex: 0, offsetInItem: 0 };
    viewer.currentPage = oldPage;
    viewer.currentSpread = null;
    viewer.pagePosition = position;

    dispatchReplaced(viewer, oldPage, newPage, null);

    expect(viewer.showPage).toHaveBeenCalledWith(newPage);
    expect(viewer.setPageZoom).toHaveBeenCalledWith(newPage);
    expect(viewer.currentPage).toBe(newPage);
    expect(viewer.pagePosition).toBe(position);
    expect(viewer.needReshow).toBe(true);
    expect(viewer.reportPositionAfterReshow).toBe(false);
    expect(viewer.showCurrent).not.toHaveBeenCalled();
    expect(viewer.kick).toHaveBeenCalled();
  });

  it("ignores replacements of pages that are not displayed", function () {
    var viewer = createReplacementViewer();
    var displayedPage = createListenerPage();
    viewer.currentPage = displayedPage;
    viewer.currentSpread = null;

    viewer.pageReplacedListener({
      target: {},
      newPage: {},
      newPosition: null,
    });

    expect(viewer.showPage).not.toHaveBeenCalled();
    expect(viewer.currentPage).toBe(displayedPage);
    expect(viewer.needReshow).toBe(false);
    expect(viewer.kick).not.toHaveBeenCalled();
  });

  it("queues a Viewer refresh when a displayed spread page is replaced with a new position", function () {
    var viewer = createReplacementViewer();
    var oldPage = createListenerPage();
    var newPage = createListenerPage();
    var rightPage = createListenerPage();
    var newPosition = {
      spineIndex: 0,
      pageIndex: 1,
      offsetInItem: 10,
    };
    viewer.currentPage = oldPage;
    viewer.currentSpread = { left: oldPage, right: rightPage };
    viewer.pagePosition = {
      spineIndex: 0,
      pageIndex: 2,
      offsetInItem: 20,
    };

    dispatchReplaced(viewer, oldPage, newPage, newPosition);

    expect(viewer.pagePosition).toBe(newPosition);
    expect(viewer.currentPage).toBe(newPage);
    expect(viewer.currentSpread).toEqual({
      left: newPage,
      right: rightPage,
    });
    expect(viewer.showSpread).toHaveBeenCalledTimes(1);
    expect(viewer.setSpreadZoom).toHaveBeenCalledWith(viewer.currentSpread);
    expect(viewer.showPage).not.toHaveBeenCalled();
    expect(viewer.needReshow).toBe(true);
    expect(viewer.reportPositionAfterReshow).toBe(true);
    expect(viewer.showCurrent).not.toHaveBeenCalled();
    expect(viewer.kick).toHaveBeenCalled();
  });

  it("shows a one-sided spread when both spread pages collapse into one replacement", function () {
    var viewer = createReplacementViewer();
    var leftPage = createListenerPage();
    var rightPage = createListenerPage();
    var replacementPage = createListenerPage();
    replacementPage.side = "left";
    var newPosition = { spineIndex: 0, pageIndex: 0, offsetInItem: 0 };
    viewer.currentPage = leftPage;
    viewer.currentSpread = { left: leftPage, right: rightPage };
    viewer.pagePosition = { spineIndex: 0, pageIndex: 1, offsetInItem: 5 };

    dispatchReplaced(viewer, leftPage, replacementPage, newPosition);
    var collapsedPosition = { spineIndex: 0, pageIndex: 2, offsetInItem: 7 };
    dispatchReplaced(viewer, rightPage, replacementPage, collapsedPosition);
    expect(viewer.showSpread.calls.count()).toBe(2);
    expect(viewer.currentSpread).toEqual({
      left: replacementPage,
      right: null,
    });
    expect(viewer.showPage).not.toHaveBeenCalled();
    expect(viewer.currentPage).toBe(replacementPage);
    expect(viewer.pagePosition).toBe(collapsedPosition);
    expect(viewer.needReshow).toBe(true);
  });

  it("shows a right-sided spread when both spread pages collapse into a right replacement", function () {
    var viewer = createReplacementViewer();
    var leftPage = createListenerPage();
    var rightPage = createListenerPage();
    var replacementPage = createListenerPage();
    replacementPage.side = "right";
    var newPosition = { spineIndex: 0, pageIndex: 0, offsetInItem: 0 };
    viewer.currentPage = leftPage;
    viewer.currentSpread = { left: leftPage, right: rightPage };
    viewer.pagePosition = { spineIndex: 0, pageIndex: 1, offsetInItem: 5 };

    dispatchReplaced(viewer, leftPage, replacementPage, newPosition);
    var collapsedPosition = { spineIndex: 0, pageIndex: 2, offsetInItem: 7 };
    dispatchReplaced(viewer, rightPage, replacementPage, collapsedPosition);
    expect(viewer.showSpread.calls.count()).toBe(2);
    expect(viewer.currentSpread).toEqual({
      left: null,
      right: replacementPage,
    });
    expect(viewer.showPage).not.toHaveBeenCalled();
    expect(viewer.currentPage).toBe(replacementPage);
    expect(viewer.pagePosition).toBe(collapsedPosition);
    expect(viewer.needReshow).toBe(true);
  });

  it("keeps the selected spread page when the other page is replaced", function () {
    var viewer = createReplacementViewer();
    var selectedPage = createListenerPage();
    var replacedPage = createListenerPage();
    var replacementPage = createListenerPage();
    var position = {
      spineIndex: 0,
      pageIndex: 0,
      offsetInItem: 0,
    };
    viewer.currentPage = selectedPage;
    viewer.currentSpread = { left: selectedPage, right: replacedPage };
    viewer.pagePosition = position;

    dispatchReplaced(viewer, replacedPage, replacementPage, {
      spineIndex: 0,
      pageIndex: 9,
      offsetInItem: 99,
    });

    expect(viewer.currentPage).toBe(selectedPage);
    expect(viewer.currentSpread).toEqual({
      left: selectedPage,
      right: replacementPage,
    });
    expect(replacedPage.removeEventListener).toHaveBeenCalledWith(
      "replaced",
      viewer.pageReplacedListener,
      false,
    );
    expect(replacedPage.removeEventListener).toHaveBeenCalledWith(
      "hyperlink",
      viewer.hyperlinkListener,
      false,
    );
    expect(viewer.showSpread).toHaveBeenCalledTimes(1);
    expect(viewer.pagePosition).toBe(position);
    expect(viewer.needReshow).toBe(true);
    expect(viewer.reportPositionAfterReshow).toBe(false);
    expect(viewer.kick).toHaveBeenCalled();
  });

  it("regenerates the page rule from the remaining page sizes", function () {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    viewer.pageSizes = [];
    viewer.pageSheetSizeAlreadySet = false;
    viewer.pageRuleStyleElement = document.createElement("style");
    viewer.pixelRatio = 0;
    viewer.pref = { spreadView: false };
    viewer.pageViewMode = "singlePage";
    viewer.opfView = null;

    viewer.setPageSize({ width: 80, height: 84 }, {}, 0, 0, 1);
    expect(viewer.pageRuleStyleElement.textContent).toMatch(
      /size:\s*60pt\s+63pt/,
    );

    viewer.setPageSize({ width: 200, height: 300 }, {}, 1, 1, 1);
    expect(viewer.pageRuleStyleElement.textContent).toMatch(
      /size:\s*150pt\s+225pt/,
    );

    viewer.setPageSize(null, {}, 1, 1, -1);
    expect(viewer.pageRuleStyleElement.textContent).toMatch(
      /size:\s*60pt\s+63pt/,
    );
    expect(viewer.pageRuleStyleElement.textContent).not.toMatch(/150pt/);
  });

  it("decides the automatic spread view on the first rendered page", function () {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    viewer.pageSizes = [];
    viewer.pageSheetSizeAlreadySet = false;
    viewer.pageRuleStyleElement = document.createElement("style");
    viewer.pixelRatio = 0;
    viewer.pref = { spreadView: false };
    viewer.pageViewMode = "autoSpread";
    viewer.viewport = {};
    viewer.opfView = {
      hasAutoSizedPages: function () {
        return false;
      },
    };
    viewer.resolveSpreadView = jasmine
      .createSpy("resolveSpreadView")
      .and.returnValue(true);
    viewer.updateSpreadView = jasmine.createSpy("updateSpreadView");

    viewer.setPageSize({ width: 80, height: 84 }, {}, 0, 0, 1);
    expect(viewer.resolveSpreadView).toHaveBeenCalledWith(viewer.viewport, {
      width: 80,
      height: 84,
    });
    expect(viewer.updateSpreadView).toHaveBeenCalledWith(true);

    viewer.setPageSize({ width: 80, height: 84 }, {}, 0, 1, 1);
    expect(viewer.updateSpreadView.calls.count()).toBe(1);

    viewer.opfView.hasAutoSizedPages = function () {
      return true;
    };
    viewer.pageSizes = [];
    viewer.pageSheetSizeAlreadySet = false;
    viewer.setPageSize({ width: 80, height: 84 }, {}, 0, 0, 1);
    expect(viewer.updateSpreadView.calls.count()).toBe(1);
  });

  it("replaces a page size in place when no page was added or removed", function () {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    viewer.pageSizes = [
      { width: 80, height: 84 },
      { width: 80, height: 84 },
    ];
    viewer.pageSheetSizeAlreadySet = true;
    viewer.pageRuleStyleElement = null;
    viewer.pref = { spreadView: false };
    viewer.pageViewMode = "singlePage";
    viewer.opfView = null;

    viewer.setPageSize({ width: 100, height: 120 }, {}, 0, 1, 0);

    expect(viewer.pageSizes).toEqual([
      { width: 80, height: 84 },
      { width: 100, height: 120 },
    ]);
  });

  it("recomputes the page rule when a replaced page shrinks", function () {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    viewer.pageSizes = [
      { width: 80, height: 84 },
      { width: 1000, height: 84 },
    ];
    viewer.pageSheetSizeAlreadySet = true;
    viewer.pageRuleStyleElement = document.createElement("style");
    viewer.pageRuleStyleElement.textContent = "@page {size: 750pt 63pt;}";
    viewer.pixelRatio = 0;
    viewer.pref = { spreadView: false };
    viewer.pageViewMode = "singlePage";
    viewer.opfView = null;

    viewer.setPageSize({ width: 80, height: 84 }, {}, 0, 1, 0);

    expect(viewer.pageRuleStyleElement.textContent).toMatch(
      /size:\s*60pt\s+63pt/,
    );
    expect(viewer.pageRuleStyleElement.textContent).not.toMatch(/750pt/);
  });

  it("removes page sizes for truncated pages", function () {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    viewer.pageSizes = [
      { width: 100, height: 100 },
      { width: 200, height: 200 },
      { width: 300, height: 300 },
      { width: 400, height: 400 },
    ];
    viewer.removePageSizePageRules = jasmine.createSpy(
      "removePageSizePageRules",
    );
    viewer.setPageSizePageRules = jasmine.createSpy("setPageSizePageRules");

    viewer.setPageSize(null, {}, 0, 1, -2);

    expect(viewer.pageSizes).toEqual([
      { width: 100, height: 100 },
      { width: 400, height: 400 },
    ]);
    expect(viewer.removePageSizePageRules).toHaveBeenCalled();
    expect(viewer.setPageSizePageRules).toHaveBeenCalledWith(0);
  });

  it("inserts a page size at its rendered index", function () {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    var firstSize = { width: 100, height: 100 };
    var insertedSize = { width: 200, height: 200 };
    var laterSize = { width: 300, height: 300 };
    viewer.pageSizes = [firstSize, laterSize];
    viewer.setPageSizePageRules = jasmine.createSpy("setPageSizePageRules");

    viewer.setPageSize(insertedSize, {}, 0, 1, 1);

    expect(viewer.pageSizes).toEqual([firstSize, insertedSize, laterSize]);
    expect(viewer.setPageSizePageRules).toHaveBeenCalledWith(1);
  });

  it("retries a reshow that waits for another rendering task and reports the position", function (done) {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    viewer.window = window;
    viewer.needResize = false;
    viewer.needRefresh = false;
    viewer.needReshow = true;
    viewer.reportPositionAfterReshow = true;
    var page = {};
    viewer.currentPage = page;
    viewer.currentSpread = null;
    viewer.opfView = {
      isRenderingOrResolvingInAnotherTask: function () {
        return true;
      },
    };
    viewer.renderAllPages = false;
    viewer.packageURL = [];
    viewer.callback = function () {};
    var results = [false, true];
    viewer.showCurrent = jasmine
      .createSpy("showCurrent")
      .and.callFake(function () {
        return adapt_task.newResult(results.shift());
      });
    viewer.reportPosition = jasmine
      .createSpy("reportPosition")
      .and.callFake(function () {
        expect(viewer.showCurrent.calls.count()).toBe(2);
        expect(viewer.showCurrent.calls.argsFor(0)).toEqual([page, true, true]);
        delete window.adapt_command;
        done();
        return adapt_task.newResult(true);
      });
    viewer.actions = {
      probe: function () {
        return adapt_task.newResult(true);
      },
    };

    viewer.initEmbed({ a: "probe" });
  }, 2000);

  it("keeps a pending reshow across a resize that changes nothing", function () {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    viewer.needResize = true;
    viewer.needRefresh = true;
    viewer.needReshow = true;
    viewer.reportPositionAfterReshow = true;
    viewer.sizeIsGood = function () {
      return true;
    };

    var result = null;
    viewer.resize().then(function (resized) {
      result = resized;
    });

    expect(result).toBe(true);
    expect(viewer.needResize).toBe(false);
    expect(viewer.needRefresh).toBe(false);
    expect(viewer.needReshow).toBe(true);
    expect(viewer.reportPositionAfterReshow).toBe(true);
  });

  it("drops a reshow that cannot show a page when nothing is rendering", function (done) {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    viewer.window = window;
    viewer.needResize = false;
    viewer.needRefresh = false;
    viewer.needReshow = true;
    viewer.reportPositionAfterReshow = false;
    viewer.currentPage = {};
    viewer.currentSpread = null;
    viewer.opfView = {
      isRenderingOrResolvingInAnotherTask: function () {
        return false;
      },
    };
    viewer.renderAllPages = true;
    viewer.packageURL = [];
    viewer.callback = function () {};
    viewer.showCurrent = jasmine
      .createSpy("showCurrent")
      .and.callFake(function () {
        return adapt_task.newResult(false);
      });
    viewer.actions = {
      probe: function () {
        expect(viewer.showCurrent.calls.count()).toBe(1);
        expect(viewer.needReshow).toBe(false);
        delete window.adapt_command;
        done();
        return adapt_task.newResult(true);
      },
    };

    viewer.initEmbed({ a: "probe" });
  }, 2000);

  it("requests a resize of an existing OPFView when the pass limit changes", function () {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    viewer.maxTargetReferenceLayoutPasses = 8;
    viewer.opfView = {};
    viewer.viewport = {};
    viewer.needResize = false;
    viewer.configurePlugins = function () {};

    viewer.configure({ maxTargetReferenceLayoutPasses: 3 });

    expect(viewer.maxTargetReferenceLayoutPasses).toBe(3);
    expect(viewer.needResize).toBe(true);
    expect(viewer.viewport).toBeNull();

    var viewport = {};
    viewer.viewport = viewport;
    viewer.needResize = false;
    viewer.configure({ maxTargetReferenceLayoutPasses: 3 });

    expect(viewer.needResize).toBe(false);
    expect(viewer.viewport).toBe(viewport);

    viewer.opfView = null;
    viewer.configure({ maxTargetReferenceLayoutPasses: 5 });
    expect(viewer.maxTargetReferenceLayoutPasses).toBe(5);
    expect(viewer.needResize).toBe(false);
    expect(viewer.viewport).toBe(viewport);

    viewer.opfView = {};
    viewer.configure({ maxTargetReferenceLayoutPasses: 100 });
    expect(viewer.maxTargetReferenceLayoutPasses).toBe(100);
    expect(viewer.needResize).toBe(true);
    expect(viewer.viewport).toBeNull();

    viewer.viewport = viewport;
    viewer.needResize = false;
    viewer.configure({ maxTargetReferenceLayoutPasses: 1 });
    expect(viewer.maxTargetReferenceLayoutPasses).toBe(1);
    expect(viewer.needResize).toBe(true);
    expect(viewer.viewport).toBeNull();
  });

  it("ignores an invalid layout pass limit", function () {
    var viewer = Object.create(adapt_adaptive_viewer.AdaptiveViewer.prototype);
    viewer.maxTargetReferenceLayoutPasses = 3;
    viewer.opfView = {};
    var viewport = {};
    viewer.viewport = viewport;
    viewer.needResize = false;
    viewer.configurePlugins = function () {};

    viewer.configure({});
    viewer.configure({ maxTargetReferenceLayoutPasses: 0 });
    viewer.configure({ maxTargetReferenceLayoutPasses: NaN });
    viewer.configure({ maxTargetReferenceLayoutPasses: 1.5 });
    viewer.configure({ maxTargetReferenceLayoutPasses: "8" });

    expect(viewer.maxTargetReferenceLayoutPasses).toBe(3);
    expect(viewer.needResize).toBe(false);
    expect(viewer.viewport).toBe(viewport);
  });

  it("reports that a spread page is not rendered yet", function (done) {
    adapt_task.start(function () {
      var viewer = Object.create(
        adapt_adaptive_viewer.AdaptiveViewer.prototype,
      );
      var position = { spineIndex: 0, pageIndex: 1, offsetInItem: 0 };
      var page = { side: "left", dimensions: {} };
      var leftPage = { side: "left", dimensions: {} };
      viewer.needRefresh = true;
      viewer.pref = { spreadView: true };
      viewer.viewport = {};
      viewer.pagePosition = position;
      viewer.showSpread = jasmine
        .createSpy("showSpread")
        .and.callFake(function (spread) {
          viewer.currentSpread = spread;
        });
      viewer.setSpreadZoom = jasmine.createSpy("setSpreadZoom");
      viewer.resolveSpreadView = function () {
        return true;
      };
      var spreads = [
        { left: leftPage, right: null, pairingPending: true },
        { left: leftPage, right: null, pairingPending: false },
      ];
      viewer.opfView = {
        getSpread: jasmine.createSpy("getSpread").and.callFake(function () {
          return adapt_task.newResult(spreads.shift());
        }),
      };

      viewer.showCurrent(page, false, true).then(function (shown) {
        expect(shown).toBe(false);
        expect(viewer.showSpread).toHaveBeenCalledWith(
          jasmine.objectContaining({ left: leftPage, right: null }),
        );
        expect(viewer.currentPage).toBe(leftPage);
        viewer.showCurrent(page, false, true).then(function (shownAgain) {
          expect(shownAgain).toBe(true);
          expect(viewer.showSpread.calls.count()).toBe(1);
          expect(viewer.setSpreadZoom.calls.count()).toBe(2);
          expect(viewer.setSpreadZoom.calls.mostRecent().args[0]).toEqual(
            jasmine.objectContaining({ left: leftPage, right: null }),
          );
          expect(viewer.currentSpread.pairingPending).toBe(false);
          done();
        });
      });
      return adapt_task.newResult(true);
    });
  });

  it("reports when no rendered spread page exists yet", function (done) {
    adapt_task.start(function () {
      var viewer = Object.create(
        adapt_adaptive_viewer.AdaptiveViewer.prototype,
      );
      var position = { spineIndex: 0, pageIndex: 0, offsetInItem: 0 };
      viewer.needRefresh = true;
      viewer.pref = { spreadView: true };
      viewer.viewport = {};
      viewer.pagePosition = position;
      viewer.resolveSpreadView = function () {
        return true;
      };
      viewer.opfView = {
        getSpread: jasmine
          .createSpy("getSpread")
          .and.returnValue(adapt_task.newResult({ left: null, right: null })),
      };

      viewer
        .showCurrent({ dimensions: {} }, false, true)
        .then(function (shown) {
          expect(shown).toBe(false);
          expect(viewer.opfView.getSpread).toHaveBeenCalledWith(
            position,
            false,
            true,
          );
          done();
        });
      return adapt_task.newResult(true);
    });
  });
});
