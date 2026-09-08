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

import * as Css from "../../../src/vivliostyle/css";
import * as CssCascade from "../../../src/vivliostyle/css-cascade";
import * as Counters from "../../../src/vivliostyle/counters";
import * as Exprs from "../../../src/vivliostyle/exprs";
import * as LayoutProcessor from "../../../src/vivliostyle/layout-processor";
import * as Logging from "../../../src/vivliostyle/logging";
import * as Vtree from "../../../src/vivliostyle/vtree";

const documentURLTransformer = {
  transformFragment(fragment) {
    return fragment;
  },
  transformURL(url) {
    return url;
  },
};

describe("cross-reference bookkeeping", function () {
  it("does not scan unrelated reference buckets when finishing a page", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () => "1");
    const page0Container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(page0Container, page0Container));
    store.resolveReference("target");
    store.finishPage(0, 0);

    const ownKeys = jasmine
      .createSpy("ownKeys")
      .and.callFake((target) => Reflect.ownKeys(target));
    store.resolvedReferences = new Proxy(store.resolvedReferences, {
      ownKeys,
    });
    store.unresolvedReferences = new Proxy(store.unresolvedReferences, {
      ownKeys,
    });

    const page1Container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(page1Container, page1Container));
    store.finishPage(0, 1);

    expect(ownKeys).not.toHaveBeenCalled();
    expect(store.resolvedReferences.target.length).toBe(1);
    expect(store.resolvedReferences.target[0].pageIndex).toBe(0);
  });

  it("removes only the references recorded on the removed pages", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const retained = new Counters.TargetCounterReference("target", false);
    const removed = new Counters.TargetCounterReference("target", false);
    const unrelated = new Counters.TargetCounterReference("other", true);

    const page0Container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(page0Container, page0Container));
    store.newReferencesOfCurrentPage = [retained, unrelated];
    store.finishPage(0, 0);

    const page1Container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(page1Container, page1Container));
    store.newReferencesOfCurrentPage = [removed];
    store.finishPage(0, 1);

    const ownKeys = jasmine
      .createSpy("ownKeys")
      .and.callFake((target) => Reflect.ownKeys(target));
    store.resolvedReferences = new Proxy(store.resolvedReferences, {
      ownKeys,
    });
    store.unresolvedReferences = new Proxy(store.unresolvedReferences, {
      ownKeys,
    });

    store.removeReferencesFromPages(0, 1);

    expect(ownKeys).not.toHaveBeenCalled();
    expect(store.unresolvedReferences.target).toEqual([retained]);
    expect(store.resolvedReferences.other).toEqual([unrelated]);
    expect(store.isUnresolvedReference(removed)).toBe(false);
  });
});

