import * as Css from "./css";
import * as CssCascade from "./css-cascade";

const _SYSTEM_CHINESE_LONGHAND = "-internal-chinese-longhand";
const _SYSTEM_ETHIOPIC_NUMERIC = "-internal-ethiopic-numeric";

type SetElement<T> = T extends Set<infer U> ? U : never;
const systemsDefinedBySingleIdent = new Set([
  "cyclic",
  "numeric",
  "alphabetic",
  "symbolic",
  "additive",
  "fixed",
  _SYSTEM_CHINESE_LONGHAND,
  _SYSTEM_ETHIOPIC_NUMERIC,
] as const);
const systemsDefinedBySpaceList = new Set([
  // [ fixed <integer> ]
  "fixed",
  // [ extends <counter-style-name> ]
  "extends",
] as const);
type System =
  | SetElement<typeof systemsDefinedBySingleIdent>
  | SetElement<typeof systemsDefinedBySpaceList>;

type AdditiveSymbol = { weight: number; symbol: string };
type Range = { lower: number; upper: number };
type Pad = { minLength: number; symbol: string };
type NegativeSymbol = { prefix: string; suffix: string | null };

function getDescriptor(
  properties: CssCascade.ElementStyle,
  name: string,
): Css.Val | null {
  const cascadeValue = properties[name] as CssCascade.CascadeValue;
  return cascadeValue?.value ?? null;
}

function getSystem(properties: CssCascade.ElementStyle): System {
  const system = getDescriptor(properties, "system");
  if (system instanceof Css.Ident) {
    const name = system.name;
    if (
      systemsDefinedBySingleIdent.has(
        // @ts-expect-error ignore
        name,
      )
    ) {
      return name as System;
    }
  }
  if (system instanceof Css.SpaceList && system.values.length == 2) {
    const first = system.values[0]!;
    if (first instanceof Css.Ident) {
      const name = first.name;
      if (
        systemsDefinedBySpaceList.has(
          // @ts-expect-error ignore
          name,
        )
      ) {
        return name as System;
      }
    }
  }
  return "symbolic";
}

/**
 * @see https://drafts.csswg.org/css-counter-styles/#typedef-symbol
 */
function symbolToString(value: Css.Val): string | null {
  if (value instanceof Css.Str) {
    return value.str;
  }
  if (value instanceof Css.Ident) {
    // > Identifiers are rendered as strings containing the same characters.
    return value.name;
  }
  return null;
}

/**
 * `<integer [0,∞]> && <symbol>`
 * @see https://drafts.csswg.org/css-counter-styles-3/#descdef-counter-style-pad
 * @see https://drafts.csswg.org/css-counter-styles-3/#descdef-counter-style-additive-symbols
 */
function parseTuple(tuple: Css.Val): readonly [number, string] | null {
  if (tuple instanceof Css.SpaceList && tuple.values.length === 2) {
    const first = tuple.values[0]!;
    const second = tuple.values[1]!;
    // [ <integer [0,inf]> <symbol> ]
    if (first instanceof Css.Int && first.num >= 0) {
      const str = symbolToString(second);
      if (str !== null) {
        return [first.num, str];
      }
    }
    // [ <symbol> <integer [0,inf]> ]
    if (second instanceof Css.Int && second.num >= 0) {
      const str = symbolToString(first);
      if (str !== null) {
        return [second.num, str];
      }
    }
  }
  return null;
}

function parseRangeBound(value: Css.Val, isLower: boolean): number {
  if (value instanceof Css.Int) {
    return value.num;
  }
  if (value instanceof Css.Ident && value.name === "infinite") {
    return isLower ? -Infinity : Infinity;
  }
  return isLower ? -Infinity : Infinity;
}

/**
 * `[ <integer> | infinite ]{2}`
 * @see https://drafts.csswg.org/css-counter-styles-3/#descdef-counter-style-range
 */
function parseRange(range: Css.Val): Range | null {
  if (range instanceof Css.SpaceList && range.values.length === 2) {
    const lower = parseRangeBound(range.values[0]!, true);
    const upper = parseRangeBound(range.values[1]!, false);
    return { lower, upper };
  }
  return null;
}

function isInRange(value: number, { lower, upper }: Range): boolean {
  return value >= lower && value <= upper;
}

type CounterStyleStoreMap = Map<string, CounterStyle>;

abstract class CounterStyle {
  _store: CounterStyleStoreMap;
  _properties: CssCascade.ElementStyle;

  constructor(
    store: CounterStyleStoreMap,
    properties: CssCascade.ElementStyle,
  ) {
    this._store = store;
    this._properties = properties;
  }

