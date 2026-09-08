/**
 * Copyright 2017 Daishinsha Inc.
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

import * as adapt_epub from "../../../src/vivliostyle/epub";
import * as adapt_constants from "../../../src/vivliostyle/constants";
import * as adapt_counters from "../../../src/vivliostyle/counters";
import * as adapt_exprs from "../../../src/vivliostyle/exprs";
import * as adapt_logging from "../../../src/vivliostyle/logging";
import * as adapt_ops from "../../../src/vivliostyle/ops";
import * as adapt_task from "../../../src/vivliostyle/task";
import * as adapt_xmldoc from "../../../src/vivliostyle/xml-doc";
import * as vivliostyle_plugin from "../../../src/vivliostyle/plugin";

describe("epub", function () {
  function createPage(elementsById) {
    return {
      elementsById: elementsById,
      container: document.createElement("div"),
    };
  }

  function createDocumentURLTransformer() {
    return {
      transformFragment: function (fragment) {
        return fragment;
      },
      transformURL: function (url) {
        return url;
      },
      restoreURL: function (url) {
        var parts = url.split("#");
        return [parts[0], parts[1] || ""];
      },
    };
  }

  function waitUntil(condition) {
    var waitFrame = adapt_task.newFrame("waitUntil");
    var attempts = 0;
    var ready = true;
    waitFrame
      .loopWithFrame(function (loopFrame) {
        if (condition()) {
          loopFrame.breakLoop();
        } else if (++attempts > 150) {
          fail("waitUntil gave up after " + attempts + " attempts");
          ready = false;
          loopFrame.breakLoop();
        } else {
          loopFrame.sleep(10).then(function () {
            loopFrame.continueLoop();
          });
        }
      })
      .then(function () {
        waitFrame.finish(ready);
      });
    return waitFrame.result();
  }

  function failOnRunaway(spy, limit) {
    if (spy.calls.count() > (limit || 500)) {
      fail("runaway reference resolution");
      throw new Error("runaway reference resolution");
    }
  }

  function createCounterStoreStub(overrides) {
    return Object.assign(
      {
        documentURLTransformer: createDocumentURLTransformer(),
        currentPageCountersStack: [],
        currentPageCounters: { page: [0] },
        pageCountersBeforeOverride: {},
        unresolvedReferences: Object.create(null),
        resolvedReferences: Object.create(null),
        pageIndicesById: Object.create(null),
        pageCountersById: Object.create(null),
        hasUnresolvedReferencesToPage:
          adapt_counters.CounterStore.prototype.hasUnresolvedReferencesToPage,
        getUnresolvedRefsToPage:
          adapt_counters.CounterStore.prototype.getUnresolvedRefsToPage,
        updateRunningTargetReferenceNodes: function () {},
        customPageControlledCountersEverDeclared: function () {
          return false;
        },
        adjustPageCountersOfLaterSpines: function () {
          return [];
        },
        updatePageCounterNodesInPages: function () {},
        forceSetPageCounter:
          adapt_counters.CounterStore.prototype.forceSetPageCounter,
        pinTargetPages: function () {
          return [];
        },
        getPinnedTarget: function () {
          return null;
        },
        freezeTargetReferences: function () {
          return [];
        },
        settleFrozenReferences: function () {},
        finishPage: function () {},
        isUnresolvedReference:
          adapt_counters.CounterStore.prototype.isUnresolvedReference,
        pushPageCounters:
          adapt_counters.CounterStore.prototype.pushPageCounters,
        popPageCounters: adapt_counters.CounterStore.prototype.popPageCounters,
        referencesToSolve: [],
        referencesToSolveStack: [],
        pushReferencesToSolve:
          adapt_counters.CounterStore.prototype.pushReferencesToSolve,
        popReferencesToSolve:
          adapt_counters.CounterStore.prototype.popReferencesToSolve,
        finishLastPage: function () {},
        discardTargetSnapshotsOfSpine: function () {},
        removeReferencesFromPages: function () {},
      },
      overrides,
    );
  }

  function createOPFView() {
    var view = new adapt_epub.OPFView(
      {
        spine: [],
        documentURLTransformer: createDocumentURLTransformer(),
        epageIsRenderedPage: true,
        epageCount: 0,
      },
      {
        layoutBox: document.createElement("div"),
        root: document.createElement("div"),
        contentContainer: document.createElement("div"),
        clear: function () {},
        window: window,
        pixelRatio: 1,
        scaleRatio: 1,
        layoutUnitPerPixel: 1,
      },
      null,
      adapt_exprs.defaultPreferences(),
      function () {},
      adapt_constants.DEFAULT_MAX_TARGET_REFERENCE_LAYOUT_PASSES,
    );
    return view;
  }

  describe("EPUBDocStore", function () {
    describe("loadPubDoc", function () {
      it("skips HEAD and treats data: URLs as a Web Publication primary entry", function (done) {
        var store = new adapt_epub.EPUBDocStore();
        var opf = {};
        spyOn(store, "loadWebPub").and.callFake(function () {
          return adapt_task.newResult(opf);
        });

        adapt_task.start(function () {
          store.loadPubDoc("data:text/html,").then(function (result) {
            expect(store.loadWebPub).toHaveBeenCalledWith("data:text/html,");
            expect(result).toBe(opf);
            done();
          });
          return adapt_task.newResult(true);
        });
      });

      it("skips HEAD and treats .svg URLs as a Web Publication primary entry", function (done) {
        var store = new adapt_epub.EPUBDocStore();
        var url =
          "https://raw.githack.com/web-platform-tests/wpt/master/svg/styling/css-var-on-length-attributes-02.svg";
        var opf = {};
        spyOn(store, "loadWebPub").and.callFake(function () {
          return adapt_task.newResult(opf);
        });

        adapt_task.start(function () {
          store.loadPubDoc(url).then(function (result) {
            expect(store.loadWebPub).toHaveBeenCalledWith(url);
            expect(result).toBe(opf);
            done();
          });
          return adapt_task.newResult(true);
        });
      });

      it("skips HEAD and treats blob: URLs as a Web Publication primary entry", function (done) {
        var store = new adapt_epub.EPUBDocStore();
        var url =
          "blob:http://localhost:3000/12345678-1234-1234-1234-123456789abc";
        var opf = {};
        spyOn(store, "loadWebPub").and.callFake(function () {
          return adapt_task.newResult(opf);
        });

        adapt_task.start(function () {
          store.loadPubDoc(url).then(function (result) {
            expect(store.loadWebPub).toHaveBeenCalledWith(url);
            expect(result).toBe(opf);
            done();
          });
          return adapt_task.newResult(true);
        });
      });
    });
  });

  describe("OPFDoc", function () {
    describe("fromWebPubManifest", function () {
      it("creates a primary entry for data: URL documents", function (done) {
        var store = new adapt_epub.EPUBDocStore();
        var doc = new DOMParser().parseFromString(
          "<html xmlns='http://www.w3.org/1999/xhtml'><head><title>Blank</title></head><body></body></html>",
          "text/html",
        );

        adapt_task.start(function () {
          adapt_epub.OPFDoc.fromWebPubManifest(
            store,
            "data:text/html,",
            {},
            doc,
          ).then(function (opf) {
            expect(opf.items.length).toBe(1);
            expect(opf.spine.length).toBe(1);
            expect(opf.items[0].src).toBe("data:text/html,");
            done();
          });
          return adapt_task.newResult(true);
        });
      });

      it("creates a primary entry when the publication URL is the root document", function (done) {
        var store = new adapt_epub.EPUBDocStore();
        var doc = new DOMParser().parseFromString(
          "<html xmlns='http://www.w3.org/1999/xhtml'><head><title>Root</title></head><body></body></html>",
          "text/html",
        );

        adapt_task.start(function () {
          adapt_epub.OPFDoc.fromWebPubManifest(
            store,
            "https://example.com/webpub/",
            {},
            doc,
          ).then(function (opf) {
            expect(opf.items.length).toBe(1);
            expect(opf.spine.length).toBe(1);
            expect(opf.items[0].src).toBe("https://example.com/webpub/");
            done();
          });
          return adapt_task.newResult(true);
        });
      });

      ["%23", "%3F", "%3A"].forEach(function (encodedCharacter) {
        it(
          "preserves " + encodedCharacter + " in the primary entry filename",
          function (done) {
            var store = new adapt_epub.EPUBDocStore();
            var doc = new DOMParser().parseFromString(
              "<html xmlns='http://www.w3.org/1999/xhtml'><head><title>Reserved character</title></head><body></body></html>",
              "text/html",
            );
            var url =
              "https://example.com/book/file" + encodedCharacter + "name.html";

            adapt_task.start(function () {
              adapt_epub.OPFDoc.fromWebPubManifest(store, url, {}, doc).then(
                function (opf) {
                  expect(opf.spine.length).toBe(1);
                  expect(opf.spine[0].src).toBe(url);
                  done();
                },
              );
              return adapt_task.newResult(true);
            });
          },
        );
      });
    });

    describe("OPFDocumentURLTransformer", function () {
      var opfDoc = adapt_epub.OPFDoc.fromChapters(null, "", [
        { url: "http://example.com:8000/foo/bar1.html", index: 0 },
        { url: "http://example.com:8000/foo/bar2.html", index: 1 },
      ]).get();
      var transformer = opfDoc.createDocumentURLTransformer();

      var illegalCharRegexp = /[^-a-zA-Z0-9_:]/;

      describe("transformFragment / restoreURL", function () {
        var baseURL = "http://base.org:9000/baz.html";
        var fragment = "some-fragment";
        var transformed = transformer.transformFragment(fragment, baseURL);

        it("transforms a pair of a fragment and a base URL into an XML ID string", function () {
          expect(transformed).not.toMatch(illegalCharRegexp);
          expect(transformed.indexOf(adapt_epub.transformedIdPrefix)).toBe(0);
        });

        it("restores a pair of the original base URL and the original fragment", function () {
          var restored = transformer.restoreURL(transformed);
          expect(restored).toEqual([baseURL, fragment]);

          restored = transformer.restoreURL("#" + transformed);
          expect(restored).toEqual([baseURL, fragment]);
        });

        it("canonicalizes a redirected loaded document URL to the spine source URL", function () {
          var store = {
            get: function (url) {
              return url === "http://example.com:8000/foo/bar1.html"
                ? { url: "http://example.com:8000/foo/bar1" }
                : null;
            },
          };
          var redirectedOpfDoc = adapt_epub.OPFDoc.fromChapters(store, "", [
            { url: "http://example.com:8000/foo/bar1.html", index: 0 },
          ]).get();
          var redirectedTransformer =
            redirectedOpfDoc.createDocumentURLTransformer();

          var redirectedBaseURL = "http://example.com:8000/foo/bar1";
          var redirectedTransformed = redirectedTransformer.transformFragment(
            fragment,
            redirectedBaseURL,
          );

          expect(
            redirectedTransformer.restoreURL(redirectedTransformed),
          ).toEqual(["http://example.com:8000/foo/bar1.html", fragment]);
        });
      });

      describe("transformURL", function () {
        var fragment = "some-fragment";

        it("transforms a URL internal to the document into an XML ID string", function () {
          var baseURL = opfDoc.items[1].src;

          var transformed = transformer.transformURL("#" + fragment, baseURL);
          expect(transformed.charAt(0)).toBe("#");
          expect(transformed.substring(1)).not.toMatch(illegalCharRegexp);

          transformed = transformer.transformURL(baseURL + "#" + fragment);
          expect(transformed.charAt(0)).toBe("#");
          expect(transformed.substring(1)).not.toMatch(illegalCharRegexp);

          var restored = transformer.restoreURL(transformed);
          expect(restored).toEqual([baseURL, fragment]);
        });

        it("does not transform an external URL", function () {
          var baseURL = "http://base.org:9000/baz.html";

          var transformed = transformer.transformURL("#" + fragment, baseURL);
          expect(transformed).toBe("#" + fragment);

          transformed = transformer.transformURL(baseURL + "#" + fragment);
          expect(transformed).toBe(baseURL + "#" + fragment);
        });

        it("transforms a redirected same-document URL using the canonical spine URL", function () {
          var store = {
            get: function (url) {
              return url === "http://example.com:8000/foo/bar1.html"
                ? { url: "http://example.com:8000/foo/bar1" }
                : null;
            },
          };
          var redirectedOpfDoc = adapt_epub.OPFDoc.fromChapters(store, "", [
            { url: "http://example.com:8000/foo/bar1.html", index: 0 },
          ]).get();
          var redirectedTransformer =
            redirectedOpfDoc.createDocumentURLTransformer();
          var redirectedBaseURL = "http://example.com:8000/foo/bar1";

          var transformed = redirectedTransformer.transformURL(
            "#" + fragment,
            redirectedBaseURL,
          );
          expect(transformed.charAt(0)).toBe("#");

          expect(redirectedTransformer.restoreURL(transformed)).toEqual([
            "http://example.com:8000/foo/bar1.html",
            fragment,
          ]);
        });
      });
    });
  });

  describe("readMetadata", function () {
    var url = "foobar";

    it("parses DC11 terms in order", function () {
      var doc = new DOMParser().parseFromString(
        `
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="pub-id">urn:uuid:A1B0D67E-2E81-4DF5-9E67-A64CBE366809</dc:identifier>
        <dc:title>Norwegian Wood</dc:title>
        <dc:language>en</dc:language>
      </metadata>`,
        "text/xml",
      );
      var holder = new adapt_xmldoc.XMLDocHolder(null, url, doc);
      var items = holder.doc().childElements();
      var metadata = adapt_epub.readMetadata(items);

      expect(metadata["http://purl.org/dc/terms/identifier"]).toEqual([
        { v: "urn:uuid:A1B0D67E-2E81-4DF5-9E67-A64CBE366809", o: 1 },
      ]);

      expect(metadata["http://purl.org/dc/terms/title"]).toEqual([
        { v: "Norwegian Wood", o: 2 },
      ]);

      expect(metadata["http://purl.org/dc/terms/language"]).toEqual([
        { v: "en", o: 3 },
      ]);
    });

    it("parses DCTERMS properties in order", function () {
      var doc = new DOMParser().parseFromString(
        `
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <meta property="dcterms:modified">2011-01-01T12:00:00Z</meta>
      </metadata>`,
        "text/xml",
      );
      var holder = new adapt_xmldoc.XMLDocHolder(null, url, doc);
      var items = holder.doc().childElements();
      var metadata = adapt_epub.readMetadata(items);

      expect(metadata["http://purl.org/dc/terms/modified"]).toEqual([
        { v: "2011-01-01T12:00:00Z", o: 1 },
      ]);
    });

    it("parses refinement properties", function () {
      var doc = new DOMParser().parseFromString(
        `
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:creator id="creator">Haruki Murakami</dc:creator>
        <meta refines="#creator" property="role" scheme="marc:relators" id="role">aut</meta>
        <meta refines="#creator" property="alternate-script" xml:lang="ja">村上 春樹</meta>
        <meta refines="#creator" property="file-as">Murakami, Haruki</meta>
      </metadata>`,
        "text/xml",
      );
      var holder = new adapt_xmldoc.XMLDocHolder(null, url, doc);
      var items = holder.doc().childElements();
      var metadata = adapt_epub.readMetadata(items);

      expect(metadata["http://purl.org/dc/terms/creator"]).toEqual([
        {
          v: "Haruki Murakami",
          o: 1,
          r: {
            "http://idpf.org/epub/vocab/package/meta/#role": [
              { v: "aut", o: 2, s: "http://id.loc.gov/vocabulary/relators" },
            ],
            "http://idpf.org/epub/vocab/package/meta/#alternate-script": [
              { v: "村上 春樹", o: 3 },
            ],
            "http://idpf.org/epub/vocab/package/meta/#file-as": [
              { v: "Murakami, Haruki", o: 4 },
            ],
          },
        },
      ]);
    });

    it("parses role properties", function () {
      var doc = new DOMParser().parseFromString(
        `
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <dc:creator opf:role="aut">Harkaitz Cano</dc:creator>
        <dc:creator opf:role="trl">Roberta Gozzi</dc:creator>
        <dc:contributor opf:role="bkp">calibre (3.12.0) [https://calibre-ebook.com]</dc:contributor>
      </metadata>`,
        "text/xml",
      );
      var holder = new adapt_xmldoc.XMLDocHolder(null, url, doc);
      var items = holder.doc().childElements();
      var metadata = adapt_epub.readMetadata(items);

      expect(metadata["http://purl.org/dc/terms/creator"]).toEqual([
        {
          v: "Harkaitz Cano",
          o: 1,
          r: {
            "http://idpf.org/epub/vocab/package/meta/#role": [
              { v: "aut", o: 1 },
            ],
          },
        },
        {
          v: "Roberta Gozzi",
          o: 2,
          r: {
            "http://idpf.org/epub/vocab/package/meta/#role": [
              { v: "trl", o: 2 },
            ],
          },
        },
      ]);

      expect(metadata["http://purl.org/dc/terms/contributor"]).toEqual([
        {
          v: "calibre (3.12.0) [https://calibre-ebook.com]",
          o: 3,
          r: {
            "http://idpf.org/epub/vocab/package/meta/#role": [
              { v: "bkp", o: 3 },
            ],
          },
        },
      ]);
    });
  });
  describe("OPFView page rendering", function () {
    function createCounterStore() {
      return new adapt_counters.CounterStore(createDocumentURLTransformer());
    }

    function recordReferencesOnPage(store, spineIndex, pageIndex, references) {
      store.setCurrentPage(createPage({}));
      store.newReferencesOfCurrentPage = references.slice();
      store.finishPage(spineIndex, pageIndex);
    }

    function createPageNumberInstance(pageNumberOffset, breakBefore) {
      var instance = Object.create(adapt_ops.StyleInstance.prototype);
      instance.pageProgression = adapt_constants.PageProgression.LTR;
      instance.versoFirstPageByDefault = false;
      instance.styler = { breakBeforeValues: [breakBefore || null] };
      instance.viewport = { layoutBox: document.createElement("div") };
      instance.applyPageNumberOffset(pageNumberOffset);
      return instance;
    }

    describe("CounterStore reference bookkeeping", function () {
      it("invalidates references when the page counters of a target change", function () {
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          true,
        );
        var element = document.createElement("span");
        store.pageIndicesById.target = { spineIndex: 0, pageIndex: 3 };
        store.pageCountersById.target = { page: [4] };
        store.resolvedReferences.target = [reference];
        store.registerTargetReferenceExpr({ str: "page-expr" }, "target", () =>
          String(store.pageCountersById.target.page[0]),
        );

        store.currentPageCounters = { page: [3] };
        store.setCurrentPage(createPage({ target: [element] }));
        store.finishPage(0, 2);

        expect(reference.isResolved()).toBe(false);
        expect(store.unresolvedReferences.target).toEqual([reference]);
        expect(store.pageCountersById.target).toEqual({ page: [3] });

        store.unresolvedReferences.target = [];
        reference.resolve();
        store.resolvedReferences.target = [reference];
        store.currentPageCounters = { page: [3] };
        store.setCurrentPage(createPage({ target: [element] }));
        store.finishPage(0, 1);

        expect(reference.isResolved()).toBe(true);
        expect(store.resolvedReferences.target).toEqual([reference]);
        expect(store.pageIndicesById.target.pageIndex).toBe(1);
      });

      it("invalidates references when target text changes on the same page", function () {
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          true,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        var oldElement = document.createElement("span");
        oldElement.textContent = "old";
        store.currentPageCounters = { page: [1] };
        store.setCurrentPage(createPage({ target: [oldElement] }));
        store.finishPage(0, 0);
        store.resolvedReferences.target = [reference];
        store.registerTargetReferenceExpr(
          { str: "text-expr" },
          "target",
          () => store.pageTextById.target.content,
        );

        var newElement = document.createElement("span");
        newElement.textContent = "new";
        store.setCurrentPage(createPage({ target: [newElement] }));
        store.finishPage(0, 0);

        expect(reference.isResolved()).toBe(false);
        expect(store.unresolvedReferences.target).toEqual([reference]);
      });

      it("invalidates references when target counters change on the same page", function () {
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          true,
        );
        reference.spineIndex = 1;
        reference.pageIndex = 0;
        var element = document.createElement("span");
        store.currentPageCounters = { page: [4] };
        store.setCurrentPage(createPage({ target: [element] }));
        store.finishPage(1, 0);
        store.resolvedReferences.target = [reference];
        store.registerTargetReferenceExpr(
          { str: "counter-expr" },
          "target",
          () => String(store.pageCountersById.target.page[0]),
        );

        store.currentPageCounters = { page: [5] };
        store.setCurrentPage(createPage({ target: [element] }));
        store.finishPage(1, 0);

        expect(reference.isResolved()).toBe(false);
        expect(store.unresolvedReferences.target).toEqual([reference]);
      });

      it("shifts later-spine counter snapshots by a negative page delta", function () {
        var store = createCounterStore();
        var pageCounters = { page: [5] };
        var namedStringCounters = { page: [5] };
        store.pageIndicesById.later = { spineIndex: 1, pageIndex: 0 };
        store.pageCountersById.later = pageCounters;
        store.namedStringPageSnapshots[10] = {
          lastOffset: 20,
          spineIndex: 1,
          counters: namedStringCounters,
        };

        store.adjustPageCountersOfLaterSpines(0, -1);

        expect(pageCounters.page).toEqual([4]);
        expect(namedStringCounters.page).toEqual([4]);
      });

      it("preserves page counter values established by a nested reset", function () {
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "later",
          true,
        );
        var pageCounters = { page: [5, 100] };
        var namedStringCounters = { page: [5, 100] };
        store.pageIndicesById.later = { spineIndex: 1, pageIndex: 0 };
        store.pageCountersById.later = pageCounters;
        store.resolvedReferences.later = [reference];
        store.registerTargetReferenceExpr({ str: "later-page" }, "later", () =>
          String(pageCounters.page[pageCounters.page.length - 1]),
        );
        store.namedStringPageSnapshots[10] = {
          lastOffset: 20,
          spineIndex: 1,
          counters: namedStringCounters,
        };

        var changedTargetIds = store.adjustPageCountersOfLaterSpines(0, -1);

        expect(pageCounters.page).toEqual([4, 100]);
        expect(namedStringCounters.page).toEqual([4, 100]);
        expect(changedTargetIds).toEqual([]);
        expect(reference.isResolved()).toBe(true);
        expect(store.unresolvedReferences.later).toBeUndefined();
      });

      it("keeps references resolved when their values survive a page shift", function () {
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "later",
          true,
        );
        var pageCounters = { page: [5] };
        store.pageIndicesById.later = { spineIndex: 1, pageIndex: 0 };
        store.pageCountersById.later = pageCounters;
        store.resolvedReferences.later = [reference];
        store.registerTargetReferenceExpr(
          { str: "later-text" },
          "later",
          () => "Chapter title",
        );

        var changedTargetIds = store.adjustPageCountersOfLaterSpines(0, -1);

        expect(pageCounters.page).toEqual([4]);
        expect(changedTargetIds).toEqual([]);
        expect(reference.isResolved()).toBe(true);
        expect(store.resolvedReferences.later).toEqual([reference]);
      });

      it("invalidates every target sharing an adjusted page counter snapshot", function () {
        var store = createCounterStore();
        var sharedCounters = { page: [5] };
        var firstReference = new adapt_counters.TargetCounterReference(
          "first",
          true,
        );
        var secondReference = new adapt_counters.TargetCounterReference(
          "second",
          true,
        );
        store.pageIndicesById.first = { spineIndex: 1, pageIndex: 0 };
        store.pageIndicesById.second = { spineIndex: 1, pageIndex: 0 };
        store.pageCountersById.first = sharedCounters;
        store.pageCountersById.second = sharedCounters;
        store.resolvedReferences.first = [firstReference];
        store.resolvedReferences.second = [secondReference];
        ["first", "second"].forEach(function (id) {
          store.registerTargetReferenceExpr({ str: id + "-page" }, id, () =>
            String(sharedCounters.page[0]),
          );
        });

        var changedTargetIds = store.adjustPageCountersOfLaterSpines(0, -1);

        expect(sharedCounters.page).toEqual([4]);
        expect(changedTargetIds).toEqual(["first", "second"]);
        expect(firstReference.isResolved()).toBe(false);
        expect(secondReference.isResolved()).toBe(false);
        expect(store.unresolvedReferences.first).toEqual([firstReference]);
        expect(store.unresolvedReferences.second).toEqual([secondReference]);
      });

      it("replaces old references with the finished page reference set", function () {
        var store = createCounterStore();
        var retainedReference = new adapt_counters.TargetCounterReference(
          "target",
          true,
        );
        var oldResolvedReference = new adapt_counters.TargetCounterReference(
          "target",
          true,
        );
        var oldUnresolvedReference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        recordReferencesOnPage(store, 0, 0, [retainedReference]);
        recordReferencesOnPage(store, 0, 1, [
          oldResolvedReference,
          oldUnresolvedReference,
        ]);
        store.setCurrentPage(createPage({}));
        store.resolveReference("target");

        store.finishPage(0, 1);

        expect(store.resolvedReferences.target.length).toBe(2);
        expect(store.resolvedReferences.target).toContain(retainedReference);
        expect(
          store.resolvedReferences.target.filter(
            (reference) =>
              reference.spineIndex === 0 && reference.pageIndex === 1,
          ).length,
        ).toBe(1);
        expect(store.unresolvedReferences.target).toBeUndefined();
      });

      it("unresolves a reference rendered on the page where its target changes", function () {
        var store = createCounterStore();
        var oldReference = new adapt_counters.TargetCounterReference(
          "target",
          true,
        );
        oldReference.spineIndex = 0;
        oldReference.pageIndex = 1;
        store.pageIndicesById.target = { spineIndex: 0, pageIndex: 0 };
        store.pageCountersById.target = { page: [2] };
        store.resolvedReferences.target = [oldReference];
        store.registerTargetReferenceExpr(
          { str: "counter-expr" },
          "target",
          () => String(store.pageCountersById.target.page[0]),
        );
        store.currentPageCounters = { page: [1] };
        var page = createPage({
          target: [document.createElement("span")],
        });
        var renderedNode = document.createElement("span");
        renderedNode.setAttribute(
          adapt_counters.TARGET_COUNTER_ATTR,
          store.getTargetReferenceKey("counter-expr"),
        );
        renderedNode.setAttribute(adapt_counters.TARGET_VALUE_ATTR, "1");
        page.container.appendChild(renderedNode);
        store.setCurrentPage(page);

        store.finishPage(0, 0);

        expect(store.resolvedReferences.target).toEqual([]);
        expect(store.unresolvedReferences.target.length).toBe(2);
        expect(
          store.unresolvedReferences.target.every(function (reference) {
            return !reference.isResolved();
          }),
        ).toBe(true);
      });

      it("unresolves a reference whose node no longer carries the resolved value", function () {
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          true,
        );
        var container = document.createElement("div");
        var node = document.createElement("span");
        store.registerTargetReferenceExpr(
          { str: "counter-expr" },
          "target",
          function () {
            return "2";
          },
        );
        node.setAttribute(
          adapt_counters.TARGET_COUNTER_ATTR,
          store.getTargetReferenceKey("counter-expr"),
        );
        node.setAttribute(adapt_counters.TARGET_VALUE_ATTR, "1");
        node.textContent = "1";
        container.appendChild(node);
        recordReferencesOnPage(store, 0, 0, [reference]);
        store.setCurrentPage({ elementsById: {}, container: container });

        store.finishPage(0, 0);

        expect(store.resolvedReferences.target).toBeUndefined();
        expect(store.unresolvedReferences.target).toEqual([reference]);
        expect(reference.isResolved()).toBe(false);
      });

      it("keeps a reference resolved when its node carries the resolved value", function () {
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          true,
        );
        var container = document.createElement("div");
        var node = document.createElement("span");
        store.registerTargetReferenceExpr(
          { str: "text-expr" },
          "target",
          function () {
            return "\u300e(Before)\u300f";
          },
        );
        node.setAttribute(
          adapt_counters.TARGET_TEXT_ATTR,
          store.getTargetReferenceKey("text-expr"),
        );
        node.setAttribute(
          adapt_counters.TARGET_VALUE_ATTR,
          "\u300e(Before)\u300f",
        );
        node.innerHTML =
          "<viv-ts-open><viv-ts-inner>\u300e</viv-ts-inner><viv-ts-space>\u3000</viv-ts-space></viv-ts-open>(Before)\u300f";
        expect(node.textContent).not.toBe("\u300e(Before)\u300f");
        container.appendChild(node);
        recordReferencesOnPage(store, 0, 0, [reference]);
        store.setCurrentPage({ elementsById: {}, container: container });

        store.finishPage(0, 0);

        expect(store.resolvedReferences.target).toEqual([reference]);
        expect(store.unresolvedReferences.target).toBeUndefined();
        expect(reference.isResolved()).toBe(true);
      });

      it("removes references whose source pages were truncated", function () {
        var store = createCounterStore();
        var retainedReference = new adapt_counters.TargetCounterReference(
          "target",
          true,
        );
        var removedResolvedReference =
          new adapt_counters.TargetCounterReference("target", true);
        var removedUnresolvedReference =
          new adapt_counters.TargetCounterReference("target", false);
        recordReferencesOnPage(store, 0, 1, [retainedReference]);
        recordReferencesOnPage(store, 0, 2, [removedResolvedReference]);
        recordReferencesOnPage(store, 0, 3, [removedUnresolvedReference]);

        store.removeReferencesFromPages(0, 2);

        expect(store.resolvedReferences.target).toEqual([retainedReference]);
        expect(store.unresolvedReferences.target).toBeUndefined();
      });

      it("keeps references resolved when a moved target keeps its values", function () {
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          true,
        );
        var element = document.createElement("span");
        element.textContent = "title";
        store.pageIndicesById.target = { spineIndex: 0, pageIndex: 3 };
        store.pageTextById.target = { content: "title" };
        store.resolvedReferences.target = [reference];
        store.registerTargetReferenceExpr(
          { str: "text-expr" },
          "target",
          () => store.pageTextById.target.content,
        );

        store.setCurrentPage(createPage({ target: [element] }));
        store.finishPage(0, 2);

        expect(reference.isResolved()).toBe(true);
        expect(store.resolvedReferences.target).toEqual([reference]);
        expect(store.unresolvedReferences.target).toBeUndefined();
        expect(store.pageIndicesById.target.pageIndex).toBe(2);
      });
    });

    it("starts a new page with the preceding page counter state", function () {
      var view = createOPFView();
      var precedingPageCounters = { page: [6], chapter: [4] };
      var viewItem = {
        pages: [{}, {}],
        pageCounterStarts: [
          { page: [4], chapter: [2] },
          { page: [5], chapter: [3] },
        ],
        pageCounterEnds: [{ page: [5], chapter: [3] }, precedingPageCounters],
      };
      view.counterStore = createCounterStoreStub({
        currentPageCounters: { page: [2], chapter: [1] },
      });

      var oldPage = view.preparePageCountersForRender(viewItem, 2);

      expect(oldPage).toBeNull();
      expect(view.counterStore.currentPageCounters).toEqual(
        precedingPageCounters,
      );
      expect(view.counterStore.currentPageCounters).not.toBe(
        precedingPageCounters,
      );
      expect(viewItem.pageCounterStarts[2]).toEqual(precedingPageCounters);
      expect(viewItem.pageCounterStarts[2]).not.toBe(
        view.counterStore.currentPageCounters,
      );
    });
    it("shifts rendered later-spine state after a page-count change", function () {
      var view = createOPFView();
      var currentPageCounters = { page: [5] };
      var changedItem = { spineIndex: 0, epage: 0, epageCount: 1 };
      var laterItem = { spineIndex: 1, epage: 1, epageCount: 1 };
      var unloadedItem = { spineIndex: 2, epage: 2, epageCount: 2 };
      var changedViewItem = {
        item: changedItem,
        pages: [{}],
        pageCounterStarts: [],
        pageCounterEnds: [],
      };
      var targetReference = new adapt_counters.TargetCounterReference(
        "target",
        false,
      );
      var laterViewItem = {
        item: laterItem,
        instance: createPageNumberInstance(4, "right"),
        pages: [{ elementsById: { target: [document.createElement("span")] } }],
        layoutPositions: [null],
        pageCounterStarts: [{ page: [4] }],
        pageCounterEnds: [{ page: [5] }],
      };
      Object.assign(view.opf, {
        epageIsRenderedPage: true,
        spine: [
          Object.assign(changedItem, { startPage: null }),
          Object.assign(laterItem, { startPage: null }),
          Object.assign(unloadedItem, { startPage: null }),
        ],
      });
      view.spineItems = [changedViewItem, laterViewItem, null];
      view.counterStore = createCounterStoreStub({
        adjustPageCountersOfLaterSpines: jasmine
          .createSpy("adjustPageCountersOfLaterSpines")
          .and.returnValue(["target"]),
        updatePageCounterNodesInPages: jasmine.createSpy(
          "updatePageCounterNodesInPages",
        ),
        pageIndicesById: { target: { spineIndex: 1, pageIndex: 0 } },
        unresolvedReferences: { target: [targetReference] },
        pageCountersBeforeOverride: { page: [5] },
      });
      expect(laterViewItem.instance.blankPageAtStart).toBe(false);

      view.updateEPageRangesAfterPageCountChange(changedViewItem, 0);
      view.adjustFollowingSpinesForPageCountChange(
        changedViewItem,
        -1,
        currentPageCounters,
        1,
      );

      expect(
        view.counterStore.adjustPageCountersOfLaterSpines,
      ).toHaveBeenCalledWith(0, -1, Infinity, new Set());
      expect(
        view.counterStore.updatePageCounterNodesInPages,
      ).toHaveBeenCalledWith(
        laterViewItem.pages,
        laterViewItem.pageCounterEnds,
      );
      expect(laterViewItem.item.epage).toBe(0);
      expect(unloadedItem.epage).toBe(1);
      expect(laterViewItem.instance.pageNumberOffset).toBe(3);
      expect(laterViewItem.instance.blankPageAtStart).toBe(false);
      expect(laterViewItem.pageCounterStarts[0].page).toEqual([3]);
      expect(laterViewItem.pageCounterEnds[0].page).toEqual([4]);
      expect(currentPageCounters.page).toEqual([4]);
      expect(view.counterStore.pageCountersBeforeOverride.page).toEqual([4]);
      expect(view.postponedTargetHostPages).toEqual([
        { viewItem: laterViewItem, pageIndex: 0, nextLayoutPosition: null },
      ]);
    });

    it("postpones references while the materialization depth is raised", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        var page = {
          container: { parentElement: {}, setAttribute: function () {} },
          spineIndex: 0,
          elementsById: { target: [] },
        };
        var viewItem = {
          item: { spineIndex: 0 },
          pages: [page],
          layoutPositions: [null],
        };
        view.counterStore = createCounterStoreStub({
          unresolvedReferences: { target: [reference] },
        });
        Object.assign(view.opf, { spine: [{ startPage: null }] });
        view.spineItems = [viewItem];
        view.pendingPageMaterializationDepth = 1;
        spyOn(view, "getPageViewItem").and.returnValue(
          adapt_task.newResult(null),
        );

        view
          .resolveUnresolvedReferencesForPage(viewItem, page, 0, null)
          .then(function (result) {
            expect(result).toBe(page);
            expect(view.getPageViewItem).not.toHaveBeenCalled();
            expect(view.postponedTargetHostPages).toEqual([
              { viewItem: viewItem, pageIndex: 0, nextLayoutPosition: null },
            ]);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("postpones references met inside a counter scope and does not resolve them there", function (done) {
      adapt_task.start(function () {
        var store = createCounterStore();
        var view = createOPFView();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        store.unresolvedReferences.target = [reference];
        var container = document.createElement("div");
        document.createElement("div").appendChild(container);
        var page = {
          container: container,
          spineIndex: 0,
          elementsById: { target: [] },
        };
        var viewItem = {
          item: { spineIndex: 0 },
          pages: [page],
          layoutPositions: [null],
        };
        view.counterStore = store;
        view.spineItems = [viewItem];
        store.pushPageCounters({});
        spyOn(view, "getPageViewItem").and.returnValue(
          adapt_task.newResult(null),
        );

        view
          .resolveUnresolvedReferencesForPage(viewItem, page, 0, null)
          .then(function () {
            expect(view.getPageViewItem).not.toHaveBeenCalled();
            expect(view.postponedTargetHostPages).toEqual([
              { viewItem: viewItem, pageIndex: 0, nextLayoutPosition: null },
            ]);
            spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
              function (viewItem, page) {
                return adapt_task.newResult(page);
              },
            );
            view.resolvePostponedReferences().then(function () {
              expect(
                view.resolveUnresolvedReferencesForPage,
              ).not.toHaveBeenCalled();
              expect(view.postponedTargetHostPages.length).toBe(1);
              done();
            });
          });
        return adapt_task.newResult(true);
      });
    });

    it("describes a target by its restored document URL and fragment", function () {
      var view = createOPFView();
      var prefix = adapt_epub.transformedIdPrefix;
      view.counterStore.documentURLTransformer = {
        restoreURL: function (id) {
          return id === prefix + "1"
            ? ["chapter.html", "target"]
            : ["chapter.html", ""];
        },
      };
      expect(view.describeTargetId(prefix + "1")).toBe("chapter.html#target");
      expect(view.describeTargetId(prefix + "2")).toBe("chapter.html");
      expect(view.describeTargetId("http://example.com/x.html#y")).toBe(
        "http://example.com/x.html#y",
      );
      view.counterStore.documentURLTransformer = {
        restoreURL: function () {
          return ["", ""];
        },
      };
      expect(view.describeTargetId(prefix + "3")).toBe(prefix + "3");
    });

    it("lists at most five targets when describing them", function () {
      var view = createOPFView();
      expect(view.describeTargets([])).toBe("targets (none)");
      expect(view.describeTargets(["a", "b"])).toBe("targets a, b");
      expect(view.describeTargets(["a", "b", "c", "d", "e", "f", "g"])).toBe(
        "targets a, b, c, d, e and 2 more",
      );
    });

    it("keeps frozen reference values after a later target shift", function () {
      var store = createCounterStore();
      var reference = new adapt_counters.TargetCounterReference(
        "target",
        false,
      );
      reference.spineIndex = 0;
      reference.pageIndex = 0;
      store.unresolvedReferences.target = [reference];
      store.pageIndicesById.target = { spineIndex: 2, pageIndex: 0 };
      store.pageCountersById.target = { page: [5] };
      store.registerTargetReferenceExpr(
        { str: "counter-expr" },
        "target",
        function () {
          return String(store.pageCountersById.target.page[0]);
        },
      );
      store.freezeTargetReferences([reference]);
      store.settleFrozenReferences([reference]);
      expect(store.resolvedReferences.target).toEqual([reference]);
      expect(store.unresolvedReferences.target).toEqual([]);
      var changedViewItem = {
        item: { spineIndex: 1 },
        pages: [{ elementsById: {} }],
        pageCounterStarts: [],
        pageCounterEnds: [],
      };
      var targetViewItem = {
        item: { spineIndex: 2 },
        pages: [
          {
            container: document.createElement("div"),
            elementsById: { target: [] },
          },
        ],
        layoutPositions: [null],
        pageCounterStarts: [{ page: [4] }],
        pageCounterEnds: [],
        instance: createPageNumberInstance(4),
      };
      var view = createOPFView();
      Object.assign(view.opf, {
        epageIsRenderedPage: false,
        spine: [{ startPage: null }, { startPage: null }, { startPage: null }],
      });
      view.spineItems = [
        { item: { spineIndex: 0 }, pages: [{ elementsById: {} }] },
        changedViewItem,
        targetViewItem,
      ];
      view.counterStore = store;
      view.postponedTargetHostPages = [];
      spyOn(view, "postponeTargetHostPage");

      view.adjustFollowingSpinesForPageCountChange(changedViewItem, 1, null, 1);

      expect(view.postponeTargetHostPage).not.toHaveBeenCalled();
      expect(reference.isFrozen()).toBe(true);
      expect(reference.isResolved()).toBe(true);
      expect(store.pageCountersById.target.page).toEqual([6]);
      expect(store.getFrozenTargetValue("counter-expr")).toBe("5");
    });

    it("stops page-counter shifts at an explicit spine page number", function () {
      var view = createOPFView();
      var currentPageCounters = { page: [11] };
      var changedItem = { spineIndex: 0, epage: 0, epageCount: 1 };
      var resetItem = { spineIndex: 1, epage: 1, epageCount: 1 };
      var laterItem = { spineIndex: 2, epage: 2, epageCount: 1 };
      var changedViewItem = {
        item: changedItem,
        pages: [{}],
        pageCounterStarts: [],
        pageCounterEnds: [],
      };
      var resetViewItem = {
        item: resetItem,
        instance: createPageNumberInstance(9),
        pages: [{}],
        pageCounterStarts: [{ page: [9] }],
        pageCounterEnds: [],
      };
      var laterViewItem = {
        item: laterItem,
        instance: createPageNumberInstance(10),
        pages: [{}],
        pageCounterStarts: [{ page: [10] }],
        pageCounterEnds: [],
      };
      Object.assign(view.opf, {
        epageIsRenderedPage: true,
        spine: [
          Object.assign(changedItem, { startPage: null }),
          Object.assign(resetItem, { startPage: 10 }),
          Object.assign(laterItem, { startPage: null }),
        ],
      });
      view.spineItems = [changedViewItem, resetViewItem, laterViewItem];
      view.counterStore = createCounterStoreStub({
        adjustPageCountersOfLaterSpines: jasmine
          .createSpy("adjustPageCountersOfLaterSpines")
          .and.returnValue([]),
        updatePageCounterNodesInPages: jasmine.createSpy(
          "updatePageCounterNodesInPages",
        ),
      });

      view.updateEPageRangesAfterPageCountChange(changedViewItem, 0);
      view.adjustFollowingSpinesForPageCountChange(
        changedViewItem,
        -1,
        currentPageCounters,
        2,
      );

      expect(
        view.counterStore.adjustPageCountersOfLaterSpines,
      ).toHaveBeenCalledWith(0, -1, 1, new Set());
      expect(resetViewItem.item.epage).toBe(0);
      expect(laterViewItem.item.epage).toBe(1);
      expect(resetViewItem.instance.pageNumberOffset).toBe(9);
      expect(laterViewItem.instance.pageNumberOffset).toBe(10);
      expect(resetViewItem.pageCounterStarts[0].page).toEqual([9]);
      expect(laterViewItem.pageCounterStarts[0].page).toEqual([10]);
      expect(currentPageCounters.page).toEqual([11]);
      expect(
        view.counterStore.updatePageCounterNodesInPages,
      ).not.toHaveBeenCalled();
    });

    it("treats a pass limit below one as a single pass", function (done) {
      var store = createCounterStore();
      var view = createOPFView();
      var reference = new adapt_counters.TargetCounterReference(
        "target",
        false,
      );
      reference.spineIndex = 0;
      reference.pageIndex = 1;
      store.unresolvedReferences.target = [reference];
      store.pageIndicesById.target = { spineIndex: 0, pageIndex: 2 };
      store.pageCountersById.target = { chapter: [3] };
      var page = { elementsById: { target: [] } };
      var viewItem = { item: { spineIndex: 0 }, pages: [page] };
      view.counterStore = store;
      view.spineItems = [viewItem];
      view.maxTargetReferenceLayoutPasses = 0;
      view.postponeTargetHostPage(viewItem, 0, null);
      spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
        function (viewItem, page, pageIndex, nextLayoutPosition) {
          failOnRunaway(view.resolveUnresolvedReferencesForPage);
          view.postponeTargetHostPage(viewItem, pageIndex, nextLayoutPosition);
          return adapt_task.newResult(page);
        },
      );
      spyOn(adapt_logging.logger, "warn");

      adapt_task.start(function () {
        view.resolvePostponedReferences().then(function () {
          expect(view.resolveUnresolvedReferencesForPage.calls.count()).toBe(2);
          expect(reference.isFrozen()).toBe(true);
          expect(adapt_logging.logger.warn.calls.allArgs()).toEqual([
            [
              "Cross-reference layout did not converge after 1 pass; references to target target keep their last resolved values",
            ],
          ]);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("runs the pinned passes when a pending target is already pinned", function (done) {
      var store = createCounterStore();
      var view = createOPFView();
      var reference = new adapt_counters.TargetCounterReference(
        "target",
        false,
      );
      reference.spineIndex = 0;
      reference.pageIndex = 1;
      store.unresolvedReferences.target = [reference];
      store.pageIndicesById.target = { spineIndex: 0, pageIndex: 2 };
      store.pageCountersById.target = { page: [3] };
      store.pinTargetPages(["target"]);
      var page = { elementsById: { target: [] } };
      var viewItem = { item: { spineIndex: 0 }, pages: [page] };
      view.counterStore = store;
      view.spineItems = [viewItem];
      view.maxTargetReferenceLayoutPasses = 1;
      view.postponeTargetHostPage(viewItem, 0, null);
      spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
        function (viewItem, page, pageIndex, nextLayoutPosition) {
          failOnRunaway(view.resolveUnresolvedReferencesForPage);
          view.postponeTargetHostPage(viewItem, pageIndex, nextLayoutPosition);
          return adapt_task.newResult(page);
        },
      );
      spyOn(adapt_logging.logger, "warn");

      adapt_task.start(function () {
        view.resolvePostponedReferences().then(function () {
          var warnings = adapt_logging.logger.warn.calls
            .allArgs()
            .map(function (args) {
              return args[0];
            });
          expect(view.resolveUnresolvedReferencesForPage.calls.count()).toBe(3);
          expect(
            warnings.some(function (message) {
              return / with pinned targets;/.test(message);
            }),
          ).toBe(true);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("freezes references after the free passes when no target could be pinned", function (done) {
      var store = createCounterStore();
      var view = createOPFView();
      var reference = new adapt_counters.TargetCounterReference(
        "target",
        false,
      );
      reference.spineIndex = 0;
      reference.pageIndex = 1;
      store.unresolvedReferences.target = [reference];
      store.pageIndicesById.target = { spineIndex: 0, pageIndex: 2 };
      store.pageCountersById.target = { chapter: [3] };
      store.registerTargetReferenceExpr({ str: "expr" }, "target", () =>
        String(store.pageCountersById.target.chapter[0]),
      );
      var page = { elementsById: { target: [] } };
      var viewItem = { item: { spineIndex: 0 }, pages: [page] };
      view.counterStore = store;
      view.spineItems = [viewItem];
      view.maxTargetReferenceLayoutPasses = 3;
      view.postponeTargetHostPage(viewItem, 0, null);
      spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
        function (viewItem, page, pageIndex, nextLayoutPosition) {
          failOnRunaway(view.resolveUnresolvedReferencesForPage);
          view.postponeTargetHostPage(viewItem, pageIndex, nextLayoutPosition);
          return adapt_task.newResult(page);
        },
      );
      spyOn(adapt_logging.logger, "warn");

      adapt_task.start(function () {
        view.resolvePostponedReferences().then(function () {
          expect(view.resolveUnresolvedReferencesForPage.calls.count()).toBe(4);
          expect(store.getPinnedTarget("target")).toBeNull();
          expect(reference.isFrozen()).toBe(true);
          expect(reference.isResolved()).toBe(true);
          store.pageCountersById.target = { chapter: [9] };
          expect(store.getFrozenTargetValue("expr")).toBe("3");
          expect(adapt_logging.logger.warn.calls.allArgs()).toEqual([
            [
              "Cross-reference layout did not converge after 3 passes; references to target target keep their last resolved values",
            ],
          ]);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("stops reference layout after the configured pass limit", function (done) {
      var store = createCounterStore();
      var view = createOPFView();
      var reference = new adapt_counters.TargetCounterReference(
        "target",
        false,
      );
      reference.spineIndex = 0;
      reference.pageIndex = 1;
      store.unresolvedReferences.target = [reference];
      store.pageIndicesById.target = { spineIndex: 0, pageIndex: 2 };
      store.pageCountersById.target = { page: [3] };
      var page = { elementsById: { target: [] } };
      var viewItem = { item: { spineIndex: 0 }, pages: [page] };
      view.counterStore = store;
      view.spineItems = [viewItem];
      view.maxTargetReferenceLayoutPasses = 3;
      view.postponedTargetHostPages.push({
        viewItem: viewItem,
        pageIndex: 0,
        nextLayoutPosition: null,
      });
      spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
        function (viewItem, page, pageIndex, nextLayoutPosition) {
          failOnRunaway(view.resolveUnresolvedReferencesForPage);
          view.postponedTargetHostPages.push({
            viewItem: viewItem,
            pageIndex: pageIndex,
            nextLayoutPosition: nextLayoutPosition,
          });
          return adapt_task.newResult(page);
        },
      );
      spyOn(adapt_logging.logger, "warn");

      adapt_task.start(function () {
        view.resolvePostponedReferences().then(function () {
          expect(view.resolveUnresolvedReferencesForPage.calls.count()).toBe(7);
          expect(store.getPinnedTarget("target")).not.toBeNull();
          expect(reference.isResolved()).toBe(true);
          expect(reference.isFrozen()).toBe(true);
          expect(store.unresolvedReferences.target).toEqual([]);
          expect(store.resolvedReferences.target).toEqual([reference]);
          expect(view.postponedTargetHostPages).toEqual([]);
          expect(adapt_logging.logger.warn.calls.allArgs()).toEqual([
            [
              "Cross-reference layout did not converge after 3 passes; pinning target target to the last page number, which may leave earlier pages blank",
            ],
            [
              "Cross-reference layout did not converge after 3 passes with pinned targets; references to target target keep their last resolved values",
            ],
          ]);
          var laterReference = new adapt_counters.TargetCounterReference(
            "later",
            false,
          );
          laterReference.spineIndex = 0;
          laterReference.pageIndex = 2;
          store.unresolvedReferences.later = [laterReference];
          var laterPage = { elementsById: { later: [] } };
          var laterViewItem = { item: { spineIndex: 0 }, pages: [laterPage] };
          view.spineItems = [laterViewItem];
          view.resolveUnresolvedReferencesForPage.and.callFake(function () {
            laterReference.resolve();
            store.unresolvedReferences.later = [];
            store.resolvedReferences.later = [laterReference];
            return adapt_task.newResult(laterPage);
          });
          view.postponedTargetHostPages.push({
            viewItem: laterViewItem,
            pageIndex: 0,
            nextLayoutPosition: null,
          });

          view.resolvePostponedReferences().then(function () {
            expect(
              view.resolveUnresolvedReferencesForPage,
            ).toHaveBeenCalledWith(laterViewItem, laterPage, 0, null);
            expect(laterReference.isResolved()).toBe(true);
            expect(laterReference.isFrozen()).toBe(false);
            expect(store.getPinnedTarget("target")).not.toBeNull();
            expect(store.getPinnedTarget("later")).toBeNull();
            expect(view.resolvingPostponedReferences).toBe(false);
            expect(view.postponedReferenceResolutionTask).toBe(null);
            done();
          });
        });
        return adapt_task.newResult(true);
      });
    });

    it("defers entries added during a pass to the next pass", function (done) {
      var store = createCounterStore();
      var firstReference = new adapt_counters.TargetCounterReference(
        "first",
        false,
      );
      var secondReference = new adapt_counters.TargetCounterReference(
        "second",
        false,
      );
      recordReferencesOnPage(store, 0, 0, [firstReference]);
      recordReferencesOnPage(store, 0, 1, [secondReference]);
      store.pageIndicesById.first = { spineIndex: 0, pageIndex: 0 };
      store.pageIndicesById.second = { spineIndex: 0, pageIndex: 1 };
      store.pageCountersById.first = { page: [1] };
      store.pageCountersById.second = { page: [2] };
      var firstPage = { elementsById: { first: [] } };
      var secondPage = { elementsById: { second: [] } };
      var viewItem = {
        item: { spineIndex: 0 },
        pages: [firstPage, secondPage],
      };
      var view = createOPFView();
      view.counterStore = store;
      view.spineItems = [viewItem];
      view.postponedTargetHostPages = [
        {
          viewItem: viewItem,
          pageIndex: 0,
          nextLayoutPosition: null,
        },
        {
          viewItem: viewItem,
          pageIndex: 1,
          nextLayoutPosition: null,
        },
      ];
      view.maxTargetReferenceLayoutPasses = 1;
      spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
        function () {
          failOnRunaway(view.resolveUnresolvedReferencesForPage);
          store.removeReferencesFromPages(0, 1);
          view.postponedTargetHostPages.push({
            viewItem: viewItem,
            pageIndex: 0,
            nextLayoutPosition: null,
          });
          return adapt_task.newResult(firstPage);
        },
      );
      spyOn(adapt_logging.logger, "warn");

      adapt_task.start(function () {
        view.resolvePostponedReferences().then(function () {
          expect(view.resolveUnresolvedReferencesForPage.calls.count()).toBe(3);
          expect(
            view.resolveUnresolvedReferencesForPage.calls
              .allArgs()
              .map(function (args) {
                return args[1];
              }),
          ).toEqual([firstPage, firstPage, firstPage]);
          expect(store.getPinnedTarget("first")).not.toBeNull();
          expect(firstReference.isFrozen()).toBe(true);
          expect(adapt_logging.logger.warn.calls.count()).toBe(2);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("stops tracking a render task after a synchronous error", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var error = new Error("render failed");
        spyOn(view, "renderPageTracked").and.callFake(function () {
          expect(view.renderingPageTasks.size).toBe(1);
          throw error;
        });

        return adapt_task.handle(
          "testRenderErrorCleanup",
          function (frame) {
            view
              .renderPage({ spineIndex: 0, pageIndex: 0, offsetInItem: -1 })
              .then(function () {
                fail("the render should have failed");
                frame.finish(false);
              });
          },
          function (frame, caughtError) {
            expect(caughtError).toBe(error);
            expect(view.renderingPageTasks.size).toBe(0);
            frame.finish(true);
            done();
          },
        );
      });
    });

    it("releases postponed-reference resolution after an error", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var error = new Error("reference render failed");
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        var page = { elementsById: { target: [] } };
        view.counterStore = createCounterStoreStub({
          unresolvedReferences: { target: [reference] },
        });
        var hostViewItem = { item: { spineIndex: 0 }, pages: [page] };
        view.spineItems = [hostViewItem];
        view.postponedTargetHostPages = [
          { viewItem: hostViewItem, pageIndex: 0, nextLayoutPosition: null },
        ];
        view.maxTargetReferenceLayoutPasses = 3;
        spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
          function () {
            throw error;
          },
        );

        return adapt_task.handle(
          "testPostponedReferenceErrorCleanup",
          function (frame) {
            view.resolvePostponedReferences().then(function () {
              fail("the resolution should have failed");
              frame.finish(false);
            });
          },
          function (frame, caughtError) {
            expect(caughtError).toBe(error);
            expect(view.resolvingPostponedReferences).toBe(false);
            expect(view.postponedReferenceResolutionTask).toBe(null);
            expect(view.postponedTargetHostPages.length).toBe(1);
            frame.finish(true);
            done();
          },
        );
      });
    });

    it("restores target resolution state after a render error", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var store = createCounterStore();
        var error = new Error("target render failed");
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        store.unresolvedReferences.target = [reference];
        var originalCounters = { page: [9] };
        store.currentPageCounters = originalCounters;
        var page = { elementsById: { target: [] } };
        var scopes = { original: {} };
        var stylerCascade = {
          currentPageType: "chapter",
          previousPageType: "frontmatter",
        };
        var pageCascade = {
          currentPageType: "chapter",
          previousPageType: "frontmatter",
        };
        var instance = {
          styler: { cascade: stylerCascade },
          pageManager: { pageCascadeInstance: pageCascade },
          pageGroupPageCounts: {},
          currentPageGroupDocument: document,
          scopes: scopes,
          beginIsolatedRootPageFloatLayoutContext: jasmine
            .createSpy("beginIsolatedRootPageFloatLayoutContext")
            .and.returnValue({ original: true }),
          endIsolatedRootPageFloatLayoutContext: jasmine.createSpy(
            "endIsolatedRootPageFloatLayoutContext",
          ),
          preparePageGroupPageIndicesForRerender: function () {},
        };
        var viewItem = {
          item: { spineIndex: 0 },
          instance: instance,
          pages: [page, { pageFloatLayoutContext: null }],
          layoutPositions: [{ page: 0 }],
        };
        view.counterStore = store;
        view.spineIndexOfCurrentPageCounters = 3;
        spyOn(view, "getPageViewItem").and.callFake(function () {
          return adapt_task.newResult(viewItem);
        });
        spyOn(view, "renderSinglePage").and.callFake(function () {
          view.spineIndexOfCurrentPageCounters = 0;
          stylerCascade.currentPageType = "appendix";
          pageCascade.currentPageType = "appendix";
          instance.pageGroupPageCounts = { appendix: 1 };
          instance.currentPageGroupDocument = null;
          instance.scopes = { replaced: true };
          throw error;
        });

        return adapt_task.handle(
          "testTargetResolutionStateCleanup",
          function (frame) {
            view
              .resolveUnresolvedReferencesForPage(viewItem, page, 0, null)
              .then(function () {
                fail("the resolution should have failed");
                frame.finish(false);
              });
          },
          function (frame, caughtError) {
            expect(caughtError).toBe(error);
            expect(store.currentPageCounters).toEqual(originalCounters);
            expect(view.spineIndexOfCurrentPageCounters).toBe(3);
            expect(store.currentPageCountersStack).toEqual([]);
            expect(store.referencesToSolve).toEqual([]);
            expect(store.referencesToSolveStack).toEqual([]);
            expect(instance.scopes).toBe(scopes);
            expect(instance.pageGroupPageCounts).toEqual({});
            expect(instance.currentPageGroupDocument).toBe(document);
            expect(stylerCascade.currentPageType).toBe("chapter");
            expect(pageCascade.currentPageType).toBe("chapter");
            expect(
              instance.endIsolatedRootPageFloatLayoutContext,
            ).toHaveBeenCalledWith({ original: true });
            frame.finish(true);
            done();
          },
        );
      });
    });

    it("skips unresolved references whose source layout slot was truncated", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 1;
        store.unresolvedReferences.target = [reference];
        var page = {
          elementsById: { target: [] },
          container: {
            parentElement: {},
            setAttribute: jasmine.createSpy("setAttribute"),
          },
          spineIndex: 0,
        };
        var viewItem = {
          item: { spineIndex: 0 },
          pages: [page],
          layoutPositions: [null],
        };
        view.counterStore = store;
        store.finishLastPage = function () {};
        Object.assign(view.opf, { spine: [{}] });
        spyOn(view, "getPageViewItem").and.callFake(function () {
          return adapt_task.newResult(viewItem);
        });
        spyOn(view, "renderSinglePage");

        view
          .resolveUnresolvedReferencesForPage(viewItem, page, 0, { page: 1 })
          .then(function (result) {
            expect(result).toBe(page);
            expect(result.isLastPage).toBe(true);
            expect(view.renderSinglePage).not.toHaveBeenCalled();
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("skips unresolved references replaced while loading their source spine", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        store.unresolvedReferences.target = [reference];
        var page = {
          elementsById: { target: [] },
          container: {
            parentElement: {},
            setAttribute: jasmine.createSpy("setAttribute"),
          },
          spineIndex: 0,
        };
        var viewItem = {
          item: { spineIndex: 0 },
          pages: [page],
          layoutPositions: [null],
        };
        view.counterStore = store;
        Object.assign(view.opf, { spine: [{}, {}] });
        spyOn(view, "getPageViewItem").and.callFake(function () {
          store.unresolvedReferences.target = [];
          return adapt_task.newResult(viewItem);
        });
        spyOn(view, "renderSinglePage");

        view
          .resolveUnresolvedReferencesForPage(viewItem, page, 0, null)
          .then(function (result) {
            expect(result).toBe(page);
            expect(view.renderSinglePage).not.toHaveBeenCalled();
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("stays out of a counter scope until every level is popped", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var store = view.counterStore;
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        store.unresolvedReferences.target = [reference];
        var entry = {
          viewItem: {
            item: { spineIndex: 0 },
            pages: [{ elementsById: { target: [] } }],
          },
          pageIndex: 0,
          nextLayoutPosition: null,
        };
        spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
          function (viewItem, page) {
            reference.resolve();
            return adapt_task.newResult(page);
          },
        );
        store.pushPageCounters({});
        store.pushPageCounters({});
        store.popPageCounters();
        view.spineItems = [entry.viewItem];
        view.postponedTargetHostPages = [entry];

        view.resolvePostponedReferences().then(function () {
          expect(
            view.resolveUnresolvedReferencesForPage,
          ).not.toHaveBeenCalled();
          expect(view.postponedTargetHostPages).toEqual([entry]);
          store.popPageCounters();
          view.resolvePostponedReferences().then(function () {
            expect(view.resolveUnresolvedReferencesForPage).toHaveBeenCalled();
            expect(view.postponedTargetHostPages).toEqual([]);
            done();
          });
        });
        return adapt_task.newResult(true);
      });
    });

    it("leaves running copies alone when a resolution had nothing to do", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var hostViewItem = {
          item: { spineIndex: 0 },
          pages: [{ elementsById: {} }],
        };
        view.spineItems = [hostViewItem];
        view.postponedTargetHostPages = [
          { viewItem: hostViewItem, pageIndex: 0, nextLayoutPosition: null },
        ];
        spyOn(view.counterStore, "updateRunningTargetReferenceNodes");

        view.resolvePostponedReferences().then(function () {
          expect(
            view.counterStore.updateRunningTargetReferenceNodes,
          ).not.toHaveBeenCalled();
          expect(view.postponedTargetHostPages).toEqual([]);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("returns at once when the current task already owns the resolution", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        view.counterStore.unresolvedReferences.target = [
          new adapt_counters.TargetCounterReference("target", false),
        ];
        view.resolvingPostponedReferences = true;
        view.postponedReferenceResolutionTask = adapt_task.currentTask();
        var ownedViewItem = {
          item: { spineIndex: 0 },
          pages: [{ elementsById: { target: [] } }],
        };
        view.spineItems = [ownedViewItem];
        view.postponedTargetHostPages = [
          { viewItem: ownedViewItem, pageIndex: 0, nextLayoutPosition: null },
        ];
        spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
          function (viewItem, page) {
            return adapt_task.newResult(page);
          },
        );

        view.resolvePostponedReferences().then(function (result) {
          expect(result).toBe(true);
          expect(
            view.resolveUnresolvedReferencesForPage,
          ).not.toHaveBeenCalled();
          expect(view.postponedTargetHostPages.length).toBe(1);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("cancels waiting tasks when the rendered pages are removed", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        var page = { elementsById: { target: [] } };
        view.counterStore = createCounterStoreStub({
          unresolvedReferences: { target: [reference] },
        });
        view.postponeTargetHostPage(
          { item: { spineIndex: 0 }, pages: [page] },
          0,
          null,
        );
        var releaseOwner = null;
        spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
          function () {
            var frame = adapt_task.newFrame("blockedReferenceResolution");
            var continuation = frame.suspend("test");
            releaseOwner = function () {
              reference.resolve();
              continuation.schedule(page);
            };
            return frame.result();
          },
        );

        var waiterError = null;
        var scheduler = adapt_task.currentTask().getScheduler();
        var ownerTask = scheduler.run(function () {
          return view.resolvePostponedReferences();
        });
        var testFrame = adapt_task.newFrame("testPostponedReferenceCancel");
        waitUntil(function () {
          return releaseOwner !== null;
        }).then(function (ready) {
          if (!ready) {
            done();
            return;
          }
          var waiterTask = scheduler.run(function () {
            return adapt_task.handle(
              "referenceResolutionWaiter",
              function (frame) {
                view.resolvePostponedReferences().thenFinish(frame);
              },
              function (frame, caughtError) {
                waiterError = caughtError;
                frame.finish(false);
              },
            );
          });
          waitUntil(function () {
            return view.postponedReferenceResolutionWaiters.length === 1;
          }).then(function (ready) {
            if (!ready) {
              done();
              return;
            }
            view.removeRenderedPages();
            waiterTask.join().then(function () {
              expect(
                waiterError instanceof adapt_epub.RenderingCanceledError,
              ).toBe(true);
              releaseOwner();
              ownerTask.join().then(function () {
                testFrame.finish(true);
                done();
              });
            });
          });
        });
        return testFrame.result();
      });
    });

    it("propagates postponed-reference errors to waiting tasks", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var error = new Error("reference render failed");
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        var page = { elementsById: { target: [] } };
        view.counterStore = createCounterStoreStub({
          unresolvedReferences: { target: [reference] },
        });
        view.postponedTargetHostPages = [
          {
            viewItem: { item: { spineIndex: 0 }, pages: [page] },
            pageIndex: 0,
            nextLayoutPosition: null,
          },
        ];
        view.maxTargetReferenceLayoutPasses = 3;
        var releaseOwner = null;
        spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
          function () {
            var frame = adapt_task.newFrame("blockedReferenceFailure");
            var blockedFrame = adapt_task.newFrame("blocked");
            var continuation = blockedFrame.suspend("test");
            releaseOwner = function () {
              continuation.schedule(true);
            };
            blockedFrame.result().then(function () {
              frame.task.raise(error, frame);
            });
            return frame.result();
          },
        );

        var ownerError = null;
        var waiterError = null;
        var scheduler = adapt_task.currentTask().getScheduler();
        var ownerTask = scheduler.run(function () {
          return adapt_task.handle(
            "referenceResolutionOwner",
            function (frame) {
              view.resolvePostponedReferences().thenFinish(frame);
            },
            function (frame, caughtError) {
              ownerError = caughtError;
              frame.finish(false);
            },
          );
        });
        var testFrame = adapt_task.newFrame(
          "testPostponedReferenceErrorPropagation",
        );
        waitUntil(function () {
          return releaseOwner !== null;
        }).then(function (ready) {
          if (!ready) {
            done();
            return;
          }
          var waiterTask = scheduler.run(function () {
            return adapt_task.handle(
              "referenceResolutionWaiter",
              function (frame) {
                view.resolvePostponedReferences().thenFinish(frame);
              },
              function (frame, caughtError) {
                waiterError = caughtError;
                frame.finish(false);
              },
            );
          });
          waitUntil(function () {
            return view.postponedReferenceResolutionWaiters.length === 1;
          }).then(function (ready) {
            if (!ready) {
              done();
              return;
            }
            releaseOwner();
            ownerTask.join().then(function () {
              waiterTask.join().then(function () {
                expect(ownerError).toBe(error);
                expect(waiterError).toBe(error);
                expect(view.postponedTargetHostPages.length).toBe(1);
                expect(view.resolvingPostponedReferences).toBe(false);
                testFrame.finish(true);
                done();
              });
            });
          });
        });
        return testFrame.result();
      });
    });

    it("waits for postponed-reference resolution owned by another task", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        var page = { elementsById: { target: [] } };
        view.counterStore = createCounterStoreStub({
          unresolvedReferences: { target: [reference] },
        });
        view.postponedTargetHostPages = [
          {
            viewItem: { item: { spineIndex: 0 }, pages: [page] },
            pageIndex: 0,
            nextLayoutPosition: null,
          },
        ];
        view.maxTargetReferenceLayoutPasses = 3;
        var releaseOwner = null;
        spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
          function () {
            var frame = adapt_task.newFrame("blockedReferenceResolution");
            var continuation = frame.suspend("test");
            releaseOwner = function () {
              reference.resolve();
              continuation.schedule(page);
            };
            return frame.result();
          },
        );

        var scheduler = adapt_task.currentTask().getScheduler();
        var ownerTask = scheduler.run(function () {
          return view.resolvePostponedReferences();
        });
        var frame = adapt_task.newFrame("testPostponedReferenceWaiter");
        waitUntil(function () {
          return releaseOwner !== null;
        }).then(function (ready) {
          if (!ready) {
            done();
            return;
          }
          var waiterFinished = false;
          var waiterTask = scheduler.run(function () {
            return view.resolvePostponedReferences().thenAsync(function () {
              waiterFinished = true;
              return adapt_task.newResult(true);
            });
          });
          waitUntil(function () {
            return view.postponedReferenceResolutionWaiters.length === 1;
          }).then(function (ready) {
            if (!ready) {
              done();
              return;
            }
            expect(waiterFinished).toBe(false);
            releaseOwner();
            ownerTask.join().then(function () {
              waiterTask.join().then(function () {
                expect(waiterFinished).toBe(true);
                expect(view.resolvingPostponedReferences).toBe(false);
                expect(view.postponedReferenceResolutionTask).toBe(null);
                frame.finish(true);
                done();
              });
            });
          });
        });
        return frame.result();
      });
    });

    it("waits for a pending page being rendered by another task", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var page = {};
        var viewItem = {
          complete: false,
          layoutPositions: [{ page: 0 }, { page: 1 }],
          pages: [{}],
        };
        spyOn(view, "waitForPreviousSpines").and.returnValue(
          adapt_task.newResult(true),
        );
        spyOn(view, "getPageViewItem").and.returnValue(
          adapt_task.newResult(viewItem),
        );
        spyOn(view, "renderPage").and.callThrough();
        var scheduler = adapt_task.currentTask().getScheduler();
        var releaseBackgroundRender = null;
        var backgroundTask = scheduler.run(function () {
          var frame = adapt_task.newFrame("backgroundRender");
          view.beginRenderingPage(adapt_task.currentTask());
          var blockedFrame = adapt_task.newFrame("blocked");
          var continuation = blockedFrame.suspend("test");
          releaseBackgroundRender = function () {
            continuation.schedule(true);
          };
          blockedFrame.result().then(function () {
            viewItem.pages[1] = page;
            view.endRenderingPage(adapt_task.currentTask());
            frame.finish(true);
          });
          return frame.result();
        });
        var testFrame = adapt_task.newFrame("testPendingPageWait");
        waitUntil(function () {
          return releaseBackgroundRender !== null;
        }).then(function (ready) {
          if (!ready) {
            done();
            return;
          }
          view
            .findPage({ spineIndex: 0, pageIndex: 1, offsetInItem: -1 }, false)
            .then(function (result) {
              expect(result.page).toBe(page);
              expect(view.renderPage).not.toHaveBeenCalled();
              backgroundTask.join().then(function () {
                testFrame.finish(true);
                done();
              });
            });
          releaseBackgroundRender();
        });
        return testFrame.result();
      });
    });

    it("rerenders existing pages in later spines up to the given spine", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = {
          item: { spineIndex: 0 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
        };
        var laterViewItem = {
          item: { spineIndex: 1 },
          pages: [{}, {}],
          pageCounterStarts: [],
          pageCounterEnds: [],
          layoutPositions: [null, { page: 1 }],
          complete: false,
          instance: createPageNumberInstance(1),
        };
        var resetViewItem = {
          item: { spineIndex: 2 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
          layoutPositions: [null],
          complete: false,
          instance: createPageNumberInstance(2),
        };
        Object.assign(view.opf, {
          spine: [{ startPage: null }, { startPage: null }, { startPage: 10 }],
        });
        view.spineItems = [changedViewItem, laterViewItem, resetViewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
        });
        spyOn(view, "renderSinglePage").and.returnValue(
          adapt_task.newResult({}),
        );

        var testFrame = adapt_task.newFrame(
          "testRerenderFollowingSpinesAfterPageCountChange",
        );
        var rerenderResult = view.rerenderFollowingSpines(changedViewItem, 2);
        rerenderResult.then(function () {
          expect(view.renderSinglePage.calls.count()).toBe(2);
          expect(view.renderSinglePage).toHaveBeenCalledWith(
            laterViewItem,
            null,
          );
          expect(view.renderSinglePage).toHaveBeenCalledWith(laterViewItem, {
            page: 1,
          });
          expect(
            view.renderSinglePage.calls.allArgs().some(function (args) {
              return args[0] === resetViewItem;
            }),
          ).toBe(false);
          testFrame.finish(true);
          done();
        });
        return testFrame.result();
      });
    });

    it("rebuilds page counter starts while preserving startPage precedence", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = {
          item: {
            spineIndex: 0,
            startPage: null,
            skipPagesBefore: null,
          },
          pages: [{}],
          pageCounterEnds: [{ page: [2], chapter: [2] }],
          pageCounterStarts: [],
        };
        var laterViewItem = {
          item: {
            spineIndex: 1,
            startPage: null,
            skipPagesBefore: null,
          },
          pages: [{}, {}],
          layoutPositions: [null, { page: 1 }],
          pageCounterStarts: [{ page: [3], chapter: [3] }],
          pageCounterEnds: [{ page: [4], chapter: [4] }],
          complete: false,
          instance: createPageNumberInstance(2),
        };
        var resetViewItem = {
          item: {
            spineIndex: 2,
            startPage: 10,
            skipPagesBefore: 2,
          },
          pages: [{}],
          layoutPositions: [null],
          pageCounterStarts: [{ page: [9], chapter: [4] }],
          pageCounterEnds: [{ page: [10], chapter: [5] }],
          complete: false,
          instance: createPageNumberInstance(9),
        };
        view.spineItems = [changedViewItem, laterViewItem, resetViewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
        });
        var laterRenders = 0;
        var firstStart = null;
        spyOn(view, "adjustFollowingSpinesForPageCountChange");
        spyOn(view, "renderSinglePage").and.callFake(function (viewItem) {
          if (viewItem === laterViewItem) {
            laterRenders++;
            if (laterRenders === 1) {
              expect(viewItem.pageCounterStarts).toEqual([
                view.counterStore.currentPageCounters,
              ]);
              expect(view.counterStore.currentPageCounters).toEqual({
                page: [2],
                chapter: [2],
              });
              firstStart = { page: [2], chapter: [2] };
              viewItem.pageCounterStarts[0] = firstStart;
              viewItem.pageCounterEnds[0] = { page: [3], chapter: [3] };
              view.counterStore.currentPageCounters = {
                page: [3],
                chapter: [3],
              };
            } else {
              expect(viewItem.pageCounterStarts[0]).toBe(firstStart);
              expect(view.counterStore.currentPageCounters).toEqual({
                page: [3],
                chapter: [3],
              });
              viewItem.pageCounterEnds[1] = { page: [4], chapter: [3] };
              view.counterStore.currentPageCounters = {
                page: [4],
                chapter: [3],
              };
            }
          } else {
            expect(viewItem.pageCounterStarts).toEqual([
              view.counterStore.currentPageCounters,
            ]);
            expect(view.counterStore.currentPageCounters).toEqual({
              page: [9],
              chapter: [3],
            });
            viewItem.pageCounterStarts[0] = { page: [9], chapter: [3] };
            viewItem.pageCounterEnds[0] = { page: [10], chapter: [4] };
          }
          return adapt_task.newResult({});
        });

        view
          .rerenderFollowingSpines(changedViewItem, Infinity)
          .then(function () {
            expect(view.renderSinglePage.calls.count()).toBe(3);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("rebuilds custom counters from the nearest rendered preceding spine", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = {
          item: { spineIndex: 0 },
          pages: [{}],
          pageCounterEnds: [{ page: [2], chapter: [2] }],
          pageCounterStarts: [],
        };
        var laterViewItem = {
          item: {
            spineIndex: 2,
            startPage: null,
            skipPagesBefore: null,
          },
          pages: [{}],
          layoutPositions: [null],
          pageCounterStarts: [{ page: [4], chapter: [3] }],
          pageCounterEnds: [{ page: [5], chapter: [4] }],
          complete: false,
          instance: createPageNumberInstance(3),
        };
        view.spineItems = [changedViewItem, null, laterViewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
        });
        spyOn(view, "adjustFollowingSpinesForPageCountChange");
        spyOn(view, "renderSinglePage").and.callFake(function (viewItem) {
          expect(viewItem.pageCounterStarts).toEqual([
            view.counterStore.currentPageCounters,
          ]);
          expect(view.counterStore.currentPageCounters).toEqual({
            page: [4],
            chapter: [2],
          });
          viewItem.pageCounterStarts[0] = { page: [4], chapter: [2] };
          viewItem.pageCounterEnds[0] = { page: [5], chapter: [3] };
          return adapt_task.newResult({});
        });

        view
          .rerenderFollowingSpines(changedViewItem, Infinity)
          .then(function () {
            expect(view.renderSinglePage.calls.count()).toBe(1);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("restores the current spine counters after rerendering later spines", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var countersBeforeRerender = { page: [10], chapter: [20] };
        var changedViewItem = {
          item: { spineIndex: 0 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [{ page: [1], chapter: [2] }],
          instance: createPageNumberInstance(0),
        };
        var laterViewItem = {
          item: {
            spineIndex: 1,
            startPage: null,
            skipPagesBefore: null,
          },
          pages: [{}],
          layoutPositions: [null],
          pageCounterStarts: [{ page: [2], chapter: [3] }],
          pageCounterEnds: [{ page: [3], chapter: [4] }],
          complete: false,
          instance: createPageNumberInstance(1),
        };
        view.spineItems = [changedViewItem, laterViewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: countersBeforeRerender,
        });
        view.spineIndexOfCurrentPageCounters = 7;
        spyOn(view, "adjustFollowingSpinesForPageCountChange");
        spyOn(view, "renderSinglePage").and.callFake(function () {
          view.counterStore.currentPageCounters = {
            page: [30],
            chapter: [40],
          };
          return adapt_task.newResult({});
        });

        view
          .rerenderFollowingSpines(changedViewItem, Infinity)
          .then(function () {
            expect(view.renderSinglePage).toHaveBeenCalled();
            expect(view.counterStore.currentPageCounters).toEqual(
              countersBeforeRerender,
            );
            expect(view.counterStore.currentPageCounters).not.toBe(
              countersBeforeRerender,
            );
            expect(view.spineIndexOfCurrentPageCounters).toBe(7);
            expect(view.followingSpineRerenderDepth).toBe(0);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("marks an incomplete later spine complete when rerendering reaches its end", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = {
          item: { spineIndex: 0 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
          instance: createPageNumberInstance(0),
        };
        var laterViewItem = {
          item: { spineIndex: 1 },
          pages: [{}, {}],
          pageCounterStarts: [],
          pageCounterEnds: [],
          layoutPositions: [{ page: 0 }, { page: 1 }],
          complete: false,
          instance: createPageNumberInstance(1),
        };
        view.spineItems = [changedViewItem, laterViewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
        });
        spyOn(view, "adjustFollowingSpinesForPageCountChange");
        spyOn(view, "renderSinglePage").and.callFake(function (viewItem) {
          viewItem.pages.splice(1);
          viewItem.layoutPositions.splice(1);
          return adapt_task.newResult({});
        });

        laterViewItem.instance.viewport.layoutBox.setAttribute(
          "style",
          "width: 1px",
        );
        view
          .rerenderFollowingSpines(changedViewItem, Infinity)
          .then(function () {
            expect(laterViewItem.complete).toBe(true);
            expect(
              laterViewItem.instance.viewport.layoutBox.getAttribute("style"),
            ).toBe(null);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("restores the rerender depth when rerendering a following spine fails", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = {
          item: { spineIndex: 0 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
          instance: createPageNumberInstance(0),
        };
        var laterViewItem = {
          item: { spineIndex: 1 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
          layoutPositions: [{ page: 0 }],
          complete: false,
          instance: createPageNumberInstance(1),
        };
        view.spineItems = [changedViewItem, laterViewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
        });
        var error = new Error("rerender failed");
        spyOn(view, "renderSinglePage").and.callFake(function () {
          expect(view.followingSpineRerenderDepth).toBe(1);
          throw error;
        });

        return adapt_task.handle(
          "testRerenderFailureCleanup",
          function (frame) {
            view
              .rerenderFollowingSpines(changedViewItem, Infinity)
              .then(function () {
                fail("the rerender should have failed");
                frame.finish(false);
              });
          },
          function (frame, caughtError) {
            expect(caughtError).toBe(error);
            expect(view.followingSpineRerenderDepth).toBe(0);
            frame.finish(true);
            done();
          },
        );
      });
    });

    it("carries an unresolved host page into the next pass", function (done) {
      var store = createCounterStore();
      var view = createOPFView();
      var reference = new adapt_counters.TargetCounterReference(
        "target",
        false,
      );
      reference.spineIndex = 0;
      reference.pageIndex = 1;
      store.unresolvedReferences.target = [reference];
      store.pageIndicesById.target = { spineIndex: 0, pageIndex: 0 };
      store.pageCountersById.target = { page: [1] };
      var page = { elementsById: { target: [] } };
      var viewItem = { item: { spineIndex: 0 }, pages: [page] };
      view.counterStore = store;
      view.spineItems = [viewItem];
      view.maxTargetReferenceLayoutPasses = 3;
      view.postponeTargetHostPage(viewItem, 0, null);
      var passCalls = 0;
      spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
        function (viewItem, page) {
          failOnRunaway(view.resolveUnresolvedReferencesForPage);
          passCalls++;
          if (passCalls === 2) {
            reference.resolve();
            store.unresolvedReferences.target = [];
            store.resolvedReferences.target = [reference];
          }
          return adapt_task.newResult(page);
        },
      );
      spyOn(adapt_logging.logger, "warn");

      adapt_task.start(function () {
        view.resolvePostponedReferences().then(function () {
          expect(view.resolveUnresolvedReferencesForPage.calls.count()).toBe(2);
          expect(adapt_logging.logger.warn).not.toHaveBeenCalled();
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("restores the host page counters after a cross-spine resolution succeeds", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        store.unresolvedReferences.target = [reference];
        store.currentPageCounters = { page: [9] };
        var sourcePage = {
          elementsById: {},
          container: { parentElement: {}, setAttribute: function () {} },
          spineIndex: 0,
        };
        var hostPage = {
          elementsById: { target: [] },
          container: { parentElement: {}, setAttribute: function () {} },
          spineIndex: 1,
        };
        var instance = {
          styler: { cascade: {} },
          pageManager: { pageCascadeInstance: {} },
          pageGroupPageCounts: {},
          currentPageGroupDocument: document,
          scopes: {},
          viewport: { layoutBox: document.createElement("div") },
          hasActiveRootPageFloatLayoutContext: function () {
            return false;
          },
          beginIsolatedRootPageFloatLayoutContext: function () {
            return {};
          },
          endIsolatedRootPageFloatLayoutContext: function () {},
          preparePageGroupPageIndicesForRerender: function () {},
        };
        var sourceViewItem = {
          item: { spineIndex: 0 },
          instance: instance,
          pages: [sourcePage],
          layoutPositions: [{ page: 0 }, { page: 1 }],
          pageCounterStarts: [{ page: [1] }],
          pageCounterEnds: [{ page: [2] }],
          complete: true,
        };
        var hostViewItem = {
          item: { spineIndex: 1 },
          instance: instance,
          pages: [hostPage],
          layoutPositions: [null],
          pageCounterStarts: [{ page: [9] }],
          pageCounterEnds: [{ page: [10] }],
          complete: true,
        };
        Object.assign(view.opf, {
          spine: [
            { startPage: null },
            { startPage: null },
            { startPage: null },
          ],
        });
        view.spineItems = [sourceViewItem, hostViewItem, null];
        view.counterStore = store;
        view.spineIndexOfCurrentPageCounters = 1;
        spyOn(view, "resolvePostponedReferences").and.returnValue(
          adapt_task.newResult(true),
        );
        spyOn(view, "drainPostponedWork").and.returnValue(
          adapt_task.newResult(true),
        );
        spyOn(view, "getPageViewItem").and.callFake(function () {
          return adapt_task.newResult(sourceViewItem);
        });
        spyOn(view, "renderSinglePage").and.callFake(function () {
          view.spineIndexOfCurrentPageCounters = 0;
          store.currentPageCounters = { page: [2] };
          reference.resolve();
          store.unresolvedReferences.target = [];
          store.resolvedReferences.target = [reference];
          return adapt_task.newResult({
            pageAndPosition: {
              page: sourcePage,
              position: { spineIndex: 0, pageIndex: 0 },
            },
            nextLayoutPosition: { page: 1 },
          });
        });
        spyOn(view, "materializePendingPages").and.callFake(function () {
          view.spineIndexOfCurrentPageCounters = 0;
          store.currentPageCounters = { page: [7] };
          return adapt_task.newResult(true);
        });

        view
          .resolveUnresolvedReferencesForPage(hostViewItem, hostPage, 0, null)
          .then(function () {
            expect(store.currentPageCounters).toEqual({ page: [9] });
            expect(view.spineIndexOfCurrentPageCounters).toBe(1);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("does not start a nested resolution while one is running", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        store.unresolvedReferences.target = [reference];
        var page = {
          elementsById: { target: [] },
          container: { parentElement: {}, setAttribute: function () {} },
          spineIndex: 0,
        };
        var instance = {
          styler: { cascade: {} },
          pageManager: { pageCascadeInstance: {} },
          pageGroupPageCounts: {},
          currentPageGroupDocument: document,
          scopes: {},
          viewport: { layoutBox: document.createElement("div") },
          hasActiveRootPageFloatLayoutContext: function () {
            return false;
          },
          beginIsolatedRootPageFloatLayoutContext: function () {
            return {};
          },
          endIsolatedRootPageFloatLayoutContext: function () {},
          preparePageGroupPageIndicesForRerender: function () {},
        };
        var viewItem = {
          item: { spineIndex: 0 },
          instance: instance,
          pages: [page],
          layoutPositions: [{ page: 0 }, { page: 1 }],
          complete: true,
        };
        Object.assign(view.opf, { spine: [{ startPage: null }] });
        view.spineItems = [viewItem];
        view.counterStore = store;
        view.resolvingPostponedReferences = true;
        spyOn(view, "drainPostponedWork").and.returnValue(
          adapt_task.newResult(true),
        );
        spyOn(view, "getPageViewItem").and.callFake(function () {
          return adapt_task.newResult(viewItem);
        });
        spyOn(view, "materializePendingPages").and.returnValue(
          adapt_task.newResult(true),
        );
        spyOn(view, "resolvePostponedReferences");
        spyOn(view, "renderSinglePage").and.callFake(function () {
          reference.resolve();
          store.unresolvedReferences.target = [];
          store.resolvedReferences.target = [reference];
          return adapt_task.newResult({
            pageAndPosition: {
              page: page,
              position: { spineIndex: 0, pageIndex: 0 },
            },
            nextLayoutPosition: { page: 1 },
          });
        });

        view
          .resolveUnresolvedReferencesForPage(viewItem, page, 0, null)
          .then(function (result) {
            expect(result).toBe(page);
            expect(view.resolvePostponedReferences).not.toHaveBeenCalled();
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("stops rerendering a later spine at its shrunk page count", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = {
          item: { spineIndex: 0 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
          instance: createPageNumberInstance(0),
        };
        var laterViewItem = {
          item: { spineIndex: 1 },
          pages: [{}, {}],
          pageCounterStarts: [],
          pageCounterEnds: [],
          layoutPositions: [{ page: 0 }, { page: 1 }],
          complete: false,
          instance: createPageNumberInstance(1),
        };
        view.spineItems = [changedViewItem, laterViewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
        });
        spyOn(view, "adjustFollowingSpinesForPageCountChange");
        spyOn(view, "renderSinglePage").and.callFake(function (viewItem) {
          viewItem.pages.splice(1);
          return adapt_task.newResult({});
        });

        view
          .rerenderFollowingSpines(changedViewItem, Infinity)
          .then(function () {
            expect(view.renderSinglePage.calls.count()).toBe(1);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("rebuilds following counter state after a skipped spine completes", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var completedViewItem = {
          item: { spineIndex: 1, startPage: null, skipPagesBefore: null },
          complete: true,
          pages: [{}, {}],
          pageCounterStarts: [{ page: [2] }, { page: [3] }],
          pageCounterEnds: [{ page: [3] }, { page: [4] }],
          instance: createPageNumberInstance(2),
        };
        var estimatedViewItem = {
          item: { spineIndex: 2, startPage: null, skipPagesBefore: null },
          complete: true,
          pages: [{}],
          layoutPositions: [null],
          pageCounterStarts: [{ page: [9] }],
          pageCounterEnds: [{ page: [10] }],
          instance: createPageNumberInstance(9),
        };
        Object.assign(view.opf, {
          spine: [
            { startPage: null },
            { startPage: null },
            { startPage: null },
          ],
        });
        view.spineItems = [null, completedViewItem, estimatedViewItem];
        view.spineItemsWithEstimatedPageNumberOffset = new WeakSet([
          estimatedViewItem,
        ]);
        view.counterStore = createCounterStoreStub({
          currentPageCounters: { page: [10] },
        });
        spyOn(view, "renderSinglePage").and.returnValue(
          adapt_task.newResult({}),
        );

        view
          .rerenderFollowingSpinesAfterLoadingGap(completedViewItem)
          .then(function () {
            expect(view.renderSinglePage.calls.allArgs()).toEqual([
              [estimatedViewItem, null],
            ]);
            expect(estimatedViewItem.instance.pageNumberOffset).toBe(4);
            expect(estimatedViewItem.pageCounterStarts[0]).toEqual({
              page: [4],
            });
            expect(
              view.spineItemsWithEstimatedPageNumberOffset.has(
                estimatedViewItem,
              ),
            ).toBe(false);
            expect(view.pendingFollowingSpineRerenders.size).toBe(0);
            view
              .rerenderFollowingSpinesAfterLoadingGap(completedViewItem)
              .then(function () {
                expect(view.renderSinglePage.calls.count()).toBe(1);
                done();
              });
          });
        return adapt_task.newResult(true);
      });
    });

    it("resets the rendering state together with the rendered pages", function () {
      var view = createOPFView();
      var viewItem = {
        item: { spineIndex: 0 },
        pages: [{}, {}],
        layoutPositions: [null, { page: 1 }, { page: 2 }],
        pageCounterStarts: [{}, {}],
        pageCounterEnds: [{}, {}],
        complete: true,
      };
      Object.assign(view.opf, { spine: [{ startPage: null }] });
      view.spineItems = [viewItem];
      view.updateRenderedPageCount(0, 2);
      view.postponedTargetHostPages = [
        { viewItem: viewItem, pageIndex: 0, nextLayoutPosition: null },
      ];
      view.pendingFollowingSpineRerenders.set(viewItem, false);
      view.spineIndexOfCurrentPageCounters = 0;
      view.spineItemsWithEstimatedPageNumberOffset.add(viewItem);
      spyOn(view.viewport, "clear");
      expect(view.getRenderedPageCountBeforeSpine(1)).toBe(2);

      view.removeRenderedPages();

      expect(viewItem.pages).toEqual([]);
      expect(viewItem.layoutPositions).toEqual([null]);
      expect(viewItem.pageCounterStarts).toEqual([]);
      expect(viewItem.pageCounterEnds).toEqual([]);
      expect(viewItem.complete).toBe(false);
      expect(view.spineItemsWithEstimatedPageNumberOffset.has(viewItem)).toBe(
        false,
      );
      expect(view.getRenderedPageCountBeforeSpine(1)).toBe(0);
      expect(view.postponedTargetHostPages).toEqual([]);
      expect(view.pendingFollowingSpineRerenders.size).toBe(0);
      expect(view.spineIndexOfCurrentPageCounters).toBe(-1);
      expect(view.viewport.clear).toHaveBeenCalled();
    });

    it("rebuilds page-number offsets from the preceding rendered spine", function () {
      var view = createOPFView();
      var previousViewItem = {
        item: { spineIndex: 0 },
        pages: [{}, {}],
        pageCounterStarts: [],
        pageCounterEnds: [],
        complete: true,
        instance: createPageNumberInstance(0),
      };
      var viewItem = {
        item: {
          spineIndex: 1,
          startPage: null,
          skipPagesBefore: null,
        },
        instance: createPageNumberInstance(3),
      };
      view.spineItems = [previousViewItem, viewItem];

      view.rebuildPageNumberOffset(viewItem);

      expect(viewItem.instance.pageNumberOffset).toBe(2);

      viewItem.item.skipPagesBefore = 4;
      view.rebuildPageNumberOffset(viewItem);

      expect(viewItem.instance.pageNumberOffset).toBe(6);

      viewItem.item.startPage = 10;
      view.rebuildPageNumberOffset(viewItem);

      expect(viewItem.instance.pageNumberOffset).toBe(9);
    });

    it("restores page counters from a preceding spine only when it provides them", function () {
      var view = createOPFView();
      var previousCounters = { page: [3], chapter: [7] };
      view.counterStore = createCounterStoreStub({
        currentPageCounters: { page: [20], chapter: [30] },
      });
      var previousViewItem = {
        item: { spineIndex: 4 },
        complete: true,
        pages: [{}],
        pageCounterEnds: [previousCounters],
        pageCounterStarts: [],
      };

      view.restorePageCounterStateFromPreviousSpine(previousViewItem);

      expect(view.counterStore.currentPageCounters).toEqual(previousCounters);
      expect(view.counterStore.currentPageCounters).not.toBe(previousCounters);
      expect(view.spineIndexOfCurrentPageCounters).toBe(4);

      view.spineIndexOfCurrentPageCounters = -1;
      view.restorePageCounterStateFromPreviousSpine({
        item: { spineIndex: 5 },
        complete: false,
        pages: [{}],
        pageCounterEnds: [{ page: [9] }],
      });
      expect(view.counterStore.currentPageCounters).toEqual(previousCounters);
      expect(view.spineIndexOfCurrentPageCounters).toBe(-1);
      view.restorePageCounterStateFromPreviousSpine(null);
      expect(view.counterStore.currentPageCounters).toEqual(previousCounters);
    });

    it("rerenders every added page and restores completion for a complete spine", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = {
          item: { spineIndex: 0 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
        };
        var layoutBox = {
          removeAttribute: jasmine.createSpy("removeAttribute"),
        };
        var laterViewItem = {
          item: { spineIndex: 1, startPage: null, skipPagesBefore: null },
          pages: [{}, {}],
          pageCounterStarts: [],
          pageCounterEnds: [],
          layoutPositions: [{ page: 0 }, { page: 1 }],
          complete: true,
          instance: { viewport: { layoutBox: layoutBox } },
        };
        Object.assign(view.opf, {
          spine: [{ startPage: null }, { startPage: null }],
        });
        view.spineItems = [changedViewItem, laterViewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
        });
        spyOn(view, "adjustFollowingSpinesForPageCountChange");
        spyOn(view, "renderSinglePage").and.callFake(
          function (viewItem, position) {
            viewItem.complete = false;
            if (position.page === 1) {
              viewItem.pages.push({});
              viewItem.layoutPositions.push({ page: 2 }, { page: 3 });
            } else if (position.page === 3) {
              viewItem.pages.push({});
            }
            return adapt_task.newResult({});
          },
        );

        var testFrame = adapt_task.newFrame(
          "testRerenderAddedFollowingSpinePages",
        );
        view
          .rerenderFollowingSpines(changedViewItem, Infinity)
          .then(function () {
            expect(view.renderSinglePage.calls.count()).toBe(3);
            expect(
              view.adjustFollowingSpinesForPageCountChange,
            ).toHaveBeenCalledWith(laterViewItem, 2, null, -1);
            expect(laterViewItem.complete).toBe(true);
            expect(layoutBox.removeAttribute).toHaveBeenCalledWith("style");
            testFrame.finish(true);
            done();
          });
        return testFrame.result();
      });
    });

    it("does not apply a nested page-count adjustment twice", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = {
          item: { spineIndex: 0 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
        };
        var middleViewItem = {
          item: { spineIndex: 1, startPage: null, skipPagesBefore: 4 },
          pages: [{}, {}],
          layoutPositions: [{ page: 0 }, { page: 1 }],
          pageCounterStarts: [{ page: [5] }, { page: [6] }],
          pageCounterEnds: [],
          complete: false,
          instance: createPageNumberInstance(5),
        };
        var laterViewItem = {
          item: { spineIndex: 2, startPage: null, skipPagesBefore: 3 },
          pages: [{}],
          layoutPositions: [{ page: 0 }],
          pageCounterStarts: [{ page: [10] }],
          pageCounterEnds: [],
          complete: false,
          instance: createPageNumberInstance(10),
        };
        Object.assign(view.opf, {
          epageIsRenderedPage: false,
          spine: [
            { startPage: null },
            { startPage: null },
            { startPage: null },
          ],
        });
        view.spineItems = [changedViewItem, middleViewItem, laterViewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
          pageCountersBeforeOverride: {},
          adjustPageCountersOfLaterSpines: jasmine
            .createSpy("adjustPageCountersOfLaterSpines")
            .and.returnValue([]),
          updatePageCounterNodesInPages: jasmine.createSpy(
            "updatePageCounterNodesInPages",
          ),
        });
        var middleAdjusted = false;
        spyOn(view, "renderSinglePage").and.callFake(function (viewItem) {
          if (viewItem === middleViewItem && !middleAdjusted) {
            middleAdjusted = true;
            middleViewItem.pages.pop();
            middleViewItem.layoutPositions.pop();
            view.adjustFollowingSpinesForPageCountChange(
              middleViewItem,
              -1,
              null,
              1,
            );
          }
          return adapt_task.newResult({});
        });

        var testFrame = adapt_task.newFrame(
          "testNestedFollowingSpinePageCountAdjustment",
        );
        view
          .rerenderFollowingSpines(changedViewItem, Infinity)
          .then(function () {
            expect(laterViewItem.pageCounterStarts[0].page).toEqual([9]);
            testFrame.finish(true);
            done();
          });
        return testFrame.result();
      });
    });

    it("accounts for nested changes to a later rerender entry", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = {
          item: { spineIndex: 0 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
        };
        var firstRerenderViewItem = {
          item: { spineIndex: 1, startPage: null, skipPagesBefore: 4 },
          pages: [{}],
          layoutPositions: [{ page: 0 }],
          pageCounterStarts: [{ page: [5] }],
          pageCounterEnds: [],
          complete: false,
          instance: createPageNumberInstance(5),
        };
        var futureRerenderViewItem = {
          item: { spineIndex: 2, startPage: null, skipPagesBefore: 1 },
          pages: [{}, {}],
          layoutPositions: [{ page: 0 }, { page: 1 }],
          pageCounterStarts: [{ page: [7] }, { page: [8] }],
          pageCounterEnds: [],
          complete: false,
          instance: createPageNumberInstance(7),
        };
        var lastViewItem = {
          item: { spineIndex: 3, startPage: null, skipPagesBefore: 1 },
          pages: [{}],
          layoutPositions: [{ page: 0 }],
          pageCounterStarts: [{ page: [10, 2] }],
          pageCounterEnds: [],
          complete: false,
          instance: createPageNumberInstance(10),
        };
        Object.assign(view.opf, {
          epageIsRenderedPage: false,
          spine: [
            { startPage: null },
            { startPage: null },
            { startPage: null },
            { startPage: null },
          ],
        });
        view.spineItems = [
          changedViewItem,
          firstRerenderViewItem,
          futureRerenderViewItem,
          lastViewItem,
        ];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
          pageCountersBeforeOverride: { page: [20] },
          adjustPageCountersOfLaterSpines: jasmine
            .createSpy("adjustPageCountersOfLaterSpines")
            .and.returnValue([]),
          updatePageCounterNodesInPages: jasmine.createSpy(
            "updatePageCounterNodesInPages",
          ),
        });
        var nestedCounters = { page: [9] };
        var futureAdjusted = false;
        spyOn(view, "renderSinglePage").and.callFake(function (viewItem) {
          if (viewItem === firstRerenderViewItem && !futureAdjusted) {
            futureAdjusted = true;
            futureRerenderViewItem.pages.pop();
            futureRerenderViewItem.layoutPositions.pop();
            view.adjustFollowingSpinesForPageCountChange(
              futureRerenderViewItem,
              -1,
              nestedCounters,
              3,
            );
          }
          return adapt_task.newResult({});
        });

        var testFrame = adapt_task.newFrame(
          "testFutureFollowingSpinePageCountAdjustment",
        );
        view
          .rerenderFollowingSpines(changedViewItem, Infinity)
          .then(function () {
            expect(lastViewItem.pageCounterStarts[0].page).toEqual([9, 2]);
            expect(nestedCounters.page).toEqual([8]);
            expect(view.counterStore.pageCountersBeforeOverride).toEqual({
              page: [19],
            });
            testFrame.finish(true);
            done();
          });
        return testFrame.result();
      });
    });

    it("includes the retained position when replacing a page", function () {
      var view = createOPFView();
      var contentContainer = document.createElement("div");
      var oldContainer = document.createElement("div");
      var newContainer = document.createElement("div");
      contentContainer.appendChild(oldContainer);
      var oldPage = {
        container: oldContainer,
        dispatchEvent: jasmine.createSpy("dispatchEvent"),
      };
      var newPage = {
        container: newContainer,
        side: "left",
        spineIndex: 0,
      };
      var newPosition = {
        spineIndex: 0,
        pageIndex: 1,
        offsetInItem: 10,
      };
      var viewItem = {
        item: { spineIndex: 0 },
        pages: [{}, oldPage],
        instance: {
          viewport: { contentContainer: contentContainer },
          pageNumberOffset: 0,
          pageSheetWidth: 80,
          pageSheetHeight: 84,
          pageSheetSize: {},
        },
      };
      Object.assign(view.opf, { epageIsRenderedPage: false });
      view.spineItems = [viewItem];
      view.pageSheetSizeReporter = jasmine.createSpy("pageSheetSizeReporter");

      view.finishPageContainer(viewItem, newPage, 1, newPosition);

      expect(oldPage.dispatchEvent).toHaveBeenCalledWith(
        jasmine.objectContaining({
          type: "replaced",
          newPage: newPage,
          newPosition: newPosition,
        }),
      );
      expect(view.pageSheetSizeReporter).toHaveBeenCalledWith(
        { width: 80, height: 84 },
        {},
        0,
        1,
        0,
      );
    });

    it("reports page-size slots in rendered order across page-number resets", function () {
      var view = createOPFView();
      var contentContainer = document.createElement("div");
      var retainedContainer = document.createElement("div");
      var removedContainer = document.createElement("div");
      var resetContainer = document.createElement("div");
      contentContainer.appendChild(retainedContainer);
      contentContainer.appendChild(removedContainer);
      var retainedPage = { container: retainedContainer };
      var removedPage = {
        container: removedContainer,
        dispatchEvent: function () {},
      };
      var firstViewItem = {
        item: { spineIndex: 0 },
        pages: [retainedPage],
        pageCounterStarts: [],
        pageCounterEnds: [],
        instance: { pageNumberOffset: 10 },
      };
      var resetViewItem = {
        item: { spineIndex: 1 },
        pages: [],
        pageCounterStarts: [],
        pageCounterEnds: [],
        instance: {
          viewport: { contentContainer: contentContainer },
          pageNumberOffset: 0,
          pageSheetWidth: 80,
          pageSheetHeight: 84,
          pageSheetSize: {},
        },
      };
      var resetPage = {
        container: resetContainer,
        side: "left",
        spineIndex: 1,
      };
      var retainedPosition = {
        spineIndex: 0,
        pageIndex: 0,
        offsetInItem: 0,
      };
      Object.assign(view.opf, { epageIsRenderedPage: false, spine: [{}, {}] });
      view.spineItems = [firstViewItem, resetViewItem];
      view.updateRenderedPageCount(0, 2);
      view.pageSheetSizeReporter = jasmine.createSpy("pageSheetSizeReporter");

      view.finishPageContainer(resetViewItem, resetPage, 0);
      expect(
        Array.prototype.indexOf.call(contentContainer.children, resetContainer),
      ).toBe(2);
      expect(view.getRenderedPageCountBeforeSpine(2)).toBe(3);
      view.updateRenderedPageCount(0, -1);
      view.removeTruncatedPages(
        firstViewItem,
        [removedPage],
        retainedPage,
        retainedPosition,
      );

      expect(view.pageSheetSizeReporter.calls.argsFor(0)).toEqual([
        { width: 80, height: 84 },
        {},
        1,
        2,
        1,
      ]);
      expect(view.pageSheetSizeReporter.calls.argsFor(1)).toEqual([
        null,
        {},
        0,
        1,
        -1,
      ]);
    });

    it("defers spine completion while a counter scope is still pushed", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var page = { spineIndex: 0, offset: 0, container: {}, fetchers: [] };
        var layoutBox = document.createElement("div");
        layoutBox.setAttribute("style", "width: 1px;");
        var pushPageNumberContext = jasmine.createSpy("pushPageNumberContext");
        var restorePageNumberContextDepth = jasmine.createSpy(
          "restorePageNumberContextDepth",
        );
        var viewItem = {
          layoutPositions: [null],
          pages: [],
          pageCounterStarts: [],
          pageCounterEnds: [],
          instance: {
            getPageNumberContextDepth: function () {
              return 0;
            },
            pushPageNumberContext: pushPageNumberContext,
            restorePageNumberContextDepth: restorePageNumberContextDepth,
            pageNumberOffset: 0,
            viewport: { layoutBox: layoutBox },
            layoutNextPage: function () {
              return adapt_task.newResult(null);
            },
          },
          item: { spineIndex: 0 },
          complete: false,
        };
        view.spineItems = [viewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
        });
        view.pageSheetSizeReporter = jasmine.createSpy("pageSheetSizeReporter");
        view.counterStore.finishPage = jasmine.createSpy("finishPage");
        view.counterStore.pushPageCounters({ page: [4] });
        spyOn(view, "preparePageCountersForRender").and.callFake(function () {
          return null;
        });
        spyOn(view, "makePage").and.callFake(function () {
          return page;
        });
        spyOn(view, "resolvePageTypeForRenderSlot").and.callFake(
          function () {},
        );
        spyOn(view, "finishPageContainer").and.callFake(
          function (item, renderedPage, pageIndex) {
            item.pages[pageIndex] = renderedPage;
          },
        );
        spyOn(view, "collectTotalOffsets").and.callFake(function () {
          return adapt_task.newResult(true);
        });
        spyOn(view, "reportPaginationProgress").and.callFake(function () {});
        spyOn(view, "maybeRelayoutFollowingPage").and.callFake(function () {
          return adapt_task.newResult(true);
        });
        spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
          function (item, renderedPage) {
            return adapt_task.newResult(renderedPage);
          },
        );

        view.renderSinglePage(viewItem, null).then(function () {
          expect(viewItem.pages).toEqual([page]);
          expect(viewItem.complete).toBe(false);
          expect(layoutBox.getAttribute("style")).toBe("width: 1px;");
          expect(pushPageNumberContext).toHaveBeenCalledOnceWith(1);
          expect(restorePageNumberContextDepth).toHaveBeenCalledOnceWith(0);
          expect(viewItem.pageCounterEnds[0]).toEqual({ page: [4] });
          expect(viewItem.pageCounterEnds[0]).not.toBe(
            view.counterStore.currentPageCounters,
          );
          expect(view.counterStore.finishPage).toHaveBeenCalledWith(0, 0);
          expect(view.spineIndexOfCurrentPageCounters).toBe(0);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("removes later page slots when a rerendered page becomes final", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        Object.assign(view.opf, { spine: [{}] });
        var removedContainer = { remove: jasmine.createSpy("remove") };
        var removedPage = {
          container: removedContainer,
          dispatchEvent: jasmine.createSpy("dispatchEvent"),
        };
        var replacementPage = {
          spineIndex: 0,
          offset: 10,
          container: {},
          fetchers: [],
        };
        var viewItem = {
          layoutPositions: [{ page: 0 }, { page: 1 }, { page: 2 }],
          pages: [{ container: {} }, { container: {} }, removedPage],
          pageCounterStarts: [{}, {}, {}],
          pageCounterEnds: [],
          instance: {
            getPageNumberContextDepth: function () {
              return 0;
            },
            pushPageNumberContext: function () {},
            restorePageNumberContextDepth: function () {},
            pageNumberOffset: 0,
            viewport: { layoutBox: document.createElement("div") },
            layoutNextPage: function () {
              return adapt_task.newResult(null);
            },
          },
          item: { spineIndex: 0 },
        };
        view.spineItems = [viewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
          finishPage: function () {},
          removeReferencesFromPages: jasmine.createSpy(
            "removeReferencesFromPages",
          ),
          adjustPageCountersOfLaterSpines: jasmine
            .createSpy("adjustPageCountersOfLaterSpines")
            .and.returnValue([]),
        });
        var retainedResolution = {
          viewItem: viewItem,
          pageIndex: 1,
          nextLayoutPosition: null,
        };
        var removedResolution = {
          viewItem: viewItem,
          pageIndex: 2,
          nextLayoutPosition: null,
        };
        view.postponedTargetHostPages = [retainedResolution, removedResolution];
        view.pageSheetSizeReporter = jasmine.createSpy("pageSheetSizeReporter");
        spyOn(view, "preparePageCountersForRender").and.callFake(function () {
          return viewItem.pages[1];
        });
        spyOn(view, "makePage").and.callFake(function () {
          return replacementPage;
        });
        spyOn(view, "resolvePageTypeForRenderSlot").and.callFake(
          function () {},
        );
        spyOn(view, "finishPageContainer").and.callFake(
          function (item, page, pageIndex) {
            item.pages[pageIndex] = page;
          },
        );
        spyOn(view, "reportPaginationProgress").and.callFake(function () {});
        spyOn(view, "maybeRelayoutFollowingPage").and.callFake(function () {
          return adapt_task.newResult(true);
        });
        spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
          function (item, page) {
            return adapt_task.newResult(page);
          },
        );

        view.renderSinglePage(viewItem, { page: 1 }).then(function (result) {
          expect(viewItem.pages).toEqual([
            jasmine.any(Object),
            replacementPage,
          ]);
          expect(viewItem.layoutPositions.length).toBe(2);
          expect(viewItem.pageCounterStarts.length).toBe(2);
          expect(removedContainer.remove).toHaveBeenCalled();
          expect(removedPage.dispatchEvent).toHaveBeenCalledWith(
            jasmine.objectContaining({
              type: "replaced",
              newPage: replacementPage,
              newPosition: jasmine.objectContaining({ pageIndex: 1 }),
            }),
          );
          expect(view.pageSheetSizeReporter).toHaveBeenCalledWith(
            null,
            {},
            0,
            2,
            -1,
          );
          expect(
            view.counterStore.removeReferencesFromPages,
          ).toHaveBeenCalledWith(0, 2);
          expect(view.postponedTargetHostPages).toEqual([retainedResolution]);
          expect(
            view.counterStore.adjustPageCountersOfLaterSpines,
          ).toHaveBeenCalledWith(0, -1, Infinity, new Set());
          expect(view.pendingFollowingSpineRerenders.get(viewItem)).toBe(false);
          expect(result.pageAndPosition.position.pageIndex).toBe(1);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("returns the retained next position after reference resolution truncates pages", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var oldPage = { container: {} };
        var replacementPage = {
          spineIndex: 0,
          offset: 10,
          container: {},
          fetchers: [],
        };
        var staleNextPosition = { page: 2 };
        var viewItem = {
          layoutPositions: [{ page: 0 }, { page: 1 }, staleNextPosition],
          pages: [{ container: {} }, oldPage, { container: {} }],
          pageCounterStarts: [{}, {}, {}],
          pageCounterEnds: [{}, {}, {}],
          complete: false,
          instance: {
            getPageNumberContextDepth: function () {
              return 0;
            },
            pushPageNumberContext: function () {},
            restorePageNumberContextDepth: function () {},
            layoutNextPage: function () {
              return adapt_task.newResult(staleNextPosition);
            },
          },
          item: { spineIndex: 0 },
        };
        Object.assign(view.opf, { spine: [{}] });
        view.spineItems = [viewItem];
        view.updateRenderedPageCount(0, 3);
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
          finishPage: function () {},
          removeReferencesFromPages: function () {},
        });
        spyOn(view, "preparePageCountersForRender").and.callFake(function () {
          return oldPage;
        });
        spyOn(view, "makePage").and.callFake(function () {
          return replacementPage;
        });
        spyOn(view, "resolvePageTypeForRenderSlot").and.callFake(
          function () {},
        );
        spyOn(view, "finishPageContainer").and.callFake(
          function (item, page, pageIndex) {
            item.pages[pageIndex] = page;
          },
        );
        spyOn(view, "reportPaginationProgress").and.callFake(function () {});
        spyOn(view, "maybeRelayoutFollowingPage").and.callFake(function () {
          return adapt_task.newResult(true);
        });
        spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
          function (item, page) {
            view.truncateViewItemAfterPage(item, 1);
            return adapt_task.newResult(page);
          },
        );

        view.renderSinglePage(viewItem, { page: 1 }).then(function (result) {
          expect(viewItem.layoutPositions.length).toBe(2);
          expect(result.nextLayoutPosition).toBeNull();
          expect(view.getRenderedPageCountBeforeSpine(1)).toBe(2);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("removes page-size slots when discarding a spine item", function () {
      var view = createOPFView();
      var firstPage = { container: document.createElement("div") };
      var discardedContainers = [
        document.createElement("div"),
        document.createElement("div"),
      ];
      var discardedItem = { spineIndex: 1, epage: 1, epageCount: 2 };
      var discardedViewItem = {
        item: discardedItem,
        pages: discardedContainers.map(function (container) {
          document.createElement("div").appendChild(container);
          return { container: container };
        }),
        pageCounterStarts: [],
        pageCounterEnds: [],
      };
      var laterItem = { spineIndex: 2, epage: 3, epageCount: 1 };
      Object.assign(view.opf, {
        spine: [
          { spineIndex: 0, epage: 0, epageCount: 1 },
          discardedItem,
          laterItem,
        ],
        epageIsRenderedPage: true,
      });
      view.spineItems = [
        { item: { spineIndex: 0 }, pages: [firstPage] },
        discardedViewItem,
      ];
      view.updateRenderedPageCount(0, 1);
      view.updateRenderedPageCount(1, 2);
      view.spineItemLoadingContinuations = [null, []];
      view.pendingFollowingSpineRerenders.set(discardedViewItem, false);
      view.spineIndexOfCurrentPageCounters = 1;
      view.postponedTargetHostPages = [
        { viewItem: discardedViewItem, pageIndex: 0, nextLayoutPosition: null },
      ];
      view.pageSheetSizeReporter = jasmine.createSpy("pageSheetSizeReporter");
      view.counterStore = createCounterStoreStub({
        removeReferencesFromPages: jasmine.createSpy(
          "removeReferencesFromPages",
        ),
        discardTargetSnapshotsOfSpine: jasmine.createSpy(
          "discardTargetSnapshotsOfSpine",
        ),
      });

      expect(view.getRenderedPageCountBeforeSpine(2)).toBe(3);

      view.discardSpineItem(1);

      expect(view.getRenderedPageCountBeforeSpine(2)).toBe(1);
      expect(view.pageSheetSizeReporter).toHaveBeenCalledWith(
        null,
        {},
        1,
        1,
        -2,
      );
      expect(view.counterStore.removeReferencesFromPages).toHaveBeenCalledWith(
        1,
        0,
      );
      expect(
        view.counterStore.discardTargetSnapshotsOfSpine,
      ).toHaveBeenCalledWith(1);
      expect(
        discardedContainers.every(function (container) {
          return !container.parentElement;
        }),
      ).toBe(true);
      expect(view.postponedTargetHostPages).toEqual([]);
      expect(view.spineItems[1]).toBeNull();
      expect(view.spineItemLoadingContinuations[1]).toBeNull();
      expect(view.pendingFollowingSpineRerenders.has(discardedViewItem)).toBe(
        false,
      );
      expect(view.spineIndexOfCurrentPageCounters).toBe(-1);
      expect(discardedItem.epageCount).toBe(0);
      expect(laterItem.epage).toBe(3);
      expect(view.opf.epageCount).toBe(2);
    });

    it("gives the document anchor to the first content page rather than a leading blank page", function () {
      var view = createOPFView();
      var viewport = {
        document: document,
        layoutBox: document.createElement("div"),
        width: 100,
        height: 100,
      };
      var instance = {
        viewport: viewport,
        blankPageAtStart: true,
        getPosition: function () {
          return 0;
        },
      };
      var viewItem = {
        item: { spineIndex: 0, src: "chapter.html" },
        instance: instance,
        pages: [{}],
      };
      view.viewport = viewport;
      Object.assign(view.opf, {
        documentURLTransformer: {
          transformFragment: function () {
            return "chapter";
          },
        },
      });
      function anchorOf(page) {
        return page.container
          .querySelector("[data-vivliostyle-bleed-box]")
          .getAttribute("id");
      }

      expect(anchorOf(view.makePage(viewItem, null, 0))).toBeNull();
      var contentPage = view.makePage(viewItem, { page: 1 }, 1);
      expect(anchorOf(contentPage)).toBe("chapter");
      expect(contentPage.elementsById.chapter.length).toBe(1);
      instance.blankPageAtStart = false;
      expect(anchorOf(view.makePage(viewItem, null, 0))).toBe("chapter");
    });

    it("finds no page in a spine that cannot be loaded", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        Object.assign(view.opf, { spine: [{}] });
        spyOn(view, "getPageViewItem").and.returnValue(
          adapt_task.newResult(null),
        );

        view
          .findPage({ spineIndex: 0, pageIndex: 0, offsetInItem: -1 }, true)
          .then(function (result) {
            expect(result).toBeNull();
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("lays out a pending page slot itself", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var page = {};
        var viewItem = {
          item: { spineIndex: 0 },
          complete: false,
          pages: [{}],
          layoutPositions: [null, { page: 1 }],
        };
        Object.assign(view.opf, { spine: [{}] });
        view.spineItems = [viewItem];
        spyOn(view, "getPageViewItem").and.returnValue(
          adapt_task.newResult(viewItem),
        );
        spyOn(view, "renderPage").and.callFake(function () {
          viewItem.pages[1] = page;
          return adapt_task.newResult({
            page: page,
            position: { spineIndex: 0, pageIndex: 1, offsetInItem: -1 },
          });
        });

        view
          .findPage({ spineIndex: 0, pageIndex: 1, offsetInItem: -1 }, false)
          .then(function (result) {
            expect(result.page).toBe(page);
            expect(view.renderPage).toHaveBeenCalled();
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("looks a rendered page up without waiting for preceding spines", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var page = {};
        Object.assign(view.opf, { spine: [{}, {}] });
        view.spineItems = [
          {
            item: { spineIndex: 0 },
            complete: false,
            pages: [{}],
            layoutPositions: [null, { page: 1 }],
          },
          {
            item: { spineIndex: 1 },
            complete: true,
            pages: [page],
            layoutPositions: [null],
          },
        ];
        spyOn(view, "waitForPreviousSpines").and.callThrough();
        spyOn(view, "getPageViewItem").and.callFake(function (spineIndex) {
          return adapt_task.newResult(view.spineItems[spineIndex]);
        });

        view
          .findPage(
            { spineIndex: 1, pageIndex: 0, offsetInItem: -1 },
            false,
            true,
          )
          .then(function (result) {
            expect(result.page).toBe(page);
            expect(view.waitForPreviousSpines).toHaveBeenCalledWith(1, true);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("recomputes following epage ranges when a spine grows", function () {
      var view = Object.create(adapt_epub.OPFView.prototype);
      var precedingItem = { spineIndex: 0, epage: 0, epageCount: 10 };
      var grownItem = { spineIndex: 1, epage: 10, epageCount: 5 };
      var loadedFollowingItem = { spineIndex: 2, epage: 15, epageCount: 3 };
      var unloadedFollowingItem = { spineIndex: 3, epage: 18, epageCount: 4 };
      var epageCountCallback = jasmine.createSpy("epageCountCallback");
      view.opf = {
        epageIsRenderedPage: true,
        spine: [
          precedingItem,
          grownItem,
          loadedFollowingItem,
          unloadedFollowingItem,
        ],
        epageCount: 22,
        epageCountCallback: epageCountCallback,
      };
      // Only the loaded following spine has a view item; the last one is
      // not yet rendered and must still get its epage start recomputed.
      view.spineItems = [
        null,
        { item: grownItem },
        { item: loadedFollowingItem },
        null,
      ];

      view.updateEPageRangesAfterPageCountChange({ item: grownItem }, 7);

      expect(grownItem.epageCount).toBe(7);
      expect(loadedFollowingItem.epage).toBe(17);
      expect(unloadedFollowingItem.epage).toBe(20);
      expect(view.opf.epageCount).toBe(24);
      expect(epageCountCallback).toHaveBeenCalledOnceWith(24);
    });

    it("keeps epage ranges when epage is not the rendered page", function () {
      var view = Object.create(adapt_epub.OPFView.prototype);
      var changedItem = { spineIndex: 0, epage: 0, epageCount: 10 };
      var followingItem = { spineIndex: 1, epage: 10, epageCount: 3 };
      var epageCountCallback = jasmine.createSpy("epageCountCallback");
      view.opf = {
        epageIsRenderedPage: false,
        spine: [changedItem, followingItem],
        epageCount: 13,
        epageCountCallback: epageCountCallback,
      };

      view.updateEPageRangesAfterPageCountChange({ item: changedItem }, 12);

      expect(changedItem.epageCount).toBe(10);
      expect(followingItem.epage).toBe(10);
      expect(view.opf.epageCount).toBe(13);
      expect(epageCountCallback).not.toHaveBeenCalled();
    });

    it("assigns EPUB page ranges from the preceding spine as pages are rendered", function () {
      var view = createOPFView();
      var contentContainer = document.createElement("div");
      var prevItem = { spineIndex: 0, epage: 0, epageCount: 3 };
      var item = { spineIndex: 1, epage: 0, epageCount: 0 };
      var followingItem = { spineIndex: 2, epage: 0, epageCount: 2 };
      var emptyItem = { spineIndex: 3, epage: 0, epageCount: 0 };
      var viewItem = {
        item: item,
        pages: [],
        instance: {
          viewport: { contentContainer: contentContainer },
          pageNumberOffset: 3,
          pageSheetWidth: 80,
          pageSheetHeight: 84,
          pageSheetSize: {},
        },
      };
      var page = {
        container: document.createElement("div"),
        side: "left",
        spineIndex: 1,
      };
      var epageCountCallback = jasmine.createSpy("epageCountCallback");
      Object.assign(view.opf, {
        epageIsRenderedPage: true,
        spine: [prevItem, item, followingItem, emptyItem],
        epageCountCallback: epageCountCallback,
      });
      view.pageSheetSizeReporter = function () {};

      view.finishPageContainer(viewItem, page, 0);

      expect(item.epage).toBe(3);
      expect(item.epageCount).toBe(1);
      expect(followingItem.epage).toBe(4);
      expect(emptyItem.epage).toBe(6);
      expect(view.opf.epageCount).toBe(6);
      expect(epageCountCallback).toHaveBeenCalledWith(6);
    });

    it("returns the rendered page at the final position after all pages are laid out", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var position = { spineIndex: 0, pageIndex: 1, offsetInItem: -1 };
        var stale = {
          page: { container: { parentElement: null }, fetchers: [] },
          position: position,
        };
        var replacement = {
          page: { container: {}, fetchers: [] },
          position: position,
        };
        Object.assign(view.opf, { spine: [{}] });
        spyOn(view, "renderPagesUpto").and.returnValue(
          adapt_task.newResult(stale),
        );
        spyOn(view, "drainPostponedWork").and.returnValue(
          adapt_task.newResult(true),
        );
        spyOn(view, "findPage").and.returnValue(
          adapt_task.newResult(replacement),
        );

        view.renderAllPages().then(function (result) {
          expect(result).toBe(replacement);
          expect(view.findPage).toHaveBeenCalledWith(position, true, true);
          expect(view.drainPostponedWork).toHaveBeenCalled();
          var attached = {
            page: { container: { parentElement: {} }, fetchers: [] },
            position: position,
          };
          view.renderPagesUpto.and.returnValue(adapt_task.newResult(attached));
          view.findPage.calls.reset();
          view.renderAllPages().then(function (again) {
            expect(again).toBe(attached);
            expect(view.findPage).not.toHaveBeenCalled();
            done();
          });
        });
        return adapt_task.newResult(true);
      });
    });

    it("tracks rendered page indices from the counts of preceding spines", function () {
      var view = createOPFView();
      Object.assign(view.opf, { spine: [{}, {}, {}, {}] });
      view.updateRenderedPageCount(0, 3);
      view.updateRenderedPageCount(1, 2);
      view.updateRenderedPageCount(3, 4);

      expect(view.getRenderedPageIndex({ item: { spineIndex: 3 } }, 2)).toBe(7);
      expect(view.getRenderedPageCount()).toBe(9);
    });

    it("resolves a postponed target host page once its references settle", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var page = { elementsById: { target: [] } };
        var viewItem = { item: { spineIndex: 0 }, pages: [page] };
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        view.counterStore = createCounterStoreStub({
          unresolvedReferences: { target: [reference] },
        });
        view.postponeTargetHostPage(viewItem, 0, null);
        spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
          function () {
            reference.resolve();
            return adapt_task.newResult(page);
          },
        );

        view.resolvePostponedReferences().then(function () {
          expect(view.resolveUnresolvedReferencesForPage).toHaveBeenCalledWith(
            viewItem,
            page,
            0,
            null,
          );
          expect(view.postponedTargetHostPages).toEqual([]);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("rerenders spines past a page-number reset when custom page counters exist", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = { item: { spineIndex: 0 } };
        Object.assign(view.opf, {
          spine: [{ startPage: null }, { startPage: null }, { startPage: 10 }],
        });
        view.counterStore.setPageControlledCounterNames(["chapter-page"]);
        spyOn(view, "rerenderFollowingSpines").and.returnValue(
          adapt_task.newResult(true),
        );

        view.scheduleFollowingSpineRerender(changedViewItem, 1);

        view.resolvePostponedReferences().then(function () {
          expect(view.rerenderFollowingSpines.calls.allArgs()).toEqual([
            [changedViewItem, Infinity],
          ]);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("postpones reference resolution while the rerender depth is raised", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        var container = document.createElement("div");
        document.createElement("div").appendChild(container);
        var page = {
          container: container,
          spineIndex: 0,
          elementsById: { target: [] },
        };
        var viewItem = {
          item: { spineIndex: 0 },
          pages: [page],
          layoutPositions: [null],
        };
        Object.assign(view.opf, { spine: [{}] });
        view.spineItems = [viewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCountersStack: [],
          unresolvedReferences: { target: [reference] },
          getUnresolvedRefsToPage: jasmine
            .createSpy("getUnresolvedRefsToPage")
            .and.returnValue([
              { spineIndex: 0, pageIndex: 0, refs: [reference] },
            ]),
          finishLastPage: function () {},
        });
        spyOn(view, "getPageViewItem").and.returnValue(
          adapt_task.newResult(null),
        );
        view.followingSpineRerenderDepth = 1;

        view
          .resolveUnresolvedReferencesForPage(viewItem, page, 0, null)
          .then(function (resolvedPage) {
            expect(resolvedPage).toBe(page);
            expect(view.getPageViewItem).not.toHaveBeenCalled();
            expect(
              view.counterStore.getUnresolvedRefsToPage,
            ).not.toHaveBeenCalled();
            expect(view.postponedTargetHostPages).toEqual([
              { viewItem: viewItem, pageIndex: 0, nextLayoutPosition: null },
            ]);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("stops materializing pending pages while a root page float is active", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var floatActive = false;
        var viewItem = {
          pages: [{}],
          layoutPositions: [null, { page: 1 }, { page: 2 }],
          instance: {
            hasActiveRootPageFloatLayoutContext: function () {
              return floatActive;
            },
          },
        };
        spyOn(view, "renderSinglePage").and.callFake(function (item) {
          item.pages.push({});
          floatActive = true;
          return adapt_task.newResult({});
        });

        view.materializePendingPages(viewItem, Infinity).then(function () {
          expect(view.renderSinglePage.calls.allArgs()).toEqual([
            [viewItem, { page: 1 }],
          ]);
          expect(viewItem.pages.length).toBe(2);
          expect(view.pendingPageMaterializationDepth).toBe(0);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("materializes every pending page left after a target rerender", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var viewItem = {
          pages: [{}],
          layoutPositions: [null, { page: 1 }, { page: 2 }],
          instance: {
            hasActiveRootPageFloatLayoutContext: function () {
              return false;
            },
          },
        };
        spyOn(view, "renderSinglePage").and.callFake(function (item) {
          item.pages.push({});
          return adapt_task.newResult({});
        });

        view.materializePendingPages(viewItem, Infinity).then(function () {
          expect(view.renderSinglePage.calls.allArgs()).toEqual([
            [viewItem, { page: 1 }],
            [viewItem, { page: 2 }],
          ]);
          expect(viewItem.pages.length).toBe(3);
          expect(view.pendingPageMaterializationDepth).toBe(0);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("skips postponed entries whose pages are truncated during a pass", function (done) {
      var store = createCounterStore();
      var firstReference = new adapt_counters.TargetCounterReference(
        "first",
        false,
      );
      var secondReference = new adapt_counters.TargetCounterReference(
        "second",
        false,
      );
      recordReferencesOnPage(store, 0, 0, [firstReference, secondReference]);
      var firstPage = { elementsById: { first: [] } };
      var secondPage = { elementsById: { second: [] } };
      var viewItem = {
        item: { spineIndex: 0 },
        pages: [firstPage, secondPage],
        layoutPositions: [null, { page: 1 }],
        pageCounterStarts: [{}, {}],
        pageCounterEnds: [{}, {}],
      };
      var view = createOPFView();
      Object.assign(view.opf, { spine: [{}] });
      view.counterStore = store;
      view.spineItems = [viewItem];
      view.postponedTargetHostPages = [
        { viewItem: viewItem, pageIndex: 0, nextLayoutPosition: null },
        { viewItem: viewItem, pageIndex: 1, nextLayoutPosition: null },
      ];
      view.maxTargetReferenceLayoutPasses = 3;
      spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
        function () {
          view.truncateViewItemAfterPage(viewItem, 0);
          expect(
            view.postponedTargetHostPages.some(function (entry) {
              return entry.pageIndex === 1;
            }),
          ).toBe(false);
          firstReference.resolve();
          store.unresolvedReferences.first = [];
          return adapt_task.newResult(firstPage);
        },
      );

      adapt_task.start(function () {
        view.resolvePostponedReferences().then(function () {
          expect(view.resolveUnresolvedReferencesForPage.calls.count()).toBe(1);
          expect(viewItem.pages).toEqual([firstPage]);
          expect(view.postponedTargetHostPages).toEqual([]);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("restores the host page counters when the referenced spine fails to load", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 1;
        reference.pageIndex = 0;
        var page = { elementsById: {} };
        var viewItem = {
          item: { spineIndex: 0 },
          pages: [page],
          complete: true,
        };
        var store = createCounterStoreStub({
          currentPageCounters: { page: [3] },
          unresolvedReferences: { target: [reference] },
          getUnresolvedRefsToPage: function () {
            return [{ spineIndex: 1, pageIndex: 0, refs: [reference] }];
          },
          isUnresolvedReference: function () {
            return true;
          },
          finishLastPage: function () {},
        });
        view.counterStore = store;
        Object.assign(view.opf, {
          spine: [{ startPage: null }, { startPage: null }],
        });
        view.spineItems = [viewItem];
        view.spineIndexOfCurrentPageCounters = 0;
        var error = new Error("load failed");
        spyOn(view, "getPageViewItem").and.callFake(function () {
          view.counterStore.currentPageCounters = { page: [99] };
          view.spineIndexOfCurrentPageCounters = 1;
          throw error;
        });

        return adapt_task.handle(
          "testSpineLoadFailureCleanup",
          function (frame) {
            view
              .resolveUnresolvedReferencesForPage(viewItem, page, 0, null)
              .then(function () {
                fail("the resolution should have failed");
                frame.finish(false);
              });
          },
          function (frame, caughtError) {
            expect(caughtError).toBe(error);
            expect(view.counterStore.currentPageCounters).toEqual({
              page: [3],
            });
            expect(view.spineIndexOfCurrentPageCounters).toBe(0);
            frame.finish(true);
            done();
          },
        );
      });
    });

    it("restores the host page counters when a cross-spine resolution fails while materializing pages", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        store.unresolvedReferences.target = [reference];
        store.currentPageCounters = { page: [5] };
        var sourcePage = {
          elementsById: {},
          container: { parentElement: {}, setAttribute: function () {} },
          spineIndex: 0,
        };
        var targetPage = {
          elementsById: { target: [] },
          container: { parentElement: {}, setAttribute: function () {} },
          spineIndex: 1,
        };
        var instance = {
          styler: { cascade: {} },
          pageManager: { pageCascadeInstance: {} },
          pageGroupPageCounts: {},
          currentPageGroupDocument: document,
          scopes: {},
          viewport: { layoutBox: document.createElement("div") },
          hasActiveRootPageFloatLayoutContext: function () {
            return false;
          },
          beginIsolatedRootPageFloatLayoutContext: function () {
            return {};
          },
          endIsolatedRootPageFloatLayoutContext: function () {},
          preparePageGroupPageIndicesForRerender: function () {},
        };
        var sourceViewItem = {
          item: { spineIndex: 0 },
          instance: instance,
          pages: [sourcePage],
          layoutPositions: [null, { page: 1 }],
          complete: true,
        };
        var hostViewItem = {
          item: { spineIndex: 1 },
          instance: instance,
          pages: [targetPage],
          layoutPositions: [null],
          complete: false,
        };
        Object.assign(view.opf, {
          spine: [{ startPage: null }, { startPage: null }],
        });
        view.spineItems = [sourceViewItem, hostViewItem];
        view.counterStore = store;
        view.spineIndexOfCurrentPageCounters = 1;
        spyOn(view, "getPageViewItem").and.callFake(function () {
          return adapt_task.newResult(sourceViewItem);
        });
        spyOn(view, "renderSinglePage").and.callFake(function () {
          view.spineIndexOfCurrentPageCounters = 0;
          store.currentPageCounters = { page: [2] };
          reference.resolve();
          store.unresolvedReferences.target = [];
          store.resolvedReferences.target = [reference];
          return adapt_task.newResult({
            pageAndPosition: {
              page: sourcePage,
              position: { spineIndex: 0, pageIndex: 0 },
            },
            nextLayoutPosition: { page: 1 },
          });
        });
        var failure = new Error("materialization failed");
        spyOn(view, "materializePendingPages").and.callFake(function () {
          view.spineIndexOfCurrentPageCounters = 0;
          store.currentPageCounters = { page: [7] };
          throw failure;
        });

        adapt_task
          .handle(
            "failingCrossSpineResolution",
            function (frame) {
              view
                .resolveUnresolvedReferencesForPage(
                  hostViewItem,
                  targetPage,
                  0,
                  null,
                )
                .then(function () {
                  fail("the resolution should have failed");
                  frame.finish(false);
                });
            },
            function (frame, caughtError) {
              expect(caughtError).toBe(failure);
              frame.finish(true);
            },
          )
          .then(function () {
            expect(store.currentPageCounters).toEqual({ page: [5] });
            expect(view.spineIndexOfCurrentPageCounters).toBe(1);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("does not enqueue a postponed page whose spine item was replaced", function () {
      var view = createOPFView();
      var reference = new adapt_counters.TargetCounterReference(
        "target",
        false,
      );
      reference.spineIndex = 0;
      reference.pageIndex = 0;
      view.counterStore = createCounterStoreStub({
        unresolvedReferences: { target: [reference] },
      });
      var page = { elementsById: { target: [] } };
      var replacedViewItem = { item: { spineIndex: 0 }, pages: [page] };
      var currentViewItem = { item: { spineIndex: 0 }, pages: [page] };
      view.spineItems = [currentViewItem];
      view.postponeTargetHostPage(replacedViewItem, 0, null);
      view.postponeTargetHostPage(currentViewItem, 0, null);

      expect(view.postponedTargetHostPages.length).toBe(1);
      expect(view.postponedTargetHostPages[0].viewItem).toBe(currentViewItem);
      expect(view.postponedTargetHostPages[0].pageIndex).toBe(0);
    });

    it("keeps the leading blank page decision of an already rendered spine", function () {
      var view = createOPFView();
      var instance = createPageNumberInstance(4, "right");
      var changedViewItem = {
        item: { spineIndex: 0 },
        pages: [{}],
        pageCounterStarts: [],
        pageCounterEnds: [],
      };
      var laterViewItem = {
        item: { spineIndex: 1 },
        instance: instance,
        pages: [{}],
        pageCounterStarts: [{ page: [4] }],
        pageCounterEnds: [{ page: [5] }],
      };
      Object.assign(view.opf, {
        epageIsRenderedPage: false,
        spine: [
          Object.assign(changedViewItem.item, { startPage: null }),
          Object.assign(laterViewItem.item, { startPage: null }),
        ],
      });
      view.spineItems = [changedViewItem, laterViewItem];
      view.counterStore = createCounterStoreStub({});
      expect(instance.blankPageAtStart).toBe(false);

      view.adjustFollowingSpinesForPageCountChange(
        changedViewItem,
        -1,
        null,
        -1,
      );

      expect(instance.pageNumberOffset).toBe(3);
      expect(instance.blankPageAtStart).toBe(false);
      expect(laterViewItem.pageCounterStarts[0].page).toEqual([3]);

      instance.applyPageNumberOffset(instance.pageNumberOffset);
      expect(instance.blankPageAtStart).toBe(true);
    });

    it("skips references resolved after the page's references were collected", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          true,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        var page = {
          elementsById: { target: [] },
          container: { parentElement: {}, setAttribute: function () {} },
          spineIndex: 0,
        };
        var viewItem = {
          item: { spineIndex: 0 },
          pages: [page],
          layoutPositions: [null],
          complete: true,
        };
        Object.assign(view.opf, { spine: [{ startPage: null }] });
        view.spineItems = [viewItem];
        view.counterStore = createCounterStoreStub({
          unresolvedReferences: { target: [reference] },
          getUnresolvedRefsToPage: function () {
            return [{ spineIndex: 0, pageIndex: 0, refs: [reference] }];
          },
          finishLastPage: function () {},
        });
        spyOn(view, "getPageViewItem").and.returnValue(
          adapt_task.newResult(null),
        );

        view
          .resolveUnresolvedReferencesForPage(viewItem, page, 0, null)
          .then(function (result) {
            expect(result).toBe(page);
            expect(view.getPageViewItem).not.toHaveBeenCalled();
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    describe("getPageViewItem", function () {
      function createLoadingView(spine, currentPageCounters) {
        var view = createOPFView();
        var xmldoc = {
          root: { setAttribute: function () {} },
          document: { title: "Chapter" },
        };
        var viewport = view.viewport;
        viewport.width = 100;
        viewport.height = 100;
        viewport.fontSize = 16;
        Object.assign(view.opf, {
          spine: spine.map(function (item, spineIndex) {
            return Object.assign(
              {
                spineIndex: spineIndex,
                src: "chapter" + spineIndex + ".html",
                itemRefElement: {
                  getAttribute: function () {
                    return null;
                  },
                },
              },
              item,
            );
          }),
          store: {
            load: function () {
              return adapt_task.newResult(xmldoc);
            },
            getStyleForDoc: function () {
              return {
                sizeViewport: function () {
                  return {
                    width: viewport.width,
                    height: viewport.height,
                    fontSize: viewport.fontSize,
                  };
                },
              };
            },
          },
          prePaginated: false,
          metadata: {},
        });
        view.counterStore = createCounterStoreStub({
          currentPageCounters: currentPageCounters || {},
        });
        spyOn(view, "makeCustomRenderer").and.returnValue({});
        var created = [];
        spyOn(adapt_ops.StyleInstance, "create").and.callFake(function () {
          created.push({ pageNumberOffset: arguments[8] });
          return adapt_task.newResult({
            pageProgression: adapt_constants.PageProgression.LTR,
            isVersoFirstPage: false,
          });
        });
        view.createdInstances = created;
        return view;
      }

      it("applies skipPagesBefore to a spine without an explicit start page", function (done) {
        adapt_task.start(function () {
          var view = createLoadingView([
            { startPage: null, skipPagesBefore: 2 },
          ]);

          view.getPageViewItem(0).then(function (viewItem) {
            expect(view.createdInstances.length).toBe(1);
            expect(view.createdInstances[0].pageNumberOffset).toBe(2);
            expect(view.spineItems[0]).toBe(viewItem);
            expect(viewItem.pageCounterStarts).toEqual([{ page: [2] }]);
            expect(view.spineIndexOfCurrentPageCounters).toBe(0);
            expect(
              view.spineItemsWithEstimatedPageNumberOffset.has(viewItem),
            ).toBe(false);
            done();
          });
          return adapt_task.newResult(true);
        });
      });

      it("continues the page counter of the current page counters when the previous spine cannot provide it", function (done) {
        adapt_task.start(function () {
          var view = createLoadingView(
            [{ startPage: null, skipPagesBefore: 2 }],
            {
              page: [7],
            },
          );

          view.getPageViewItem(0).then(function (viewItem) {
            expect(view.createdInstances[0].pageNumberOffset).toBe(2);
            expect(viewItem.pageCounterStarts).toEqual([{ page: [9] }]);
            done();
          });
          return adapt_task.newResult(true);
        });
      });

      it("starts a spine at its explicit page number", function (done) {
        adapt_task.start(function () {
          var view = createLoadingView([{ startPage: 5, skipPagesBefore: 2 }]);

          view.getPageViewItem(0).then(function (viewItem) {
            expect(view.createdInstances[0].pageNumberOffset).toBe(4);
            expect(viewItem.pageCounterStarts).toEqual([{ page: [4] }]);
            expect(
              view.spineItemsWithEstimatedPageNumberOffset.has(viewItem),
            ).toBe(false);
            done();
          });
          return adapt_task.newResult(true);
        });
      });

      it("estimates the page-number offset of a spine whose previous spine is not loaded", function (done) {
        adapt_task.start(function () {
          var view = createLoadingView([
            { startPage: null, skipPagesBefore: null },
            { startPage: null, epage: 2, skipPagesBefore: 1 },
          ]);
          view.spineItems = [null];

          view.getPageViewItem(1).then(function (viewItem) {
            expect(view.createdInstances[0].pageNumberOffset).toBe(4);
            expect(view.spineItems[1]).toBe(viewItem);
            expect(viewItem.pageCounterStarts).toEqual([{ page: [4] }]);
            expect(
              view.spineItemsWithEstimatedPageNumberOffset.has(viewItem),
            ).toBe(true);
            done();
          });
          return adapt_task.newResult(true);
        });
      });
    });

    it("marks a spine complete after resolving its own references", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        store.unresolvedReferences.target = [reference];
        store.currentPageCounters = { page: [2] };
        store.finishLastPage = function () {};
        var sourcePage = {
          elementsById: {},
          container: {
            parentElement: {},
            setAttribute: function () {},
          },
          spineIndex: 0,
        };
        var targetPage = {
          elementsById: { target: [] },
          container: {
            parentElement: {},
            setAttribute: function () {},
          },
          spineIndex: 0,
        };
        var instance = {
          styler: { cascade: {} },
          pageManager: { pageCascadeInstance: {} },
          pageGroupPageCounts: {},
          currentPageGroupDocument: document,
          scopes: {},
          viewport: { layoutBox: document.createElement("div") },
          hasActiveRootPageFloatLayoutContext: function () {
            return false;
          },
          beginIsolatedRootPageFloatLayoutContext: function () {
            return {};
          },
          endIsolatedRootPageFloatLayoutContext: function () {},
          preparePageGroupPageIndicesForRerender: function () {},
        };
        var viewItem = {
          item: { spineIndex: 0 },
          instance: instance,
          pages: [sourcePage, targetPage],
          layoutPositions: [null, { page: 1 }],
          complete: true,
        };
        Object.assign(view.opf, { spine: [{ startPage: null }] });
        view.spineItems = [viewItem];
        view.counterStore = store;
        view.spineIndexOfCurrentPageCounters = 2;
        spyOn(view, "getPageViewItem").and.callFake(function () {
          return adapt_task.newResult(viewItem);
        });
        spyOn(
          view,
          "adjustFollowingSpinesForPageCountChange",
        ).and.callThrough();
        spyOn(view, "materializePendingPages").and.callThrough();
        spyOn(view, "renderSinglePage").and.callFake(function () {
          viewItem.complete = false;
          view.spineIndexOfCurrentPageCounters = 0;
          reference.resolve();
          store.unresolvedReferences.target = [];
          store.resolvedReferences.target = [reference];
          return adapt_task.newResult({
            pageAndPosition: {
              page: sourcePage,
              position: { spineIndex: 0, pageIndex: 0 },
            },
            nextLayoutPosition: { page: 1 },
          });
        });

        view
          .resolveUnresolvedReferencesForPage(viewItem, targetPage, 1, null)
          .then(function () {
            expect(view.renderSinglePage).toHaveBeenCalledWith(viewItem, null);
            expect(view.materializePendingPages).toHaveBeenCalledWith(
              viewItem,
              Infinity,
            );
            expect(viewItem.complete).toBe(true);
            expect(
              view.adjustFollowingSpinesForPageCountChange,
            ).toHaveBeenCalledWith(viewItem, 0, jasmine.anything(), 2);
            expect(view.spineIndexOfCurrentPageCounters).toBe(2);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("propagates a page-count change from resolving references to the following spines", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        store.unresolvedReferences.target = [reference];
        store.currentPageCounters = { page: [2] };
        store.finishLastPage = function () {};
        var sourcePage = {
          elementsById: {},
          container: {
            parentElement: {},
            setAttribute: function () {},
          },
          spineIndex: 0,
        };
        var targetPage = {
          elementsById: { target: [] },
          container: {
            parentElement: {},
            setAttribute: function () {},
          },
          spineIndex: 0,
        };
        var instance = {
          styler: { cascade: {} },
          pageManager: { pageCascadeInstance: {} },
          pageGroupPageCounts: {},
          currentPageGroupDocument: document,
          scopes: {},
          viewport: { layoutBox: document.createElement("div") },
          hasActiveRootPageFloatLayoutContext: function () {
            return false;
          },
          beginIsolatedRootPageFloatLayoutContext: function () {
            return {};
          },
          endIsolatedRootPageFloatLayoutContext: function () {},
          preparePageGroupPageIndicesForRerender: function () {},
        };
        var viewItem = {
          item: { spineIndex: 0 },
          instance: instance,
          pages: [sourcePage, targetPage],
          layoutPositions: [null, { page: 1 }],
          complete: true,
        };
        Object.assign(view.opf, { spine: [{ startPage: null }] });
        view.spineItems = [viewItem];
        view.counterStore = store;
        view.spineIndexOfCurrentPageCounters = 2;
        spyOn(view, "getPageViewItem").and.callFake(function () {
          return adapt_task.newResult(viewItem);
        });
        spyOn(view, "adjustFollowingSpinesForPageCountChange");
        spyOn(view, "materializePendingPages").and.callFake(function () {
          view.spineIndexOfCurrentPageCounters = 0;
          return adapt_task.newResult(true);
        });
        spyOn(view, "scheduleFollowingSpineRerender");
        spyOn(view, "renderSinglePage").and.callFake(function () {
          viewItem.pages.push({});
          viewItem.layoutPositions.push({ page: 2 });
          viewItem.complete = false;
          view.spineIndexOfCurrentPageCounters = 0;
          reference.resolve();
          store.unresolvedReferences.target = [];
          store.resolvedReferences.target = [reference];
          return adapt_task.newResult({
            pageAndPosition: {
              page: sourcePage,
              position: { spineIndex: 0, pageIndex: 0 },
            },
            nextLayoutPosition: { page: 1 },
          });
        });

        view
          .resolveUnresolvedReferencesForPage(viewItem, targetPage, 1, null)
          .then(function () {
            expect(view.renderSinglePage).toHaveBeenCalledWith(viewItem, null);
            expect(
              view.adjustFollowingSpinesForPageCountChange,
            ).toHaveBeenCalledWith(viewItem, 1, jasmine.anything(), 0);
            expect(view.scheduleFollowingSpineRerender).toHaveBeenCalledWith(
              viewItem,
              1,
            );
            expect(view.spineIndexOfCurrentPageCounters).toBe(0);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("passes the single-page materialization limit for an incomplete source spine", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var store = createCounterStore();
        var reference = new adapt_counters.TargetCounterReference(
          "target",
          false,
        );
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        store.unresolvedReferences.target = [reference];
        store.currentPageCounters = { page: [2] };
        store.finishLastPage = function () {};
        var sourcePage = {
          elementsById: {},
          container: {
            parentElement: {},
            setAttribute: function () {},
          },
          spineIndex: 0,
        };
        var targetPage = {
          elementsById: { target: [] },
          container: {
            parentElement: {},
            setAttribute: function () {},
          },
          spineIndex: 0,
        };
        var instance = {
          styler: { cascade: {} },
          pageManager: { pageCascadeInstance: {} },
          pageGroupPageCounts: {},
          currentPageGroupDocument: document,
          scopes: {},
          viewport: { layoutBox: document.createElement("div") },
          hasActiveRootPageFloatLayoutContext: function () {
            return false;
          },
          beginIsolatedRootPageFloatLayoutContext: function () {
            return {};
          },
          endIsolatedRootPageFloatLayoutContext: function () {},
          preparePageGroupPageIndicesForRerender: function () {},
        };
        var viewItem = {
          item: { spineIndex: 0 },
          instance: instance,
          pages: [sourcePage, targetPage],
          layoutPositions: [null, { page: 1 }],
          complete: false,
        };
        Object.assign(view.opf, { spine: [{ startPage: null }] });
        view.spineItems = [viewItem];
        view.counterStore = store;
        view.spineIndexOfCurrentPageCounters = 2;
        spyOn(view, "getPageViewItem").and.callFake(function () {
          return adapt_task.newResult(viewItem);
        });
        spyOn(
          view,
          "adjustFollowingSpinesForPageCountChange",
        ).and.callThrough();
        spyOn(view, "materializePendingPages").and.callThrough();
        spyOn(view, "renderSinglePage").and.callFake(function () {
          view.spineIndexOfCurrentPageCounters = 0;
          reference.resolve();
          store.unresolvedReferences.target = [];
          store.resolvedReferences.target = [reference];
          return adapt_task.newResult({
            pageAndPosition: {
              page: sourcePage,
              position: { spineIndex: 0, pageIndex: 0 },
            },
            nextLayoutPosition: { page: 1 },
          });
        });

        view
          .resolveUnresolvedReferencesForPage(viewItem, targetPage, 1, null)
          .then(function () {
            expect(view.renderSinglePage).toHaveBeenCalledWith(viewItem, null);
            expect(view.materializePendingPages).toHaveBeenCalledWith(
              viewItem,
              1,
            );
            expect(
              view.adjustFollowingSpinesForPageCountChange,
            ).toHaveBeenCalledWith(viewItem, 0, jasmine.anything(), 2);
            expect(view.spineIndexOfCurrentPageCounters).toBe(2);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("keeps the through-reset flag when a later schedule omits it", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var earlierViewItem = { item: { spineIndex: 0 } };
        Object.assign(view.opf, {
          spine: [{ startPage: null }, { startPage: null }, { startPage: 10 }],
        });
        spyOn(view, "rerenderFollowingSpines").and.returnValue(
          adapt_task.newResult(true),
        );
        spyOn(view.counterStore, "updateRunningTargetReferenceNodes");

        view.scheduleFollowingSpineRerender(earlierViewItem, 1, true);
        view.scheduleFollowingSpineRerender(earlierViewItem, -1);

        view.resolvePostponedReferences().then(function () {
          expect(view.rerenderFollowingSpines.calls.allArgs()).toEqual([
            [earlierViewItem, Infinity],
          ]);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("merges scheduled rerenders into one from the earliest spine", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var earlierViewItem = { item: { spineIndex: 0 } };
        var laterViewItem = { item: { spineIndex: 2 } };
        Object.assign(view.opf, {
          spine: [{ startPage: null }, { startPage: null }, { startPage: 10 }],
        });
        spyOn(view, "rerenderFollowingSpines").and.returnValue(
          adapt_task.newResult(true),
        );
        spyOn(view.counterStore, "updateRunningTargetReferenceNodes");

        var untouchedViewItem = { item: { spineIndex: 1 } };
        view.scheduleFollowingSpineRerender(laterViewItem, 1);
        view.scheduleFollowingSpineRerender(earlierViewItem, -1);
        view.scheduleFollowingSpineRerender(untouchedViewItem, 0);
        view.scheduleFollowingSpineRerender(earlierViewItem, 0, true);
        expect(view.pendingFollowingSpineRerenders.size).toBe(2);

        view.resolvePostponedReferences().then(function () {
          expect(view.rerenderFollowingSpines.calls.allArgs()).toEqual([
            [earlierViewItem, Infinity],
          ]);
          expect(view.pendingFollowingSpineRerenders.size).toBe(0);
          expect(
            view.counterStore.updateRunningTargetReferenceNodes,
          ).toHaveBeenCalled();
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("returns the page in the document after a loading-gap rerender", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var staleResult = {
          page: { container: { parentElement: null } },
          position: { spineIndex: 0, pageIndex: 0, offsetInItem: 0 },
        };
        var freshResult = {
          page: { container: { parentElement: {} } },
          position: { spineIndex: 0, pageIndex: 0, offsetInItem: 0 },
        };
        var viewItem = { item: { spineIndex: 0 }, complete: true };
        view.spineItems = [viewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCountersStack: [],
        });
        var results = [staleResult, freshResult];
        spyOn(view, "renderPageTracked").and.callFake(function () {
          return adapt_task.newResult(results.shift());
        });
        spyOn(view, "rerenderFollowingSpinesAfterLoadingGap").and.returnValue(
          adapt_task.newResult(true),
        );
        spyOn(view, "drainPostponedWork").and.callThrough();

        view
          .renderPage({ spineIndex: 0, pageIndex: 0, offsetInItem: 0 })
          .then(function (result) {
            expect(view.renderPageTracked.calls.count()).toBe(2);
            expect(view.drainPostponedWork).toHaveBeenCalled();
            expect(
              view.rerenderFollowingSpinesAfterLoadingGap,
            ).toHaveBeenCalledOnceWith(viewItem);
            expect(result).toBe(freshResult);
            expect(view.renderingPageTasks.size).toBe(0);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("materializes the first page of a spine without rendered pages", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var viewItem = {
          pages: [],
          layoutPositions: [null],
          instance: {
            hasActiveRootPageFloatLayoutContext: function () {
              return false;
            },
          },
        };
        spyOn(view, "renderSinglePage").and.callFake(function (item) {
          item.pages.push({});
          return adapt_task.newResult({});
        });

        view.materializePendingPages(viewItem, Infinity).then(function () {
          expect(view.renderSinglePage.calls.allArgs()).toEqual([
            [viewItem, null],
          ]);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("skips rerender entries whose spine item was discarded", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = {
          item: { spineIndex: 0 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
        };
        var followingViewItem = {
          item: { spineIndex: 1 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
          layoutPositions: [null],
          complete: false,
          instance: createPageNumberInstance(1),
        };
        var discardedViewItem = {
          item: { spineIndex: 2 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
          layoutPositions: [null],
          complete: false,
          instance: createPageNumberInstance(2),
        };
        Object.assign(view.opf, {
          spine: [
            { startPage: null },
            { startPage: null },
            { startPage: null },
          ],
        });
        view.spineItems = [
          changedViewItem,
          followingViewItem,
          discardedViewItem,
        ];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
        });
        spyOn(view, "renderSinglePage").and.callFake(function () {
          view.spineItems[2] = null;
          return adapt_task.newResult({});
        });

        view
          .rerenderFollowingSpines(changedViewItem, Infinity)
          .then(function () {
            expect(view.renderSinglePage.calls.allArgs()).toEqual([
              [followingViewItem, null],
            ]);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("lays out only the given number of pending pages", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var viewItem = {
          pages: [{}],
          layoutPositions: [null, { page: 1 }],
          instance: {
            hasActiveRootPageFloatLayoutContext: function () {
              return false;
            },
          },
        };
        spyOn(view, "renderSinglePage").and.callFake(function (item) {
          item.pages.push({});
          item.layoutPositions.push({ page: item.pages.length });
          return adapt_task.newResult({});
        });

        view.materializePendingPages(viewItem, 1).then(function () {
          expect(view.renderSinglePage.calls.count()).toBe(1);
          expect(viewItem.pages.length).toBe(2);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("drops the pending rerenders of a batch whose rerender fails", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = { item: { spineIndex: 0 } };
        var laterViewItem = { item: { spineIndex: 1 } };
        var resetViewItem = { item: { spineIndex: 2 } };
        var error = new Error("rerender failed");
        Object.assign(view.opf, {
          spine: [{ startPage: null }, { startPage: null }, { startPage: 10 }],
        });
        view.counterStore = createCounterStoreStub({});
        spyOn(view, "rerenderFollowingSpines").and.callFake(function () {
          throw error;
        });
        view.scheduleFollowingSpineRerender(changedViewItem, 1);
        view.scheduleFollowingSpineRerender(laterViewItem, 1);
        view.scheduleFollowingSpineRerender(resetViewItem, 1);

        return adapt_task.handle(
          "testFlushFailure",
          function (frame) {
            view.flushFollowingSpineRerenders().then(function () {
              fail("the rerender should have failed");
              frame.finish(false);
            });
          },
          function (frame, caughtError) {
            expect(caughtError).toBe(error);
            expect(
              Array.from(view.pendingFollowingSpineRerenders.keys()),
            ).toEqual([resetViewItem]);
            frame.finish(true);
            done();
          },
        );
      });
    });

    it("restores the materialization depth when a pending page fails to render", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var error = new Error("render failed");
        var viewItem = {
          pages: [{}],
          layoutPositions: [null, { page: 1 }],
          instance: {
            hasActiveRootPageFloatLayoutContext: function () {
              return false;
            },
          },
        };
        spyOn(view, "renderSinglePage").and.callFake(function () {
          expect(view.pendingPageMaterializationDepth).toBe(1);
          throw error;
        });

        return adapt_task.handle(
          "testMaterializationFailure",
          function (frame) {
            view.materializePendingPages(viewItem, 1).then(function () {
              fail("the materialization should have failed");
              frame.finish(false);
            });
          },
          function (frame, caughtError) {
            expect(caughtError).toBe(error);
            expect(view.pendingPageMaterializationDepth).toBe(0);
            frame.finish(true);
            done();
          },
        );
      });
    });

    it("treats a reference resolution owned by another task as rendering", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        expect(view.isRenderingOrResolvingInAnotherTask()).toBe(false);
        view.postponedReferenceResolutionTask = adapt_task.currentTask();
        expect(view.isRenderingOrResolvingInAnotherTask()).toBe(false);
        view.postponedReferenceResolutionTask = {};
        expect(view.isRenderingOrResolvingInAnotherTask()).toBe(true);
        done();
        return adapt_task.newResult(true);
      });
    });

    it("starts a first page that is not rendered yet from its stored counters", function () {
      var view = createOPFView();
      view.counterStore = createCounterStoreStub({
        currentPageCounters: { page: [9] },
      });
      var viewItem = {
        pages: [],
        pageCounterStarts: [{ page: [3] }],
        pageCounterEnds: [],
      };

      expect(view.preparePageCountersForRender(viewItem, 0)).toBeNull();
      expect(view.counterStore.currentPageCounters).toEqual({ page: [3] });
      expect(viewItem.pageCounterStarts[0]).not.toBe(
        view.counterStore.currentPageCounters,
      );
    });

    it("does not rerender pages that a cascade already rerendered", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var changedViewItem = {
          item: { spineIndex: 0 },
          pages: [{}],
          pageCounterStarts: [],
          pageCounterEnds: [],
        };
        var laterViewItem = {
          item: { spineIndex: 1 },
          pages: [{}, {}],
          pageCounterStarts: [],
          pageCounterEnds: [],
          layoutPositions: [null, { page: 1 }],
          complete: true,
          instance: createPageNumberInstance(1),
        };
        Object.assign(view.opf, {
          spine: [{ startPage: null }, { startPage: null }],
        });
        view.spineItems = [changedViewItem, laterViewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCounters: {},
        });
        spyOn(view, "renderSinglePage").and.callFake(function (item, position) {
          if (position === null) {
            item.pages[1] = {};
          }
          return adapt_task.newResult({});
        });

        view
          .rerenderFollowingSpines(changedViewItem, Infinity)
          .then(function () {
            expect(view.renderSinglePage.calls.allArgs()).toEqual([
              [laterViewItem, null],
            ]);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("resolves references postponed during the frozen pass", function (done) {
      var store = createCounterStore();
      var view = createOPFView();
      var stuckReference = new adapt_counters.TargetCounterReference(
        "stuck",
        false,
      );
      stuckReference.spineIndex = 0;
      stuckReference.pageIndex = 0;
      var lateReference = new adapt_counters.TargetCounterReference(
        "late",
        false,
      );
      lateReference.spineIndex = 0;
      lateReference.pageIndex = 1;
      store.unresolvedReferences.stuck = [stuckReference];
      store.unresolvedReferences.late = [lateReference];
      store.pageIndicesById.stuck = { spineIndex: 0, pageIndex: 2 };
      store.pageCountersById.stuck = { page: [3] };
      var stuckPage = { elementsById: { stuck: [] } };
      var latePage = { elementsById: { late: [] } };
      var viewItem = { item: { spineIndex: 0 }, pages: [stuckPage, latePage] };
      view.counterStore = store;
      view.spineItems = [viewItem];
      view.maxTargetReferenceLayoutPasses = 1;
      view.postponedTargetHostPages.push({
        viewItem: viewItem,
        pageIndex: 0,
        nextLayoutPosition: null,
      });
      var frozenPassSeen = false;
      spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
        function (item, page, pageIndex) {
          failOnRunaway(view.resolveUnresolvedReferencesForPage);
          if (page === latePage) {
            lateReference.resolve();
            store.unresolvedReferences.late = [];
            store.resolvedReferences.late = [lateReference];
            return adapt_task.newResult(page);
          }
          if (stuckReference.isFrozen() && !frozenPassSeen) {
            frozenPassSeen = true;
            view.postponedTargetHostPages.push({
              viewItem: item,
              pageIndex: 1,
              nextLayoutPosition: null,
            });
          }
          view.postponedTargetHostPages.push({
            viewItem: item,
            pageIndex: pageIndex,
            nextLayoutPosition: null,
          });
          return adapt_task.newResult(page);
        },
      );
      spyOn(adapt_logging.logger, "warn");

      adapt_task.start(function () {
        view.resolvePostponedReferences().then(function () {
          expect(view.resolveUnresolvedReferencesForPage).toHaveBeenCalledWith(
            viewItem,
            latePage,
            1,
            null,
          );
          expect(lateReference.isResolved()).toBe(true);
          expect(stuckReference.isResolved()).toBe(true);
          expect(view.postponedTargetHostPages).toEqual([]);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("returns null for a rendered-only lookup of a page that is not rendered", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var viewItem = {
          item: { spineIndex: 0 },
          pages: [],
          layoutPositions: [null],
          complete: false,
          instance: {
            getPosition: function () {
              return 0;
            },
          },
        };
        view.spineItems = [viewItem];
        spyOn(view, "waitForPreviousSpines").and.callFake(function () {
          return adapt_task.newResult(true);
        });
        spyOn(view, "getPageViewItem").and.callFake(function () {
          return adapt_task.newResult(viewItem);
        });
        spyOn(view, "renderPage");

        view
          .findPage(
            { spineIndex: 0, pageIndex: 0, offsetInItem: -1 },
            true,
            true,
          )
          .then(function (result) {
            expect(result).toBeNull();
            expect(view.renderPage).not.toHaveBeenCalled();
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("waits for another rendering task before rendering synchronously", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var page = {};
        var viewItem = {
          item: { spineIndex: 0 },
          pages: [],
          layoutPositions: [null],
          complete: false,
          instance: {
            getPosition: function () {
              return 0;
            },
          },
        };
        view.spineItems = [viewItem];
        spyOn(view, "waitForPreviousSpines").and.callFake(function () {
          return adapt_task.newResult(true);
        });
        spyOn(view, "getPageViewItem").and.callFake(function () {
          return adapt_task.newResult(viewItem);
        });
        var renderingChecks = 0;
        spyOn(view, "isRenderingOrResolvingInAnotherTask").and.callFake(
          function () {
            return ++renderingChecks <= 2;
          },
        );
        spyOn(view, "renderPage").and.callFake(function () {
          viewItem.pages.push(page);
          return adapt_task.newResult({
            page: page,
            position: { spineIndex: 0, pageIndex: 0, offsetInItem: 0 },
          });
        });

        view
          .findPage({ spineIndex: 0, pageIndex: 0, offsetInItem: -1 }, true)
          .then(function (result) {
            expect(result.page).toBe(page);
            expect(view.renderPage.calls.count()).toBe(1);
            expect(renderingChecks).toBeGreaterThan(2);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("stops resolution cycles that keep producing new references", function (done) {
      var store = createCounterStore();
      var view = createOPFView();
      var pages = [];
      var viewItem = { item: { spineIndex: 0 }, pages: pages };
      var targetCount = 0;
      var references = [];
      function addPendingPage() {
        var id = "target" + targetCount++;
        var reference = new adapt_counters.TargetCounterReference(id, false);
        references.push(reference);
        reference.spineIndex = 0;
        reference.pageIndex = 0;
        store.unresolvedReferences[id] = [reference];
        store.pageIndicesById[id] = { spineIndex: 0, pageIndex: pages.length };
        store.pageCountersById[id] = { page: [pages.length + 1] };
        var page = { elementsById: {} };
        page.elementsById[id] = [];
        pages.push(page);
        view.postponedTargetHostPages.push({
          viewItem: viewItem,
          pageIndex: pages.length - 1,
          nextLayoutPosition: null,
        });
      }
      view.counterStore = store;
      view.spineItems = [viewItem];
      view.maxTargetReferenceLayoutPasses = 2;
      addPendingPage();
      spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
        function (item, page) {
          failOnRunaway(view.resolveUnresolvedReferencesForPage, 5000);
          addPendingPage();
          return adapt_task.newResult(page);
        },
      );
      var referenceCountAtFinalFreeze = -1;
      var expectedResolveCalls = 783;
      var referencesFrozenAtFinalFreeze = [];
      spyOn(adapt_logging.logger, "warn").and.callFake(function (message) {
        if (/did not converge after 2 resolution cycles/.test(message)) {
          referenceCountAtFinalFreeze = references.length;
          referencesFrozenAtFinalFreeze = references.filter(
            function (reference) {
              return reference.isFrozen() && !reference.isResolved();
            },
          );
        }
      });

      adapt_task.start(function () {
        view.resolvePostponedReferences().then(function () {
          expect(view.resolveUnresolvedReferencesForPage.calls.count()).toBe(
            expectedResolveCalls,
          );
          expect(view.postponedTargetHostPages).toEqual([]);
          expect(view.resolvingPostponedReferences).toBe(false);
          expect(referenceCountAtFinalFreeze).toBeGreaterThan(0);
          expect(references.length).toBeGreaterThan(
            referenceCountAtFinalFreeze,
          );
          expect(referencesFrozenAtFinalFreeze.length).toBeGreaterThan(0);
          expect(
            referencesFrozenAtFinalFreeze.every(function (reference) {
              return reference.isResolved();
            }),
          ).toBe(true);
          expect(
            references
              .slice(referenceCountAtFinalFreeze)
              .every(function (reference) {
                return !reference.isFrozen() && !reference.isResolved();
              }),
          ).toBe(true);
          var warnings = adapt_logging.logger.warn.calls
            .allArgs()
            .map(function (args) {
              return args[0];
            });
          expect(
            warnings.some(function (message) {
              return /did not converge after 2 resolution cycles/.test(message);
            }),
          ).toBe(true);
          expect(
            warnings.some(function (message) {
              return /was stopped after 2 resolution cycles/.test(message);
            }),
          ).toBe(true);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("drains postponed work after a page with no references to resolve", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var container = document.createElement("div");
        document.createElement("div").appendChild(container);
        var page = { container: container, spineIndex: 0, elementsById: {} };
        var viewItem = {
          item: { spineIndex: 0 },
          pages: [page],
          layoutPositions: [null],
        };
        Object.assign(view.opf, { spine: [{}] });
        view.spineItems = [viewItem];
        view.counterStore = createCounterStoreStub({
          currentPageCountersStack: [],
          getUnresolvedRefsToPage: function () {
            return [];
          },
          finishLastPage: function () {},
        });
        view.scheduleFollowingSpineRerender(viewItem, -1);
        spyOn(view, "rerenderFollowingSpines").and.returnValue(
          adapt_task.newResult(true),
        );

        view
          .resolveUnresolvedReferencesForPage(viewItem, page, 0, null)
          .then(function () {
            expect(view.rerenderFollowingSpines).toHaveBeenCalledWith(
              viewItem,
              Infinity,
            );
            expect(view.pendingFollowingSpineRerenders.size).toBe(0);
            done();
          });
        return adapt_task.newResult(true);
      });
    });

    it("does not discard the next spine when only rendered pages are wanted", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var viewItem = { complete: true, pages: [{ side: "left" }] };
        Object.assign(view.opf, { spine: [{}, {}] });
        view.spineItems = [viewItem, { pages: [{ side: "left" }] }];
        spyOn(view, "getPageViewItem").and.callFake(function () {
          return adapt_task.newResult(viewItem);
        });
        spyOn(view, "discardSpineItem");
        spyOn(view, "findPage").and.returnValue(adapt_task.newResult(null));
        var position = { spineIndex: 0, pageIndex: 0, offsetInItem: -1 };

        view.nextPage(position, false, true).then(function (result) {
          expect(result).toBeNull();
          expect(view.discardSpineItem).not.toHaveBeenCalled();
          expect(view.findPage).toHaveBeenCalledWith(
            { spineIndex: 1, pageIndex: 0, offsetInItem: -1 },
            false,
            true,
          );
          view.postponedReferenceResolutionTask = {};
          view.nextPage(position, false).then(function () {
            expect(view.discardSpineItem).not.toHaveBeenCalled();
            view.postponedReferenceResolutionTask = null;
            view.nextPage(position, false).then(function () {
              expect(view.discardSpineItem).toHaveBeenCalledWith(1);
              done();
            });
          });
        });
        return adapt_task.newResult(true);
      });
    });

    it("leaves spines with estimated page-number offsets out of page-count adjustments", function () {
      var view = createOPFView();
      var changedViewItem = { item: { spineIndex: 0 }, pages: [] };
      var estimatedViewItem = {
        item: { spineIndex: 1 },
        pages: [],
        pageCounterStarts: [{ page: [5] }],
        pageCounterEnds: [{ page: [6] }],
        instance: createPageNumberInstance(5),
      };
      Object.assign(view.opf, {
        epageIsRenderedPage: false,
        spine: [{ startPage: null }, { startPage: null }],
      });
      view.spineItems = [changedViewItem, estimatedViewItem];
      view.spineItemsWithEstimatedPageNumberOffset.add(estimatedViewItem);
      view.counterStore = createCounterStoreStub({
        adjustPageCountersOfLaterSpines: jasmine
          .createSpy("adjustPageCountersOfLaterSpines")
          .and.returnValue([]),
        updatePageCounterNodesInPages: jasmine.createSpy(
          "updatePageCounterNodesInPages",
        ),
        currentPageCounters: {},
      });

      view.adjustFollowingSpinesForPageCountChange(
        changedViewItem,
        -2,
        null,
        0,
      );

      expect(
        view.counterStore.adjustPageCountersOfLaterSpines,
      ).toHaveBeenCalledWith(0, -2, Infinity, new Set([1]));
      expect(estimatedViewItem.instance.pageNumberOffset).toBe(5);
      expect(estimatedViewItem.pageCounterStarts[0].page).toEqual([5]);
      expect(
        view.counterStore.updatePageCounterNodesInPages,
      ).not.toHaveBeenCalled();
    });

    it("finds no rendered page in a spine that is not loaded", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        Object.assign(view.opf, { spine: [{}] });
        view.spineItems = [];
        spyOn(view, "waitForPreviousSpines").and.returnValue(
          adapt_task.newResult(true),
        );
        spyOn(view, "getPageViewItem").and.returnValue(
          adapt_task.newResult(null),
        );
        var frame = adapt_task.newFrame("testUnloadedSpine");
        view
          .findPage(
            { spineIndex: 0, pageIndex: 0, offsetInItem: 0 },
            false,
            true,
          )
          .then(function (result) {
            expect(result).toBeNull();
            expect(view.waitForPreviousSpines).not.toHaveBeenCalled();
            expect(view.getPageViewItem).not.toHaveBeenCalled();
            frame.finish(true);
            done();
          });
        return frame.result();
      });
    });

    it("reports no pending pairing outside rendered-only spreads or when the page is paired", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var rectoPage = { side: "right", container: {} };
        var versoPage = { side: "left", container: {} };
        var pages = [];
        pages[1] = rectoPage;
        Object.assign(view.opf, { spine: [{}] });
        view.spineItems = [
          {
            item: { spineIndex: 0 },
            instance: { pageProgression: adapt_constants.PageProgression.LTR },
            pages: pages,
            complete: true,
          },
        ];
        spyOn(view, "previousPage").and.returnValue(adapt_task.newResult(null));

        view
          .getSpread(
            { spineIndex: 0, pageIndex: 1, offsetInItem: 0 },
            false,
            false,
          )
          .then(function (plainSpread) {
            expect(plainSpread.right).toBe(rectoPage);
            expect(plainSpread.pairingPending).toBe(false);
            view.previousPage.and.returnValue(
              adapt_task.newResult({
                page: versoPage,
                position: { spineIndex: 0, pageIndex: 0, offsetInItem: 0 },
              }),
            );
            view
              .getSpread(
                { spineIndex: 0, pageIndex: 1, offsetInItem: 0 },
                false,
                true,
              )
              .then(function (pairedSpread) {
                expect(pairedSpread.left).toBe(versoPage);
                expect(pairedSpread.pairingPending).toBe(false);
                done();
              });
          });
        return adapt_task.newResult(true);
      });
    });

    it("tells a rendered-only spread whether its missing page exists but is not rendered", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var firstPage = { side: "right", container: {} };
        var lastPage = { side: "left", container: {} };
        Object.assign(view.opf, { spine: [{}, {}] });
        view.spineItems = [
          {
            item: { spineIndex: 0 },
            instance: { pageProgression: adapt_constants.PageProgression.LTR },
            pages: [firstPage, lastPage],
            complete: true,
          },
          null,
        ];

        view
          .getSpread(
            { spineIndex: 0, pageIndex: 0, offsetInItem: 0 },
            false,
            true,
          )
          .then(function (firstSpread) {
            expect(firstSpread.left).toBeNull();
            expect(firstSpread.right).toBe(firstPage);
            expect(firstSpread.pairingPending).toBe(false);
            view
              .getSpread(
                { spineIndex: 0, pageIndex: 1, offsetInItem: 0 },
                false,
                true,
              )
              .then(function (lastSpread) {
                expect(lastSpread.left).toBe(lastPage);
                expect(lastSpread.right).toBeNull();
                expect(lastSpread.pairingPending).toBe(true);
                Object.assign(view.opf, { spine: [{}] });
                view
                  .getSpread(
                    { spineIndex: 0, pageIndex: 1, offsetInItem: 0 },
                    false,
                    true,
                  )
                  .then(function (endSpread) {
                    expect(endSpread.pairingPending).toBe(false);
                    view.spineItems[0].complete = false;
                    view
                      .getSpread(
                        { spineIndex: 0, pageIndex: 1, offsetInItem: 0 },
                        false,
                        true,
                      )
                      .then(function (incompleteSpread) {
                        expect(incompleteSpread.pairingPending).toBe(true);
                        view.spineItems[0].complete = true;
                        view.spineItems[0].pages.length = 3;
                        view
                          .getSpread(
                            { spineIndex: 0, pageIndex: 1, offsetInItem: 0 },
                            false,
                            true,
                          )
                          .then(function (midSpread) {
                            expect(midSpread.pairingPending).toBe(true);
                            var rectoPages = [];
                            rectoPages[1] = { side: "right", container: {} };
                            view.spineItems[0].pages = rectoPages;
                            view
                              .getSpread(
                                {
                                  spineIndex: 0,
                                  pageIndex: 1,
                                  offsetInItem: 0,
                                },
                                false,
                                true,
                              )
                              .then(function (rectoSpread) {
                                expect(rectoSpread.right).toBe(rectoPages[1]);
                                expect(rectoSpread.left).toBeNull();
                                expect(rectoSpread.pairingPending).toBe(true);
                                done();
                              });
                          });
                      });
                  });
              });
          });
        return adapt_task.newResult(true);
      });
    });

    it("rerenders each pending spine up to its own page-number reset", function (done) {
      adapt_task.start(function () {
        var view = createOPFView();
        var earlierViewItem = { item: { spineIndex: 0 } };
        var laterViewItem = { item: { spineIndex: 2 } };
        Object.assign(view.opf, {
          spine: [
            { startPage: null },
            { startPage: null },
            { startPage: 1 },
            { startPage: null },
          ],
        });
        spyOn(view, "rerenderFollowingSpines").and.returnValue(
          adapt_task.newResult(true),
        );

        view.scheduleFollowingSpineRerender(laterViewItem, 1);
        view.scheduleFollowingSpineRerender(earlierViewItem, 1);

        view.resolvePostponedReferences().then(function () {
          expect(view.rerenderFollowingSpines.calls.allArgs()).toEqual([
            [earlierViewItem, 2],
            [laterViewItem, Infinity],
          ]);
          expect(view.pendingFollowingSpineRerenders.size).toBe(0);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("stops rerendering following spines after the pass limit and finishes the resolution", function (done) {
      var store = createCounterStore();
      var view = createOPFView();
      var reference = new adapt_counters.TargetCounterReference(
        "target",
        false,
      );
      reference.spineIndex = 0;
      reference.pageIndex = 0;
      store.unresolvedReferences.target = [reference];
      var page = { elementsById: { target: [] } };
      var viewItem = {
        item: { spineIndex: 0, src: "chapter1.html" },
        pages: [page],
        complete: true,
      };
      var laterViewItem = { item: { spineIndex: 1 } };
      view.counterStore = store;
      spyOn(store, "updateRunningTargetReferenceNodes").and.callThrough();
      view.spineItems = [viewItem, laterViewItem];
      Object.assign(view.opf, {
        spine: [{ startPage: null }, { startPage: null }],
      });
      view.maxTargetReferenceLayoutPasses = 1;
      view.postponeTargetHostPage(viewItem, 0, null);
      view.scheduleFollowingSpineRerender(viewItem, 1);
      spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
        function () {
          failOnRunaway(view.resolveUnresolvedReferencesForPage);
          view.postponeTargetHostPage(viewItem, 0, null);
          return adapt_task.newResult(page);
        },
      );
      spyOn(view, "flushFollowingSpineRerenders").and.callFake(function () {
        failOnRunaway(view.flushFollowingSpineRerenders);
        view.pendingFollowingSpineRerenders.clear();
        view.scheduleFollowingSpineRerender(viewItem, 1);
        return adapt_task.newResult(true);
      });
      spyOn(adapt_logging.logger, "warn");

      adapt_task.start(function () {
        view.resolvePostponedReferences().then(function () {
          var warnings = adapt_logging.logger.warn.calls
            .allArgs()
            .map(function (args) {
              return args[0];
            });
          expect(view.flushFollowingSpineRerenders.calls.count()).toBe(1);
          expect(view.pendingFollowingSpineRerenders.size).toBe(0);
          expect(view.postponedTargetHostPages).toEqual([]);
          expect(store.updateRunningTargetReferenceNodes).toHaveBeenCalledWith(
            view.viewport.root,
          );
          expect(
            warnings.filter(function (message) {
              return (
                message ===
                "Following spines were rerendered in 1 round without settling; the layout of the spines following chapter1.html is kept as it is"
              );
            }).length,
          ).toBe(1);
          expect(
            warnings.some(function (message) {
              return /was stopped after 1 resolution cycle;/.test(message);
            }),
          ).toBe(true);
          done();
        });
        return adapt_task.newResult(true);
      });
    });
  });
  describe("OPFView pagination progress", function () {
    function createFakeView(totalOffsets) {
      var view = createOPFView();
      view.spineItems = [];
      Object.assign(view.opf, {
        spine: totalOffsets.map(function (offset, i) {
          return { src: "doc-" + i, spineIndex: i };
        }),
        store: {
          load: function (src) {
            var index = Number(src.replace("doc-", ""));
            return adapt_task.newResult({
              getTotalOffset: function () {
                return totalOffsets[index];
              },
            });
          },
        },
      });
      return view;
    }

    function createRenderedViewItem(view, spineIndex, totalOffset) {
      view.updateRenderedPageCount(spineIndex, 1);
      return {
        item: view.opf.spine[spineIndex],
        xmldoc: {
          getTotalOffset: function () {
            return totalOffset;
          },
        },
        instance: {
          getPosition: function () {
            return 0;
          },
        },
        layoutPositions: [{ page: 0 }],
        pages: [{ fetchers: [] }],
        pageCounterStarts: [],
        pageCounterEnds: [],
      };
    }

    var payloads;
    var hook = function (payload) {
      payloads.push(payload);
    };

    beforeEach(function () {
      payloads = [];
      vivliostyle_plugin.registerHook(
        vivliostyle_plugin.HOOKS.PAGINATION_PROGRESS,
        hook,
      );
    });

    afterEach(function () {
      vivliostyle_plugin.removeHook(
        vivliostyle_plugin.HOOKS.PAGINATION_PROGRESS,
        hook,
      );
    });

    it("reports the fraction of the paginated content in a single document", function () {
      var view = createFakeView([100]);
      var viewItem = createRenderedViewItem(view, 0, 100);
      view.spineItems[0] = viewItem;

      // A page finished at the half of the document
      viewItem.instance.getPosition = function () {
        return 50;
      };
      view.reportPaginationProgress(viewItem, { page: 1 });
      expect(payloads[0].fraction).toBeCloseTo(0.5, 5);
      expect(payloads[0].pages).toBe(1);

      // The last page finished (no next layout position)
      view.reportPaginationProgress(viewItem, null);
      expect(payloads[1].fraction).toBe(1);
    });

    it("does not report 100% until the last of multiple documents is paginated", function (done) {
      var view = createFakeView([100, 100, 100]);

      adapt_task.start(function () {
        view.collectTotalOffsets().then(function () {
          // Each spine item is loaded and fully paginated in order
          for (var i = 0; i < 3; i++) {
            var viewItem = createRenderedViewItem(view, i, 100);
            view.spineItems[i] = viewItem;
            view.reportPaginationProgress(viewItem, null);
          }
          expect(payloads[0].fraction).toBeCloseTo(1 / 3, 5);
          expect(payloads[1].fraction).toBeCloseTo(2 / 3, 5);
          expect(payloads[2].fraction).toBe(1);
          done();
        });
        return adapt_task.newResult(true);
      });
    });

    it("reports the initial render fraction against the whole publication, not just the first document", function (done) {
      var view = createFakeView([100, 100, 100]);
      // renderSinglePage() dependencies, stubbed to isolate the collect + report
      view.counterStore = createCounterStoreStub({
        currentPageCounters: {},
        finishPage: function () {},
      });
      spyOn(view, "preparePageCountersForRender").and.callFake(function () {
        return null;
      });
      spyOn(view, "makePage").and.callFake(function () {
        return { spineIndex: 0, offset: 0, fetchers: [] };
      });
      spyOn(view, "resolvePageTypeForRenderSlot").and.callFake(function () {});
      spyOn(view, "finishPageContainer").and.callFake(function () {});
      spyOn(view, "maybeRelayoutFollowingPage").and.callFake(function () {
        return adapt_task.newResult(true);
      });
      spyOn(view, "resolveUnresolvedReferencesForPage").and.callFake(
        function (viewItem, page) {
          return adapt_task.newResult(page);
        },
      );

      var viewItem = createRenderedViewItem(view, 0, 100);
      view.spineItems[0] = viewItem;
      viewItem.instance.getPageNumberContextDepth = function () {
        return 0;
      };
      viewItem.instance.pushPageNumberContext = function () {};
      viewItem.instance.restorePageNumberContextDepth = function () {};
      // A page finished at the half of the first document
      viewItem.instance.getPosition = function () {
        return 50;
      };
      viewItem.instance.layoutNextPage = function () {
        return adapt_task.newResult({ page: 1 });
      };

      adapt_task.start(function () {
        view.renderSinglePage(viewItem, { page: 0 }).then(function () {
          expect(payloads[0].fraction).toBeCloseTo(1 / 6, 5);
          done();
        });
        return adapt_task.newResult(true);
      });
    });
  });
});
