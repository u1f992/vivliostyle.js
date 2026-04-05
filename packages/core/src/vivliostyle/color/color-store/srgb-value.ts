import * as Css from "../../css";

export class SRGBValue {
  static readonly MAX = 10000;

  readonly #r: number;
  readonly #g: number;
  readonly #b: number;

  private constructor(r: number, g: number, b: number) {
    this.#r = Math.round(Math.max(0, Math.min(r, SRGBValue.MAX)));
    this.#g = Math.round(Math.max(0, Math.min(g, SRGBValue.MAX)));
    this.#b = Math.round(Math.max(0, Math.min(b, SRGBValue.MAX)));
  }

  static fromInt(r: number, g: number, b: number): SRGBValue {
    return new SRGBValue(r, g, b);
  }

  static fromFloat(r: number, g: number, b: number): SRGBValue {
    return new SRGBValue(
      r * SRGBValue.MAX,
      g * SRGBValue.MAX,
      b * SRGBValue.MAX,
    );
  }

  r(): number {
    return this.#r;
  }
  g(): number {
    return this.#g;
  }
  b(): number {
    return this.#b;
  }

  offset(dr: number, dg: number, db: number): SRGBValue {
    return new SRGBValue(this.#r + dr, this.#g + dg, this.#b + db);
  }

  toKey(): string {
    return JSON.stringify([this.#r, this.#g, this.#b]);
  }

  toColorFunc(alpha: number | null): Css.Func {
    return new Css.Func("color", [
      new Css.SpaceList([
        Css.getName("srgb"),
        new Css.Num(this.#r / SRGBValue.MAX),
        new Css.Num(this.#g / SRGBValue.MAX),
        new Css.Num(this.#b / SRGBValue.MAX),
        ...(alpha !== null ? [Css.slash, new Css.Num(alpha)] : []),
      ]),
    ]);
  }

  equals(other: SRGBValue): boolean {
    return this.#r === other.#r && this.#g === other.#g && this.#b === other.#b;
  }
}