  static create(
    store: CounterStyleStoreMap,
    properties: CssCascade.ElementStyle,
  ): CounterStyle {
    const system = getSystem(properties);
    switch (system) {
      case "cyclic":
        return new Cyclic(store, properties);
      case "fixed":
        return new Fixed(store, properties);
      case "symbolic":
        return new Symbolic(store, properties);
      case "alphabetic":
        return new Alphabetic(store, properties);
      case "numeric":
        return new Numeric(store, properties);
      case "additive":
        return new Additive(store, properties);
      case _SYSTEM_CHINESE_LONGHAND:
        return new ChineseLonghand(store, properties);
      case _SYSTEM_ETHIOPIC_NUMERIC:
        return new EthiopicNumeric(store, properties);
      case "extends":
        return new Extends(store, properties);
      default: {
        system satisfies never;
        return new Symbolic(store, properties);
      }
    }
  }

  /**
   * @see https://drafts.csswg.org/css-counter-styles/#descdef-counter-style-symbols
   */
  _getSymbols(): string[] | null {
    const symbols = getDescriptor(this._properties, "symbols");
    if (symbols) {
      // Multiple symbols
      if (symbols instanceof Css.SpaceList) {
        const ret = [];
        let failed = false;
        for (const value of symbols.values) {
          const str = symbolToString(value);
          if (str === null) {
            failed = true;
            break;
          }
          ret.push(str);
        }
        if (!failed) {
          return ret;
        }
      }
      // Single symbol
      const str = symbolToString(symbols);
      if (str !== null) {
        return [str];
      }
    }
    return null;
  }

  /**
   * @see https://drafts.csswg.org/css-counter-styles-3/#descdef-counter-style-additive-symbols
   */
  _getAdditiveSymbols(): AdditiveSymbol[] | null {
    const additiveSymbols = getDescriptor(this._properties, "additive-symbols");
    if (additiveSymbols) {
      // Multiple tuples
      if (additiveSymbols instanceof Css.CommaList) {
        const ret: AdditiveSymbol[] = [];
        let failed = false;
        for (const item of additiveSymbols.values) {
          const tuple = parseTuple(item);
          if (!tuple) {
            failed = true;
            break;
          }
          ret.push({ weight: tuple[0], symbol: tuple[1] });
        }
        if (!failed) {
          return ret;
        }
      }
      // Single tuple
      const tuple = parseTuple(additiveSymbols);
      if (tuple) {
        return [{ weight: tuple[0], symbol: tuple[1] }];
      }
    }
    return null;
  }

