/**
 * Copyright 2013 Google, Inc.
 * Copyright 2015 Daishinsha Inc.
 * Copyright 2018 Vivliostyle Foundation
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
 *
 * @fileoverview Epub - Deal with META-INF/ and .opf files in EPUB container.
 */
import * as Asserts from "./asserts";
import * as Base from "./base";
import * as CFI from "./cfi";
import * as CmykStore from "./cmyk-store";
import * as Constants from "./constants";
import * as Counters from "./counters";
import * as Css from "./css";
import * as CssCascade from "./css-cascade";
import * as CssParser from "./css-parser";
import * as CssTokenizer from "./css-tokenizer";
import * as Exprs from "./exprs";
import * as Font from "./font";
import * as Logging from "./logging";
import * as Net from "./net";
import * as OPS from "./ops";
import type * as PageFloats from "./page-floats";
import * as Plugin from "./plugin";
import * as SemanticFootnote from "./semantic-footnote";
import * as Task from "./task";
import * as Toc from "./toc";
import * as Vgen from "./vgen";
import * as Vtree from "./vtree";
import * as XmlDoc from "./xml-doc";

function cloneCounterValues(
  counters: CssCascade.CounterValues,
): CssCascade.CounterValues {
  const result = {} as CssCascade.CounterValues;
  Object.keys(counters).forEach((name) => {
    result[name] = Array.from(counters[name]);
  });
  return result;
}

function clonePageGroupPageCounts(source: {
  [pageType: string]: Map<Element, number>;
}): {
  [pageType: string]: Map<Element, number>;
} {
  const cloned = Object.create(null) as {
    [pageType: string]: Map<Element, number>;
  };
  Object.keys(source).forEach((pageType) => {
    cloned[pageType] = new Map(source[pageType]);
  });
  return cloned;
}