describe("CounterStore", function () {
  it("compares references by their target and page only", function () {
    const resolved = new Counters.TargetCounterReference("target", true);
    const unresolved = new Counters.TargetCounterReference("target", false);
    resolved.spineIndex = unresolved.spineIndex = 0;
    resolved.pageIndex = unresolved.pageIndex = 2;
    const elsewhere = new Counters.TargetCounterReference("target", true);
    elsewhere.spineIndex = 0;
    elsewhere.pageIndex = 3;

    expect(resolved.equals(unresolved)).toBe(true);
    expect(resolved.equals(elsewhere)).toBe(false);
    expect(resolved.equals(null)).toBe(false);
  });

  it("removes the references recorded on a range of pages", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const references = [0, 1, 2, 3].map(
      () => new Counters.TargetCounterReference("target", false),
    );
    references.forEach((reference, pageIndex) => {
      const container = document.createElement("div");
      store.setCurrentPage(new Vtree.Page(container, container));
      store.newReferencesOfCurrentPage = [reference];
      store.finishPage(0, pageIndex);
    });
    const otherSpineReference = new Counters.TargetCounterReference(
      "target",
      false,
    );
    const otherContainer = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(otherContainer, otherContainer));
    store.newReferencesOfCurrentPage = [otherSpineReference];
    store.finishPage(1, 1);

    store.removeReferencesFromPages(0, 1, 3);

    expect(store.unresolvedReferences.target).toEqual([
      references[0],
      references[3],
      otherSpineReference,
    ]);
    expect(store.isUnresolvedReference(references[1])).toBe(false);
    expect(store.isUnresolvedReference(references[2])).toBe(false);
    expect(store.isUnresolvedReference(otherSpineReference)).toBe(true);
  });

  function createNodeContext(id) {
    const element = document.createElement("h2");
    element.setAttribute("data-vivliostyle-id", id);
    const nodeContext = new Vtree.NodeContext(
      element,
      null,
      0,
      new LayoutProcessor.BlockFormattingContext(null),
    );
    nodeContext.viewNode = element;
    return nodeContext;
  }

  it("keeps a frozen reference resolved once it is resolved", function () {
    const reference = new Counters.TargetCounterReference("target", false);

    reference.freeze();
    expect(reference.isResolved()).toBe(false);
    expect(reference.isFrozen()).toBe(true);

    reference.resolve();
    reference.unresolveUnlessFrozen();
    expect(reference.isResolved()).toBe(true);
  });

  it("records a reference adopted from the references being solved", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    store.pushReferencesToSolve([reference]);

    store.resolveReference("target");

    expect(reference.isResolved()).toBe(true);
    expect(store.referencesToSolve).toEqual([]);
    expect(store.newReferencesOfCurrentPage).toEqual([reference]);

    store.resolveReference("target");
    expect(store.newReferencesOfCurrentPage).toEqual([reference]);
  });

  it("constrains only pinned targets to their recorded pages", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.pageIndicesById.pinned = { spineIndex: 0, pageIndex: 2 };
    store.pageIndicesById.free = { spineIndex: 0, pageIndex: 2 };
    store.pageCountersById.pinned = { page: [3] };
    store.pageCountersById.free = { page: [3] };
    store.pageIndicesById.unrendered = { spineIndex: 0, pageIndex: 5 };
    expect(store.pinTargetPages(["pinned", "unrendered"])).toEqual(["pinned"]);
    expect(store.getPinnedTarget("unrendered")).toBeNull();
    const pinned = createNodeContext("pinned");
    const free = createNodeContext("free");

    store.currentPageCounters = { page: [2] };
    expect(store.createLayoutConstraint(1).allowLayout(free)).toBe(true);
    expect(store.createLayoutConstraint(1).allowLayout(pinned)).toBe(false);
    expect(
      store.createLayoutConstraint(1).allowLayout(createNodeContext("unknown")),
    ).toBe(true);
    store.currentPageCounters = { page: [3] };
    expect(store.createLayoutConstraint(2).allowLayout(pinned)).toBe(true);
    store.currentPageCounters = { page: [4] };
    expect(store.createLayoutConstraint(3).allowLayout(pinned)).toBe(true);

    const rawElement = document.createElement("h2");
    rawElement.setAttribute("id", "pinned");
    const rawContext = new Vtree.NodeContext(
      rawElement,
      null,
      0,
      new LayoutProcessor.BlockFormattingContext(null),
    );
    rawContext.viewNode = rawElement;
    store.currentPageCounters = { page: [2] };
    expect(store.createLayoutConstraint(1).allowLayout(rawContext)).toBe(true);
  });

  it("allows every target while nothing is pinned", function () {
    const store = new Counters.CounterStore(documentURLTransformer);

    expect(
      store.createLayoutConstraint(1).allowLayout(createNodeContext("free")),
    ).toBe(true);
  });

  it("does not re-pin an already pinned target", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.pageIndicesById.pinned = { spineIndex: 0, pageIndex: 4 };
    store.pageCountersById.pinned = { page: [30] };
    expect(store.pinTargetPages(["pinned"])).toEqual(["pinned"]);

    store.pageIndicesById.pinned = { spineIndex: 0, pageIndex: 6 };
    store.pageCountersById.pinned = { page: [32] };
    expect(store.pinTargetPages(["pinned"])).toEqual([]);
    expect(store.getPinnedTarget("pinned").pageIndex).toBe(4);
    expect(store.getPinnedTarget("pinned").pageNumber).toBe(30);
  });

  it("stops detecting value changes for every reference of a frozen target", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", true);
    reference.spineIndex = 0;
    reference.pageIndex = 0;
    const liveReference = new Counters.TargetCounterReference("target", true);
    liveReference.spineIndex = 0;
    liveReference.pageIndex = 1;
    store.pageIndicesById.target = { spineIndex: 0, pageIndex: 3 };
    store.pageCountersById.target = { page: [4] };
    store.resolvedReferences.target = [reference, liveReference];
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () =>
      String(store.pageCountersById.target.page[0]),
    );
    expect(store.freezeTargetReferences([reference]).length).toBe(1);

    const container = document.createElement("div");
    const element = document.createElement("span");
    container.appendChild(element);
    const page = new Vtree.Page(container, container);
    page.elementsById.target = [element];
    store.currentPageCounters = { page: [3] };
    store.setCurrentPage(page);
    store.finishPage(0, 2);

    expect(reference.isResolved()).toBe(true);
    expect(liveReference.isResolved()).toBe(true);
    expect(store.resolvedReferences.target).toEqual([reference, liveReference]);
  });

  it("stops pushing a pinned target after two pages", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.pageIndicesById.pinned = { spineIndex: 0, pageIndex: 4 };
    store.pageCountersById.pinned = { page: [30] };
    store.pinTargetPages(["pinned"]);
    const pinned = createNodeContext("pinned");
    store.currentPageCounters = { page: [1] };

    expect(store.createLayoutConstraint(5).allowLayout(pinned)).toBe(false);
    expect(store.createLayoutConstraint(6).allowLayout(pinned)).toBe(true);
  });

  it("answers whether a page has unresolved references", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const container = document.createElement("div");
    const page = new Vtree.Page(container, container);
    page.elementsById.target = [];
    const reference = new Counters.TargetCounterReference("target", false);
    store.unresolvedReferences.target = [reference];

    expect(store.hasUnresolvedReferencesToPage(page)).toBe(true);
    reference.resolve();
    expect(store.hasUnresolvedReferencesToPage(page)).toBe(false);
  });

  it("clamps the counters of a pinned target on the page being laid out", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const id = "http://example.com/a.html#x";
    const container = document.createElement("div");
    const page = new Vtree.Page(container, container);
    page.elementsById[id] = [document.createElement("span")];
    store.pageIndicesById[id] = { spineIndex: 0, pageIndex: 3 };
    store.pageCountersById[id] = { page: [4] };
    store.pinTargetPages([id]);
    store.setCurrentPage(page);
    store.currentPageCounters = { page: [2] };

    expect(resolver.getTargetPageCounters(id)).toEqual({ page: [4] });
    expect(store.getPageCountersOfTarget(id)).toEqual({ page: [4] });
    expect(store.currentPageCounters).toEqual({ page: [2] });
    store.currentPageCounters = { page: [5] };
    expect(resolver.getTargetPageCounters(id)).toEqual({ page: [5] });
  });

  it("compares pinned targets by the page number a page displays", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.pageIndicesById.pinned = { spineIndex: 1, pageIndex: 0 };
    store.pageCountersById.pinned = { page: [5, 3] };
    store.pinTargetPages(["pinned"]);
    const pinned = createNodeContext("pinned");

    expect(store.getPinnedTarget("pinned").pageNumber).toBe(3);
    store.currentPageCounters = { page: [5, 2] };
    expect(store.createLayoutConstraint(0).allowLayout(pinned)).toBe(false);
    store.currentPageCounters = { page: [5, 3] };
    expect(store.createLayoutConstraint(0).allowLayout(pinned)).toBe(true);

    store.adjustPageCountersOfLaterSpines(0, -2);

    expect(store.pageCountersById.pinned).toEqual({ page: [3, 3] });
    expect(store.getPageCountersOfTarget("pinned")).toEqual({ page: [3, 3] });

    store.pageCountersById.pinned = { page: [3, 2] };
    expect(store.getPageCountersOfTarget("pinned")).toEqual({ page: [3, 3] });
    expect(store.pageCountersById.pinned).toEqual({ page: [3, 2] });
  });

  it("updates page counter nodes from the page's own snapshot", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const container = document.createElement("div");
    const node = document.createElement("span");
    const expr = { key: "page-counter-key", str: "page-counter-page" };
    store.registerPageCounterExpr("page", (values) => String(values[0]), expr);
    node.setAttribute(Counters.PAGE_COUNTER_ATTR, expr.key);
    container.appendChild(node);
    const page = new Vtree.Page(container, container);
    page.elementsById.target = [];
    store.pageIndicesById.target = { spineIndex: 0, pageIndex: 0 };
    store.pageCountersById.target = { page: [7] };
    store.pinTargetPages(["target"]);

    store.updatePageCounterNodesInPages([page], [{ page: [5] }]);
    expect(node.textContent).toBe("5");

    store.updatePageCounterNodesInPages([page]);
    expect(node.textContent).toBe("7");

    store.pageCountersById.target = { page: [5] };
    store.updatePageCounterNodesInPages([page]);
    expect(node.textContent).toBe("5");
  });

  it("keeps a reference unresolved once any expression on the page left it unresolved", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));

    store.saveUnresolvedReferenceOfCurrentPage("first");
    store.resolveReference("first");
    store.resolveReference("second");
    store.saveUnresolvedReferenceOfCurrentPage("second");

    expect(store.newReferencesOfCurrentPage.length).toBe(2);
    expect(
      store.newReferencesOfCurrentPage.every(
        (reference) => !reference.isResolved(),
      ),
    ).toBe(true);

    store.registerTargetReferenceExpr(
      { str: "expr-first" },
      "first",
      () => "7",
    );
    const evaluatedNode = document.createElement("span");
    evaluatedNode.setAttribute(
      Counters.TARGET_COUNTER_ATTR,
      store.getTargetReferenceKey("expr-first"),
    );
    evaluatedNode.setAttribute(Counters.TARGET_VALUE_ATTR, "7");
    container.appendChild(evaluatedNode);
    store.finishPage(0, 0);
    expect(store.unresolvedReferences.first.length).toBe(1);
    expect((store.resolvedReferences.first || []).length).toBe(0);
    store.setCurrentPage(new Vtree.Page(container, container));
    const pending = new Counters.TargetCounterReference("first", false);
    store.pushReferencesToSolve([pending]);
    store.resolveReference("first");

    expect(store.newReferencesOfCurrentPage).toEqual([pending]);
    expect(pending.isResolved()).toBe(true);
  });

  it("invalidates references when a discarded target is rendered again", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const container = document.createElement("div");
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () => {
      const counters = store.pageCountersById.target;
      return counters ? String(counters.page[0]) : null;
    });
    const targetPage = new Vtree.Page(container, container);
    targetPage.elementsById.target = [];
    store.currentPageCounters = { page: [2] };
    store.setCurrentPage(targetPage);
    store.finishPage(1, 0);
    store.setCurrentPage(new Vtree.Page(container, container));
    store.resolveReference("target");
    store.finishPage(1, 1);
    const [reference] = store.resolvedReferences.target;

    store.discardTargetSnapshotsOfSpine(1);
    store.setCurrentPage(targetPage);
    store.finishPage(1, 0);

    expect(reference.isResolved()).toBe(false);
  });

  it("resolves a pinned target no earlier than its pinned page number", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const shared = { page: [3] };
    store.pageIndicesById.pinned = { spineIndex: 1, pageIndex: 0 };
    store.pageIndicesById.free = { spineIndex: 1, pageIndex: 0 };
    store.pageCountersById.pinned = shared;
    store.pageCountersById.free = shared;
    store.pinTargetPages(["pinned"]);

    store.adjustPageCountersOfLaterSpines(0, -1);

    expect(store.pageCountersById.free).toEqual({ page: [2] });
    expect(store.pageCountersById.pinned).toEqual({ page: [2] });
    expect(store.getPageCountersOfTarget("free")).toEqual({ page: [2] });
    expect(store.getPageCountersOfTarget("pinned")).toEqual({ page: [3] });

    store.adjustPageCountersOfLaterSpines(0, 2);

    expect(store.pageCountersById.pinned).toEqual({ page: [4] });
    expect(store.getPageCountersOfTarget("pinned")).toEqual({ page: [4] });
  });

  it("unfreezes the references of a discarded spine", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    store.unresolvedReferences.target = [reference];
    store.pageIndicesById.target = { spineIndex: 1, pageIndex: 0 };
    store.pageCountersById.target = { page: [3] };
    store.freezeTargetReferences([reference]);
    store.settleFrozenReferences([reference]);
    expect(reference.isFrozen()).toBe(true);

    store.discardTargetSnapshotsOfSpine(1);

    expect(reference.isFrozen()).toBe(false);
    reference.unresolveUnlessFrozen();
    expect(reference.isResolved()).toBe(false);
  });

  it("formats target-counters() from the target's page counters", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const expr = resolver.getTargetCountersVal(
      "#x",
      "chapter",
      (values) => values.join("."),
      "decimal",
    );
    store.pageCountersById["http://example.com/a.html#x"] = {
      page: [5],
      chapter: [1, 2],
    };

    expect(
      store.targetReferenceExprs
        .get(store.getTargetReferenceKey(expr.str))
        .getResolvedValue(),
    ).toBe("1.2");
  });

  it("tracks the page a pinned target was last finished on", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const container = document.createElement("div");
    const pinned = createNodeContext("pinned");
    store.pageIndicesById.pinned = { spineIndex: 1, pageIndex: 0 };
    store.pageCountersById.pinned = { page: [3] };
    store.pinTargetPages(["pinned"]);

    store.currentPageCounters = { page: [2] };
    expect(store.createLayoutConstraint(0).allowLayout(pinned)).toBe(false);
    store.currentPageCounters = { page: [3] };
    expect(store.createLayoutConstraint(0).allowLayout(pinned)).toBe(true);

    store.currentPageCounters = { page: [4] };
    const page = new Vtree.Page(container, container);
    page.elementsById.pinned = [pinned.viewNode];
    store.setCurrentPage(page);
    store.finishPage(1, 1);

    expect(store.getPinnedTarget("pinned")).toEqual({
      pageNumber: 4,
      pageIndex: 0,
    });
    store.currentPageCounters = { page: [3] };
    expect(store.createLayoutConstraint(0).allowLayout(pinned)).toBe(false);

    store.currentPageCounters = { page: [2] };
    store.setCurrentPage(page);
    store.finishPage(1, 1);

    expect(store.getPinnedTarget("pinned").pageNumber).toBe(2);
  });

  it("freezes reference values and settles the frozen references", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    store.unresolvedReferences.target = [reference];
    let value = "5";
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () => value);
    store.pageIndicesById.target = { spineIndex: 0, pageIndex: 0 };
    store.pageCountersById.target = { page: [1] };

    store.freezeTargetReferences([reference]);
    value = "6";

    expect(reference.isFrozen()).toBe(true);
    expect(reference.isResolved()).toBe(false);
    expect(store.getFrozenTargetValue("expr")).toBe("5");
    expect(store.isUnresolvedReference(reference)).toBe(true);

    store.settleFrozenReferences([reference]);

    expect(reference.isResolved()).toBe(true);
    expect(store.unresolvedReferences.target).toEqual([]);
    expect(store.resolvedReferences.target).toEqual([reference]);
    expect(store.isUnresolvedReference(reference)).toBe(false);
  });

  it("adopts a reference being solved when it is saved on the current page", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    store.pushReferencesToSolve([reference]);

    store.saveUnresolvedReferenceOfCurrentPage("target");

    expect(store.referencesToSolve).toEqual([]);
    expect(store.newReferencesOfCurrentPage.length).toBe(1);
    expect(store.newReferencesOfCurrentPage[0]).toBe(reference);
    expect(reference.isResolved()).toBe(false);
  });

  it("remembers custom page-controlled counters across pages", function () {
    const store = new Counters.CounterStore(documentURLTransformer);

    expect(store.customPageControlledCountersEverDeclared()).toBe(false);
    store.setPageControlledCounterNames(["page"]);
    expect(store.customPageControlledCountersEverDeclared()).toBe(false);
    store.setPageControlledCounterNames(["chapter-page"]);
    expect(store.customPageControlledCountersEverDeclared()).toBe(true);
    store.setPageControlledCounterNames([]);
    expect(store.customPageControlledCountersEverDeclared()).toBe(true);
    expect(store.isPageControlledCounter("chapter-page")).toBe(false);
  });

  it("freezes expressions registered after their target was frozen", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    store.unresolvedReferences.target = [reference];
    let value = "5";
    store.registerTargetReferenceExpr({ str: "first" }, "target", () => value);
    store.pageIndicesById.target = { spineIndex: 0, pageIndex: 0 };
    store.pageCountersById.target = { page: [1] };

    expect(store.freezeTargetReferences([reference]).length).toBe(1);
    expect(store.freezeTargetReferences([reference]).length).toBe(0);
    value = "6";
    store.registerTargetReferenceExpr({ str: "second" }, "target", () => value);

    expect(store.getFrozenTargetValue("first")).toBe("5");
    expect(store.getFrozenTargetValue("second")).toBe("6");
  });

  it("drops references of removed pages from the solving stacks", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const removed = new Counters.TargetCounterReference("target", false);
    const retained = new Counters.TargetCounterReference("target", false);
    const page0Container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(page0Container, page0Container));
    store.newReferencesOfCurrentPage = [retained];
    store.finishPage(0, 0);
    const page1Container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(page1Container, page1Container));
    store.newReferencesOfCurrentPage = [removed];
    store.finishPage(0, 1);
    store.pushReferencesToSolve([removed, retained]);
    store.pushReferencesToSolve([retained]);

    store.removeReferencesFromPages(0, 1);

    expect(store.referencesToSolve).toEqual([retained]);
    expect(store.referencesToSolveStack).toEqual([[], [retained]]);
  });

  function createResolver(store, baseURL) {
    const scope = new Exprs.LexicalScope(null, null);
    return store.createCounterResolver(baseURL, scope, scope);
  }

  it("registers one expression per target-counters() call shape through the content visitor", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const cascade = {
      counterStyleStore: { format: (type, num) => `${type}:${num}` },
    };
    const visit = (separator) =>
      new CssCascade.ContentPropVisitor(
        cascade,
        null,
        resolver,
        {},
      ).visitFuncTargetCounters([
        new Css.URL("#x"),
        Css.getName("chapter"),
        new Css.Str(separator),
      ]);

    visit(".");
    visit(".");
    expect(store.targetReferenceExprs.size).toBe(1);
    visit("-");
    expect(store.targetReferenceExprs.size).toBe(2);
  });

  it("registers one expression per reference and number format, and per formatting document for counters", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const first = createResolver(store, "http://example.com/a.html");
    const second = createResolver(store, "http://example.com/b.html");

    const expr = first.getTargetTextVal("#x", "content");
    first.getTargetTextVal("#x", "content");
    second.getTargetTextVal("#x", "content");
    first.getTargetCounterVal("#x", "page", (n) => String(n), "decimal");
    first.getTargetCounterVal("#x", "page", (n) => String(n), "lower-roman");
    expect(store.targetReferenceExprs.size).toBe(4);
    first.getTargetCounterVal("#x", "page", (n) => String(n), "decimal");
    first.getTargetCounterVal("#x", "page", (n) => String(n), "lower-roman");
    expect(store.targetReferenceExprs.size).toBe(4);

    first.getTargetCounterVal("#x", "chapter", (n) => String(n), "decimal");
    expect(store.targetReferenceExprs.size).toBe(5);
    const third = createResolver(store, "http://example.com/c.html");
    third.getTargetCounterVal(
      "http://example.com/a.html#x",
      "page",
      (n) => String(n),
      "decimal",
    );
    expect(store.targetReferenceExprs.size).toBe(6);
    third.getTargetTextVal("http://example.com/a.html#x", "content");
    expect(store.targetReferenceExprs.size).toBe(6);

    const join = (values) => values.join(".");
    first.getTargetCountersVal("#x", "page", join, '["decimal","."]');
    first.getTargetCountersVal("#x", "page", join, '["decimal","-"]');
    expect(store.targetReferenceExprs.size).toBe(8);
    first.getTargetCountersVal("#x", "page", join, '["decimal","."]');
    expect(store.targetReferenceExprs.size).toBe(8);
    expect(
      store.targetReferenceExprs.has(store.getTargetReferenceKey(expr.str)),
    ).toBe(true);
    expect(expr.str.startsWith("target-text-")).toBe(true);
  });

  it("resolves target-counter() from element counters before the target page is finished", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const expr = resolver.getTargetCounterVal(
      "#x",
      "chapter",
      (n) => `ch${n}`,
      "decimal",
    );
    const entry = store.targetReferenceExprs.get(
      store.getTargetReferenceKey(expr.str),
    );

    expect(entry.getResolvedValue()).toBeNull();
    store.countersById["http://example.com/a.html#x"] = { chapter: [3] };
    expect(entry.getResolvedValue()).toBe("ch3");
  });

  it("resolves target-text() for first-letter from the recorded text", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    store.pageTextById["http://example.com/a.html#x"] = {
      before: "",
      content: "Alpha",
      after: "",
    };
    const textExpr = resolver.getTargetTextVal("#x", "first-letter");
    expect(
      store.targetReferenceExprs
        .get(store.getTargetReferenceKey(textExpr.str))
        .getResolvedValue(),
    ).toBe("A");
  });

  it("creates references to frozen targets as settled", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    store.unresolvedReferences.target = [reference];
    store.pageIndicesById.target = { spineIndex: 0, pageIndex: 0 };
    store.pageCountersById.target = { page: [1] };
    store.freezeTargetReferences([reference]);

    store.saveUnresolvedReferenceOfCurrentPage("target");
    store.saveUnresolvedReferenceOfCurrentPage("other");

    const [created, other] = store.newReferencesOfCurrentPage;
    expect(created.targetId).toBe("target");
    expect(created.isFrozen()).toBe(true);
    expect(created.isResolved()).toBe(true);
    expect(other.isFrozen()).toBe(false);
    expect(other.isResolved()).toBe(false);
  });

  it("updates running copies of target references on the last page", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const counterExpr = resolver.getTargetCounterVal(
      "#x",
      "page",
      (n) => String(n),
      "decimal",
    );
    const textExpr = resolver.getTargetTextVal("#x", "content");
    store.pageCountersById["http://example.com/a.html#x"] = { page: [7] };
    store.pageTextById["http://example.com/a.html#x"] = { content: "Seven" };
    const root = document.createElement("div");
    const counterNode = document.createElement("span");
    counterNode.setAttribute(
      Counters.TARGET_COUNTER_ATTR,
      store.getTargetReferenceKey(counterExpr.str),
    );
    counterNode.setAttribute(Counters.TARGET_COUNTER_IN_RUNNING_ATTR, "true");
    const textNode = document.createElement("span");
    textNode.setAttribute(
      Counters.TARGET_TEXT_ATTR,
      store.getTargetReferenceKey(textExpr.str),
    );
    textNode.setAttribute(Counters.TARGET_TEXT_IN_RUNNING_ATTR, "true");
    root.appendChild(counterNode);
    root.appendChild(textNode);

    store.finishLastPage({ root: root, contentContainer: root });

    expect(counterNode.textContent).toBe("7");
    expect(textNode.textContent).toBe("Seven");
  });

  it("does not freeze references to targets that have no page yet", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    store.unresolvedReferences.target = [reference];

    expect(store.freezeTargetReferences([reference])).toEqual([]);
    expect(reference.isFrozen()).toBe(false);
    store.settleFrozenReferences([reference]);
    expect(reference.isResolved()).toBe(false);
  });

  it("resolves a re-registered expression through its latest resolver", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () => "old");
    const key = store.getTargetReferenceKey("expr");
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () => "new");

    expect(store.targetReferenceExprs.size).toBe(1);
    expect(store.getTargetReferenceKey("expr")).toBe(key);
    expect(
      store.targetReferenceExprs
        .get(store.getTargetReferenceKey("expr"))
        .getResolvedValue(),
    ).toBe("new");
  });

  it("updates running copies of target references from their resolved values", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    let value = "3";
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () => value);
    const root = document.createElement("div");
    const copy = document.createElement("span");
    copy.setAttribute(
      Counters.TARGET_COUNTER_ATTR,
      store.getTargetReferenceKey("expr"),
    );
    copy.setAttribute(Counters.TARGET_COUNTER_IN_RUNNING_ATTR, "true");
    copy.textContent = "2";
    root.appendChild(copy);

    store.updateRunningTargetReferenceNodes(root);

    expect(copy.textContent).toBe("3");
    expect(copy.getAttribute(Counters.TARGET_VALUE_ATTR)).toBe("3");
  });

  it("gives each target reference expression a stable short key", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.registerTargetReferenceExpr(
      { str: "target-counter-[1]" },
      "target",
      () => null,
    );
    store.registerTargetReferenceExpr(
      { str: "target-counter-[2]" },
      "target",
      () => null,
    );
    const first = store.getTargetReferenceKey("target-counter-[1]");
    const second = store.getTargetReferenceKey("target-counter-[2]");

    expect(first).not.toBe(second);
    expect(store.getTargetReferenceKey("target-counter-[1]")).toBe(first);
    expect(first).toMatch(/^\d+$/);
    expect(store.getTargetReferenceKey("target-counter-[3]")).toBeUndefined();
  });

  it("unpins and unfreezes the targets of a discarded spine", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    store.unresolvedReferences.target = [reference];
    store.pageIndicesById.target = { spineIndex: 1, pageIndex: 0 };
    store.pageCountersById.target = { page: [3] };
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () =>
      store.pageCountersById.target ? "3" : null,
    );
    store.pinTargetPages(["target"]);
    store.freezeTargetReferences([reference]);

    store.discardTargetSnapshotsOfSpine(1);
    store.registerTargetReferenceExpr({ str: "later" }, "target", () => "9");
    store.resolveReference("target");

    expect(store.getPinnedTarget("target")).toBeNull();
    expect(store.getFrozenTargetValue("expr")).toBeUndefined();
    expect(store.getFrozenTargetValue("later")).toBeUndefined();
    expect(reference.isFrozen()).toBe(false);
    expect(store.newReferencesOfCurrentPage[0].isFrozen()).toBe(false);
  });

  it("leaves the snapshots of estimated spines alone when shifting page counters", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.pageIndicesById.adjusted = { spineIndex: 1, pageIndex: 0 };
    store.pageIndicesById.estimated = { spineIndex: 2, pageIndex: 0 };
    store.pageCountersById.adjusted = { page: [3] };
    store.pageCountersById.estimated = { page: [9] };
    store.namedStringPageSnapshots[5] = {
      lastOffset: 5,
      spineIndex: 2,
      counters: { page: [9] },
    };

    store.adjustPageCountersOfLaterSpines(0, -1, Infinity, new Set([2]));

    expect(store.pageCountersById.adjusted).toEqual({ page: [2] });
    expect(store.pageCountersById.estimated).toEqual({ page: [9] });
    expect(store.namedStringPageSnapshots[5].counters).toEqual({ page: [9] });
  });

  it("discards the target snapshots of a spine but keeps its page indices", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.pageIndicesById.kept = { spineIndex: 0, pageIndex: 0 };
    store.pageIndicesById.dropped = { spineIndex: 1, pageIndex: 0 };
    store.pageCountersById.kept = { page: [1] };
    store.pageCountersById.dropped = { page: [2] };
    store.pageDocCountersById.dropped = { item: [1] };
    store.pageTextById.dropped = { content: "dropped" };
    store.pageIndicesById.later = { spineIndex: 2, pageIndex: 0 };
    store.pageCountersById.later = { page: [3] };
    store.namedStringPageSnapshots[0] = {
      lastOffset: 0,
      spineIndex: 0,
      counters: { page: [1] },
    };
    store.namedStringPageSnapshots[1] = {
      lastOffset: 1,
      spineIndex: 1,
      counters: { page: [2] },
    };

    store.discardTargetSnapshotsOfSpine(1);

    expect(store.pageIndicesById.dropped).toEqual({
      spineIndex: 1,
      pageIndex: 0,
    });
    expect("dropped" in store.pageCountersById).toBe(false);
    expect("dropped" in store.pageDocCountersById).toBe(false);
    expect("dropped" in store.pageTextById).toBe(false);
    expect(store.pageCountersById.kept).toEqual({ page: [1] });
    expect(store.pageCountersById.later).toEqual({ page: [3] });
    expect(1 in store.namedStringPageSnapshots).toBe(false);
    expect(0 in store.namedStringPageSnapshots).toBe(true);
  });

  it("drops empty reference buckets when pages are removed", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", true);
    const unresolved = new Counters.TargetCounterReference("target", false);
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));
    store.newReferencesOfCurrentPage = [reference, unresolved];
    store.finishPage(0, 0);
    expect("target" in store.resolvedReferences).toBe(true);
    expect("target" in store.unresolvedReferences).toBe(true);

    store.removeReferencesFromPages(0, 0);

    expect("target" in store.resolvedReferences).toBe(false);
    expect("target" in store.unresolvedReferences).toBe(false);
  });

  it("unresolves a reference whose target changed after it was resolved on the page", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const id = "http://example.com/a.html#target";
    store.pageIndicesById[id] = { spineIndex: 1, pageIndex: 0 };
    store.pageCountersById[id] = { page: [3] };
    resolver.getTargetCounterVal(
      "#target",
      "page",
      (n) => String(n),
      "decimal",
    );
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));

    store.resolveReference(id);
    store.adjustPageCountersOfLaterSpines(0, -1);
    store.finishPage(0, 0);

    expect(store.resolvedReferences[id]).toBeUndefined();
    expect(store.unresolvedReferences[id].length).toBe(1);
    expect(store.unresolvedReferences[id][0].isResolved()).toBe(false);
  });

  it("keeps a reference resolved when its pinned target is shifted below the pin", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const id = "http://example.com/a.html#target";
    store.pageIndicesById[id] = { spineIndex: 1, pageIndex: 0 };
    store.pageCountersById[id] = { page: [3] };
    store.pinTargetPages([id]);
    const expr = resolver.getTargetCounterVal(
      "#target",
      "page",
      (n) => String(n),
      "decimal",
    );
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));

    store.resolveReference(id);
    store.adjustPageCountersOfLaterSpines(0, -1);
    store.finishPage(0, 0);

    expect(store.pageCountersById[id]).toEqual({ page: [2] });
    expect(
      store.targetReferenceExprs
        .get(store.getTargetReferenceKey(expr.str))
        .getResolvedValue(),
    ).toBe("3");
    expect(store.resolvedReferences[id].length).toBe(1);
    expect(store.unresolvedReferences[id] || []).toEqual([]);
  });

  it("resolves the references of a finished page by the values its nodes were laid out with", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () => "3");
    const key = store.getTargetReferenceKey("expr");
    function finishPageWithValues(pageIndex, values, extraNodes = []) {
      const container = document.createElement("div");
      for (const value of values) {
        const node = document.createElement("span");
        node.setAttribute(Counters.TARGET_COUNTER_ATTR, key);
        node.setAttribute(Counters.TARGET_VALUE_ATTR, value);
        container.appendChild(node);
      }
      for (const node of extraNodes) {
        container.appendChild(node);
      }
      store.setCurrentPage(new Vtree.Page(container, container));
      store.finishPage(0, pageIndex);
    }

    finishPageWithValues(0, ["3"]);
    expect(store.resolvedReferences.target.length).toBe(1);
    expect(store.unresolvedReferences.target).toBeUndefined();

    finishPageWithValues(1, ["2"]);
    expect(store.unresolvedReferences.target.length).toBe(1);
    expect(store.unresolvedReferences.target[0].pageIndex).toBe(1);

    finishPageWithValues(2, ["3", "2"]);
    expect(store.unresolvedReferences.target.length).toBe(2);
    expect(store.resolvedReferences.target.length).toBe(1);

    const runningCopy = document.createElement("span");
    runningCopy.setAttribute(Counters.TARGET_COUNTER_ATTR, key);
    runningCopy.setAttribute(Counters.TARGET_COUNTER_IN_RUNNING_ATTR, "true");
    runningCopy.setAttribute(Counters.TARGET_VALUE_ATTR, "2");
    finishPageWithValues(3, ["3"], [runningCopy]);
    expect(store.unresolvedReferences.target.length).toBe(2);
    expect(store.resolvedReferences.target.length).toBe(2);

    finishPageWithValues(1, ["3"]);
    expect(store.unresolvedReferences.target.length).toBe(1);
    expect(store.unresolvedReferences.target[0].pageIndex).toBe(2);
    expect(store.resolvedReferences.target.length).toBe(3);

    finishPageWithValues(3, []);
    expect(store.unresolvedReferences.target.length).toBe(1);
    expect(store.unresolvedReferences.target[0].pageIndex).toBe(2);
    expect(store.resolvedReferences.target.length).toBe(2);

    finishPageWithValues(4, ["2", "3"]);
    expect(store.unresolvedReferences.target.length).toBe(2);
    expect(store.resolvedReferences.target.length).toBe(2);
  });

  it("leaves a reference unresolved when the page carrying its node is finished without a target value", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () => null);
    const key = store.getTargetReferenceKey("expr");
    const container = document.createElement("div");
    const node = document.createElement("span");
    node.setAttribute(Counters.TARGET_COUNTER_ATTR, key);
    node.setAttribute(Counters.TARGET_VALUE_ATTR, "3");
    container.appendChild(node);
    store.setCurrentPage(new Vtree.Page(container, container));
    store.finishPage(0, 0);

    expect(store.resolvedReferences.target).toBeUndefined();
    expect(store.unresolvedReferences.target.length).toBe(1);
    expect(store.unresolvedReferences.target[0].pageIndex).toBe(0);
  });

  it("wraps target-counter(), target-counters(), and target-text() content in reference nodes", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const listener = store.getExprContentListener();
    const format = (n) => String(n);
    const exprs = [
      [
        resolver.getTargetCounterVal("#x", "page", format, "decimal"),
        Counters.TARGET_COUNTER_ATTR,
      ],
      [
        resolver.getTargetCountersVal(
          "#x",
          "page",
          (values) => values.join("."),
          "decimal",
        ),
        Counters.TARGET_COUNTER_ATTR,
      ],
      [resolver.getTargetTextVal("#x", "content"), Counters.TARGET_TEXT_ATTR],
    ];

    for (const [expr, attribute] of exprs) {
      const node = listener(expr, "7", document);
      expect(node.getAttribute(attribute)).toBe(
        store.getTargetReferenceKey(expr.str),
      );
      expect(node.getAttribute(Counters.TARGET_VALUE_ATTR)).toBe("7");
      expect(node.textContent).toBe("7");
    }
  });

  it("invalidates a target-text() reference when the target is finished with other text", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const id = "http://example.com/a.html#target";
    store.pageIndicesById[id] = { spineIndex: 0, pageIndex: 1 };
    store.pageCountersById[id] = { page: [2] };
    store.pageTextById[id] = { content: "old" };
    const textExpr = resolver.getTargetTextVal("#target", "content");
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));
    store.resolveReference(id);
    store.finishPage(0, 0);
    const [reference] = store.resolvedReferences[id];
    const target = document.createElement("p");
    target.textContent = "new";
    const targetContainer = document.createElement("div");
    const staleNode = document.createElement("span");
    staleNode.setAttribute(
      Counters.TARGET_TEXT_ATTR,
      store.getTargetReferenceKey(textExpr.str),
    );
    staleNode.setAttribute(Counters.TARGET_VALUE_ATTR, "old");
    targetContainer.appendChild(staleNode);
    const targetPage = new Vtree.Page(targetContainer, targetContainer);
    targetPage.elementsById[id] = [target];
    store.setCurrentPage(targetPage);
    store.currentPageCounters = { page: [2] };

    store.finishPage(0, 1);

    expect(store.pageTextById[id].content).toBe("new");
    expect(reference.isResolved()).toBe(false);
    expect(store.unresolvedReferences[id].length).toBe(2);
    expect((store.resolvedReferences[id] || []).length).toBe(0);
  });

  it("evaluates frozen expressions to their frozen values and resolves their references", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const id = "http://example.com/a.html#x";
    const counterExpr = resolver.getTargetCounterVal(
      "#x",
      "page",
      (n) => String(n),
      "decimal",
    );
    const countersExpr = resolver.getTargetCountersVal(
      "#x",
      "page",
      (values) => values.join("."),
      "decimal",
    );
    const textExpr = resolver.getTargetTextVal("#x", "content");
    const reference = new Counters.TargetCounterReference(id, false);
    store.unresolvedReferences[id] = [reference];
    store.pageCountersById[id] = { page: [3] };
    store.pageTextById[id] = { content: "Three" };
    store.freezeTargetReferences([reference]);
    store.pageCountersById[id] = { page: [5] };
    store.pageTextById[id] = { content: "Five" };
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));

    expect(counterExpr.fn()).toBe("3");
    expect(countersExpr.fn()).toBe("3");
    expect(textExpr.fn()).toBe("Three");
    expect(store.newReferencesOfCurrentPage.length).toBe(1);
    expect(store.newReferencesOfCurrentPage[0].isResolved()).toBe(true);
  });

  it("keeps a reference resolved when it was created after its target value changed", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.pageIndicesById.target = { spineIndex: 1, pageIndex: 0 };
    store.pageCountersById.target = { page: [5] };
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () =>
      store.pageCountersById.target
        ? String(store.pageCountersById.target.page[0])
        : null,
    );
    store.adjustPageCountersOfLaterSpines(0, 1, Infinity, new Set());
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));
    store.resolveReference("target");

    store.finishPage(0, 0);

    expect(store.resolvedReferences.target.length).toBe(1);
    expect(store.resolvedReferences.target[0].isResolved()).toBe(true);
    expect(store.unresolvedReferences.target).toBeUndefined();
  });

  it("keeps a rendered reference resolved when it was laid out after its target value changed", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.pageIndicesById.target = { spineIndex: 1, pageIndex: 0 };
    store.pageCountersById.target = { page: [5] };
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () =>
      store.pageCountersById.target
        ? String(store.pageCountersById.target.page[0])
        : null,
    );
    store.adjustPageCountersOfLaterSpines(0, 1, Infinity, new Set());
    const container = document.createElement("div");
    const node = document.createElement("span");
    node.setAttribute(
      Counters.TARGET_COUNTER_ATTR,
      store.getTargetReferenceKey("expr"),
    );
    node.setAttribute(Counters.TARGET_VALUE_ATTR, "6");
    container.appendChild(node);
    store.setCurrentPage(new Vtree.Page(container, container));

    store.finishPage(0, 0);

    expect(store.resolvedReferences.target.length).toBe(1);
    expect(store.unresolvedReferences.target).toBeUndefined();
  });

  it("moves an adopted reference between buckets when it flips on another page", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", true);
    reference.spineIndex = 0;
    reference.pageIndex = 1;
    store.resolvedReferences.target = [reference];
    store.pushReferencesToSolve([reference]);
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));
    store.saveUnresolvedReferenceOfCurrentPage("target");

    store.finishPage(0, 0);

    expect(store.unresolvedReferences.target).toEqual([reference]);
    expect(store.resolvedReferences.target || []).toEqual([]);
  });

  it("unfreezes a reference being solved when its spine is discarded", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    reference.freeze();
    store.pageIndicesById.target = { spineIndex: 1, pageIndex: 0 };
    store.pushReferencesToSolve([reference]);

    store.discardTargetSnapshotsOfSpine(1);

    expect(reference.isFrozen()).toBe(false);
  });

  it("unfreezes a reference parked on the solving stack when its spine is discarded", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    reference.freeze();
    store.pageIndicesById.target = { spineIndex: 1, pageIndex: 0 };
    store.pushReferencesToSolve([reference]);
    store.pushReferencesToSolve([]);

    store.discardTargetSnapshotsOfSpine(1);

    expect(reference.isFrozen()).toBe(false);
  });

  it("unfreezes a reference of the current page when its spine is discarded", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    reference.freeze();
    store.pageIndicesById.target = { spineIndex: 1, pageIndex: 0 };
    store.newReferencesOfCurrentPage = [reference];

    store.discardTargetSnapshotsOfSpine(1);

    expect(reference.isFrozen()).toBe(false);
  });

  it("keeps every expression of a target up to date when its values change", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.pageIndicesById.target = { spineIndex: 1, pageIndex: 0 };
    store.pageCountersById.target = { page: [5] };
    store.registerTargetReferenceExpr({ str: "a" }, "target", () =>
      String(store.pageCountersById.target.page[0]),
    );
    store.registerTargetReferenceExpr({ str: "b" }, "target", () =>
      String(store.pageCountersById.target.page[0]),
    );
    store.pageCountersById.target = { page: [6] };

    expect(store.updateResolvedValuesOfTarget("target")).toBe(true);
    expect(store.updateResolvedValuesOfTarget("target")).toBe(false);
  });

  it("skips references already resolved when collecting unresolved refs to a page", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    reference.spineIndex = 0;
    reference.pageIndex = 0;
    reference.resolve();
    store.unresolvedReferences.target = [reference];
    const page = { elementsById: { target: [document.createElement("span")] } };

    expect(store.getUnresolvedRefsToPage(page)).toEqual([]);
  });

  it("lets the pin constraint pass for contexts it cannot pin", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.pageIndicesById.pinned = { spineIndex: 0, pageIndex: 3 };
    store.pageCountersById.pinned = { page: [4] };
    store.pinTargetPages(["pinned"]);
    store.currentPageCounters = { page: [2] };
    const constraint = store.createLayoutConstraint(0);
    const nodeContext = createNodeContext("pinned");

    expect(constraint.allowLayout(nodeContext)).toBe(false);
    expect(constraint.allowLayout(null)).toBe(true);
    nodeContext.after = true;
    expect(constraint.allowLayout(nodeContext)).toBe(true);
    nodeContext.after = false;
    nodeContext.viewNode = document.createTextNode("pinned");
    expect(constraint.allowLayout(nodeContext)).toBe(true);
  });

  it("shifts page counters only before the end spine and reports the targets whose values changed", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.pageIndicesById.inside = { spineIndex: 1, pageIndex: 0 };
    store.pageIndicesById.beyond = { spineIndex: 2, pageIndex: 0 };
    store.pageCountersById.inside = { page: [3] };
    store.pageCountersById.beyond = { page: [6] };
    store.registerTargetReferenceExpr({ str: "inside" }, "inside", () =>
      String(store.pageCountersById.inside.page[0]),
    );
    store.registerTargetReferenceExpr({ str: "beyond" }, "beyond", () =>
      String(store.pageCountersById.beyond.page[0]),
    );

    expect(store.adjustPageCountersOfLaterSpines(0, -1, 2)).toEqual(["inside"]);
    expect(store.pageCountersById.inside).toEqual({ page: [2] });
    expect(store.pageCountersById.beyond).toEqual({ page: [6] });
  });

  it("invalidates references resolved from element counters when their target is finished for the first time", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () =>
      store.pageCountersById.target ? "page" : "counters",
    );
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));
    store.resolveReference("target");
    store.finishPage(0, 0);
    const [reference] = store.resolvedReferences.target;
    const targetPage = new Vtree.Page(container, container);
    targetPage.elementsById.target = [document.createElement("span")];
    store.setCurrentPage(targetPage);
    store.currentPageCounters = { page: [2] };

    store.finishPage(0, 1);

    expect(reference.isResolved()).toBe(false);
    expect(store.unresolvedReferences.target).toEqual([reference]);
  });

  it("keeps same-page references resolved when their target is finished for the first time", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const pageCounters = { page: [2] };
    store.registerTargetReferenceExpr({ str: "expr" }, "target", () =>
      store.pageCountersById.target ? String(pageCounters.page[0]) : null,
    );
    const samePageReference = new Counters.TargetCounterReference(
      "target",
      true,
    );
    samePageReference.spineIndex = 0;
    samePageReference.pageIndex = 0;
    store.resolvedReferences.target = [samePageReference];
    const container = document.createElement("div");
    const page = new Vtree.Page(container, container);
    page.elementsById.target = [document.createElement("span")];
    store.setCurrentPage(page);
    store.currentPageCounters = pageCounters;

    store.resolveReference("target");
    store.finishPage(0, 0);

    expect(store.resolvedReferences.target.length).toBe(1);
    expect(store.resolvedReferences.target[0]).toBe(samePageReference);
    expect(samePageReference.isResolved()).toBe(true);
    expect(store.unresolvedReferences.target).toBeUndefined();
  });

  it("stamps a reference node with its key and laid-out value", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const expr = resolver.getTargetCounterVal(
      "#x",
      "page",
      (n) => String(n),
      "decimal",
    );
    spyOn(Logging.logger, "warn");

    const node = store.createTargetReferenceNode(
      document,
      Counters.TARGET_COUNTER_ATTR,
      expr,
      "3",
    );
    expect(node.textContent).toBe("3");
    expect(node.getAttribute(Counters.TARGET_COUNTER_ATTR)).toBe(
      store.getTargetReferenceKey(expr.str),
    );
    expect(node.getAttribute(Counters.TARGET_VALUE_ATTR)).toBe("3");

    const unregistered = store.createTargetReferenceNode(
      document,
      Counters.TARGET_COUNTER_ATTR,
      { str: "unregistered" },
      "4",
    );
    expect(unregistered.textContent).toBe("4");
    expect(unregistered.hasAttribute(Counters.TARGET_COUNTER_ATTR)).toBe(false);
    expect(Logging.logger.warn).toHaveBeenCalledWith(
      "Unregistered target reference: unregistered",
    );
  });

  it("shifts only the outermost page counter of a snapshot that has one", function () {
    const nested = { page: [3, 7] };
    Counters.shiftOutermostPageCounter(nested, -1);
    expect(nested).toEqual({ page: [2, 7] });
    const empty = { page: [] };
    Counters.shiftOutermostPageCounter(empty, -1);
    expect(empty).toEqual({ page: [] });
    const other = { chapter: [1] };
    Counters.shiftOutermostPageCounter(other, -1);
    expect(other).toEqual({ chapter: [1] });
    expect(() => Counters.shiftOutermostPageCounter(null, -1)).not.toThrow();
  });

  it("resolves target-counter() at layout time once the target has a page", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    resolver.setStyler({ styleUntilIdIsReached() {} });
    const id = "http://example.com/a.html#x";
    const expr = resolver.getTargetCounterVal(
      "#x",
      "page",
      (n) => String(n),
      "decimal",
    );
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));
    store.countersById[id] = { chapter: [2] };
    store.pageCountersById[id] = { page: [3] };

    expect(expr.fn()).toBe("3");
    expect(store.newReferencesOfCurrentPage.length).toBe(1);
    expect(store.newReferencesOfCurrentPage[0].isResolved()).toBe(true);
    expect(store.unresolvedTargetIdsOfCurrentPage.has(id)).toBe(false);
  });

  it("postpones target-counter() until the target has counters and then resolves it without a new reference", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    resolver.setStyler({ styleUntilIdIsReached() {} });
    const id = "http://example.com/a.html#x";
    const expr = resolver.getTargetCounterVal(
      "#x",
      "page",
      (n) => String(n),
      "decimal",
    );
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));

    expect(expr.fn()).toBe("??");
    expect(store.unresolvedTargetIdsOfCurrentPage.has(id)).toBe(true);
    expect(store.newReferencesOfCurrentPage[0].isResolved()).toBe(false);

    store.countersById[id] = { chapter: [2] };
    expect(expr.fn()).toBe("??");
    expect(store.newReferencesOfCurrentPage.length).toBe(1);

    store.finishPage(0, 0);
    store.setCurrentPage(new Vtree.Page(container, container));
    store.countersById[id] = { page: [2] };
    expect(expr.fn()).toBe("2");
    expect(store.newReferencesOfCurrentPage.length).toBe(0);
  });

  it("resolves or postpones target-counters() at layout time by the target page", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    resolver.setStyler({ styleUntilIdIsReached() {} });
    const id = "http://example.com/a.html#x";
    const expr = resolver.getTargetCountersVal(
      "#x",
      "page",
      (values) => values.join("."),
      "decimal",
    );
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));

    expect(expr.fn()).toBe("??");
    expect(store.newReferencesOfCurrentPage[0].isResolved()).toBe(false);

    store.finishPage(0, 0);
    store.setCurrentPage(new Vtree.Page(container, container));
    store.pageCountersById[id] = { page: [2, 5] };
    expect(expr.fn()).toBe("5");
    expect(store.newReferencesOfCurrentPage[0].isResolved()).toBe(true);
  });

  it("resolves or postpones target-text() at layout time by the target text", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const id = "http://example.com/a.html#x";
    const expr = resolver.getTargetTextVal("#x", "content");
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));

    expect(expr.fn()).toBe("??");
    expect(store.newReferencesOfCurrentPage[0].isResolved()).toBe(false);

    store.finishPage(0, 0);
    store.setCurrentPage(new Vtree.Page(container, container));
    store.pageTextById[id] = { content: "Target" };
    expect(expr.fn()).toBe("Target");
    expect(store.newReferencesOfCurrentPage[0].isResolved()).toBe(true);
  });

  it("drops the document counter snapshot of a target finished without one", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const container = document.createElement("div");
    const page = new Vtree.Page(container, container);
    page.elementsById.target = [document.createElement("span")];
    store.setCurrentPage(page);
    store.currentPageDocCounters = { item: [1] };
    store.finishPage(0, 0);
    expect(store.pageDocCountersById.target).toEqual({ item: [1] });

    store.setCurrentPage(page);
    store.currentPageDocCounters = null;
    store.finishPage(0, 1);
    expect("target" in store.pageDocCountersById).toBe(false);
  });

  it("solves a copy of the references pushed to it", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const reference = new Counters.TargetCounterReference("target", false);
    const refs = [reference];
    const container = document.createElement("div");
    store.setCurrentPage(new Vtree.Page(container, container));
    store.pushReferencesToSolve(refs);

    store.resolveReference("target");

    expect(refs).toEqual([reference]);
    expect(store.referencesToSolve).toEqual([]);
    expect(store.newReferencesOfCurrentPage).toEqual([reference]);
  });

  it("keeps frozen references resolved when their target is invalidated", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const frozen = new Counters.TargetCounterReference("target", true);
    frozen.freeze();
    const plain = new Counters.TargetCounterReference("target", true);
    store.resolvedReferences.target = [frozen, plain];

    store.unresolveReferences("target");

    expect(store.resolvedReferences.target).toEqual([frozen]);
    expect(store.unresolvedReferences.target).toEqual([plain]);
    expect(frozen.isResolved()).toBe(true);
    expect(plain.isResolved()).toBe(false);
  });

  it("falls back to the content text for a pseudo-element the store does not track", function () {
    const store = new Counters.CounterStore(documentURLTransformer);
    const resolver = createResolver(store, "http://example.com/a.html");
    const firstLineExpr = resolver.getTargetTextVal("#x", "first-line");
    store.pageTextById["http://example.com/a.html#x"] = {
      content: "Seven",
      before: "",
      after: "",
      marker: "",
    };
    const root = document.createElement("div");
    const copy = document.createElement("span");
    copy.setAttribute(
      Counters.TARGET_TEXT_ATTR,
      store.getTargetReferenceKey(firstLineExpr.str),
    );
    copy.setAttribute(Counters.TARGET_TEXT_IN_RUNNING_ATTR, "true");
    root.appendChild(copy);

    store.updateRunningTargetReferenceNodes(root);

    expect(copy.textContent).toBe("Seven");
  });
});