  /**
   * @see https://drafts.csswg.org/css-counter-styles-3/#counter-style-negative
   */
  _getNegative(): NegativeSymbol | null {
    const negative = getDescriptor(this._properties, "negative");
    if (negative) {
      // Multiple symbols
      if (negative instanceof Css.SpaceList && negative.values.length === 2) {
        const first = symbolToString(negative.values[0]!);
        const second = symbolToString(negative.values[1]!);
        if (first !== null && second !== null) {
          return { prefix: first, suffix: second };
        }
      }
      // Single symbol
      const str = symbolToString(negative);
      if (str !== null) {
        return { prefix: str, suffix: null };
      }
    }
    return null;
  }
  #getNegative(): NegativeSymbol {
    return this._getNegative() ?? { prefix: "-", suffix: null };
  }

  /**
   * @see https://drafts.csswg.org/css-counter-styles-3/#counter-style-pad
   */
  _getPad(): Pad | null {
    const pad = getDescriptor(this._properties, "pad");
    if (!pad) {
      return null;
    }
    const tuple = parseTuple(pad);
    if (!tuple) {
      return null;
    }
    return { minLength: tuple[0], symbol: tuple[1] };
  }
  #getPad(): Pad {
    return this._getPad() ?? { minLength: 0, symbol: "" };
  }

  /**
   * @see https://drafts.csswg.org/css-counter-styles-3/#counter-style-range
   */
  abstract _getAutoRange(): Range;
  /**
   * @see https://drafts.csswg.org/css-counter-styles-3/#counter-style-range
   */
  _getRange(): Range | null {
    const range = getDescriptor(this._properties, "range");
    if (range) {
      // Multiple ranges, compute the union
      if (range instanceof Css.CommaList) {
        let min = Infinity;
        let max = -Infinity;
        let failed = false;
        for (const item of range.values) {
          const rng = parseRange(item);
          if (rng === null) {
            failed = true;
            break;
          }
          const { lower, upper } = rng;
          min = Math.min(min, lower);
          max = Math.max(max, upper);
        }
        if (!failed && min !== Infinity && max !== -Infinity) {
          return { lower: min, upper: max };
        }
      }
      // Single range
      const rng = parseRange(range);
      if (rng !== null) {
        return rng;
      }
    }
    return null;
  }
  #getRange(): Range {
    return this._getRange() ?? this._getAutoRange();
  }

  /**
   * @see https://drafts.csswg.org/css-counter-styles-3/#counter-style-fallback
   */
  _getFallback(): CounterStyle | null {
    const fallback = getDescriptor(this._properties, "fallback");
    if (fallback instanceof Css.Ident) {
      const fallbackStyle = this._store.get(fallback.name);
      if (fallbackStyle) {
        return fallbackStyle;
      }
    }
    return null;
  }
  #getFallback(): CounterStyle {
    const fallback = this._getFallback();
    if (fallback) {
      return fallback;
    }
    const decimalStyle = this._store.get("decimal")!;
    if (!decimalStyle) {
      throw new Error("Assertion failed: decimalStyle !== null");
    }
    return decimalStyle;
  }

  /**
   * @see https://drafts.csswg.org/css-counter-styles-3/#generate-a-counter
   * @see https://drafts.csswg.org/css-counter-styles-3/#counter-style-pad
   */
  #applyPadding(initialRep: string, usesNegative: boolean): string {
    const { minLength, symbol: padSymbol } = this.#getPad();
    if (minLength === 0 || padSymbol === "") {
      return initialRep;
    }

    const { prefix: negPrefix, suffix: negSuffix } = this.#getNegative();
    const negativeLength = usesNegative
      ? [...negPrefix].length + (negSuffix ? [...negSuffix].length : 0)
      : 0;

    const diff = minLength - [...initialRep].length - negativeLength;
    if (diff <= 0) {
      return initialRep;
    }

    const padLength = [...padSymbol].length;
    const count = Math.ceil(diff / padLength);
    return padSymbol.repeat(count) + initialRep;
  }

  /**
   * @see https://drafts.csswg.org/css-counter-styles-3/#use-a-negative-sign
   */
  abstract _usesNegativeSign(value: number): boolean;

  /**
   * @see https://drafts.csswg.org/css-counter-styles-3/#generate-a-counter
   */
  abstract _generateInitialRepresentation(value: number): string | null;

  /**
   * Format a counter value to its string representation.
   * @see https://drafts.csswg.org/css-counter-styles-3/#generate-a-counter
   */
  format(value: number): string {
    return this.#format(value, new Set());
  }
  #format(value: number, visited: Set<CounterStyle>): string {
    // Detect fallback loop
    if (visited.has(this)) {
      const decimalStyle = this._store.get("decimal");
      return decimalStyle
        ? decimalStyle.#format(value, visited)
        : // Cases where decimal is not defined are assertion violations,
          // but practically String is sufficient.
          String(value);
    }
    visited.add(this);

    if (!isInRange(value, this.#getRange())) {
      try {
        const fallback = this.#getFallback();
        return fallback.#format(value, visited);
      } catch {
        return String(value);
      }
    }

    const usesNegative = this._usesNegativeSign(value);
    const absValue = usesNegative ? Math.abs(value) : value;

    const initialRep = this._generateInitialRepresentation(absValue);
    if (initialRep === null) {
      try {
        const fallback = this.#getFallback();
        return fallback.#format(value, visited);
      } catch {
        return String(value);
      }
    }

    let padded = this.#applyPadding(initialRep, usesNegative);

    if (usesNegative) {
      const { prefix: negPrefix, suffix: negSuffix } = this.#getNegative();
      padded = negPrefix + padded + (negSuffix ?? "");
    }

    return padded;
  }
}

/**
 * @see https://drafts.csswg.org/css-counter-styles-3/#cyclic-system
 */
class Cyclic extends CounterStyle {
  override _getAutoRange(): Range {
    return { lower: -Infinity, upper: Infinity };
  }

  override _usesNegativeSign(_: number): boolean {
    return false;
  }

  override _generateInitialRepresentation(value: number): string | null {
    const symbols = this._getSymbols();
    // > If the system is cyclic, the symbols descriptor must contain at least one counter symbol,
    // > otherwise the rule does not define a counter style (but is still a valid rule).
    if (!symbols || symbols.length === 0) {
      return null;
    }
    const n = symbols.length;
    // to get proper mathematical modulo for negative values
    const idx = (((value - 1) % n) + n) % n;
    return symbols[idx];
  }
}

/**
 * @see https://drafts.csswg.org/css-counter-styles-3/#fixed-system
 */