function shouldSkipHeadForWebPub(url: string): boolean {
  return (
    /\.(x?html?|xht|svg)(?:[#?]|$)/i.test(url) ||
    /^(?:about:|data:|blob:)/i.test(Base.stripFragment(url))
  );
}

function encodeURLPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export type Position = {
  spineIndex: number;
  pageIndex: number;
  offsetInItem: number;
};

export class EPUBDocStore extends OPS.OPSDocStore {
  plainXMLStore: XmlDoc.XMLDocStore;
  jsonStore: Net.JSONStore;
  opfByURL: { [key: string]: OPFDoc } = {};
  primaryOPFByEPubURL: { [key: string]: OPFDoc } = {};
  deobfuscators: { [key: string]: (p1: Blob) => Task.Result<Blob> } = {};
  documents: { [key: string]: Task.Result<XmlDoc.XMLDocHolder | null> } = {};

  private constructor(
    authorStyleSheets: OPS.StyleSheetParam[] | null = null,
    userStyleSheets: OPS.StyleSheetParam[] | null = null,
  ) {
    super(null, authorStyleSheets, userStyleSheets);
    this.fontDeobfuscator = this.makeDeobfuscatorFactory();
    this.plainXMLStore = XmlDoc.newXMLDocStore();
    this.jsonStore = Net.newJSONStore();
  }

  static create(
    authorStyleSheets: OPS.StyleSheetParam[] | null,
    userStyleSheets: OPS.StyleSheetParam[] | null,
  ): Task.Result<EPUBDocStore> {
    const store = new EPUBDocStore(authorStyleSheets, userStyleSheets);
    store.triggerSingleDocumentPreprocessing = true;
    return Task.newResult(store);
  }

  makeDeobfuscatorFactory():
    ((p1: string) => ((p1: Blob) => Task.Result<Blob>) | null) | null {
    return (url: string): ((p1: Blob) => Task.Result<Blob>) | null => {
      return this.deobfuscators[url];
    };
  }

  loadAsPlainXML(
    url: string,
    opt_required?: boolean,
    opt_message?: string,
  ): Task.Result<XmlDoc.XMLDocHolder> {
    return this.plainXMLStore.load(
      url,
      opt_required,
      opt_message,
    ) as Task.Result<XmlDoc.XMLDocHolder>;
  }

  startLoadingAsPlainXML(url: string): void {
    this.plainXMLStore.fetch(url);
  }

  loadAsJSON(
    url: string,
    opt_required?: boolean,
    opt_message?: string,
  ): Task.Result<Base.JSON> {
    return this.jsonStore.load(url, opt_required, opt_message);
  }

  loadWebPubManifest(url: string, frame: Task.Frame<OPFDoc | null>): void {
    this.loadAsJSON(url, true).then((manifestObj) => {
      if (!manifestObj) {
        this.reportLoadError(url);
        frame.finish(null);
        return;
      }
      OPFDoc.fromWebPubManifest(this, url, manifestObj, undefined, url).then(
        (opf) => {
          frame.finish(opf);
        },
      );
    });
  }

  loadPubDoc(url: string): Task.Result<OPFDoc | null> {
    const frame: Task.Frame<OPFDoc | null> = Task.newFrame("loadPubDoc");

    if (/\.opf(?:[#?]|$)/i.test(url)) {
      // EPUB OPF
      const [, pubURL, root] = url.match(/^((?:.*\/)?)([^/]*)$/);
      this.loadOPF(pubURL, root).thenFinish(frame);
    } else if (/\.json(?:ld)?(?:[#?]|$)/i.test(url)) {
      // Web Publication Manifest
      this.loadWebPubManifest(url, frame);
    } else if (shouldSkipHeadForWebPub(url)) {
      // Web Publication primary entry (X)HTML
      // Skip HEAD request for known document URLs and special schemes.
      // Browsers reject non-GET methods for data: and blob: URLs.
      this.loadWebPub(url).then((opf) => {
        if (opf) {
          frame.finish(opf);
          return;
        }
        // These URLs cannot be the root of an unzipped EPUB container.
        this.reportLoadError(url);
        frame.finish(null);
      });
    } else {
      // For ambiguous URLs (no recognized extension), use HEAD to check
      // content type and availability before loading.
      Net.fetchFromURL(url, undefined, "HEAD").then((response) => {
        if (response.status >= 400) {
          // This url can be the root of an unzipped EPUB.
          this.loadEPUBDoc(url).then((opf) => {
            if (opf) {
              frame.finish(opf);
              return;
            }
            Logging.logger.error(
              `Failed to fetch a source document from ${url} (${response.status}${
                response.statusText ? " " + response.statusText : ""
              })`,
            );
            frame.finish(null);
          });
        } else {
          if (
            !response.status &&
            !response.responseXML &&
            !response.responseText &&
            !response.responseBlob &&
            !response.contentType
          ) {
            // Empty response
            if (/\/[^/.]+(?:[#?]|$)/.test(url)) {
              // Adding trailing "/" may solve the problem.
              url = url.replace(/([#?]|$)/, "/$1");
            } else {
              // Ignore empty response of HEAD request, it may become OK with GET request.
            }
          }
          if (response.contentType == "application/oebps-package+xml") {
            // EPUB OPF (served with OPF content type but without .opf extension)
            const [, pubURL, root] = url.match(/^((?:.*\/)?)([^/]*)$/);
            this.loadOPF(pubURL, root).thenFinish(frame);
          } else if (
            response.contentType == "application/ld+json" ||
            response.contentType == "application/webpub+json" ||
            response.contentType == "application/audiobook+json" ||
            response.contentType == "application/json"
          ) {
            // Web Publication Manifest (served with JSON content type)
            this.loadWebPubManifest(url, frame);
          } else {
            // Web Publication primary entry (X)HTML
            this.loadWebPub(url).then((opf) => {
              if (opf) {
                frame.finish(opf);
                return;
              }
              // This url can be the root of an unzipped EPUB.
              this.loadEPUBDoc(url).then((opf) => {
                if (opf) {
                  frame.finish(opf);
                  return;
                }
                this.reportLoadError(url);
                frame.finish(null);
              });
            });
          }
        }
      });
    }
    return frame.result();
  }

  loadEPUBDoc(url: string): Task.Result<OPFDoc | null> {
    const frame: Task.Frame<OPFDoc | null> = Task.newFrame("loadEPUBDoc");
    if (!url.endsWith("/")) {
      url = url + "/";
    }
    this.startLoadingAsPlainXML(url + "META-INF/encryption.xml");
    const containerURL = url + "META-INF/container.xml";
    this.loadAsPlainXML(containerURL).then((containerXML) => {
      if (containerXML) {
        const roots = containerXML
          .doc()
          .child("container")
          .child("rootfiles")
          .child("rootfile")
          .attribute("full-path");
        for (const root of roots) {
          if (root) {
            this.loadOPF(url, root).thenFinish(frame);
            return;
          }
        }
      }
      frame.finish(null);
    });
    return frame.result();
  }

  loadOPF(pubURL: string, root: string): Task.Result<OPFDoc | null> {
    const url = pubURL + root;
    const opf = this.opfByURL[url];
    if (opf) {
      return Task.newResult(opf);
    }
    const frame: Task.Frame<OPFDoc | null> = Task.newFrame("loadOPF");
    this.loadAsPlainXML(url, true, `Failed to fetch EPUB OPF ${url}`).then(
      (opfXML) => {
        if (!opfXML) {
          this.reportLoadError(url);
        } else {
          const registerOPF = (opf: OPFDoc) => {
            this.opfByURL[url] = opf;
            this.primaryOPFByEPubURL[pubURL] = opf;
            frame.finish(opf);
          };
          if (this.plainXMLStore.resources[pubURL + "META-INF/container.xml"]) {
            this.loadAsPlainXML(pubURL + "META-INF/encryption.xml").then(
              (encXML) => {
                registerOPF(OPFDoc.fromXMLDoc(this, pubURL, opfXML, encXML));
              },
            );
          } else {
            // OPF file is directly specified, not via container.xml.
            // In this case, encryption.xml is not available.
            registerOPF(OPFDoc.fromXMLDoc(this, pubURL, opfXML, null));
          }
        }
      },
    );
    return frame.result();
  }

  loadWebPub(url: string): Task.Result<OPFDoc | null> {
    const frame: Task.Frame<OPFDoc | null> = Task.newFrame("loadWebPub");

    // Load the primary entry page (X)HTML
    this.load(url).then((xmldoc) => {
      if (!xmldoc) {
        this.reportLoadError(url);
        frame.finish(null);
      } else if (
        xmldoc.document.querySelector(
          "a[href='META-INF/'],a[href$='/META-INF/']",
        )
      ) {
        // This is likely the directory listing of unzipped EPUB top directory
        frame.finish(null);
      } else {
        const doc = xmldoc.document;

        // Find manifest, W3C WebPublication or Readium Web Publication Manifest
        const manifestLink = doc.querySelector(
          "link[rel='publication'],link[rel='manifest'][type='application/webpub+json']",
        );
        if (manifestLink) {
          const href = manifestLink.getAttribute("href");
          if (/^#/.test(href)) {
            const manifestObj = Base.stringToJSON(
              doc.getElementById(href.substr(1)).textContent,
            );
            OPFDoc.fromWebPubManifest(this, url, manifestObj, doc).then(
              (opf) => {
                frame.finish(opf);
              },
            );
          } else {
            const manifestUrl = Base.resolveURL(
              manifestLink.getAttribute("href"),
              url,
            );
            this.loadAsJSON(
              manifestUrl,
              true,
              `Failed to fetch Publication Manifest ${manifestUrl}`,
            ).then((manifestObj) => {
              OPFDoc.fromWebPubManifest(
                this,
                url,
                manifestObj,
                doc,
                manifestUrl,
              ).then((opf) => {
                frame.finish(opf);
              });
            });
          }
        } else {
          // No manifest
          OPFDoc.fromWebPubManifest(this, url, {}, doc).then((opf) => {
            if (opf.toc && opf.toc.src === xmldoc.url) {
              // toc is the primary entry (X)HTML
              if (Toc.findTocElements(doc).length === 0) {
                // TOC is not found in the primary entry (X)HTML
                opf.toc = null;
              }
            }
            frame.finish(opf);
          });
        }
      }
    });
    return frame.result();
  }

  addDocument(url: string, doc: Document) {
    const frame = Task.newFrame<XmlDoc.XMLDocHolder>("EPUBDocStore.load");
    const docURL = Base.stripFragment(url);
    const r = (this.documents[docURL] = this.parseOPSResource({
      status: 200,
      statusText: "",
      url: docURL,
      contentType: (doc as any).contentType,
      responseText: null,
      responseXML: doc,
      responseBlob: null,
    }));
    r.thenFinish(frame);
    return frame.result();
  }

  reportLoadError(docURL: string): void {
    const removePath = (url: string) => {
      return url.replace(/([^:/?#]|^)[/?#].*/, "$1");
    };
    const likelyCorsProblem = () => {
      const domain = removePath(docURL);
      if (domain === removePath(Base.baseURL)) {
        // same domain, no CORS problem
        return false;
      }
      const urls = Object.keys(this.resources);
      if (
        urls.find((url) => this.resources[url] && removePath(url) === domain)
      ) {
        // if there is an already loaded resource with the same domain, no CORS problem
        return false;
      }
      if (!/^https?:?\/\/[^/]/.test(docURL)) {
        // not a valid URL
        return false;
      }
      if (/\.(xhtml|xht|xml|opf)$/i.test(docURL)) {
        // maybe, XML error
        return false;
      }
      // likely, CORS problem
      return true;
    };

    if (docURL.startsWith("data:")) {
      Logging.logger.error(`Failed to load ${docURL}. Invalid data.`);
    } else if (
      docURL.startsWith("http:") &&
      Base.baseURL.startsWith("https:") &&
      // Browsers allow http://localhost from https:// (no mixed content block);
      // the real error there is CORS, handled by likelyCorsProblem() below.
      !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(?:[/?#]|$)/.test(
        docURL,
      )
    ) {
      Logging.logger.error(
        `Failed to load ${docURL}. Mixed Content ("http:" content on "https:" context) is not allowed.`,
      );
    } else if (likelyCorsProblem()) {
      Logging.logger.error(
        `Failed to load ${docURL}. This may be caused by network error, incorrect URL, or the server not allowing cross-origin resource sharing (CORS).`,
      );
    } else {
      Logging.logger.error(
        `Failed to load ${docURL}. The target resource is invalid.`,
      );
    }
  }

  override load(url: string): Task.Result<XmlDoc.XMLDocHolder> {
    const docURL = Base.stripFragment(url);
    let r = this.documents[docURL];
    if (r) {
      return r.isPending() ? r : Task.newResult(r.get());
    } else {
      const frame = Task.newFrame<XmlDoc.XMLDocHolder>("EPUBDocStore.load");
      r = super.load(
        docURL,
        true,
        `Failed to fetch a source document from ${docURL}`,
      );
      r.then((xmldoc: XmlDoc.XMLDocHolder) => {
        if (!xmldoc) {
          this.reportLoadError(docURL);
        } else {
          frame.finish(xmldoc);
        }
      });
      return frame.result();
    }
  }

  override processViewportMeta(meta: Element): string {
    let content = meta.getAttribute("content");
    if (!content) {
      return "";
    }
    const vals = {};
    let r: RegExpMatchArray | null;
    while (
      (r = content.match(
        /^,?\s*([-A-Za-z_.][-A-Za-z_0-9.]*)\s*=\s*([-+A-Za-z_0-9.]*)\s*/,
      )) != null
    ) {
      content = content.substr(r[0].length);
      vals[r[1]] = r[2];
    }
    const width = vals["width"] - 0;
    const height = vals["height"] - 0;
    if (width && height) {
      const prePaginated = !!Object.values(this.primaryOPFByEPubURL).find(
        (opf) => opf.prePaginated,
      );
      return (
        `@-epubx-viewport{width:${width}px;height:${height}px;}` +
        (prePaginated
          ? `@page{size:${width}px ${height}px;margin:0;}`
          : `@page{margin:0;}`)
      );
    }
    return "";
  }
}

export type OPFItemParam = {
  url: string;
  index: number;
  startPage: number | null;
  skipPagesBefore: number | null;
};

export class OPFItem {
  id: string | null = null;
  src: string = "";
  mediaType: string | null = null;
  title: string | null = null;
  itemRefElement: Element | null = null;
  spineIndex: number = -1;
  compressedSize: number = 0;
  compressed: boolean | null = null;
  epage: number = 0;
  epageCount: number = 0;
  startPage: number | null = null;
  skipPagesBefore: number | null = null;
  itemProperties: { [key: string]: boolean };

  constructor() {
    this.itemProperties = Base.emptyObj;
  }

  initWithElement(itemElem: Element, opfURL: string): void {
    this.id = itemElem.getAttribute("id");
    this.src = Base.resolveURL(itemElem.getAttribute("href"), opfURL);
    this.mediaType = itemElem.getAttribute("media-type");
    const propStr = itemElem.getAttribute("properties");
    if (propStr) {
      this.itemProperties = Base.arrayToSet(propStr.split(/\s+/));
    }
  }

  initWithParam(param: OPFItemParam) {
    this.spineIndex = param.index;
    this.id = `item${param.index + 1}`;
    this.src = param.url;
    this.startPage = param.startPage;
    this.skipPagesBefore = param.skipPagesBefore;
  }
}

export function getOPFItemId(item: OPFItem): string | null {
  return item.id;
}

export function makeDeobfuscator(uid: string): (p1: Blob) => Task.Result<Blob> {
  return (blob) => {
    const frame = Task.newFrame("deobfuscator") as Task.Frame<Blob>;
    makeDigest("SHA-1", uid).then((hash) => {
      const head = blob.slice(0, 1040);
      const tail = blob.slice(1040, blob.size);
      Net.readBlob(head).then((buf) => {
        const dataView = new DataView(buf);
        for (let k = 0; k < dataView.byteLength; k++) {
          let b = dataView.getUint8(k);
          b ^= hash[k % 20];
          dataView.setUint8(k, b);
        }
        frame.finish(Net.makeBlob([dataView, tail]));
      });
    });
    return frame.result();
  };
}

function makeDigest(algorithm: string, str: string): Task.Result<Uint8Array> {
  const frame = Task.newFrame("makeDigest") as Task.Frame<Uint8Array>;
  const continuation = frame.suspend();
  window.crypto.subtle
    .digest(algorithm, new TextEncoder().encode(str))
    .then((buf) => {
      continuation.schedule(new Uint8Array(buf));
    });
  return frame.result();
}

type RawMeta = {
  [key: string]: RawMetaItem[];
};

type RawMetaItem = {
  name: string;
  value: string;
  id: string | null;
  refines: string | null;
  scheme: string | null;
  lang: string | null;
  order: number;
  role: string | null;
};

export interface Meta {
  [key: string]: MetaItem[];
}

export interface MetaItem {
  v: string;
  o?: number;
  s?: string;
  r?: Meta;
}

export const predefinedPrefixes = {
  dcterms: "http://purl.org/dc/terms/",
  marc: "http://id.loc.gov/vocabulary/",
  media: "http://www.idpf.org/epub/vocab/overlays/#",
  rendition: "http://www.idpf.org/vocab/rendition/#",
  onix: "http://www.editeur.org/ONIX/book/codelists/current.html#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  opf: "http://www.idpf.org/2007/opf",
};

export const defaultIRI = "http://idpf.org/epub/vocab/package/meta/#";

export const metaTerms = {
  language: `${predefinedPrefixes["dcterms"]}language`,
  title: `${predefinedPrefixes["dcterms"]}title`,
  creator: `${predefinedPrefixes["dcterms"]}creator`,
  layout: `${predefinedPrefixes["rendition"]}layout`,
  titleType: `${defaultIRI}title-type`,
  displaySeq: `${defaultIRI}display-seq`,
  alternateScript: `${defaultIRI}alternate-script`,
  role: `${defaultIRI}role`,
};

export function getMetadataComparator(
  term: string,
  lang: string | null,
): (p1: MetaItem, p2: MetaItem) => number {
  const empty = {};
  return (item1, item2) => {
    let m1: boolean;
    let m2: boolean;
    const r1 = item1["r"] || empty;
    const r2 = item2["r"] || empty;
    if (term == metaTerms.title) {
      m1 = r1[metaTerms.titleType]?.[0].v == "main";
      m2 = r2[metaTerms.titleType]?.[0].v == "main";
      if (m1 != m2) {
        return m1 ? -1 : 1;
      }
    }
    let i1 = parseInt(r1[metaTerms.displaySeq]?.[0].v, 10);
    if (isNaN(i1)) {
      i1 = Number.MAX_VALUE;
    }
    let i2 = parseInt(r2[metaTerms.displaySeq]?.[0].v, 10);
    if (isNaN(i2)) {
      i2 = Number.MAX_VALUE;
    }
    if (i1 != i2) {
      return i1 - i2;
    }
    if (term != metaTerms.language && lang) {
      m1 =
        (r1[metaTerms.language] || r1[metaTerms.alternateScript])?.[0].v ==
        lang;
      m2 =
        (r2[metaTerms.language] || r2[metaTerms.alternateScript])?.[0].v ==
        lang;
      if (m1 != m2) {
        return m1 ? -1 : 1;
      }
    }
    return item1["o"] - item2["o"];
  };
}

export function readMetadata(
  mroot: XmlDoc.NodeList,
  prefixes: string | null,
): Meta {
  // Parse prefix map (if any)
  let prefixMap;
  if (!prefixes) {
    prefixMap = predefinedPrefixes;
  } else {
    prefixMap = {};
    for (const pn in predefinedPrefixes) {
      prefixMap[pn] = predefinedPrefixes[pn];
    }
    let r: RegExpMatchArray | null;

    // This code permits any non-ASCII characters in the name to avoid bloating
    // the pattern.
    while (
      (r = prefixes.match(
        /^\s*([A-Z_a-z\u007F-\uFFFF][-.A-Z_a-z0-9\u007F-\uFFFF]*):\s*(\S+)/,
      )) != null
    ) {
      prefixes = prefixes.substr(r[0].length);
      prefixMap[r[1]] = r[2];
    }
  }
  const resolveProperty = (val: string | null): string | null => {
    if (val) {
      const r = val.match(/^\s*(([^:]*):)?(\S+)\s*$/);
      if (r) {
        const iri = r[2] ? prefixMap[r[2]] : defaultIRI;
        if (iri) {
          return iri + r[3];
        }
      }
    }
    return null;
  };
  let order = 1;

  // List of metadata items.
  const rawItems = mroot.childElements().forEachNonNull((node: Element) => {
    if (node.localName == "meta") {
      const p = resolveProperty(node.getAttribute("property"));
      if (p) {
        return {
          name: p,
          value: node.textContent,
          id: node.getAttribute("id"),
          order: order++,
          refines: node.getAttribute("refines"),
          lang: null,
          scheme: resolveProperty(node.getAttribute("scheme")),
          role: null,
        };
      }
    } else if (node.namespaceURI == Base.NS.DC) {
      return {
        name: predefinedPrefixes["dcterms"] + node.localName,
        order: order++,
        lang: node.getAttribute("xml:lang"),
        value: node.textContent,
        id: node.getAttribute("id"),
        refines: null,
        scheme: null,
        role: node.getAttribute("role") || node.getAttribute("opf:role"),
      };
    }
    return null;
  });

  // Items grouped by their target id.
  const rawItemsByTarget = Base.multiIndexArray(
    rawItems,
    (rawItem) => rawItem.refines,
  );
  const makeMetadata = (map: RawMeta): Meta =>
    Base.mapObj(map, (rawItemArr, _itemName) =>
      rawItemArr.map((rawItem) => {
        const entry = { v: rawItem.value, o: rawItem.order };
        if (rawItem.scheme) {
          entry["s"] = rawItem.scheme;
        }
        let refs = rawItemsByTarget[`#${rawItem.id}`] || [];
        if (refs.length || rawItem.lang || rawItem.role) {
          if (rawItem.lang) {
            // Special handling for xml:lang
            refs.push({
              name: metaTerms.language,
              value: rawItem.lang,
              lang: null,
              id: null,
              refines: rawItem.id,
              scheme: null,
              order: rawItem.order,
              role: null,
            });
          }
          if (rawItem.role) {
            // Special handling for opf:role
            refs.push({
              name: metaTerms.role,
              value: rawItem.role,
              lang: null,
              id: null,
              refines: rawItem.id,
              scheme: null,
              order: rawItem.order,
              role: null,
            });
          }
          const entryMap = Base.multiIndexArray(
            refs,
            (rawItem) => rawItem.name,
          );
          entry["r"] = makeMetadata(entryMap);
        }
        return entry;
      }),
    );
  const metadata = makeMetadata(
    Base.multiIndexArray(rawItems, (rawItem) =>
      rawItem.refines ? null : rawItem.name,
    ),
  );
  let lang: string | null = null;
  if (metadata[metaTerms.language]) {
    lang = metadata[metaTerms.language][0]["v"];
  }
  const sortMetadata = (metadata: Meta) => {
    for (const term in metadata) {
      const arr = metadata[term];
      arr.sort(getMetadataComparator(term, lang));
      for (let i = 0; i < arr.length; i++) {
        const r = arr[i]["r"];
        if (r) {
          sortMetadata(r);
        }
      }
    }
  };
  sortMetadata(metadata);
  return metadata;
}

export function getMathJaxHub(): object | null {
  const math = window["MathJax"];
  if (math) {
    return math["Hub"];
  }
  return null;
}

export const supportedMediaTypes = {
  "application/xhtml+xml": true,
  "image/jpeg": true,
  "image/png": true,
  "image/svg+xml": true,
  "image/gif": true,
  "audio/mp3": true,
};

export const transformedIdPrefix = "viv-id-";

function getPathFromURL(url: string, pubURL: string): string | null {
  if (url.startsWith("data:")) {
    return url === pubURL ? "" : url;
  }
  if (pubURL) {
    let epubBaseURL = Base.resolveURL("", pubURL);
    if (url === epubBaseURL || url + "/" === epubBaseURL) {
      return "";
    }
    if (epubBaseURL.charAt(epubBaseURL.length - 1) != "/") {
      epubBaseURL += "/";
    }
    return url.substr(0, epubBaseURL.length) == epubBaseURL
      ? decodeURIComponent(url.substr(epubBaseURL.length))
      : null;
  } else {
    return url;
  }
}

export class OPFDoc {
  opfXML: XmlDoc.XMLDocHolder;
  items: OPFItem[];
  spine: OPFItem[];
  itemMap: { [key: string]: OPFItem };
  itemMapByPath: { [key: string]: OPFItem };
  bindings: { [key: string]: string } = {};
  lang: string | null = null;
  epageCount: number = 0;
  prePaginated: boolean = false;
  epageIsRenderedPage: boolean = true;
  epageCountCallback: ((p1: number) => void) | null = null;
  metadata: Meta = {};
  toc: OPFItem | null = null;
  cover: OPFItem | null = null;
  fallbackMap: { [key: string]: string } = {};
  pageProgression: Constants.PageProgression | null = null;
  documentURLTransformer: Base.DocumentURLTransformer;

  private constructor(
    public readonly store: EPUBDocStore,
    public readonly pubURL: string,
    content: {
      opfXML: XmlDoc.XMLDocHolder;
      items: OPFItem[];
      spine: OPFItem[];
      itemMap: { [key: string]: OPFItem };
      itemMapByPath: { [key: string]: OPFItem };
    },
  ) {
    this.opfXML = content.opfXML;
    this.items = content.items;
    this.spine = content.spine;
    this.itemMap = content.itemMap;
    this.itemMapByPath = content.itemMapByPath;
    this.documentURLTransformer = this.createDocumentURLTransformer();
  }

  // FIXME: TS4055
  createDocumentURLTransformer(): Base.DocumentURLTransformer {
    const self = this;
    class OPFDocumentURLTransformer implements Base.DocumentURLTransformer {
      private canonicalDocumentURLCache = new Map<string, string>();

      private getCanonicalDocumentURL(url: string): string {
        // Issue #2036: a server may redirect a spine item URL (for example,
        // stripping `.html`). Canonicalize redirected aliases back to the
        // spine source URL so transformed ids and same-document references use
        // one stable document identity.
        const strippedURL = Base.stripFragment(Base.stripTocBoxURL(url));
        const cachedURL = this.canonicalDocumentURLCache.get(strippedURL);
        if (cachedURL) {
          return cachedURL;
        }
        for (const item of self.spine) {
          const itemURL = Base.stripFragment(Base.stripTocBoxURL(item.src));
          if (itemURL === strippedURL) {
            this.canonicalDocumentURLCache.set(strippedURL, itemURL);
            return itemURL;
          }
          const loadedURL = self.store?.get(itemURL)?.url;
          if (
            loadedURL &&
            Base.stripFragment(Base.stripTocBoxURL(loadedURL)) === strippedURL
          ) {
            this.canonicalDocumentURLCache.set(strippedURL, itemURL);
            return itemURL;
          }
        }
        this.canonicalDocumentURLCache.set(strippedURL, strippedURL);
        return strippedURL;
      }

      /** @override */
      transformFragment(fragment: string, baseURL: string): string {
        const canonicalBaseURL = this.getCanonicalDocumentURL(baseURL);
        const url = canonicalBaseURL + (fragment ? `#${fragment}` : "");
        return transformedIdPrefix + Base.escapeNameStrToHex(url, ":");
      }

      /** @override */
      transformURL(url: string, baseURL: string): string {
        const r = url.match(/^([^#]*)#?(.*)$/);
        if (r) {
          const path = this.getCanonicalDocumentURL(
            r[1] || Base.stripTocBoxURL(baseURL),
          );
          const fragment = decodeURIComponent(r[2]);
          if (path) {
            if (
              self.spine.some(
                (item) =>
                  Base.stripFragment(Base.stripTocBoxURL(item.src)) === path,
              )
            ) {
              return `#${this.transformFragment(fragment, path)}`;
            }
          }
        }
        return url;
      }

      /** @override */
      restoreURL(encoded: string): string[] {
        if (encoded.charAt(0) === "#") {
          encoded = encoded.substring(1);
        }
        if (encoded.indexOf(transformedIdPrefix) === 0) {
          encoded = encoded.substring(transformedIdPrefix.length);
        }
        const decoded = Base.unescapeStrFromHex(encoded, ":");
        const r = decoded.match(/^([^#]*)#?(.*)$/);
        return r ? [r[1], r[2]] : [];
      }
    }
    return new OPFDocumentURLTransformer();
  }

  /**
   * Metadata is organized in the following way: fully-expanded property names
   * (with IRI prefixes prepended) point to an array of values. Array contains
   * at least one element. First element is primary and should be used by
   * default. Element values are objects have the following keys:
   * - "v" - item value as string,
   * - "s" - scheme,
   * - "o" - index in the order of appearing in the source,
   * - "r" - refinement submetadata (organized just like the top-level
   * metadata).
   */
  getMetadata(): Meta {
    return this.metadata;
  }

  getPathFromURL(url: string): string | null {
    return getPathFromURL(url, this.pubURL);
  }

  static fromXMLDoc(
    store: EPUBDocStore,
    pubURL: string,
    opfXML: XmlDoc.XMLDocHolder,
    encXML: XmlDoc.XMLDocHolder | null,
  ): OPFDoc {
    const pkg = opfXML.doc().child("package");
    let uid: string | null = null;
    const uidref = pkg.attribute("unique-identifier")[0];
    if (uidref) {
      const uidElem = opfXML.getElement(`${opfXML.url}#${uidref}`);
      if (uidElem) {
        uid = uidElem.textContent.replace(/[ \n\r\t]/g, "");
      }
    }
    const srcToFallbackId = {};
    let toc: OPFItem | null = null;
    let cover: OPFItem | null = null;
    const items = pkg
      .child("manifest")
      .child("item")
      .asArray()
      .map((node) => {
        const item = new OPFItem();
        const elem = node as Element;
        item.initWithElement(elem, opfXML.url);
        const fallback = elem.getAttribute("fallback");
        if (fallback && !supportedMediaTypes[item.mediaType]) {
          srcToFallbackId[item.src] = fallback;
        }
        if (!toc && item.itemProperties["nav"]) {
          toc = item;
        }
        if (!cover && item.itemProperties["cover-image"]) {
          cover = item;
        }
        return item;
      });
    const itemMap = Base.indexArray(
      items,
      getOPFItemId as (p1: OPFItem) => string | null,
    );
    const itemMapByPath = Base.indexArray(items, (item) =>
      getPathFromURL(item.src, pubURL),
    );
    const fallbackMap: { [key: string]: string } = {};
    for (const src in srcToFallbackId) {
      let fallbackSrc = src;
      while (true) {
        const item = itemMap[srcToFallbackId[fallbackSrc]];
        if (!item) {
          break;
        }
        if (supportedMediaTypes[item.mediaType]) {
          fallbackMap[src] = item.src;
          break;
        }
        fallbackSrc = item.src;
      }
    }
    const spine = pkg
      .child("spine")
      .child("itemref")
      .asArray()
      .map((node, index) => {
        const elem = node as Element;
        const id = elem.getAttribute("idref");
        const item = itemMap[id as string];
        if (item) {
          item.itemRefElement = elem;
          item.spineIndex = index;
        }
        return item;
      });
    const opf = new OPFDoc(store, pubURL, {
      opfXML,
      items,
      spine,
      itemMap,
      itemMapByPath,
    });
    opf.toc = toc;
    opf.cover = cover;
    opf.fallbackMap = fallbackMap;
    const pageProgressionAttr = pkg
      .child("spine")
      .attribute("page-progression-direction")[0];
    if (pageProgressionAttr) {
      opf.pageProgression = Constants.pageProgressionOf(pageProgressionAttr);
    }
    const idpfObfURLs = !encXML
      ? []
      : encXML
          .doc()
          .child("encryption")
          .child("EncryptedData")
          .predicate(
            XmlDoc.predicate.withChild(
              "EncryptionMethod",
              XmlDoc.predicate.withAttribute(
                "Algorithm",
                "http://www.idpf.org/2008/embedding",
              ),
            ),
          )
          .child("CipherData")
          .child("CipherReference")
          .attribute("URI");
    const mediaTypeElems = pkg
      .child("bindings")
      .child("mediaType")
      .asArray() as Element[];
    for (let i = 0; i < mediaTypeElems.length; i++) {
      const handlerId = mediaTypeElems[i].getAttribute("handler");
      const mediaType = mediaTypeElems[i].getAttribute("media-type");
      if (mediaType && handlerId && itemMap[handlerId]) {
        opf.bindings[mediaType] = itemMap[handlerId].src;
      }
    }
    opf.metadata = readMetadata(
      pkg.child("metadata"),
      pkg.attribute("prefix")[0],
    );
    if (opf.metadata[metaTerms.language]) {
      opf.lang = opf.metadata[metaTerms.language][0]["v"];
    }
    if (opf.metadata[metaTerms.layout]) {
      opf.prePaginated =
        opf.metadata[metaTerms.layout][0]["v"] === "pre-paginated";
    }

    if (idpfObfURLs.length > 0 && uid) {
      // Have to deobfuscate in JavaScript
      const deobfuscator = makeDeobfuscator(uid);
      for (let i = 0; i < idpfObfURLs.length; i++) {
        store.deobfuscators[pubURL + idpfObfURLs[i]] = deobfuscator;
      }
    }
    if (opf.prePaginated) {
      opf.assignAutoPages();
    }
    return opf;
  }

  assignAutoPages(): void {
    let epage = 0;
    for (const item of this.spine) {
      const epageCount = this.prePaginated
        ? 1
        : Math.ceil(item.compressedSize / 1024);
      item.epage = epage;
      item.epageCount = epageCount;
      epage += epageCount;
    }
    this.epageCount = epage;

    if (this.epageCountCallback) {
      this.epageCountCallback(this.epageCount);
    }
  }

  setEPageCountMode(epageIsRenderedPage: boolean) {
    this.epageIsRenderedPage = epageIsRenderedPage || this.prePaginated;
  }

  countEPages(
    epageCountCallback: ((p1: number) => void) | null,
  ): Task.Result<boolean> {
    this.epageCountCallback = epageCountCallback;

    if (this.epageIsRenderedPage) {
      if (this.prePaginated && this.epageCount == 0) {
        this.assignAutoPages();
      }
      return Task.newResult(true);
    }

    let epage = 0;
    let i = 0;
    const frame: Task.Frame<boolean> = Task.newFrame("countEPages");
    frame
      .loopWithFrame((loopFrame) => {
        if (i === this.spine.length) {
          loopFrame.breakLoop();
          return;
        }
        const item = this.spine[i++];
        item.epage = epage;
        this.store.load(item.src).then((xmldoc) => {
          if (!xmldoc) {
            loopFrame.continueLoop();
            return;
          }
          // According to the old comment,
          // "Estimate that offset=2700 roughly corresponds to 1024 bytes of compressed size."
          // However, it should depend on the language.
          // Further adjustment needed.

          //let offsetPerEPage = 2700;
          let offsetPerEPage = 1800;
          const lang = xmldoc.lang || this.lang;
          if (lang && lang.match(/^(ja|ko|zh)/)) {
            offsetPerEPage /= 3;
          }
          item.epageCount = Math.ceil(xmldoc.getTotalOffset() / offsetPerEPage);
          epage += item.epageCount;
          this.epageCount = epage;
          if (this.epageCountCallback) {
            this.epageCountCallback(this.epageCount);
          }
          loopFrame.continueLoop();
        });
      })
      .thenFinish(frame);
    return frame.result();
  }

  private static buildChapters(
    pubURL: string,
    params: OPFItemParam[],
  ): {
    opfXML: XmlDoc.XMLDocHolder;
    items: OPFItem[];
    spine: OPFItem[];
    itemMap: { [key: string]: OPFItem };
    itemMapByPath: { [key: string]: OPFItem };
  } {
    const itemMap: { [key: string]: OPFItem } = {};
    const itemMapByPath: { [key: string]: OPFItem } = {};
    const items: OPFItem[] = [];
    const spine = items;

    // create a minimum fake OPF XML for navigation with EPUB CFI
    const opfXML = new XmlDoc.XMLDocHolder(
      null,
      "",
      new DOMParser().parseFromString("<spine></spine>", "text/xml"),
    );
    params.forEach((param) => {
      const item = new OPFItem();
      item.initWithParam(param);
      Asserts.assert(item.id);
      const itemref = opfXML.document.createElement("itemref");
      itemref.setAttribute("idref", item.id);
      opfXML.root.appendChild(itemref);
      item.itemRefElement = itemref;
      itemMap[item.id] = item;
      let path = getPathFromURL(param.url, pubURL);
      if (path == null) {
        path = param.url;
      }
      itemMapByPath[path] = item;
      items.push(item);
    });
    return { opfXML, items, spine, itemMap, itemMapByPath };
  }

  /**
   * Creates a fake OPF "document" that contains OPS chapters.
   */
  static fromChapters(
    store: EPUBDocStore,
    pubURL: string,
    params: OPFItemParam[],
    doc?: Document | null,
  ): Task.Result<OPFDoc> {
    const opf = new OPFDoc(store, pubURL, OPFDoc.buildChapters(pubURL, params));
    if (doc) {
      return store.addDocument(params[0].url, doc).thenReturn(opf);
    } else {
      return Task.newResult(opf);
    }
  }

  static fromWebPubManifest(
    store: EPUBDocStore,
    pubURL: string,
    manifestObj: Base.JSON,
    doc?: Document,
    manifestUrl?: string,
  ): Task.Result<OPFDoc> {
    let pageProgression: Constants.PageProgression | null = null;
    if (manifestObj["readingProgression"]) {
      pageProgression = manifestObj["readingProgression"];
    }
    const metadata: Meta = {};
    const title =
      manifestObj["name"] || manifestObj["metadata"]?.["title"] || doc?.title;
    if (title) {
      metadata[metaTerms.title] = (Array.isArray(title) ? title : [title]).map(
        (item) => ({ v: item.value ?? item }),
      );
    }
    const author =
      manifestObj["author"] ||
      manifestObj["creator"] ||
      manifestObj["metadata"]?.["author"] ||
      Array.from(
        doc?.querySelectorAll("meta[name='author'], meta[name='DC.Creator']") ??
          [],
      ).map((meta: HTMLMetaElement) => meta.content);
    if (author && author.length !== 0) {
      metadata[metaTerms.creator] = (
        Array.isArray(author) ? author : [author]
      ).map((item) => ({ v: item.name ?? item }));
    }
    const language =
      manifestObj["inLanguage"] ||
      manifestObj["metadata"]?.["language"] ||
      doc?.documentElement.lang ||
      doc?.documentElement.getAttribute("xml:lang");
    if (language) {
      metadata[metaTerms.language] = (
        Array.isArray(language) ? language : [language]
      ).map((item) => ({ v: item }));
    }
    // TODO: other metadata...

    const primaryEntryURL = Base.stripFragment(pubURL);
    const primaryEntryPath = getPathFromURL(primaryEntryURL, pubURL);
    const primaryEntryReadingOrderURL =
      primaryEntryPath !== null
        ? encodeURLPath(primaryEntryPath)
        : /^(?:about:|blob:)/i.test(primaryEntryURL)
          ? primaryEntryURL
          : null;
    if (
      !manifestObj["readingOrder"] &&
      doc &&
      primaryEntryReadingOrderURL !== null
    ) {
      manifestObj["readingOrder"] = [primaryEntryReadingOrderURL];

      // Find TOC in the primary entry (X)HTML
      for (const anchorElem of Toc.findTocAnchorElements(doc)) {
        const href = anchorElem.getAttribute("href");
        if (/^(https?:)?\/\//.test(href)) {
          // Avoid link to external resources
          continue;
        }
        if (/\.(jpe?g|png|gif|pdf|svg|mml)([#?]|$)/.test(href)) {
          // Avoid link to non-HTML resources
          continue;
        }
        const hrefNoFragment = Base.stripFragment(
          Base.resolveURL(href, pubURL),
        );
        const path = getPathFromURL(hrefNoFragment, pubURL);
        const url = path !== null ? encodeURLPath(path) : hrefNoFragment;
        if (manifestObj["readingOrder"].indexOf(url) == -1) {
          manifestObj["readingOrder"].push(url);
        }
      }
    }

    const params: OPFItemParam[] = [];
    let itemCount = 0;
    let tocFound = -1;
    [manifestObj["readingOrder"], manifestObj["resources"]].forEach(
      (readingOrderOrResources) => {
        if (readingOrderOrResources instanceof Array) {
          readingOrderOrResources.forEach((itemObj) => {
            const isInReadingOrder =
              readingOrderOrResources === manifestObj["readingOrder"];
            const url =
              typeof itemObj === "string"
                ? itemObj
                : itemObj.url || itemObj.href;
            const encodingFormat =
              typeof itemObj === "string"
                ? ""
                : itemObj.encodingFormat ||
                  (itemObj.href && itemObj.type) ||
                  "";
            if (
              isInReadingOrder ||
              encodingFormat === "text/html" ||
              encodingFormat === "application/xhtml+xml" ||
              (!encodingFormat &&
                itemObj.rel !== "stylesheet" &&
                /(^|\/)([^/]+\.(x?html|htm|xht)|[^/.]*)([#?]|$)/.test(url))
            ) {
              const baseUrl = manifestUrl
                ? manifestUrl.replace(/\/[^/]+$/, "/")
                : pubURL;
              const param = {
                url: Base.resolveURL(Base.convertSpecialURL(url), baseUrl),
                index: itemCount++,
                startPage: null,
                skipPagesBefore: null,
              };
              if (itemObj.rel === "contents" && tocFound === -1) {
                tocFound = param.index;
              }
              params.push(param);
            }
          });
        }
      },
    );
    const frame: Task.Frame<OPFDoc> = Task.newFrame("fromWebPubManifest");
    OPFDoc.fromChapters(store, pubURL, params).then((opf) => {
      opf.pageProgression = pageProgression;
      opf.metadata = metadata;
      if (tocFound !== -1) {
        opf.toc = opf.items[tocFound];
      }

      if (!opf.toc) {
        opf.toc = manifestUrl
          ? (opf.items[0] ?? null)
          : opf.itemMapByPath[primaryEntryPath];
      }

      // remove items not in readingOrder (Issue #1257)
      const readingOrderCount = manifestObj["readingOrder"]?.length;
      if (readingOrderCount && readingOrderCount < opf.items.length) {
        opf.items.splice(readingOrderCount);
      }

      frame.finish(opf);
    });
    return frame.result();
  }

  /**
   * @return cfi
   */
  getCFI(spineIndex: number, offsetInItem: number): Task.Result<string | null> {
    const item = this.spine[spineIndex];
    const frame: Task.Frame<string | null> = Task.newFrame("getCFI");
    this.store.load(item.src).then((xmldoc: XmlDoc.XMLDocHolder) => {
      const node = xmldoc.getNodeByOffset(offsetInItem);
      let cfi: string | null = null;
      if (node) {
        const startOffset = xmldoc.getNodeOffset(node, 0, false);
        const offsetInNode = offsetInItem - startOffset;
        const fragment = new CFI.Fragment();
        fragment.prependPathFromNode(node, offsetInNode, false, null);
        if (item.itemRefElement) {
          fragment.prependPathFromNode(item.itemRefElement, 0, false, null);
        }
        cfi = fragment.toString();
      }
      frame.finish(cfi);
    });
    return frame.result();
  }

  resolveFragment(fragstr: string | null): Task.Result<Position | null> {
    return Task.handle(
      "resolveFragment",
      (frame: Task.Frame<Position | null>): void => {
        if (!fragstr) {
          frame.finish(null);
          return;
        }
        let fragment = new CFI.Fragment();
        fragment.fromString(fragstr);
        let item: OPFItem;
        if (this.opfXML) {
          const opfNav = fragment.navigate(this.opfXML.document);
          if (opfNav.node.nodeType != 1 || opfNav.after || !opfNav.ref) {
            frame.finish(null);
            return;
          }
          const elem = opfNav.node as Element;
          const idref = elem.getAttribute("idref");
          if (elem.localName != "itemref" || !idref || !this.itemMap[idref]) {
            frame.finish(null);
            return;
          }
          item = this.itemMap[idref];
          fragment = opfNav.ref;
        } else {
          item = this.spine[0];
        }
        this.store.load(item.src).then((xmldoc: XmlDoc.XMLDocHolder) => {
          const nodeNav = fragment.navigate(xmldoc.document);
          const offset = xmldoc.getNodeOffset(
            nodeNav.node,
            nodeNav.offset,
            nodeNav.after,
          );
          frame.finish({
            spineIndex: item.spineIndex,
            offsetInItem: offset,
            pageIndex: -1,
          });
        });
      },
      (frame: Task.Frame<Position | null>, err: Error): void => {
        Logging.logger.warn(err, "Cannot resolve fragment:", fragstr);
        frame.finish(null);
      },
    );
  }

  resolveEPage(epage: number): Task.Result<Position | null> {
    return Task.handle(
      "resolveEPage",
      (frame: Task.Frame<Position | null>): void => {
        if (epage <= 0) {
          frame.finish({ spineIndex: 0, offsetInItem: 0, pageIndex: -1 });
          return;
        }
        if (this.epageIsRenderedPage) {
          let spineIndex = this.spine.findIndex((item) => {
            return (
              (item.epage == 0 && item.epageCount == 0) ||
              (item.epage <= epage && item.epage + item.epageCount > epage)
            );
          });
          if (spineIndex == -1) {
            spineIndex = this.spine.length - 1;
          }
          let item = this.spine[spineIndex];
          if (!item || item.epageCount == 0) {
            item = this.spine[--spineIndex];
          }
          const pageIndex = Math.floor(epage - item.epage);
          frame.finish({ spineIndex, offsetInItem: -1, pageIndex: pageIndex });
          return;
        }
        let spineIndex = Base.binarySearch(this.spine.length, (index) => {
          const item = this.spine[index];
          return item.epage + item.epageCount > epage;
        });
        if (spineIndex == this.spine.length) {
          spineIndex--;
        }
        const item = this.spine[spineIndex];
        this.store.load(item.src).then((xmldoc: XmlDoc.XMLDocHolder) => {
          epage -= item.epage;
          if (epage > item.epageCount) {
            epage = item.epageCount;
          }
          let offset = 0;
          if (epage > 0) {
            const totalOffset = xmldoc.getTotalOffset();
            offset = Math.round((totalOffset * epage) / item.epageCount);
            if (offset == totalOffset) {
              offset--;
            }
          }
          frame.finish({ spineIndex, offsetInItem: offset, pageIndex: -1 });
        });
      },
      (frame: Task.Frame<Position | null>, err: Error): void => {
        Logging.logger.warn(err, "Cannot resolve epage:", epage);
        frame.finish(null);
      },
    );
  }

  getEPageFromPosition(position: Position): Task.Result<number> {
    const item = this.spine[position.spineIndex];
    if (this.epageIsRenderedPage) {
      const epage = item.epage + position.pageIndex;
      return Task.newResult(epage);
    }
    if (position.offsetInItem <= 0) {
      return Task.newResult(item.epage);
    }
    const frame: Task.Frame<number> = Task.newFrame("getEPage");
    this.store.load(item.src).then((xmldoc: XmlDoc.XMLDocHolder) => {
      const totalOffset = xmldoc.getTotalOffset();
      const offset = Math.min(totalOffset, position.offsetInItem);
      frame.finish(item.epage + (offset * item.epageCount) / totalOffset);
    });
    return frame.result();
  }
}

export type PageAndPosition = {
  page: Vtree.Page;
  position: Position;
};

export const makePageAndPosition = (
  page: Vtree.Page,
  pageIndex: number,
): PageAndPosition => ({
  page,
  position: {
    spineIndex: page.spineIndex,
    pageIndex,
    offsetInItem: page.offset,
  },
});

export type OPFViewItem = {
  item: OPFItem;
  xmldoc: XmlDoc.XMLDocHolder;
  instance: OPS.StyleInstance;
  layoutPositions: Array<Vtree.LayoutPosition | null>;
  pages: Vtree.Page[];
  complete: boolean;
  pageCounterStarts: CssCascade.CounterValues[];
  pageCounterEnds: CssCascade.CounterValues[];
};

type PostponedTargetHostPage = {
  viewItem: OPFViewItem;
  pageIndex: number;
  nextLayoutPosition: Vtree.LayoutPosition | null;
};

const DESCRIBED_ITEM_LIMIT = 5;

function describeList(items: string[]): string {
  if (items.length === 0) {
    return "(none)";
  }
  const listed = items.slice(0, DESCRIBED_ITEM_LIMIT).join(", ");
  return items.length > DESCRIBED_ITEM_LIMIT
    ? `${listed} and ${items.length - DESCRIBED_ITEM_LIMIT} more`
    : listed;
}

/**
 * Error representing that the rendering has been canceled.
 */
export class RenderingCanceledError extends Error {
  name: string = "RenderingCanceledError";
  message: string = "Page rendering has been canceled";
  stack: string;

  constructor() {
    super();
    // Set the prototype explicitly.
    // https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, RenderingCanceledError.prototype);
    this.stack = new Error().stack ?? "";
  }
}

export class OPFView implements Vgen.CustomRendererFactory {
  spineItems: (OPFViewItem | null)[] = [];
  spineItemLoadingContinuations: (Task.Continuation<any>[] | null)[] = [];
  pref: Exprs.Preferences;
  clientLayout: Vgen.DefaultClientLayout;
  counterStore: Counters.CounterStore;
  cmykStore: CmykStore.CmykStore;
  tocAutohide: boolean = false;
  tocVisible: boolean = false;
  tocView?: Toc.TOCView;
  private postponedTargetHostPages: PostponedTargetHostPage[] = [];
  private resolvingPostponedReferences = false;
  private postponedReferenceResolutionTask: Task.Task | null = null;
  private postponedReferenceResolutionWaiters: Task.Continuation<Error | null>[] =
    [];
  private followingSpineRerenderDepth = 0;
  private pendingPageMaterializationDepth = 0;
  private spineIndexOfCurrentPageCounters = -1;
  private pendingFollowingSpineRerenders = new Map<OPFViewItem, boolean>();
  private pageCountAdjustmentTotals = new WeakMap<OPFViewItem, number>();
  private renderedPageCountFenwickTree: number[] = [];
  private spineItemsWithEstimatedPageNumberOffset = new WeakSet<OPFViewItem>();
  private paginationProgress = {
    totalOffsetsBySpine: [] as number[],
    renderedOffsetsBySpine: [] as number[],
    totalOffsetsReady: false,
    lastReportedPages: 0,
    lastReportedFraction: 0,
    lastReportedSpineIndex: -1,
    lastReportedHref: "",
  };

  constructor(
    public readonly opf: OPFDoc,
    public readonly viewport: Vgen.Viewport,
    public readonly fontMapper: Font.Mapper,
    pref: Exprs.Preferences,
    public readonly pageSheetSizeReporter: (
      pageSize: { width: number; height: number } | null,
      pageSheetSize: { [key: string]: { width: number; height: number } },
      spineIndex: number,
      pageIndex: number,
      pageCountDelta: number,
    ) => any,
    public readonly maxTargetReferenceLayoutPasses: number,
    cmykReserveMap?: CmykStore.CmykReserveMapEntry[],
  ) {
    this.pref = Exprs.clonePreferences(pref);
    this.clientLayout = new Vgen.DefaultClientLayout(viewport);
    this.counterStore = new Counters.CounterStore(opf.documentURLTransformer);
    this.cmykStore = new CmykStore.CmykStore();
    if (cmykReserveMap?.length) {
      this.cmykStore.registerCmykReserveMap(cmykReserveMap);
    }
  }

  private getPage(position: Position): Vtree.Page | null {
    const viewItem = this.spineItems[position.spineIndex];
    return viewItem ? viewItem.pages[position.pageIndex] : null;
  }

  /**
   * Wait until all previous spine items are loaded before accessing the target
   * spine item. This prevents corrupting the page counter state when navigating
   * to a later spine item while rendering is in progress.
   * (Fix for issue #1616)
   * @param spineIndex The target spine index to navigate to
   * @param sync If true, skip waiting (synchronous mode)
   */
  private waitForPreviousSpines(
    spineIndex: number,
    sync: boolean,
  ): Task.Result<boolean> {
    if (sync || spineIndex === 0) {
      return Task.newResult(true);
    }
    const frame: Task.Frame<boolean> = Task.newFrame("waitForPreviousSpines");
    frame
      .loopWithFrame((loopFrame) => {
        // Check if any previous spine item is not yet complete
        let allPreviousComplete = true;
        for (let i = 0; i < spineIndex; i++) {
          const prevItem = this.spineItems[i];
          if (!prevItem || !prevItem.complete) {
            allPreviousComplete = false;
            break;
          }
        }
        if (allPreviousComplete) {
          loopFrame.breakLoop();
        } else {
          // Wait and retry
          frame.sleep(100).then(() => {
            loopFrame.continueLoop();
          });
        }
      })
      .then(() => {
        frame.finish(true);
      });
    return frame.result();
  }

  getCurrentPageProgression(
    position: Position,
  ): Constants.PageProgression | null {
    if (this.opf.pageProgression) {
      return this.opf.pageProgression;
    } else {
      const viewItem = this.spineItems[position ? position.spineIndex : 0];
      return viewItem ? viewItem.instance.pageProgression : null;
    }
  }

  private finishPageContainer(
    viewItem: OPFViewItem,
    page: Vtree.Page,
    pageIndex: number,
    newPosition: Position | null = null,
  ) {
    page.container.style.display = "none";
    page.container.style.visibility = "visible";
    page.container.style.position = "";
    page.container.style.top = "";
    page.container.style.left = "";
    page.container.setAttribute(
      "data-vivliostyle-page-side",
      page.side as string,
    );
    const oldPage = viewItem.pages[pageIndex];
    page.isFirstPage = viewItem.item.spineIndex == 0 && pageIndex == 0;
    viewItem.pages[pageIndex] = page;

    if (this.opf.epageIsRenderedPage) {
      if (pageIndex == 0 && viewItem.item.spineIndex > 0) {
        const prevItem = this.opf.spine[viewItem.item.spineIndex - 1];
        viewItem.item.epage = prevItem.epage + prevItem.epageCount;
      }
      this.updateEPageRangesAfterPageCountChange(
        viewItem,
        viewItem.pages.length,
      );
    }

    if (oldPage) {
      viewItem.instance.viewport.contentContainer.replaceChild(
        page.container,
        oldPage.container,
      );
      oldPage.dispatchEvent({
        type: "replaced",
        target: null,
        currentTarget: null,
        preventDefault: null,
        newPage: page,
        newPosition,
      });
    } else {
      // Find insert position in contentContainer.
      let insertPos: Element | null = null;
      if (pageIndex > 0) {
        insertPos = viewItem.pages[pageIndex - 1].container.nextElementSibling;
      } else {
        for (
          let i = viewItem.item.spineIndex + 1;
          i < this.spineItems.length;
          i++
        ) {
          const item = this.spineItems[i];
          if (item && item.pages[0]) {
            insertPos = item.pages[0].container;
            break;
          }
        }
      }
      viewItem.instance.viewport.contentContainer.insertBefore(
        page.container,
        insertPos,
      );
      this.updateRenderedPageCount(viewItem.item.spineIndex, 1);
    }
    this.pageSheetSizeReporter(
      {
        width: viewItem.instance.pageSheetWidth,
        height: viewItem.instance.pageSheetHeight,
      },
      viewItem.instance.pageSheetSize,
      viewItem.item.spineIndex,
      this.getRenderedPageIndex(viewItem, pageIndex),
      oldPage ? 0 : 1,
    );
  }

  private getRenderedPageCount(): number {
    return this.getRenderedPageCountBeforeSpine(this.opf.spine.length);
  }

  private getRenderedPageIndex(
    viewItem: OPFViewItem,
    pageIndex: number,
  ): number {
    return (
      this.getRenderedPageCountBeforeSpine(viewItem.item.spineIndex) + pageIndex
    );
  }

  private updateRenderedPageCount(spineIndex: number, delta: number): void {
    for (
      let index = spineIndex + 1;
      index <= this.opf.spine.length;
      index += index & -index
    ) {
      this.renderedPageCountFenwickTree[index] =
        (this.renderedPageCountFenwickTree[index] ?? 0) + delta;
    }
  }

  private getRenderedPageCountBeforeSpine(spineIndex: number): number {
    let count = 0;
    for (let index = spineIndex; index > 0; index -= index & -index) {
      count += this.renderedPageCountFenwickTree[index] ?? 0;
    }
    return count;
  }

  /**
   * Mark a spine item as complete if all layout positions have corresponding
   * rendered pages (Issue #1498).  When the item becomes complete, clean up
   * inherited CSS properties that were propagated to the layout box during
   * page float rendering so they don't leak into the next spine item or
   * remain in the DOM after layout (Issue #1752).
   */
  private markSpineItemCompleteIfReady(viewItem: OPFViewItem): void {
    viewItem.complete =
      viewItem.layoutPositions.length === viewItem.pages.length;
    if (viewItem.complete) {
      viewItem.instance.viewport.layoutBox.removeAttribute("style");
    }
  }

  private getTotalOffsetForViewItem(viewItem: OPFViewItem): number {
    const spineIndex = viewItem.item.spineIndex;
    let totalOffset = this.paginationProgress.totalOffsetsBySpine[spineIndex];
    if (totalOffset == null) {
      totalOffset = viewItem.xmldoc.getTotalOffset();
      this.paginationProgress.totalOffsetsBySpine[spineIndex] = totalOffset;
    }
    return totalOffset;
  }

  /**
   * Load all spine items (fetch and parse only, without layout) and record
   * their total offsets, so that the pagination progress fraction is
   * computed against the whole publication.
   */
  private collectTotalOffsets(): Task.Result<boolean> {
    if (this.paginationProgress.totalOffsetsReady) {
      return Task.newResult(true);
    }
    const totals = this.paginationProgress.totalOffsetsBySpine;
    let i = 0;
    const frame: Task.Frame<boolean> = Task.newFrame("collectTotalOffsets");
    frame
      .loopWithFrame((loopFrame) => {
        if (i === this.opf.spine.length) {
          loopFrame.breakLoop();
          return;
        }
        const spineIndex = i++;
        if (totals[spineIndex] != null) {
          loopFrame.continueLoop();
          return;
        }
        const item = this.opf.spine[spineIndex];
        this.opf.store.load(item.src).then((xmldoc) => {
          if (xmldoc) {
            totals[spineIndex] = xmldoc.getTotalOffset();
          }
          loopFrame.continueLoop();
        });
      })
      .then(() => {
        this.paginationProgress.totalOffsetsReady = true;
        frame.finish(true);
      });
    return frame.result();
  }

  private getTotalOffsetAll(): number {
    let total = 0;
    for (const totalOffset of this.paginationProgress.totalOffsetsBySpine) {
      if (totalOffset) {
        total += totalOffset;
      }
    }
    return total;
  }

  private getRenderedOffsetAll(): number {
    let total = 0;
    const totals = this.paginationProgress.totalOffsetsBySpine;
    const rendered = this.paginationProgress.renderedOffsetsBySpine;
    for (let i = 0; i < totals.length; i++) {
      const totalOffset = totals[i];
      if (!totalOffset) {
        continue;
      }
      const renderedOffset = rendered[i] ?? 0;
      total += Math.min(totalOffset, renderedOffset);
    }
    return total;
  }

  private reportPaginationProgress(
    viewItem: OPFViewItem,
    nextLayoutPosition: Vtree.LayoutPosition | null,
  ) {
    const hooks: Plugin.PaginationProgressHook[] = Plugin.getHooksForName(
      Plugin.HOOKS.PAGINATION_PROGRESS,
    );
    if (!hooks.length) {
      return;
    }
    const spineIndex = viewItem.item.spineIndex;
    const totalOffset = this.getTotalOffsetForViewItem(viewItem);
    let renderedOffset = totalOffset;
    if (nextLayoutPosition) {
      renderedOffset = viewItem.instance.getPosition(nextLayoutPosition, true);
    }
    if (renderedOffset < 0) {
      renderedOffset = 0;
    }
    if (renderedOffset > totalOffset) {
      renderedOffset = totalOffset;
    }
    const prevOffset =
      this.paginationProgress.renderedOffsetsBySpine[spineIndex];
    if (prevOffset != null && renderedOffset < prevOffset) {
      renderedOffset = prevOffset;
    }
    this.paginationProgress.renderedOffsetsBySpine[spineIndex] = renderedOffset;

    const pages = this.getRenderedPageCount();
    const totalOffsetAll = this.getTotalOffsetAll();
    const renderedOffsetAll = this.getRenderedOffsetAll();
    let fraction = totalOffsetAll > 0 ? renderedOffsetAll / totalOffsetAll : 0;
    if (fraction < this.paginationProgress.lastReportedFraction) {
      fraction = this.paginationProgress.lastReportedFraction;
    } else {
      this.paginationProgress.lastReportedFraction = fraction;
    }
    if (pages > this.paginationProgress.lastReportedPages) {
      this.paginationProgress.lastReportedPages = pages;
    }

    let href = viewItem.item.src;
    if (spineIndex >= (this.paginationProgress.lastReportedSpineIndex ?? -1)) {
      this.paginationProgress.lastReportedSpineIndex = spineIndex;
      this.paginationProgress.lastReportedHref = href;
    } else {
      href = this.paginationProgress.lastReportedHref ?? href;
    }

    const payload = {
      fraction,
      pages: this.paginationProgress.lastReportedPages,
      href,
    };
    for (const hook of hooks) {
      try {
        hook(payload);
      } catch (err) {
        Logging.logger.warn(err as Error);
      }
    }
  }

  private isInCounterResolveScope(): boolean {
    return this.counterStore.currentPageCountersStack.length > 0;
  }

  private hasNonEmptyPageType(page: Vtree.Page | null | undefined): boolean {
    return !!page?.pageType && page.pageType !== "";
  }

  private hasPageTypeBoundaryBetween(
    previousPage: Vtree.Page | null,
    currentPage: Vtree.Page | null,
  ): boolean {
    return (
      previousPage?.pageType != null &&
      currentPage?.pageType != null &&
      previousPage.pageType !== currentPage.pageType
    );
  }

  private resolvePageTypeForRenderSlot(
    viewItem: OPFViewItem,
    page: Vtree.Page,
    pageIndexToRender: number,
    oldPage: Vtree.Page | null,
    prevPage: Vtree.Page | null,
    nextExistingPage: Vtree.Page | null,
    inCounterResolveScopeAtStart: boolean,
  ): void {
    let shouldKeepOldPageType = false;
    if (oldPage) {
      const hasBoundaryBetweenPrevAndOld = this.hasPageTypeBoundaryBetween(
        prevPage,
        oldPage,
      );
      const nextPageContinuesOldPageType =
        nextExistingPage?.pageType === oldPage.pageType;
      const isOldPageOffsetStale = oldPage.offset !== page.offset;

      // If the old page exists, keep the pageType (named page).
      // This is necessary for named page with target-counter() to work.
      // (fix for issue #1136)
      const shouldKeepOldPageTypeInCounterResolveScope =
        // In target-counter resolution rerender, preserve the existing
        // pageType only when the old page is still layout-consistent.
        inCounterResolveScopeAtStart &&
        !isOldPageOffsetStale &&
        pageIndexToRender > 0;
      shouldKeepOldPageType =
        oldPage.pageType != null &&
        (shouldKeepOldPageTypeInCounterResolveScope ||
          pageIndexToRender === 0 ||
          oldPage.pageType === prevPage?.pageType);
      page.pageType = shouldKeepOldPageType ? oldPage.pageType : null;

      if (inCounterResolveScopeAtStart) {
        // Re-resolve the page-start type during target-counter rerender so a
        // stale named page is not reused when the new start is actually default.
        const pageStartPageType =
          viewItem.instance.getPageStartPageTypeOverride(page.position);
        if (pageStartPageType === "") {
          page.pageType = "";
        } else if (pageStartPageType) {
          page.pageType = pageStartPageType;
        }
      }

      if (!inCounterResolveScopeAtStart && !shouldKeepOldPageType) {
        const shouldUsePrevPageTypeToFixEarlyBoundary =
          pageIndexToRender > 1 &&
          hasBoundaryBetweenPrevAndOld &&
          nextPageContinuesOldPageType;
        // For a suspected one-page-early boundary, start from previous pageType
        // so the continuation page remains in the expected named-page run.
        const currentPageType = shouldUsePrevPageTypeToFixEarlyBoundary
          ? prevPage.pageType
          : null;
        viewItem.instance.styler.cascade.currentPageType = currentPageType;
        viewItem.instance.pageManager.pageCascadeInstance.currentPageType =
          currentPageType;
      }
    }

    const shouldSeedFromPrevPageType =
      !inCounterResolveScopeAtStart &&
      this.hasNonEmptyPageType(prevPage) &&
      this.hasNonEmptyPageType(nextExistingPage) &&
      prevPage.pageType !== nextExistingPage.pageType &&
      (!oldPage || oldPage.pageType == null);
    if (shouldSeedFromPrevPageType) {
      // If this slot has no reliable pageType yet, tentatively continue from
      // the previous named page to avoid early boundary drift during rerender.
      page.pageType = prevPage.pageType;
    }
  }

  private evaluateNextPageRelayout(
    oldPage: Vtree.Page | null,
    nextPage: Vtree.Page | null,
    positionChanged: boolean,
    offsetChanged: boolean,
    inCounterResolveScope: boolean,
  ): { needsRelayout: boolean; shouldCascade: boolean } {
    if (!oldPage || (!!nextPage && !positionChanged)) {
      return { needsRelayout: false, shouldCascade: false };
    }

    const shouldCascadeInCounterResolveScope =
      !!nextPage &&
      (oldPage.pageType === nextPage.pageType || !nextPage.pageType);
    const shouldResetNextPageTypeFromPositionChange =
      !!nextPage &&
      offsetChanged &&
      (!inCounterResolveScope || shouldCascadeInCounterResolveScope) &&
      (nextPage.pageType == null ||
        oldPage.pageType == null ||
        oldPage.pageType !== nextPage.pageType);
    if (shouldResetNextPageTypeFromPositionChange) {
      // If the previous page break position changed, the existing next
      // page may now start in a different named-page context.
      // Reset pageType so layoutNextPage() recalculates it.
      // (fix for issue #1497)
      nextPage.pageType = null;
    }

    // When inside a target-counter/target-text resolution scope
    // (pushPageCounters/popPageCounters), do not cascade to render
    // pages that have not been rendered yet. Creating new pages
    // inside the push/pop scope causes currentPageCounters to
    // advance, but popPageCounters then restores stale values,
    // leading to wrong page counter numbers on subsequently
    // rendered pages.
    const shouldCascadeToNextPage = !!nextPage || !inCounterResolveScope;
    return {
      needsRelayout: true,
      shouldCascade: shouldCascadeToNextPage,
    };
  }

  private preparePageCountersForRender(
    viewItem: OPFViewItem,
    pageIndexToRender: number,
  ): Vtree.Page | null {
    const oldPage = viewItem.pages[pageIndexToRender];
    // Restore page counter starts when re-rendering a page so target-counter()
    // and page-based counters stay stable across relayouts.
    const storedCounters = viewItem.pageCounterStarts[pageIndexToRender];
    if (storedCounters && (oldPage || pageIndexToRender === 0)) {
      this.counterStore.currentPageCounters =
        cloneCounterValues(storedCounters);
    } else if (pageIndexToRender > 0) {
      const previousPageCounters =
        viewItem.pageCounterEnds[pageIndexToRender - 1];
      if (previousPageCounters) {
        this.counterStore.currentPageCounters =
          cloneCounterValues(previousPageCounters);
      }
    }
    const startCounters = cloneCounterValues(
      this.counterStore.currentPageCounters,
    );
    if (!storedCounters || !oldPage) {
      viewItem.pageCounterStarts[pageIndexToRender] = startCounters;
    }
    return oldPage ?? null;
  }

  private maybeRelayoutFollowingPage(
    viewItem: OPFViewItem,
    nextLayoutPosition: Vtree.LayoutPosition | null,
    oldPage: Vtree.Page | null,
    renderedPage: Vtree.Page,
  ): Task.Result<any> {
    if (!nextLayoutPosition) {
      return Task.newResult(true);
    }

    const previousLayoutPosition =
      viewItem.layoutPositions[nextLayoutPosition.page];
    viewItem.layoutPositions[nextLayoutPosition.page] = nextLayoutPosition;
    const nextPage = viewItem.pages[nextLayoutPosition.page];
    const offsetChanged = !!oldPage && renderedPage.offset !== oldPage.offset;
    const hasActivePageFloatState =
      viewItem.instance.hasActiveRootPageFloatLayoutContext();
    // Even if the source layout position is unchanged, active root page-float
    // state can still change following pages through deferred continuations.
    const positionChanged =
      !previousLayoutPosition ||
      !nextLayoutPosition.isSamePosition(previousLayoutPosition) ||
      nextLayoutPosition.highestSeenOffset !==
        previousLayoutPosition.highestSeenOffset ||
      offsetChanged ||
      hasActivePageFloatState;
    const inCounterResolveScope = this.isInCounterResolveScope();
    const relayoutDecision = this.evaluateNextPageRelayout(
      oldPage,
      nextPage,
      positionChanged,
      offsetChanged,
      inCounterResolveScope,
    );
    if (!relayoutDecision.needsRelayout) {
      return Task.newResult(true);
    }

    viewItem.complete = false;
    if (!relayoutDecision.shouldCascade) {
      return Task.newResult(true);
    }
    return this.renderSinglePage(viewItem, nextLayoutPosition);
  }

  private resolveUnresolvedReferencesForPage(
    viewItem: OPFViewItem,
    page: Vtree.Page,
    pageIndex: number,
    nextLayoutPosition: Vtree.LayoutPosition | null,
  ): Task.Result<Vtree.Page> {
    const frame: Task.Frame<Vtree.Page> = Task.newFrame(
      "resolveUnresolvedReferencesForPage",
    );
    let cleanupReferenceResolution: (() => void) | null = null;
    frame.handler = (handlerFrame, err) => {
      cleanupReferenceResolution?.();
      handlerFrame.task.raise(err, handlerFrame.parent);
    };
    const currentPageSpineIndex = this.spineIndexOfCurrentPageCounters;
    const shouldPostpone =
      this.isInCounterResolveScope() ||
      this.followingSpineRerenderDepth > 0 ||
      this.pendingPageMaterializationDepth > 0;
    if (shouldPostpone) {
      this.postponeTargetHostPage(viewItem, pageIndex, nextLayoutPosition);
    }
    const unresolvedRefs = shouldPostpone
      ? []
      : this.counterStore.getUnresolvedRefsToPage(page);
    let unresolvedRefIndex = 0;
    let currentPage = page;

    frame
      .loopWithFrame((loopFrame) => {
        unresolvedRefIndex++;
        if (unresolvedRefIndex > unresolvedRefs.length) {
          loopFrame.breakLoop();
          return;
        }
        const refs = unresolvedRefs[unresolvedRefIndex - 1];
        refs.refs = refs.refs.filter((ref) =>
          this.counterStore.isUnresolvedReference(ref),
        );
        if (refs.refs.length === 0) {
          loopFrame.continueLoop();
          return;
        }
        const countersBeforeSourceLoad = cloneCounterValues(
          this.counterStore.currentPageCounters,
        );
        const spineIndexBeforeSourceLoad = this.spineIndexOfCurrentPageCounters;
        const restoreCountersBeforeSourceLoad = () => {
          this.counterStore.currentPageCounters = countersBeforeSourceLoad;
          this.spineIndexOfCurrentPageCounters = spineIndexBeforeSourceLoad;
        };
        cleanupReferenceResolution = restoreCountersBeforeSourceLoad;
        this.getPageViewItem(refs.spineIndex).then((sourceViewItem) => {
          cleanupReferenceResolution = null;
          restoreCountersBeforeSourceLoad();
          if (!sourceViewItem) {
            loopFrame.continueLoop();
            return;
          }
          refs.refs = refs.refs.filter((ref) =>
            this.counterStore.isUnresolvedReference(ref),
          );
          const pos = sourceViewItem.layoutPositions[refs.pageIndex];
          if (refs.refs.length === 0 || pos === undefined) {
            loopFrame.continueLoop();
            return;
          }
          // Save page type states and restore them after re-rendering page.
          // This is necessary for named page with target-counter() to work.
          // (fix for issues #1272 and #1497)
          const stylerCascade = sourceViewItem.instance.styler.cascade;
          const pageCascade =
            sourceViewItem.instance.pageManager.pageCascadeInstance;
          const savedStylerPageTypeState = {
            currentPageType: stylerCascade.currentPageType,
            previousPageType: stylerCascade.previousPageType,
          };
          const savedPageCascadePageTypeState = {
            currentPageType: pageCascade.currentPageType,
            previousPageType: pageCascade.previousPageType,
          };
          const savedPageGroupPageCounts = clonePageGroupPageCounts(
            sourceViewItem.instance.pageGroupPageCounts,
          );
          const savedCurrentPageGroupDocument =
            sourceViewItem.instance.currentPageGroupDocument;

          // Save the scopes and restore them after re-rendering page.
          // This is necessary for :blank page selector to work.
          // (fix for issues #1131 and #1513)
          const scopes = sourceViewItem.instance.scopes;
          sourceViewItem.instance.scopes = {};

          // Isolate root page-float layout context only when re-rendering an
          // already rendered target page. For first-time rendering of the
          // target page, keep the normal context so deferred page-floats can
          // continue to subsequent pages.
          // (fix for issue #1094 and regression in
          // target-counter-and-page-floats.html)
          const hasRenderedFollowingPage =
            refs.pageIndex < sourceViewItem.pages.length - 1;
          const hasRenderedSourcePage = !!sourceViewItem.pages[refs.pageIndex];
          const shouldIsolateRootPageFloatLayoutContext =
            hasRenderedSourcePage && hasRenderedFollowingPage;
          const previousPageFloatLayoutContext =
            shouldIsolateRootPageFloatLayoutContext && refs.pageIndex > 0
              ? sourceViewItem.pages[refs.pageIndex - 1]?.pageFloatLayoutContext
              : null;
          let originalRootPageFloatLayoutContext: PageFloats.RootPageFloatLayoutContext | null =
            null;
          const pageCountBeforeSourceRender = sourceViewItem.pages.length;
          const sourceWasComplete = sourceViewItem.complete;
          const adjustmentTotalBeforeSourceRender =
            this.pageCountAdjustmentTotals.get(sourceViewItem) ?? 0;
          const isCrossSpine = sourceViewItem !== viewItem;
          let resolutionStateRestored = false;
          let pageCountersPushed = false;
          let referencesPushed = false;
          const restoreReferenceResolutionState = (): void => {
            if (resolutionStateRestored) {
              return;
            }
            resolutionStateRestored = true;
            if (
              shouldIsolateRootPageFloatLayoutContext &&
              originalRootPageFloatLayoutContext
            ) {
              sourceViewItem.instance.endIsolatedRootPageFloatLayoutContext(
                originalRootPageFloatLayoutContext,
              );
            }
            stylerCascade.currentPageType =
              savedStylerPageTypeState.currentPageType;
            stylerCascade.previousPageType =
              savedStylerPageTypeState.previousPageType;
            pageCascade.currentPageType =
              savedPageCascadePageTypeState.currentPageType;
            pageCascade.previousPageType =
              savedPageCascadePageTypeState.previousPageType;
            sourceViewItem.instance.pageGroupPageCounts =
              savedPageGroupPageCounts;
            sourceViewItem.instance.currentPageGroupDocument =
              savedCurrentPageGroupDocument;
            sourceViewItem.instance.scopes = scopes;
            if (pageCountersPushed) {
              this.counterStore.popPageCounters();
              this.spineIndexOfCurrentPageCounters = currentPageSpineIndex;
            }
            if (referencesPushed) {
              this.counterStore.popReferencesToSolve();
            }
            cleanupReferenceResolution = null;
          };
          cleanupReferenceResolution = restoreReferenceResolutionState;

          if (shouldIsolateRootPageFloatLayoutContext) {
            originalRootPageFloatLayoutContext =
              sourceViewItem.instance.beginIsolatedRootPageFloatLayoutContext(
                previousPageFloatLayoutContext,
              );
          }

          this.counterStore.pushPageCounters(
            this.counterStore.currentPageCounters,
          );
          pageCountersPushed = true;
          this.counterStore.pushReferencesToSolve(refs.refs);
          referencesPushed = true;
          if (hasRenderedSourcePage) {
            // Same-page rerenders should recompute :nth(... of <page-type>)
            // from the page-group state of earlier pages only.
            sourceViewItem.instance.preparePageGroupPageIndicesForRerender(
              sourceViewItem.layoutPositions,
              refs.pageIndex,
            );
          }

          this.renderSinglePage(sourceViewItem, pos).then((result) => {
            const beforeRestoreStylerCurrentPageType =
              stylerCascade.currentPageType;
            restoreReferenceResolutionState();
            const continueAfterPostponedReferences = () => {
              if (this.resolvingPostponedReferences) {
                loopFrame.continueLoop();
                return;
              }
              this.resolvePostponedReferences().then(() =>
                loopFrame.continueLoop(),
              );
            };
            if (
              result.pageAndPosition.position.spineIndex ===
                currentPage.spineIndex &&
              result.pageAndPosition.position.pageIndex === pageIndex
            ) {
              currentPage = result.pageAndPosition.page;
            }
            // Keep the current pageType aligned when recursive rerender of
            // target-counter() shifts this page's named-page context.
            // Guard with previous value checks to avoid leaking unrelated
            // pageType updates from other rerender targets.
            const shouldSyncStylerCurrentPageType =
              !!currentPage.pageType &&
              currentPage.pageType !==
                savedStylerPageTypeState.currentPageType &&
              beforeRestoreStylerCurrentPageType !==
                result.pageAndPosition.page.pageType;
            if (shouldSyncStylerCurrentPageType) {
              stylerCascade.currentPageType = currentPage.pageType;
            }
            // Issue #1498: target-counter() resolution can leave pending
            // layout slots (layoutPositions has next page) without an actual
            // rendered page in pages[]. Materialize those pending pages here so
            // later navigation/render loops do not stop early.
            // For cross-spine cases, save/restore counter state around the
            // pending page render.
            const savedCountersBeforePending = isCrossSpine
              ? cloneCounterValues(this.counterStore.currentPageCounters)
              : null;
            if (isCrossSpine) {
              cleanupReferenceResolution = () => {
                this.counterStore.currentPageCounters =
                  savedCountersBeforePending;
                this.spineIndexOfCurrentPageCounters = currentPageSpineIndex;
                cleanupReferenceResolution = null;
              };
            }
            this.materializePendingPages(
              sourceViewItem,
              sourceWasComplete ? Infinity : 1,
            ).then(() => {
              // The source spine's re-render (or cascade inside the resolve
              // scope) may have set complete=false even when no pending page
              // was created. Re-check completeness so navigation can advance
              // past this spine.
              this.markSpineItemCompleteIfReady(sourceViewItem);
              const pageDelta = this.getUnappliedPageCountChange(
                sourceViewItem,
                pageCountBeforeSourceRender,
                adjustmentTotalBeforeSourceRender,
              );
              this.adjustFollowingSpinesForPageCountChange(
                sourceViewItem,
                pageDelta,
                savedCountersBeforePending ??
                  this.counterStore.currentPageCounters,
                savedCountersBeforePending
                  ? currentPageSpineIndex
                  : this.spineIndexOfCurrentPageCounters,
              );
              if (savedCountersBeforePending) {
                this.counterStore.currentPageCounters =
                  savedCountersBeforePending;
                this.spineIndexOfCurrentPageCounters = currentPageSpineIndex;
                cleanupReferenceResolution = null;
              }
              this.scheduleFollowingSpineRerender(sourceViewItem, pageDelta);
              continueAfterPostponedReferences();
            });
          });
        });
      })
      .thenAsync(() =>
        shouldPostpone ? Task.newResult(true) : this.drainPostponedWork(),
      )
      .then(() => {
        if (!currentPage.container.parentElement) {
          currentPage =
            viewItem.pages[pageIndex] ??
            viewItem.pages[viewItem.pages.length - 1] ??
            currentPage;
        }
        const retainedPageIndex = viewItem.pages.indexOf(currentPage);
        const currentPageIndex =
          retainedPageIndex < 0 ? pageIndex : retainedPageIndex;
        const currentNextLayoutPosition =
          retainedPageIndex < 0
            ? nextLayoutPosition
            : (viewItem.layoutPositions[currentPageIndex + 1] ?? null);
        currentPage.isLastPage =
          !currentNextLayoutPosition &&
          viewItem.item.spineIndex === this.opf.spine.length - 1;
        if (currentPage.isLastPage) {
          this.counterStore.finishLastPage(this.viewport);
        }
        currentPage.container.setAttribute(
          "data-vivliostyle-page-index",
          currentPageIndex,
        );
        currentPage.container.setAttribute(
          "data-vivliostyle-spine-index",
          currentPage.spineIndex,
        );
        frame.finish(currentPage);
      });
    return frame.result();
  }

  private materializePendingPages(
    viewItem: OPFViewItem,
    maxPageCount: number,
  ): Task.Result<boolean> {
    const frame = Task.newFrame<boolean>("materializePendingPages");
    let renderedPageCount = 0;
    this.pendingPageMaterializationDepth++;
    frame.handler = (handlerFrame, err) => {
      this.pendingPageMaterializationDepth--;
      handlerFrame.task.raise(err, handlerFrame.parent);
    };
    frame
      .loopWithFrame((loopFrame) => {
        const pageCount = viewItem.pages.length;
        const pendingLayoutPosition = viewItem.layoutPositions[pageCount];
        if (
          renderedPageCount >= maxPageCount ||
          pendingLayoutPosition === undefined ||
          viewItem.instance.hasActiveRootPageFloatLayoutContext()
        ) {
          loopFrame.breakLoop();
          return;
        }
        this.renderSinglePage(viewItem, pendingLayoutPosition).then(() => {
          renderedPageCount++;
          if (viewItem.pages.length > pageCount) {
            loopFrame.continueLoop();
          } else {
            loopFrame.breakLoop();
          }
        });
      })
      .then(() => {
        this.pendingPageMaterializationDepth--;
        frame.finish(true);
      });
    return frame.result();
  }

  private releasePostponedReferenceWaiters(error?: Error): void {
    for (const waiter of this.postponedReferenceResolutionWaiters.splice(0)) {
      waiter.schedule(error ?? null);
    }
  }

  private drainPostponedWork(): Task.Result<boolean> {
    if (
      this.isInCounterResolveScope() ||
      this.followingSpineRerenderDepth > 0 ||
      this.pendingPageMaterializationDepth > 0
    ) {
      return Task.newResult(true);
    }
    return this.resolvePostponedReferences();
  }

  private isPostponedTargetHostPagePending(
    entry: PostponedTargetHostPage,
  ): boolean {
    const spineIndex = entry.viewItem.item.spineIndex;
    if (
      this.spineItems[spineIndex] !== undefined &&
      this.spineItems[spineIndex] !== entry.viewItem
    ) {
      return false;
    }
    const page = entry.viewItem.pages[entry.pageIndex];
    return !!page && this.counterStore.hasUnresolvedReferencesToPage(page);
  }

  private postponeTargetHostPage(
    viewItem: OPFViewItem,
    pageIndex: number,
    nextLayoutPosition: Vtree.LayoutPosition | null,
  ): void {
    const entry = { viewItem, pageIndex, nextLayoutPosition };
    if (!this.isPostponedTargetHostPagePending(entry)) {
      return;
    }
    const existing = this.postponedTargetHostPages.find(
      (queued) =>
        queued.viewItem === viewItem && queued.pageIndex === pageIndex,
    );
    if (existing) {
      existing.nextLayoutPosition = nextLayoutPosition;
      return;
    }
    this.postponedTargetHostPages.push(entry);
  }

  private getUnresolvedReferencesToPostponedPages(): Counters.TargetCounterReference[] {
    return Array.from(
      new Set(
        this.postponedTargetHostPages
          .filter((entry) => this.isPostponedTargetHostPagePending(entry))
          .flatMap((entry) =>
            this.counterStore
              .getUnresolvedRefsToPage(entry.viewItem.pages[entry.pageIndex])
              .flatMap((group) => group.refs),
          ),
      ),
    );
  }

  private get layoutPassLimit(): number {
    const limit = this.maxTargetReferenceLayoutPasses;
    return Number.isSafeInteger(limit) && limit > 0 ? limit : 1;
  }

  private describeLayoutPassLimit(): string {
    const passes = this.layoutPassLimit;
    return `${passes} ${passes === 1 ? "pass" : "passes"}`;
  }

  private pinPostponedTargetPages(): boolean {
    const targetIds = Array.from(
      new Set(
        this.getUnresolvedReferencesToPostponedPages().map(
          (ref) => ref.targetId,
        ),
      ),
    );
    const pinnedTargetIds = this.counterStore.pinTargetPages(targetIds);
    if (pinnedTargetIds.length > 0) {
      Logging.logger.warn(
        `Cross-reference layout did not converge after ${this.describeLayoutPassLimit()}; pinning ${this.describeTargets(pinnedTargetIds)} to the last page number, which may leave earlier pages blank`,
      );
    }
    return targetIds.some((id) => !!this.counterStore.getPinnedTarget(id));
  }

  private describeTargetId(id: string): string {
    if (!id.startsWith(transformedIdPrefix)) {
      return id;
    }
    const [url, fragment] =
      this.counterStore.documentURLTransformer.restoreURL(id);
    if (!url) {
      return id;
    }
    return fragment ? `${url}#${fragment}` : url;
  }

  private abandonPostponedReferences(): void {
    const targets = this.describeTargetsOf(
      this.getUnresolvedReferencesToPostponedPages(),
    );
    this.postponedTargetHostPages = [];
    Logging.logger.warn(
      `Cross-reference layout was stopped after ${this.describeLayoutCycleLimit()}; references to ${targets} are left unresolved`,
    );
  }

  private describeTargetsOf(refs: Counters.TargetCounterReference[]): string {
    return this.describeTargets(
      Array.from(new Set(refs.map((ref) => ref.targetId))),
    );
  }

  private describeTargets(ids: string[]): string {
    return `${ids.length === 1 ? "target" : "targets"} ${describeList(
      ids.map((id) => this.describeTargetId(id)),
    )}`;
  }

  private settleFrozenPostponedReferences(): void {
    this.counterStore.settleFrozenReferences(
      this.getUnresolvedReferencesToPostponedPages(),
    );
    this.postponedTargetHostPages = this.postponedTargetHostPages.filter(
      (entry) => this.isPostponedTargetHostPagePending(entry),
    );
  }

  private freezePostponedTargetReferences(reason: string): void {
    const frozenReferences = this.counterStore.freezeTargetReferences(
      this.getUnresolvedReferencesToPostponedPages(),
    );
    if (frozenReferences.length === 0) {
      return;
    }
    Logging.logger.warn(
      `Cross-reference layout did not converge ${reason}; references to ${this.describeTargetsOf(frozenReferences)} keep their last resolved values`,
    );
  }

  private describeLayoutCycleLimit(): string {
    const cycles = this.layoutPassLimit;
    return `${cycles} resolution ${cycles === 1 ? "cycle" : "cycles"}`;
  }

  private resolvePostponedReferences(): Task.Result<boolean> {
    if (this.isInCounterResolveScope()) {
      return Task.newResult(true);
    }
    if (this.resolvingPostponedReferences) {
      const resolutionTask = this.postponedReferenceResolutionTask;
      if (resolutionTask && resolutionTask !== Task.currentTask()) {
        const frame = Task.newFrame<Error | null>(
          "waitForPostponedReferenceResolution",
        );
        const continuation = frame.suspend(this);
        this.postponedReferenceResolutionWaiters.push(continuation);
        return frame.result().thenAsync((error) => {
          if (error) {
            throw error;
          }
          return this.resolvePostponedReferences();
        });
      }
      return Task.newResult(true);
    }
    if (
      this.postponedTargetHostPages.length === 0 &&
      this.pendingFollowingSpineRerenders.size === 0
    ) {
      return Task.newResult(true);
    }
    const frame = Task.newFrame<boolean>("resolvePostponedReferences");
    const ownerTask = Task.currentTask();
    this.resolvingPostponedReferences = true;
    this.postponedReferenceResolutionTask = ownerTask;
    const ownsResolution = (): boolean =>
      this.postponedReferenceResolutionTask === ownerTask;
    const releaseWaiters = (error?: Error) => {
      if (!ownsResolution()) {
        return;
      }
      this.resolvingPostponedReferences = false;
      this.postponedReferenceResolutionTask = null;
      this.releasePostponedReferenceWaiters(error);
    };
    let currentEntry: PostponedTargetHostPage | null = null;
    let entriesInCurrentPass = new Set<PostponedTargetHostPage>();
    frame.handler = (handlerFrame, err) => {
      if (
        ownsResolution() &&
        currentEntry &&
        this.isPostponedTargetHostPagePending(currentEntry) &&
        !this.postponedTargetHostPages.some(
          (queued) =>
            queued.viewItem === currentEntry.viewItem &&
            queued.pageIndex === currentEntry.pageIndex,
        )
      ) {
        this.postponedTargetHostPages.unshift(currentEntry);
      }
      currentEntry = null;
      releaseWaiters(err);
      handlerFrame.task.raise(err, handlerFrame.parent);
    };
    const layoutPassLimit = this.layoutPassLimit;
    let passesRun = 0;
    let passesLeftInPhase = layoutPassLimit;
    let cycleCount = 1;
    let flushCount = 0;
    let abandoning = false;
    let pinnedPhaseRan = false;
    let phase: "free" | "pinned" | "frozen" | "done" = "free";
    const enterPhase = (nextPhase: "free" | "pinned" | "frozen"): void => {
      phase = nextPhase;
      passesLeftInPhase = nextPhase === "frozen" ? 1 : layoutPassLimit;
      if (nextPhase !== "frozen") {
        pinnedPhaseRan = nextPhase === "pinned";
      }
      if (nextPhase === "frozen") {
        this.freezePostponedTargetReferences(
          abandoning
            ? `after ${this.describeLayoutCycleLimit()}`
            : pinnedPhaseRan
              ? `after ${this.describeLayoutPassLimit()} with pinned targets`
              : `after ${this.describeLayoutPassLimit()}`,
        );
      }
    };
    frame
      .loopWithFrame((loopFrame) => {
        if (!ownsResolution()) {
          loopFrame.breakLoop();
          return;
        }
        const entry = this.postponedTargetHostPages.find(
          (queued) =>
            entriesInCurrentPass.has(queued) &&
            this.isPostponedTargetHostPagePending(queued),
        );
        if (!entry) {
          this.postponedTargetHostPages = this.postponedTargetHostPages.filter(
            (queued) => this.isPostponedTargetHostPagePending(queued),
          );
          if (this.postponedTargetHostPages.length === 0 || phase === "done") {
            if (this.pendingFollowingSpineRerenders.size > 0) {
              if (flushCount < layoutPassLimit) {
                flushCount++;
                this.flushFollowingSpineRerenders().then(() =>
                  loopFrame.continueLoop(),
                );
                return;
              }
              if (flushCount === layoutPassLimit) {
                flushCount++;
                Logging.logger.warn(
                  `Following spines were rerendered in ${layoutPassLimit} ${layoutPassLimit === 1 ? "round" : "rounds"} without settling; the layout of the spines following ${describeList(
                    Array.from(
                      this.pendingFollowingSpineRerenders.keys(),
                      (viewItem) => viewItem.item.src,
                    ),
                  )} is kept as it is`,
                );
              }
              this.pendingFollowingSpineRerenders.clear();
            }
            if (this.postponedTargetHostPages.length === 0) {
              loopFrame.breakLoop();
              return;
            }
            if (abandoning) {
              this.abandonPostponedReferences();
              loopFrame.breakLoop();
              return;
            }
            if (++cycleCount > layoutPassLimit) {
              abandoning = true;
              enterPhase("frozen");
            } else {
              enterPhase("free");
            }
          }
          if (passesLeftInPhase <= 0) {
            if (phase === "free" && this.pinPostponedTargetPages()) {
              enterPhase("pinned");
            } else if (phase !== "frozen") {
              enterPhase("frozen");
            } else {
              phase = "done";
              entriesInCurrentPass.clear();
              this.settleFrozenPostponedReferences();
              loopFrame.continueLoop();
              return;
            }
          }
          passesLeftInPhase--;
          passesRun++;
          entriesInCurrentPass = new Set(this.postponedTargetHostPages);
          loopFrame.continueLoop();
          return;
        }
        this.postponedTargetHostPages.splice(
          this.postponedTargetHostPages.indexOf(entry),
          1,
        );
        currentEntry = entry;
        this.resolveUnresolvedReferencesForPage(
          entry.viewItem,
          entry.viewItem.pages[entry.pageIndex],
          entry.pageIndex,
          entry.nextLayoutPosition,
        ).then(() => {
          currentEntry = null;
          if (this.isPostponedTargetHostPagePending(entry)) {
            this.postponeTargetHostPage(
              entry.viewItem,
              entry.pageIndex,
              entry.nextLayoutPosition,
            );
          }
          loopFrame.continueLoop();
        });
      })
      .then(() => {
        if (ownsResolution() && (passesRun > 0 || flushCount > 0)) {
          this.counterStore.updateRunningTargetReferenceNodes(
            this.viewport.root,
          );
        }
        releaseWaiters();
        frame.finish(true);
      });
    return frame.result();
  }

  private getPageNumberResetSpineIndexAfter(spineIndex: number): number {
    const resetSpineIndex = this.opf.spine.findIndex(
      (item, index) => index > spineIndex && item.startPage !== null,
    );
    return resetSpineIndex < 0 ? Infinity : resetSpineIndex;
  }

  private adjustFollowingSpinesForPageCountChange(
    changedViewItem: OPFViewItem,
    pageDelta: number,
    currentPageCounters: CssCascade.CounterValues | null,
    currentPageSpineIndex: number,
  ): void {
    if (pageDelta === 0) {
      return;
    }
    const changedSpineIndex = changedViewItem.item.spineIndex;
    const pageNumberResetSpineIndex =
      this.getPageNumberResetSpineIndexAfter(changedSpineIndex);
    const excludedSpineIndices = new Set(
      this.spineItems
        .filter(
          (viewItem) =>
            !!viewItem &&
            this.spineItemsWithEstimatedPageNumberOffset.has(viewItem),
        )
        .map((viewItem) => viewItem.item.spineIndex),
    );
    const changedTargetIds = this.counterStore.adjustPageCountersOfLaterSpines(
      changedSpineIndex,
      pageDelta,
      pageNumberResetSpineIndex,
      excludedSpineIndices,
    );
    for (const viewItem of this.spineItems) {
      if (!viewItem) {
        continue;
      }
      if (
        viewItem.item.spineIndex <= changedSpineIndex ||
        viewItem.item.spineIndex >= pageNumberResetSpineIndex ||
        this.spineItemsWithEstimatedPageNumberOffset.has(viewItem)
      ) {
        continue;
      }
      viewItem.instance.pageNumberOffset += pageDelta;
      for (const counters of new Set([
        ...viewItem.pageCounterStarts,
        ...viewItem.pageCounterEnds,
      ])) {
        Counters.shiftOutermostPageCounter(counters, pageDelta);
      }
      this.counterStore.updatePageCounterNodesInPages(
        viewItem.pages,
        viewItem.pageCounterEnds,
      );
    }
    if (
      currentPageSpineIndex > changedSpineIndex &&
      currentPageSpineIndex < pageNumberResetSpineIndex &&
      !excludedSpineIndices.has(currentPageSpineIndex) &&
      currentPageCounters
    ) {
      Counters.shiftOutermostPageCounter(currentPageCounters, pageDelta);
      Counters.shiftOutermostPageCounter(
        this.counterStore.pageCountersBeforeOverride,
        pageDelta,
      );
    }
    if (changedTargetIds.length) {
      for (const id of changedTargetIds) {
        const { spineIndex, pageIndex } = this.counterStore.pageIndicesById[id];
        const viewItem = this.spineItems[spineIndex];
        if (viewItem?.pages[pageIndex]?.elementsById[id]) {
          this.postponeTargetHostPage(
            viewItem,
            pageIndex,
            viewItem.layoutPositions[pageIndex + 1] ?? null,
          );
        }
      }
    }
    this.pageCountAdjustmentTotals.set(
      changedViewItem,
      (this.pageCountAdjustmentTotals.get(changedViewItem) ?? 0) + pageDelta,
    );
  }

  private getUnappliedPageCountChange(
    viewItem: OPFViewItem,
    pageCountBeforeLayout: number,
    adjustmentTotalBeforeLayout: number,
  ): number {
    const pageCountChange = viewItem.pages.length - pageCountBeforeLayout;
    const appliedPageCountChange =
      (this.pageCountAdjustmentTotals.get(viewItem) ?? 0) -
      adjustmentTotalBeforeLayout;
    return pageCountChange - appliedPageCountChange;
  }

  private derivePageNumberOffset(
    item: OPFItem,
    previousViewItem: OPFViewItem | null,
  ): number | null {
    if (item.startPage !== null) {
      return item.startPage - 1;
    }
    if (!previousViewItem?.complete) {
      return null;
    }
    return (
      previousViewItem.instance.pageNumberOffset +
      previousViewItem.pages.length +
      (item.skipPagesBefore ?? 0)
    );
  }

  private rebuildPageNumberOffset(viewItem: OPFViewItem): void {
    const pageNumberOffset = this.derivePageNumberOffset(
      viewItem.item,
      this.spineItems[viewItem.item.spineIndex - 1],
    );
    if (pageNumberOffset !== null) {
      viewItem.instance.applyPageNumberOffset(pageNumberOffset);
      this.spineItemsWithEstimatedPageNumberOffset.delete(viewItem);
    }
  }

  private scheduleFollowingSpineRerender(
    changedViewItem: OPFViewItem,
    pageDelta: number,
    throughPageNumberReset: boolean = false,
  ): void {
    if (pageDelta === 0 && !throughPageNumberReset) {
      return;
    }
    this.pendingFollowingSpineRerenders.set(
      changedViewItem,
      throughPageNumberReset ||
        (this.pendingFollowingSpineRerenders.get(changedViewItem) ?? false),
    );
  }

  private flushFollowingSpineRerenders(): Task.Result<boolean> {
    const frame = Task.newFrame<boolean>("flushFollowingSpineRerenders");
    let dropRerenderedEntries: (() => void) | null = null;
    frame.handler = (handlerFrame, err) => {
      dropRerenderedEntries?.();
      handlerFrame.task.raise(err, handlerFrame.parent);
    };
    frame
      .loopWithFrame((loopFrame) => {
        const pending = Array.from(
          this.pendingFollowingSpineRerenders.entries(),
        );
        if (pending.length === 0) {
          loopFrame.breakLoop();
          return;
        }
        const [firstChangedViewItem] = pending.reduce((earliest, entry) =>
          entry[0].item.spineIndex < earliest[0].item.spineIndex
            ? entry
            : earliest,
        );
        const firstChangedSpineIndex = firstChangedViewItem.item.spineIndex;
        const resetSpineIndex = this.getPageNumberResetSpineIndexAfter(
          firstChangedSpineIndex,
        );
        const endSpineIndex =
          this.counterStore.customPageControlledCountersEverDeclared() ||
          pending.some(
            ([viewItem, throughReset]) =>
              throughReset && viewItem.item.spineIndex < resetSpineIndex,
          )
            ? Infinity
            : resetSpineIndex;
        dropRerenderedEntries = () => {
          for (const viewItem of this.pendingFollowingSpineRerenders.keys()) {
            const spineIndex = viewItem.item.spineIndex;
            if (
              spineIndex >= firstChangedSpineIndex &&
              spineIndex < endSpineIndex
            ) {
              this.pendingFollowingSpineRerenders.delete(viewItem);
            }
          }
          dropRerenderedEntries = null;
        };
        this.rerenderFollowingSpines(firstChangedViewItem, endSpineIndex).then(
          () => {
            dropRerenderedEntries();
            loopFrame.continueLoop();
          },
        );
      })
      .then(() => {
        frame.finish(true);
      });
    return frame.result();
  }

  private rerenderFollowingSpines(
    changedViewItem: OPFViewItem,
    endSpineIndex: number,
  ): Task.Result<boolean> {
    const changedSpineIndex = changedViewItem.item.spineIndex;
    const entries = this.spineItems
      .slice(changedSpineIndex + 1)
      .filter(
        (viewItem): viewItem is OPFViewItem =>
          !!viewItem && viewItem.item.spineIndex < endSpineIndex,
      )
      .map((viewItem) => ({
        viewItem,
        pageCountBeforeRerender: viewItem.pages.length,
        wasComplete: viewItem.complete,
        stalePages: new Set(viewItem.pages),
        pageCounterStatePrepared: false,
        adjustmentTotalBeforeRerender:
          this.pageCountAdjustmentTotals.get(viewItem) ?? 0,
      }));
    if (entries.length === 0) {
      return Task.newResult(true);
    }
    const countersBeforeRerender = cloneCounterValues(
      this.counterStore.currentPageCounters,
    );
    const spineIndexOfCountersBeforeRerender =
      this.spineIndexOfCurrentPageCounters;
    this.followingSpineRerenderDepth++;
    const finishRerender = (): void => {
      this.followingSpineRerenderDepth--;
      this.counterStore.currentPageCounters = countersBeforeRerender;
      this.spineIndexOfCurrentPageCounters = spineIndexOfCountersBeforeRerender;
    };
    const frame = Task.newFrame<boolean>("rerenderFollowingSpines");
    frame.handler = (handlerFrame, err) => {
      finishRerender();
      handlerFrame.task.raise(err, handlerFrame.parent);
    };
    let entryIndex = 0;
    let pageIndex = 0;
    frame
      .loopWithFrame((loopFrame) => {
        const entry = entries[entryIndex];
        if (!entry) {
          loopFrame.breakLoop();
          return;
        }
        if (
          this.spineItems[entry.viewItem.item.spineIndex] !== entry.viewItem
        ) {
          entryIndex++;
          pageIndex = 0;
          loopFrame.continueLoop();
          return;
        }
        if (!entry.pageCounterStatePrepared) {
          entry.pageCounterStatePrepared = true;
          this.rebuildPageNumberOffset(entry.viewItem);
          this.rebuildPageCounterStart(entry.viewItem);
        }
        const finishedRerendering = entry.wasComplete
          ? pageIndex >= entry.viewItem.pages.length &&
            pageIndex >= entry.viewItem.layoutPositions.length
          : pageIndex >= entry.pageCountBeforeRerender ||
            pageIndex >= entry.viewItem.pages.length;
        if (finishedRerendering) {
          const unappliedPageDelta = this.getUnappliedPageCountChange(
            entry.viewItem,
            entry.pageCountBeforeRerender,
            entry.adjustmentTotalBeforeRerender,
          );
          this.adjustFollowingSpinesForPageCountChange(
            entry.viewItem,
            unappliedPageDelta,
            null,
            -1,
          );
          this.markSpineItemCompleteIfReady(entry.viewItem);
          entryIndex++;
          pageIndex = 0;
          loopFrame.continueLoop();
          return;
        }
        const position = entry.viewItem.layoutPositions[pageIndex];
        const existingPage = entry.viewItem.pages[pageIndex];
        pageIndex++;
        if (
          position === undefined ||
          (existingPage && !entry.stalePages.has(existingPage))
        ) {
          loopFrame.continueLoop();
          return;
        }
        this.renderSinglePage(entry.viewItem, position).then(() =>
          loopFrame.continueLoop(),
        );
      })
      .then(() => {
        finishRerender();
        frame.finish(true);
      });
    return frame.result();
  }

  private rebuildPageCounterStart(viewItem: OPFViewItem): void {
    const previousViewItem = this.spineItems[viewItem.item.spineIndex - 1];
    let precedingViewItem: OPFViewItem | null = null;
    for (
      let spineIndex = viewItem.item.spineIndex - 1;
      spineIndex >= 0 && !precedingViewItem;
      spineIndex--
    ) {
      const candidate = this.spineItems[spineIndex];
      if (candidate?.pageCounterEnds[candidate.pages.length - 1]) {
        precedingViewItem = candidate;
      }
    }
    if (!precedingViewItem) {
      return;
    }
    const existingPageCounterStart = viewItem.pageCounterStarts[0]?.["page"];
    this.counterStore.currentPageCounters = cloneCounterValues(
      precedingViewItem.pageCounterEnds[precedingViewItem.pages.length - 1],
    );
    const followsPreviousSpine = precedingViewItem === previousViewItem;
    const pageCounterOffset = this.derivePageCounterOffset(
      viewItem.item,
      followsPreviousSpine ? previousViewItem : null,
    );
    if (pageCounterOffset !== null) {
      this.counterStore.forceSetPageCounter(pageCounterOffset);
    } else if (!followsPreviousSpine && existingPageCounterStart?.length) {
      this.counterStore.forceSetPageCounter(
        existingPageCounterStart[existingPageCounterStart.length - 1],
      );
    }
    this.spineIndexOfCurrentPageCounters = viewItem.item.spineIndex;
    viewItem.pageCounterStarts.splice(0);
    viewItem.pageCounterEnds.splice(0);
    viewItem.pageCounterStarts[0] = cloneCounterValues(
      this.counterStore.currentPageCounters,
    );
  }

  private derivePageCounterOffset(
    item: OPFItem,
    previousViewItem: OPFViewItem | null,
  ): number | null {
    if (item.startPage !== null) {
      return item.startPage - 1;
    }
    const lastPageIndex = previousViewItem
      ? previousViewItem.pages.length - 1
      : -1;
    const previousPageCounterEnds =
      previousViewItem?.pageCounterEnds[lastPageIndex]?.["page"];
    if (previousPageCounterEnds?.length) {
      return (
        previousPageCounterEnds[previousPageCounterEnds.length - 1] +
        (item.skipPagesBefore ?? 0)
      );
    }
    // pageCounterStarts stores the counter BEFORE auto-increment,
    // so add 1 for the page's own increment.
    const previousPageCounters =
      previousViewItem?.pageCounterStarts[lastPageIndex]?.["page"];
    if (!previousPageCounters?.length) {
      return null;
    }
    return (
      previousPageCounters[previousPageCounters.length - 1] +
      1 +
      (item.skipPagesBefore ?? 0)
    );
  }

  private rerenderFollowingSpinesAfterLoadingGap(
    viewItem: OPFViewItem,
  ): Task.Result<boolean> {
    const nextViewItem = this.spineItems[viewItem.item.spineIndex + 1];
    if (
      !viewItem.complete ||
      !nextViewItem ||
      !this.spineItemsWithEstimatedPageNumberOffset.has(nextViewItem)
    ) {
      return Task.newResult(true);
    }
    this.scheduleFollowingSpineRerender(viewItem, 0, true);
    return this.drainPostponedWork();
  }

  private truncateViewItemAfterPage(
    viewItem: OPFViewItem,
    pageIndex: number,
  ): Vtree.Page[] {
    const retainedPageCount = pageIndex + 1;
    const removedPages = viewItem.pages.splice(retainedPageCount);
    viewItem.layoutPositions.splice(retainedPageCount);
    viewItem.pageCounterStarts.splice(retainedPageCount);
    viewItem.pageCounterEnds.splice(retainedPageCount);
    if (removedPages.length) {
      this.updateRenderedPageCount(
        viewItem.item.spineIndex,
        -removedPages.length,
      );
      this.counterStore.removeReferencesFromPages(
        viewItem.item.spineIndex,
        retainedPageCount,
      );
      this.postponedTargetHostPages = this.postponedTargetHostPages.filter(
        (entry) =>
          entry.viewItem !== viewItem || entry.pageIndex < retainedPageCount,
      );
    }
    return removedPages;
  }

  private updateEPageRangesAfterPageCountChange(
    viewItem: OPFViewItem,
    pageCount: number,
  ): void {
    if (!this.opf.epageIsRenderedPage) {
      return;
    }
    const spineIndex = viewItem.item.spineIndex;
    viewItem.item.epageCount = pageCount;
    let nextEPage = viewItem.item.epage + pageCount;
    for (let index = spineIndex + 1; index < this.opf.spine.length; index++) {
      const item = this.opf.spine[index];
      item.epage = nextEPage;
      nextEPage += item.epageCount;
    }
    this.updateEPageCount();
  }

  private updateEPageCount(): void {
    this.opf.epageCount = this.opf.spine.reduce(
      (count, item) => count + item.epageCount,
      0,
    );
    if (this.opf.epageCountCallback) {
      this.opf.epageCountCallback(this.opf.epageCount);
    }
  }

  private discardSpineItem(spineIndex: number): void {
    const viewItem = this.spineItems[spineIndex];
    if (!viewItem) {
      return;
    }
    const renderedPageIndex = this.getRenderedPageIndex(viewItem, 0);
    const pageCount = viewItem.pages.length;
    for (const page of viewItem.pages) {
      page?.container?.remove();
    }
    if (pageCount) {
      this.pageSheetSizeReporter(
        null,
        {},
        spineIndex,
        renderedPageIndex,
        -pageCount,
      );
      this.updateRenderedPageCount(spineIndex, -pageCount);
      if (this.opf.epageIsRenderedPage) {
        viewItem.item.epageCount = 0;
        this.updateEPageCount();
      }
    }
    this.counterStore.removeReferencesFromPages(spineIndex, 0);
    this.counterStore.discardTargetSnapshotsOfSpine(spineIndex);
    this.pendingFollowingSpineRerenders.delete(viewItem);
    if (this.spineIndexOfCurrentPageCounters === spineIndex) {
      this.spineIndexOfCurrentPageCounters = -1;
    }
    this.postponedTargetHostPages = this.postponedTargetHostPages.filter(
      (entry) => entry.viewItem !== viewItem,
    );
    this.spineItems[spineIndex] = null;
    this.spineItemLoadingContinuations[spineIndex] = null;
  }

  private removeTruncatedPages(
    viewItem: OPFViewItem,
    removedPages: Vtree.Page[],
    replacementPage: Vtree.Page,
    newPosition: Position,
  ): void {
    for (const removedPage of removedPages) {
      removedPage.dispatchEvent({
        type: "replaced",
        target: null,
        currentTarget: null,
        preventDefault: null,
        newPage: replacementPage,
        newPosition,
      });
      removedPage.container.remove();
    }
    this.pageSheetSizeReporter(
      null,
      {},
      viewItem.item.spineIndex,
      this.getRenderedPageIndex(viewItem, newPosition.pageIndex + 1),
      -removedPages.length,
    );
  }

  /**
   * Render a single page. If the new page contains elements with ids that are
   * referenced from other pages by 'target-counter()', those pages are rendered
   * too (calling `renderSinglePage` recursively).
   */
  private renderSinglePage(
    viewItem: OPFViewItem,
    pos: Vtree.LayoutPosition | null,
  ): Task.Result<RenderSinglePageResult> {
    const frame: Task.Frame<RenderSinglePageResult> =
      Task.newFrame("renderSinglePage");

    const pageIndexToRender = pos ? Math.max(pos.page, 0) : 0;
    const pageNumberContextDepth =
      viewItem.instance.getPageNumberContextDepth();
    // Issue #2013: preserve the current render slot's page number so
    // page-number remains available during target-counter() rerender cleanup.
    viewItem.instance.pushPageNumberContext(pageIndexToRender + 1);
    const restorePageNumberContext = (): void => {
      viewItem.instance.restorePageNumberContextDepth(pageNumberContextDepth);
    };
    // Task errors bypass the success callback below, so unwind this fallback
    // page-number context here before re-raising to the parent frame.
    frame.handler = (handlerFrame, err) => {
      restorePageNumberContext();
      handlerFrame.task.raise(err, handlerFrame.parent);
    };
    const inCounterResolveScopeAtStart = this.isInCounterResolveScope();
    const oldPage = this.preparePageCountersForRender(
      viewItem,
      pageIndexToRender,
    );
    const prevPage =
      pageIndexToRender > 0 ? viewItem.pages[pageIndexToRender - 1] : null;
    const nextExistingPage = viewItem.pages[pageIndexToRender + 1];
    let page = this.makePage(viewItem, pos, pageIndexToRender);
    this.resolvePageTypeForRenderSlot(
      viewItem,
      page,
      pageIndexToRender,
      oldPage,
      prevPage,
      nextExistingPage,
      inCounterResolveScopeAtStart,
    );

    viewItem.instance.layoutNextPage(page, pos).then((posParam) => {
      pos = posParam;
      const pageIndex = pos ? pos.page - 1 : pageIndexToRender;
      const removedPages = !pos
        ? this.truncateViewItemAfterPage(viewItem, pageIndex)
        : [];
      const replacementPosition = removedPages.length
        ? makePageAndPosition(page, pageIndex).position
        : null;
      this.finishPageContainer(viewItem, page, pageIndex, replacementPosition);
      if (replacementPosition) {
        this.removeTruncatedPages(
          viewItem,
          removedPages,
          page,
          replacementPosition,
        );
        this.adjustFollowingSpinesForPageCountChange(
          viewItem,
          -removedPages.length,
          null,
          -1,
        );
        this.scheduleFollowingSpineRerender(viewItem, -removedPages.length);
      }
      this.counterStore.finishPage(page.spineIndex, pageIndex);
      this.spineIndexOfCurrentPageCounters = viewItem.item.spineIndex;
      viewItem.pageCounterEnds[pageIndex] = cloneCounterValues(
        this.counterStore.currentPageCounters,
      );

      const collectResult = Plugin.getHooksForName(
        Plugin.HOOKS.PAGINATION_PROGRESS,
      ).length
        ? this.collectTotalOffsets()
        : Task.newResult(true);
      collectResult.then(() => {
        this.reportPaginationProgress(viewItem, pos);

        // If the position of the page break changed, re-layout the following
        // page when needed.
        this.maybeRelayoutFollowingPage(viewItem, pos, oldPage, page)
          .thenAsync(() =>
            this.resolveUnresolvedReferencesForPage(
              viewItem,
              page,
              pageIndex,
              pos,
            ),
          )
          .then((resolvedPage) => {
            restorePageNumberContext();
            if (!pos && !inCounterResolveScopeAtStart) {
              // A final page can be produced by a nested relayout while
              // resolving a target reference. Mark the spine complete only
              // after that asynchronous work settles, otherwise navigation
              // can start the next spine against counter state still in use.
              this.markSpineItemCompleteIfReady(viewItem);
            }
            const resolvedPageIndex = viewItem.pages.indexOf(resolvedPage);
            const retainedPageIndex =
              resolvedPageIndex < 0 ? pageIndex : resolvedPageIndex;
            frame.finish({
              pageAndPosition: makePageAndPosition(
                resolvedPage,
                retainedPageIndex,
              ),
              nextLayoutPosition:
                viewItem.layoutPositions[retainedPageIndex + 1] ?? null,
            });
          });
      });
    });
    return frame.result();
  }

  private normalizeSeekPosition(
    position: Position,
    viewItem: OPFViewItem,
  ): Position {
    let pageIndex = position.pageIndex;
    let seekOffset = -1;
    if (pageIndex < 0) {
      seekOffset = position.offsetInItem;

      const seekOffsetPageIndex = Base.binarySearch(
        viewItem.layoutPositions.length,
        (pageIndex) => {
          // 'noLookAhead' argument of getPosition must be true, since
          // otherwise StyleInstance.currentLayoutPosition is modified
          // unintentionally.
          const offset = viewItem.instance.getPosition(
            viewItem.layoutPositions[pageIndex],
            true,
          );
          return offset > seekOffset;
        },
      );
      if (seekOffsetPageIndex === viewItem.layoutPositions.length) {
        if (viewItem.complete) {
          pageIndex = viewItem.pages.length - 1;
        } else {
          // need to search through pages that are not yet produced
          pageIndex = Number.POSITIVE_INFINITY;
        }
      } else {
        // page that contains seekOffset
        pageIndex = seekOffsetPageIndex - 1;
      }
    } else if (
      pageIndex === Number.POSITIVE_INFINITY &&
      position.offsetInItem !== -1
    ) {
      seekOffset = position.offsetInItem;
    }
    return {
      spineIndex: position.spineIndex,
      pageIndex,
      offsetInItem: seekOffset,
    } as Position;
  }

  /**
   * Find a page corresponding to a specified position among already laid out
   * pages.
   * @param sync If true, lay out the missing page in this task once no
   *     other task is rendering or resolving references; otherwise wait for
   *     a rendering task to produce it
   * @param renderedOnly If true, look the page up among the rendered pages
   *     only, without waiting for any task
   */
  findPage(
    position: Position,
    sync: boolean,
    renderedOnly: boolean = false,
  ): Task.Result<PageAndPosition | null> {
    if (renderedOnly && !this.spineItems[position.spineIndex]) {
      return Task.newResult(null as PageAndPosition | null);
    }
    const frame: Task.Frame<PageAndPosition | null> = Task.newFrame("findPage");
    this.waitForPreviousSpines(position.spineIndex, sync || renderedOnly).then(
      () => {
        this.getPageViewItem(position.spineIndex).then((viewItem) => {
          if (!viewItem) {
            frame.finish(null);
            return;
          }
          let resultPage: Vtree.Page | null = null;
          let pageIndex: number;
          frame
            .loopWithFrame((loopFrame) => {
              const normalizedPosition = this.normalizeSeekPosition(
                position,
                viewItem,
              );
              pageIndex = normalizedPosition.pageIndex;
              resultPage = viewItem.pages[pageIndex];
              if (resultPage) {
                loopFrame.breakLoop();
              } else if (viewItem.complete) {
                pageIndex = viewItem.pages.length - 1;
                resultPage = viewItem.pages[pageIndex];
                loopFrame.breakLoop();
              } else if (renderedOnly) {
                loopFrame.breakLoop();
              } else if (sync && !this.isRenderingOrResolvingInAnotherTask()) {
                this.renderPage(normalizedPosition).then((result) => {
                  if (result) {
                    resultPage = result.page;
                    pageIndex = result.position.pageIndex;
                  }
                  loopFrame.breakLoop();
                });
              } else if (this.isRenderingOrResolvingInAnotherTask()) {
                // A background task is already materializing pages. Wait for
                // the requested page to appear instead of rendering the same
                // shared StyleInstance and CounterStore concurrently (Issue #2047).
                frame.sleep(100).then(() => {
                  loopFrame.continueLoop();
                });
              } else if (
                pageIndex < viewItem.layoutPositions.length &&
                !viewItem.pages[pageIndex]
              ) {
                // The page has a pending layout position that was never
                // materialized (e.g. created during target-text resolution
                // but blocked from cascading, or the spine was recreated
                // during navigation). Render it now instead of polling
                // forever waiting for a nonexistent concurrent task.
                this.renderPage(normalizedPosition).then((result) => {
                  if (result) {
                    resultPage = result.page;
                    pageIndex = result.position.pageIndex;
                  }
                  loopFrame.breakLoop();
                });
              } else {
                // Wait for the layout task and retry
                frame.sleep(100).then(() => {
                  loopFrame.continueLoop();
                });
              }
            })
            .then(() => {
              frame.finish(
                resultPage ? makePageAndPosition(resultPage, pageIndex) : null,
              );
            });
        });
      },
    );
    return frame.result();
  }

  /**
   * Renders a page at the specified position.
   */
  renderPage(position: Position): Task.Result<PageAndPosition | null> {
    const currentTask = Task.currentTask();
    this.beginRenderingPage(currentTask);
    let renderingEnded = false;
    const endRendering = (): void => {
      if (!renderingEnded) {
        renderingEnded = true;
        this.endRenderingPage(currentTask);
      }
    };
    return Task.handle(
      "renderPage",
      (frame) => {
        this.renderPageTracked(position).then((result) => {
          const viewItem = this.spineItems[position.spineIndex];
          const rerenderResult = viewItem
            ? this.rerenderFollowingSpinesAfterLoadingGap(viewItem)
            : Task.newResult(true);
          rerenderResult
            .thenAsync(() => this.drainPostponedWork())
            .then(() => {
              const currentResult =
                result && !result.page.container.parentElement
                  ? this.renderPageTracked(position)
                  : Task.newResult(result);
              currentResult.then((finalResult) => {
                endRendering();
                frame.finish(finalResult);
              });
            });
        });
      },
      (frame, err) => {
        endRendering();
        frame.task.raise(err, frame.parent);
      },
    );
  }

  // Track renderPage tasks so navigation can wait only until its requested
  // page is available, without canceling background pagination (Issue #2047).
  private renderingPageTasks = new Map<Task.Task | null, number>();

  private beginRenderingPage(task: Task.Task | null): void {
    this.renderingPageTasks.set(
      task,
      (this.renderingPageTasks.get(task) || 0) + 1,
    );
  }

  private endRenderingPage(task: Task.Task | null): void {
    const depth = this.renderingPageTasks.get(task);
    if (depth === 1) {
      this.renderingPageTasks.delete(task);
    } else if (depth) {
      this.renderingPageTasks.set(task, depth - 1);
    }
  }

  isRenderingOrResolvingInAnotherTask(): boolean {
    const currentTask = Task.currentTask();
    return (
      (this.postponedReferenceResolutionTask !== null &&
        this.postponedReferenceResolutionTask !== currentTask) ||
      Array.from(this.renderingPageTasks.keys()).some(
        (task) => task !== currentTask,
      )
    );
  }

  private renderPageTracked(
    position: Position,
  ): Task.Result<PageAndPosition | null> {
    const frame: Task.Frame<PageAndPosition | null> =
      Task.newFrame("renderPageTracked");
    this.getPageViewItem(position.spineIndex).then((viewItem) => {
      if (!viewItem) {
        frame.finish(null);
        return;
      }
      const normalizedPosition = this.normalizeSeekPosition(position, viewItem);
      let pageIndex = normalizedPosition.pageIndex;
      const seekOffset = normalizedPosition.offsetInItem;
      let resultPage = viewItem.pages[pageIndex];
      if (resultPage) {
        frame.finish(makePageAndPosition(resultPage, pageIndex));
        return;
      }
      frame
        .loopWithFrame((loopFrame) => {
          if (pageIndex < viewItem.layoutPositions.length) {
            loopFrame.breakLoop();
            return;
          }
          if (viewItem.complete) {
            pageIndex = viewItem.pages.length - 1;
            loopFrame.breakLoop();
            return;
          }
          let pos =
            viewItem.layoutPositions[viewItem.layoutPositions.length - 1];
          this.renderSinglePage(viewItem, pos).then((result) => {
            const page = result.pageAndPosition.page;
            pos = result.nextLayoutPosition;
            if (pos) {
              if (seekOffset >= 0) {
                // Searching for offset, don't know the page number.
                const offset = viewItem.instance.getPosition(pos);
                if (offset > seekOffset) {
                  resultPage = page;
                  pageIndex = viewItem.layoutPositions.length - 2;
                  loopFrame.breakLoop();
                  return;
                }
              }
              loopFrame.continueLoop();
            } else {
              resultPage = page;
              pageIndex = result.pageAndPosition.position.pageIndex;
              // Issue #1498: do not mark complete if layoutPositions and pages
              // are out of sync. A pending layout position means additional
              // page rendering is still required.
              this.markSpineItemCompleteIfReady(viewItem);
              loopFrame.breakLoop();
            }
          });
        })
        .then(() => {
          resultPage = resultPage || viewItem.pages[pageIndex];
          const pos = viewItem.layoutPositions[pageIndex];
          if (resultPage) {
            frame.finish(makePageAndPosition(resultPage, pageIndex));
            return;
          }
          this.renderSinglePage(viewItem, pos).then((result) => {
            if (!result.nextLayoutPosition) {
              // Issue #1498: keep complete=false while there are pending
              // layout positions without corresponding rendered pages.
              this.markSpineItemCompleteIfReady(viewItem);
            }
            frame.finish(result.pageAndPosition);
          });
        });
    });
    return frame.result();
  }

  /**
   * Returns the last page, or null when it has been replaced by a page that
   * is not rendered yet.
   */
  renderAllPages(): Task.Result<PageAndPosition | null> {
    const frame: Task.Frame<PageAndPosition | null> =
      Task.newFrame("renderAllPages");
    this.renderPagesUpto(
      {
        spineIndex: this.opf.spine.length - 1,
        pageIndex: Number.POSITIVE_INFINITY,
        offsetInItem: -1,
      },
      false,
    ).then((renderedResult) => {
      this.drainPostponedWork()
        .thenAsync(() =>
          renderedResult && !renderedResult.page.container.parentElement
            ? this.findPage(renderedResult.position, true, true)
            : Task.newResult(renderedResult),
        )
        .then((result) => {
          // Wait until all images are loaded (Issue #1321)
          frame
            .loopWithFrame((loopFrame) => {
              if (
                this.spineItems.some((viewItem) =>
                  viewItem?.pages.some((page) =>
                    page?.fetchers.some((fetcher) => !fetcher.arrived),
                  ),
                )
              ) {
                frame.sleep(100).then(() => {
                  loopFrame.continueLoop();
                });
              } else {
                loopFrame.breakLoop();
              }
            })
            .then(() => {
              frame.finish(result);
            });
        });
    });
    return frame.result();
  }

  /**
   * Render pages from (spineIndex=0, pageIndex=0) to the specified (spineIndex,
   * pageIndex).
   * @param notAllPages If true, render from biginning of specified spine item.
   */
  renderPagesUpto(
    position: Position,
    notAllPages: boolean,
  ): Task.Result<PageAndPosition | null> {
    const frame: Task.Frame<PageAndPosition | null> =
      Task.newFrame("renderPagesUpto");
    if (!position) {
      position = { spineIndex: 0, pageIndex: 0, offsetInItem: 0 };
    }
    const spineIndex = position.spineIndex;
    const pageIndex = position.pageIndex;
    let s = 0;

    if (notAllPages) {
      // Render pages from biginning of specified spine item.
      s = spineIndex;
    }

    let lastResult: PageAndPosition | null = null;
    frame
      .loopWithFrame((loopFrame) => {
        const pos = {
          spineIndex: s,
          pageIndex: s === spineIndex ? pageIndex : Number.POSITIVE_INFINITY,
          offsetInItem: s === spineIndex ? position.offsetInItem : -1,
        };
        this.renderPage(pos).then((result) => {
          lastResult = result;
          if (++s > spineIndex) {
            loopFrame.breakLoop();
          } else {
            loopFrame.continueLoop();
          }
        });
      })
      .then(() => {
        frame.finish(lastResult);
      });
    return frame.result();
  }

  /**
   * Move to the first page and render it.
   */
  firstPage(
    position: Position,
    sync: boolean,
  ): Task.Result<PageAndPosition | null> {
    return this.findPage(
      { spineIndex: 0, pageIndex: 0, offsetInItem: -1 },
      sync,
    );
  }

  /**
   * Move to the last page and render it.
   */
  lastPage(
    position: Position,
    sync: boolean,
  ): Task.Result<PageAndPosition | null> {
    return this.findPage(
      {
        spineIndex: this.opf.spine.length - 1,
        pageIndex: Number.POSITIVE_INFINITY,
        offsetInItem: -1,
      },
      sync,
    );
  }

  /**
   * Move to the next page position and render page.
   * @param sync If true, lay out the missing page in this task (after any
   *     other rendering task has finished) instead of waiting for a
   *     rendering task to produce it
   * @param renderedOnly If true, use only the pages laid out so far, without
   *     laying out or discarding anything
   */
  nextPage(
    position: Position,
    sync: boolean,
    renderedOnly: boolean = false,
  ): Task.Result<PageAndPosition | null> {
    let spineIndex = position.spineIndex;
    let pageIndex = position.pageIndex;
    const frame: Task.Frame<PageAndPosition | null> = Task.newFrame("nextPage");
    this.getPageViewItem(spineIndex).then((viewItem) => {
      if (!viewItem) {
        frame.finish(null);
        return;
      }
      if (viewItem.complete && pageIndex == viewItem.pages.length - 1) {
        if (spineIndex >= this.opf.spine.length - 1) {
          frame.finish(null);
          return;
        }
        spineIndex++;
        pageIndex = 0;

        // Remove next viewItem if its first page has same side as the current page
        // to avoid unpaired page.
        const nextViewItem = this.spineItems[spineIndex];
        const nextPage = nextViewItem && nextViewItem.pages[0];
        const currentPage = viewItem.pages[viewItem.pages.length - 1];
        if (
          !renderedOnly &&
          !this.isRenderingOrResolvingInAnotherTask() &&
          nextPage &&
          currentPage &&
          nextPage.side == currentPage.side
        ) {
          this.discardSpineItem(spineIndex);
        }
      } else {
        pageIndex++;
      }
      this.findPage(
        { spineIndex, pageIndex, offsetInItem: -1 },
        sync,
        renderedOnly,
      ).thenFinish(frame);
    });
    return frame.result();
  }

  /**
   * Move to the previous page and render it.
   * @param renderedOnly If true, use the rendered pages only
   */
  previousPage(
    position: Position,
    sync: boolean,
    renderedOnly: boolean = false,
  ): Task.Result<PageAndPosition | null> {
    let spineIndex = position.spineIndex;
    let pageIndex = position.pageIndex;
    if (pageIndex == 0) {
      if (spineIndex == 0) {
        return Task.newResult(null as PageAndPosition | null);
      }
      spineIndex--;
      pageIndex = Number.POSITIVE_INFINITY;
    } else {
      pageIndex--;
    }
    return this.findPage(
      { spineIndex, pageIndex, offsetInItem: -1 },
      sync,
      renderedOnly,
    );
  }

  /**
   * @param page This page should be a currently displayed page.
   */
  private isRectoPage(page: Vtree.Page, position: Position): boolean {
    const isLeft = page.side === Constants.PageSide.LEFT;
    const isLTR =
      this.getCurrentPageProgression(position) ===
      Constants.PageProgression.LTR;
    return (!isLeft && isLTR) || (isLeft && !isLTR);
  }

  /**
   * Get a spread containing the currently displayed page.
   * @param sync If true, lay out the missing page in this task (after any
   *     other rendering task has finished) instead of waiting for a
   *     rendering task to produce it
   * @param renderedOnly If true, use only the pages laid out so far, without
   *     laying out or discarding anything; the spread then reports whether its
   *     pairing is still pending on a page that laying out or discarding could
   *     provide
   */
  getSpread(
    position: Position,
    sync: boolean,
    renderedOnly: boolean = false,
  ): Task.Result<Vtree.Spread> {
    const page = this.getPage(position);
    if (!page) {
      return Task.newResult({
        left: null,
        right: null,
        pairingPending: false,
      });
    }
    const frame: Task.Frame<Vtree.Spread> = Task.newFrame("getSpread");
    const isLeft = page.side === Constants.PageSide.LEFT;
    const isRecto = this.isRectoPage(page, position);
    const other = isRecto
      ? this.previousPage(position, sync, renderedOnly)
      : this.nextPage(position, sync, renderedOnly);
    other.then((otherPageAndPosition) => {
      // this page may be replaced during nextPage(), so get thisPage again.
      const thisPage = this.getPage(position);
      if (!thisPage) {
        frame.finish({ left: null, right: null, pairingPending: false });
        return;
      }

      let otherPage = otherPageAndPosition && otherPageAndPosition.page;
      if (otherPage && otherPage.side === thisPage.side) {
        // otherPage must not be same side
        otherPage = null;
      }
      const pairingPending =
        renderedOnly &&
        !otherPage &&
        (isRecto
          ? this.hasPageBefore(position)
          : this.mayHavePageAfter(position));

      if (isLeft) {
        frame.finish({
          left: thisPage,
          right: otherPage,
          pairingPending,
        });
      } else {
        frame.finish({
          left: otherPage,
          right: thisPage,
          pairingPending,
        });
      }
    });
    return frame.result();
  }

  private hasPageBefore(position: Position): boolean {
    return position.pageIndex > 0 || position.spineIndex > 0;
  }

  private mayHavePageAfter(position: Position): boolean {
    const viewItem = this.spineItems[position.spineIndex];
    if (!viewItem?.complete || position.pageIndex < viewItem.pages.length - 1) {
      return true;
    }
    return position.spineIndex < this.opf.spine.length - 1;
  }

  /**
   * Move to the next spread and render pages.
   * @param sync If true, lay out the missing page in this task (after any
   *     other rendering task has finished) instead of waiting for a
   *     rendering task to produce it
   * @returns The 'verso' page of the next spread.
   */
  nextSpread(
    position: Position,
    sync: boolean,
  ): Task.Result<PageAndPosition | null> {
    const page = this.getPage(position);
    if (!page) {
      return Task.newResult(null as PageAndPosition | null);
    }
    const isRecto = this.isRectoPage(page, position);
    const next = this.nextPage(position, sync);
    if (isRecto) {
      return next;
    } else {
      return next.thenAsync((result) => {
        if (result) {
          if (result.page.side === page.side) {
            // If same side, this is the next spread.
            return next;
          }
          const next2 = this.nextPage(result.position, sync);
          return next2.thenAsync((result2) => {
            if (result2) {
              return next2;
            } else {
              // If this is tha last spread, move to next page in the same spread.
              return next;
            }
          });
        } else {
          return Task.newResult(null as PageAndPosition | null);
        }
      });
    }
  }

  /**
   * Move to the previous spread and render pages.
   * @returns The 'recto' page of the previous spread.
   */
  previousSpread(
    position: Position,
    sync: boolean,
  ): Task.Result<PageAndPosition | null> {
    const page = this.getPage(position);
    if (!page) {
      return Task.newResult(null as PageAndPosition | null);
    }
    const isRecto = this.isRectoPage(page, position);
    const prev = this.previousPage(position, sync);
    const oldPrevPageCont = page.container.previousElementSibling;
    if (isRecto) {
      return prev.thenAsync((result) => {
        if (result) {
          if (result.page.side === page.side) {
            // If same side, this is the previous spread.
            return prev;
          }
          if (result.page.container !== oldPrevPageCont) {
            // If previous page is changed, return it.
            return prev;
          }
          return this.previousPage(result.position, sync);
        } else {
          return Task.newResult(null as PageAndPosition | null);
        }
      });
    } else {
      return prev;
    }
  }

  /**
   * Move to the epage specified by the given number (zero-based) and render it.
   */
  navigateToEPage(
    epage: number,
    position: Position,
    sync: boolean,
  ): Task.Result<PageAndPosition | null> {
    const frame: Task.Frame<PageAndPosition | null> =
      Task.newFrame("navigateToEPage");
    this.opf.resolveEPage(epage).then((position) => {
      if (position) {
        this.findPage(position, sync).thenFinish(frame);
      } else {
        frame.finish(null);
      }
    });
    return frame.result();
  }

  /**
   * Move to the page specified by the given CFI and render it.
   */
  navigateToFragment(
    fragment: string,
    position: Position,
    sync: boolean,
  ): Task.Result<PageAndPosition | null> {
    const frame: Task.Frame<PageAndPosition | null> =
      Task.newFrame("navigateToCFI");
    this.opf.resolveFragment(fragment).then((position) => {
      if (position) {
        this.findPage(position, sync).thenFinish(frame);
      } else {
        frame.finish(null);
      }
    });
    return frame.result();
  }

  private resolveSemanticFootnoteNavigationOffset(
    viewItem: OPFViewItem,
    target: Element,
  ): number | null {
    if (!SemanticFootnote.isSemanticFootnoteElement(target)) {
      return null;
    }
    const targetId = target.getAttribute("id");
    if (!targetId) {
      return null;
    }
    const targetURL = Base.resolveURL(`#${targetId}`, viewItem.xmldoc.url);
    const anchors = viewItem.xmldoc.document.getElementsByTagName("a");
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors.item(i);
      if (!SemanticFootnote.isSemanticFootnoteNoterefElement(anchor)) {
        continue;
      }
      const anchorHref =
        anchor.getAttribute("href") ||
        anchor.getAttributeNS(Base.NS.XLINK, "href");
      if (!anchorHref) {
        continue;
      }
      if (Base.resolveURL(anchorHref, viewItem.xmldoc.url) !== targetURL) {
        continue;
      }
      return viewItem.xmldoc.getElementOffset(anchor);
    }
    return null;
  }

  /**
   * Move to the page specified by the given URL and render it.
   */
  navigateTo(
    href: string,
    position: Position,
    sync: boolean,
  ): Task.Result<PageAndPosition | null> {
    Logging.logger.debug("Navigate to", href);
    let path = this.opf.getPathFromURL(Base.stripFragment(href));
    if (!path) {
      if (this.opf.opfXML && href.match(/^#epubcfi\(/)) {
        // CFI fragment is "relative" to OPF.
        path = this.opf.getPathFromURL(this.opf.opfXML.url);
      } else if (href.charAt(0) === "#") {
        const restored = this.opf.documentURLTransformer.restoreURL(href);
        if (this.opf.opfXML) {
          path = this.opf.getPathFromURL(restored[0]);
          if (path == null) {
            path = restored[0];
          }
        } else {
          path = restored[0];
        }
        href = restored[0] + (restored[1] ? `#${restored[1]}` : "");
      }
      if (path == null) {
        return Task.newResult(null as PageAndPosition | null);
      }
    }
    const item = this.opf.itemMapByPath[path];
    if (!item) {
      if (
        this.opf.opfXML &&
        path == this.opf.getPathFromURL(this.opf.opfXML.url)
      ) {
        // CFI link?
        const fragmentIndex = href.indexOf("#");
        if (fragmentIndex >= 0) {
          return this.navigateToFragment(
            href.substr(fragmentIndex + 1),
            position,
            sync,
          );
        }
      }
      return Task.newResult(null as PageAndPosition | null);
    }
    const frame: Task.Frame<PageAndPosition | null> =
      Task.newFrame("navigateTo");

    this.waitForPreviousSpines(item.spineIndex, sync).then(() => {
      this.getPageViewItem(item.spineIndex).then((viewItem) => {
        if (!viewItem) {
          frame.finish(null);
          return;
        }
        const target = viewItem.xmldoc.getElement(href);
        const semanticFootnoteOffset =
          target &&
          this.resolveSemanticFootnoteNavigationOffset(viewItem, target);
        const targetOffset =
          semanticFootnoteOffset != null
            ? semanticFootnoteOffset
            : target
              ? viewItem.xmldoc.getElementOffset(target)
              : 0;
        this.findPage(
          {
            spineIndex: item.spineIndex,
            pageIndex: -1,
            offsetInItem: targetOffset,
          },
          sync,
        ).thenFinish(frame);
      });
    });
    return frame.result();
  }

  makePage(
    viewItem: OPFViewItem,
    pos: Vtree.LayoutPosition | null,
    pageIndex: number,
  ): Vtree.Page {
    const viewport = viewItem.instance.viewport;
    const pageCont = viewport.document.createElement("div");
    pageCont.setAttribute("data-vivliostyle-page-container", "true");
    pageCont.role = "presentation";

    if (!Constants.isDebug) {
      pageCont.style.visibility = "hidden";
    }
    viewport.layoutBox.appendChild(pageCont);
    const bleedBox = viewport.document.createElement("div");
    bleedBox.setAttribute("data-vivliostyle-bleed-box", "true");
    bleedBox.role = "presentation";
    pageCont.appendChild(bleedBox);
    const page = new Vtree.Page(pageCont, bleedBox);
    page.spineIndex = viewItem.item.spineIndex;
    page.position = pos;
    page.offset = viewItem.instance.getPosition(pos);
    if (
      page.offset === 0 &&
      !(viewItem.instance.blankPageAtStart && pageIndex === 0)
    ) {
      const id = this.opf.documentURLTransformer.transformFragment(
        "",
        viewItem.item.src,
      );
      bleedBox.setAttribute("id", id);
      page.registerElementWithId(bleedBox, id);
    }
    if (viewport !== this.viewport) {
      const matrix = Exprs.letterbox(
        this.viewport.width,
        this.viewport.height,
        viewport.width,
        viewport.height,
      );
      const cssMatrix = CssParser.parseValue(
        viewItem.instance.style.rootScope,
        new CssTokenizer.Tokenizer(matrix, null),
        "",
      );
      page.delayedItems.push(
        new Vtree.DelayedItem(pageCont, "transform", cssMatrix),
      );
    }
    return page;
  }

  makeObjectView(
    xmldoc: XmlDoc.XMLDocHolder,
    srcElem: Element,
    viewParent: Element,
    computedStyle: { [key: string]: Css.Val },
  ): Task.Result<Element | null> {
    let data = srcElem.getAttribute("data");
    let result: Element | null = null;
    if (data) {
      data = Base.resolveURL(data, xmldoc.url);
      let mediaType = srcElem.getAttribute("media-type");
      if (!mediaType) {
        const path = this.opf.getPathFromURL(data);
        if (path) {
          const item = this.opf.itemMapByPath[path];
          if (item) {
            mediaType = item.mediaType;
          }
        }
      }
      if (mediaType) {
        const handlerSrc = this.opf.bindings[mediaType];
        if (handlerSrc) {
          result = this.viewport.document.createElement("iframe");
          (result as HTMLElement).style.border = "none";
          const srcParam = Base.lightURLEncode(data);
          const typeParam = Base.lightURLEncode(mediaType);
          const sb = new Base.StringBuffer();
          sb.append(handlerSrc);
          sb.append("?src=");
          sb.append(srcParam);
          sb.append("&type=");
          sb.append(typeParam);
          for (let c: Node | null = srcElem.firstChild; c; c = c.nextSibling) {
            if (c.nodeType == 1) {
              const ce = c as Element;
              if (ce.localName == "param" && ce.namespaceURI == Base.NS.XHTML) {
                const pname = ce.getAttribute("name");
                const pvalue = ce.getAttribute("value");
                if (pname && pvalue) {
                  sb.append("&");
                  sb.append(encodeURIComponent(pname));
                  sb.append("=");
                  sb.append(encodeURIComponent(pvalue));
                }
              }
            }
          }
          result.setAttribute("src", sb.toString());
          const width = srcElem.getAttribute("width");
          if (width) {
            result.setAttribute("width", width);
          }
          const height = srcElem.getAttribute("height");
          if (height) {
            result.setAttribute("height", height);
          }
        }
      }
    }
    if (!result) {
      result = this.viewport.document.createElement("object");
      if (data) {
        result.setAttribute("data", Base.resolveWptResourceURL(data));
      }
      result.setAttribute("data-adapt-process-children", "true");
    }

    // Need to cast because we need {Element}, not {!Element}
    return Task.newResult(result as Element);
  }

  makeMathJaxView(
    xmldoc: XmlDoc.XMLDocHolder,
    srcElem: Element,
    viewParent: Element,
    computedStyle: { [key: string]: Css.Val },
  ): Task.Result<Element | null> {
    // See if MathJax installed, use it if it is.
    const hub = getMathJaxHub();
    if (hub) {
      const doc = viewParent.ownerDocument;
      const span = doc.createElement("span");
      viewParent.appendChild(span);
      const clonedMath = doc.importNode(srcElem, true);
      this.resolveURLsInMathML(clonedMath, xmldoc);
      span.appendChild(clonedMath);
      const queue = hub["queue"];
      queue["Push"](["Typeset", hub, span]);
      const frame: Task.Frame<Element> = Task.newFrame("makeMathJaxView");
      const continuation = frame.suspend();
      queue["Push"](() => {
        continuation.schedule(span);
      });
      return frame.result();
    }
    return Task.newResult<Element | null>(null);
  }

  private resolveURLsInMathML(node: Node, xmldoc: XmlDoc.XMLDocHolder) {
    if (node == null) {
      return;
    }
    if (node.nodeType === 1 && (node as Element).tagName === "mglyph") {
      const attrs = Array.from((node as Element).attributes);
      for (const attr of attrs) {
        if (attr.name !== "src") {
          continue;
        }
        const newUrl = Base.resolveURL(attr.nodeValue, xmldoc.url);
        if (attr.namespaceURI) {
          (node as Element).setAttributeNS(
            attr.namespaceURI,
            attr.name,
            newUrl,
          );
        } else {
          (node as Element).setAttribute(attr.name, newUrl);
        }
      }
    }
    if (node.firstChild) {
      this.resolveURLsInMathML(node.firstChild, xmldoc);
    }
    if (node.nextSibling) {
      this.resolveURLsInMathML(node.nextSibling, xmldoc);
    }
  }

  /** @override */
  makeCustomRenderer(xmldoc: XmlDoc.XMLDocHolder): Vgen.CustomRenderer {
    return (
      srcElem: Element,
      viewParent: Element,
      computedStyle: { [key: string]: Css.Val },
    ): Task.Result<Element | null> => {
      if (
        srcElem.localName == "object" &&
        srcElem.namespaceURI == Base.NS.XHTML
      ) {
        return this.makeObjectView(xmldoc, srcElem, viewParent, computedStyle);
      } else if (srcElem.namespaceURI == Base.NS.MATHML) {
        return this.makeMathJaxView(xmldoc, srcElem, viewParent, computedStyle);
      } else if (
        (srcElem as HTMLElement).dataset &&
        (srcElem as HTMLElement).dataset["mathTypeset"] == "true"
      ) {
        return this.makeMathJaxView(xmldoc, srcElem, viewParent, computedStyle);
      }
      return Task.newResult<Element | null>(null);
    };
  }

  private restorePageCounterStateFromPreviousSpine(
    previousViewItem: OPFViewItem | null | undefined,
  ): void {
    const previousPageCounterEnd =
      previousViewItem?.complete && previousViewItem.pages.length
        ? previousViewItem.pageCounterEnds[previousViewItem.pages.length - 1]
        : null;
    if (previousPageCounterEnd) {
      this.counterStore.currentPageCounters = cloneCounterValues(
        previousPageCounterEnd,
      );
      this.spineIndexOfCurrentPageCounters = previousViewItem.item.spineIndex;
    }
  }

  getPageViewItem(spineIndex: number): Task.Result<OPFViewItem | null> {
    if (spineIndex === -1 || spineIndex >= this.opf.spine.length) {
      return Task.newResult<OPFViewItem | null>(null);
    }
    let viewItem = this.spineItems[spineIndex];
    if (viewItem) {
      return Task.newResult(viewItem);
    }
    const frame: Task.Frame<OPFViewItem> = Task.newFrame("getPageViewItem");

    // If loading for the item has already been started, suspend and wait for
    // the result.
    let loadingContinuations = this.spineItemLoadingContinuations[spineIndex];
    if (loadingContinuations) {
      const cont = frame.suspend();
      loadingContinuations.push(cont);
      return frame.result();
    } else {
      loadingContinuations = this.spineItemLoadingContinuations[spineIndex] =
        [];
    }
    const item = this.opf.spine[spineIndex];
    const store = this.opf.store;
    store.load(item.src).then((xmldoc: XmlDoc.XMLDocHolder) => {
      // EPUB Spine properties support
      const epubSpineProperties =
        item.itemRefElement.getAttribute("properties");
      if (epubSpineProperties) {
        xmldoc.root.setAttribute(
          "data-vivliostyle-epub-spine-properties",
          epubSpineProperties,
        );
      }
      item.title = xmldoc.document.title;
      const style = store.getStyleForDoc(xmldoc);
      const customRenderer = this.makeCustomRenderer(xmldoc);
      let viewport = this.viewport;
      const viewportSize = style.sizeViewport(
        viewport.width,
        viewport.height,
        viewport.fontSize,
        this.pref,
      );
      if (
        viewportSize.width != viewport.width ||
        viewportSize.height != viewport.height ||
        viewportSize.fontSize != viewport.fontSize
      ) {
        viewport = new Vgen.Viewport(
          viewport.window,
          viewportSize.fontSize,
          viewport.pixelRatio,
          viewport.root,
          viewportSize.width,
          viewportSize.height,
        );
      }
      const isVersoFirstPage = this.spineItems[0]?.instance.isVersoFirstPage;
      const previousViewItem = this.spineItems[spineIndex - 1];
      this.restorePageCounterStateFromPreviousSpine(previousViewItem);
      let pageNumberOffset: number;
      let pageCounterOffset: number;
      let pageNumberOffsetEstimated = false;
      if (item.startPage !== null) {
        pageNumberOffset = item.startPage - 1;
        pageCounterOffset = pageNumberOffset;
      } else {
        if (
          spineIndex > 0 &&
          (!previousViewItem || !previousViewItem.complete)
        ) {
          // When navigate to a new spine item skipping the previous items,
          // give up calculate pageNumberOffset and use epage (or spineIndex if epage is unset).
          pageNumberOffsetEstimated = true;
          pageNumberOffset = item.epage || spineIndex;
          if (
            !this.opf.prePaginated &&
            pageNumberOffset % 2 == (isVersoFirstPage ? 1 : 0)
          ) {
            // Force to odd number to avoid unpaired page. (This is 0 based and even number is recto)
            // (odd and even are reversed if isVersoFirstPage is true)
            pageNumberOffset++;
          }
          pageNumberOffset += item.skipPagesBefore ?? 0;
          pageCounterOffset = pageNumberOffset;
        } else {
          pageNumberOffset =
            this.derivePageNumberOffset(item, previousViewItem) ??
            item.skipPagesBefore ??
            0;
          // Derive the page counter offset from the previous spine's last
          // rendered page counter end (or start plus one) when it is
          // available, falling back to the global currentPageCounters.
          const counters = this.counterStore.currentPageCounters["page"];
          pageCounterOffset =
            this.derivePageCounterOffset(item, previousViewItem) ??
            (counters?.length
              ? counters[counters.length - 1] + (item.skipPagesBefore ?? 0)
              : pageNumberOffset);

          // Note: The "page" counter value differs to the "page-number" value
          // if the "page" counter has been reset by counter-reset/increment.
          // (Fix for issue #701)
        }
      }
      this.counterStore.forceSetPageCounter(pageCounterOffset);
      this.spineIndexOfCurrentPageCounters = spineIndex;
      const initialPageCounters = cloneCounterValues(
        this.counterStore.currentPageCounters,
      );
      // For env(pub-title) and env(doc-title)
      const pubTitles = this.opf.metadata && this.opf.metadata[metaTerms.title];
      const pubTitle = (pubTitles && pubTitles[0] && pubTitles[0]["v"]) || "";
      const docTitle = item.title || "";

      OPS.StyleInstance.create(
        style,
        xmldoc,
        this.opf.lang,
        viewport,
        this.clientLayout,
        this.fontMapper,
        customRenderer,
        this.opf.fallbackMap,
        pageNumberOffset,
        this.opf.documentURLTransformer,
        this.counterStore,
        this.cmykStore,
        this.pref,
        pubTitle,
        docTitle,
        this.opf.pageProgression,
        isVersoFirstPage,
      ).then((instance) => {
        if (!this.opf.pageProgression && instance.pageProgression) {
          // Use the first instance's page progression as the global page progression.
          // (Fix for issue #1260)
          this.opf.pageProgression = instance.pageProgression;
        }
        viewItem = {
          item,
          xmldoc,
          instance,
          layoutPositions: [null],
          pages: [],
          complete: false,
          pageCounterStarts: [initialPageCounters],
          pageCounterEnds: [],
        };
        this.spineItems[spineIndex] = viewItem;
        if (pageNumberOffsetEstimated) {
          this.spineItemsWithEstimatedPageNumberOffset.add(viewItem);
        }

        frame.finish(viewItem);
        loadingContinuations.forEach((c) => {
          c.schedule(viewItem);
        });
      });
    });
    return frame.result();
  }

  removeRenderedPages() {
    const items = this.spineItems;
    for (const item of items) {
      if (item) {
        item.pages.splice(0);
        item.layoutPositions.splice(0, item.layoutPositions.length, null);
        item.pageCounterStarts.splice(0);
        item.pageCounterEnds.splice(0);
        item.complete = false;
      }
    }
    this.spineItemsWithEstimatedPageNumberOffset = new WeakSet();
    this.renderedPageCountFenwickTree = [];
    this.postponedTargetHostPages = [];
    this.pendingFollowingSpineRerenders.clear();
    this.spineIndexOfCurrentPageCounters = -1;
    this.resolvingPostponedReferences = false;
    this.postponedReferenceResolutionTask = null;
    this.releasePostponedReferenceWaiters(new RenderingCanceledError());
    this.viewport.clear();
  }

  /**
   * Returns if at least one page has 'auto' size
   */
  hasAutoSizedPages(): boolean {
    const items = this.spineItems;
    for (const item of items) {
      if (item) {
        const pages = item.pages;
        for (const page of pages) {
          if (page.isAutoPageWidth && page.isAutoPageHeight) {
            return true;
          }
        }
      }
    }
    return false;
  }

  hasPages(): boolean {
    return this.spineItems.some((item) => item && item.pages.length > 0);
  }

  showTOC(autohide: boolean): Task.Result<Vtree.Page | null> {
    const opf = this.opf;
    const toc = opf.toc;
    this.tocAutohide = autohide;
    if (!toc) {
      return Task.newResult<Vtree.Page | null>(null);
    }
    this.tocVisible = true;
    if (this.tocView && this.tocView.page) {
      this.tocView.page.container.style.visibility = "visible";
      this.tocView.page.container.setAttribute("aria-hidden", "false");
      return Task.newResult(this.tocView.page);
    }
    const frame: Task.Frame<Vtree.Page> = Task.newFrame("showTOC");
    if (!this.tocView) {
      this.tocView = new Toc.TOCView(
        opf.store,
        toc.src,
        opf.lang,
        this.clientLayout,
        this.fontMapper,
        this.pref,
        this,
        opf.fallbackMap,
        opf.documentURLTransformer,
        this.counterStore,
        this.cmykStore,
      );
    }
    const viewport = this.viewport;
    const tocWidth = Math.min(344, Math.round(0.67 * viewport.width) - 16);
    const tocHeight = viewport.height - 6;
    const pageCont = viewport.document.createElement("div") as HTMLElement;
    viewport.root.appendChild(pageCont);
    // pageCont.style.position = "absolute";
    if (!Constants.isDebug) {
      pageCont.style.visibility = "hidden";
    }
    // pageCont.style.left = "3px";
    // pageCont.style.top = "3px";
    pageCont.style.width = `${tocWidth + 16}px`;
    pageCont.style.maxHeight = `${tocHeight}px`;
    // pageCont.style.overflow = "scroll";
    // pageCont.style.overflowX = "hidden";
    // pageCont.style.background = "rgba(248,248,248,0.9)";
    // pageCont.style["borderRadius"] = "2px";
    // pageCont.style["boxShadow"] = "1px 1px 2px rgba(0,0,0,0.4)";

    pageCont.setAttribute("data-vivliostyle-toc-box", "true");
    pageCont.setAttribute("role", "navigation");

    this.tocView
      .showTOC(pageCont, viewport, tocWidth, tocHeight, this.viewport.fontSize)
      .then((page) => {
        pageCont.style.visibility = "visible";
        pageCont.setAttribute("aria-hidden", "false");
        frame.finish(page);
      });
    return frame.result();
  }

  hideTOC(): void {
    this.tocVisible = false;
    if (this.tocView) {
      this.tocView.hideTOC();
    }
  }

  isTOCVisible(): boolean {
    return this.tocVisible && !!this.tocView && this.tocView.isTOCVisible();
  }
}

export interface RenderSinglePageResult {
  pageAndPosition: PageAndPosition;
  nextLayoutPosition: Vtree.LayoutPosition | null;
}