class Fixed extends CounterStyle {
  override _getAutoRange(): Range {
    return { lower: -Infinity, upper: Infinity };
  }

  override _usesNegativeSign(_: number): boolean {
    return false;
  }

  #getFirstSymbolValue(): number {
    const system = getDescriptor(this._properties, "system");
    // [ fixed <integer> ]
    if (system instanceof Css.SpaceList && system.values.length === 2) {
      const first = system.values[0]!;
      if (first instanceof Css.Ident && first.name === "fixed") {
        const second = system.values[1]!;
        if (second instanceof Css.Int) {
          return second.num;
        }
      }
    }
    return 1;
  }

  override _generateInitialRepresentation(value: number): string | null {
    const symbols = this._getSymbols();
    // > If the system is fixed, the symbols descriptor must contain at least one counter symbol,
    // > otherwise the rule does not define a counter style (but is still a valid rule).
    if (!symbols || symbols.length === 0) {
      return null;
    }
    const firstSymbolValue = this.#getFirstSymbolValue();
    const idx = value - firstSymbolValue;
    return symbols[idx] ?? null;
  }
}

/**
 * @see https://drafts.csswg.org/css-counter-styles-3/#symbolic-system
 */
class Symbolic extends CounterStyle {
  override _getAutoRange(): Range {
    return { lower: 1, upper: Infinity };
  }

  override _usesNegativeSign(value: number): boolean {
    return value < 0;
  }

  override _generateInitialRepresentation(value: number): string | null {
    const symbols = this._getSymbols();
    // > If the system is symbolic, the symbols descriptor must contain at least one counter symbol,
    // > otherwise the rule does not define a counter style (but is still a valid rule).
    if (!symbols || symbols.length === 0) {
      return null;
    }
    // > This system is defined only over strictly positive counter values.
    if (value < 1) {
      return null;
    }
    const n = symbols.length;
    const chosen = symbols[(value - 1) % n];
    const count = Math.ceil(value / n);
    return chosen.repeat(count);
  }
}

/**
 * @see https://drafts.csswg.org/css-counter-styles-3/#alphabetic-system
 */
class Alphabetic extends CounterStyle {
  override _getAutoRange(): Range {
    return { lower: 1, upper: Infinity };
  }

  override _usesNegativeSign(value: number): boolean {
    return value < 0;
  }

  override _generateInitialRepresentation(value: number): string | null {
    const symbols = this._getSymbols();
    // > If the system is alphabetic, the symbols descriptor must contain at least two counter symbols,
    // > otherwise the rule does not define a counter style (but is still a valid rule).
    if (!symbols || symbols.length < 2) {
      return null;
    }
    // > This system is defined only over strictly positive counter values.
    if (value < 1) {
      return null;
    }
    const n = symbols.length;
    let s = "";
    let v = value;
    while (v !== 0) {
      v = v - 1;
      s = symbols[v % n] + s;
      v = Math.floor(v / n);
    }
    return s;
  }
}

/**
 * @see https://drafts.csswg.org/css-counter-styles-3/#numeric-system
 */
class Numeric extends CounterStyle {
  override _getAutoRange(): Range {
    return { lower: -Infinity, upper: Infinity };
  }

  override _usesNegativeSign(value: number): boolean {
    return value < 0;
  }

  override _generateInitialRepresentation(value: number): string | null {
    const symbols = this._getSymbols();
    // > If the system is numeric, the symbols descriptor must contain at least two counter symbols,
    // > otherwise the rule does not define a counter style (but is still a valid rule).
    if (!symbols || symbols.length < 2) {
      return null;
    }
    const n = symbols.length;
    if (value === 0) {
      return symbols[0];
    }
    let s = "";
    let v = value;
    while (v !== 0) {
      s = symbols[v % n] + s;
      v = Math.floor(v / n);
    }
    return s;
  }
}

/**
 * @see https://drafts.csswg.org/css-counter-styles-3/#additive-system
 */
class Additive extends CounterStyle {
  override _getAutoRange(): Range {
    return { lower: 0, upper: Infinity };
  }

  override _usesNegativeSign(value: number): boolean {
    return value < 0;
  }

  override _generateInitialRepresentation(value: number): string | null {
    const tuples = this._getAdditiveSymbols();
    // > If the system is additive, the additive-symbols descriptor must contain at least one additive tuple,
    // > otherwise the rule does not define a counter style (but is still a valid rule).
    if (!tuples || tuples.length === 0) {
      return null;
    }

    let s = "";

    if (value === 0) {
      const zeroTuple = tuples.find((t) => t.weight === 0);
      return zeroTuple ? zeroTuple.symbol : null;
    }

    let remaining = value;
    for (const tuple of tuples) {
      const { weight, symbol } = tuple;
      if (weight === 0 || weight > remaining) {
        continue;
      }
      const reps = Math.floor(remaining / weight);
      s += symbol.repeat(reps);
      remaining -= weight * reps;
      if (remaining === 0) {
        return s;
      }
    }

    return null;
  }
}

function getBaseName(properties: CssCascade.ElementStyle): string | null {
  const system = getDescriptor(properties, "system");
  // [ extends <counter-style-name> ]
  if (system instanceof Css.SpaceList && system.values.length === 2) {
    const first = system.values[0]!;
    if (first instanceof Css.Ident && first.name === "extends") {
      const second = system.values[1]!;
      if (second instanceof Css.Ident) {
        return second.name;
      }
    }
  }
  return null;
}

class Extends extends CounterStyle {
  #resolveBaseStyle(
    visited: Set<CounterStyle> = new Set(),
  ): CounterStyle | null {
    // Detect cycle
    if (visited.has(this)) {
      return this._store.get("decimal")!;
    }
    visited.add(this);

    const baseName = getBaseName(this._properties);
    if (baseName === null) {
      return null;
    }

    const targetStyle = this._store.get(baseName);
    if (!targetStyle) {
      return this._store.get("decimal")!;
    }

    if (targetStyle instanceof Extends) {
      return targetStyle.#resolveBaseStyle(visited);
    }

    return targetStyle;
  }

  override _getAutoRange(): Range {
    return (
      this.#resolveBaseStyle()?._getAutoRange() ??
        // FIXME: not sure
        { lower: -Infinity, upper: Infinity }
    );
  }

  override _usesNegativeSign(value: number): boolean {
    return (
      this.#resolveBaseStyle()?._usesNegativeSign(value) ??
      // FIXME: not sure
      false
    );
  }

  override _generateInitialRepresentation(value: number): string | null {
    // > If a @counter-style uses the extends system, it must not contain a symbols or additive-symbols descriptor,
    // > otherwise the rule does not define a counter style (but is still a valid rule).
    if (super._getSymbols() || super._getAdditiveSymbols()) {
      return null;
    }

    return (
      this.#resolveBaseStyle()?._generateInitialRepresentation(value) ?? null
    );
  }

  override _getSymbols(): string[] | null {
    return (
      super._getSymbols() ?? this.#resolveBaseStyle()?._getSymbols() ?? null
    );
  }

  override _getAdditiveSymbols(): AdditiveSymbol[] | null {
    return (
      super._getAdditiveSymbols() ??
      this.#resolveBaseStyle()?._getAdditiveSymbols() ??
      null
    );
  }

  override _getNegative(): NegativeSymbol | null {
    return (
      super._getNegative() ?? this.#resolveBaseStyle()?._getNegative() ?? null
    );
  }

  override _getPad(): Pad | null {
    return super._getPad() ?? this.#resolveBaseStyle()?._getPad() ?? null;
  }

  override _getRange(): Range | null {
    return super._getRange() ?? this.#resolveBaseStyle()?._getRange() ?? null;
  }

  override _getFallback(): CounterStyle | null {
    return (
      super._getFallback() ?? this.#resolveBaseStyle()?._getFallback() ?? null
    );
  }
}

/**
 * @see https://drafts.csswg.org/css-counter-styles-3/#limited-chinese
 */
class ChineseLonghand extends CounterStyle {
  override _getAutoRange(): Range {
    return { lower: -9999, upper: 9999 };
  }

  override _usesNegativeSign(value: number): boolean {
    return value < 0;
  }

  override _generateInitialRepresentation(value: number): string | null {
    // Get the style variant from the symbols descriptor
    // The first symbol indicates which Chinese style to use
    const symbols = this._getSymbols();
    const styleKey = symbols.length > 0 ? symbols[0] : "simp-chinese-informal";

    // Character sets for each Chinese style
    const CHINESE_CHARS: {
      [key: string]: {
        digits: string[];
        markers: string[];
        informal: boolean;
      };
    } = {
      "simp-chinese-informal": {
        digits: ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"],
        markers: ["", "十", "百", "千"],
        informal: true,
      },
      "simp-chinese-formal": {
        digits: ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"],
        markers: ["", "拾", "佰", "仟"],
        informal: false,
      },
      "trad-chinese-informal": {
        digits: ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"],
        markers: ["", "十", "百", "千"],
        informal: true,
      },
      "trad-chinese-formal": {
        digits: ["零", "壹", "貳", "參", "肆", "伍", "陸", "柒", "捌", "玖"],
        markers: ["", "拾", "佰", "仟"],
        informal: false,
      },
    };

    const chars =
      CHINESE_CHARS[styleKey] || CHINESE_CHARS["simp-chinese-informal"];

    // Step 1: If the counter value is 0, return the character for 0
    if (value === 0) {
      return chars.digits[0];
    }

    // Note: Negative values are handled by the base #format method.
    // This method receives the absolute value, so we only need to handle positive values.

    // Build representation with digit markers
    // Process each digit from thousands to ones
    const digits: { digit: number; position: number }[] = [];
    let pos = 0;
    let temp = value;
    while (temp > 0) {
      digits.unshift({ digit: temp % 10, position: pos });
      temp = Math.floor(temp / 10);
      pos++;
    }

    // For informal styles, if value is 10-19, remove tens digit (leave marker)
    const removeTensDigit = chars.informal && value >= 10 && value <= 19;

    // Build the result string
    let result = "";
    let lastWasZero = false;

    for (let i = 0; i < digits.length; i++) {
      const { digit, position } = digits[i];
      const isLastDigit = i === digits.length - 1;

      if (digit === 0) {
        // Collapse consecutive zeros and drop trailing zeros
        if (!isLastDigit && !lastWasZero) {
          // Mark that we encountered a zero (will add it if followed by non-zero)
          lastWasZero = true;
        }
      } else {
        // Add collapsed zero if needed
        if (lastWasZero) {
          result += chars.digits[0];
          lastWasZero = false;
        }

        // Skip tens digit for informal 10-19
        if (removeTensDigit && position === 1) {
          // Add only the marker, not the digit
          result += chars.markers[position];
        } else {
          // Add digit + marker
          result += chars.digits[digit];
          if (position > 0) {
            result += chars.markers[position];
          }
        }
      }
    }

    return result;
  }
}

/**
 * @see https://drafts.csswg.org/css-counter-styles-3/#ethiopic-numeric-counter-style
 */
class EthiopicNumeric extends CounterStyle {
  override _getAutoRange(): Range {
    return { lower: 1, upper: Infinity };
  }

  override _usesNegativeSign(_: number): boolean {
    // > The ethiopic-numeric counter style is defined for all positive non-zero numbers.
    return false;
  }

  override _generateInitialRepresentation(value: number): string | null {
    // > The ethiopic-numeric counter style is defined for all positive non-zero numbers.
    if (value < 1) {
      return null;
    }

    // Tens: 10-90 → U+1372-U+137A
    const TENS = [
      "", // 0
      "\u1372", // 10
      "\u1373", // 20
      "\u1374", // 30
      "\u1375", // 40
      "\u1376", // 50
      "\u1377", // 60
      "\u1378", // 70
      "\u1379", // 80
      "\u137A", // 90
    ];

    // Units: 1-9 → U+1369-U+1371
    const UNITS = [
      "", // 0
      "\u1369", // 1
      "\u136A", // 2
      "\u136B", // 3
      "\u136C", // 4
      "\u136D", // 5
      "\u136E", // 6
      "\u136F", // 7
      "\u1370", // 8
      "\u1371", // 9
    ];

    const HUNDRED = "\u137B"; // U+137B (odd index separator / 100)
    const TEN_THOUSAND = "\u137C"; // U+137C (even index separator / 10000)

    // Step 1: If the number is 1, return U+1369
    if (value === 1) {
      return UNITS[1];
    }

    // Step 2: Split the number into groups of two digits, starting with the least significant
    const groups: number[] = [];
    let remaining = value;
    while (remaining > 0) {
      groups.push(remaining % 100);
      remaining = Math.floor(remaining / 100);
    }

    // groups[0] is least significant, groups[length-1] is most significant
    const numGroups = groups.length;

    // Build output from most significant to least significant
    let result = "";
    for (let i = numGroups - 1; i >= 0; i--) {
      const groupValue = groups[i];
      const isOddIndex = i % 2 === 1;
      const isMostSignificant = i === numGroups - 1;

      // Step 4: Determine if digits should be removed
      // - If the group has the value zero
      // - If the group is the most significant one and has the value 1
      // - If the group has an odd index and has the value 1
      const removeDigits =
        groupValue === 0 ||
        (isMostSignificant && groupValue === 1) ||
        (isOddIndex && groupValue === 1);

      // Step 5: For each remaining digit, substitute the relevant ethiopic character
      if (!removeDigits) {
        const tens = Math.floor(groupValue / 10);
        const units = groupValue % 10;
        result += TENS[tens] + UNITS[units];
      }

      // Step 6 & 7: Append separators
      if (isOddIndex) {
        // Step 6: For odd index groups, except those with original value 0, append U+137B
        if (groupValue !== 0) {
          result += HUNDRED;
        }
      } else {
        // Step 7: For even index groups, except group 0, append U+137C
        if (i !== 0) {
          result += TEN_THOUSAND;
        }
      }
    }

    return result;
  }
}

export class CounterStyleStore {
  #store: CounterStyleStoreMap;

  constructor() {
    this.#store = new Map();

    // non-overridable counter-style names
    // https://drafts.csswg.org/css-counter-styles/#non-overridable-counter-style-names
    {
      this.define("decimal", {
        system: new CssCascade.CascadeValue(Css.getName("numeric"), 0),
        symbols: new CssCascade.CascadeValue(
          new Css.SpaceList([
            new Css.Str("0"),
            new Css.Str("1"),
            new Css.Str("2"),
            new Css.Str("3"),
            new Css.Str("4"),
            new Css.Str("5"),
            new Css.Str("6"),
            new Css.Str("7"),
            new Css.Str("8"),
            new Css.Str("9"),
          ]),
          0,
        ),
      });
      this.define("disc", {
        system: new CssCascade.CascadeValue(Css.getName("cyclic"), 0),
        symbols: new CssCascade.CascadeValue(new Css.Str("\u2022"), 0),
        suffix: new CssCascade.CascadeValue(new Css.Str(" "), 0),
      });
      this.define("square", {
        system: new CssCascade.CascadeValue(Css.getName("cyclic"), 0),
        symbols: new CssCascade.CascadeValue(new Css.Str("\u25AA"), 0),
        suffix: new CssCascade.CascadeValue(new Css.Str(" "), 0),
      });
      this.define("circle", {
        system: new CssCascade.CascadeValue(Css.getName("cyclic"), 0),
        symbols: new CssCascade.CascadeValue(new Css.Str("\u25E6"), 0),
        suffix: new CssCascade.CascadeValue(new Css.Str(" "), 0),
      });
      this.define("disclosure-open", {
        system: new CssCascade.CascadeValue(Css.getName("cyclic"), 0),
        symbols: new CssCascade.CascadeValue(new Css.Str("\u25BE"), 0),
        suffix: new CssCascade.CascadeValue(new Css.Str(" "), 0),
      });
      // TODO: disclosure-closed should respond to writing mode? (U+25B8 for LTR, U+25C2 for RTL)
      this.define("disclosure-closed", {
        system: new CssCascade.CascadeValue(Css.getName("cyclic"), 0),
        symbols: new CssCascade.CascadeValue(new Css.Str("\u25B8"), 0),
        suffix: new CssCascade.CascadeValue(new Css.Str(" "), 0),
      });
    }

    // Chinese longhand styles
    // https://drafts.csswg.org/css-counter-styles/#limited-chinese
    {
      this.define("simp-chinese-informal", {
        system: new CssCascade.CascadeValue(
          Css.getName(_SYSTEM_CHINESE_LONGHAND),
          0,
        ),
        symbols: new CssCascade.CascadeValue(
          new Css.Str("simp-chinese-informal"),
          0,
        ),
        suffix: new CssCascade.CascadeValue(new Css.Str("\u3001"), 0),
        fallback: new CssCascade.CascadeValue(Css.getName("cjk-decimal"), 0),
        range: new CssCascade.CascadeValue(
          new Css.SpaceList([new Css.Int(-9999), new Css.Int(9999)]),
          0,
        ),
        negative: new CssCascade.CascadeValue(new Css.Str("\u8D1F"), 0),
      });
      this.define("simp-chinese-formal", {
        system: new CssCascade.CascadeValue(
          Css.getName(_SYSTEM_CHINESE_LONGHAND),
          0,
        ),
        symbols: new CssCascade.CascadeValue(
          new Css.Str("simp-chinese-formal"),
          0,
        ),
        suffix: new CssCascade.CascadeValue(new Css.Str("\u3001"), 0),
        fallback: new CssCascade.CascadeValue(Css.getName("cjk-decimal"), 0),
        range: new CssCascade.CascadeValue(
          new Css.SpaceList([new Css.Int(-9999), new Css.Int(9999)]),
          0,
        ),
        negative: new CssCascade.CascadeValue(new Css.Str("\u8D1F"), 0),
      });
      this.define("trad-chinese-informal", {
        system: new CssCascade.CascadeValue(
          Css.getName(_SYSTEM_CHINESE_LONGHAND),
          0,
        ),
        symbols: new CssCascade.CascadeValue(
          new Css.Str("trad-chinese-informal"),
          0,
        ),
        suffix: new CssCascade.CascadeValue(new Css.Str("\u3001"), 0),
        fallback: new CssCascade.CascadeValue(Css.getName("cjk-decimal"), 0),
        range: new CssCascade.CascadeValue(
          new Css.SpaceList([new Css.Int(-9999), new Css.Int(9999)]),
          0,
        ),
        negative: new CssCascade.CascadeValue(new Css.Str("\u8CA0"), 0),
      });
      this.define("trad-chinese-formal", {
        system: new CssCascade.CascadeValue(
          Css.getName(_SYSTEM_CHINESE_LONGHAND),
          0,
        ),
        symbols: new CssCascade.CascadeValue(
          new Css.Str("trad-chinese-formal"),
          0,
        ),
        suffix: new CssCascade.CascadeValue(new Css.Str("\u3001"), 0),
        fallback: new CssCascade.CascadeValue(Css.getName("cjk-decimal"), 0),
        range: new CssCascade.CascadeValue(
          new Css.SpaceList([new Css.Int(-9999), new Css.Int(9999)]),
          0,
        ),
        negative: new CssCascade.CascadeValue(new Css.Str("\u8CA0"), 0),
      });
      // This counter style is identical to trad-chinese-informal. (It exists for legacy reasons.)
      this.define("cjk-ideographic", {
        system: new CssCascade.CascadeValue(
          Css.getName(_SYSTEM_CHINESE_LONGHAND),
          0,
        ),
        symbols: new CssCascade.CascadeValue(
          new Css.Str("trad-chinese-informal"),
          0,
        ),
        suffix: new CssCascade.CascadeValue(new Css.Str("\u3001"), 0),
        fallback: new CssCascade.CascadeValue(Css.getName("cjk-decimal"), 0),
        range: new CssCascade.CascadeValue(
          new Css.SpaceList([new Css.Int(-9999), new Css.Int(9999)]),
          0,
        ),
        negative: new CssCascade.CascadeValue(new Css.Str("\u8CA0"), 0),
      });
    }

    // Ethiopic numeric counter style
    // https://drafts.csswg.org/css-counter-styles/#ethiopic-numeric-counter-style
    this.define("ethiopic-numeric", {
      system: new CssCascade.CascadeValue(
        Css.getName(_SYSTEM_ETHIOPIC_NUMERIC),
        0,
      ),
      range: new CssCascade.CascadeValue(
        new Css.SpaceList([new Css.Int(1), Css.getName("infinite")]),
        0,
      ),
      suffix: new CssCascade.CascadeValue(new Css.Str("/ "), 0),
    });

    // Other predefined counter styles defined in CSS Counter Styles Module Level 3
    // https://drafts.csswg.org/css-counter-styles/#predefined-counters
    {
      this.define("decimal-leading-zero", {
        system: new CssCascade.CascadeValue(
          new Css.SpaceList([Css.getName("extends"), Css.getName("decimal")]),
          0,
        ),
        pad: new CssCascade.CascadeValue(
          new Css.SpaceList([new Css.Int(2), new Css.Str("0")]),
          0,
        ),
      });
      // ...
      this.define("cjk-decimal", {
        system: new CssCascade.CascadeValue(Css.getName("numeric"), 0),
        range: new CssCascade.CascadeValue(
          new Css.SpaceList([new Css.Int(0), Css.getName("infinite")]),
          0,
        ),
        symbols: new CssCascade.CascadeValue(
          new Css.SpaceList([
            new Css.Str("\u3007"),
            new Css.Str("\u4E00"),
            new Css.Str("\u4E8C"),
            new Css.Str("\u4E09"),
            new Css.Str("\u56DB"),
            new Css.Str("\u4E94"),
            new Css.Str("\u516D"),
            new Css.Str("\u4E03"),
            new Css.Str("\u516B"),
            new Css.Str("\u4E5D"),
          ]),
          0,
        ),
        suffix: new CssCascade.CascadeValue(new Css.Str("\u3001"), 0),
      });
      // ...
    }
  }

  define(name: string, properties: CssCascade.ElementStyle) {
    this.#store.set(name, CounterStyle.create(this.#store, properties));
  }

  _resolve(name: string): CounterStyle | null {
    return this.#store.get(name) ?? null;
  }

  format(name: string, value: number): string | null {
    return this._resolve(name)?.format(value) ?? null;
  }
}
